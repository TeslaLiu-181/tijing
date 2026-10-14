import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/exam/database.mjs';
import {Resources} from '../server/exam/resources.mjs';
import {AIService} from '../server/exam/ai-service.mjs';
import {newQuestion} from '../src/exam/model.mjs';

const out=resolve(process.env.AI_SERVICE_CHECK_OUTPUT||'.qa/ai-service-live');
await mkdir(out,{recursive:true,mode:0o700});const dataDir=join(out,'data'),db=await openDatabase(dataDir);
const user={id:'student-'+randomUUID(),role:'student'};
db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)')
 .run(user.id,user.id,'合成模型验收学生','no-real-login',user.role,new Date().toISOString());
const resources=new Resources(db,dataDir),ai=await new AIService(db,{dataDir,resources}).init();
let report;
try{
 const state=resources.create(user,'合成速度选择器 AI 验收');
 const q=newQuestion('速度选择器','质子质量1.0072764666u，电荷+1e，位置(0,0)cm，向右初速1.5×10^5m/s。无限匀强磁场B=+100mT向外，无限匀强电场E=15kV/m向上。忽略重力，仅受电场力与磁场力。观察0.5μs。');
 state.paper.questions.push(q);state.paper.activeQuestionId=q.id;const before=resources.update(user,state.paper,state.resource.version);
 const started=await ai.start(user,{mode:'scene',prompt:'依据当前选中题目搭建原生场景，保留题设，给出速度和合力数值核验。不要添加题设。',resourceId:state.paper.id,questionId:q.id,view:'private',consent:true});
 let result;
 for(let i=0;i<150;i++){
  result=ai.get(user,started.id);if(!['queued','running'].includes(result.status))break;
  await new Promise(r=>setTimeout(r,1000));
 }
 assert.equal(result.status,'completed',JSON.stringify(result.error));
 assert.equal(result.result.candidate.harness.passed,true);
 assert.equal(resources.state(user,state.paper.id).paper.questions[0].scenes.length,0);
 await assert.rejects(()=>ai.apply(user,result.id,{version:before.version,confirmGivens:false}),/题设/);
 const applied=await ai.apply(user,result.id,{version:before.version,confirmGivens:true,acceptAssumptions:true});
 assert.equal(applied.paper.questions[0].scenes.length,1);
 const trace=result.result.candidate.harness.traces[0],a=trace.samples[0],b=trace.samples.at(-1);
 assert.ok(Math.abs(a.speed-150000)<1e-6);assert.ok(a.forceN<1e-25);assert.ok(Math.abs(b.xCm-7.5)<1e-6);assert.ok(Math.abs(b.yCm)<1e-6);
 report={completedAt:new Date().toISOString(),syntheticOnly:true,realProvider:true,model:result.model,usage:result.usage,
  beforeVersion:before.version,afterVersion:applied.resource.version,priorSceneCount:0,afterSceneCount:1,
  job:result,harness:result.result.candidate.harness,checks:{consentGate:true,separateProposal:true,explicitGivens:true,privateApplyCAS:true,velocitySelector:true}};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({passed:true,realProvider:true,model:result.model,usage:result.usage,beforeVersion:before.version,afterVersion:applied.resource.version,checks:report.checks}));
}catch(error){
 await writeFile(join(out,'failure.json'),JSON.stringify({time:new Date().toISOString(),error:error.message,syntheticOnly:true},null,2),{mode:0o600});
 console.log(JSON.stringify({passed:false,error:error.message}));process.exitCode=1;
}finally{await ai.close();while(ai.running.size)await new Promise(r=>setTimeout(r,10));db.close();}
