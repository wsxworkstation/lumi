/* Class groups: leader and members, one group per student per class, add/remove/delete, auto split. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../dist/core.js');
const fresh=()=>{const d=C.seed();d.classes[0].groups=[];return d;};
const roster=d=>d.classes[0].students.filter(id=>!d.students.find(s=>s.id===id).archived);

test('create a group with a leader, then edit members and change the leader',()=>{
  const d=fresh(),cid=d.classes[0].id,[a,b,c,e]=roster(d);
  const g=C.saveGroup(d,cid,{name:' 第1组 ',members:[a,b,c],leaderId:a});
  assert.equal(g.name,'第1组');assert.equal(g.leaderId,a);assert.deepEqual(g.members,[a,b,c]);
  C.saveGroup(d,cid,{id:g.id,name:'星星组',members:[b,c,e],leaderId:e});
  const [only]=C.groupsOf(d,cid);
  assert.equal(only.name,'星星组');assert.deepEqual(only.members,[b,c,e]);assert.equal(only.leaderId,e);
});

test('adding a student to another group moves them, and a moved leader is cleared',()=>{
  const d=fresh(),cid=d.classes[0].id,[a,b,c]=roster(d);
  const g1=C.saveGroup(d,cid,{name:'A',members:[a,b],leaderId:a});
  C.saveGroup(d,cid,{name:'B',members:[a,c],leaderId:c});
  const [x,y]=C.groupsOf(d,cid);
  assert.deepEqual(x.members,[b]);assert.equal(x.leaderId,null,'old group loses its leader');
  assert.deepEqual(y.members,[a,c]);
  assert.equal(d.classes[0].groups.find(g=>g.id===g1.id).leaderId,null);
});

test('rejects bad input without changing anything',()=>{
  const d=fresh(),cid=d.classes[0].id,[a,b]=roster(d),outsider=d.classes[1].students.find(id=>!d.classes[0].students.includes(id));
  C.saveGroup(d,cid,{name:'A',members:[a]});
  const snapshot=JSON.stringify(d.classes[0].groups);
  assert.throws(()=>C.saveGroup(d,cid,{name:'',members:[b]}));
  assert.throws(()=>C.saveGroup(d,cid,{name:'B',members:[b],leaderId:a}),/队长/);
  assert.throws(()=>C.saveGroup(d,cid,{name:'A',members:[b]}),/同名/);
  if(outsider)assert.throws(()=>C.saveGroup(d,cid,{name:'C',members:[outsider]}),/这个班/);
  assert.equal(JSON.stringify(d.classes[0].groups),snapshot);
});

test('delete a group; members simply become ungrouped',()=>{
  const d=fresh(),cid=d.classes[0].id,[a,b]=roster(d);
  const g=C.saveGroup(d,cid,{name:'A',members:[a,b],leaderId:b});
  C.deleteGroup(d,cid,g.id);
  assert.deepEqual(C.groupsOf(d,cid),[]);
  assert.ok(d.classes[0].students.includes(a),'student stays in the class');
  assert.throws(()=>C.deleteGroup(d,cid,g.id));
});

test('auto split covers every student exactly once, sizes differ by at most one, each group has a leader',()=>{
  const d=fresh(),cid=d.classes[0].id,ids=roster(d);
  const groups=C.autoGroups(d,cid,3,{random:()=>0.42});
  const all=groups.flatMap(g=>g.members);
  assert.equal(all.length,ids.length);assert.deepEqual([...all].sort(),[...ids].sort());
  const sizes=groups.map(g=>g.members.length);assert.ok(Math.max(...sizes)-Math.min(...sizes)<=1);
  assert.ok(groups.every(g=>g.leaderId&&g.members.includes(g.leaderId)));
  assert.deepEqual(groups.map(g=>g.name),['第1组','第2组','第3组']);
  assert.throws(()=>C.autoGroups(d,cid,0));assert.throws(()=>C.autoGroups(d,cid,ids.length+1));
  assert.equal(C.autoGroups(d,cid,2,{leaders:false}).every(g=>g.leaderId===null),true);
});

test('archived or removed students drop out of groups automatically',()=>{
  const d=fresh(),cid=d.classes[0].id,[a,b,c]=roster(d);
  C.saveGroup(d,cid,{name:'A',members:[a,b,c],leaderId:a});
  d.students.find(s=>s.id===a).archived=true;
  d.classes[0].students=d.classes[0].students.filter(id=>id!==c);
  const [g]=C.groupsOf(d,cid);
  assert.deepEqual(g.members,[b]);assert.equal(g.leaderId,null);
});

test('each group gets its own colour; colour can be changed but must come from the palette',()=>{
  const d=fresh(),cid=d.classes[0].id,[a,b]=roster(d);
  const g1=C.saveGroup(d,cid,{name:'A',members:[a]}),g2=C.saveGroup(d,cid,{name:'B',members:[b]});
  assert.ok(C.TEAM_COLORS.includes(g1.color)&&C.TEAM_COLORS.includes(g2.color));
  assert.notEqual(g1.color,g2.color);
  C.saveGroup(d,cid,{id:g1.id,name:'A',members:[a],color:C.TEAM_COLORS[6]});
  assert.equal(C.groupsOf(d,cid)[0].color,C.TEAM_COLORS[6]);
  assert.throws(()=>C.saveGroup(d,cid,{id:g1.id,name:'A',members:[a],color:'#123456'}));
  const auto=C.autoGroups(d,cid,3);
  assert.equal(new Set(auto.map(g=>g.color)).size,3);
});

test('points add and subtract, undo removes one click, reset starts a new round but keeps history',()=>{
  const d=fresh(),cid=d.classes[0].id,[a,b]=roster(d);
  const g=C.saveGroup(d,cid,{name:'A',members:[a]}),h=C.saveGroup(d,cid,{name:'B',members:[b]});
  C.addPoints(d,cid,g.id,1);C.addPoints(d,cid,g.id,1);const minus=C.addPoints(d,cid,g.id,-1);
  C.addPoints(d,cid,h.id,5,'抢答第一');
  let [x,y]=C.groupsOf(d,cid);
  assert.equal(x.score,1);assert.equal(y.score,5);
  assert.equal(d.classes[0].groups[1].log[0].note,'抢答第一');
  C.removePoints(d,cid,g.id,minus.id);
  assert.equal(C.groupsOf(d,cid)[0].score,2,'undo of the -1');
  for(const bad of [0,1.5,'abc',1001,-1001])assert.throws(()=>C.addPoints(d,cid,g.id,bad));
  C.resetPoints(d,cid);
  [x,y]=C.groupsOf(d,cid);
  assert.equal(x.score,0);assert.equal(y.score,0);
  assert.equal(d.classes[0].groups[0].log.length,2,'older points stay in the log');
  C.addPoints(d,cid,h.id,-2);
  assert.equal(C.groupsOf(d,cid)[1].score,-2,'scores can go below zero');
});

test('groups saved before colours and points existed still work',()=>{
  const d=fresh(),cid=d.classes[0].id,[a]=roster(d);
  d.classes[0].groups=[{id:'old',name:'旧组',leaderId:a,members:[a]}];
  const [g]=C.groupsOf(d,cid);
  assert.ok(C.TEAM_COLORS.includes(g.color));assert.equal(g.score,0);
  C.addPoints(d,cid,'old',3);
  assert.equal(C.groupsOf(d,cid)[0].score,3);
});
