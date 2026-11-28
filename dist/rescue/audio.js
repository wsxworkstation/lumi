/* 太空站救援 — music and sound effects, all made with Web Audio while the game runs:
   no sound files to download and nothing anyone else owns. window.RescueAudio:
   setup({key,music}) · unlock() (after a tap) · mode 'all' | 'sfx' | 'off' · music('main' | 'final' | null) · sfx(name) · jingle('win'|'lose') · tick(n). */
(root=>{
  'use strict';
  let ctx=null,master=null,musicBus=null,sfxBus=null,mode='all',level=0.5,key='lumi-rescue-sound',playing=null,timer=0,step=0,nextAt=0,noiseBuf=null;
  const midi=n=>440*Math.pow(2,(n-69)/12);
  function setup(o={}){key=o.key||key;if(o.music!=null)level=o.music;try{const m=localStorage.getItem(key);if(m==='all'||m==='sfx'||m==='off')mode=m;}catch{}}
  function unlock(){
    if(!ctx){const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return;
      try{ctx=new AC();}catch{return;}
      const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;comp.connect(ctx.destination);
      master=ctx.createGain();master.gain.value=0.9;master.connect(comp);
      sfxBus=ctx.createGain();musicBus=ctx.createGain();sfxBus.connect(master);musicBus.connect(master);apply();
      if(playing){const p=playing;playing=null;music(p);}}
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  }
  function apply(){if(!ctx)return;sfxBus.gain.value=mode==='off'?0:1;musicBus.gain.value=mode==='all'?level*0.55:0;}
  const ok=()=>ctx&&ctx.state!=='closed';
  function tone(f,d,{type='sine',v=0.2,at=0,f2=0,a=0.006,bus=sfxBus}={}){
    const t=ctx.currentTime+Math.max(0,at),o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    o.connect(g);g.connect(bus);o.start(t);o.stop(t+d+0.05);
  }
  function noise(d,{v=0.2,at=0,f=1200,f2=0,q=1,type='bandpass',bus=sfxBus}={}){
    if(!noiseBuf){noiseBuf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const a=noiseBuf.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;}
    const t=ctx.currentTime+Math.max(0,at),s=ctx.createBufferSource(),fl=ctx.createBiquadFilter(),g=ctx.createGain();
    s.buffer=noiseBuf;s.loop=true;fl.type=type;fl.Q.value=q;fl.frequency.setValueAtTime(f,t);if(f2)fl.frequency.exponentialRampToValueAtTime(f2,t+d);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(v,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    s.connect(fl);fl.connect(g);g.connect(bus);s.start(t);s.stop(t+d+0.05);
  }
  const SFX={
    tap(){tone(1250,0.05,{type:'triangle',v:0.05});},
    right(){tone(660,0.12,{type:'triangle',v:0.17});tone(990,0.2,{type:'triangle',v:0.17,at:0.09});},
    gain(){[1320,1760,2093].forEach((f,i)=>tone(f,0.16,{v:0.07,at:0.18+i*0.05}));},
    wrong(){tone(330,0.18,{v:0.13,f2:290});tone(262,0.28,{v:0.12,at:0.15,f2:240});},
    put(){tone(520,0.08,{type:'square',v:0.045,f2:920});tone(1040,0.12,{v:0.07,at:0.06});},
    alarm(){for(let i=0;i<3;i++){tone(760,0.2,{type:'square',v:0.045,at:i*0.42});tone(570,0.2,{type:'square',v:0.045,at:i*0.42+0.21});}},
    fire(){noise(0.7,{f:700,f2:2200,v:0.16});},
    spread(){noise(0.45,{f:600,f2:1600,v:0.1});},
    out(){noise(0.8,{f:4200,f2:700,v:0.13,q:0.7});tone(1568,0.25,{v:0.05,at:0.3});},
    block(){[880,1320,1760].forEach((f,i)=>tone(f,0.5,{type:'triangle',v:0.08,at:i*0.05}));noise(0.4,{f:6000,type:'highpass',v:0.06});},
    hit(){tone(95,0.7,{v:0.42,f2:34});noise(0.6,{f:380,type:'lowpass',v:0.32});},
    twist(){[[45,0],[52,0],[57,0.02]].forEach(([n,at])=>{tone(midi(n),1.5,{type:'sawtooth',v:0.05,at});tone(midi(n),1.5,{type:'triangle',v:0.09,at});});noise(1.2,{f:200,f2:900,v:0.08});},
    vote(){tone(880,0.07,{type:'triangle',v:0.1});tone(1320,0.1,{type:'triangle',v:0.09,at:0.06});},
    board(){noise(0.6,{f:400,f2:3200,v:0.12});tone(440,0.45,{v:0.12,f2:990});},
    go(){[72,76,79,84].forEach((n,i)=>tone(midi(n),0.22,{type:'triangle',v:0.12,at:i*0.08}));},
    count(){tone(880,0.13,{v:0.14});},
    full(){tone(700,0.09,{type:'triangle',v:0.08});tone(700,0.09,{type:'triangle',v:0.08,at:0.13});}
  };
  function sfx(name){if(!ok()||mode==='off')return;const f=SFX[name];if(f)try{f();}catch{}}
  function jingle(name){if(!ok()||mode==='off')return;
    if(name==='win'){[[72,0],[76,0.14],[79,0.28],[84,0.42],[79,0.62],[84,0.78]].forEach(([n,at])=>{tone(midi(n),0.4,{type:'triangle',v:0.13,at});tone(midi(n-12),0.4,{v:0.08,at});});}
    else{[[67,0],[64,0.3],[60,0.6],[62,0.95],[60,1.3]].forEach(([n,at])=>tone(midi(n),0.6,{type:'triangle',v:0.1,at}));}
  }
  function tick(n){if(!ok()||mode==='off')return;tone(n<=3?1760:1320,0.05,{type:'square',v:n<=3?0.06:0.04});}
  /* Two little loops: a calm space tune, and a faster one for the last 90 seconds. */
  const TRACKS={
    main:{bpm:96,chords:[[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,64]],pat:[0,1,2,3,2,1,2,3],lead:'triangle',v:0.06,bass:[0,4],hat:false},
    final:{bpm:136,chords:[[57,60,64,69],[53,57,60,65],[55,59,62,67],[52,56,59,64]],pat:[0,1,2,3,1,2,3,2],lead:'triangle',v:0.055,bass:[0,1,2,3,4,5,6,7],hat:true}};
  function schedule(){
    const T=TRACKS[playing];if(!T||!ok())return;const dur=60/T.bpm/2;
    while(nextAt<ctx.currentTime+0.3){
      const bar=Math.floor(step/8)%T.chords.length,i=step%8,ch=T.chords[bar],at=nextAt-ctx.currentTime;
      tone(midi(ch[T.pat[i]]+12),dur*1.7,{type:T.lead,v:T.v,at,bus:musicBus});
      if(T.bass.includes(i))tone(midi(ch[0]-24),T.hat?dur*0.9:dur*3.6,{v:T.hat?0.11:0.15,at,bus:musicBus});
      if(T.hat)noise(0.035,{f:8000,type:'highpass',v:i%2?0.025:0.045,at,bus:musicBus});
      if(!T.hat&&i===0&&bar%2===1)tone(midi(ch[3]+24),0.5,{v:0.025,at:at+dur*4,bus:musicBus});
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
