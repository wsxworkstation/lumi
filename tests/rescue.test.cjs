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
const right=(g,id)=>{const p=g.players.get(id);return g.input({k:'ans',id,q:p.q,v:qs[p.q].answer});};
const wrong=(g,id)=>{const p=g.players.get(id);return g.input({k:'ans',id,q:p.q,v:[9]});};
// Past the warm-up, with no new crises unless a test adds them.
function calm(g){g.first=true;g.acc=-1e9;run(g,C.WARM-g.ct+50);g.crises=[];}
function walkTo(g,id,room){assert.ok(g.input({k:'go',id,room}));const p=g.players.get(id);run(g,p.walk.t1-g.ct+60);assert.equal(p.room,room);}

test('the quickest way avoids burning rooms, or walks through the smoke', () => {
  assert.deepEqual(R.route(1,5).path.length,3);
  assert.equal(R.route(1,5).ms,2*C.WALK);
  const r=R.route(1,5,new Set([2]));assert.deepEqual(r.path,[1,4,5]);
  const both=R.route(1,5,new Set([2,4]));assert.equal(both.ms,2*C.WALK+C.SMOKE,'no way round: through the fire, slower');
  assert.equal(R.route(1,2,new Set([2])).ms,C.WALK,'walking into a burning room (to fight it) costs nothing extra');
  const w=R.plan(1,5,new Set([2,4]),1000);assert.equal(w.t1,1000+2*C.WALK+C.SMOKE);
  assert.deepEqual(R.walkAt(w,1000+C.WALK+100),{a:w.segs[0][1],b:w.segs[0][1],k:0},'waiting in the smoke');
});

test('a right answer gives a cell; a wrong one waits 4 s and the question comes back after three others', () => {
  const g=started();const p=g.players.get('s0');
  const q0=p.q;assert.ok(right(g,'s0'));assert.equal(p.e2,2);assert.equal(p.rk,1);assert.notEqual(p.q,q0);
  const q1=p.q;assert.ok(wrong(g,'s0'));assert.equal(p.rk,0);assert.equal(p.e2,2);
  assert.equal(right(g,'s0'),null,'no answering during the 4 s wait');
  run(g,C.COOL);
  const seen=[];for(let i=0;i<4;i++){seen.push(p.q);right(g,'s0');if(p.e2>=C.E_MAX){p.e2=0;}}
  assert.equal(seen.indexOf(q1),3,'the wrong question is the fourth one after');
  assert.equal(p.st.first.get(q1),false);assert.ok(p.st.fixed.has(q1),'right the second time counts as fixed');
  assert.equal(g.qStat[q1].firstWrong,1);
});

test('energy: at most 3 cells; low oxygen gives half a cell', () => {
  const g=started();const p=g.players.get('s0');
  for(let i=0;i<3;i++)assert.ok(right(g,'s0'));
  assert.equal(p.e2,C.E_MAX);assert.equal(right(g,'s0'),null,'full: no more answers until it is used');
  p.e2=0;g.o2=C.O2.LOW-1;right(g,'s0');assert.equal(p.e2,1);
  walkTo(g,'s0',C.OXYGEN);assert.equal(g.input({k:'put',id:'s0',task:'o2'}),null,'half a cell is not enough to put in');
});

test('walking takes time; energy only goes into the room you are standing in', () => {
  const g=started();const p=g.players.get('s0');right(g,'s0');right(g,'s0');
  assert.ok(g.input({k:'go',id:'s0',room:C.OXYGEN}));
  assert.equal(g.input({k:'go',id:'s0',room:C.ENGINE}),null,'one walk at a time');
  assert.equal(g.input({k:'put',id:'s0',task:'o2'}),null,'not there yet');
  run(g,p.walk.t1-g.ct+60);assert.equal(p.room,C.OXYGEN);
  g.o2=50;assert.ok(g.input({k:'put',id:'s0',task:'o2'}));assert.equal(g.o2,50+C.O2.CELL);assert.equal(p.e2,2);
  assert.equal(g.input({k:'put',id:'s0',task:'engine'}),null,'the engine is in another room');
  walkTo(g,'s0',C.ENGINE);assert.equal(g.input({k:'put',id:'s0',task:'engine'}),null,'the engine is still warming up');
  calm(g);const e=g.eng;assert.ok(g.input({k:'put',id:'s0',task:'engine'}));assert.ok(g.eng>e);
});

