/* 太空站救援 — the student's phone (held upright). Pick the teacher's room, pick your name (the same class list as the
   online practice, so the results can go to Lumi later), then: answer for energy, tap a room on the map to walk there,
   put the energy in. The phone never has the answers: the teacher's computer checks every one. */
(()=>{
  'use strict';
  const R=window.RescueGame,C=R.C,qp=new URLSearchParams(location.search),local=qp.has('local');
  const net=local?R.createLocalNet():R.createNet(window.STUDYLOG_CLOUD||{});
  const cfg=window.STUDYLOG_CLOUD||{};
  const $=s=>document.querySelector(s),ui=$('#ui');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const store=(k,v,s=localStorage)=>{try{if(v===undefined)return s.getItem(k);if(v===null)s.removeItem(k);else s.setItem(k,v);}catch{}return null;};
  const now=()=>performance.now();
  // Who I am: the same record as the online practice page ({level,id,name}), or a typed name ({guest,id,name}).
  const ME=local?'lumi-student-local':'lumi-student';
  const readMe=()=>{try{const v=JSON.parse(store(ME)||'null');return v&&v.id&&v.name?v:null;}catch{return null;}};
  let me=readMe();
  const DEV=(()=>{let d=store('lumi-rescue-dev',undefined,sessionStorage);if(!d){d=Math.random().toString(36).slice(2,8);store('lumi-rescue-dev',d,sessionStorage);}return d;})();
  const myId=()=>me?(me.guest?'g:':'s:')+me.id:'';
  const av=()=>{const v=Number(store('lumi-rescue-av'));return Number.isInteger(v)&&v>=0&&v<R.ANIMALS.length?v:R.avOf(myId()||DEV);};
  R.pressFeedback();
  const RA=window.RescueAudio;RA?.setup({key:'lumi-rescue-sound'});
  const buzz=ms=>{if(navigator.vibrate)try{navigator.vibrate(ms);}catch{}};
  const roomName=i=>R.ROOMS[i]?.zh||'';

  let room=null,host='',up='',S=null,recvAt=0,mine=null,joinedAt=0,kicked=false,lastSnapAt=0,lastPh='',lastSend=0;
  const qs=[];
  const send=m=>{lastSend=now();return net.post(up,'u',host?{...m,id:myId(),to:host}:{...m,id:myId()});};

  /* ── Screens outside the game (room list, name, lobby, end) ── */
  const brand=sub=>`<div class="brand"><div class="logo-art" aria-hidden="true"><i></i></div><h1 class="logo">太空站救援</h1><p class="logo-en">${sub}</p></div>`;
  function screen(html,key=''){
    if(key&&ui.dataset.key===key)return false;ui.dataset.key=key;
    ui.innerHTML=`<div class="screen"><div class="box">${html}</div></div>`;ui.classList.remove('hidden');$('#play').classList.add('hidden');document.body.classList.remove('playing');return true;
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
    if(!screen(`${brand('Station Rescue')}${list.length?`<p class="sub">点老师的房间 Tap your teacher's room</p><div class="list">${list.map(r=>`<button class="room" data-room="${esc(r.room)}" data-hid="${esc(r.hid||'')}"><span>房间 ${esc(r.room)}</span><small>${r.n} 人</small></button>`).join('')}</div>`
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
  const head=()=>brand('房间 '+esc(room));
  function who(){
    me=readMe();
    if(!me)return pickLevel();
    screen(`${head()}<img class="pet big" src="${R.avatarSrc(av())}" alt=""><p class="sub">你是 Are you</p><p class="me-name">${esc(me.name)}</p>${me.level?`<p class="sub">${esc(me.level)}</p>`:''}
      <button class="big-btn" id="yes">是我，加入 Join</button><p class="again"><button class="ghost" id="notme">不是我 Not me</button>${qp.get('r')?'':'<button class="ghost" id="back">换房间 Other room</button>'}</p>`);
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
    screen(`${head()}<p class="sub">打你的名字 Your name</p><input class="field" id="gname" maxlength="16" autocomplete="off" placeholder="名字 Name"><button class="big-btn" id="go" disabled>加入 Join</button>
      <p class="again"><button class="ghost" id="lv">← 用名单 Class list</button></p>`);
    const input=$('#gname'),go=$('#go');input.oninput=()=>{go.disabled=!input.value.trim();};
    input.onkeydown=e=>{if(e.key==='Enter'&&input.value.trim())go.click();};
    go.onclick=()=>{me={guest:true,id:Math.random().toString(36).slice(2,10),name:input.value.trim().slice(0,16)};store(ME,JSON.stringify(me));R.sfx.unlock();joinRoom();};
    $('#lv').onclick=pickLevel;if(!('ontouchstart' in window))input.focus();
  }

  /* ── 3. Join and listen ── */
  const sendJoin=()=>send({k:'join',name:me.name,av:av(),dev:DEV,lv:me.level||''});
  function joinRoom(){
    net.leave('rescue-lobby');up=`rescue-${room}-u`;joinedAt=now();
    const mineHost=p=>!p?.hid||!host||p.hid===host;
    net.join(`rescue-${room}`,(ev,p)=>{if(ev==='snap')onSnap(p);else if(ev==='q'){if(mineHost(p))onQuestions(p);}else if(ev==='closed'){if(mineHost(p))closed();}});
    sendJoin();screen(`${head()}<p class="sub dots">正在加入 Joining</p>`,'joining');
  }
  function message(text,btn,fn){screen(`${brand('Station Rescue')}<p class="sub">${text}</p><button class="big-btn" id="again">${btn}</button>`);$('#again').onclick=fn;}
  function closed(){up='';message('老师已经关掉房间。<br>The room is closed.','重新找房间 Find a room',()=>location.reload());}
  // Keep telling the teacher we are here (this also rejoins after the teacher's page reloads).
  // (Not while another phone has taken my place: only "use this phone" takes it back.)
  setInterval(()=>{if(!up||kicked||otherDev||now()-joinedAt<1200)return;if(!mine)sendJoin();else if(now()-lastSend>4000)send({k:'hi'});},1500);
  addEventListener('pagehide',()=>{if(up&&!kicked&&mine)send({k:'bye'});});
  setInterval(()=>{$('#net').classList.toggle('hidden',!up||!S||kicked||now()-lastSnapAt<4000||S.ph==='end');},1000);

  let otherDev=false;
  function onQuestions(p){for(const [i,q] of p.items||[])qs[i]=q;qKey='';draw();}
  function onSnap(raw){
    if(kicked||!up)return;
    if(raw.hid){if(!host)host=raw.hid;else if(raw.hid!==host){if(now()-Math.max(lastSnapAt,joinedAt)<8000)return;host=raw.hid;mine=null;}}
    const s=R.unpack(raw),t=now();lastSnapAt=t;
    if(s.k?.includes(myId())){kicked=true;up='';message('老师把你移出了房间。<br>The teacher removed you.','再加入 Join again',()=>location.reload());return;}
    const was=S?.ph;S=s;recvAt=t;
    const m=s.p.find(p=>p.id===myId());
    if(m&&m.dev&&m.dev!==DEV){mine=null;if(!otherDev){otherDev=true;
      screen(`${brand('房间 '+esc(room))}<p class="sub">你在另一部手机加入了。<br>You joined on another phone.</p><button class="big-btn" id="here">用这部手机 Use this phone</button>`);
      $('#here').onclick=()=>{otherDev=false;sendJoin();screen(`${head()}<p class="sub dots">正在加入 Joining</p>`,'joining');};}return;}
    if(otherDev)return;
    const first=!mine&&!!m;mine=m||null;
    if(m){if(first||lastRs==null)lastRs=m.rs;if(m.rs!==lastRs){lastRs=m.rs;result(m);}
      if(m.walk||now()-goAt>1500)localWalk=null;
      if(pend&&(m.e2!==pendBase||now()-pendAt>2000))pend=0;}
    if(s.ph!==lastPh){phase(was,s.ph);lastPh=s.ph;}
    events(s);draw();
  }
  function phase(was,ph){
    if(ph==='vote'){R.sfx.twist();buzz(200);myVote='';}
    if(ph==='final'&&was!=='pause'){R.sfx.go();buzz(120);}
    if(ph==='play'&&was==='count')R.sfx.go();
    if(ph==='end'&&S.end){const st=S.end.s;if(S.end.o!=='stop')RA?.jingle(st>=2?'win':'lose');}
    if(ph==='lobby'){mapOpen=false;qKey='';}
    if(ph!=='play'&&ph!=='final')mapOpen=false;
  }
  /* What happened that this student should hear about. */
  let lastFx=-1;
  function events(s){
    const top=s.fx.reduce((a,f)=>Math.max(a,f.id),0);if(lastFx<0){lastFx=top;return;}
    for(const f of s.fx){if(f.id<=lastFx)continue;const mineFx=f.by===myId(),where=roomName(f.room);
      if(f.k==='alarm'){note(`陨石要撞${where}！去挡住 Meteor!`,'bad');R.sfx.alarm();buzz(60);}
      else if(f.k==='hit'){note(`陨石撞到${where}！船体 -${C.METEOR.HIT}`,'bad');R.sfx.hit();buzz(160);}
      else if(f.k==='fire'){note(`${where}着火了 Fire!`,'bad');R.sfx.fire();}
      else if(f.k==='spread'){note(`火烧到${where}了`,'bad');}
      else if(f.k==='block'){note(mineFx?'你挡住了陨石！':`${where}挡住陨石了！`,'good');R.sfx.block();}
      else if(f.k==='out'){note(mineFx?'你灭了火！':`${where}的火灭了`,'good');if(mineFx)R.sfx.out();}
      else if(f.k==='board'&&mineFx){note('上船了！Boarded','good');R.sfx.board();buzz(80);}
      else if(f.k==='put'&&mineFx){R.sfx.put();}}
    lastFx=Math.max(lastFx,top);
  }
  let noteTimer=0;
  function note(text,kind=''){const n=$('#note');n.textContent=text;n.className='show '+kind;clearTimeout(noteTimer);noteTimer=setTimeout(()=>{n.className='';},2400);}

  /* ── The game screen ── */
  let mapOpen=false,qKey='',busyAns=false,ansAt=0,pend=0,pendBase=0,pendAt=0,localWalk=null,goAt=0,lastRs=null,myVote='',built=false,alertKey='',panelKey='';
  const live=()=>S&&(S.ph==='play'||S.ph==='final');
  const ct=()=>!S?0:live()?S.ct+Math.min(3000,now()-recvAt):S.ct;
  const walk=()=>mine?.walk||localWalk;
  const walking=()=>{const w=walk();return !!w&&ct()<w.t1;};
  const whereNow=()=>{const w=walk();return w&&ct()>=w.t1?w.to:mine?.room??C.START;};
  const energy=()=>Math.max(0,(mine?.e2||0)-pend);
  const fireIn=r=>S.c.find(c=>c.k==='f'&&c.room===r),meteorIn=r=>S.c.find(c=>c.k==='m'&&c.room===r);
  const burning=()=>new Set(S.c.filter(c=>c.k==='f').map(c=>c.room));
  const escaping=()=>S.ph==='final'&&S.md!=='fight';
  const secs=ms=>Math.max(0,Math.ceil(ms/1000));
  const mmss=ms=>{const s=secs(ms);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
  const ICON={
    f:'<svg viewBox="0 0 24 24"><path d="M12 2.5c1 3.4 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4.1 2.6-5.6.2 1.6.9 2.7 2 3.2-.4-3.4.2-6 .9-8.6z" fill="currentColor"/></svg>',
    m:'<svg viewBox="0 0 24 24"><circle cx="15" cy="9" r="5.5" fill="currentColor"/><path d="M11 13 3 21M9 9.5 4 14.5M14.5 15 9.5 20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    e:'<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/></svg>',
    o:'<b class="o2">O₂</b>',
    p:'<svg viewBox="0 0 24 24"><path d="M12 2c3 2.5 4.5 6 4.5 10.5L19 15v3l-3-1-1 3H9l-1-3-3 1v-3l2.5-2.5C7.5 8 9 4.5 12 2z" fill="currentColor"/><circle cx="12" cy="9.5" r="2" fill="#fff"/></svg>',
    on:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/></svg>',
    off:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>'};
  const setHtml=(el,h)=>{if(el&&el.innerHTML!==h)el.innerHTML=h;};
  const setText=(el,t)=>{if(el&&el.textContent!==t)el.textContent=t;};

  function build(){
    built=true;
    $('#hud').innerHTML=['hull:船体','o2:氧气','eng:引擎'].map(x=>{const [k,t]=x.split(':');return `<div class="mini ${k}" id="h-${k}"><span>${t}</span><div class="track"><i></i>${k==='eng'?'<em></em>':''}</div><b></b></div>`;}).join('')
      +`<span class="clock" id="hclock"></span><button class="icon-btn" id="mute" data-quiet aria-label="声音 Sound"></button>`;
    $('#dock').innerHTML=`<div class="cells" id="cells"></div><div class="where" id="where"></div><button class="map-btn" id="mapBtn"><span></span></button>`;
    $('#map').innerHTML=`<div class="sheet-head"><b>太空站地图 <small>点房间走过去 Tap a room</small></b><button class="ghost" id="mapClose">回去答题 ✕</button></div>
      <div class="grid map-grid">${R.ROOMS.map((r,i)=>`<button class="tile room-${r.k}" data-go="${i}"><b>${r.zh}</b><small>${r.en}</small><span class="st"></span><span class="eta"></span><span class="ppl"></span></button>`).join('')}</div>
      <div class="room-panel" id="rp"></div>`;
    $('#mapBtn').onclick=()=>{mapOpen=!mapOpen;draw();};
    $('#mapClose').onclick=()=>{mapOpen=false;draw();};
    $('#map').addEventListener('click',e=>{const t=e.target.closest('[data-go]');if(t)return goTo(Number(t.dataset.go));const a=e.target.closest('[data-put]');if(a&&!a.disabled)putIn(a.dataset.put);});
    $('#alerts').addEventListener('click',e=>{const t=e.target.closest('[data-room]');if(!t)return;mapOpen=true;goTo(Number(t.dataset.room));});
    const showMute=()=>{$('#mute').innerHTML=RA?.mode==='off'?ICON.off:ICON.on;};
    $('#mute').onclick=()=>{if(!RA)return;RA.unlock();RA.mode=RA.mode==='off'?'all':'off';showMute();};showMute();
    $('#qbox').addEventListener('click',e=>{const v=e.target.closest('[data-vote]');if(v&&S?.ph==='vote'){myVote=v.dataset.vote;send({k:'vote',v:myVote});R.sfx.vote();draw();}
      if(e.target.closest('#openMap')){mapOpen=true;draw();}});
  }
  function goTo(r){
    if(!mine||!live()||mine.pod)return;
    if(walking()){note('走到了再换 Wait until you arrive');return;}
    const here=whereNow();if(r===here){draw();return;}
    send({k:'go',room:r});localWalk=R.plan(here,r,burning(),ct());goAt=now();draw();
  }
  function putIn(task){
    const cost=task==='board'?C.BOARD[S.md]*2:2;if(energy()<cost||walking())return;
    if(!pend)pendBase=mine.e2;pend+=cost;pendAt=now();send({k:'put',task});R.sfx.put();buzz(15);draw();
  }

  /* What a room needs now, and what this student can do there. */
  function tasks(r){
    const list=[],f=fireIn(r),m=meteorIn(r);
    if(f)list.push({t:'fire',label:`灭火 Put out fire`,n:`${f.got}/${f.need}`,cls:'f'});
    if(m)list.push({t:'shield',label:`护盾 Shield`,n:`${m.got}/${m.need} · ${secs(m.t1-ct())} 秒`,cls:'m'});
    const warm=S.ph==='play'&&ct()<C.WARM;
    if(r===C.ENGINE&&!escaping()&&S.eng<100)list.push({t:'engine',label:S.md==='fight'?`修引擎 ×${C.BOOST}`:'修引擎 Repair',n:`${Math.floor(S.eng)}%`,cls:'e',off:!!f||warm,why:f?'先灭火':'暖身后才能修'});
    if(r===C.OXYGEN&&S.o2<100)list.push({t:'o2',label:`补氧气 +${C.O2.CELL}%`,n:`${Math.floor(S.o2)}%`,cls:'o',off:!!f,why:'先灭火'});
    if(r===C.POD&&escaping()&&!mine.pod)list.push({t:'board',label:`上船 Board`,n:`要 ${C.BOARD[S.md]} 格`,cls:'p',off:!!f,why:'先灭火',cost:C.BOARD[S.md]*2});
    return list;
  }
  function drawMap(){
    const map=$('#map');map.classList.toggle('hidden',!mapOpen);if(!mapOpen)return;
    const here=whereNow(),w=walk(),go=walking(),fires=burning(),t=ct();
    const ppl=R.ROOMS.map(()=>0);for(const p of S.p)if(!p.pod){const x=p.walk&&t<p.walk.t1?p.walk.to:p.room;ppl[x]++;}
    map.querySelectorAll('[data-go]').forEach(b=>{const i=Number(b.dataset.go),f=fireIn(i),m=meteorIn(i);
      b.classList.toggle('here',!go&&i===here);b.classList.toggle('dest',go&&w&&i===w.to);b.classList.toggle('fire',!!f);b.classList.toggle('meteor',!!m);
      const st=[f?`<i class="b f">${ICON.f}${f.got}/${f.need}</i>`:'',m?`<i class="b m">${ICON.m}${secs(m.t1-t)}s ${m.got}/${m.need}</i>`:'',
        i===C.ENGINE?`<i class="b e">${ICON.e}${Math.floor(S.eng)}%</i>`:'',i===C.OXYGEN?`<i class="b o ${S.o2<C.O2.LOW?'low':''}">O₂ ${Math.floor(S.o2)}%</i>`:'',
        i===C.POD&&escaping()?`<i class="b p">${ICON.p}${(S.cr||[0])[0]}</i>`:''].join('');
      setHtml(b.querySelector('.st'),st);
      const r=!go&&i!==here?R.route(here,i,fires):null;
      setText(b.querySelector('.eta'),!go&&i===here?'你在这里':go&&w&&i===w.to?`走路中 ${secs(w.t1-t)} 秒`:r?`走 ${secs(r.ms)} 秒${r.path.slice(1,-1).some(x=>fires.has(x))?' 穿过火场':''}`:'');
      setText(b.querySelector('.ppl'),ppl[i]?`${ppl[i]} 人`:'');});
    // the room I'm in: what I can put my energy into
    const rp=$('#rp');
    if(go){setHtml(rp,`<p class="walking">正在去 <b>${roomName(w.to)}</b> · ${secs(w.t1-t)} 秒</p>`);panelKey='';return;}
    const list=tasks(here),key=here+':'+list.map(x=>x.t+(x.off?'!':'')).join(',');
    if(key!==panelKey){panelKey=key;
      rp.innerHTML=`<p class="rp-title">你在 <b>${roomName(here)}</b></p>`+(list.length?list.map(x=>`<button class="act ${x.cls}" data-put="${x.t}" data-cost="${x.cost||2}"><span class="a-ic">${ICON[x.cls]}</span><span class="a-l"></span><span class="a-n"></span><span class="a-c">${x.off?x.why:x.t==='board'?'':'投 1 格'}</span></button>`).join('')
        :`<p class="rp-empty">这里现在没事。看看别的房间？<br><small>Nothing to do here.</small></p>`);}
    rp.querySelectorAll('[data-put]').forEach(b=>{const x=list.find(y=>y.t===b.dataset.put);if(!x)return;setText(b.querySelector('.a-l'),x.label);setText(b.querySelector('.a-n'),x.n);
      b.disabled=!!x.off||energy()<Number(b.dataset.cost);});
  }
  function drawAlerts(){
    const box=$('#alerts'),t=ct(),list=[...S.c].sort((a,b)=>(a.k==='m'?a.t1:a.t1+1e7)-(b.k==='m'?b.t1:b.t1+1e7));
    let top='';
    if(S.ph==='final'){const cr=S.cr||[0,0];top=S.md==='fight'?`<div class="final fight"><b>拼到底！</b> ${mmss(S.fin-t)} 内修好引擎 · 引擎能量 ×${C.BOOST}</div>`
      :`<div class="final escape"><b>${S.md==='escape'?'坐逃生船！':'紧急逃生！'}</b> 带 ${C.BOARD[S.md]} 格能量去逃生舱 · 已上船 ${cr[0]}/${cr[1]} · ${mmss(S.fin-t)}</div>`;}
    else if(S.ph==='play'&&t<C.WARM)top=`<div class="final warm"><b>暖身</b> 先答题存满能量（引擎预热中）· 第一颗陨石 ${mmss(C.WARM-t)} 后到</div>`;
    const lowAir=S.o2<C.O2.LOW&&!escaping();
    const key=top.replace(/\d+/g,'')+'|'+list.map(c=>c.id).join(',')+'|'+lowAir;
    if(key!==alertKey){alertKey=key;
      box.innerHTML=`<div class="top-line"></div>`+list.slice(0,3).map(c=>`<button class="alert ${c.k}" data-room="${c.room}" data-id="${c.id}">${ICON[c.k]}<span class="a-t"></span></button>`).join('')
        +(list.length>3?`<span class="more">+${list.length-3}</span>`:'')+(lowAir?`<button class="alert o" data-room="${C.OXYGEN}"><b class="o2">O₂</b><span>缺氧！答对只拿半格 → 氧气站</span></button>`:'');}
    setHtml(box.querySelector('.top-line'),top);
    box.querySelectorAll('[data-id]').forEach(b=>{const c=S.c.find(x=>x.id===Number(b.dataset.id));if(!c)return;
      setText(b.querySelector('.a-t'),c.k==='m'?`${roomName(c.room)} ${secs(c.t1-t)} 秒 · 护盾 ${c.got}/${c.need}`:`${roomName(c.room)} 着火 · ${c.got}/${c.need}`);
      b.classList.toggle('urgent',c.k==='m'&&c.t1-t<12000);});
  }
  function drawHud(){
    const bar=(k,v,low)=>{const el=$('#h-'+k);el.querySelector('i').style.width=R.clamp(v,0,100)+'%';setText(el.querySelector('b'),Math.floor(v)+'%');el.classList.toggle('low',!!low);};
    bar('hull',S.hull,S.hull<35);bar('o2',S.o2,S.o2<C.O2.LOW);bar('eng',S.eng,false);$('#h-eng em').style.left=C.TWIST_AT+'%';
    setText($('#hclock'),S.ph==='final'?mmss(S.fin-ct()):'');
  }
  function drawDock(){
    const e=energy(),go=walking(),w=walk();
    setHtml($('#cells'),[0,1,2].map(k=>{const f=R.clamp(e/2-k,0,1);return `<i class="cell ${f>=1?'full':f>0?'half':''}"></i>`;}).join('')+`<span class="cell-n">${e/2}</span>`);
    setHtml($('#where'),mine.pod?'<b>已上船 ✓</b>':go?`去 <b>${roomName(w.to)}</b> ${secs(w.t1-ct())}s`:`你在 <b>${roomName(whereNow())}</b>`);
    const b=$('#mapBtn');setText(b.querySelector('span'),mapOpen?'回去答题':e>=2&&!mine.pod?'去送能量 ▸':'看地图 ▸');b.classList.toggle('glow',e>=C.E_MAX&&!mapOpen);
    b.classList.toggle('hidden',S.ph==='vote');   // voting: nothing to walk to
  }
  /* The middle of the screen: the question (only redrawn when it changes, so typing is never lost). */
  function qState(){
    if(S.ph==='vote')return 'vote';
    if(!mine)return 'none';
    if(mine.e2>=C.E_MAX)return 'full';
    if(ct()<mine.cd)return 'cool:'+mine.q;
    if(mine.q<0)return 'noq';
    if(!qs[mine.q])return 'load:'+mine.q;
    return `q:${mine.q}:${mine.rs}`;
  }
  let needAt=0;
  function drawQ(){
    const box=$('#qbox'),key=qState();
    if(key==='vote'){drawVote(box);return;}
    if(key.startsWith('load')&&now()-needAt>1500){needAt=now();send({k:'need',q:mine.q});}
    if(key===qKey){if(key.startsWith('cool'))setText($('#coolN'),String(secs(mine.cd-ct())));return;}
    qKey=key;busyAns=false;
    const pod=mine?.pod?'<p class="ribbon">已上船 ✓ 可以继续练习 Keep practising</p>':'';
    if(key==='full')box.innerHTML=`<div class="center"><div class="big-cells">${'<i class="cell full"></i>'.repeat(3)}</div><h2>能量满了！</h2><p class="sub">先去把能量送出去，才能拿新的题目。<br>Energy full: go and use it.</p><button class="big-btn" id="openMap">打开地图 ▸</button></div>`;
    else if(key.startsWith('cool'))box.innerHTML=`<div class="center">${pod}<div class="wrong-face">✗</div><h2>答错了</h2><p class="sub">这题等一下会再出现。<br>This question will come back.</p><p class="cool"><b id="coolN">${secs(mine.cd-ct())}</b> 秒</p></div>`;
    else if(key.startsWith('load'))box.innerHTML=`<div class="center"><p class="sub dots">题目加载中 Loading</p></div>`;
    else if(key==='none'||key==='noq')box.innerHTML=`<div class="center"><p class="sub dots">等一下 Wait</p></div>`;
    else{const q=qs[mine.q];box.innerHTML=pod+questionHtml(q);wireQuestion(q,mine.q);}
  }
  function questionHtml(q){
    const letter=k=>'ABCDE'[k];
    const body=q.type==='fill'?`<div class="fill-row"><input class="fill" id="fill" autocomplete="off" autocapitalize="off" placeholder="写答案 Your answer"><button class="go" id="send">确定</button></div>`
      :`<div class="opts">${q.options.map((o,k)=>`<button class="opt" data-n="${k+1}"><span class="k">${letter(k)}</span><span>${esc(o)}</span></button>`).join('')}</div>${q.type==='multi'?'<button class="go wide" id="send" disabled>确定 Check</button>':''}`;
    return `<div class="qcard"><p class="q">${esc(q.text)}</p>${q.img?`<img class="q-img" src="${esc(q.img)}" alt="">`:''}${q.type==='multi'?'<p class="hint">选出全部正确答案 Choose all correct answers</p>':''}${body}<p class="msg" id="msg"></p></div>`;
  }
  function wireQuestion(q,i){
    const box=$('#qbox');
    const submit=(v,els)=>{if(busyAns||!live())return;busyAns=true;ansAt=now();els.forEach(e=>e.classList.add('sent'));box.querySelectorAll('.opt,#send,#fill').forEach(e=>e.disabled=true);
      setText($('#msg'),'检查中… Checking');send({k:'ans',q:i,v});
      setTimeout(()=>{if(busyAns&&now()-ansAt>=2900&&qKey===`q:${mine?.q}:${mine?.rs}`){busyAns=false;box.querySelectorAll('.opt,#send,#fill').forEach(e=>e.disabled=false);
        box.querySelectorAll('.sent').forEach(e=>e.classList.remove('sent'));setText($('#msg'),'没收到，再按一次 Try again');}},3000);};
    if(q.type==='fill'){const inp=$('#fill'),go=()=>inp.value.trim()&&submit(inp.value,[inp]);$('#send').onclick=go;inp.onkeydown=e=>{if(e.key==='Enter')go();};if(!('ontouchstart' in window))inp.focus();}
    else if(q.type==='multi'){const send2=$('#send'),opts=[...box.querySelectorAll('.opt')];
      opts.forEach(b=>b.onclick=()=>{b.classList.toggle('sel');send2.disabled=!opts.some(o=>o.classList.contains('sel'));});
      send2.onclick=()=>{const sel=opts.filter(o=>o.classList.contains('sel'));submit(sel.map(o=>Number(o.dataset.n)),sel);};}
    else box.querySelectorAll('.opt').forEach(b=>b.onclick=()=>submit([Number(b.dataset.n)],[b]));
  }
  function result(m){
    busyAns=false;qKey='';
    if(m.rk===1){note(m.gain>=2?'答对了！+1 格能量 ⚡':'答对了！缺氧只拿半格 ⚡','good');R.sfx.right();R.sfx.gain();buzz(30);}
    else if(m.rk===0){R.sfx.wrong();buzz(90);}
  }
  function drawVote(box){
    const v=S.v||[0,0];
    if(qKey!=='vote'){qKey='vote';
      box.innerHTML=`<div class="vote-ph"><h2>陨石群提前来了！</h2><p class="sub">全班投票 Vote · <b id="vt"></b> 秒</p>
        <button class="vote-btn fight" data-vote="f"><b>拼到底</b><small>${C.FIGHT/1000} 秒内把引擎修到 100%（能量 ×${C.BOOST}）<br>成功 ★★★ · 失败要紧急逃生</small><span class="n" id="vf"></span></button>
        <button class="vote-btn escape" data-vote="e"><b>坐逃生船</b><small>每人带 ${C.BOARD.escape} 格能量到逃生舱上船<br>全员上船 ★★</small><span class="n" id="ve"></span></button>
        <p class="sub small">引擎现在 <b id="veng"></b> · 平手就拼到底</p></div>`;}
    setText($('#vt'),String(secs(S.vt)));setText($('#vf'),String(v[0]));setText($('#ve'),String(v[1]));setText($('#veng'),Math.floor(S.eng)+'%');
    box.querySelectorAll('[data-vote]').forEach(b=>b.classList.toggle('on',b.dataset.vote===myVote));
  }

  function lobby(){
    const n=S.p.length,A=R.ANIMALS[av()];
    if(screen(`${head()}<button class="pet-btn" id="pet" data-quiet aria-label="换一只 Change"><img class="pet big" src="${R.avatarSrc(av())}" alt=""></button>
      <p class="small">${A.zh} ${A.en} · 点一下换一只</p><p class="me-name">${esc(me?.name||'')}</p><p class="sub dots">等老师开始 Waiting</p><p class="sub">船员 ${n} 人</p>
      <ol class="tips"><li>答对一题 = <b>1 格能量</b>（最多 3 格）</li><li>点地图上的房间走过去，<b>投能量</b>：灭火、挡陨石、补氧气、修引擎</li><li>大家要分工：一个人挡不住陨石！</li></ol>`,'lobby:'+n+':'+av())){
      $('#pet').onclick=()=>{R.sfx.unlock();R.sfx.tap();store('lumi-rescue-av',String((av()+1)%R.ANIMALS.length));sendJoin();ui.dataset.key='';lobby();};}
  }
  function ending(){
    const e=S.end;if(!e)return;const m=e.me.get(myId());
    const title={saved:'太空站保住了！',escape:e.b>=e.n?'全员坐逃生船撤离！':`逃生船出发了！救下 ${e.b}/${e.n} 人`,emerg:e.b>=e.n?'千钧一发，全员逃出来了！':`千钧一发！救下 ${e.b}/${e.n} 人`,stop:'这一局结束了'}[e.o];
    screen(`${brand('Station Rescue')}${e.o!=='stop'?`<p class="stars">${'★'.repeat(e.s)}<span>${'★'.repeat(3-e.s)}</span></p>`:''}<h2 class="end-title">${esc(title)}</h2>
      ${m?`<div class="my"><p>第一次就答对 <b>${m.firstOk}/${m.firstN}</b> 题</p><p>一共答对 <b>${m.right}</b> 次${m.fixed?` · 订正 <b>${m.fixed}</b> 题`:''}</p><p>送出能量 <b>⚡ ${m.energy}</b></p></div>`:''}
      <p class="sub">全班答对 ${e.ta.right} 题 · 挡下 ${e.ta.blocked} 颗陨石 · 灭了 ${e.ta.out} 场火</p><p class="sub dots">等老师开下一局 Waiting</p>`,'end:'+e.o+e.s);
  }
  function draw(){
    if(!S||!up||kicked||otherDev)return;
    $('#pause').classList.toggle('hidden',S.ph!=='pause');
    if(S.ph==='lobby'){lobby();return;}
    if(S.ph==='end'){ending();return;}
    if(S.ph==='count'){screen(`${head()}<p class="count-n">${Math.max(1,secs(S.cd))}</p><p class="sub">准备 Get ready</p>`,'count'+secs(S.cd));return;}
    if(!mine){screen(`${head()}<p class="sub dots">正在加入 Joining</p>`,'joining');return;}
    if(!built)build();
    ui.classList.add('hidden');ui.dataset.key='';$('#play').classList.remove('hidden');document.body.classList.add('playing');
    drawHud();drawAlerts();drawDock();drawQ();drawMap();
  }
  setInterval(()=>{if(S&&(live()||S.ph==='vote'||S.ph==='count'))draw();},250);

  findRooms();
  const ver=R.freshen(()=>!!room);if(ver)$('#ver').textContent='版本 '+ver;
  if(local){window.__phone={get S(){return S;},get mine(){return mine;},id:myId};}   // test mode only
})();
