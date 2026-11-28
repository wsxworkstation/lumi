/* 星环防线 — synth music and arcade sound effects, all made with Web Audio while the game runs:
   no sound files to download and nothing anyone else owns. window.RescueAudio:
   setup({key,music}) · unlock() (after a tap) · mode 'all' | 'sfx' | 'off' · music('main' | 'boss' | null) · sfx(name) · jingle('win'|'lose') · tick(n). */
(root=>{
  'use strict';
  let ctx=null,master=null,musicBus=null,sfxBus=null,mode='all',level=0.5,key='lumi-rescue-sound',playing=null,timer=0,step=0,nextAt=0,noiseBuf=null;
  const midi=n=>440*Math.pow(2,(n-69)/12);
  function setup(o={}){key=o.key||key;if(o.music!=null)level=o.music;try{const m=localStorage.getItem(key);if(m==='all'||m==='sfx'||m==='off')mode=m;}catch{}}
  function unlock(){
    if(!ctx){const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return;
      try{ctx=new AC();}catch{return;}
      const comp=ctx.createDynamicsCompressor();comp.threshold.value=-12;comp.ratio.value=5;comp.connect(ctx.destination);
      master=ctx.createGain();master.gain.value=0.9;master.connect(comp);
      sfxBus=ctx.createGain();musicBus=ctx.createGain();sfxBus.connect(master);musicBus.connect(master);apply();
      if(playing){const p=playing;playing=null;music(p);}}
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  }
  function apply(){if(!ctx)return;sfxBus.gain.value=mode==='off'?0:1;musicBus.gain.value=mode==='all'?level*0.6:0;}
  const ok=()=>ctx&&ctx.state!=='closed';
  // One note: an oscillator, optionally through a low-pass filter (warm synth), with a quick attack and a fade.
  function tone(f,d,{type='sine',v=0.2,at=0,f2=0,a=0.005,bus=sfxBus,lp=0,lp2=0}={}){
    const t=ctx.currentTime+Math.max(0,at),o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    let out=o;if(lp){const fl=ctx.createBiquadFilter();fl.type='lowpass';fl.frequency.setValueAtTime(lp,t);if(lp2)fl.frequency.exponentialRampToValueAtTime(lp2,t+d);o.connect(fl);out=fl;}
    out.connect(g);g.connect(bus);o.start(t);o.stop(t+d+0.05);
  }
  function noise(d,{v=0.2,at=0,f=1200,f2=0,q=1,type='bandpass',bus=sfxBus}={}){
    if(!noiseBuf){noiseBuf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const a=noiseBuf.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;}
    const t=ctx.currentTime+Math.max(0,at),s=ctx.createBufferSource(),fl=ctx.createBiquadFilter(),g=ctx.createGain();
    s.buffer=noiseBuf;s.loop=true;fl.type=type;fl.Q.value=q;fl.frequency.setValueAtTime(f,t);if(f2)fl.frequency.exponentialRampToValueAtTime(f2,t+d);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(v,t+0.005);g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    s.connect(fl);fl.connect(g);g.connect(bus);s.start(t);s.stop(t+d+0.05);
  }
  const kick=(at,bus=musicBus,v=0.5)=>tone(150,0.28,{v,at,f2:42,bus});
  const SFX={
    tap(){tone(1600,0.035,{type:'square',v:0.03,lp:3000});},
    laser(){tone(1500,0.13,{type:'square',v:0.05,f2:240,lp:4000});tone(3000,0.08,{type:'triangle',v:0.03,f2:700});},
    empty(){tone(220,0.04,{type:'square',v:0.05,lp:900});tone(180,0.04,{type:'square',v:0.04,at:0.06,lp:900});},
    hit(){noise(0.06,{f:3500,type:'highpass',v:0.12});tone(900,0.06,{type:'square',v:0.035,f2:420,lp:2500});},
    boom(){noise(0.4,{f:1400,f2:180,type:'lowpass',v:0.28});tone(130,0.32,{v:0.28,f2:48});},
    big(){noise(1.3,{f:1000,f2:70,type:'lowpass',v:0.42});tone(85,1.1,{v:0.5,f2:28});tone(170,0.5,{type:'sawtooth',v:0.06,f2:60,lp:600});},
    ring(){tone(72,0.55,{v:0.5,f2:38});noise(0.45,{f:600,f2:120,type:'lowpass',v:0.3});tone(440,0.09,{type:'square',v:0.05,at:0.05,lp:1500});tone(440,0.09,{type:'square',v:0.05,at:0.22,lp:1500});},
    gold(){[1047,1319,1568,2093,2637].forEach((f,i)=>tone(f,0.22,{type:'triangle',v:0.08,at:i*0.05}));noise(0.5,{f:7000,type:'highpass',v:0.05});},
    reload(){noise(0.03,{f:5000,type:'highpass',v:0.14});noise(0.04,{f:3000,type:'highpass',v:0.14,at:0.09});tone(330,0.18,{type:'square',v:0.05,f2:880,lp:2500,at:0.05});},
    right(){tone(660,0.1,{type:'square',v:0.06,lp:3000});tone(990,0.16,{type:'square',v:0.06,lp:3000,at:0.08});},
    wrong(){tone(150,0.22,{type:'sawtooth',v:0.1,lp:700});tone(120,0.3,{type:'sawtooth',v:0.1,lp:600,at:0.18});},
    warn(){for(let i=0;i<4;i++){tone(440,0.28,{type:'sawtooth',v:0.07,f2:700,lp:1800,at:i*0.55});tone(700,0.25,{type:'sawtooth',v:0.07,f2:440,lp:1800,at:i*0.55+0.28});}},
    king(){[33,40,45].forEach(n=>tone(midi(n),2.2,{type:'sawtooth',v:0.09,lp:500,lp2:120}));noise(1.6,{f:150,f2:600,v:0.12});},
    zap(){tone(1800,0.35,{type:'sawtooth',v:0.07,f2:120,lp:5000});noise(0.3,{f:2500,f2:400,v:0.12});},
    ufo(){for(let i=0;i<6;i++)tone(i%2?660:880,0.12,{type:'sine',v:0.06,at:i*0.11});},
    fleet(){[45,43,41,40].forEach((n,i)=>tone(midi(n),0.22,{type:'square',v:0.08,lp:700,at:i*0.3}));},
    blast(){noise(1,{f:1500,f2:90,type:'lowpass',v:0.45});tone(110,0.8,{v:0.45,f2:30});tone(55,0.9,{type:'sawtooth',v:0.05,lp:300});},
    rage(){tone(90,0.45,{type:'sawtooth',v:0.09,f2:260,lp:900});},
    wave(){[57,60,64,69].forEach((n,i)=>tone(midi(n+12),0.16,{type:'square',v:0.06,lp:3000,at:i*0.09}));tone(midi(45),0.6,{type:'sawtooth',v:0.06,lp:600,at:0.36});},
    go(){[60,64,67,72].forEach((n,i)=>tone(midi(n+12),0.18,{type:'square',v:0.06,lp:3500,at:i*0.07}));},
    count(){tone(880,0.12,{type:'square',v:0.06,lp:2500});},
    full(){tone(990,0.07,{type:'square',v:0.04,lp:2500});}
  };
  function sfx(name){if(!ok()||mode==='off')return;const f=SFX[name];if(f)try{f();}catch{}}
  function jingle(name){if(!ok()||mode==='off')return;
    if(name==='win'){[[57,0],[60,0.12],[64,0.24],[69,0.36],[72,0.56],[76,0.72]].forEach(([n,at])=>{tone(midi(n+12),0.5,{type:'sawtooth',v:0.06,lp:3000,at});tone(midi(n),0.6,{type:'square',v:0.05,lp:1500,at});});
      [45,52,57].forEach(n=>tone(midi(n),1.6,{type:'sawtooth',v:0.06,lp:900,at:0.72}));}
    else{[[69,0],[67,0.3],[64,0.6],[62,0.9],[57,1.3]].forEach(([n,at])=>tone(midi(n),0.55,{type:'triangle',v:0.1,at}));}
  }
  function tick(n){if(!ok()||mode==='off')return;tone(n<=3?1760:1320,0.05,{type:'square',v:n<=3?0.06:0.04,lp:4000});}
  /* Two loops: a driving synthwave tune, and a heavier, faster one for the Meteor King. */
  const TRACKS={
    main:{bpm:112,chords:[[57,60,64],[53,57,60],[48,52,55],[55,59,62]],arp:[0,1,2,1,0,1,2,1],kick:[0,4],hat:[2,6],v:0.045},
    boss:{bpm:132,chords:[[50,53,57],[46,50,53],[48,52,55],[45,49,52]],arp:[0,2,1,2,0,2,1,2],kick:[0,2,4,6],hat:[1,3,5,7],v:0.05}};
  function schedule(){
    const T=TRACKS[playing];if(!T||!ok())return;const dur=60/T.bpm/2;
    while(nextAt<ctx.currentTime+0.3){
      const bar=Math.floor(step/8)%T.chords.length,i=step%8,ch=T.chords[bar],at=nextAt-ctx.currentTime;
      tone(midi(ch[T.arp[i]]+24),dur*0.9,{type:'square',v:T.v,at,bus:musicBus,lp:2200});
      tone(midi(ch[0]-12),dur*0.85,{type:'sawtooth',v:0.09,at,bus:musicBus,lp:420});
      if(T.kick.includes(i))kick(at);
      if(T.hat.includes(i))noise(0.04,{f:8000,type:'highpass',v:0.035,at,bus:musicBus});
      if(i===0&&bar%2===0)tone(midi(ch[2]+12),dur*7.5,{type:'sawtooth',v:0.025,at,bus:musicBus,lp:900});
      step++;nextAt+=dur;
    }
  }
  function music(name){
    name=name||null;if(name===playing)return;playing=name;clearInterval(timer);timer=0;
    if(!name||!ctx)return;step=0;nextAt=ctx.currentTime+0.12;timer=setInterval(schedule,70);schedule();
  }
  root.RescueAudio={setup,unlock,sfx,music,jingle,tick,
    get mode(){return mode;},set mode(m){mode=m;try{localStorage.setItem(key,m);}catch{}apply();},
    get playing(){return playing;},set musicLevel(v){level=v;apply();}};
})(globalThis);
