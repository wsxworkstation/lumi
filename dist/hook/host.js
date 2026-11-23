/* Hook Rush — the teacher's console. This computer is the referee: it runs the games, keeps the answers
   (phones never get them), checks every answer, and sends snapshots to the phones.
   One console can run up to 3 rooms at the same time (0001 | 0002 | 0003): each room has its own game, questions,
   teams and settings; the big screen shows the room picked in the tabs, the others keep playing. */
(()=>{
  'use strict';
  const G=window.HookGame,C=G.C,qp=new URLSearchParams(location.search),local=qp.has('local');
  const net=local?G.createLocalNet():G.createNet(window.STUDYLOG_CLOUD||{});
  const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const teamOf=i=>C.TEAMS[i]||C.TEAMS[0];
  const HID=Math.random().toString(36).slice(2,10),MAX_ROOMS=3,EMPTY_Q='还没有题目。Excel 用线上练习同一个模板（Quizizz 格式）。';
  G.pressFeedback();
  // Sound on the teacher's computer (the classroom speakers): its own setting and music volume.
  const HA=window.HookAudio;let musicVol=0.6;try{const v=Number(localStorage.getItem('lumi-hook-music-vol'));if(v>=0&&v<=1&&localStorage.getItem('lumi-hook-music-vol')!==null)musicVol=v;}catch{}
  HA?.setup({key:'lumi-hook-host-sound',music:musicVol});
  let itemsDefault=true;try{itemsDefault=localStorage.getItem('lumi-hook-items')!=='0';}catch{}

  // Opened straight from the computer's folder (file://…): students still need the website address, not the file path.
  const joinUrl=/^https?:$/.test(location.protocol)?new URL('./',location.href).href.replace(/\/host\.html.*$/,'/'):'https://wsxworkstation.github.io/lumi/hook/';
  $('#url').textContent=joinUrl.replace(/^https?:\/\//,'')+(local?'?local':'');

  /* ── Rooms ── */
  const rooms=[];let cur=null;   // cur = the room on the big screen / in the setup panel
  let sent=0,recv=0,rateAt=performance.now();
  const phonesIn=r=>{let n=0;for(const p of r.game.players.values())if(!p.bot)n++;return n;};
  const allPhones=()=>rooms.reduce((n,r)=>n+phonesIn(r),0);
  // Supabase counts the message we send plus one for every phone that receives it.
  const push=(r,event,payload)=>{if(r.code&&net.push(r.down,event,payload))sent+=1+phonesIn(r);};
  function newRoom(code,from){
    const r={code:'',down:'',up:'',game:G.createGame({check:(q,v)=>window.LumiQuiz.check(q,v)}),pack:[],qMsg:EMPTY_Q,botN:0,
      lastSnap:0,lastAnnounce:0,lastPh:'lobby',needAt:new Map(),lastFx:0,lastPlayPh:'',lastTick:0,glowSeen:false,lastCount:-1};
    r.game.items=itemsDefault;
    // A new room starts with the same questions and settings as the room on screen.
    if(from){const f=from.game;r.game.setQuestions(f.qs);r.pack=from.pack;r.qMsg=from.qMsg;r.game.setTeams(f.teams);
      Object.assign(r.game,{target:f.target,limit:f.limit,mode:f.mode,items:f.items});}
    rooms.push(r);if(code)openCode(r,code);return r;
  }
  function openCode(r,c){
    if(r.code){net.leave(r.down);net.leave(r.up);}
    r.code=c;r.down=`hook-${c}`;r.up=`hook-${c}-u`;r.lastAnnounce=0;
    net.join(r.down,()=>{});net.join(r.up,(ev,m)=>onUp(r,ev,m));
    saveCodes();if(r===cur)$('#code').textContent=c;tabs();
  }
  const saveCodes=()=>{try{sessionStorage.setItem('lumi-hook-codes',JSON.stringify(rooms.map(r=>r.code).filter(Boolean)));}catch{}};
  function onUp(r,ev,m){
    if(ev!=='u'||!m||!m.id)return;recv++;
    const g=r.game;
    if(m.k==='need'){const i=Number(m.q),at=r.needAt.get(i)||0;if(r.pack[i]&&performance.now()-at>800){r.needAt.set(i,performance.now());push(r,'q',{items:[[i,r.pack[i]]]});}return;}
    const before=g.players.size,p=g.input(m);
    if(r===cur&&((m.k==='join'&&p&&g.players.size!==before)||m.k==='bye'))drawPlayers();
  }
  /* Room numbers start at 0001: listen to the other rooms for a moment, then take the smallest free number.
     A refresh keeps the same numbers (this tab remembers them). */
  const others=new Map();
  const inUse=()=>new Set([...[...others].filter(([,o])=>Date.now()-o.at<6000&&o.ph!=='closed').map(([c])=>c),...rooms.map(r=>r.code).filter(Boolean)]);
  net.join('hook-lobby',(ev,p)=>{
    if(ev!=='room'||!p?.room||p.hid===HID)return;const c=String(p.room);others.set(c,{ph:p.ph,at:Date.now()});
    // Two empty rooms with the same number (e.g. opened at the same moment): one of them moves to the next number.
    const r=rooms.find(x=>x.code===c);
    if(r&&p.ph!=='closed'&&p.hid&&p.hid<HID&&!r.game.players.size&&r.game.ph==='lobby')openCode(r,G.pickRoom(inUse()));
  });
  // If this computer can't reach the server, students never see the room. Say so instead of looking fine.
  setInterval(()=>{$('#netWarn').classList.toggle('hidden',net.downFor()<4000);},1000);
  addEventListener('beforeunload',()=>{for(const r of rooms)if(r.code){net.push(r.down,'closed',{});net.push('hook-lobby','room',{room:r.code,n:0,ph:'closed',hid:HID});}});

  /* Tabs: 0001 | 0002 | 0003 | ＋开新房间. Each shows how that room is doing. */
  function status(r){const g=r.game;
    if(g.ph==='lobby')return `${g.players.size} 人`;
    if(g.ph==='end')return '已结束';
    return (g.ph==='pause'?'暂停 ':'进行中 ')+g.sc.slice(0,g.teams).join(':');}
  function tabs(){
    const many=rooms.length>1,add=rooms.length<MAX_ROOMS?`<button class="new-room" data-new>＋ 开新房间</button>`:'';
    const list=rooms.map(r=>`<span class="room-tab${r===cur?' on':''}"><button data-room="${rooms.indexOf(r)}"><b>${esc(r.code||'····')}</b><small>${status(r)}</small></button>${many?`<button class="room-x" data-close="${rooms.indexOf(r)}" title="关掉这个房间">✕</button>`:''}</span>`).join('');
    // Rooms announced by another teacher page (another tab, window or computer) — usually an old page left open.
    const elsewhere=[...others].filter(([c,o])=>Date.now()-o.at<6000&&o.ph!=='closed'&&!rooms.some(r=>r.code===c)).map(([c])=>c).sort();
    const note=elsewhere.length?`<span class="other-rooms">还有房间 ${elsewhere.map(esc).join('、')} 在别的分页或电脑开着</span>`:'';
    const setupHtml=note+(many?list:'')+add,stageHtml=many?list:'';
    // Only redraw when something changed, so a click is never lost to a redraw happening under the pointer.
    if(setupHtml!==tabsDrawn[0]){tabsDrawn[0]=setupHtml;$('#roomsSetup').innerHTML=setupHtml;}
    if(stageHtml!==tabsDrawn[1]){tabsDrawn[1]=stageHtml;$('#roomsStage').innerHTML=stageHtml;}
  }
  const tabsDrawn=['',''];
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-room],[data-close],[data-new]');if(!t)return;
    if(t.dataset.new!=null){if(rooms.length>=MAX_ROOMS)return;const r=newRoom(G.pickRoom(inUse()),cur);select(r);return;}
    if(t.dataset.close!=null){const r=rooms[Number(t.dataset.close)];if(!r||rooms.length<2)return;
      if((r.game.players.size||r.game.ph!=='lobby')&&!confirm(`关掉房间 ${r.code}？里面的学生会被请出去。`))return;
      push(r,'closed',{});if(r.code){net.push('hook-lobby','room',{room:r.code,n:0,ph:'closed',hid:HID});net.leave(r.down);net.leave(r.up);}
      rooms.splice(rooms.indexOf(r),1);saveCodes();if(r===cur)select(rooms[0]);else tabs();return;}
    const r=rooms[Number(t.dataset.room)];if(r&&r!==cur)select(r);
  });
  /* Put a room on screen: its settings and players in the setup panel, or its game on the big screen. */
  function select(r){
    cur=r;const g=r.game;
    r.lastFx=g.fx.reduce((a,f)=>Math.max(a,f.id),0);r.glowSeen=g.orbs.some(o=>o.k==='g');r.lastPlayPh=g.ph;r.lastCount=-1;r.lastTick=0;
    $('#code').textContent=r.code||'····';$('#qmsg').innerHTML=r.qMsg;showSettings();drawPlayers();
    const inGame=g.ph!=='lobby';
    $('#setup').classList.toggle('hidden',inGame);$('#stage').classList.toggle('hidden',!inGame);
    $('#end').classList.add('hidden');if(g.ph==='end')showEnd(r,true);
    if(!inGame){HA?.music(null);$('#hear').textContent='试听';}
    tabs();
  }

  /* ── Questions ── */
  const DEMO=[
    {text:'3 × 7 = ?',type:'mc',options:['21','24','18','27'],answer:[1]},
    {text:'水的化学式是？ Chemical formula of water?',type:'mc',options:['CO₂','H₂O','O₂','NaCl'],answer:[2]},
    {text:'太阳是一颗恒星。The Sun is a star.',type:'mc',options:['对 True','错 False'],answer:[1]},
    {text:'哪些是质数？ Which are prime numbers?',type:'multi',options:['2','9','11','15'],answer:[1,3]},
    {text:'12 ÷ 4 = ?',type:'fill',options:[],answer:[],accept:['3']},
    {text:'植物进行光合作用需要什么气体？ Which gas do plants take in for photosynthesis?',type:'mc',options:['氧气 Oxygen','二氧化碳 Carbon dioxide','氮气 Nitrogen','氢气 Hydrogen'],answer:[2]},
    {text:'(-3) + 8 = ?',type:'mc',options:['5','-5','11','-11'],answer:[1]},
    {text:'一个三角形的内角和是多少度？ Sum of angles in a triangle?',type:'mc',options:['90°','180°','270°','360°'],answer:[2]},
    {text:'声音在真空中可以传播。Sound can travel in a vacuum.',type:'mc',options:['对 True','错 False'],answer:[2]},
    {text:'2x = 10，x = ?',type:'fill',options:[],answer:[],accept:['5']},
    {text:'1 kg = ? g',type:'mc',options:['10','100','1000','10000'],answer:[3]},
    {text:'哪一个是哺乳动物？ Which is a mammal?',type:'mc',options:['鲨鱼 Shark','鲸鱼 Whale','青蛙 Frog','企鹅 Penguin'],answer:[2]}
  ];
  const imgSrc=img=>!img?'':img.url||(img.base64?`data:${img.type};base64,${img.base64}`:'');
  async function shrink(img){
    if(!img?.base64||!window.createImageBitmap)return imgSrc(img);
    try{const bmp=await createImageBitmap(await (await fetch(imgSrc(img))).blob()),k=Math.min(1,480/Math.max(bmp.width,bmp.height));
      const cv=document.createElement('canvas');cv.width=Math.round(bmp.width*k);cv.height=Math.round(bmp.height*k);
      const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.drawImage(bmp,0,0,cv.width,cv.height);return cv.toDataURL('image/jpeg',0.75);}
    catch{return imgSrc(img);}
  }
  const setQMsg=(r,html)=>{r.qMsg=html;if(r===cur)$('#qmsg').innerHTML=html;};
  async function useQuestions(r,list,label){
    r.game.setQuestions(list);
    r.pack=await Promise.all(list.map(async q=>({type:q.type,text:q.text,options:q.options||[],img:q.image?await shrink(q.image):''})));
    setQMsg(r,`✓ ${esc(label)}：${list.length} 题${list.some(q=>q.image)?'（有图片）':''}`);
    if(r===cur)drawPlayers();
  }
  $('#demo').onclick=()=>useQuestions(cur,DEMO,'示范题目');
  $('#file').onchange=async e=>{
    const file=e.target.files[0],r=cur;e.target.value='';if(!file)return;
    setQMsg(r,'读取中…');
    try{const res=window.LumiQuiz.parse(await window.ExcelWorkbook.read(file));
      if(res.errors.length){setQMsg(r,`<span class="err">${res.errors.slice(0,5).map(esc).join('<br>')}</span>`);return;}
      await useQuestions(r,res.questions,file.name.replace(/\.xlsx$/i,''));
      if(res.warnings.length)setQMsg(r,r.qMsg+`<br>${res.warnings.slice(0,3).map(esc).join('<br>')}`);
    }catch(err){setQMsg(r,`<span class="err">读不到这个文件：${esc(err.message||err)}</span>`);}
  };
  /* Send all questions (without answers) to the phones, in parts small enough for one message. */
  function sendPack(r){
    let part=[],size=0;const parts=[];
    r.pack.forEach((q,i)=>{const n=JSON.stringify(q).length;if(part.length&&size+n>60000){parts.push(part);part=[];size=0;}part.push([i,q]);size+=n;});
    if(part.length)parts.push(part);
    parts.forEach((items,i)=>setTimeout(()=>push(r,'q',{items}),i*200));
  }

  /* ── Settings of the room on screen ── */
  const TIMES=[3,5,7,9];
  function showSettings(){
    const g=cur.game,min=Math.round(g.limit/60000),timed=g.mode==='time';
    $('#teams').querySelectorAll('button').forEach(x=>x.classList.toggle('on',Number(x.dataset.n)===g.teams));
    $('#mode').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.m===g.mode));
    $('#targetRow').classList.toggle('hidden',timed);$('#target').value=g.target;
    $('#timeLabel').textContent=timed?'玩几分钟':'时间上限（分钟）';
    $('#time').querySelectorAll('button').forEach(x=>x.classList.toggle('on',Number(x.dataset.t)===min));
    $('#timeOther').value=TIMES.includes(min)?'':min;
    $('#modeHint').textContent=timed?`玩 ${min} 分钟，时间到分数最高的队赢。`:`先到 ${g.target} 分的队赢；${min} 分钟到了还没人到，就看分数。`;
    $('#items').querySelectorAll('button').forEach(x=>x.classList.toggle('on',(x.dataset.on==='1')===g.items));
  }
  $('#teams').onclick=e=>{const b=e.target.closest('[data-n]');if(!b)return;cur.game.setTeams(Number(b.dataset.n));showSettings();drawPlayers();};
  $('#mode').onclick=e=>{const b=e.target.closest('[data-m]');if(!b)return;cur.game.mode=b.dataset.m;showSettings();};
  $('#target').onchange=e=>{const v=Math.round(Number(e.target.value));cur.game.target=Number.isFinite(v)?G.clamp(v,5,200):C.TARGET;showSettings();};
  $('#time').onclick=e=>{const b=e.target.closest('[data-t]');if(!b)return;cur.game.limit=Number(b.dataset.t)*60000;showSettings();};
  $('#timeOther').onchange=e=>{const v=Math.round(Number(e.target.value));if(Number.isFinite(v)&&v>0)cur.game.limit=G.clamp(v,1,30)*60000;showSettings();};
  $('#items').onclick=e=>{const b=e.target.closest('[data-on]');if(!b)return;cur.game.items=itemsDefault=b.dataset.on==='1';try{localStorage.setItem('lumi-hook-items',itemsDefault?'1':'0');}catch{}showSettings();};
  // Sound: music + effects / effects only / silent, the music volume, and a quick listen. The same setting is in the game bar.
  const SOUND_TXT={all:'音乐＋音效',sfx:'只有音效',off:'静音'};
  const showSound=()=>{const m=HA?.mode||'all';$('#sound').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.m===m));$('#hsound').textContent=SOUND_TXT[m];};
  $('#sound').onclick=e=>{const b=e.target.closest('[data-m]');if(!b||!HA)return;HA.unlock();HA.mode=b.dataset.m;showSound();};
  $('#hsound').onclick=()=>{if(!HA)return;HA.unlock();HA.mode={all:'sfx',sfx:'off',off:'all'}[HA.mode];showSound();};
  $('#musicVol').value=Math.round(musicVol*100);
  $('#musicVol').oninput=e=>{musicVol=Number(e.target.value)/100;if(HA)HA.musicLevel=musicVol;try{localStorage.setItem('lumi-hook-music-vol',String(musicVol));}catch{}};
  $('#hear').onclick=()=>{if(!HA)return;HA.unlock();const on=HA.playing!=='main';HA.music(on?'main':null);$('#hear').textContent=on?'停':'试听';};
  showSound();

  /* ── Players ── */
  const addBots=n=>{const r=cur;for(let i=0;i<n&&r.game.players.size<30;i++){r.botN++;r.game.join('bot'+r.botN,'机器人 '+r.botN,true,Math.floor(Math.random()*G.ANIMALS.length));}drawPlayers();};
  $('#bot1').onclick=()=>addBots(1);$('#bot5').onclick=()=>addBots(5);
  $('#nobots').onclick=()=>{for(const p of [...cur.game.players.values()])if(p.bot)cur.game.kick(p.id);drawPlayers();};
  function drawPlayers(){
    const g=cur.game,list=[...g.players.values()],now=Date.now();
    $('#pcount').textContent=list.length?`· ${list.length} 人`:'';
    $('#players').innerHTML=list.length?`<div class="teams t${g.teams}">${Array.from({length:g.teams},(_,t)=>{const T=teamOf(t);return `<div class="team-col" style="--soft:${T.soft}"><h3 style="color:${T.ink}">${T.zh} ${T.en}</h3>
      ${list.filter(p=>p.team===t).map(p=>`<div class="chip ${!p.bot&&now-p.seen>6000?'off':''}"><img src="${G.animalIcon(p.av,32,p.team)}" alt=""><span>${esc(p.name)}</span><button data-kick="${esc(p.id)}" title="移除">✕</button></div>`).join('')||'<p class="empty">—</p>'}</div>`;}).join('')}</div>`
      :`<p class="empty">学生扫码、点房间 ${esc(cur.code)}、打名字以后就会出现在这里。也可以先加机器人试玩。</p>`;
    $('#players').querySelectorAll('[data-kick]').forEach(b=>b.onclick=()=>{g.kick(b.dataset.kick);drawPlayers();snapNow(cur);});
    const ready=g.qs.length&&list.length;$('#start').disabled=!ready;
    $('#startHint').textContent=!g.qs.length?'先选题目。':!list.length?'等玩家加入。':'';
  }
  setInterval(()=>{if(cur.game.ph==='lobby')drawPlayers();tabs();},1000);
  $('#start').onclick=()=>startGame(cur);

  /* ── Game ── */
  function startGame(r){
    r.game.start();sendPack(r);snapNow(r);G.sfx.unlock();$('#hear').textContent='试听';
    if(r===cur)select(r);
  }
  $('#pause').onclick=()=>{const g=cur.game;if(g.ph==='play')g.pause();else if(g.ph==='pause')g.resume();snapNow(cur);};
  $('#stop').onclick=()=>{const r=cur;if(r.game.ph==='end')return;if(confirm('现在结束这一局？')){r.game.stop();snapNow(r);}};
  function toLobby(r){r.game.toLobby();snapNow(r);if(r===cur)select(r);}
  function snapNow(r){r.lastSnap=performance.now();push(r,'snap',r.game.snapshot());}
  function showEnd(r,quiet){
    const g=r.game,e=g.end,win=e.win>=0?teamOf(e.win):null;
    // Top three stand on a little podium: 2nd, 1st, 3rd.
    const podium=[1,0,2].map(i=>e.players[i]&&[e.players[i],i]).filter(Boolean)
      .map(([row,i])=>`<div class="p${i+1}"><img src="${G.animalIcon(row[4],i?64:84,row[1])}" alt=""><span>${esc(row[0])}</span><b>${i+1}</b></div>`).join('');
    $('#end').innerHTML=`<div class="box"><p class="win-title" style="color:${win?win.ink:'#8d7f9c'}">${win?`${win.zh}赢了！`:'平手！'}</p>
      <p class="sub">${rooms.length>1?`房间 ${esc(r.code)} · `:''}${g.sc.slice(0,g.teams).map((v,i)=>`${teamOf(i).zh} ${v}`).join(' · ')} · ${e.reason==='time'?'时间到':e.reason==='stop'?'老师结束':`先到 ${g.target} 分`}</p>
      ${podium?`<div class="podium">${podium}</div>`:''}
      <table class="rank"><tr class="head"><td></td><td>名字</td><td>答对 / 答错</td></tr>${e.players.map((row,i)=>`<tr><td>${i+1}</td><td><img src="${G.animalIcon(row[4],26,row[1])}" alt="">${esc(row[0])}</td><td>✓ ${row[2]} · ✗ ${row[3]}</td></tr>`).join('')}</table>
      ${e.hard>=0?`<div class="hard">最多人答错的题（错 ${e.hardWrong} 次）<br><b>${esc(e.hardText)}</b></div>`:''}
      <div class="row actions"><button class="btn primary" id="again">再来一局</button><button class="btn" id="lobby">回到房间（换题目／分队）</button></div></div>`;
    $('#end').classList.remove('hidden');$('#again').onclick=()=>startGame(r);$('#lobby').onclick=()=>toLobby(r);
    if(!quiet){HA?.jingle(win?'win':'lose');if(win)G.confetti($('#end'));}
  }

  /* A teacher page forgotten in the background (hidden 10 minutes, room still empty) stops showing its room to students;
     it comes back as soon as the page is looked at again. */
  let hiddenSince=document.hidden?Date.now():0;
  document.addEventListener('visibilitychange',()=>{hiddenSince=document.hidden?Date.now():0;if(!hiddenSince)rooms.forEach(wake);});
  const asleep=r=>!!hiddenSince&&Date.now()-hiddenSince>10*60000&&r.game.ph==='lobby'&&!r.game.players.size;
  // Asleep, the room gives its number back (so another teacher page can use it without both hearing the same phones);
  // awake again, it takes its old number if still free, otherwise the next free one.
  function nap(r){if(r.sleeping||!r.code)return;r.sleeping=r.code;
    net.push(r.down,'closed',{});net.push('hook-lobby','room',{room:r.code,n:0,ph:'closed',hid:HID});net.leave(r.down);net.leave(r.up);
    r.code=r.down=r.up='';saveCodes();if(r===cur)$('#code').textContent='····';tabs();}
  function wake(r){if(!r.sleeping)return;const want=r.sleeping,used=inUse();r.sleeping='';openCode(r,used.has(want)?G.pickRoom(used):want);}
  if(local){window.__nap=()=>{hiddenSince=1;};window.__wake=()=>{hiddenSince=0;rooms.forEach(wake);};}   // test mode only
  /* A worker keeps every referee ticking even if this tab is behind another window. */
  let last=performance.now(),lastSweep=0;
  function step(){
    const now=performance.now();let dt=now-last;last=now;
    // The free plan's 100 messages a second are shared by all rooms: fewer snapshots as the total grows.
    const every=G.snapEvery(allPhones()),sweep=now-lastSweep>1000;if(sweep)lastSweep=now;
    for(const r of rooms){
      const g=r.game;let d=dt;
      while(d>0){const s=Math.min(d,50);g.tick(s);d-=s;}
      if(g.ph!==r.lastPh){r.lastPh=g.ph;if(g.ph==='end'&&r===cur)showEnd(r,false);snapNow(r);tabs();}
      if(now-r.lastSnap>=(g.ph==='play'||g.ph==='count'?every:1000))snapNow(r);
      if(asleep(r))nap(r);
      if(r.code&&now-r.lastAnnounce>2000){r.lastAnnounce=now;net.push('hook-lobby','room',{room:r.code,n:g.players.size,ph:g.ph,hid:HID});}
      // Students silent for 10 s have left: take them off (in a game they keep their team and score if they come back).
      if(sweep&&g.sweep()&&g.ph==='lobby'&&r===cur)drawPlayers();
    }
    if(now-rateAt>=2000){const rate=Math.round((sent+recv)/((now-rateAt)/1000)),el=$('#rate');
      el.textContent=`≈ ${rate} 条/秒（上限 100）`;el.style.color=rate>85?'#ff8a9c':'';sent=recv=0;rateAt=now;}
  }
  try{const w=new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)'],{type:'text/javascript'})));w.onmessage=step;}
  catch{setInterval(step,33);}

  /* ── Spectator view: the room on screen ── */
  const cv=$('#cv'),ctx=cv.getContext('2d');
  function resize(){const dpr=Math.min(2,devicePixelRatio||1);cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;}
  addEventListener('resize',resize);resize();
  function frame(){
    requestAnimationFrame(frame);
    if($('#stage').classList.contains('hidden'))return;
    const r=cur,game=r.game,t=game.t,hooked=new Set(game.hooks.map(h=>h.o));
    const players=[...game.players.values()].map(p=>({...p,fx:p.dx,fy:p.dy,mv:game.ph==='play'&&p.st===0&&!!(p.dx||p.dy)&&!hooked.has(p.id),sh:p.sh>t,x2:!!p.x2,tri:!!p.tri,slow:p.st===0&&game.slowed(p.id)}));
    const hooks=game.hooks.map(h=>{const tip=G.hookTip(h,t);return {o:h.o,x:h.x,y:h.y,tx:tip.x,ty:tip.y,team:game.players.get(h.o)?.team,caught:!!(h.orb||h.vic),vic:h.vic||0};});
    const orbs=[];for(const o of game.orbs){const at=game.orbAt(o);if(at)orbs.push({id:o.id,k:o.k,x:at.x,y:at.y,alpha:o.hk||o.by?1:Math.min(1,(t-o.b)/300),held:!!o.by,hooked:!!o.hk&&!o.by});}
    const rush=game.rush?Math.max(0,game.rush-t):0;
    G.render(ctx,innerWidth,innerHeight,cv.width/innerWidth,{tc:game.teams,t,players,orbs,hooks,drops:game.drops,shots:game.shots,zones:game.zones,spots:game.spots,rush,
      fx:game.fx.map(f=>({...f,age:t-f.at}))},performance.now(),64);
    // Sounds for card moves and the goldfish rush (the big screen is where the class watches).
    for(const f of game.fx)if(f.id>r.lastFx){r.lastFx=f.id;
      ({up:G.sfx.boom,shoot:G.sfx.shoot,ice:G.sfx.freeze,throw:G.sfx.fire,slime:G.sfx.slime,grab:G.sfx.grab,shield:G.sfx.shield,block:G.sfx.block,x2:G.sfx.power,tri:G.sfx.power,rush:G.sfx.rush}[f.k]||(()=>{}))();}
    // Music follows the game (the rock tune during a goldfish rush), ticking in the last 10 seconds, a sparkle for a glowing goldfish.
    HA?.music(game.ph==='play'||game.ph==='count'?(rush?'rush':'main'):null);
    if(game.ph==='play'&&r.lastPlayPh==='count')G.sfx.go();r.lastPlayPh=game.ph;
    const secs=(game.limit-t)/1000,n10=Math.ceil(secs);if(game.ph==='play'&&secs>0&&n10<=10&&n10!==r.lastTick){r.lastTick=n10;HA?.tick(n10);}
    const glow=game.orbs.some(o=>o.k==='g');if(glow&&!r.glowSeen&&game.ph==='play')G.sfx.glow();r.glowSeen=glow;
    const rt=rush?`金鱼潮 ×2 · ${Math.ceil(rush/1000)}`:'';if($('#rush').textContent!==rt){$('#rush').textContent=rt;$('#rush').classList.toggle('hidden',!rt);}
    const left=Math.max(0,(game.limit-t)/1000);
    const clock=game.ph==='pause'?'暂停中':`${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')} <small>${game.mode==='time'?'限时赛':`先到 ${game.target} 分`}</small>`;
    if($('#clock').innerHTML!==clock)$('#clock').innerHTML=clock;
    const sc=game.sc.slice(0,game.teams).map((v,i)=>{const T=teamOf(i);return `<div class="score" style="--tc:${T.color};--ti:${T.ink}">${v}<small>${T.zh}</small></div>`;}).join('');
    if($('#scores').innerHTML!==sc)$('#scores').innerHTML=sc;
    $('#pause').textContent=game.ph==='pause'?'继续':'暂停';
    const c3=$('#count3');
    if(game.ph==='count'){const n=Math.max(1,Math.ceil(game.cd/1000));c3.classList.remove('hidden');
      if(n!==r.lastCount){r.lastCount=n;c3.textContent=n;c3.classList.remove('bump');void c3.offsetWidth;c3.classList.add('bump');G.sfx.tick();}}
    else{c3.classList.add('hidden');r.lastCount=-1;}
  }

  /* ── Start: reopen this tab's rooms after a refresh, or take the first free number ── */
  let saved=[];try{saved=JSON.parse(sessionStorage.getItem('lumi-hook-codes')||'[]');const one=sessionStorage.getItem('lumi-hook-code');if(!saved.length&&one)saved=[one];}catch{}
  saved=saved.filter(c=>/^\d{4}$/.test(c)).slice(0,MAX_ROOMS);
  if(saved.length)saved.forEach(c=>newRoom(c));
  else{const r=newRoom(null);setTimeout(()=>openCode(r,G.pickRoom(inUse())),2300);}
  select(rooms[0]);
  requestAnimationFrame(frame);
  if(qp.has('demo'))useQuestions(rooms[0],DEMO,'示范题目');
  // Test mode only: lets a test script set up a situation (__hook = the game on screen).
  if(local){window.__rooms=rooms;Object.defineProperty(window,'__hook',{configurable:true,get:()=>cur.game});}
  // Run the newest version (only while every room is still empty, so a running game is never reloaded).
  const ver=G.freshen(()=>rooms.some(r=>r.game.players.size>0||r.game.ph!=='lobby'));if(ver)$('#ver').textContent='版本 '+ver;
})();
