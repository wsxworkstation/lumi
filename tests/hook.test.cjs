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
  const p=g.players.get('a'),o=g.orbs.find(x=>x.k==='n');g.orbs=[o];g.loot=[];
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

// Helpers for the item-card tests: a game already playing, with nothing new in the lake and no goldfish unless asked.
function playing(ids,seed=7){const g=game(seed);for(const id of ids)g.join(id,id.toUpperCase());g.start();run(g,C.COUNT+10);g.boxAt=g.bubAt=1e9;g.loot=[];g.glowAt=1e9;for(const p of g.players.values())p.cards=[];return g;}
function give(g,p,o){o.hk='';o.by=p.id;Object.assign(p,{st:1,orb:o.id,q:0,until:g.t+C.ANSWER});p.qn++;}
const right=(g,p)=>g.input({k:'ans',id:p.id,qn:p.qn,v:g.qs[p.q].answer});
const wrong=(g,p)=>g.input({k:'ans',id:p.id,qn:p.qn,v:[g.qs[p.q].answer[0]%4+1]});
// Stand on the shore right next to a point in the lake.
function shoreNear(p,at){const s=C.SEA,f=Math.hypot((at.x-s.x)/s.rx,(at.y-s.y)/s.ry)||1,e=H.confine(s.x+(at.x-s.x)/f,s.y+(at.y-s.y)/f);p.x=e.x;p.y=e.y;}
// Cast straight at a point (or at where a fish will be when the line gets there).
function castAt(g,p,at,orb){g.hooks=g.hooks.filter(h=>h.o!==p.id);let x=at.x,y=at.y;
  if(orb){const d=Math.hypot(x-p.x,y-p.y),f=H.fishPos(orb,g.t+d/C.OUT*1000,g.zones);x=f.x;y=f.y;}
  return g.input({k:'fire',id:p.id,x:p.x,y:p.y,a:Math.atan2(y-p.y,x-p.x),t:g.t});}

test('the lake: one "?" box and the shield bubble at the start, a second box 6 s later, never more than 2 boxes', () => {
  const g=game();g.join('a','A');g.join('b','B');g.start();
  assert.deepEqual(g.loot.map(l=>l.k).sort(),['b','c'],'a box and the bubble from the very start');
  run(g,C.COUNT+C.LOOT.BOX_EVERY+50);assert.equal(g.loot.filter(l=>l.k==='c').length,2,'second box after 6 s');
  run(g,30000);assert.equal(g.loot.filter(l=>l.k==='c').length,2,'at most 2 boxes');assert.equal(g.loot.filter(l=>l.k==='b').length,1,'one bubble');
  const s=C.SEA;for(const l of g.loot)for(let t=0;t<60000;t+=1234){const p=H.lootPos(l,t);assert.ok(((p.x-s.x)/s.rx)**2+((p.y-s.y)/s.ry)**2<1,'floats inside the lake');}
  const u=H.unpack(JSON.parse(JSON.stringify(g.snapshot())));assert.equal(u.l.length,3);assert.deepEqual(H.lootPos(u.l[0],g.t),H.lootPos(g.loot[0],g.t),'phones can follow them');
  const off=game();off.items=false;off.join('a','A');off.start();run(off,C.COUNT+20000);assert.equal(off.loot.length,0,'teacher switched items off');
});

