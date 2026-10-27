/* Light/dark display: generated dark.css stays in sync with the light sheets, and theme.js resolves modes. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');

test('dist/dark.css is regenerated from the current stylesheets',()=>{
  const out=path.join(os.tmpdir(),`lumi-dark-${process.pid}.css`);
  execFileSync(process.execPath,[path.join(root,'tools/build-dark.cjs')],{env:{...process.env,DARK_OUT:out},stdio:'ignore'});
  const fresh=fs.readFileSync(out,'utf8');fs.unlinkSync(out);
  assert.equal(fs.readFileSync(path.join(root,'dist/dark.css'),'utf8'),fresh,'run: node tools/build-dark.cjs');
  assert.ok(!/undefined|NaN/.test(fresh));
  assert.ok(fresh.includes('html[data-theme=dark]{--bg:'),'page background token remapped');
});

function run(stored,systemDark){
  const store=new Map(stored?[['lumi-theme',stored]]:[]),listeners=[],meta={attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
  const ctx=vm.createContext({
    document:{documentElement:{dataset:{}},querySelector:()=>meta},
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
    CustomEvent:class{constructor(n,o){this.type=n;this.detail=o?.detail;}},
  });
  ctx.window=ctx;ctx.dispatchEvent=()=>{};
  ctx.matchMedia=()=>({get matches(){return systemDark.value;},addEventListener:(n,f)=>listeners.push(f)});
  vm.runInContext(fs.readFileSync(path.join(root,'dist/theme.js'),'utf8'),ctx);
  return {ctx,store,meta,flipSystem(v){systemDark.value=v;listeners.forEach(f=>f());}};
}
test('theme follows the device by default and reacts when the device switches',()=>{
  const sys={value:true},t=run(null,sys);
  assert.equal(t.ctx.document.documentElement.dataset.theme,'dark');
  assert.equal(t.meta.attrs.content,'#141415');
  t.flipSystem(false);
  assert.equal(t.ctx.document.documentElement.dataset.theme,'light');
});
test('an explicit choice is remembered and ignores the device setting',()=>{
  const sys={value:false},t=run('dark',sys);
  assert.equal(t.ctx.document.documentElement.dataset.theme,'dark');
  t.ctx.LumiTheme.toggle();
  assert.equal(t.ctx.document.documentElement.dataset.theme,'light');
  assert.equal(t.store.get('lumi-theme'),'light');
  t.flipSystem(true);
  assert.equal(t.ctx.document.documentElement.dataset.theme,'light','manual light wins over a dark device');
  t.ctx.LumiTheme.set('nonsense');
  assert.equal(t.ctx.LumiTheme.mode,'auto');
});
