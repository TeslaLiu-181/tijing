import {readFile,stat} from 'node:fs/promises';
import {basename,extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {extractDocx} from './docx-parser.mjs';
export {extractDocx,ommlToLatex} from './docx-parser.mjs';
import sharp from 'sharp';

function questionHeading(text) {
  const s=text.replace(/【图[^】]*】/g,'').replace(/^[\s　]+/,'');
  if(/^(?:例\s*\d+|针对训练|变式训练|跟踪训练|强化练\s*\d+)/.test(s))return true;
  if(/^\d+[.．、]\s*(?:划分过程|找关键点|画运动轨迹)[：:]/.test(s))return false;
  if(/^\d+[.．、]\s*(?:适用条件|特点|界定方法|方法|步骤|结论|学习目标)/.test(s))return false;
  // PDF lines may wrap immediately after the number. Length is not evidence
  // that a numbered question is complete; keep short starts as separate items.
  return /^\d{1,3}[.．、][ \t　]*(?=[^\s\d])/.test(s);
}
export function splitQuestions(paragraphs,{fallbackTitle='导入材料'}={}) {
  // Teaching books may start with numbered knowledge summaries. Those are
  // source material, not candidate exam questions. Preserve original indices.
  const firstExample=paragraphs.findIndex(p=>/^例\s*\d+/.test(p.text.replace(/【图[^】]*】/g,'').trim()));
  const teachingPreface=firstExample>0&&paragraphs.slice(0,firstExample).some(p=>/学习目标/.test(p.text));
  const starts=paragraphs.map((p,i)=>questionHeading(p.text)&&(!teachingPreface||i>=firstExample)?i:-1).filter(i=>i>=0),groups=[];
  if(!starts.length)starts.push(0);
  for(let i=0;i<starts.length;i++) {
    const slice=paragraphs.slice(starts[i],starts[i+1]??paragraphs.length);
    const needsOutline=starts.length===1&&!paragraphs.some(p=>questionHeading(p.text));
    const answerAt=needsOutline?-1:slice.findIndex(p=>/^\s*(?:答案|解析|解答|参考答案|详解)[　\s:：]/.test(p.text));
    const stem=answerAt<0?slice:slice.slice(0,answerAt);
    // Navigation labels are plain text. Keep complete formulas in sourceText
    // instead of cutting a LaTeX command in half when shortening the title.
    const heading=questionHeading(stem[0]?.text||'')?stem[0].text:fallbackTitle;
    let title=heading.replace(/【图[^】]*】/g,'').replace(/\$\$[\s\S]*?\$\$|\$(?:\\.|[^$])+\$/g,'').replace(/\s+/g,' ').trim();
    if(/^\d+[.．、]$/.test(title))title+=' 题目';
    groups.push({title:Array.from(title||fallbackTitle).slice(0,70).join(''),
      text:stem.map(p=>p.text).filter(Boolean).join('\n\n'),
      referenceText:answerAt<0?'':slice.slice(answerAt).map(p=>p.text).join('\n\n'),
      paragraphIndices:stem.map(p=>p.index),imageIds:[...new Set(stem.flatMap(p=>p.images||[]))],
      parts:stem.map(p=>p.text).filter(text=>/^[（(]\d+[）)]/.test(text)),
      needsOutline});
  }
  return groups;
}

export async function normalizeImage(data) {
  return sharp(Buffer.from(data),{limitInputPixels:80_000_000}).rotate().png().toBuffer();
}

export async function importSource(store,project,path,{renderPdf,onProgress=()=>{},docxMaxBytes}={}) {
  if(!['.png','.jpg','.jpeg','.webp','.gif','.tif','.tiff','.docx','.pdf'].includes(extname(path).toLowerCase()))throw new Error('支持图片、PDF 和 DOCX 文件');
  const info=await stat(path);if(info.size>150*1024*1024)throw new Error('单个输入文件超过 150 MB');
  const extension=extname(path).toLowerCase(),source={id:randomUUID(),title:basename(path),type:extension.slice(1),createdAt:new Date().toISOString(),warnings:[]};
  source.asset=await store.addAsset(project,path,{kind:'original'});
  const data=await readFile(path),questions=[];
  if(['.png','.jpg','.jpeg','.webp','.gif','.tif','.tiff'].includes(extension)) {
    const image=await store.writeAsset(project,await normalizeImage(data),{name:basename(path),kind:'image'});
    const question=store.newQuestion(basename(path),'请依据所附题图识别题意；关键条件看不清时先澄清。');question.attachments=[image];question.sourceId=source.id;question.needsOutline=true;questions.push(question);
  } else if(extension==='.docx') {
    const parsed=extractDocx(data,{maxBytes:docxMaxBytes}),assets=new Map();
    for(const [id,media] of parsed.media) {
      try{assets.set(id,await store.writeAsset(project,await normalizeImage(media.data),{name:`${source.title} · 图 ${id}`,kind:'image'}));}
      catch(error){source.warnings.push(`图 ${id} (${media.extension}) 未能解码：${error.message}`);}
    }
    source.paragraphs=parsed.paragraphs;
    for(const group of splitQuestions(parsed.paragraphs,{fallbackTitle:source.title})) {
      const question=store.newQuestion(group.title,group.text);question.sourceId=source.id;question.referenceText=group.referenceText;question.parts=group.parts;question.selectedPart='';
      question.needsOutline=group.needsOutline;
      question.attachments=group.imageIds.filter(id=>assets.has(id)).map(id=>({...assets.get(id),sourceRef:id}));
      question.sourceAnchors=group.paragraphIndices.map(index=>({sourceId:source.id,paragraph:index+1}));
      if(group.needsOutline)question.notes.push({kind:'unknown',text:'未自动确认题目边界，当前保留完整材料，可编辑题干或让助手先整理题意。'});
      const missing=group.imageIds.filter(id=>!assets.has(id));if(missing.length)question.notes.push({kind:'unknown',text:'以下题图未能读取：'+missing.join('、')+'。不能根据缺失图猜测物理条件。'});
      questions.push(question);
    }
  } else if(extension==='.pdf') {
    if(!renderPdf)throw new Error('PDF 页面渲染器尚未就绪');
    const pages=await renderPdf(new Uint8Array(data));source.pageCount=pages.length;
    const paragraphs=[],pageAssets=new Map();
    for(const page of pages) {
      onProgress({completed:page.number,total:pages.length});
      const image={...await store.writeAsset(project,Buffer.from(page.pngBase64,'base64'),{name:`${source.title} · 第 ${page.number} 页`,kind:'page'}),page:page.number};pageAssets.set('page'+page.number,image);
      for(const line of page.lines.length?page.lines:['（此页没有可提取文本，请结合原页图像识别。）'])paragraphs.push({index:paragraphs.length,text:line,images:['page'+page.number],page:page.number});
    }
    source.paragraphs=paragraphs;
    const groups=splitQuestions(paragraphs,{fallbackTitle:source.title});
    for(const group of groups) {
      const question=store.newQuestion(group.title,group.text);question.sourceId=source.id;question.referenceText=group.referenceText;question.parts=group.parts;question.selectedPart='';
      question.needsOutline=group.needsOutline;
      question.attachments=group.imageIds.map(id=>pageAssets.get(id)).filter(Boolean);
      question.sourceAnchors=[...new Set(group.paragraphIndices.map(i=>paragraphs[i].page))].map(page=>({sourceId:source.id,page}));
      question.notes.push({kind:'limitation',text:'PDF 文字经过提取，公式和跨栏顺序请结合保留的原页核对。'});
      if(group.needsOutline)question.notes.push({kind:'unknown',text:'未可靠识别分题边界；请结合保留的原页图像明确要处理的题目。'});
      questions.push(question);
    }
    const assigned=new Set(questions.flatMap(q=>q.attachments.map(a=>a.id))),unassigned=[...pageAssets.values()].filter(a=>!assigned.has(a.id));
    if(unassigned.length){const material=store.newQuestion('待整理原页 · '+source.title,'这些原页未被自动分题覆盖。请依据原页整理题目，保留未看清的条件。');material.sourceId=source.id;material.needsOutline=true;material.attachments=unassigned;material.sourceAnchors=unassigned.map(a=>({sourceId:source.id,page:a.page}));questions.push(material);}
  } else throw new Error('支持图片、PDF 和 DOCX 文件');
  if(!questions.length)throw new Error('文件中没有可导入内容');
  project.sources.push(source);project.questions.push(...questions);await store.save(project);return {source,questions};
}
