/* Online practice: the quiz Excel (Quizizz layout) with pictures from Excel and WPS. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
global.JSZip=require('../dist/vendor/jszip.min.js');
const Xlsx=require('../dist/xlsx-lite.js');
const Q=require('../dist/quiz-import.js');
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const HEAD=['Question Text','Question Type','Option 1','Option 2','Option 3','Option 4','Option 5','Correct Answer','Time in seconds','Image Link'];
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const cellXml=(v,ref)=>typeof v==='number'?`<c r="${ref}"><v>${v}</v></c>`:v&&v.f?`<c r="${ref}" t="str"><f>${esc(v.f)}</f><v>${esc(v.v||'')}</v></c>`:v?`<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`:'';
/* A small workbook: rows of cells, optional floating picture (drawing) and WPS cell pictures. */
async function book(rows,{drawingRow,wps}={}){
  const z=new JSZip(),R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  z.file('xl/workbook.xml',`<workbook xmlns:r="${R}"><sheets><sheet name="Quiz" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  z.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  const data=rows.map((r,i)=>`<row r="${i+1}">${r.map((v,c)=>cellXml(v,String.fromCharCode(65+c)+(i+1))).join('')}</row>`).join('');
  z.file('xl/worksheets/sheet1.xml',`<worksheet xmlns:r="${R}"><sheetData>${data}</sheetData>${drawingRow!=null?'<drawing r:id="rId9"/>':''}</worksheet>`);
  if(drawingRow!=null){
    z.file('xl/worksheets/_rels/sheet1.xml.rels','<Relationships><Relationship Id="rId9" Target="../drawings/drawing1.xml"/></Relationships>');
    z.file('xl/drawings/drawing1.xml',`<xdr:wsDr xmlns:xdr="x" xmlns:a="a" xmlns:r="${R}"><xdr:twoCellAnchor><xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${drawingRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:pic><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></xdr:twoCellAnchor></xdr:wsDr>`);
    z.file('xl/drawings/_rels/drawing1.xml.rels','<Relationships><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>');
    z.file('xl/media/image1.png',PNG,{base64:true});
  }
  if(wps){
    z.file('xl/cellimages.xml',`<etc:cellImages xmlns:etc="e" xmlns:xdr="x" xmlns:a="a" xmlns:r="${R}"><etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="ID_ABC"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></etc:cellImage></etc:cellImages>`);
    z.file('xl/_rels/cellimages.xml.rels','<Relationships><Relationship Id="rId1" Target="media/image2.jpeg"/></Relationships>');
    z.file('xl/media/image2.jpeg',PNG,{base64:true});
  }
  return Xlsx.read(await z.generateAsync({type:'nodebuffer'}));
}
test('the Lumi quiz template parses cleanly with the Quizizz header',async()=>{
  const b=await Xlsx.read(fs.readFileSync(path.join(__dirname,'../dist/assets/lumi-quiz-template.xlsx')));
  assert.deepEqual(b.sheets.Quiz[0],HEAD);
  const r=Q.parse(b);assert.deepEqual(r.errors,[]);assert.deepEqual(r.warnings,[]);
  assert.deepEqual(r.questions.map(q=>q.type),['mc','mc','multi','mc','mc']);
  assert.deepEqual(r.questions[1].options,['Betul','Salah'],'true/false is a two-option choice');
  assert.deepEqual(r.questions[2].answer,[1,3]);
});
test('a picture pasted on a question row (Excel floating or WPS in-cell) belongs to that question',async()=>{
  const r=Q.parse(await book([HEAD,['Q1','Multiple Choice','a','b','','','',1],['Q2','Multiple Choice','a','b','','','',2]],{drawingRow:2}));
  assert.equal(r.questions[0].image,undefined);assert.equal(r.questions[1].image.type,'image/png');assert.equal(r.questions[1].image.base64,PNG);
  const w=Q.parse(await book([HEAD,['Q1','Multiple Choice','a','b','','','',1,'',{f:'_xlfn.DISPIMG("ID_ABC",1)',v:'=DISPIMG("ID_ABC",1)'}]],{wps:true}));
  assert.equal(w.questions[0].image.type,'image/jpeg');
  const link=Q.parse(await book([HEAD,['Q1','Multiple Choice','a','b','','','',1,'','https://example.com/x.png']]));
  assert.equal(link.questions[0].image.url,'https://example.com/x.png');
});
test('mistakes are reported by row; a title row above the header is fine',async()=>{
  const r=Q.parse(await book([['我的练习'],HEAD,['','Multiple Choice','a','b','','','',1],['Q','Multiple Choice','a','','c','','',1],['Q','Multiple Choice','a','b','','','',3],['Q','Essay','a','b','','','',1],['Q','Multiple Choice','a','b','','','',"1,2"],['Q','填空','  Fotosintesis ','','','','',1]]));
  assert.equal(r.errors.length,4);assert.match(r.errors[0],/第 3 行/);assert.match(r.errors[3],/Essay/);
  assert.equal(r.questions.length,2);assert.equal(r.questions[0].type,'multi');assert.equal(r.warnings.length,1);
  assert.deepEqual(r.questions[1].accept,['Fotosintesis']);
  assert.ok(Q.check(r.questions[1],'fotosintesis '));assert.ok(!Q.check(r.questions[1],'respirasi'));
  assert.ok(Q.check(r.questions[0],[2,1]));assert.ok(!Q.check(r.questions[0],[1]));
  assert.match(Q.parse({sheets:{A:[['x']]}}).errors[0],/表头/);
});
