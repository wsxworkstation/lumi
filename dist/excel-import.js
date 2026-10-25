(function(root){
  'use strict';
  const required={
    'Quick_成绩':['class_code','record_code','record_kind','title','date','maximum_score','student_code','status'],
    Students:['student_code','chinese_name'],Classes:['class_code','class_name','subject','grade','year'],Enrollments:['class_code','student_code'],Records:['record_code','class_code','record_kind','title','date','maximum_score'],Results:['record_code','student_code','status'],Goals:['goal_code','class_code','student_code','goal_title','exam_source','target_percentage']
  };
  const kindMap={'homework':'homework','功课':'homework','tuition exam':'tuition','补习考试':'tuition','school exam':'school','学校考试':'school','quiz':'quiz','小考':'quiz'};
  const statusMap={'submitted':'submitted','已交':'submitted','missing':'missing','未交':'missing','late':'late','迟交':'late','makeup':'makeup','补交':'makeup','unrecorded':'unrecorded','未记录':'unrecorded','recorded':'recorded','已记录':'recorded','absent':'absent','缺席':'absent'};
  const goalMap={'in progress':'progress','进行中':'progress','achieved':'achieved','已达成':'achieved','paused':'paused','暂停':'paused'};
  const id=prefix=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
  const clean=v=>String(v??'').trim();
  const code=v=>clean(v).toLowerCase();
  const truth=v=>v===''||v===true||['true','yes','1','active','是'].includes(code(v));
  const blank=v=>v===''||v===null||v===undefined;
  function table(rows,name,errors){
    if(!rows?.length)return [];
    const keys=required[name]||[];
    const hi=rows.findIndex(r=>keys.length&&keys.every(k=>r.map(clean).includes(k)));
    if(hi<0){if(rows.some(r=>r.some(v=>clean(v))))errors.push(`${name}: 找不到标准栏位 / standard headers not found`);return [];}
    const headers=rows[hi].map(clean),missing=keys.filter(k=>!headers.includes(k));
    if(missing.length){errors.push(`${name}: 缺少栏位 ${missing.join(', ')}`);return [];}
    return rows.slice(hi+1).map((r,i)=>({...Object.fromEntries(headers.map((h,j)=>[h,r[j]??''])),__row:hi+i+2})).filter(o=>clean(o[keys[0]]));
  }
  function parseKind(v){return kindMap[code(v)]||null;}
  function parseStatus(v){return statusMap[code(v)]||null;}
  function date(v){
    if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
    const s=clean(v),m=s.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})$/);if(!m)return null;
    const out=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`,d=new Date(`${out}T00:00:00Z`);
    return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==out?null:out;
  }
  function number(v,min,max){if(blank(v))return null;const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
  function buildPlan(book,current){
    const errors=[],warnings=[],next=structuredClone(current),counts={students:0,classes:0,enrollments:0,records:0,results:0,goals:0,updates:0};
    next.imports??=[];
    const quick=table(book.sheets['Quick_成绩'],'Quick_成绩',errors);
    const full={};for(const name of ['Students','Classes','Enrollments','Records','Results','Goals'])full[name]=table(book.sheets[name],name,errors);
    const fullCount=Object.values(full).reduce((n,r)=>n+r.length,0);
    if(quick.length&&fullCount)errors.push('请只填写 Quick_成绩 或完整资料页，不要两种同时填写。');
    const mode=quick.length?'quick':fullCount?'full':'empty';
    if(mode==='empty'&&!errors.length)errors.push('没有找到可导入的数据。请先填写 Template。');
    const students=new Map(next.students.map(s=>[code(s.code),s]));
    const classes=new Map(next.classes.map(c=>[code(c.code||c.id),c]));
    const records=new Map(next.activities.map(a=>[code(a.recordCode||a.id),a]));
    const seen=new Set();
    const err=(sheet,row,msg)=>errors.push(`${sheet} 第 ${row} 行：${msg}`);
    function addResult(a,s,row,raw,sheet){
      const key=`${a.id}:${s.id}`;if(seen.has(key)){err(sheet,row,'相同学生与记录重复 / duplicate student and record');return;}seen.add(key);
      const st=parseStatus(raw.status);if(!st){err(sheet,row,`无效状态 ${clean(raw.status)}`);return;}
      const allowed=a.kind==='homework'?['submitted','missing','late','makeup','unrecorded']:['recorded','absent','unrecorded'];
      if(!allowed.includes(st)){err(sheet,row,'状态与记录类型不相符 / status does not match record kind');return;}
      const score=number(raw.score,0,a.max);
      if(!blank(raw.score)&&score===null){err(sheet,row,`分数必须在 0–${a.max} 之间`);return;}
      if(st==='recorded'&&score===null){err(sheet,row,'Recorded 必须填写分数');return;}
      if(st==='absent'&&score!==null){err(sheet,row,'Absent 不应填写分数');return;}
      if(!a.students.includes(s.id)){err(sheet,row,'学生不在该记录所属班级');return;}
      if(a.results[s.id]&&a.results[s.id].status!=='unrecorded')counts.updates++;
      a.results[s.id]={...(a.results[s.id]||{}),status:st,score:st==='absent'?null:score,note:clean(raw.note)};counts.results++;
    }
    if(mode==='full'){
      for(const r of full.Students){const k=code(r.student_code);if(!k){err('Students',r.__row,'student_code 不能为空');continue;}let s=students.get(k);if(s){Object.assign(s,{name:clean(r.chinese_name)||s.name,en:clean(r.english_name),tag:clean(r.tag),archived:!truth(r.active)});counts.updates++;}else{s={id:id('student'),code:clean(r.student_code),name:clean(r.chinese_name),en:clean(r.english_name),tag:clean(r.tag),archived:!truth(r.active)};if(!s.name){err('Students',r.__row,'chinese_name 不能为空');continue;}next.students.push(s);students.set(k,s);counts.students++;}}
      for(const r of full.Classes){const k=code(r.class_code),year=number(r.year,2000,2100);if(!k||year===null){err('Classes',r.__row,'class_code 或 year 无效');continue;}let c=classes.get(k);if(c){Object.assign(c,{code:clean(r.class_code),name:clean(r.class_name)||c.name,en:clean(r.english_name),subject:clean(r.subject)||c.subject,grade:clean(r.grade)||c.grade,year,archived:!truth(r.active)});counts.updates++;}else{c={id:id('class'),code:clean(r.class_code),name:clean(r.class_name),en:clean(r.english_name),subject:clean(r.subject),grade:clean(r.grade),year,students:[],archived:!truth(r.active)};if(!c.name||!c.subject||!c.grade){err('Classes',r.__row,'班名、科目和年级不能为空');continue;}next.classes.push(c);classes.set(k,c);counts.classes++;}}
      for(const r of full.Enrollments){const c=classes.get(code(r.class_code)),s=students.get(code(r.student_code));if(!c||!s){err('Enrollments',r.__row,'找不到班级或学生编号');continue;}const active=code(r.status)!=='left';if(active&&!c.students.includes(s.id)){c.students.push(s.id);counts.enrollments++;}if(!active&&c.students.includes(s.id)){c.students=c.students.filter(x=>x!==s.id);counts.updates++;}}
      for(const r of full.Records){const k=code(r.record_code),c=classes.get(code(r.class_code)),kind=parseKind(r.record_kind),d=date(r.date),max=number(r.maximum_score,0.000001,1000000);if(!k||!c||!kind||!d||max===null){err('Records',r.__row,'编号、班级、类型、日期或满分无效');continue;}if(records.has(k)){err('Records',r.__row,'record_code 已存在；为避免覆盖，请使用新的编号');continue;}const results={};c.students.forEach(x=>results[x]={status:'unrecorded',score:null,note:''});const a={id:id('record'),recordCode:clean(r.record_code),classId:c.id,kind,type:clean(r.record_type)||clean(r.record_kind),title:clean(r.title),date:d,max,topic:clean(r.topic),note:clean(r.materials_note),students:[...c.students],results,archived:false};if(!a.title){err('Records',r.__row,'title 不能为空');continue;}next.activities.push(a);records.set(k,a);counts.records++;}
      for(const r of full.Results){const a=records.get(code(r.record_code)),s=students.get(code(r.student_code));if(!a||!s){err('Results',r.__row,'找不到 record_code 或 student_code');continue;}addResult(a,s,r.__row,r,'Results');}
      for(const r of full.Goals){const c=classes.get(code(r.class_code)),s=students.get(code(r.student_code)),target=number(r.target_percentage,0,100),kind=parseKind(r.exam_source),status=goalMap[code(r.status)]||'progress';if(!c||!s||target===null||!['tuition','school'].includes(kind)){err('Goals',r.__row,'班级、学生、目标分或考试来源无效');continue;}if(next.goals.some(g=>code(g.goalCode)===code(r.goal_code))){err('Goals',r.__row,'goal_code 已存在');continue;}next.goals.push({id:id('goal'),goalCode:clean(r.goal_code),classId:c.id,studentId:s.id,title:clean(r.goal_title),kind,target,status,note:clean(r.action_note),archived:false});counts.goals++;}
    }
    if(mode==='quick'){
      const groups=new Map();
      for(const r of quick){const c=classes.get(code(r.class_code)),s=students.get(code(r.student_code));if(!c||!s){err('Quick_成绩',r.__row,'找不到现有班级或学生编号');continue;}if(!c.students.includes(s.id)){err('Quick_成绩',r.__row,'学生不在该班级');continue;}const k=code(r.record_code);if(!k){err('Quick_成绩',r.__row,'record_code 不能为空');continue;}let g=groups.get(k);if(!g){g={rows:[],meta:r,c,s};groups.set(k,g);}g.rows.push({r,c,s});}
      for(const [k,g] of groups){let a=records.get(k);const kind=parseKind(g.meta.record_kind),d=date(g.meta.date),max=number(g.meta.maximum_score,0.000001,1000000);if(!kind||!d||max===null||!clean(g.meta.title)){err('Quick_成绩',g.meta.__row,'类型、标题、日期或满分无效');continue;}for(const x of g.rows)if(code(x.r.class_code)!==code(g.meta.class_code)||parseKind(x.r.record_kind)!==kind||date(x.r.date)!==d||number(x.r.maximum_score,0.000001,1000000)!==max||clean(x.r.title)!==clean(g.meta.title))err('Quick_成绩',x.r.__row,'同一 record_code 的资料必须一致');
        if(!a){const results={};g.c.students.forEach(x=>results[x]={status:'unrecorded',score:null,note:''});a={id:id('record'),recordCode:clean(g.meta.record_code),classId:g.c.id,kind,type:clean(g.meta.record_type)||clean(g.meta.record_kind),title:clean(g.meta.title),date:d,max,topic:'',note:'',students:[...g.c.students],results,archived:false};next.activities.push(a);records.set(k,a);counts.records++;}
        else if(a.classId!==g.c.id||a.kind!==kind||a.date!==d||a.max!==max){err('Quick_成绩',g.meta.__row,'现有 record_code 的班级、类型、日期或满分不同');continue;}
        for(const x of g.rows)addResult(a,x.s,x.r.__row,x.r,'Quick_成绩');
      }
    }
    const total=counts.students+counts.classes+counts.enrollments+counts.records+counts.results+counts.goals+counts.updates;
    if(total&&!errors.length)warnings.push(`即将新增或更新 ${total} 项资料；确认前不会写入。`);
    return {mode,counts,errors,warnings,total,nextData:next,importedAt:new Date().toISOString()};
  }
  const api={buildPlan,table,parseKind,parseStatus,date};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.ExcelImport=api;
})(globalThis);
