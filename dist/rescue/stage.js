/* 太空站救援 — the big screen: the station seen from outside, six pastel rooms, the crew in space helmets.
   A 1200×675 world scaled to the window. The still parts (space, hull, corridors, rooms, furniture) are drawn once into
   a picture and reused; each frame only adds what moves: the engine turning, the oxygen tanks, fires, meteors seen
   through each room's porthole, the crew walking, and short effects. window.RescueStage.render(ctx, cw, ch, dpr, view, now, top). */
(root=>{
  'use strict';
  const R=root.RescueGame,C=R.C,TAU=Math.PI*2;
  const FUN='"Fredoka","ZCOOL KuaiLe",system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  const W=1200,H=675;
  const BOX=i=>({x:70+(i%3)*370,y:92+Math.floor(i/3)*290,w:320,h:244});
  const TINT=['#dfe8ff','#ece4ff','#ffe6da','#dcf5ea','#fff1cc','#f3e8dc'],EDGE=['#8fa6ec','#ab98ec','#f0a184','#74cba4','#efc75a','#cdb08c'];
  const FLOOR=['#c9d6fb','#d9cdfb','#fbd0bd','#c2ead8','#fbe3a6','#e6d3be'];
  const PORT=i=>{const b=BOX(i);return {x:b.x+b.w-38,y:b.y+38,r:24};};
  const ENG=()=>{const b=BOX(C.ENGINE);return {x:b.x+225,y:b.y+126};};
  const POD=()=>{const b=BOX(C.POD);return {x:b.x+160,y:b.y+64,w:142,h:108};};
  const TANKS=()=>{const b=BOX(C.OXYGEN);return [{x:b.x+176,y:b.y+70,w:46,h:104},{x:b.x+236,y:b.y+70,w:46,h:104}];};
  const pillAt=(i,n)=>{const b=BOX(i);return {x:b.x+14,y:b.y+52+n*38};};
  const IMG=[];
  if(typeof Image==='function')for(let i=0;i<R.ANIMALS.length;i++){const im=new Image();im.src=R.avatarSrc(i);IMG.push(im);}
  const hash=s=>{let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))>>>0;return h;};

  function rr(c,x,y,w,h,r){r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
  function viewport(cw,ch,top=0){const k=Math.min(cw/W,(ch-top)/H);return {k,ox:(cw-W*k)/2,oy:top+(ch-top-H*k)/2};}
  function text(c,s,x,y,{size=16,color='#3a3360',weight=700,align='center',base='middle',outline=''}={}){
    c.font=`${weight} ${size}px ${FUN}`;c.textAlign=align;c.textBaseline=base;
    if(outline){c.lineJoin='round';c.lineWidth=Math.max(3,size/4);c.strokeStyle=outline;c.strokeText(s,x,y);}
    c.fillStyle=color;c.fillText(s,x,y);
  }
  function stars(c,x,y,w,h,n,seed){const rnd=R.rng(seed);for(let i=0;i<n;i++){const s=rnd()*1.6+0.4;c.globalAlpha=0.35+rnd()*0.65;
    c.fillStyle=rnd()<0.15?'#ffd6f2':rnd()<0.3?'#cfe3ff':'#ffffff';c.beginPath();c.arc(x+rnd()*w,y+rnd()*h,s,0,TAU);c.fill();}c.globalAlpha=1;}

  /* ── The still picture ── */
  let bg=null,bgScale=0;
  function furniture(c,i,b){
    c.lineWidth=3;c.lineJoin='round';
    if(i===0){   // bridge: star map and the captain's desk
      rr(c,b.x+156,b.y+62,96,52,10);c.fillStyle='#232a6b';c.fill();c.strokeStyle=EDGE[i];c.stroke();
      c.save();rr(c,b.x+156,b.y+62,96,52,10);c.clip();stars(c,b.x+156,b.y+62,96,52,22,11);
      c.strokeStyle='#7fe0ff';c.lineWidth=1.5;c.setLineDash([3,4]);c.beginPath();c.moveTo(b.x+166,b.y+104);c.quadraticCurveTo(b.x+200,b.y+70,b.x+242,b.y+90);c.stroke();c.setLineDash([]);c.restore();
      rr(c,b.x+150,b.y+132,150,26,12);c.fillStyle='#a9b9ee';c.fill();c.strokeStyle=EDGE[i];c.lineWidth=3;c.stroke();
      ['#ff8fb1','#ffd84d','#79e0b5','#7fb8ff'].forEach((col,k)=>{c.fillStyle=col;c.beginPath();c.arc(b.x+172+k*30,b.y+145,5.5,0,TAU);c.fill();});
    }else if(i===1){   // control room: three screens
      for(let k=0;k<3;k++){const x=b.x+150+k*52;rr(c,x,b.y+70,44,36,7);c.fillStyle='#262b66';c.fill();c.strokeStyle=EDGE[i];c.stroke();
        c.strokeStyle=['#79e0b5','#ffd84d','#ff8fb1'][k];c.lineWidth=2;c.beginPath();
        for(let s=0;s<5;s++){const px=x+6+s*8,py=b.y+92-((s*7+k*5)%14);s?c.lineTo(px,py):c.moveTo(px,py);}c.stroke();
        c.fillStyle=EDGE[i];c.fillRect(x+19,b.y+106,6,10);c.lineWidth=3;}
      rr(c,b.x+146,b.y+116,160,14,7);c.fillStyle='#c6b8f3';c.fill();
    }else if(i===2){   // engine: the housing (the turbine itself moves)
      const e=ENG();c.beginPath();c.arc(e.x,e.y,60,0,TAU);c.fillStyle='#ffd3bf';c.fill();c.strokeStyle=EDGE[i];c.lineWidth=4;c.stroke();
      for(let k=0;k<8;k++){const a=k*TAU/8;c.fillStyle='#e39a7c';c.beginPath();c.arc(e.x+Math.cos(a)*53,e.y+Math.sin(a)*53,3,0,TAU);c.fill();}
    }else if(i===3){   // oxygen: two tanks (filled each frame)
      for(const t of TANKS()){rr(c,t.x,t.y,t.w,t.h,22);c.fillStyle='#ffffff';c.fill();c.strokeStyle=EDGE[i];c.lineWidth=4;c.stroke();
        c.fillStyle=EDGE[i];c.fillRect(t.x+t.w/2-7,t.y-9,14,10);}
      text(c,'O₂',b.x+258,b.y+192,{size:15,color:'#3c9a76'});
    }else if(i===4){   // the escape pod
      const p=POD();rr(c,p.x,p.y,p.w,p.h,48);c.fillStyle='#ffffff';c.fill();c.strokeStyle=EDGE[i];c.lineWidth=4;c.stroke();
      c.beginPath();c.moveTo(p.x+p.w-12,p.y+20);c.lineTo(p.x+p.w+10,p.y+p.h/2);c.lineTo(p.x+p.w-12,p.y+p.h-20);c.fillStyle='#ffb36b';c.fill();
      for(let k=0;k<3;k++){c.beginPath();c.arc(p.x+34+k*36,p.y+38,11,0,TAU);c.fillStyle='#bfe4ff';c.fill();c.strokeStyle=EDGE[i];c.lineWidth=3;c.stroke();}
    }else{   // cargo: crates
      for(const [x,y,w,h] of [[160,120,58,58],[224,120,58,58],[192,64,58,54]]){rr(c,b.x+x,b.y+y,w,h,8);c.fillStyle='#e8c9a1';c.fill();c.strokeStyle='#b8925f';c.lineWidth=3;c.stroke();
        c.beginPath();c.moveTo(b.x+x+8,b.y+y+8);c.lineTo(b.x+x+w-8,b.y+y+h-8);c.moveTo(b.x+x+w-8,b.y+y+8);c.lineTo(b.x+x+8,b.y+y+h-8);c.lineWidth=2;c.stroke();}
    }
  }
  function scenery(scale){
    const cv=document.createElement('canvas');cv.width=Math.ceil(W*scale);cv.height=Math.ceil(H*scale);const c=cv.getContext('2d');c.scale(scale,scale);
    const sky=c.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#121848');sky.addColorStop(1,'#2b1d5e');c.fillStyle=sky;c.fillRect(0,0,W,H);
    stars(c,0,0,W,H,190,7);
    // a pink planet peeking in and a small moon
    const pl=c.createRadialGradient(1120,690,40,1150,720,230);pl.addColorStop(0,'#ffb3d6');pl.addColorStop(1,'#8a6cf0');
    c.fillStyle=pl;c.beginPath();c.arc(1160,730,215,0,TAU);c.fill();
    c.strokeStyle='rgba(255,220,240,.45)';c.lineWidth=7;c.beginPath();c.ellipse(1160,730,300,58,-0.25,Math.PI*1.03,Math.PI*1.62);c.stroke();
    c.fillStyle='#ffe9a8';c.beginPath();c.arc(40,40,16,0,TAU);c.fill();c.fillStyle='rgba(0,0,0,.08)';c.beginPath();c.arc(45,36,5,0,TAU);c.fill();
    // the station's hull
    rr(c,40,66,W-80,H-84,36);c.fillStyle='#323a7e';c.fill();c.strokeStyle='#6470c4';c.lineWidth=6;c.stroke();
    rr(c,50,76,W-100,H-104,30);c.strokeStyle='rgba(255,255,255,.08)';c.lineWidth=2;c.stroke();
    for(let k=0;k<26;k++){c.fillStyle='rgba(255,255,255,.18)';c.beginPath();c.arc(70+k*41.5,71,2,0,TAU);c.fill();}
    // corridors
    for(const [a,b] of R.LINKS){const A=BOX(a),B=BOX(b);c.fillStyle='#525ca6';
      if(Math.floor(a/3)===Math.floor(b/3)){const x=A.x+A.w-4,y=A.y+A.h-70;rr(c,x,y,B.x-x+4,52,10);c.fill();
        c.fillStyle='rgba(255,255,255,.13)';for(let s=x+10;s<B.x;s+=14)c.fillRect(s,y+24,7,4);}
      else{const x=A.x+A.w/2-28,y=A.y+A.h-4;rr(c,x,y,56,B.y-y+4,10);c.fill();
        c.fillStyle='rgba(255,255,255,.13)';for(let s=y+8;s<B.y;s+=12)c.fillRect(x+25,s,6,4);}}
    // rooms
    R.ROOMS.forEach((room,i)=>{const b=BOX(i);
      rr(c,b.x,b.y,b.w,b.h,24);c.fillStyle=TINT[i];c.fill();
      c.save();rr(c,b.x,b.y,b.w,b.h,24);c.clip();c.fillStyle=FLOOR[i];c.fillRect(b.x,b.y+b.h-70,b.w,70);
      c.fillStyle='rgba(255,255,255,.35)';for(let s=b.x+8;s<b.x+b.w;s+=40)c.fillRect(s,b.y+b.h-70,2,70);c.restore();
      rr(c,b.x,b.y,b.w,b.h,24);c.strokeStyle=EDGE[i];c.lineWidth=5;c.stroke();
      furniture(c,i,b);
      const P=PORT(i);c.beginPath();c.arc(P.x,P.y,P.r+5,0,TAU);c.fillStyle='#b7c2e6';c.fill();
      c.save();c.beginPath();c.arc(P.x,P.y,P.r,0,TAU);c.fillStyle='#161d52';c.fill();c.clip();stars(c,P.x-P.r,P.y-P.r,P.r*2,P.r*2,9,30+i);c.restore();
      c.font=`700 18px ${FUN}`;const w=c.measureText(room.zh).width;c.font=`600 12px ${FUN}`;const w2=c.measureText(room.en).width;
      rr(c,b.x+12,b.y+12,w+w2+30,30,15);c.fillStyle='rgba(255,255,255,.9)';c.fill();
      text(c,room.zh,b.x+24,b.y+28,{size:18,align:'left'});text(c,room.en,b.x+30+w,b.y+29,{size:12,weight:600,color:'#8a83a8',align:'left'});
    });
    return cv;
  }

  /* ── Moving parts ── */
  function flame(c,x,y,h,w,col){c.beginPath();c.moveTo(x-w,y);c.bezierCurveTo(x-w,y-h*0.5,x-w*0.2,y-h*0.7,x,y-h);c.bezierCurveTo(x+w*0.2,y-h*0.7,x+w,y-h*0.5,x+w,y);c.closePath();c.fillStyle=col;c.fill();}
  function fire(c,i,now){
    const b=BOX(i),pulse=0.5+0.5*Math.sin(now/180);
    c.save();rr(c,b.x,b.y,b.w,b.h,24);c.clip();
    c.fillStyle=`rgba(255,96,48,${0.14+pulse*0.08})`;c.fillRect(b.x,b.y,b.w,b.h);
    for(let k=0;k<3;k++){const t=(now/2400+k/3)%1;c.globalAlpha=(1-t)*0.35;c.fillStyle='#8a7f99';c.beginPath();c.arc(b.x+60+k*100+Math.sin(t*6+k)*10,b.y+b.h-40-t*170,14+t*26,0,TAU);c.fill();}
    c.globalAlpha=1;
    for(let k=0;k<7;k++){const x=b.x+22+k*46,h=30+12*Math.sin(now/120+k*1.9)+(k%2)*8;flame(c,x,b.y+b.h,h,14,'#ff7a3d');flame(c,x,b.y+b.h,h*0.6,8,'#ffd447');}
    c.restore();
    rr(c,b.x,b.y,b.w,b.h,24);c.strokeStyle=`rgba(255,90,60,${0.6+pulse*0.4})`;c.lineWidth=6;c.stroke();
  }
  function rock(c,x,y,r,now){
    c.save();c.translate(x,y);c.rotate(now/700);
    c.beginPath();for(let k=0;k<9;k++){const a=k*TAU/9,rr2=r*(0.82+((k*37)%10)/40);k?c.lineTo(Math.cos(a)*rr2,Math.sin(a)*rr2):c.moveTo(Math.cos(a)*rr2,Math.sin(a)*rr2);}c.closePath();
    c.fillStyle='#9b7d6a';c.fill();c.strokeStyle='#6c5246';c.lineWidth=2;c.stroke();
    c.fillStyle='#7d6252';for(const [a,d,s] of [[0.5,0.4,0.22],[2.4,0.45,0.16],[4.2,0.3,0.2]]){c.beginPath();c.arc(Math.cos(a)*r*d,Math.sin(a)*r*d,r*s,0,TAU);c.fill();}
    c.restore();
  }
  function meteor(c,m,ct,now){
    const P=PORT(m.room),b=BOX(m.room),k=R.clamp((ct-m.t0)/Math.max(1,m.t1-m.t0),0,1),left=Math.max(0,m.t1-ct);
    const fast=k>0.7,blink=0.5+0.5*Math.sin(now/(fast?70:160));
    rr(c,b.x,b.y,b.w,b.h,24);c.strokeStyle=`rgba(255,70,90,${0.45+blink*0.55})`;c.lineWidth=fast?8:6;c.stroke();
    // through the porthole: the rock grows and glows as it comes closer
    c.save();c.beginPath();c.arc(P.x,P.y,P.r,0,TAU);c.clip();
    const g=c.createRadialGradient(P.x,P.y,2,P.x,P.y,P.r*1.2);g.addColorStop(0,`rgba(255,140,60,${0.25+k*0.5})`);g.addColorStop(1,'rgba(255,80,60,0)');c.fillStyle=g;c.fillRect(P.x-P.r,P.y-P.r,P.r*2,P.r*2);
    rock(c,P.x+(1-k)*8,P.y-(1-k)*6,4+k*17,now);c.restore();
    // the countdown ring around the porthole
    c.lineCap='round';c.strokeStyle='rgba(255,255,255,.85)';c.lineWidth=6;c.beginPath();c.arc(P.x,P.y,P.r+5,0,TAU);c.stroke();
    c.strokeStyle=fast?'#ff4d6d':'#ff8a3d';c.beginPath();c.arc(P.x,P.y,P.r+5,-Math.PI/2,-Math.PI/2+TAU*(1-k));c.stroke();c.lineCap='butt';
    text(c,String(Math.ceil(left/1000)),P.x-P.r-28,P.y+2,{size:30,color:fast?'#ff3b5c':'#ff7a3d',outline:'#fff'});
  }
  function pill(c,x,y,kind,label,col){
    c.font=`700 16px ${FUN}`;const w=c.measureText(label).width+44;
    rr(c,x,y,w,32,16);c.fillStyle=col;c.fill();c.strokeStyle='#fff';c.lineWidth=2.5;c.stroke();
    if(kind==='f'){flame(c,x+18,y+26,18,8,'#fff');flame(c,x+18,y+26,10,4,'#ffd447');}
    else{c.fillStyle='#fff';c.beginPath();c.moveTo(x+18,y+6);c.lineTo(x+28,y+10);c.lineTo(x+27,y+19);c.quadraticCurveTo(x+24,y+25,x+18,y+28);c.quadraticCurveTo(x+12,y+25,x+9,y+19);c.lineTo(x+8,y+10);c.closePath();c.fill();}
    text(c,label,x+34,y+17,{size:16,color:'#fff',align:'left'});
    return w;
  }
  function engine(c,eng,burning,now){
    const e=ENG(),spin=burning?0:now/1000*(0.6+eng/100*4.5);
    c.lineCap='round';c.lineWidth=9;c.strokeStyle='#f3d6c8';c.beginPath();c.arc(e.x,e.y,44,0,TAU);c.stroke();
    c.strokeStyle='#ff8a4c';c.beginPath();c.arc(e.x,e.y,44,-Math.PI/2,-Math.PI/2+TAU*eng/100);c.stroke();c.lineCap='butt';
    if(eng>=C.TWIST_AT){c.strokeStyle='rgba(255,255,255,.9)';c.lineWidth=2;c.beginPath();const a=-Math.PI/2+TAU*C.TWIST_AT/100;c.moveTo(e.x+Math.cos(a)*38,e.y+Math.sin(a)*38);c.lineTo(e.x+Math.cos(a)*50,e.y+Math.sin(a)*50);c.stroke();}
    c.save();c.translate(e.x,e.y);c.rotate(spin);
    for(let k=0;k<6;k++){c.rotate(TAU/6);c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(14,-8,30,-4);c.quadraticCurveTo(20,4,0,0);c.fillStyle='#ffa46e';c.fill();}
    c.restore();c.beginPath();c.arc(e.x,e.y,11,0,TAU);c.fillStyle='#fff';c.fill();
    text(c,`${Math.floor(eng)}%`,e.x,e.y+74,{size:15,color:'#c8653c'});
  }
  function tanks(c,o2,now){
    const low=o2<C.O2.LOW,col=low?(Math.sin(now/150)>0?'#ff6b7f':'#ffb0bc'):'#5fd6a0';
    for(const t of TANKS()){const h=(t.h-12)*o2/100;c.save();rr(c,t.x+6,t.y+6,t.w-12,t.h-12,16);c.clip();
      c.fillStyle=col;c.fillRect(t.x+6,t.y+t.h-6-h,t.w-12,h);
      c.fillStyle='rgba(255,255,255,.5)';for(let k=0;k<3;k++){const y=t.y+t.h-10-((now/30+k*30)%(Math.max(10,h)));c.beginPath();c.arc(t.x+14+k*9,y,2.5,0,TAU);c.fill();}
      c.restore();}
  }
  function pod(c,open,inside,now){
    const p=POD();
    if(open){const a=0.45+0.35*Math.sin(now/220);rr(c,p.x-6,p.y-6,p.w+12,p.h+12,54);c.strokeStyle=`rgba(255,210,80,${a})`;c.lineWidth=8;c.stroke();}
    const show=inside.slice(0,6);show.forEach((q,k)=>avatar(c,q,p.x+30+(k%3)*36,p.y+38+Math.floor(k/3)*40,26,now,{tiny:true}));
    if(inside.length)text(c,inside.length>6?`+${inside.length-6}`:'',p.x+p.w-22,p.y+p.h-12,{size:14,color:'#b8862a'});
  }

  /* A crew member: the animal picture in a glass helmet, the energy they carry above, the name below. */
  function avatar(c,p,x,y,s,now,o={}){
    const bob=o.walk?Math.abs(Math.sin(now/140+hash(p.id)))*-4:Math.sin(now/420+hash(p.id))*1.2;
    c.save();c.translate(x,y+bob);if(p.away)c.globalAlpha=0.4;
    const im=IMG[p.av];
    if(im&&im.complete&&im.naturalWidth)c.drawImage(im,-s/2,-s/2,s,s);
    else{c.beginPath();c.arc(0,0,s*0.42,0,TAU);c.fillStyle=R.ANIMALS[p.av]?.c||'#ffc58f';c.fill();text(c,(p.name||'?').slice(0,1),0,1,{size:s*0.4});}
    const hr=s*0.58;c.beginPath();c.arc(0,-1,hr,0,TAU);c.fillStyle='rgba(200,235,255,.16)';c.fill();c.strokeStyle='rgba(255,255,255,.92)';c.lineWidth=o.tiny?1.6:2.4;c.stroke();
    c.strokeStyle='rgba(255,255,255,.75)';c.lineWidth=o.tiny?2:3;c.lineCap='round';c.beginPath();c.arc(0,-1,hr-4,Math.PI*1.1,Math.PI*1.45);c.stroke();c.lineCap='butt';
    if(!o.tiny){const cells=p.e2/2;for(let k=0;k<3;k++){const px=-12+k*12,py=-hr-8,f=R.clamp(cells-k,0,1);
      c.beginPath();c.arc(px,py,4.2,0,TAU);c.fillStyle='rgba(30,30,80,.45)';c.fill();
      if(f>0){c.beginPath();if(f>=1)c.arc(px,py,4.2,0,TAU);else{c.arc(px,py,4.2,Math.PI/2,Math.PI*1.5);c.closePath();}c.fillStyle='#ffd84d';c.fill();}}}
    c.restore();
  }
  // The name under a crew member, cut to fit the space next to them (crowded rooms get shorter names).
  function nameTag(c,p,x,y,s,room=90){
    c.font=`700 12px ${FUN}`;let n=String(p.name||'').trim();
    // too long: the Chinese name if there is one ("TAN MEI LING 陈美玲" → 陈美玲), else the first word
    if(c.measureText(n).width>room-10){const parts=n.split(/\s+/);n=parts.find(x=>/[㐀-鿿]/.test(x))||parts[0];while(n.length>1&&c.measureText(n+'…').width>room-10)n=n.slice(0,-1);if(n!==String(p.name).trim())n+='…';}
    const w=c.measureText(n).width+12;
    rr(c,x-w/2,y+s*0.58+2,w,17,8);c.fillStyle=p.away?'rgba(40,40,80,.35)':'rgba(30,28,74,.78)';c.fill();
    text(c,n,x,y+s*0.58+11,{size:12,color:'#fff'});
  }
  /* Spots on a room's floor for n people (smaller and in more rows as it gets crowded). */
  function spots(i,n){
    const b=BOX(i),s=n<=6?40:n<=12?36:30,per=n<=6?6:n<=12?6:8,rows=Math.min(3,Math.ceil(n/per)),out=[];
    for(let k=0;k<Math.min(n,per*3);k++){const row=Math.floor(k/per),col=k%per,inRow=Math.min(per,n-row*per);
      const gap=Math.min(46,(b.w-40)/Math.max(1,inRow));out.push({x:b.x+b.w/2+(col-(inRow-1)/2)*gap+(row%2)*8,y:b.y+b.h-28-(rows-1-row)*38,s,room:inRow<=1?120:gap});}
    return out;
  }
  const centre=i=>{const b=BOX(i);return {x:b.x+b.w/2,y:b.y+b.h-38};};

  /* view: {ct, ph, mode, hull, o2, eng, crises, players (with walk), fx} */
  function render(ctx,cw,ch,dpr,V,now,top=0){
    const {k,ox,oy}=viewport(cw,ch,top),scale=k*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#121848';ctx.fillRect(0,0,cw,ch);
    if(!bg||Math.abs(bgScale-scale)>0.01){bg=scenery(scale);bgScale=scale;}
    // a meteor hit shakes everything for a moment
    let sx=0,sy=0;for(const f of V.fx)if(f.k==='hit'&&V.ct-f.at<600){const a=(1-(V.ct-f.at)/600)*9;sx=Math.sin(now/22)*a;sy=Math.cos(now/27)*a;}
    ctx.setTransform(scale,0,0,scale,ox*dpr+sx*scale,oy*dpr+sy*scale);
    ctx.drawImage(bg,0,0,W,H);
    // a shooting star now and then
    const sh=(now%9000)/9000;if(sh<0.12){const q=sh/0.12,x=-60+q*700,y=30+q*40;const gr=ctx.createLinearGradient(x-90,y-6,x,y);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(1,'rgba(255,255,255,.9)');
      ctx.strokeStyle=gr;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(x-90,y-6);ctx.lineTo(x,y);ctx.stroke();}
    const fires=new Set(V.crises.filter(c=>c.k==='f').map(c=>c.room));
    engine(ctx,V.eng,fires.has(C.ENGINE),now);tanks(ctx,V.o2,now);
    for(const c of V.crises)if(c.k==='f')fire(ctx,c.room,now);
    // the crew: standing in rooms (crowded rooms pack tighter), walking along corridors, boarded in the pod
    const at=new Map(),pos=new Map(),walkers=[],inPod=[];
    for(const p of V.players){if(p.pod){inPod.push(p);continue;}
      if(p.walk){const w=R.walkAt(p.walk,V.ct);if(w&&w.a!==w.b){const A=centre(w.a),B=centre(w.b);walkers.push([p,A.x+(B.x-A.x)*w.k,A.y+(B.y-A.y)*w.k]);continue;}
        const r=w?w.a:p.room;(at.get(r)||at.set(r,[]).get(r)).push(p);continue;}
      (at.get(p.room)||at.set(p.room,[]).get(p.room)).push(p);}
    pod(ctx,V.ph==='final'&&V.mode!=='fight',inPod,now);
    const tags=[];
    for(const [r,list] of at){const sp=spots(r,list.length);list.forEach((p,i)=>{const s=sp[i];if(!s)return;avatar(ctx,p,s.x,s.y,s.s,now);tags.push([p,s.x,s.y,s.s,s.room]);pos.set(p.id,{x:s.x,y:s.y});});
      if(list.length>sp.length){const b=BOX(r);text(ctx,`+${list.length-sp.length}`,b.x+b.w-24,b.y+b.h-20,{size:16,color:'#3a3360',outline:'#fff'});}}
    for(const [p,x,y] of walkers){avatar(ctx,p,x,y,36,now,{walk:true});tags.push([p,x,y,36,90]);pos.set(p.id,{x,y});}
    for(const [p,x,y,s,room] of tags)nameTag(ctx,p,x,y,s,room);
    // what each room needs: fire and shield badges, then meteors through the portholes
    const n=new Map();
    for(const c of V.crises){const i=n.get(c.room)||0;n.set(c.room,i+1);const P=pillAt(c.room,i);
      pill(ctx,P.x,P.y,c.k,c.k==='f'?`灭火 ${c.got}/${c.need}`:`护盾 ${c.got}/${c.need}`,c.k==='f'?'#ff7a3d':'#ff4d6d');}
    for(const c of V.crises)if(c.k==='m')meteor(ctx,c,V.ct,now);
    for(const f of V.fx)effect(ctx,f,V,pos,now);
    ctx.setTransform(1,0,0,1,0,0);
  }
  /* Short effects (fx from the game, by their age). */
  function target(f,V){
    const i=f.room;if(f.w==='engine')return ENG();if(f.w==='o2'){const t=TANKS()[0];return {x:t.x+50,y:t.y+50};}
    if(f.w==='board'){const p=POD();return {x:p.x+p.w/2,y:p.y+p.h/2};}
    const k=V.crises.filter(c=>c.room===i).findIndex(c=>(f.w==='fire')===(c.k==='f'));const P=pillAt(i,Math.max(0,k));return {x:P.x+40,y:P.y+16};
  }
  function effect(c,f,V,pos,now){
    const age=V.ct-f.at;if(age<0)return;const b=f.room>=0?BOX(f.room):null;
    if(f.k==='put'&&age<520){const from=pos.get(f.by)||(b?centre(f.room):{x:600,y:300}),to=target(f,V),q=age/520,e=1-(1-q)*(1-q);
      const x=from.x+(to.x-from.x)*e,y=from.y+(to.y-from.y)*e-Math.sin(q*Math.PI)*40;
      c.fillStyle='rgba(255,216,77,.35)';c.beginPath();c.arc(x,y,13,0,TAU);c.fill();
      c.fillStyle='#ffd84d';c.beginPath();c.moveTo(x+2,y-9);c.lineTo(x-5,y+1);c.lineTo(x,y+1);c.lineTo(x-2,y+9);c.lineTo(x+5,y-1);c.lineTo(x,y-1);c.closePath();c.fill();}
    else if(f.k==='block'&&age<1400&&b){const a=1-age/1400;c.save();rr(c,b.x,b.y,b.w,b.h,24);c.clip();c.globalAlpha=a*0.8;c.strokeStyle='#7fd0ff';c.lineWidth=2;
      for(let y=b.y;y<b.y+b.h;y+=26)for(let x=b.x+((y-b.y)/26%2)*15;x<b.x+b.w;x+=30){c.beginPath();for(let s=0;s<6;s++){const an=s*TAU/6;s?c.lineTo(x+Math.cos(an)*13,y+Math.sin(an)*13):c.moveTo(x+13,y);}c.closePath();c.stroke();}
      c.fillStyle='rgba(127,208,255,.18)';c.fillRect(b.x,b.y,b.w,b.h);c.restore();
      text(c,'挡住了！',b.x+b.w/2,b.y+b.h/2-age/40,{size:34,color:'#2b8fe0',outline:'#fff'});}
    else if(f.k==='hit'&&age<1500&&b){const P=PORT(f.room);if(age<380){c.globalAlpha=(1-age/380)*0.85;rr(c,b.x,b.y,b.w,b.h,24);c.fillStyle='#fff';c.fill();c.globalAlpha=1;}
      for(let s=0;s<10;s++){const an=s*TAU/10+0.3,d=age/4;c.globalAlpha=Math.max(0,1-age/1200);c.fillStyle=s%2?'#9b7d6a':'#ff9a4d';c.beginPath();c.arc(P.x+Math.cos(an)*d,P.y+Math.sin(an)*d+age*age/40000,5,0,TAU);c.fill();}
      c.globalAlpha=1;text(c,`船体 -${C.METEOR.HIT}`,b.x+b.w/2,b.y+b.h/2-age/50,{size:30,color:'#ff3b5c',outline:'#fff'});}
    else if(f.k==='out'&&age<1400&&b){for(let s=0;s<6;s++){const t=age/1400;c.globalAlpha=(1-t)*0.7;c.fillStyle='#ffffff';c.beginPath();c.arc(b.x+40+s*48,b.y+b.h-30-t*90-(s%2)*14,10+t*22,0,TAU);c.fill();}
      c.globalAlpha=1;text(c,'灭火了！',b.x+b.w/2,b.y+b.h/2-age/40,{size:32,color:'#2fb37f',outline:'#fff'});}
    else if(f.k==='board'&&age<1000){const p=POD(),a=1-age/1000;c.globalAlpha=a;c.fillStyle='#ffd84d';
      for(let s=0;s<8;s++){const an=s*TAU/8+age/300,d=30+age/12;c.beginPath();c.arc(p.x+p.w/2+Math.cos(an)*d,p.y+p.h/2+Math.sin(an)*d*0.6,4,0,TAU);c.fill();}c.globalAlpha=1;}
  }
  root.RescueStage={render,BOX,viewport};
})(globalThis);
