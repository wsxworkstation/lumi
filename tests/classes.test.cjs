/* Tuition classes: level + subject, editable; the same student can join several subjects. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../dist/core.js');

test('bulk import links a student who already takes another subject instead of rejecting them',()=>{
  const d=C.seed(),f3=C.saveClass(d,{grade:'F3',subject:'数学',year:2027}),sci=C.saveClass(d,{grade:'F3',subject:'科学',year:2027});
  const first=C.enrollNames(d,f3.id,['CHIN WING SHUAN 陈颖萱','LIM AH KOW 林亚九']);
  assert.equal(first.created.length,2);
  const before=d.students.length;
  const second=C.enrollNames(d,sci.id,['chin  wing shuan 陈颖萱','NEW KID 新同学']);
  assert.equal(second.linked.length,1,'same person, matched despite case and spacing');
  assert.equal(second.created.length,1);
  assert.equal(d.students.length,before+1,'no duplicate student record');
  const chin=first.created[0];
  assert.ok(f3.students.includes(chin.id)&&sci.students.includes(chin.id),'one student in two subjects');
  const again=C.enrollNames(d,sci.id,['CHIN WING SHUAN 陈颖萱','CHIN WING SHUAN 陈颖萱']);
  assert.equal(again.already.length,1);assert.equal(again.created.length,0);
  assert.equal(sci.students.filter(id=>id===chin.id).length,1);
});

test('matches existing students stored with separate English and Chinese names; true namesakes are flagged',()=>{
  const d=C.seed(),c=C.saveClass(d,{grade:'F1',subject:'英文',year:2027});
  const s=d.students[0];
  const r=C.enrollNames(d,c.id,[`${s.en} ${s.name}`]);
  assert.deepEqual(r.linked.map(x=>x.id),[s.id]);
  d.students.push({id:'twin',name:s.name,en:'',code:'S900',tag:'',archived:false});
  const r2=C.enrollNames(d,c.id,[s.name]);
  assert.deepEqual(r2.ambiguous,[s.name],'two different students share this name');
  assert.throws(()=>C.enrollNames(d,c.id,['  ']));
  assert.throws(()=>C.enrollNames(d,c.id,['名字\t85']));
});

test('class name is built from level and subject, can be customised and edited, code is generated',()=>{
  const d=C.seed();
  const c=C.saveClass(d,{grade:'F3',subject:'数学',year:2027});
  assert.equal(c.name,'F3 数学');assert.match(c.code,/^C2027-\d{3}$/);
  assert.ok(!d.classes.some(x=>x!==c&&x.code===c.code));
  const sat=C.saveClass(d,{grade:'F3',subject:'数学',year:2027,name:'F3 数学（星期六）'});
  assert.equal(sat.name,'F3 数学（星期六）','two classes of the same subject can coexist');
  C.saveClass(d,{id:c.id,grade:'F4',subject:'数学',year:2027});
  assert.equal(c.name,'F4 数学');assert.equal(c.grade,'F4');
  assert.throws(()=>C.saveClass(d,{grade:'',subject:'数学',year:2027}));
  assert.throws(()=>C.saveClass(d,{grade:'F1',subject:'',year:2027}));
  assert.throws(()=>C.saveClass(d,{id:'nope',grade:'F1',subject:'数学',year:2027}));
});

test('levels sort naturally',()=>{
  assert.deepEqual(['F10','F2','Std 3','F1','Std 1','预备班'].sort(C.levelOrder),['F1','F2','F10','Std 1','Std 3','预备班']);
});
