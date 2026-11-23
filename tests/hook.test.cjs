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

test('room numbers count up from 0001 and skip rooms already open', () => {
  assert.equal(H.pickRoom(new Set()),'0001');
  assert.equal(H.pickRoom(new Set(['0001','0002'])),'0003');
  assert.equal(H.pickRoom(new Set(['0002'])),'0001');
});

// Helpers for the item-card tests: a game already playing, with no cards dropping and no goldfish unless asked.
function playing(ids,seed=7){const g=game(seed);for(const id of ids)g.join(id,id.toUpperCase());g.start();run(g,C.COUNT+10);g.dropAt=1e9;g.glowAt=1e9;g.drops=[];g.spots=[];for(const p of g.players.values())p.cards=[];return g;}
function give(g,p,o){o.hk='';o.by=p.id;Object.assign(p,{st:1,orb:o.id,q:0,until:g.t+C.ANSWER});p.qn++;}
const right=(g,p)=>g.input({k:'ans',id:p.id,qn:p.qn,v:g.qs[p.q].answer});
const wrong=(g,p)=>g.input({k:'ans',id:p.id,qn:p.qn,v:[g.qs[p.q].answer[0]%4+1]});

test('cards are there from the start, one more every 5 s, at most 4 on the shore; a player holds at most two', () => {
  const g=game();g.join('a','A');g.join('b','B');g.start();
  const held=()=>[...g.players.values()].reduce((n,p)=>n+p.cards.length,0);
  assert.equal(g.drops.length+held(),C.CARD.START,'2 cards at the start');
  run(g,C.COUNT+C.CARD.EVERY+50);assert.equal(g.drops.length+held(),C.CARD.START+1,'one more after 5 s');
  run(g,30000);assert.ok(g.drops.length<=C.CARD.ON_MAP,'never more than 4 lying around');for(const p of g.players.values())assert.ok(p.cards.length<=C.CARD.MAX);
  const s=C.SEA;for(const d of g.drops)assert.ok(((d.x-s.x)/s.rx)**2+((d.y-s.y)/s.ry)**2>1,'on the shore, not in the lake');
  const a=g.players.get('a'),got=new Set();
  for(let i=0;i<200;i++){a.cards=[];g.drops=[{id:900+i,x:Math.round(a.x),y:Math.round(a.y)}];g.tick(33);got.add(a.cards[0]);}
  assert.ok(got.has('slow')&&got.has('ice')&&got.has('up'),'the new slime card is in the pool');assert.ok(!got.has('shield'),'shields are not cards any more');
  a.cards=['up','ice'];g.drops=[{id:51,x:Math.round(a.x),y:Math.round(a.y)}];g.tick(33);
  assert.equal(a.cards.length,2,'hands full');assert.equal(g.drops.length,1,'card stays on the grass');
  const off=game();off.items=false;off.join('a','A');off.start();run(off,C.COUNT+40000);
  assert.equal(off.drops.length,0,'teacher switched items off');assert.equal(off.spots.length,0,'no corner shields either');
});

test('knock-up throws nearby enemies in the air for 2 s, never a teammate or someone answering', () => {
  const g=playing(['a','b','c','d']),[a,b,c,d]=['a','b','c','d'].map(id=>g.players.get(id));
  assert.deepEqual([a.team,b.team,c.team,d.team],[0,1,0,1]);
  b.x=a.x+60;b.y=a.y;c.x=a.x+30;c.y=a.y;d.x=a.x;d.y=a.y+80;Object.assign(d,{st:1,until:g.t+C.ANSWER});
  a.cards=['up'];assert.ok(g.useCard('a',0));
  assert.equal(b.st,3,'enemy flies');assert.equal(c.st,0,'teammate safe');assert.equal(d.st,1,'answering is never interrupted');
  assert.deepEqual(a.cards,[]);
  const s=H.unpack(JSON.parse(JSON.stringify(g.snapshot())));
  assert.deepEqual(s.fx.map(f=>[f.k,f.by,f.to]),[['up','a',['b']]]);assert.equal(s.p.find(p=>p.id==='b').st,3);
  g.input({k:'fire',id:'b',x:b.x,y:b.y,a:0,t:g.t});assert.equal(g.hooks.length,0,'cannot fish while flying');
  run(g,C.CARD.UP+50);assert.equal(b.st,0,'lands after 2 s');
  b.x=a.x+400;a.cards=['up'];assert.equal(g.useCard('a',0),false);assert.deepEqual(a.cards,['up'],'nobody in reach: card kept');
});

