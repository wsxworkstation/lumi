/* Hook Rush 勾题大作战 — music and sound effects, all made in code with the Web Audio API: no sound files, nothing to
   download, no licences. Every sound has 2–3 versions; PICK says which one the game uses (the teacher listens to all of
   them on sound.html and chooses). Pages call:
     HookAudio.setup({key, music})        which localStorage key holds this device's sound setting; music loudness 0–1
     HookAudio.unlock()                   on a tap (phones only allow sound after the user touches the screen)
     HookAudio.sfx('right')               a sound effect
     HookAudio.music('main'|'rush'|null)  background music (crossfades; null = stop)
     HookAudio.jingle('win'|'lose')       end-of-game tune (stops the music)
     HookAudio.tick(n)                    last-seconds ticking, n = seconds left
     HookAudio.mode = 'all'|'sfx'|'off'   music + effects / effects only / silent (remembered on this device) */
(root=>{
  'use strict';
  // The teacher's choice on sound.html (2026-11-22).
  const PICK={main:'C',rush:'B',win:'A',lose:'B',tick:'B',
    tap:'B',fire:'A',catch:'B',right:'A',wrong:'B',freeze:'B',count:'B',go:'A',card:'B',boom:'B',shield:'B',block:'B',power:'A',glow:'B',rushStart:'A',
    shoot:'A',slime:'A',whirl:'A',bomb:'A',ink:'A'};
  const LABEL={
    main:['背景音乐（平常）',{A:'木琴野餐',B:'泡泡 pop',C:'小游戏 chiptune'}],
    rush:['金鱼潮音乐',{A:'电吉他摇滚',B:'chiptune 摇滚',C:'电子冲刺'}],
    win:['赢了',{A:'胜利号角',B:'八音盒欢呼',C:'摇滚胜利'}],
    lose:['输了（辛苦了）',{A:'温柔木琴',B:'八音盒',C:'轻松吉他'}],
    tick:['最后 10 秒',{A:'时钟滴答',B:'心跳'}],
    tap:['按钮'],fire:['甩竿'],catch:['钓到鱼'],right:['答对'],wrong:['答错'],freeze:['冻住／冷冻'],count:['倒数 3-2-1'],go:['开始！'],
    card:['拿到卡'],boom:['击飞'],shield:['保护罩'],block:['保护罩挡住'],power:['加倍／放炸弹鱼'],glow:['发光金鱼出现'],rushStart:['金鱼潮开始'],
    shoot:['冰箭射出'],slime:['黏液落地'],whirl:['漩涡'],bomb:['炸弹鱼爆炸'],ink:['喷墨水']};

  /* ── Notes and chords ── */
  const mtof=m=>440*Math.pow(2,(m-69)/12);
  const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11},acc=s=>s==='#'?1:s==='b'?-1:0;
  function nm(s){const m=/^([A-G])([#b]?)(\d)$/.exec(s);if(!m)throw Error('bad note '+s);return 12*(+m[3]+1)+NOTE[m[1]]+acc(m[2]);}
  const QUAL={'':[0,4,7],m:[0,3,7],'7':[0,4,7,10],maj7:[0,4,7,11],m7:[0,3,7,10],sus4:[0,5,7],'5':[0,7,12]};
  function chordNotes(name,oct){const m=/^([A-G])([#b]?)(.*)$/.exec(name),iv=m&&QUAL[m[3]];if(!iv)throw Error('bad chord '+name);
    const r=12*(oct+1)+NOTE[m[1]]+acc(m[2]);return iv.map(i=>r+i);}

  /* ── The sound graph: everything → compressor → speakers, with a shared reverb ── */
  let A=null;   // {ac, out, music, sfx, verb, noise, curve}
  function impulse(ac,sec,decay){const len=Math.floor(ac.sampleRate*sec),b=ac.createBuffer(2,len,ac.sampleRate);
    for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay);}return b;}
  function build(ac){
    const o={ac};
    o.out=ac.createGain();o.out.gain.value=0.85;
    const comp=ac.createDynamicsCompressor();comp.threshold.value=-12;comp.knee.value=12;comp.ratio.value=5;comp.attack.value=0.003;comp.release.value=0.25;
    o.out.connect(comp);comp.connect(ac.destination);
    o.music=ac.createGain();o.sfx=ac.createGain();o.music.connect(o.out);o.sfx.connect(o.out);
    o.verb=ac.createConvolver();o.verb.buffer=impulse(ac,1.8,3);const vr=ac.createGain();vr.gain.value=0.3;o.verb.connect(vr);vr.connect(o.out);
    const n=ac.createBuffer(1,ac.sampleRate,ac.sampleRate),d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;o.noise=n;
    const c=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/511.5-1;c[i]=Math.tanh(x*6)/Math.tanh(6);}o.curve=c;   // guitar distortion
    return o;
  }
  const osc=(type,f,t)=>{const o=A.ac.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);return o;};
  const gain=(v=0)=>{const g=A.ac.createGain();g.gain.value=v;return g;};
  const filt=(type,f,q=0.7)=>{const b=A.ac.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;return b;};
  const noiseSrc=()=>{const s=A.ac.createBufferSource();s.buffer=A.noise;s.loop=true;return s;};
  const run=(nodes,t,end)=>{for(const n of nodes){n.start(t);n.stop(end);}};
  // Struck sound: quick attack, smooth exponential fall. Returns when it is silent.
  function perc(g,t,peak,dec,a=0.004){const p=g.gain;p.setValueAtTime(0.0001,t);p.exponentialRampToValueAtTime(Math.max(peak,0.0002),t+a);p.exponentialRampToValueAtTime(0.0001,t+a+dec);return t+a+dec+0.02;}
  // Held sound: attack, settle to a sustain level, hold until t+len, then release.
  function hold(g,t,peak,len,a=0.01,r=0.08,sus=0.8){const p=g.gain,end=t+Math.max(len,a+0.06);p.setValueAtTime(0.0001,t);p.linearRampToValueAtTime(peak,t+a);
    p.linearRampToValueAtTime(peak*sus,t+a+0.06);p.setValueAtTime(peak*sus,end);p.exponentialRampToValueAtTime(0.0001,end+r);return end+r+0.02;}

  /* ── Instruments: (time, midi note, length in seconds, velocity 0–1, destination) ── */
  const INST={
    marimba(t,m,len,v,dst){const f=mtof(m),a=osc('sine',f,t),b=osc('sine',f*4,t),g=gain(),g2=gain();
      a.connect(g);b.connect(g2);g.connect(dst);g2.connect(dst);run([a],t,perc(g,t,v,0.35+Math.min(len,0.5)));run([b],t,perc(g2,t,v*0.3,0.06,0.002));},
    bell(t,m,len,v,dst){const f=mtof(m),c=osc('sine',f,t),mo=osc('sine',f*3.5,t),mg=gain(),g=gain();
      mg.gain.setValueAtTime(f*1.6,t);mg.gain.exponentialRampToValueAtTime(f*0.05,t+0.5);mo.connect(mg);mg.connect(c.frequency);c.connect(g);g.connect(dst);
      run([c,mo],t,perc(g,t,v*0.8,1.1+Math.min(len,1),0.002));},
    pluck(t,m,len,v,dst){const f=mtof(m),a=osc('sawtooth',f,t),b=osc('triangle',f,t),lp=filt('lowpass',3800,1.5),bg=gain(0.6),g=gain();
      lp.frequency.setValueAtTime(3800,t);lp.frequency.exponentialRampToValueAtTime(600,t+0.25);
      a.connect(lp);b.connect(bg);bg.connect(lp);lp.connect(g);g.connect(dst);run([a,b],t,perc(g,t,v*0.7,0.35+Math.min(len,0.4)));},
    pad(t,m,len,v,dst){const f=mtof(m),a=osc('sawtooth',f,t),b=osc('sawtooth',f,t),lp=filt('lowpass',1100),g=gain();a.detune.value=-8;b.detune.value=8;
      a.connect(lp);b.connect(lp);lp.connect(g);g.connect(dst);run([a,b],t,hold(g,t,v*0.35,len,0.12,0.35,0.9));},
    bass(t,m,len,v,dst){const f=mtof(m),a=osc('triangle',f,t),b=osc('square',f,t),lp=filt('lowpass',520,2),bg=gain(0.35),g=gain();
      a.connect(lp);b.connect(bg);bg.connect(lp);lp.connect(g);g.connect(dst);run([a,b],t,hold(g,t,v,len*0.9,0.005,0.06,0.85));},
    square(t,m,len,v,dst){const f=mtof(m),a=osc('square',f,t),lp=filt('lowpass',4200),g=gain(),lfo=osc('sine',6,t),lg=gain();
      lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(f*0.006,t+0.25);lfo.connect(lg);lg.connect(a.frequency);
      a.connect(lp);lp.connect(g);g.connect(dst);run([a,lfo],t,hold(g,t,v*0.45,len*0.92,0.004,0.05,0.75));},
    saw(t,m,len,v,dst){const f=mtof(m),a=osc('sawtooth',f,t),b=osc('sawtooth',f,t),lp=filt('lowpass',3200,1),g=gain();a.detune.value=-7;b.detune.value=7;
      lp.frequency.setValueAtTime(5000,t);lp.frequency.exponentialRampToValueAtTime(2400,t+0.2);
      a.connect(lp);b.connect(lp);lp.connect(g);g.connect(dst);run([a,b],t,hold(g,t,v*0.4,len*0.95,0.006,0.08,0.8));},
    brass(t,m,len,v,dst){const f=mtof(m),a=osc('sawtooth',f,t),lp=filt('lowpass',600,1.2),g=gain(),lfo=osc('sine',5.5,t),lg=gain();
      lp.frequency.setValueAtTime(500,t);lp.frequency.linearRampToValueAtTime(2800,t+0.06);lp.frequency.exponentialRampToValueAtTime(1600,t+0.4);
      lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(f*0.008,t+0.3);lfo.connect(lg);lg.connect(a.frequency);
      a.connect(lp);lp.connect(g);g.connect(dst);run([a,lfo],t,hold(g,t,v*0.5,len,0.03,0.12,0.85));},
    // A distorted power chord built on the note (root, fifth, octave), like a rock guitar.
    guitar(t,m,len,v,dst){const mix=gain(0.33),sh=A.ac.createWaveShaper(),hp=filt('highpass',110),lp=filt('lowpass',3200,0.9),g=gain(),os=[];
      sh.curve=A.curve;sh.oversample='2x';
      for(const iv of [0,7,12])for(const d of [-9,9]){const o=osc('sawtooth',mtof(m+iv),t);o.detune.value=d;o.connect(mix);os.push(o);}
      mix.connect(sh);sh.connect(hp);hp.connect(lp);lp.connect(g);g.connect(dst);run(os,t,hold(g,t,v*0.32,len,0.004,0.06,0.75));},
    supersaw(t,m,len,v,dst){const lp=filt('lowpass',3800),g=gain(),os=[];
      for(const d of [-14,0,14]){const o=osc('sawtooth',mtof(m),t);o.detune.value=d;o.connect(lp);os.push(o);}
      lp.connect(g);g.connect(dst);run(os,t,hold(g,t,v*0.2,len,0.005,0.08,0.8));}
  };
  /* ── Drums: (time, velocity, destination) ── */
  const DRUM={
    kick(t,v,dst){const o=osc('sine',150,t),g=gain();o.frequency.exponentialRampToValueAtTime(45,t+0.12);o.connect(g);g.connect(dst);run([o],t,perc(g,t,v,0.32,0.002));
      const n=noiseSrc(),hp=filt('highpass',3000),ng=gain();n.connect(hp);hp.connect(ng);ng.connect(dst);run([n],t,perc(ng,t,v*0.25,0.015,0.001));},
    snare(t,v,dst){const n=noiseSrc(),bp=filt('bandpass',1900,0.8),g=gain();n.connect(bp);bp.connect(g);g.connect(dst);run([n],t,perc(g,t,v*0.55,0.17,0.002));
      const o=osc('triangle',190,t),og=gain();o.frequency.exponentialRampToValueAtTime(150,t+0.08);o.connect(og);og.connect(dst);run([o],t,perc(og,t,v*0.45,0.08,0.002));},
    clap(t,v,dst){const n=noiseSrc(),bp=filt('bandpass',1300,1.2),g=gain(),p=g.gain;n.connect(bp);bp.connect(g);g.connect(dst);p.setValueAtTime(0.0001,t);
      for(const k of [0,0.012,0.024]){p.setValueAtTime(v*0.5,t+k);p.exponentialRampToValueAtTime(v*0.05+0.0001,t+k+0.01);}
      p.setValueAtTime(v*0.45,t+0.035);p.exponentialRampToValueAtTime(0.0001,t+0.2);run([n],t,t+0.22);},
    hat(t,v,dst){const n=noiseSrc(),hp=filt('highpass',7500),g=gain();n.connect(hp);hp.connect(g);g.connect(dst);run([n],t,perc(g,t,v*0.25,0.04,0.001));},
    ohat(t,v,dst){const n=noiseSrc(),hp=filt('highpass',6500),g=gain();n.connect(hp);hp.connect(g);g.connect(dst);run([n],t,perc(g,t,v*0.22,0.22,0.002));},
    shaker(t,v,dst){const n=noiseSrc(),bp=filt('bandpass',6500,2.5),g=gain();n.connect(bp);bp.connect(g);g.connect(dst);run([n],t,perc(g,t,v*0.3,0.05,0.01));},
    crash(t,v,dst){const n=noiseSrc(),hp=filt('highpass',4500),g=gain();n.connect(hp);hp.connect(g);g.connect(dst);run([n],t,perc(g,t,v*0.35,1.3,0.002));},
    block(t,v,dst,f=1600){const a=osc('sine',f,t),b=osc('sine',f*1.5,t),g=gain();a.connect(g);b.connect(g);g.connect(dst);run([a,b],t,perc(g,t,v*0.8,0.06,0.001));}
  };

  /* ── Songs. Melodies are written one step per token ("-" holds, "." rests, "C5+E5" plays both); chord tracks
     strum ("x"), arpeggiate (digits = chord tone, 3 = root an octave up) or play bass ("R" root, "5" fifth, "O" octave). ── */
  const SONGS={
    main:{
      A:{bpm:116,bars:8,chords:['F','C','Dm','Bb','F','C','Bb','C'],tracks:[
        {inst:'marimba',vol:0.55,send:0.22,grid:8,mel:'C5 . A4 C5 F5 - E5 . | D5 . C5 - G4 - . . | A4 . D5 - F5 - E5 D5 | D5 - C5 - Bb4 - A4 . | C5 . A4 C5 F5 - G5 A5 | G5 - E5 - C5 - . . | D5 F5 D5 Bb4 C5 - D5 - | E5 - G5 - C5 . . .'},
        {inst:'pluck',vol:0.2,send:0.2,ch:'strum',oct:4,grid:8,pat:'.x.x.x.x'},
        {inst:'bass',vol:0.55,ch:'bass',oct:2,grid:8,pat:'R..R5.R.'},
        {drum:'kick',vol:0.55,pat:'x.......x.......'},
        {drum:'clap',vol:0.3,send:0.15,pat:'....x.......x...'},
        {drum:'shaker',vol:0.25,pat:'..x...x...x...x.'}]},
      B:{bpm:124,bars:8,chords:['G','Em','C','D'],tracks:[
        {inst:'bell',vol:0.45,send:0.3,grid:8,mel:'D5 . B4 D5 G5 - F#5 G5 | E5 - B4 - G4 - . . | C5 E5 G5 - E5 - C5 . | D5 - F#5 - A5 - . . | B5 - A5 G5 D5 - G5 . | E5 - G5 - B5 - A5 G5 | E5 - G5 - E5 C5 A4 . | F#5 - A5 - D5 - . .'},
        {inst:'pad',vol:0.3,send:0.3,ch:'strum',oct:4,grid:8,pat:'x-------'},
        {inst:'pluck',vol:0.18,send:0.15,ch:'arp',oct:4,grid:8,pat:'01210121'},
        {inst:'bass',vol:0.5,ch:'bass',oct:2,grid:8,pat:'R.R.5.R.'},
        {drum:'kick',vol:0.6,pat:'x.....x.x.......'},
        {drum:'snare',vol:0.32,send:0.1,pat:'....x.......x...'},
        {drum:'hat',vol:0.3,pat:'x.x.x.x.x.x.x.x.'}]},
      C:{bpm:132,bars:8,chords:['C','F','G','C','Am','F','G','C'],tracks:[
        {inst:'square',vol:0.38,send:0.12,grid:8,mel:'C5 E5 G5 E5 C6 - G5 . | A5 - F5 - C5 - A4 . | B4 D5 G5 D5 B5 - G5 . | C6 - G5 - E5 - . . | A4 C5 E5 C5 A5 - E5 . | F5 - A5 - C6 - A5 F5 | G5 - D5 - B4 D5 F5 . | E5 - D5 - C5 - . .'},
        {inst:'square',vol:0.1,ch:'arp',oct:4,grid:16,pat:'0123012301230123'},
        {inst:'bass',vol:0.5,ch:'bass',oct:2,grid:8,pat:'R.O.R.O.'},
        {drum:'kick',vol:0.55,pat:'x.......x.x.....'},
        {drum:'snare',vol:0.3,pat:'....x.......x...'},
        {drum:'hat',vol:0.25,pat:'x.x.x.x.x.x.x.x.'}]}},
    // Goldfish rush: fast and exciting (rock / pop).
    rush:{
      A:{bpm:160,bars:8,chords:['Em','C','G','D'],tracks:[
        {inst:'saw',vol:0.42,send:0.12,grid:8,mel:'E5 - D5 B4 G5 - E5 . | E5 G5 A5 G5 E5 - D5 . | B4 D5 E5 - G5 - A5 G5 | F#5 - D5 - A5 - . . | B5 - A5 G5 E5 - G5 . | A5 - G5 E5 C6 - B5 A5 | B5 - D6 - B5 A5 G5 - | F#5 - A5 - D6 - - .'},
        {inst:'guitar',vol:0.6,send:0.06,ch:'strum',root:1,oct:3,grid:8,pat:['xxxxxxxx','xxxxxxxx','xxxxxxxx','x-x-xxx-']},
        {inst:'bass',vol:0.55,ch:'bass',oct:2,grid:8,pat:'RRRRRRRR'},
        {drum:'kick',vol:0.85,pat:'x.....x.x.....x.'},
        {drum:'snare',vol:0.6,send:0.08,pat:['....x.......x...','....x.......x...','....x.......x...','....x.......xxxx']},
        {drum:'hat',vol:0.35,pat:'x.x.x.x.x.x.x.x.'},
        {drum:'crash',vol:0.45,pat:['x...............','................','................','................']}]},
      B:{bpm:168,bars:8,chords:['Am','F','C','G'],tracks:[
        {inst:'square',vol:0.4,send:0.1,grid:8,mel:'A4 C5 E5 C5 A5 - G5 E5 | F5 - A5 - C6 - A5 F5 | E5 G5 C6 G5 E5 - D5 C5 | D5 - G5 - B5 - D6 - | C6 - B5 A5 E5 - A5 C6 | D6 C6 A5 F5 C6 - A5 . | G5 - E5 G5 C6 - E6 - | D6 - B5 - G5 - D6 -'},
        {inst:'square',vol:0.09,ch:'arp',oct:4,grid:16,pat:'0120012001200120'},
        {inst:'bass',vol:0.5,ch:'bass',oct:2,grid:8,pat:'RRORRROR'},
        {drum:'kick',vol:0.8,pat:'x...x...x...x...'},
        {drum:'snare',vol:0.5,pat:['....x.......x...','....x.......x...','....x.......x...','....x.......x.xx']},
        {drum:'hat',vol:0.2,pat:'xxxxxxxxxxxxxxxx'},
        {drum:'crash',vol:0.4,pat:['x...............','................','................','................']}]},
      C:{bpm:140,bars:8,chords:['Dm','Bb','F','C'],tracks:[
        {inst:'saw',vol:0.4,send:0.15,grid:8,mel:'D5 - F5 - A5 - G5 F5 | F5 - D5 - Bb4 - C5 D5 | C5 - F5 - A5 - C6 - | G5 - E5 - C5 - E5 G5 | A5 - A5 G5 F5 - D5 - | D6 - C6 Bb5 F5 - D5 - | C6 - A5 - F5 - A5 C6 | E6 - D6 C6 G5 - E5 -'},
        {inst:'supersaw',vol:0.35,send:0.2,ch:'strum',oct:4,grid:8,pat:'.x.x.x.x'},
        {inst:'bass',vol:0.55,ch:'bass',oct:2,grid:8,pat:'.R.R.R.R'},
        {drum:'kick',vol:0.9,pat:'x...x...x...x...'},
        {drum:'clap',vol:0.45,send:0.12,pat:'....x.......x...'},
        {drum:'ohat',vol:0.35,pat:'..x...x...x...x.'},
        {drum:'crash',vol:0.4,pat:['x...............','................','................','................']}]}}
  };
  /* End-of-game tunes (played once, under 5 seconds). The losing one is warm and kind: "辛苦了", not a sad trombone. */
  const JINGLES={
    win:{
      A:{bpm:132,bars:2,chords:['C'],tracks:[
        {inst:'brass',vol:0.5,send:0.25,grid:16,mel:'G4 . C5 . E5 . G5 - - - E5 . G5 - - - | C5+E5+G5+C6 - - - - - - - - - - - - - - .'},
        {inst:'bell',vol:0.3,send:0.4,grid:16,mel:'. . . . . . . . . . . . . . . . | C6 E6 G6 C7 E7 - - - . . . . . . . .'},
        {inst:'bass',vol:0.5,grid:16,mel:'C3 . . . C3 . . . G2 . . . G2 . . . | C2 - - - - - - - - - - - - - - .'},
        {drum:'snare',vol:0.45,pat:['........ooooxxXX','................']},
        {drum:'kick',vol:0.8,pat:['x.......x.......','X...............']},
        {drum:'crash',vol:0.55,pat:['................','X...............']}]},
      B:{bpm:140,bars:2,chords:['F'],tracks:[
        {inst:'marimba',vol:0.5,send:0.2,grid:8,mel:'F5 A5 C6 F6 . A5 C6 . | F6+A5+C6 - - - - - - .'},
        {inst:'bell',vol:0.22,send:0.4,grid:8,mel:'F6 A6 C7 F7 . A6 C7 . | F7 - - - - - - .'},
        {inst:'pluck',vol:0.25,send:0.2,ch:'strum',oct:4,grid:8,pat:['x.x.x.x.','x-------']},
        {drum:'clap',vol:0.35,pat:['....x...x.x.x...','x...............']},
        {drum:'shaker',vol:0.3,pat:['x.x.x.x.x.x.x.x.','................']},
        {drum:'crash',vol:0.4,pat:['................','x...............']}]},
      C:{bpm:150,bars:3,chords:['E5'],tracks:[
        {inst:'guitar',vol:0.6,send:0.08,grid:8,mel:'E3 . E3 . E3 . D3 E3 | G3 - A3 - B3 - - - | E3 - - - - - - .'},
        {inst:'saw',vol:0.4,send:0.15,grid:8,mel:'B4 . B4 . B4 . A4 B4 | D5 - E5 - F#5 - - - | E5 - - - - - - .'},
        {drum:'kick',vol:0.85,pat:['x...x...x...x.x.','x...x...x...x...','X...............']},
        {drum:'snare',vol:0.55,pat:['....x.......x...','....x.......xxxx','................']},
        {drum:'crash',vol:0.5,pat:['x...............','................','X...............']}]}},
    lose:{
      A:{bpm:100,bars:2,chordBeats:2,chords:['F','G','C','C'],tracks:[
        {inst:'marimba',vol:0.55,send:0.3,grid:8,mel:'C5 A4 F4 A4 D5 B4 G4 B4 | E5 - - - C5 - - -'},
        {inst:'pad',vol:0.3,send:0.35,ch:'strum',oct:4,grid:8,pat:['x---x---','x-------']},
        {inst:'bell',vol:0.25,send:0.45,grid:8,mel:'. . . . . . . . | . . . . G6 - - -'},
        {inst:'bass',vol:0.4,ch:'bass',oct:2,grid:8,pat:['R---R---','R-------']}]},
      B:{bpm:96,bars:2,chordBeats:2,chords:['Am','F','G','C'],tracks:[
        {inst:'bell',vol:0.45,send:0.4,grid:8,mel:'E5 - C5 - A4 - C5 - | B4 - D5 - C5 - - -'},
        {inst:'pluck',vol:0.2,send:0.25,ch:'arp',oct:4,grid:8,pat:['01210121','01210---']},
        {inst:'pad',vol:0.22,send:0.3,ch:'strum',oct:3,grid:8,pat:['x---x---','x---x---']},
        {inst:'bass',vol:0.35,ch:'bass',oct:2,grid:8,pat:['R---R---','R---R---']}]},
      C:{bpm:100,bars:2,chordBeats:2,chords:['Fmaj7','Em7','Dm7','Cmaj7'],tracks:[
        {inst:'pluck',vol:0.3,send:0.3,ch:'strum',oct:4,grid:8,pat:['x--x-x--','x--x----']},
        {inst:'bell',vol:0.35,send:0.45,grid:8,mel:'A5 - - - G5 - - - | F5 - - - E5 - - -'},
        {inst:'bass',vol:0.4,ch:'bass',oct:2,grid:8,pat:['R---R---','R---R---']}]}}
  };

  function seq(str,grid){const toks=str.replace(/\|/g,' ').trim().split(/\s+/),step=4/grid,ev=[];let last=null;
    toks.forEach((tk,i)=>{if(tk==='-'){if(last)last.len+=step;return;}last=null;if(tk==='.')return;ev.push(last={at:i*step,notes:tk.split('+').map(nm),len:step});});return ev;}
  /* Turn a song into a sorted list of {at (beats), track, inst, notes (null = drum), len (beats), vel}. */
  const compiled=new Map();
  function compile(song){
    if(compiled.has(song))return compiled.get(song);
    const ev=[],cb=song.chordBeats||4,chordAt=at=>song.chords[Math.floor(at/cb+1e-6)%song.chords.length];
    song.tracks.forEach((tr,ti)=>{
      const grid=tr.grid||(tr.drum?16:8),step=4/grid,pats=[].concat(tr.pat||[]);
      if(tr.mel){for(const e of seq(tr.mel,grid))ev.push({at:e.at,tr:ti,inst:tr.inst,notes:e.notes,len:e.len,vel:tr.vel??0.8});return;}
      for(let b=0;b<song.bars;b++){
        const p=pats[b%pats.length].replace(/\s/g,'');let last=null;
        for(let i=0;i<p.length;i++){
          const c=p[i],at=b*4+i*step;
          if(tr.drum){if(c!=='.')ev.push({at,tr:ti,inst:tr.drum,notes:null,len:0,vel:c==='X'?1:c==='x'?0.75:0.45});continue;}
          if(c==='-'){if(last)last.len+=step;continue;}last=null;if(c==='.')continue;
          const name=chordAt(at),ch=chordNotes(name,tr.oct??4),root=chordNotes(name,2)[0];let notes;
          if(tr.ch==='bass')notes=[c==='5'?root+7:c==='O'?root+12:root];
          else if(tr.ch==='arp'){const k=+c;if(!(k>=0))throw Error('bad arp '+c);notes=[k<ch.length?ch[k]:ch[k-ch.length]+12];}
          else notes=tr.root?[ch[0]]:ch;
          ev.push(last={at,tr:ti,inst:tr.inst,notes,len:step,vel:tr.vel??0.7});
        }
      }
    });
    ev.sort((a,b)=>a.at-b.at);
    const c={song,beats:song.bars*4,events:ev};compiled.set(song,c);return c;
  }
  /* Play a compiled song from time t0 into dst. fill(until) schedules every note up to that time (call it often). */
  function startSong(c,t0,dst,loop){
    const spb=60/c.song.bpm,trs=c.song.tracks.map(tr=>{const g=gain(tr.vol??0.5);g.connect(dst);if(tr.send){const s=gain(tr.send);g.connect(s);s.connect(A.verb);}return g;});
    let i=0,n=0,done=false;
    return {
      fill(until){
        while(!done){
          if(i>=c.events.length){if(!loop){done=true;break;}i=0;n++;}
          const e=c.events[i],t=t0+(n*c.beats+e.at)*spb;if(t>until)break;i++;
          if(t<A.ac.currentTime-0.05)continue;   // skip notes that are already late (the tab was asleep)
          if(e.notes===null)DRUM[e.inst](t,e.vel,trs[e.tr]);else for(const m of e.notes)INST[e.inst](t,m,e.len*spb,e.vel,trs[e.tr]);
        }
      },
      length:c.beats*spb
    };
  }

  /* ── Sound effects: two versions each ── */
  const sweep=(type,f1,f2,dur,v,t,dst,a=0.005)=>{const o=osc(type,f1,t),g=gain();o.frequency.exponentialRampToValueAtTime(f2,t+dur);o.connect(g);g.connect(dst);run([o],t,perc(g,t,v,dur,a));};
  const hiss=(t,dst,type,f,q,v,dec,f2)=>{const n=noiseSrc(),b=filt(type,f,q),g=gain();if(f2)b.frequency.exponentialRampToValueAtTime(f2,t+dec);n.connect(b);b.connect(g);g.connect(dst);run([n],t,perc(g,t,v,dec,0.01));};
  const notes=(inst,list,t,step,v,dst,len=0.15)=>list.forEach((s,i)=>INST[inst](t+i*step,nm(s),len,v,dst));
  const sparkle=(t,d)=>['E7','G7','C8','A7'].forEach((s,i)=>INST.bell(t+i*0.05,nm(s),0.1,0.12,d));
  const SFX={
    tap:{A:(t,d)=>sweep('sine',480,1100,0.07,0.75,t,d,0.003),B:(t,d)=>INST.marimba(t,nm('C7'),0.05,0.3,d)},
    fire:{A:(t,d)=>{hiss(t,d,'bandpass',500,1.2,1.6,0.26,2800);sweep('sine',380,900,0.12,0.3,t,d);},
          B:(t,d)=>{hiss(t,d,'highpass',2200,0.7,0.35,0.12);INST.pluck(t+0.05,nm('G5'),0.1,0.35,d);}},
    catch:{A:(t,d)=>{sweep('sine',900,280,0.12,0.45,t,d);INST.bell(t+0.06,nm('E6'),0.2,0.25,d);},
           B:(t,d)=>{hiss(t,d,'lowpass',1600,0.7,0.8,0.25);sweep('sine',300,700,0.09,0.6,t,d);sweep('sine',350,800,0.09,0.5,t+0.07,d);}},
    right:{A:(t,d)=>{notes('marimba',['C6','E6','G6','C7'],t,0.06,0.5,d);INST.bell(t+0.24,nm('C7'),0.4,0.3,d);sparkle(t+0.2,d);},
           B:(t,d)=>{INST.square(t,nm('B5'),0.07,0.35,d);INST.square(t+0.07,nm('E6'),0.32,0.35,d);INST.bell(t+0.07,nm('E7'),0.3,0.2,d);}},
    // Wrong answers stay gentle: a soft "uh-oh", never a harsh buzzer.
    wrong:{A:(t,d)=>{for(const [k,s] of [[0,'E4'],[0.14,'C4']]){const o=osc('triangle',mtof(nm(s)),t+k),lp=filt('lowpass',1200),g=gain();o.connect(lp);lp.connect(g);g.connect(d);run([o],t+k,hold(g,t+k,0.45,0.14,0.01,0.12,0.7));}},
           B:(t,d)=>{INST.marimba(t,nm('D4'),0.2,0.6,d);INST.marimba(t+0.15,nm('A3'),0.3,0.6,d);}},
    freeze:{A:(t,d)=>{notes('bell',['C7','A6','E6','C6'],t,0.035,0.28,d,0.3);hiss(t,d,'highpass',6000,0.7,0.15,0.45);},
            B:(t,d)=>{sweep('sine',2400,600,0.25,0.4,t,d);INST.bell(t+0.05,nm('B6'),0.3,0.35,d);hiss(t,d,'bandpass',5000,2,0.4,0.3);}},
    count:{A:(t,d)=>INST.bell(t,nm('G5'),0.2,0.5,d),B:(t,d)=>INST.square(t,nm('A5'),0.12,0.7,d)},
    go:{A:(t,d)=>{for(const s of ['C5','E5','G5','C6'])INST.brass(t,nm(s),0.45,0.5,d);DRUM.crash(t,0.6,d);DRUM.kick(t,0.9,d);},
        B:(t,d)=>{notes('square',['C6','E6','G6','C7'],t,0.05,0.4,d,0.2);DRUM.crash(t+0.15,0.5,d);}},
    card:{A:(t,d)=>{notes('bell',['C6','E6','G6','B6','D7'],t,0.04,0.3,d,0.2);hiss(t,d,'highpass',3000,0.7,0.1,0.3,9000);},
          B:(t,d)=>notes('square',['C5','G5','C6','E6'],t,0.05,0.5,d,0.1)},
    boom:{A:(t,d)=>{const o=osc('sine',110,t),lfo=osc('sine',18,t),lg=gain(60),g=gain();o.frequency.exponentialRampToValueAtTime(520,t+0.3);
            lfo.connect(lg);lg.connect(o.frequency);o.connect(g);g.connect(d);run([o,lfo],t,perc(g,t,0.45,0.35,0.005));DRUM.kick(t,0.9,d);},
          B:(t,d)=>{DRUM.kick(t,1,d);hiss(t,d,'bandpass',900,0.9,0.55,0.15);sweep('sine',300,1200,0.3,0.2,t+0.05,d);}},
    shield:{A:(t,d)=>{hiss(t,d,'bandpass',800,1.5,0.25,0.4,5000);INST.bell(t+0.1,nm('E6'),0.4,0.3,d);INST.bell(t+0.18,nm('B6'),0.4,0.25,d);},
            B:(t,d)=>{sweep('sine',300,900,0.2,0.35,t,d);for(const s of ['E5','G#5','B5'])INST.pad(t+0.05,nm(s),0.4,0.5,d);}},
    block:{A:(t,d)=>{INST.bell(t,nm('A6'),0.2,0.5,d);hiss(t,d,'highpass',5000,0.7,0.3,0.03);},
           B:(t,d)=>{DRUM.kick(t,0.6,d);INST.bell(t+0.02,nm('E6'),0.3,0.35,d);}},
    power:{A:(t,d)=>notes('square',['C5','E5','G5','C6','E6'],t,0.045,0.32,d,0.07),
           B:(t,d)=>{sweep('sawtooth',200,1600,0.3,0.12,t,d);for(const s of ['G5','B5','D6'])INST.brass(t+0.25,nm(s),0.3,0.4,d);}},
    glow:{A:(t,d)=>notes('bell',['E6','G6','A6','C7','E7','G7'],t,0.07,0.22,d,0.3),
          B:(t,d)=>notes('pluck',['C5','D5','E5','G5','A5','C6','D6','E6'],t,0.035,0.35,d,0.2)},
    shoot:{A:(t,d)=>{hiss(t,d,'highpass',3000,0.7,0.6,0.18,9000);sweep('sine',2200,900,0.15,0.3,t,d);INST.bell(t+0.02,nm('E7'),0.15,0.3,d);},
           B:(t,d)=>{sweep('square',1800,400,0.12,0.25,t,d);INST.bell(t+0.03,nm('B6'),0.2,0.35,d);}},
    slime:{A:(t,d)=>{hiss(t,d,'lowpass',900,1.2,0.9,0.22);sweep('sine',420,120,0.22,0.6,t,d);sweep('sine',300,520,0.08,0.35,t+0.12,d);},
           B:(t,d)=>{for(const [k,f] of [[0,260],[0.08,340],[0.16,220]])sweep('sine',f,f*0.5,0.1,0.5,t+k,d);hiss(t,d,'lowpass',1200,0.7,0.6,0.2);}},
    // Whirlpool: water swirling down — a falling, wobbling "whoosh" (A), or bubbly plucks spiralling down (B).
    whirl:{A:(t,d)=>{const n=noiseSrc(),b=filt('bandpass',1800,3),lfo=osc('sine',9,t),lg=gain(500),g=gain();b.frequency.exponentialRampToValueAtTime(300,t+0.7);
             lfo.connect(lg);lg.connect(b.frequency);n.connect(b);b.connect(g);g.connect(d);run([n,lfo],t,hold(g,t,0.9,0.55,0.05,0.25,0.7));sweep('sine',700,180,0.6,0.25,t,d);},
           B:(t,d)=>{notes('pluck',['G6','E6','C6','A5','F5','D5','B4'],t,0.06,0.4,d,0.12);hiss(t,d,'lowpass',1400,0.7,0.35,0.5,400);}},
    // Bomb fish: a cartoon "kaboom" with a splash — a deep thump and crackle (A), or a pop and a fizzle (B). Never harsh.
    bomb:{A:(t,d)=>{DRUM.kick(t,1,d);sweep('sine',160,40,0.45,0.8,t,d);hiss(t,d,'lowpass',2400,0.7,1.1,0.5,300);hiss(t+0.08,d,'highpass',3500,0.7,0.25,0.35);},
          B:(t,d)=>{sweep('square',900,120,0.18,0.3,t,d);DRUM.kick(t+0.02,0.8,d);hiss(t+0.05,d,'bandpass',1200,0.8,0.8,0.45,250);INST.bell(t+0.25,nm('C5'),0.2,0.2,d);}},
    // Ink: a wet "splat" — a squelchy noise burst with a bend down (A), or a blobby "bloop" (B).
    ink:{A:(t,d)=>{hiss(t,d,'lowpass',1100,1.5,1.2,0.18,250);sweep('sine',520,90,0.2,0.6,t,d);sweep('triangle',300,150,0.12,0.3,t+0.1,d);},
         B:(t,d)=>{sweep('sine',200,600,0.08,0.55,t,d);sweep('sine',600,120,0.25,0.5,t+0.08,d);hiss(t+0.05,d,'bandpass',600,2,0.6,0.2);}},
    rushStart:{A:(t,d)=>{[['E3',0],['G3',0.18],['A3',0.36]].forEach(([s,k],i)=>{INST.guitar(t+k,nm(s),i===2?0.7:0.15,0.9,d);DRUM.kick(t+k,0.9,d);});DRUM.crash(t+0.36,0.6,d);DRUM.snare(t+0.36,0.6,d);},
               B:(t,d)=>{[[0,0.12],[0.18,0.12],[0.36,0.6]].forEach(([k,l])=>{for(const s of ['D5','F#5','A5'])INST.brass(t+k,nm(s),l,0.55,d);});DRUM.crash(t+0.36,0.55,d);DRUM.kick(t+0.36,0.8,d);}}
  };
  /* Last seconds: a clock (A) or a heartbeat (B); both get faster for the final 3 seconds. */
  const TICK={
    A(t,d,n){const hi=n<=3;DRUM.block(t,hi?1:0.85,d,n%2?1150:1550);INST.marimba(t,n%2?72:79,0.05,0.35,d);if(hi)DRUM.block(t+0.25,0.8,d,1900);},
    B(t,d,n){const beat=(tt,v)=>{const o=osc('sine',80,tt),g=gain();o.frequency.exponentialRampToValueAtTime(45,tt+0.15);o.connect(g);g.connect(d);run([o],tt,perc(g,tt,v,0.2,0.005));};
      beat(t,0.8);beat(t+0.18,0.55);if(n<=3){beat(t+0.5,0.8);beat(t+0.68,0.55);}DRUM.block(t,0.25,d,2100);}
  };

  /* ── Playing it live ── */
  let mode='all',key='lumi-hook-sound',musicLevel=0.5,want=null,cur=null,timer=null,unlocked=false;
  const store=(k,v)=>{try{if(v===undefined)return root.localStorage?.getItem(k);root.localStorage?.setItem(k,v);}catch{}return null;};
  const ver=(name,v)=>v||PICK[name]||'A';
  function levels(){if(!A)return;const t=A.ac.currentTime;A.out.gain.setTargetAtTime(mode==='off'?0:0.85,t,0.05);A.music.gain.setTargetAtTime(mode==='all'?musicLevel:0,t,0.1);}
  function ensure(){
    if(A)return true;
    const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return false;
    try{A=build(new AC());}catch{A=null;return false;}
    levels();
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!A)return;if(document.hidden)A.ac.suspend?.();else if(unlocked)A.ac.resume?.();});
    return true;
  }
  // One short "through" gain per sound, with a little reverb.
  function voice(bus,send=0.25,keep){const g=gain(1),s=gain(send);g.connect(bus);g.connect(s);s.connect(A.verb);
    if(!keep)setTimeout(()=>{try{g.disconnect();s.disconnect();}catch{}},6000);return g;}
  function stopMusic(){if(!cur)return;const old=cur;cur=null;const t=A.ac.currentTime;old.g.gain.setTargetAtTime(0,t,0.2);setTimeout(()=>{try{old.g.disconnect();}catch{}},1500);}
  function playMusic(){
    const name=mode==='all'?want:null,v=name&&ver(name);
    if((cur?.name||null)===name&&(!cur||cur.v===v))return;
    stopMusic();if(!name||!A)return;
    const g=gain(0),t=A.ac.currentTime;g.connect(A.music);g.gain.setTargetAtTime(1,t,0.15);
    cur={name,v,g,h:startSong(compile(SONGS[name][v]),t+0.08,g,true)};cur.h.fill(t+0.3);
    if(!timer)timer=setInterval(()=>{if(cur&&A)cur.h.fill(A.ac.currentTime+0.3);},40);
  }
  const api={
    PICK,LABEL,SONGS,JINGLES,SFX,TICK,compile,nm,chordNotes,
    setup(o={}){if(o.key)key=o.key;if(o.music!=null)musicLevel=o.music;
      const saved=store(key);mode=saved==='all'||saved==='sfx'||saved==='off'?saved:store('lumi-hook-mute')==='1'?'off':'all';levels();},
    get mode(){return mode;},
    set mode(v){if(!['all','sfx','off'].includes(v))return;mode=v;store(key,v);levels();if(A)playMusic();},
    get musicLevel(){return musicLevel;},
    set musicLevel(v){musicLevel=Math.max(0,Math.min(1,Number(v)||0));levels();},
    unlock(){if(!ensure())return;unlocked=true;try{A.ac.resume?.();const b=A.ac.createBufferSource();b.buffer=A.ac.createBuffer(1,1,22050);b.connect(A.out);b.start(0);}catch{}playMusic();},
    sfx(name,v){if(!A||mode==='off'||!SFX[name])return;const fn=SFX[name][ver(name,v)]||SFX[name].A;try{fn(A.ac.currentTime+0.01,voice(A.sfx));}catch{}},
    music(name,v){want=name||null;if(v&&name)PICK[name]=v;if(A)playMusic();},
    jingle(name,v){want=null;if(!A)return;stopMusic();if(mode==='off'||!JINGLES[name])return;
      const t=A.ac.currentTime+0.15,h=startSong(compile(JINGLES[name][ver(name,v)]),t,voice(A.sfx,0.3),false);h.fill(t+30);},
    tick(n,v){if(!A||mode==='off')return;try{TICK[ver('tick',v)](A.ac.currentTime+0.01,voice(A.sfx,0.15),n);}catch{}},
    get playing(){return cur?.name||null;},
    /* Render a sound into an offline buffer (for checking loudness in tests and for the preview page). */
    async render(kind,name,v,seconds){
      const OAC=root.OfflineAudioContext||root.webkitOfflineAudioContext;const ac=new OAC(2,Math.ceil(44100*seconds),44100);
      const saved=A;A=build(ac);
      try{const t=0.05;A.music.gain.value=0.5;A.sfx.gain.value=1;
        if(kind==='sfx')SFX[name][v](t,voice(A.sfx,0.25,true));
        else if(kind==='tick')TICK[v](t,voice(A.sfx,0.15,true),name);
        else startSong(compile((kind==='music'?SONGS:JINGLES)[name][v]),t,kind==='music'?A.music:voice(A.sfx,0.3,true),kind==='music').fill(seconds);
      }finally{A=saved;}
      return ac.startRendering();
    }
  };
  api.setup();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.HookAudio=api;
})(globalThis);
