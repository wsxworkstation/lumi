/* Template/runtime checks, not a substitute for a real browser visual review. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

function boot(saved,view){
  const elements=new Map(),stored=new Map();
  if(saved)stored.set('studylog-demo-v1',JSON.stringify(saved));
  if(view)stored.set('studylog-view-v1',JSON.stringify(view));
  function element(id){
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',handlers:{},classList:{add(){},remove(){},toggle(){}},addEventListener(name,fn){this.handlers[name]=fn;},querySelector(){return element('child');},showModal(){this.open=true;},close(){this.open=false;}});
    return elements.get(id);
  }
  const ctx=vm.createContext({console,structuredClone,crypto:crypto.webcrypto,document:{querySelector:element,documentElement:{}},window:{scrollTo(){},addEventListener(){}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},setTimeout(){},clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/core.js'),'utf8'),ctx);
  const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').replace(
    '  persist();render();\n})();',
    '  globalThis.testApp={state,render,selectClass,onClick,validateBackup,recordDate,studentNameLines,applyResults,undoLast,stat,getData:()=>data};persist();render();\n})();'
  );
  vm.runInContext(source,ctx);
  return {ctx,elements,stored,api:ctx.testApp};
}
test('all primary pages render in both languages for both sample classes',()=>{
  const {api,elements}=boot();
  for(const lang of ['zh','en'])for(const classId of ['c1','c2'])for(const page of ['overview','records','imports','students','student','classes','goals','settings','trash']){
    Object.assign(api.state,{lang,classId,page,studentId:classId==='c1'?'s1':'s9'});
    api.render();
    const html=elements.get('#content').innerHTML;
    assert.ok(html.length>200,`${page} ${lang}`);
    assert.ok(!html.includes('NaN'),page);
    assert.ok(!html.includes('undefined'),page);
  }
});
test('student tabs and exam filters render with missing and archived data',()=>{
  const {api,elements}=boot();
  for(const tab of ['progress','records','goals'])for(const examFilter of ['all','tuition','school','quiz']){
    Object.assign(api.state,{page:'student',tab,examFilter});api.render();
    assert.ok(elements.get('#content').innerHTML.includes('S001'));
  }
  api.getData().activities.forEach(a=>a.archived=true);api.render();
  assert.ok(elements.get('#content').innerHTML.length>100);
});
test('year switch shows empty state without changing original record dates',()=>{
  const {api,elements}=boot(),before=api.getData().activities.map(a=>a.date).join();
  api.state.year=2028;api.render();
  assert.ok(elements.get('#content').innerHTML.includes('这个年份还没有班级'));
  assert.equal(api.getData().activities.map(a=>a.date).join(),before);
  api.state.page='student';api.render();assert.equal(api.state.page,'students');
});
test('escaping protects names and notes in page templates',()=>{
  const {api,elements}=boot();api.getData().students[0].name='<img src=x onerror=alert(1)>';
  api.state.page='students';api.render();
  const html=elements.get('#content').innerHTML;
  assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;img'));
});
test('click navigation opens the correct record and student',()=>{
  const {api}=boot();
  const event=dataset=>({preventDefault(){},target:{closest(selector){return selector==='[data-action]'?{dataset}:null;}}});
  api.onClick(event({action:'open-activity',id:'c1-e7'}));
  assert.equal(api.state.page,'records');assert.equal(api.state.kind,'exam');assert.equal(api.state.activityId,'c1-e7');
  api.onClick(event({action:'student',id:'s4'}));assert.equal(api.state.page,'student');assert.equal(api.state.studentId,'s4');
});
test('saved data reloads and backup rejects unsafe identifiers',()=>{
  const first=boot(),saved=first.api.getData();saved.students[0].name='测试保存';
  const second=boot(saved);assert.equal(second.api.getData().students[0].name,'测试保存');
  second.api.validateBackup(saved);
  saved.students[0].id='"><img>';assert.throws(()=>second.api.validateBackup(saved));
});
test('remaining homework action never overwrites missing, late or made-up statuses',()=>{
  const {api}=boot(),a=api.getData().activities.find(a=>a.kind==='homework'&&a.classId==='c1');
  Object.assign(api.state,{page:'records',kind:'homework',activityId:a.id});
  const states=['missing','late','makeup','submitted','unrecorded'];
  a.students.forEach((id,i)=>a.results[id]={status:states[i%states.length],score:null,note:'keep'});
  const before=structuredClone(a.results);
  api.onClick({preventDefault(){},target:{closest:s=>s==='[data-action]'?{dataset:{action:'bulk-submit'}}:null}});
  for(const id of a.students){assert.equal(a.results[id].status,before[id].status==='unrecorded'?'submitted':before[id].status);assert.equal(a.results[id].note,'keep');}
});
test('record date uses selected class year and names split without losing Chinese text',()=>{
  const {api}=boot();
  api.getData().classes.find(c=>c.id===api.state.classId).year=2028;
  const date=api.recordDate();assert.match(date,/^2028-\d{2}-\d{2}$/);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  assert.equal(date.slice(5,7),today.find(p=>p.type==='month').value);
  const html=api.studentNameLines({name:'ABIGAIL LEE 李宛悦',en:''});
  assert.ok(html.includes('name-english">ABIGAIL LEE</span>'));assert.ok(html.includes('name-chinese">李宛悦</span>'));
  assert.ok(!api.studentNameLines({name:'<img>',en:''}).includes('<img>'));
});
test('last class, record and focused student restore without changing original data',()=>{
  const first=boot();Object.assign(first.api.state,{page:'records',classId:'c2',kind:'exam',activityId:'c2-e7',focusStudentId:'s9',month:'07'});first.api.render();
  const view=JSON.parse(first.stored.get('studylog-view-v1'));
  const second=boot(first.api.getData(),view);
  assert.equal(second.api.state.page,'records');assert.equal(second.api.state.classId,'c2');assert.equal(second.api.state.activityId,'c2-e7');assert.equal(second.api.state.focusStudentId,'s9');
});
test('homework correction is literal and undo restores the previous status',()=>{
  const {api}=boot(),a=api.getData().activities.find(a=>a.kind==='homework');
  Object.assign(api.state,{page:'records',activityId:a.id,kind:'homework',filter:'unrecorded'});a.results.s1.status='missing';
  api.onClick({preventDefault(){},target:{closest:s=>s==='[data-action]'?{dataset:{action:'homework-status',id:'s1',status:'submitted'}}:null}});
  assert.equal(a.results.s1.status,'submitted');api.undoLast();assert.equal(a.results.s1.status,'missing');
});
test('undo groups typed score edits and rolls back batch results without touching other students',()=>{
  const {api}=boot(),a=api.getData().activities.find(a=>a.kind==='tuition'),before=structuredClone(a.results);
  api.applyResults(a,[{sid:'s1',patch:{score:4}}],'typing');api.applyResults(a,[{sid:'s1',patch:{score:42}}],'typing');api.undoLast();
  assert.deepEqual(a.results.s1,before.s1);
  api.applyResults(a,[{sid:'s1',patch:{score:0}},{sid:'s2',patch:{status:'absent'}}]);api.undoLast();assert.equal(JSON.stringify(a.results),JSON.stringify(before));
  assert.throws(()=>api.applyResults(a,[{sid:'s1',patch:{score:10}},{sid:'s2',patch:{score:1000}}]));assert.equal(JSON.stringify(a.results),JSON.stringify(before));
});
test('overview has one add-student entry and selected month includes new homework',()=>{
  const {api,elements}=boot();api.getData().activities.push({id:'new-oct',classId:'c1',kind:'homework',date:'2027-10-25',max:1,students:['s1'],results:{s1:{status:'missing',score:null}}});
  api.state.month='10';api.render();assert.equal(api.stat('s1').missing,1);
  const html=elements.get('#content').innerHTML;assert.equal((html.match(/data-action="add-student"/g)||[]).length,1);assert.ok(html.includes('data-action="student-missing"'));
});