test('freeze is aimed: the arrow flies straight and freezes the first enemy on its path for 2.5 s', () => {
  const g=playing(['a','b','c','d']),[a,b,c,d]=['a','b','c','d'].map(id=>g.players.get(id));
  b.x=a.x+150;b.y=a.y;c.x=a.x+60;c.y=a.y;d.x=a.x+100;d.y=a.y;Object.assign(d,{st:1,until:g.t+C.ANSWER});
  a.cards=['ice'];assert.ok(g.useCard('a',0,0));assert.deepEqual(a.cards,[],'card used');assert.equal(g.shots.length,1);
  run(g,300);
  assert.equal(b.st,2,'enemy on the path is frozen');assert.equal(c.st,0,'passes through a teammate');assert.equal(d.st,1,'passes someone answering');
  assert.ok(Math.abs(b.until-g.t-C.CARD.ICE)<=300,'about 2.5 s');assert.equal(g.shots.length,0,'arrow gone after hitting');
  assert.deepEqual(g.fx.filter(f=>f.k==='ice').map(f=>[f.by,f.to]),[['a',['b']]]);
  run(g,C.CARD.ICE);assert.equal(b.st,0);
  // Aimed the other way: a miss, and the card is still used up.
  a.cards=['ice'];g.useCard('a',0,Math.PI);run(g,600);assert.equal(b.st,0,'missed');assert.deepEqual(a.cards,[]);assert.equal(g.shots.length,0,'flew its full range and vanished');
  // Out of range (420): the arrow stops before reaching the enemy.
  b.x=a.x+C.SHOT.RANGE+60;a.cards=['ice'];g.useCard('a',0,0);run(g,800);assert.equal(b.st,0,'too far');
  // No aim given: it goes at the nearest enemy in reach.
  b.x=a.x+80;b.y=a.y+80;a.cards=['ice'];g.useCard('a',0);run(g,300);assert.equal(b.st,2,'auto-aim');
  const s=H.unpack(JSON.parse(JSON.stringify(g.snapshot())));assert.ok(Array.isArray(s.s)&&Array.isArray(s.z)&&Array.isArray(s.sp));
});

test('corner shields: walk onto one for 10 s of protection; it comes back 5 s later; it blocks a freeze and stops steals', () => {
  const g=game();g.join('a','A');g.join('b','B');g.start();run(g,C.COUNT+10);g.drops=[];
  assert.equal(g.spots.length,4,'four corners');assert.ok(g.spots.every(s=>s.at<=g.t),'ready from the start');
  for(const s of H.spotsFor(3).slice(0,2))assert.ok(s.x>200&&s.x<1000,'with 3 teams the top shields move off the picnic blankets');
  const [a,b]=['a','b'].map(id=>g.players.get(id)),spot=g.spots[0];
  b.x=spot.x;b.y=spot.y;g.tick(33);assert.ok(b.sh>g.t+C.CARD.SHIELD-100,'10 s shield');assert.ok(spot.at>g.t,'taken');
  a.x=spot.x;a.y=spot.y;g.tick(33);assert.ok(!(a.sh>g.t),'not back yet');run(g,C.SPOT.EVERY+50);assert.ok(a.sh>g.t,'back after 5 s');
  // A freeze arrow at a shielded enemy breaks the shield instead.
  b.x=400;b.y=60;a.x=250;a.y=60;b.sh=g.t+5000;a.cards=['ice'];g.useCard('a',0,0);run(g,300);
  assert.equal(b.st,0,'blocked');assert.equal(b.sh,0,'shield used up');assert.ok(g.fx.some(f=>f.k==='block'&&f.by==='b'));
  // A shielded player's fish can't be stolen on the way back.
  b.sh=g.t+5000;const o=g.orbs[0];g.orbs=[o];g.hooks=[];
  g.hooks.push({o:'b',x:b.x,y:b.y,a:0,t0:g.t,tt:g.t,d:300,orb:o.id,lt:g.t});o.hk='b';
  const tip=H.hookTip(g.hooks[0],g.t+33);a.x=tip.x-200;a.y=tip.y;g.hooks.push({o:'a',x:a.x,y:a.y,a:0,t0:g.t,tt:0,d:0,orb:0,lt:g.t});
  let stolen=false;for(let i=0;i<14;i++){g.tick(33);if(o.hk==='a'||o.by==='a')stolen=true;}
  assert.equal(stolen,false);
});

