(function(root){
  'use strict';
  const entityMap={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  const decode=s=>String(s??'').replace(/&#(x?[0-9a-f]+);|&(amp|lt|gt|quot|apos);/gi,(_,n,e)=>n?String.fromCodePoint(parseInt(n.replace(/^x/i,''),n[0].toLowerCase()==='x'?16:10)):entityMap[e]);
  const attrs=s=>{const out={};String(s).replace(/([\w:.-]+)="([^"]*)"/g,(_,k,v)=>(out[k]=decode(v),''));return out;};
  const texts=xml=>[...String(xml).matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m=>decode(m[1])).join('');
  const colIndex=ref=>{let n=0;for(const c of String(ref).match(/[A-Z]+/i)?.[0]?.toUpperCase()||'A')n=n*26+c.charCodeAt(0)-64;return n-1;};
  const normalizePath=(base,target)=>{
    if(target.startsWith('/'))return target.slice(1);
    const parts=(base+'/'+target).split('/'),out=[];
    for(const p of parts){if(!p||p==='.')continue;if(p==='..')out.pop();else out.push(p);}
    return out.join('/');
  };
  const excelDate=n=>{
    const d=new Date(Date.UTC(1899,11,30)+Number(n)*86400000);
    return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):n;
  };
  const builtInDates=new Set([14,15,16,17,18,19,20,21,22,27,28,29,30,31,32,33,34,35,36,45,46,47,50,51,52,53,54,55,56,57,58]);
  function parseStyles(xml){
    const formats={};
    for(const m of String(xml||'').matchAll(/<(?:\w+:)?numFmt\b([^>]*?)\/?>(?:<\/(?:\w+:)?numFmt>)?/g)){const a=attrs(m[1]);formats[Number(a.numFmtId)]=a.formatCode||'';}
    const section=String(xml||'').match(/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/)?.[1]||'';
    const xfs=[...section.matchAll(/<(?:\w+:)?xf\b([^>]*?)\/?>(?:<\/(?:\w+:)?xf>)?/g)].map(m=>Number(attrs(m[1]).numFmtId||0));
    return xfs.map(id=>builtInDates.has(id)||/[dmyhs]/i.test((formats[id]||'').replace(/"[^"]*"|\\./g,'')));
  }
  function parseSheet(xml,shared,dateStyles){
    const rows=[];
    for(const m of String(xml).matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)){
      const a=attrs(m[1]),body=m[2]||'',idx=colIndex(a.r),type=a.t||'',raw=body.match(/<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
      let value='';
      if(type==='inlineStr')value=texts(body);
      else if(type==='s')value=shared[Number(raw)]??'';
      else if(type==='str')value=decode(raw||'');
      else if(type==='b')value=raw==='1';
      else if(raw!==undefined){const n=Number(raw);value=Number.isFinite(n)?(dateStyles[Number(a.s||0)]?excelDate(n):n):decode(raw);}
      const rowNo=Number(String(a.r).match(/\d+/)?.[0]||1)-1;
      rows[rowNo]??=[];rows[rowNo][idx]=value;
    }
    return rows.map(r=>{const out=Array.from({length:r?.length||0},(_,i)=>r?.[i]??'');while(out.length&&out.at(-1)==='')out.pop();return out;});
  }
  async function read(file){
    if(!root.JSZip)throw Error('Excel reader is unavailable');
    const zip=await root.JSZip.loadAsync(file);
    const get=async p=>{const f=zip.file(p);return f?f.async('string'):'';};
    const workbook=await get('xl/workbook.xml');if(!workbook)throw Error('This is not a readable XLSX workbook');
    const rels=await get('xl/_rels/workbook.xml.rels'),relMap={};
    for(const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>(?:<\/Relationship>)?/g)){const a=attrs(m[1]);relMap[a.Id]=a.Target;}
    const sharedXml=await get('xl/sharedStrings.xml');
    const shared=[...sharedXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>texts(m[1]));
    const dateStyles=parseStyles(await get('xl/styles.xml'));
    const sheets={},images={};
    for(const m of workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>(?:<\/(?:\w+:)?sheet>)?/g)){
      const a=attrs(m[1]),target=relMap[a['r:id']];if(!target)continue;
      const path=normalizePath('xl',target),xml=await get(path);if(!xml)continue;
      sheets[a.name]=parseSheet(xml,shared,dateStyles);
      images[a.name]=await sheetImages(zip,get,path,xml);
    }
    return {sheets,images};
  }
  /* Pictures in a sheet, each with the 0-based row and column it sits on:
     floating pictures (drawings), WPS in-cell pictures (=DISPIMG) and Excel in-cell pictures (rich values). */
  const relsOf=async(get,path)=>{const dir=path.slice(0,path.lastIndexOf('/')),xml=await get(`${dir}/_rels/${path.slice(dir.length+1)}.rels`),out={};
    for(const m of xml.matchAll(/<Relationship\b([^>]*?)\/?>/g)){const a=attrs(m[1]);out[a.Id]=normalizePath(dir,a.Target);}return out;};
  const mime=p=>({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp'})[p.split('.').pop().toLowerCase()]||'';
  async function media(zip,path){const f=zip.file(path),type=mime(path);if(!f||!type)return null;return {type,base64:await f.async('base64')};}
  async function sheetImages(zip,get,sheetPath,sheetXml){
    const out=[],rels=await relsOf(get,sheetPath);
    for(const m of sheetXml.matchAll(/<(?:\w+:)?drawing\b[^>]*r:id="([^"]+)"/g)){
      const drawPath=rels[m[1]];if(!drawPath)continue;
      const xml=await get(drawPath),drels=await relsOf(get,drawPath);
      for(const anchor of xml.matchAll(/<(?:\w+:)?(?:twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/(?:\w+:)?(?:twoCellAnchor|oneCellAnchor)>/g)){
        const from=anchor[0].match(/<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?col>(\d+)<\/(?:\w+:)?col>[\s\S]*?<(?:\w+:)?row>(\d+)<\/(?:\w+:)?row>/),embed=anchor[0].match(/r:embed="([^"]+)"/);
        if(!from||!embed||!drels[embed[1]])continue;
        const img=await media(zip,drels[embed[1]]);if(img)out.push({row:Number(from[2]),col:Number(from[1]),...img});
      }
    }
    // WPS: a cell formula =DISPIMG("ID_…",1) points to xl/cellimages.xml.
    const wps=await get('xl/cellimages.xml');
    if(wps){const wrels=await relsOf(get,'xl/cellimages.xml'),byName={};
      for(const pic of wps.matchAll(/<(?:\w+:)?pic\b[\s\S]*?<\/(?:\w+:)?pic>/g)){const name=pic[0].match(/\bname="([^"]+)"/)?.[1],embed=pic[0].match(/r:embed="([^"]+)"/)?.[1];if(name&&embed&&wrels[embed])byName[name]=wrels[embed];}
      for(const c of sheetXml.matchAll(/<(?:\w+:)?c\b([^>]*?)>([\s\S]*?)<\/(?:\w+:)?c>/g)){
        const id=decode(c[2]).match(/DISPIMG\(\s*"([^"]+)"/)?.[1];if(!id||!byName[id])continue;
        const a=attrs(c[1]),img=await media(zip,byName[id]);if(img)out.push({row:Number(String(a.r).match(/\d+/)[0])-1,col:colIndex(a.r),...img});
      }
    }
    // Excel 365 "Place in cell": <c vm="n"> → rich value n → richValueRel → media.
    const rich=await get('xl/richData/rdrichvalue.xml');
    if(rich&&/\bvm="/.test(sheetXml)){
      const values=[...rich.matchAll(/<(?:\w+:)?rv\b[^>]*>([\s\S]*?)<\/(?:\w+:)?rv>/g)].map(m=>Number(m[1].match(/<(?:\w+:)?v\b[^>]*>(\d+)</)?.[1]));
      const relIds=[...(await get('xl/richData/richValueRel.xml')).matchAll(/r:id="([^"]+)"/g)].map(m=>m[1]),rrels=await relsOf(get,'xl/richData/richValueRel.xml');
      for(const c of sheetXml.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>)/g)){
        const a=attrs(c[1]);if(!a.vm)continue;
        const path=rrels[relIds[values[Number(a.vm)-1]]];if(!path)continue;
        const img=await media(zip,path);if(img)out.push({row:Number(String(a.r).match(/\d+/)[0])-1,col:colIndex(a.r),...img});
      }
    }
    return out;
  }
  const api={read,parseSheet,parseStyles,excelDate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.ExcelWorkbook=api;
})(globalThis);
