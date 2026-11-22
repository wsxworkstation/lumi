/* Optional decoded artwork. A missing or slow image always keeps the procedural renderer. */
(root=>{
  'use strict';
  const files={};
  for(let i=0;i<10;i++)files['animal-'+i]='animal-'+i+'.png';
  for(const k of ['fish-normal','fish-gold','fish-special','card-mystery','card-up','card-ice','card-shield','card-x2','card-tri'])files[k]=k+'.png';
  Object.assign(files,{lakeside:'lakeside.webp','rush-glow':'rush-glow.webp',cover:'cover.webp'});
  const images=new Map();let revision=0;
  const script=typeof document!=='undefined'?document.currentScript:null;
  const base=new URL('./img/',script?.src||(typeof location!=='undefined'?location.href:'http://localhost/hook/'));
  const version=script?.src?new URL(script.src).searchParams.get('v'):'';
  function load(key,file){
    if(typeof root.Image!=='function')return Promise.resolve(false);
    return new Promise(resolve=>{
      const image=new root.Image();let settled=false;
      const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);image.onload=image.onerror=null;if(ok){images.set(key,image);revision++;}resolve(ok);};
      const timer=setTimeout(()=>finish(false),4000);
      image.onload=()=>{
        if(!image.naturalWidth||!image.naturalHeight){finish(false);return;}
        if(typeof image.decode==='function')image.decode().then(()=>finish(true),()=>finish(false));else finish(true);
      };
      image.onerror=()=>finish(false);
      const url=new URL(file,base);if(version)url.searchParams.set('v',version);
      try{image.src=url.href;}catch{finish(false);}
    });
  }
  const ready=Promise.all(Object.entries(files).map(([key,file])=>load(key,file)));
  root.HookArt={ready,get:key=>images.get(key)||null,get revision(){return revision;},files:Object.freeze(files)};
})(globalThis);
