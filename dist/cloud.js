/* Cloud sync: Supabase email login + one JSON document per teacher.
   Local-first — localStorage stays the working copy; every change is pushed with a revision check,
   so two devices editing at once produce a visible conflict instead of silently overwriting. */
(() => {
  'use strict';
  const cfg=window.STUDYLOG_CLOUD||{};
  const DATA_KEY='studylog-demo-v1',SESSION_KEY='studylog-cloud-session',META_KEY='studylog-cloud-meta';
  const LOCAL_KEYS=[DATA_KEY,META_KEY,SESSION_KEY,'studylog-view-v1','studylog-import-backup-v1'];
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}};
  const write=(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v));}catch{}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function loadApp(){const s=document.createElement('script');s.src='./app.js';document.body.appendChild(s);}
  if(!cfg.url||!cfg.key){loadApp();return;}

  const device=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)?'手机':'电脑';
  let session=read(SESSION_KEY),meta=read(META_KEY)||{owner:'',rev:0,dirty:false};
  let state='syncing',syncedJSON=null,latest=null,seq=0,inflight=false,timer=0,retry=0,lastCheck=0,appLoaded=false,loggingOut=false,refreshing=null;

  /* ---------- HTTP ---------- */
  async function request(path,{method='GET',body,auth=true}={},retried=false){
    const headers={apikey:cfg.key,'Content-Type':'application/json'};
    if(auth){await ensureFresh();headers.Authorization='Bearer '+session.access_token;}
    const res=await fetch(cfg.url+path,{method,headers,body});
    const text=await res.text();let json=null;try{json=text?JSON.parse(text):null;}catch{}
    if(res.status===401&&auth&&!retried){await ensureFresh(true);return request(path,{method,body,auth},true);}
    if(!res.ok){const e=Error(json?.message||json?.msg||json?.error_description||res.statusText);e.status=res.status;e.code=json?.error_code||json?.code;throw e;}
    return json;
  }
  function saveSession(j){
    session={access_token:j.access_token,refresh_token:j.refresh_token,expires_at:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600),user:{id:j.user.id,email:j.user.email}};
    write(SESSION_KEY,session);
  }
  function expired(){const e=Error('expired');e.status=401;return e;}
  async function ensureFresh(force){
    if(!session)throw expired();
    if(!force&&session.expires_at*1000-Date.now()>60000)return;
    refreshing??=(async()=>{
      const res=await fetch(cfg.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
      const j=await res.json().catch(()=>null);
      if(res.ok&&j?.access_token){saveSession(j);return;}
      if(res.status>=400&&res.status<500){session=null;write(SESSION_KEY,null);throw expired();}
      const e=Error('refresh failed');e.status=res.status;throw e;
    })().finally(()=>{refreshing=null;});
    await refreshing;
  }
  async function signIn(email,password){
    const res=await fetch(cfg.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const j=await res.json().catch(()=>null);
    if(!res.ok){const msg=String(j?.msg||j?.error_description||j?.message||'');throw Error(/not confirmed/i.test(msg)?'这个邮箱还没确认，请先在 Supabase 确认用户。':/invalid/i.test(msg)?'邮箱或密码不对。':'登录失败：'+(msg||res.status));}
    saveSession(j);
  }
  const fetchRemote=full=>request(`/rest/v1/studylog_state?select=${full?'data,rev,updated_at,device':'rev,updated_at,device'}&owner=eq.${session.user.id}`).then(r=>r[0]||null);

  /* ---------- status ---------- */
  const labels={
    synced:['已同步 · 云端','Synced · cloud'],
    syncing:['同步中…','Syncing…'],
    offline:['离线 · 已存本机，联网后自动上传','Offline · saved here, will upload'],
    conflict:['同步冲突 · 点此处理','Sync conflict · tap to resolve'],
    expired:['登录过期 · 点此重新登录','Signed out · tap to sign in'],
    error:['同步失败 · 点此重试','Sync failed · tap to retry']
  };
  function setState(s){state=s;api.onStatus?.();}
  function stamp(){const d=new Date();return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;}
  function downloadJSON(name,json){
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }

  /* ---------- push ---------- */
  function changed(json){
    if(loggingOut||json===syncedJSON)return;
    latest=json;seq++;
    if(!meta.dirty){meta.dirty=true;write(META_KEY,meta);}
    if(state==='conflict'||state==='expired')return;
    setState('syncing');clearTimeout(timer);timer=setTimeout(push,800);
  }
  async function push(){
    if(inflight||!latest||state==='conflict'||state==='expired')return;
    const json=latest,mySeq=seq;inflight=true;setState('syncing');
    try{
      const r=await request('/rest/v1/rpc/studylog_save',{method:'POST',body:`{"p_data":${json},"p_base_rev":${Number(meta.rev)||0},"p_device":${JSON.stringify(device)}}`});
      meta.rev=r.rev;meta.syncedAt=r.updated_at;syncedJSON=json;retry=0;
      if(mySeq===seq){meta.dirty=false;latest=null;}
      write(META_KEY,meta);setState(meta.dirty?'syncing':'synced');
    }catch(e){
      if(/STUDYLOG_CONFLICT/.test(e.message)){setState('conflict');showConflict();}
      else if(e.status===401)setState('expired');
      else if(!e.status||e.status>=500||e.status===429){setState('offline');retry=Math.min(retry+1,5);clearTimeout(timer);timer=setTimeout(push,4000*2**retry);}
      else{setState('error');console.error('Studylog sync',e);}
    }finally{
      inflight=false;
      if(meta.dirty&&latest&&state==='syncing'){clearTimeout(timer);timer=setTimeout(push,300);}
    }
  }
  async function checkRemote(){
    if(!appLoaded||!session||inflight||meta.dirty||document.hidden||state==='conflict'||state==='expired')return;
    if(Date.now()-lastCheck<15000)return;lastCheck=Date.now();
    try{
      const r=await fetchRemote(false);
      if(state==='offline'||state==='error')setState('synced');
      if(!r||r.rev===meta.rev||meta.dirty||document.querySelector('dialog[open]'))return;
      const full=await fetchRemote(true);if(meta.dirty)return;
      localStorage.setItem(DATA_KEY,JSON.stringify(full.data));
      meta={owner:session.user.id,rev:full.rev,dirty:false,syncedAt:full.updated_at};write(META_KEY,meta);
      location.reload();
    }catch(e){if(e.status===401)setState('expired');}
  }

  /* ---------- overlay screens ---------- */
  const overlay=document.createElement('div');overlay.id='cloud-overlay';overlay.hidden=true;document.body.appendChild(overlay);
  function screen(html){overlay.innerHTML=`<div class="cloud-card"><div class="cloud-brand">学迹 <span>Studylog</span></div>${html}</div>`;overlay.hidden=false;}
  function hideScreen(){overlay.hidden=true;overlay.innerHTML='';}
  function showLoading(msg){screen(`<p class="cloud-text">${esc(msg)}</p>`);}
  function showLogin(note='',relogin=false){
    screen(`<h1>老师登录</h1>${note?`<p class="cloud-note">${esc(note)}</p>`:''}
      <form id="cloud-login"><label>邮箱<input name="email" type="email" autocomplete="username" required value="${esc(session?.user?.email||meta.email||'')}"></label>
      <label>密码<input name="password" type="password" autocomplete="current-password" required></label>
      <p class="cloud-error" id="cloud-error" role="alert"></p>
      <button class="btn primary" type="submit">登录</button></form>
      <p class="cloud-text small">资料保存在你的 Supabase 云端，电脑和手机登录同一账号即可看到同一份。</p>`);
    const form=overlay.querySelector('#cloud-login');
    (form.email.value?form.password:form.email).focus();
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();const btn=form.querySelector('button');btn.disabled=true;btn.textContent='登录中…';
      try{
        await signIn(form.email.value.trim(),form.password.value);
        if(relogin){
          if(meta.owner&&meta.owner!==session.user.id){session=null;write(SESSION_KEY,null);throw Error('请用原来的账号登录，这台设备上有它尚未上传的资料。');}
          hideScreen();setState(meta.dirty?'syncing':'synced');if(!latest&&meta.dirty)latest=localStorage.getItem(DATA_KEY);push();
        }else boot();
      }catch(e){overlay.querySelector('#cloud-error').textContent=e.status?'连不上云端，请检查网络。':e.message||'连不上云端，请检查网络。';btn.disabled=false;btn.textContent='登录';}
    });
  }
  async function showConflict(){
    screen(`<h1>两台设备都改了资料</h1>
      <p class="cloud-text">云端已有另一台设备更新的版本，而这台设备还有未上传的修改。请选择保留哪一份；没被选中的那一份会自动下载成 JSON 文件，不会丢失。</p>
      <p class="cloud-error" id="cloud-error" role="alert"></p>
      <div class="cloud-actions"><button class="btn primary" data-pick="cloud">用云端版本（推荐）</button><button class="btn" data-pick="local">用这台${device}的版本</button></div>`);
    overlay.querySelectorAll('[data-pick]').forEach(b=>b.addEventListener('click',async()=>{
      overlay.querySelectorAll('button').forEach(x=>x.disabled=true);
      try{
        const remote=await fetchRemote(true),local=latest||localStorage.getItem(DATA_KEY);
        if(b.dataset.pick==='cloud'){
          if(local)downloadJSON(`studylog-本机未同步-${stamp()}.json`,local);
          localStorage.setItem(DATA_KEY,JSON.stringify(remote.data));
          meta={owner:session.user.id,rev:remote.rev,dirty:false,syncedAt:remote.updated_at};
        }else{
          downloadJSON(`studylog-云端旧版-${stamp()}.json`,JSON.stringify(remote.data));
          meta={owner:session.user.id,rev:remote.rev,dirty:true};
        }
        write(META_KEY,meta);setTimeout(()=>location.reload(),600);
      }catch(e){overlay.querySelector('#cloud-error').textContent='连不上云端，请检查网络后再试。';overlay.querySelectorAll('button').forEach(x=>x.disabled=false);}
    }));
  }

  /* ---------- boot ---------- */
  function start(){
    // app.js calls persist() on startup; an unchanged document must not count as a new edit.
    if(!meta.dirty&&syncedJSON===null)syncedJSON=localStorage.getItem(DATA_KEY);
    hideScreen();appLoaded=true;loadApp();
  }
  async function boot(){
    if(!session)return showLogin();
    showLoading('正在连接云端…');
    const uid=session.user.id;
    if(meta.owner&&meta.owner!==uid){LOCAL_KEYS.filter(k=>k!==SESSION_KEY).forEach(k=>write(k,null));meta={owner:'',rev:0,dirty:false};}
    let remote;
    try{remote=await fetchRemote(true);}
    catch(e){
      if(e.status===401)return showLogin('登录已过期，请重新登录。');
      if(e.status&&e.status<500)return screen(`<h1>云端还没设置好</h1><p class="cloud-text">${esc(e.message)}</p><p class="cloud-text small">请确认已在 Supabase SQL Editor 运行 setup.sql。</p>`);
      setState('offline');return start(); // offline: work locally, upload later
    }
    meta.owner=uid;meta.email=session.user.email;
    if(!remote){meta.rev=0;meta.dirty=true;}                       // first device: upload this browser's data
    else if(meta.dirty&&localStorage.getItem(DATA_KEY)){
      if(meta.rev!==remote.rev){write(META_KEY,meta);setState('conflict');return showConflict();}
    }else{
      localStorage.setItem(DATA_KEY,JSON.stringify(remote.data));
      syncedJSON=JSON.stringify(remote.data);
      Object.assign(meta,{rev:remote.rev,dirty:false,syncedAt:remote.updated_at});
    }
    write(META_KEY,meta);setState(meta.dirty?'syncing':'synced');start();
  }

  async function logout(){
    loggingOut=true;
    try{await fetch(cfg.url+'/auth/v1/logout',{method:'POST',headers:{apikey:cfg.key,Authorization:'Bearer '+session?.access_token}});}catch{}
    LOCAL_KEYS.forEach(k=>write(k,null));location.reload();
  }
  function act(){
    if(state==='expired')showLogin('登录已过期。重新登录后会继续上传这台设备的修改。',true);
    else if(state==='conflict')showConflict();
    else if(state==='error'||state==='offline'){retry=0;setState('syncing');if(!latest&&meta.dirty)latest=localStorage.getItem(DATA_KEY);push();}
  }

  const api=window.StudyCloud={
    changed,logout,act,onStatus:null,
    get state(){return state;},
    get dirty(){return !!meta.dirty;},
    get email(){return session?.user?.email||meta.email||'';},
    get syncedAt(){return meta.syncedAt||'';},
    label:lang=>(labels[state]||labels.syncing)[lang==='en'?1:0]
  };
  document.addEventListener('click',e=>{if(e.target.closest('.saved'))act();});
  window.addEventListener('online',()=>{if(state==='offline'){retry=0;if(!latest&&meta.dirty)latest=localStorage.getItem(DATA_KEY);push();}checkRemote();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkRemote();});
  window.addEventListener('focus',checkRemote);
  boot();
})();
