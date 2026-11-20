const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../dist/hook/engine.js');
const Q=require('../dist/quiz-import.js');
const {C}=H;

const qs=Array.from({length:6},(_,i)=>({no:i+1,text:`Q${i+1}`,type:'mc',options:['a','b','c','d'],answer:[1+(i%4)]}));
function game(seed=7,opt={}){const g=H.createGame({rng:H.rng(seed),check:Q.check,...opt});g.setQuestions(qs);return g;}
function run(g,ms,step=33){for(let t=0;t<ms&&g.ph!=='end';t+=step)g.tick(step);}

test('players stay on the shore and inside the arena', () => {
  for(const [x,y] of [[600,337],[-50,900],[600,200],[2000,-3]]){
    const p=H.confine(x,y),s=C.SEA,e=((p.x-s.x)/(s.rx+C.PR))**2+((p.y-s.y)/(s.ry+C.PR))**2;
    assert.ok(e>=0.999,'outside the sea');assert.ok(p.x>=C.PR&&p.x<=C.W-C.PR&&p.y>=C.PR&&p.y<=C.H-C.PR);
  }
});

test('orbs float inside the sea on a fixed path', () => {
  const o={id:3,k:'f',s:12345,b:0};
  for(let t=0;t<60000;t+=777){const p=H.orbPos(o,t),s=C.SEA;assert.ok(((p.x-s.x)/s.rx)**2+((p.y-s.y)/s.ry)**2<1);}
  assert.deepEqual(H.orbPos(o,4321),H.orbPos({...o},4321));
});

test('teams are balanced when players join and when the team count changes', () => {
  const g=game();
  for(let i=0;i<7;i++)g.join('p'+i,'P'+i);
  const count=n=>[...g.players.values()].filter(p=>p.team===n).length;
  assert.deepEqual([count(0),count(1)],[4,3]);
  g.setTeams(3);assert.deepEqual([count(0),count(1),count(2)].sort(),[2,2,3]);
});

test('a hook catches an orb, the player answers, right adds points and wrong freezes', () => {
  const g=game();g.join('a','Ali');g.start();run(g,C.COUNT+10);assert.equal(g.ph,'play');
  const p=g.players.get('a'),o=g.orbs.find(x=>x.k==='n');g.orbs=[o];
  // Stand on the shore facing the orb and fire straight at it.
  const at=g.orbAt(o),edge=H.confine(H.C.SEA.x-H.C.SEA.rx-30,at.y);p.x=edge.x;p.y=edge.y;
  const aim=H.orbPos(o,g.t+Math.hypot(at.x-p.x,at.y-p.y)/C.OUT*1000);
  assert.ok(g.input({k:'fire',id:'a',x:p.x,y:p.y,a:Math.atan2(aim.y-p.y,aim.x-p.x),t:g.t}));
  for(let i=0;i<120&&p.st===0;i++)g.tick(33);
  assert.equal(p.st,1,'answering after the orb is reeled in');assert.equal(o.by,'a');
  const q=g.qs[p.q];
  assert.equal(g.input({k:'ans',id:'a',qn:p.qn-1,v:q.answer}),p,'stale answer ignored');assert.equal(p.st,1);
  g.input({k:'ans',id:'a',qn:p.qn,v:q.answer});
  assert.equal(p.st,0);assert.equal(g.sc[p.team],1);assert.equal(p.ok,1);assert.equal(o.by,'');
  // Second catch, wrong answer → frozen 3 s, orb back in the sea.
  p.st=1;p.q=0;p.qn++;p.orb=o.id;o.by='a';p.until=g.t+C.ANSWER;
  g.input({k:'ans',id:'a',qn:p.qn,v:[4]});
  assert.equal(p.st,2);assert.equal(p.bad,1);assert.equal(o.by,'');
  run(g,C.FREEZE+50);assert.equal(p.st,0);
});

test('the last hook wins a contested orb, but not from a teammate', () => {
  const g=game();g.join('a','A');g.join('b','B');g.join('c','C');g.start();run(g,C.COUNT+10);
  const [a,b,c]=['a','b','c'].map(id=>g.players.get(id));assert.equal(a.team,c.team);assert.notEqual(a.team,b.team);
  const o=g.orbs[0];g.orbs=[o];
  g.hooks.push({o:'a',x:a.x,y:a.y,a:0,t0:g.t,tt:g.t,d:300,orb:o.id,lt:g.t});o.hk='a';
  const tip=H.hookTip(g.hooks[0],g.t+33);
  // B (other team) fires straight through the orb's next position.
  b.x=tip.x-200;b.y=tip.y;g.hooks.push({o:'b',x:b.x,y:b.y,a:0,t0:g.t,tt:0,d:0,orb:0,lt:g.t});
  for(let i=0;i<12&&o.hk!=='b';i++)g.tick(33);
  assert.equal(o.hk,'b','stolen by the other team');assert.equal(g.hooks.find(h=>h.o==='a').orb,0);
  // C (A's teammate, B's opponent) steals it back.
  const tip2=H.hookTip(g.hooks.find(h=>h.o==='b'),g.t+33);
  c.x=tip2.x-200;c.y=tip2.y;g.hooks.push({o:'c',x:c.x,y:c.y,a:0,t0:g.t,tt:0,d:0,orb:0,lt:g.t});
  for(let i=0;i<12&&o.hk!=='c';i++)g.tick(33);
  assert.equal(o.hk,'c');
  // A is C's teammate: A's new hook passes through without stealing.
  const tip3=H.hookTip(g.hooks.find(h=>h.o==='c'),g.t+33);
  g.hooks=g.hooks.filter(h=>h.o!=='a');
  a.x=tip3.x-200;a.y=tip3.y;g.hooks.push({o:'a',x:a.x,y:a.y,a:0,t0:g.t,tt:0,d:0,orb:0,lt:g.t});
  let stole=false;for(let i=0;i<12;i++){g.tick(33);if(o.hk==='a'||o.by==='a')stole=true;}
  assert.equal(stole,false,'teammate does not steal');
});

