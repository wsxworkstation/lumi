const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=f=>fs.readFileSync(path.join(__dirname,'../dist/hook/',f),'utf8');
function preload(mode='ok'){
  const timers=[],made=[];
  class Image {
    constructor(){this.naturalWidth=128;this.naturalHeight=128;made.push(this);}
    set src(value){this.url=value;Promise.resolve().then(()=>{if(mode==='ok'||mode==='decode-error')this.onload?.();else if(mode==='error')this.onerror?.();});}
    decode(){return mode==='decode-error'?Promise.reject(Error('bad decode')):Promise.resolve();}
  }
  const ctx=vm.createContext({URL,Map,Object,Promise,Image,document:{currentScript:{src:'https://example.test/lumi/hook/art.js?v=abc1234'}},setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){}});
  vm.runInContext(source('art.js'),ctx);return {ctx,timers,made,art:ctx.HookArt};
}
test('complete transparent artwork pack stays below the 400KB mobile budget',async()=>{
  const {art}=preload();await art.ready;
  const dir=path.join(__dirname,'../dist/hook/img');let total=0;
  assert.equal(Object.keys(art.files).length,21);
  assert.deepEqual(fs.readdirSync(dir).sort(),Object.values(art.files).sort());
  for(const [key,file] of Object.entries(art.files)){
    const bytes=fs.readFileSync(path.join(dir,file));total+=bytes.length;
    if(file.endsWith('.png')){
      assert.equal(bytes.subarray(1,4).toString(),'PNG');
      const expected=key.startsWith('animal')?[128,128]:key.startsWith('fish')?[96,64]:key==='card-mystery'?[64,80]:[64,64];
      assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],expected);
      assert.ok(bytes.includes(Buffer.from('tRNS'))||bytes[25]===6,'sprite alpha preserved');
    }else assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  }
  assert.ok(total<=400000,`pack is ${total} bytes`);
});
test('preloader waits for decoding and versions every artwork URL',async()=>{
  const {art,made}=preload();assert.equal(art.revision,0);await art.ready;
  assert.equal(art.revision,21);assert.ok(art.get('animal-9'));assert.ok(art.get('fish-special'));assert.equal(art.get('missing'),null);
  for(const image of made){assert.ok(image.url.startsWith('https://example.test/lumi/hook/img/'));assert.ok(image.url.endsWith('?v=abc1234'));}
});
test('errors, decode failures, timeouts and late loads safely retain procedural fallbacks',async()=>{
  for(const mode of ['error','decode-error']){const {art}=preload(mode);await art.ready;assert.equal(art.revision,0);}
  const hung=preload('hang'),late=hung.made[0].onload;hung.timers.forEach(f=>f());await hung.art.ready;late();await Promise.resolve();await Promise.resolve();assert.equal(hung.art.revision,0);
  const ctx=vm.createContext({URL,Map,Object,Promise});vm.runInContext(source('art.js'),ctx);await ctx.HookArt.ready;assert.equal(ctx.HookArt.revision,0);
});
test('both page entries start once after preload settles, including rejected preload',async()=>{
  for(const failed of [false,true]){
    const appended=[],ctx=vm.createContext({URL,Promise,HookArt:{ready:failed?Promise.reject(Error('failed')):Promise.resolve()},document:{currentScript:{src:'https://example.test/lumi/hook/boot.js?v=abc',dataset:{entry:'host.js'}},createElement:()=>({}),body:{appendChild:s=>appended.push(s)}}});
    vm.runInContext(source('boot.js'),ctx);assert.equal(appended.length,0);await Promise.resolve();assert.equal(appended.length,1);assert.equal(appended[0].src,'https://example.test/lumi/hook/host.js?v=abc');
  }
  for(const [page,entry] of [['index.html','player.js'],['host.html','host.js']]){
    const html=source(page);assert.ok(html.indexOf('art.js?v=')<html.indexOf('engine.js?v='));assert.ok(html.includes(`data-entry="${entry}"`));assert.ok(html.includes('name="hook-version"'));
  }
});
function renderer(){
  const calls=[],images=new Map();let revision=0,offscreen=0;
  const context=canvas=>new Proxy({canvas,measureText:t=>({width:t.length*9}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),drawImage:(img,...args)=>calls.push([img.key||'scene',...args])},{get:(t,k)=>k in t?t[k]:(...args)=>{},set:(t,k,v)=>{if(k==='shadowBlur')throw Error('per-frame blur');t[k]=v;return true;}});
  const doc={createElement:()=>{offscreen++;const canvas={width:0,height:0,toDataURL:()=>`data:avatar-${calls.length}`};canvas.getContext=()=>context(canvas);return canvas;}};
  const ctx=vm.createContext({console,Map,Math,Date,document:doc,HookArt:{get:k=>images.get(k)||null,get revision(){return revision;}}});vm.runInContext(source('engine.js'),ctx);
  return {game:ctx.HookGame,calls,images,context,add:k=>{images.set(k,{key:k});revision++;},get offscreen(){return offscreen;}};
}
test('renderer switches assets independently and rebuilds cached scenery only on changes',()=>{
  const r=renderer(),canvas={width:1280,height:720},ctx=r.context(canvas),V={tc:2,players:[],hooks:[],orbs:[{id:1,k:'n',x:600,y:337}],drops:[{id:1,x:200,y:500}],rush:5000};
  r.game.render(ctx,1280,720,1,V,1000);const fallback=r.offscreen;r.game.render(ctx,1280,720,1,V,1016);assert.equal(r.offscreen,fallback);
  for(const key of ['lakeside','fish-normal','fish-gold','fish-special','card-mystery','rush-glow','animal-0'])r.add(key);
  r.game.render(ctx,1280,720,1,V,1032);assert.equal(r.offscreen,fallback+1);r.game.render(ctx,1280,720,1,V,1048);assert.equal(r.offscreen,fallback+1);
  assert.ok(r.calls.some(c=>c[0]==='lakeside'));assert.ok(r.calls.some(c=>c[0]==='fish-gold'),'rush ordinary fish uses gold');assert.ok(r.calls.some(c=>c[0]==='card-mystery'));assert.ok(r.calls.some(c=>c[0]==='rush-glow'));
  V.rush=0;V.orbs=[{id:1,k:'n',x:600,y:337},{id:2,k:'f',x:550,y:300},{id:3,k:'g',x:650,y:300}];r.game.render(ctx,1280,720,1,V,1064);
  for(const key of ['fish-normal','fish-gold','fish-special'])assert.ok(r.calls.some(c=>c[0]===key));
  r.game.drawAnimal(ctx,0,{team:1});assert.ok(r.calls.some(c=>c[0]==='animal-0'));
  const icon=r.game.animalIcon(0,64,1);r.add('animal-1');assert.notEqual(r.game.animalIcon(0,64,1),icon,'old fallback/avatar cache invalidated');
});
