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
    AWAY:10000,TAKEOVER:7000,   // silent this long = left (phones say "hi" every 4 s); the same name may take over a player silent 7 s
    // Item cards: hold up to 2, tap (or hold and aim) to use. Knock-back throws every enemy in a fan in front of you to the
    // edge of the map, whatever they are doing; freeze 3 s; bomb fish stuns 2 s and costs that team 2 points; ink covers enemy phones 2.5 s.
    // LOCK: a freeze arrow that hits someone answering ices their question card for 1.5 s (no answering), and leaves
    // them at least 3 s to answer once it melts.
    CARD:{ICE:3000,SHIELD:10000,MAX:2,FLY:1600,STUN:2000,INK:2500,BOMB_PTS:2,LOCK:1500,AFTER_LOCK:3000},
    FAN:{R:260,HALF:0.6},                                      // knock-back: a fan 260 long, about 70° wide
    // Things floating in the lake, caught with the rod like fish (no question): "?" boxes give a card,
    // the bubble gives 10 s of shield. 1 box at the start, at most 2; a new one 6 s after one is taken; the bubble returns 15 s after.
    LOOT:{R:22,BOXES:2,BOX_EVERY:6000,BUB_EVERY:15000},
    SHOT:{RANGE:600,SPEED:1100,R:40},                          // freeze arrow: aimed, flies straight and far, a big arrow; freezes the first enemy it touches
    SLIME:{RANGE:380,FLY:550,R:110,LEN:4000,SLOW:0.4,ROD:0.5},  // slime ball: lands where aimed; sticky puddle 4 s (enemies walk at 40%, rods at half speed)
    // Whirlpool: thrown anywhere (shore or lake), turns for 4 s. Enemies inside (answering too) are dragged to its middle and walk
    // at half speed; fish inside are pulled into a bunch and swim slowly. About a third of the lake.
    WHIRL:{RANGE:380,FLY:450,R:150,BAND:1.6,LEN:4000,PULL:0.7,DRAG:110,SLOW:0.5},
    BOMB:{LEN:15000,AX:90,AY:55},                              // bomb fish: looks like any fish to the other team; gone after 15 s
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
  /* The seven item cards. Every card is equally likely, whichever team is ahead (the teacher's choice).
     (The shield is not a card: it is a bubble floating in the lake.) */
  const CARDS={up:{zh:'击飞',en:'Knock back',color:'#ff9a3c'},ice:{zh:'冷冻',en:'Freeze',color:'#4fb3f2'},x2:{zh:'加倍',en:'Double',color:'#f2b000'},
    whirl:{zh:'漩涡',en:'Whirlpool',color:'#2fb3c9'},bomb:{zh:'炸弹鱼',en:'Bomb fish',color:'#ff6b5b'},ink:{zh:'墨水',en:'Ink',color:'#6a4c93'},steal:{zh:'小偷手套',en:'Thief glove',color:'#a0785a'}};
  const CARD_KINDS=Object.keys(CARDS);
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
  /* An orb's path: a slow Lissajous loop inside the sea, fixed by its seed. A bomb fish (o.c = [x,y]) swims a
     smaller loop around the spot where it was put. */
  const pathCache=new Map();
  function orbPos(o,t){
    const key=o.id+':'+o.s;let p=pathCache.get(key);
    if(!p){const r=rng(o.s),w=(C.ORB[o.k]||C.ORB.n).w,sp=()=>w[0]+(w[1]-w[0])*r();
      p=o.c?{cx:o.c[0],cy:o.c[1],ax:C.BOMB.AX*(0.7+0.3*r()),ay:C.BOMB.AY*(0.7+0.3*r())}:{cx:C.SEA.x,cy:C.SEA.y,ax:C.SEA.rx*0.6*(0.55+0.45*r()),ay:C.SEA.ry*0.6*(0.55+0.45*r())};
      Object.assign(p,{w1:sp(),w2:sp()*(0.8+0.4*r()),p1:r()*6.283,p2:r()*6.283});
      if(pathCache.size>400)pathCache.clear();pathCache.set(key,p);}
    const s=(t-o.b)/1000;
    return {x:p.cx+p.ax*Math.sin(p.w1*s+p.p1),y:p.cy+p.ay*Math.sin(p.w2*s+p.p2)};
  }
  /* Where a fish really is: its path, pulled towards any whirlpool that is turning nearby (zones of kind 'w').
     The pull fades in and out and weakens with distance, so fish never jump. Phones and the teacher's computer
     work it out the same way from the snapshot, so it costs no messages. */
  function fishPos(o,t,zones){
    let p=orbPos(o,t);if(!zones||!zones.length)return p;
    for(const z of zones){if(z.k!=='w'||t<z.from||t>=z.until)continue;
      const ramp=Math.min(1,(t-z.from)/800,(z.until-t)/800),d=Math.hypot(p.x-z.x,p.y-z.y),R=C.WHIRL.R,far=R*C.WHIRL.BAND;
      const w=d<=R?1:d>=far?0:(far-d)/(far-R),e=w*w*(3-2*w),k=1-C.WHIRL.PULL*ramp*e;
      if(k<1)p={x:z.x+(p.x-z.x)*k,y:z.y+(p.y-z.y)*k};}
    return p;
  }
  /* Floating "?" boxes and the shield bubble drift slowly around the lake. */
  function lootPos(l,t){
    const key='L'+l.id+':'+l.s;let p=pathCache.get(key);
    if(!p){const r=rng(l.s);p={ax:C.SEA.rx*0.55*(0.4+0.6*r()),ay:C.SEA.ry*0.55*(0.4+0.6*r()),w1:0.12+0.1*r(),w2:0.1+0.1*r(),p1:r()*6.283,p2:r()*6.283};
      if(pathCache.size>400)pathCache.clear();pathCache.set(key,p);}
    const s=(t-l.b)/1000;
    return {x:C.SEA.x+p.ax*Math.sin(p.w1*s+p.p1),y:C.SEA.y+p.ay*Math.sin(p.w2*s+p.p2)};
  }
  /* A point inside the lake: pulled in towards the middle if it is near the edge or outside (e = ellipse fraction). */
  function intoLake(x,y,e=0.8){const s=C.SEA,f=Math.hypot((x-s.x)/s.rx,(y-s.y)/s.ry);return f<=e?{x,y}:{x:s.x+(x-s.x)*e/f,y:s.y+(y-s.y)*e/f};}
  /* Knock-back: from (x,y), fly in direction (dx,dy) as far as the edge of the map. */
  function edgeFrom(x,y,dx,dy){
    let s=Infinity;const lo=C.PR+4,hiX=C.W-C.PR-4,hiY=C.H-C.PR-4;
    if(dx>1e-6)s=Math.min(s,(hiX-x)/dx);else if(dx<-1e-6)s=Math.min(s,(lo-x)/dx);
    if(dy>1e-6)s=Math.min(s,(hiY-y)/dy);else if(dy<-1e-6)s=Math.min(s,(lo-y)/dy);
    if(!Number.isFinite(s)||s<0)s=0;return confine(x+dx*s,y+dy*s);
  }
  /* Where a knocked-back player is during the flight (kb = {x0,y0,x1,y1,t0,t1}). */
  function flyPos(kb,t){const k=clamp((t-kb.t0)/Math.max(1,kb.t1-kb.t0),0,1),e=1-(1-k)*(1-k);return {x:kb.x0+(kb.x1-kb.x0)*e,y:kb.y0+(kb.y1-kb.y0)*e,k};}
  /* A hook flies out until it catches something or reaches its range, then reels back. */
  // h.sp: speed of this line (1 normal; slower when cast from inside an enemy's slime puddle).
  const turnAt=h=>h.t0+C.RANGE/(C.OUT*(h.sp||1))*1000;
  function hookDist(h,t){
    const sp=h.sp||1,turn=h.tt||turnAt(h),d=h.tt?h.d:C.RANGE;
    return t<turn?Math.min(C.RANGE,C.OUT*sp*(t-h.t0)/1000):d-C.BACK*sp*(t-turn)/1000;
  }
  const outgoing=(h,t)=>!h.tt&&t<turnAt(h);
  /* Is someone of this team standing in an enemy's slime puddle at time t? (zones: [{k,team,x,y,from,until}]; k 'w' = whirlpool) */
  const inSlime=(zones,team,x,y,t)=>!!zones&&zones.some(z=>z.k!=='w'&&z.team!==team&&t>=z.from&&t<z.until&&Math.hypot(x-z.x,y-z.y)<=C.SLIME.R);
  /* Is this player inside an enemy whirlpool at time t (and not protected from it by a shield)? */
  const inWhirl=(zones,team,x,y,t,id)=>!!zones&&zones.some(z=>z.k==='w'&&z.team!==team&&t>=z.from&&t<z.until&&!(z.safe&&z.safe.includes(id))&&Math.hypot(x-z.x,y-z.y)<=C.WHIRL.R);
  /* Walking speed factor: half speed inside an enemy whirlpool. */
  const walkK=(zones,team,x,y,t,id)=>inWhirl(zones,team,x,y,t,id)?C.WHIRL.SLOW:1;
  /* An enemy whirlpool drags a player towards its middle (answering players too); returns the new position. */
  function dragWhirl(zones,team,x,y,t,dt,id){
    if(!zones)return null;let moved=null;
    for(const z of zones){if(z.k!=='w'||z.team===team||t<z.from||t>=z.until||(z.safe&&z.safe.includes(id)))continue;
      const dx=z.x-x,dy=z.y-y,d=Math.hypot(dx,dy);if(d>C.WHIRL.R||d<2)continue;
      const step=Math.min(d-2,C.WHIRL.DRAG*dt/1000);x+=dx/d*step;y+=dy/d*step;moved=confine(x,y);x=moved.x;y=moved.y;}
    return moved;
  }
  /* Is point (x,y) inside the knock-back fan from (ox,oy) pointing at angle a? */
  function inFan(ox,oy,a,x,y){const d=Math.hypot(x-ox,y-oy);if(d>C.FAN.R)return false;if(d<24)return true;let da=Math.atan2(y-oy,x-ox)-a;da=Math.atan2(Math.sin(da),Math.cos(da));return Math.abs(da)<=C.FAN.HALF;}
  /* Where a freeze arrow is at time t (null before it starts or once it has flown its full range). */
  function shotAt(s,t){const d=C.SHOT.SPEED*(t-s.t0)/1000;if(d<0||d>=C.SHOT.RANGE)return null;return {x:s.x+Math.cos(s.a)*d,y:s.y+Math.sin(s.a)*d,d};}
  function hookTip(h,t){const d=clamp(hookDist(h,t),0,C.RANGE);return {x:h.x+Math.cos(h.a)*d,y:h.y+Math.sin(h.a)*d,d};}
  const hookDone=(h,t)=>!outgoing(h,t)&&hookDist(h,t)<=0;
  /* Closest point on segment a→b to point p: returns [distance, fraction]. */
  function segDist(a,b,p){const vx=b.x-a.x,vy=b.y-a.y,l=vx*vx+vy*vy,f=l?clamp(((p.x-a.x)*vx+(p.y-a.y)*vy)/l,0,1):0;return [Math.hypot(a.x+vx*f-p.x,a.y+vy*f-p.y),f];}

  /* ── The referee: one game, run on the teacher's computer ── */
  function createGame(opt={}){
    const rnd=opt.rng||Math.random,check=opt.check||((q,v)=>JSON.stringify(v)===JSON.stringify(q.answer));
    const g={ph:'lobby',t:0,cd:0,teams:2,sc:[0,0,0],players:new Map(),orbs:[],hooks:[],qs:[],qStats:[],deck:[],kicked:new Map(),end:null,target:opt.target||C.TARGET,limit:opt.limit||C.LIMIT,log:[],
      mode:opt.mode==='time'?'time':'score',   // score: first team to the target wins (time limit as a backstop); time: highest score when time runs out
      items:opt.items!==false,fx:[],fxN:0,rush:0,glowAt:0,gone:new Map(),
      loot:[],lootN:0,boxAt:0,bubAt:0,orbN:100,   // boxes and the shield bubble in the lake; bomb fish get ids from 101
      shots:[],shotN:0,zones:[]};   // flying freeze arrows / slime balls / whirlpools, slime puddles and whirlpools
    const nameKey=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
    // st: 0 free, 1 answering, 2 frozen, 3 knocked back (flying, kb = the flight), 5 stunned by a bomb fish.
    // kb: flying from a knock-back (in any state, even answering); ink: phone covered in ink until then.
    // lock: question card iced by a freeze arrow until then (can't answer).
    const fresh=()=>({st:0,until:0,q:-1,orb:0,ok:0,bad:0,rk:0,goal:null,cool:800,botAt:0,cards:[],sh:0,x2:0,useAt:0,kb:null,ink:0,lock:0});
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
      let p=g.players.get(id);const now=Date.now();
      if(p){p.name=name;if(av!=null)p.av=normAv(av,id);p.seen=now;return p;}
      if(!bot){
        // The same name coming back (the page was closed, or opened again on another phone) is the same student:
        // take over the old place — same team, same score — instead of leaving a frozen copy behind.
        const k=nameKey(name),old=[...g.players.values()].find(q=>!q.bot&&nameKey(q.name)===k&&now-q.seen>C.TAKEOVER);
        if(old){rekey(old,id);old.name=name;if(av!=null)old.av=normAv(av,id);old.seen=now;return old;}
        const back=g.gone.get(k);
        if(back){g.gone.delete(k);back.id=id;back.name=name;if(av!=null)back.av=normAv(av,id);back.seen=now;back.seq=-1;
          g.players.set(id,back);place(back,teamCount()[back.team]-1);return back;}
      }
      const n=teamCount(),team=n.indexOf(Math.min(...n));
      p={id,name,team,av:normAv(av,id),x:0,y:0,dx:0,dy:0,...fresh(),qn:0,rs:0,bot,seq:-1,seen:now};
      g.players.set(id,p);place(p,n[team]);return p;
    };
    function rekey(p,id){const old=p.id;g.players.delete(old);p.id=id;p.seq=-1;g.players.set(id,p);
      for(const h of g.hooks)if(h.o===old)h.o=id;for(const o of g.orbs){if(o.hk===old)o.hk=id;if(o.by===old)o.by=id;if(o.owner===old)o.owner=id;}
      for(const l of g.loot)if(l.hk===old)l.hk=id;}
    // A line is let go: its fish (or box / bubble) goes back into the lake.
    function letGo(h){if(h.orb)releaseOrb(h.orb,300);if(h.loot)releaseLoot(h.loot);}
    // Take away all of a player's lines.
    function cutLines(id){g.hooks=g.hooks.filter(h=>{if(h.o!==id)return true;letGo(h);return false;});}
    /* A student who left (closed the page, or silent for 10 s) disappears. In a game they are kept aside with their
       team and score, so the same name can come back to them; the team keeps the points it already has. */
    function retire(p){
      cutLines(p.id);
      if(p.orb)releaseOrb(p.orb,300);
      g.players.delete(p.id);
      if(g.ph!=='lobby'&&g.ph!=='end'){Object.assign(p,{st:0,until:0,q:-1,orb:0,dx:0,dy:0,kb:null});g.gone.set(nameKey(p.name),p);}
    }
    g.leave=id=>{const p=g.players.get(String(id));if(p&&!p.bot)retire(p);};
    g.sweep=(now=Date.now())=>{let n=0;for(const p of [...g.players.values()])if(!p.bot&&now-p.seen>C.AWAY){retire(p);n++;}return n;};
    function releaseOrb(id,delay){const o=g.orbs.find(x=>x.id===id);if(o){o.s=seed();o.b=g.t+delay;o.hk='';o.by='';}}
    function releaseLoot(id){const l=g.loot.find(x=>x.id===id);if(l){l.s=seed();l.b=g.t+300;l.hk='';}}
    g.kick=id=>{const p=g.players.get(id);if(!p)return;cutLines(id);g.players.delete(id);if(!p.bot)g.kicked.set(id,Date.now());
      if(p.st===1&&p.orb)releaseOrb(p.orb,300);};
    g.setTeams=n=>{g.teams=n===3?3:2;const list=shuffle([...g.players.values()]);list.forEach((p,i)=>p.team=i%g.teams);placeAll();};
    g.start=()=>{
      g.ph='count';g.cd=C.COUNT;g.t=0;g.sc=[0,0,0];g.hooks=[];g.end=null;g.deck=[];g.qStats=g.qs.map(()=>({right:0,wrong:0}));
      g.fx=[];g.rush=0;g.glowAt=C.RUSH.FIRST;g.gone.clear();g.shots=[];g.zones=[];g.loot=[];
      for(const p of g.players.values())Object.assign(p,fresh());
      placeAll();
      const n=clamp(Math.round(g.players.size*0.5)+3,5,13),fast=Math.max(1,Math.round(n/4));
      g.orbs=Array.from({length:n},(_,i)=>({id:i+1,k:i<fast?'f':'n',s:seed(),b:0,hk:'',by:''}));
      // In the lake from the start: one "?" box and the shield bubble; the second box comes 6 s later.
      if(g.items){spawnLoot('c');spawnLoot('b');}g.boxAt=C.LOOT.BOX_EVERY;g.bubAt=Infinity;
    };
    g.pause=()=>{if(g.ph==='play')g.ph='pause';};
    g.resume=()=>{if(g.ph==='pause')g.ph='play';};
    g.toLobby=()=>{g.ph='lobby';g.end=null;g.hooks=[];g.orbs=[];g.loot=[];g.fx=[];g.rush=0;g.gone.clear();g.shots=[];g.zones=[];placeAll();for(const p of g.players.values())Object.assign(p,{st:0,q:-1,orb:0,cards:[],sh:0,x2:0,kb:null,ink:0});};
    function draw(){if(!g.deck.length)g.deck=shuffle(g.qs.map((_,i)=>i));return g.deck.pop();}
    function orbAt(o,t){
      if(o.by){const p=g.players.get(o.by);if(!p)return null;const held=g.orbs.filter(x=>x.by===o.by),i=held.indexOf(o);return {x:p.x+(i-(held.length-1)/2)*30,y:p.y-54};}
      if(o.hk){const h=g.hooks.find(x=>x.o===o.hk&&x.orb===o.id);return h?hookTip(h,t):null;}
      return t<o.b?null:fishPos(o,t,g.zones);
    }
    g.orbAt=o=>orbAt(o,g.t);
    function lootAt(l,t){
      if(l.hk){const h=g.hooks.find(x=>x.o===l.hk&&x.loot===l.id);return h?hookTip(h,t):null;}
      return t<l.b?null:lootPos(l,t);
    }
    g.lootAt=l=>lootAt(l,g.t);
    function spawnLoot(k){g.loot.push({id:++g.lootN,k,s:seed(),b:g.t,hk:''});}
    function fire(p,x,y,a,t0){
      if(g.ph!=='play'||p.st!==0||p.kb||g.hooks.some(h=>h.o===p.id)||!Number.isFinite(a))return false;
      const pos=confine(Number(x)||p.x,Number(y)||p.y);p.x=pos.x;p.y=pos.y;p.dx=p.dy=0;
      t0=clamp(Number(t0)||g.t,g.t-400,g.t);
      g.hooks.push({o:p.id,x:p.x,y:p.y,a,t0,tt:0,d:0,orb:0,loot:0,lt:t0,sp:1});
      return true;
    }
    /* Start answering a caught fish. */
    function ask(p,oid){const o=g.orbs.find(x=>x.id===oid);if(!o)return;o.hk='';o.by=p.id;p.st=1;p.orb=o.id;p.q=draw();p.qn++;p.until=g.t+C.ANSWER;}

    /* ── Item cards ── */
    const addFx=(k,p,to=[],extra={})=>{g.fx.push({id:++g.fxN,k,at:g.t,by:p.id,x:Math.round(p.x),y:Math.round(p.y),to,...extra});};
    function dropHooks(p){g.hooks=g.hooks.filter(h=>{if(h.o!==p.id)return true;letGo(h);return false;});}
    /* Hit by a card (or a bomb fish). A shield takes the hit instead (and breaks).
       up: thrown away from `from` to the edge of the map — whatever they are doing (someone answering keeps answering
       on the way); ice: frozen 3 s; bomb: dizzy 2 s; ink: the phone is covered 2.5 s. */
    function hit(q,kind,from){
      if(q.sh>g.t){q.sh=0;addFx('block',q,[q.id]);return false;}
      if(kind==='ink'){q.ink=g.t+C.CARD.INK;return true;}
      if(kind==='up'){
        let dx=q.x-from.x,dy=q.y-from.y,l=Math.hypot(dx,dy);
        if(l<1){dx=q.x-C.SEA.x;dy=q.y-C.SEA.y;l=Math.hypot(dx,dy)||1;}   // standing on top of each other: away from the lake
        const end=edgeFrom(q.x,q.y,dx/l,dy/l),ms=clamp(Math.hypot(end.x-q.x,end.y-q.y)/C.CARD.FLY*1000,400,900);
        dropHooks(q);q.dx=q.dy=0;if(q.st===0){q.st=3;q.until=g.t+ms;}
        q.kb={x0:q.x,y0:q.y,x1:end.x,y1:end.y,t0:g.t,t1:g.t+ms};return true;}
      dropHooks(q);q.dx=q.dy=0;
      q.st=kind==='bomb'?5:2;q.until=g.t+(kind==='bomb'?C.CARD.STUN:C.CARD.ICE);return true;
    }
    const foes=p=>[...g.players.values()].filter(q=>q.team!==p.team&&q.st===0);
    const slowed=p=>inWhirl(g.zones,p.team,p.x,p.y,g.t,p.id);
    const speedOf=p=>C.SPEED*walkK(g.zones,p.team,p.x,p.y,g.t,p.id);
    // Anything to take from q? A card (the thief always has room: the glove itself leaves the hand), else a point of their team.
    const stealable=q=>q.cards.length>0||g.sc[q.team]>0;
    function nearestFoe(p,range){let best=null;for(const q of foes(p)){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<=range&&(!best||d<best.d))best={q,d};}return best;}
    /* Use card i. Knock-back, freeze and whirlpool are aimed like a skill (angle a; whirlpool also distance d).
       Without an aim: knock-back and freeze go at the nearest enemy, the whirlpool towards the lake.
       Knock-back with nobody inside the fan, or a glove with nothing to steal: the card is kept. */
    function useCard(p,i,a,d){
      i=Number(i)||0;const k=p.cards[i];
      if(g.ph!=='play'||p.st!==0||p.kb||!k)return false;
      a=Number(a);d=Number(d);
      if(k==='up'){
        if(!Number.isFinite(a)){let best=null;for(const q of g.players.values()){if(q.team===p.team||q.kb)continue;const dd=Math.hypot(q.x-p.x,q.y-p.y);if(dd<=C.FAN.R&&(!best||dd<best.d))best={q,d:dd};}
          if(!best)return false;a=Math.atan2(best.q.y-p.y,best.q.x-p.x);}
        const tg=[...g.players.values()].filter(q=>q.team!==p.team&&!q.kb&&inFan(p.x,p.y,a,q.x,q.y));if(!tg.length)return false;
        addFx('up',p,tg.filter(q=>hit(q,'up',p)).map(q=>q.id),{tx:+a.toFixed(3)});}
      else if(k==='ice'||k==='whirl'){
        const range=k==='ice'?C.SHOT.RANGE:C.WHIRL.RANGE;
        if(!Number.isFinite(a)){const n=k==='whirl'?null:nearestFoe(p,range);
          a=n?Math.atan2(n.q.y-p.y,n.q.x-p.x):Math.atan2(C.SEA.y-p.y,C.SEA.x-p.x);if(n&&!Number.isFinite(d))d=n.d;}
        if(k==='ice'){g.shots.push({id:++g.shotN,k:'ice',o:p.id,team:p.team,x:p.x,y:p.y-10,a,t0:g.t,lt:g.t});addFx('shoot',p);}
        else{const dist=clamp(Number.isFinite(d)?d:range*0.7,40,range);
          const tx=clamp(p.x+Math.cos(a)*dist,C.PR,C.W-C.PR),ty=clamp(p.y+Math.sin(a)*dist,C.PR,C.H-C.PR);   // shore or lake, anywhere
          g.shots.push({id:++g.shotN,k:'whirl',o:p.id,team:p.team,x:p.x,y:p.y,tx:Math.round(tx),ty:Math.round(ty),t0:g.t,land:g.t+C.WHIRL.FLY});addFx('throw',p);}
      }
      else if(k==='steal'){
        // The nearest enemy who has something to take, whatever they are doing. A card if they have one, otherwise a point.
        let best=null;for(const q of g.players.values()){if(q.team===p.team||!stealable(q))continue;const dd=Math.hypot(q.x-p.x,q.y-p.y);if(!best||dd<best.d)best={q,d:dd};}
        if(!best)return false;const q=best.q;p.cards.splice(i,1);
        if(q.sh>g.t){q.sh=0;addFx('block',q,[q.id]);addFx('steal',p,[],{tx:Math.round(q.x),ty:Math.round(q.y),w:'x'});return true;}
        let w;if(q.cards.length){const j=Math.floor(rnd()*q.cards.length);w=q.cards.splice(j,1)[0];p.cards.push(w);}
        else{g.sc[q.team]--;g.sc[p.team]++;w='p';}
        addFx('steal',p,[q.id],{tx:Math.round(q.x),ty:Math.round(q.y),w});
        if(w==='p'&&g.mode!=='time'&&g.sc[p.team]>=g.target)finish('target');
        return true;}
      else if(k==='x2'){p.x2=1;addFx('x2',p);}
      else if(k==='bomb'){
        // A fake fish in the lake on this player's side. To the other team it looks and swims like any fish.
        const s=C.SEA,f=Math.hypot((p.x-s.x)/s.rx,(p.y-s.y)/s.ry)||1,c=[Math.round(s.x+(p.x-s.x)*0.3/f),Math.round(s.y+(p.y-s.y)*0.3/f)];
        g.orbs.push({id:++g.orbN,k:'n',s:seed(),b:g.t,hk:'',by:'',bomb:p.team,owner:p.id,c,until:g.t+C.BOMB.LEN});addFx('trap',p);}
      // (The slime card is gone; an old one still in someone's hand is simply dropped below.)
      else if(k==='ink'){
        const tg=[...g.players.values()].filter(q=>q.team!==p.team&&q.st!==1);
        addFx('ink',p,tg.filter(q=>hit(q,'ink',p)).map(q=>q.id));}
      else{p.cards.splice(i,1);return false;}   // an old card type: just drop it
      p.cards.splice(i,1);return true;
    }
    /* Freeze arrows fly on; slime balls land and leave a puddle; whirlpools land in the lake. */
    function stepShots(){
      const t=g.t;
      g.shots=g.shots.filter(s=>{
        if(s.k==='slime'||s.k==='whirl'){
          if(t<s.land)return true;
          const w=s.k==='whirl';
          g.zones.push({id:s.id,k:w?'w':'s',team:s.team,x:s.tx,y:s.ty,from:s.land,until:s.land+(w?C.WHIRL.LEN:C.SLIME.LEN),safe:[]});
          addFx(w?'whirl':'slime',{id:s.o,x:s.tx,y:s.ty});return false;}
        // The arrow's path since the last tick: the first enemy on it (not in the air) is hit. Someone answering gets
        // their question card iced for 1.5 s instead of being frozen.
        const d0=Math.min(C.SHOT.RANGE,C.SHOT.SPEED*(s.lt-s.t0)/1000),d1=Math.min(C.SHOT.RANGE,C.SHOT.SPEED*(t-s.t0)/1000);s.lt=t;
        const A={x:s.x+Math.cos(s.a)*d0,y:s.y+Math.sin(s.a)*d0},B={x:s.x+Math.cos(s.a)*d1,y:s.y+Math.sin(s.a)*d1};
        let best=null;
        for(const q of g.players.values()){if(q.team===s.team||q.kb||q.st===3)continue;
          const [dist,f]=segDist(A,B,{x:q.x,y:q.y-10});if(dist<=C.SHOT.R&&(!best||f<best.f))best={q,f};}
        if(best){const q=best.q,by=g.players.get(s.o)||{id:s.o,x:s.x,y:s.y},at={tx:Math.round(q.x),ty:Math.round(q.y)};
          if(q.st===1){let got=true;
            if(q.sh>g.t){q.sh=0;addFx('block',q,[q.id]);got=false;}
            else{q.lock=g.t+C.CARD.LOCK;q.until=Math.max(q.until,q.lock+C.CARD.AFTER_LOCK);}
            addFx('ice',by,got?[q.id]:[],{...at,w:'q'});return false;}
          addFx('ice',by,hit(q,'ice')?[q.id]:[],at);return false;}
        return d1<C.SHOT.RANGE;
      });
      if(g.zones.length)g.zones=g.zones.filter(z=>t<z.until);
    }
    const cardFor=()=>CARD_KINDS[Math.floor(rnd()*CARD_KINDS.length)];
    /* The lake's boxes and bubble: a new box 6 s after one is taken (at most 2); the bubble 15 s after it is taken.
       Bomb fish that nobody caught swim away after 15 s. */
    function stepLoot(){
      const t=g.t,boxes=g.loot.filter(l=>l.k==='c').length;
      if(boxes<C.LOOT.BOXES&&t>=g.boxAt){spawnLoot('c');g.boxAt=t+C.LOOT.BOX_EVERY;}
      if(!g.loot.some(l=>l.k==='b')&&t>=g.bubAt){spawnLoot('b');g.bubAt=Infinity;}
      if(g.orbs.some(o=>o.bomb!=null&&t>=o.until))g.orbs=g.orbs.filter(o=>!(o.bomb!=null&&t>=o.until&&!o.hk&&!o.by));
    }
    // A box or bubble has been reeled in.
    function landLoot(p,l){
      g.loot.splice(g.loot.indexOf(l),1);
      if(l.k==='c'){if(g.boxAt<=g.t)g.boxAt=g.t+C.LOOT.BOX_EVERY;if(p.cards.length<C.CARD.MAX){p.cards.push(cardFor());addFx('box',p);}}
      else{g.bubAt=g.t+C.LOOT.BUB_EVERY;p.sh=g.t+C.CARD.SHIELD;addFx('shield',p);}
    }
    // The glowing goldfish: one at a time, then a pause after each rush.
    function stepRush(){
      if(g.rush&&g.t>=g.rush){g.rush=0;g.glowAt=g.t+C.RUSH.AFTER;}
      if(!g.rush&&g.t>=g.glowAt&&!g.orbs.some(o=>o.k==='g')){
        const free=g.orbs.filter(o=>o.k==='n'&&!o.hk&&!o.by&&o.bomb==null);
        if(free.length){const o=free[Math.floor(rnd()*free.length)];o.k='g';o.s=seed();o.b=g.t;}
        g.glowAt=g.t+C.RUSH.AFTER;
      }
    }
    function finish(reason){
      const top=Math.max(...g.sc.slice(0,g.teams)),win=g.sc.slice(0,g.teams).filter(s=>s===top).length>1?-1:g.sc.indexOf(top);
      let hard=-1,most=0;g.qStats.forEach((s,i)=>{if(s.wrong>most){most=s.wrong;hard=i;}});
      g.ph='end';g.hooks=[];
      g.end={win,reason,hard,hardWrong:most,hardText:hard>=0?g.qs[hard].text:'',
        // Results also count a student who left during the game after answering (their answers still happened).
        players:[...g.players.values(),...[...g.gone.values()].filter(p=>p.ok+p.bad>0)].sort((a,b)=>b.ok-a.ok||a.bad-b.bad).map(p=>[p.name,p.team,p.ok,p.bad,p.av])};
    }
    g.stop=()=>{if(g.ph==='play'||g.ph==='pause'||g.ph==='count')finish('stop');};
    function settle(p,ok,timeout){
      const o=g.orbs.find(x=>x.id===p.orb),st=g.qStats[p.q];
      let val=o?C.ORB[o.k].val:1;if(g.rush)val=Math.max(val,2);
      if(st)ok?st.right++:st.wrong++;
      g.log.push({t:g.t,id:p.id,q:p.q,ok,timeout:!!timeout});
      if(ok){if(p.x2){val*=2;p.x2=0;}g.sc[p.team]+=val;p.ok++;p.rk=val;
        if(o){if(o.k==='g'){o.k='n';g.rush=g.t+C.RUSH.LEN;addFx('rush',p);}releaseOrb(o.id,C.RESPAWN);}}
      else{p.bad++;p.rk=-1;g.deck.splice(Math.floor(rnd()*(g.deck.length+1)),0,p.q);if(o)releaseOrb(o.id,300);}
      p.rs++;p.orb=0;p.botAt=0;p.st=0;
      if(!ok){p.st=2;p.until=g.t+C.FREEZE;}   // a wrong answer (or no answer in time) freezes for 3 s
      if(g.mode!=='time'&&g.sc[p.team]>=g.target)finish('target');
    }
    g.answer=(id,qn,v)=>{const p=g.players.get(id);if(!p||g.ph!=='play'||p.st!==1||qn!==p.qn||p.lock>g.t/* iced: not yet */)return false;settle(p,!!check(g.qs[p.q],v));return true;};
    g.input=m=>{
      const p=m&&g.players.get(String(m.id));
      if(m?.k==='join')return g.join(m.id,m.name,false,m.av);
      if(!p)return null;p.seen=Date.now();
      if(m.k==='mv'){if(m.s<=p.seq)return;p.seq=m.s;if(p.st!==0||p.kb||g.hooks.some(h=>h.o===p.id)||g.ph!=='play')return;
        // The phone stamps its message with the game time, so the walk it did while the message travelled is added back.
        const l=Math.hypot(m.dx||0,m.dy||0),dx=l?m.dx/l:0,dy=l?m.dy/l:0,lag=clamp(g.t-(Number(m.t)||g.t),0,600)/1000,v=speedOf(p);
        const pos=confine((Number(m.x)||p.x)+dx*v*lag,(Number(m.y)||p.y)+dy*v*lag);p.x=pos.x;p.y=pos.y;p.dx=dx;p.dy=dy;}
      else if(m.k==='fire')fire(p,m.x,m.y,Number(m.a),m.t);
      else if(m.k==='ans')g.answer(p.id,m.qn,m.v);
      else if(m.k==='use')useCard(p,m.i,m.a,m.d);
      else if(m.k==='bye'){g.leave(p.id);return null;}   // the phone closed the page
      return p;
    };
    g.useCard=(id,i,a,d)=>{const p=g.players.get(id);return !!p&&useCard(p,i,a,d);};
    g.slowed=id=>{const p=g.players.get(id);return !!p&&slowed(p);};
    function botThink(p,dt){
      if(p.st===1){if(!p.botAt)p.botAt=g.t+2000+rnd()*6000;
        if(g.t>=p.botAt&&!(p.lock>g.t)){const q=g.qs[p.q],good=rnd()<0.65;let v;
          if(q.type==='fill')v=good?q.accept[0]:'?';else if(good)v=q.answer;else{const wrong=q.options.map((_,i)=>i+1).filter(n=>!q.answer.includes(n));v=[wrong[0]||1];}
          settle(p,!!check(q,v));}
        return;}
      if(p.st!==0)return;
      // Bots use their cards a little while after picking them up (and keep a card if nobody is in reach).
      if(p.cards.length){if(!p.useAt)p.useAt=g.t+1500+rnd()*3000;if(g.t>=p.useAt){p.useAt=0;useCard(p,0);}}
      if(g.hooks.some(h=>h.o===p.id))return;
      if(!p.goal||Math.hypot(p.goal.x-p.x,p.goal.y-p.y)<12){const a=rnd()*6.283;p.goal=confine(C.SEA.x+(C.SEA.rx+30)*Math.cos(a),C.SEA.y+(C.SEA.ry+30)*Math.sin(a));}
      const gx=p.goal.x-p.x,gy=p.goal.y-p.y,l=Math.hypot(gx,gy)||1;p.dx=gx/l;p.dy=gy/l;
      p.cool-=dt;if(p.cool>0)return;
      let best=null;
      for(const o of g.orbs){if(o.by||o.bomb===p.team||(o.hk&&g.players.get(o.hk)?.team===p.team))continue;const at=orbAt(o,g.t);if(!at)continue;
        const d=Math.hypot(at.x-p.x,at.y-p.y);if(d>C.RANGE*0.95)continue;
        const fut=o.hk?at:fishPos(o,g.t+d/C.OUT*1000,g.zones);if(!best||d<best.d)best={d,x:fut.x,y:fut.y};}
      // Boxes (when a card slot is free) and the bubble (when not shielded) are worth going for too.
      for(const it of g.loot){if(it.hk||(it.k==='c'&&p.cards.length>=C.CARD.MAX)||(it.k==='b'&&p.sh>g.t))continue;const at=lootAt(it,g.t);if(!at)continue;
        const d=Math.hypot(at.x-p.x,at.y-p.y);if(d>C.RANGE*0.95)continue;if(!best||d*0.8<best.d)best={d:d*0.8,x:at.x,y:at.y};}
      if(best){fire(p,p.x,p.y,Math.atan2(best.y-p.y,best.x-p.x)+(rnd()-0.5)*0.25,g.t);p.cool=500+rnd()*1500;}
    }
    function stepHooks(){
      const t=g.t;
      for(const h of [...g.hooks].sort((a,b)=>a.t0-b.t0)){
        const owner=g.players.get(h.o);
        if(!h.orb&&!h.loot&&outgoing(h,h.lt)){
          const end=Math.min(t,turnAt(h)),a=hookTip(h,h.lt),b=hookTip(h,end);let got=null;
          // Can't take from a teammate, or from someone behind a shield. Lines pass straight through players.
          const guarded=who=>{if(!who)return false;const from=g.players.get(who);return from?.team===owner?.team||from?.sh>t;};
          for(const o of g.orbs){
            if(o.by||o.hk===h.o||(owner&&o.bomb===owner.team)||guarded(o.hk))continue;   // a team's own bomb fish: its lines pass through
            const at=orbAt(o,t);if(!at)continue;
            const [dist,f]=segDist(a,b,at);if(dist<=C.TIP+C.ORB[o.k].r&&(!got||f<got.f))got={o,f};
          }
          for(const l of g.loot){
            if(l.hk===h.o||guarded(l.hk))continue;
            const at=lootAt(l,t);if(!at)continue;
            const [dist,f]=segDist(a,b,at);if(dist>C.TIP+C.LOOT.R)continue;
            // Hands full (2 cards): the line passes through boxes, and the phone says so.
            if(l.k==='c'&&owner&&owner.cards.length>=C.CARD.MAX){if(!h.full){h.full=1;addFx('full',owner);}continue;}
            if(!got||f<got.f)got={l,f};
          }
          if(got){const when=h.lt+(end-h.lt)*got.f;h.tt=Math.max(when,h.t0+1);h.d=Math.min(C.RANGE,C.OUT*(h.sp||1)*(h.tt-h.t0)/1000);
            if(got.l){const l=got.l;if(l.hk){const prev=g.hooks.find(x=>x.o===l.hk&&x.loot===l.id);if(prev)prev.loot=0;}l.hk=h.o;h.loot=l.id;}
            else if(got.o.bomb!=null){
              // The other team's bomb fish: it blows up and the angler is dizzy for 2 s (a shield takes it instead).
              const o=got.o,at=orbAt(o,t);g.orbs.splice(g.orbs.indexOf(o),1);
              if(owner){const by=g.players.get(o.owner)||{id:o.owner,x:at.x,y:at.y},hurt=hit(owner,'bomb');let lost=0;
                if(hurt){lost=Math.min(C.CARD.BOMB_PTS,g.sc[owner.team]);g.sc[owner.team]-=lost;}
                addFx('bomb',by,hurt?[owner.id]:[],{tx:Math.round(at.x),ty:Math.round(at.y),w:String(lost)});}}
            else{if(got.o.hk){const prev=g.hooks.find(x=>x.o===got.o.hk&&x.orb===got.o.id);if(prev)prev.orb=0;}
              got.o.hk=h.o;h.orb=got.o.id;}}
        }
        h.lt=t;
      }
      g.hooks=g.hooks.filter(h=>{
        if(!hookDone(h,t))return true;
        const p=g.players.get(h.o),o=h.orb&&g.orbs.find(x=>x.id===h.orb&&x.hk===h.o),l=h.loot&&g.loot.find(x=>x.id===h.loot&&x.hk===h.o);
        if(o){if(p&&p.st===0&&g.qs.length)ask(p,o.id);else releaseOrb(o.id,300);}
        if(l){if(p&&p.st===0)landLoot(p,l);else releaseLoot(l.id);}   // boxes and bubbles need no question
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
        // Knocked back: flying to the edge of the map; on landing, half speed for 1 s.
        // Knocked back: flying to the edge of the map (whatever they were doing); no slowing down after landing.
        if(p.kb){const f=flyPos(p.kb,g.t);p.x=f.x;p.y=f.y;if(g.t>=p.kb.t1){p.x=p.kb.x1;p.y=p.kb.y1;p.kb=null;if(p.st===3)p.st=0;}}
        if((p.st===2||p.st===3||p.st===5)&&g.t>=p.until&&!p.kb)p.st=0;
        if(p.st===0&&!p.kb&&(p.dx||p.dy)&&!g.hooks.some(h=>h.o===p.id)){const v=speedOf(p)*dt/1000,pos=confine(p.x+p.dx*v,p.y+p.dy*v);p.x=pos.x;p.y=pos.y;}
        if(!p.kb&&g.zones.length){
          for(const z of g.zones)if(z.k==='w'&&z.team!==p.team&&g.t>=z.from&&g.t<z.until&&!z.safe.includes(p.id)&&p.sh>g.t&&Math.hypot(p.x-z.x,p.y-z.y)<=C.WHIRL.R){
            p.sh=0;z.safe.push(p.id);addFx('block',p,[p.id]);}   // a shield takes the whirlpool once
          const m=dragWhirl(g.zones,p.team,p.x,p.y,g.t,dt,p.id);if(m){p.x=m.x;p.y=m.y;}}
      }
      stepHooks();
      stepShots();
      if(g.items)stepLoot();
      stepRush();
      if(g.fx.length&&g.t-g.fx[0].at>3000)g.fx=g.fx.filter(f=>g.t-f.at<=3000);
      if(g.t>=g.limit)finish('time');
    };
    g.snapshot=()=>{
      const now=Date.now();for(const [id,at] of g.kicked)if(now-at>15000)g.kicked.delete(id);
      return {ph:g.ph,t:Math.round(g.t),cd:Math.ceil(g.cd),tc:g.teams,sc:g.sc.slice(0,g.teams),tg:g.target,tl:g.limit,nq:g.qs.length,
        p:[...g.players.values()].map(p=>[p.id,p.name,p.team,Math.round(p.x),Math.round(p.y),+p.dx.toFixed(2),+p.dy.toFixed(2),p.st,Math.round(p.until),p.q,p.ok,p.rs,p.rk,p.qn,p.av,
          p.cards.join(','),p.sh>g.t?Math.round(p.sh):0,p.x2?1:0,
          p.kb?[Math.round(p.kb.x0),Math.round(p.kb.y0),Math.round(p.kb.x1),Math.round(p.kb.y1),Math.round(p.kb.t0),Math.round(p.kb.t1)]:0,
          p.ink>g.t?Math.round(p.ink):0,p.lock>g.t?Math.round(p.lock):0]),
        // A bomb fish also carries its team and the spot it swims around (the other team's phones draw it as a plain fish).
        o:g.orbs.map(o=>{const a=[o.id,o.k,o.s,Math.round(o.b),o.hk,o.by];if(o.bomb!=null)a.push(o.bomb,o.c[0],o.c[1]);return a;}),
        h:g.hooks.map(h=>[h.o,Math.round(h.x),Math.round(h.y),+h.a.toFixed(4),Math.round(h.t0),Math.round(h.tt),Math.round(h.d),h.orb,h.sp||1,h.loot||0]),
        l:g.loot.map(l=>[l.id,l.k,l.s,Math.round(l.b),l.hk]),
        s:g.shots.map(s=>s.k==='ice'?[s.id,'i',Math.round(s.x),Math.round(s.y),+s.a.toFixed(4),Math.round(s.t0),s.team]
          :[s.id,s.k==='whirl'?'w':'s',Math.round(s.x),Math.round(s.y),s.tx,s.ty,Math.round(s.t0),Math.round(s.land),s.team]),
        z:g.zones.map(z=>z.k==='w'&&z.safe.length?[z.id,z.team,z.x,z.y,Math.round(z.from),Math.round(z.until),z.k,z.safe]:[z.id,z.team,z.x,z.y,Math.round(z.from),Math.round(z.until),z.k]),
        fx:g.fx.map(f=>f.w!=null?[f.id,f.k,Math.round(f.at),f.by,f.x,f.y,f.to,f.tx||0,f.ty||0,f.w]:[f.id,f.k,Math.round(f.at),f.by,f.x,f.y,f.to,f.tx||0,f.ty||0]),
        ru:g.rush?Math.round(g.rush):0,it:g.items?1:0,md:g.mode,
        k:[...g.kicked.keys()],end:g.end};
    };
    return g;
  }
  /* Supabase free plan: 100 Realtime messages a second for the whole project, and every phone that receives a
     snapshot counts. More phones → fewer snapshots (phones fill the gaps by themselves). */
  // phones = all phones in every room this computer runs (the free limit is shared by the whole project).
  const snapEvery=phones=>phones<=6?250:phones<=12?333:phones<=16?400:phones<=20?500:phones<=26?600:phones<=32?700:phones<=40?850:1000;
  /* Unpack a snapshot into objects (phones). */
  function unpack(s){
    return {...s,
      p:s.p.map(a=>({id:a[0],name:a[1],team:a[2],x:a[3],y:a[4],dx:a[5],dy:a[6],st:a[7],until:a[8],q:a[9],ok:a[10],rs:a[11],rk:a[12],qn:a[13],av:a[14]??avOf(a[0]),
        cards:a[15]?String(a[15]).split(','):[],sh:a[16]||0,x2:!!(a[17]&1),
        kb:Array.isArray(a[18])?{x0:a[18][0],y0:a[18][1],x1:a[18][2],y1:a[18][3],t0:a[18][4],t1:a[18][5]}:null,ink:a[19]||0,lock:a[20]||0})),
      l:(s.l||[]).map(a=>({id:a[0],k:a[1],s:a[2],b:a[3],hk:a[4]})),
      s:(s.s||[]).map(a=>a[1]==='i'?{id:a[0],k:'ice',x:a[2],y:a[3],a:a[4],t0:a[5],team:a[6]}:{id:a[0],k:a[1]==='w'?'whirl':'slime',x:a[2],y:a[3],tx:a[4],ty:a[5],t0:a[6],land:a[7],team:a[8]}),
      z:(s.z||[]).map(a=>({id:a[0],team:a[1],x:a[2],y:a[3],from:a[4],until:a[5],k:a[6]||'s',safe:a[7]||[]})),
      fx:(s.fx||[]).map(a=>({id:a[0],k:a[1],at:a[2],by:a[3],x:a[4],y:a[5],to:a[6]||[],tx:a[7],ty:a[8],w:a[9]??''})),hid:s.hid||'',ru:s.ru||0,it:s.it??1,md:s.md||'score',
      o:s.o.map(a=>{const o={id:a[0],k:a[1],s:a[2],b:a[3],hk:a[4],by:a[5]};if(a.length>6){o.bomb=a[6];o.c=[a[7],a[8]];}return o;}),
      h:s.h.map(a=>({o:a[0],x:a[1],y:a[2],a:a[3],t0:a[4],tt:a[5],d:a[6],orb:a[7],sp:a[8]||1,loot:a[9]||0}))};
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
      const gr=ctx.createRadialGradient(0,0,6,0,0,58*s);
      gr.addColorStop(0,`rgba(255,236,140,${0.8*pu})`);gr.addColorStop(1,'rgba(255,214,80,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,58*s,0,TAU);ctx.fill();
      if(glow){ctx.save();ctx.globalAlpha=a*pu;ctx.drawImage(glow,-62*s,-44*s,124*s,88*s);ctx.restore();}
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
    if(o.mark)bombMark(ctx,18,-20,now);   // my team's bomb fish: only my team sees the little bomb
    ctx.restore();
  }
  function bombMark(ctx,x,y,now){
    if(effectSprite(ctx,'bomb-mark',x,y,30,30))return;
    ctx.save();ctx.translate(x,y);ctx.fillStyle='#3b3a45';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,2,8,0,TAU);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#b07a45';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(4,-5);ctx.quadraticCurveTo(7,-10,11,-9);ctx.stroke();
    const f=0.6+Math.sin(now/90)*0.4;ctx.fillStyle='#ffc93c';sparkle(ctx,12,-10,2+f*2.5);
    ctx.fillStyle='rgba(255,255,255,.6)';ctx.beginPath();ctx.arc(-3,-1,2.2,0,TAU);ctx.fill();ctx.restore();
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
  /* Optional effect art: only transforms and decoded images, never blur or new canvases per frame. */
  function effectSprite(ctx,key,x,y,w,h,rotation=0){
    const image=globalThis.HookArt?.get(key);if(!image)return false;
    ctx.save();ctx.translate(x,y);if(rotation)ctx.rotate(rotation);ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();return true;
  }
  function ice(ctx,now){
    if(effectSprite(ctx,'fx-ice-block',0,-5,78+Math.sin(now/350)*1.2,82)){
      flake(ctx,24,-43+Math.sin(now/300)*2,5,now/1300);flake(ctx,-23,-38+Math.cos(now/340)*2,4,-now/1200);return;
    }
    ctx.fillStyle='rgba(200,240,255,.58)';ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=2.5;rr(ctx,-29,-34,58,64,12);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-21,-20);ctx.lineTo(-11,-28);ctx.moveTo(-22,-10);ctx.lineTo(-18,-13);ctx.stroke();
    flake(ctx,19,-42+Math.sin(now/300)*2,6,now/900);flake(ctx,-17,-46+Math.cos(now/340)*2,4.5,-now/1000);
  }
  function drawBody(ctx,p,now,m,hook){
    const T=C.TEAMS[p.team]||C.TEAMS[0],A=ANIMALS[p.av]||ANIMALS[0],since=now-m.at;
    const jump=m.rk>0&&since<650?Math.sin(since/650*Math.PI)*22:0,shake=m.rk<0&&since<450?Math.sin(since/28)*3.5:0;
    const bob=p.mv?-Math.abs(Math.sin(now/90))*3.5:Math.sin(now/520+p.x*0.05)*0.8,step=p.mv?Math.sin(now/90)*2.4:0;
    // Knocked back by a card: flying in an arc to the edge of the map (p.lift = height, p.fly = direction), dust behind.
    const air=p.lift!=null?p.lift:p.st===3?34+Math.sin(now/110)*5:0;
    ctx.save();ctx.translate(p.x+shake,p.y);
    ctx.globalAlpha=0.4;ctx.fillStyle=T.color;ctx.beginPath();ctx.ellipse(0,24,Math.max(8,22-jump*0.25-air*0.25),7,0,0,TAU);ctx.fill();ctx.globalAlpha=1;
    if(p.slow)swirlFeet(ctx,now);
    if(p.fly!=null){ctx.save();ctx.translate(0,-air);trail(ctx,p.fly,now);ctx.restore();}
    if(p.me){ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.setLineDash([5,5]);ctx.lineDashOffset=-now/40;ctx.beginPath();ctx.ellipse(0,24,29,10.5,0,0,TAU);ctx.stroke();ctx.setLineDash([]);}
    ctx.translate(0,bob-jump-air);
    if(air){ctx.rotate(p.spin??Math.sin(now/90)*0.35);}   // one somersault through the air
    const ra=hook?Math.atan2(hook.ty-p.y,hook.tx-p.x):Math.atan2(m.fy,m.fx),side=Math.cos(ra)>=0?1:-1,behind=Math.sin(ra)<-0.3;
    const hand={x:side*17,y:6},tip={x:hand.x+Math.cos(ra)*26,y:hand.y+Math.sin(ra)*21-8};
    const rod=()=>{ctx.lineCap='round';ctx.strokeStyle='#b07a45';ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(hand.x,hand.y);ctx.lineTo(tip.x,tip.y);ctx.stroke();
      ctx.strokeStyle=INK;ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(hand.x,hand.y,4.8,0,TAU);paint(ctx,A.body);};
    const holding=p.st!==1&&p.st!==3&&p.st!==5;
    if(holding&&behind)rod();
    drawAnimal(ctx,p.av,{team:p.team,ex:m.fx*2.4,ey:p.st===1?-2.2:m.fy*1.6,face:p.st>=2?'frozen':jump>0?'happy':'',step:air?Math.sin(now/60)*3:step});
    if(holding&&!behind)rod();
    if(p.st===2)ice(ctx,now);
    if(p.st===5)dizzy(ctx,now);   // stunned by a bomb fish
    if(p.inked)inkMark(ctx,now);
    if(p.sh)bubble(ctx,now);
    ctx.restore();
    return {x:p.x+shake+tip.x,y:p.y+bob-jump-air+tip.y};
  }
  /* Ink on someone's phone: a drippy blot over their head on the big screen. */
  function inkMark(ctx,now){
    if(effectSprite(ctx,'ink-mark',0,-46+Math.sin(now/300)*1.5,30,30))return;
    ctx.save();ctx.translate(0,-46+Math.sin(now/300)*1.5);ctx.fillStyle='#3b2a4f';
    ctx.beginPath();for(let i=0;i<=12;i++){const a=i*TAU/12,r=11+(i%2?3:-1);i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.ellipse(-4,15,2.4,4,0,0,TAU);ctx.ellipse(5,16,2,3.2,0,0,TAU);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.arc(-4,-4,3,0,TAU);ctx.fill();ctx.restore();
  }
  /* Flying (dir = the way they are going): dust and speed lines trail behind. */
  function trail(ctx,dir,now){
    ctx.save();ctx.rotate(dir);ctx.translate(-44,8);
    const dust=globalThis.HookArt?.get('fx-hook-dust');
    if(dust){ctx.globalAlpha=0.85+Math.sin(now/90)*0.1;ctx.drawImage(dust,-58,-29,116,58);}
    else{ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=3;ctx.lineCap='round';
      for(let i=0;i<3;i++){const o=(now/60+i*7)%20;ctx.beginPath();ctx.moveTo(-10-o,-14+i*14);ctx.lineTo(-34-o,-14+i*14);ctx.stroke();}
      ctx.fillStyle='rgba(222,200,170,.6)';for(let i=0;i<4;i++){const k=(now/500+i/4)%1;ctx.globalAlpha=1-k;ctx.beginPath();ctx.arc(-6-k*30,14+Math.sin(i*2)*6,4+k*6,0,TAU);ctx.fill();}}
    ctx.restore();
  }
  // Caught in an enemy whirlpool: turning water rings around the feet.
  function swirlFeet(ctx,now){
    ctx.save();ctx.translate(0,22);ctx.scale(1,0.38);ctx.lineCap='round';
    for(let i=0;i<3;i++){const r=14+i*8,a=-now/(180+i*60)+i*2;ctx.strokeStyle=`rgba(70,190,215,${0.85-i*0.2})`;ctx.lineWidth=4-i;ctx.beginPath();ctx.arc(0,0,r,a,a+3.8);ctx.stroke();}
    ctx.restore();
  }
  // Stuck in slime: green goo around the feet with little bubbles.
  function goo(ctx,now){
    if(!effectSprite(ctx,'fx-slime-puddle',0,22,62+Math.sin(now/200)*3,23)){
      ctx.fillStyle='rgba(108,194,74,.75)';ctx.beginPath();ctx.ellipse(0,22,27+Math.sin(now/200)*2,9,0,0,TAU);ctx.fill();}
    ctx.fillStyle='rgba(190,240,150,.9)';for(let i=0;i<3;i++){const k=(now/700+i/3)%1;ctx.globalAlpha=1-k;ctx.beginPath();ctx.arc(-14+i*14,20-k*16,2.5+k*2,0,TAU);ctx.fill();}ctx.globalAlpha=1;}
  function dizzy(ctx,now){ctx.fillStyle='#ffc93c';ctx.strokeStyle='#fff';ctx.lineWidth=1.5;
    for(let i=0;i<3;i++){const a=now/260+i*TAU/3;ctx.save();ctx.translate(Math.cos(a)*22,-40+Math.sin(a)*6);
      const size=12+Math.sin(a)*2;if(!effectSprite(ctx,'fx-dizzy-star',0,0,size,size,Math.sin(a)*0.3))sparkle(ctx,0,0,6);ctx.restore();}}
  // Shield card: a soft bubble around the animal.
  function bubble(ctx,now){const r=37+Math.sin(now/260)*1.5;
    if(effectSprite(ctx,'fx-shield-bubble',0,-2,r*2.3,r*2.3)){
      ctx.save();ctx.fillStyle='#edfff8';const a=now/1500;sparkle(ctx,Math.cos(a)*r,-2+Math.sin(a)*r,2.6);ctx.restore();return;
    }
    const gr=ctx.createRadialGradient(-10,-14,4,0,-2,r);
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
    // A waiting power-up: ×2 (double), as a little tag after the name.
    let bx=p.x+w/2+4;
    for(const [on,txt,col] of [[p.x2,'×2','#f2b000']]){if(!on)continue;
      ctx.font=`700 13px ${FUN}`;const bw=ctx.measureText(txt).width+12;rr(ctx,bx,y-10,bw,20,10);ctx.fillStyle=col;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='#fff';ctx.textAlign='left';ctx.fillText(txt,bx+6,y+1);ctx.textAlign='center';bx+=bw+3;}
    ctx.font=`600 16px ${FUN}`;
    if(p.st===1){thinking(ctx,p.x+26,p.y-36,now);
      if(p.locked){ctx.save();ctx.globalAlpha=0.85;ctx.fillStyle='rgba(200,240,255,.7)';rr(ctx,p.x+20,p.y-52,42,28,12);ctx.fill();
        flake(ctx,p.x+30,p.y-38,6,now/500);flake(ctx,p.x+52,p.y-40,5,-now/600);ctx.restore();}}
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
  function aimDots(ctx,A,now=0){
    // Aiming a skill card, like a hero skill: the freeze arrow shows its straight path; the slime ball its reach and landing circle.
    if(A.kind==='ice'&&globalThis.HookArt?.get('fx-ice-arrow')){
      ctx.save();ctx.translate(A.x,A.y);ctx.rotate(A.a);
      ctx.fillStyle='rgba(145,216,255,.22)';rr(ctx,0,-C.SHOT.R,C.SHOT.RANGE,C.SHOT.R*2,C.SHOT.R);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=2;ctx.stroke();
      ctx.strokeStyle='#81cbea';ctx.lineWidth=3;ctx.lineCap='round';
      for(let d=40+(now/22)%42;d<C.SHOT.RANGE-25;d+=42){ctx.globalAlpha=0.35+0.5*d/C.SHOT.RANGE;ctx.beginPath();ctx.moveTo(d-7,-6);ctx.lineTo(d,0);ctx.lineTo(d-7,6);ctx.stroke();}
      ctx.globalAlpha=0.9;effectSprite(ctx,'fx-ice-arrow',C.SHOT.RANGE-18,0,52,26);ctx.restore();return;
    }
    if(A.kind==='slime'&&globalThis.HookArt?.get('fx-slime-puddle')){
      ctx.save();ctx.lineWidth=2;ctx.strokeStyle='rgba(255,255,255,.8)';ctx.setLineDash([8,10]);ctx.lineDashOffset=-now/70;
      ctx.beginPath();ctx.arc(A.x,A.y,C.SLIME.RANGE,0,TAU);ctx.stroke();ctx.setLineDash([]);
      ctx.globalAlpha=0.4;effectSprite(ctx,'fx-slime-puddle',A.tx,A.ty,C.SLIME.R*2,C.SLIME.R*2);ctx.globalAlpha=1;
      ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(A.tx,A.ty,C.SLIME.R,0,TAU);ctx.stroke();
      ctx.strokeStyle='#78bd55';ctx.lineWidth=2;ctx.beginPath();ctx.arc(A.tx,A.ty,C.SLIME.R-5,0,TAU);ctx.stroke();
      // A moving dotted parabola previews the throw without changing its actual landing point.
      for(let i=1;i<12;i++){const k=(i+(now/500)%1)/12;ctx.globalAlpha=0.4+0.5*k;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(A.x+(A.tx-A.x)*k,A.y+(A.ty-A.y)*k-Math.sin(Math.PI*k)*45,2.5,0,TAU);ctx.fill();}
      ctx.globalAlpha=1;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(A.tx-7,A.ty);ctx.lineTo(A.tx+7,A.ty);ctx.moveTo(A.tx,A.ty-7);ctx.lineTo(A.tx,A.ty+7);ctx.stroke();ctx.restore();return;
    }
    if(A.kind==='ice'){const ex=A.x+Math.cos(A.a)*C.SHOT.RANGE,ey=A.y+Math.sin(A.a)*C.SHOT.RANGE,nx=-Math.sin(A.a)*C.SHOT.R,ny=Math.cos(A.a)*C.SHOT.R;
      ctx.fillStyle='rgba(120,200,255,.28)';ctx.beginPath();ctx.moveTo(A.x+nx,A.y+ny);ctx.lineTo(ex+nx,ey+ny);ctx.lineTo(ex-nx,ey-ny);ctx.lineTo(A.x-nx,A.y-ny);ctx.closePath();ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=2.5;ctx.stroke();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(ex+Math.cos(A.a)*16,ey+Math.sin(A.a)*16);ctx.lineTo(ex+nx*1.2,ey+ny*1.2);ctx.lineTo(ex-nx*1.2,ey-ny*1.2);ctx.closePath();ctx.fill();return;}
    if(A.kind==='slime'){ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=2.5;ctx.setLineDash([10,9]);ctx.beginPath();ctx.arc(A.x,A.y,C.SLIME.RANGE,0,TAU);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='rgba(108,194,74,.3)';ctx.beginPath();ctx.arc(A.tx,A.ty,C.SLIME.R,0,TAU);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=2;ctx.setLineDash([4,7]);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(A.tx,A.ty);ctx.stroke();ctx.setLineDash([]);return;}
    // Knock-back: the fan in front of the player; every enemy inside it will fly.
    if(A.kind==='fan'){ctx.save();ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.arc(A.x,A.y,C.FAN.R,A.a-C.FAN.HALF,A.a+C.FAN.HALF);ctx.closePath();
      ctx.fillStyle='rgba(255,154,60,.22)';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();
      ctx.strokeStyle='rgba(255,140,40,.85)';ctx.lineWidth=3;ctx.lineCap='round';
      for(let i=1;i<=3;i++){const rad=C.FAN.R*((i+(now/400)%1)/4);ctx.globalAlpha=0.3+0.6*rad/C.FAN.R;ctx.beginPath();ctx.arc(A.x,A.y,rad,A.a-C.FAN.HALF*0.85,A.a+C.FAN.HALF*0.85);ctx.stroke();}
      ctx.restore();return;}
    // Whirlpool: its reach, a dotted throw and the circle in the lake where the fish will be pulled together.
    if(A.kind==='whirl'){ctx.save();ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=2.5;ctx.setLineDash([10,9]);ctx.lineDashOffset=-now/70;ctx.beginPath();ctx.arc(A.x,A.y,C.WHIRL.RANGE,0,TAU);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='rgba(47,179,201,.22)';ctx.beginPath();ctx.arc(A.tx,A.ty,C.WHIRL.R,0,TAU);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();
      ctx.strokeStyle='rgba(47,179,201,.9)';ctx.lineWidth=2.5;for(let i=0;i<3;i++){const r0=C.WHIRL.R*(0.25+i*0.22),a0=-now/300+i*2.1;ctx.beginPath();ctx.arc(A.tx,A.ty,r0,a0,a0+3.4);ctx.stroke();}
      for(let i=1;i<12;i++){const k=(i+(now/500)%1)/12;ctx.globalAlpha=0.4+0.5*k;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(A.x+(A.tx-A.x)*k,A.y+(A.ty-A.y)*k-Math.sin(Math.PI*k)*45,2.5,0,TAU);ctx.fill();}
      ctx.restore();return;}
    ctx.fillStyle='#fff';ctx.strokeStyle='#fff';ctx.lineWidth=3;
    for(let d=34;d<=C.RANGE;d+=24){ctx.globalAlpha=0.95-d/C.RANGE*0.55;ctx.beginPath();ctx.arc(A.x+Math.cos(A.a)*d,A.y+Math.sin(A.a)*d,3.6,0,TAU);ctx.fill();}
    ctx.globalAlpha=0.9;ctx.beginPath();ctx.arc(A.x+Math.cos(A.a)*C.RANGE,A.y+Math.sin(A.a)*C.RANGE,11,0,TAU);ctx.stroke();
    ctx.globalAlpha=1;
  }
  /* Floating in the lake: a "?" box (a card inside, decided when it is reeled in) or the shield bubble.
     l = {id, k: 'c' box | 'b' bubble, x, y, alpha, hooked} */
  function drawLoot(ctx,l,now){
    const a=l.alpha??1;if(a<=0)return;
    const b=l.hooked?0:Math.sin(now/420+l.id)*2.5,r=l.hooked?Math.sin(now/70)*0.3:Math.sin(now/800+l.id)*0.1;
    ctx.save();ctx.globalAlpha=a;ctx.translate(l.x,l.y);
    if(!l.hooked){ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=2;const w=(now/1400+l.id*0.37)%1;
      ctx.beginPath();ctx.ellipse(0,12,18+w*14,5+w*4,0,0,TAU);ctx.globalAlpha=a*(1-w);ctx.stroke();ctx.globalAlpha=a;
      ctx.fillStyle='rgba(255,255,255,.28)';ctx.beginPath();ctx.ellipse(0,12,19,5.5,0,0,TAU);ctx.fill();}
    ctx.translate(0,b-4);ctx.rotate(r);
    if(l.k==='b'){
      const pu=0.8+Math.sin(now/260+l.id)*0.2;
      if(!effectSprite(ctx,'lake-bubble',0,0,50,50)){
        if(!effectSprite(ctx,'fx-shield-bubble',0,0,50,50)){const gr=ctx.createRadialGradient(-7,-9,3,0,0,23);
          gr.addColorStop(0,'rgba(255,255,255,.55)');gr.addColorStop(0.7,'rgba(150,240,210,.25)');gr.addColorStop(1,'rgba(60,200,149,.45)');
          ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,22,0,TAU);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=2.5;ctx.stroke();}
        if(!effectSprite(ctx,'card-shield',0,1,24,24)){ctx.fillStyle='#3cc895';ctx.strokeStyle='#fff';ctx.lineWidth=2;
          ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(8,-6);ctx.lineTo(8,1);ctx.quadraticCurveTo(7,8,0,11);ctx.quadraticCurveTo(-7,8,-8,1);ctx.lineTo(-8,-6);ctx.closePath();ctx.fill();ctx.stroke();}}
      ctx.fillStyle='#edfff8';sparkle(ctx,17,-15,2+pu*2.5);
    }else{
      if(!effectSprite(ctx,'lake-box',0,0,48,48)){
        const sprite=globalThis.HookArt?.get('card-mystery');
        if(sprite)ctx.drawImage(sprite,-17,-21,34,42);
        else{const gr=ctx.createLinearGradient(0,-17,0,17);gr.addColorStop(0,'#c6a8ff');gr.addColorStop(1,'#ff8fb5');
          rr(ctx,-13,-17,26,34,7);ctx.fillStyle=gr;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.stroke();}}
      ctx.font=`700 18px ${FUN}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3.5;ctx.strokeStyle='#8a5fd6';ctx.fillStyle='#fff';
      if(!globalThis.HookArt?.get('card-mystery')||globalThis.HookArt?.get('lake-box')){ctx.strokeText('?',0,1);ctx.fillText('?',0,1);}
      ctx.fillStyle='#fff';const tw=Math.max(0,Math.sin(now/260+l.id*2));if(tw>0.2)sparkle(ctx,14,-18,2+tw*4);
    }
    ctx.restore();
  }
  /* A slime puddle on the ground: owner-coloured rim, softly moving jelly and bubbles. */
  /* A whirlpool in the lake: turning rings of water, the thrower's colour on the rim. */
  function drawWhirl(ctx,z,t,now){
    const T=C.TEAMS[z.team]||C.TEAMS[0],R=C.WHIRL.R,fade=Math.min(1,(t-z.from)/300,(z.until-t)/500),spin=(t-z.from)/260;
    ctx.save();ctx.globalAlpha=fade;ctx.translate(z.x,z.y);
    if(!effectSprite(ctx,'fx-whirl',0,0,R*2.1,R*2.1,-spin)){
      const gr=ctx.createRadialGradient(0,0,6,0,0,R);gr.addColorStop(0,'rgba(20,90,140,.55)');gr.addColorStop(0.55,'rgba(60,170,210,.3)');gr.addColorStop(1,'rgba(120,220,240,0)');
      ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,R,0,TAU);ctx.fill();
      ctx.lineCap='round';
      for(let i=0;i<4;i++){const r0=R*(0.22+i*0.2),a0=-spin*(1.6-i*0.25)+i*1.7;ctx.strokeStyle=`rgba(255,255,255,${0.85-i*0.15})`;ctx.lineWidth=5-i;
        ctx.beginPath();ctx.arc(0,0,r0,a0,a0+3.6);ctx.stroke();ctx.beginPath();ctx.arc(0,0,r0,a0+Math.PI,a0+Math.PI+2);ctx.stroke();}}
    ctx.strokeStyle=T.color;ctx.lineWidth=4;ctx.setLineDash([14,10]);ctx.lineDashOffset=now/40;ctx.beginPath();ctx.arc(0,0,R,0,TAU);ctx.stroke();ctx.setLineDash([]);
    ctx.restore();
  }
  function drawZone(ctx,z,t,now){
    if(t<z.from||t>=z.until)return;if(z.k==='w')return drawWhirl(ctx,z,t,now);
    const T=C.TEAMS[z.team]||C.TEAMS[0],R=C.SLIME.R,fade=Math.min(1,(t-z.from)/200,(z.until-t)/400);
    ctx.save();ctx.globalAlpha=fade;ctx.translate(z.x,z.y);
    const sprite=globalThis.HookArt?.get('fx-slime-puddle');
    if(sprite){
      ctx.save();ctx.beginPath();ctx.arc(0,0,R,0,TAU);ctx.clip();const wobble=1+Math.sin(now/380+z.id)*0.025;
      ctx.globalAlpha=fade*0.78;ctx.drawImage(sprite,-R*wobble,-R/wobble,R*2*wobble,R*2/wobble);ctx.restore();
      ctx.beginPath();ctx.arc(0,0,R,0,TAU);ctx.strokeStyle=T.color;ctx.lineWidth=5;ctx.stroke();
      ctx.setLineDash([2,13]);ctx.lineDashOffset=-now/80;ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
    }else{
    ctx.beginPath();for(let i=0;i<=24;i++){const a=i*TAU/24,r=R*(0.93+0.07*Math.sin(a*5+now/400+z.id));i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}
    const gr=ctx.createRadialGradient(-20,-20,10,0,0,R);gr.addColorStop(0,'rgba(190,240,140,.7)');gr.addColorStop(1,'rgba(90,175,60,.55)');
    ctx.fillStyle=gr;ctx.fill();ctx.strokeStyle=T.color;ctx.lineWidth=4;ctx.setLineDash([12,8]);ctx.lineDashOffset=-now/60;ctx.stroke();ctx.setLineDash([]);
    }
    ctx.fillStyle='rgba(235,255,215,.85)';for(let i=0;i<6;i++){const k=(now/900+i/6)%1,a=i*2.4+z.id;ctx.globalAlpha=fade*(1-k);ctx.beginPath();ctx.arc(Math.cos(a)*R*0.55,Math.sin(a)*R*0.55-k*10,3+k*5,0,TAU);ctx.fill();}
    ctx.restore();
  }
  /* Freeze arrows in flight, and slime balls flying in an arc. */
  function drawShot(ctx,s,t,now){
    if(s.k==='ice'){const p=shotAt(s,t);if(!p)return;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(s.a);
      for(let i=1;i<=4;i++){ctx.globalAlpha=0.5-i*0.1;ctx.fillStyle='#dff4ff';ctx.beginPath();ctx.arc(-i*13,Math.sin(now/40+i)*3,7-i,0,TAU);ctx.fill();}
      if(globalThis.HookArt?.get('fx-ice-arrow')){
        ctx.strokeStyle='#e6faff';ctx.lineWidth=4;ctx.lineCap='round';
        for(let i=0;i<3;i++){ctx.globalAlpha=0.45-i*0.1;ctx.beginPath();ctx.moveTo(-20-i*9,(i-1)*5);ctx.lineTo(-55-i*8,(i-1)*5);ctx.stroke();}
        ctx.globalAlpha=1;effectSprite(ctx,'fx-ice-arrow',0,0,96,48);ctx.restore();return;
      }
      ctx.globalAlpha=1;const gr=ctx.createLinearGradient(-22,0,22,0);gr.addColorStop(0,'#bfe8ff');gr.addColorStop(1,'#ffffff');
      ctx.fillStyle=gr;ctx.strokeStyle='#4fb3f2';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(24,0);ctx.lineTo(4,-10);ctx.lineTo(-18,-5);ctx.lineTo(-14,0);ctx.lineTo(-18,5);ctx.lineTo(4,10);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.restore();return;}
    const k=clamp((t-s.t0)/(s.land-s.t0),0,1),x=s.x+(s.tx-s.x)*k,y=s.y+(s.ty-s.y)*k,h=Math.sin(Math.PI*k)*80;
    ctx.fillStyle='rgba(74,52,64,.18)';ctx.beginPath();ctx.ellipse(x,y+10,16*(1-k*0.3),6,0,0,TAU);ctx.fill();
    ctx.save();ctx.translate(x,y-h-10);ctx.rotate(now/150);
    if(s.k==='whirl'){   // a little ball of turning water
      ctx.fillStyle='#5cc8e0';ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,14,0,TAU);ctx.fill();ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.beginPath();ctx.arc(0,0,8,0,3.6);ctx.stroke();ctx.beginPath();ctx.arc(0,0,3.5,1,4.4);ctx.stroke();
      ctx.restore();return;}
    if(globalThis.HookArt?.get('fx-slime-ball')){
      const squash=Math.sin(Math.PI*k)*0.12;ctx.scale(1-squash,1+squash);effectSprite(ctx,'fx-slime-ball',0,0,38,38);ctx.restore();return;
    }
    ctx.fillStyle='#6cc24a';ctx.strokeStyle='#3e8a26';ctx.lineWidth=2.5;ctx.beginPath();
    for(let i=0;i<=10;i++){const a=i*TAU/10,r=15+Math.sin(a*3+now/90)*2.5;i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}
    ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='rgba(255,255,255,.75)';ctx.beginPath();ctx.arc(-5,-5,4,0,TAU);ctx.fill();ctx.restore();
  }
  const FX_TXT={up:['击飞！','#ff8a1f'],ice:['冻住！','#3c9ad6'],slime:['缓速！','#4f9e2c'],shield:['保护罩','#139466'],x2:['加倍！','#d99a00'],block:['挡住了！','#139466'],rush:['金鱼潮！','#e0a000'],
    whirl:['漩涡！','#1f95ab'],bomb:['炸弹鱼！','#e2412c'],ink:['墨水！','#5b3f86'],box:['拿到卡！','#8a5fd6'],steal:['偷到了！','#8d5a3a']};
  /* A cartoon glove (until a picture is ready). */
  function glove(ctx,x,y,a){
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(a/80)*0.3);ctx.fillStyle='#7b4fa8';ctx.strokeStyle='#fff';ctx.lineWidth=2.5;
    rr(ctx,-11,-4,22,20,8);ctx.fill();ctx.stroke();
    for(const [fx,fy] of [[-8,-14],[-2.5,-17],[3,-17],[8.5,-14]]){ctx.beginPath();ctx.ellipse(fx,fy,3.4,7,0,0,TAU);ctx.fill();ctx.stroke();}
    ctx.beginPath();ctx.ellipse(-13,3,3.6,6.5,-0.9,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle='#ffc93c';rr(ctx,-11,12,22,6,3);ctx.fill();
    ctx.restore();
  }
  function popText(ctx,txt,x,y,col,k,size=26){ctx.globalAlpha=Math.min(1,(1-k)*2.5);ctx.font=`700 ${size}px ${FUN}`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.lineJoin='round';ctx.lineWidth=6;ctx.strokeStyle='#fff';ctx.strokeText(txt,x,y);ctx.fillStyle=col;ctx.fillText(txt,x,y);ctx.globalAlpha=1;}
  /* Card effects: a shock ring for knock-up, an icy beam for freeze, a burst for the goldfish rush, and a word that floats up. */
  function drawFx(ctx,f){
    const a=f.age;if(a<0||a>1400)return;const k=a/1400,[txt,col]=FX_TXT[f.k]||['',''];
    if(f.k==='up'&&a<600){const q=a/600,e=1-(1-q)**2,R=C.FAN.R*(0.25+0.75*e),A=f.tx||0;ctx.save();ctx.globalAlpha=1-q;
      ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.arc(f.x,f.y,R,A-C.FAN.HALF,A+C.FAN.HALF);ctx.closePath();ctx.fillStyle='rgba(255,179,92,.28)';ctx.fill();
      ctx.lineCap='round';for(let i=0;i<3;i++){const rr2=R*(0.55+i*0.22);ctx.strokeStyle=i?'#ffb35c':'#fff';ctx.lineWidth=(7-i*2)*(1-q)+2;ctx.beginPath();ctx.arc(f.x,f.y,rr2,A-C.FAN.HALF*0.9,A+C.FAN.HALF*0.9);ctx.stroke();}
      ctx.restore();}
    // Thief glove: a little glove flies from the victim back to the thief with what it took.
    if(f.k==='steal'&&a<900){const q=Math.min(1,a/700),e=q<0.5?2*q*q:1-(-2*q+2)**2/2,x=f.tx+(f.x-f.tx)*e,y=f.ty-20+(f.y-20-f.ty+20)*e-Math.sin(Math.PI*q)*60;
      ctx.save();ctx.globalAlpha=a>700?1-(a-700)/200:1;
      if(!effectSprite(ctx,'fx-glove',x,y,54,54,Math.sin(a/80)*0.3))glove(ctx,x,y,a);
      if(f.w&&f.w!=='x'){ctx.font=`700 16px ${FUN}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.fillStyle='#a0785a';
        const lab=f.w==='p'?'+1':(CARDS[f.w]?.zh||'卡');ctx.strokeText(lab,x,y-26);ctx.fillText(lab,x,y-26);}
      ctx.restore();
      if(f.w!=='x')popText(ctx,'被偷了！',f.tx,f.ty-70-k*30,'#e2416c',k,22);}
    if(f.k==='bomb'&&f.w&&f.w!=='0')popText(ctx,'-'+f.w,f.tx+40,f.ty-10-k*40,'#e2412c',k,30);
    if(f.k==='ice'&&a<700&&globalThis.HookArt?.get('fx-ice-burst')){
      const q=a/700,e=1-(1-q)**3;ctx.save();ctx.globalAlpha=(1-q)**0.7;
      effectSprite(ctx,'fx-ice-burst',f.tx,f.ty-10,40+e*88,40+e*88,q*0.15);
      for(let i=0;i<6;i++){const r=i*TAU/6;flake(ctx,f.tx+Math.cos(r)*(15+e*50),f.ty-10+Math.sin(r)*(15+e*50),5*(1-q)+2,r+q);}
      ctx.restore();
    }else if(f.k==='ice'&&a<700){const q=a/700;ctx.globalAlpha=1-q;ctx.strokeStyle='#bfe8ff';ctx.lineWidth=6*(1-q)+2;ctx.beginPath();ctx.arc(f.tx,f.ty-10,20+q*40,0,TAU);ctx.stroke();
      for(let i=0;i<6;i++)flake(ctx,f.tx+Math.cos(i*1.05)*44*q,f.ty-10+Math.sin(i*1.05)*44*q,7,i);ctx.globalAlpha=1;}
    if(f.k==='slime'&&a<600&&globalThis.HookArt?.get('fx-slime-splash')){
      const q=a/600,e=1-(1-q)**3;ctx.save();ctx.globalAlpha=1-q;
      effectSprite(ctx,'fx-slime-splash',f.x,f.y,35+e*C.SLIME.R*2,25+e*C.SLIME.R*1.7);
      for(let i=0;i<7;i++){const r=i*TAU/7,d=C.SLIME.R*e;effectSprite(ctx,'fx-slime-ball',f.x+Math.cos(r)*d,f.y+Math.sin(r)*d*0.75-Math.sin(q*Math.PI)*18,9*(1-q)+3,12*(1-q)+3,r);}
      ctx.restore();
    }else if(f.k==='slime'&&a<600){const q=a/600;ctx.globalAlpha=1-q;ctx.fillStyle='#8bd65f';for(let i=0;i<9;i++){const r=i*TAU/9;ctx.beginPath();ctx.arc(f.x+Math.cos(r)*C.SLIME.R*q,f.y+Math.sin(r)*C.SLIME.R*q*0.8,7*(1-q)+2,0,TAU);ctx.fill();}ctx.globalAlpha=1;}
    if((f.k==='shield'||f.k==='block')&&a<600){const q=a/600;ctx.globalAlpha=1-q;ctx.strokeStyle='#8eebc8';ctx.lineWidth=5;ctx.beginPath();ctx.arc(f.x,f.y-2,38+q*30,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
    if(f.k==='rush'&&a<900){const q=a/900;ctx.globalAlpha=1-q;ctx.fillStyle='#ffd23f';for(let i=0;i<12;i++){const r=i*TAU/12;sparkle(ctx,f.x+Math.cos(r)*90*q,f.y-20+Math.sin(r)*70*q,8*(1-q)+2);}ctx.globalAlpha=1;}
    // Bomb fish: a cartoon blast of water, smoke puffs and stars where it was caught.
    if(f.k==='bomb'&&a<800){const q=a/800,e=1-(1-q)**3;ctx.save();ctx.globalAlpha=1-q*q;
      if(!effectSprite(ctx,'fx-bomb',f.tx,f.ty,60+e*100,60+e*100,q*0.2)){
        ctx.fillStyle='#ffd23f';ctx.beginPath();for(let i=0;i<=16;i++){const r=i*TAU/16,d=(i%2?22:44)*(0.5+e);i?ctx.lineTo(f.tx+Math.cos(r)*d,f.ty+Math.sin(r)*d):ctx.moveTo(f.tx+Math.cos(r)*d,f.ty+Math.sin(r)*d);}ctx.closePath();ctx.fill();
        ctx.fillStyle='#ff7a4d';ctx.beginPath();ctx.arc(f.tx,f.ty,16*(0.5+e),0,TAU);ctx.fill();
        ctx.fillStyle='rgba(235,235,245,.9)';for(let i=0;i<6;i++){const r=i*TAU/6+0.4;ctx.beginPath();ctx.arc(f.tx+Math.cos(r)*(30+e*40),f.ty+Math.sin(r)*(22+e*30),9*(1-q)+3,0,TAU);ctx.fill();}}
      ctx.fillStyle='#fff';for(let i=0;i<5;i++){const r=i*TAU/5;sparkle(ctx,f.tx+Math.cos(r)*(20+e*60),f.ty+Math.sin(r)*(14+e*44),6*(1-q)+2);}
      ctx.restore();}
    // Ink: a dark splash bursting from whoever used it.
    if(f.k==='ink'&&a<700){const q=a/700,e=1-(1-q)**3;ctx.save();ctx.globalAlpha=1-q;ctx.fillStyle='#3b2a4f';
      for(let i=0;i<9;i++){const r=i*TAU/9+0.2,d=20+e*90;ctx.beginPath();ctx.arc(f.x+Math.cos(r)*d,f.y-20+Math.sin(r)*d*0.7,7*(1-q)+3,0,TAU);ctx.fill();}ctx.restore();}
    // Whirlpool lands: a ring of spray.
    if(f.k==='whirl'&&a<600){const q=a/600;ctx.save();ctx.globalAlpha=1-q;ctx.strokeStyle='#fff';ctx.lineWidth=5*(1-q)+2;ctx.beginPath();ctx.arc(f.x,f.y,C.WHIRL.R*(0.3+q*0.7),0,TAU);ctx.stroke();ctx.restore();}
    if(txt&&!(f.k==='steal'&&f.w==='x')){const at=f.k==='ice'||f.k==='bomb'?{x:f.tx,y:f.ty}:f;popText(ctx,txt,at.x,at.y-(f.k==='slime'||f.k==='whirl'?20:f.k==='bomb'?40:78)-k*30,col,k,f.k==='rush'?34:26);}
  }
  /* Goldfish rush: the lake glows warm gold and sparkles drift over it. */
  function rushGlow(ctx,now,left){
    const s=C.SEA,pu=0.85+Math.sin(now/300)*0.15,fade=Math.min(1,left/800);
    // The whole picture turns warm gold and the lake glows (the teacher asked for a clearly different colour),
    // with Codex's sparkling ring around the water's edge when the picture has loaded.
    ctx.save();ctx.globalAlpha=fade;ctx.fillStyle=`rgba(255,196,50,${0.15*pu})`;ctx.fillRect(0,0,C.W,C.H);
    // Recolour the water itself to gold (a plain yellow wash over blue water looks green).
    ctx.globalCompositeOperation='color';ctx.globalAlpha=fade*0.7;ctx.fillStyle='#ffbf2e';ctx.beginPath();ctx.ellipse(s.x,s.y,s.rx,s.ry,0,0,TAU);ctx.fill();
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=fade;
    const gr=ctx.createRadialGradient(s.x,s.y,20,s.x,s.y,s.rx);gr.addColorStop(0,`rgba(255,240,170,${0.45*pu})`);gr.addColorStop(0.7,`rgba(255,220,110,${0.18*pu})`);gr.addColorStop(1,'rgba(255,200,60,0)');
    ctx.fillStyle=gr;ctx.beginPath();ctx.ellipse(s.x,s.y,s.rx,s.ry,0,0,TAU);ctx.fill();
    const glow=globalThis.HookArt?.get('rush-glow');
    if(glow){ctx.globalAlpha=fade*pu;ctx.drawImage(glow,s.x-s.rx-14,s.y-s.ry-10,s.rx*2+28,s.ry*2+20);ctx.globalAlpha=fade;}
    ctx.fillStyle='#fff6c8';for(let i=0;i<18;i++){const t=now/2600+i*0.71,x=s.x+Math.cos(t*1.3+i)*s.rx*0.85,y=s.y+Math.sin(t+i*2.1)*s.ry*0.85,tw=Math.sin(now/240+i*1.7);if(tw>0)sparkle(ctx,x,y,2.5+tw*4.5);}
    ctx.restore();
  }
  let sceneKey='',sceneCv=null;
  /* V = {tc, t (game time), players:[{id,x,y,team,av,name,st,me,fx,fy,mv,rs,rk,sh,x2,slow,kb,ink}], orbs:[{id,k,x,y,alpha,held,hooked,mark}],
         hooks:[{o,x,y,tx,ty,team,caught}], aim:{x,y,a} | {kind:'ice'|'fan',x,y,a} | {kind:'slime'|'whirl',x,y,tx,ty}, loot:[{id,k,x,y,alpha,hooked}],
         shots (unpacked snapshot s), zones (z), fx:[{k,x,y,tx,ty,age}], rush: ms of goldfish rush left (0 = none)} */
  function render(ctx,cw,ch,dpr,V,now,top=0){
    const vp=viewport(cw,ch-top);vp.oy+=top;const sc=vp.k*dpr,key=sc.toFixed(4)+'|'+(V.tc||2)+'|'+(globalThis.HookArt?.revision||0),rush=V.rush>0;
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=GRASS;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
    if(key!==sceneKey){sceneKey=key;sceneCv=scenery(sc,V.tc||2);}
    ctx.drawImage(sceneCv,dpr*vp.ox,dpr*vp.oy,C.W*sc,C.H*sc);
    ctx.setTransform(sc,0,0,sc,dpr*vp.ox,dpr*vp.oy);
    water(ctx,now);
    if(rush)rushGlow(ctx,now,V.rush);
    const gt=V.t||0;
    for(const z of V.zones||[])drawZone(ctx,z,gt,now);
    for(const l of V.loot||[])if(!l.hooked)drawLoot(ctx,l,now);
    for(const o of V.orbs)if(!o.held&&!o.hooked)drawFish(ctx,o,now,rush);
    if(V.aim)aimDots(ctx,V.aim,now);
    const hookBy=new Map(V.hooks.map(h=>[h.o,h])),tips=new Map(),mem=new Map(),ps=[...V.players].sort((a,b)=>a.y-b.y);
    for(const p of ps){const m=pState(p,now);mem.set(p.id,m);
      // Knocked back: an arc to the edge of the map with one somersault; dizzy for a moment after landing; ink over the head.
      const q={...p,inked:p.ink>gt,locked:p.lock>gt};
      if(p.kb){const k=clamp((gt-p.kb.t0)/Math.max(1,p.kb.t1-p.kb.t0),0,1),dir=Math.atan2(p.kb.y1-p.kb.y0,p.kb.x1-p.kb.x0);
        Object.assign(q,{lift:Math.sin(Math.PI*k)*(36+Math.min(60,Math.hypot(p.kb.x1-p.kb.x0,p.kb.y1-p.kb.y0)*0.08)),fly:dir,spin:(Math.cos(dir)>=0?1:-1)*k*TAU});}
      tips.set(p.id,drawBody(ctx,q,now,m,hookBy.get(p.id)));}
    for(const h of V.hooks)drawLine(ctx,tips.get(h.o)||h,h);
    for(const l of V.loot||[])if(l.hooked)drawLoot(ctx,l,now);
    for(const o of V.orbs)if(o.held||o.hooked)drawFish(ctx,o,now,rush);
    for(const p of ps)drawLabel(ctx,p,now,mem.get(p.id));
    for(const s of V.shots||[])drawShot(ctx,s,gt,now);
    for(const f of V.fx||[])drawFx(ctx,f);
    if(pMem.size>80)pMem.clear();if(fishMem.size>80)fishMem.clear();
    ctx.setTransform(1,0,0,1,0,0);return vp;
  }
  /* Ink card: big blots over most of a phone's screen (the edges stay a little visible). k = how strong (fades in and out),
     seed = when the ink hit, so the blots keep their shape. Drawn in screen pixels, on top of the game. */
  function inkCover(ctx,cw,ch,k,seed){
    if(k<=0)return;const r=rng(seed>>>0),s=Math.min(cw,ch);
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=k;
    const sprites=[1,2,3].map(i=>globalThis.HookArt?.get('ink-'+i)).filter(Boolean);
    for(let i=0;i<7;i++){
      const x=i?cw*(0.16+0.68*r()):cw*0.5,y=i?ch*(0.14+0.72*r()):ch*0.5,rad=s*(0.3+0.16*r()),rot=r()*TAU;   // the first blot always covers the middle
      if(sprites.length){ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.drawImage(sprites[i%sprites.length],-rad*1.2,-rad*1.2,rad*2.4,rad*2.4);ctx.restore();continue;}
      ctx.fillStyle='#2b1d3c';ctx.beginPath();
      for(let j=0;j<=18;j++){const a=j*TAU/18+rot,d=rad*(0.78+0.3*Math.abs(Math.sin(j*2.7+i)));j?ctx.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d):ctx.moveTo(x+Math.cos(a)*d,y+Math.sin(a)*d);}
      ctx.closePath();ctx.fill();
      for(let j=0;j<3;j++){const a=r()*TAU,d=rad*(1.05+0.35*r());ctx.beginPath();ctx.arc(x+Math.cos(a)*d,y+Math.sin(a)*d,s*(0.012+0.025*r()),0,TAU);ctx.fill();}   // splatter
      ctx.beginPath();ctx.ellipse(x+rad*0.2,y+rad*0.95,s*0.02,s*0.07,0,0,TAU);ctx.fill();   // a drip
      ctx.fillStyle='rgba(255,255,255,.14)';ctx.beginPath();ctx.ellipse(x-rad*0.35,y-rad*0.4,rad*0.28,rad*0.13,-0.6,0,TAU);ctx.fill();   // shine
    }
    ctx.restore();
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
  /* The version of this page on the website right now ('' if it can't be read). */
  function latestVersion(){
    if(typeof fetch==='undefined'||typeof location==='undefined')return Promise.resolve('');
    return fetch(location.pathname+'?fresh='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'')
      .then(t=>(/name="hook-version" content="([0-9a-f]{7})"/.exec(t)||[])[1]||'').catch(()=>'');
  }
  // onNewer(v): called instead of switching when busy() says not now (the teacher's page shows an "update" button).
  function freshen(busy=()=>false,onNewer){
    if(typeof document==='undefined')return '';
    const ver=document.querySelector('meta[name="hook-version"]')?.content||'';
    if(!/^[0-9a-f]{7}$/.test(ver)||/[?&]local\b/.test(location.search))return ver;
    latestVersion().then(v=>{
      if(!v||v===ver)return;if(busy()){onNewer?.(v);return;}
      let tried='';try{tried=sessionStorage.getItem('lumi-hook-upd')||'';}catch{}
      if(tried===v){onNewer?.(v);return;}
      try{sessionStorage.setItem('lumi-hook-upd',v);}catch{}
      const q=new URLSearchParams(location.search);q.set('v',v);location.replace(location.pathname+'?'+q);
    });
    return ver;
  }

  /* ── Sound: the music and effects live in audio.js (HookAudio). These names are what the pages call;
     without audio.js (e.g. the tests) they simply do nothing. ── */
  const HA=()=>root.HookAudio;
  const fx=name=>()=>HA()?.sfx(name);
  const sfx={
    unlock(){HA()?.unlock();},
    get muted(){return HA()?.mode==='off';},set muted(v){if(HA())HA().mode=v?'off':'all';},
    fire:fx('fire'),catch:fx('catch'),right:fx('right'),wrong:fx('wrong'),tick:fx('count'),go:fx('go'),pop:fx('tap'),tap:fx('tap'),
    card:fx('card'),power:fx('power'),boom:fx('boom'),freeze:fx('freeze'),shield:fx('shield'),block:fx('block'),glow:fx('glow'),rush:fx('rushStart'),
    shoot:fx('shoot'),slime:fx('slime'),whirl:fx('whirl'),bomb:fx('bomb'),ink:fx('ink'),steal:fx('steal'),
    win(){HA()?.jingle('win');},lose(){HA()?.jingle('lose');}
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

  const api={C,CARDS,ANIMALS,TURN,clamp,rng,bases,confine,orbPos,fishPos,lootPos,intoLake,edgeFrom,flyPos,hookDist,hookTip,hookDone,outgoing,segDist,inSlime,inWhirl,walkK,dragWhirl,inFan,shotAt,
    createGame,snapEvery,unpack,pickRoom,createNet,createLocalNet,viewport,render,inkCover,drawAnimal,animalIcon,confetti,freshen,latestVersion,pressFeedback,sfx};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.HookGame=api;
})(globalThis);