test('a box caught with the rod gives a card at once (no question); hands full: the line passes through it', () => {
  const g=game();g.join('a','A');g.join('b','B');g.start();run(g,C.COUNT+10);g.glowAt=1e9;g.orbs=[];   // nothing else in the water
  const a=g.players.get('a'),box=g.loot.find(l=>l.k==='c'),at=g.lootAt(box);shoreNear(a,at);
  assert.ok(castAt(g,a,at));for(let i=0;i<90&&!a.cards.length;i++)g.tick(33);
  assert.equal(a.cards.length,1,'got a card');assert.equal(a.st,0,'no question for a box');assert.ok(!g.loot.includes(box),'box taken');
  assert.ok(g.fx.some(f=>f.k==='box'&&f.by==='a'));
  run(g,C.LOOT.BOX_EVERY+100);assert.equal(g.loot.filter(l=>l.k==='c').length,1,'a new box 6 s after it was taken');
  // Hands full: the line goes through the box, which stays in the lake, and the phone is told.
  a.cards=['up','ice'];const box2=g.loot.find(l=>l.k==='c');run(g,1000);const at2=g.lootAt(box2);shoreNear(a,at2);
  castAt(g,a,at2);for(let i=0;i<60;i++)g.tick(33);
  assert.deepEqual(a.cards,['up','ice']);assert.ok(g.loot.includes(box2),'box still floating');assert.ok(g.fx.some(f=>f.k==='full'&&f.by==='a'));
  // Every one of the seven cards comes out of boxes, equally for everyone (no help for the team behind).
  const seen={};g.sc=[0,15,0];
  for(let i=0;i<700;i++){a.cards=[];const l={id:900+i,k:'c',s:1,b:0,hk:'a'};g.loot.push(l);
    g.hooks=[{o:'a',x:a.x,y:a.y,a:0,t0:g.t-2000,tt:g.t-1990,d:5,orb:0,loot:l.id,lt:g.t}];g.tick(33);seen[a.cards[0]]=(seen[a.cards[0]]||0)+1;}
  assert.deepEqual(Object.keys(seen).sort(),['bomb','ice','ink','steal','up','whirl','x2'],'seven cards, no slime any more');
  for(const n of Object.values(seen))assert.ok(n>60&&n<150,'about equally likely: '+JSON.stringify(seen));
});

test('a box being reeled in can be stolen like a fish, but not by a teammate', () => {
  const g=playing(['a','b','c']),[a,b,c]=['a','b','c'].map(id=>g.players.get(id));g.orbs=[];
  const l={id:1,k:'c',s:5,b:0,hk:'a'};g.loot=[l];
  g.hooks.push({o:'a',x:a.x,y:a.y,a:0,t0:g.t,tt:g.t,d:300,orb:0,loot:1,lt:g.t});
  const tip=H.hookTip(g.hooks[0],g.t+33);b.x=tip.x-200;b.y=tip.y;g.hooks.push({o:'b',x:b.x,y:b.y,a:0,t0:g.t,tt:0,d:0,orb:0,loot:0,lt:g.t});
  for(let i=0;i<12&&l.hk!=='b';i++)g.tick(33);
  assert.equal(l.hk,'b','stolen by the other team');assert.equal(g.hooks.find(h=>h.o==='a').loot,0);
  const tip2=H.hookTip(g.hooks.find(h=>h.o==='b'),g.t+33);g.hooks=g.hooks.filter(h=>h.o!=='a');
  c.team=b.team;c.x=tip2.x-200;c.y=tip2.y;g.hooks.push({o:'c',x:c.x,y:c.y,a:0,t0:g.t,tt:0,d:0,orb:0,loot:0,lt:g.t});
  let stole=false;for(let i=0;i<12;i++){g.tick(33);if(l.hk==='c')stole=true;}assert.equal(stole,false,'a teammate does not steal');
});

