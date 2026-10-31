/* Lumi (微光) student learning tracker. No real accounts or remote database; all records are fictional. */
(() => {
  'use strict';
  const C=StudyCore, KEY='studylog-demo-v1', IMPORT_BACKUP_KEY='studylog-import-backup-v1';
  let data, storageOK=true;
  try { data=JSON.parse(localStorage.getItem(KEY))||C.seed(); if(data.version!==1)throw Error('version'); }
  catch { data=C.seed(); }
  data.imports??=[];
  data.classes.forEach((c,i)=>c.code??=`C${c.year||2027}-${String(i+1).padStart(3,'0')}`);
  data.activities.forEach((a,i)=>a.recordCode??=`REC-${String(i+1).padStart(4,'0')}`);
  data.goals.forEach((g,i)=>g.goalCode??=`GOAL-${String(i+1).padStart(3,'0')}`);
  const state={month:'',focusStudentId:'',page:'overview',year:2027,classId:'c1',studentId:'s1',activityId:'',kind:'homework',lang:'zh',tab:'progress',filter:'all',examFilter:'all',search:'',importPlan:null,importFile:''};
  const VIEW_KEY='studylog-view-v1';
  let undoAction=null,restoredView=false;
  try{
    const view=JSON.parse(localStorage.getItem(VIEW_KEY)||'null');
    if(view&&['overview','records','imports','students','student','classes','groups','goals','settings','trash'].includes(view.page)){
      for(const key of ['classId','studentId','activityId','focusStudentId'])if(typeof view[key]==='string')state[key]=view[key];
      state.page=view.page;state.year=Number.isInteger(view.year)?view.year:2027;
      state.kind=view.kind==='exam'?'exam':'homework';state.lang=view.lang==='en'?'en':'zh';
      state.month=/^(0[1-9]|1[0-2])$/.test(view.month)?view.month:'';
      state.scrollY=Number.isFinite(view.scrollY)?Math.max(0,view.scrollY):0;restoredView=true;
    }
  }catch{}
  const app=document.querySelector('#app'),modal=document.querySelector('#modal');
  const t=(zh,en)=>state.lang==='zh'?zh:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=o=>!o?'—':state.lang==='en'?(o.en||o.name||o.title):(o.name||o.title);
  const num=n=>n===null||n===undefined?'—':Math.round(n);
  const percent=n=>n===null||n===undefined?'—':`${Math.round(n)}%`;
  const statuses={submitted:['已交','Submitted'],missing:['未交','Missing'],late:['迟交','Late'],makeup:['补交','Made up'],unrecorded:['未记录','Not recorded'],absent:['缺席','Absent'],recorded:['已记录','Recorded']};
  const statusText=s=>t(...(statuses[s]||statuses.unrecorded));
  const goalText=s=>s==='achieved'?t('已达成','Achieved'):s==='paused'?t('暂停','Paused'):t('进行中','In progress');
  const typeName=k=>({homework:t('功课','Homework'),tuition:t('补习考试','Tuition exam'),school:t('学校考试','School exam'),quiz:t('小考','Quiz')})[k]||k;
  const icons={
    book:'<path d="M3 5c4-2 7-1 9 1 2-2 5-3 9-1v14c-4-2-7-1-9 1-2-2-5-3-9-1z"/><path d="M12 6v14"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    check:'<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M9 3h6M8 12l3 3 5-6"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    chart:'<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
    down:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    leaf:'<path d="M19 3C6 3 2 10 6 16c5 6 14 1 13-13ZM5 21l10-12"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 6v1"/>',
    back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
    edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>',
    restore:'<path d="M3 10a9 9 0 1 1 1 8M3 3v7h7"/>'
    ,upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 15v6h16v-6"/>'
    ,group:'<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20v-1a5 5 0 0 1 10 0v1M12 20v-1a5 5 0 0 1 10 0v1"/>'
    ,moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>'
    ,sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  };
  const icon=n=>`<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n]||icons.book}</svg>`;
  const button=(text,action,classes='',attrs='',ico='')=>`<button class="btn ${classes}" data-action="${action}" ${attrs}>${ico?icon(ico):''}${text}</button>`;
  const badge=(text,color='')=>`<span class="badge ${color}">${esc(text)}</span>`;
  const avatar=(s,i=0)=>`<span class="avatar tint${i%4}">${esc(state.lang==='en'?(s.en||s.name).slice(0,1):s.name.slice(-2))}</span>`;
  const cls=()=>data.classes.find(c=>c.id===state.classId&&!c.archived);
  const classes=()=>data.classes.filter(c=>!c.archived&&c.year===state.year);
  const roster=()=>data.students.filter(s=>!s.archived&&cls()?.students.includes(s.id));
  const student=id=>data.students.find(s=>s.id===id);
  const acts=(kind)=>data.activities.filter(a=>!a.archived&&a.classId===state.classId&&a.date.startsWith(String(state.year))&&(!kind||a.kind===kind)).sort((a,b)=>a.date.localeCompare(b.date));
  const latest=()=>acts().filter(a=>a.kind!=='homework'&&a.kind!=='quiz').at(-1);
  const stat=sid=>C.homeworkStats(data,state.classId,state.year,sid,state.month||undefined,C.periodEnd(state.year,state.month));
  const empty=(msg,act='')=>`<div class="empty">${icon('leaf')}<p>${msg}</p>${act}</div>`;
  function saveView(){
    try{localStorage.setItem(VIEW_KEY,JSON.stringify({page:state.page,year:state.year,classId:state.classId,studentId:state.studentId,activityId:state.activityId,kind:state.kind,lang:state.lang,month:state.month,focusStudentId:state.focusStudentId,scrollY:window.scrollY||0}));}catch{}
  }
  const saveText=()=>window.StudyCloud?StudyCloud.label(state.lang):storageOK?t('已保存 · 此浏览器','Saved · this browser'):t('保存失败','Not saved');
  function savedIndicator(){
    const message=document.querySelector('#save-message');if(message){message.textContent=saveText();if(message.parentElement)message.parentElement.dataset.state=window.StudyCloud?.state||'';}
    const undo=document.querySelector('#undo-last');if(undo)undo.hidden=!undoAction;
  }
  function applyResults(a,patches,key=''){
    const copy={...data,activities:[{...a,results:structuredClone(a.results)}],history:[]};
    patches.forEach(p=>C.updateResult(copy,a.id,p.sid,p.patch));
    const updated=copy.activities.find(x=>x.id===a.id);
    const changed=patches.filter(p=>JSON.stringify(a.results[p.sid])!==JSON.stringify(updated.results[p.sid]));
    if(!changed.length)return;
    const before=Object.fromEntries(changed.map(p=>[p.sid,structuredClone(a.results[p.sid]||{status:'unrecorded',score:null,note:''})]));
    if(!(key&&undoAction?.key===key&&undoAction.activityId===a.id))undoAction={activityId:a.id,before,key};
    changed.forEach(p=>{a.results[p.sid]=updated.results[p.sid];});data.history.unshift(...copy.history);persist();
  }
  function undoLast(){
    const action=undoAction;if(!action)return;
    const a=data.activities.find(a=>a.id===action.activityId&&!a.archived);if(!a){undoAction=null;savedIndicator();return;}
    if(action.metadata)C.editActivity(data,a.id,action.metadata);
    else for(const [sid,before] of Object.entries(action.before)){C.updateResult(data,a.id,sid,before);a.results[sid]=structuredClone(before);}
    undoAction=null;persist();render();toast(t('已撤销','Undone'));
  }
  function persist() {
    const json=JSON.stringify(data);
    try{localStorage.setItem(KEY,json);storageOK=true;}catch{storageOK=false;if(!window.StudyCloud)toast(t('浏览器存储失败，请导出 JSON 备份。','Storage failed. Export a JSON backup.'));}
    window.StudyCloud?.changed(json);
    saveView();savedIndicator();
  }
  function toast(msg){const el=document.querySelector('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3300);}
  function go(page){state.page=page;state.search='';state.filter='all';state.focusStudentId='';render();window.scrollTo({top:0,behavior:'instant'});}
  function selectClass(id){state.classId=id;state.activityId='';state.search='';state.filter='all';state.focusStudentId='';const first=roster()[0];if(first&&!cls().students.includes(state.studentId))state.studentId=first.id;render();}
  function normalize(){
    if(!classes().some(c=>c.id===state.classId))state.classId=classes()[0]?.id||'';
    if(state.page==='student'&&(!cls()||!cls().students.includes(state.studentId)||student(state.studentId)?.archived)) {
      if(roster().length)state.studentId=roster()[0].id;else state.page='students';
    }
  }
  function nav(page,name,en,ico){return `<a href="#${page}" class="nav-item ${state.page===page?'active':''}" data-page="${page}">${icon(ico)}<span>${t(name,en)}</span>${page==='classes'?`<span class="nav-count">${classes().length}</span>`:''}</a>`;}
  function shell(){
    const names={groups:t('分组','Groups'),overview:t('学习概览','Overview'),records:t('快速录入','Quick entry'),imports:t('Excel 导入','Excel import'),students:t('学生档案','Students'),classes:t('我的班级','Classes'),goals:t('学习目标','Goals'),settings:t('设置','Settings'),trash:t('回收站','Recycle bin')};
    const years=[...new Set([2026,2027,2028,2029,state.year,...data.classes.map(c=>c.year)])].sort();
    return `<div class="mobile-overlay" data-action="menu"></div><aside class="sidebar">
      <a class="brand row" href="#overview" data-page="overview"><span class="brand-mark starloop-brand"><img src="./assets/studylog-starloop-96.png" width="44" height="44" alt=""></span><div><strong>${t('微光','Lumi')}</strong><small>${t('LUMI','LEARNING JOURNAL')}</small></div></a>
      <nav>${nav('overview','班级工作台','Workspace','grid')}${nav('records','功课与成绩','Records','check')}${nav('students','学生','Students','users')}${nav('classes','班级','Classes','book')}
      <details class="more-nav" ${['imports','goals','settings','trash'].includes(state.page)?'open':''}><summary>${t('更多','More')}</summary>${nav('imports','批量导入','Import','upload')}${nav('goals','目标','Goals','target')}${nav('settings','设置','Settings','settings')}${nav('trash','回收站','Recycle bin','trash')}</details></nav>
      <div class="sidebar-bottom"><p class="help" style="margin-bottom:16px">${window.StudyCloud?t('资料同步到云端','Synced to the cloud'):t('资料保存在此浏览器','Saved in this browser')}</p>
      <div class="profile row"><span class="avatar">J</span><div><h3>${t('我的工作台','My workspace')}</h3><p class="tiny muted">${t('老师 / 管理员','Teacher / Admin')}</p></div></div></div>
      </aside><main class="main"><header class="topbar"><button class="icon-btn mobile-menu" data-action="menu" aria-label="${t('打开菜单','Open menu')}">${icon('menu')}</button><div class="breadcrumb">Workspace <span>/　${names[state.page]||names.students}</span></div>
      <div class="top-actions"><span class="saved" data-state="${window.StudyCloud?.state||''}"><i class="dot"></i><span id="save-message">${saveText()}</span></span><button id="undo-last" class="btn sm" data-action="undo-last" ${undoAction?'':'hidden'}>${t('撤销','Undo')}</button><select id="year-select" aria-label="${t('年份','Year')}">${years.map(y=>`<option ${y===state.year?'selected':''}>${y}</option>`).join('')}</select>${window.LumiTheme?`<button class="icon-btn theme-toggle" data-action="theme" aria-label="${LumiTheme.theme==='dark'?t('切换到浅色','Switch to light'):t('切换到深色','Switch to dark')}" title="${LumiTheme.theme==='dark'?t('浅色','Light'):t('深色','Dark')}">${icon(LumiTheme.theme==='dark'?'sun':'moon')}</button>`:''}<button class="language" data-action="language">${state.lang==='zh'?'EN / 中':'中 / EN'}</button><span class="avatar" style="width:30px;height:30px;font-size:11px">J</span></div></header>
      <div class="content" id="content"></div></main>`;
  }
  function heading(title,sub,actions=''){return `<div class="page-heading"><div><h1>${title}</h1><p>${sub}</p></div><div class="row">${actions}</div></div>`;}
  function classStrip(){return `<div class="class-strip">${classes().map(c=>`<button class="class-pill ${c.id===state.classId?'active':''}" data-action="class" data-id="${c.id}">${icon('book')}${esc(label(c))}<span class="pill-number">${c.students.filter(id=>!student(id)?.archived).length}</span></button>`).join('')}${button(t('新增班级','New class'),'add-class','sm','','plus')}</div>`;}
  function periodPicker(){return `<select id="period-month" aria-label="${t('功课统计月份','Homework statistics month')}"><option value="">${t('功课统计：全年','Homework: full year')}</option>${Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')).map(m=>`<option value="${m}" ${state.month===m?'selected':''}>${t('功课统计：','Homework: ')}${m}${t(' 月','')}</option>`).join('')}</select>`;}
  function footer(){return `<footer class="footer"><span>微光 Lumi</span><span>${state.year} · ${state.month||t('全年','Full year')}</span></footer>`;}
  function metric(title,value,unit,foot,ico,color=''){return `<div class="metric"><div class="row between"><span class="metric-label">${title}</span><span class="metric-icon ${color}">${icon(ico)}</span></div><div class="metric-num">${value}<span>${unit}</span></div><p class="metric-foot">${foot}</p></div>`;}
  function chartLine(series,labels,id='trend',target=null) {
    const w=590,h=200,left=35,right=15,top=15,bottom=32,n=labels.length;
    if(!n)return empty(t('尚无考试记录','No exam records yet'));
    const x=i=>left+(n===1?(w-left-right)/2:i*(w-left-right)/(n-1)), y=v=>top+(100-v)*(h-top-bottom)/100;
    return `<svg id="${id}" class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${t('考试百分比趋势图','Exam percentage trend')}">
      ${[0,25,50,75,100].map(v=>`<line x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}" class="grid" stroke="#edf1ed"/><text x="${left-9}" y="${y(v)+3}" text-anchor="end">${v}</text>`).join('')}
      ${target!==null?`<line x1="${left}" y1="${y(target)}" x2="${w-right}" y2="${y(target)}" stroke="#c8ac74" stroke-dasharray="5 5"/><text x="${w-right}" y="${y(target)-5}" text-anchor="end">${t('目标','Goal')} ${target}%</text>`:''}
      ${series.map(s=>{const points=s.values.map((v,i)=>v===null?null:[x(i),y(v),v]).filter(Boolean);return `${points.length>1?`<polyline points="${points.map(p=>p.slice(0,2).join(',')).join(' ')}" stroke="${s.color}" fill="none" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`:''}${s.values.map((v,i)=>v===null?'':`<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="white" stroke="${s.color}" stroke-width="2"><title>${esc(s.name)} · ${esc(labels[i])}: ${percent(v)}</title></circle>`).join('')}`;}).join('')}
      ${labels.map((l,i)=>`<text x="${x(i)}" y="${h-8}" text-anchor="middle">${esc(l)}</text>`).join('')}</svg>`;
  }
  function examChart(sid) {
    const exams=acts().filter(a=>a.kind!=='homework'&&(state.examFilter==='all'||a.kind===state.examFilter)).slice(-10);
    const kinds=['tuition','school','quiz'].filter(k=>exams.some(a=>a.kind===k));
    const colors={tuition:'#3564db',school:'#8298c7',quiz:'#8e7bb5'};
    const series=kinds.map(k=>({name:typeName(k),color:colors[k],values:exams.map(a=>a.kind===k?(sid?C.pct(a.results[sid],a):C.examStats(a).average):null)}));
    const g=sid?data.goals.find(g=>!g.archived&&g.studentId===sid&&g.classId===state.classId&&g.status==='progress'&&(state.examFilter==='all'||state.examFilter===g.kind)):null;
    return `${chartLine(series,exams.map(a=>a.date.slice(5).replace('-','/')),'exam-trend',g?.target??null)}<div class="legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}${g?`<span><i class="goal"></i>${t('目标参考线','Goal reference')}</span>`:''}</div>`;
  }
  function monthlyChart(sid){
    const cutoff=state.month?Number(state.month):12;
    const months=Array.from({length:cutoff},(_,n)=>String(n+1).padStart(2,'0'));
    return months.map(m=>{const s=C.homeworkStats(data,state.classId,state.year,sid,m,C.periodEnd(state.year,state.month));return `<div class="bar-row"><span>${m}${t(' 月','')}</span><div class="bar-track"><div class="bar-fill" style="width:${s.rate||0}%"></div></div><strong>${percent(s.rate)}</strong></div>`;}).join('')+`<p class="chart-caption">${t('含迟交与补交，按所选年份及月份统计。','Includes late and made-up work in the selected year and months.')}</p>`;
  }
  function missingStudents(){
    return roster().map(s=>({s,stats:stat(s.id)})).filter(o=>o.stats.missing>0).sort((a,b)=>b.stats.missing-a.stats.missing);
  }
  function consecutiveMissing(sid){
    let n=0;
    for(const a of [...acts('homework')].filter(a=>a.students.includes(sid)&&a.date<=C.periodEnd(state.year,state.month)).reverse()){if(a.results[sid]?.status==='missing')n++;else break;}
    return n;
  }
  function scoreAlerts(){
    const alerts=C.examAlerts(data,state.classId,state.year);
    return alerts.length?`<div class="divider"></div><p class="overview-label">${t('成绩提醒','EXAM CHECK-INS')}</p>${alerts.slice(0,4).map(a=>`<div class="attention-item"><div class="attention-text"><button class="student-name" data-action="student" data-id="${a.studentId}">${esc(label(student(a.studentId)))}</button><p>${typeName(a.kind)} · ${percent(a.score)}</p></div>${badge(a.low?t('低于提醒线','Low score'):t(`连续 ${a.declines} 次下降`,`${a.declines} declines`),'gold')}</div>`).join('')}`:'';
  }
  function recentTable(){
    const list=[...acts()].reverse().slice(0,4);
    return list.length?`<div class="table-wrap"><table><thead><tr><th>${t('记录名称','Record')}</th><th>${t('日期','Date')}</th><th>${t('完成 / 成绩','Completion / score')}</th><th></th></tr></thead><tbody>${list.map(a=>{const stats=C.examStats(a),done=a.students.filter(id=>C.complete(a.results[id]?.status)).length;return `<tr><td><strong style="font-weight:500">${esc(label(a))}</strong><div class="tiny muted" style="margin-top:5px">${typeName(a.kind)}</div></td><td class="muted">${a.date.slice(5).replace('-',' / ')}</td><td>${a.kind==='homework'?`${done} / ${a.students.length}`:percent(stats.average)}</td><td>${button(t('录入','Open'),'open-activity','sm',`data-id="${a.id}"`)}</td></tr>`;}).join('')}</tbody></table></div>`:empty(t('添加你的第一份记录','Add your first record'));
  }
  function heroArt(){return `<svg class="hero-art" viewBox="0 0 240 180" fill="none" aria-hidden="true"><ellipse cx="132" cy="162" rx="95" ry="12" fill="#d9e5c9"/><path d="m48 111 104-23 49 28-105 25z" fill="#92ac73"/><path d="m48 111 1 15 47 28 1-13" fill="#c3d6a6"/><path d="m97 141 104-25-1 14-104 24" fill="#fafcf4"/><path d="m68 86 93-22 42 26-94 23z" fill="#537c50"/><path d="m68 86 1 14 40 26v-13" fill="#87a568"/><path d="m109 113 94-23-1 13-93 23" fill="#f9fcf0"/><rect x="92" y="25" width="67" height="79" rx="6" transform="rotate(12 92 25)" fill="#fffef4"/><path d="m103 45 32 7m-35 8 24 5m-27 8 32 7" stroke="#d2dfbd" stroke-width="4" stroke-linecap="round"/><circle cx="175" cy="44" r="22" fill="#b4ce91"/><path d="m167 43 6 7 12-12" stroke="#faffee" stroke-width="3" stroke-linecap="round"/><path d="M38 119c-3-24-20-24-17-42 22 3 16 21 17 42Z" fill="#94af72"/><path d="M39 120c3-24 23-24 24-40-22-1-22 21-24 40Z" fill="#b1c98e"/><path d="M39 144v-33" stroke="#839f66" stroke-width="2"/></svg>`;}
  function overview(){
    const c=cls();
    if(!c)return heading(t('我的班级','My classes'),'')+classStrip()+empty(t('这个年份还没有班级','No classes in this year'));
    return heading(esc(label(c)),'',button(t('新增记录','New record'),'new-record','primary','','plus')+button(t('加学生','Add students'),'add-student','','','users')+button(t('分组','Groups'),'groups','','','group'))+classStrip()+resumeRecord()+workspaceRoster()+
      `<details class="secondary-panel"><summary>${t('查看图表与统计','Show charts and statistics')}</summary><div class="stack"><section class="card"><div class="card-head"><h2>${t('考试趋势','Exam trend')}</h2><button class="icon-btn" data-action="download-chart" aria-label="${t('下载图表','Download chart')}">${icon('down')}</button></div>${examChart()}</section><section class="card"><h2>${t('每月功课完成率','Monthly homework completion')}</h2>${monthlyChart()}</section><section class="card"><div class="card-head"><h2>${t('功课提交记录','Homework submissions')}</h2></div>${heatmap()}</section></div></details>`;
  }
  /* ---------- Groups ---------- */
  function groupsPage(){
    const c=cls();
    if(!c)return heading(t('分组','Groups'),'')+classStrip()+empty(t('这个年份还没有班级','No classes in this year'));
    const list=roster(),groups=C.groupsOf(data,c.id),grouped=new Set(groups.flatMap(g=>g.members));
    const free=list.filter(s=>!grouped.has(s.id));
    const actions=list.length?button(t('自动分组','Auto split'),'group-auto','','','group')+button(t('新建组','New group'),'group-new','primary','','plus'):'';
    let body;
    if(!list.length)body=empty(t('这个班还没有学生。先在首页加学生。','This class has no students yet. Add students on the home page first.'));
    else if(!groups.length)body=empty(t('还没有分组。用「自动分组」一次分好，或「新建组」自己挑人。','No groups yet. Use Auto split, or New group to pick members yourself.'),`<div class="row" style="justify-content:center">${actions}</div>`);
    else body=`<div class="group-grid">${groups.map(g=>{
      const members=[...(g.leaderId?[g.leaderId]:[]),...g.members.filter(id=>id!==g.leaderId)].map(student).filter(Boolean);
      return `<section class="card group-card"><div class="group-head"><h2>${esc(label(g))}</h2><span class="small muted">${t(`${g.members.length} 人`,`${g.members.length} people`)}</span></div>
        <ul class="group-members">${members.map(m=>`<li class="${m.id===g.leaderId?'is-leader':''}">${m.id===g.leaderId?`<span class="leader-tag">★ ${t('队长','Leader')}</span>`:''}<span>${esc(label(m))}</span></li>`).join('')||`<li class="muted">${t('还没有组员','No members yet')}</li>`}</ul>
        ${g.leaderId?'':`<p class="small muted">${t('还没选队长','No leader yet')}</p>`}
        <div class="row group-actions">${button(t('编辑','Edit'),'group-edit','sm',`data-id="${g.id}"`,'edit')}${button(t('删除','Delete'),'group-delete','sm danger',`data-id="${g.id}"`,'trash')}</div></section>`;}).join('')}</div>
      ${free.length?`<section class="card group-free"><div class="card-head"><h2>${t('未分组','Not in a group')} <span class="small muted">${free.length}</span></h2></div><p class="help">${t('点名字，选要加入哪一组。','Tap a name to choose a group.')}</p><div class="row wrap">${free.map(s=>`<button class="chip" data-action="group-join" data-sid="${s.id}">${esc(label(s))}</button>`).join('')}</div></section>`:''}`;
    return heading(`${t('分组','Groups')} · ${esc(label(c))}`,'',actions)+classStrip()+body;
  }
  function groupForm(id){
    const c=cls(),groups=C.groupsOf(data,c.id),g=groups.find(x=>x.id===id),where=new Map();
    groups.forEach(x=>x.members.forEach(m=>where.set(m,x)));
    const name=g?g.name:(()=>{let i=groups.length+1;while(groups.some(x=>x.name===`第${i}组`))i++;return `第${i}组`;})();
    const rows=roster().map(s=>{const inThis=g?.members.includes(s.id),other=where.get(s.id);
      return `<div class="gp-row"><label class="gp-member"><input type="checkbox" name="m" value="${s.id}" ${inThis?'checked':''}><span>${esc(label(s))}${other&&other.id!==g?.id?`<small>${t(`在${esc(other.name)}`,`in ${esc(label(other))}`)}</small>`:''}</span></label><label class="gp-leader"><input type="radio" name="leader" value="${s.id}" ${g?.leaderId===s.id?'checked':''}>${t('队长','Leader')}</label></div>`;}).join('');
    showModal(g?t('编辑组','Edit group'):t('新建组','New group'),`<label class="form-field full">${t('组名','Group name')}<input name="name" required maxlength="30" value="${esc(name)}"></label>
      <div class="full"><p class="help">${t('勾选组员，再点一位当队长。已在别组的学生会移到这一组。','Tick members, then pick a leader. Students from another group move here.')}</p><div class="gp-list">${rows}</div></div>`,fd=>{
      const members=fd.getAll('m'),leader=fd.get('leader')||null;
      if(leader&&!members.includes(leader))members.push(leader);
      C.saveGroup(data,c.id,{id:g?.id,name:fd.get('name'),members,leaderId:leader});
    });
    const form=modal.querySelector('form');
    form.addEventListener('change',e=>{
      const el=e.target;
      if(el.name==='leader'&&el.checked)form.querySelector(`input[name=m][value="${el.value}"]`).checked=true;
      if(el.name==='m'&&!el.checked){const r=form.querySelector(`input[name=leader][value="${el.value}"]`);if(r)r.checked=false;}
    });
  }
  function autoGroupForm(){
    const c=cls(),n=roster().length,existing=C.groupsOf(data,c.id).length;
    showModal(t('自动分组','Auto split'),`<label class="form-field">${t('分成几组','Number of groups')}<input name="count" type="number" min="1" max="${n}" step="1" required value="${Math.min(n,Math.max(1,Math.round(n/5)))}"></label>
      <label class="form-field gp-check"><span><input type="checkbox" name="leaders" checked> ${t('每组随机挑一位队长','Pick a random leader for each group')}</span></label>
      <p class="help full">${t(`全班 ${n} 人会随机平均分配，之后可以再调整。`,`All ${n} students are split evenly at random. You can adjust afterwards.`)}${existing?`<br><strong>${t(`会取代现在的 ${existing} 个组。`,`This replaces the current ${existing} groups.`)}</strong>`:''}</p>`,fd=>{
      C.autoGroups(data,c.id,fd.get('count'),{leaders:fd.get('leaders')==='on'});
    });
    modal.querySelector('button[type=submit]').textContent=t('分组','Split');
  }
  function joinGroupForm(sid){
    const c=cls(),s=student(sid),groups=C.groupsOf(data,c.id);
    showModal(t(`${esc(label(s))} 加入哪一组？`,`Add ${esc(label(s))} to which group?`),`<div class="full gp-join">${groups.map(g=>`<button type="button" class="btn" data-action="group-pick" data-id="${g.id}" data-sid="${sid}">${esc(label(g))}<span class="small muted">${t(`${g.members.length} 人`,`${g.members.length}`)}</span></button>`).join('')}</div>`,()=>{});
    modal.querySelector('button[type=submit]').hidden=true;
  }
  function workspaceRoster(){
    const list=roster();
    return `<section class="card workspace-roster" style="margin-bottom:22px"><div class="card-head"><h2>${t('学生名单','Class roster')} <span class="small muted">${list.length}</span></h2>${periodPicker()}</div>${!list.length?`<div class="empty"><p>${t('还没有学生。复制 Excel 姓名一列，即可一次加入全班。','No students yet. Paste a name column from Excel to add your class.')}</p>${button(t('粘贴名单','Paste names'),'bulk-students','primary')}</div>`:`<div class="table-wrap"><table><thead><tr><th>${t('学生','Student')}</th><th>${t('欠交功课','Missing homework')}</th><th>${t('未记录','Not recorded')}</th></tr></thead><tbody>${list.map(s=>{const h=stat(s.id);return `<tr><td><button class="student-name" data-action="student" data-id="${s.id}">${studentNameLines(s)}<small>${esc(s.code)}</small></button></td><td>${h.missing?`<button class="missing-link" data-action="student-missing" data-id="${s.id}">${badge(t(`${h.missing} 份`,`${h.missing} items`),'red')}</button>`:'—'}</td><td class="muted">${h.unrecorded||'—'}</td></tr>`;}).join('')}</tbody></table></div>`}</section>`;
  }
  function heatmap(){
    const hw=acts('homework').slice(-8);
    if(!hw.length)return empty(t('尚无功课记录','No homework yet'));
    return `<div class="heat-grid">${roster().map(s=>`<div class="heat-row"><button class="student-name heat-name" data-action="student" data-id="${s.id}">${esc(label(s))}</button>${hw.map(a=>`<span class="heat-cell ${a.results[s.id]?.status||''}" title="${esc(label(a))} ${a.date} · ${statusText(a.results[s.id]?.status)}" role="img" aria-label="${esc(label(s))} ${a.date}: ${statusText(a.results[s.id]?.status)}"></span>`).join('')}</div>`).join('')}</div><div class="legend"><span><i style="background:#9cbd80"></i>${t('按时交','On time')}</span><span><i style="background:#e7cf93"></i>${t('迟交 / 补交','Late / made up')}</span><span><i style="background:#e4ada0"></i>${t('未交','Missing')}</span><span><i style="background:#edf1ec"></i>${t('未记录 / 不适用','Unrecorded / N/A')}</span></div>`;
  }
  function selectedActivity(){
    const list=acts().filter(a=>state.kind==='homework'?a.kind==='homework':a.kind!=='homework');
    return list.find(a=>a.id===state.activityId)||list.at(-1);
  }
  function records(){
    const a=selectedActivity();if(a)state.activityId=a.id;
    const list=acts().filter(a=>state.kind==='homework'?a.kind==='homework':a.kind!=='homework').reverse();
    return heading(t('功课与成绩','Homework & scores'),t('全班一起录入，修改后自动保存到当前浏览器。','Enter a whole class at once. Changes save in this browser.'),button(t('新增记录','New record'),'new-record','primary','','plus'))+classStrip()+
      `<div class="filters"><div class="tab-group"><button class="${state.kind==='homework'?'active':''}" data-action="record-kind" data-kind="homework">${t('功课记录','Homework')}</button><button class="${state.kind!=='homework'?'active':''}" data-action="record-kind" data-kind="exam">${t('考试成绩','Exams')}</button></div><select id="activity-select" aria-label="${t('选择记录','Select record')}">${list.map(r=>`<option value="${r.id}" ${a?.id===r.id?'selected':''}>${esc(label(r))} · ${r.date}</option>`).join('')}</select><select id="record-filter" aria-label="${t('筛选状态','Filter status')}">${[['all',t('全部学生','All students')],['missing',t('只看未交','Missing only')],['unrecorded',t('只看未记录','Unrecorded only')]].map(([v,l])=>`<option value="${v}" ${state.filter===v?'selected':''}>${l}</option>`).join('')}</select></div>`+
      (!a?empty(t('这个班级还没有记录，新增一份试试看。','No records in this class. Add one to get started.')):`
      <section class="card"><div class="activity-header"><div class="row between"><div><h2>${esc(label(a))}</h2><p class="help">${typeName(a.kind)} · ${t(a.kind==='homework'?'截止日期':'考试日期',a.kind==='homework'?'Due date':'Exam date')} ${a.date}${a.kind==='homework'?'':` · ${t('满分','Out of')} ${a.max}`}${a.topic?` · ${esc(a.topic)}`:''}</p>${a.note?`<p class="help">${esc(a.note)}</p>`:''}</div><div class="row">${button(t('编辑','Edit'),'edit-activity','sm',`data-id="${a.id}"`,'edit')}${a.kind==='homework'?button(t('剩余未记录 → 已交','Mark remaining submitted'),'bulk-submit','soft sm'):button(t('贴成绩','Paste scores'),'paste-scores','sm','','upload')}${button(t('导出 CSV','Export CSV'),'export-csv','sm','','down')}${button(t('回收','Archive'),'archive-activity','sm danger',`data-id="${a.id}"`,'trash')}</div></div></div>
      <div class="info-banner">${icon('info')}${t(a.kind==='homework'?'选择提交状态，需要时填写备注。':'空白不是零分；缺席单独记录。不同满分自动换算为百分比。',a.kind==='homework'?'Select a submission status and optionally add a note.':'Blank is not zero. Absences are separate. Scores are converted to percentages.')}</div>
      <div class="table-wrap record-table-wrap"><table class="record-table"><thead><tr><th>#</th><th>${t('学生','Student')}</th><th>${t('状态','Status')}</th>${a.kind==='homework'?'':`<th>${t('得分','Score')} / ${a.max}</th><th>%</th>`}<th>${t('备注','Notes')}</th><th></th></tr></thead><tbody>${a.students.filter(id=>student(id)).filter(id=>state.filter==='all'||(a.results[id]?.status||'unrecorded')===state.filter).map((id,i)=>recordRow(a,id,i)).join('')}</tbody></table></div>
      <p class="chart-caption">${t('修改自动保存。可复制「姓名＋分数」两列，系统按姓名配对。','Changes save automatically. Paste name and score columns to match students.')}</p></section>`)+footer();
  }
  function homeworkButtons(id,status,name){
    return `<div class="homework-buttons" role="group" aria-label="${esc(name)} ${t('功课状态','Homework status')}">${['submitted','missing','late','makeup'].map(v=>`<button type="button" class="hw-state ${v}" data-action="homework-status" data-id="${id}" data-status="${v}" aria-pressed="${status===v}">${statusText(v)}</button>`).join('')}<button type="button" class="hw-reset" data-action="homework-status" data-id="${id}" data-status="unrecorded" aria-label="${esc(name)} ${t('清除状态，恢复未记录','Reset to unrecorded')}" title="${t('恢复未记录','Reset to unrecorded')}">↺</button></div>`;
  }
  function examButtons(id,status,name,score){
    return `<div class="exam-buttons" role="group" aria-label="${esc(name)} ${t('考试状态','Exam status')}"><span class="exam-indicator ${status==='recorded'?'recorded':''}" role="status">${status==='recorded'?'✓ ':''}${statusText(status)}</span><button type="button" class="hw-state absent" data-action="exam-status" data-id="${id}" data-status="${status==='absent'?'unrecorded':'absent'}" aria-pressed="${status==='absent'}">${t('缺席','Absent')}</button></div>`;
  }
  function studentNameLines(s){
    const raw=String(s.name||'').trim(),match=raw.match(/[\u3400-\u9fff]/);
    const chinese=match?raw.slice(match.index).trim():'';
    const english=String(match?(raw.slice(0,match.index).trim()||s.en||''):raw).trim();
    return `${english?`<span class="name-english">${esc(english)}</span>`:''}${chinese?`<span class="name-chinese">${esc(chinese)}</span>`:''}${!english&&!chinese?esc(raw):''}`;
  }
  function recordDate(){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const month=Number(parts.find(p=>p.type==='month').value),day=Number(parts.find(p=>p.type==='day').value),year=cls()?.year||state.year;
    const capped=Math.min(day,new Date(year,month,0).getDate());
    return `${year}-${String(month).padStart(2,'0')}-${String(capped).padStart(2,'0')}`;
  }
  function recordRow(a,id,i){
    const s=student(id),r=a.results[id]||{status:'unrecorded',score:null,note:''},opts=a.kind==='homework'?['unrecorded','submitted','missing','late','makeup']:['unrecorded','recorded','absent'];
    return `<tr data-student-row="${id}"><td class="tiny muted" data-label="#">${String(i+1).padStart(2,'0')}</td><td data-label="${t('学生','Student')}"><div class="row">${avatar(s,i)}<button class="student-name" data-action="student" data-id="${id}">${studentNameLines(s)}<small>${esc(s.code)}${s.archived?` · ${t('已归档','Archived')}`:''}</small></button></div></td>
      <td data-label="${t('状态','Status')}">${a.kind==='homework'?homeworkButtons(id,r.status,label(s)):examButtons(id,r.status,label(s),r.score)}</td>${a.kind==='homework'?'':`<td data-label="${t('得分','Score')} / ${a.max}"><input class="score" inputmode="decimal" type="number" min="0" max="${a.max}" step="any" value="${r.score??''}" data-result="score" data-sid="${id}" aria-label="${esc(label(s))} ${t('分数','score')}"></td><td class="small muted" data-label="%" data-pct="${id}">${percent(C.pct(r,a))}</td>`}<td data-label="${t('备注','Note')}"><details class="row-note"><summary>${r.note?t('查看备注','View note'):t('+备注','+Note')}</summary><input class="note-input" value="${esc(r.note)}" placeholder="${t('添加备注…','Add a note…')}" data-result="note" data-sid="${id}" aria-label="${esc(label(s))} ${t('备注','notes')}"></details></td><td><button class="icon-btn" data-action="history" data-id="${id}" aria-label="${t('查看修改历史','View history')}">${icon('clock')}</button></td></tr>`;
  }
  function studentList(){
    const list=roster().filter(s=>`${s.name} ${s.en} ${s.code}`.toLowerCase().includes(state.search.toLowerCase()));
    const e=latest(),es=C.examStats(e);
    return heading(t('每位学生，都值得被看见。','Every student, a story.'),t('查看个人记录、进步和下一步目标。','Explore their records, progress and next goals.'),button(t('添加学生','Add student'),'add-student','primary','','plus'))+classStrip()+
      `<div class="filters"><input class="search" id="student-search" placeholder="${t('搜索姓名或学生编号…','Search name or student code…')}" value="${esc(state.search)}" aria-label="${t('搜索学生','Search students')}"></div><section class="card"><div class="table-wrap"><table><thead><tr><th>${t('学生','Student')}</th><th>${t('标签','Tag')}</th><th>${t('功课完成率','Completion')}</th><th>${t('未交','Missing')}</th><th>${t('最近考试','Latest exam')}</th><th>${t('本场排名','Exam rank')}</th><th></th></tr></thead><tbody>${list.map((s,i)=>{const stats=stat(s.id),p=e?C.pct(e.results[s.id],e):null;return `<tr><td><div class="row">${avatar(s,i)}<button class="student-name" data-action="student" data-id="${s.id}">${studentNameLines(s)}<small>${esc(s.code)}</small></button></div></td><td>${s.tag?badge(s.tag==='focus'?t('需要关注','Needs attention'):s.tag==='new'?t('新生','New student'):s.tag,s.tag==='focus'?'red':''): '—'}</td><td>${percent(stats.rate)}</td><td>${stats.missing?badge(stats.missing,'red'):'—'}</td><td>${percent(p)}</td><td>${es.rank[s.id]?`${es.rank[s.id]} / ${es.count}`:'—'}</td><td>${button(t('查看档案','View profile'),'student','sm',`data-id="${s.id}"`)}</td></tr>`;}).join('')}</tbody></table></div>${!list.length?empty(t('没有匹配的学生','No matching students')):''}</section>`+footer();
  }
  function studentPage(){
    const s=student(state.studentId);if(!s)return studentList();
    const stats=stat(s.id),e=latest(),es=C.examStats(e),score=e?C.pct(e.results[s.id],e):null,goals=data.goals.filter(g=>!g.archived&&g.classId===state.classId&&g.studentId===s.id);
    return `<button class="text-link back" data-page="students">${icon('back')}${t('全部学生','All students')}</button><div class="page-heading"><div class="student-header">${avatar(s)}<div><div class="eyebrow">STUDENT PROFILE</div><h1>${studentNameLines(s)}</h1><p>${esc(s.code)} · ${esc(label(cls()))} · ${state.year}</p></div></div><div class="row">${button(t('编辑资料','Edit profile'),'edit-student','','','edit')}${button(t('新增目标','New goal'),'add-goal','primary','','plus')}</div></div>${classStrip()}
      <div class="metrics">${metric(t('功课完成率','Homework completion'),num(stats.rate),stats.rate===null?'':'%',t(`按时提交 ${percent(stats.onTimeRate)}`,`${percent(stats.onTimeRate)} on time`),'check')}${metric(t('尚未交功课','Missing homework'),stats.missing,t('份','items'),t('补交后仍保留历史','Made-up work keeps its history'),'clock','red')}${metric(t('最近考试成绩','Latest exam'),num(score),score===null?'':'%',e?`${e.results[s.id]?.score??'—'} / ${e.max} · ${typeName(e.kind)}`:'—','chart','blue')}${metric(t('本场考试排名','Latest exam rank'),es.rank[s.id]||'—',`/ ${es.count}`,t('仅比较同一场有分数的记录','Same exam, recorded scores only'),'target','gold')}</div>
      <div class="student-tabs">${[['progress',t('学习趋势','Progress')],['records',t('全部记录','All records')],['goals',t('目标与评语','Goals & notes')]].map(([v,l])=>`<button data-action="student-tab" data-tab="${v}" class="${state.tab===v?'active':''}">${l}</button>`).join('')}</div>
      ${state.tab==='records'?studentRecords(s):state.tab==='goals'?`<div class="dashboard-grid"><section class="card"><div class="card-head"><h2>${t('我的考试目标','Exam goals')}</h2></div>${goals.map(g=>goalCard(g)).join('')||empty(t('尚未设定目标','No goals yet'))}</section>${commentCard(s)}</div>`:`
      <div class="dashboard-grid"><div class="stack"><section class="card"><div class="card-head"><div><h2>${t('每一次努力的轨迹','A record of every effort')}</h2><p>${t('原始分数换算为百分比','Raw scores normalized to percentages')}</p></div><select id="exam-filter" aria-label="${t('考试类型','Exam type')}">${['all','tuition','school','quiz'].map(k=>`<option value="${k}" ${state.examFilter===k?'selected':''}>${k==='all'?t('全部考试','All exams'):typeName(k)}</option>`).join('')}</select></div>${examChart(s.id)}<p class="chart-caption">${t('目标线仅供参考；达成状态由老师手动更新。','Goal line is a reference; goal status is updated manually.')}</p></section><section class="card"><div class="card-head"><h2>${t('班级中的这一次表现','This exam, in context')}</h2><p>${e?esc(label(e)):''}</p></div>${comparisonChart(s.id,e)}</section><section class="card"><div class="card-head"><h2>${t('两个学期，回头看看','A look across two terms')}</h2></div>${termChart(s.id)}</section></div>
      <div class="stack"><section class="card"><div class="card-head"><h2>${t('下一步，小目标','The next little milestone')}</h2>${icon('target')}</div>${goals.map(g=>goalCard(g)).join('')||empty(t('一起设定一个目标','Set a goal together'))}</section><section class="card"><div class="card-head"><h2>${t('功课习惯','Homework habits')}</h2></div>${monthlyChart(s.id)}</section>${commentCard(s)}</div></div>`}`+footer();
  }
  function comparisonChart(sid,e){
    if(!e)return empty(t('等待考试','Awaiting an exam'));
    const es=C.examStats(e),vals=[[t('这位学生','This student'),C.pct(e.results[sid],e),'#658a59'],[t('班级平均','Class average'),es.average,'#a8bc95'],[t('最高分','Highest'),es.highest,'#c5d8b2'],[t('最低分','Lowest'),es.lowest,'#dce6cf']];
    return vals.map(([l,v,color])=>`<div class="bar-row"><span style="width:85px">${l}</span><div class="bar-track" style="height:15px"><div class="bar-fill" style="width:${v||0}%;background:${color}"></div></div><strong>${percent(v)}</strong></div>`).join('');
  }
  function termChart(sid){
    return ['tuition','school'].map(k=>{
      const list=acts(k).filter(a=>a.students.includes(sid));
      const first=C.average(list.filter(a=>Number(a.date.slice(5,7))<=data.settings.termEnd).map(a=>C.pct(a.results[sid],a)));
      const second=C.average(list.filter(a=>Number(a.date.slice(5,7))>data.settings.termEnd).map(a=>C.pct(a.results[sid],a)));
      return `<div class="row between" style="padding:13px 0;border-bottom:1px solid var(--line)"><span class="small">${typeName(k)}</span><span class="small muted">T1　<strong>${percent(first)}</strong>　→　T2　<strong>${percent(second)}</strong></span></div>`;
    }).join('')+`<p class="chart-caption">${t(`示例学期：1–${data.settings.termEnd} 月 / ${data.settings.termEnd+1}–12 月。按考试百分比等权平均，不含小考；可在设置调整分界。`,`Demo terms: Jan–month ${data.settings.termEnd} / remaining months. Equal-weight percentage averages; quizzes excluded.`)}</p>`;
  }
  function studentRecords(s){
    const list=[...acts()].reverse().filter(a=>a.students.includes(s.id));
    return `<section class="card"><div class="table-wrap"><table><thead><tr><th>${t('日期','Date')}</th><th>${t('记录','Record')}</th><th>${t('状态','Status')}</th><th>${t('分数','Score')}</th><th>${t('备注','Notes')}</th></tr></thead><tbody>${list.map(a=>{const r=a.results[s.id],p=C.pct(r,a);return `<tr><td class="muted">${a.date}</td><td>${esc(label(a))}<div class="tiny muted">${typeName(a.kind)}</div></td><td>${badge(statusText(r?.status),r?.status==='missing'?'red':'')}</td><td>${p!==null?`${r.score}/${a.max} · ${percent(p)} ${a.kind!=='homework'?badge(p>=data.settings.pass?t('及格','Pass'):t('未及格','Below pass'),p>=data.settings.pass?'':'red'):''}`:'—'}</td><td>${esc(r?.note||'—')}</td></tr>`;}).join('')}</tbody></table></div></section>`;
  }
  function commentCard(s){const key=`${state.classId}:${s.id}:${state.year}`;return `<section class="card"><div class="card-head"><h2>${t('老师的话','A note from the teacher')}</h2>${icon('edit')}</div><textarea class="comment" id="teacher-comment" data-key="${key}" placeholder="${t('写下你的观察、鼓励或下一步行动…','Your observations, encouragement or next steps…')}">${esc(data.comments[key]||'')}</textarea><p class="reading-note">${t('手动撰写 · 离开输入框后保存','Written by you · saved on blur')}</p></section>`;}
  function goalCard(g){
    const s=student(g.studentId),a=acts(g.kind).filter(a=>a.students.includes(g.studentId)&&C.pct(a.results[g.studentId],a)!==null).at(-1),p=a?C.pct(a.results[g.studentId],a):null;
    return `<div class="goal-item"><div class="row between"><div><h3>${esc(label(g))}</h3><p>${esc(label(s))} · ${typeName(g.kind)}</p></div><span class="goal-target">${g.target}<small>%</small></span></div><p>${p===null?t('尚无相关成绩，等待考试','No matching score yet'):t(`最近 ${percent(p)} · ${g.target>p?`距目标 ${num(g.target-p)} 个百分点`:'已达到参考分数'}`,`Latest ${percent(p)} · ${g.target>p?`${num(g.target-p)} points to target`:'Reference score reached'}`)}</p><p>${esc(g.note||'')}</p><div class="row between" style="margin-top:12px"><select class="status-select" data-goal="${g.id}" aria-label="${esc(label(g))} ${t('状态','status')}">${['progress','achieved','paused'].map(v=>`<option value="${v}" ${v===g.status?'selected':''}>${goalText(v)}</option>`).join('')}</select><button class="icon-btn" data-action="archive-goal" data-id="${g.id}" aria-label="${t('归档目标','Archive goal')}">${icon('trash')}</button></div></div>`;
  }
  function goalsPage(){
    const goals=data.goals.filter(g=>!g.archived&&g.classId===state.classId);
    return heading(t('每一个目标，都有下一步。','Every goal has a next step.'),t('和学生一起设定，由你手动更新进度。','Set it together. Update progress in your own time.'),button(t('新增目标','New goal'),'add-goal','primary','','plus'))+classStrip()+`<div class="cards-grid">${goals.map(g=>`<section class="card">${goalCard(g)}</section>`).join('')}</div>${!goals.length?empty(t('从一个小目标开始','Start with a small goal')):''}`+footer();
  }
  function classesPage(){return heading(t('我的班级','My classes'),t('按科目和年级组织，让每个班的记录各归其位。','Organized by subject and level. Every class keeps its own history.'),button(t('新增班级','New class'),'add-class','primary','','plus'))+`<div class="cards-grid">${classes().map(c=>`<section class="card class-card"><div class="row between"><span class="class-icon">${icon('book')}</span>${badge(String(c.year))}</div><h2>${esc(label(c))}</h2><p>${esc(c.code)} · ${esc(c.grade)} · ${esc(c.subject)} · ${c.students.filter(id=>!student(id)?.archived).length} ${t('位学生','students')}</p><div class="row between">${button(t('进入班级','Open class'),'open-class','sm',`data-id="${c.id}"`,'arrow')}${button(t('删除班级','Delete class'),'archive-class','sm danger',`data-id="${c.id}"`)}</div></section>`).join('')}</div>${!classes().length?empty(t('这个年份还没有班级','No classes for this year')):''}`+footer();}
  function settingsPage(){return heading(t('按你的习惯来。','Make it work your way.'),t('以下是示范规则，调整后立即用于统计。','These are demo rules. Changes apply immediately.'))+
    `${window.StudyCloud?'':`<div class="info-banner">${icon('info')}${t('示范版仅保存到此浏览器。尚未连接 Supabase、学生登录或自动备份，请只使用测试资料。','This demo saves in your browser only. Supabase, student sign-in and automatic backups are not connected. Use test data only.')}</div>`}
    <div class="dashboard-grid"><section class="card"><div class="card-head"><h2>${t('统计与提醒','Statistics & reminders')}</h2></div><div class="setting-grid">
    <p class="help full">${t('功课统计跟随当前年份和月份，不需要调整参考日期。','Homework statistics follow the selected year and month.')}</p>
    ${[['pass','及格线 (%)','Passing score (%)',0,100],['low','低分提醒 (%)','Low-score alert (%)',0,100],['missing','连续未交次数','Consecutive missing assignments',1,20],['declines','连续下降次数','Consecutive score declines',1,10],['termEnd','第一学期结束月份','Last month of term 1',1,11]].map(([key,zh,en,min,max])=>`<label>${t(zh,en)}<input type="number" min="${min}" max="${max}" step="1" value="${data.settings[key]}" data-setting="${key}"></label>`).join('')}</div><div class="divider"></div><p class="help">${t('功课：补交计入完成率，不计入准时率。分母按截止日期和当次应交名单计算。考试：百分比等权平均，学校与补习分开；缺席和空白不计作 0 分；小考不计入学期平均。排名并列时采用 1、2、2、4。等级 A/B/C 的界线尚未确定。','Homework: made-up work counts as completed, not on-time. Denominator uses due dates and assigned students. Exams: equal-weight percentages, school and tuition separate. Absence and blanks are not zero. Quizzes are excluded from term averages. Ties use competition ranking: 1, 2, 2, 4. Grade boundaries are not configured.')}</p></section>
    <div class="stack"><section class="card"><div class="card-head"><h2>${t('记录种类','Record types')}</h2>${button(t('新增','Add'),'add-type','sm','','plus')}</div>${data.types.map(type=>`<div class="row between" style="margin:12px 0"><span class="small">${esc(type)}</span>${button(t('移除','Remove'),'remove-type','sm',`data-type="${esc(type)}"`)}</div>`).join('')}<p class="help">${t('种类名称可自定义，每次记录仍需选择功课或考试的计算方式。移除种类不会删除旧记录。','Types are labels; each record also selects a homework or exam calculation. Removing a type keeps historical records.')}</p></section>
    ${window.LumiTheme?`<section class="card"><div class="card-head"><h2>${t('显示','Display')}</h2></div><div class="tab-group theme-modes">${[['light',t('浅色','Light')],['dark',t('深色','Dark')],['auto',t('跟随系统','Match device')]].map(([m,l])=>`<button type="button" class="${LumiTheme.mode===m?'active':''}" data-action="theme-mode" data-mode="${m}" aria-pressed="${LumiTheme.mode===m}">${l}</button>`).join('')}</div><p class="help" style="margin-top:10px">${t('只影响这台设备。跟随系统：手机或电脑开了深色模式，就自动变深色。','Applies to this device only. Match device follows your phone or computer setting.')}</p></section>`:''}${window.StudyCloud?`<section class="card"><div class="card-head"><h2>${t('云端同步','Cloud sync')}</h2></div><p class="help">${t('登录账号','Signed in as')}：<strong>${esc(StudyCloud.email)}</strong></p><p class="help">${t('每次修改会自动上传。云端每天自动保留一份旧版本，误删时可以恢复。','Every change uploads automatically. The cloud keeps one older version per day, so mistakes can be undone.')}</p><div class="row wrap" style="margin-top:12px">${button(t('恢复旧版本','Restore an older version'),'cloud-versions','','','restore')}${button(t('退出登录','Sign out'),'cloud-logout','','','back')}</div></section>`:''}<section class="card"><div class="card-head"><h2>${t('备份','Backup')}</h2></div><div class="row wrap">${button(t('下载 JSON 备份','Download JSON'),'backup','','','down')}${button(t('恢复 JSON 备份','Restore JSON'),'restore-backup','','','restore')}</div><input id="backup-file" type="file" accept=".json,application/json" hidden><p class="help" style="margin-top:12px">${t('JSON 保存全部记录；单次功课或考试可在录入页导出 CSV。恢复 JSON 后会同步到云端。','JSON contains all records. Export a record as CSV from Quick entry. A restored JSON syncs to the cloud.')}</p></section></div></div>`+footer();}
  function importsPage(){
    const p=state.importPlan,hasBackup=!!localStorage.getItem(IMPORT_BACKUP_KEY),c=p?.counts||{};
    const countCards=p?`<div class="import-counts">${[['students',t('学生','Students')],['classes',t('班级','Classes')],['enrollments',t('入班关系','Enrollments')],['records',t('功课 / 考试','Records')],['results',t('学生结果','Results')],['goals',t('目标','Goals')],['updates',t('更新','Updates')]].map(([k,l])=>`<div><strong>${c[k]||0}</strong><span>${l}</span></div>`).join('')}</div>`:'';
    return heading(t('批量加入资料','Add data in bulk'),t('先选班级，再把 Excel 名单直接复制进来。','Select a class, then paste names straight from Excel.'),hasBackup?button(t('撤销上一次导入','Undo last import'),'undo-import','','','restore'):'')+classStrip()+
      `<section class="card" style="margin-bottom:20px"><h2>${t('加学生：复制姓名 → 粘贴 → 保存','Students: copy names → paste → save')}</h2><p class="help" style="margin:12px 0">${t('复制 Excel 的姓名那一列，一次加入全班。不用填编号，系统自动产生。','Copy the name column from Excel to add the whole class. Codes are generated automatically.')}</p>${button(t('粘贴学生名单','Paste student names'),'bulk-students','primary','','plus')}<div class="divider"></div><h3>${t('录成绩？','Entering scores?')}</h3><p class="help" style="margin:10px 0">${t('去快速录入，建立一次考试并填写满分，再从 Excel 复制整列分数，贴进第一个分数格。','In Quick entry, create an exam and set its maximum score. Copy the score column from Excel into the first score field.')}</p><a class="btn" href="#records" data-page="records">${t('去快速录入','Open Quick entry')}</a></section><details><summary style="cursor:pointer;margin:20px 0;color:var(--muted)">${t('进阶：导入旧记录 / 完整 Excel 模板','Advanced: historical records / full Excel template')}</summary>`+
      `<div class="import-steps"><section class="card import-step"><span class="step-number">1</span><div><h2>${t('下载 Excel Template','Download the Excel template')}</h2><p>${t('日常成绩和完整旧资料都在同一个文件里，选择一种方式填写。','Quick scores and full history are in one workbook. Fill one method only.')}</p><a class="btn primary" href="./assets/studylog-excel-import-template.xlsx" download="微光-Excel导入模板.xlsx">${icon('down')}${t('下载 Template (.xlsx)','Download template (.xlsx)')}</a></div></section>
      <section class="card import-step"><span class="step-number">2</span><div><h2>${t('上传填写好的 Excel','Upload the completed Excel')}</h2><p>${t('支持本系统 Template 的 .xlsx 文件。上传不会立即写入。','Supports .xlsx files based on this template. Uploading does not write data.')}</p><label class="upload-zone">${icon('upload')}<strong>${state.importFile?esc(state.importFile):t('选择 Excel 文件','Choose an Excel file')}</strong><span>${t('最大建议 5 MB · 请勿加入电话或家庭资料','Recommended max 5 MB · exclude phone and family data')}</span><input id="excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label></div></section>
      <section class="card import-step"><span class="step-number">3</span><div style="width:100%"><h2>${t('检查并确认','Review and confirm')}</h2>${!p?`<p>${t('上传后，这里会显示新增、更新和错误数量。','Your additions, updates and errors will appear here.')}</p>`:`<p>${t('导入方式','Import mode')}：${p.mode==='quick'?t('日常快速成绩','Quick scores'):t('完整资料搬迁','Full migration')} · ${t('文件','File')}：${esc(state.importFile)}</p>${countCards}${p.errors.length?`<div class="import-message error-list"><strong>${t(`发现 ${p.errors.length} 个错误`,`${p.errors.length} errors found`)}</strong>${p.errors.slice(0,20).map(x=>`<p>${esc(x)}</p>`).join('')}${p.errors.length>20?`<p>… +${p.errors.length-20}</p>`:''}</div>`:`<div class="import-message ok-list"><strong>${t('检查完成，可以导入。','Review complete. Ready to import.')}</strong>${p.warnings.map(x=>`<p>${esc(x)}</p>`).join('')}</div>`}<div class="row wrap">${button(t('清除预览','Clear preview'),'clear-import')}${button(t('确认导入','Confirm import'),'confirm-import',p.errors.length||!p.total?'primary':'primary',p.errors.length||!p.total?'disabled':'','upload')}</div>`}</div></section></div>
      <div class="info-banner">${icon('info')}${t('现有学生用 student_code 配对；现有班级用 class_code 配对。相同编号可能更新资料，预览会列入“更新”。导入前系统会保存一份本地撤销备份。','Students match by student_code; classes match by class_code. Existing codes may update data and appear under Updates. A local undo snapshot is saved before import.')}</div></details>`+footer();
  }
  function trashPage(){
    const groups=[['class',data.classes],['student',data.students],['activity',data.activities],['goal',data.goals]];
    const entries=groups.flatMap(([kind,items])=>items.filter(o=>o.archived).map(o=>({kind,o})));
    return heading(t('留一个找回的机会。','A little room to undo.'),t('归档不抹去历史，可以随时恢复。','Archived records keep their history and can be restored.'))+`<section class="card">${entries.length?entries.map(({kind,o})=>`<div class="row between" style="padding:15px 0;border-bottom:1px solid var(--line)"><div><h3>${esc(label(o))}</h3><p class="help">${({class:t('班级','Class'),student:t('学生','Student'),activity:t('记录','Record'),goal:t('目标','Goal')})[kind]}</p></div>${button(t('恢复','Restore'),'restore','sm',`data-kind="${kind}" data-id="${o.id}"`,'restore')}</div>`).join(''):empty(t('回收站是空的','The recycle bin is empty'))}</section>`+footer();
  }
  function render(){
    normalize();document.documentElement.lang=state.lang==='zh'?'zh-Hans':'en';
    app.innerHTML=shell();
    const pages={groups:groupsPage,overview,records,imports:importsPage,students:studentList,student:studentPage,classes:classesPage,goals:goalsPage,settings:settingsPage,trash:trashPage};
    document.querySelector('#content').innerHTML=(pages[state.page]||overview)();
    if(restoredView){restoredView=false;if(state.page==='records'&&state.focusStudentId)app.querySelector(`[data-result=score][data-sid="${esc(state.focusStudentId)}"]`)?.focus?.({preventScroll:true});window.scrollTo({top:state.scrollY||0});}
    saveView();
  }
  function field(name,title,type='text',value='',attrs=''){return `<label class="form-field">${title}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;}
  function selectField(name,title,options,value=''){return `<label class="form-field">${title}<select name="${name}">${options.map(([v,l])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;}
  function showModal(title,html,onSubmit){
    modal.innerHTML=`<div class="modal-title"><h2>${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="${t('关闭','Close')}">${icon('close')}</button></div><form id="modal-form"><div class="form-grid">${html}</div><p class="error" id="form-error" role="alert"></p><div class="modal-actions">${button(t('取消','Cancel'),'close-modal','','type="button"')}<button class="btn primary" type="submit">${t('保存','Save')}</button></div></form>`;
    modal.querySelector('form').onsubmit=event=>{event.preventDefault();try{onSubmit(new FormData(event.target));persist();modal.close();render();toast(t('已保存','Saved'));}catch(e){modal.querySelector('#form-error').textContent=e.message;}};
    modal.showModal();
  }
  function ensureClass(){if(!cls()){toast(t('请先建立班级','Create a class first'));return false;}return true;}
  function addClass(){showModal(t('建立一个新班级','Create a new class'),
    field('code',t('班级编号','Class code'),'text',`C${state.year}-${String(data.classes.length+1).padStart(3,'0')}`,'required maxlength="50"')+field('name',t('班级名称','Class name'),'text','','required maxlength="60"')+field('en',t('英文名称（选填）','English name (optional)'),'text','','maxlength="60"')+
    field('subject',t('科目','Subject'),'text','','required maxlength="40"')+field('grade',t('年级','Level'),'text','','required maxlength="30"')+field('year',t('年份','Year'),'number',state.year,'required min="2000" max="2100"'),
    f=>{const code=f.get('code').trim();if(data.classes.some(c=>c.code.toLowerCase()===code.toLowerCase()))throw Error(t('班级编号已存在','Class code already exists'));const c={id:C.uid(),code,name:f.get('name').trim(),en:f.get('en').trim(),subject:f.get('subject').trim(),grade:f.get('grade').trim(),year:Number(f.get('year')),students:[],archived:false};if(!c.code||!c.name||!c.subject||!c.grade)throw Error(t('请填写编号、名称、科目和年级','Please enter code, name, subject and level'));data.classes.push(c);state.year=c.year;state.classId=c.id;state.page='overview';});}
  function bulkStudents(){
    if(!ensureClass())return;if(modal.open)modal.close();
    showModal(t('批量加学生','Add students in bulk'),`<label class="form-field full">${t('一行一个姓名，可直接从 Excel 复制','One name per line. Paste directly from Excel.')}<textarea name="names" rows="9" placeholder="陈小明&#10;林悦晴&#10;黄子轩" required></textarea><small>${t('将加入当前班级，学生编号自动产生。重复姓名会提示，不会自动合并。','Adds to the selected class with automatic codes. Duplicate names require review.')}</small></label>`,f=>{
      const names=String(f.get('names')||'').split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
      if(!names.length)throw Error(t('请粘贴姓名','Paste student names'));
      if(names.some(n=>n.includes('\t')||n.length>60))throw Error(t('请只复制姓名一列，每个姓名不超过60字','Copy only the name column, up to 60 characters per name'));
      const seen=new Set();
      for(const name of names){if(seen.has(name)||data.students.some(s=>!s.archived&&s.name===name))throw Error(t(`姓名重复：${name}。请先检查，或用添加单个学生来区分同名学生。`,`Duplicate name: ${name}. Review it or add individually to distinguish students.`));seen.add(name);}
      let next=data.students.length+1;
      for(const name of names){let code;do{code=`S${String(next++).padStart(3,'0')}`;}while(data.students.some(s=>s.code===code));const s={id:C.uid(),name,en:'',code,tag:'',archived:false};data.students.push(s);cls().students.push(s.id);}
    });
  }
  function addStudent(edit=false){
    if(!ensureClass())return;
    if(modal.open)modal.close();
    const s=edit?student(state.studentId):null;
    const candidates=data.students.filter(s=>!s.archived&&!cls().students.includes(s.id));
    const extras=!edit&&candidates.length?`<label class="form-field full">${t('或加入已有学生（无需重填姓名）','Or enroll an existing student (no name required)')}<select name="existing"><option value="">${t('建立新学生','Create new student')}</option>${candidates.map(s=>`<option value="${s.id}">${esc(label(s))} · ${esc(s.code)}</option>`).join('')}</select></label>`:'';
    showModal(edit?t('编辑学生','Edit student'):t('添加学生','Add student'),
      (!edit?`<div class="full">${button(t('粘贴全班名单','Paste a class list'),'bulk-students','soft sm','type="button"')}</div>`:'')+extras+field('name',t('姓名','Name'),'text',s?.name||'','maxlength="60"')+field('en',t('英文姓名（选填）','English name (optional)'),'text',s?.en||'','maxlength="60"')+field('code',t('学生编号','Student code'),'text',s?.code||`S${String(data.students.length+1).padStart(3,'0')}`,'maxlength="30"')+
      selectField('tag',t('标签','Tag'),[['',t('无','None')],['focus',t('需要关注','Needs attention')],['new',t('新生','New student')]],s?.tag||'')+
      (edit?`<div class="full row">${button(t('从当前班退班','Leave this class'),'leave-class','danger sm','type="button"')}${button(t('归档学生','Archive student'),'archive-student','danger sm',`type="button" data-id="${s.id}"`)}</div>`:''),
      f=>{
        if(f.get('existing')){cls().students.push(f.get('existing'));return;}
        const name=f.get('name').trim(),code=f.get('code').trim();
        if(!name||!code)throw Error(t('请填写姓名和编号','Enter a name and code'));
        if(data.students.some(o=>o.code===code&&o.id!==s?.id))throw Error(t('学生编号已存在','Student code already exists'));
        if(s)Object.assign(s,{name,en:f.get('en').trim(),code,tag:f.get('tag')});
        else {const n={id:C.uid(),name,en:f.get('en').trim(),code,tag:f.get('tag'),archived:false};data.students.push(n);cls().students.push(n.id);}
      });
  }
  function addActivity(kind='homework'){
    if(!ensureClass())return;
    if(!roster().length){toast(t('先给班级添加学生','Add students to this class first'));return;}
    const initial=kind==='homework'?'homework':'tuition';
    showModal(t('新增记录','New record'),
      selectField('category',t('类别','Category'),[['homework',t('功课','Homework')],['tuition',t('补习考试','Tuition exam')],['school',t('学校考试','School exam')],['quiz',t('小考','Quiz')]],initial)+
      field('title',t('名称','Title'),'text','','required maxlength="100"')+
      field('date',t('日期','Date'),'date',recordDate(),`required min="${state.year}-01-01" max="${state.year}-12-31"`)+
      `<div data-homework-fields>${field('topic',t('章节（选填）','Topic (optional)'),'text','','maxlength="60"')}</div><div data-exam-fields>${field('max',t('满分','Maximum score'),'number',50,'required min="1" max="10000"')}</div>`+
      `<label class="form-field full">${t('备注（选填）','Notes (optional)')}<textarea name="note" rows="2" maxlength="500"></textarea></label>`,
      f=>{
        const category=f.get('category'),isHW=category==='homework';
        if(!['homework','tuition','school','quiz'].includes(category))throw Error(t('请选择类别','Choose a category'));
        const title=f.get('title').trim(),max=isHW?1:Number(f.get('max'));
        if(!title)throw Error(t('请输入名称','Enter a title'));
        if(!Number.isFinite(max)||max<1||max>10000)throw Error(t('请填写有效满分','Enter a valid maximum score'));
        let n=data.activities.length+1,recordCode;
        do{recordCode=`${isHW?'HW':'EX'}-${state.year}-${String(n++).padStart(4,'0')}`;}while(data.activities.some(a=>(a.recordCode||'').toLowerCase()===recordCode.toLowerCase()));
        const ids=roster().map(s=>s.id),results={};
        ids.forEach(id=>results[id]={status:'unrecorded',score:null,note:''});
        const a={id:C.uid(),recordCode,classId:state.classId,kind:category,type:({homework:'Homework',tuition:'Tuition Exam',school:'School Exam',quiz:'Quiz'})[category],title,date:f.get('date'),max,topic:isHW?(f.get('topic')||''):'',note:f.get('note'),students:ids,results,archived:false};
        data.activities.push(a);state.activityId=a.id;state.kind=isHW?'homework':'exam';state.page='records';state.filter='all';
      });
    const category=modal.querySelector('[name=category]');
    const updateFields=()=>{
      const isHW=category.value==='homework';
      modal.querySelector('[data-homework-fields]').hidden=!isHW;
      modal.querySelector('[name=topic]').disabled=!isHW;
      modal.querySelector('[data-exam-fields]').hidden=isHW;
      modal.querySelector('[name=max]').disabled=isHW;
    };
    category.onchange=updateFields;updateFields();
  }
  function addGoal(){
    if(!ensureClass())return;if(!roster().length){toast(t('先添加学生','Add a student first'));return;}
    showModal(t('一起设定一个目标','Set a goal together'),
      selectField('student',t('学生','Student'),roster().map(s=>[s.id,label(s)]),state.studentId)+field('title',t('目标名称','Goal title'),'text',t('下一场考试','Next exam'),'required maxlength="100"')+
      selectField('kind',t('对应考试','Exam source'),[['tuition',t('补习考试','Tuition exam')],['school',t('学校考试','School exam')]],'tuition')+
      field('target',t('目标百分比','Target percentage'),'number',85,'required min="0" max="100"')+
      `<label class="form-field full">${t('下一步行动（选填）','Next action (optional)')}<textarea name="note" rows="3" maxlength="500"></textarea></label>`,
      f=>{const title=f.get('title').trim();if(!title)throw Error(t('请输入目标名称','Enter a goal title'));data.goals.push({id:C.uid(),goalCode:`GOAL-${state.year}-${String(data.goals.length+1).padStart(4,'0')}`,classId:state.classId,studentId:f.get('student'),kind:f.get('kind'),title,target:Number(f.get('target')),note:f.get('note'),status:'progress',archived:false});});
  }
  function resumeRecord(){
    const a=data.activities.find(a=>a.id===state.activityId&&!a.archived&&a.classId===state.classId);
    return a?`<div class="resume-record">${button(t('继续：','Continue: ')+esc(label(a)),'open-activity','sm',`data-id="${a.id}"`,'arrow')}</div>`:'';
  }
  function editRecord(id){
    const a=data.activities.find(a=>a.id===id&&!a.archived&&a.classId===state.classId);if(!a)return;
    if(modal.open)modal.close();
    showModal(t('编辑记录','Edit record'),
      field('title',t('名称','Title'),'text',a.title,'required maxlength="100"')+
      field('date',t('日期','Date'),'date',a.date,`required min="${state.year}-01-01" max="${state.year}-12-31"`)+
      (a.kind==='homework'?field('topic',t('章节（选填）','Topic (optional)'),'text',a.topic||'','maxlength="60"'):field('max',t('满分','Maximum score'),'number',a.max,'required min="1" max="10000"'))+
      `<label class="form-field full">${t('备注','Notes')}<textarea name="note" rows="2" maxlength="500">${esc(a.note||'')}</textarea></label>`,
      f=>{
        const before=C.editActivity(data,a.id,{title:f.get('title'),date:f.get('date'),max:f.get('max'),topic:f.get('topic'),note:f.get('note')});
        undoAction={activityId:a.id,metadata:before};
      });
  }
  function showMissing(sid){
    const s=student(sid);if(!s)return;
    const list=acts('homework').filter(a=>a.students.includes(sid)&&a.results[sid]?.status==='missing'&&(!state.month||a.date.slice(5,7)===state.month));
    if(modal.open)modal.close();
    modal.innerHTML=`<div class="modal-title"><h2>${esc(label(s))} · ${t('未交功课','Missing homework')}</h2><button class="icon-btn" data-action="close-modal" aria-label="${t('关闭','Close')}">${icon('close')}</button></div>${list.length?list.map(a=>`<div class="missing-row"><div><strong>${esc(label(a))}</strong><p class="help">${a.date}</p></div>${button(t('补交','Made up'),'makeup-one','sm',`data-id="${sid}" data-activity="${a.id}"`)}</div>`).join(''):`<p class="help">${t('没有未交功课','No missing homework')}</p>`}${undoAction?button(t('撤销刚才操作','Undo last change'),'undo-last','sm'):''}`;
    modal.showModal();
    // Keep the count behind this dialog current.
    if(state.page==='overview')document.querySelector('#content').innerHTML=overview();
  }
  function previewScores(a,raw,visibleIds=a.students,start=0){
    const plan=C.scorePastePlan(data,a,raw,visibleIds,start);
    if(modal.open)modal.close();
    showModal(t('确认成绩配对','Review score matching'),
      `<p class="help full">${t('请检查姓名与分数，确认后一次保存。空白会清除原分数。','Review names and scores. Blank values clear existing scores.')}</p><div class="table-wrap full"><table><thead><tr><th>${t('学生','Student')}</th><th>${t('原成绩','Previous')}</th><th>${t('新成绩','New')}</th></tr></thead><tbody>${plan.map(p=>`<tr><td>${studentNameLines(student(p.sid))}</td><td>${a.results[p.sid]?.status==='absent'?t('缺席','Absent'):(a.results[p.sid]?.score??'—')}</td><td>${p.patch.status==='absent'?t('缺席','Absent'):(p.patch.score??'—')}</td></tr>`).join('')}</tbody></table></div>`,
      ()=>{
        const current=data.activities.find(x=>x.id===a.id&&!x.archived);if(!current)throw Error(t('考试已不存在','Exam no longer exists'));
        applyResults(current,plan);
      });
    modal.querySelector('button[type=submit]').textContent=t('确认导入','Confirm');
  }
  function pasteScores(){
    const a=selectedActivity();if(!a||a.kind==='homework')return;
    showModal(t('贴成绩','Paste scores'),`<label class="form-field full">${t('从 Excel 复制「姓名＋分数」两列','Copy name and score columns from Excel')}<textarea id="score-paste" rows="8" placeholder="陈小明&#9;42&#10;林悦晴&#9;38"></textarea><small>${t('也可用学生编号。名单顺序不同也能配对；同名请用编号。','Student codes also work. Order may differ; use codes for duplicate names.')}</small></label>`,()=>{});
    const form=modal.querySelector('form');
    form.onsubmit=event=>{event.preventDefault();try{previewScores(a,modal.querySelector('#score-paste').value);}catch(e){modal.querySelector('#form-error').textContent=e.message;}};
    modal.querySelector('button[type=submit]').textContent=t('检查配对','Review matches');
  }
  function showHistory(sid){
    const a=selectedActivity();const items=data.history.filter(h=>h.activityId===a?.id&&(!sid||h.studentId===sid));
    modal.innerHTML=`<div class="modal-title"><h2>${t('修改历史','Change history')}</h2><button class="icon-btn" data-action="close-modal" aria-label="${t('关闭','Close')}">${icon('close')}</button></div><p class="help">${a?esc(label(a)):''}</p>${items.length?items.map(h=>`<div class="history-item"><strong>${esc(label(student(h.studentId)))}</strong><p>${statusText(h.before.status)} → ${statusText(h.after.status)} · ${t('分数','Score')} ${h.before.score??'—'} → ${h.after.score??'—'}</p>${h.before.note!==h.after.note?`<p>${t('备注','Note')}: ${esc(h.before.note||'—')} → ${esc(h.after.note||'—')}</p>`:''}</div>`).join(''):empty(t('这份记录还没有修改历史','No edits to this record yet'))}`;
    modal.showModal();
  }
  function confirmation(title,message,onConfirm){
    if(modal.open)modal.close();
    showModal(title,`<p class="help full">${message}</p>`,()=>onConfirm());
    modal.querySelector('button[type=submit]').textContent=t('确认','Confirm');
  }
  const versionTime=iso=>new Date(iso).toLocaleString(state.lang==='en'?'en-GB':'zh-CN',{timeZone:'Asia/Kuala_Lumpur',month:'short',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'});
  async function showVersions(){
    let list;
    try{list=await StudyCloud.listBackups();}catch{toast(t('连不上云端，请检查网络。','Cannot reach the cloud. Check the connection.'));return;}
    const rows=list.map(b=>`<div class="version-row"><div><strong>${esc(versionTime(b.created_at))}</strong><small>${b.reason==='before-restore'?t('恢复旧版本前自动另存','Saved before a restore'):t('当天第一次修改之前的资料','Data before the first change that day')}</small></div>${button(t('恢复','Restore'),'cloud-restore','sm',`type="button" data-id="${Number(b.id)}" data-when="${esc(versionTime(b.created_at))}"`)}</div>`).join('');
    showModal(t('恢复旧版本','Restore an older version'),`<div class="full version-list">${rows||`<p class="help">${t('还没有旧版本。从明天起，每天第一次修改前会自动保存一份。','No older versions yet. From tomorrow, one is saved before the first change each day.')}</p>`}</div>`,()=>{});
    modal.querySelector('button[type=submit]').hidden=true;
  }
  async function restoreVersion(id,when){
    if(StudyCloud.state!=='synced'){toast(t('请等右上角显示“已同步”再恢复。','Wait until it shows “Synced” before restoring.'));return;}
    let loaded;
    try{loaded=await StudyCloud.getBackup(id);validateBackup(loaded);}catch{toast(t('这个版本读取失败。','This version could not be loaded.'));return;}
    confirmation(t('恢复旧版本','Restore an older version'),t(`资料会变回 ${esc(when)} 之前的样子。目前的资料会先自动另存一份，恢复错了可以再恢复回来。`,`Data will return to how it was before ${esc(when)}. Current data is saved first, so you can switch back.`),()=>{StudyCloud.snapshot().catch(()=>{});data=loaded;undoAction=null;});
  }
  function download(name,content,type){
    const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  const csvCell=v=>`"${String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')}"`;
  function exportCsv(){
    const a=selectedActivity();if(!a)return;
    const rows=[['student_code','student_name','record','date','status','score','maximum','percentage','note'],...a.students.map(id=>{const s=student(id),r=a.results[id]||{};return[s.code,s.name,a.title,a.date,statusText(r.status),r.score,a.max,C.pct(r,a),r.note];})];
    download(`studylog-${a.date}.csv`,'\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');toast(t('已导出 CSV，可用 Excel 打开','CSV exported for Excel'));
  }
  app.addEventListener('click',onClick);modal.addEventListener('click',onClick);
  function onClick(event){
    const pageEl=event.target.closest('[data-page]');if(pageEl){event.preventDefault();go(pageEl.dataset.page);return;}
    const el=event.target.closest('[data-action]');if(!el)return;event.preventDefault();
    const action=el.dataset.action,id=el.dataset.id;
    if(action==='menu'){document.querySelector('.sidebar').classList.toggle('open');document.querySelector('.mobile-overlay').classList.toggle('open');}
    else if(action==='language'){state.lang=state.lang==='zh'?'en':'zh';render();}
    else if(action==='class')selectClass(id);
    else if(action==='open-class'){state.page='overview';selectClass(id);}
    else if(action==='add-class')addClass();
    else if(action==='add-student')addStudent();
    else if(action==='bulk-students')bulkStudents();
    else if(action==='edit-student')addStudent(true);
    else if(action==='student'){state.studentId=id;state.tab='progress';state.examFilter='all';go('student');}
    else if(action==='student-tab'){state.tab=el.dataset.tab;render();}
    else if(action==='new-homework')addActivity('homework');
    else if(action==='undo-last'){if(modal.open)modal.close();undoLast();}
    else if(action==='edit-activity')editRecord(id);
    else if(action==='paste-scores')pasteScores();
    else if(action==='student-missing')showMissing(id);
    else if(action==='makeup-one'){
      const a=data.activities.find(a=>a.id===el.dataset.activity&&!a.archived&&a.classId===state.classId&&a.kind==='homework');
      if(a?.students.includes(id)&&a.results[id]?.status==='missing'){applyResults(a,[{sid:id,patch:{status:'makeup'}}]);showMissing(id);}
    }
    else if(action==='new-record')addActivity(state.page==='records'?state.kind:'homework');
    else if(action==='exam-status'){
      const a=selectedActivity(),status=el.dataset.status;
      if(!a||a.kind==='homework'||!a.students.includes(id)||!['unrecorded','recorded','absent'].includes(status))return;
      if(status==='recorded'&&a.results[id]?.score==null){toast(t('输入分数后会自动已记录','Enter a score to mark recorded'));return;}
      try{applyResults(a,[{sid:id,patch:{status}}]);
        if(state.filter!=='all')render();else{
          const row=el.closest('tr'),r=a.results[id];row.querySelector('[data-result=score]').value=r.score??'';
          row.querySelector('[data-pct]').textContent=percent(C.pct(r,a));
          row.querySelector('.exam-buttons').outerHTML=examButtons(id,r.status,label(student(id)),r.score);
        }
      }catch(e){toast(e.message);}
    }
    else if(action==='homework-status'){
      const a=selectedActivity();if(!a||a.kind!=='homework'||!a.students.includes(id))return;
      let status=el.dataset.status;
      if(!['submitted','missing','late','makeup','unrecorded'].includes(status))return;
      if(a.results[id]?.status===status)return;
      try{applyResults(a,[{sid:id,patch:{status}}]);
        if(state.filter!=='all')render();
        else {const group=el.closest('.homework-buttons');group.querySelectorAll('.hw-state').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.status===status)));}
      }catch(e){toast(e.message);}
    }
    else if(action==='new-exam')addActivity('exam');
    else if(action==='add-goal')addGoal();
    else if(action==='record-kind'){state.kind=el.dataset.kind;state.activityId='';state.filter='all';render();}
    else if(action==='open-activity'){const a=data.activities.find(a=>a.id===id);state.kind=a.kind==='homework'?'homework':'exam';state.activityId=id;go('records');}
    else if(action==='missing'){
      state.kind='homework';state.page='records';state.filter='missing';
      state.activityId=[...acts('homework')].reverse().find(a=>a.students.some(id=>a.results[id]?.status==='missing'))?.id||'';render();
    }
    else if(action==='close-modal')modal.close();
    else if(action==='history')showHistory(id);
    else if(action==='bulk-submit'){
      const a=selectedActivity();
      if(!a||a.kind!=='homework')return;
      const patches=a.students.filter(sid=>!a.results[sid]||a.results[sid].status==='unrecorded').map(sid=>({sid,patch:{status:'submitted'}}));
      applyResults(a,patches);render();

    }
    else if(action==='archive-activity')confirmation(t('移到回收站','Move to recycle bin'),t('该记录将不参与统计，可以在回收站恢复。','This record will be excluded from statistics and can be restored.'),()=>{data.activities.find(a=>a.id===id).archived=true;state.activityId='';});
    else if(action==='archive-class')confirmation(t('删除班级','Delete class'),t('班级将移到回收站，旧功课和成绩记录保留，可从回收站恢复。','The class will move to the recycle bin. Homework and exam history are retained and can be restored.'),()=>{data.classes.find(c=>c.id===id).archived=true;});
    else if(action==='archive-student')confirmation(t('归档学生','Archive student'),t('从活动学生名单隐藏，已有考试和功课记录保留。','Hide from active rosters while retaining existing records.'),()=>{student(id).archived=true;state.page='students';});
    else if(action==='leave-class')confirmation(t('从当前班退班','Leave current class'),t('旧成绩和功课留在原班。以后可以在添加学生时重新加入。','Old records stay in this class. Enroll the existing student again when needed.'),()=>{cls().students=cls().students.filter(id=>id!==state.studentId);state.page='students';});
    else if(action==='archive-goal')confirmation(t('归档目标','Archive goal'),t('目标历史保留，可在回收站恢复。','The goal can be restored from the recycle bin.'),()=>{data.goals.find(g=>g.id===id).archived=true;});
    else if(action==='restore'){
      const group={class:data.classes,student:data.students,activity:data.activities,goal:data.goals}[el.dataset.kind];group.find(o=>o.id===id).archived=false;persist();render();toast(t('已恢复','Restored'));
    }
    else if(action==='export-csv')exportCsv();
    else if(action==='groups')go('groups');
    else if(action==='group-new')groupForm();
    else if(action==='group-edit')groupForm(el.dataset.id);
    else if(action==='group-auto')autoGroupForm();
    else if(action==='group-join')joinGroupForm(el.dataset.sid);
    else if(action==='group-pick'){const g=C.groupsOf(data,state.classId).find(x=>x.id===el.dataset.id);if(g){C.saveGroup(data,state.classId,{id:g.id,name:g.name,members:[...g.members,el.dataset.sid],leaderId:g.leaderId});persist();modal.close();render();toast(t('已加入','Added'));}}
    else if(action==='group-delete'){const g=C.groupsOf(data,state.classId).find(x=>x.id===el.dataset.id);if(g)confirmation(t(`删除「${esc(label(g))}」`,`Delete “${esc(label(g))}”`),t('组员不会被删除，只是变成未分组。','Members are not deleted; they become ungrouped.'),()=>C.deleteGroup(data,state.classId,g.id));}
    else if(action==='theme'){LumiTheme.toggle();render();}
    else if(action==='theme-mode'){LumiTheme.set(el.dataset.mode);render();}
    else if(action==='cloud-versions')showVersions();
    else if(action==='cloud-restore')restoreVersion(el.dataset.id,el.dataset.when);
    else if(action==='cloud-logout'){if(StudyCloud.dirty)confirmation(t('退出登录','Sign out'),t('还有修改没上传到云端，退出会丢失这些修改。请先联网等待显示“已同步”，或先下载 JSON 备份。确定仍要退出？','Some changes have not uploaded yet and will be lost. Wait for “Synced” or download a JSON backup first. Sign out anyway?'),()=>StudyCloud.logout());else StudyCloud.logout();}
    else if(action==='backup')download(`studylog-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),'application/json');
    else if(action==='restore-backup')document.querySelector('#backup-file').click();
    else if(action==='clear-import'){state.importPlan=null;state.importFile='';render();}
    else if(action==='confirm-import'){
      const plan=state.importPlan;if(!plan||plan.errors.length||!plan.total)return;
      confirmation(t('确认导入 Excel','Confirm Excel import'),t(`将新增或更新 ${plan.total} 项资料。导入前会保存一份可撤销备份。`,`This will add or update ${plan.total} items. An undo snapshot will be saved first.`),()=>{
        localStorage.setItem(IMPORT_BACKUP_KEY,JSON.stringify(data));
        const next=structuredClone(plan.nextData);next.imports??=[];next.imports.unshift({id:C.uid(),file:state.importFile,at:plan.importedAt,counts:plan.counts});
        data=next;const importedClass=data.classes.find(c=>!c.archived&&c.year===state.year)||data.classes.find(c=>!c.archived);if(importedClass){state.year=importedClass.year;state.classId=importedClass.id;}
        state.importPlan=null;state.importFile='';state.page='overview';
      });
    }
    else if(action==='undo-import'){
      const raw=localStorage.getItem(IMPORT_BACKUP_KEY);if(!raw){toast(t('没有可撤销的导入','No import to undo'));return;}
      confirmation(t('撤销上一次导入','Undo last import'),t('当前资料会恢复到导入前的状态。','Current data will return to the state before the import.'),()=>{const restored=JSON.parse(raw);validateBackup(restored);data=restored;localStorage.removeItem(IMPORT_BACKUP_KEY);state.importPlan=null;state.importFile='';state.page='imports';});
    }
    else if(action==='add-type')showModal(t('新增记录种类','Add record type'),field('name',t('种类名称','Type name'),'text','','required maxlength="50"'),f=>{const name=f.get('name').trim();if(!name||data.types.includes(name))throw Error(t('名称为空或已存在','Name is empty or already exists'));data.types.push(name);});
    else if(action==='remove-type')confirmation(t('移除种类','Remove record type'),t('只从新增选项移除，已有记录不变。','Removes this option from new records; existing records stay unchanged.'),()=>{data.types=data.types.filter(v=>v!==el.dataset.type);});
    else if(action==='download-chart'){
      const svg=document.querySelector('#exam-trend');if(!svg)return;const copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');download('studylog-trend.svg',new XMLSerializer().serializeToString(copy),'image/svg+xml');
    }
  }
  app.addEventListener('change',async event=>{
    const el=event.target;
    if(el.id==='excel-file'){
      const file=el.files?.[0];if(!file)return;
      state.importFile=file.name;state.importPlan=null;
      if(!/\.xlsx$/i.test(file.name)){state.importPlan={mode:'empty',counts:{},errors:[t('请选择 .xlsx Excel 文件','Choose an .xlsx Excel file')],warnings:[],total:0};render();return;}
      if(file.size>10*1024*1024){state.importPlan={mode:'empty',counts:{},errors:[t('文件超过 10 MB，请拆分后再导入','File exceeds 10 MB. Split it before importing.')],warnings:[],total:0};render();return;}
      try{toast(t('正在读取 Excel…','Reading Excel…'));const book=await ExcelWorkbook.read(await file.arrayBuffer());state.importPlan=ExcelImport.buildPlan(book,data);}
      catch(e){state.importPlan={mode:'empty',counts:{},errors:[`${t('无法读取 Excel','Could not read Excel')}: ${e.message}`],warnings:[],total:0};}
      render();return;
    }
    if(el.id==='period-month'){state.month=el.value;render();return;}
    if(el.id==='year-select'){state.year=Number(el.value);state.activityId='';render();return;}
    if(el.id==='activity-select'){state.activityId=el.value;render();return;}
    if(el.id==='record-filter'){state.filter=el.value;render();return;}
    if(el.id==='exam-filter'){state.examFilter=el.value;render();return;}
    if(el.dataset.result){
      const a=selectedActivity(),sid=el.dataset.sid;if(!a)return;
      try{
        if(el.dataset.result==='score'&&!el.checkValidity()){el.classList.add('score-error');toast(t('请填写满分范围内的有效分数','Enter a valid score within the maximum'));return;}
        if(el.dataset.result==='status'&&a.kind!=='homework'&&el.value==='recorded'&&a.results[sid]?.score==null)throw Error(t('请先输入分数，或选择缺席','Enter a score or choose absent'));
        let value=el.value;
        applyResults(a,[{sid,patch:{[el.dataset.result]:value}}],el.dataset.result==='score'?`${a.id}:${sid}:score`:'');
        el.classList.remove('score-error');
        if(el.dataset.result==='note'){const summary=el.closest('details')?.querySelector('summary');if(summary)summary.textContent=el.value?t('查看备注','View note'):t('+备注','+Note');}
        if(el.dataset.result==='status'){render();}else{
          const row=el.closest('tr');const pctCell=row.querySelector('[data-pct]');if(pctCell)pctCell.textContent=percent(C.pct(a.results[sid],a));
          if(a.kind!=='homework'){const group=row.querySelector('.exam-buttons');if(group)group.outerHTML=examButtons(sid,a.results[sid].status,label(student(sid)),a.results[sid].score);}
        }
      }catch(e){el.classList.add('score-error');if(el.dataset.result==='status')el.value=a.results[sid]?.status||'unrecorded';toast(e.message);}
    }
    else if(el.dataset.goal){data.goals.find(g=>g.id===el.dataset.goal).status=el.value;persist();toast(t('目标状态已更新','Goal status updated'));}
    else if(el.id==='teacher-comment'){data.comments[el.dataset.key]=el.value;persist();toast(t('评语已保存','Note saved'));}
    else if(el.dataset.setting){
      if(!el.checkValidity()||!el.value){el.reportValidity();return;}
      const key=el.dataset.setting;data.settings[key]=key==='asOf'?el.value:Number(el.value);persist();toast(t('设置已保存','Settings saved'));
    }
    else if(el.id==='backup-file'){
      const file=el.files[0];if(!file)return;
      try{
        const loaded=JSON.parse(await file.text());
        validateBackup(loaded);
        confirmation(t('恢复本地备份','Restore local backup'),t('这会替换当前浏览器的示范数据，请先下载现有备份。','This replaces this browser’s demo data. Download your existing backup first.'),()=>{data=loaded;});
      }catch(e){toast(t('无法读取：请使用本系统导出的完整 JSON。','Invalid backup. Use a complete JSON exported by this app.'));}
      el.value='';
    }
  });
  app.addEventListener('input',event=>{
    if(event.target.dataset.result==='score'&&event.target.checkValidity())event.target.dispatchEvent(new Event('change',{bubbles:true}));
    if(event.target.id==='student-search'){
      const pos=event.target.selectionStart;state.search=event.target.value;
      document.querySelector('#content').innerHTML=studentList();
      const input=document.querySelector('#student-search');input.focus();input.setSelectionRange(pos,pos);
    }
  });
  app.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&event.target.matches?.('[data-result=score]')){
      event.preventDefault();const inputs=[...app.querySelectorAll('[data-result=score]:not(:disabled)')],i=inputs.indexOf(event.target);
      inputs[i+1]?.focus();
    }
  });
  app.addEventListener('paste',event=>{
    if(event.target.dataset.result!=='score')return;
    const raw=event.clipboardData?.getData('text/plain');
    if(!raw||(!raw.includes('\n')&&!raw.includes('\t')))return;
    event.preventDefault();
    const a=selectedActivity(),visible=[...app.querySelectorAll('[data-result=score]')],start=visible.indexOf(event.target);
    try{previewScores(a,raw,visible.map(el=>el.dataset.sid),start);}catch(e){toast(e.message);}
  });
  app.addEventListener('focusin',event=>{
    if(event.target.dataset.result==='score'){state.focusStudentId=event.target.dataset.sid;if(undoAction?.key)undoAction.key='';saveView();}
  });
  window.addEventListener('pagehide',saveView);
  window.addEventListener('scroll',()=>{clearTimeout(saveView.timer);saveView.timer=setTimeout(saveView,250);});
  function validateBackup(v){
    if(v?.version!==1||!['classes','students','activities','goals','history','types'].every(k=>Array.isArray(v[k]))||!v.settings||!v.comments)throw Error('Invalid');
    const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);
    for(const group of [v.classes,v.students,v.activities,v.goals,v.history])if(!group.every(o=>safeId(o.id)))throw Error('ID');
    const ids=new Set(v.students.map(s=>s.id)),cids=new Set(v.classes.map(c=>c.id));
    if(ids.size!==v.students.length||cids.size!==v.classes.length)throw Error('Duplicates');
    for(const s of v.students)if(typeof s.id!=='string'||typeof s.name!=='string'||typeof s.code!=='string')throw Error('Student');
    for(const c of v.classes)if(typeof c.name!=='string'||!Number.isInteger(c.year)||!Array.isArray(c.students)||!c.students.every(id=>ids.has(id)))throw Error('Class');
    for(const c of v.classes)if(c.groups!==undefined&&(!Array.isArray(c.groups)||!c.groups.every(g=>g&&typeof g.id==='string'&&typeof g.name==='string'&&Array.isArray(g.members)&&g.members.every(id=>ids.has(id))&&(g.leaderId==null||g.members.includes(g.leaderId)))))throw Error('Groups');
    for(const a of v.activities)if(!cids.has(a.classId)||!Array.isArray(a.students)||!a.students.every(id=>ids.has(id))||!a.results||!(a.max>0)||typeof a.date!=='string'||typeof a.title!=='string')throw Error('Activity');
    for(const g of v.goals)if(!cids.has(g.classId)||!ids.has(g.studentId)||typeof g.title!=='string')throw Error('Goal');
    for(const h of v.history)if(!ids.has(h.studentId)||!h.before||!h.after)throw Error('History');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(v.settings.asOf)||!v.types.every(t=>typeof t==='string')||typeof v.comments!=='object'||Array.isArray(v.comments))throw Error('Settings');
    for(const key of ['pass','low','missing','declines','termEnd'])if(!Number.isFinite(v.settings[key]))throw Error('Setting value');
    for(const a of v.activities)for(const r of Object.values(a.results)){if(!r||!statuses[r.status])throw Error('Status');C.validScore(r.score===null?'':String(r.score),a.max);}
  }
  window.addEventListener('storage',event=>{if(event.key===KEY)toast(t('另一个页面更改了数据，请刷新后继续。','Another tab changed data. Refresh before continuing.'));});
  if(window.StudyCloud)StudyCloud.onStatus=savedIndicator;
  window.addEventListener('lumi-theme',()=>{const b=document.querySelector('.theme-toggle');if(b)render();});
  persist();render();
})();
