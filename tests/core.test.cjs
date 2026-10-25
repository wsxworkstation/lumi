const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../dist/core.js');

test('empty scores and absences are not zero; real zero is retained',()=>{
  const a={max:50,students:['a','b','c','d'],results:{a:{score:0,status:'recorded'},b:{score:null,status:'absent'},c:{score:40,status:'recorded'},d:{score:null,status:'unrecorded'}}};
  assert.equal(C.examStats(a).average,40);
  assert.equal(C.examStats(a).count,2);
  assert.equal(C.pct(a.results.b,a),null);
  assert.equal(C.pct(a.results.a,a),0);
});
test('competition ranks handle ties without ranking missing scores',()=>{
  const a={max:100,students:['a','b','c','d','e'],results:{a:{score:90},b:{score:80},c:{score:80},d:{score:70},e:{score:null}}};
  assert.deepEqual(C.examStats(a).rank,{a:1,b:2,c:2,d:4});
});
test('make-up changes completion but not on-time rate and keeps history',()=>{
  const data={settings:{asOf:'2027-07-31'},history:[],activities:[{id:'a',kind:'homework',classId:'c',date:'2027-07-10',max:20,students:['s'],results:{s:{score:null,status:'missing',note:''}}}]};
  assert.equal(C.homeworkStats(data,'c',2027).rate,0);
  C.updateResult(data,'a','s',{status:'makeup',score:'15'});
  assert.equal(C.homeworkStats(data,'c',2027).rate,100);
  assert.equal(C.homeworkStats(data,'c',2027).onTimeRate,0);
  assert.equal(data.history[0].before.status,'missing');
  assert.equal(data.history[0].after.score,15);
});
test('stats isolate class/year and exclude future, archived and unassigned work',()=>{
  const base={kind:'homework',classId:'c1',date:'2027-07-10',max:20,students:['s1'],results:{s1:{status:'submitted'}}};
  const data={settings:{asOf:'2027-07-31'},activities:[base,{...base,classId:'c2'},{...base,date:'2026-07-10'},{...base,date:'2027-08-01'},{...base,archived:true}]};
  assert.equal(C.homeworkStats(data,'c1',2027).total,1);
  assert.equal(C.homeworkStats(data,'c1',2027,'s2').rate,null);
  assert.equal(C.homeworkStats(data,'c1',2028).rate,null);
});
test('invalid scores cannot mutate records or history',()=>{
  const data=C.seed(),a=data.activities.find(a=>a.kind==='tuition'),id=a.students[0],old=structuredClone(a.results[id]);
  for(const value of ['-1','51','abc','Infinity'])assert.throws(()=>C.updateResult(data,a.id,id,{score:value}));
  assert.deepEqual(a.results[id],old);assert.equal(data.history.length,0);
});
test('absence clears a score and subsequent score resets absence',()=>{
  const data=C.seed(),a=data.activities.find(a=>a.kind==='tuition'),id=a.students[0];
  C.updateResult(data,a.id,id,{status:'absent'});assert.equal(a.results[id].score,null);
  C.updateResult(data,a.id,id,{score:'0'});assert.equal(a.results[id].status,'recorded');assert.equal(a.results[id].score,0);
});
test('resetting an exam to unrecorded clears the previous score',()=>{
  const d=C.seed(),a=d.activities.find(a=>a.kind==='tuition'),id=a.students[0];
  C.updateResult(d,a.id,id,{status:'unrecorded'});
  assert.equal(a.results[id].score,null);assert.equal(C.pct(a.results[id],a),null);
});
test('score alerts honor thresholds and compare the same exam source only',()=>{
  const d=C.seed();
  d.settings.low=0;d.settings.declines=2;
  const exams=d.activities.filter(a=>a.classId==='c1'&&a.kind==='tuition');
  exams.forEach((a,i)=>{a.results.s1.score=45-i*4;});
  const alerts=C.examAlerts(d,'c1',2027);
  assert.ok(alerts.some(a=>a.studentId==='s1'&&a.kind==='tuition'&&a.declines===3&&!a.low));
  d.settings.declines=5;
  assert.ok(!C.examAlerts(d,'c1',2027).some(a=>a.studentId==='s1'));
});
test('new students do not retroactively acquire old assignments',()=>{
  const d=C.seed(),a=d.activities[0],before=a.students.length;
  d.classes[0].students.push('new-student');
  assert.equal(a.students.length,before);
  assert.equal(C.homeworkStats(d,'c1',2027,'new-student').total,0);
});
test('seed has two classes, unique students, consistent links and bounded scores',()=>{
  const d=C.seed();assert.equal(d.classes.length,2);assert.equal(new Set(d.students.map(s=>s.id)).size,16);
  for(const a of d.activities){assert.ok(d.classes.some(c=>c.id===a.classId));for(const id of a.students){assert.ok(d.students.some(s=>s.id===id));const p=C.pct(a.results[id],a);assert.ok(p===null||(p>=0&&p<=100));}}
});