test('the shield bubble: caught with the rod for 10 s of shield, back 15 s later; it blocks a freeze and stops steals', () => {
  const g=game();g.join('a','A');g.join('b','B');g.start();run(g,C.COUNT+10);g.glowAt=1e9;g.orbs=[];g.boxAt=1e9;g.loot=g.loot.filter(l=>l.k==='b');
  const [a,b]=['a','b'].map(id=>g.players.get(id)),bub=g.loot[0],at=g.lootAt(bub);shoreNear(b,at);
  castAt(g,b,at);for(let i=0;i<90&&!(b.sh>g.t);i++)g.tick(33);
  assert.ok(b.sh>g.t+C.CARD.SHIELD-1500,'about 10 s of shield');assert.equal(b.st,0,'no question');assert.equal(g.loot.length,0,'bubble taken');
  run(g,C.LOOT.BUB_EVERY-500);assert.equal(g.loot.length,0,'not back yet');run(g,700);assert.equal(g.loot.length,1,'back after 15 s');
  // A freeze arrow at a shielded enemy breaks the shield instead.
  b.x=400;b.y=60;a.x=250;a.y=60;b.sh=g.t+5000;a.cards=['ice'];g.useCard('a',0,0);run(g,300);
  assert.equal(b.st,0,'blocked');assert.equal(b.sh,0,'shield used up');assert.ok(g.fx.some(f=>f.k==='block'&&f.by==='b'));
  // A shielded player's fish can't be stolen on the way back.
  b.sh=g.t+5000;g.orbs=[{id:1,k:'n',s:3,b:0,hk:'',by:''}];const o=g.orbs[0];g.hooks=[];g.loot=[];
  g.hooks.push({o:'b',x:b.x,y:b.y,a:0,t0:g.t,tt:g.t,d:300,orb:o.id,loot:0,lt:g.t});o.hk='b';
  const tip=H.hookTip(g.hooks[0],g.t+33);a.x=tip.x-200;a.y=tip.y;g.hooks.push({o:'a',x:a.x,y:a.y,a:0,t0:g.t,tt:0,d:0,orb:0,loot:0,lt:g.t});
  let stolen=false;for(let i=0;i<14;i++){g.tick(33);if(o.hk==='a'||o.by==='a')stolen=true;}
  assert.equal(stolen,false);
});

