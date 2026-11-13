(function(root) {
  'use strict';
  const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const complete = s => ['submitted','late','makeup'].includes(s);
  /* Homework still owed: not handed in, or handed in unfinished ("没完成"). */
  const owed = s => s==='missing' || s==='incomplete';
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
        if (owed(r?.status)) missing++;
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
  /* ---------- Tuition classes = level + subject. One student can take several subjects. ---------- */
  /* A name may be English only, Chinese only, or both ("CHIN WING SHUAN 陈颖萱"); split it into the two parts. */
  const HAN=/[㐀-鿿豈-﫿]/g;
  function nameParts(text){
    const s=String(text||'').normalize('NFKC');
    const han=(s.match(HAN)||[]).join('');
    const latin=s.replace(HAN,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase();
    return {latin,han};
  }
  function studentParts(s){const a=nameParts(s.name),b=nameParts(s.en);return {latin:a.latin||b.latin,han:a.han||b.han};}
  /* Same person when every part both sides have agrees, and at least one part is compared. */
  function samePerson(p,q){let compared=0;
    if(p.latin&&q.latin){if(p.latin!==q.latin)return false;compared++;}
    if(p.han&&q.han){if(p.han!==q.han)return false;compared++;}
    return compared>0;}
  /* One way to write a level: "Form 3", "form3", "T3", "Tingkatan 3", "中三" → "F3". Anything else is kept as typed. */
  function normLevel(text){
    const s=String(text||'').normalize('NFKC').trim(),u=s.toUpperCase(),cn={'一':1,'二':2,'三':3,'四':4,'五':5};
    let m=u.match(/^(?:F|FORM|T|TING|TINGKATAN)\s*\.?\s*([1-5])$/);if(m)return `F${m[1]}`;
    m=s.match(/^中([一二三四五])$/);if(m)return `F${cn[m[1]]}`;
    return s;
  }
  const levelKey=c=>normLevel(c.grade).toLowerCase();
  /* Older classes may say "Form 3": rewrite them as "F3" and update a name that was built from the old level. */
  function normalizeLevels(data){
    let changed=0;
    for(const c of data.classes){const old=String(c.grade||''),lv=normLevel(old);if(lv===old)continue;
      if(c.name===`${old} ${c.subject}`.trim()){c.name=`${lv} ${c.subject}`.trim();c.en='';}
      c.grade=lv;changed++;}
    return changed;
  }
  /* Look for the student only among classes of the same level and year, so F4 and F5 namesakes never merge. */
  function sameLevelStudents(data,c){
    const lv=levelKey(c),ids=new Set();
    data.classes.filter(x=>!x.archived&&x.year===c.year&&levelKey(x)===lv).forEach(x=>x.students.forEach(id=>ids.add(id)));
    return data.students.filter(s=>!s.archived&&ids.has(s.id));
  }
  /* Students entered twice before names were matched: same level and year, names agree.
     "sure" is false when the names only partly chain together, or two of them sit in the same class (likely real namesakes). */
  function findDuplicates(data){
    const levels=new Map(),out=[],seen=new Set();
    for(const c of data.classes.filter(c=>!c.archived)){const k=`${levelKey(c)}|${c.year}`;if(!levels.has(k))levels.set(k,new Set());c.students.forEach(id=>levels.get(k).add(id));}
    for(const ids of levels.values()){
      const list=data.students.filter(s=>!s.archived&&ids.has(s.id)&&!seen.has(s.id)),parts=new Map(list.map(s=>[s.id,studentParts(s)]));
      for(const first of list){if(seen.has(first.id))continue;
        const cluster=[first];seen.add(first.id);
        for(let i=0;i<cluster.length;i++)for(const s of list)if(!seen.has(s.id)&&samePerson(parts.get(cluster[i].id),parts.get(s.id))){cluster.push(s);seen.add(s.id);}
        if(cluster.length<2)continue;
        const allMatch=cluster.every((a,i)=>cluster.slice(i+1).every(b=>samePerson(parts.get(a.id),parts.get(b.id))));
        const shareClass=data.classes.some(c=>!c.archived&&cluster.filter(s=>c.students.includes(s.id)).length>1);
        cluster.sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''),undefined,{numeric:true}));
        out.push({students:cluster,sure:allMatch&&!shareClass});
      }
    }
    return out;
  }
  /* Fold duplicate records into one student: classes, groups, results, goals, history and notes all move to keepId. */
  function mergeStudents(data,keepId,dropIds){
    const keep=data.students.find(s=>s.id===keepId&&!s.archived);
    const drops=[...new Set(dropIds)].filter(id=>id!==keepId).map(id=>data.students.find(s=>s.id===id&&!s.archived));
    if(!keep||!drops.length||drops.some(s=>!s))throw Error('找不到要合并的学生 / Students not found');
    const gone=new Set(drops.map(s=>s.id)),swap=id=>gone.has(id)?keepId:id,uniq=ids=>[...new Set(ids.map(swap))];
    for(const s of drops){completeName(keep,s.name);if(s.en)completeName(keep,s.en);if(!keep.tag&&s.tag)keep.tag=s.tag;}
    for(const c of data.classes){
      if(!c.students.some(id=>gone.has(id)))continue;
      c.students=uniq(c.students);let placed=false;
      for(const g of c.groups||[]){g.members=uniq(g.members);if(g.leaderId)g.leaderId=swap(g.leaderId);
        if(g.members.includes(keepId)){if(placed){g.members=g.members.filter(id=>id!==keepId);if(g.leaderId===keepId)g.leaderId=null;}placed=true;}}
    }
    const blank=r=>!r||(r.status==='unrecorded'&&(r.score===null||r.score===undefined||r.score===''));
    for(const a of data.activities){
      if(!a.students.some(id=>gone.has(id)))continue;
      for(const id of gone){const r=a.results[id];if(r&&blank(a.results[keepId]))a.results[keepId]=r;delete a.results[id];}
      a.students=uniq(a.students);
    }
    for(const g of data.goals)g.studentId=swap(g.studentId);
    for(const h of data.history||[])h.studentId=swap(h.studentId);
    for(const [key,text] of Object.entries(data.comments||{})){
      const [cid,sid,year]=key.split(':');if(!gone.has(sid))continue;
      const target=`${cid}:${keepId}:${year}`;delete data.comments[key];
      data.comments[target]=[data.comments[target],text].filter(Boolean).join('\n');
    }
    data.students=data.students.filter(s=>!gone.has(s.id));
    data.mergeLog??=[];data.mergeLog.unshift({id:uid(),keep:{id:keep.id,code:keep.code},merged:drops.map(s=>({id:s.id,code:s.code,name:s.name,en:s.en||''})),at:new Date().toISOString()});
    return keep;
  }
  function matchStudent(data,classId,text){
    const c=classOf(data,classId),p=nameParts(text);
    return sameLevelStudents(data,c).filter(s=>samePerson(p,studentParts(s)));
  }
  /* Fill in whichever half of the name the record was missing. */
  function completeName(s,text){
    const have=studentParts(s),add=nameParts(text),raw=String(text||'').trim();
    if(!have.latin&&add.latin){const latin=raw.replace(HAN,'').replace(/\s+/g,' ').trim();if(!s.en)s.en=latin;else s.name=`${latin} ${s.name}`;}
    if(!have.han&&add.han)s.name=`${s.name} ${add.han}`.trim();
  }
  /* Paste a list of names into a class: a student already taking another subject at this level is enrolled, not duplicated. */
  function enrollNames(data,classId,rawNames){
    const c=classOf(data,classId),out={created:[],linked:[],already:[],ambiguous:[]};
    const raw=rawNames.map(n=>String(n||'').trim()).filter(Boolean);
    if(!raw.length)throw Error('请贴上学生名字 / Paste student names');
    if(raw.some(n=>n.includes('\t')||n.length>60))throw Error('请只复制名字那一列，每个名字不超过 60 字 / Copy only the name column, up to 60 characters each');
    if(raw.some(n=>{const p=nameParts(n);return !p.latin&&!p.han;}))throw Error('有一行看起来不是名字 / One line does not look like a name');
    const names=raw.map(n=>n.replace(/\s+/g,' ')),handled=[];
    let next=data.students.length+1;
    for(const name of names){
      const p=nameParts(name);
      if(handled.some(q=>samePerson(p,q)))continue;handled.push(p);
      const matches=matchStudent(data,classId,name);
      if(matches.length>1){out.ambiguous.push(name);continue;}
      if(matches.length===1){const s=matches[0];completeName(s,name);(c.students.includes(s.id)?out.already:out.linked).push(s);if(!c.students.includes(s.id))c.students.push(s.id);continue;}
      let code;do{code=`S${String(next++).padStart(3,'0')}`;}while(data.students.some(s=>s.code===code));
      const s={id:uid(),name,en:'',code,tag:'',archived:false};data.students.push(s);c.students.push(s.id);out.created.push(s);
    }
    return out;
  }
  /* Natural order for levels: F1 < F2 < … < F10, Std 1 < Std 2, then anything else alphabetically. */
  function levelOrder(a,b){
    const k=v=>{const m=String(v||'').match(/^(.*?)(\d+)\s*$/);return m?[m[1].trim().toLowerCase(),Number(m[2])]:[String(v||'').toLowerCase(),-1];};
    const [pa,na]=k(a),[pb,nb]=k(b);return pa===pb?na-nb:pa.localeCompare(pb);
  }
  function saveClass(data,input){
    const grade=normLevel(input.grade),subject=String(input.subject||'').trim(),year=Number(input.year);
    if(!grade||grade.length>30)throw Error('请填写年级，例如 F3 / Enter a level, e.g. F3');
    if(!subject||subject.length>40)throw Error('请填写科目 / Enter a subject');
    if(!Number.isInteger(year)||year<2000||year>2100)throw Error('年份不对 / Invalid year');
    const days=[...new Set((input.days||[]).map(Number))].filter(d=>Number.isInteger(d)&&d>=0&&d<=6).sort((a,b)=>((a+6)%7)-((b+6)%7));
    const time=String(input.time||'').trim();
    if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('时间不对 / Invalid time');
    const custom=String(input.name||'').trim().slice(0,60),auto=`${grade} ${subject}`;
    let c=input.id?data.classes.find(x=>x.id===input.id):null;
    if(input.id&&!c)throw Error('找不到班级 / Class not found');
    const name=custom||auto;
    if(!c){
      let n=data.classes.length+1,code;do{code=`C${year}-${String(n++).padStart(3,'0')}`;}while(data.classes.some(x=>x.code===code));
      c={id:uid(),code,name,en:'',subject,grade,year,days,time,students:[],archived:false};data.classes.push(c);
    }else{
      if(c.name!==name)c.en='';
      Object.assign(c,{name,subject,grade,year,days,time});
    }
    return c;
  }
  /* Which class to open now: today's classes only; with times, the one running or starting next
     (a class counts as running for 2 hours after its start), else the most recent one today. */
  function classForNow(classes,now=new Date()){
    const today=classes.filter(c=>!c.archived&&(c.days||[]).includes(now.getDay()));
    if(!today.length)return null;
    const mins=now.getHours()*60+now.getMinutes(),start=c=>{const m=/^(\d\d):(\d\d)$/.exec(c.time||'');return m?Number(m[1])*60+Number(m[2]):null;};
    const timed=today.filter(c=>start(c)!==null).sort((a,b)=>start(a)-start(b));
    if(!timed.length)return today[0];
    return timed.find(c=>start(c)+120>mins)||timed[timed.length-1];
  }
  /* ---------- Class groups: each class keeps its own groups; a student belongs to at most one group per class. ---------- */
  function classOf(data,classId){const c=data.classes.find(c=>c.id===classId);if(!c)throw Error('找不到班级 / Class not found');return c;}
  function activeIds(data,c){const live=new Set(data.students.filter(s=>!s.archived).map(s=>s.id));return c.students.filter(id=>live.has(id));}
  /* Team colours: readable on light and dark backgrounds. Order = 红 橙 黄 绿 青 蓝 紫 粉. */
  const TEAM_COLORS=['#e5484d','#f76b15','#d4a017','#30a46c','#12a594','#3e63dd','#8e4ec6','#d6409f'];
  const nextColor=groups=>{const used=new Set(groups.map(g=>g.color));return TEAM_COLORS.find(c=>!used.has(c))||TEAM_COLORS[groups.length%TEAM_COLORS.length];};
  const roundOf=c=>Number.isInteger(c.scoreRound)&&c.scoreRound>0?c.scoreRound:1;
  function groupsOf(data,classId){
    const c=classOf(data,classId),inClass=new Set(activeIds(data,c)),round=roundOf(c);
    return (c.groups||[]).map((g,i)=>{const members=g.members.filter(id=>inClass.has(id));
      const score=(g.log||[]).filter(e=>(e.round||1)===round).reduce((sum,e)=>sum+e.delta,0);
      return {...g,members,leaderId:members.includes(g.leaderId)?g.leaderId:null,color:TEAM_COLORS.includes(g.color)?g.color:TEAM_COLORS[i%TEAM_COLORS.length],score};});
  }
  /* Points: an append-only log per group, so totals are explainable and a click can be undone. */
  function findGroup(data,classId,groupId){const c=classOf(data,classId),g=(c.groups||[]).find(x=>x.id===groupId);if(!g)throw Error('找不到这一组 / Group not found');return {c,g};}
  function addPoints(data,classId,groupId,delta,note=''){
    const {c,g}=findGroup(data,classId,groupId),n=Number(delta);
    if(!Number.isInteger(n)||n===0||Math.abs(n)>1000)throw Error('分数要是 -1000 到 1000 之间的整数，不能是 0 / Points must be a whole number from -1000 to 1000, not 0');
    g.log??=[];const entry={id:uid(),delta:n,note:String(note||'').trim().slice(0,60),round:roundOf(c),at:new Date().toISOString()};
    g.log.push(entry);return entry;
  }
  function removePoints(data,classId,groupId,entryId){const {g}=findGroup(data,classId,groupId);g.log=(g.log||[]).filter(e=>e.id!==entryId);}
  function resetPoints(data,classId){const c=classOf(data,classId);c.scoreRound=roundOf(c)+1;return c.scoreRound;}

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
    if(input.color!==undefined&&!TEAM_COLORS.includes(input.color))throw Error('请选择一个颜色 / Choose a colour');
    if(!g){g={id:uid(),color:input.color||nextColor(c.groups),log:[]};c.groups.push(g);}
    else if(input.color)g.color=input.color;
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
    c.groups=Array.from({length:n},(_,i)=>({id:uid(),name:`第${i+1}组`,en:`Group ${i+1}`,color:TEAM_COLORS[i%TEAM_COLORS.length],leaderId:null,members:[],log:[]}));c.scoreRound=1;
    order.forEach((id,i)=>c.groups[i%n].members.push(id));
    if(leaders)c.groups.forEach(g=>{g.leaderId=g.members[0]||null;});
    return c.groups;
  }
  const api={uid,complete,owed,pct,average,validScore,homeworkStats,examStats,examAlerts,updateResult,seed,periodEnd,scorePastePlan,editActivity,groupsOf,saveGroup,deleteGroup,autoGroups,TEAM_COLORS,addPoints,removePoints,resetPoints,enrollNames,matchStudent,levelOrder,saveClass,classForNow,normLevel,normalizeLevels,findDuplicates,mergeStudents};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.StudyCore=api;
})(globalThis);
