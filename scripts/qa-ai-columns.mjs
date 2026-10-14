import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/exam/database.mjs';
import {Accounts} from '../server/exam/auth.mjs';
import {Resources} from '../server/exam/resources.mjs';
import {Assignments} from '../server/exam/assignments.mjs';
import {AIService} from '../server/exam/ai-service.mjs';
import {loadModelConfiguration} from '../server/exam/model-provider.mjs';
const root=resolve(process.argv[2]||'.qa/ai-columns'),pdf=resolve('tests/fixtures/synthetic-physics-columns.pdf');
try{await access(root);throw Error('Evidence directory already exists; do not silently repeat a paid check');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(root,{recursive:true,mode:0o700});const data=join(root,'data'),db=await openDatabase(data),accounts=new Accounts(db);
await accounts.initialize({adminUsername:'qa-columns-teacher',adminPassword:randomUUID()+'aA1',inviteCode:'qa-columns-private',className:'合成材料验收'});
const teacher={...db.prepare("SELECT id,role FROM users WHERE role='teacher'").get()},resources=new Resources(db,data),assignments=new Assignments(db,resources);await assignments.cleanupPending();
const configuration=await loadModelConfiguration(process.env),ai=await new AIService(db,{dataDir:data,resources,configuration}).init();
const report={syntheticOnly:true,sourcePDF:basename(pdf),realModelCalls:1,startedAt:new Date().toISOString(),manualReviewRequired:true};
try{
 const started=await ai.start(teacher,{mode:'extract',prompt:'只整理这份材料里的题干和已知条件，按题号分开，保留符号、正负号、数值和单位，标记所在原页，不混入参考答案或解题结论。',consent:true,attachments:[{filename:basename(pdf),data:(await readFile(pdf)).toString('base64')}]});
 let job;for(let n=0;n<1800;n++){job=ai.get(teacher,started.id);if(!['queued','running'].includes(job.status))break;await new Promise(r=>setTimeout(r,200));}
 report.job=job;await writeFile(join(root,'extraction.json'),JSON.stringify(job,null,2),{mode:0o600});
 assert.equal(job.status,'completed',JSON.stringify(job.error));report.questionCount=job.result.questions?.length||0;
 assert.equal(report.questionCount,2);assert.equal(job.result.status,'answer',JSON.stringify(job.result.missing));
 assert(job.result.questions.every(q=>q.sourceRefs?.some(r=>r.sourceName===basename(pdf)&&r.page===1)));
 const joined=job.result.questions.map(q=>q.sourceText).join('\n');assert(!/最远距离为|不能从.*穿出|0\.020|动能不变|初始受力方向向上/.test(joined));
 report.structureAssertions=true;
 const state=await ai.apply(teacher,job.id,{confirmGivens:true,questionIndices:[0,1]});report.resource={questions:state.paper.questions.length,assets:Object.keys(state.paper.assets).length,sources:state.paper.sources.length};
 const original=Object.values(state.paper.assets).find(a=>a.kind==='original');assert(original);
 for(const q of state.paper.questions){assert(q.sourceAnchors?.every(a=>a.page===1));assert(q.attachments.every(a=>state.paper.assets[a.id].page===1));}
 report.selectedQuestionPages=[...new Set(state.paper.questions.flatMap(q=>q.attachments.map(a=>state.paper.assets[a.id].page)))];
 const group=accounts.groups.create(teacher,{kind:'class',name:'虚构PDF页码验收班',inviteCode:'qa-columns-class'}),student=(await accounts.register({username:'qa-columns-student',displayName:'虚构PDF学习者',password:randomUUID()+'aA1',inviteCode:group.inviteCode},'local-fixture')).user;
 const task=await assignments.create(teacher,{title:'虚构题干分享范围验收',instructions:'仅分享第一题的题干与其对应原页。',kind:'exploration',groupIds:[group.id],status:'published',material:{resourceId:state.paper.id,resourceVersion:state.resource.version,selection:'question',questionId:state.paper.questions[0].id}});
 const studentView=assignments.material(student,task.id);assert.equal(studentView.paper.questions.length,1);assert.equal(studentView.paper.questions[0].referenceText,'');assert.equal(studentView.paper.assets[original.id],undefined);
 assert(Object.values(studentView.paper.assets).every(a=>a.kind!=='original'&&a.page===1));report.taskOnlySelectedPage=true;
 report.uploadedBytesPreserved=(await readFile(resources.assetFor(teacher,state.paper.id,original.id).path)).equals(await readFile(pdf));assert(report.uploadedBytesPreserved);
 report.usage=job.usage;report.finishedAt=new Date().toISOString();
}catch(error){report.error={message:error.message,code:error.code};process.exitCode=1;}
finally{await ai.close();db.close();await writeFile(join(root,'report.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({output:root,questionCount:report.questionCount,structuralPass:report.structureAssertions,taskOnlySelectedPage:report.taskOnlySelectedPage,error:report.error,usage:report.usage,manualReviewRequired:true}));}