test('knock-back: every enemy in the aimed fan flies to the edge of the map, whatever they are doing; no slowing after', () => {
  const g=playing(['a','b','c','d','e']),[a,b,c,d,e]=['a','b','c','d','e'].map(id=>g.players.get(id));
  assert.deepEqual([a.team,b.team,c.team,d.team,e.team],[0,1,0,1,0]);
  g.orbs=[];a.x=400;a.y=60;
  b.x=560;b.y=70;                                    // enemy in front, inside the fan
  d.x=600;d.y=110;Object.assign(d,{st:1,until:g.t+C.ANSWER,q:0,qn:1});   // enemy answering a question, also in front
  c.x=480;c.y=60;                                    // teammate in front: never hit
  a.cards=['up'];assert.ok(g.useCard('a',0,0),'aimed straight right');
  assert.equal(b.st,3,'enemy flies');assert.ok(b.kb&&b.kb.x1>1150,'to the right edge');
  assert.ok(d.kb,'the one answering flies too');assert.equal(d.st,1,'and keeps answering');assert.equal(c.kb,null,'teammate safe');
  const s=H.unpack(JSON.parse(JSON.stringify(g.snapshot())));assert.ok(s.p.find(p=>p.id==='d').kb,'phones see the flight');
  g.input({k:'fire',id:'b',x:b.x,y:b.y,a:Math.PI/2,t:g.t});assert.equal(g.hooks.filter(h=>h.o==='b').length,0,'cannot fish while flying');
  for(let i=0;i<40&&(b.kb||d.kb);i++)g.tick(33);
  assert.equal(b.st,0,'landed');assert.ok(b.x>1150);assert.equal(d.st,1,'still answering after landing');
  const x0=b.x;b.dx=-1;b.dy=0;run(g,250);assert.ok(Math.abs((x0-b.x)/0.25-C.SPEED)<20,'full speed right after landing: '+((x0-b.x)/0.25).toFixed(0));b.dx=0;
  // Behind me, or outside the fan's sides, or too far: not hit — and the card is kept when the fan is empty.
  b.x=a.x-100;b.y=a.y;d.x=a.x+40;d.y=a.y+200;Object.assign(d,{st:0});
  a.cards=['up'];assert.equal(g.useCard('a',0,0),false,'nobody inside the fan');assert.deepEqual(a.cards,['up'],'card kept');
  b.x=a.x+C.FAN.R+40;b.y=a.y;assert.equal(g.useCard('a',0,0),false,'too far');
  // No aim: at the nearest enemy. A shield stops it.
  b.x=a.x+100;b.y=a.y+100;b.sh=g.t+5000;assert.ok(g.useCard('a',0));assert.equal(b.kb,null,'shield took it');assert.equal(b.sh,0);
});
test('freeze is aimed: a big arrow flies far and freezes the first enemy on its path for 3 s', () => {
  assert.equal(C.SHOT.RANGE,600);assert.equal(C.SHOT.R,40);assert.equal(C.CARD.ICE,3000);
  const g=playing(['a','b','c','d']),[a,b,c,d]=['a','b','c','d'].map(id=>g.players.get(id));
  a.x=200;a.y=60;b.x=a.x+150;b.y=a.y;c.x=a.x+60;c.y=a.y;d.x=a.x+100;d.y=a.y;Object.assign(d,{st:1,until:g.t+C.ANSWER});
  a.cards=['ice'];assert.ok(g.useCard('a',0,0));assert.deepEqual(a.cards,[],'card used');assert.equal(g.shots.length,1);
  run(g,300);
  assert.equal(b.st,2,'enemy on the path is frozen');assert.equal(c.st,0,'passes through a teammate');assert.equal(d.st,1,'passes someone answering');
  assert.ok(Math.abs(b.until-g.t-C.CARD.ICE)<=300,'about 3 s');assert.equal(g.shots.length,0,'arrow gone after hitting');
  run(g,C.CARD.ICE);assert.equal(b.st,0);
  // Far away (550) and a little off the line (35): the big arrow still gets them.
  b.x=a.x+550;b.y=a.y+35;a.cards=['ice'];g.useCard('a',0,0);run(g,700);assert.equal(b.st,2,'far and slightly off the line');run(g,C.CARD.ICE);
  a.cards=['ice'];g.useCard('a',0,Math.PI);run(g,800);assert.equal(b.st,0,'missed');assert.deepEqual(a.cards,[]);assert.equal(g.shots.length,0,'flew its full range and vanished');
  b.x=a.x+C.SHOT.RANGE+60;b.y=a.y;a.cards=['ice'];g.useCard('a',0,0);run(g,900);assert.equal(b.st,0,'too far');
  b.x=a.x+80;b.y=a.y+80;a.cards=['ice'];g.useCard('a',0);run(g,300);assert.equal(b.st,2,'auto-aim');
  const s=H.unpack(JSON.parse(JSON.stringify(g.snapshot())));assert.ok(Array.isArray(s.s)&&Array.isArray(s.z)&&Array.isArray(s.l));
});
test('the slime card is gone: an old one left in a hand is simply dropped', () => {
  const g=playing(['a','b']),a=g.players.get('a');
  assert.ok(!('slow' in H.CARDS));a.cards=['slow'];assert.equal(g.useCard('a',0,0,100),false);assert.deepEqual(a.cards,[]);assert.equal(g.shots.length,0);
});
test('whirlpool: thrown anywhere, 4 s; enemies inside (answering too) are dragged in and walk at half speed; fish bunch up', () => {
  assert.equal(C.WHIRL.LEN,4000);assert.ok(C.WHIRL.R>=70&&C.WHIRL.R<=110,'about a fifth of the lake');
  const g=playing(['a','b','c','d']),[a,b,c,d]=['a','b','c','d'].map(id=>g.players.get(id));
  a.x=200;a.y=60;
  a.cards=['whirl'];assert.ok(g.useCard('a',0,0,300));run(g,C.WHIRL.FLY+40);
  const z=g.zones.find(z=>z.k==='w');assert.ok(z,'landed');assert.ok(Math.abs(z.x-500)<3&&Math.abs(z.y-60)<3,'on the shore, where aimed');
  // b: enemy walking inside; d: enemy answering inside; c: teammate inside.
  b.x=z.x+60;b.y=z.y;d.x=z.x-60;d.y=z.y+10;Object.assign(d,{st:1,until:g.t+C.ANSWER,q:0,qn:1});c.x=z.x;c.y=z.y+50;
  assert.ok(g.slowed('b'));assert.equal(g.slowed('c'),false,'teammates are not slowed');
  const b0=Math.hypot(b.x-z.x,b.y-z.y),d0=Math.hypot(d.x-z.x,d.y-z.y),c0={x:c.x,y:c.y};
  run(g,300);assert.ok(Math.hypot(b.x-z.x,b.y-z.y)<b0-20,'dragged to the middle');assert.ok(Math.hypot(d.x-z.x,d.y-z.y)<d0-20,'answering, still dragged');
  assert.equal(d.st,1,'keeps answering');assert.deepEqual({x:c.x,y:c.y},c0,'teammate not dragged');
  // Walking out: half speed (plus the pull).
  b.x=z.x+80;b.y=z.y;b.dx=1;b.dy=0;const bx=b.x;g.tick(100);assert.ok(b.x-bx<C.SPEED*0.1*C.WHIRL.SLOW+1,'half speed inside');b.dx=0;
  run(g,C.WHIRL.LEN);assert.equal(g.zones.filter(z=>z.k==='w').length,0,'gone after 4 s');assert.equal(g.slowed('b'),false,'no slowing afterwards');
  // A shield takes the whirlpool once: not dragged, not slowed by it.
  b.sh=g.t+9000;a.cards=['whirl'];g.useCard('a',0,0,300);run(g,C.WHIRL.FLY+40);const z2=g.zones.find(z=>z.k==='w');b.x=z2.x+60;b.y=z2.y;
  const bx2=b.x;run(g,300);assert.equal(b.sh,0,'shield used');assert.ok(Math.abs(b.x-bx2)<1,'not dragged');assert.equal(g.slowed('b'),false);
  // Fish inside are pulled into a bunch (and so swim slowly), fish outside are left alone, nothing jumps.
  const W={k:'w',x:600,y:337,from:0,until:C.WHIRL.LEN,team:0},R=C.WHIRL.R;let pulled=0,maxStep=0;
  for(const seedN of [1,2,3,4,5,6,7,8]){const o={id:seedN,k:'n',s:seedN*101,b:0};let prev=null;
    for(let t=900;t<C.WHIRL.LEN+900;t+=10){const n=H.orbPos(o,t),p=H.fishPos(o,t,[W]),dn=Math.hypot(n.x-W.x,n.y-W.y),dp=Math.hypot(p.x-W.x,p.y-W.y);
      if(t>=1000&&t<C.WHIRL.LEN-1000&&dn<R){assert.ok(dp<=dn*(1-C.WHIRL.PULL)+0.5,'pulled in');pulled++;}
      if(dn>=R*C.WHIRL.BAND||t>=C.WHIRL.LEN)assert.deepEqual(p,n,'untouched');
      if(prev)maxStep=Math.max(maxStep,Math.hypot(p.x-prev.x,p.y-prev.y));prev=p;}}
  assert.ok(pulled>20,'some fish swam into it: '+pulled);assert.ok(maxStep<8,'no jumps: '+maxStep.toFixed(1));
  // The phones work out the same drag and the same slow walk from the snapshot.
  b.sh=0;a.cards=['whirl'];g.useCard('a',0,0,300);run(g,C.WHIRL.FLY+40);const s=H.unpack(JSON.parse(JSON.stringify(g.snapshot()))),sz=s.z.find(z=>z.k==='w');
  assert.ok(sz);assert.ok(H.inWhirl(s.z,1,sz.x+30,sz.y,g.t,'b'));assert.equal(H.inWhirl(s.z,0,sz.x+30,sz.y,g.t,'c'),false);
  const m=H.dragWhirl(s.z,1,sz.x+60,sz.y,g.t,100,'b');assert.ok(m&&m.x<sz.x+60,'dragged in');
});
test('bomb fish: a plain fish to the other team; its own team passes through it; an enemy who hooks it is dizzy 2 s', () => {
  const g=playing(['a','b','c']),[a,b,c]=['a','b','c'].map(id=>g.players.get(id));g.orbs=[];
  assert.equal(c.team,a.team);a.x=600;a.y=60;
  a.cards=['bomb'];assert.ok(g.useCard('a',0));const o=g.orbs.find(x=>x.bomb!=null);assert.ok(o,'bomb fish in the lake');assert.equal(o.bomb,a.team);
  const s=H.unpack(JSON.parse(JSON.stringify(g.snapshot()))),so=s.o.find(x=>x.id===o.id);
  assert.equal(so.k,'n','looks like a plain fish');assert.equal(so.bomb,a.team);assert.deepEqual(H.orbPos(so,g.t+500),H.orbPos(o,g.t+500),'phones can follow it');
  for(let t=g.t;t<g.t+15000;t+=500){const p=H.orbPos(o,t),S=C.SEA;assert.ok(((p.x-S.x)/S.rx)**2+((p.y-S.y)/S.ry)**2<1,'stays in the lake');}
  assert.ok(g.fx.some(f=>f.k==='trap'&&f.by==='a'));
  run(g,400);
  // A teammate's line passes through it.
  shoreNear(c,g.orbAt(o));castAt(g,c,g.orbAt(o),o);for(let i=0;i<40;i++)g.tick(33);
  assert.equal(c.st,0);assert.ok(g.orbs.includes(o),'still there');
  // The other team hooks it: boom, dizzy 2 s, can't fish meanwhile.
  shoreNear(b,g.orbAt(o));castAt(g,b,g.orbAt(o),o);for(let i=0;i<30&&b.st!==5;i++)g.tick(33);
  assert.equal(b.st,5,'dizzy');assert.ok(!g.orbs.includes(o),'blown up');assert.ok(Math.abs(b.until-g.t-C.CARD.STUN)<400);
  assert.deepEqual(g.fx.filter(f=>f.k==='bomb').map(f=>[f.by,f.to]),[['a',['b']]]);assert.equal(g.sc[b.team],0,'already 0: stays 0, never negative');
  g.input({k:'fire',id:'b',x:b.x,y:b.y,a:Math.PI/2,t:g.t});assert.equal(g.hooks.filter(h=>h.o==='b').length,0,'no fishing while dizzy');
  run(g,C.CARD.STUN+50);assert.equal(b.st,0);
  // With points: the team that hooks it loses 2.
  run(g,C.CARD.STUN+50);g.sc[b.team]=5;a.cards=['bomb'];g.useCard('a',0);const o3=g.orbs.find(x=>x.bomb!=null);run(g,400);
  shoreNear(b,g.orbAt(o3));castAt(g,b,g.orbAt(o3),o3);for(let i=0;i<30&&b.st!==5;i++)g.tick(33);
  assert.equal(b.st,5);assert.equal(g.sc[b.team],3,'minus 2');assert.equal(g.fx.filter(f=>f.k==='bomb').pop().w,'2');
  run(g,C.CARD.STUN+50);
  // Nobody catches it: gone after 15 s. Never turned into the glowing goldfish.
  a.cards=['bomb'];g.useCard('a',0);const o2=g.orbs.find(x=>x.bomb!=null);g.glowAt=g.t;g.tick(33);assert.notEqual(o2.k,'g');
  run(g,C.BOMB.LEN+100);assert.ok(!g.orbs.includes(o2),'swam away');
});

