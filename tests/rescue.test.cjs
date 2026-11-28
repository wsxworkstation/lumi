const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('../dist/rescue/engine.js');
const Q=require('../dist/quiz-import.js');
const {C}=R;

const qs=Array.from({length:8},(_,i)=>({no:i+1,text:`Q${i+1}`,type:'mc',options:['a','b','c','d'],answer:[1+(i%4)]}));
let clock=0;
function game(seed=7){const g=R.createGame({rng:R.rng(seed),check:Q.check,now:()=>clock});g.setQuestions(qs);return g;}
function run(g,ms,step=50){for(let t=0;t<ms&&g.ph!=='end';t+=step)g.tick(step);}
function started(n=1,seed){const g=game(seed);for(let i=0;i<n;i++)g.join('s'+i,'S'+i);g.start();run(g,C.COUNT+10);assert.equal(g.ph,'play');return g;}
// no meteors unless a test adds them
function calm(g){g.last=1e12;g.acc=-1e9;g.ms=[];}
const right=(g,id)=>{const p=g.players.get(id);return g.input({k:'ans',id,q:p.q,v:qs[p.q].answer});};
const wrong=(g,id)=>{const p=g.players.get(id);return g.input({k:'ans',id,q:p.q,v:[9]});};
// a meteor that drifts slowly straight down above x
function rock(g,k,x,y=150,hp){const m=g.spawn(k);Object.assign(m,{x0:x,y0:y,x1:x,y1:R.ringY(x),t0:g.ct,t1:g.ct+60000,s:0.25});if(hp)m.hp=m.max=hp;return m;}
function shootAt(g,id,m){const T=g.turret(id),a=R.lead(R.muzzle(T,-Math.PI/2),m,g.ct);return g.input({k:'fire',id,a,t:g.ct,n:1});}

test('the ring and the turrets: everyone stands on the ring, aims only upwards', () => {
  assert.equal(R.ringY(600),C.RING.y-C.RING.ry);
  for(const n of [1,2,12,40])for(let i=0;i<n;i++){const T=R.turretAt(i,n);assert.ok(T.x>=100&&T.x<=1100);assert.ok(Math.abs(T.y-(R.ringY(T.x)-8))<1e-9);assert.ok(T.y<C.H);}
  for(const a of [0.5,2,-0.01,-3.1,Math.PI])assert.ok(R.aimLimit(a)<0,'upwards');
});

test('meteors follow a fixed path from where they start to a point on the ring', () => {
  const m={k:'s',x0:300,y0:-60,x1:500,y1:R.ringY(500),t0:1000,t1:11000,s:0.3};
  assert.deepEqual([R.mPos(m,1000).x,R.mPos(m,1000).y],[300,-60]);
  const end=R.mPos(m,11000);assert.ok(Math.abs(end.x-500)<1e-6&&Math.abs(end.y-m.y1)<1e-6);
  assert.deepEqual(R.mPos(m,5432),R.mPos({...m},5432));
  assert.deepEqual(R.shape({id:1,k:'s',s:0.3}),R.shape({id:9,k:'s',s:0.3}),'the same outline on every screen');
});

test('aiming at a meteor hits it; one hit breaks a small one', () => {
  const g=started(1);calm(g);const p=g.players.get('s0'),m=rock(g,'s',600,200);
  assert.ok(shootAt(g,'s0',m));assert.equal(p.ammo,C.AMMO.START-1);
  run(g,800);
  assert.ok(!g.ms.includes(m),'broken');assert.equal(p.hits,1);assert.equal(p.kills,1);assert.equal(g.tally.kills,1);
  assert.ok(g.fx.some(f=>f.k==='boom'&&f.by==='s0'));
  // a shot into empty space hits nothing
  g.input({k:'fire',id:'s0',a:-0.3,t:g.ct,n:2});run(g,1600);assert.equal(p.hits,1);assert.equal(p.shots,2);
});

test('bullets: 5 to start, a short wait between shots, none when empty; answers reload (+5, +2 more every 3 right in a row, at most 15)', () => {
  const g=started(1);calm(g);const p=g.players.get('s0');assert.equal(p.ammo,C.AMMO.START);
  let n=0;assert.ok(g.input({k:'fire',id:'s0',a:-1.5,t:g.ct,n:++n}));
  assert.equal(g.input({k:'fire',id:'s0',a:-1.5,t:g.ct,n:++n}),null,'too soon');
  for(let i=1;i<C.AMMO.START;i++){run(g,C.SHOT.COOL);assert.ok(g.input({k:'fire',id:'s0',a:-1.5,t:g.ct,n:++n}));}
  run(g,C.SHOT.COOL);assert.equal(p.ammo,0);assert.equal(g.input({k:'fire',id:'s0',a:-1.5,t:g.ct,n:++n}),null,'empty');
  assert.equal(p.ln,n,'the phone learns which shots were seen');
  right(g,'s0');assert.equal(p.ammo,5);right(g,'s0');assert.equal(p.ammo,10);right(g,'s0');assert.equal(p.ammo,C.AMMO.MAX,'5 + 5 + 7, the third in a row gives 2 more (capped at 15)');
  assert.equal(right(g,'s0'),null,'full: no answering until some are used');
});

