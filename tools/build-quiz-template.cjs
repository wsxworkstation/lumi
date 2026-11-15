/* Builds dist/assets/lumi-quiz-template.xlsx: the Quizizz 10-column layout (sheet 1) plus a how-to sheet.
   Run: node tools/build-quiz-template.cjs */
const fs=require('fs'),path=require('path');
const JSZip=require('../dist/vendor/jszip.min.js');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const col=i=>String.fromCharCode(65+i);
function sheet(rows,widths,{header=false,wrapCols=[]}={}){
  const cols=`<cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const body=rows.map((r,ri)=>`<row r="${ri+1}">${r.map((v,ci)=>{
    if(v===''||v==null)return '';
    const ref=`${col(ci)}${ri+1}`,s=header&&ri===0?1:wrapCols.includes(ci)?2:0;
    return typeof v==='number'?`<c r="${ref}" s="${s}"><v>${v}</v></c>`:`<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const freeze=header?'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>':'';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${body}</sheetData></worksheet>`;
}
const quiz=[
  ['Question Text','Question Type','Option 1','Option 2','Option 3','Option 4','Option 5','Correct Answer','Time in seconds','Image Link'],
  ['Selesaikan 2x + 3 = 11. Berapakah nilai x?','Multiple Choice','3','4','7','8','',2,30,''],
  ['Persamaan y = 3x − 2 ialah satu garis lurus.','Multiple Choice','Betul','Salah','','','',1,20,''],
  ['Which of these are prime numbers?','Checkbox','2','4','5','9','',"1,3",30,''],
  ['光合作用需要哪一种气体？','Multiple Choice','氧气','二氧化碳','氮气','','',2,20,''],
  ['Sebuah segi empat tepat berukuran 6 cm × 4 cm. Berapakah luasnya? (cm²)','Multiple Choice','10','24','20','48','',2,45,''],
];
const help=[
  ['微光 Lumi · 线上练习 Excel 模板'],
  [''],
  ['格式跟 Quizizz 一样：第 1 行是表头，不要改；从第 2 行开始一行一题。'],
  ['Question Text：题目。'],
  ['Question Type：Multiple Choice（选择题／对错题）、Checkbox（多选，全部选对才算对）、Fill-in-the-Blank（填空，答案写在 Option 1）。'],
  ['对错题：用 Multiple Choice，Option 1 写 Betul／True／对，Option 2 写 Salah／False／错。'],
  ['Option 1–5：选项，用不到的留空。'],
  ['Correct Answer：正确选项的编号 1–5；多选用逗号，例如 1,3。'],
  ['Time in seconds：可不填（微光不限时间）。'],
  ['图片：直接把图片贴在那一题的那一行（哪一格都可以，Excel 和 WPS 都行），或在 Image Link 放图片网址。'],
  [''],
  ['学生要答对才能去下一题；全部答对就自动记「已交」。'],
  ['做好后，在微光打开那份功课 →「线上练习」→ 上传这个文件，先预览再发布。'],
];
const zip=new JSZip();
zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
zip.file('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Quiz" sheetId="1" r:id="rId1"/><sheet name="说明" sheetId="2" r:id="rId2"/></sheets></workbook>');
zip.file('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
zip.file('xl/styles.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3564DB"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/><xf fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>');
zip.file('xl/worksheets/sheet1.xml',sheet(quiz,[46,18,16,16,16,16,12,16,16,30],{header:true,wrapCols:[0]}));
zip.file('xl/worksheets/sheet2.xml',sheet(help,[110]));
zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}).then(buf=>{
  const out=path.join(__dirname,'../dist/assets/lumi-quiz-template.xlsx');fs.writeFileSync(out,buf);console.log(out,buf.length,'bytes');
});