test('ink covers every enemy phone for 2.5 s, not someone answering; a shield blocks it; inked players can still play', () => {
  const g=playing(['a','b','c','d']),[a,b,c,d]=['a','b','c','d'].map(id=>g.players.get(id));
  Object.assign(d,{st:1,until:g.t+C.ANSWER});
  a.cards=['ink'];assert.ok(g.useCard('a',0));
  assert.ok(Math.abs(b.ink-g.t-C.CARD.INK)<1,'enemy inked 2.5 s');assert.equal(c.ink,0,'not a teammate');assert.equal(d.ink,0,'not someone answering');
  assert.deepEqual(g.fx.filter(f=>f.k==='ink').map(f=>[f.by,f.to]),[['a',['b']]]);
  assert.ok(H.unpack(JSON.parse(JSON.stringify(g.snapshot()))).p.find(p=>p.id==='b').ink>g.t);
  assert.ok(g.input({k:'fire',id:'b',x:b.x,y:b.y,a:Math.PI/2,t:g.t}),'still fishing under the ink');
  run(g,C.CARD.INK+50);assert.equal(H.unpack(JSON.parse(JSON.stringify(g.snapshot()))).p.find(p=>p.id==='b').ink,0,'gone');
  b.sh=g.t+5000;a.cards=['ink'];g.useCard('a',0);assert.ok(!(b.ink>g.t),'shield blocks it');assert.equal(b.sh,0);
});

