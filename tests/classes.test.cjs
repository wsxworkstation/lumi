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
  const d=C.seed(),home=d.classes[0],c=C.saveClass(d,{grade:home.grade,subject:'英文',year:home.year});
  const s=d.students.find(x=>x.id===home.students[0]);
  const r=C.enrollNames(d,c.id,[`${s.en} ${s.name}`]);
  assert.deepEqual(r.linked.map(x=>x.id),[s.id]);
  d.students.push({id:'twin',name:s.name,en:'Someone Else',code:'S900',tag:'',archived:false});home.students.push('twin');
  const r2=C.enrollNames(d,c.id,[s.name]);
  assert.deepEqual(r2.ambiguous,[s.name],'two different students at this level share the Chinese name');
  const r3=C.enrollNames(d,c.id,[`${s.en} ${s.name}`]);
  assert.deepEqual(r3.already.map(x=>x.id),[s.id],'adding the English name tells them apart');
  assert.throws(()=>C.enrollNames(d,c.id,['  ']));
  assert.throws(()=>C.enrollNames(d,c.id,['名字\t85']));
});

test('English only, Chinese only, or both: same level → same student and same code',()=>{
  const d=C.seed(),mm=C.saveClass(d,{grade:'F5',subject:'MM',year:2027}),am=C.saveClass(d,{grade:'F5',subject:'AM',year:2027}),sa=C.saveClass(d,{grade:'F5',subject:'SA',year:2027});
  const [chin]=C.enrollNames(d,mm.id,['CHIN WING SHUAN 陈颖萱']).created;
  assert.deepEqual(C.enrollNames(d,am.id,['陈颖萱']).linked.map(s=>s.code),[chin.code],'Chinese only');
  assert.deepEqual(C.enrollNames(d,sa.id,['chin wing  shuan']).linked.map(s=>s.code),[chin.code],'English only, any case and spacing');
  assert.equal(d.students.filter(s=>s.name.includes('陈颖萱')).length,1,'still one record');
  const alan=C.enrollNames(d,sa.id,['ALAN 陈颖萱']);
  assert.equal(alan.created.length,1,'same Chinese name but a different English name is another person');
});

test('a namesake in another level is a different student',()=>{
  const d=C.seed(),f5=C.saveClass(d,{grade:'F5',subject:'MM',year:2027}),f4=C.saveClass(d,{grade:'F4',subject:'MM',year:2027});
  const [a]=C.enrollNames(d,f5.id,['陈颖萱']).created;
  const r=C.enrollNames(d,f4.id,['陈颖萱']);
  assert.equal(r.created.length,1);assert.notEqual(r.created[0].id,a.id);
});

test('a later paste fills in the half of the name that was missing',()=>{
  const d=C.seed(),mm=C.saveClass(d,{grade:'F5',subject:'MM',year:2027}),am=C.saveClass(d,{grade:'F5',subject:'AM',year:2027});
  const [s]=C.enrollNames(d,mm.id,['陈颖萱']).created;
  C.enrollNames(d,am.id,['CHIN WING SHUAN 陈颖萱']);
  assert.equal(s.en,'CHIN WING SHUAN');assert.equal(s.name,'陈颖萱');
  const [t]=C.enrollNames(d,mm.id,['TAN MEI LING']).created;
  C.enrollNames(d,am.id,['TAN MEI LING 陈美玲']);
  assert.equal(t.name,'TAN MEI LING 陈美玲');
  const same=C.enrollNames(d,am.id,['陈颖萱','CHIN WING SHUAN']);
  assert.equal(same.created.length,0,'two lines for the same person in one paste');
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

test('class schedule: weekdays and optional start time are saved and validated',()=>{
  const d=C.seed();
  const c=C.saveClass(d,{grade:'F4',subject:'MM',year:2027,days:['6','3','3'],time:'14:00'});
  assert.deepEqual(c.days,[3,6]);assert.equal(c.time,'14:00');
  const sun=C.saveClass(d,{grade:'F5',subject:'AM',year:2027,days:[0,1]});
  assert.deepEqual(sun.days,[1,0],'Monday first, Sunday last');assert.equal(sun.time,'');
  assert.throws(()=>C.saveClass(d,{grade:'F4',subject:'MM',year:2027,time:'25:00'}));
  C.saveClass(d,{id:c.id,grade:'F4',subject:'MM',year:2027,days:[],time:''});
  assert.deepEqual(c.days,[]);
});

test('opens the class taught now: running or next today, otherwise none',()=>{
  const at=(day,h,m=0)=>{const x=new Date(2027,2,7+day,h,m);return x;}; // 2027-03-07 is a Sunday
  const A={id:'A',days:[6],time:'14:00'},B={id:'B',days:[6],time:'16:00'},X={id:'X',days:[6],time:''},Y={id:'Y',days:[3]};
  assert.equal(C.classForNow([A,B],at(6,9)).id,'A','morning: first class of the day');
  assert.equal(C.classForNow([A,B],at(6,15,30)).id,'A','still within two hours of the 2pm class');
  assert.equal(C.classForNow([A,B],at(6,16,5)).id,'B','4pm class is now running');
  assert.equal(C.classForNow([A,B],at(6,21)).id,'B','evening: the last class of the day');
  assert.equal(C.classForNow([X,Y],at(6,10)).id,'X','no time set: today\'s class');
  assert.equal(C.classForNow([A,B,Y],at(1,10)),null,'nothing on Monday');
  assert.equal(C.classForNow([{...A,archived:true}],at(6,14)),null);
});