test('a wrong answer waits 4 s and the question comes back after three others; first try and fixed are counted', () => {
  const g=started();calm(g);const p=g.players.get('s0');p.ammo=0;
  const q1=p.q;assert.ok(wrong(g,'s0'));assert.equal(p.rk,0);assert.equal(p.ammo,0);assert.equal(p.streak,0);
  assert.equal(right(g,'s0'),null,'no answering during the wait');
  run(g,C.COOL);
  const seen=[];for(let i=0;i<4;i++){seen.push(p.q);right(g,'s0');p.ammo=0;}
  assert.equal(seen.indexOf(q1),3,'the wrong question is the fourth one after');
  assert.equal(p.st.first.get(q1),false);assert.ok(p.st.fixed.has(q1));assert.equal(g.qStat[q1].firstWrong,1);
});

test('a big meteor needs many hits and breaks into two small ones; a golden one gives everyone 2 bullets', () => {
  const g=started(3);calm(g);for(const p of g.players.values())p.ammo=9;
  const big=rock(g,'l',600,180,4);
  for(let i=0;i<4;i++){const id='s'+(i%3);shootAt(g,id,big);run(g,C.SHOT.COOL+10);}
  run(g,600);assert.ok(!g.ms.includes(big));assert.equal(g.ms.filter(m=>m.k==='f').length,2,'two fragments');
  g.ms=[];for(const p of g.players.values())p.ammo=1;
  const gold=rock(g,'g',600,200);shootAt(g,'s0',gold);run(g,C.SHOT.COOL+10);shootAt(g,'s1',gold);run(g,600);
  assert.ok(!g.ms.includes(gold));assert.equal(g.players.get('s2').ammo,1+C.AMMO.GOLD);assert.ok(g.fx.some(f=>f.k==='gold'));
});

test('a meteor reaching the ring costs shield; a golden one just flies past; no shield left ends the game', () => {
  const g=started(1);calm(g);
  const m=g.spawn('m');m.t1=g.ct+100;run(g,200);assert.equal(g.hull,100-C.KIND.m.dmg);assert.ok(g.fx.some(f=>f.k==='ring'));
  const gold=g.spawn('g');gold.t1=g.ct+100;run(g,200);assert.equal(g.hull,100-C.KIND.m.dmg);
  g.hull=5;const s=g.spawn('s');s.t1=g.ct+100;run(g,200);assert.equal(g.ph,'end');assert.equal(g.end.outcome,'lost');assert.equal(g.end.stars,0);
});

test('the first 15 s are practice (a few slow small ones); then the director sends more to a bigger class, to a class with bullets to spare, less when the ring is hurt', () => {
  const g=started(3);run(g,C.WARM-500);
  assert.ok(g.ms.length>=1&&g.ms.every(m=>m.k==='s'));assert.ok(g.ms.every(m=>m.t1-m.t0>C.KIND.s.T[0]),'slower');
  // (nobody shoots here and the sky is cleared every 10 s, so only what the director sends is counted)
  const sent=(n,ammo,hurt)=>{const h=started(n,5);run(h,C.WARM);let hp=0,hull=1e6;
    for(let s=0;s<12;s++){for(const p of h.players.values())p.ammo=ammo;if(hurt)hull-=12;h.hull=hull;
      const before=new Set(h.ms.map(m=>m.id));run(h,10000);for(const m of h.ms)if(!before.has(m.id))hp+=m.max;h.ms=[];h.hull=hull;}
    return [hp,h.D];};
  const [small]=sent(3,2),[big,D]=sent(20,2),[spare,D2]=sent(20,8),[hurt,D3]=sent(20,2,true);
  assert.ok(big>small*3,`bigger class, more meteors (${small} → ${big})`);
  assert.ok(spare>big&&D2>D,`bullets to spare, more meteors (${big} → ${spare})`);
  assert.ok(hurt<big&&D3<D,`ring hurt, fewer meteors (${big} → ${hurt})`);
});

test('the Meteor King: a warning, then a huge meteor; break it to win (stars by shield left), let it reach the ring and the line falls', () => {
  const g=started(4);calm(g);g.ct=C.LEN[g.len]-10;run(g,100);assert.equal(g.stage,'warn');assert.ok(g.fx.some(f=>f.k==='warn'));
  run(g,C.BOSS.WARN+50);assert.equal(g.stage,'boss');const B=g.boss;assert.ok(B&&B.k==='b'&&B.max>=15);
  run(g,C.BOSS.SPIT+100);assert.ok(g.ms.some(m=>m.k==='f'),'it throws small pieces');
  g.hull=70;B.hp=1;for(const p of g.players.values())p.ammo=3;
  for(let i=0;i<4&&g.ph==='play';i++){shootAt(g,'s'+i,B);run(g,300);}
  assert.equal(g.ph,'end');assert.equal(g.end.outcome,'win');assert.equal(g.end.stars,3);assert.ok(g.end.finisher);
  const h=started(2);calm(h);h.ct=C.LEN[h.len]-10;run(h,C.BOSS.WARN+300);h.boss.t1=h.ct+100;run(h,300);
  assert.equal(h.end.outcome,'breach');assert.equal(h.end.stars,0);assert.equal(h.end.bossLeft,100);
  const k=started(2);calm(k);k.ct=C.LEN.std-10;run(k,C.BOSS.WARN+300);k.hull=30;k.boss.hp=1;k.players.get('s0').ammo=3;shootAt(k,'s0',k.boss);run(k,1000);
  assert.equal(k.end.stars,2,'shield 30%: two stars');
});

