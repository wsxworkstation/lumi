/* Generates dist/dark.css from the light stylesheets.
   Every rule that sets a colour is re-emitted under html[data-theme=dark] with the colour remapped in OKLCH:
   surfaces and tints flip from light to dark, text lifts to a readable light tone, saturated accents keep their hue,
   shadows stay dark. Cascade order, selectors and @media wrappers are preserved, so dark mode follows the light design.
   Run after changing any stylesheet:  node tools/build-dark.cjs */
const fs=require('fs'),path=require('path');
const dist=path.join(__dirname,'../dist');
const SOURCES=['styles.css','minimal.css','login.css','fonts.css'];
const PREFIX='html[data-theme=dark]';

/* ---------- colour maths (sRGB <-> OKLCH) ---------- */
const toLin=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4, toGam=c=>c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055;
function hexToRgba(h){h=h.slice(1);if(h.length<=4)h=[...h].map(c=>c+c).join('');const n=i=>parseInt(h.slice(i,i+2),16)/255;return [n(0),n(2),n(4),h.length===8?n(6):1];}
function rgbToOklch([r,g,b]){[r,g,b]=[r,g,b].map(toLin);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  const L=.2104542553*l+.793617785*m-.0040720468*s,A=1.9779984951*l-2.428592205*m+.4505937099*s,B=.0259040371*l+.7827717662*m-.808675766*s;
  return [L,Math.hypot(A,B),Math.atan2(B,A)];}
function oklchToHex(L,C,H,alpha=1){
  for(let k=0;k<30;k++){const A=C*Math.cos(H),B=C*Math.sin(H);
    const l=(L+.3963377774*A+.2158037573*B)**3,m=(L-.1055613458*A-.0638541728*B)**3,s=(L-.0894841775*A-1.291485548*B)**3;
    const rgb=[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
    if(rgb.every(v=>v>=-1e-4&&v<=1+1e-4)||C<1e-3){const hx=v=>Math.round(Math.min(1,Math.max(0,toGam(Math.min(1,Math.max(0,v)))))*255).toString(16).padStart(2,'0');
      return '#'+rgb.map(hx).join('')+(alpha<1?Math.round(alpha*255).toString(16).padStart(2,'0'):'');}
    C*=.9;}
}
function mapColor(hex,role){
  const [r,g,b,a]=hexToRgba(hex),[L,C,H]=rgbToOklch([r,g,b]);
  if(role==='shadow')return '#000000'+Math.round(Math.min(1,a*2.2+.04)*255).toString(16).padStart(2,'0');
  if(role==='text'){
    if(L>=.8)return hex;                                   // already light (white text on accents)
    return oklchToHex(Math.max(.72,.93-L*.38),Math.min(C,.16),H,a);
  }
  const saturated=C>=.075&&L>.32&&L<.82;
  if(saturated)return oklchToHex(Math.min(Math.max(L,.5),.68),C,H,a);   // accents, bars, dots: keep hue, comfortable lightness
  if(L<.5)return hex;                                      // intentionally dark element (toast etc.)
  let nl=L>=.99?.25:.175+(1-L)*.6;                        // surfaces & tints flip light→dark; white panels sit above page
  if(role==='border')nl+=.09;
  return oklchToHex(Math.min(nl,.42),C*.65,H,a);
}
function roleFor(prop){
  if(/shadow|filter/.test(prop))return 'shadow';
  if(prop==='color'||prop==='caret-color'||prop==='-webkit-text-fill-color'||/^--(ink|muted|red|amber|lime)$/.test(prop))return 'text';
  if(/^border|^outline|^--line$/.test(prop))return 'border';
  return 'surface';
}

/* ---------- tiny CSS parser (enough for these hand-written sheets) ---------- */
function parse(css){
  css=css.replace(/\/\*[\s\S]*?\*\//g,'');let i=0;
  function block(){const out=[];
    while(i<css.length){
      const close=css.indexOf('}',i),open=css.indexOf('{',i);
      if(close!==-1&&(open===-1||close<open)){i=close+1;return out;}
      if(open===-1){i=css.length;return out;}
      const sel=css.slice(i,open).trim();i=open+1;
      if(sel.startsWith('@media')||sel.startsWith('@supports'))out.push({at:sel,rules:block()});
      else if(sel.startsWith('@')){block();}             // @keyframes, @font-face: skip contents
      else{const end=css.indexOf('}',i);out.push({sel,body:css.slice(i,end)});i=end+1;}
    }
    return out;}
  return block();
}
const HEX=/#[0-9a-fA-F]{3,8}\b/g;
function convertBody(body){
  const decls=body.split(';').map(d=>d.trim()).filter(Boolean),out=[];
  for(const d of decls){const k=d.indexOf(':');if(k<0)continue;const prop=d.slice(0,k).trim(),val=d.slice(k+1).trim();
    if(!HEX.test(val)&&!/\bwhite\b/.test(val)){HEX.lastIndex=0;continue;}HEX.lastIndex=0;
    const role=roleFor(prop);
    out.push(`${prop}:${val.replace(/\bwhite\b/g,'#ffffff').replace(HEX,h=>mapColor(h,role))}`);}
  return out.join(';');
}
function prefix(sel){
  return sel.split(',').map(s=>{s=s.trim();
    if(s===':root'||s==='html')return PREFIX;
    if(s.startsWith(':root'))return PREFIX+s.slice(5);
    if(s.startsWith('html'))return PREFIX+s.slice(4);
    return `${PREFIX} ${s}`;}).join(',');
}
function emit(rules){
  let out='';
  for(const r of rules){
    if(r.at){const inner=emit(r.rules);if(inner)out+=`${r.at}{\n${inner}}\n`;continue;}
    const body=convertBody(r.body);if(body)out+=`${prefix(r.sel)}{${body}}\n`;
  }
  return out;
}
let css=`/* GENERATED by tools/build-dark.cjs — do not edit by hand. */\n${PREFIX}{color-scheme:dark}\n`;
for(const f of SOURCES){const src=fs.readFileSync(path.join(dist,f),'utf8');css+=`/* ${f} */\n`+emit(parse(src));}
fs.writeFileSync(process.env.DARK_OUT||path.join(dist,'dark.css'),css);
console.log('dark.css',css.length,'bytes,',(css.match(/\n/g)||[]).length,'lines');
