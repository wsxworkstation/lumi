const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const A=require('../dist/hook/audio.js');

test('every sound the game uses has the chosen version', () => {
  for(const [name,v] of Object.entries(A.PICK)){
    const set=A.SONGS[name]||A.JINGLES[name]||(name==='tick'?A.TICK:A.SFX[name]);
    assert.ok(set,`${name} exists`);assert.ok(set[v],`${name} has version ${v}`);
    assert.ok(A.LABEL[name],`${name} has a name for the preview page`);
  }
  for(const name of Object.keys(A.SFX))assert.ok(A.SFX[name].A&&A.SFX[name].B,`${name}: two versions to choose from`);
});

test('songs and end tunes are well formed: melodies fill every bar, notes are in a sane range', () => {
  for(const [setName,set] of [['song',A.SONGS],['jingle',A.JINGLES]])for(const [name,vs] of Object.entries(set))for(const [v,s] of Object.entries(vs)){
    const c=A.compile(s),sec=c.beats*60/s.bpm,id=`${setName} ${name} ${v}`;
    for(const tr of s.tracks)if(tr.mel)assert.equal(tr.mel.replace(/\|/g,' ').trim().split(/\s+/).length,s.bars*(tr.grid||8),`${id}: melody length`);
    assert.ok(c.events.length>10,`${id}: has notes`);
    for(const e of c.events){assert.ok(e.at>=0&&e.at<c.beats,`${id}: note inside the loop`);if(e.notes)for(const m of e.notes)assert.ok(m>=24&&m<=108,`${id}: note ${m}`);}
    if(setName==='song')assert.ok(sec>=10&&sec<=20,`${id}: loop ${sec.toFixed(1)} s`);else assert.ok(sec<=5,`${id}: short (${sec.toFixed(1)} s)`);
  }
  assert.equal(A.nm('C4'),60);assert.equal(A.nm('F#5'),78);assert.equal(A.nm('Bb4'),70);
  assert.deepEqual(A.chordNotes('Am',4),[69,72,76]);assert.deepEqual(A.chordNotes('E5',3),[52,59,64]);
});

test('sound settings: three modes, remembered; nothing breaks without a sound card', () => {
  A.setup({key:'test-sound',music:0.3});
  for(const m of ['sfx','off','all']){A.mode=m;assert.equal(A.mode,m);}
  A.mode='loud';assert.equal(A.mode,'all','unknown mode ignored');
  A.musicLevel=2;assert.equal(A.musicLevel,1);
  assert.doesNotThrow(()=>{A.unlock();A.sfx('right');A.sfx('nope');A.music('main');A.music('rush');A.music(null);A.jingle('win');A.tick(3);});
  const G=require('../dist/hook/engine.js');
  assert.doesNotThrow(()=>{for(const k of ['fire','catch','right','wrong','tick','go','tap','card','power','boom','freeze','shield','block','glow','rush','win','lose'])G.sfx[k]();});
});

test('both game pages load the sound file before the engine', () => {
  for(const f of ['index.html','host.html','sound.html']){
    const html=fs.readFileSync(path.join(__dirname,'../dist/hook',f),'utf8');
    assert.ok(html.includes('./audio.js?v=__V__'),`${f} loads audio.js`);
    if(f!=='sound.html')assert.ok(html.indexOf('audio.js')<html.indexOf('engine.js'),`${f}: audio before engine`);
  }
  const wf=fs.readFileSync(path.join(__dirname,'../.github/workflows/pages.yml'),'utf8');
  assert.ok(wf.includes('dist/hook/sound.html'),'version number stamped into the preview page too');
});
