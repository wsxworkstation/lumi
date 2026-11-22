/* Hook Rush 勾题大作战 — shared engine for the teacher's console (host.js) and the students' phones (player.js).
   The teacher's computer is the referee: it runs the game (createGame), checks every answer and sends a snapshot
   4 times a second. Phones draw the same arena themselves, move their own player at once, and smooth everyone else,
   so one slow phone only stutters for that student. Question fish follow paths computed from a seed, so their
   movement costs no network messages.
   Look: a picnic by a lake — round little animals fish for question fish. Optional decoded sprites have
   procedural fallbacks; game rules and networking do not depend on artwork. */
(root=>{
  'use strict';
  const C={
    W:1200,H:675,SEA:{x:600,y:337,rx:330,ry:175},
    PR:20,SPEED:230,RANGE:400,OUT:950,BACK:650,TIP:12,
    ORB:{n:{r:24,val:1,w:[0.32,0.55]},f:{r:18,val:2,w:[0.95,1.35]},g:{r:24,val:2,w:[0.7,0.95]}},
    ANSWER:15000,FREEZE:3000,TARGET:20,LIMIT:300000,RESPAWN:1200,COUNT:3000,SNAP:250,
    // Item cards: lie on the shore, walk over one to pick it up (hold up to 2), tap to use.
    CARD:{UP:2000,ICE:3000,SHIELD:10000,R_UP:160,PICK:38,MAX:2,FIRST:6000,EVERY:[15000,20000],ON_MAP:2,SPREAD:0.34},
    // A glowing goldfish shows up now and then; answer it right and every fish is worth 2 for a while.
    RUSH:{FIRST:40000,AFTER:40000,LEN:15000},
    TEAMS:[{zh:'草莓队',en:'Strawberry',color:'#ff7096',ink:'#e2416c',soft:'#ffe6ee'},
           {zh:'蓝莓队',en:'Blueberry',color:'#5a9cff',ink:'#2f74de',soft:'#e3eeff'},
           {zh:'薄荷队',en:'Mint',color:'#3cc895',ink:'#139466',soft:'#dcf6ea'}]
  };
  /* The little animals a student can be. */
  const ANIMALS=[
    {zh:'小猫',en:'Kitty',kind:'cat',body:'#ffc58f',dark:'#eb9a5e',ear:'tri',inner:'#ffb3c1'},
    {zh:'小熊',en:'Bear',kind:'bear',body:'#cfa07a',dark:'#a37352',ear:'round',inner:'#f0d2b4'},
    {zh:'兔兔',en:'Bunny',kind:'bunny',body:'#fffaf6',dark:'#e9d6cb',ear:'long',inner:'#ffc0cf'},
    {zh:'企鹅',en:'Penguin',kind:'penguin',body:'#5d6f98',dark:'#ffad4d'},
    {zh:'小狗',en:'Puppy',kind:'dog',body:'#f6dcb2',dark:'#c99764',ear:'flop'},
    {zh:'熊猫',en:'Panda',kind:'panda',body:'#ffffff',dark:'#3b3a45',ear:'round',inner:'#3b3a45',earBody:'#3b3a45'},
    {zh:'青蛙',en:'Froggy',kind:'frog',body:'#9edb7b',dark:'#73bd57'},
    {zh:'小鸡',en:'Chick',kind:'chick',body:'#ffe36e',dark:'#ffa94d'},
    {zh:'狐狸',en:'Fox',kind:'fox',body:'#ffab6b',dark:'#e07e40',ear:'tri',inner:'#fff2e3'},
    {zh:'小猪',en:'Piggy',kind:'pig',body:'#ffc6d2',dark:'#f39ab0',ear:'pig',inner:'#ff9fb6'}
  ];
  /* The five item cards. */
  const CARDS={up:{zh:'击飞',en:'Knock up',color:'#ff9a3c'},ice:{zh:'冷冻',en:'Freeze',color:'#4fb3f2'},shield:{zh:'保护罩',en:'Shield',color:'#3cc895'},
    x2:{zh:'加倍',en:'Double',color:'#f2b000'},tri:{zh:'三连钩',en:'Triple',color:'#9a7cff'}};
  // Card odds. A team that is behind gets the strong ones more often, a team far ahead gets more defence.
  const ODDS={even:{up:3,ice:3,shield:2,x2:2,tri:1},behind:{up:2,ice:2,shield:1,x2:3,tri:3},ahead:{up:3,ice:3,shield:3,x2:1,tri:0.5}};
  /* Room numbers count up from 0001: the smallest one nobody is using. */
  function pickRoom(used){for(let n=1;n<10000;n++){const c=String(n).padStart(4,'0');if(!used.has(c))return c;}return '0001';}
  const avOf=id=>{let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;return h%ANIMALS.length;};
  const normAv=(v,id)=>{v=Number(v);return Number.isInteger(v)&&v>=0&&v<ANIMALS.length?v:avOf(id);};
  const TURN=C.RANGE/C.OUT*1000;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  function bases(n){return n===3?[{x:70,y:115},{x:1130,y:115},{x:600,y:620}]:[{x:70,y:337},{x:1130,y:337}];}
  /* Keep a player on the shore: inside the arena, outside the sea. */
  function confine(x,y){
    x=clamp(x,C.PR,C.W-C.PR);y=clamp(y,C.PR,C.H-C.PR);
    const s=C.SEA,ex=(x-s.x)/(s.rx+C.PR),ey=(y-s.y)/(s.ry+C.PR),e=ex*ex+ey*ey;
    if(e<1){const k=e<1e-6?1:1/Math.sqrt(e);if(e<1e-6){x=s.x-s.rx-C.PR;}else{x=s.x+(x-s.x)*k;y=s.y+(y-s.y)*k;}}
    return {x,y};
  }
  /* An orb's path: a slow Lissajous loop inside the sea, fixed by its seed. */
  const pathCache=new Map();
  function orbPos(o,t){
    const key=o.id+':'+o.s;let p=pathCache.get(key);
    if(!p){const r=rng(o.s),w=C.ORB[o.k].w,sp=()=>w[0]+(w[1]-w[0])*r();
      p={ax:C.SEA.rx*0.6*(0.55+0.45*r()),ay:C.SEA.ry*0.6*(0.55+0.45*r()),w1:sp(),w2:sp()*(0.8+0.4*r()),p1:r()*6.283,p2:r()*6.283};
      if(pathCache.size>400)pathCache.clear();pathCache.set(key,p);}
    const s=(t-o.b)/1000;
    return {x:C.SEA.x+p.ax*Math.sin(p.w1*s+p.p1),y:C.SEA.y+p.ay*Math.sin(p.w2*s+p.p2)};
  }
  /* A hook flies out until it catches something or reaches its range, then reels back. */
  function hookDist(h,t){
    const turn=h.tt||h.t0+TURN,d=h.tt?h.d:C.RANGE;
    return t<turn?Math.min(C.RANGE,C.OUT*(t-h.t0)/1000):d-C.BACK*(t-turn)/1000;
  }
  const outgoing=(h,t)=>!h.tt&&t<h.t0+TURN;
  function hookTip(h,t){const d=clamp(hookDist(h,t),0,C.RANGE);return {x:h.x+Math.cos(h.a)*d,y:h.y+Math.sin(h.a)*d,d};}
  const hookDone=(h,t)=>!outgoing(h,t)&&hookDist(h,t)<=0;
  /* Closest point on segment a→b to point p: returns [distance, fraction]. */
  function segDist(a,b,p){const vx=b.x-a.x,vy=b.y-a.y,l=vx*vx+vy*vy,f=l?clamp(((p.x-a.x)*vx+(p.y-a.y)*vy)/l,0,1):0;return [Math.hypot(a.x+vx*f-p.x,a.y+vy*f-p.y),f];}

  /* ── The referee: one game, run on the teacher's computer ── */
  function createGame(opt={}){
    const rnd=opt.rng||Math.random,check=opt.check||((q,v)=>JSON.stringify(v)===JSON.stringify(q.answer));
    const g={ph:'lobby',t:0,cd:0,teams:2,sc:[0,0,0],players:new Map(),orbs:[],hooks:[],qs:[],qStats:[],deck:[],kicked:new Map(),end:null,target:opt.target||C.TARGET,limit:opt.limit||C.LIMIT,log:[],
      items:opt.items!==false,drops:[],dropN:0,dropAt:0,fx:[],fxN:0,rush:0,glowAt:0};
    const fresh=()=>({st:0,until:0,q:-1,orb:0,ok:0,bad:0,rk:0,goal:null,cool:800,botAt:0,cards:[],sh:0,x2:0,tri:0,bag:[],triLeft:0,triBad:false,useAt:0});
    const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
    const seed=()=>Math.floor(rnd()*2**31);
    // Start positions on the team's picnic blanket, rows far enough apart that names don't cover the animal below.
    function place(p,i){const b=bases(g.teams)[p.team],n=i??0,bottom=g.teams===3&&p.team===2,per=g.teams===3&&!bottom?4:5,row=n%per-(per-1)/2,line=Math.floor(n/per);
      const pos=bottom?confine(b.x+row*84,b.y-line*52):confine(b.x+(p.team===1?-1:1)*line*80,b.y+row*56);p.x=pos.x;p.y=pos.y;p.dx=p.dy=0;}
    function teamCount(){const n=Array(g.teams).fill(0);for(const p of g.players.values())n[p.team]++;return n;}
    function placeAll(){const seen=Array(3).fill(0);for(const p of g.players.values())place(p,seen[p.team]++);}
    g.setQuestions=qs=>{g.qs=qs;g.qStats=qs.map(()=>({right:0,wrong:0}));g.deck=[];};
    g.join=(id,name,bot=false,av)=>{
      id=String(id);name=String(name||'').trim().slice(0,16)||'玩家';
      if(g.kicked.has(id))return null;
      let p=g.players.get(id);
      if(p){p.name=name;if(av!=null)p.av=normAv(av,id);p.seen=Date.now();return p;}
      const n=teamCount(),team=n.indexOf(Math.min(...n));
      p={id,name,team,av:normAv(av,id),x:0,y:0,dx:0,dy:0,...fresh(),qn:0,rs:0,bot,seq:-1,seen:Date.now()};
      g.players.set(id,p);place(p,n[team]);return p;
    };
    function releaseOrb(id,delay){const o=g.orbs.find(x=>x.id===id);if(o){o.s=seed();o.b=g.t+delay;o.hk='';o.by='';}}
    g.kick=id=>{const p=g.players.get(id);if(!p)return;g.players.delete(id);if(!p.bot)g.kicked.set(id,Date.now());
      g.hooks=g.hooks.filter(h=>{if(h.o!==id)return true;if(h.orb)releaseOrb(h.orb,300);return false;});
      if(p.st===1&&p.orb)releaseOrb(p.orb,300);for(const o of p.bag)releaseOrb(o,300);};
    g.setTeams=n=>{g.teams=n===3?3:2;const list=shuffle([...g.players.values()]);list.forEach((p,i)=>p.team=i%g.teams);placeAll();};
    g.start=()=>{
      g.ph='count';g.cd=C.COUNT;g.t=0;g.sc=[0,0,0];g.hooks=[];g.end=null;g.deck=[];g.qStats=g.qs.map(()=>({right:0,wrong:0}));
      g.drops=[];g.dropAt=C.CARD.FIRST;g.fx=[];g.rush=0;g.glowAt=C.RUSH.FIRST;
      for(const p of g.players.values())Object.assign(p,fresh());
      placeAll();
      const n=clamp(Math.round(g.players.size*0.5)+3,5,13),fast=Math.max(1,Math.round(n/4));
      g.orbs=Array.from({length:n},(_,i)=>({id:i+1,k:i<fast?'f':'n',s:seed(),b:0,hk:'',by:''}));
    };
    g.pause=()=>{if(g.ph==='play')g.ph='pause';};
    g.resume=()=>{if(g.ph==='pause')g.ph='play';};
    g.toLobby=()=>{g.ph='lobby';g.end=null;g.hooks=[];g.orbs=[];g.drops=[];g.fx=[];g.rush=0;placeAll();for(const p of g.players.values())Object.assign(p,{st:0,q:-1,orb:0,cards:[],sh:0,x2:0,tri:0,bag:[],triLeft:0,triBad:false});};
    function draw(){if(!g.deck.length)g.deck=shuffle(g.qs.map((_,i)=>i));return g.deck.pop();}
    function orbAt(o,t){
      if(o.by){const p=g.players.get(o.by);if(!p)return null;const held=g.orbs.filter(x=>x.by===o.by),i=held.indexOf(o);return {x:p.x+(i-(held.length-1)/2)*30,y:p.y-54};}
      if(o.hk){const h=g.hooks.find(x=>x.o===o.hk&&x.orb===o.id);return h?hookTip(h,t):null;}
      return t<o.b?null:orbPos(o,t);
    }
    g.orbAt=o=>orbAt(o,g.t);
    function fire(p,x,y,a,t0){
      if(g.ph!=='play'||p.st!==0||g.hooks.some(h=>h.o===p.id)||!Number.isFinite(a))return false;
      const pos=confine(Number(x)||p.x,Number(y)||p.y);p.x=pos.x;p.y=pos.y;p.dx=p.dy=0;
      t0=clamp(Number(t0)||g.t,g.t-400,g.t);
      // Triple-hook card: three lines in a fan; every fish caught is answered one after another.
      if(p.tri){p.tri=0;p.triLeft=3;for(const d of [-C.CARD.SPREAD,0,C.CARD.SPREAD])g.hooks.push({o:p.id,x:p.x,y:p.y,a:a+d,t0,tt:0,d:0,orb:0,lt:t0,tri:1});}
      else g.hooks.push({o:p.id,x:p.x,y:p.y,a,t0,tt:0,d:0,orb:0,lt:t0});
      return true;
    }
    /* Start answering a caught fish. */
    function ask(p,oid){const o=g.orbs.find(x=>x.id===oid);if(!o)return;o.hk='';o.by=p.id;p.st=1;p.orb=o.id;p.q=draw();p.qn++;p.until=g.t+C.ANSWER;}
    // A wrong answer freezes — but after a triple cast, only once all three fish are done.
    function endTurn(p){if(p.triBad){p.st=2;p.until=g.t+C.FREEZE;}p.triBad=false;}

    /* ── Item cards ── */
    const addFx=(k,p,to=[],extra={})=>{g.fx.push({id:++g.fxN,k,at:g.t,by:p.id,x:Math.round(p.x),y:Math.round(p.y),to,...extra});};
    function dropHooks(p){g.hooks=g.hooks.filter(h=>{if(h.o!==p.id)return true;if(h.orb)releaseOrb(h.orb,300);return false;});p.triLeft=0;p.triBad=false;}
    // Hit by a card. Someone answering a question is never hit; a shield takes the hit instead (and breaks).
    function hit(q,kind){
      if(q.sh>g.t){q.sh=0;addFx('block',q,[q.id]);return false;}
      dropHooks(q);q.dx=q.dy=0;q.st=kind==='up'?3:2;q.until=g.t+(kind==='up'?C.CARD.UP:C.CARD.ICE);return true;
    }
    const foes=p=>[...g.players.values()].filter(q=>q.team!==p.team&&q.st===0);
    g.targets=(p,k)=>k==='up'?foes(p).filter(q=>Math.hypot(q.x-p.x,q.y-p.y)<=C.CARD.R_UP)
      :k==='ice'?foes(p).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).slice(0,1):[p];
    function useCard(p,i){
      i=Number(i)||0;const k=p.cards[i];
      if(g.ph!=='play'||p.st!==0||!k)return false;
      const tg=g.targets(p,k);if(!tg.length)return false;   // nobody to hit: keep the card
      if(k==='up')addFx('up',p,tg.filter(q=>hit(q,'up')).map(q=>q.id));
      else if(k==='ice'){const q=tg[0];addFx('ice',p,hit(q,'ice')?[q.id]:[],{tx:Math.round(q.x),ty:Math.round(q.y)});}
      else if(k==='shield'){p.sh=g.t+C.CARD.SHIELD;addFx('shield',p);}
      else if(k==='x2'){p.x2=1;addFx('x2',p);}
      else if(k==='tri'){p.tri=1;addFx('tri',p);}
      p.cards.splice(i,1);return true;
    }
    function cardFor(p){
      const sc=g.sc.slice(0,g.teams),gap=sc[p.team]-Math.max(...sc.filter((_,i)=>i!==p.team));
      const w=gap<=-3?ODDS.behind:gap>=3?ODDS.ahead:ODDS.even;let r=rnd()*Object.values(w).reduce((a,b)=>a+b,0);
      for(const [k,v] of Object.entries(w)){r-=v;if(r<0)return k;}return 'up';
    }
    // A new card on the shore. If a team is behind, it tends to land on their side.
    function spawnDrop(){
      const sc=g.sc.slice(0,g.teams),lo=Math.min(...sc),behind=Math.max(...sc)-lo>=2?sc.indexOf(lo):-1,B=bases(g.teams);let best=null;
      for(let i=0;i<4;i++){
        const a=rnd()*Math.PI*2,k=1.2+rnd()*0.3,s=confine(clamp(C.SEA.x+C.SEA.rx*k*Math.cos(a),60,C.W-60),clamp(C.SEA.y+C.SEA.ry*k*Math.sin(a),50,C.H-50));
        if(g.drops.some(d=>Math.hypot(d.x-s.x,d.y-s.y)<160))continue;
        const score=behind>=0?Math.hypot(s.x-B[behind].x,s.y-B[behind].y):rnd();if(!best||score<best.score)best={x:s.x,y:s.y,score};
      }
      if(best)g.drops.push({id:++g.dropN,x:Math.round(best.x),y:Math.round(best.y)});
    }
    function stepItems(){
      if(g.t>=g.dropAt){if(g.drops.length<C.CARD.ON_MAP)spawnDrop();g.dropAt=g.t+C.CARD.EVERY[0]+rnd()*(C.CARD.EVERY[1]-C.CARD.EVERY[0]);}
      for(const d of [...g.drops])for(const p of g.players.values())
        if(p.st===0&&p.cards.length<C.CARD.MAX&&Math.hypot(p.x-d.x,p.y-d.y)<=C.CARD.PICK){p.cards.push(cardFor(p));g.drops.splice(g.drops.indexOf(d),1);break;}
    }
    // The glowing goldfish: one at a time, then a pause after each rush.
    function stepRush(){
      if(g.rush&&g.t>=g.rush){g.rush=0;g.glowAt=g.t+C.RUSH.AFTER;}
      if(!g.rush&&g.t>=g.glowAt&&!g.orbs.some(o=>o.k==='g')){
        const free=g.orbs.filter(o=>o.k==='n'&&!o.hk&&!o.by);
        if(free.length){const o=free[Math.floor(rnd()*free.length)];o.k='g';o.s=seed();o.b=g.t;}
        g.glowAt=g.t+C.RUSH.AFTER;
      }
    }
    function finish(reason){
      const top=Math.max(...g.sc.slice(0,g.teams)),win=g.sc.slice(0,g.teams).filter(s=>s===top).length>1?-1:g.sc.indexOf(top);
      let hard=-1,most=0;g.qStats.forEach((s,i)=>{if(s.wrong>most){most=s.wrong;hard=i;}});
      g.ph='end';g.hooks=[];
      g.end={win,reason,hard,hardWrong:most,hardText:hard>=0?g.qs[hard].text:'',
        players:[...g.players.values()].sort((a,b)=>b.ok-a.ok||a.bad-b.bad).map(p=>[p.name,p.team,p.ok,p.bad,p.av])};
    }
    g.stop=()=>{if(g.ph==='play'||g.ph==='pause'||g.ph==='count')finish('stop');};
    function settle(p,ok,timeout){
      const o=g.orbs.find(x=>x.id===p.orb),st=g.qStats[p.q];
      let val=o?C.ORB[o.k].val:1;if(g.rush)val=Math.max(val,2);
      if(st)ok?st.right++:st.wrong++;
      g.log.push({t:g.t,id:p.id,q:p.q,ok,timeout:!!timeout});
      if(ok){if(p.x2){val*=2;p.x2=0;}g.sc[p.team]+=val;p.ok++;p.rk=val;
        if(o){if(o.k==='g'){o.k='n';g.rush=g.t+C.RUSH.LEN;addFx('rush',p);}releaseOrb(o.id,C.RESPAWN);}}
      else{p.bad++;p.rk=-1;p.triBad=true;g.deck.splice(Math.floor(rnd()*(g.deck.length+1)),0,p.q);if(o)releaseOrb(o.id,300);}
      p.rs++;p.orb=0;p.botAt=0;p.st=0;
      if(p.bag.length)ask(p,p.bag.shift());else if(!p.triLeft)endTurn(p);
      if(g.sc[p.team]>=g.target)finish('target');
    }
    g.answer=(id,qn,v)=>{const p=g.players.get(id);if(!p||g.ph!=='play'||p.st!==1||qn!==p.qn)return false;settle(p,!!check(g.qs[p.q],v));return true;};
    g.input=m=>{
      const p=m&&g.players.get(String(m.id));
      if(m?.k==='join')return g.join(m.id,m.name,false,m.av);
      if(!p)return null;p.seen=Date.now();
      if(m.k==='mv'){if(m.s<=p.seq)return;p.seq=m.s;if(p.st!==0||g.hooks.some(h=>h.o===p.id)||g.ph!=='play')return;
        // The phone stamps its message with the game time, so the walk it did while the message travelled is added back.
        const l=Math.hypot(m.dx||0,m.dy||0),dx=l?m.dx/l:0,dy=l?m.dy/l:0,lag=clamp(g.t-(Number(m.t)||g.t),0,600)/1000;
        const pos=confine((Number(m.x)||p.x)+dx*C.SPEED*lag,(Number(m.y)||p.y)+dy*C.SPEED*lag);p.x=pos.x;p.y=pos.y;p.dx=dx;p.dy=dy;}
      else if(m.k==='fire')fire(p,m.x,m.y,Number(m.a),m.t);
      else if(m.k==='ans')g.answer(p.id,m.qn,m.v);
      else if(m.k==='use')useCard(p,m.i);
      return p;
    };
    g.useCard=(id,i)=>{const p=g.players.get(id);return !!p&&useCard(p,i);};
    function botThink(p,dt){
      if(p.st===1){if(!p.botAt)p.botAt=g.t+2000+rnd()*6000;
        if(g.t>=p.botAt){const q=g.qs[p.q],good=rnd()<0.65;let v;
          if(q.type==='fill')v=good?q.accept[0]:'?';else if(good)v=q.answer;else{const wrong=q.options.map((_,i)=>i+1).filter(n=>!q.answer.includes(n));v=[wrong[0]||1];}
          settle(p,!!check(q,v));}
        return;}
      if(p.st!==0)return;
      // Bots use their cards a little while after picking them up (and keep a card if nobody is in reach).
      if(p.cards.length){if(!p.useAt)p.useAt=g.t+1500+rnd()*3000;if(g.t>=p.useAt){p.useAt=0;useCard(p,0);}}
      if(g.hooks.some(h=>h.o===p.id))return;
      const near=p.cards.length<C.CARD.MAX&&g.drops.find(d=>Math.hypot(d.x-p.x,d.y-p.y)<320);
      if(near)p.goal={x:near.x,y:near.y};
      if(!p.goal||Math.hypot(p.goal.x-p.x,p.goal.y-p.y)<12){const a=rnd()*6.283;p.goal=confine(C.SEA.x+(C.SEA.rx+30)*Math.cos(a),C.SEA.y+(C.SEA.ry+30)*Math.sin(a));}
      const gx=p.goal.x-p.x,gy=p.goal.y-p.y,l=Math.hypot(gx,gy)||1;p.dx=gx/l;p.dy=gy/l;
      p.cool-=dt;if(p.cool>0)return;
      let best=null;
      for(const o of g.orbs){if(o.by||(o.hk&&g.players.get(o.hk)?.team===p.team))continue;const at=orbAt(o,g.t);if(!at)continue;
        const d=Math.hypot(at.x-p.x,at.y-p.y);if(d>C.RANGE*0.95)continue;
        const fut=o.hk?at:orbPos(o,g.t+d/C.OUT*1000);if(!best||d<best.d)best={d,x:fut.x,y:fut.y};}
      if(best){fire(p,p.x,p.y,Math.atan2(best.y-p.y,best.x-p.x)+(rnd()-0.5)*0.25,g.t);p.cool=500+rnd()*1500;}
    }
    function stepHooks(){
      const t=g.t;
      for(const h of [...g.hooks].sort((a,b)=>a.t0-b.t0)){
        const owner=g.players.get(h.o);
        if(!h.orb&&outgoing(h,h.lt)){
          const end=Math.min(t,h.t0+TURN),a=hookTip(h,h.lt),b=hookTip(h,end);let hit=null;
          for(const o of g.orbs){
            if(o.by||o.hk===h.o)continue;
            // Can't steal from a teammate, or from someone behind a shield.
            if(o.hk){const from=g.players.get(o.hk);if(from?.team===owner?.team||from?.sh>t)continue;}
            const at=orbAt(o,t);if(!at)continue;
            const [dist,f]=segDist(a,b,at);if(dist<=C.TIP+C.ORB[o.k].r&&(!hit||f<hit.f))hit={o,f};
          }
          if(hit){const when=h.lt+(end-h.lt)*hit.f;h.tt=Math.max(when,h.t0+1);h.d=Math.min(C.RANGE,C.OUT*(h.tt-h.t0)/1000);
            if(hit.o.hk){const prev=g.hooks.find(x=>x.o===hit.o.hk&&x.orb===hit.o.id);if(prev)prev.orb=0;}
            hit.o.hk=h.o;h.orb=hit.o.id;}
        }
        h.lt=t;
      }
      g.hooks=g.hooks.filter(h=>{
        if(!hookDone(h,t))return true;
        const p=g.players.get(h.o),o=h.orb&&g.orbs.find(x=>x.id===h.orb&&x.hk===h.o);
        if(p&&h.tri)p.triLeft=Math.max(0,p.triLeft-1);
        if(o){if(p&&p.st===0&&g.qs.length)ask(p,o.id);
          else if(p&&p.st===1&&h.tri){o.hk='';o.by=p.id;p.bag.push(o.id);}   // wait in line behind the fish being answered
          else releaseOrb(o.id,300);}
        else if(p&&h.tri&&!p.triLeft&&p.st===0&&!p.bag.length)endTurn(p);
        return false;
      });
    }
    g.tick=dt=>{
      if(g.ph==='count'){g.cd-=dt;if(g.cd<=0){g.cd=0;g.ph='play';}return;}
      if(g.ph!=='play')return;
      g.t+=dt;
      for(const p of g.players.values()){
        if(p.bot)botThink(p,dt);
        if(g.ph!=='play')return;
        if(p.st===1&&g.t>=p.until){settle(p,false,true);if(g.ph!=='play')return;}
        if((p.st===2||p.st===3)&&g.t>=p.until)p.st=0;
        if(p.st===0&&(p.dx||p.dy)&&!g.hooks.some(h=>h.o===p.id)){const pos=confine(p.x+p.dx*C.SPEED*dt/1000,p.y+p.dy*C.SPEED*dt/1000);p.x=pos.x;p.y=pos.y;}
      }
      stepHooks();
      if(g.items)stepItems();
      stepRush();
      if(g.fx.length&&g.t-g.fx[0].at>3000)g.fx=g.fx.filter(f=>g.t-f.at<=3000);
      if(g.t>=g.limit)finish('time');
    };
    g.snapshot=()=>{
      const now=Date.now();for(const [id,at] of g.kicked)if(now-at>15000)g.kicked.delete(id);
      return {ph:g.ph,t:Math.round(g.t),cd:Math.ceil(g.cd),tc:g.teams,sc:g.sc.slice(0,g.teams),tg:g.target,tl:g.limit,nq:g.qs.length,
        p:[...g.players.values()].map(p=>[p.id,p.name,p.team,Math.round(p.x),Math.round(p.y),+p.dx.toFixed(2),+p.dy.toFixed(2),p.st,Math.round(p.until),p.q,p.ok,p.rs,p.rk,p.qn,p.av,
          p.cards.join(','),p.sh>g.t?Math.round(p.sh):0,(p.x2?1:0)|(p.tri?2:0)]),
        o:g.orbs.map(o=>[o.id,o.k,o.s,Math.round(o.b),o.hk,o.by]),
        h:g.hooks.map(h=>[h.o,Math.round(h.x),Math.round(h.y),+h.a.toFixed(4),Math.round(h.t0),Math.round(h.tt),Math.round(h.d),h.orb]),
        d:g.drops.map(d=>[d.id,d.x,d.y]),fx:g.fx.map(f=>[f.id,f.k,Math.round(f.at),f.by,f.x,f.y,f.to,f.tx||0,f.ty||0]),
        ru:g.rush?Math.round(g.rush):0,it:g.items?1:0,
        k:[...g.kicked.keys()],end:g.end};
    };
    return g;
  }
  /* Supabase free plan: 100 Realtime messages a second for the whole project, and every phone that receives a
     snapshot counts. More phones → fewer snapshots (phones fill the gaps by themselves). */
  const snapEvery=phones=>phones<=6?250:phones<=12?333:phones<=16?400:500;
  /* Unpack a snapshot into objects (phones). */
  function unpack(s){
    return {...s,
      p:s.p.map(a=>({id:a[0],name:a[1],team:a[2],x:a[3],y:a[4],dx:a[5],dy:a[6],st:a[7],until:a[8],q:a[9],ok:a[10],rs:a[11],rk:a[12],qn:a[13],av:a[14]??avOf(a[0]),
        cards:a[15]?String(a[15]).split(','):[],sh:a[16]||0,x2:!!(a[17]&1),tri:!!(a[17]&2)})),
      d:(s.d||[]).map(a=>({id:a[0],x:a[1],y:a[2]})),
      fx:(s.fx||[]).map(a=>({id:a[0],k:a[1],at:a[2],by:a[3],x:a[4],y:a[5],to:a[6]||[],tx:a[7],ty:a[8]})),ru:s.ru||0,it:s.it??1,
      o:s.o.map(a=>({id:a[0],k:a[1],s:a[2],b:a[3],hk:a[4],by:a[5]})),
      h:s.h.map(a=>({o:a[0],x:a[1],y:a[2],a:a[3],t0:a[4],tt:a[5],d:a[6],orb:a[7]}))};
  }

  /* ── Network: Supabase Realtime (Phoenix websocket) for listening and the host's pushes; REST broadcast for phones' messages ── */
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
      // How long (ms) we have been unable to reach the server; 0 while connected. Lets the screens warn instead of waiting forever.
      downFor(){return open?0:Date.now()-downSince;},
      close(){closed=true;clearInterval(hb);ws?.close();}
    };
  }
  /* Same interface inside one browser (?local): tabs talk through BroadcastChannel, for testing without the cloud. */
  function createLocalNet(){
    const chans=new Map(),send=(topic,event,payload)=>{const c=new BroadcastChannel('hook:'+topic);c.postMessage({event,payload});c.close();return true;};
    return {
      join(topic,fn){const c=new BroadcastChannel('hook:'+topic);c.onmessage=e=>fn(e.data.event,e.data.payload);chans.set(topic,c);},
      leave(topic){chans.get(topic)?.close();chans.delete(topic);},
      push:send,post:(t,e,p)=>Promise.resolve(send(t,e,p)),onStatus:fn=>fn(true),downFor:()=>0,close(){for(const c of chans.values())c.close();}
    };
  }

  /* ── Drawing: a picnic by a lake ── */
  const FUN='"Fredoka","ZCOOL KuaiLe",system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  const TAU=Math.PI*2,INK='rgba(74,52,64,.62)',EYE='#3a2a35',GRASS='#bde8a2';
  const paint=(ctx,c)=>{ctx.fillStyle=c;ctx.fill();ctx.stroke();};
  function rr(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function sparkle(ctx,x,y,s){ctx.beginPath();ctx.moveTo(x,y-s);ctx.quadraticCurveTo(x,y,x+s,y);ctx.quadraticCurveTo(x,y,x,y+s);ctx.quadraticCurveTo(x,y,x-s,y);ctx.quadraticCurveTo(x,y,x,y-s);ctx.fill();}
  function viewport(cw,ch){const k=Math.min(cw/C.W,ch/C.H);return {k,ox:(cw-C.W*k)/2,oy:(ch-C.H*k)/2};}

  /* A round little animal at (0,0), about 48 wide. o = {team, ex, ey (where the eyes look), face, step (walking feet)} */
  function ears(ctx,A,s){
    ctx.beginPath();
    if(A.ear==='tri'){const t=A.kind==='fox'?-37:-33;ctx.moveTo(s*5,-19);ctx.lineTo(s*19,t);ctx.lineTo(s*22.5,-9);ctx.closePath();paint(ctx,A.body);
      ctx.beginPath();ctx.moveTo(s*9.5,-17);ctx.lineTo(s*18,t+7);ctx.lineTo(s*19.5,-12);ctx.closePath();ctx.fillStyle=A.inner;ctx.fill();}
    else if(A.ear==='pig'){ctx.moveTo(s*7,-20);ctx.lineTo(s*22,-29);ctx.lineTo(s*20.5,-11);ctx.closePath();paint(ctx,A.body);
      ctx.beginPath();ctx.moveTo(s*10.5,-19);ctx.lineTo(s*19.5,-24.5);ctx.lineTo(s*18.5,-14);ctx.closePath();ctx.fillStyle=A.inner;ctx.fill();}
    else if(A.ear==='round'){ctx.arc(s*16,-17,8.5,0,TAU);paint(ctx,A.earBody||A.body);ctx.beginPath();ctx.arc(s*16,-17,4.5,0,TAU);ctx.fillStyle=A.inner;ctx.fill();}
    else if(A.ear==='long'){ctx.ellipse(s*9,-33,7,16,s*0.14,0,TAU);paint(ctx,A.body);ctx.beginPath();ctx.ellipse(s*9.4,-31,3.4,11,s*0.14,0,TAU);ctx.fillStyle=A.inner;ctx.fill();}
    else if(A.ear==='flop'){ctx.ellipse(s*20,-6,7,13.5,-s*0.38,0,TAU);paint(ctx,A.dark);}
    else if(A.kind==='frog'){ctx.arc(s*10,-18,8.5,0,TAU);paint(ctx,A.body);ctx.beginPath();ctx.arc(s*10,-18,5.8,0,TAU);ctx.fillStyle='#fff';ctx.fill();}
    else if(A.kind==='chick'&&s===1)for(const [x,y,r] of [[-3.5,-24,-0.5],[0,-26,0],[3.5,-24,0.5]]){ctx.beginPath();ctx.ellipse(x,y,2.8,6.5,r,0,TAU);paint(ctx,A.body);}
  }
  function details(ctx,A){
    const k=A.kind,el=(x,y,rx,ry,c,r=0,line=false)=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,r,0,TAU);ctx.fillStyle=c;ctx.fill();if(line)ctx.stroke();};
    ctx.lineWidth=1.6;
    if(k==='cat'){ctx.strokeStyle=A.dark;ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(-5,-20);ctx.lineTo(-4,-15);ctx.moveTo(0,-21);ctx.lineTo(0,-15.5);ctx.moveTo(5,-20);ctx.lineTo(4,-15);ctx.stroke();
      ctx.strokeStyle=INK;ctx.lineWidth=1.2;ctx.beginPath();for(const s of [-1,1]){ctx.moveTo(s*15,3.5);ctx.lineTo(s*23,1.5);ctx.moveTo(s*15,7);ctx.lineTo(s*23,8);}ctx.stroke();}
    else if(k==='bear'){el(0,7.5,9.5,7,A.inner,0,true);el(0,4,3.3,2.4,'#4a3540');}
    else if(k==='bunny')el(0,4,2.4,1.7,'#ff8fa8');
    else if(k==='penguin'){ctx.beginPath();ctx.arc(-7,-1,12.5,0,TAU);ctx.arc(7,-1,12.5,0,TAU);ctx.fillStyle='#fff';ctx.fill();el(0,7,15,11,'#fff');
      ctx.beginPath();ctx.moveTo(-4.5,4.5);ctx.lineTo(4.5,4.5);ctx.lineTo(0,10.5);ctx.closePath();ctx.fillStyle='#ffad4d';ctx.fill();ctx.stroke();}
    else if(k==='dog'){el(0,8,9,6.5,'#fff4e2');el(0,4.8,3.5,2.6,'#4a3540');}
    else if(k==='panda'){for(const s of [-1,1])el(s*8.5,-2,6,7.8,'#3b3a45',-s*0.45);el(0,6,3,2.2,'#3b3a45');}
    else if(k==='chick'){for(const s of [-1,1])el(s*22.5,5,4.5,8,A.body,-s*0.3,true);
      ctx.beginPath();ctx.moveTo(-5,5.5);ctx.lineTo(0,2);ctx.lineTo(5,5.5);ctx.lineTo(0,10);ctx.closePath();ctx.fillStyle='#ffa94d';ctx.fill();ctx.stroke();}
    else if(k==='fox'){for(const s of [-1,1])el(s*9,10,10,7.5,'#fff4e8');el(0,5,3,2.2,'#4a3540');}
    else if(k==='pig'){el(0,7,8.5,5.8,A.inner,0,true);el(-2.8,7,1.4,2.1,'#c0607c');el(2.8,7,1.4,2.1,'#c0607c');}
    ctx.strokeStyle=INK;ctx.lineWidth=2;
  }
  function scarf(ctx,T){
    ctx.beginPath();ctx.moveTo(-17,14);ctx.quadraticCurveTo(0,24,17,14);
    ctx.strokeStyle=INK;ctx.lineWidth=8.5;ctx.stroke();ctx.strokeStyle=T.color;ctx.lineWidth=6;ctx.stroke();
    ctx.strokeStyle=INK;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(8,18);ctx.lineTo(14,16.5);ctx.lineTo(15.5,27);ctx.lineTo(9,27.5);ctx.closePath();paint(ctx,T.color);
    ctx.lineWidth=2;
  }
  const MOUTH={cat:['w',7.5],bear:['w',10],bunny:['w',6.5],dog:['w',10],panda:['w',9],fox:['w',8],pig:['s',14.5],frog:['wide',2]};
  function face(ctx,A,ex,ey,mood){
    const k=A.kind,frog=k==='frog',eye=k==='panda'?'#fff':EYE;
    ctx.strokeStyle=eye;ctx.fillStyle=eye;ctx.lineWidth=2.2;
    for(const s of [-1,1]){const x=frog?s*10+ex*0.8:s*8.5+ex,y=frog?-18+ey*0.8:-3+ey;ctx.beginPath();
      if(mood==='happy'){ctx.arc(x,y+1.5,3.2,Math.PI*1.15,Math.PI*1.85);ctx.stroke();}
      else if(mood==='frozen'){ctx.moveTo(x+s*3,y-3);ctx.lineTo(x-s*2,y);ctx.lineTo(x+s*3,y+3);ctx.stroke();}
      else{ctx.arc(x,y,frog?3:3.3,0,TAU);ctx.fill();if(k!=='panda'){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x+1,y-1.2,1.15,0,TAU);ctx.fill();ctx.fillStyle=eye;}}}
    ctx.fillStyle='rgba(255,120,150,.42)';for(const s of [-1,1]){ctx.beginPath();ctx.ellipse(s*15,frog?4:5,4.6,2.8,0,0,TAU);ctx.fill();}
    const m=MOUTH[k];if(!m)return;const [type,y]=m;
    ctx.strokeStyle=EYE;ctx.lineWidth=1.6;ctx.beginPath();
    if(mood==='happy'){ctx.arc(0,y-1,type==='wide'?6:3.8,0,Math.PI);ctx.closePath();ctx.fillStyle='#e0566f';ctx.fill();ctx.stroke();}
    else if(mood==='frozen'){ctx.arc(0,y,1.8,0,TAU);ctx.stroke();}
    else if(type==='w'){ctx.arc(-2.3,y,2.3,0.15*Math.PI,0.95*Math.PI);ctx.moveTo(4.6,y);ctx.arc(2.3,y,2.3,0.05*Math.PI,0.85*Math.PI);ctx.stroke();}
    else if(type==='wide'){ctx.arc(0,y,10,0.22*Math.PI,0.78*Math.PI);ctx.stroke();}
    else{ctx.arc(0,y-2,3,0.2*Math.PI,0.8*Math.PI);ctx.stroke();}
  }
  function drawAnimal(ctx,av,o={}){
    const A=ANIMALS[av]||ANIMALS[0],k=A.kind,step=o.step||0;
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=2;ctx.strokeStyle=INK;
    const sprite=globalThis.HookArt?.get('animal-'+(ANIMALS[av]?av:0));
    if(sprite){
      ctx.drawImage(sprite,-32,-38+step*0.25,64,64);
      if(o.team!=null&&o.team>=0&&C.TEAMS[o.team])scarf(ctx,C.TEAMS[o.team]);
      ctx.restore();return;
    }
    for(const s of [-1,1]){ctx.beginPath();ctx.ellipse(s*9,21+s*step,7,4.6,0,0,TAU);paint(ctx,A.dark);}
    const after=k==='frog'||A.ear==='flop';
    if(!after)for(const s of [-1,1])ears(ctx,A,s);
    ctx.beginPath();ctx.ellipse(0,0,24,22,0,0,TAU);paint(ctx,A.body);
    if(after)for(const s of [-1,1])ears(ctx,A,s);
    details(ctx,A);
    if(o.team!=null&&o.team>=0&&C.TEAMS[o.team])scarf(ctx,C.TEAMS[o.team]);
    face(ctx,A,o.ex||0,o.ey||0,o.face||'');
    ctx.restore();
  }
  /* A picture of an animal for the HTML screens (name screen, lobby, results). */
  const icons=new Map();
  function animalIcon(av,size=64,team=-1){
    const key=av+'|'+size+'|'+team+'|'+(globalThis.HookArt?.revision||0);if(icons.has(key))return icons.get(key);
    if(typeof document==='undefined')return '';
    const d=Math.min(2,globalThis.devicePixelRatio||1),cv=document.createElement('canvas');cv.width=cv.height=Math.round(size*d);
    const ctx=cv.getContext('2d'),k=size*d/64;ctx.scale(k,k);ctx.translate(32,40);ctx.scale(0.8,0.8);
    drawAnimal(ctx,av,{team});
    const url=cv.toDataURL();icons.set(key,url);return url;
  }

  /* The still parts of the scene are drawn once into a picture and reused every frame. */
  function blankets(tc){return tc===3?[{x:6,y:14,w:190,h:240},{x:1004,y:14,w:190,h:240},{x:396,y:542,w:408,h:126}]:[{x:6,y:196,w:190,h:284},{x:1004,y:196,w:190,h:284}];}
  function blanket(ctx,b,T){
    ctx.save();rr(ctx,b.x,b.y,b.w,b.h,18);ctx.fillStyle=T.soft;ctx.fill();ctx.clip();
    ctx.globalAlpha=0.3;ctx.fillStyle=T.color;
    for(let x=b.x+8;x<b.x+b.w;x+=28)ctx.fillRect(x,b.y,14,b.h);
    for(let y=b.y+8;y<b.y+b.h;y+=28)ctx.fillRect(b.x,y,b.w,14);
    ctx.restore();
    ctx.save();ctx.setLineDash([7,6]);ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=3;rr(ctx,b.x+7,b.y+7,b.w-14,b.h-14,12);ctx.stroke();ctx.restore();
  }
  function lily(ctx,x,y,rot,bloom){
    ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.fillStyle='#86d17c';ctx.strokeStyle='#62b35a';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,17,0.35,TAU-0.05);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.4)';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-11,-6);ctx.moveTo(0,0);ctx.lineTo(-4,12);ctx.stroke();ctx.restore();
    if(bloom){ctx.fillStyle='#ffb3c9';for(let i=0;i<6;i++){const a=i*TAU/6;ctx.beginPath();ctx.ellipse(x+Math.cos(a)*5,y-4+Math.sin(a)*5,5,3,a,0,TAU);ctx.fill();}
      ctx.fillStyle='#ffd84d';ctx.beginPath();ctx.arc(x,y-4,3,0,TAU);ctx.fill();}
  }
  function flower(ctx,x,y,col){ctx.fillStyle=col;for(let i=0;i<5;i++){const a=i*TAU/5;ctx.beginPath();ctx.arc(x+Math.cos(a)*4.5,y+Math.sin(a)*4.5,3.6,0,TAU);ctx.fill();}
    ctx.fillStyle='#ffc93c';ctx.beginPath();ctx.arc(x,y,2.6,0,TAU);ctx.fill();}
  function tuft(ctx,x,y){ctx.strokeStyle='#92cb75';ctx.lineWidth=2.4;ctx.lineCap='round';ctx.beginPath();
    ctx.moveTo(x-6,y-3);ctx.quadraticCurveTo(x-5,y+3,x-1,y+5);ctx.moveTo(x,y-6);ctx.lineTo(x,y+5);ctx.moveTo(x+6,y-3);ctx.quadraticCurveTo(x+5,y+3,x+1,y+5);ctx.stroke();}
  function hedge(ctx){
    const spots=[];
    for(let x=0;x<=C.W;x+=34)spots.push([x,-6],[x,C.H+6]);
    for(let y=34;y<C.H;y+=34)spots.push([-6,y],[C.W+6,y]);
    const rad=([x,y])=>20+((x*7+y*13)%9);
    ctx.fillStyle='#78bd62';for(const p of spots){ctx.beginPath();ctx.arc(p[0],p[1]+3,rad(p),0,TAU);ctx.fill();}
    ctx.fillStyle='#95d57c';for(const p of spots){ctx.beginPath();ctx.arc(p[0],p[1],rad(p),0,TAU);ctx.fill();}
    ctx.fillStyle='rgba(255,255,255,.22)';for(const p of spots){const r=rad(p);ctx.beginPath();ctx.arc(p[0]-r*.3,p[1]-r*.35,r*.35,0,TAU);ctx.fill();}
    ctx.fillStyle='#ff7a8f';spots.forEach((p,i)=>{if(i%5)return;for(const [dx,dy] of [[6,4],[12,-1]]){ctx.beginPath();ctx.arc(p[0]+dx,p[1]+dy,3,0,TAU);ctx.fill();}});
  }
  function scenery(scale,tc){
    const cv=document.createElement('canvas');cv.width=Math.ceil(C.W*scale);cv.height=Math.ceil(C.H*scale);
    const ctx=cv.getContext('2d'),r=rng(20261119),s=C.SEA,bl=blankets(tc);ctx.scale(scale,scale);
    const background=globalThis.HookArt?.get('lakeside');
    if(background){ctx.drawImage(background,0,0,C.W,C.H);bl.forEach((b,i)=>blanket(ctx,b,C.TEAMS[i]));return cv;}
    ctx.fillStyle=GRASS;ctx.fillRect(0,0,C.W,C.H);
    ctx.fillStyle='rgba(255,255,255,.13)';for(let i=0;i<16;i++){ctx.beginPath();ctx.ellipse(r()*C.W,r()*C.H,50+r()*80,24+r()*36,0,0,TAU);ctx.fill();}
    bl.forEach((b,i)=>blanket(ctx,b,C.TEAMS[i]));
    ctx.fillStyle='#ffe9b8';ctx.strokeStyle='#f5d590';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(s.x,s.y+4,s.rx+26,s.ry+22,0,0,TAU);ctx.fill();ctx.stroke();
    const w=ctx.createRadialGradient(s.x,s.y-40,20,s.x,s.y,s.rx);w.addColorStop(0,'#bdeeff');w.addColorStop(.55,'#86d3f8');w.addColorStop(1,'#5cb9ee');
    ctx.fillStyle=w;ctx.beginPath();ctx.ellipse(s.x,s.y,s.rx,s.ry,0,0,TAU);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.6)';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(s.x,s.y,s.rx-7,s.ry-7,0,0,TAU);ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=3;
    for(let i=0;i<9;i++){const a=r()*TAU,k=0.2+r()*0.5;ctx.beginPath();ctx.arc(s.x+Math.cos(a)*s.rx*k,s.y+Math.sin(a)*s.ry*k,10+r()*8,Math.PI*1.15,Math.PI*1.85);ctx.stroke();}
    [0.5,2.5,3.8,5.55].forEach((a,i)=>lily(ctx,s.x+Math.cos(a)*s.rx*0.87,s.y+Math.sin(a)*s.ry*0.8,a*3,i===1));
    const clear=(x,y)=>((x-s.x)/(s.rx+55))**2+((y-s.y)/(s.ry+50))**2>1&&x>36&&x<C.W-36&&y>36&&y<C.H-36&&!bl.some(b=>x>b.x-12&&x<b.x+b.w+12&&y>b.y-12&&y<b.y+b.h+12);
    const petals=['#ffffff','#ffd3e1','#fff1a8','#dccfff'];
    for(let i=0,n=0;i<400&&n<60;i++){const x=r()*C.W,y=r()*C.H;if(!clear(x,y))continue;n++;n%2?tuft(ctx,x,y):flower(ctx,x,y,petals[n%4]);}
    hedge(ctx);
    return cv;
  }
  /* Moving water: little ripples and twinkles. */
  function water(ctx,now){
    const s=C.SEA;ctx.save();ctx.beginPath();ctx.ellipse(s.x,s.y,s.rx-4,s.ry-4,0,0,TAU);ctx.clip();
    ctx.strokeStyle='#fff';ctx.lineWidth=2.5;
    for(let i=0;i<4;i++){const c=now/2600+i*0.25,ph=c%1,n=Math.floor(c),a=i*1.9+n*2.3,k=0.3+((i*0.37+n*0.61)%1)*0.4;
      const x=s.x+Math.cos(a)*s.rx*k,y=s.y+Math.sin(a)*s.ry*k,rad=6+ph*26;
      ctx.globalAlpha=(1-ph)*0.55;ctx.beginPath();ctx.ellipse(x,y,rad,rad*0.45,0,0,TAU);ctx.stroke();}
    ctx.fillStyle='#fff';
    for(let i=0;i<7;i++){const a=i*0.9+1,k=0.25+(i*0.13)%0.6,tw=Math.sin(now/420+i*1.7);if(tw<0.2)continue;
      ctx.globalAlpha=(tw-0.2)*0.9;sparkle(ctx,s.x+Math.cos(a)*s.rx*k,s.y+Math.sin(a)*s.ry*k,3+tw*3);}
    ctx.restore();
  }

  /* Question fish: coral "?" fish worth 1, small gold "×2" fish worth 2. */
  const FISH={n:{body:'#ff9479',belly:'#ffd3c4',fin:'#ff7a63',line:'rgba(150,60,50,.5)',s:1},f:{body:'#ffd23f',belly:'#fff4b8',fin:'#ffae1f',line:'rgba(150,100,0,.5)',s:0.8},
    g:{body:'#ffcf2e',belly:'#fff7cc',fin:'#ff9f1a',line:'rgba(160,90,0,.6)',s:1.12},r:{body:'#ffd23f',belly:'#fff4b8',fin:'#ffae1f',line:'rgba(150,100,0,.5)',s:1}};
  const fishMem=new Map();
  function fishFace(o){let m=fishMem.get(o.id);if(!m){m={x:o.x,f:1};fishMem.set(o.id,m);}const vx=o.x-m.x;if(Math.abs(vx)>0.15)m.f=vx>0?1:-1;m.x=o.x;return m.f;}
  /* rush: during a goldfish rush every ordinary fish turns gold (worth 2). */
  function drawFish(ctx,o,now,rush){
    const kind=o.k==='n'&&rush?'r':o.k,F=FISH[kind]||FISH.n,a=o.alpha??1;if(a<=0)return;
    const face=fishFace(o),busy=o.held||o.hooked,s=F.s*(o.held?0.72:1),wig=Math.sin(now/(o.k==='f'?60:120)+o.id*1.3);
    ctx.save();ctx.globalAlpha=a;ctx.translate(o.x,o.y);
    // The glowing goldfish: a soft pulsing halo with turning rays, so everyone sees it from far away.
    if(o.k==='g'){const pu=0.75+Math.sin(now/220)*0.25,glow=globalThis.HookArt?.get('rush-glow');
      if(glow){ctx.save();ctx.globalAlpha=a*pu*0.65;ctx.drawImage(glow,-65*s,-52*s,130*s,104*s);ctx.restore();}
      else{const gr=ctx.createRadialGradient(0,0,6,0,0,58*s);
      gr.addColorStop(0,`rgba(255,236,140,${0.75*pu})`);gr.addColorStop(1,'rgba(255,214,80,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,58*s,0,TAU);ctx.fill();}
      ctx.save();ctx.rotate(now/1600);ctx.strokeStyle=`rgba(255,226,120,${0.55*pu})`;ctx.lineWidth=4;ctx.lineCap='round';
      for(let i=0;i<8;i++){const r=i*TAU/8;ctx.beginPath();ctx.moveTo(Math.cos(r)*36*s,Math.sin(r)*30*s);ctx.lineTo(Math.cos(r)*50*s,Math.sin(r)*42*s);ctx.stroke();}ctx.restore();}
    if(!busy){ctx.fillStyle='rgba(255,255,255,.3)';ctx.beginPath();ctx.ellipse(0,11*s,26*s,7*s,0,0,TAU);ctx.fill();}
    if(kind!=='n'){ctx.fillStyle='#fff';for(let i=0;i<3;i++){const t=now/500+i*2.1,tw=Math.sin(t*2);if(tw>0)sparkle(ctx,Math.cos(t)*30*s,Math.sin(t)*20*s-4,2+tw*3.5);}}
    ctx.rotate(busy?wig*0.35:wig*0.06);ctx.scale(face*s,s);
    const sprite=globalThis.HookArt?.get(kind==='g'?'fish-special':kind==='n'?'fish-normal':'fish-gold');
    if(sprite)ctx.drawImage(sprite,-36,-24,66,44);
    else{
    ctx.lineJoin='round';ctx.strokeStyle=F.line;ctx.lineWidth=2;
    ctx.save();ctx.translate(-17,0);ctx.rotate(wig*(busy?0.5:0.3));ctx.fillStyle=F.fin;
    ctx.beginPath();ctx.moveTo(2,0);ctx.quadraticCurveTo(-8,-4,-14,-13);ctx.quadraticCurveTo(-10,0,-14,13);ctx.quadraticCurveTo(-8,4,2,0);ctx.fill();ctx.stroke();ctx.restore();
    ctx.fillStyle=F.fin;ctx.beginPath();ctx.moveTo(-8,-13);ctx.quadraticCurveTo(-2,-25,9,-14);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=F.body;ctx.beginPath();ctx.ellipse(0,0,22,16,0,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle=F.belly;ctx.beginPath();ctx.ellipse(3,6.5,14,6.5,0,0,TAU);ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(11,-4,4.6,0,TAU);ctx.fill();
    ctx.fillStyle=EYE;ctx.beginPath();ctx.arc(12,-4,2.8,0,TAU);ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(12.8,-5.2,1,0,TAU);ctx.fill();
    ctx.fillStyle='rgba(255,110,140,.45)';ctx.beginPath();ctx.ellipse(10,4,3.4,2.2,0,0,TAU);ctx.fill();
    ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(18,1.5,2.2,0.3,2.2);ctx.stroke();
    }
    ctx.scale(face,1);const mark=kind==='f'||kind==='r'?'×2':'?';
    ctx.font=`700 ${mark==='×2'?14:18}px ${FUN}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3.5;ctx.strokeStyle=F.fin;ctx.fillStyle='#fff';
    ctx.strokeText(mark,-4*face,0);ctx.fillText(mark,-4*face,0);
    ctx.restore();
  }

  /* Each player: little animations remembered between frames (hop when right, shake when wrong, which way they face). */
  const pMem=new Map();
  function pState(p,now){
    let m=pMem.get(p.id);if(!m){m={rs:p.rs,rk:0,at:-1e9,fx:1,fy:0};pMem.set(p.id,m);}
    if(p.rs!=null&&p.rs!==m.rs){m.rs=p.rs;m.rk=p.rk;m.at=now;}
    if(p.fx||p.fy){m.fx=p.fx;m.fy=p.fy;}
    return m;
  }
  function flake(ctx,x,y,s,rot){ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.strokeStyle='#6fc0ef';ctx.lineWidth=2;ctx.beginPath();
    for(let i=0;i<3;i++){const a=i*Math.PI/3;ctx.moveTo(Math.cos(a)*s,Math.sin(a)*s);ctx.lineTo(-Math.cos(a)*s,-Math.sin(a)*s);}ctx.stroke();ctx.restore();}
  function ice(ctx,now){
    ctx.fillStyle='rgba(200,240,255,.58)';ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=2.5;rr(ctx,-29,-34,58,64,12);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-21,-20);ctx.lineTo(-11,-28);ctx.moveTo(-22,-10);ctx.lineTo(-18,-13);ctx.stroke();
    flake(ctx,19,-42+Math.sin(now/300)*2,6,now/900);flake(ctx,-17,-46+Math.cos(now/340)*2,4.5,-now/1000);
  }
  function drawBody(ctx,p,now,m,hook){
    const T=C.TEAMS[p.team]||C.TEAMS[0],A=ANIMALS[p.av]||ANIMALS[0],since=now-m.at;
    const jump=m.rk>0&&since<650?Math.sin(since/650*Math.PI)*22:0,shake=m.rk<0&&since<450?Math.sin(since/28)*3.5:0;
    const bob=p.mv?-Math.abs(Math.sin(now/90))*3.5:Math.sin(now/520+p.x*0.05)*0.8,step=p.mv?Math.sin(now/90)*2.4:0;
    // Knocked up by a card: tossed into the air, spinning stars over the head.
    const air=p.st===3?34+Math.sin(now/110)*5:0;
    ctx.save();ctx.translate(p.x+shake,p.y);
    ctx.globalAlpha=0.4;ctx.fillStyle=T.color;ctx.beginPath();ctx.ellipse(0,24,22-jump*0.25-air*0.25,7,0,0,TAU);ctx.fill();ctx.globalAlpha=1;
    if(p.me){ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.setLineDash([5,5]);ctx.lineDashOffset=-now/40;ctx.beginPath();ctx.ellipse(0,24,29,10.5,0,0,TAU);ctx.stroke();ctx.setLineDash([]);}
    if(p.upRange){ctx.strokeStyle='rgba(255,154,60,.55)';ctx.lineWidth=2.5;ctx.setLineDash([8,8]);ctx.beginPath();ctx.ellipse(0,10,C.CARD.R_UP,C.CARD.R_UP,0,0,TAU);ctx.stroke();ctx.setLineDash([]);}
    ctx.translate(0,bob-jump-air);
    if(air){ctx.rotate(Math.sin(now/90)*0.35);}
    const ra=hook?Math.atan2(hook.ty-p.y,hook.tx-p.x):Math.atan2(m.fy,m.fx),side=Math.cos(ra)>=0?1:-1,behind=Math.sin(ra)<-0.3;
    const hand={x:side*17,y:6},tip={x:hand.x+Math.cos(ra)*26,y:hand.y+Math.sin(ra)*21-8};
    const rod=()=>{ctx.lineCap='round';ctx.strokeStyle='#b07a45';ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(hand.x,hand.y);ctx.lineTo(tip.x,tip.y);ctx.stroke();
      ctx.strokeStyle=INK;ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(hand.x,hand.y,4.8,0,TAU);paint(ctx,A.body);};
    const holding=p.st!==1&&p.st!==3;
    if(holding&&behind)rod();
    drawAnimal(ctx,p.av,{team:p.team,ex:m.fx*2.4,ey:p.st===1?-2.2:m.fy*1.6,face:p.st===2||p.st===3?'frozen':jump>0?'happy':'',step:air?Math.sin(now/60)*3:step});
    if(holding&&!behind)rod();
    if(p.st===2)ice(ctx,now);
    if(air)dizzy(ctx,now);
    if(p.sh)bubble(ctx,now);
    ctx.restore();
    return {x:p.x+shake+tip.x,y:p.y+bob-jump-air+tip.y};
  }
  function dizzy(ctx,now){ctx.fillStyle='#ffc93c';ctx.strokeStyle='#fff';ctx.lineWidth=1.5;
    for(let i=0;i<3;i++){const a=now/260+i*TAU/3;ctx.save();ctx.translate(Math.cos(a)*22,-40+Math.sin(a)*6);sparkle(ctx,0,0,6);ctx.restore();}}
  // Shield card: a soft bubble around the animal.
  function bubble(ctx,now){const r=37+Math.sin(now/260)*1.5,gr=ctx.createRadialGradient(-10,-14,4,0,-2,r);
    gr.addColorStop(0,'rgba(255,255,255,.35)');gr.addColorStop(0.75,'rgba(140,235,200,.16)');gr.addColorStop(1,'rgba(60,200,149,.32)');
    ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,-2,r,0,TAU);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=2.5;ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,-2,r-7,-2.5,-1.7);ctx.stroke();}
  function thinking(ctx,x,y,now){
    ctx.fillStyle='#fff';ctx.strokeStyle='rgba(74,52,64,.25)';ctx.lineWidth=2;
    rr(ctx,x-4,y-14,38,24,12);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(x-7,y+14,3.5,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle='#a98bff';for(let i=0;i<3;i++){const b=Math.max(0,Math.sin(now/170-i*0.9))*3;ctx.beginPath();ctx.arc(x+6+i*9,y-2-b,2.9,0,TAU);ctx.fill();}
  }
  function drawLabel(ctx,p,now,m){
    const T=C.TEAMS[p.team]||C.TEAMS[0],since=now-m.at;
    ctx.font=`600 16px ${FUN}`;ctx.textAlign='center';ctx.textBaseline='middle';
    const w=Math.min(150,ctx.measureText(p.name).width)+18,y=p.y+44;
    rr(ctx,p.x-w/2,y-11,w,22,11);ctx.fillStyle=p.me?T.color:'rgba(255,255,255,.94)';ctx.fill();ctx.strokeStyle=p.me?'#fff':T.color;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=p.me?'#fff':T.ink;ctx.fillText(p.name,p.x,y+1,150);
    // Waiting power-ups: ×2 (double) and 三连 (triple hook), as little tags after the name.
    let bx=p.x+w/2+4;
    for(const [on,txt,col] of [[p.x2,'×2','#f2b000'],[p.tri,'三连','#9a7cff']]){if(!on)continue;
      ctx.font=`700 13px ${FUN}`;const bw=ctx.measureText(txt).width+12;rr(ctx,bx,y-10,bw,20,10);ctx.fillStyle=col;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='#fff';ctx.textAlign='left';ctx.fillText(txt,bx+6,y+1);ctx.textAlign='center';bx+=bw+3;}
    ctx.font=`600 16px ${FUN}`;
    if(p.st===1)thinking(ctx,p.x+26,p.y-36,now);
    else if(p.me){const b=Math.sin(now/220)*3,ty=p.y-60+b;ctx.fillStyle='#fff';ctx.strokeStyle=T.color;ctx.lineWidth=3;ctx.lineJoin='round';
      ctx.beginPath();ctx.moveTo(p.x-9,ty);ctx.lineTo(p.x+9,ty);ctx.lineTo(p.x,ty+11);ctx.closePath();ctx.stroke();ctx.fill();}
    if(m.rk>0&&since<1100){const k=since/1100,ty=p.y-62-k*34;ctx.globalAlpha=1-k*k;
      ctx.font=`700 28px ${FUN}`;ctx.lineWidth=6;ctx.lineJoin='round';ctx.strokeStyle='#fff';ctx.fillStyle=T.ink;ctx.strokeText('+'+m.rk,p.x,ty);ctx.fillText('+'+m.rk,p.x,ty);
      ctx.fillStyle='#ffc93c';for(let i=0;i<6;i++){const a=i*TAU/6+0.3,d=20+k*32;sparkle(ctx,p.x+Math.cos(a)*d,p.y-12+Math.sin(a)*d*0.8,6*(1-k)+1);}
      ctx.globalAlpha=1;}
  }
  /* A fishing line from the rod to the hook, with a little float while nothing is caught. */
  function drawLine(ctx,from,h){
    const T=C.TEAMS[h.team]||C.TEAMS[0],mx=(from.x+h.tx)/2,my=(from.y+h.ty)/2+(h.caught?4:12);
    ctx.lineCap='round';ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.quadraticCurveTo(mx,my,h.tx,h.ty);
    ctx.strokeStyle='rgba(60,70,100,.3)';ctx.lineWidth=4.5;ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=2.2;ctx.stroke();
    if(h.caught)return;
    ctx.strokeStyle='#8a94a6';ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(h.tx,h.ty+6,5,0,Math.PI);ctx.stroke();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(h.tx,h.ty-2,7,0,TAU);ctx.fill();
    ctx.fillStyle=T.color;ctx.beginPath();ctx.arc(h.tx,h.ty-2,7,Math.PI,TAU);ctx.fill();
    ctx.strokeStyle=INK;ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(h.tx,h.ty-2,7,0,TAU);ctx.stroke();
  }
  function aimDots(ctx,A){
    ctx.fillStyle='#fff';ctx.strokeStyle='#fff';ctx.lineWidth=3;
    for(const s of A.fan?[-C.CARD.SPREAD,0,C.CARD.SPREAD]:[0]){const a=A.a+s;
      for(let d=34;d<=C.RANGE;d+=24){ctx.globalAlpha=0.95-d/C.RANGE*0.55;ctx.beginPath();ctx.arc(A.x+Math.cos(a)*d,A.y+Math.sin(a)*d,3.6,0,TAU);ctx.fill();}
      ctx.globalAlpha=0.9;ctx.beginPath();ctx.arc(A.x+Math.cos(a)*C.RANGE,A.y+Math.sin(a)*C.RANGE,11,0,TAU);ctx.stroke();}
    ctx.globalAlpha=1;
  }
  /* A mystery card lying on the grass (what's inside is decided when someone picks it up). */
  function drawDrop(ctx,d,now){
    const b=Math.sin(now/300+d.id)*3,r=Math.sin(now/700+d.id)*0.12;
    ctx.save();ctx.translate(d.x,d.y);
    ctx.fillStyle='rgba(74,52,64,.16)';ctx.beginPath();ctx.ellipse(0,20,17-b,5,0,0,TAU);ctx.fill();
    ctx.translate(0,b-4);ctx.rotate(r);
    const sprite=globalThis.HookArt?.get('card-mystery');
    if(sprite)ctx.drawImage(sprite,-25,-30,50,60);
    else{
    const gr=ctx.createLinearGradient(0,-22,0,22);gr.addColorStop(0,'#c6a8ff');gr.addColorStop(1,'#ff8fb5');
    rr(ctx,-16,-21,32,42,8);ctx.fillStyle=gr;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();
    rr(ctx,-10,-15,20,30,5);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=1.5;ctx.stroke();
    ctx.font=`700 22px ${FUN}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText('?',0,1);
    }
    ctx.fillStyle='#fff';const tw=Math.max(0,Math.sin(now/260+d.id*2));if(tw>0.2)sparkle(ctx,15,-22,2+tw*4);
    ctx.restore();
  }
  const FX_TXT={up:['击飞！','#ff8a1f'],ice:['冷冻！','#3c9ad6'],shield:['保护罩','#139466'],x2:['加倍！','#d99a00'],tri:['三连钩！','#7b5cd6'],block:['挡住了！','#139466'],rush:['金鱼潮！','#e0a000']};
  function popText(ctx,txt,x,y,col,k,size=26){ctx.globalAlpha=Math.min(1,(1-k)*2.5);ctx.font=`700 ${size}px ${FUN}`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.lineJoin='round';ctx.lineWidth=6;ctx.strokeStyle='#fff';ctx.strokeText(txt,x,y);ctx.fillStyle=col;ctx.fillText(txt,x,y);ctx.globalAlpha=1;}
  /* Card effects: a shock ring for knock-up, an icy beam for freeze, a burst for the goldfish rush, and a word that floats up. */
  function drawFx(ctx,f){
    const a=f.age;if(a<0||a>1400)return;const k=a/1400,[txt,col]=FX_TXT[f.k]||['',''];
    if(f.k==='up'&&a<600){const q=a/600;ctx.globalAlpha=1-q;ctx.strokeStyle='#fff';ctx.lineWidth=8*(1-q)+2;ctx.beginPath();ctx.ellipse(f.x,f.y+10,C.CARD.R_UP*q,C.CARD.R_UP*q*0.8,0,0,TAU);ctx.stroke();
      ctx.strokeStyle='#ffb35c';ctx.lineWidth=3;ctx.stroke();ctx.globalAlpha=1;}
    if(f.k==='ice'&&a<700){const q=a/700;ctx.globalAlpha=1-q;ctx.strokeStyle='#bfe8ff';ctx.lineWidth=10*(1-q)+2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(f.x,f.y-10);ctx.lineTo(f.tx,f.ty-10);ctx.stroke();
      ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();for(let i=0;i<5;i++)flake(ctx,f.tx+Math.cos(i*1.26)*30*q,f.ty-10+Math.sin(i*1.26)*30*q,6,i);ctx.globalAlpha=1;}
    if((f.k==='shield'||f.k==='block')&&a<600){const q=a/600;ctx.globalAlpha=1-q;ctx.strokeStyle='#8eebc8';ctx.lineWidth=5;ctx.beginPath();ctx.arc(f.x,f.y-2,38+q*30,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
    if(f.k==='rush'&&a<900){const q=a/900;ctx.globalAlpha=1-q;ctx.fillStyle='#ffd23f';for(let i=0;i<12;i++){const r=i*TAU/12;sparkle(ctx,f.x+Math.cos(r)*90*q,f.y-20+Math.sin(r)*70*q,8*(1-q)+2);}ctx.globalAlpha=1;}
    if(txt)popText(ctx,txt,f.x,f.y-78-k*30,col,k,f.k==='rush'?34:26);
  }
  /* Goldfish rush: the lake glows warm gold and sparkles drift over it. */
  function rushGlow(ctx,now,left){
    const s=C.SEA,pu=0.85+Math.sin(now/300)*0.15,fade=Math.min(1,left/800);
    const glow=globalThis.HookArt?.get('rush-glow');
    if(glow){
      ctx.save();ctx.beginPath();ctx.ellipse(s.x,s.y,s.rx,s.ry,0,0,TAU);ctx.clip();
      ctx.globalAlpha=fade*pu*0.16;ctx.fillStyle='#ffd86a';ctx.fillRect(s.x-s.rx,s.y-s.ry,s.rx*2,s.ry*2);
      ctx.globalAlpha=fade*pu*0.32;ctx.drawImage(glow,s.x-s.rx,s.y-s.ry,s.rx*2,s.ry*2);ctx.restore();return;
    }
    ctx.save();ctx.globalAlpha=fade;ctx.fillStyle=`rgba(255,200,60,${0.13*pu})`;ctx.fillRect(0,0,C.W,C.H);
    const gr=ctx.createRadialGradient(s.x,s.y,20,s.x,s.y,s.rx);gr.addColorStop(0,`rgba(255,230,120,${0.35*pu})`);gr.addColorStop(1,'rgba(255,200,60,0)');
    ctx.fillStyle=gr;ctx.beginPath();ctx.ellipse(s.x,s.y,s.rx,s.ry,0,0,TAU);ctx.fill();
    ctx.fillStyle='#fff6c8';for(let i=0;i<14;i++){const t=now/2600+i*0.71,x=s.x+Math.cos(t*1.3+i)*s.rx*0.85,y=s.y+Math.sin(t+i*2.1)*s.ry*0.85,tw=Math.sin(now/240+i*1.7);if(tw>0)sparkle(ctx,x,y,2+tw*4);}
    ctx.restore();
  }
  let sceneKey='',sceneCv=null;
  /* V = {tc, players:[{id,x,y,team,av,name,st,me,fx,fy,mv,rs,rk,sh,x2,tri,upRange}], orbs:[{id,k,x,y,alpha,held,hooked}], hooks:[{o,x,y,tx,ty,team,caught}],
         aim:{x,y,a}, drops:[{id,x,y}], fx:[{k,x,y,tx,ty,age}], rush: ms of goldfish rush left (0 = none)} */
  function render(ctx,cw,ch,dpr,V,now,top=0){
    const vp=viewport(cw,ch-top);vp.oy+=top;const sc=vp.k*dpr,key=sc.toFixed(4)+'|'+(V.tc||2)+'|'+(globalThis.HookArt?.revision||0),rush=V.rush>0;
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=GRASS;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
    if(key!==sceneKey){sceneKey=key;sceneCv=scenery(sc,V.tc||2);}
    ctx.drawImage(sceneCv,dpr*vp.ox,dpr*vp.oy,C.W*sc,C.H*sc);
    ctx.setTransform(sc,0,0,sc,dpr*vp.ox,dpr*vp.oy);
    water(ctx,now);
    if(rush)rushGlow(ctx,now,V.rush);
    for(const d of V.drops||[])drawDrop(ctx,d,now);
    for(const o of V.orbs)if(!o.held&&!o.hooked)drawFish(ctx,o,now,rush);
    if(V.aim)aimDots(ctx,V.aim);
    const hookBy=new Map(V.hooks.map(h=>[h.o,h])),tips=new Map(),mem=new Map(),ps=[...V.players].sort((a,b)=>a.y-b.y);
    for(const p of ps){const m=pState(p,now);mem.set(p.id,m);tips.set(p.id,drawBody(ctx,p,now,m,hookBy.get(p.id)));}
    for(const h of V.hooks)drawLine(ctx,tips.get(h.o)||h,h);
    for(const o of V.orbs)if(o.held||o.hooked)drawFish(ctx,o,now,rush);
    for(const p of ps)drawLabel(ctx,p,now,mem.get(p.id));
    for(const f of V.fx||[])drawFx(ctx,f);
    if(pMem.size>80)pMem.clear();if(fishMem.size>80)fishMem.clear();
    ctx.setTransform(1,0,0,1,0,0);return vp;
  }
  /* Paper confetti for the winners' screen. */
  function confetti(el,n=40){
    if(typeof document==='undefined'||!el)return;const box=document.createElement('div');box.className='confetti';
    const cols=['#ff7096','#5a9cff','#3cc895','#ffc93c','#b69cff'];
    for(let i=0;i<n;i++){const s=document.createElement('i');s.style.left=(Math.random()*100)+'%';s.style.background=cols[i%5];
      s.style.animationDuration=(2.4+Math.random()*2)+'s';s.style.animationDelay=(Math.random()*1.2)+'s';box.appendChild(s);}
    el.appendChild(box);setTimeout(()=>box.remove(),6500);
  }

  /* GitHub Pages lets a browser keep a page for 10 minutes, so right after a fix a phone can still run the old copy.
     At start-up, ask for this page again (skipping every cache); if it carries a newer version, switch to it once.
     busy() says "don't switch now" (e.g. the student already picked a room). Returns this page's version. */
  function freshen(busy=()=>false){
    if(typeof document==='undefined')return '';
    const ver=document.querySelector('meta[name="hook-version"]')?.content||'';
    if(!/^[0-9a-f]{7}$/.test(ver)||/[?&]local\b/.test(location.search))return ver;
    fetch(location.pathname+'?fresh='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>{
      const m=/name="hook-version" content="([0-9a-f]{7})"/.exec(t);if(!m||m[1]===ver||busy())return;
      let tried='';try{tried=sessionStorage.getItem('lumi-hook-upd')||'';}catch{}
      if(tried===m[1])return;
      try{sessionStorage.setItem('lumi-hook-upd',m[1]);}catch{}
      const q=new URLSearchParams(location.search);q.set('v',m[1]);location.replace(location.pathname+'?'+q);
    }).catch(()=>{});
    return ver;
  }

  /* ── Sound: tiny soft synth, no files ── */
  let actx=null,muted=false;try{muted=localStorage.getItem('lumi-hook-mute')==='1';}catch{}
  function tone(f,d,type='sine',vol=.15,slide=0,delay=0){
    if(muted||!actx)return;const t=actx.currentTime+delay,o=actx.createOscillator(),gn=actx.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(40,f+slide),t+d);
    gn.gain.setValueAtTime(vol,t);gn.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(gn).connect(actx.destination);o.start(t);o.stop(t+d);
  }
  const sfx={
    unlock(){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();actx.resume();}catch{}},
    get muted(){return muted;},set muted(v){muted=!!v;try{localStorage.setItem('lumi-hook-mute',muted?'1':'0');}catch{}},
    fire(){tone(360,.18,'triangle',.1,560);},
    catch(){tone(950,.08,'sine',.16,-520);tone(1250,.1,'sine',.1,0,.08);},
    right(){[784,988,1175,1568].forEach((f,i)=>tone(f,.15,'triangle',.13,0,i*.07));},
    wrong(){tone(440,.16,'sine',.14,-200);tone(330,.26,'sine',.12,-130,.15);},
    tick(){tone(880,.07,'sine',.12);},
    pop(){tone(700,.06,'sine',.12,300);},
    tap(){tone(620,.05,'sine',.08,260);},
    card(){[660,880,1320].forEach((f,i)=>tone(f,.1,'triangle',.11,0,i*.06));},
    boom(){tone(220,.22,'triangle',.16,420);tone(900,.12,'sine',.08,-300,.05);},
    freeze(){tone(1500,.18,'sine',.09,-900);tone(1900,.14,'sine',.06,-1100,.08);},
    shield(){tone(520,.25,'sine',.1,260);},
    rush(){[784,988,1175,1568,1976].forEach((f,i)=>tone(f,.16,'triangle',.12,0,i*.06));},
    win(){[523,659,784,1047,1319].forEach((f,i)=>tone(f,.24,'triangle',.14,0,i*.11));}
  };

  /* Every button shows it was pressed: it squashes (class "pressed", which also works on iPhones where :active
     often doesn't), makes a tiny "pop" and, on Android, a short buzz. Buttons with their own sound opt out with data-quiet. */
  function pressFeedback(){
    if(typeof document==='undefined')return;
    const sel='button,.btn,[role="button"]';let held=null;
    const off=()=>{if(held){held.classList.remove('pressed');held=null;}};
    document.addEventListener('pointerdown',e=>{const b=e.target.closest?.(sel);if(!b||b.disabled)return;off();held=b;b.classList.add('pressed');
      if(b.hasAttribute('data-quiet'))return;sfx.unlock();sfx.tap();if(navigator.vibrate)try{navigator.vibrate(8);}catch{}},true);
    for(const ev of ['pointerup','pointercancel','dragstart'])document.addEventListener(ev,off,true);
    document.addEventListener('pointerleave',e=>{if(e.target===held)off();},true);
    document.addEventListener('touchstart',()=>{},{passive:true});
  }

  const api={C,CARDS,ANIMALS,TURN,clamp,rng,bases,confine,orbPos,hookDist,hookTip,hookDone,outgoing,segDist,createGame,snapEvery,unpack,pickRoom,createNet,createLocalNet,viewport,render,drawAnimal,animalIcon,confetti,freshen,pressFeedback,sfx};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.HookGame=api;
})(globalThis);