test('slime ball: lands where aimed, enemies inside walk at 40% and their rods go half speed; teammates are not slowed', () => {
  const g=playing(['a','b','c']),[a,b,c]=['a','b','c'].map(id=>g.players.get(id));
  a.x=200;a.y=60;b.x=300;b.y=60;c.x=320;c.y=60;   // b is the enemy, c is a's teammate
  a.cards=['slow'];assert.ok(g.useCard('a',0,0,100));assert.equal(g.zones.length,0,'still flying');
  run(g,C.SLIME.FLY+50);assert.equal(g.zones.length,1,'landed');const z=g.zones[0];assert.ok(Math.abs(z.x-300)<2&&Math.abs(z.y-60)<2);
  assert.ok(g.slowed('b'),'enemy slowed');assert.equal(g.slowed('c'),false,'teammate not slowed');
  const bx=b.x,cx=c.x;b.dx=1;b.dy=0;c.dx=1;c.dy=0;run(g,250);
  const vb=(b.x-bx)/0.25,vc=(c.x-cx)/0.25;assert.ok(Math.abs(vb-C.SPEED*C.SLIME.SLOW)<15,'40% speed: '+vb.toFixed(0));assert.ok(Math.abs(vc-C.SPEED)<15,'teammate full speed');
  b.dx=c.dx=0;
  assert.ok(g.input({k:'fire',id:'b',x:b.x,y:b.y,a:Math.PI/2,t:g.t}));const h=g.hooks.find(x=>x.o==='b');assert.equal(h.sp,C.SLIME.ROD,'rod at half speed');
  assert.ok(Math.abs(H.hookDist(h,h.t0+200)-C.OUT*C.SLIME.ROD*0.2)<1);
  run(g,C.SLIME.LEN);assert.equal(g.zones.length,0,'gone after 4 s');assert.equal(g.slowed('b'),false);
});

test('double card doubles the next right answer; the glowing goldfish starts a rush where every fish is worth 2', () => {
  const g=playing(['a','b']),a=g.players.get('a');
  a.cards=['x2'];g.useCard('a',0);assert.equal(a.x2,1);
  give(g,a,g.orbs.find(o=>o.k==='n'));wrong(g,a);assert.equal(a.x2,1,'kept after a wrong answer');
  run(g,C.FREEZE+50);give(g,a,g.orbs.find(o=>o.k==='n'));right(g,a);
  assert.equal(g.sc[a.team],2,'1 point doubled');assert.equal(a.x2,0);
  g.glowAt=g.t;g.tick(33);const glow=g.orbs.find(o=>o.k==='g');assert.ok(glow,'glowing goldfish appears');
  assert.equal(g.orbs.filter(o=>o.k==='g').length,1);
  give(g,a,glow);right(g,a);assert.equal(g.sc[a.team],4);assert.ok(g.rush>g.t,'rush started');assert.equal(glow.k,'n');
  assert.ok(H.unpack(JSON.parse(JSON.stringify(g.snapshot()))).ru>g.t);
  give(g,a,g.orbs.find(o=>o.k==='n'));right(g,a);assert.equal(g.sc[a.team],6,'every fish worth 2 during the rush');
  run(g,C.RUSH.LEN+50);assert.equal(g.rush,0,'rush over');
  give(g,a,g.orbs.find(o=>o.k==='n'));right(g,a);assert.equal(g.sc[a.team],7);
});

test('triple hook casts three lines; each fish is answered in turn, a wrong one freezes only at the end', () => {
  const g=playing(['a','b']),a=g.players.get('a');
  a.cards=['tri'];g.useCard('a',0);assert.equal(a.tri,1);
  assert.ok(g.input({k:'fire',id:'a',x:a.x,y:a.y,a:0,t:g.t}));
  const mine=g.hooks.filter(h=>h.o==='a');assert.equal(mine.length,3);assert.equal(a.tri,0,'used up');
  const fish=g.orbs.filter(o=>!o.hk&&!o.by).slice(0,3);mine.forEach((h,i)=>{h.tt=g.t;h.d=40;h.orb=fish[i].id;fish[i].hk='a';});
  run(g,300);
  assert.equal(a.st,1,'answering the first fish');assert.equal(a.bag.length,2,'two more waiting');assert.ok(fish.every(o=>o.by==='a'));
  wrong(g,a);assert.equal(a.st,1,'no freeze yet: next fish');right(g,a);assert.equal(a.st,1);right(g,a);
  assert.equal(g.sc[a.team],2);assert.equal(a.st,2,'frozen once, at the end');
});

test('bots pick up and use cards in a full game, and the snapshot stays small', () => {
  const g=game(5);for(let i=0;i<20;i++)g.join('bot'+i,'Bot '+i,true);g.start();
  let used=0,seen=0;const was=g.fx.length;
  for(let t=0;t<C.COUNT+C.LIMIT&&g.ph!=='end';t+=33){g.tick(33);if(g.fx.length)used=Math.max(used,g.fx.filter(f=>f.k!=='rush').length);
    if(g.t%5000<33){const n=JSON.stringify(g.snapshot()).length;seen=Math.max(seen,n);}}
  assert.ok(used>0||was,'bots used cards');assert.ok(seen<6500,`snapshot ${seen} bytes`);
});

