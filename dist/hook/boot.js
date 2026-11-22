/* Start the existing page after bounded artwork preloading, including on failure. */
(()=>{
  const own=document.currentScript,entry=own.dataset.entry;
  const url=new URL(entry,own.src);url.search=new URL(own.src).search;
  const start=()=>{const script=document.createElement('script');script.src=url.href;document.body.appendChild(script);};
  Promise.resolve(globalThis.HookArt?.ready).then(start,start);
})();
