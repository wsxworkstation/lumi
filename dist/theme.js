/* Light / dark display. Runs in <head> before the stylesheets paint, so night mode never flashes white.
   Mode is 'light', 'dark' or 'auto' (follow the device); stored per device. */
(()=>{
  const KEY='lumi-theme',root=document.documentElement,media=window.matchMedia?.('(prefers-color-scheme: dark)');
  let mode='auto';try{mode=localStorage.getItem(KEY)||'auto';}catch{}
  const resolved=()=>mode==='dark'||(mode==='auto'&&!!media?.matches)?'dark':'light';
  function apply(){
    const theme=resolved();root.dataset.theme=theme;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content',theme==='dark'?'#141415':'#3564db');
    window.dispatchEvent(new CustomEvent('lumi-theme',{detail:theme}));
  }
  media?.addEventListener?.('change',()=>{if(mode==='auto')apply();});
  window.LumiTheme={
    get mode(){return mode;},get theme(){return resolved();},
    set(next){mode=['light','dark','auto'].includes(next)?next:'auto';try{localStorage.setItem(KEY,mode);}catch{}apply();},
    toggle(){this.set(resolved()==='dark'?'light':'dark');}
  };
  apply();
})();
