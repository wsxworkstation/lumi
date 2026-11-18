/* Hook Rush — the student's phone. Moves its own player at once, sends short messages to the teacher's computer,
   and draws everyone else from the teacher's snapshots (smoothed), so a slow phone only stutters for itself. */
(()=>{
  'use strict';
  const G=window.HookGame,C=G.C,qp=new URLSearchParams(location.search),local=qp.has('local');
  const net=local?G.createLocalNet():G.createNet(window.STUDYLOG_CLOUD||{});
  const $=s=>document.querySelector(s),ui=$('#ui'),cv=$('#cv'),ctx=cv.getContext('2d');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const store=(k,v,s=localStorage)=>{try{if(v===undefined)return s.getItem(k);s.setItem(k,v);}catch{}};
  let myId=store('lumi-hook-id',undefined,sessionStorage);
  if(!myId){myId='p'+Math.random().toString(36).slice(2,10);store('lumi-hook-id',myId,sessionStorage);}
  let myName=store('lumi-hook-name')||'';
  let room=null,up='',S=null,recvAt=0,off=null,lastPh='',mine=null,joinedAt=0,kicked=false,lastSnapAt=0;
  const qs=[],disp=new Map(),me={x:0,y:0,fx:1,fy:0,placed:false};
  let myHook=null,shownQn=-1,lastRs=null,answerSent=0,lastNeed=0;

  let lastSend=0;
  const send=(m)=>{lastSend=performance.now();return net.post(up,'u',{...m,id:myId});};
  const now=()=>performance.now();
  const gameNow=()=>!S?0:S.ph==='play'?now()+off:S.t;
  const teamOf=i=>C.TEAMS[i]||C.TEAMS[0];

  /* ── 1. Find the teacher's room ── */
  const rooms=new Map();let roomTimer=null;
  function findRooms(){
    if(qp.get('r'))return askName(qp.get('r'));
    net.join('hook-lobby',(ev,p)=>{if(ev==='room'&&p?.room){rooms.set(String(p.room),{...p,at:Date.now()});drawRooms();}});
    drawRooms();roomTimer=setInterval(drawRooms,2000);
  }
  function drawRooms(){
    const list=[...rooms.values()].filter(r=>Date.now()-r.at<6000&&r.ph!=='closed');
    ui.innerHTML=`<div class="screen"><div class="box"><h1 class="logo">勾题大作战</h1><p class="logo-en">Hook Rush</p>
      ${list.length?`<p class="sub">点老师的房间 Tap your teacher's room</p><div class="room-list">${list.map(r=>`<button class="room" data-room="${esc(r.room)}"><span>房间 ${esc(r.room)}</span><small>${r.n} 人</small></button>`).join('')}</div>`
        :`<p class="sub dots">等老师开房间 Waiting for the teacher</p>`}</div></div>`;
    ui.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>askName(b.dataset.room));
  }
  /* ── 2. Type your name ── */
  function askName(code){
    clearInterval(roomTimer);room=String(code);
    ui.innerHTML=`<div class="screen"><div class="box"><h1 class="logo">勾题大作战</h1><p class="logo-en">房间 ${esc(room)}</p>
      <p class="sub">打你的名字 Your name</p><input class="field" id="name" maxlength="16" autocomplete="off" value="${esc(myName)}" placeholder="名字 Name">
      <button class="big-btn" id="go">加入 Join</button>${qp.get('r')?'':'<p><button class="ghost" id="back">换房间 Other room</button></p>'}</div></div>`;
    const input=$('#name'),go=$('#go');
    const ok=()=>{go.disabled=!input.value.trim();};input.oninput=ok;ok();
    input.onkeydown=e=>{if(e.key==='Enter'&&input.value.trim())go.click();};
    go.onclick=()=>{myName=input.value.trim().slice(0,16);store('lumi-hook-name',myName);G.sfx.unlock();goFullscreen();joinRoom();};
    $('#back')&&($('#back').onclick=()=>{room=null;findRooms();});
    if(!('ontouchstart' in window))input.focus();
  }
  function goFullscreen(){
    if(!matchMedia('(pointer:coarse)').matches)return;
    const el=document.documentElement;
    try{(el.requestFullscreen?.({navigationUI:'hide'})||Promise.reject()).then(()=>screen.orientation?.lock?.('landscape')).catch(()=>{});}catch{}
  }
  /* ── 3. Join and listen ── */
  function joinRoom(){
    net.leave('hook-lobby');up=`hook-${room}-u`;joinedAt=now();
    net.join(`hook-${room}`,(ev,p)=>{if(ev==='snap')onSnap(p);else if(ev==='q')onQuestions(p);else if(ev==='closed')closed();});
    send({k:'join',name:myName});
    waiting('正在加入 Joining');
  }
  function waiting(text){ui.innerHTML=`<div class="screen"><div class="box"><h1 class="logo">勾题大作战</h1><p class="logo-en">房间 ${esc(room)}</p><p class="sub dots">${esc(text)}</p></div></div>`;}
  function closed(){ui.innerHTML=`<div class="screen"><div class="box"><h1 class="logo">勾题大作战</h1><p class="sub">老师已经关掉房间。<br>The room is closed.</p><button class="big-btn" onclick="location.reload()">重新找房间 Find a room</button></div></div>`;setPlaying(false);}
  // Keep telling the teacher we are here (also rejoins after the teacher's page reloads).
  setInterval(()=>{if(!room||kicked||now()-joinedAt<1200)return;
    if(!mine)send({k:'join',name:myName});else if(now()-lastSend>5000)send({k:'hi'});},1500);
  setInterval(()=>{$('#net').classList.toggle('hidden',!room||!S||kicked||now()-lastSnapAt<4000||S.ph==='end');},1000);

  function onQuestions(p){for(const [i,q] of p.items||[])qs[i]=q;if(mine?.st===1&&shownQn===-2)showQuestion();}
  function onSnap(raw){
    if(kicked)return;
    const s=G.unpack(raw),t=now();lastSnapAt=t;
    if(s.k?.includes(myId)){kicked=true;setPlaying(false);ui.innerHTML=`<div class="screen"><div class="box"><h1 class="logo">勾题大作战</h1><p class="sub">老师把你移出了房间。<br>The teacher removed you.</p><button class="big-btn" id="again">再加入 Join again</button></div></div>`;$('#again').onclick=()=>location.reload();return;}
    if(s.ph!==lastPh){off=null;phaseChange(lastPh,s.ph);lastPh=s.ph;}
    const cand=s.t-t;off=off==null?cand:Math.max(cand,off-4);
    S=s;recvAt=t;
    const m=s.p.find(p=>p.id===myId);
    if(!m){mine=null;return;}
    const first=!mine;mine=m;
    if(first||!me.placed||s.ph==='lobby'||s.ph==='count'){me.x=m.x;me.y=m.y;me.placed=true;}
    if(first&&lastRs==null)lastRs=m.rs;
    if(m.rs!==lastRs){lastRs=m.rs;result(m.rk);}
    if(m.st===1&&m.qn!==shownQn&&shownQn!==-2)showQuestion();
    if(m.st!==1&&!$('#ask').classList.contains('hidden'))hideQuestion();
    if(s.ph==='lobby')lobby();
    else if(s.ph==='end')ending();
    else if(ui.innerHTML){ui.innerHTML='';ui.dataset.key='';}
    for(const p of s.p)if(p.id!==myId&&!disp.has(p.id))disp.set(p.id,{x:p.x,y:p.y,fx:1,fy:0});
  }
  function phaseChange(from,to){
    if(to==='play'||to==='count'||to==='pause')setPlaying(true);
    if(to==='count'){myHook=null;hideQuestion();moveKey='0,0';}
    if(to==='end'){setPlaying(false);G.sfx.win();}
    if(to==='lobby'){setPlaying(false);hideQuestion();myHook=null;}
  }
  function setPlaying(on){
    document.body.classList.toggle('playing',on);
    for(const id of ['#hud','#hookBtn','#joyHint'])$(id).classList.toggle('hidden',!on);
    if(!on){$('#joy').classList.add('hidden');$('#frost').classList.add('hidden');$('#count').classList.add('hidden');joy.id=null;}
  }
  function lobby(){
    const team=teamOf(mine.team),mates=S.p.filter(p=>p.team===mine.team);
    const key='lobby:'+mine.team+':'+mates.map(p=>p.name).join('|');if(ui.dataset.key===key)return;ui.dataset.key=key;
    ui.innerHTML=`<div class="screen"><div class="box"><h1 class="logo">勾题大作战</h1><p class="logo-en">房间 ${esc(room)}</p>
      <p>你是 You are <span class="team-tag" style="background:${team.color}">${team.zh} ${team.en}</span></p>
      <div class="mates">${mates.map(p=>`<span>${esc(p.name)}</span>`).join('')}</div>
      <p class="sub dots">等老师开始 Waiting for the teacher</p>
      <p class="sub" style="font-size:13px">玩法：左手拖动走路，右手按「甩钩」勾题目球，勾到就答题。<br>金色球比较快，答对 2 分。答错会冻住 3 秒。</p></div></div>`;
  }
  function ending(){
    const e=S.end;if(!e)return;
    const key='end:'+S.t;if(ui.dataset.key===key)return;ui.dataset.key=key;
    const win=e.win>=0?teamOf(e.win):null,mineRow=e.players.findIndex(r=>r[0]===myName&&r[1]===mine.team);
    ui.innerHTML=`<div class="screen"><div class="box">
      <p class="win-title" style="color:${win?win.color:'#fff'}">${win?`${win.zh}赢了！`:'平手！'}</p>
      <p class="sub">${win?`${win.en} team wins`:'Draw'} · ${S.sc.map((v,i)=>`${teamOf(i).zh} ${v}`).join(' · ')}</p>
      <p>你答对 <b style="font-size:24px">${mine.ok}</b> 题 · You got ${mine.ok} right</p>
      <table class="rank">${e.players.map((r,i)=>[r,i]).filter(([,i])=>i<5||i===mineRow).map(([r,i])=>`<tr class="${i===mineRow?'me':''}"><td>${i+1}</td><td><span class="dot" style="background:${teamOf(r[1]).color}"></span>${esc(r[0])}</td><td>✓ ${r[2]}</td></tr>`).join('')}</table>
      ${e.hard>=0?`<div class="hard">最多人答错的题 Hardest question（${e.hardWrong} 次）<br><b>${esc(e.hardText)}</b></div>`:''}
      <p class="sub dots" style="margin-top:14px">等老师开下一局</p></div></div>`;
  }

  /* ── Questions ── */
  function showQuestion(){
    const box=$('#ask'),q=qs[mine.q];shownQn=mine.qn;
    if(!q){shownQn=-2;box.innerHTML=`<div class="card"><p class="checking dots">载入题目 Loading</p></div>`;box.classList.remove('hidden');
      if(now()-lastNeed>800){lastNeed=now();send({k:'need',q:mine.q});}setTimeout(()=>{if(shownQn===-2&&mine?.st===1){shownQn=-1;showQuestion();}},1500);return;}
    const orb=S.o.find(o=>o.by===myId),fast=orb?.k==='f',L='ABCDE';
    const body=q.type==='fill'
      ?`<div class="fill-row"><input class="field" id="fill" autocomplete="off" placeholder="写答案 Your answer"><button class="send" id="send">确定</button></div>`
      :`<div class="opts">${q.options.map((o,i)=>`<button class="opt" data-n="${i+1}"><span class="k">${L[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>${q.type==='multi'?'<button class="send" id="send" disabled>确定 Check</button>':''}`;
    box.innerHTML=`<div class="card"><div class="timer"><i id="tbar"></i></div><span class="tag">${fast?'⚡ 快球 ×2':'题目球 +1'}${q.type==='multi'?' · 选出全部正确答案':''}</span>
      <p class="q">${esc(q.text)}</p>${q.img?`<img src="${esc(q.img)}" alt="">`:''}${body}<p class="checking hidden" id="chk">检查中…</p></div>`;
    box.classList.remove('hidden');answerSent=0;
    const submit=v=>{if(answerSent)return;answerSent=now();box.querySelectorAll('button,input').forEach(e=>e.disabled=true);$('#chk').classList.remove('hidden');
      const qn=mine.qn,msg={k:'ans',qn,v};send(msg);setTimeout(()=>{if(mine?.st===1&&mine.qn===qn)send(msg);},1800);};
    if(q.type==='fill'){const f=$('#fill'),go=()=>f.value.trim()&&submit(f.value);$('#send').onclick=go;f.onkeydown=e=>{if(e.key==='Enter')go();};setTimeout(()=>f.focus(),50);}
    else if(q.type==='multi'){const opts=[...box.querySelectorAll('.opt')],sendB=$('#send');
      opts.forEach(b=>b.onclick=()=>{b.classList.toggle('sel');sendB.disabled=!opts.some(o=>o.classList.contains('sel'));});
      sendB.onclick=()=>submit(opts.filter(o=>o.classList.contains('sel')).map(o=>Number(o.dataset.n)));}
    else box.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{b.classList.add('sel');submit([Number(b.dataset.n)]);});
  }
  function hideQuestion(){$('#ask').classList.add('hidden');$('#ask').innerHTML='';if(shownQn===-2)shownQn=-1;}
  function result(rk){
    const t=$('#toast');t.className='';void t.offsetWidth;
    if(rk>0){t.textContent=`答对 +${rk}`;t.style.color='#22e39a';G.sfx.right();}
    else{t.textContent=mine?.st===2?'答错 ❄':'答错';t.style.color='#ff4d6a';G.sfx.wrong();}
    t.className='show';
  }

  /* ── Controls: left thumb walks, right button hooks (drag to aim, tap to auto-aim) ── */
  const joy={id:null,bx:0,by:0,dx:0,dy:0},aim={id:null,sx:0,sy:0,a:null},keys=new Set();
  const joyEl=$('#joy'),knob=joyEl.firstElementChild,hookBtn=$('#hookBtn');
  cv.addEventListener('pointerdown',e=>{
    if(!document.body.classList.contains('playing'))return;
    if(e.pointerType==='mouse'){fireAt(e.clientX,e.clientY);return;}
    if(joy.id!=null||e.clientX>innerWidth*0.6)return;
    joy.id=e.pointerId;joy.bx=e.clientX;joy.by=e.clientY;joy.dx=joy.dy=0;
    joyEl.style.left=e.clientX+'px';joyEl.style.top=e.clientY+'px';joyEl.classList.remove('hidden');knob.style.transform='';
  });
  addEventListener('pointermove',e=>{
    if(e.pointerId===joy.id){let x=e.clientX-joy.bx,y=e.clientY-joy.by;const l=Math.hypot(x,y),max=50;
      if(l>max){x*=max/l;y*=max/l;}knob.style.transform=`translate(${x}px,${y}px)`;
      if(l>10){joy.dx=x/Math.min(l,max);joy.dy=y/Math.min(l,max);}else joy.dx=joy.dy=0;}
    if(e.pointerId===aim.id){const x=e.clientX-aim.sx,y=e.clientY-aim.sy;aim.a=Math.hypot(x,y)>18?Math.atan2(y,x):null;}
  });
  const endPtr=e=>{
    if(e.pointerId===joy.id){joy.id=null;joy.dx=joy.dy=0;joyEl.classList.add('hidden');}
    if(e.pointerId===aim.id){const a=aim.a;aim.id=null;aim.a=null;e.type==='pointerup'&&fire(a??autoAim());}
  };
  addEventListener('pointerup',endPtr);addEventListener('pointercancel',endPtr);
  hookBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();G.sfx.unlock();aim.id=e.pointerId;aim.sx=e.clientX;aim.sy=e.clientY;aim.a=null;hookBtn.setPointerCapture?.(e.pointerId);});
  hookBtn.addEventListener('pointermove',e=>{if(e.pointerId===aim.id){const x=e.clientX-aim.sx,y=e.clientY-aim.sy;aim.a=Math.hypot(x,y)>18?Math.atan2(y,x):null;}});
  hookBtn.addEventListener('pointerup',endPtr);
  addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;keys.add(e.key.toLowerCase());if(e.key===' '){e.preventDefault();fire(autoAim());}});
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  addEventListener('blur',()=>keys.clear());
  $('#mute').onclick=()=>{G.sfx.muted=!G.sfx.muted;$('#mute').textContent=G.sfx.muted?'🔇':'🔊';};$('#mute').textContent=G.sfx.muted?'🔇':'🔊';

  let vp={k:1,ox:0,oy:0};
  const toWorld=(x,y)=>({x:(x-vp.ox)/vp.k,y:(y-vp.oy)/vp.k});
  function fireAt(cx,cy){const w=toWorld(cx,cy);fire(Math.atan2(w.y-me.y,w.x-me.x));}
  const canAct=()=>S&&S.ph==='play'&&mine&&mine.st===0;
  const serverHook=()=>S?.h.find(h=>h.o===myId);
  const hookActive=()=>!!(myHook&&!G.hookDone(myHook,gameNow()))||!!(serverHook()&&!G.hookDone(serverHook(),gameNow()));
  function fire(a){
    if(!canAct()||hookActive()||a==null||!Number.isFinite(a))return;
    const t0=gameNow();myHook={o:myId,x:me.x,y:me.y,a,t0,tt:0,d:0,orb:0};me.fx=Math.cos(a);me.fy=Math.sin(a);
    send({k:'fire',x:Math.round(me.x),y:Math.round(me.y),a:+a.toFixed(4),t:Math.round(t0)});G.sfx.fire();
    if(navigator.vibrate)try{navigator.vibrate(15);}catch{}
  }
  function autoAim(){
    const t=gameNow();let best=null;
    for(const o of S?.o||[]){if(o.by||(o.hk&&S.p.find(p=>p.id===o.hk)?.team===mine?.team))continue;
      const at=orbXY(o,t);if(!at||at.alpha<1)continue;const d=Math.hypot(at.x-me.x,at.y-me.y);if(d>C.RANGE*1.1)continue;
      const fut=o.hk?at:G.orbPos(o,t+d/C.OUT*1000);if(!best||d<best.d)best={d,a:Math.atan2(fut.y-me.y,fut.x-me.x)};}
    return best?best.a:Math.atan2(me.fy,me.fx);
  }

  /* ── Where things are right now (on this phone) ── */
  function hookFor(id,t){
    if(id===myId){const sh=serverHook();if(sh&&myHook&&Math.abs(sh.t0-myHook.t0)<600)return sh;return myHook||sh||null;}
    return S.h.find(h=>h.o===id)||null;
  }
  function orbXY(o,t){
    if(myHook&&myHook.orb===o.id&&(o.hk===myId||now()-myHook.caughtAt<600)&&!G.hookDone(myHook,t)){const p=G.hookTip(myHook,t);return {...p,alpha:1};}
    if(o.by){const p=o.by===myId?me:disp.get(o.by);return p?{x:p.x,y:p.y-38,alpha:1,small:true}:null;}
    if(o.hk){const h=hookFor(o.hk,t);if(h&&h.orb===o.id){const p=G.hookTip(h,t);return {...p,alpha:1};}}
    if(t<o.b)return null;
    const p=G.orbPos(o,t);return {...p,alpha:Math.min(1,(t-o.b)/300)};
  }

  /* ── Every frame ── */
  let last=now(),moveKey='0,0',moveAt=0,moveSeq=0,lastCount=-1;
  function resize(){const dpr=Math.min(2,devicePixelRatio||1);cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;}
  addEventListener('resize',resize);resize();
  function frame(){
    requestAnimationFrame(frame);
    const tn=now(),dt=Math.min(0.1,(tn-last)/1000);last=tn;
    if(!S||!mine||S.ph==='lobby'||S.ph==='end')return;
    const t=gameNow();
    // My own movement.
    let dx=joy.dx,dy=joy.dy;
    if(keys.size){dx=(keys.has('d')||keys.has('arrowright'))-(keys.has('a')||keys.has('arrowleft'));dy=(keys.has('s')||keys.has('arrowdown'))-(keys.has('w')||keys.has('arrowup'));}
    const free=canAct()&&!hookActive();let qx=0,qy=0;
    if(free&&(dx||dy)){const ang=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4);qx=+Math.cos(ang).toFixed(2);qy=+Math.sin(ang).toFixed(2);
      const p=G.confine(me.x+qx*C.SPEED*dt,me.y+qy*C.SPEED*dt);me.x=p.x;me.y=p.y;me.fx=qx;me.fy=qy;}
    // Tell the teacher's computer only when I start, stop or turn (turns at most every half second), to save messages.
    const key=qx||qy?`${qx},${qy}`:'0,0',moving=key!=='0,0',wasMoving=moveKey!=='0,0',gap=tn-moveAt;
    const due=(key!==moveKey&&gap>120&&(gap>500||!moving||!wasMoving))||(moving&&gap>3000);
    if(S.ph==='play'&&due){moveKey=key;moveAt=tn;send({k:'mv',s:++moveSeq,x:Math.round(me.x),y:Math.round(me.y),dx:qx,dy:qy,t:Math.round(t)});}
    // My hook: predict a catch so it feels instant (the teacher's computer still decides).
    if(myHook){
      if(G.hookDone(myHook,t))myHook=null;
      else if(!myHook.orb&&G.outgoing(myHook,t)){const tip=G.hookTip(myHook,t);
        for(const o of S.o){if(o.by||o.hk===myId)continue;if(o.hk&&S.p.find(p=>p.id===o.hk)?.team===mine.team)continue;const at=orbXY(o,t);if(!at||at.alpha<1)continue;
          if(Math.hypot(at.x-tip.x,at.y-tip.y)<=C.TIP+C.ORB[o.k].r){myHook.tt=t;myHook.d=tip.d;myHook.orb=o.id;myHook.caughtAt=now();G.sfx.catch();break;}}}
    }
    // Everyone else, smoothed toward where the teacher's computer says they are heading.
    const since=(tn-recvAt)/1000,k=Math.min(1,dt*10);
    const players=S.p.map(p=>{
      if(p.id===myId)return {...p,x:me.x,y:me.y,fx:me.fx,fy:me.fy,me:true};
      const d=disp.get(p.id)||{x:p.x,y:p.y,fx:1,fy:0};let tx=p.x,ty=p.y;
      if(S.ph==='play'&&p.st===0&&(p.dx||p.dy)&&!S.h.some(h=>h.o===p.id)){const q=G.confine(p.x+p.dx*C.SPEED*Math.min(since,1),p.y+p.dy*C.SPEED*Math.min(since,1));tx=q.x;ty=q.y;}
      if(Math.hypot(tx-d.x,ty-d.y)>200){d.x=tx;d.y=ty;}else{d.x+=(tx-d.x)*k;d.y+=(ty-d.y)*k;}
      if(p.dx||p.dy){d.fx=p.dx;d.fy=p.dy;}disp.set(p.id,d);return {...p,x:d.x,y:d.y,fx:d.fx,fy:d.fy};
    });
    const hooks=[],teamById=new Map(S.p.map(p=>[p.id,p.team]));
    for(const p of S.p){const h=hookFor(p.id,t);if(!h||G.hookDone(h,t))continue;const tip=G.hookTip(h,t);
      const o=p.id===myId?me:disp.get(p.id)||h;hooks.push({x:o.x,y:o.y,tx:tip.x,ty:tip.y,team:teamById.get(p.id)});}
    const orbs=[];for(const o of S.o){const at=orbXY(o,t);if(at)orbs.push({id:o.id,k:o.k,x:at.x,y:at.y,alpha:at.alpha,pop:at.small?0.7:1});}
    const aimA=aim.id!=null?aim.a:null;
    vp=G.render(ctx,innerWidth,innerHeight,cv.width/innerWidth,{tc:S.tc,players,orbs,hooks,aim:aimA!=null&&canAct()?{x:me.x,y:me.y,a:aimA}:null},tn);
    hud(t);
  }
  function hud(t){
    const left=Math.max(0,(S.tl-t)/1000),mm=Math.floor(left/60),ss=String(Math.floor(left%60)).padStart(2,'0');
    $('#clock').innerHTML=`${S.ph==='pause'?'⏸ 暂停':`${mm}:${ss}`} <small>先到 ${S.tg} 分</small>`;
    const sc=S.sc.map((v,i)=>`<div class="score" style="color:${teamOf(i).color}">${v}<small>${teamOf(i).zh}${i===mine.team?' · 我':''}</small></div>`).join('');
    if($('#scores').innerHTML!==sc)$('#scores').innerHTML=sc;
    hookBtn.classList.toggle('cool',!canAct()||hookActive());
    const frost=$('#frost');
    if(mine.st===2){frost.classList.remove('hidden');frost.textContent=`❄ 冻住 ${Math.max(0,Math.ceil((mine.until-t)/1000))}`;}else frost.classList.add('hidden');
    const cnt=$('#count');
    if(S.ph==='count'){const n=Math.max(1,Math.ceil((S.cd-(now()-recvAt))/1000));cnt.textContent=n;cnt.classList.remove('hidden');if(n!==lastCount){lastCount=n;G.sfx.tick();}}
    else cnt.classList.add('hidden');
    if(mine.st===1){const bar=$('#tbar');if(bar)bar.style.width=Math.max(0,(mine.until-t)/C.ANSWER*100)+'%';}
  }
  requestAnimationFrame(frame);
  findRooms();
})();
