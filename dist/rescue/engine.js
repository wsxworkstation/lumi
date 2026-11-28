/* 星环防线 STAR RING — the rules, shared by the teacher's console (host.js) and the students' phones (player.js).
   The whole class defends one base: a glowing ring along the bottom of the screen, with one health bar. Every student
   is a turret on the ring. Enemies come down; students drag to aim and release to shoot. Out of bullets → answer a
   question: right = 3 bullets (no time limit, so maths questions are fine).
   Three waves, then the Meteor King. Wave 1: meteors of three levels (pink 1 hit, orange 3, red many) and split
   meteors (break into three small ones). Wave 2 adds rage meteors (the first hit makes them rush), bomb meteors (blow
   up what is near them) and UFOs (they stop, lock onto the ring and fire a laser at the base). Wave 3 adds big red
   meteors and an alien fleet that sways down dropping bombs. Golden meteors give everyone bullets. If the base's
   health runs out the game is lost; the Meteor King must be broken before it reaches the ring.
   The teacher's computer is the referee: it runs createGame, checks every answer (phones never get the answers) and
   decides every hit. Every enemy follows a path worked out from its start (ePos), so phones draw them smoothly
   between snapshots (no network per frame). A "director" keeps every class busy (see DIRECTOR). */
(root=>{
  'use strict';
  const W=1200,H=675,TAU=Math.PI*2;
  // The ring (the base): the top of a wide ellipse along the bottom of the screen.
  const RING={x:600,y:780,rx:640,ry:190};
  const ringY=x=>{const k=(x-RING.x)/RING.rx;return k*k>=1?H+60:RING.y-RING.ry*Math.sqrt(1-k*k);};
  const C={W,H,RING,
    // 3 bullets a right answer (+1 more on every third right in a row), at most 9. (5 a question was too easy.)
    AMMO:{START:3,ANSWER:3,MAX:9,STREAK:3,BONUS:1,GOLD:2},
    SHOT:{SPEED:950,R:5,LIFE:1500,COOL:250},
    COOL:4000,COUNT:3000,AWAY:10000,MAX_PLAYERS:40,
    WARM:15000,                                       // the first 15 s: a few slow small meteors to learn aiming
    LEN:{short:180000,std:300000,long:420000},        // then the Meteor King
    DIFF:{easy:0.7,std:1,hard:1.35},                  // the teacher's difficulty: how hard the director pushes, UFOs, fleets, the King
    WAVES:[0,0.3,0.62],                               // wave 2 starts at 30 % of that time, wave 3 at 62 %
    // What each wave sends (weights): s level 1 · m level 2 · l level 3 · p split · r rage · x bomb · g golden
    MIX:[{s:50,m:28,p:17,g:5},{s:28,m:22,p:12,r:16,x:12,g:5},{s:20,m:20,l:10,p:12,r:14,x:12,g:5}],
    COST:{s:1,m:3,p:4,r:2,x:2,g:1},                   // in hits (a split one counts its three pieces); level 3: its own hits
    // the Meteor King's hits: 0.8 × the class's hits in the last minute + 1.5 a student. It throws meteors every 5 s.
    BOSS:{WARN:4000,T:80000,SPIT:5000,DMG:60,RATE:0.8,PER:1.5},
    // D: hits' worth of meteors per student per minute, checked every 5 s against the last 20 s: the base lost over HURT % → ×EASE,
    // over OK % → ×LESS; otherwise the class holds over 45 % of the bullet limit each → ×MORE; the base wasn't touched → ×CALM; over 28 % → ×LITTLE.
    // So every class gets close calls: it settles where the base takes a small hit now and then (about 1–3 % every 20 s).
    // (Counting only the bullets earned doesn't work: with an empty sky nobody needs to answer, so fewer meteors come and the sky empties.)
    DIRECTOR:{START:1.5,MIN:0.4,MAX:9,MORE:1.08,CALM:1.04,LITTLE:1.02,EASE:0.85,LESS:0.93,HURT:6,OK:3},
    // r radius, hp hits to break (0: worked out from the class), T how long it takes to reach the ring, dmg to the base
    KIND:{
      s:{r:16,hp:1,T:[15000,19000],dmg:4,pts:1},     // level 1, pink
      m:{r:25,hp:3,T:[18000,23000],dmg:8,pts:3},     // level 2, orange
      l:{r:42,hp:0,T:[23000,28000],dmg:18,pts:8},    // level 3, red (hits from the class size; breaks into two small ones)
      p:{r:23,hp:2,T:[16000,20000],dmg:6,pts:3},     // split, purple: breaks into three small fast ones
      r:{r:21,hp:2,T:[17000,21000],dmg:8,pts:3},     // rage, dark red: the first hit makes it rush at the ring
      x:{r:23,hp:2,T:[17000,21000],dmg:10,pts:3},    // bomb, yellow stripes: blows up everything near it
      g:{r:19,hp:2,T:[11000,13000],dmg:0,pts:2},     // golden: everyone gets bullets; flies past if missed
      f:{r:11,hp:1,T:[6500,8500],dmg:3,pts:1},       // a piece of a broken one
      d:{r:8,hp:1,T:[0,0],dmg:2,pts:1},              // an alien's bomb, falling straight down
      u:{r:26,hp:3,T:[0,0],dmg:0,pts:5},             // UFO
      a:{r:17,hp:2,T:[0,0],dmg:8,pts:2},             // alien
      b:{r:95,hp:0,T:[80000,80000],dmg:60,pts:30}},  // the Meteor King
    RAGE:0.35,                                       // hit once, a rage meteor covers the rest of its way in 35 % of the time
    BLAST:{R:150,DMG:2},                             // a bomb meteor's blast: 2 hits to everything within 150
    // UFO: flies in, stops 3 times; at each stop it locks onto the ring for 2 s, then fires (DMG to the base) unless broken
    // (UFOs and fleets come more often when the class is doing well and less when it struggles: EVERY × START/D, 0.7–2.5 times)
    UFO:{TRAVEL:2600,HOVER:3000,STOPS:3,DMG:3,EVERY:[0,24000,18000],MAX:[0,1,2]},
    // alien fleet (wave 3): sways down DOWN px/s; one of them drops a bomb every ~DROP ms; reaching the ring costs 8 each
    FLEET:{EVERY:32000,DROP:3500,DOWN:14,SWAY:150,PERIOD:9000,BOMB:170},
    MAXM:22,GAP:800,GOLD_GAP:25000,FLOOR:2,FLOOR_GAP:1400,   // at least 2 (+1 per 3 students) things in the sky
    COLORS:['#2ef2ff','#ff3df0','#a6ff3d','#ffe53d','#ff8a3d','#9d7bff','#ff5c8a','#3dffb5','#3d8bff','#ff6b6b','#e8f1ff','#ffc83d'],
    BOT:[8000,14000]                                   // a robot answers in 8–22 s (about a student's pace)
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  /* Room numbers count up from 0001: the smallest one nobody is using. */
  function pickRoom(used){for(let n=1;n<10000;n++){const c=String(n).padStart(4,'0');if(!used.has(c))return c;}return '0001';}

  /* ── Paths ── A meteor flies from (x0,y0) to a point on the ring, swaying a little (golden ones a lot). A rage meteor that
     was hit at rt (at rk of its way) covers the rest by its new t1. */
  const SWAY={g:70,b:40,l:12,d:0,f:14,p:18};
  function mPos(m,t){
    let k;if(m.rt&&t>=m.rt)k=m.rk+(t-m.rt)/Math.max(1,m.t1-m.rt)*(1-m.rk);else k=(t-m.t0)/Math.max(1,(m.to||m.t1)-m.t0);
    k=clamp(k,0,1);const dx=m.x1-m.x0,dy=m.y1-m.y0,len=Math.hypot(dx,dy)||1,A=SWAY[m.k]??22;
    const w=Math.sin(k*Math.PI*(m.k==='g'?3:1.6)+m.s*6.283)*A*Math.sin(k*Math.PI);
    return {x:m.x0+dx*k-dy/len*w,y:m.y0+dy*k+dx/len*w,k};
  }
  /* A UFO: flies in, stops at each of its stops ([x, y, where on the ring it aims]), hovers there charging, flies out. */
  const ease=k=>k*k*(3-2*k);
  function uState(u,t){
    const T=C.UFO.TRAVEL,Hv=C.UFO.HOVER,e=t-u.t0,n=u.st.length,kk=clamp(e/Math.max(1,u.t1-u.t0),0,1);let prev=[u.x0,u.y0];
    for(let i=0;i<n;i++){const s=i*(T+Hv),P=u.st[i];
      if(e<s+T){const k=ease(clamp((e-s)/T,0,1));return {x:prev[0]+(P[0]-prev[0])*k,y:prev[1]+(P[1]-prev[1])*k,hover:-1,ch:0,k:kk};}
      if(e<s+T+Hv)return {x:P[0],y:P[1]+Math.sin((e-s-T)/180)*3,hover:i,ch:(e-s-T)/Hv,tx:P[2],k:kk};
      prev=P;}
    const k=ease(clamp((e-n*(T+Hv))/T,0,1));return {x:prev[0]+(u.x1-prev[0])*k,y:prev[1]+(u.y1-prev[1])*k,hover:-1,ch:0,k:kk};
  }
  const fireAt=(u,i)=>u.t0+i*(C.UFO.TRAVEL+C.UFO.HOVER)+C.UFO.TRAVEL+C.UFO.HOVER;
  /* An alien: its fleet sways left and right while sinking; each alien keeps its place in the fleet. */
  function aPos(a,t){const e=t-a.t0;return {x:a.gx+a.ox+a.ga*Math.sin(e/a.gw*TAU),y:a.gy+a.oy+a.gv*e/1000,k:clamp(e/Math.max(1,a.t1-a.t0),0,1)};}
  /* Where any enemy is at time t. */
  const ePos=(m,t)=>m.k==='u'?uState(m,t):m.k==='a'?aPos(m,t):mPos(m,t);
  const bPos=(b,t)=>{const d=C.SHOT.SPEED*Math.max(0,t-b.t0)/1000;return {x:b.x+Math.cos(b.a)*d,y:b.y+Math.sin(b.a)*d};};
  const offScreen=p=>p.x<-60||p.x>W+60||p.y<-90||p.y>H+20;
  /* Turrets stand on the ring, spread evenly in joining order. */
  function turretAt(i,n){const x=n<=1?600:150+i*(900/(n-1));return {x,y:ringY(x)-8};}
  const muzzle=(T,a)=>({x:T.x+Math.cos(a)*20,y:T.y+Math.sin(a)*20});
  const aimLimit=a=>{a=Math.atan2(Math.sin(a),Math.cos(a));if(a>0)a=a>Math.PI/2?-Math.PI+0.12:-0.12;return clamp(a,-Math.PI+0.12,-0.12);};   // always upwards
  /* A meteor's outline (the same on every screen): corners at slightly different distances. */
  function shape(m){const r=rng(Math.floor(m.s*1e6)+7),n=m.k==='b'?14:m.k==='x'?8:9;return Array.from({length:n},(_,i)=>[i*Math.PI*2/n,0.78+r()*0.34]);}
  /* Where to aim to meet a moving enemy (used by robots). */
  function lead(from,m,t){let tf=0,p=ePos(m,t);for(let i=0;i<3;i++){tf=Math.hypot(p.x-from.x,p.y-from.y)/C.SHOT.SPEED*1000;p=ePos(m,t+tf);}return Math.atan2(p.y-from.y,p.x-from.x);}

  /* A wrong answer for a bot (a number that is never an option, or text no answer key accepts). */
  function botValue(q,ok){if(q.type==='fill')return ok?(q.accept||[''])[0]:'\u0000';return ok?q.answer:[0];}

  /* ── The game (runs on the teacher's computer) ── */
  function createGame(opt={}){
    const rnd=opt.rng||Math.random,check=opt.check||(()=>false),clock=opt.now||(()=>Date.now());
    const g={ph:'lobby',paused:'',cd:0,ct:0,len:'std',diff:'std',stage:'main',wave:0,qs:[],players:new Map(),kicked:[],seq:0,
      hull:100,ms:[],bs:[],fx:[],made:[],acc:0,last:0,lastGold:-1e9,nextUfo:1e12,nextFleet:1e12,fleets:[],id:1,boss:null,bossAt:0,spit:0,spits:0,finisher:'',
      D:C.DIRECTOR.START,dAt:0,hulls:[],hitLog:[],next:'',
      tally:{right:0,shots:0,hits:0,kills:0,score:0},qStat:[],end:null};
    const here=p=>p.bot||!p.away;
    const active=()=>g.ph==='play';
    function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
    function fx(k,x,y,by='',w=''){g.fx.push({id:g.id++,k,x:Math.round(x),y:Math.round(y),at:g.ct,by,w});}
    const order=()=>[...g.players.values()].sort((a,b)=>a.seq-b.seq);
    g.turret=id=>{const list=order(),i=list.findIndex(p=>p.id===id);return turretAt(Math.max(0,i),list.length);};

    /* Each student gets the questions in their own shuffled order; a wrong one comes back after three others. */
    function ready(p){
      Object.assign(p,{ammo:C.AMMO.START,cd:0,rs:0,rk:-1,gain:0,streak:0,lastShot:-1e9,aim:-Math.PI/2,shots:0,hits:0,kills:0,
        queue:shuffle(g.qs.map((_,i)=>i)),st:{first:new Map(),fixed:new Set(),right:0,wrong:0},botNext:0,botShot:0});
      p.q=p.queue.length?p.queue.shift():-1;
    }
    g.setQuestions=list=>{g.qs=list.slice();};
    g.join=(id,name,o={})=>{
      id=String(id||'');if(!id)return null;let p=g.players.get(id);
      if(!p){if(g.players.size>=C.MAX_PLAYERS)return null;const seq=g.seq++;
        p={id,name:String(name||'').trim().slice(0,24)||'?',seq,col:seq%C.COLORS.length,bot:!!o.bot,dev:o.dev||'',lv:o.lv||'',seen:clock(),away:false};
        g.players.set(id,p);if(g.ph!=='lobby')ready(p);}
      else{if(name)p.name=String(name).trim().slice(0,24);if(o.dev)p.dev=o.dev;p.seen=clock();p.away=false;}
      g.kicked=g.kicked.filter(k=>k!==id);
      return p;
    };
    g.kick=id=>{if(g.players.delete(id))g.kicked.push(id);};
    g.input=m=>{
      if(!m||!m.id)return null;
      if(m.k==='join')return g.join(m.id,m.name,{dev:m.dev,lv:m.lv});
      const p=g.players.get(m.id);if(!p)return null;
      p.seen=clock();p.away=false;
      switch(m.k){
        case 'hi':return p;
        case 'bye':p.seen=0;p.away=true;if(g.ph==='lobby')g.players.delete(p.id);return p;
        case 'ans':return answer(p,m)?p:null;
        // n: the phone numbers its shots, so it knows which ones this computer has seen (its bullet count stays right)
        case 'fire':p.ln=Math.max(p.ln||0,Number(m.n)||0);return fire(p,Number(m.a),Number(m.t))?p:null;
      }
      return null;
    };
    /* Students silent for 10 s have left (phones say "hi" every 4 s): gone from the lobby, greyed out in a game. */
    g.sweep=()=>{let changed=false;const t=clock();
      for(const p of [...g.players.values()]){if(p.bot)continue;const away=t-p.seen>C.AWAY;
        if(away&&g.ph==='lobby'){g.players.delete(p.id);changed=true;}else if(away!==p.away){p.away=away;changed=true;}}
      return changed;};

    function answer(p,m){
      if(!active()||p.q<0||Number(m.q)!==p.q||g.ct<p.cd||p.ammo>=C.AMMO.MAX)return false;
      const i=p.q,ok=!!check(g.qs[i],m.v),S=g.qStat[i];S.tries++;if(!ok)S.wrong++;
      if(!p.st.first.has(i)){p.st.first.set(i,ok);S.first++;if(!ok)S.firstWrong++;}
      else if(ok&&p.st.first.get(i)===false)p.st.fixed.add(i);
      p.gain=0;
      if(ok){p.st.right++;g.tally.right++;p.streak++;p.gain=C.AMMO.ANSWER+(p.streak%C.AMMO.STREAK===0?C.AMMO.BONUS:0);
        const before=p.ammo;p.ammo=Math.min(C.AMMO.MAX,p.ammo+p.gain);g.made.push([g.ct,p.ammo-before]);p.queue.push(i);}
      else{p.st.wrong++;p.streak=0;p.cd=g.ct+C.COOL;p.queue.splice(Math.min(3,p.queue.length),0,i);}
      p.q=p.queue.shift();p.rs++;p.rk=ok?1:0;
      return true;
    }
    /* A shot. t is when the phone fired by its own clock (a little behind this computer's): the bullet starts then, so it
       hits what the student saw. */
    function fire(p,a,t){
      if(!active()||p.ammo<=0||!Number.isFinite(a)||g.ct-p.lastShot<C.SHOT.COOL-60)return false;
      a=aimLimit(a);const t0=Number.isFinite(t)?clamp(t,g.ct-400,g.ct):g.ct,from=muzzle(g.turret(p.id),a);
      const b={id:g.id++,by:p.id,x:from.x,y:from.y,a,t0,te:0,ck:t0};g.bs.push(b);
      p.ammo--;p.shots++;p.lastShot=g.ct;p.aim=a;g.tally.shots++;
      fly(b,g.ct);return true;
    }
    /* Move a bullet up to time t in small steps; the first enemy it touches takes a hit. */
    function fly(b,t){
      while(!b.te&&b.ck<t){
        const s=Math.min(t,b.ck+14);b.ck=s;const P=bPos(b,s);
        if(offScreen(P)||s-b.t0>C.SHOT.LIFE){b.te=s;break;}
        for(const m of g.ms){if(m.hp<=0||s<m.t0)continue;const M=ePos(m,s),r=C.KIND[m.k].r+C.SHOT.R;
          if((M.x-P.x)**2+(M.y-P.y)**2<=r*r){b.te=s;b.hit=m.id;damage(m,1,b.by,M,true);break;}}
      }
    }
    const hitsLastMinute=()=>{while(g.hitLog.length&&g.hitLog[0]<=g.ct-60000)g.hitLog.shift();return g.hitLog.length;};
    /* n hits on an enemy (a bullet, or a bomb meteor's blast). */
    function damage(m,n,by,M,bullet){
      if(!g.ms.includes(m)||m.hp<=0)return;
      const p=g.players.get(by);
      if(bullet){g.tally.hits++;if(p)p.hits++;g.hitLog.push(g.ct);}
      m.hp-=n;
      if(m.hp>0){if(m.k==='r'&&!m.rt)enrage(m);fx('hit',M.x,M.y,by,m.k);return;}
      g.tally.kills++;g.tally.score+=C.KIND[m.k].pts;if(p)p.kills++;
      g.ms.splice(g.ms.indexOf(m),1);fx('boom',M.x,M.y,by,m.k);
      if(m.k==='l')for(const dx of [-60,60])spawn('f',{x:M.x,y:M.y},M.x+dx*3);
      if(m.k==='p')for(const dx of [-1,0,1])spawn('f',{x:M.x,y:M.y},M.x+dx*220);
      if(m.k==='g'){for(const q of g.players.values())q.ammo=Math.min(C.AMMO.MAX,(q.ammo||0)+C.AMMO.GOLD);fx('gold',M.x,M.y,by);}
      if(m.k==='x')blast(M,by);
      if(m.k==='b'){g.finisher=by;finish('win');}
    }
    // A rage meteor hit once: it glows and rushes at the ring.
    function enrage(m){const t=g.ct;m.to=m.t1;m.rk=clamp((t-m.t0)/Math.max(1,m.to-m.t0),0,1);m.rt=t;m.t1=t+(m.to-t)*C.RAGE;const P=mPos(m,t);fx('rage',P.x,P.y);}
    // A bomb meteor's blast: two hits to everything near it (other bomb meteors go off too).
    function blast(M,by){fx('blast',M.x,M.y,by);
      for(const e of [...g.ms]){const P=ePos(e,g.ct);if(Math.hypot(P.x-M.x,P.y-M.y)<=C.BLAST.R+C.KIND[e.k].r)damage(e,C.BLAST.DMG,by,P,false);}}

    /* ── The director ── rate() — bullets earned in the last minute — is a number for the teacher and the tests. */
    function rate(){
      const t=g.ct,w=60000;while(g.made.length&&g.made[0][0]<=t-w)g.made.shift();
      let n=0;for(const p of g.players.values())if(here(p))n++;
      let b=0;for(const m of g.made)b+=m[1];
      return Math.max(3,b+Math.max(1,n)*3*(1-Math.min(1,t/w)));
    }
    g.rate=rate;
    const crew=()=>{let n=0;for(const p of g.players.values())if(here(p))n++;return Math.max(1,n);};
    const bigHp=()=>clamp(Math.round(crew()*0.5),6,20);
    // A meteor (from the top or a side, or from a point: a piece of a broken one, an alien's bomb). x1: where it lands.
    function spawn(k,from,x1){
      const K=C.KIND[k],s=rnd();let x0,y0;x1=clamp(x1??150+rnd()*900,110,1090);
      if(from){x0=from.x;y0=from.y;}
      else if(k!=='b'&&rnd()<0.25){const left=rnd()<0.5;x0=left?-50:W+50;y0=40+rnd()*220;}
      else{x0=80+rnd()*(W-160);y0=-60;}
      if(k==='b'){x0=600;y0=-130;x1=600;}
      if(k==='d')x1=clamp(x0,60,1140);
      let T=k==='d'?Math.max(800,(ringY(x1)-y0)/C.FLEET.BOMB*1000):K.T[0]+rnd()*(K.T[1]-K.T[0]);if(g.ct<C.WARM&&k==='s')T*=1.3;
      // the Meteor King: about what this class hit in the last minute (answering pace and aim both count), plus a few each
      const hp=k==='l'?bigHp():k==='b'?clamp(Math.round((hitsLastMinute()*C.BOSS.RATE+crew()*C.BOSS.PER)*hard()),12,600):K.hp;
      const m={id:g.id++,k,x0,y0,x1,y1:ringY(x1),t0:g.ct,t1:g.ct+T,s,hp,max:hp};
      g.ms.push(m);if(k!=='f'&&k!=='d')g.last=g.ct;if(k==='g')g.lastGold=g.ct;return m;
    }
    g.spawn=spawn;
    function ufo(){
      const left=rnd()<0.5,n=C.UFO.STOPS,st=[],list=order();let x=left?60:1140;
      for(let i=0;i<n;i++){x=clamp(x+(left?1:-1)*(200+rnd()*180),140,1060);
        const tx=list.length?turretAt(Math.floor(rnd()*list.length),list.length).x:200+rnd()*800;st.push([Math.round(x),Math.round(90+rnd()*190),Math.round(tx)]);}
      const m={id:g.id++,k:'u',x0:left?-60:W+60,y0:Math.round(110+rnd()*80),x1:left?W+60:-60,y1:Math.round(80+rnd()*120),t0:g.ct,t1:g.ct+n*(C.UFO.TRAVEL+C.UFO.HOVER)+C.UFO.TRAVEL,
        s:rnd(),hp:C.KIND.u.hp,max:C.KIND.u.hp,st,nf:0};
      g.ms.push(m);g.nextUfo=g.ct+C.UFO.EVERY[Math.max(1,g.wave-1)]*slowness();fx('ufo',m.x0,m.y0);return m;
    }
    g.ufo=ufo;
    function fleet(){
      // its size follows the class: more students and a class doing well → a bigger fleet
      const F=C.FLEET,n=clamp(Math.round((2+crew()/4)*clamp(g.D/C.DIRECTOR.START,0.6,1.3)),3,10),cols=Math.min(5,n),id=g.id++,gx=600+(rnd()-0.5)*160,gy=-30;
      for(let i=0;i<n;i++){const col=i%cols,row=Math.floor(i/cols),inRow=Math.min(cols,n-row*cols),ox=(col-(inRow-1)/2)*62,oy=-row*52;
        const reach=Math.max(5000,(ringY(gx+ox)-(gy+oy))/F.DOWN*1000);
        g.ms.push({id:g.id++,k:'a',fl:id,gx,gy,ga:F.SWAY,gw:F.PERIOD,gv:F.DOWN,ox,oy,x0:gx+ox,y0:gy+oy,x1:gx+ox,y1:ringY(gx+ox),t0:g.ct,t1:g.ct+reach+30000,s:rnd(),hp:C.KIND.a.hp,max:C.KIND.a.hp});}
      g.fleets.push({id,next:g.ct+F.DROP});g.nextFleet=g.ct+F.EVERY*slowness();fx('fleet',gx,0);
    }
    g.fleet=fleet;
    // a struggling class (low D) gets UFOs, fleets and bombs less often; a strong one more often (0.7–2.5 times the gap)
    const hard=()=>C.DIFF[g.diff]||1;
    const slowness=()=>clamp(C.DIRECTOR.START/g.D,0.7,3)/hard();
    function pick(mix){let sum=0;for(const v of Object.values(mix))sum+=v;let r=rnd()*sum;for(const [k,v] of Object.entries(mix)){r-=v;if(r<=0)return k;}return 's';}
    function director(dt){
      const t=g.ct;if(g.stage!=='main')return;
      const n=g.ms.length;
      if(t<C.WARM){if(n<3&&t-g.last>3000)spawn('s');return;}
      if(t-g.dAt>=5000){g.dAt=t;g.hulls.push(g.hull);if(g.hulls.length>5)g.hulls.shift();
        let sum=0,k=0;for(const p of g.players.values())if(here(p)){sum+=p.ammo||0;k++;}
        const avg=k?sum/k:0,loss=g.hulls[0]-g.hull,D=C.DIRECTOR,M=C.AMMO.MAX;
        g.D*=loss>D.HURT?D.EASE:loss>D.OK?D.LESS:avg>M*0.45?D.MORE:loss<1?D.CALM:avg>M*0.28?D.LITTLE:1;
        g.D=clamp(g.D,D.MIN,D.MAX);}
      g.acc=Math.min(g.acc+crew()*g.D*hard()*(0.8+0.4*Math.min(1,t/C.LEN[g.len]))*dt/60000,30);
      // UFOs (from wave 2) and the alien fleet (wave 3) come on their own clocks
      const w=g.wave-1;
      if(C.UFO.MAX[w]&&g.ms.filter(m=>m.k==='u').length<C.UFO.MAX[w]&&t>=g.nextUfo)ufo();
      if(g.wave>=3&&!g.fleets.length&&t>=g.nextFleet)fleet();
      // never an empty sky: below the floor a small one comes anyway (borrowed from what comes next); a struggling class gets a lower floor
      const floor=Math.round((C.FLOOR+crew()/3)*clamp(g.D/C.DIRECTOR.START,0.5,1.2)*hard());
      // (the same mix as the wave, so the special ones keep coming; these drift slower)
      // (short of budget: still a mix, from the cheap ones — rage and bomb meteors take 2 hits like a golden one)
      if(n<floor&&t-g.last>=C.FLOOR_GAP&&g.acc>-6){let k=pick(g.acc<0?(g.wave>=2?{s:5,r:2,x:2,g:1}:{s:6,g:1}):C.MIX[Math.max(0,w)]);if(k==='l')k='m';if(k==='g'&&t-g.lastGold<C.GOLD_GAP)k='s';
        g.acc-=C.COST[k];const m=spawn(k);m.t1=m.t0+(m.t1-m.t0)*1.6;return;}
      if(t-g.last<C.GAP||n>=C.MAXM+Math.floor(crew()/3))return;
      if(!g.next){g.next=pick(C.MIX[Math.max(0,w)]);if(g.next==='g'&&t-g.lastGold<C.GOLD_GAP)g.next='s';}
      const cost=g.next==='l'?bigHp():C.COST[g.next];
      if(g.acc<cost)return;
      g.acc-=cost;spawn(g.next);g.next='';
    }

    /* ── Phases ── */
    g.start=()=>{
      if(!g.qs.length)return false;
      Object.assign(g,{ct:0,stage:'main',wave:0,hull:100,ms:[],bs:[],fx:[],made:[],acc:0,last:-1e9,lastGold:-1e9,nextUfo:1e12,nextFleet:1e12,fleets:[],next:'',
        boss:null,bossAt:0,spit:0,spits:0,finisher:'',end:null,D:C.DIRECTOR.START,dAt:0,hulls:[],hitLog:[],
        tally:{right:0,shots:0,hits:0,kills:0,score:0},qStat:g.qs.map(()=>({first:0,firstWrong:0,tries:0,wrong:0}))});
      for(const p of [...g.players.values()]){if(!here(p)){g.players.delete(p.id);continue;}ready(p);}
      g.ph='count';g.cd=C.COUNT;return true;
    };
    function finish(outcome){
      const stars=outcome==='win'?(g.hull>=60?3:g.hull>=25?2:1):0;
      const players=order().map(p=>{
        let firstOk=0;const still=[];for(const [i,ok] of p.st?.first||[]){if(ok)firstOk++;else if(!p.st.fixed.has(i))still.push(i);}
        return {id:p.id,name:p.name,col:p.col,bot:p.bot,lv:p.lv,firstOk,firstN:p.st?.first.size||0,right:p.st?.right||0,wrong:p.st?.wrong||0,fixed:p.st?.fixed.size||0,still,
          shots:p.shots||0,hits:p.hits||0,kills:p.kills||0};
      });
      const hard=g.qStat.map((s,i)=>({i,text:g.qs[i]?.text||'',wrong:s.firstWrong,n:s.first,tries:s.tries}))
        .filter(x=>x.wrong>0).sort((a,b)=>b.wrong-a.wrong||b.wrong/b.n-a.wrong/a.n).slice(0,3);
      const boss=g.boss?g.boss.hp/g.boss.max:1;   // how much of the Meteor King was left (0 when it was broken)
      g.end={outcome,stars,hull:Math.round(g.hull),tally:{...g.tally},players,hard,finisher:g.finisher,bossLeft:Math.round(Math.max(0,boss)*100),wave:g.wave,len:g.ct};
      g.ph='end';g.ms=[];
    }
    g.finish=finish;
    g.stop=()=>{if(g.ph==='pause')g.ph=g.paused;if(g.ph==='lobby'||g.ph==='end')return;finish('stop');};
    g.toLobby=()=>{g.ph='lobby';g.ms=[];g.bs=[];g.fx=[];g.end=null;for(const p of [...g.players.values()])if(!here(p))g.players.delete(p.id);};
    g.pause=()=>{if(g.ph==='play'||g.ph==='count'){g.paused=g.ph;g.ph='pause';}};
    g.resume=()=>{if(g.ph==='pause')g.ph=g.paused;};
    const hurt=(dmg,x)=>{g.hull=Math.max(0,g.hull-dmg);fx('ring',x,ringY(x),'',String(dmg));};

    g.tick=dt=>{
      if(g.ph==='count'){g.cd-=dt;if(g.cd<=0){g.cd=0;g.ph='play';}return;}
      if(!active())return;
      g.ct+=dt;const t=g.ct;
      for(const b of g.bs)fly(b,t);
      if(g.ph!=='play')return;   // the Meteor King was broken by a bullet
      for(const m of [...g.ms]){
        if(!g.ms.includes(m))continue;
        if(m.k==='u'){   // a UFO fires at the end of each stop, then leaves
          while(m.nf<m.st.length&&t>=fireAt(m,m.nf)){const P=uState(m,fireAt(m,m.nf)),tx=m.st[m.nf][2];m.nf++;hurt(C.UFO.DMG,tx);fx('laser',P.x,P.y,'',String(tx));}
          if(t>=m.t1)g.ms.splice(g.ms.indexOf(m),1);continue;}
        if(m.k==='a'){const P=aPos(m,t);   // an alien reaching the ring crashes into the base
          if(P.y>=ringY(P.x)-C.KIND.a.r){g.ms.splice(g.ms.indexOf(m),1);hurt(C.KIND.a.dmg,P.x);}else if(t>=m.t1)g.ms.splice(g.ms.indexOf(m),1);continue;}
        if(t<m.t1)continue;
        g.ms.splice(g.ms.indexOf(m),1);
        if(m.k==='g'){fx('away',m.x1,m.y1);continue;}   // a golden meteor nobody broke just flies past
        hurt(C.KIND[m.k].dmg,m.x1);
        if(m.k==='b')return finish('breach');
      }
      // the alien fleets drop bombs; a fleet with nobody left is gone
      for(const f of [...g.fleets]){const alive=g.ms.filter(m=>m.k==='a'&&m.fl===f.id);
        if(!alive.length){g.fleets.splice(g.fleets.indexOf(f),1);continue;}
        if(t>=f.next){f.next=t+C.FLEET.DROP*(0.7+rnd()*0.6)*slowness();const a=alive[Math.floor(rnd()*alive.length)],P=aPos(a,t);if(P.y>0)spawn('d',{x:P.x,y:P.y+14});}}
      if(g.hull<=0)return finish('lost');
      // waves
      if(g.stage==='main'&&t>=C.WARM){const f=t/C.LEN[g.len],w=f<C.WAVES[1]?1:f<C.WAVES[2]?2:3;
        if(w!==g.wave){g.wave=w;fx('wave',600,200,'',String(w));if(w===2)g.nextUfo=t+3000;if(w===3)g.nextFleet=t+4000;}}
      director(dt);
      if(g.stage==='main'&&t>=C.LEN[g.len]){g.stage='warn';g.bossAt=t;fx('warn',600,200);}
      if(g.stage==='warn'&&t-g.bossAt>=C.BOSS.WARN){g.stage='boss';g.boss=spawn('b');g.spit=t;fx('king',600,0);}
      // the Meteor King throws meteors: split, rage, then two small ones, in turn
      if(g.stage==='boss'&&g.boss&&g.ms.includes(g.boss)&&t-g.spit>=C.BOSS.SPIT){g.spit=t;const B=mPos(g.boss,t);
        const kinds=[['p'],['r'],['s','s']][g.spits++%3];kinds.forEach((k,i)=>spawn(k,{x:B.x+(i?50:-50),y:B.y+50}));}
      for(const p of g.players.values())if(p.bot)bot(p);
      g.bs=g.bs.filter(b=>!b.te||t-b.te<600);
      while(g.fx.length&&g.fx[0].at<t-4000)g.fx.shift();
    };

    /* ── Robots (for trying the game alone): shoot at the most dangerous enemy, leading it, not perfectly; answer when out. ── */
    g.botAim=0.12;   // how far off a robot's aim can be (radians)
    g.botReact=1500; // a robot needs 1.5–3 s to notice something (like a student finding it and aiming)
    function threat(m,P){
      if(m.k==='u')return P.hover>=0?1.2+P.ch:0.4;
      if(m.k==='a')return 0.3+P.y/700;
      if(m.k==='d')return 0.6+P.k*0.6;
      return P.k+(m.k==='b'?0.4:m.k==='g'?0.5:m.k==='l'?0.25:m.k==='r'&&m.rt?0.9:m.k==='x'?0.2:0);
    }
    function bot(p){
      const t=g.ct;
      if(p.ammo<=0){if(!p.botNext)p.botNext=t+C.BOT[0]+rnd()*C.BOT[1];
        if(t>=p.botNext&&t>=p.cd&&p.q>=0){answer(p,{q:p.q,v:botValue(g.qs[p.q],rnd()<0.72)});p.botNext=p.ammo>0?0:t+C.BOT[0]+rnd()*C.BOT[1];}
        return;}
      if(t<p.botShot)return;p.botShot=t+800+rnd()*1200;
      const T=g.turret(p.id);let best=null,bs=-1;
      for(const m of g.ms){const M=ePos(m,t);if(M.y<10||M.x<0||M.x>W||t-m.t0<g.botReact*(1+(m.id*7%10)/10))continue;
        const s=threat(m,M)-Math.abs(M.x-T.x)/2000+rnd()*0.3;if(s>bs){bs=s;best=m;}}
      if(best)fire(p,lead(muzzle(T,-Math.PI/2),best,t)+(rnd()-0.5)*2*g.botAim,t);
    }

    /* ── Snapshot for the phones (compact arrays) ── */
    const extra=m=>m.k==='u'?[m.st,m.nf]:m.k==='a'?[m.gx,m.gy,m.ga,m.gw,m.gv,m.ox,m.oy,m.fl]:m.rt?[Math.round(m.to),Math.round(m.rt),Math.round(m.rk*1000)/1000]:0;
    g.snapshot=()=>{
      const s={ph:g.ph,ct:Math.round(g.ct),cd:Math.round(g.cd),hull:Math.round(g.hull*10)/10,len:g.len,st:g.stage,wv:g.wave,ba:Math.round(g.bossAt),nq:g.qs.length,pz:g.ph==='pause'?g.paused:'',
        sc:g.tally.kills,
        m:g.ms.map(m=>[m.id,m.k,Math.round(m.x0),Math.round(m.y0),Math.round(m.x1),Math.round(m.y1),Math.round(m.t0),Math.round(m.t1),Math.round(m.s*1000)/1000,m.hp,m.max,extra(m)]),
        b:g.bs.map(b=>[b.id,b.by,Math.round(b.x*10)/10,Math.round(b.y*10)/10,Math.round(b.a*1000)/1000,Math.round(b.t0),Math.round(b.te)]),
        p:order().map(p=>[p.id,p.name,p.col,p.seq,p.ammo??C.AMMO.START,p.q??-1,p.rs||0,p.rk??-1,Math.round(p.cd||0),p.streak||0,p.shots||0,p.hits||0,p.kills||0,
          p.away?1:0,p.bot?1:0,p.dev||'',p.gain||0,Math.round((p.aim??-Math.PI/2)*100)/100,p.ln||0]),
        fx:g.fx.map(f=>[f.id,f.k,f.x,f.y,Math.round(f.at),f.by,f.w]),k:g.kicked.slice(-12)};
      if(g.end){const e=g.end;s.end={o:e.outcome,s:e.stars,hull:e.hull,ta:e.tally,bl:e.bossLeft,fin:e.finisher,
        me:e.players.map(p=>[p.id,p.firstOk,p.firstN,p.right,p.shots,p.hits,p.kills,p.fixed])};}
      return s;
    };
    return g;
  }
  /* Unpack a snapshot into objects (phones). */
  function unpack(s){
    return {...s,
      m:(s.m||[]).map(a=>{const m={id:a[0],k:a[1],x0:a[2],y0:a[3],x1:a[4],y1:a[5],t0:a[6],t1:a[7],s:a[8],hp:a[9],max:a[10]},e=a[11];
        if(Array.isArray(e)){if(m.k==='u'){m.st=e[0];m.nf=e[1];}else if(m.k==='a')[m.gx,m.gy,m.ga,m.gw,m.gv,m.ox,m.oy,m.fl]=e;else [m.to,m.rt,m.rk]=e;}
        return m;}),
      b:(s.b||[]).map(a=>({id:a[0],by:a[1],x:a[2],y:a[3],a:a[4],t0:a[5],te:a[6]})),
      p:(s.p||[]).map(a=>({id:a[0],name:a[1],col:a[2],seq:a[3],ammo:a[4],q:a[5],rs:a[6],rk:a[7],cd:a[8],streak:a[9],shots:a[10],hits:a[11],kills:a[12],away:!!a[13],bot:!!a[14],dev:a[15],gain:a[16]||0,aim:a[17],ln:a[18]||0})),
      fx:(s.fx||[]).map(a=>({id:a[0],k:a[1],x:a[2],y:a[3],at:a[4],by:a[5],w:a[6]})),
      end:s.end?{...s.end,me:new Map((s.end.me||[]).map(a=>[a[0],{firstOk:a[1],firstN:a[2],right:a[3],shots:a[4],hits:a[5],kills:a[6],fixed:a[7]}]))}:null};
  }
  /* Snapshots: Supabase's free plan allows 100 messages a second, and every phone that receives one counts.
     Returns [the shortest gap after something happened, the regular gap] in ms for this many phones. */
  function snapGaps(phones){const min=Math.max(180,Math.round((phones+1)*1000/60));return [min,Math.max(min,phones<=8?300:Math.round((phones+1)*1000/45))];}

  /* Results as a table (tab separated, pastes straight into Excel). Robots are left out. */
  function resultTable(end){
    const head=['名字 Name','第一次就答对 First try','第一次答对率 %','一共答对 Right','答错 Wrong','订正 Fixed','还不会的题 Still wrong','开枪 Shots','命中 Hits','击碎 Kills'];
    const rows=end.players.filter(p=>!p.bot).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>[p.name,`${p.firstOk}/${p.firstN}`,p.firstN?Math.round(p.firstOk/p.firstN*100):'',p.right,p.wrong,p.fixed,
      p.still.map(i=>i+1).join(' '),p.shots,p.hits,p.kills]);
    return [head,...rows].map(r=>r.join('\t')).join('\n');
  }

  /* ── Network: Supabase Realtime (Phoenix websocket) for listening and the host's pushes; REST broadcast for phones'
     messages. (The same small client as Hook Rush, kept separate so the two games never break each other.) ── */
  function createNet(cfg){
    const handlers=new Map(),joinRefs=new Map();let ws=null,ref=0,hb=null,closed=false,open=false,status=()=>{},downSince=Date.now();
    const raw=(topic,event,payload,jr)=>{if(open)ws.send(JSON.stringify({topic,event,payload,ref:String(++ref),join_ref:jr}));};
    const joinMsg=topic=>{const jr=String(++ref);joinRefs.set(topic,jr);raw('realtime:'+topic,'phx_join',{config:{broadcast:{self:false,ack:false},presence:{key:''},postgres_changes:[],private:false}},jr);};
    function connect(){
      ws=new WebSocket(cfg.url.replace(/^http/,'ws')+`/realtime/v1/websocket?apikey=${encodeURIComponent(cfg.key)}&vsn=1.0.0`);
      ws.onopen=()=>{open=true;for(const t of handlers.keys())joinMsg(t);clearInterval(hb);hb=setInterval(()=>raw('phoenix','heartbeat',{}),25000);status(true);};
      ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
        if(m.event==='broadcast'){const h=handlers.get(String(m.topic).replace(/^realtime:/,''));if(h)h(m.payload.event,m.payload.payload);}
        else if(m.event==='phx_error'||m.event==='phx_close'){const t=String(m.topic).replace(/^realtime:/,'');if(!closed&&handlers.has(t))setTimeout(()=>handlers.has(t)&&joinMsg(t),1000);}};
      ws.onclose=()=>{if(open)downSince=Date.now();open=false;clearInterval(hb);status(false);setTimeout(()=>{if(!closed)connect();},1000);};
      ws.onerror=()=>{};
    }
    return {
      join(topic,fn){handlers.set(topic,fn);if(!ws)connect();else if(open)joinMsg(topic);},
      leave(topic){if(open&&joinRefs.has(topic))raw('realtime:'+topic,'phx_leave',{},joinRefs.get(topic));handlers.delete(topic);joinRefs.delete(topic);},
      push(topic,event,payload){if(!open)return false;raw('realtime:'+topic,'broadcast',{type:'broadcast',event,payload},joinRefs.get(topic));return true;},
      post(topic,event,payload){return fetch(cfg.url+'/realtime/v1/api/broadcast',{method:'POST',keepalive:true,headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({messages:[{topic,event,payload}]})}).then(r=>r.ok,()=>false);},
      onStatus(fn){status=fn;if(open)fn(true);},
      downFor(){return open?0:Date.now()-downSince;},
      close(){closed=true;clearInterval(hb);ws?.close();}
    };
  }
  /* Same interface inside one browser (?local): tabs talk through BroadcastChannel, for testing without the cloud. */
  function createLocalNet(){
    const chans=new Map(),send=(topic,event,payload)=>{const c=new BroadcastChannel('rescue:'+topic);c.postMessage({event,payload});c.close();return true;};
    return {
      join(topic,fn){const c=new BroadcastChannel('rescue:'+topic);c.onmessage=e=>fn(e.data.event,e.data.payload);chans.set(topic,c);},
      leave(topic){chans.get(topic)?.close();chans.delete(topic);},
      push:send,post:(t,e,p)=>Promise.resolve(send(t,e,p)),onStatus:fn=>fn(true),downFor:()=>0,close(){for(const c of chans.values())c.close();}
    };
  }

  /* GitHub Pages lets a browser keep a page for 10 minutes. At start-up, ask for this page again (skipping every cache);
     if it carries a newer version, switch to it once (unless busy() says not now). Returns this page's version. */
  function latestVersion(){
    if(typeof fetch==='undefined'||typeof location==='undefined')return Promise.resolve('');
    return fetch(location.pathname+'?fresh='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'')
      .then(t=>(/name="rescue-version" content="([0-9a-f]{7})"/.exec(t)||[])[1]||'').catch(()=>'');
  }
  function freshen(busy=()=>false,onNewer){
    if(typeof document==='undefined')return '';
    const ver=document.querySelector('meta[name="rescue-version"]')?.content||'';
    if(!/^[0-9a-f]{7}$/.test(ver)||/[?&]local\b/.test(location.search))return ver;
    latestVersion().then(v=>{
      if(!v||v===ver)return;if(busy()){onNewer?.(v);return;}
      let tried='';try{tried=sessionStorage.getItem('lumi-rescue-upd')||'';}catch{}
      if(tried===v){onNewer?.(v);return;}
      try{sessionStorage.setItem('lumi-rescue-upd',v);}catch{}
      const q=new URLSearchParams(location.search);q.set('v',v);location.replace(location.pathname+'?'+q);
    });
    return ver;
  }

  /* ── Sound lives in audio.js (RescueAudio); without it (the tests) these do nothing. ── */
  const RA=()=>root.RescueAudio;
  const sfx=new Proxy({},{get:(_,k)=>k==='unlock'?()=>RA()?.unlock():()=>RA()?.sfx(k)});
  /* Every button shows it was pressed: it squashes (class "pressed", also on iPhones), a tiny tick, a short buzz on Android. */
  function pressFeedback(){
    if(typeof document==='undefined')return;
    const sel='button,.btn,[role="button"]';let held=null;
    const off=()=>{if(held){held.classList.remove('pressed');held=null;}};
    document.addEventListener('pointerdown',e=>{const b=e.target.closest?.(sel);if(!b||b.disabled)return;off();held=b;b.classList.add('pressed');
      if(b.hasAttribute('data-quiet'))return;sfx.unlock();sfx.tap();if(navigator.vibrate)try{navigator.vibrate(8);}catch{}},true);
    for(const ev of ['pointerup','pointercancel','dragstart'])document.addEventListener(ev,off,true);
    document.addEventListener('touchstart',()=>{},{passive:true});
  }

  const api={C,W,H,RING,ringY,clamp,rng,pickRoom,mPos,uState,aPos,ePos,fireAt,bPos,offScreen,turretAt,muzzle,aimLimit,shape,lead,botValue,createGame,unpack,snapGaps,resultTable,
    createNet,createLocalNet,freshen,latestVersion,pressFeedback,sfx};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.RescueGame=api;
})(globalThis);
