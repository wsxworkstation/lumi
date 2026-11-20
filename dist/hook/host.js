/* Hook Rush — the teacher's console. This computer is the referee: it runs the game, keeps the answers
   (phones never get them), checks every answer, and sends a snapshot to all phones 4 times a second. */
(()=>{
  'use strict';
  const G=window.HookGame,C=G.C,qp=new URLSearchParams(location.search),local=qp.has('local');
  const net=local?G.createLocalNet():G.createNet(window.STUDYLOG_CLOUD||{});
  const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const teamOf=i=>C.TEAMS[i]||C.TEAMS[0];
  let code;try{code=sessionStorage.getItem('lumi-hook-room');}catch{}
  if(!code){code=String(1000+Math.floor(Math.random()*9000));try{sessionStorage.setItem('lumi-hook-room',code);}catch{}}
  const down=`hook-${code}`,up=`hook-${code}-u`;
  const game=G.createGame({check:(q,v)=>window.LumiQuiz.check(q,v)});
  let pack=[],botN=0,lastSnap=0,lastAnnounce=0,lastPh='lobby',sent=0,recv=0,rateAt=performance.now(),needAt=new Map();

  $('#code').textContent=code;
  const joinUrl=new URL('./',location.href).href.replace(/\/host\.html.*$/,'/');
  $('#url').textContent=joinUrl.replace(/^https?:\/\//,'')+(local?'?local':'');

  /* ── Network ── */
  const phones=()=>{let n=0;for(const p of game.players.values())if(!p.bot)n++;return n;};
  // Supabase counts the message we send plus one for every phone that receives it.
  const push=(event,payload)=>{if(net.push(down,event,payload))sent+=1+phones();};
  net.join(down,()=>{});
  net.join('hook-lobby',()=>{});
  net.join(up,(ev,m)=>{
    if(ev!=='u'||!m||!m.id)return;recv++;
    if(m.k==='need'){const i=Number(m.q),at=needAt.get(i)||0;if(pack[i]&&performance.now()-at>800){needAt.set(i,performance.now());push('q',{items:[[i,pack[i]]]});}return;}
    const before=game.players.size,p=game.input(m);
    if(m.k==='join'&&p&&game.players.size!==before)drawPlayers();
  });
  // If this computer can't reach the server, students never see the room. Say so instead of looking fine.
  setInterval(()=>{$('#netWarn').classList.toggle('hidden',net.downFor()<4000);},1000);
  addEventListener('beforeunload',()=>{net.push(down,'closed',{});net.push('hook-lobby','room',{room:code,n:0,ph:'closed'});});

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
  async function useQuestions(list,label){
    game.setQuestions(list);
    pack=await Promise.all(list.map(async q=>({type:q.type,text:q.text,options:q.options||[],img:q.image?await shrink(q.image):''})));
    $('#qmsg').innerHTML=`✓ ${esc(label)}：${list.length} 题${list.some(q=>q.image)?'（有图片）':''}`;
    drawPlayers();
  }
  $('#demo').onclick=()=>useQuestions(DEMO,'示范题目');
  $('#file').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    $('#qmsg').textContent='读取中…';
    try{const r=window.LumiQuiz.parse(await window.ExcelWorkbook.read(file));
      if(r.errors.length){$('#qmsg').innerHTML=`<span class="err">${r.errors.slice(0,5).map(esc).join('<br>')}</span>`;return;}
      await useQuestions(r.questions,file.name.replace(/\.xlsx$/i,''));
      if(r.warnings.length)$('#qmsg').innerHTML+=`<br>${r.warnings.slice(0,3).map(esc).join('<br>')}`;
    }catch(err){$('#qmsg').innerHTML=`<span class="err">读不到这个文件：${esc(err.message||err)}</span>`;}
  };
  /* Send all questions (without answers) to the phones, in parts small enough for one message. */
  function sendPack(){
    let part=[],size=0;const parts=[];
    pack.forEach((q,i)=>{const n=JSON.stringify(q).length;if(part.length&&size+n>60000){parts.push(part);part=[];size=0;}part.push([i,q]);size+=n;});
    if(part.length)parts.push(part);
    parts.forEach((items,i)=>setTimeout(()=>push('q',{items}),i*200));
  }

  /* ── Lobby ── */
  $('#teams').onclick=e=>{const b=e.target.closest('[data-n]');if(!b)return;$('#teams').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));game.setTeams(Number(b.dataset.n));drawPlayers();};
  $('#target').onchange=e=>{const v=Math.round(Number(e.target.value));game.target=Number.isFinite(v)?G.clamp(v,5,200):C.TARGET;e.target.value=game.target;};
  const addBots=n=>{for(let i=0;i<n&&game.players.size<30;i++)game.join('bot'+(++botN),'机器人 '+botN,true,Math.floor(Math.random()*G.ANIMALS.length));drawPlayers();};
  $('#bot1').onclick=()=>addBots(1);$('#bot5').onclick=()=>addBots(5);
  $('#nobots').onclick=()=>{for(const p of [...game.players.values()])if(p.bot)game.kick(p.id);drawPlayers();};
  function drawPlayers(){
    const list=[...game.players.values()],now=Date.now();
    $('#pcount').textContent=list.length?`· ${list.length} 人`:'';
    $('#players').innerHTML=list.length?`<div class="teams t${game.teams}">${Array.from({length:game.teams},(_,t)=>{const T=teamOf(t);return `<div class="team-col" style="--soft:${T.soft}"><h3 style="color:${T.ink}">${T.zh} ${T.en}</h3>
      ${list.filter(p=>p.team===t).map(p=>`<div class="chip ${!p.bot&&now-p.seen>12000?'off':''}"><img src="${G.animalIcon(p.av,32,p.team)}" alt=""><span>${esc(p.name)}</span><button data-kick="${esc(p.id)}" title="移除">✕</button></div>`).join('')||'<p class="empty">—</p>'}</div>`;}).join('')}</div>`
      :'<p class="empty">学生扫码、打名字以后就会出现在这里。也可以先加机器人试玩。</p>';
    $('#players').querySelectorAll('[data-kick]').forEach(b=>b.onclick=()=>{game.kick(b.dataset.kick);drawPlayers();snapNow();});
    const ready=game.qs.length&&list.length;$('#start').disabled=!ready;
    $('#startHint').textContent=!game.qs.length?'先选题目。':!list.length?'等玩家加入。':'';
  }
  setInterval(()=>{if(game.ph==='lobby')drawPlayers();},3000);
  $('#start').onclick=()=>startGame();

  /* ── Game ── */
  function startGame(){
    game.start();sendPack();snapNow();
    $('#setup').classList.add('hidden');$('#stage').classList.remove('hidden');$('#end').classList.add('hidden');G.sfx.unlock();
  }
  $('#pause').onclick=()=>{if(game.ph==='play')game.pause();else if(game.ph==='pause')game.resume();snapNow();};
  $('#stop').onclick=()=>{if(game.ph==='end')return;if(confirm('现在结束这一局？')){game.stop();snapNow();}};
  function toLobby(){game.toLobby();snapNow();$('#stage').classList.add('hidden');$('#setup').classList.remove('hidden');drawPlayers();}
  function snapNow(){lastSnap=performance.now();push('snap',game.snapshot());}
  function showEnd(){
    const e=game.end,win=e.win>=0?teamOf(e.win):null;
    // Top three stand on a little podium: 2nd, 1st, 3rd.
    const podium=[1,0,2].map(i=>e.players[i]&&[e.players[i],i]).filter(Boolean)
      .map(([r,i])=>`<div class="p${i+1}"><img src="${G.animalIcon(r[4],i?64:84,r[1])}" alt=""><span>${esc(r[0])}</span><b>${i+1}</b></div>`).join('');
    $('#end').innerHTML=`<div class="box"><p class="win-title" style="color:${win?win.ink:'#8d7f9c'}">${win?`${win.zh}赢了！`:'平手！'}</p>
      <p class="sub">${game.sc.slice(0,game.teams).map((v,i)=>`${teamOf(i).zh} ${v}`).join(' · ')} · ${e.reason==='time'?'时间到':e.reason==='stop'?'老师结束':`先到 ${game.target} 分`}</p>
      ${podium?`<div class="podium">${podium}</div>`:''}
      <table class="rank"><tr class="head"><td></td><td>名字</td><td>答对 / 答错</td></tr>${e.players.map((r,i)=>`<tr><td>${i+1}</td><td><img src="${G.animalIcon(r[4],26,r[1])}" alt="">${esc(r[0])}</td><td>✓ ${r[2]} · ✗ ${r[3]}</td></tr>`).join('')}</table>
      ${e.hard>=0?`<div class="hard">最多人答错的题（错 ${e.hardWrong} 次）<br><b>${esc(e.hardText)}</b></div>`:''}
      <div class="row actions"><button class="btn primary" id="again">再来一局</button><button class="btn" id="lobby">回到房间（换题目／分队）</button></div></div>`;
    $('#end').classList.remove('hidden');$('#again').onclick=startGame;$('#lobby').onclick=toLobby;G.sfx.win();
    if(win)G.confetti($('#end'));
  }

  /* A worker keeps the referee ticking even if this tab is behind another window. */
  let last=performance.now();
  function step(){
    const now=performance.now();let dt=now-last;last=now;
    while(dt>0){const d=Math.min(dt,50);game.tick(d);dt-=d;}
    if(game.ph!==lastPh){if(game.ph==='end')showEnd();lastPh=game.ph;snapNow();}
    const every=game.ph==='play'||game.ph==='count'?G.snapEvery(phones()):1000;
    if(now-lastSnap>=every)snapNow();
    if(now-lastAnnounce>2000){lastAnnounce=now;net.push('hook-lobby','room',{room:code,n:game.players.size,ph:game.ph});}
    if(now-rateAt>=2000){const r=Math.round((sent+recv)/((now-rateAt)/1000)),el=$('#rate');
      el.textContent=`≈ ${r} 条/秒（上限 100）`;el.style.color=r>85?'#ff8a9c':'';sent=recv=0;rateAt=now;}
  }
  try{const w=new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)'],{type:'text/javascript'})));w.onmessage=step;}
  catch{setInterval(step,33);}

  /* ── Spectator view ── */
  const cv=$('#cv'),ctx=cv.getContext('2d');
  function resize(){const dpr=Math.min(2,devicePixelRatio||1);cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;}
  addEventListener('resize',resize);resize();
  let lastCount=-1;
  function frame(){
    requestAnimationFrame(frame);
    if($('#stage').classList.contains('hidden'))return;
    const t=game.t,hooked=new Set(game.hooks.map(h=>h.o));
    const players=[...game.players.values()].map(p=>({...p,fx:p.dx,fy:p.dy,mv:game.ph==='play'&&p.st===0&&!!(p.dx||p.dy)&&!hooked.has(p.id)}));
    const hooks=game.hooks.map(h=>{const tip=G.hookTip(h,t);return {o:h.o,x:h.x,y:h.y,tx:tip.x,ty:tip.y,team:game.players.get(h.o)?.team,caught:!!h.orb};});
    const orbs=[];for(const o of game.orbs){const at=game.orbAt(o);if(at)orbs.push({id:o.id,k:o.k,x:at.x,y:at.y,alpha:o.hk||o.by?1:Math.min(1,(t-o.b)/300),held:!!o.by,hooked:!!o.hk&&!o.by});}
    G.render(ctx,innerWidth,innerHeight,cv.width/innerWidth,{tc:game.teams,players,orbs,hooks},performance.now(),64);
    const left=Math.max(0,(game.limit-t)/1000);
    const clock=game.ph==='pause'?'暂停中':`${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')} <small>先到 ${game.target} 分</small>`;
    if($('#clock').innerHTML!==clock)$('#clock').innerHTML=clock;
    const sc=game.sc.slice(0,game.teams).map((v,i)=>{const T=teamOf(i);return `<div class="score" style="--tc:${T.color};--ti:${T.ink}">${v}<small>${T.zh}</small></div>`;}).join('');
    if($('#scores').innerHTML!==sc)$('#scores').innerHTML=sc;
    $('#pause').textContent=game.ph==='pause'?'继续':'暂停';
    const c3=$('#count3');
    if(game.ph==='count'){const n=Math.max(1,Math.ceil(game.cd/1000));c3.classList.remove('hidden');
      if(n!==lastCount){lastCount=n;c3.textContent=n;c3.classList.remove('bump');void c3.offsetWidth;c3.classList.add('bump');G.sfx.tick();}}
    else{c3.classList.add('hidden');lastCount=-1;}
  }
  requestAnimationFrame(frame);
  drawPlayers();
  if(qp.has('demo'))useQuestions(DEMO,'示范题目');
  // Run the newest version (only while the room is still empty, so a running game is never reloaded).
  const ver=G.freshen(()=>game.players.size>0||game.ph!=='lobby');if(ver)$('#ver').textContent='版本 '+ver;
})();