test('a student who left the room disappears; the same name coming back takes the old place', () => {
  const g=game();g.join('a','Uh');g.join('b','Ali');const a=g.players.get('a');
  // Closed the page: gone at once.
  g.input({k:'bye',id:'b'});assert.equal(g.players.has('b'),false);
  // Opened the game again (new id) while the old copy is still there but silent: no second "Uh".
  a.seen=Date.now()-(C.TAKEOVER+500);const team=a.team;
  const back=g.join('a2',' uh ');assert.equal(back,a,'same player');assert.equal(back.id,'a2');assert.equal(back.team,team);
  assert.deepEqual([...g.players.keys()],['a2']);
  // Two real students with the same name, both online: both stay.
  g.join('c','Uh');assert.equal(g.players.size,2);
  // Silent for 10 s in the room: taken off.
  g.players.get('c').seen=Date.now()-(C.AWAY+100);assert.equal(g.sweep(),1);assert.equal(g.players.has('c'),false);
  g.join('bot1','Bot',true);g.players.get('bot1').seen=0;g.sweep();assert.ok(g.players.has('bot1'),'bots never leave');
});

test('a student who drops out mid-game leaves the field but keeps team and score when they come back', () => {
  const g=game();g.join('a','Mei');g.join('b','Ali');g.start();run(g,C.COUNT+10);g.dropAt=1e9;g.glowAt=1e9;
  const a=g.players.get('a'),o=g.orbs[0];
  o.by='a';Object.assign(a,{st:1,orb:o.id,q:0,until:g.t+C.ANSWER});a.qn++;
  g.input({k:'ans',id:'a',qn:a.qn,v:qs[0].answer});assert.equal(a.ok,1);const pts=g.sc[a.team];
  // Hooks out when they vanish: the line and its fish are released.
  const o2=g.orbs[1];g.hooks.push({o:'a',x:a.x,y:a.y,a:0,t0:g.t,tt:g.t,d:200,orb:o2.id,lt:g.t});o2.hk='a';
  a.seen=Date.now()-(C.AWAY+100);g.sweep();
  assert.equal(g.players.has('a'),false,'off the field');assert.equal(g.hooks.length,0);assert.equal(o2.hk,'');
  assert.equal(g.sc[a.team],pts,'team keeps its points');
  assert.equal(H.unpack(JSON.parse(JSON.stringify(g.snapshot()))).p.length,1);
  const back=g.join('a-new','Mei');assert.equal(back.team,a.team);assert.equal(back.ok,1,'score kept');assert.equal(back.st,0);
  g.leave('a-new');g.stop();assert.ok(g.end.players.some(r=>r[0]==='Mei'),'results still count what they answered');
});

test('time mode: reaching the target does not end the game; when time is up the highest score wins', () => {
  const g=game();g.join('a','A');g.join('b','B');g.mode='time';g.limit=60000;g.target=5;g.start();run(g,C.COUNT+10);g.dropAt=1e9;g.glowAt=1e9;
  const a=g.players.get('a');
  for(let i=0;i<7;i++){const o=g.orbs.find(x=>!x.by&&!x.hk);o.by='a';Object.assign(a,{st:1,orb:o.id,q:0,until:g.t+C.ANSWER});a.qn++;g.input({k:'ans',id:'a',qn:a.qn,v:qs[0].answer});}
  assert.ok(g.sc[a.team]>=7);assert.equal(g.ph,'play','past the target but still playing');
  assert.equal(H.unpack(JSON.parse(JSON.stringify(g.snapshot()))).md,'time');
  run(g,60000);assert.equal(g.ph,'end');assert.equal(g.end.reason,'time');assert.equal(g.end.win,a.team);
  // Score mode (the default) still ends at the target.
  const s=game();s.join('a','A');s.target=5;s.start();run(s,C.COUNT+10);const p=s.players.get('a');
  for(let i=0;i<5&&s.ph==='play';i++){const o=s.orbs.find(x=>!x.by&&!x.hk);o.by='a';Object.assign(p,{st:1,orb:o.id,q:0,until:s.t+C.ANSWER});p.qn++;s.input({k:'ans',id:'a',qn:p.qn,v:qs[0].answer});}
  assert.equal(s.ph,'end');assert.equal(s.end.reason,'target');
});

test('three rooms share the free message limit: updates slow down as the total number of phones grows', () => {
  let prev=0;for(const n of [5,10,20,30,40,60]){const e=H.snapEvery(n);assert.ok(e>=prev,'never faster with more phones');prev=e;}
  // 3 rooms, 30 phones in total: snapshots sent + received stay well under 100 a second.
  assert.ok((30+3)*1000/H.snapEvery(30)<=55);assert.ok((45+3)*1000/H.snapEvery(45)<=55);
});
