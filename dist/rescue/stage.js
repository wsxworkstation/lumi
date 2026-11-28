/* 星环防线 — the picture, shared by the big screen and the phones: a neon arcade look. Deep black space, the station's
   glowing ring along the bottom, every student a neon turret on it, meteors as glowing outlines, bright bullet streaks,
   sparks and shockwaves. A 1200×675 world fitted into the window. The still parts (space, stars, the station's body)
   are drawn once into a picture; glow comes from drawing lines twice with "lighter" blending (no per-frame blur, so
   phones keep up). window.RescueStage.render(ctx, cw, ch, dpr, view, now, opts) and .viewport(cw, ch, opts). */
(root=>{
  'use strict';
  const R=root.RescueGame,C=R.C,W=C.W,H=C.H,RING=C.RING,TAU=Math.PI*2;
  const FONT='"Orbitron","Noto Sans SC",system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  const COL={s:'#ff3df0',f:'#ff3df0',m:'#ff8a3d',l:'#ff3d5a',g:'#ffe53d',b:'#ff2d55'};
  const SPIN={s:1.6,f:2.4,m:0.9,l:0.45,g:2,b:0.12};

  function viewport(cw,ch,o={}){
    const top=o.top||0,l=o.padL||0,r=o.padR||0,aw=cw-l-r,ah=ch-top,k=Math.min(aw/W,ah/H);
    return {k,ox:l+(aw-W*k)/2,oy:top+(ah-H*k)/2};
  }
  const glow=(c,draw,col,w)=>{c.strokeStyle=col;c.globalAlpha=0.22;c.lineWidth=w*3.2;draw();c.globalAlpha=0.45;c.lineWidth=w*1.8;draw();c.globalAlpha=1;c.lineWidth=w;draw();};
  // (a soft glow only on the few big words; the many small names stay plain so phones keep up)
  function text(c,s,x,y,{size=16,color='#fff',weight=700,align='center',base='middle',alpha=1,glowing=size>=20}={}){
    c.font=`${weight} ${size}px ${FONT}`;c.textAlign=align;c.textBaseline=base;c.globalAlpha=alpha;
    if(glowing){c.shadowColor=color;c.shadowBlur=size*0.5;}c.fillStyle=color;c.fillText(s,x,y);c.shadowBlur=0;c.globalAlpha=1;
  }

  /* ── The still picture: space and the station's body under the ring ── */
  let bg=null,bgScale=0;
  function scenery(scale){
    const cv=document.createElement('canvas');cv.width=Math.ceil(W*scale);cv.height=Math.ceil(H*scale);const c=cv.getContext('2d');c.scale(scale,scale);
    const sky=c.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#02030a');sky.addColorStop(0.6,'#060718');sky.addColorStop(1,'#0b0a26');c.fillStyle=sky;c.fillRect(0,0,W,H);
    for(const [x,y,r,col] of [[230,170,360,'rgba(120,40,200,.10)'],[980,120,300,'rgba(20,120,220,.09)'],[620,560,520,'rgba(0,220,255,.07)']]){
      const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,col);g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,W,H);}
    const rnd=R.rng(11);
    for(let i=0;i<260;i++){const x=rnd()*W,y=rnd()*H*0.9,s=rnd()<0.08?1.6:rnd()*0.9+0.3;c.globalAlpha=0.25+rnd()*0.6;
      c.fillStyle=rnd()<0.15?'#9fe8ff':rnd()<0.25?'#ffb3f4':'#ffffff';c.fillRect(x,y,s,s);}
    c.globalAlpha=1;
    // the station's body below the ring, with a faint hex grid
    c.save();c.beginPath();c.ellipse(RING.x,RING.y,RING.rx,RING.ry,0,0,TAU);c.clip();
    const body=c.createLinearGradient(0,RING.y-RING.ry,0,H);body.addColorStop(0,'#0b1630');body.addColorStop(1,'#04060f');c.fillStyle=body;c.fillRect(0,0,W,H);
    c.strokeStyle='rgba(46,242,255,.08)';c.lineWidth=1;
    for(let y=RING.y-RING.ry;y<H+20;y+=18)for(let x=(Math.round(y/18)%2)*16;x<W;x+=32){c.beginPath();for(let k=0;k<6;k++){const a=k*TAU/6;k?c.lineTo(x+Math.cos(a)*9,y+Math.sin(a)*9):c.moveTo(x+9,y);}c.closePath();c.stroke();}
    c.restore();
    // scan lines
    c.fillStyle='rgba(255,255,255,.018)';for(let y=0;y<H;y+=3)c.fillRect(0,y,W,1);
    return cv;
  }

  /* ── Moving parts ── */
  const shapes=new Map();
  const shapeOf=m=>{let s=shapes.get(m.id);if(!s){s=R.shape(m);shapes.set(m.id,s);if(shapes.size>400)shapes.delete(shapes.keys().next().value);}return s;};
  function ring(c,hull,flash,now){
    const col=hull>60?'#2ef2ff':hull>30?'#ffb03d':'#ff3d5a',flick=hull<=30?0.7+0.3*Math.sin(now/60):1;
    const arc=()=>{c.beginPath();c.ellipse(RING.x,RING.y,RING.rx,RING.ry,0,Math.PI,TAU);c.stroke();};
    c.save();c.globalCompositeOperation='lighter';c.globalAlpha=flick;
    glow(c,arc,flash?'#ffffff':col,3);
    // segment marks along the ring
    c.strokeStyle=col;c.globalAlpha=0.55*flick;c.lineWidth=2;
    for(let i=1;i<40;i++){const a=Math.PI+i*Math.PI/40,x=RING.x+Math.cos(a)*RING.rx,y=RING.y+Math.sin(a)*RING.ry,x2=RING.x+Math.cos(a)*(RING.rx-14),y2=RING.y+Math.sin(a)*(RING.ry-10);
      c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();}
    c.restore();
  }
  function turret(c,T,col,a,me,away,now){
    c.save();c.globalAlpha=away?0.3:1;c.globalCompositeOperation='lighter';
    if(me){const p=0.5+0.5*Math.sin(now/250);c.strokeStyle=col;c.globalAlpha=0.25+p*0.35;c.lineWidth=2;c.beginPath();c.arc(T.x,T.y,24+p*4,0,TAU);c.stroke();c.globalAlpha=1;}
    const barrel=()=>{c.beginPath();c.moveTo(T.x,T.y);c.lineTo(T.x+Math.cos(a)*22,T.y+Math.sin(a)*22);c.stroke();};
    glow(c,barrel,col,me?4:3);
    const dome=()=>{c.beginPath();c.arc(T.x,T.y+2,me?13:11,Math.PI,TAU);c.closePath();c.stroke();};
    glow(c,dome,col,2);
    c.globalCompositeOperation='source-over';c.fillStyle='#05060f';c.beginPath();c.arc(T.x,T.y+2,(me?13:11)-2,Math.PI,TAU);c.closePath();c.fill();
    c.fillStyle=col;c.beginPath();c.arc(T.x,T.y-2,3,0,TAU);c.fill();
    c.restore();
  }
  // A name under a turret, cut to fit (the Chinese name if there is one, else the first word).
  function label(c,name,x,y,col,room,me){
    c.font=`700 ${me?13:11}px ${FONT}`;let n=String(name||'').trim();
    if(c.measureText(n).width>room){const parts=n.split(/\s+/);n=parts.find(s=>/[㐀-鿿]/.test(s))||parts[0];
      if(c.measureText(n).width>room){while(n.length>1&&c.measureText(n+'…').width>room)n=n.slice(0,-1);n+='…';}}
    text(c,n,x,y,{size:me?13:11,color:col,weight:700});
  }
  function meteor(c,m,ct,now){
    const P=R.mPos(m,ct),K=C.KIND[m.k],r=K.r,col=COL[m.k],rot=m.s*TAU+ct/1000*SPIN[m.k],sh=shapeOf(m);
    // trail
    const Q=R.mPos(m,ct-220);c.save();c.globalCompositeOperation='lighter';
    const tr=c.createLinearGradient(Q.x,Q.y,P.x,P.y);tr.addColorStop(0,'rgba(0,0,0,0)');tr.addColorStop(1,col);
    c.strokeStyle=tr;c.globalAlpha=0.5;c.lineWidth=r*0.9;c.lineCap='round';c.beginPath();c.moveTo(Q.x+(Q.x-P.x)*1.5,Q.y+(Q.y-P.y)*1.5);c.lineTo(P.x,P.y);c.stroke();c.restore();
    const path=()=>{c.beginPath();sh.forEach(([a,d],i)=>{const x=P.x+Math.cos(a+rot)*r*d,y=P.y+Math.sin(a+rot)*r*d;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();};
    path();c.fillStyle='#090512';c.fill();
    if(m.k==='b'){const p=0.6+0.4*Math.sin(now/180),g=c.createRadialGradient(P.x,P.y,0,P.x,P.y,r*0.7);g.addColorStop(0,`rgba(255,60,90,${0.55*p})`);g.addColorStop(1,'rgba(255,0,60,0)');c.fillStyle=g;c.beginPath();c.arc(P.x,P.y,r*0.7,0,TAU);c.fill();
      c.save();c.globalCompositeOperation='lighter';c.strokeStyle='#ff5c7a';c.lineWidth=2;c.globalAlpha=0.7*p;
      for(let i=0;i<6;i++){const a=rot*1.3+i*TAU/6;c.beginPath();c.moveTo(P.x+Math.cos(a)*r*0.2,P.y+Math.sin(a)*r*0.2);c.lineTo(P.x+Math.cos(a+0.3)*r*0.55,P.y+Math.sin(a+0.3)*r*0.55);c.lineTo(P.x+Math.cos(a)*r*0.8,P.y+Math.sin(a)*r*0.8);c.stroke();}c.restore();}
    c.save();c.globalCompositeOperation='lighter';glow(c,()=>{path();c.stroke();},col,m.k==='b'?3.5:2.2);
    if(m.k==='g'){c.fillStyle='#fff7b0';for(let i=0;i<4;i++){const a=now/300+i*TAU/4;c.globalAlpha=0.8;c.beginPath();c.arc(P.x+Math.cos(a)*(r+8),P.y+Math.sin(a)*(r+8),2.2,0,TAU);c.fill();}c.globalAlpha=1;}
    // hits still needed: little marks around it (the Meteor King's bar is on the screen's top)
    if(m.max>1&&m.k!=='b'){const n=m.max,arcLen=Math.min(TAU*0.9,n*0.32);c.lineWidth=3;c.lineCap='round';
      for(let i=0;i<n;i++){const a=-Math.PI/2-arcLen/2+(i+0.5)*arcLen/n;c.strokeStyle=i<m.hp?col:'rgba(255,255,255,.18)';c.globalAlpha=i<m.hp?0.95:0.6;
        c.beginPath();c.arc(P.x,P.y,r+9,a-arcLen/n*0.3,a+arcLen/n*0.3);c.stroke();}c.globalAlpha=1;}
    // close to the ring: a red warning circle
    if(P.k>0.78&&m.k!=='g'){const p=0.5+0.5*Math.sin(now/70);c.strokeStyle='#ff3d5a';c.globalAlpha=0.35+p*0.5;c.lineWidth=2;c.beginPath();c.arc(P.x,P.y,r+16+p*4,0,TAU);c.stroke();c.globalAlpha=1;}
    c.restore();
    return P;
  }
  function bullet(c,b,ct,col){
    const end=b.te||b.t0+C.SHOT.LIFE;if(ct<b.t0||ct>end)return;
    const P=R.bPos(b,ct),Q=R.bPos(b,Math.max(b.t0,ct-34));
    const seg=()=>{c.beginPath();c.moveTo(Q.x,Q.y);c.lineTo(P.x,P.y);c.stroke();};
    c.lineCap='round';glow(c,seg,col,2.6);
  }
  function effect(c,f,ct,now){
    const age=ct-f.at;if(age<0)return 0;let shake=0;
    const burst=(n,len,col,life,w=2)=>{const k=age/life;if(k>=1)return;c.strokeStyle=col;c.lineWidth=w;c.globalAlpha=1-k;
      for(let i=0;i<n;i++){const a=i*TAU/n+f.id,d1=len*k,d2=len*(k+0.25);c.beginPath();c.moveTo(f.x+Math.cos(a)*d1,f.y+Math.sin(a)*d1);c.lineTo(f.x+Math.cos(a)*d2,f.y+Math.sin(a)*d2);c.stroke();}c.globalAlpha=1;};
    const wave=(rad,col,life,w=3)=>{const k=age/life;if(k>=1)return;c.strokeStyle=col;c.lineWidth=w*(1-k)+0.5;c.globalAlpha=1-k;c.beginPath();c.arc(f.x,f.y,rad*k,0,TAU);c.stroke();c.globalAlpha=1;};
    if(f.k==='hit'){burst(6,18,COL[f.w]||'#fff',260);}
    else if(f.k==='boom'){const big=f.w==='b'?5:f.w==='l'?2.2:f.w==='m'?1.5:1,col=COL[f.w]||'#fff';
      if(age<120){c.globalAlpha=(1-age/120)*0.8;c.fillStyle='#fff';c.beginPath();c.arc(f.x,f.y,22*big,0,TAU);c.fill();c.globalAlpha=1;}
      burst(10+Math.round(big*4),60*big,col,700*Math.min(2,big));wave(55*big,col,600*Math.min(2,big));
      if(f.w==='b'||f.w==='l')shake=Math.max(0,(1-age/700))*(f.w==='b'?16:6);}
    else if(f.k==='ring'){const dmg=Number(f.w)||0;wave(70,'#ff3d5a',700,4);burst(12,50,'#ff8a3d',600);
      if(age<1000)text(c,`-${dmg}`,f.x,f.y-50-age/25,{size:26,color:'#ff3d5a',alpha:1-age/1000});
      shake=Math.max(0,(1-age/450))*(dmg>=20?12:dmg>=10?7:4);}
    else if(f.k==='gold'){wave(180,'#ffe53d',1100,4);if(age<1500)text(c,'全员 +2 发',f.x,f.y-40-age/30,{size:28,color:'#ffe53d',alpha:1-age/1500});}
    else if(f.k==='away'){if(age<700)text(c,'飞走了',f.x,f.y-30-age/20,{size:18,color:'#ffe53d',alpha:1-age/700});}
    return shake;
  }

  /* view: {ct, hull, st (stage), ms, bs, ps (players in joining order), fx}
     opts: {top, padL, padR, me (my id), aim (my aim angle while aiming), mine (my bullets not yet confirmed)} */
  function render(ctx,cw,ch,dpr,V,now,o={}){
    const {k,ox,oy}=viewport(cw,ch,o),scale=k*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#02030a';ctx.fillRect(0,0,cw,ch);
    if(!bg||Math.abs(bgScale-scale)>0.01){bg=scenery(scale);bgScale=scale;}
    let shake=0;for(const f of V.fx){const a=V.ct-f.at;if(f.k==='ring'&&a<450)shake=Math.max(shake,1);if(f.k==='boom'&&(f.w==='b'||f.w==='l')&&a<700)shake=Math.max(shake,1);}
    const draw=sx=>{
      ctx.setTransform(scale,0,0,scale,ox*dpr+sx.x*scale,oy*dpr+sx.y*scale);
      ctx.drawImage(bg,0,0,W,H);
      const flash=V.fx.some(f=>f.k==='ring'&&V.ct-f.at<140);
      ring(ctx,V.hull,flash,now);
      for(const m of V.ms)if(V.ct>=m.t0)meteor(ctx,m,V.ct,now);
      const n=V.ps.length,col=new Map(),spacing=n>1?900/(n-1):200;
      V.ps.forEach((p,i)=>{const T=R.turretAt(i,n),c=C.COLORS[p.col]||'#fff',me=p.id===o.me;col.set(p.id,c);
        turret(ctx,T,c,me&&o.aim!=null?o.aim:p.aim??-Math.PI/2,me,p.away,now);
        if(me||n<=24||i%2===0)label(ctx,p.name,T.x,T.y+(me?30:24),c,Math.max(34,Math.min(110,spacing*(n>24?2:1)-6)),me);});
      // my aim line
      if(o.aim!=null&&o.me&&col.has(o.me)){const i=V.ps.findIndex(p=>p.id===o.me),T=R.turretAt(i,n),c=col.get(o.me);
        ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=c;ctx.globalAlpha=0.55;ctx.lineWidth=2;ctx.setLineDash([10,9]);ctx.lineDashOffset=-now/30;
        ctx.beginPath();ctx.moveTo(T.x+Math.cos(o.aim)*24,T.y+Math.sin(o.aim)*24);ctx.lineTo(T.x+Math.cos(o.aim)*900,T.y+Math.sin(o.aim)*900);ctx.stroke();ctx.restore();}
      ctx.save();ctx.globalCompositeOperation='lighter';
      for(const b of V.bs)bullet(ctx,b,V.ct,col.get(b.by)||'#fff');
      for(const b of o.mine||[])bullet(ctx,b,V.ct,col.get(o.me)||'#fff');
      for(const f of V.fx)effect(ctx,f,V.ct,now);
      ctx.restore();
    };
    let sx={x:0,y:0};
    if(shake){let a=0;for(const f of V.fx){const age=V.ct-f.at;if(f.k==='ring'&&age<450)a=Math.max(a,(1-age/450)*(Number(f.w)>=20?12:Number(f.w)>=10?7:4));
      if(f.k==='boom'&&age<700&&(f.w==='b'||f.w==='l'))a=Math.max(a,(1-age/700)*(f.w==='b'?16:6));}
      sx={x:Math.sin(now/23)*a,y:Math.cos(now/29)*a};}
    draw(sx);
    // the warning before the Meteor King: the edges glow red
    if(V.st==='warn'){const p=0.5+0.5*Math.sin(now/120);ctx.setTransform(dpr,0,0,dpr,0,0);
      const g=ctx.createRadialGradient(cw/2,ch/2,Math.min(cw,ch)*0.3,cw/2,ch/2,Math.max(cw,ch)*0.7);g.addColorStop(0,'rgba(255,0,40,0)');g.addColorStop(1,`rgba(255,0,40,${0.25+p*0.25})`);
      ctx.fillStyle=g;ctx.fillRect(0,0,cw,ch);}
    ctx.setTransform(1,0,0,1,0,0);
  }
  root.RescueStage={render,viewport,COL};
})(globalThis);