test('answer time runs out after 15 s and counts as wrong', () => {
  const g=game();g.join('a','A');g.start();run(g,C.COUNT+10);
  const p=g.players.get('a'),o=g.orbs[0];o.by='a';Object.assign(p,{st:1,q:2,qn:1,orb:o.id,until:g.t+C.ANSWER});
  run(g,C.ANSWER-100);assert.equal(p.st,1);run(g,200);assert.equal(p.st,2);assert.equal(g.qStats[2].wrong,1);
});

test('a full game of 20 bots ends with a winner, stats and the hardest question', () => {
  for(const seed of [1,2,3]){
    const g=game(seed);for(let i=0;i<20;i++)g.join('bot'+i,'Bot '+i,true);g.setTeams(seed===3?3:2);g.start();
    run(g,C.COUNT+C.LIMIT+1000);
    assert.equal(g.ph,'end');const e=g.end;
    assert.ok(e.reason==='target'?Math.max(...g.sc)>=C.TARGET:g.t>=C.LIMIT);
    assert.equal(e.players.length,20);assert.ok(g.log.length>10,'bots answered questions');
    if(e.hard>=0)assert.equal(e.hardText,qs[e.hard].text);
    const snap=JSON.stringify(g.snapshot());assert.ok(snap.length<6000,`snapshot ${snap.length} bytes`);
    const u=H.unpack(JSON.parse(snap));assert.equal(u.p.length,20);
  }
});

test('kicked players cannot rejoin right away and pause stops the clock', () => {
  const g=game();g.join('a','A');g.join('b','B');g.kick('b');
  assert.equal(g.join('b','B'),null);assert.deepEqual(g.snapshot().k,['b']);
  g.start();run(g,C.COUNT+500);const t=g.t;g.pause();run(g,1000);assert.equal(g.t,t);g.resume();g.tick(33);assert.equal(g.t,t+33);
});

test('fewer snapshots as more phones join, to stay under the free Supabase limit', () => {
  assert.equal(H.snapEvery(3),250);assert.equal(H.snapEvery(20),500);
  // 20 phones: snapshot sent once + received 20 times, twice a second → well under 100 messages a second.
  assert.ok((20+1)*1000/H.snapEvery(20)<=50);
});

test('each player keeps the animal they picked, and can change it in the lobby', () => {
  const g=game(),N=H.ANIMALS.length;
  g.input({k:'join',id:'a',name:'Ali',av:3});
  assert.equal(g.players.get('a').av,3);
  g.input({k:'join',id:'a',name:'Ali',av:7});assert.equal(g.players.get('a').av,7,'changed in the lobby');
  g.input({k:'join',id:'a',name:'Ali'});assert.equal(g.players.get('a').av,7,'a rejoin without a choice keeps it');
  for(const bad of [99,-1,1.5,'x'])assert.ok(g.join('b'+bad,'B',false,bad).av<N,'unknown choice → some animal');
  const s=H.unpack(JSON.parse(JSON.stringify(g.snapshot())));assert.equal(s.p.find(p=>p.id==='a').av,7);
  g.start();g.stop();assert.equal(g.end.players.find(r=>r[0]==='Ali')[4],7,'results show the animal');
});

test('a move message adds back the walk done while it travelled', () => {
  const g=game();g.join('a','A');g.start();run(g,C.COUNT+1000);
  const p=g.players.get('a'),start=H.confine(200,40);
  g.input({k:'mv',id:'a',s:1,x:start.x,y:start.y,dx:1,dy:0,t:g.t-200});
  assert.ok(Math.abs(p.x-(start.x+C.SPEED*0.2))<1,'moved on by 0.2 s of walking');
  g.input({k:'mv',id:'a',s:1,x:0,y:0,dx:0,dy:0,t:g.t});assert.ok(p.x>100,'old message ignored');
});

test('the screens can tell when the server cannot be reached', async () => {
  // A websocket that never connects (no internet / blocked): downFor keeps growing so the teacher and phones get a warning.
  const made=[];global.WebSocket=class{constructor(){made.push(this);}send(){}close(){}};
  const net=H.createNet({url:'https://x.supabase.co',key:'k'});net.join('hook-lobby',()=>{});
  await new Promise(r=>setTimeout(r,30));assert.ok(net.downFor()>=25,'counting while never connected');
  made[0].onopen();assert.equal(net.downFor(),0,'connected');
  made[0].onclose();assert.ok(net.downFor()<20,'counts again from the moment it dropped');
  net.close();delete global.WebSocket;
  assert.equal(H.createLocalNet().downFor(),0);
});