test('a fire spreads to a neighbour after 30 s, blocks its machine, and goes out when filled', () => {
  const g=started();calm(g);
  g.crises.push({id:999,k:'f',room:C.ENGINE,got:0,need:2,t0:g.ct,t1:g.ct+C.FIRE.SPREAD});
  const p=g.players.get('s0');p.e2=C.E_MAX;
  walkTo(g,'s0',C.ENGINE);
  assert.equal(g.input({k:'put',id:'s0',task:'engine'}),null,'put the fire out first');
  const hull=g.hull;run(g,C.FIRE.SPREAD-g.ct+g.crises[0].t0+100);
  const fires=g.crises.filter(c=>c.k==='f');assert.ok(fires.length>=2,'spread');
  assert.ok(R.NB[C.ENGINE].includes(fires.find(f=>f.room!==C.ENGINE).room),'to a neighbouring room');
  assert.ok(g.hull<hull,'fires wear the hull down');
  assert.ok(g.input({k:'put',id:'s0',task:'fire'}));assert.ok(g.input({k:'put',id:'s0',task:'fire'}));
  assert.ok(!g.crises.some(c=>c.k==='f'&&c.room===C.ENGINE),'out');assert.equal(g.tally.out,1);
  assert.ok(g.input({k:'put',id:'s0',task:'engine'}),'the engine works again');
});

test('a meteor not shielded in time hits: hull -20 and a fire; a shielded one is blocked', () => {
  const g=started(2);g.crises=[];g.first=true;g.last=g.ct;g.acc=-1e9;
  g.crises.push({id:500,k:'m',room:5,got:0,need:3,t0:g.ct,t1:g.ct+5000});
  run(g,5100);
  assert.equal(g.hull<=100-C.METEOR.HIT+0.01,true);assert.ok(g.crises.some(c=>c.k==='f'&&c.room===5),'the hit starts a fire');assert.equal(g.tally.hits,1);
  g.crises=[];g.crises.push({id:501,k:'m',room:C.START,got:0,need:2,t0:g.ct,t1:g.ct+20000});
  const a=g.players.get('s0'),b=g.players.get('s1');a.e2=2;b.e2=2;
  assert.ok(g.input({k:'put',id:'s0',task:'shield'}));assert.ok(g.input({k:'put',id:'s1',task:'shield'}));
  assert.ok(!g.crises.some(c=>c.k==='m'),'blocked');assert.equal(g.tally.blocked,1);assert.ok(g.fx.some(f=>f.k==='block'));
});

test('the director sizes crises to how fast the class earns energy', () => {
  const small=started(2,3),big=started(24,3);
  // both classes answer at the same pace during the warm-up (one right answer each)
  for(const g of [small,big]){run(g,20000);for(const p of g.players.values())right(g,p.id);run(g,C.WARM-20000+500);}
  const need=g=>g.crises.find(c=>c.k==='m')?.need;
  assert.ok(need(small)>=2&&need(big)>need(small),`bigger class, bigger meteor (${need(small)} vs ${need(big)})`);
  // a class answering fast: the estimate follows the real rate
  const g=started(10,5);for(let s=0;s<6;s++){for(const p of g.players.values()){right(g,p.id);p.e2=0;}run(g,10000);}
  assert.ok(g.rate()>40,`rate follows the answers (${g.rate().toFixed(1)})`);
});

