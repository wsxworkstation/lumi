const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../dist/core.js');

function fixture(){
  const d=C.seed(),a=d.activities.find(a=>a.classId==='c1'&&a.kind==='tuition');
  return {d,a};
}
test('selected year and month override the old demo statistics cutoff',()=>{
  const {d}=fixture();
  d.activities.push({id:'oct',classId:'c1',kind:'homework',date:'2027-10-25',students:['s1'],results:{s1:{status:'missing',score:null}},max:1});
  assert.equal(C.homeworkStats(d,'c1',2027,'s1','10').missing,0);
  assert.equal(C.homeworkStats(d,'c1',2027,'s1','10',C.periodEnd(2027,'10')).missing,1);
  assert.equal(C.periodEnd(2028,'02'),'2028-02-29');
  assert.equal(C.periodEnd(2027,'02'),'2027-02-28');
});
test('name and score paste matches shuffled names, codes, zero and absence without mutating',()=>{
  const {d,a}=fixture(),before=JSON.stringify(d);
  const p=C.scorePastePlan(d,a,'姓名\t分数\nS002\t0\n陈小明\t42/50\nS003\t缺席');
  assert.deepEqual(p,[{sid:'s2',patch:{score:0}},{sid:'s1',patch:{score:42}},{sid:'s3',patch:{status:'absent'}}]);
  assert.equal(JSON.stringify(d),before);
});
test('paste rejects unknown, ambiguous, duplicate and invalid scores as a whole',()=>{
  const {d,a}=fixture();
  for(const raw of ['不存在\t20','S001\t20\n陈小明\t30','S001\t51','S001\t20/100','S001\t20\textra'])assert.throws(()=>C.scorePastePlan(d,a,raw));
  d.students.find(s=>s.id==='s2').name='陈小明';
  assert.throws(()=>C.scorePastePlan(d,a,'陈小明\t20'));
  assert.equal(C.scorePastePlan(d,a,'S001\t20')[0].sid,'s1');
});
test('score-only paste uses visible order and explicit blanks never become zero',()=>{
  const {d,a}=fixture();
  assert.deepEqual(C.scorePastePlan(d,a,'0\n\n42',['s3','s2','s1']),[{sid:'s3',patch:{score:0}},{sid:'s2',patch:{score:null}},{sid:'s1',patch:{score:42}}]);
  assert.throws(()=>C.scorePastePlan(d,a,'1\n2',['s1']));
});
test('record metadata changes preserve all scores and reject too-small maximum atomically',()=>{
  const {d,a}=fixture(),before=JSON.stringify(a),maxScore=Math.max(...Object.values(a.results).map(r=>r.score||0));
  assert.throws(()=>C.editActivity(d,a.id,{title:'修改',date:'2027-10-25',max:maxScore-1}));
  assert.equal(JSON.stringify(a),before);
  assert.throws(()=>C.editActivity(d,a.id,{title:'修改',date:'2027-02-30',max:50}));
  const scores=JSON.stringify(a.results),old=C.editActivity(d,a.id,{title:'十月考试',date:'2027-10-25',max:100});
  assert.equal(JSON.stringify(a.results),scores);assert.equal(a.max,100);assert.equal(d.recordHistory.length,1);
  C.editActivity(d,a.id,old);assert.equal(a.title,JSON.parse(before).title);assert.equal(a.max,50);
});
