/* 星环防线 — the student's phone, held sideways. Pick the teacher's room, pick your name (the same class list as the
   online practice, so results can go to Lumi later), then defend the ring: drag to aim, let go to shoot; out of bullets →
   answer a question to reload. The phone draws everything itself from the teacher's snapshots (meteors and bullets
   follow fixed paths) and shows its own bullets at once; the teacher's computer decides what really hit. It never has
   the answers. */
(()=>{
  'use strict';
  const R=window.RescueGame,C=R.C,qp=new URLSearchParams(location.search),local=qp.has('local');
  const net=local?R.createLocalNet():R.createNet(window.STUDYLOG_CLOUD||{});
  const cfg=window.STUDYLOG_CLOUD||{};
  const $=s=>document.querySelector(s),ui=$('#ui'),cv=$('#cv'),ctx=cv.getContext('2d');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const store=(k,v,s=localStorage)=>{try{if(v===undefined)return s.getItem(k);if(v===null)s.removeItem(k);else s.setItem(k,v);}catch{}return null;};
  const now=()=>performance.now();
  // Who I am: the same record as the online practice page ({level,id,name}), or a typed name ({guest,id,name}).
  const ME=local?'lumi-student-local':'lumi-student';
  const readMe=()=>{try{const v=JSON.parse(store(ME)||'null');return v&&v.id&&v.name?v:null;}catch{return null;}};
  let me=readMe();
  const DEV=(()=>{let d=store('lumi-rescue-dev',undefined,sessionStorage);if(!d){d=Math.random().toString(36).slice(2,8);store('lumi-rescue-dev',d,sessionStorage);}return d;})();
  const myId=()=>me?(me.guest?'g:':'s:')+me.id:'';
  R.pressFeedback();
  const RA=window.RescueAudio;RA?.setup({key:'lumi-rescue-sound'});
  const buzz=ms=>{if(navigator.vibrate)try{navigator.vibrate(ms);}catch{}};

  let room=null,host='',up='',S=null,recvAt=0,off=null,mine=null,joinedAt=0,kicked=false,lastSnapAt=0,lastSend=0,otherDev=false;
  const qs=[];
  const send=m=>{lastSend=now();return net.post(up,'u',host?{...m,id:myId(),to:host}:{...m,id:myId()});};
  const gameNow=()=>!S?0:S.ph==='play'&&off!=null?now()+off:S.ct;

  /* ── Screens outside the game (room list, name, lobby, end) ── */
  const brand=sub=>`<div class="brand"><div class="logo-ring" aria-hidden="true"><i></i></div><h1 class="logo">星环防线</h1><p class="logo-en">${sub}</p></div>`;
  function screen(html,key=''){
    if(key&&ui.dataset.key===key)return false;ui.dataset.key=key;
    ui.innerHTML=`<div class="screen"><div class="box">${html}</div></div>`;ui.classList.remove('hidden');setPlaying(false);return true;
  }

  /* ── 1. Find the teacher's room ── */
  const rooms=new Map();let roomTimer=0;
  function findRooms(){
    if(qp.get('r'))return pickRoom(qp.get('r'),'');
    net.join('rescue-lobby',(ev,p)=>{if(ev==='room'&&p?.room){rooms.set(String(p.room)+'|'+(p.hid||''),{...p,room:String(p.room),at:Date.now()});drawRooms();}});
    clearInterval(roomTimer);drawRooms();roomTimer=setInterval(drawRooms,2000);
  }
  function drawRooms(){
    if(room)return;
    const best=new Map();for(const r of rooms.values()){if(Date.now()-r.at>=6000||r.ph==='closed')continue;const o=best.get(r.room);if(!o||r.at>o.at)best.set(r.room,r);}
    const list=[...best.values()].sort((a,b)=>a.room<b.room?-1:1),down=net.downFor()>4000;
    const key='rooms:'+(down?'down':list.map(r=>r.room+'/'+r.n+'/'+(r.hid||'')).join(','));
    if(!screen(`${brand('STAR RING')}${list.length?`<p class="sub">点老师的房间 Tap your teacher's room</p><div class="list">${list.map(r=>`<button class="room" data-room="${esc(r.room)}" data-hid="${esc(r.hid||'')}"><span>房间 ${esc(r.room)}</span><small>${r.n} 人</small></button>`).join('')}</div>`
      :down?`<p class="sub"><b class="warn">连不上网络</b><br>请检查 Wi-Fi 或流量<br><small>Can't connect. Check your internet.</small></p>`
      :`<p class="sub dots">等老师开房间 Waiting for the teacher</p>`}`,key))return;
    ui.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>pickRoom(b.dataset.room,b.dataset.hid));
  }
  function pickRoom(code,hid){clearInterval(roomTimer);room=String(code);host=hid||'';who();}
  const backToRooms=()=>{room=null;host='';ui.dataset.key='';findRooms();};

  /* ── 2. Who are you (the class list from Lumi; a typed name if you're not on it) ── */
  let portal=null;
  const DEMO=[{level:'F3',students:[{id:'D01',name:'ALI BIN ABU'},{id:'D02',name:'TAN MEI LING 陈美玲'},{id:'D03',name:'陈小明'},{id:'D04',name:'SITI AISYAH'}]},
    {level:'F4',students:[{id:'D11',name:'LIM WEI JIE 林伟杰'},{id:'D12',name:'NUR IMAN'}]}];
  async function loadPortal(){
    if(portal)return portal;if(local||!cfg.url){portal=DEMO;return portal;}
    try{const res=await fetch(`${cfg.url}/rest/v1/rpc/lumi_portal`,{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:'{}'});
      if(!res.ok)throw Error(res.statusText);portal=(await res.json()).sort((a,b)=>a.level.localeCompare(b.level,undefined,{numeric:true}));}
    catch{portal=null;}
    return portal;
  }
  const head=()=>brand(`房间 <span class="n">${esc(room)}</span>`);
  function who(){
    me=readMe();
    if(!me)return pickLevel();
    screen(`${head()}<p class="sub">你是 Are you</p><p class="me-name">${esc(me.name)}</p>${me.level?`<p class="sub">${esc(me.level)}</p>`:''}
      <button class="big-btn" id="yes">是我，加入 JOIN</button><p class="again"><button class="ghost" id="notme">不是我 Not me</button>${qp.get('r')?'':'<button class="ghost" id="back">换房间 Other room</button>'}</p>`);
    $('#yes').onclick=()=>{R.sfx.unlock();joinRoom();};
    $('#notme').onclick=()=>{store(ME,null);me=null;pickLevel();};
    $('#back')&&($('#back').onclick=backToRooms);
  }
  async function pickLevel(){
    screen(`${head()}<p class="sub dots">找名单 Loading the class list</p>`);
    const P=await loadPortal();
    if(!P){screen(`${head()}<p class="sub">读不到名单 Can't load the list</p><button class="big-btn" id="retry">再试一次 Try again</button><p class="again"><button class="ghost" id="guest">打名字加入 Type my name</button></p>`);
      $('#retry').onclick=pickLevel;$('#guest').onclick=guest;return;}
    screen(`${head()}<p class="sub">你是哪一年级？ Your form</p><div class="grid">${P.map(p=>`<button class="tile" data-level="${esc(p.level)}">${esc(p.level)}</button>`).join('')}</div>
      <p class="again"><button class="ghost" id="guest">名单里没有我 · 打名字</button>${qp.get('r')?'':'<button class="ghost" id="back">换房间</button>'}</p>`);
    ui.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>pickName(b.dataset.level));
    $('#guest').onclick=guest;$('#back')&&($('#back').onclick=backToRooms);
  }
  function pickName(level){
    const seen=new Set(),students=(portal.find(p=>p.level===level)?.students||[]).filter(s=>s&&s.id&&!seen.has(s.id)&&seen.add(s.id)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    screen(`${head()}<p class="sub"><button class="link" id="lv">← 年级</button> ${esc(level)} · 点你的名字 Tap your name</p><input class="field" id="find" placeholder="找名字 Search" autocomplete="off"><div class="list names" id="names"></div>`);
    const box=$('#names'),find=$('#find');
    const draw=()=>{const k=find.value.trim().toLowerCase(),list=students.filter(s=>String(s.name).toLowerCase().includes(k));
      box.innerHTML=list.map(s=>`<button class="name" data-id="${esc(s.id)}">${esc(s.name)}</button>`).join('')||'<p class="sub">找不到这个名字，请问老师。</p>';
      box.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{const s=students.find(x=>x.id===b.dataset.id);me={level,id:s.id,name:s.name};store(ME,JSON.stringify(me));R.sfx.unlock();joinRoom();});};
    find.oninput=draw;draw();$('#lv').onclick=pickLevel;
  }
  function guest(){
    screen(`${head()}<p class="sub">打你的名字 Your name</p><input class="field" id="gname" maxlength="16" autocomplete="off" placeholder="名字 Name"><button class="big-btn" id="go" disabled>加入 JOIN</button>
      <p class="again"><button class="ghost" id="lv">← 用名单 Class list</button></p>`);
    const input=$('#gname'),go=$('#go');input.oninput=()=>{go.disabled=!input.value.trim();};
    input.onkeydown=e=>{if(e.key==='Enter'&&input.value.trim())go.click();};
    go.onclick=()=>{me={guest:true,id:Math.random().toString(36).slice(2,10),name:input.value.trim().slice(0,16)};store(ME,JSON.stringify(me));R.sfx.unlock();joinRoom();};
    $('#lv').onclick=pickLevel;if(!('ontouchstart' in window))input.focus();
  }

  /* ── 3. Join and listen ── */
  const sendJoin=()=>send({k:'join',name:me.name,dev:DEV,lv:me.level||''});
  function joinRoom(){
    net.leave('rescue-lobby');up=`rescue-${room}-u`;joinedAt=now();goFullscreen();
    const mineHost=p=>!p?.hid||!host||p.hid===host;
    net.join(`rescue-${room}`,(ev,p)=>{if(ev==='snap')onSnap(p);else if(ev==='q'){if(mineHost(p))onQuestions(p);}else if(ev==='closed'){if(mineHost(p))closed();}});
    sendJoin();screen(`${head()}<p class="sub dots">正在加入 Joining</p>`,'joining');
  }
  function goFullscreen(){
    if(!matchMedia('(pointer:coarse)').matches)return;
    const el=document.documentElement;
    try{(el.requestFullscreen?.({navigationUI:'hide'})||Promise.reject()).then(()=>window.screen.orientation?.lock?.('landscape')).catch(()=>{});}catch{}
  }
  function message(text,btn,fn){screen(`${brand('STAR RING')}<p class="sub">${text}</p><button class="big-btn" id="again">${btn}</button>`);$('#again').onclick=fn;}
  function closed(){up='';message('老师已经关掉房间。<br>The room is closed.','重新找房间 Find a room',()=>location.reload());}
  // Keep telling the teacher we are here (this also rejoins after the teacher's page reloads).
  // (Not while another phone has taken my place: only "use this phone" takes it back.)
  setInterval(()=>{if(!up||kicked||otherDev||now()-joinedAt<1200)return;if(!mine)sendJoin();else if(now()-lastSend>4000)send({k:'hi'});},1500);
  addEventListener('pagehide',()=>{if(up&&!kicked&&mine)send({k:'bye'});});
  setInterval(()=>{$('#net').classList.toggle('hidden',!up||!S||kicked||now()-lastSnapAt<4000||S.ph==='end');},1000);

  function onQuestions(p){for(const [i,q] of p.items||[])qs[i]=q;qKey='';drawAsk();}
  let lastRs=null,lastPh='';
  function onSnap(raw){
    if(kicked||!up)return;
    if(raw.hid){if(!host)host=raw.hid;else if(raw.hid!==host){if(now()-Math.max(lastSnapAt,joinedAt)<8000)return;host=raw.hid;mine=null;}}
    const s=R.unpack(raw),t=now();lastSnapAt=t;
    if(s.k?.includes(myId())){kicked=true;up='';message('老师把你移出了房间。<br>The teacher removed you.','再加入 Join again',()=>location.reload());return;}
    const was=S?.ph;
    // this phone's clock → the game's clock (the freshest snapshot wins, drifting slowly so a late one can't jerk it back)
    const cand=s.ct-t;off=s.ph!==was||off==null?cand:Math.max(cand,off-4);
    S=s;recvAt=t;
    const m=s.p.find(p=>p.id===myId());
    if(m&&m.dev&&m.dev!==DEV){mine=null;if(!otherDev){otherDev=true;
      screen(`${head()}<p class="sub">你在另一部手机加入了。<br>You joined on another phone.</p><button class="big-btn" id="here">用这部手机 Use this phone</button>`);
      $('#here').onclick=()=>{otherDev=false;sendJoin();screen(`${head()}<p class="sub dots">正在加入 Joining</p>`,'joining');};}return;}
    if(otherDev)return;
    const first=!mine&&!!m;mine=m||null;
    if(m){if(first||lastRs==null)lastRs=m.rs;if(m.rs!==lastRs){lastRs=m.rs;result(m);}
      if(first)shotN=Math.max(shotN,m.ln||0);}   // (after a reload of this page, keep numbering shots after the last one seen)
    if(s.ph!==lastPh){phase(was,s.ph);lastPh=s.ph;}
    events(s);screens();
  }
  function phase(was,ph){
    if(ph==='play'&&was==='count'){R.sfx.go();myShots=[];}
    if(ph==='count'){myShots=[];shotN=mine?.ln||shotN;closeAsk();}
    if(ph==='end'&&S.end&&S.end.o!=='stop')RA?.jingle(S.end.o==='win'?'win':'lose');
    if(ph==='lobby'){closeAsk();myShots=[];}
  }
  /* What happened that this student should hear about. */
  let lastFx=-1;const sparks=[];
  function events(s){
    const top=s.fx.reduce((a,f)=>Math.max(a,f.id),0);if(lastFx<0){lastFx=top;return;}
    for(const f of s.fx){if(f.id<=lastFx)continue;const mineFx=f.by===myId();
      if(f.k==='boom'){if(mineFx){R.sfx[f.w==='l'||f.w==='b'?'big':'boom']();buzz(f.w==='b'?200:25);if(f.w==='m'||f.w==='l')note(f.w==='l'?'击碎大陨石！':'击碎！','good');if(f.w==='b')note('最后一击！你击碎了陨石王！','gold');}
        else if(f.w==='b'||f.w==='l')R.sfx.big();}
      else if(f.k==='hit'&&mineFx)R.sfx.hit();
      else if(f.k==='ring'){R.sfx.ring();buzz(Number(f.w)>=20?150:60);}
      else if(f.k==='gold'){note(mineFx?'你打碎金色陨石！全员 +2 发':'金色陨石！全员 +2 发','gold');R.sfx.gold();buzz(40);}
      else if(f.k==='warn'){note('⚠ 陨石王正在接近！','bad');R.sfx.warn();buzz(300);}
      else if(f.k==='king'){note('陨石王出现！全员集中火力！','bad');R.sfx.king();}}
    lastFx=Math.max(lastFx,top);
  }
  let noteTimer=0;
  function note(text,kind=''){const n=$('#note');n.textContent=text;n.className='show '+kind;clearTimeout(noteTimer);noteTimer=setTimeout(()=>{n.className='';},2200);}

  /* ── Playing sideways ── Rotation lock on, or a scanner / chat app's browser that never turns: the page stays tall even
     when the phone is held sideways. Then the game itself is turned 90° (the name and lobby screens stay as they are).
     Which way round comes from the motion sensor where the phone gives it freely (Android); the ↻ button flips it. */
  const coarse=matchMedia('(pointer:coarse)').matches;let turn=0,tilt=1,tiltSet=false;
  try{tilt=store('lumi-rescue-tilt')==='-1'?-1:1;tiltSet=store('lumi-rescue-tilt')!=null;}catch{}
  addEventListener('devicemotion',e=>{if(tiltSet)return;const x=e.accelerationIncludingGravity?.x;if(x==null||Math.abs(x)<6)return;const t=x>0?1:-1;if(t!==tilt){tilt=t;applyTurn();}});
  const GW=()=>turn?innerHeight:innerWidth,GH=()=>turn?innerWidth:innerHeight;
  function pt(e){const x=e.clientX,y=e.clientY;return turn===1?{x:y,y:innerWidth-x}:turn===-1?{x:innerHeight-y,y:x}:{x,y};}
  function applyTurn(){
    const want=document.body.classList.contains('playing')&&coarse&&innerHeight>innerWidth?tilt:0,g=$('#game');
    turn=want;document.body.classList.toggle('turned',!!turn);
    g.style.cssText=turn?`width:${innerHeight}px;height:${innerWidth}px;left:${turn===1?innerWidth:0}px;top:${turn===1?0:innerHeight}px;transform:rotate(${turn*90}deg)`:'';
    resize();
  }
  $('#flip').onclick=()=>{tilt=-tilt;tiltSet=true;store('lumi-rescue-tilt',String(tilt));applyTurn();};
  function setPlaying(on){
    if(document.body.classList.contains('playing')===on)return;
    document.body.classList.toggle('playing',on);$('#game').classList.toggle('hidden',!on);if(on){ui.classList.add('hidden');ui.dataset.key='';}applyTurn();
  }
  function resize(){const dpr=Math.min(2,devicePixelRatio||1);cv.width=Math.round(GW()*dpr);cv.height=Math.round(GH()*dpr);}
  addEventListener('resize',()=>applyTurn());

  /* ── Shooting ── Drag to aim (a dashed line), let go to shoot. My bullets are drawn at once and checked against the
     meteors here too, so a hit sparks immediately; the teacher's computer has the final say. */
  const SIDE=118;   // the bullet column on the right (CSS px)
  let aim=null,myShots=[],shotN=0,lastShotAt=0;
  const view=()=>window.RescueStage.viewport(GW(),GH(),{padR:SIDE});
  const order=()=>S?S.p.slice().sort((a,b)=>a.seq-b.seq):[];
  function myTurret(){const list=order(),i=list.findIndex(p=>p.id===myId());return i<0?null:R.turretAt(i,list.length);}
  function aimAt(e){const P=pt(e),v=view(),T=myTurret();if(!T)return null;const wx=(P.x-v.ox)/v.k,wy=(P.y-v.oy)/v.k;return R.aimLimit(Math.atan2(wy-T.y,wx-T.x));}
  const pending=()=>Math.max(0,shotN-(mine?.ln||0));
  const ammo=()=>Math.max(0,(mine?.ammo||0)-pending());
  const canShoot=()=>S&&S.ph==='play'&&mine&&$('#ask').classList.contains('hidden');
  cv.addEventListener('pointerdown',e=>{
    if(!canShoot())return;e.preventDefault();R.sfx.unlock();
    if(ammo()<=0){R.sfx.empty();openAsk();return;}
    const a=aimAt(e);if(a==null)return;aim={id:e.pointerId,a};cv.setPointerCapture?.(e.pointerId);
  });
  cv.addEventListener('pointermove',e=>{if(aim&&aim.id===e.pointerId){const a=aimAt(e);if(a!=null)aim.a=a;}});
  const release=e=>{if(!aim||aim.id!==e.pointerId)return;const a=aim.a;aim=null;if(e.type==='pointerup')shoot(a);};
  cv.addEventListener('pointerup',release);cv.addEventListener('pointercancel',release);
  function shoot(a){
    if(!canShoot()||ammo()<=0||now()-lastShotAt<C.SHOT.COOL)return;
    const T=myTurret();if(!T)return;lastShotAt=now();
    const t=gameNow(),from=R.muzzle(T,a);shotN++;
    myShots.push({id:'L'+shotN,by:myId(),x:from.x,y:from.y,a,t0:t,te:0,ck:t});
    send({k:'fire',a:Math.round(a*1000)/1000,t:Math.round(t),n:shotN});
    R.sfx.laser();buzz(6);
    if(ammo()<=0)setTimeout(()=>{if(ammo()<=0&&canShoot())openAsk();},450);
  }
  // My bullets flying: the first meteor they touch (as far as this phone knows) stops them with a spark.
  function flyMine(t){
    for(const b of myShots){
      while(!b.te&&b.ck<t){const s=Math.min(t,b.ck+14);b.ck=s;const P=R.bPos(b,s);
        if(R.offScreen(P)||s-b.t0>C.SHOT.LIFE){b.te=s;break;}
        for(const m of S.m){if(s<m.t0||m.hp<=0)continue;const M=R.mPos(m,s),r=C.KIND[m.k].r+C.SHOT.R;
          if((M.x-P.x)**2+(M.y-P.y)**2<=r*r){b.te=s;sparks.push({id:-sparks.length-1,k:'hit',x:P.x,y:P.y,at:s,w:m.k});break;}}}
    }
    myShots=myShots.filter(b=>!b.te||t-b.te<400);
    while(sparks.length&&t-sparks[0].at>500)sparks.shift();
  }

  /* ── The question card (reloading) ── Opens by itself when the bullets run out, or with 装弹. No time limit.
     Redrawn only when the question changes, so typing is never lost. */
  let qKey='',busyAns=false,ansAt=0,needAt=0,autoClose=0;
  // (For 0.7 s after opening the card ignores touches: a student still tapping to shoot must not pick an answer by accident.)
  let armTimer=0;
  function openAsk(){if(!mine||S?.ph!=='play')return;const box=$('#ask');box.classList.remove('hidden');box.classList.add('arming');
    clearTimeout(armTimer);armTimer=setTimeout(()=>box.classList.remove('arming'),700);aim=null;qKey='';drawAsk();}
  function closeAsk(){$('#ask').classList.add('hidden');qKey='';}
  $('#reload').onclick=()=>{R.sfx.unlock();if($('#ask').classList.contains('hidden'))openAsk();else if(ammo()>0)closeAsk();};
  function askState(){
    if(!mine)return 'none';
    if(mine.ammo>=C.AMMO.MAX)return 'full';
    if(gameNow()<mine.cd)return 'cool:'+mine.q;
    if(mine.q<0)return 'none';
    if(!qs[mine.q])return 'load:'+mine.q;
    return `q:${mine.q}:${mine.rs}`;
  }
  function drawAsk(){
    const box=$('#ask');if(box.classList.contains('hidden')||!S)return;
    const key=askState();
    if(key.startsWith('load')&&now()-needAt>1500){needAt=now();send({k:'need',q:mine.q});}
    if(key===qKey){if(key.startsWith('cool'))setText($('#coolN'),String(Math.max(0,Math.ceil((mine.cd-gameNow())/1000))));return;}
    qKey=key;busyAns=false;
    const close=ammo()>0?`<button class="ghost close" id="askClose">回去战斗 ✕</button>`:'';
    if(key==='full')box.innerHTML=`<div class="card center"><h2>子弹满了！</h2><p class="sub">最多 ${C.AMMO.MAX} 发，先去打陨石。</p><button class="big-btn" id="askBack">回去战斗</button></div>`;
    else if(key.startsWith('cool'))box.innerHTML=`<div class="card center">${close}<div class="wrong-face">✗</div><h2>答错了</h2><p class="sub">这题等一下会再出现。This question will come back.</p><p class="cool"><b id="coolN">${Math.max(0,Math.ceil((mine.cd-gameNow())/1000))}</b> 秒后下一题</p></div>`;
    else if(key.startsWith('load')||key==='none')box.innerHTML=`<div class="card center">${close}<p class="sub dots">题目加载中 Loading</p></div>`;
    else{const q=qs[mine.q];box.innerHTML=`<div class="card">${close}<p class="tag">装弹：答对 +${C.AMMO.ANSWER} 发${(mine.streak||0)%C.AMMO.STREAK===C.AMMO.STREAK-1?'（再对一题多 1 发！）':''}</p>${questionHtml(q)}</div>`;wireQuestion(q,mine.q);}
    $('#askClose')&&($('#askClose').onclick=closeAsk);$('#askBack')&&($('#askBack').onclick=closeAsk);
  }
  const setText=(el,t)=>{if(el&&el.textContent!==t)el.textContent=t;};
  function questionHtml(q){
    const letter=k=>'ABCDE'[k];
    const body=q.type==='fill'?`<div class="fill-row"><input class="fill" id="fill" autocomplete="off" autocapitalize="off" placeholder="写答案 Your answer"><button class="go" id="send">确定</button></div>`
      :`<div class="opts ${q.options.every(o=>String(o).length<=18)?'two':''}">${q.options.map((o,k)=>`<button class="opt" data-n="${k+1}"><span class="k">${letter(k)}</span><span>${esc(o)}</span></button>`).join('')}</div>${q.type==='multi'?'<button class="go wide" id="send" disabled>确定 Check</button>':''}`;
    return `<p class="q">${esc(q.text)}</p>${q.img?`<img class="q-img" src="${esc(q.img)}" alt="">`:''}${q.type==='multi'?'<p class="hint">选出全部正确答案 Choose all correct answers</p>':''}${body}<p class="msg" id="msg"></p>`;
  }
  function wireQuestion(q,i){
    const box=$('#ask');
    const submit=(v,els)=>{if(busyAns||S?.ph!=='play')return;busyAns=true;ansAt=now();els.forEach(e=>e.classList.add('sent'));box.querySelectorAll('.opt,#send,#fill').forEach(e=>e.disabled=true);
      setText($('#msg'),'检查中… Checking');send({k:'ans',q:i,v});
      setTimeout(()=>{if(busyAns&&now()-ansAt>=2900&&qKey===`q:${mine?.q}:${mine?.rs}`){busyAns=false;box.querySelectorAll('.opt,#send,#fill').forEach(e=>e.disabled=false);
        box.querySelectorAll('.sent').forEach(e=>e.classList.remove('sent'));setText($('#msg'),'没收到，再按一次 Try again');}},3000);};
    if(q.type==='fill'){const inp=$('#fill'),go=()=>inp.value.trim()&&submit(inp.value,[inp]);$('#send').onclick=go;inp.onkeydown=e=>{if(e.key==='Enter')go();};if(!coarse)inp.focus();}
    else if(q.type==='multi'){const send2=$('#send'),opts=[...box.querySelectorAll('.opt')];
      opts.forEach(b=>b.onclick=()=>{b.classList.toggle('sel');send2.disabled=!opts.some(o=>o.classList.contains('sel'));});
      send2.onclick=()=>{const sel=opts.filter(o=>o.classList.contains('sel'));submit(sel.map(o=>Number(o.dataset.n)),sel);};}
    else box.querySelectorAll('.opt').forEach(b=>b.onclick=()=>submit([Number(b.dataset.n)],[b]));
  }
  function result(m){
    busyAns=false;qKey='';
    if(m.rk===1){note(`装弹 +${m.gain} 发！${m.gain>C.AMMO.ANSWER?' 连对奖励':''}`,'good');R.sfx.reload();buzz(30);
      clearTimeout(autoClose);autoClose=setTimeout(()=>{if(ammo()>0)closeAsk();},550);}   // back to shooting
    else if(m.rk===0){R.sfx.wrong();buzz(90);}
    drawAsk();
  }

  /* ── HUD ── */
  const showMute=()=>{$('#mute').innerHTML=RA?.mode==='off'
    ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>'
    :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/></svg>';};
  $('#mute').onclick=()=>{if(!RA)return;RA.unlock();RA.mode=RA.mode==='off'?'all':'off';showMute();};showMute();
  let hudKey='';
  function drawHud(){
    const a=ammo(),col=C.COLORS[mine?.col]||'#2ef2ff',B=S.m.find(m=>m.k==='b');
    const key=[Math.ceil(S.hull),S.sc,a,col,S.st,B?B.hp:'',S.ph,$('#ask').classList.contains('hidden')].join('|');if(key===hudKey)return;hudKey=key;
    const h=$('#hHull');h.querySelector('i').style.width=R.clamp(S.hull,0,100)+'%';setText(h.querySelector('b'),Math.ceil(S.hull)+'%');h.className='mini'+(S.hull<=30?' low':S.hull<=60?' mid':'');
    setText($('#hKills'),String(S.sc||0));
    $('#game').style.setProperty('--me',col);
    setText($('#ammoN'),String(a));
    $('#pips').innerHTML=Array.from({length:C.AMMO.MAX},(_,i)=>`<i class="${i<a?'on':''}"></i>`).join('');
    $('#reload').classList.toggle('glow',a===0);
    $('#boss').classList.toggle('hidden',!B);if(B){$('#boss i').style.width=(B.hp/B.max*100)+'%';setText($('#bossHp'),`${B.hp}/${B.max}`);}
    const ban=S.ph==='play'&&S.ct<C.WARM?'练习：拖动瞄准，放开发射':S.st==='warn'?'⚠ 陨石王正在接近！':'';
    setText($('#banner'),ban);$('#banner').classList.toggle('hidden',!ban);$('#banner').classList.toggle('hot',S.st==='warn');
    $('#pause').classList.toggle('hidden',S.ph!=='pause');
  }

  /* ── Screens by phase ── */
  function screens(){
    if(!S||!up||kicked||otherDev)return;
    if(S.ph==='lobby')return lobby();
    if(S.ph==='end')return ending();
    if(!mine){screen(`${head()}<p class="sub dots">正在加入 Joining</p>`,'joining');return;}
    setPlaying(true);
    const c=$('#count');if(S.ph==='count'){c.classList.remove('hidden');setText(c,String(Math.max(1,Math.ceil(S.cd/1000))));}else c.classList.add('hidden');
    drawHud();drawAsk();
  }
  function lobby(){
    const n=S.p.length,col=C.COLORS[mine?.col]||'#2ef2ff';
    screen(`${head()}<div class="my-turret" style="--c:${col}"><i></i></div><p class="small">你的炮台颜色 Your turret</p><p class="me-name" style="color:${col}">${esc(me?.name||'')}</p>
      <p class="sub dots">等老师开始 Waiting</p><p class="sub">防卫队 ${n} 人</p>
      <ol class="tips"><li>手机<b>横拿</b>，手指<b>拖动瞄准、放开发射</b></li><li>子弹打完就<b>答题装弹</b>：答对 +3 发，不限时</li><li>大陨石要很多人一起打；<b>金色陨石</b>打碎全员 +2 发</li><li>最后<b>陨石王</b>来了，全班集中火力！</li></ol>`,'lobby:'+n+':'+col);
  }
  function ending(){
    const e=S.end;if(!e)return;const m=e.me.get(myId());
    const title={win:'陨石王被击碎了！星环守住了！',breach:'陨石王撞上星环……',lost:'星环被打穿了……',stop:'这一局结束了'}[e.o];
    const acc=m&&m.shots?Math.round(m.hits/m.shots*100):0;
    screen(`${brand('STAR RING')}${e.o!=='stop'?`<p class="stars">${'★'.repeat(e.s)}<span>${'★'.repeat(3-e.s)}</span></p>`:''}<h2 class="end-title">${esc(title)}</h2>
      ${e.fin&&e.fin===myId()?'<p class="finisher">最后一击是你！</p>':''}
      ${m?`<div class="my"><p>第一次就答对 <b>${m.firstOk}/${m.firstN}</b> 题 · 一共答对 <b>${m.right}</b> 次${m.fixed?` · 订正 <b>${m.fixed}</b> 题`:''}</p>
        <p>开枪 <b>${m.shots}</b> · 命中 <b>${m.hits}</b>${m.shots?`（${acc}%）`:''} · 击碎 <b>${m.kills}</b></p></div>`:''}
      <p class="sub">全班击碎 ${e.ta.kills} 颗陨石 · 答对 ${e.ta.right} 题 · 防线剩 ${e.hull}%</p><p class="sub dots">等老师开下一局 Waiting</p>`,'end:'+e.o+e.s+e.ta.kills);
  }

  /* ── Drawing: every frame while playing ── */
  function frame(){
    requestAnimationFrame(frame);
    if(!S||$('#game').classList.contains('hidden'))return;
    const t=gameNow();if(S.ph==='play')flyMine(t);
    const dpr=cv.width/GW();
    window.RescueStage.render(ctx,GW(),GH(),dpr,{ct:t,hull:S.hull,st:S.st,ms:S.m,bs:S.b.filter(b=>b.by!==myId()),ps:order(),fx:S.fx.concat(sparks)},now(),
      {padR:SIDE,me:myId(),aim:aim?aim.a:null,mine:myShots});
  }
  requestAnimationFrame(frame);
  setInterval(()=>{if(S&&(S.ph==='play'||S.ph==='count'||S.ph==='pause')&&mine&&!otherDev){drawHud();drawAsk();}},250);

  findRooms();
  const ver=R.freshen(()=>!!room);if(ver)$('#ver').textContent='版本 '+ver;
  if(local){window.__phone={get S(){return S;},get mine(){return mine;},id:myId,shoot,ammo,aimAtWorld:(x,y)=>{const T=myTurret();return T?R.aimLimit(Math.atan2(y-T.y,x-T.x)):null;},openAsk};}   // test mode only
})();
