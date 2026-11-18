/* Hook Rush 勾题大作战 — shared engine for the teacher's console (host.js) and the students' phones (player.js).
   The teacher's computer is the referee: it runs the game (createGame), checks every answer and sends a snapshot
   4 times a second. Phones draw the same arena themselves, move their own player at once, and smooth everyone else,
   so one slow phone only stutters for that student. Question orbs follow paths computed from a seed, so their
   movement costs no network messages. */
(root=>{
  'use strict';
  const C={
    W:1200,H:675,SEA:{x:600,y:337,rx:330,ry:175},
    PR:20,SPEED:230,RANGE:400,OUT:950,BACK:650,TIP:12,
    ORB:{n:{r:24,val:1,w:[0.32,0.55]},f:{r:18,val:2,w:[0.95,1.35]}},
    ANSWER:15000,FREEZE:3000,TARGET:20,LIMIT:300000,RESPAWN:1200,COUNT:3000,SNAP:250,
    TEAMS:[{zh:'红队',en:'Red',color:'#ff4d6a'},{zh:'蓝队',en:'Blue',color:'#3d8bff'},{zh:'绿队',en:'Green',color:'#22e39a'}]
  };
  const TURN=C.RANGE/C.OUT*1000;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  function bases(n){return n===3?[{x:70,y:95},{x:1130,y:95},{x:600,y:620}]:[{x:70,y:337},{x:1130,y:337}];}
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
    const g={ph:'lobby',t:0,cd:0,teams:2,sc:[0,0,0],players:new Map(),orbs:[],hooks:[],qs:[],qStats:[],deck:[],kicked:new Map(),end:null,target:opt.target||C.TARGET,limit:opt.limit||C.LIMIT,log:[]};
    const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
    const seed=()=>Math.floor(rnd()*2**31);
    function place(p,i){const b=bases(g.teams)[p.team],n=i??0,off=(n%5-2)*42,col=Math.floor(n/5)*42;
      const pos=g.teams===3&&p.team===2?confine(b.x+off,b.y-col):confine(b.x+(p.team===1?-col:col),b.y+off);p.x=pos.x;p.y=pos.y;p.dx=p.dy=0;}
    function teamCount(){const n=Array(g.teams).fill(0);for(const p of g.players.values())n[p.team]++;return n;}
    function placeAll(){const seen=Array(3).fill(0);for(const p of g.players.values())place(p,seen[p.team]++);}
    g.setQuestions=qs=>{g.qs=qs;g.qStats=qs.map(()=>({right:0,wrong:0}));g.deck=[];};
    g.join=(id,name,bot=false)=>{
      id=String(id);name=String(name||'').trim().slice(0,16)||'玩家';
      if(g.kicked.has(id))return null;
      let p=g.players.get(id);
      if(p){p.name=name;p.seen=Date.now();return p;}
      const n=teamCount(),team=n.indexOf(Math.min(...n));
      p={id,name,team,x:0,y:0,dx:0,dy:0,st:0,until:0,q:-1,qn:0,orb:0,ok:0,bad:0,rs:0,rk:0,bot,seq:-1,seen:Date.now()};
      g.players.set(id,p);place(p,n[team]);return p;
    };
    function releaseOrb(id,delay){const o=g.orbs.find(x=>x.id===id);if(o){o.s=seed();o.b=g.t+delay;o.hk='';o.by='';}}
    g.kick=id=>{const p=g.players.get(id);if(!p)return;g.players.delete(id);if(!p.bot)g.kicked.set(id,Date.now());
      g.hooks=g.hooks.filter(h=>{if(h.o!==id)return true;if(h.orb)releaseOrb(h.orb,300);return false;});
      if(p.st===1&&p.orb)releaseOrb(p.orb,300);};
    g.setTeams=n=>{g.teams=n===3?3:2;const list=shuffle([...g.players.values()]);list.forEach((p,i)=>p.team=i%g.teams);placeAll();};
    g.start=()=>{
      g.ph='count';g.cd=C.COUNT;g.t=0;g.sc=[0,0,0];g.hooks=[];g.end=null;g.deck=[];g.qStats=g.qs.map(()=>({right:0,wrong:0}));
      for(const p of g.players.values())Object.assign(p,{st:0,until:0,q:-1,orb:0,ok:0,bad:0,rk:0,goal:null,cool:800,botAt:0});
      placeAll();
      const n=clamp(Math.round(g.players.size*0.5)+3,5,13),fast=Math.max(1,Math.round(n/4));
      g.orbs=Array.from({length:n},(_,i)=>({id:i+1,k:i<fast?'f':'n',s:seed(),b:0,hk:'',by:''}));
    };
    g.pause=()=>{if(g.ph==='play')g.ph='pause';};
    g.resume=()=>{if(g.ph==='pause')g.ph='play';};
    g.toLobby=()=>{g.ph='lobby';g.end=null;g.hooks=[];g.orbs=[];placeAll();for(const p of g.players.values())Object.assign(p,{st:0,q:-1,orb:0});};
    function draw(){if(!g.deck.length)g.deck=shuffle(g.qs.map((_,i)=>i));return g.deck.pop();}
    function orbAt(o,t){
      if(o.by){const p=g.players.get(o.by);return p?{x:p.x,y:p.y-34}:null;}
      if(o.hk){const h=g.hooks.find(x=>x.o===o.hk&&x.orb===o.id);return h?hookTip(h,t):null;}
      return t<o.b?null:orbPos(o,t);
    }
    g.orbAt=o=>orbAt(o,g.t);
    function fire(p,x,y,a,t0){
      if(g.ph!=='play'||p.st!==0||g.hooks.some(h=>h.o===p.id)||!Number.isFinite(a))return false;
      const pos=confine(Number(x)||p.x,Number(y)||p.y);p.x=pos.x;p.y=pos.y;p.dx=p.dy=0;
      t0=clamp(Number(t0)||g.t,g.t-400,g.t);
      g.hooks.push({o:p.id,x:p.x,y:p.y,a,t0,tt:0,d:0,orb:0,lt:t0});return true;
    }
    function finish(reason){
      const top=Math.max(...g.sc.slice(0,g.teams)),win=g.sc.slice(0,g.teams).filter(s=>s===top).length>1?-1:g.sc.indexOf(top);
      let hard=-1,most=0;g.qStats.forEach((s,i)=>{if(s.wrong>most){most=s.wrong;hard=i;}});
      g.ph='end';g.hooks=[];
      g.end={win,reason,hard,hardWrong:most,hardText:hard>=0?g.qs[hard].text:'',
        players:[...g.players.values()].sort((a,b)=>b.ok-a.ok||a.bad-b.bad).map(p=>[p.name,p.team,p.ok,p.bad])};
    }
    g.stop=()=>{if(g.ph==='play'||g.ph==='pause'||g.ph==='count')finish('stop');};
    function settle(p,ok,timeout){
      const o=g.orbs.find(x=>x.id===p.orb),val=o?C.ORB[o.k].val:1,st=g.qStats[p.q];
      if(st)ok?st.right++:st.wrong++;
      g.log.push({t:g.t,id:p.id,q:p.q,ok,timeout:!!timeout});
      if(ok){g.sc[p.team]+=val;p.ok++;p.st=0;p.rk=val;if(o)releaseOrb(o.id,C.RESPAWN);}
      else{p.bad++;p.st=2;p.until=g.t+C.FREEZE;p.rk=-1;g.deck.splice(Math.floor(rnd()*(g.deck.length+1)),0,p.q);if(o)releaseOrb(o.id,300);}
      p.rs++;p.orb=0;p.botAt=0;
      if(g.sc[p.team]>=g.target)finish('target');
    }
    g.answer=(id,qn,v)=>{const p=g.players.get(id);if(!p||g.ph!=='play'||p.st!==1||qn!==p.qn)return false;settle(p,!!check(g.qs[p.q],v));return true;};
    g.input=m=>{
      const p=m&&g.players.get(String(m.id));
      if(m?.k==='join')return g.join(m.id,m.name);
      if(!p)return null;p.seen=Date.now();
      if(m.k==='mv'){if(m.s<=p.seq)return;p.seq=m.s;if(p.st!==0||g.hooks.some(h=>h.o===p.id)||g.ph!=='play')return;
        // The phone stamps its message with the game time, so the walk it did while the message travelled is added back.
        const l=Math.hypot(m.dx||0,m.dy||0),dx=l?m.dx/l:0,dy=l?m.dy/l:0,lag=clamp(g.t-(Number(m.t)||g.t),0,600)/1000;
        const pos=confine((Number(m.x)||p.x)+dx*C.SPEED*lag,(Number(m.y)||p.y)+dy*C.SPEED*lag);p.x=pos.x;p.y=pos.y;p.dx=dx;p.dy=dy;}
      else if(m.k==='fire')fire(p,m.x,m.y,Number(m.a),m.t);
      else if(m.k==='ans')g.answer(p.id,m.qn,m.v);
      return p;
    };
    function botThink(p,dt){
      if(p.st===1){if(!p.botAt)p.botAt=g.t+2000+rnd()*6000;
        if(g.t>=p.botAt){const q=g.qs[p.q],good=rnd()<0.65;let v;
          if(q.type==='fill')v=good?q.accept[0]:'?';else if(good)v=q.answer;else{const wrong=q.options.map((_,i)=>i+1).filter(n=>!q.answer.includes(n));v=[wrong[0]||1];}
          settle(p,!!check(q,v));}
        return;}
      if(p.st!==0||g.hooks.some(h=>h.o===p.id))return;
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
            if(o.hk&&g.players.get(o.hk)?.team===owner?.team)continue;
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
        if(o){if(p&&p.st===0&&g.qs.length){o.hk='';o.by=p.id;p.st=1;p.orb=o.id;p.q=draw();p.qn++;p.until=t+C.ANSWER;}else releaseOrb(o.id,300);}
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
        if(p.st===2&&g.t>=p.until)p.st=0;
        if(p.st===0&&(p.dx||p.dy)&&!g.hooks.some(h=>h.o===p.id)){const pos=confine(p.x+p.dx*C.SPEED*dt/1000,p.y+p.dy*C.SPEED*dt/1000);p.x=pos.x;p.y=pos.y;}
      }
      stepHooks();
      if(g.t>=g.limit)finish('time');
    };
    g.snapshot=()=>{
      const now=Date.now();for(const [id,at] of g.kicked)if(now-at>15000)g.kicked.delete(id);
      return {ph:g.ph,t:Math.round(g.t),cd:Math.ceil(g.cd),tc:g.teams,sc:g.sc.slice(0,g.teams),tg:g.target,tl:g.limit,nq:g.qs.length,
        p:[...g.players.values()].map(p=>[p.id,p.name,p.team,Math.round(p.x),Math.round(p.y),+p.dx.toFixed(2),+p.dy.toFixed(2),p.st,Math.round(p.until),p.q,p.ok,p.rs,p.rk,p.qn]),
        o:g.orbs.map(o=>[o.id,o.k,o.s,Math.round(o.b),o.hk,o.by]),
        h:g.hooks.map(h=>[h.o,Math.round(h.x),Math.round(h.y),+h.a.toFixed(4),Math.round(h.t0),Math.round(h.tt),Math.round(h.d),h.orb]),
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
      p:s.p.map(a=>({id:a[0],name:a[1],team:a[2],x:a[3],y:a[4],dx:a[5],dy:a[6],st:a[7],until:a[8],q:a[9],ok:a[10],rs:a[11],rk:a[12],qn:a[13]})),
      o:s.o.map(a=>({id:a[0],k:a[1],s:a[2],b:a[3],hk:a[4],by:a[5]})),
      h:s.h.map(a=>({o:a[0],x:a[1],y:a[2],a:a[3],t0:a[4],tt:a[5],d:a[6],orb:a[7]}))};
  }

  /* ── Network: Supabase Realtime (Phoenix websocket) for listening and the host's pushes; REST broadcast for phones' messages ── */
  function createNet(cfg){
    const handlers=new Map(),joinRefs=new Map();let ws=null,ref=0,hb=null,closed=false,open=false,status=()=>{};
    const raw=(topic,event,payload,jr)=>{if(open)ws.send(JSON.stringify({topic,event,payload,ref:String(++ref),join_ref:jr}));};
    const joinMsg=topic=>{const jr=String(++ref);joinRefs.set(topic,jr);raw('realtime:'+topic,'phx_join',{config:{broadcast:{self:false,ack:false},presence:{key:''},postgres_changes:[],private:false}},jr);};
    function connect(){
      ws=new WebSocket(cfg.url.replace(/^http/,'ws')+`/realtime/v1/websocket?apikey=${encodeURIComponent(cfg.key)}&vsn=1.0.0`);
      ws.onopen=()=>{open=true;for(const t of handlers.keys())joinMsg(t);clearInterval(hb);hb=setInterval(()=>raw('phoenix','heartbeat',{}),25000);status(true);};
      ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
        if(m.event==='broadcast'){const h=handlers.get(String(m.topic).replace(/^realtime:/,''));if(h)h(m.payload.event,m.payload.payload);}
        else if(m.event==='phx_error'||m.event==='phx_close'){const t=String(m.topic).replace(/^realtime:/,'');if(!closed&&handlers.has(t))setTimeout(()=>handlers.has(t)&&joinMsg(t),1000);}};
      ws.onclose=()=>{open=false;clearInterval(hb);status(false);if(!closed)setTimeout(connect,1000);};
      ws.onerror=()=>{};
    }
    return {
      join(topic,fn){handlers.set(topic,fn);if(!ws)connect();else if(open)joinMsg(topic);},
      leave(topic){if(open&&joinRefs.has(topic))raw('realtime:'+topic,'phx_leave',{},joinRefs.get(topic));handlers.delete(topic);joinRefs.delete(topic);},
      push(topic,event,payload){if(!open)return false;raw('realtime:'+topic,'broadcast',{type:'broadcast',event,payload},joinRefs.get(topic));return true;},
      post(topic,event,payload){return fetch(cfg.url+'/realtime/v1/api/broadcast',{method:'POST',keepalive:true,headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({messages:[{topic,event,payload}]})}).then(r=>r.ok,()=>false);},
      onStatus(fn){status=fn;if(open)fn(true);},
      close(){closed=true;clearInterval(hb);ws?.close();}
    };
  }
  /* Same interface inside one browser (?local): tabs talk through BroadcastChannel, for testing without the cloud. */
  function createLocalNet(){
    const chans=new Map(),send=(topic,event,payload)=>{const c=new BroadcastChannel('hook:'+topic);c.postMessage({event,payload});c.close();return true;};
    return {
      join(topic,fn){const c=new BroadcastChannel('hook:'+topic);c.onmessage=e=>fn(e.data.event,e.data.payload);chans.set(topic,c);},
      leave(topic){chans.get(topic)?.close();chans.delete(topic);},
      push:send,post:(t,e,p)=>Promise.resolve(send(t,e,p)),onStatus:fn=>fn(true),close(){for(const c of chans.values())c.close();}
    };
  }

  /* ── Drawing (shared look) ── */
  function viewport(cw,ch){const k=Math.min(cw/C.W,ch/C.H);return {k,ox:(cw-C.W*k)/2,oy:(ch-C.H*k)/2};}
  function drawArena(ctx,V,now){
    const s=C.SEA,tc=V.tc||2;
    ctx.fillStyle='#070b19';ctx.fillRect(-2000,-2000,C.W+4000,C.H+4000);
    const bg=ctx.createLinearGradient(0,0,0,C.H);bg.addColorStop(0,'#0e1530');bg.addColorStop(1,'#0a0f22');ctx.fillStyle=bg;ctx.fillRect(0,0,C.W,C.H);
    ctx.strokeStyle='rgba(120,150,255,.07)';ctx.lineWidth=1;ctx.beginPath();
    for(let x=0;x<=C.W;x+=50){ctx.moveTo(x,0);ctx.lineTo(x,C.H);}for(let y=0;y<=C.H;y+=50){ctx.moveTo(0,y);ctx.lineTo(C.W,y);}ctx.stroke();
    bases(tc).forEach((b,i)=>{const col=C.TEAMS[i].color,gr=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,170);gr.addColorStop(0,col+'40');gr.addColorStop(1,col+'00');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(b.x,b.y,170,0,6.283);ctx.fill();});
    const sea=ctx.createRadialGradient(s.x,s.y,20,s.x,s.y,s.rx);sea.addColorStop(0,'#123d63');sea.addColorStop(1,'#0b2240');
    ctx.fillStyle=sea;ctx.beginPath();ctx.ellipse(s.x,s.y,s.rx,s.ry,0,0,6.283);ctx.fill();
    ctx.strokeStyle='rgba(110,220,255,.55)';ctx.lineWidth=3;ctx.shadowColor='#5fd4ff';ctx.shadowBlur=14;ctx.stroke();ctx.shadowBlur=0;
    const r=(now/40)%60;ctx.strokeStyle='rgba(110,220,255,.12)';ctx.lineWidth=2;
    for(let i=0;i<3;i++){const k=(r+i*60)/180;if(k>=1)continue;ctx.beginPath();ctx.ellipse(s.x,s.y,s.rx*k,s.ry*k,0,0,6.283);ctx.stroke();}
    ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=2;ctx.strokeRect(1,1,C.W-2,C.H-2);
  }
  function drawOrb(ctx,o,now){
    const def=C.ORB[o.k],fast=o.k==='f',a=o.alpha??1;if(a<=0)return;
    ctx.globalAlpha=a;const pulse=1+Math.sin(now/180+o.id)*0.06,r=def.r*pulse*(o.pop??1);
    ctx.shadowColor=fast?'#ffcf4a':'#5fe1ff';ctx.shadowBlur=18;
    const gr=ctx.createRadialGradient(o.x-r*.3,o.y-r*.3,2,o.x,o.y,r);
    if(fast){gr.addColorStop(0,'#fff6c9');gr.addColorStop(.5,'#ffc93c');gr.addColorStop(1,'#d9861a');}else{gr.addColorStop(0,'#e9fbff');gr.addColorStop(.5,'#5fd4ff');gr.addColorStop(1,'#1f7fd1');}
    ctx.fillStyle=gr;ctx.beginPath();ctx.arc(o.x,o.y,r,0,6.283);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle=fast?'#4a2a00':'#06314f';ctx.font=`800 ${fast?18:22}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(fast?'×2':'?',o.x,o.y+1);ctx.globalAlpha=1;
  }
  function drawHook(ctx,h){
    const col=C.TEAMS[h.team]?.color||'#fff';
    ctx.strokeStyle=col;ctx.lineWidth=4;ctx.setLineDash([10,6]);ctx.shadowColor=col;ctx.shadowBlur=10;
    ctx.beginPath();ctx.moveTo(h.x,h.y);ctx.lineTo(h.tx,h.ty);ctx.stroke();ctx.setLineDash([]);
    const a=Math.atan2(h.ty-h.y,h.tx-h.x);ctx.lineWidth=5;ctx.strokeStyle='#fff';
    ctx.beginPath();ctx.arc(h.tx,h.ty,C.TIP,a-1.9,a+1.9);ctx.stroke();ctx.shadowBlur=0;
  }
  function drawPlayer(ctx,p,now){
    const col=C.TEAMS[p.team]?.color||'#fff';
    if(p.me){ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,C.PR+8+Math.sin(now/200)*2,0,6.283);ctx.stroke();}
    ctx.shadowColor=col;ctx.shadowBlur=16;ctx.fillStyle=col;ctx.beginPath();ctx.arc(p.x,p.y,C.PR,0,6.283);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,.85)';ctx.beginPath();ctx.arc(p.x+(p.fx||0)*8,p.y+(p.fy||0)*8,6,0,6.283);ctx.fill();
    if(p.st===2){ctx.fillStyle='rgba(170,230,255,.75)';ctx.beginPath();ctx.arc(p.x,p.y,C.PR+5,0,6.283);ctx.fill();ctx.fillStyle='#0b3550';ctx.font='700 22px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('❄',p.x,p.y+1);}
    ctx.font=`${p.me?800:600} 17px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='top';
    ctx.lineWidth=4;ctx.strokeStyle='rgba(5,8,20,.85)';ctx.strokeText(p.name,p.x,p.y+C.PR+4);ctx.fillStyle=p.me?'#fff':'rgba(235,240,255,.9)';ctx.fillText(p.name,p.x,p.y+C.PR+4);
    if(p.st===1){ctx.fillStyle='#ffcf4a';ctx.font='800 18px system-ui';ctx.textBaseline='bottom';ctx.lineWidth=4;ctx.strokeText('答题中…',p.x,p.y-C.PR-34);ctx.fillText('答题中…',p.x,p.y-C.PR-34);}
  }
  /* V = {tc, players:[{x,y,team,name,st,me,fx,fy}], orbs:[{id,k,x,y,alpha}], hooks:[{x,y,tx,ty,team}], aim:{x,y,a}} */
  function render(ctx,cw,ch,dpr,V,now,top=0){
    const vp=viewport(cw,ch-top);vp.oy+=top;ctx.setTransform(dpr*vp.k,0,0,dpr*vp.k,dpr*vp.ox,dpr*vp.oy);
    drawArena(ctx,V,now);
    if(V.aim){ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=3;ctx.setLineDash([6,8]);ctx.beginPath();ctx.moveTo(V.aim.x,V.aim.y);ctx.lineTo(V.aim.x+Math.cos(V.aim.a)*C.RANGE,V.aim.y+Math.sin(V.aim.a)*C.RANGE);ctx.stroke();ctx.setLineDash([]);}
    for(const h of V.hooks)drawHook(ctx,h);
    for(const o of V.orbs)drawOrb(ctx,o,now);
    for(const p of V.players)if(!p.me)drawPlayer(ctx,p,now);
    for(const p of V.players)if(p.me)drawPlayer(ctx,p,now);
    ctx.setTransform(1,0,0,1,0,0);return vp;
  }

  /* ── Sound: tiny synth, no files ── */
  let actx=null,muted=false;try{muted=localStorage.getItem('lumi-hook-mute')==='1';}catch{}
  function tone(f,d,type='sine',vol=.15,slide=0,delay=0){
    if(muted||!actx)return;const t=actx.currentTime+delay,o=actx.createOscillator(),gn=actx.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(40,f+slide),t+d);
    gn.gain.setValueAtTime(vol,t);gn.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(gn).connect(actx.destination);o.start(t);o.stop(t+d);
  }
  const sfx={
    unlock(){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();actx.resume();}catch{}},
    get muted(){return muted;},set muted(v){muted=!!v;try{localStorage.setItem('lumi-hook-mute',muted?'1':'0');}catch{}},
    fire(){tone(500,.18,'sawtooth',.08,700);},
    catch(){tone(880,.08,'square',.1);tone(1320,.12,'square',.08,0,.06);},
    right(){[660,880,1320].forEach((f,i)=>tone(f,.16,'triangle',.16,0,i*.08));},
    wrong(){tone(220,.3,'sawtooth',.12,-90);},
    tick(){tone(1000,.05,'square',.06);},
    win(){[523,659,784,1047].forEach((f,i)=>tone(f,.25,'triangle',.16,0,i*.12));}
  };

  const api={C,TURN,clamp,rng,bases,confine,orbPos,hookDist,hookTip,hookDone,outgoing,segDist,createGame,snapEvery,unpack,createNet,createLocalNet,viewport,render,sfx};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.HookGame=api;
})(globalThis);
