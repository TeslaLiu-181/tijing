import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {newPaper,newQuestion,validatePaper} from '../../src/exam/model.mjs';
import {exportResource} from '../../src/exam/resources.mjs';
import {nativeScenes} from './native-scenes.mjs';
import {titles,answerOverrides,nativePartNotes} from './answers.mjs';
import {supplementScenes} from './supplement-scenes.mjs';
import {supplementAnswerOverrides,supplementAnswerNotes} from './supplement-answers.mjs';

const includeSupplement=process.argv.includes('--supplement');
const root=resolve('.qa/holiday-20261006'),out=resolve(includeSupplement?'dist/holiday-20261006-full':'dist/holiday-20261006');await mkdir(out,{recursive:true});
const sourceArg=process.argv.find(value=>value.startsWith('--source-dir='));
if(!sourceArg)throw Error('请传入 --source-dir=你的已授权DOCX目录；使用流程见 teaching/README.md');
const sourceDirectory=resolve(sourceArg.slice('--source-dir='.length));
const sources=JSON.parse(await readFile(join(root,'sources.json'),'utf8')),scenes=nativeScenes(),supplements=includeSupplement?supplementScenes():[],manifest=[];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const source of sources){
 const questions=JSON.parse(await readFile(join(source.dir,'paired.json'),'utf8')),sizes=JSON.parse(await readFile(join(source.dir,'image-sizes.json'),'utf8'));
 const p=newPaper(`假期作业${source.number} · 可视化学习`),sourceId='holiday-source-'+source.number;
 try{const previous=JSON.parse(await readFile(resolve('dist/holiday-20261006',`假期作业${source.number}.json`),'utf8'));p.id=previous.id;p.createdAt=previous.createdAt;}catch(error){if(error.code!=='ENOENT')throw error;}
 const original=await readFile(join(sourceDirectory,source.name));if(digest(original)!==source.sha256)throw Error('原文件已变化，请重新读取：'+source.name);
 const originalId='original-'+source.number;
 p.assets[originalId]={id:originalId,name:source.name,mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',kind:'original',bytes:original.length,sha256:source.sha256,url:'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,'+original.toString('base64')};
 p.sources=[{id:sourceId,title:source.name,type:'docx',createdAt:new Date().toISOString(),asset:{id:originalId},sha256:source.sha256,paragraphs:JSON.parse(await readFile(join(source.dir,'paragraphs.json'),'utf8'))}];
 const coverage=[];
 for(const item of questions){
  const key=source.number+'-'+item.number,own=scenes.filter(s=>s.paper===source.number&&s.question===item.number),extra=supplements.filter(s=>s.paper===source.number&&s.question===item.number),q=newQuestion(`第${item.number}题 · ${titles[source.number][item.number-1]}`,item.text);
  q.id='holiday-'+source.number+'-q'+item.number;q.referenceText=supplementAnswerOverrides[key]||answerOverrides[key]||item.referenceText;q.sourceId=sourceId;q.sourceAnchors=item.sourceParagraphs.map(index=>({sourceId,paragraph:index+1}));
  if(supplementAnswerNotes[key])q.referenceText+='\n\n'+supplementAnswerNotes[key];
  const stemImages=new Set([...q.sourceText.matchAll(/【图 ([a-zA-Z0-9_-]+)】/g)].map(m=>m[1])),refImages=new Set([...q.referenceText.matchAll(/【图 ([a-zA-Z0-9_-]+)】/g)].map(m=>m[1]));
  for(const id of new Set([...stemImages,...refImages])){
   const image=item.images[id];if(!image)throw Error('缺少原文图：'+key+' '+id);
   const assetId='p'+source.number+'-'+id,bytes=Buffer.from(image.url.split(',')[1],'base64'),display=sizes[id];
   p.assets[assetId]??={id:assetId,name:display?.formula?'原文公式 '+id:'原文题图 '+id,mime:'image/png',kind:'image',width:image.width,height:image.height,bytes:bytes.length,sha256:digest(bytes),url:image.url,...(display?{inline:display.formula,displayWidth:display.width*(display.formula?1.05:1.35),displayHeight:display.height*1.05}: {})};
   q.attachments.push({id:assetId,sourceRef:id,role:stemImages.has(id)?'source':'reference'});
  }
  q.scenes=[...own,...extra].map(s=>s.record);q.activeSceneId=q.scenes[0]?.id||null;
  q.parts=item.text.split('\n').map(s=>s.trim()).filter(s=>/^[（(]\d+[）)]/.test(s));
  q.review=q.scenes.length?'confirmed':'pending';
  if(own.length){
   const geometric=own.every(s=>!s.record.snapshot.scene.objects.some(o=>['particle','source'].includes(o.kind)));
   q.notes.push({kind:'model',text:`**${geometric?'原生几何探究':'原生沙盒场景'}**　共${own.length}个场景。${geometric?'使用自由参数观察矢量变化。':'从播放键开始，可用时间轴停在进出场、转向或选定时刻。'}${nativePartNotes[key]?'\n\n'+(extra.length?'本题其余所需过程见同题的补充场景。':nativePartNotes[key]):''}`});
   const assumptions=[...new Set(own.flatMap(s=>s.assumptions))];q.notes.push({kind:'assumption',text:'**建模说明**\n\n'+assumptions.join('\n\n')});
   q.referenceText+='\n\n**对照场景观察**\n\n'+own.map(s=>`**${s.record.title}**\n\n${s.guidance.join('\n\n')}`).join('\n\n');
   coverage.push({question:item.number,title:q.title,status:nativePartNotes[key]?'native-parts':geometric?'native-geometry':'native-ready',scenes:q.scenes.map(s=>({id:s.id,title:s.title}))});
  }else if(!extra.length){
   q.notes.push({kind:'limitation',text:'本题原题、公式、题图和原参考解析已保留。当前原生沙盒未直接覆盖此题所需的导体受力、约束运动、磁通量或三维过程，补充交互演示将在原生场景全部完成后另行投送。'});
   coverage.push({question:item.number,title:q.title,status:'supplement-pending',scenes:[]});
  }
  if(extra.length){
   q.notes.push({kind:'model',text:'**补充交互模型**\n\n'+extra.map(s=>s.assumptions.join('\n\n')).join('\n\n')});
   q.referenceText+='\n\n**补充场景观察**\n\n'+extra.map(s=>`**${s.record.title}**\n\n${s.guidance.join('\n\n')}`).join('\n\n');
   q.referenceText=q.referenceText.replace('仅电场方案需要径向辐向电场，原生工具当前不支持这类空间变方向电场，将在补充解析中另行演示。','仅电场方案见同题补充场景“辐向电场使不同比荷离子聚焦”。');
   const entry=coverage.find(x=>x.question===item.number),fields={status:own.length?'native-and-supplement-ready':'supplement-ready',scenes:q.scenes.map(s=>({id:s.id,title:s.title,kind:s.kind}))};if(entry)Object.assign(entry,fields);else coverage.push({question:item.number,title:q.title,...fields});
  }
  p.questions.push(q);
 }
 p.activeQuestionId=p.questions.find(q=>q.scenes.length)?.id||p.questions[0].id;p.revision=includeSupplement?3:2;validatePaper(p,{portable:true});
 const filename=`假期作业${source.number}`,json=JSON.stringify(p,null,2),bundle=exportResource(p,{includeOriginals:true});
 await writeFile(join(out,filename+'.json'),json);await writeFile(join(out,filename+'.tijingexam'),bundle);
 manifest.push({paper:source.number,title:p.title,source:source.name,sourceSha256:source.sha256,questions:p.questions.length,scenes:p.questions.reduce((n,q)=>n+q.scenes.length,0),nativeQuestions:p.questions.filter(q=>q.scenes.some(s=>s.kind==='planar')).length,supplementQuestions:p.questions.filter(q=>q.scenes.some(s=>s.kind==='supplement')).length,resourceJson:join(out,filename+'.json'),resourcePackage:join(out,filename+'.tijingexam'),jsonSha256:digest(json),coverage});
}
await writeFile(join(out,'manifest.json'),JSON.stringify({builtAt:new Date().toISOString(),phase:includeSupplement?'complete-models':'native-first',papers:manifest},null,2));
console.log(JSON.stringify(manifest.map(p=>({paper:p.paper,questions:p.questions,nativeQuestions:p.nativeQuestions,scenes:p.scenes,json:p.resourceJson})),null,2));
