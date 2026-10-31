(function(root) {
  'use strict';
  const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const complete = s => ['submitted','late','makeup'].includes(s);
  const pct = (r,a) => r && r.status !== 'absent' && r.score !== null && r.score !== '' && Number.isFinite(Number(r.score)) && a.max > 0 ? Number(r.score) / a.max * 100 : null;
  const average = nums => { const n = nums.filter(v => v !== null && Number.isFinite(v)); return n.length ? n.reduce((s,v)=>s+v,0)/n.length : null; };
  function validScore(value,max) {
    if (value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`分数必须在 0–${max} 之间 / Score must be between 0 and ${max}`);
    return n;
  }
  function homeworkStats(data, classId, year, studentId, month, cutoff=data.settings.asOf) {
    let total=0, done=0, ontime=0, missing=0, unrecorded=0;
    for (const a of data.activities.filter(a=>!a.archived && a.kind==='homework' && a.classId===classId && a.date.startsWith(String(year)) && (!month || a.date.slice(5,7)===month) && a.date<=cutoff)) {
      for (const sid of a.students.filter(id=>!studentId || id===studentId)) {
        total++;
        const r=a.results[sid];
        if (complete(r?.status)) done++;
        if (r?.status==='submitted') ontime++;
        if (r?.status==='missing') missing++;
        if (!r || r.status==='unrecorded') unrecorded++;
      }
    }
    return {total,done,ontime,missing,unrecorded,rate:total?done/total*100:null,onTimeRate:total?ontime/total*100:null};
  }
  function examStats(activity) {
    if (!activity) return {average:null,highest:null,lowest:null,count:0,rank:{}};
    const entries=activity.students.map(id=>[id,pct(activity.results[id],activity)]).filter(([,v])=>v!==null).sort((a,b)=>b[1]-a[1]);
    const rank={}; let last=null,place=0;
    entries.forEach(([id,v],i)=>{if(v!==last)place=i+1;rank[id]=place;last=v;});
    return {average:average(entries.map(e=>e[1])), highest:entries[0]?.[1]??null, lowest:entries.at(-1)?.[1]??null,count:entries.length,rank};
  }
  function updateResult(data,activityId,studentId,patch) {
    const a=data.activities.find(a=>a.id===activityId && !a.archived);
    if(!a || !a.students.includes(studentId)) throw new Error('记录不存在 / Record not found');
    const before=structuredClone(a.results[studentId]||{status:'unrecorded',score:null,note:''});
    const after={...before,...patch};
    if('score' in patch) after.score=validScore(patch.score===null?'':String(patch.score),a.max);
    if(a.kind!=='homework' && 'score' in patch && after.score!==null)after.status='recorded';
    if(a.kind!=='homework' && patch.status==='absent') {after.status='absent';after.score=null;}
    if(a.kind!=='homework' && patch.status==='unrecorded') after.score=null;
    if(a.kind!=='homework' && 'score' in patch && after.score===null && after.status==='recorded')after.status='unrecorded';
    if(JSON.stringify(before)===JSON.stringify(after)) return false;
    if(a.kind==='homework' && patch.status && complete(after.status) && !complete(before.status)) after.submittedAt=new Date().toISOString();
    a.results[studentId]=after;
    data.history.unshift({id:uid(),activityId,studentId,before,after:structuredClone(after),at:new Date().toISOString()});
    return true;
  }
  function examAlerts(data,classId,year) {
    const c=data.classes.find(c=>c.id===classId),alerts=[];
    if(!c)return alerts;
    const exams=data.activities.filter(a=>!a.archived&&a.classId===classId&&['tuition','school'].includes(a.kind)&&a.date.startsWith(String(year))).sort((a,b)=>a.date.localeCompare(b.date));
    for(const sid of c.students) {
      if(data.students.find(s=>s.id===sid)?.archived)continue;
      for(const kind of ['tuition','school']) {
        const values=exams.filter(a=>a.kind===kind&&a.students.includes(sid)).map(a=>pct(a.results[sid],a)).filter(v=>v!==null);
        if(!values.length)continue;
        const last=values.at(-1);let declines=0;
        for(let i=values.length-1;i>0&&values[i]<values[i-1];i--)declines++;
        if(last<data.settings.low||declines>=data.settings.declines)alerts.push({studentId:sid,kind,score:last,low:last<data.settings.low,declines});
      }
    }
    return alerts;
  }
  function seed() {
    const names=[['陈小明','Ming Chen'],['林悦晴','Yue Qing'],['黄子轩','Zixuan Wong'],['李思恩','Sze En'],['张凯文','Kevin Zhang'],['陈语桐','Yutong Tan'],['刘俊杰','Jun Jie'],['吴欣怡','Xin Yi'],['郑宇航','Yu Hang'],['王芷欣','Zhi Xin'],['杨乐彤','Le Tong'],['许浩然','Hao Ran'],['周可欣','Ke Xin'],['林奕辰','Yi Chen'],['蔡恩熙','En Xi'],['黄梓涵','Zi Han']];
    const students=names.map((n,i)=>({id:`s${i+1}`,name:n[0],en:n[1],code:`S${String(i+1).padStart(3,'0')}`,tag:i===0?'focus':i===5?'new':'',archived:false}));
    const classes=[{id:'c1',code:'C2027-F3-MATH',name:'中三数学',en:'Form 3 Mathematics',subject:'Mathematics',grade:'Form 3',year:2027,students:students.slice(0,12).map(s=>s.id),archived:false},{id:'c2',code:'C2027-F2-SCI',name:'中二科学',en:'Form 2 Science',subject:'Science',grade:'Form 2',year:2027,students:students.slice(8).map(s=>s.id),archived:false}];
    const activities=[];
    for(const c of classes) {
      for(let m=1;m<=7;m++) {
        const ids=[...c.students];
        for(let k=0;k<2;k++) {
          const results={};
          ids.forEach((id,i)=>{
            const z=(i*3+m+k*2)%13;
            let status=z<2?'missing':z===2?'makeup':z===3?'late':'submitted';
            if(id==='s1'&&m>=6)status='missing';
            results[id]={status,score:complete(status)?Math.min(20,11+(i+m+k)%10):null,note:''};
          });
          activities.push({id:`${c.id}-h${m}-${k}`,recordCode:`${c.code}-HW-${String(m).padStart(2,'0')}-${k+1}`,classId:c.id,kind:'homework',type:'Homework',title:c.id==='c1'?['代数练习','方程式巩固'][k]:['科学练习','概念复习'][k],en:c.id==='c1'?['Algebra practice','Equations revision'][k]:['Science practice','Concept review'][k],topic:c.id==='c1'?'Algebra':'Science',note:`${m} 月学习资料`,date:`2027-${String(m).padStart(2,'0')}-${k?'24':'10'}`,max:20,students:ids,results,archived:false});
        }
        const kind=m%2?'tuition':'school';
        const results={};
        ids.forEach((id,i)=>{results[id]={status:i===10&&m===7?'absent':'recorded',score:i===10&&m===7?null:Math.min(50,Math.max(12,24+((i*7)%19)+m-4)),note:''};});
        if(c.id==='c1')results.s1={status:'recorded',score:[23,26,28,30,34,36,40][m-1],note:''};
        activities.push({id:`${c.id}-e${m}`,recordCode:`${c.code}-EX-${String(m).padStart(2,'0')}`,classId:c.id,kind,type:kind==='tuition'?'Tuition Exam':'School Exam',title:`${m} 月${kind==='tuition'?'补习':'学校'}考试`,en:`${['Jan','Feb','Mar','Apr','May','Jun','Jul'][m-1]} ${kind==='tuition'?'tuition':'school'} exam`,date:`2027-${String(m).padStart(2,'0')}-18`,max:50,students:ids,results,archived:false});
      }
    }
    return {version:1,classes,students,activities,goals:[
      {id:'g1',classId:'c1',studentId:'s1',title:'下一场补习考试',en:'Next tuition exam',kind:'tuition',target:85,status:'progress',note:'每周完成两份代数练习。',archived:false},
      {id:'g2',classId:'c1',studentId:'s2',title:'年终学校考试',en:'Final school exam',kind:'school',target:90,status:'progress',note:'复习计算步骤，减少粗心。',archived:false},
      {id:'g3',classId:'c2',studentId:'s10',title:'下一场补习考试',en:'Next tuition exam',kind:'tuition',target:80,status:'achieved',note:'继续保持复习习惯。',archived:false}
    ],types:['Homework','Quiz','School Exam','Tuition Exam'],history:[],comments:{},settings:{asOf:'2027-07-31',pass:50,low:50,missing:3,declines:2,termEnd:6}};
  }
  function periodEnd(year,month='') {
    const m=month?Number(month):12;
    if(!Number.isInteger(year)||!Number.isInteger(m)||m<1||m>12)throw Error('Invalid period');
    return `${year}-${String(m).padStart(2,'0')}-${new Date(year,m,0).getDate()}`;
  }
  function scorePastePlan(data,a,raw,visibleIds=a.students,start=0) {
    if(!a||a.archived||a.kind==='homework')throw Error('请先选择考试 / Select an exam');
    const rows=String(raw).replace(/\r/g,'').split('\n');
    while(rows.length&&rows.at(-1)==='')rows.pop();
    if(!rows.length)throw Error('没有可导入的内容 / Nothing to import');
    const named=rows.some(row=>row.includes('\t'));
    const normalize=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
    const seen=new Set(),plan=[];
    for(let i=0;i<rows.length;i++){
      const cells=rows[i].split('\t');let sid,value;
      if(named){
        if(cells.length!==2)throw Error(`第 ${i+1} 行：请复制姓名和分数两列 / Copy name and score`);
        if(i===0&&/^(姓名|名字|学生|name|student_name|student_code)$/i.test(cells[0].trim())&&/^(分数|成绩|score)$/i.test(cells[1].trim()))continue;
        const key=normalize(cells[0]);
        if(!key)throw Error(`第 ${i+1} 行缺少姓名 / Name is missing`);
        const matches=a.students.map(id=>data.students.find(s=>s.id===id)).filter(Boolean).filter(s=>[s.code,s.name,s.en,s.name+' '+(s.en||''),(s.en||'')+' '+s.name].filter(Boolean).some(v=>normalize(v)===key));
        if(matches.length!==1)throw Error(`${cells[0]}：${matches.length?'同名，请改用学生编号':'不在本次考试名单'} / Name must match exactly one student`);
        sid=matches[0].id;value=cells[1];
      }else{sid=visibleIds[start+i];value=cells[0];if(!sid)throw Error('分数行数超过剩余学生 / Too many rows');}
      if(seen.has(sid))throw Error('学生重复 / Duplicate student');seen.add(sid);
      const text=value.trim();let patch;
      if(/^(缺席|absent)$/i.test(text))patch={status:'absent'};
      else {
        const parts=text.split('/');
        if(parts.length>2||(parts.length===2&&(!parts[0].trim()||!parts[1].trim()||Number(parts[1])!==a.max)))throw Error(`满分不符，应为 ${a.max} / Maximum score mismatch`);
        patch={score:validScore(parts[0].trim(),a.max)};
      }
      plan.push({sid,patch});
    }
    if(!plan.length)throw Error('没有学生成绩 / No student scores');
    return plan;
  }
  function editActivity(data,id,patch){
    const a=data.activities.find(a=>a.id===id&&!a.archived);
    if(!a)throw Error('记录不存在 / Record not found');
    const title=String(patch.title||'').trim(),max=a.kind==='homework'?a.max:Number(patch.max);
    const date=String(patch.date||''),parsed=new Date(date+'T12:00:00Z');
    if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||!date.startsWith(a.date.slice(0,4)))throw Error('请填写名称及该年份的有效日期 / Invalid title or date');
    if(!Number.isFinite(max)||max<1||max>10000||Object.values(a.results).some(r=>r.score!=null&&r.score>max))throw Error('满分不能低于已有得分 / Maximum is below an existing score');
    const before={title:a.title,en:a.en||'',date:a.date,max:a.max,topic:a.topic||'',note:a.note||''};
    const en=typeof patch.en==='string'?patch.en:(title!==a.title?'':a.en||'');
    Object.assign(a,{title,en,date,max,topic:String(patch.topic||''),note:String(patch.note||'')});
    data.recordHistory??=[];data.recordHistory.unshift({id:uid(),activityId:id,before,after:{title,date,max,topic:a.topic,note:a.note},at:new Date().toISOString()});
    return before;
  }
  /* ---------- Class groups: each class keeps its own groups; a student belongs to at most one group per class. ---------- */
  function classOf(data,classId){const c=data.classes.find(c=>c.id===classId);if(!c)throw Error('找不到班级 / Class not found');return c;}
  function activeIds(data,c){const live=new Set(data.students.filter(s=>!s.archived).map(s=>s.id));return c.students.filter(id=>live.has(id));}
  function groupsOf(data,classId){
    const c=classOf(data,classId),inClass=new Set(activeIds(data,c));
    return (c.groups||[]).map(g=>{const members=g.members.filter(id=>inClass.has(id));return {...g,members,leaderId:members.includes(g.leaderId)?g.leaderId:null};});
  }
  function saveGroup(data,classId,input){
    const c=classOf(data,classId),inClass=new Set(activeIds(data,c));c.groups??=[];
    const name=String(input.name||'').trim();
    if(!name||name.length>30)throw Error('请填写组名（30 字以内） / Enter a group name (up to 30 characters)');
    const members=[...new Set(input.members||[])];
    if(members.some(id=>!inClass.has(id)))throw Error('组员必须是这个班的学生 / Members must be in this class');
    const leaderId=input.leaderId||null;
    if(leaderId&&!members.includes(leaderId))throw Error('队长必须是组员 / The leader must be a member');
    let g=input.id?c.groups.find(x=>x.id===input.id):null;
    if(input.id&&!g)throw Error('找不到这一组 / Group not found');
    if(c.groups.some(x=>x!==g&&x.name.trim()===name))throw Error('这个班已经有同名的组 / A group with this name already exists');
    for(const other of c.groups){if(other===g)continue;other.members=other.members.filter(id=>!members.includes(id));if(!other.members.includes(other.leaderId))other.leaderId=null;}
    if(!g){g={id:uid()};c.groups.push(g);}
    const en=g.name===name?g.en:(input.en||'');
    Object.assign(g,{name,en,leaderId,members});
    return g;
  }
  function deleteGroup(data,classId,groupId){const c=classOf(data,classId),before=(c.groups||[]).length;c.groups=(c.groups||[]).filter(g=>g.id!==groupId);if(c.groups.length===before)throw Error('找不到这一组 / Group not found');}
  function autoGroups(data,classId,count,{leaders=true,random=Math.random}={}){
    const c=classOf(data,classId),ids=activeIds(data,c),n=Math.floor(Number(count));
    if(!ids.length)throw Error('这个班还没有学生 / This class has no students');
    if(!(n>=1&&n<=ids.length))throw Error(`组数要在 1 到 ${ids.length} 之间 / Number of groups must be 1–${ids.length}`);
    const order=[...ids];for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    c.groups=Array.from({length:n},(_,i)=>({id:uid(),name:`第${i+1}组`,en:`Group ${i+1}`,leaderId:null,members:[]}));
    order.forEach((id,i)=>c.groups[i%n].members.push(id));
    if(leaders)c.groups.forEach(g=>{g.leaderId=g.members[0]||null;});
    return c.groups;
  }
  const api={uid,complete,pct,average,validScore,homeworkStats,examStats,examAlerts,updateResult,seed,periodEnd,scorePastePlan,editActivity,groupsOf,saveGroup,deleteGroup,autoGroups};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.StudyCore=api;
})(globalThis);