test('the warm-up has no crises, then the first meteor arrives', () => {
  const g=started(3);run(g,C.WARM-1000);assert.equal(g.crises.length,0);assert.ok(g.o2<100,'only the oxygen falls');
  run(g,1500);assert.equal(g.crises.filter(c=>c.k==='m').length,1);
});

test('the engine reaching 60% brings the vote; more votes win, a tie fights on', () => {
  const g=started(3);run(g,C.TWIST_MIN);g.eng=C.TWIST_AT;run(g,100);assert.equal(g.ph,'vote');
  g.input({k:'vote',id:'s0',v:'e'});g.input({k:'vote',id:'s1',v:'e'});g.input({k:'vote',id:'s2',v:'f'});
  assert.deepEqual(g.votes(),[1,2]);run(g,C.VOTE+100);assert.equal(g.ph,'final');assert.equal(g.mode,'escape');
  assert.ok(!g.crises.some(c=>c.k==='m'),'no more meteors when leaving');
  const t=started(2);run(t,C.TWIST_MIN);t.eng=70;run(t,100);t.input({k:'vote',id:'s0',v:'e'});t.input({k:'vote',id:'s1',v:'f'});run(t,C.VOTE+100);
  assert.equal(t.mode,'fight');
  const late=started(1);late.eng=10;late.first=true;late.acc=-1e9;run(late,C.LEN.std+100);   // (no crises: nothing hits the station)assert.equal(late.ph,'vote','at the latest by the length chosen');
});

test('fighting on: the engine counts extra; 100% saves the station (3 stars), running out of time means an emergency escape', () => {
  const g=started(1);g.final('fight');const p=g.players.get('s0');walkTo(g,'s0',C.ENGINE);
  p.e2=2;const per=100/g.engTotal();g.input({k:'put',id:'s0',task:'engine'});assert.ok(Math.abs(g.eng-per*C.BOOST)<0.6);
  g.eng=99.9;p.e2=2;g.input({k:'put',id:'s0',task:'engine'});run(g,100);
  assert.equal(g.ph,'end');assert.equal(g.end.outcome,'saved');assert.equal(g.end.stars,3);
  const h=started(1);h.final('fight');run(h,C.FIGHT+100);assert.equal(h.mode,'emerg');assert.equal(h.ph,'final');
});

test('escape pod: walk there with 2 cells to board; everyone aboard ends the game with 2 stars', () => {
  const g=started(2);g.crises=[];g.final('escape');
  for(const id of ['s0','s1']){const p=g.players.get(id);p.e2=4;walkTo(g,id,C.POD);}
  const a=g.players.get('s0');a.e2=2;assert.equal(g.input({k:'put',id:'s0',task:'board'}),null,'needs 2 cells');
  a.e2=4;assert.ok(g.input({k:'put',id:'s0',task:'board'}));assert.ok(a.pod);assert.equal(g.input({k:'go',id:'s0',room:1}),null,'aboard: stays');
  assert.equal(g.input({k:'put',id:'s0',task:'engine'}),null);
  g.input({k:'put',id:'s1',task:'board'});run(g,100);
  assert.equal(g.ph,'end');assert.equal(g.end.outcome,'escape');assert.equal(g.end.stars,2);assert.ok(g.end.everyone);
  // the pod has its own air: while leaving, the oxygen stops falling and a right answer is a whole cell again
  const air=started(1);air.final('escape');air.o2=10;run(air,5000);assert.equal(air.o2,10);
  const ap=air.players.get('s0');ap.e2=0;right(air,'s0');assert.equal(ap.e2,2);
  // a fire in the pod room must be put out first
  const f=started(1);f.final('emerg');f.crises.push({id:77,k:'f',room:C.POD,got:0,need:1,t0:f.ct,t1:f.ct+30000});
  const p=f.players.get('s0');p.e2=4;walkTo(f,'s0',C.POD);assert.equal(f.input({k:'put',id:'s0',task:'board'}),null);
  assert.ok(f.input({k:'put',id:'s0',task:'fire'}));assert.ok(f.input({k:'put',id:'s0',task:'board'}),'emergency boarding needs 1 cell');
});

