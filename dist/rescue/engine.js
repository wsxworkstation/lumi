/* 星环防线 STAR RING — the rules, shared by the teacher's console (host.js) and the students' phones (player.js).
   The whole class defends one station: a glowing ring along the bottom of the screen. Every student is a turret on the
   ring. Meteors fly in; students drag to aim and release to shoot. Out of bullets → answer a question: right = 3 bullets
   (no time limit, so maths questions are fine). Big meteors need many hands; golden ones give everyone bullets.
   At the end the Meteor King comes down: the whole class shoots it before it reaches the ring.
   The teacher's computer is the referee: it runs createGame, checks every answer (phones never get the answers) and
   decides every hit. Meteors and bullets follow paths worked out from their start, so phones draw them smoothly
   between snapshots (no network per frame). A "director" sends meteors to match how fast this class earns bullets. */
(root=>{
  'use strict';
  const W=1200,H=675;
  // The ring: the top of a wide ellipse along the bottom of the screen.
  const RING={x:600,y:780,rx:640,ry:190};
  const ringY=x=>{const k=(x-RING.x)/RING.rx;return k*k>=1?H+60:RING.y-RING.ry*Math.sqrt(1-k*k);};
  const C={W,H,RING,
    // 5 bullets a right answer (+2 more on every third right in a row), at most 15. (3 a question was too few: students
    // spent nearly all the time answering and only seconds shooting.)
    AMMO:{START:5,ANSWER:5,MAX:15,STREAK:3,BONUS:2,GOLD:3},
    SHOT:{SPEED:950,R:5,LIFE:1500,COOL:250},
    COOL:4000,COUNT:3000,AWAY:10000,MAX_PLAYERS:40,
    WARM:15000,                                       // the first 15 s: a few slow small meteors to learn aiming
    LEN:{short:180000,std:300000,long:420000},        // then the Meteor King
    // its hits: 0.8 × the class's hits in the last minute + 1.5 a student. (Robot classes of 6–28, quick or maths-paced questions:
    // about 6 in 10 games ★★★, 2 in 10 ★★, 1–2 in 10 lost, many close fights. Real students are less efficient than robots.)
    BOSS:{WARN:4000,T:80000,SPIT:6000,DMG:60,RATE:0.8,PER:1.5},
    // D: hits' worth of meteors per student per minute, checked every 5 s against the last 20 s: the ring lost over HURT % → ×EASE,
    // over OK % → ×LESS; otherwise the class holds over 45 % of the bullet limit each → ×MORE; the ring wasn't touched → ×CALM; over 28 % → ×LITTLE.
    // So every class gets close calls: it settles where the ring takes a small hit now and then (about 1–3 % every 20 s).
    DIRECTOR:{START:1.6,MIN:0.4,MAX:9,MORE:1.08,CALM:1.04,LITTLE:1.02,EASE:0.85,LESS:0.93,HURT:6,OK:3},
    // r radius, hp hits to break (0: worked out from the class), T how long it takes to reach the ring, dmg to the ring.
    // They drift slowly: the sky stays busy and there is time to aim, without more of them reaching the ring.
    KIND:{s:{r:17,hp:1,T:[15000,20000],dmg:5,pts:1},m:{r:27,hp:3,T:[19000,24000],dmg:10,pts:3},l:{r:44,hp:0,T:[24000,29000],dmg:20,pts:8},
      g:{r:19,hp:2,T:[11000,13000],dmg:0,pts:2},f:{r:12,hp:1,T:[9000,11000],dmg:3,pts:1},b:{r:95,hp:0,T:[80000,80000],dmg:60,pts:30}},
    MAXM:18,GAP:900,GOLD_GAP:25000,FLOOR:3,FLOOR_GAP:1500,   // at least 3 (+1 per 5 students) meteors in the sky
    COLORS:['#2ef2ff','#ff3df0','#a6ff3d','#ffe53d','#ff8a3d','#9d7bff','#ff5c8a','#3dffb5','#3d8bff','#ff6b6b','#e8f1ff','#ffc83d'],
    BOT:[8000,14000]                                   // a robot answers in 8–22 s (about a student's pace)
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  /* Room numbers count up from 0001: the smallest one nobody is using. */
  function pickRoom(used){for(let n=1;n<10000;n++){const c=String(n).padStart(4,'0');if(!used.has(c))return c;}return '0001';}

  /* ── Paths ── A meteor flies from (x0,y0) to a point on the ring, swaying a little (golden ones a lot). */
  function mPos(m,t){
    const k=clamp((t-m.t0)/Math.max(1,m.t1-m.t0),0,1),dx=m.x1-m.x0,dy=m.y1-m.y0,len=Math.hypot(dx,dy)||1;
    const A=m.k==='g'?70:m.k==='b'?40:m.k==='l'?12:22,w=Math.sin(k*Math.PI*(m.k==='g'?3:1.6)+m.s*6.283)*A*Math.sin(k*Math.PI);
    return {x:m.x0+dx*k-dy/len*w,y:m.y0+dy*k+dx/len*w,k};
  }
  const bPos=(b,t)=>{const d=C.SHOT.SPEED*Math.max(0,t-b.t0)/1000;return {x:b.x+Math.cos(b.a)*d,y:b.y+Math.sin(b.a)*d};};
  const offScreen=p=>p.x<-60||p.x>W+60||p.y<-90||p.y>H+20;
  /* Turrets stand on the ring, spread evenly in joining order. */
  function turretAt(i,n){const x=n<=1?600:150+i*(900/(n-1));return {x,y:ringY(x)-8};}
  const muzzle=(T,a)=>({x:T.x+Math.cos(a)*20,y:T.y+Math.sin(a)*20});
  const aimLimit=a=>{a=Math.atan2(Math.sin(a),Math.cos(a));if(a>0)a=a>Math.PI/2?-Math.PI+0.12:-0.12;return clamp(a,-Math.PI+0.12,-0.12);};   // always upwards
  /* A meteor's outline (the same on every screen): 9 corners at slightly different distances. */
  function shape(m){const r=rng(Math.floor(m.s*1e6)+7),n=m.k==='b'?14:9;return Array.from({length:n},(_,i)=>[i*Math.PI*2/n,0.78+r()*0.34]);}
  /* Where to aim to meet a moving meteor (used by robots). */
  function lead(from,m,t){let tf=0,p=mPos(m,t);for(let i=0;i<3;i++){tf=Math.hypot(p.x-from.x,p.y-from.y)/C.SHOT.SPEED*1000;p=mPos(m,t+tf);}return Math.atan2(p.y-from.y,p.x-from.x);}

  /* A wrong answer for a bot (a number that is never an option, or text no answer key accepts). */
  function botValue(q,ok){if(q.type==='fill')return ok?(q.accept||[''])[0]:'\u0000';return ok?q.answer:[0];}

  /* ── The game (runs on the teacher's computer) ── */
  function createGame(opt={}){
    const rnd=opt.rng||Math.random,check=opt.check||(()=>false),clock=opt.now||(()=>Date.now());
    const g={ph:'lobby',paused:'',cd:0,ct:0,len:'std',stage:'main',qs:[],players:new Map(),kicked:[],seq:0,
      hull:100,ms:[],bs:[],fx:[],made:[],acc:0,last:0,lastGold:-1e9,id:1,boss:null,bossAt:0,spit:0,finisher:'',D:C.DIRECTOR.START,dAt:0,hulls:[],hitLog:[],
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
    /* Move a bullet up to time t in small steps; the first meteor it touches takes a hit. */
    function fly(b,t){
      while(!b.te&&b.ck<t){
        const s=Math.min(t,b.ck+14);b.ck=s;const P=bPos(b,s);
        if(offScreen(P)||s-b.t0>C.SHOT.LIFE){b.te=s;break;}
        for(const m of g.ms){if(m.hp<=0||s<m.t0)continue;const M=mPos(m,s),r=C.KIND[m.k].r+C.SHOT.R;
          if((M.x-P.x)**2+(M.y-P.y)**2<=r*r){b.te=s;b.hit=m.id;hit(m,b,M);break;}}
      }
    }
    const hitsLastMinute=()=>{while(g.hitLog.length&&g.hitLog[0]<=g.ct-60000)g.hitLog.shift();return g.hitLog.length;};
    function hit(m,b,M){
      const p=g.players.get(b.by);m.hp--;g.tally.hits++;if(p)p.hits++;g.hitLog.push(b.te);
      if(m.hp>0){fx('hit',M.x,M.y,b.by,m.k);return;}
      g.tally.kills++;g.tally.score+=C.KIND[m.k].pts;if(p)p.kills++;
      g.ms.splice(g.ms.indexOf(m),1);fx('boom',M.x,M.y,b.by,m.k);
      if(m.k==='l')for(let i=0;i<2;i++)spawn('f',{x:M.x+(i?20:-20),y:M.y});
      if(m.k==='g'){for(const q of g.players.values())q.ammo=Math.min(C.AMMO.MAX,(q.ammo||0)+C.AMMO.GOLD);fx('gold',M.x,M.y,b.by);}
      if(m.k==='b'){g.finisher=b.by;finish('win');}
    }

    /* ── The director ── sends D hits' worth of meteors per student per minute (rising a little over the game), and
       every 5 s looks at how the class is doing: plenty of bullets in hand → more meteors; the ring losing shield fast
       → fewer. (Counting only the bullets earned doesn't work: with an empty sky nobody needs to answer, so fewer
       meteors would come, and the game would empty itself.) rate() — bullets earned in the last minute — is a number
       for the teacher and the tests. */
    function rate(){
      const t=g.ct,w=60000;while(g.made.length&&g.made[0][0]<=t-w)g.made.shift();
      let n=0;for(const p of g.players.values())if(here(p))n++;
      let b=0;for(const m of g.made)b+=m[1];
      return Math.max(3,b+Math.max(1,n)*3*(1-Math.min(1,t/w)));
    }
    g.rate=rate;
    const crew=()=>{let n=0;for(const p of g.players.values())if(here(p))n++;return Math.max(1,n);};
    function spawn(k,from){
      const K=C.KIND[k],x1=150+rnd()*900,s=rnd();let x0,y0;
      if(from){x0=from.x;y0=from.y;}
      else if(k!=='b'&&rnd()<0.25){const left=rnd()<0.5;x0=left?-50:W+50;y0=40+rnd()*220;}
      else{x0=80+rnd()*(W-160);y0=-60;}
      if(k==='b'){x0=600;y0=-130;}
      let T=K.T[0]+rnd()*(K.T[1]-K.T[0]);if(g.ct<C.WARM&&k==='s')T*=1.35;
      // the Meteor King: about what this class hit in the last minute (answering pace and aim both count), plus a few each
      const hp=k==='l'?clamp(Math.round(crew()*0.5),5,20):k==='b'?clamp(Math.round(hitsLastMinute()*C.BOSS.RATE+crew()*C.BOSS.PER),15,600):K.hp;
      const m={id:g.id++,k,x0,y0,x1:k==='b'?600:x1,y1:ringY(k==='b'?600:x1),t0:g.ct,t1:g.ct+T,s,hp,max:hp};
      g.ms.push(m);if(k!=='f')g.last=g.ct;if(k==='g')g.lastGold=g.ct;return m;
    }
    g.spawn=spawn;
    function director(dt){
      const t=g.ct;if(g.stage!=='main')return;
      const n=g.ms.length;
      if(t<C.WARM){if(n<2&&t-g.last>3500)spawn('s');return;}
      if(t-g.dAt>=5000){g.dAt=t;g.hulls.push(g.hull);if(g.hulls.length>5)g.hulls.shift();
        let sum=0,k=0;for(const p of g.players.values())if(here(p)){sum+=p.ammo||0;k++;}
        const avg=k?sum/k:0,loss=g.hulls[0]-g.hull,D=C.DIRECTOR;
        const M=C.AMMO.MAX;g.D*=loss>D.HURT?D.EASE:loss>D.OK?D.LESS:avg>M*0.45?D.MORE:loss<1?D.CALM:avg>M*0.28?D.LITTLE:1;
        g.D=clamp(g.D,D.MIN,D.MAX);}
      g.acc=Math.min(g.acc+crew()*g.D*(0.8+0.4*Math.min(1,t/C.LEN[g.len]))*dt/60000,30);
      // never an empty sky: below the floor a small one comes anyway (borrowed from what comes next)
      if(n<C.FLOOR+Math.floor(crew()/5)&&t-g.last>=C.FLOOR_GAP&&g.acc>-5){g.acc-=1;spawn('s');return;}
      if(t-g.last<C.GAP||n>=C.MAXM+Math.floor(crew()/3))return;
      if(!g.next){const r=rnd(),late=t>40000;
        g.next=late&&t-g.lastGold>C.GOLD_GAP&&r<0.08?'g':late&&r<0.2?'l':r<0.5?'m':'s';}
      const cost=g.next==='l'?clamp(Math.round(crew()*0.5),5,20):g.next==='m'?3:1;
      if(g.acc<cost)return;
      g.acc-=cost;spawn(g.next);g.next='';
    }

    /* ── Phases ── */
    g.start=()=>{
      if(!g.qs.length)return false;
      Object.assign(g,{ct:0,stage:'main',hull:100,ms:[],bs:[],fx:[],made:[],acc:0,last:-1e9,lastGold:-1e9,next:'',boss:null,bossAt:0,spit:0,finisher:'',end:null,
        D:C.DIRECTOR.START,dAt:0,hulls:[],hitLog:[],
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
      g.end={outcome,stars,hull:Math.round(g.hull),tally:{...g.tally},players,hard,finisher:g.finisher,bossLeft:Math.round(boss*100),len:g.ct};
      g.ph='end';g.ms=[];
    }
    g.finish=finish;
    g.stop=()=>{if(g.ph==='pause')g.ph=g.paused;if(g.ph==='lobby'||g.ph==='end')return;finish('stop');};
    g.toLobby=()=>{g.ph='lobby';g.ms=[];g.bs=[];g.fx=[];g.end=null;for(const p of [...g.players.values()])if(!here(p))g.players.delete(p.id);};
    g.pause=()=>{if(g.ph==='play'||g.ph==='count'){g.paused=g.ph;g.ph='pause';}};
    g.resume=()=>{if(g.ph==='pause')g.ph=g.paused;};

    g.tick=dt=>{
      if(g.ph==='count'){g.cd-=dt;if(g.cd<=0){g.cd=0;g.ph='play';}return;}
      if(!active())return;
      g.ct+=dt;const t=g.ct;
      for(const b of g.bs)fly(b,t);
      if(g.ph!=='play')return;   // the Meteor King was destroyed by a bullet
      for(const m of [...g.ms]){if(t<m.t1)continue;
        g.ms.splice(g.ms.indexOf(m),1);const K=C.KIND[m.k];
        if(m.k==='g'){fx('away',m.x1,m.y1);continue;}   // a golden meteor nobody broke just flies past
        g.hull=Math.max(0,g.hull-K.dmg);fx('ring',m.x1,m.y1,'',String(K.dmg));
        if(m.k==='b')return finish('breach');
      }
      if(g.hull<=0)return finish('lost');
      director(dt);
      if(g.stage==='main'&&t>=C.LEN[g.len]){g.stage='warn';g.bossAt=t;fx('warn',600,200);}
      if(g.stage==='warn'&&t-g.bossAt>=C.BOSS.WARN){g.stage='boss';g.boss=spawn('b');g.spit=t;fx('king',600,0);}
      if(g.stage==='boss'&&g.boss&&t-g.spit>=C.BOSS.SPIT){g.spit=t;const B=mPos(g.boss,t);for(let i=0;i<2;i++)spawn('f',{x:B.x+(i?50:-50),y:B.y+40});}
      for(const p of g.players.values())if(p.bot)bot(p);
      g.bs=g.bs.filter(b=>!b.te||t-b.te<600);
      while(g.fx.length&&g.fx[0].at<t-4000)g.fx.shift();
    };

    /* ── Robots (for trying the game alone): shoot at the most dangerous meteor, leading it, not perfectly; answer when out. ── */
    g.botAim=0.12;   // how far off a robot's aim can be (radians)
    g.botReact=1500; // a robot needs 1.5–3 s to notice a meteor (like a student finding it and aiming)
    function bot(p){
      const t=g.ct;
      if(p.ammo<=0){if(!p.botNext)p.botNext=t+C.BOT[0]+rnd()*C.BOT[1];
        if(t>=p.botNext&&t>=p.cd&&p.q>=0){answer(p,{q:p.q,v:botValue(g.qs[p.q],rnd()<0.72)});p.botNext=p.ammo>0?0:t+C.BOT[0]+rnd()*C.BOT[1];}
        return;}
      if(t<p.botShot)return;p.botShot=t+800+rnd()*1200;
      const T=g.turret(p.id);let best=null,bs=-1;
      for(const m of g.ms){const M=mPos(m,t);if(M.y<10||M.x<0||M.x>W||t-m.t0<g.botReact*(1+(m.id*7%10)/10))continue;const s=M.k+(m.k==='b'?0.4:m.k==='g'?0.5:m.k==='l'?0.25:0)-Math.abs(M.x-T.x)/2000+rnd()*0.3;if(s>bs){bs=s;best=m;}}
      if(best)fire(p,lead(muzzle(T,-Math.PI/2),best,t)+(rnd()-0.5)*2*g.botAim,t);
    }

    /* ── Snapshot for the phones (compact arrays) ── */
    g.snapshot=()=>{
      const s={ph:g.ph,ct:Math.round(g.ct),cd:Math.round(g.cd),hull:Math.round(g.hull*10)/10,len:g.len,st:g.stage,ba:Math.round(g.bossAt),nq:g.qs.length,pz:g.ph==='pause'?g.paused:'',
        sc:g.tally.kills,
        m:g.ms.map(m=>[m.id,m.k,Math.round(m.x0),Math.round(m.y0),Math.round(m.x1),Math.round(m.y1),Math.round(m.t0),Math.round(m.t1),Math.round(m.s*1000)/1000,m.hp,m.max]),
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
      m:(s.m||[]).map(a=>({id:a[0],k:a[1],x0:a[2],y0:a[3],x1:a[4],y1:a[5],t0:a[6],t1:a[7],s:a[8],hp:a[9],max:a[10]})),
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

  const api={C,W,H,RING,ringY,clamp,rng,pickRoom,mPos,bPos,offScreen,turretAt,muzzle,aimLimit,shape,lead,botValue,createGame,unpack,snapGaps,resultTable,
    createNet,createLocalNet,freshen,latestVersion,pressFeedback,sfx};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.RescueGame=api;
})(globalThis);