test('thief glove: steals a card from the nearest enemy, else a point, whatever they are doing; a shield stops it', () => {
  const g=playing(['a','b','c','d']),[a,b,c,d]=['a','b','c','d'].map(id=>g.players.get(id));
  a.x=200;a.y=60;b.x=300;b.y=60;d.x=900;d.y=600;Object.assign(b,{st:1,until:g.t+C.ANSWER,q:0,qn:1});   // b is answering
  b.cards=['ice'];d.cards=['ink'];
  a.cards=['steal'];assert.ok(g.useCard('a',0));
  assert.deepEqual(a.cards,['ice'],'took the nearest enemy\'s card');assert.deepEqual(b.cards,[]);assert.equal(b.st,1,'they keep answering');
  const f=g.fx.filter(x=>x.k==='steal').pop();assert.deepEqual([f.by,f.to,f.w],['a',['b'],'ice']);
  // No cards left on b: the nearest enemy with something to take is d (a card). Then nobody has cards: a point.
  a.cards=['steal'];g.useCard('a',0);assert.deepEqual(a.cards,['ink'],'then the next one with a card');assert.deepEqual(d.cards,[]);
  g.sc=[0,4,0];a.cards=['steal'];g.useCard('a',0);assert.deepEqual(g.sc.slice(0,2),[1,3],'one point moves over');
  assert.equal(g.fx.filter(x=>x.k==='steal').pop().w,'p');
  const s=H.unpack(JSON.parse(JSON.stringify(g.snapshot())));assert.equal(s.fx.filter(x=>x.k==='steal').pop().w,'p');
  // Shield: blocks it (card used, nothing taken).
  b.sh=g.t+5000;b.cards=['x2'];a.cards=['steal'];g.useCard('a',0);assert.deepEqual(b.cards,['x2']);assert.equal(b.sh,0);assert.deepEqual(a.cards,[]);
  assert.equal(g.fx.filter(x=>x.k==='steal').pop().w,'x');
  // Nothing anywhere to take: the card is kept.
  b.cards=[];g.sc=[3,0,0];a.cards=['steal'];assert.equal(g.useCard('a',0),false);assert.deepEqual(a.cards,['steal']);
  // A stolen point can win the game.
  g.target=4;g.sc=[3,2,0];b.cards=[];assert.ok(g.useCard('a',0));assert.equal(g.ph,'end');assert.equal(g.end.win,0);
  assert.equal(c.team,a.team);
});