test('results: first-try, total right, fixed, still wrong, energy; the hardest questions', () => {
  const g=started(2);const a=g.players.get('s0');
  const q=a.q;wrong(g,'s0');run(g,C.COOL);right(g,'s0');right(g,'s0');
  right(g,'s1');wrong(g,'s1');
  g.stop();assert.equal(g.ph,'end');
  const ra=g.end.players.find(p=>p.id==='s0');
  assert.equal(ra.firstN,3);assert.equal(ra.firstOk,2);assert.equal(ra.right,2);assert.equal(ra.wrong,1);assert.deepEqual(ra.still,[q]);
  assert.ok(g.end.hard.length>=1);assert.ok(g.end.hard[0].wrong>=1);
  const tsv=R.resultTable(g.end);assert.match(tsv.split('\n')[0],/第一次就答对/);assert.equal(tsv.split('\n').length,3);
});

test('snapshots pack and unpack; joining later, leaving and coming back', () => {
  const g=started(1);g.input({k:'join',id:'late',name:'Late',av:3,dev:'d1'});
  const late=g.players.get('late');assert.equal(late.room,C.START);assert.ok(late.q>=0,'gets a question right away');
  assert.ok(g.input({k:'go',id:'late',room:5}));
  const s=R.unpack(JSON.parse(JSON.stringify(g.snapshot())));
  const p=s.p.find(x=>x.id==='late');assert.equal(p.name,'Late');assert.equal(p.av,3);assert.equal(p.dev,'d1');assert.equal(p.walk.to,5);assert.ok(p.walk.segs.length>=1);
  clock+=C.AWAY+1000;g.sweep();assert.ok(g.players.get('s0').away,'silent 10 s: away (kept in a game)');
  g.input({k:'hi',id:'s0'});assert.ok(!g.players.get('s0').away);
  g.kick('late');assert.ok(R.unpack(g.snapshot()).k.includes('late'));
});

test('robots play a whole game to the end without getting stuck', () => {
  for(const seed of [1,2,3]){
    const g=R.createGame({rng:R.rng(seed),check:Q.check,now:()=>clock});g.setQuestions(qs);g.len='short';
    for(let i=0;i<12;i++)g.join('b'+i,'Bot '+i,i%10,{bot:true});
    g.start();run(g,15*60000,100);
    assert.equal(g.ph,'end',`seed ${seed} ended`);
    assert.ok(['saved','escape','emerg'].includes(g.end.outcome));
    assert.ok(g.end.tally.right>20,'they answered');
    assert.ok(g.end.players.every(p=>p.energy>=0));
  }
});

test('pages: version meta, every script with ?v=__V__, the deploy stamps them, the QR points to the game', () => {
  const dir=path.join(__dirname,'../dist/rescue');
  for(const f of ['index.html','host.html']){
    const html=fs.readFileSync(path.join(dir,f),'utf8');
    assert.match(html,/<meta name="rescue-version" content="__V__">/);
    for(const m of html.matchAll(/(?:src|href)="(\.{1,2}\/[^"]+\.(?:js|css))([^"]*)"/g))assert.equal(m[2],'?v=__V__',`${f}: ${m[1]}`);
    for(const m of html.matchAll(/src="\.\/([^"?]+)/g))assert.ok(fs.existsSync(path.join(dir,m[1])),`${f}: ${m[1]} exists`);
  }
  const wf=fs.readFileSync(path.join(__dirname,'../.github/workflows/pages.yml'),'utf8');
  assert.ok(wf.includes('dist/rescue/index.html')&&wf.includes('dist/rescue/host.html'));
  assert.ok(fs.existsSync(path.join(__dirname,'../dist/assets/lumi-rescue-qr.png')));
  for(let i=0;i<R.ANIMALS.length;i++)assert.ok(fs.existsSync(path.join(dir,R.avatarSrc(i))),'animal picture '+i);
});
