import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {newPaper,newScene,uid,validatePaper,templates} from '../src/exam/model.mjs';
import {PaperStore} from '../desktop/exam/store.mjs';
import {importSource} from '../src/exam/documents.mjs';
import {exportResource} from '../src/exam/resources.mjs';
import {offlineHTML} from '../desktop/exam/backend.mjs';

const source=process.argv[2];if(!source)throw Error('请传入专题强化6 DOCX 路径');
const store=await new PaperStore(resolve('.qa/exam-workbench/sample-data')).init(),paper=await store.create('专题强化6 · 整卷可视化示例');
await importSource(store,paper,resolve(source));
const examples=paper.questions.filter(q=>/^例\s*[1-5]/.test(q.title.trim())),numbered=paper.questions.filter(q=>/^\d+[.．、]/.test(q.title.trim()));
for(let i=1;i<=4;i++){
 const q=examples.find(q=>new RegExp('^例\\s*'+i+'(?:\\D|$)').test(q.title.trim()));if(q){q.scenes.push(newScene('原题 · 平面演示','lesson:ex'+i));q.activeSceneId=q.scenes[0].id;if(i===4)q.scenes.push(newScene('立体界面 · 例4','spatial:example4'));}
}
for(let i=1;i<=6;i++){
 const q=numbered.find(q=>new RegExp('^'+i+'[.．、]').test(q.title.trim()));if(!q)continue;
 if(i<6)q.scenes.push(newScene('原题场景','lesson:p'+i));else for(const [part,key] of [['第(1)问 · 加速与选择','p6a'],['第(2)问 · 条件核对','p6b'],['第(3)问 · 磁场换向','p6c']]){const s=newScene(part,'lesson:'+key);s.part=part;q.scenes.push(s);}
 q.activeSceneId=q.scenes[0].id;
}
const supplemental=numbered.find(q=>/^1[.．、]/.test(q.title.trim())&&/立方体/.test(q.title.trim()));if(supplemental){supplemental.scenes.push(newScene('xy 截面演示','lesson:s1'));supplemental.activeSceneId=supplemental.scenes[0].id;}
for(const q of paper.questions){if(q.scenes.length){const scene=q.scenes[0],template=templates.find(t=>t.kind===scene.kind&&JSON.stringify(newScene('reference',t.id).snapshot.scene)===JSON.stringify(scene.snapshot.scene));if(template)q.title=template.title;}q.review='pending';if(q.scenes.length)q.notes.push({kind:'demonstration',text:'已关联先前制作的课堂预设。题干来自原文，演示数值与适用范围请对照场景核对。'});else q.notes.push({kind:'limitation',text:'原题已保留，尚未制作本题的可运行场景。'});}
paper.activeQuestionId=examples.find(q=>/^例\s*2/.test(q.title.trim()))?.id||paper.questions[0]?.id;
await store.save(paper);const portable=await store.portable(paper,{includeOriginals:true});validatePaper(portable,{portable:true});
const out=resolve('dist/exam');await mkdir(out,{recursive:true});await writeFile(join(out,'sample.tijingexam'),exportResource(portable));
const lesson=await store.portable(paper,{includeOriginals:false});await writeFile(join(out,'专题强化6整卷可视化.html'),await offlineHTML(lesson,out));
await writeFile(join(out,'sample-report.json'),JSON.stringify({questionCount:paper.questions.length,scenes:paper.questions.reduce((n,q)=>n+q.scenes.length,0),questionsWithScenes:paper.questions.filter(q=>q.scenes.length).length,questions:paper.questions.map(q=>({title:q.title,scenes:q.scenes.map(s=>({title:s.title,kind:s.kind})),attachments:q.attachments.length}))},null,2));
console.log('Built sample: '+paper.questions.length+' questions, '+paper.questions.reduce((n,q)=>n+q.scenes.length,0)+' scenes');
