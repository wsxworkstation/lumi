/* KSSM topic library: subject and level are read from the class; lists can be edited and reset. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const T=require('../dist/topics.js');

test('reads subject from what the teacher typed',()=>{
  assert.equal(T.subjectCode('AM'),'AM');assert.equal(T.subjectCode('F5 AM 2027'),'AM');assert.equal(T.subjectCode('Add Maths'),'AM');assert.equal(T.subjectCode('附加数学'),'AM');
  assert.equal(T.subjectCode('MM SA'),'MM');assert.equal(T.subjectCode('Mathematics'),'MM');assert.equal(T.subjectCode('数学'),'MM');assert.equal(T.subjectCode('Matematik'),'MM');
  assert.equal(T.subjectCode('SC'),'SC');assert.equal(T.subjectCode('Science'),'SC');assert.equal(T.subjectCode('科学'),'SC');assert.equal(T.subjectCode('Sains'),'SC');
  assert.equal(T.subjectCode('英文'),'');assert.equal(T.subjectCode('SAMPLE'),'','letters inside a word do not count');
});

test('reads level from F3, Form 3, Tingkatan 3 or 中三',()=>{
  for(const v of ['F3','f3','Form 3','FORM3','Tingkatan 3','T3','中三'])assert.equal(T.levelCode(v),'F3',v);
  assert.equal(T.levelCode('Std 3'),'');assert.equal(T.levelCode(''),'');
});

test('each class gets its own chapter list; Add Maths only exists for F4 and F5',()=>{
  const mm=T.list({},T.keyFor({grade:'F3',subject:'MM SA'}));
  assert.equal(mm[0],'1. Indeks / Indices');assert.equal(mm.length,9);
  assert.equal(T.list({},T.keyFor({grade:'F4',subject:'AM'})).length,10);
  assert.equal(T.list({},T.keyFor({grade:'F5',subject:'AM'}))[7],'8. Kinematik Gerakan Linear / Kinematics of Linear Motion');
  assert.deepEqual(T.list({},T.keyFor({grade:'F2',subject:'AM'})),[]);
  assert.equal(T.list({},T.keyFor({grade:'F4',subject:'Science'})).length,12);
  for(const s of ['MM','SC'])for(const l of T.LEVELS)assert.ok(T.builtIn(`${s}|${l}`).length>=8,`${s} ${l}`);
  assert.ok(T.isUnverified('SC|F1')&&!T.isUnverified('SC|F2'));
});

test('teacher edits replace the built-in list; saving the default list again removes the override',()=>{
  const data={};
  const saved=T.save(data,'SC|F1',['  Bab 1 Baharu ','','Bab 1 Baharu','Bab 2']);
  assert.deepEqual(saved,['Bab 1 Baharu','Bab 2']);
  assert.deepEqual(T.list(data,'SC|F1'),['Bab 1 Baharu','Bab 2']);
  T.save(data,'SC|F1',T.builtIn('SC|F1'));
  assert.ok(!('SC|F1' in data.topicLibrary));
  assert.throws(()=>T.save(data,'XX|F9',['a']));
});