test('results: first-try, right, fixed, still wrong, shots, hits; the hardest questions; a table for Excel', () => {
  const g=started(2);calm(g);const a=g.players.get('s0');a.ammo=0;
  const q=a.q;wrong(g,'s0');run(g,C.COOL);right(g,'s0');right(g,'s0');
  const b=g.players.get('s1');b.ammo=0;right(g,'s1');wrong(g,'s1');
  const m=rock(g,'s',600,200);shootAt(g,'s0',m);run(g,800);
  g.stop();assert.equal(g.ph,'end');
  const ra=g.end.players.find(p=>p.id==='s0');
  assert.equal(ra.firstN,3);assert.equal(ra.firstOk,2);assert.equal(ra.right,2);assert.equal(ra.wrong,1);assert.deepEqual(ra.still,[q]);assert.equal(ra.shots,1);assert.equal(ra.hits,1);
  assert.ok(g.end.hard.length>=1);
  const tsv=R.resultTable(g.end).split('\n');assert.match(tsv[0],/第一次就答对/);assert.match(tsv[0],/命中/);assert.equal(tsv.length,3);
});

test('snapshots pack and unpack; joining late, leaving and coming back; removing a student', () => {
  const g=started(1);g.input({k:'join',id:'late',name:'Late',dev:'d1'});
  const late=g.players.get('late');assert.equal(late.ammo,C.AMMO.START);assert.ok(late.q>=0);
  const m=rock(g,'m',500,200);g.input({k:'fire',id:'late',a:-1.2,t:g.ct,n:7});
  const s=R.unpack(JSON.parse(JSON.stringify(g.snapshot())));
  const p=s.p.find(x=>x.id==='late');assert.equal(p.name,'Late');assert.equal(p.dev,'d1');assert.equal(p.ln,7);assert.equal(p.ammo,C.AMMO.START-1);
  assert.ok(s.m.some(x=>x.id===m.id&&x.k==='m'&&x.hp===3));assert.ok(s.b.some(b=>b.by==='late'));
  assert.deepEqual([...s.p].sort((a,b)=>a.seq-b.seq).map(x=>x.id),['s0','late'],'turrets in joining order');
  clock+=C.AWAY+1000;g.sweep();assert.ok(g.players.get('s0').away);g.input({k:'hi',id:'s0'});assert.ok(!g.players.get('s0').away);
  g.kick('late');assert.ok(R.unpack(g.snapshot()).k.includes('late'));
});

test('robots play whole games to the end', () => {
  const ends=[];
  for(const seed of [1,2,3,4]){
    const g=R.createGame({rng:R.rng(seed),check:Q.check,now:()=>clock});g.setQuestions(qs);g.len='short';
    for(let i=0;i<10;i++)g.join('b'+i,'Bot '+i,{bot:true});
    g.start();run(g,12*60000,50);
    assert.equal(g.ph,'end',`seed ${seed} ended`);ends.push(g.end.outcome);
    assert.ok(g.end.tally.shots>50&&g.end.tally.hits>20&&g.end.tally.right>10,'they shot, hit and answered');
  }
  assert.ok(ends.every(o=>['win','breach','lost'].includes(o)));
});

test('pages: version meta, every script with ?v=__V__, the deploy stamps them, the QR points to the game', () => {
  const dir=path.join(__dirname,'../dist/rescue');
  for(const f of ['index.html','host.html']){
    const html=fs.readFileSync(path.join(dir,f),'utf8');
    assert.match(html,/<meta name="rescue-version" content="__V__">/);
    assert.ok(html.includes('./stage.js?v=__V__'),`${f} draws with stage.js`);
    for(const m of html.matchAll(/(?:src|href)="(\.{1,2}\/[^"]+\.(?:js|css))([^"]*)"/g))assert.equal(m[2],'?v=__V__',`${f}: ${m[1]}`);
    for(const m of html.matchAll(/src="\.\/([^"?]+)/g))assert.ok(fs.existsSync(path.join(dir,m[1])),`${f}: ${m[1]} exists`);
  }
  const wf=fs.readFileSync(path.join(__dirname,'../.github/workflows/pages.yml'),'utf8');
  assert.ok(wf.includes('dist/rescue/index.html')&&wf.includes('dist/rescue/host.html'));
  assert.ok(fs.existsSync(path.join(__dirname,'../dist/assets/lumi-rescue-qr.png')));
});
