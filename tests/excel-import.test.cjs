const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
global.JSZip=require('../dist/vendor/jszip.min.js');
const Xlsx=require('../dist/xlsx-lite.js');
const Import=require('../dist/excel-import.js');
const Core=require('../dist/core.js');

const head=(title,headers,rows=[])=>[[title],['Instructions'],headers,...rows];

test('generated Excel template can be parsed with all expected sheets and headers',async()=>{
  const file=fs.readFileSync(require('node:path').join(__dirname,'../dist/assets/studylog-excel-import-template.xlsx'));
  const book=await Xlsx.read(file);
  assert.deepEqual(Object.keys(book.sheets),['使用说明','Quick_成绩','Students','Classes','Enrollments','Records','Results','Goals']);
  assert.deepEqual(book.sheets.Students[2],['student_code','chinese_name','english_name','tag','active']);
  assert.deepEqual(book.sheets['Quick_成绩'][2].slice(0,4),['class_code','record_code','record_kind','record_type']);
});

test('full migration imports linked data, keeps a real zero and excludes blank scores',()=>{
  const book={sheets:{
    Students:head('Students',['student_code','chinese_name','english_name','tag','active'],[['N001','新学生','New Student','新生',true]]),
    Classes:head('Classes',['class_code','class_name','english_name','subject','grade','year','active'],[['NEW-MATH','新数学班','New Maths','Math','Form 1',2027,true]]),
    Enrollments:head('Enrollments',['class_code','student_code','status'],[['NEW-MATH','N001','Active']]),
    Records:head('Records',['record_code','class_code','record_kind','record_type','title','date','maximum_score','topic','materials_note'],[['EX-NEW','NEW-MATH','Tuition Exam','Tuition Exam','第一次考试','2027-08-10',50,'','']]),
    Results:head('Results',['record_code','student_code','status','score','note'],[['EX-NEW','N001','Recorded',0,'真实零分']]),
    Goals:head('Goals',['goal_code','class_code','student_code','goal_title','exam_source','target_percentage','status','action_note'],[['G-NEW','NEW-MATH','N001','下一场考试','Tuition Exam',60,'In Progress','每周复习']])
  }};
  const plan=Import.buildPlan(book,Core.seed());
  assert.deepEqual(plan.errors,[]);assert.equal(plan.mode,'full');assert.equal(plan.counts.students,1);assert.equal(plan.counts.results,1);
  const a=plan.nextData.activities.find(a=>a.recordCode==='EX-NEW'),s=plan.nextData.students.find(s=>s.code==='N001');
  assert.equal(a.results[s.id].score,0);assert.equal(Core.pct(a.results[s.id],a),0);assert.equal(plan.nextData.goals.find(g=>g.goalCode==='G-NEW').target,60);
});

test('quick import creates a record for an existing class and validates scores',()=>{
  const d=Core.seed();
  const rows=[['C2027-F3-MATH','Q-NEW','Tuition Exam','Tuition Exam','Quick exam','2027-08-12',50,'S001','陈小明','Recorded',42,''],['C2027-F3-MATH','Q-NEW','Tuition Exam','Tuition Exam','Quick exam','2027-08-12',50,'S002','林悦晴','Absent','','病假']];
  const book={sheets:{'Quick_成绩':head('Quick',['class_code','record_code','record_kind','record_type','title','date','maximum_score','student_code','student_name','status','score','note'],rows)}};
  const plan=Import.buildPlan(book,d);assert.deepEqual(plan.errors,[]);assert.equal(plan.counts.records,1);assert.equal(plan.counts.results,2);
  const a=plan.nextData.activities.find(a=>a.recordCode==='Q-NEW');assert.equal(a.students.length,d.classes[0].students.length);assert.equal(a.results.s1.score,42);assert.equal(a.results.s2.status,'absent');
  rows[0][10]=51;const bad=Import.buildPlan(book,d);assert.ok(bad.errors.some(x=>x.includes('0–50')));
});

test('import rejects duplicate results, inconsistent metadata and mixed import modes',()=>{
  const qHeaders=['class_code','record_code','record_kind','record_type','title','date','maximum_score','student_code','student_name','status','score','note'];
  const row=['C2027-F3-MATH','DUP','Homework','Homework','Work','2027-08-01',20,'S001','陈小明','Submitted',18,''];
  const mixed={sheets:{'Quick_成绩':head('Quick',qHeaders,[row,row]),Students:head('Students',['student_code','chinese_name'],[['N2','学生二']])}};
  const plan=Import.buildPlan(mixed,Core.seed());assert.ok(plan.errors.some(x=>x.includes('不要两种同时填写')));
  const dup=Import.buildPlan({sheets:{'Quick_成绩':head('Quick',qHeaders,[row,row])}},Core.seed());assert.ok(dup.errors.some(x=>x.includes('重复')));
});
