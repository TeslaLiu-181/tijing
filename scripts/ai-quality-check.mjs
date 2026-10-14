import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/exam/database.mjs';
import {Resources} from '../server/exam/resources.mjs';
import {AIService} from '../server/exam/ai-service.mjs';
import {newQuestion} from '../src/exam/model.mjs';
const out=resolve(process.env.AI_QUALITY_OUTPUT||'.qa/overnight-20261003/quality-chain-flash');await mkdir(out,{recursive:true,mode:0o700});
const cases=JSON.parse(await readFile('tests/fixtures/ai-curriculum.json','utf8')).filter(c=>['strip-penetration','half-plane-return'].includes(c.id));
cases.push({id:'heldout-triple-speed',title:'速度三倍的条带变式',text:'在0<x<d的带状匀强磁场内B垂直纸面向里，边界外无场。一正电粒子从(0,0)沿+x方向射入，原来的圆周半径r=d/2。现在仅把速率变为原来的3倍，其他条件不变、忽略其他力。求新的圆周半径，并判断第一次运动能否从x=d穿出，说明是否只是相切。',expected:'R=3d/2；能从右边界真正穿出，非相切；入场支出场时x=d'});
cases.push({id:'uncertain-source-review',title:'模糊题图条件不许补造',text:'学生提供的题图中，电荷前的正负号、磁场方向箭头和入射角都看不清。原图当前无法补充，请不要猜成质子或默认正电/垂直入射。请给具体偏转方向及精确半径数值。',expected:'needs_confirmation，missing保留正负/磁向/角度与数值不足，不给无条件具体方向/半径'});
const db=await openDatabase(join(out,'data')),user={id:'user-'+randomUUID(),role:'teacher'};
db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(user.id,user.id,'合成质量链教师','no-real-login','teacher',new Date().toISOString());
const resources=new Resources(db,join(out,'data')),ai=await new AIService(db,{dataDir:join(out,'data'),resources}).init();
const report={startedAt:new Date().toISOString(),syntheticOnly:true,realProvider:true,reviewEnabled:ai.reviewEnabled,cases:[],usage:{inputTokens:0,outputTokens:0,totalTokens:0,calls:0},scope:'Runtime evidence and full answers require human physics review; HTTP completion does not prove answer correctness.'};
try{
 for(const c of cases.filter(c=>!process.env.AI_QUALITY_CASES||process.env.AI_QUALITY_CASES.split(',').includes(c.id))) {
  const state=resources.create(user,'质量链 · '+c.title),q=newQuestion(c.title,c.text);q.review='confirmed';state.paper.questions.push(q);state.paper.activeQuestionId=q.id;resources.update(user,state.paper,state.resource.version);
  const started=await ai.start(user,{mode:'tutor',prompt:'请给出结论、关键推导和适用条件。不要补造题设，核对正负号与边界关系。',resourceId:state.paper.id,questionId:q.id,view:'private',consent:true});
  let job,lastPhase='';
  for(let n=0;n<650;n++) {
   job=ai.get(user,started.id);if(job.phase!==lastPhase){console.log(JSON.stringify({id:c.id,phase:job.phase,status:job.status}));lastPhase=job.phase;}
   if(!['queued','running'].includes(job.status))break;await new Promise(r=>setTimeout(r,1000));
  }
  const record={id:c.id,source:c.text,expected:c.expected,job,reviewRequired:true};await writeFile(join(out,c.id+'.json'),JSON.stringify(record,null,2),{mode:0o600});
  const entry={id:c.id,status:job.status,verification:job.result?.verification,review:job.result?.review,missing:job.result?.missing,usage:job.usage,model:job.model,error:job.error,reviewRequired:true};
  report.cases.push(entry);for(const key of Object.keys(report.usage))report.usage[key]+=job.usage?.[key]||0;
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({id:c.id,status:job.status,verification:entry.verification,tokens:job.usage?.totalTokens,calls:job.usage?.calls}));
 }
}catch(error){report.error=error.message;process.exitCode=1;}
finally{await ai.close();db.close();report.finishedAt=new Date().toISOString();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2),{mode:0o600});}