test('lines pass straight through players (nobody can be hooked)', () => {
  const g=playing(['a','b']),[a,b]=['a','b'].map(id=>g.players.get(id));g.orbs=[];
  a.x=200;a.y=60;b.x=420;b.y=70;b.dx=1;
  assert.ok(g.input({k:'fire',id:'a',x:a.x,y:a.y,a:Math.atan2(b.y-10-a.y,b.x-a.x),t:g.t}));
  for(let i=0;i<30;i++)g.tick(33);
  assert.equal(b.st,0);assert.ok(b.x>420,'kept walking');assert.ok(!g.fx.some(f=>f.k==='grab'));
});

test('double card doubles the next right answer; the glowing goldfish starts a rush where every fish is worth 2', () => {
  const g=playing(['a','b']),a=g.players.get('a');
  a.cards=['x2'];g.useCard('a',0);assert.equal(a.x2,1);
  give(g,a,g.orbs.find(o=>o.k==='n'));wrong(g,a);assert.equal(a.x2,1,'kept after a wrong answer');assert.equal(a.st,2,'wrong answer freezes');
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

test('bots fish for boxes and use all kinds of cards in a full game, and the snapshot stays small', () => {
  const g=game(5,{mode:'time'});for(let i=0;i<20;i++)g.join('bot'+i,'Bot '+i,true);g.start();
  let seen=0;const kinds=new Set();
  for(let t=0;t<C.COUNT+C.LIMIT&&g.ph!=='end';t+=33){g.tick(33);for(const f of g.fx)kinds.add(f.k);
    if(g.t%5000<33){const n=JSON.stringify(g.snapshot()).length;seen=Math.max(seen,n);}}
  for(const k of ['box','up','shoot','throw','x2','trap','ink','steal'])assert.ok(kinds.has(k),'bots did '+k+': '+[...kinds].join(','));
  assert.ok(seen<6500,`snapshot ${seen} bytes`);
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
