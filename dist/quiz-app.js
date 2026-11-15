/* Lumi student page: pick your form, tap your name, do the teacher's online practice.
   Every answer is checked in the cloud (students never receive the answers); a question must be right before the next one. */
(() => {
  'use strict';
  const cfg=window.STUDYLOG_CLOUD||{},root=document.querySelector('#quiz-app'),ME='lumi-student';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=()=>{try{return JSON.parse(localStorage.getItem(ME)||'null');}catch{return null;}};
  const save=v=>{try{v?localStorage.setItem(ME,JSON.stringify(v)):localStorage.removeItem(ME);}catch{}};
  async function rpc(name,body={}){
    const res=await fetch(`${cfg.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const json=await res.json().catch(()=>null);
    if(!res.ok)throw Error(json?.message||res.statusText);
    return json;
  }
  const brand=`<div class="brand"><img src="./assets/studylog-starloop-96.png" alt=""><div><b>微光 Lumi</b><small>线上练习 · Online practice</small></div></div>`;
  const show=html=>{root.innerHTML=brand+html;window.scrollTo(0,0);};
  const oops=(retry)=>{show(`<p class="empty">连不上网络，请再试一次。<br>Cannot connect. Please try again.</p><button class="go" id="retry">再试一次 Try again</button>`);root.querySelector('#retry').onclick=retry;};
  const sortLevels=(a,b)=>a.level.localeCompare(b.level,undefined,{numeric:true});
  let portal=[];

  async function start(){
    if(!cfg.url||!cfg.key){show('<p class="empty">还没有设置云端。</p>');return;}
    try{portal=(await rpc('lumi_portal')).sort(sortLevels);}catch{oops(start);return;}
    const me=read();
    if(me&&portal.some(p=>p.level===me.level&&p.students.some(s=>s.id===me.id)))return quizList();
    pickLevel();
  }
  function pickLevel(){
    if(!portal.length){show('<h1>现在没有练习</h1><p class="sub">老师发布练习后，这里就会出现。<br>No practice yet.</p>');return;}
    show(`<h1>你是哪一年级？</h1><p class="sub">Choose your form</p><div class="grid">${portal.map(p=>`<button class="tile" data-level="${esc(p.level)}">${esc(p.level)}</button>`).join('')}</div>`);
    root.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>pickName(b.dataset.level));
  }
  function pickName(level){
    const students=(portal.find(p=>p.level===level)?.students||[]).slice().sort((a,b)=>a.name.localeCompare(b.name));
    show(`<div class="top"><button class="link" id="back">← 年级 Form</button></div><h1>${esc(level)} · 点你的名字</h1><p class="sub">Tap your name</p><input class="search" id="find" placeholder="找名字 Search" autocomplete="off"><div class="list" id="names"></div>`);
    const box=root.querySelector('#names'),find=root.querySelector('#find');
    const draw=()=>{const k=find.value.trim().toLowerCase();const list=students.filter(s=>s.name.toLowerCase().includes(k));
      box.innerHTML=list.map(s=>`<button class="name" data-id="${esc(s.id)}">${esc(s.name)}</button>`).join('')||'<p class="empty">找不到这个名字，请问老师。</p>';
      box.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{const s=students.find(x=>x.id===b.dataset.id);save({level,id:s.id,name:s.name});quizList();});};
    find.oninput=draw;draw();
    root.querySelector('#back').onclick=pickLevel;
  }
  async function quizList(){
    const me=read();if(!me)return pickLevel();
    let list;try{list=await rpc('lumi_student_quizzes',{p_level:me.level,p_student:me.id});}catch{oops(quizList);return;}
    const due=d=>{if(!d)return '';const [,m,day]=d.split('-').map(Number);return ` · ${m} 月 ${day} 日要交`;};
    show(`<div class="top"><span>${esc(me.name)} · ${esc(me.level)}</span><button class="link" id="notme">不是我 Not me</button></div><h1>我的练习</h1><p class="sub">My practice</p>
      <div class="list">${list.map(q=>`<button class="card" data-id="${esc(q.id)}"><span><b>${esc(q.title)}</b><small>${q.count} 题${due(q.due)}</small></span><span class="pill ${q.done?'done':''}">${q.done?'✓ 完成':q.step?`${q.step}/${q.count}`:'开始'}</span></button>`).join('')||'<p class="empty">现在没有练习 🎉</p>'}</div>`);
    root.querySelector('#notme').onclick=()=>{save(null);pickLevel();};
    root.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openQuiz(b.dataset.id));
  }
  async function openQuiz(id){
    const me=read();let q;
    try{q=await rpc('lumi_quiz_start',{p_quiz:id,p_student:me.id});}catch{oops(()=>openQuiz(id));return;}
    if(q.done||q.step>=q.questions.length)return finished(q.title,true);
    ask(id,q,q.step);
  }
  function ask(id,quiz,step){
    const me=read(),qs=quiz.questions,item=qs[step],total=qs.length;
    const letter=i=>'ABCDE'[i];
    const body=item.type==='fill'
      ?`<input class="fill" id="fill" autocomplete="off" placeholder="写答案 Your answer"><button class="go" id="send">确定 Check</button>`
      :`<div class="opts">${item.options.map((o,i)=>`<button class="opt" data-n="${i+1}"><span class="k">${letter(i)}</span><span>${esc(o)}</span></button>`).join('')}</div>${item.type==='multi'?'<button class="go" id="send" disabled>确定 Check</button>':''}`;
    show(`<div class="top"><button class="link" id="back">← 我的练习</button><small>${step+1} / ${total}</small></div><div class="bar"><i style="width:${step/total*100}%"></i></div>
      <p class="q">${esc(item.text)}</p>${item.image?`<img class="q-img" src="${esc(item.image)}" alt="">`:''}${item.type==='multi'?'<p class="sub">选出全部正确答案 Choose all correct answers</p>':''}${body}<p class="msg" id="msg"></p>`);
    root.querySelector('#back').onclick=quizList;
    const msg=root.querySelector('#msg');let busy=false;
    async function submit(answer,els){
      if(busy)return;busy=true;msg.textContent='';msg.className='msg';
      let r;try{r=await rpc('lumi_quiz_answer',{p_quiz:id,p_student:me.id,p_answer:answer});}catch{busy=false;msg.textContent='连不上，请再按一次。';msg.className='msg no';return;}
      if(r.correct){
        els.forEach(e=>e.classList.add('right'));msg.textContent='答对了！Correct!';msg.className='msg yes';
        root.querySelectorAll('.opt,.fill,#send').forEach(e=>e.disabled=true);
        setTimeout(()=>r.done||r.step>=total?finished(quiz.title,false):ask(id,quiz,r.step),700);
      }else{
        els.forEach(e=>{e.classList.remove('wrong');void e.offsetWidth;e.classList.add('wrong');});
        msg.textContent='再想想 🙂 Try again';msg.className='msg no';
        if(item.type==='mc')els.forEach(e=>e.disabled=true);
        busy=false;
      }
    }
    if(item.type==='fill'){
      const box=root.querySelector('#fill'),go=()=>box.value.trim()&&submit(box.value,[box]);
      root.querySelector('#send').onclick=go;box.onkeydown=e=>{if(e.key==='Enter')go();};box.focus();
    }else if(item.type==='multi'){
      const send=root.querySelector('#send'),opts=[...root.querySelectorAll('.opt')];
      opts.forEach(b=>b.onclick=()=>{b.classList.toggle('sel');b.classList.remove('wrong');send.disabled=!opts.some(o=>o.classList.contains('sel'));});
      send.onclick=()=>{const sel=opts.filter(o=>o.classList.contains('sel'));submit(sel.map(o=>Number(o.dataset.n)),sel);};
    }else{
      root.querySelectorAll('.opt').forEach(b=>b.onclick=()=>submit([Number(b.dataset.n)],[b]));
    }
  }
  function finished(title,already){
    show(`<div class="done-box"><div class="big">🎉</div><h1>${already?'这份已经完成了':'全部答对！'}</h1><p class="sub">${esc(title)}<br>功课已经交给老师了。Your homework is handed in.</p><button class="go" id="more">回到我的练习 Back</button></div>`);
    root.querySelector('#more').onclick=quizList;
  }
  start();
})();
