/* Cloud sync checks against an in-memory fake of the Supabase endpoints used by cloud.js. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/cloud.js'),'utf8');

function fakeServer(){
  const server={row:null,online:true,saves:0};
  server.fetch=async(url,opts={})=>{
    if(!server.online)throw new TypeError('Failed to fetch');
    const u=new URL(url),reply=(status,body)=>({ok:status<400,status,statusText:'',text:async()=>JSON.stringify(body),json:async()=>body});
    if(u.pathname==='/auth/v1/token'){
      const b=JSON.parse(opts.body);
      if(b.password==='wrong')return reply(400,{msg:'Invalid login credentials'});
      return reply(200,{access_token:'tok',refresh_token:'ref',expires_in:3600,user:{id:'u1',email:'t@example.com'}});
    }
    if(u.pathname==='/rest/v1/studylog_state')return reply(200,server.row?[structuredClone(server.row)]:[]);
    if(u.pathname==='/rest/v1/rpc/studylog_save'){
      const b=JSON.parse(opts.body),cur=server.row?.rev||0;
      if(b.p_base_rev!==cur)return reply(400,{message:'STUDYLOG_CONFLICT'});
      server.saves++;server.row={data:b.p_data,rev:cur+1,updated_at:'now',device:b.p_device};
      return reply(200,{rev:cur+1,updated_at:'now'});
    }
    return reply(404,{});
  };
  return server;
}

function device(server,stored=new Map()){
  const timers=[],els={},listeners={},loaded=[];
  const el=()=>({hidden:false,innerHTML:'',addEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[],focus(){},dataset:{},email:{value:'',focus(){}},password:{value:'',focus(){}}});
  const document={
    hidden:false,body:{appendChild:n=>{if(n.src)loaded.push(n.src);}},
    createElement:()=>({...el()}),querySelector:s=>els[s]||null,addEventListener:(n,f)=>{listeners[n]=f;}
  };
  const ctx=vm.createContext({
    console,structuredClone,URL,Blob:class{},JSON,Error,Promise,Number,String,Object,Date,Math,
    navigator:{userAgent:'Windows'},document,
    localStorage:{getItem:k=>stored.has(k)?stored.get(k):null,setItem:(k,v)=>stored.set(k,String(v)),removeItem:k=>stored.delete(k)},
    location:{reload(){ctx.reloaded=(ctx.reloaded||0)+1;}},
    setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},
    fetch:(...a)=>server.fetch(...a)
  });
  ctx.window=ctx;ctx.window.addEventListener=(n,f)=>{listeners[n]=f;};
  ctx.STUDYLOG_CLOUD={url:'https://x.supabase.co',key:'sb_publishable_test'};
  vm.runInContext(source,ctx);
  const settle=()=>new Promise(r=>setImmediate(r));
  async function flush(){for(let i=0;i<20;i++){await settle();const f=timers.shift();if(f)f();}await settle();}
  return {ctx,stored,loaded,flush,cloud:()=>ctx.StudyCloud};
}
const signedIn=()=>new Map([['studylog-cloud-session',JSON.stringify({access_token:'tok',refresh_token:'ref',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u1',email:'t@example.com'}})]]);
const doc=n=>JSON.stringify({version:1,n});

test('no session shows login and does not load the app',async()=>{
  const d=device(fakeServer());await d.flush();
  assert.equal(d.loaded.length,0);
});

test('first device uploads its data; unchanged startup does not push again',async()=>{
  const server=fakeServer(),stored=signedIn();stored.set('studylog-demo-v1',doc(1));
  const d=device(server,stored);await d.flush();
  assert.deepEqual(d.loaded,['./app.js']);
  d.cloud().changed(doc(1));await d.flush();
  assert.equal(server.row.rev,1);assert.equal(d.cloud().state,'synced');assert.equal(d.cloud().dirty,false);
  const again=device(server,stored);await again.flush();
  again.cloud().changed(stored.get('studylog-demo-v1'));await again.flush();
  assert.equal(server.saves,1,'startup persist of identical data must not upload');
});

test('second device pulls cloud data and edits upload with the next revision',async()=>{
  const server=fakeServer();server.row={data:{version:1,n:5},rev:3,updated_at:'x'};
  const stored=signedIn();const d=device(server,stored);await d.flush();
  assert.deepEqual(JSON.parse(stored.get('studylog-demo-v1')),{version:1,n:5});
  d.cloud().changed(doc(6));await d.flush();
  assert.equal(server.row.rev,4);assert.equal(server.row.data.n,6);assert.equal(d.cloud().state,'synced');
});

test('concurrent edits on two devices become a conflict, never a silent overwrite',async()=>{
  const server=fakeServer();server.row={data:{version:1,n:1},rev:1,updated_at:'x'};
  const a=device(server,signedIn()),b=device(server,signedIn());await a.flush();await b.flush();
  a.cloud().changed(doc(2));await a.flush();
  b.cloud().changed(doc(3));await b.flush();
  assert.equal(server.row.data.n,2,'B must not overwrite A');
  assert.equal(b.cloud().state,'conflict');assert.equal(b.cloud().dirty,true);
});

test('offline edits stay dirty locally and upload when back online',async()=>{
  const server=fakeServer();server.row={data:{version:1,n:1},rev:1,updated_at:'x'};
  const stored=signedIn();const d=device(server,stored);await d.flush();
  server.online=false;d.cloud().changed(doc(9));await d.flush();
  assert.equal(d.cloud().state,'offline');assert.equal(JSON.parse(stored.get('studylog-cloud-meta')).dirty,true);
  server.online=true;d.cloud().act();await d.flush();
  assert.equal(server.row.data.n,9);assert.equal(d.cloud().state,'synced');assert.equal(d.cloud().dirty,false);
});

test('reopening with unsynced edits and an unchanged cloud uploads them',async()=>{
  const server=fakeServer();server.row={data:{version:1,n:1},rev:1,updated_at:'x'};
  const stored=signedIn();stored.set('studylog-demo-v1',doc(7));stored.set('studylog-cloud-meta',JSON.stringify({owner:'u1',rev:1,dirty:true}));
  const d=device(server,stored);await d.flush();
  assert.equal(JSON.parse(stored.get('studylog-demo-v1')).n,7,'local edits must not be replaced by cloud');
  d.cloud().changed(stored.get('studylog-demo-v1'));await d.flush();
  assert.equal(server.row.data.n,7);
});

test('reopening with unsynced edits after another device saved shows conflict before loading',async()=>{
  const server=fakeServer();server.row={data:{version:1,n:1},rev:2,updated_at:'x'};
  const stored=signedIn();stored.set('studylog-demo-v1',doc(7));stored.set('studylog-cloud-meta',JSON.stringify({owner:'u1',rev:1,dirty:true}));
  const d=device(server,stored);await d.flush();
  assert.equal(d.loaded.length,0);assert.equal(d.cloud().state,'conflict');
  assert.equal(JSON.parse(stored.get('studylog-demo-v1')).n,7);
});
