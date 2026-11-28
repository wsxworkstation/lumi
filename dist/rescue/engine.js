/* 太空站救援 Station Rescue — the rules, shared by the teacher's console (host.js) and the students' phones (player.js).
   The whole class is one crew. Answer a question right → a cell of energy (carry up to 3). Walk to a room and put the
   energy into what needs it: put out a fire, raise the shield before a meteor hits, refill the oxygen, repair the engine.
   Energy is short, so the class keeps choosing: the engine (the way out) or the crisis in front of them.
   When the engine reaches 60 % the meteor swarm arrives early and the class votes: fight on and finish the engine
   (★★★ if it works, an emergency escape if not) or take the escape pod (everyone who boards is safe, ★★).
   The teacher's computer is the referee: it runs createGame, checks every answer (phones never get the answers) and
   sends a snapshot a few times a second. A "director" watches how fast this class earns energy and sends crises to
   match, so a quick class and a slow class (or long maths questions) both stay busy but never hopeless.
   Nobody "dies": a lost station only means an escape, and the result is stars. */
(root=>{
  'use strict';
  const ROOMS=[
    {zh:'舰桥',en:'Bridge',k:'bridge'},{zh:'中控室',en:'Control',k:'control'},{zh:'引擎室',en:'Engine',k:'engine'},
    {zh:'氧气站',en:'Oxygen',k:'oxygen'},{zh:'逃生舱',en:'Escape pod',k:'pod'},{zh:'货舱',en:'Cargo',k:'cargo'}];
  // 舰桥 ─ 中控室 ─ 引擎室
  //   │      │       │
  // 氧气站 ─ 逃生舱 ─ 货舱
  const LINKS=[[0,1],[1,2],[3,4],[4,5],[0,3],[1,4],[2,5]];
  const NB=ROOMS.map((_,i)=>LINKS.filter(l=>l.includes(i)).map(l=>l[0]===i?l[1]:l[0]));
  const C={
    START:1,ENGINE:2,OXYGEN:3,POD:4,
    E_MAX:6,                          // energy is counted in half cells: 6 = 3 full cells; low oxygen gives half a cell
    WALK:2000,SMOKE:3000,             // one corridor takes 2 s; walking through a burning room takes 3 s more
    COOL:4000,                        // after a wrong answer the next question waits 4 s (guessing doesn't pay)
    COUNT:3000,AWAY:10000,MAX_PLAYERS:40,
    WARM:45000,                       // the first 45 s only the oxygen goes down: answer, look at the map
    TWIST_AT:60,TWIST_MIN:150000,     // the twist comes when the engine reaches 60 % (not before 2:30) …
    LEN:{short:240000,std:360000,long:480000},   // … or at the latest at 4 / 6 / 8 minutes
    // Fighting on: every cell in the engine counts 1.5 times. (Robot crews tried in a simulation: ×2 almost always wins,
    // ×1.25 about half the time, ×1 almost never. Real students move less efficiently than robots, so 1.5 is the gamble.)
    VOTE:15000,FIGHT:90000,ESCAPE:90000,EMERG:45000,BOOST:1.5,
    BOARD:{escape:2,emerg:1},         // cells to board the escape pod
    METEOR:{T:45000,FAST:30000,HIT:20,MAX:2},
    FIRE:{SPREAD:30000,DRAIN:0.2,MAX:4,AT_ONCE:3},   // DRAIN: hull per second for every burning room
    O2:{CELL:10,LOW:30,MIN:0.15,MAX:0.5},           // %/cell, below LOW a right answer gives half a cell, %/s fall
    GAP:8000,                         // at least 8 s between two new crises
    BOT:[8000,14000]                  // a robot answers every 8–22 s (about a student's pace with short questions)
  };
  /* The little animals (the same ten as Hook Rush, now in space helmets). */
  const ANIMALS=[
    {zh:'小猫',en:'Kitty',c:'#ffc58f'},{zh:'小熊',en:'Bear',c:'#cfa07a'},{zh:'兔兔',en:'Bunny',c:'#fff1ea'},{zh:'企鹅',en:'Penguin',c:'#5d6f98'},
    {zh:'小狗',en:'Puppy',c:'#f6dcb2'},{zh:'熊猫',en:'Panda',c:'#e9e9ef'},{zh:'青蛙',en:'Froggy',c:'#9edb7b'},{zh:'小鸡',en:'Chick',c:'#ffe36e'},
    {zh:'狐狸',en:'Fox',c:'#ffab6b'},{zh:'小猪',en:'Piggy',c:'#ffc6d2'}];
  const avOf=id=>{let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;return h%ANIMALS.length;};
  const normAv=(v,id)=>{v=Number(v);return Number.isInteger(v)&&v>=0&&v<ANIMALS.length?v:avOf(id);};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  /* Room numbers count up from 0001: the smallest one nobody is using. */
  function pickRoom(used){for(let n=1;n<10000;n++){const c=String(n).padStart(4,'0');if(!used.has(c))return c;}return '0001';}

  /* ── Walking ── The quickest way between two rooms. Walking through a burning room (not into it) costs SMOKE. */
  function route(from,to,burning=new Set()){
    const dist=ROOMS.map(()=>Infinity),prev=ROOMS.map(()=>-1),done=ROOMS.map(()=>false);dist[from]=0;
    for(;;){
      let u=-1;for(let i=0;i<ROOMS.length;i++)if(!done[i]&&dist[i]<Infinity&&(u<0||dist[i]<dist[u]))u=i;
      if(u<0||u===to)break;done[u]=true;
      const pass=u!==from&&burning.has(u)?C.SMOKE:0;
      for(const v of NB[u]){const d=dist[u]+pass+C.WALK;if(d<dist[v]){dist[v]=d;prev[v]=u;}}
    }
    const path=[];for(let v=to;v>=0;v=prev[v])path.unshift(v);
    return path[0]===from?{path,ms:dist[to]}:{path:[from],ms:0};
  }
  /* A walk: segments [from, to, start, end]; between segments the walker waits in a burning room (smoke). */
  function plan(from,to,burning,t0){
    const {path}=route(from,to,burning),segs=[];let t=t0;
    for(let i=1;i<path.length;i++){if(i>1&&burning.has(path[i-1]))t+=C.SMOKE;segs.push([path[i-1],path[i],t,t+C.WALK]);t+=C.WALK;}
    return {to,t1:t,segs};
  }
  /* Where a walker is: between rooms a and b, k of the way (a===b: standing in a). */
  function walkAt(w,t){
    if(!w)return null;
    for(const [a,b,ts,te] of w.segs){if(t<ts)return {a,b:a,k:0};if(t<te)return {a,b,k:(t-ts)/(te-ts)};}
    return {a:w.to,b:w.to,k:0};
  }
  const flatWalk=w=>w?[w.to,Math.round(w.t1),...w.segs.flatMap(s=>[s[0],s[1],Math.round(s[2]),Math.round(s[3])])]:0;
  function unWalk(a){if(!Array.isArray(a))return null;const segs=[];for(let i=2;i+3<a.length;i+=4)segs.push([a[i],a[i+1],a[i+2],a[i+3]]);return {to:a[0],t1:a[1],segs};}

  /* A wrong answer for a bot (a number that is never an option, or text no answer key accepts). */
  function botValue(q,ok){if(q.type==='fill')return ok?(q.accept||[''])[0]:'\u0000';return ok?q.answer:[0];}

  /* ── The game (runs on the teacher's computer) ── */
  function createGame(opt={}){
    const rnd=opt.rng||Math.random,check=opt.check||(()=>false),clock=opt.now||(()=>Date.now());
    const g={ph:'lobby',paused:'',cd:0,vt:0,ct:0,len:'std',qs:[],players:new Map(),kicked:[],
      hull:100,o2:100,eng:0,crises:[],fx:[],mode:'',fin:0,made:[],acc:0,last:0,first:false,next:'',id:1,
      tally:{right:0,blocked:0,hits:0,out:0},qStat:[],end:null};
    const active=()=>g.ph==='play'||g.ph==='final';
    const here=p=>p.bot||!p.away;
    const escaping=()=>g.ph==='final'&&g.mode!=='fight';
    const warming=()=>g.ph==='play'&&g.ct<C.WARM;   // the engine warms up first: the warm-up is for storing energy and the air
    g.warming=warming;
    const fireIn=r=>g.crises.find(c=>c.k==='f'&&c.room===r);
    const meteorIn=r=>g.crises.find(c=>c.k==='m'&&c.room===r);
    const burning=()=>new Set(g.crises.filter(c=>c.k==='f').map(c=>c.room));
    function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
    function fx(k,room=-1,by='',w=''){g.fx.push({id:g.id++,k,room,at:g.ct,by,w});}

    /* Each student gets the questions in their own shuffled order; a wrong one comes back after three others. */
    function ready(p){
      Object.assign(p,{room:C.START,walk:null,e2:0,cd:0,rs:0,rk:-1,gain:0,pod:false,vote:'',
        queue:shuffle(g.qs.map((_,i)=>i)),st:{first:new Map(),fixed:new Set(),right:0,wrong:0,energy:0},
        botNext:g.ct+3000+rnd()*6000,botAct:0});
      p.q=p.queue.length?p.queue.shift():-1;
    }
    g.setQuestions=list=>{g.qs=list.slice();};
    g.join=(id,name,av,o={})=>{
      id=String(id||'');if(!id)return null;let p=g.players.get(id);
      if(!p){if(g.players.size>=C.MAX_PLAYERS)return null;
        p={id,name:String(name||'').trim().slice(0,24)||'?',av:normAv(av,id),bot:!!o.bot,dev:o.dev||'',lv:o.lv||'',seen:clock(),away:false};
        g.players.set(id,p);if(g.ph!=='lobby')ready(p);}   // joining a running game: start in the control room
      else{if(name)p.name=String(name).trim().slice(0,24);if(av!=null)p.av=normAv(av,id);if(o.dev)p.dev=o.dev;p.seen=clock();p.away=false;}
      g.kicked=g.kicked.filter(k=>k!==id);
      return p;
    };
    g.kick=id=>{if(g.players.delete(id))g.kicked.push(id);};
    g.input=m=>{
      if(!m||!m.id)return null;
      if(m.k==='join')return g.join(m.id,m.name,m.av,{dev:m.dev,lv:m.lv});
      const p=g.players.get(m.id);if(!p)return null;
      p.seen=clock();p.away=false;
      switch(m.k){
        case 'hi':return p;
        case 'bye':p.seen=0;p.away=true;if(g.ph==='lobby')g.players.delete(p.id);return p;
        case 'ans':return answer(p,m)?p:null;
        case 'go':return go(p,Number(m.room))?p:null;
        case 'put':return put(p,m.task)?p:null;
        case 'vote':if(g.ph==='vote'&&(m.v==='f'||m.v==='e')){p.vote=m.v;return p;}return null;
      }
      return null;
    };
    /* Students silent for 10 s have left (phones say "hi" every 4 s). In the lobby they disappear; in a game they
       stay (their energy too) but stop counting for "everyone boarded". Returns true when the list changed. */
    g.sweep=()=>{let changed=false;const t=clock();
      for(const p of [...g.players.values()]){if(p.bot)continue;const away=t-p.seen>C.AWAY;
        if(away&&g.ph==='lobby'){g.players.delete(p.id);changed=true;}else if(away!==p.away){p.away=away;changed=true;}}
      return changed;};

    function answer(p,m){
      if(!active()||p.q<0||Number(m.q)!==p.q||g.ct<p.cd||p.e2>=C.E_MAX)return false;
      const i=p.q,ok=!!check(g.qs[i],m.v),S=g.qStat[i];S.tries++;if(!ok)S.wrong++;
      if(!p.st.first.has(i)){p.st.first.set(i,ok);S.first++;if(!ok)S.firstWrong++;}
      else if(ok&&p.st.first.get(i)===false)p.st.fixed.add(i);
      p.gain=0;
      if(ok){p.st.right++;g.tally.right++;p.gain=g.o2<C.O2.LOW&&!escaping()?1:2;p.e2=Math.min(C.E_MAX,p.e2+p.gain);g.made.push([g.ct,p.gain/2]);p.queue.push(i);}
      else{p.st.wrong++;p.cd=g.ct+C.COOL;p.queue.splice(Math.min(3,p.queue.length),0,i);}
      p.q=p.queue.shift();p.rs++;p.rk=ok?1:0;
      return true;
    }
    // A phone shows the arrival by its own clock, which can run a few hundred ms ahead of this computer's.
    const arrive=p=>{if(p.walk&&g.ct>=p.walk.t1-500){p.room=p.walk.to;p.walk=null;}};
    function go(p,room){
      arrive(p);
      if(!active()||p.walk||p.pod||!Number.isInteger(room)||room<0||room>=ROOMS.length||room===p.room)return false;
      p.walk=plan(p.room,room,burning(),g.ct);return true;
    }
    /* Put one cell where it is needed in this room. Fire first: a burning room's machine can't take energy. */
    function put(p,task){
      arrive(p);
      if(!active()||p.walk||p.pod)return false;
      const r=p.room,f=fireIn(r),cost=task==='board'?C.BOARD[g.mode]*2||2:2;
      if(p.e2<cost)return false;
      if(task==='fire'){if(!f)return false;f.got++;if(f.got>=f.need){g.crises.splice(g.crises.indexOf(f),1);g.tally.out++;fx('out',r,p.id);}}
      else if(task==='shield'){const m=meteorIn(r);if(!m)return false;m.got++;if(m.got>=m.need){g.crises.splice(g.crises.indexOf(m),1);g.tally.blocked++;fx('block',r,p.id);}}
      else if(task==='engine'){if(r!==C.ENGINE||f||escaping()||g.eng>=100||warming())return false;
        g.eng=Math.min(100,g.eng+(g.mode==='fight'?C.BOOST:1)*100/engTotal());}
      else if(task==='o2'){if(r!==C.OXYGEN||f||g.o2>=100)return false;g.o2=Math.min(100,g.o2+C.O2.CELL);}
      else if(task==='board'){if(r!==C.POD||f||!escaping())return false;p.pod=true;fx('board',r,p.id);}
      else return false;
      p.e2-=cost;p.st.energy+=cost/2;fx('put',r,p.id,task);
      return true;
    }

    /* ── The director ── How many cells this class earns a minute (the last minute; at the start a guess of one cell
       per student a minute, fading out as real answers come in). Crises are sized and spaced from it. */
    function rate(){
      const t=g.ct,w=60000;while(g.made.length&&g.made[0][0]<=t-w)g.made.shift();
      let cells=0;for(const m of g.made)cells+=m[1];
      let n=0;for(const p of g.players.values())if(here(p)&&!p.pod)n++;
      return Math.max(1,cells+Math.max(1,n)*(1-Math.min(1,t/w)));
    }
    g.rate=rate;
    const meteorNeed=R=>clamp(Math.round(R*0.3),2,16);   // about a third of what the class makes in a minute: many hands
    const fireNeed=R=>clamp(Math.round(R*0.1),1,5);
    // The engine needs about what the class would put in between the warm-up and the twist, if four cells in ten go
    // to the engine (the rest goes to crises and air). Worked out from the class's pace when the cell goes in.
    function engTotal(){return Math.max(6,0.4*rate()*((C.LEN[g.len]-C.WARM)*0.9/60000)/0.6);}
    g.engTotal=engTotal;
    const o2Fall=()=>clamp(rate()/60,C.O2.MIN,C.O2.MAX);   // keeping the air up costs about a tenth of the energy
    function meteor(R){
      const free=ROOMS.map((_,i)=>i).filter(r=>!meteorIn(r));if(!free.length)return;
      const room=free[Math.floor(rnd()*free.length)],T=g.mode==='fight'?C.METEOR.FAST:C.METEOR.T;
      g.crises.push({id:g.id++,k:'m',room,got:0,need:meteorNeed(R),t0:g.ct,t1:g.ct+T});g.last=g.ct;fx('alarm',room);
    }
    function fire(room,R,spread){
      if(room<0||fireIn(room))return;
      g.crises.push({id:g.id++,k:'f',room,got:0,need:fireNeed(R),t0:g.ct,t1:g.ct+C.FIRE.SPREAD});
      if(!spread)g.last=g.ct;fx(spread?'spread':'fire',room);
    }
    function spawn(dt){
      const t=g.ct;if(g.ph==='play'&&t<C.WARM)return;
      const R=rate(),esc=escaping();
      if(!g.first&&g.ph==='play'){g.first=true;meteor(R);return;}   // the warm-up ends with the first meteor
      g.acc=Math.min(g.acc+(g.ph==='play'?0.5:esc?0.25:0.45)*R*dt/60000,24);
      if(t-g.last<C.GAP)return;
      const nm=g.crises.filter(c=>c.k==='m').length,nf=g.crises.filter(c=>c.k==='f').length;
      let k=g.next||(esc?'f':rnd()<0.55?'m':'f');
      if(k==='m'&&(esc||nm>=C.METEOR.MAX))k='f';
      if(k==='f'&&nf>=C.FIRE.AT_ONCE)k=!esc&&nm<C.METEOR.MAX?'m':'';
      if(!k)return;g.next=k;
      const cost=k==='m'?meteorNeed(R):fireNeed(R)*1.5;
      if(g.acc<cost)return;
      g.acc-=cost;g.next='';
      if(k==='m')meteor(R);else{const free=ROOMS.map((_,i)=>i).filter(r=>!fireIn(r));fire(free[Math.floor(rnd()*free.length)]??-1,R);}
    }

    /* ── Phases ── */
    g.start=()=>{
      if(!g.qs.length)return false;
      Object.assign(g,{ct:0,hull:100,o2:100,eng:0,crises:[],fx:[],mode:'',fin:0,made:[],acc:0,last:0,first:false,next:'',end:null,
        tally:{right:0,blocked:0,hits:0,out:0},qStat:g.qs.map(()=>({first:0,firstWrong:0,tries:0,wrong:0}))});
      for(const p of [...g.players.values()]){if(!here(p)){g.players.delete(p.id);continue;}ready(p);}
      g.ph='count';g.cd=C.COUNT;return true;
    };
    function final(mode){
      g.ph='final';g.mode=mode;g.fin=g.ct+(mode==='fight'?C.FIGHT:mode==='escape'?C.ESCAPE:C.EMERG);
      if(mode!=='fight')g.crises=g.crises.filter(c=>c.k!=='m');   // leaving: meteors don't matter any more, fires still block the way
      g.acc=0;g.last=g.ct;g.next='';fx('final',-1,'',mode);
    }
    g.final=final;
    function decide(){
      let f=0,e=0;for(const p of g.players.values()){if(p.vote==='f')f++;else if(p.vote==='e')e++;}
      final(e>f?'escape':'fight');   // a tie (or nobody voting) fights on
    }
    g.votes=()=>{let f=0,e=0;for(const p of g.players.values()){if(p.vote==='f')f++;else if(p.vote==='e')e++;}return [f,e];};
    g.crew=()=>{let n=0,b=0;for(const p of g.players.values())if(p.pod||here(p)){n++;if(p.pod)b++;}return [b,n];};
    function finish(stop){
      const saved=!stop&&g.eng>=100&&(g.ph==='play'||g.mode==='fight');
      const [boarded,crew]=g.crew(),everyone=crew>0&&boarded>=crew;
      const outcome=stop?'stop':saved?'saved':g.mode==='escape'?'escape':'emerg';
      // ★★★ station saved · ★★ everyone took the pod · ★ some got away (or an emergency escape after fighting on)
      const stars=outcome==='saved'?3:outcome==='escape'&&everyone?2:(outcome==='escape'||outcome==='emerg')&&boarded>0?1:0;
      const players=[...g.players.values()].map(p=>{
        let firstOk=0;const still=[];for(const [i,ok] of p.st.first){if(ok)firstOk++;else if(!p.st.fixed.has(i))still.push(i);}
        return {id:p.id,name:p.name,av:p.av,bot:p.bot,lv:p.lv,firstOk,firstN:p.st.first.size,right:p.st.right,wrong:p.st.wrong,fixed:p.st.fixed.size,still,energy:p.st.energy,pod:p.pod};
      });
      const hard=g.qStat.map((s,i)=>({i,text:g.qs[i]?.text||'',wrong:s.firstWrong,n:s.first,tries:s.tries}))
        .filter(x=>x.wrong>0).sort((a,b)=>b.wrong-a.wrong||b.wrong/b.n-a.wrong/a.n).slice(0,3);
      g.end={outcome,stars,boarded,crew,everyone,eng:Math.round(g.eng),hull:Math.round(g.hull),tally:{...g.tally},players,hard,mode:g.mode,len:g.ct};
      g.ph='end';g.crises=[];
    }
    g.stop=()=>{if(g.ph==='pause')g.ph=g.paused;if(g.ph==='lobby'||g.ph==='end')return;finish(true);};
    g.toLobby=()=>{g.ph='lobby';g.crises=[];g.fx=[];g.end=null;g.mode='';for(const p of [...g.players.values()])if(!here(p))g.players.delete(p.id);};
    g.pause=()=>{if(g.ph==='play'||g.ph==='final'||g.ph==='vote'||g.ph==='count'){g.paused=g.ph;g.ph='pause';}};
    g.resume=()=>{if(g.ph==='pause')g.ph=g.paused;};

    g.tick=dt=>{
      if(g.ph==='count'){g.cd-=dt;if(g.cd<=0){g.cd=0;g.ph='play';}return;}
      if(g.ph==='vote'){g.vt-=dt;
        for(const p of g.players.values())if(p.bot&&!p.vote&&rnd()<dt/2500)p.vote=rnd()<0.6?'f':'e';
        if(g.vt<=0)decide();return;}
      if(!active())return;
      g.ct+=dt;const t=g.ct;
      for(const p of g.players.values())if(p.walk&&t>=p.walk.t1){p.room=p.walk.to;p.walk=null;}
      // Leaving in the pod (it has its own air): the station's oxygen stops mattering.
      if(!escaping())g.o2=Math.max(0,g.o2-o2Fall()*dt/1000);
      for(const c of [...g.crises]){
        if(c.k==='f'){
          if(!escaping())g.hull=Math.max(0,g.hull-C.FIRE.DRAIN*dt/1000);
          if(t>=c.t1){c.t1=t+C.FIRE.SPREAD;const nf=g.crises.filter(x=>x.k==='f').length,free=NB[c.room].filter(r=>!fireIn(r));
            if(free.length&&nf<C.FIRE.MAX)fire(free[Math.floor(rnd()*free.length)],rate(),true);}
        }else if(t>=c.t1){
          g.crises.splice(g.crises.indexOf(c),1);g.hull=Math.max(0,g.hull-C.METEOR.HIT);g.tally.hits++;fx('hit',c.room);
          if(!fireIn(c.room))fire(c.room,rate(),true);
        }
      }
      spawn(dt);
      for(const p of g.players.values())if(p.bot)bot(p);
      while(g.fx.length&&g.fx[0].at<t-6000)g.fx.shift();
      if(g.ph==='play'){
        if(g.eng>=100)return finish();
        if(g.hull<=0)return final('emerg');
        if((g.eng>=C.TWIST_AT&&t>=C.TWIST_MIN)||t>=C.LEN[g.len]){g.ph='vote';g.vt=C.VOTE;for(const p of g.players.values())p.vote='';fx('twist');}
      }else if(g.mode==='fight'){
        if(g.eng>=100)return finish();
        if(g.hull<=0||t>=g.fin)return final('emerg');
      }else{
        const [b,n]=g.crew();if(t>=g.fin||(n>0&&b>=n))return finish();
      }
    };

    /* ── Robot players (for trying the game alone): answer now and then, then carry the energy where it is needed most. ── */
    function jobs(){
      const list=[];
      for(const c of g.crises)if(c.got<c.need)list.push({room:c.room,task:c.k==='f'?'fire':'shield',w:c.k==='m'?3+(30000-(c.t1-g.ct))/10000:2});
      if(!fireIn(C.OXYGEN)&&g.o2<100)list.push({room:C.OXYGEN,task:'o2',w:g.o2<40?2.6:0.2});
      if(!fireIn(C.ENGINE)&&!escaping()&&!warming()&&g.eng<100)list.push({room:C.ENGINE,task:'engine',w:g.mode==='fight'?2.4:1});
      return list;
    }
    function bot(p){
      const t=g.ct;if(p.walk)return;
      if(p.q>=0&&p.e2<C.E_MAX&&t>=p.cd&&t>=p.botNext){answer(p,{q:p.q,v:botValue(g.qs[p.q],rnd()<0.72)});p.botNext=t+C.BOT[0]+rnd()*C.BOT[1];}
      if(p.pod||t<p.botAct)return;p.botAct=t+1200+rnd()*1800;
      if(escaping()){const need=C.BOARD[g.mode]*2,f=fireIn(C.POD);
        if(p.room!==C.POD){if(p.e2>=need||(f&&p.e2>=2))go(p,C.POD);return;}
        if(f){put(p,'fire');return;}put(p,'board');return;}
      if(p.e2<2)return;
      let best=null,bs=-Infinity;
      // (not perfect: a bit of randomness, like a real crew that doesn't always agree)
      for(const j of jobs()){const s=j.w-route(p.room,j.room,burning()).ms/4000+rnd()*2;if(s>bs){bs=s;best=j;}}
      if(!best)return;if(best.room===p.room)put(p,best.task);else go(p,best.room);
    }

    /* ── Snapshot for the phones (compact arrays) ── */
    g.snapshot=()=>{
      const s={ph:g.ph,ct:Math.round(g.ct),cd:Math.round(g.cd),vt:Math.round(g.vt),hull:Math.round(g.hull*10)/10,o2:Math.round(g.o2*10)/10,eng:Math.round(g.eng*10)/10,
        md:g.mode,fin:Math.round(g.fin),len:g.len,nq:g.qs.length,pz:g.ph==='pause'?g.paused:'',
        c:g.crises.map(c=>[c.id,c.k,c.room,c.got,c.need,Math.round(c.t0),Math.round(c.t1)]),
        p:[...g.players.values()].map(p=>[p.id,p.name,p.av,p.room??C.START,flatWalk(p.walk),p.e2||0,p.q??-1,p.rs||0,p.rk??-1,Math.round(p.cd||0),p.pod?1:0,p.vote||'',p.dev||'',p.away?1:0,p.bot?1:0,p.gain||0]),
        fx:g.fx.map(f=>[f.id,f.k,f.room,Math.round(f.at),f.by,f.w]),k:g.kicked.slice(-12)};
      if(g.ph==='vote'||g.paused==='vote')s.v=g.votes();
      if(g.ph==='final')s.cr=g.crew();
      if(g.end){const e=g.end;s.end={o:e.outcome,s:e.stars,b:e.boarded,n:e.crew,eng:e.eng,hull:e.hull,ta:e.tally,
        me:e.players.map(p=>[p.id,p.firstOk,p.firstN,p.right,p.energy,p.fixed])};}
      return s;
    };
    return g;
  }
  /* Unpack a snapshot into objects (phones). */
  function unpack(s){
    return {...s,
      c:(s.c||[]).map(a=>({id:a[0],k:a[1],room:a[2],got:a[3],need:a[4],t0:a[5],t1:a[6]})),
      p:(s.p||[]).map(a=>({id:a[0],name:a[1],av:a[2],room:a[3],walk:unWalk(a[4]),e2:a[5],q:a[6],rs:a[7],rk:a[8],cd:a[9],pod:!!a[10],vote:a[11],dev:a[12],away:!!a[13],bot:!!a[14],gain:a[15]||0})),
      fx:(s.fx||[]).map(a=>({id:a[0],k:a[1],room:a[2],at:a[3],by:a[4],w:a[5]})),
      end:s.end?{...s.end,me:new Map((s.end.me||[]).map(a=>[a[0],{firstOk:a[1],firstN:a[2],right:a[3],energy:a[4],fixed:a[5]}]))}:null};
  }
  /* Snapshots: Supabase's free plan allows 100 messages a second, and every phone that receives one counts.
     Returns [the shortest gap after something happened, the regular gap] in ms for this many phones. */
  function snapGaps(phones){const min=Math.max(150,Math.round((phones+1)*1000/55));return [min,Math.max(min,phones<=10?500:1000)];}

  /* Results as a table (tab separated, pastes straight into Excel). Bots are left out. */
  function resultTable(end,qs=[]){
    const head=['名字 Name','第一次就答对 First try','第一次答对率 %','一共答对 Right','答错 Wrong','订正 Fixed','还不会的题 Still wrong','送出能量 Energy'];
    const rows=end.players.filter(p=>!p.bot).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>[p.name,`${p.firstOk}/${p.firstN}`,p.firstN?Math.round(p.firstOk/p.firstN*100):'',p.right,p.wrong,p.fixed,
      p.still.map(i=>i+1).join(' '),p.energy]);
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
  /* The animal picture (Hook Rush's artwork) — or a coloured circle with the first letter if it can't load. */
  const avatarSrc=av=>`../hook/img/animal-${normAv(av,'x')}.png`;

  const api={C,ROOMS,LINKS,NB,ANIMALS,clamp,rng,pickRoom,avOf,normAv,route,plan,walkAt,flatWalk,unWalk,botValue,createGame,unpack,snapGaps,resultTable,
    createNet,createLocalNet,freshen,latestVersion,pressFeedback,sfx,avatarSrc};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.RescueGame=api;
})(globalThis);
