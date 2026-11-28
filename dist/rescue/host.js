/* 星环防线 — the teacher's console. This computer is the referee: it runs the game, keeps the answers (phones never
   get them), checks every answer, decides every hit and sends snapshots to the phones. The big screen shows the ring. */
(()=>{
  'use strict';
  const R=window.RescueGame,C=R.C,qp=new URLSearchParams(location.search),local=qp.has('local');
  const net=local?R.createLocalNet():R.createNet(window.STUDYLOG_CLOUD||{});
  const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // This page's own id (kept across a refresh). Phones only listen to the page whose room they picked.
  const HID=(()=>{let h='';try{h=sessionStorage.getItem('lumi-rescue-hid')||'';}catch{}if(!/^[a-z0-9]{8}$/.test(h)){h=(Math.random().toString(36)+'00000000').slice(2,10);try{sessionStorage.setItem('lumi-rescue-hid',h);}catch{}}return h;})();
  const VER=document.querySelector('meta[name="rescue-version"]')?.content||'';
  R.pressFeedback();
  const RA=window.RescueAudio;let musicVol=0.55;
  try{const v=localStorage.getItem('lumi-rescue-music-vol');if(v!==null&&Number(v)>=0&&Number(v)<=1)musicVol=Number(v);}catch{}
  RA?.setup({key:'lumi-rescue-host-sound',music:musicVol});
  const game=R.createGame({check:(q,v)=>window.LumiQuiz.check(q,v)});
  try{const l=localStorage.getItem('lumi-rescue-len');if(C.LEN[l])game.len=l;}catch{}
  // Opened from the computer's folder (file://…): students still need the website address.
  const joinUrl=/^https?:$/.test(location.protocol)?new URL('./',location.href).href:'https://wsxworkstation.github.io/lumi/rescue/';
  $('#url').textContent=joinUrl.replace(/^https?:\/\//,'')+(local?'?local':'');
  const colorOf=p=>C.COLORS[p.col]||'#fff';

  /* ── The room ── */
  let code='',down='',up='',pack=[],botN=0,sent=0,recv=0,rateAt=performance.now(),lastSnap=0,dirty=false,lastAnnounce=0,lastPh='lobby',lastGid=0;
  const needAt=new Map();
  const phones=()=>{let n=0;for(const p of game.players.values())if(!p.bot&&!p.away)n++;return n;};
  // Supabase counts the message we send plus one for every phone that receives it.
  const push=(event,payload)=>{if(code&&net.push(down,event,payload))sent+=1+phones();};
  function openCode(c){
    if(code){net.leave(down);net.leave(up);}
    code=c;down=`rescue-${c}`;up=`rescue-${c}-u`;lastAnnounce=0;
    net.join(down,()=>{});net.join(up,onUp);
    try{sessionStorage.setItem('lumi-rescue-code',c);}catch{}
    $('#code').textContent=c;drawPlayers();
  }
  function onUp(ev,m){
    if(ev!=='u'||!m||!m.id)return;recv++;
    if(m.to&&m.to!==HID)return;   // a phone talking to another teacher page with the same room number
    if(m.k==='need'){const i=Number(m.q),at=needAt.get(i)||0;if(pack[i]&&performance.now()-at>800){needAt.set(i,performance.now());push('q',{items:[[i,pack[i]]],hid:HID});}return;}
    const before=game.players.size,p=game.input(m);
    if(p&&m.k!=='hi')dirty=true;
    if(game.ph==='lobby'&&(game.players.size!==before||m.k==='bye'||m.k==='join'))drawPlayers();
  }
  /* Room numbers start at 0001: listen for a moment, then take the smallest free one. A refresh keeps the number. */
  const others=new Map();
  const inUse=()=>new Set([...[...others].filter(([,o])=>Date.now()-o.at<6000&&o.ph!=='closed').map(([c])=>c),code].filter(Boolean));
  net.join('rescue-lobby',(ev,p)=>{
    if(ev!=='room'||!p?.room||p.hid===HID)return;const c=String(p.room);others.set(c,{ph:p.ph,at:Date.now()});
    if(c===code&&p.ph!=='closed'&&p.hid&&p.hid<HID&&!game.players.size&&game.ph==='lobby')openCode(R.pickRoom(inUse()));
  });
  setInterval(()=>{$('#netWarn').classList.toggle('hidden',net.downFor()<4000);},1000);
  addEventListener('beforeunload',()=>{if(code){net.push(down,'closed',{hid:HID});net.push('rescue-lobby','room',{room:code,n:0,ph:'closed',hid:HID});}});

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
    {text:'哪一个是哺乳动物？ Which is a mammal?',type:'mc',options:['鲨鱼 Shark','鲸鱼 Whale','青蛙 Frog','企鹅 Penguin'],answer:[2]},
    {text:'3x + 4 = 19，x = ?',type:'fill',options:[],answer:[],accept:['5']},
    {text:'一个正方形边长 6 cm，面积是？ Area of a square with side 6 cm?',type:'mc',options:['12 cm²','24 cm²','36 cm²','6 cm²'],answer:[3]},
    {text:'哪一个是导体？ Which one is a conductor?',type:'mc',options:['木头 Wood','铜 Copper','塑胶 Plastic','玻璃 Glass'],answer:[2]},
    {text:'(2³)² = ?',type:'mc',options:['32','64','12','36'],answer:[2]}
  ];
  const imgSrc=img=>!img?'':img.url||(img.base64?`data:${img.type};base64,${img.base64}`:'');
  async function shrink(img){
    if(!img?.base64||!window.createImageBitmap)return imgSrc(img);
    try{const bmp=await createImageBitmap(await (await fetch(imgSrc(img))).blob()),k=Math.min(1,520/Math.max(bmp.width,bmp.height));
      const cv=document.createElement('canvas');cv.width=Math.round(bmp.width*k);cv.height=Math.round(bmp.height*k);
      const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.drawImage(bmp,0,0,cv.width,cv.height);return cv.toDataURL('image/jpeg',0.75);}
    catch{return imgSrc(img);}
  }
  const setQMsg=html=>{$('#qmsg').innerHTML=html;};
  async function useQuestions(list,label){
    game.setQuestions(list);
    pack=await Promise.all(list.map(async q=>({type:q.type,text:q.text,options:q.options||[],img:q.image?await shrink(q.image):''})));
    setQMsg(`✓ ${esc(label)}：${list.length} 题${list.some(q=>q.image)?'（有图片）':''}${list.length<8?'<br>题目少的话会重复得比较快，建议 10 题以上。':''}`);
    drawPlayers();
  }
  $('#demo').onclick=()=>useQuestions(DEMO,'示范题目');
  $('#file').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    setQMsg('读取中…');
    try{const res=window.LumiQuiz.parse(await window.ExcelWorkbook.read(file));
      if(res.errors.length){setQMsg(`<span class="err">${res.errors.slice(0,5).map(esc).join('<br>')}</span>`);return;}
      await useQuestions(res.questions,file.name.replace(/\.xlsx$/i,''));
      if(res.warnings.length)$('#qmsg').innerHTML+=`<br>${res.warnings.slice(0,3).map(esc).join('<br>')}`;
    }catch(err){setQMsg(`<span class="err">读不到这个文件：${esc(err.message||err)}</span>`);}
  };
  /* Send all questions (without answers) to the phones, in parts small enough for one message. */
  function sendPack(){
    let part=[],size=0;const parts=[];
    pack.forEach((q,i)=>{const n=JSON.stringify(q).length;if(part.length&&size+n>60000){parts.push(part);part=[];size=0;}part.push([i,q]);size+=n;});
    if(part.length)parts.push(part);
    const gap=Math.max(200,Math.round((phones()+1)*1000/40));
    parts.forEach((items,i)=>setTimeout(()=>push('q',{items,hid:HID}),i*gap));
  }

  /* ── Settings ── */
  const showLen=()=>$('#len').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.l===game.len));
  $('#len').onclick=e=>{const b=e.target.closest('[data-l]');if(!b||game.ph!=='lobby')return;game.len=b.dataset.l;try{localStorage.setItem('lumi-rescue-len',game.len);}catch{}showLen();};
  showLen();
  const SOUND_TXT={all:'音乐＋音效',sfx:'只有音效',off:'静音'};
  const showSound=()=>{const m=RA?.mode||'all';$('#sound').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.m===m));$('#hsound').textContent=SOUND_TXT[m];};
  $('#sound').onclick=e=>{const b=e.target.closest('[data-m]');if(!b||!RA)return;RA.unlock();RA.mode=b.dataset.m;showSound();};
  $('#hsound').onclick=()=>{if(!RA)return;RA.unlock();RA.mode={all:'sfx',sfx:'off',off:'all'}[RA.mode];showSound();};
  $('#musicVol').value=Math.round(musicVol*100);
  $('#musicVol').oninput=e=>{musicVol=Number(e.target.value)/100;if(RA)RA.musicLevel=musicVol;try{localStorage.setItem('lumi-rescue-music-vol',String(musicVol));}catch{}};
  $('#hear').onclick=()=>{if(!RA)return;RA.unlock();const on=RA.playing!=='main';RA.music(on?'main':null);$('#hear').textContent=on?'停':'试听';};
  showSound();

  /* ── The defence team ── */
  const addBots=n=>{for(let i=0;i<n&&game.players.size<C.MAX_PLAYERS;i++){botN++;game.join('bot'+botN,'机器人 '+botN,{bot:true});}drawPlayers();dirty=true;};
  $('#bot1').onclick=()=>addBots(1);$('#bot5').onclick=()=>addBots(5);
  $('#nobots').onclick=()=>{for(const p of [...game.players.values()])if(p.bot)game.kick(p.id);drawPlayers();dirty=true;};
  function drawPlayers(){
    const list=[...game.players.values()].sort((a,b)=>a.seq-b.seq);
    $('#pcount').textContent=list.length?`· ${list.length} 人`:'';
    $('#players').innerHTML=list.length?`<div class="chips">${list.map(p=>`<div class="chip ${p.away?'off':''}" style="--c:${colorOf(p)}"><i></i><span>${esc(p.name)}</span>${p.lv?`<small>${esc(p.lv)}</small>`:''}<button data-kick="${esc(p.id)}" title="移除">✕</button></div>`).join('')}</div>`
      :`<p class="empty">学生扫码、点房间 ${esc(code||'····')}、点自己的名字以后就会出现在这里。也可以先加机器人试玩。</p>`;
    $('#players').querySelectorAll('[data-kick]').forEach(b=>b.onclick=()=>{game.kick(b.dataset.kick);drawPlayers();snapNow();});
    $('#start').disabled=!(game.qs.length&&list.length);
    $('#startHint').textContent=!game.qs.length?'先选题目。':!list.length?'等学生加入。':'';
  }
  setInterval(()=>{if(game.ph==='lobby')drawPlayers();},2000);
  $('#start').onclick=()=>startGame();

  /* ── Game ── */
  function startGame(){if(!game.start())return;sendPack();snapNow();RA?.unlock();$('#hear').textContent='试听';view();}
  $('#pause').onclick=()=>{if(game.ph==='pause')game.resume();else game.pause();snapNow();};
  $('#stop').onclick=()=>{if(game.ph==='end')return;if(confirm('现在结束这一局？')){game.stop();snapNow();}};
  function snapNow(){lastSnap=performance.now();dirty=false;const s=game.snapshot();s.hid=HID;push('snap',s);}
  function view(){
    const inGame=game.ph!=='lobby';
    $('#setup').classList.toggle('hidden',inGame);$('#stage').classList.toggle('hidden',!inGame);
    $('#end').classList.add('hidden');if(game.ph==='end')showEnd(true);
    if(!inGame){RA?.music(null);drawPlayers();showLast();}
  }
  function phaseChanged(was,ph){
    if(ph==='end'){showEnd(false);save();}
    else if(ph==='play'&&was==='count')R.sfx.go();
    if(ph==='lobby'||was==='lobby')view();
  }

  /* ── Results: stars, the class's numbers, the best shots, who broke the Meteor King, the hardest questions,
     and (for the teacher) everyone's own numbers. Kept on this computer (last 10 games) until saving to Lumi exists. ── */
  const TITLE=e=>({win:'陨石王被击碎了！星环守住了！',breach:'陨石王撞上星环……防线失守',lost:'星环被打穿了……防线失守',stop:'老师结束了这一局'}[e.outcome]);
  function showEnd(quiet){
    const e=game.end;if(!e)return;
    const real=e.players.filter(p=>!p.bot),pool=real.length?real:e.players;
    const best=pool.filter(p=>p.hits>0).sort((a,b)=>b.hits-a.hits||b.kills-a.kills).slice(0,3);
    const fin=e.players.find(p=>p.id===e.finisher);
    const stars=e.outcome==='stop'?'':`<p class="stars">${'★'.repeat(e.stars)}<span>${'★'.repeat(3-e.stars)}</span></p>`;
    const t=e.tally,acc=t.shots?Math.round(t.hits/t.shots*100):0;
    const sub=[`防线剩 ${e.hull}%`,`击碎 ${t.kills} 颗陨石`,`命中率 ${acc}%`,`全班答对 ${t.right} 题`].concat(e.outcome==='breach'?[`陨石王还剩 ${e.bossLeft}%`]:[]).join(' · ');
    const pct=p=>p.firstN?Math.round(p.firstOk/p.firstN*100)+'%':'—';
    $('#end').innerHTML=`<div class="box">${stars}<p class="win-title">${esc(TITLE(e))}</p><p class="sub">${sub}</p>
      ${fin?`<p class="finisher">最后一击 <b style="color:${colorOf(fin)}">${esc(fin.name)}</b></p>`:''}
      ${best.length?`<div class="helpers"><h3>命中最多</h3><div>${best.map((p,i)=>`<span style="--c:${colorOf(p)}"><em>${i+1}</em><b>${esc(p.name)}</b><small>命中 ${p.hits} · 击碎 ${p.kills}</small></span>`).join('')}</div></div>`:''}
      ${e.hard.length?`<div class="hard"><h3>最多人第一次答错的题</h3><ol>${e.hard.map(h=>`<li>${esc(h.text)}<small>第一次错 ${h.wrong}/${h.n} 人</small></li>`).join('')}</ol></div>`:''}
      <div class="row actions"><button class="btn primary" id="again">再来一局</button><button class="btn" id="lobby">回到房间（换题目）</button><button class="btn" id="mine">每个人的表现（老师看）</button></div>
      <div id="who" class="who hidden"><p class="msgs">第一次就答对＝每题第一次作答对了几题（最接近真实程度）；订正＝第一次错、后来答对的题；还不会＝第一次错、之后也没答对（题号）。机器人不列出。</p>
        <table><tr><th>名字</th><th>第一次就答对</th><th>一共答对</th><th>答错</th><th>订正</th><th>还不会的题</th><th>开枪</th><th>命中</th><th>击碎</th></tr>
        ${real.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<tr><td>${esc(p.name)}</td><td>${p.firstOk}/${p.firstN} <small>${pct(p)}</small>${p.firstN&&p.firstN<5?' <small class="few">资料少</small>':''}</td><td>${p.right}</td><td>${p.wrong}</td><td>${p.fixed}</td><td>${p.still.map(i=>i+1).join('、')||'—'}</td><td>${p.shots}</td><td>${p.hits}</td><td>${p.kills}</td></tr>`).join('')||'<tr><td colspan="9">（只有机器人）</td></tr>'}</table>
        <button class="btn" id="copy">复制表格（可贴到 Excel）</button><span class="msgs" id="copied"></span></div></div>`;
    $('#end').classList.remove('hidden');
    $('#again').onclick=()=>startGame();$('#lobby').onclick=()=>{game.toLobby();snapNow();view();};
    $('#mine').onclick=()=>$('#who').classList.toggle('hidden');
    $('#copy').onclick=async()=>{const tsv=R.resultTable(e);try{await navigator.clipboard.writeText(tsv);$('#copied').textContent='已复制';}
      catch{const ta=document.createElement('textarea');ta.value=tsv;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');$('#copied').textContent='已复制';}catch{}ta.remove();}};
    if(!quiet){RA?.music(null);if(e.outcome!=='stop')RA?.jingle(e.outcome==='win'?'win':'lose');}
  }
  function save(){
    const e=game.end;if(!e||e.outcome==='stop'&&!e.tally.right)return;
    try{const list=JSON.parse(localStorage.getItem('lumi-rescue-results')||'[]');
      list.push({at:Date.now(),game:'star-ring',room:code,outcome:e.outcome,stars:e.stars,questions:game.qs.map(q=>q.text),
        players:e.players.filter(p=>!p.bot).map(({bot,col,...p})=>p),hard:e.hard});
      localStorage.setItem('lumi-rescue-results',JSON.stringify(list.slice(-10)));}catch{}
  }
  function showLast(){
    let list=[];try{list=JSON.parse(localStorage.getItem('lumi-rescue-results')||'[]');}catch{}
    $('#lastResults').textContent=list.length?`这台电脑记着最近 ${list.length} 局的结果（之后会加「存进微光」）。`:'';
  }

  /* ── The referee keeps ticking even if this tab is behind another window (a worker drives it). ── */
  let last=performance.now(),lastSweep=0;
  function step(){
    const now=performance.now();let dt=Math.min(1000,now-last);last=now;
    while(dt>0){const s=Math.min(dt,50);game.tick(s);dt-=s;}
    if(game.ph!==lastPh){const was=lastPh;lastPh=game.ph;phaseChanged(was,game.ph);dirty=true;}
    if(game.id!==lastGid){lastGid=game.id;dirty=true;}   // a new meteor, bullet or effect: tell the phones soon
    const [minGap,every]=R.snapGaps(phones()),live=game.ph!=='lobby'&&game.ph!=='end';
    if((dirty&&now-lastSnap>=minGap)||now-lastSnap>=(live?every:1000))snapNow();
    if(code&&now-lastAnnounce>2000){lastAnnounce=now;net.push('rescue-lobby','room',{room:code,n:phones(),ph:game.ph,hid:HID,v:VER});}
    if(now-lastSweep>1000){lastSweep=now;if(game.sweep()){dirty=true;if(game.ph==='lobby')drawPlayers();}}
    if(now-rateAt>=2000){const rate=Math.round((sent+recv)/((now-rateAt)/1000)),el=$('#rate');
      el.textContent=`≈ ${rate} 条/秒`;el.style.color=rate>85?'#ff8a9c':'';sent=recv=0;rateAt=now;}
  }
  try{const w=new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)'],{type:'text/javascript'})));w.onmessage=step;}
  catch{setInterval(step,33);}

  /* ── The big screen ── */
  const cv=$('#cv'),ctx=cv.getContext('2d');
  function resize(){const dpr=Math.min(2,devicePixelRatio||1);cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;}
  addEventListener('resize',resize);resize();
  const mmss=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
  const setHtml=(el,h)=>{if(el.innerHTML!==h)el.innerHTML=h;};
  let lastFx=0,lastCount=-1,lastTick=0,lastBullet=0,laserAt=0;
  const SND={ring:'ring',gold:'gold',warn:'warn',king:'king'};
  function frame(){
    requestAnimationFrame(frame);
    if($('#stage').classList.contains('hidden'))return;
    const g=game,now=performance.now(),ph=g.ph==='pause'?g.paused:g.ph;
    window.RescueStage.render(ctx,innerWidth,innerHeight,cv.width/innerWidth,
      {ct:g.ct,hull:g.hull,st:g.stage,ms:g.ms,bs:g.bs,ps:[...g.players.values()].sort((a,b)=>a.seq-b.seq),fx:g.fx},now,{top:64});
    // sounds: bursts and the ring being hit; lasers (at most a few a second, the class shoots a lot)
    for(const f of g.fx)if(f.id>lastFx){lastFx=f.id;
      if(SND[f.k])R.sfx[SND[f.k]]();else if(f.k==='boom')R.sfx[f.w==='b'||f.w==='l'?'big':'boom']();else if(f.k==='hit'&&Math.random()<0.5)R.sfx.hit();}
    for(const b of g.bs)if(b.id>lastBullet){lastBullet=b.id;if(now-laserAt>140){laserAt=now;R.sfx.laser();}}
    RA?.music(g.ph==='play'||g.ph==='count'?(g.stage==='boss'||g.stage==='warn'?'boss':'main'):null);
    // the top bar
    setHtml($('#clock'),mmss(g.ct));
    const phase=g.ph==='pause'?'暂停中':ph==='count'?'准备':ph==='end'?'结束':g.stage==='boss'?'陨石王':g.stage==='warn'?'警报':g.ct<C.WARM?'练习瞄准':'防御中';
    setHtml($('#phase'),phase);
    const hull=$('#mHull');hull.querySelector('i').style.width=R.clamp(g.hull,0,100)+'%';hull.querySelector('b').textContent=Math.ceil(g.hull)+'%';
    hull.className='meter'+(g.hull<=30?' low':g.hull<=60?' mid':'');
    setHtml($('#score'),String(g.tally.kills));
    $('#pause').textContent=g.ph==='pause'?'继续':'暂停';
    // the Meteor King's health and how long until it reaches the ring
    const B=g.boss&&g.ms.includes(g.boss)?g.boss:null,bb=$('#boss');bb.classList.toggle('hidden',!B);
    if(B){bb.querySelector('i').style.width=(B.hp/B.max*100)+'%';setHtml($('#bossHp'),`${B.hp}/${B.max}`);setHtml($('#bossEta'),`撞击 ${mmss(B.t1-g.ct)}`);
      const n=Math.ceil((B.t1-g.ct)/1000);if(g.ph==='play'&&n<=10&&n>0&&n!==lastTick){lastTick=n;RA?.tick(n);}}
    let banner='';
    if(ph==='play'&&g.ct<C.WARM)banner='<b>练习瞄准</b> 手指拖动瞄准、放开发射 · 子弹打完就答题装弹';
    else if(g.stage==='warn')banner='<b>⚠ 警报</b> 陨石王正在接近星环！';
    setHtml($('#banner'),banner);$('#banner').classList.toggle('hidden',!banner);$('#banner').classList.toggle('hot',g.stage==='warn');
    const c3=$('#count3');
    if(g.ph==='count'){const n=Math.max(1,Math.ceil(g.cd/1000));c3.classList.remove('hidden');
      if(n!==lastCount){lastCount=n;c3.textContent=n;c3.classList.remove('bump');void c3.offsetWidth;c3.classList.add('bump');R.sfx.count();}}
    else{c3.classList.add('hidden');lastCount=-1;}
  }

  /* ── Start: reopen this tab's room after a refresh, or take the first free number ── */
  let saved='';try{saved=sessionStorage.getItem('lumi-rescue-code')||'';}catch{}
  if(/^\d{4}$/.test(saved))openCode(saved);else setTimeout(()=>openCode(R.pickRoom(inUse())),2300);
  drawPlayers();showLast();requestAnimationFrame(frame);
  if(qp.has('demo'))useQuestions(DEMO,'示范题目');
  if(local)Object.defineProperty(window,'__rescue',{configurable:true,get:()=>game});   // test mode only: lets a script set up a situation
  const busy=()=>game.players.size>0||game.ph!=='lobby'||game.qs.length;
  const showUpdate=v=>{const el=$('#update');if(!el||!v||v===VER)return;el.classList.remove('hidden');
    $('#updateBtn').onclick=()=>{if(game.ph!=='lobby'&&game.ph!=='end'&&!confirm('还有一局在进行，现在更新会结束它。继续？'))return;
      const q=new URLSearchParams(location.search);q.set('v',v);location.replace(location.pathname+'?'+q);};};
  const ver=R.freshen(busy,showUpdate);if(ver)$('#ver').textContent='版本 '+ver;
  if(!local)setInterval(()=>R.latestVersion().then(showUpdate),10*60000);
})();
