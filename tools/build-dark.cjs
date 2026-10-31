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
// Intentional dark-mode contrast comes last, after the automatic colour mapping.
// Maintain these rules here, never in the generated dist/dark.css.
css+=`/* Lumi: calm navy surfaces and readable recording states. */
${PREFIX}{--bg:#161d29;--paper:#1e2736;--ink:#e5ebf5;--muted:#a6b3c8;--line:#36435a;--green:#a5b8f5;--pale:#283750;--red:#f0b3bc;--amber:#e2cc9d}
${PREFIX} body{background:var(--bg);color:var(--ink)}
${PREFIX} .sidebar,${PREFIX} .topbar{background:#1b2433;border-color:#344056}
${PREFIX} .card,${PREFIX} .metric,${PREFIX} dialog{background:#1e2736;border-color:#36435a}
${PREFIX} .brand strong,${PREFIX} .name-english{color:#e5ebf5}
${PREFIX} .name-chinese,${PREFIX} .student-name small{color:#b1bdd0}
${PREFIX} .btn{background:#222d40;color:#d1daeb;border-color:#43516a}
${PREFIX} .btn.primary,${PREFIX} .login-scene #cloud-login .btn.primary{background:#5268c7;border-color:#6c81d7;color:#fff}
${PREFIX} .btn.primary:hover,${PREFIX} .login-scene #cloud-login .btn.primary:hover{background:#5b70ce;border-color:#8a9bdf}
${PREFIX} .btn.soft{background:#293651;color:#bfceff;border-color:#42567b}
${PREFIX} .class-pill{background:#202c3e;color:#b5c1d6;border-color:#3a4963}
${PREFIX} .class-pill.active{background:#2b3b58;color:#d4dfff;border-color:#8096d8;box-shadow:inset 0 -2px #8299df}
${PREFIX} .pill-number{background:#26344a;color:#bdc9df;border-color:#45536d}
${PREFIX} th{background:#222d40;color:#bdc9df}
${PREFIX} td{border-color:#344056}
${PREFIX} .table-wrap tbody tr:nth-child(even){background:#222d3f}
${PREFIX} .table-wrap tbody tr:hover{background:#27354d}
${PREFIX} .record-table tr[data-student-row]>td:nth-child(2){background:#1e2736}
${PREFIX} .record-table tr[data-student-row]:nth-child(even)>td:nth-child(2){background:#222d3f}
${PREFIX} .record-table tr[data-student-row]:focus-within>td{background:#2a3b59}
${PREFIX} .record-table tr[data-student-row]:focus-within>td:nth-child(2){box-shadow:inset 3px 0 #9baff1,1px 0 #435371}
${PREFIX} input,${PREFIX} select,${PREFIX} textarea,${PREFIX} .record-table .score,${PREFIX} .login-scene #cloud-login input{background:#222d40;color:#e5ebf5;border-color:#495a76}
${PREFIX} input::placeholder,${PREFIX} textarea::placeholder,${PREFIX} .login-scene #cloud-login input::placeholder{color:#a2b0c8}
${PREFIX} .record-table .score:focus{border-color:#a8bbfb;box-shadow:0 0 0 3px #8299df30}
${PREFIX} .record-table .score.score-error{background:#432b34!important;border-color:#cc8795!important}
${PREFIX} .hw-state{background:#222d40;color:#b9c5db;border-color:#465570}
${PREFIX} .hw-state:hover{background:#30415d;border-color:#8da2df}
${PREFIX} .hw-state.submitted[aria-pressed=true]{background:#263d35;color:#b1d3c0;border-color:#597867}
${PREFIX} .hw-state.missing[aria-pressed=true],${PREFIX} .exam-buttons .hw-state.absent[aria-pressed=true],${PREFIX} .badge.red{background:#462d37;color:#f0b3bc;border-color:#996875}
${PREFIX} .hw-state.late[aria-pressed=true],${PREFIX} .hw-state.makeup[aria-pressed=true]{background:#3d3629;color:#e2cc9d;border-color:#8a774d}
${PREFIX} .exam-indicator.recorded{color:#b1d3c0}
${PREFIX} .saved[data-state=error],${PREFIX} .saved[data-state=expired],${PREFIX} .saved[data-state=conflict]{color:#f0b3bc}
${PREFIX} .login-form-panel{background:#1e2736}
${PREFIX} .login-scene .login-form-heading h1{color:#e5ebf5}
${PREFIX} .login-form-heading p,${PREFIX} .login-eyebrow,${PREFIX} .login-sync-note{color:#b1bdd0}
${PREFIX} .login-scene #cloud-login label{color:#d1daeb}
@media(max-width:640px){
${PREFIX} .record-table tr[data-student-row]{background:#1e2736;border-color:#43516a}
${PREFIX} .record-table tr[data-student-row]:focus-within{background:#283a57;border-color:#9baff1}
}
`;
fs.writeFileSync(process.env.DARK_OUT||path.join(dist,'dark.css'),css);
console.log('dark.css',css.length,'bytes,',(css.match(/\n/g)||[]).length,'lines');
