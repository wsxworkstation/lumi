/* Online practice (quiz) from Excel. Same 10 columns as the Quizizz spreadsheet, so a file made for Quizizz loads as is:
   Question Text | Question Type | Option 1–5 | Correct Answer | Time in seconds | Image Link.
   A picture can be a link in "Image Link", or pasted anywhere on the question's row (floating or in-cell, Excel or WPS). */
(root=>{
  'use strict';
  const HEAD=['question text','question type','option 1','option 2','option 3','option 4','option 5','correct answer','time in seconds','image link'];
  const norm=v=>String(v??'').replace(/\s+/g,' ').trim();
  const TYPES={'multiple choice':'mc','true or false':'mc','true/false':'mc','选择题':'mc','对错':'mc','对错题':'mc','checkbox':'multi','多选':'multi','多选题':'multi','fill-in-the-blank':'fill','fill in the blank':'fill','填空':'fill','填空题':'fill'};
  /* Find the header row (Quizizz puts it on row 1; a title row above it is fine). */
  function headerRow(rows){
    for(let i=0;i<Math.min(rows.length,6);i++){const r=(rows[i]||[]).map(v=>norm(v).toLowerCase());if(r.includes('question text')&&r.includes('correct answer'))return i;}
    return -1;
  }
  function parse(book){
    const names=Object.keys(book.sheets||{}),sheet=names.find(n=>headerRow(book.sheets[n])>=0);
    if(!sheet)return {questions:[],errors:['找不到表头「Question Text … Correct Answer」，请用微光的模板或 Quizizz 格式 / Header row not found'],warnings:[]};
    const rows=book.sheets[sheet],h=headerRow(rows),cols=rows[h].map(v=>norm(v).toLowerCase()),at=name=>cols.indexOf(name);
    const pics=(book.images?.[sheet]||[]),questions=[],errors=[],warnings=[];
    for(let i=h+1;i<rows.length;i++){
      const r=rows[i]||[],cell=name=>at(name)<0?'':norm(r[at(name)]),line=`第 ${i+1} 行 / Row ${i+1}`;
      const text=cell('question text'),onRow=pics.filter(p=>p.row===i);
      if(!text&&!onRow.length&&!r.some(v=>norm(v)))continue;
      const options=[1,2,3,4,5].map(n=>cell(`option ${n}`));
      while(options.length&&!options.at(-1))options.pop();
      const rawType=cell('question type').toLowerCase(),type=TYPES[rawType]||(rawType?'':'mc');
      const answerText=cell('correct answer'),link=cell('image link');
      if(!text){errors.push(`${line}：没有题目 / Question text is missing`);continue;}
      if(!type){errors.push(`${line}：不认识的题型「${cell('question type')}」/ Unknown question type`);continue;}
      const q={no:questions.length+1,row:i+1,text,type,options,answer:[]};
      if(type==='fill'){
        if(!options[0]){errors.push(`${line}：填空题的答案要写在 Option 1 / Put the answer in Option 1`);continue;}
        q.options=[];q.accept=options.filter(Boolean);
      }else{
        if(options.length<2||options.some(o=>!o)){errors.push(`${line}：至少要两个选项，中间不能空 / Need at least two options with no gaps`);continue;}
        q.answer=[...new Set(answerText.split(/[,，、\s]+/).filter(Boolean).map(Number))].sort((a,b)=>a-b);
        if(!q.answer.length||q.answer.some(n=>!Number.isInteger(n)||n<1||n>options.length)){errors.push(`${line}：正确答案要填选项编号 1–${options.length} / Correct Answer must be an option number`);continue;}
        if(type==='mc'&&q.answer.length>1){warnings.push(`${line}：有 ${q.answer.length} 个正确答案，当成多选题 / Several answers: treated as multi-select`);q.type='multi';}
      }
      const secs=Number(cell('time in seconds'));if(Number.isFinite(secs)&&secs>0)q.time=secs;
      if(onRow.length){q.image=onRow[0];if(onRow.length>1)warnings.push(`${line}：有 ${onRow.length} 张图，只用第一张 / Only the first picture is used`);}
      else if(link){if(/^https?:\/\//i.test(link))q.image={url:link};else warnings.push(`${line}：Image Link 不是网址，已忽略 / Image Link is not a web address`);}
      questions.push(q);
    }
    const stray=pics.filter(p=>p.row<=h||!questions.some(q=>q.row===p.row+1));
    if(stray.length)warnings.push(`有 ${stray.length} 张图不在任何题目那一行，没有用到 / ${stray.length} picture(s) are not on a question row`);
    if(!questions.length&&!errors.length)errors.push('没有题目 / No questions');
    return {sheet,questions,errors,warnings};
  }
  /* Is this answer right? choice: array of option numbers; fill: the typed text. */
  function check(q,given){
    if(q.type==='fill'){const g=norm(given).toLowerCase();return q.accept.some(a=>norm(a).toLowerCase()===g);}
    const picked=[...new Set([].concat(given).map(Number))].sort((a,b)=>a-b);
    return JSON.stringify(picked)===JSON.stringify(q.answer);
  }
  const api={parse,check,HEAD};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LumiQuiz=api;
})(globalThis);
