import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {zipSync,strToU8} from 'fflate';
import sharp from 'sharp';
import {openDatabase} from '../server/exam/database.mjs';
import {Resources} from '../server/exam/resources.mjs';
import {AIService} from '../server/exam/ai-service.mjs';
import {readAIDocuments} from '../server/exam/ai-documents.mjs';
import {ModelProvider} from '../server/exam/model-provider.mjs';
import {auditSceneSync,auditScene,parseAIResult} from '../server/exam/ai-harness.mjs';
import {example} from '../src/planar-model.mjs';
import {newQuestion,newScene} from '../src/exam/model.mjs';
import {HTTPError} from '../server/exam/errors.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const answer=extra=>({status:'answer',answer:'先依据 $r=mv/(|q|B)$ 判断。',givens:['模型设定参数'],assumptions:[],missing:[],followUps:[],...extra});
function givenScene(){const scene=example('circle');scene.objects[0].shape='infinite';scene.objects[0].B=-100;Object.assign(scene.objects[1],{charge:1,speed:1,heading:0,x:0,y:0});return scene;}
const configuration={apiKey:'fake-never-transmitted',baseURL:'https://example.invalid/v1',model:'test',visionModel:'test-vision',maxTokens:1000,parallel:2,dailyTeacher:100,dailyStudent:30,dailyTotal:300,timeoutMs:500};
async function fixture(provider){
 const root=await mkdtemp(join(tmpdir(),'tijing-ai-test-')),db=await openDatabase(root);
 const users=[{id:'teacher-fixture',role:'teacher'},{id:'student-fixture',role:'student'},{id:'other-fixture',role:'student'}];
 for(const user of users)db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(user.id,user.id,user.id,'fictional',user.role,new Date().toISOString());
 const resources=new Resources(db,root),ai=await new AIService(db,{dataDir:root,resources,configuration,reviewEnabled:false,provider:{describe:()=>({configured:true,provider:'fixture'}),...provider}}).init();
 const state=resources.create(users[1],'虚构 AI 测试资源'),q=newQuestion('已知条件','质子在垂直纸面向里的 0.1 T 无限匀强磁场中，向右以 100000 m/s 运动。');
 const s=newScene();s.snapshot={scene:example('rectangle'),context:{timeUs:0}};s.baseline=structuredClone(s.snapshot);q.scenes.push(s);q.activeSceneId=s.id;state.paper.questions.push(q);
 resources.update(users[1],state.paper,state.resource.version);
 return {root,db,resources,ai,users,state:resources.state(users[1],state.paper.id),q,s,close:async()=>{await ai.close();while(ai.running.size)await sleep(10);db.close();await rm(root,{recursive:true,force:true});}};
}
async function finish(ai,user,id){for(let n=0;n<200;n++){const result=ai.get(user,id);if(!['queued','running'].includes(result.status))return result;await sleep(20);}throw Error('fixture AI did not finish');}
test('native harness checks units, dependencies, trajectories and magnetic energy',async()=>{
 const scene=example('circle'),r=await auditScene(scene);
 assert.equal(r.harness.passed,true);assert.ok(r.harness.traces[0].samples.length>=5);
 assert.ok(r.harness.traces[0].energyRelativeDrift<1e-8);assert.equal(r.snapshot.scene.objects[1].charge,-1);
 const broken=structuredClone(scene);broken.objects[0].defs.radius='o2.charge';
 const bad=auditSceneSync(broken);assert.equal(bad.harness.passed,false);assert.ok(bad.harness.issues.length);
 const cyclic=structuredClone(scene);cyclic.objects[0].defs.radius='o1.radius';assert.match(auditSceneSync(cyclic).harness.issues[0].message,/循环/);
 const doubled=structuredClone(scene);doubled.objects[0].radius*=2;doubled.objects[1].defs.speed='orbitSpeed(o2.mass, o2.charge, o1.B, o1.radius)';
 const measured=auditSceneSync(doubled);assert.equal(measured.harness.passed,true);assert.ok(Math.abs(measured.harness.traces[0].samples[0].radiusCm-4)<1e-8);
});
test('AI proposals cannot silently invent inputs, loosen checks or run code',()=>{
 assert.throws(()=>auditSceneSync({duration:1,objects:[{id:'o1',kind:'particle',x:0,y:0}]}),/必填/);
 const scene=example('circle');scene.objects[0].constructor='bad';assert.throws(()=>auditSceneSync(scene),/不允许/);
 assert.throws(()=>auditSceneSync(example('circle'),[{traceId:'o2',timeUs:0,metric:'forceN',expected:0,absoluteTolerance:1e-10}]),/误差/);
});
test('parsing preserves missing conditions and strips false model verification',()=>{
 const p=parseAIResult(JSON.stringify(answer({missing:['图中磁场方向不清'],verified:true,harness:{passed:true},tools:['evil']})),'tutor');
 assert.equal(p.status,'needs_confirmation');assert.equal(p.harness,undefined);assert.equal(p.tools,undefined);
 assert.throws(()=>parseAIResult('{"status":"answer","answer":"x","givens":[],"assumptions":[],"missing":[],"__proto__":{}}','tutor'),/JSON/);
});
test('DOCX OMML and images parse from actual bytes; forged files are rejected',async()=>{
 const png=await sharp({create:{width:30,height:30,channels:4,background:'#fff'}}).png().toBuffer();
 const xml='<w:document xmlns:w="urn:w" xmlns:m="urn:m" xmlns:r="urn:r" xmlns:a="urn:a"><w:body><w:p><w:r><w:t>1. 已知粒子质量</w:t></w:r><m:oMath><m:f><m:num><m:r><m:t>m</m:t></m:r></m:num><m:den><m:r><m:t>q</m:t></m:r></m:den></m:f></m:oMath><w:r><a:blip r:embed="rId1"/></w:r></w:p></w:body></w:document>';
 const zip=zipSync({'word/document.xml':strToU8(xml),'word/_rels/document.xml.rels':strToU8('<Relationships><Relationship Id="rId1" Target="media/image.png"/></Relationships>'),'word/media/image.png':png});
 const p=await readAIDocuments([{filename:'虚构题目.docx',data:Buffer.from(zip).toString('base64')}]);
 assert.match(p.documents[0].text,/\\frac\{m\}\{q\}/);assert.equal(p.images.length,1);
 await assert.rejects(()=>readAIDocuments([{filename:'wrong.pdf',data:png.toString('base64')}]),/文件头/);
 await assert.rejects(()=>readAIDocuments([{filename:'wrong.doc',data:png.toString('base64')}]),/文件头/);
 await assert.rejects(()=>readAIDocuments([{filename:'run.exe',data:png.toString('base64')}]),/请选择/);
});
test('provider hides secrets and rejects truncated output',async()=>{
 let request;
 const provider=new ModelProvider(configuration,{fetchImpl:async(url,options)=>{request={url,options};return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],model:'test',usage:{total_tokens:10}}),{status:200});}});
 await provider.complete([{role:'user',content:'fixture'}]);
 assert.equal(provider.describe().apiKey,undefined);assert.equal(request.options.headers.authorization,'Bearer fake-never-transmitted');
 assert.equal(JSON.parse(request.options.body).thinking,undefined);
 const truncated=new ModelProvider(configuration,{fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{}'}}]}))});
 await assert.rejects(()=>truncated.complete([]),/未完成/);
});
test('consent, private jobs and independent scene apply are enforced',async t=>{
 let observed;
 const f=await fixture({complete:async messages=>{observed=JSON.stringify(messages);return {content:JSON.stringify(answer({scene:givenScene()})),model:'fixture',usage:{inputTokens:90,outputTokens:80,totalTokens:170}};}});t.after(f.close);
 const user=f.users[1],input={mode:'scene',prompt:'按照演示参数搭建',resourceId:f.state.paper.id,questionId:f.q.id,sceneId:f.s.id,view:'private',consent:true};
 await assert.rejects(()=>f.ai.start(user,{...input,consent:false}),/确认/);await assert.rejects(()=>f.ai.start(f.users[2],input),/无权/);
 const started=await f.ai.start(user,input),done=await finish(f.ai,user,started.id);
 assert.equal(done.status,'completed',JSON.stringify(done.error));assert.equal(done.result.candidate.harness.passed,true);
 assert.equal(f.resources.state(user,f.state.paper.id).paper.questions[0].scenes.length,1);
 assert.throws(()=>f.ai.get(f.users[2],done.id),/无权/);assert.throws(()=>f.ai.cancel(f.users[2],done.id),/无权/);assert.equal(observed.includes('password_hash'),false);
 await assert.rejects(()=>f.ai.apply(user,done.id,{version:f.state.resource.version}),/题设/);
 const state=await f.ai.apply(user,done.id,{version:f.state.resource.version,confirmGivens:true,acceptAssumptions:true});
 assert.equal(state.paper.questions[0].scenes.length,2);assert.equal(state.paper.questions[0].scenes[1].status,'draft');
 assert.equal(f.ai.get(user,done.id).status,'applied');assert.equal(state.paper.questions[0].scenes[1].ai.jobId,done.id);
});
test('unconfirmed assumptions, missing conditions and changed resource content block apply',async t=>{
 let response=answer({scene:givenScene(),assumptions:['采用质子作为演示粒子']});
 const f=await fixture({complete:async()=>({content:JSON.stringify(response),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 const user=f.users[1],input={mode:'scene',prompt:'搭建',resourceId:f.state.paper.id,questionId:f.q.id,consent:true};
 let started=await f.ai.start(user,input),done=await finish(f.ai,user,started.id);
 await assert.rejects(()=>f.ai.apply(user,done.id,{version:f.state.resource.version,confirmGivens:true}),/演示假设/);
 f.state.paper.questions[0].sourceText+='\n补充题设：初速度改为原值的两倍。';
 f.resources.update(user,f.state.paper,f.state.resource.version);
 await assert.rejects(()=>f.ai.apply(user,done.id,{version:f.state.resource.version+1,confirmGivens:true,acceptAssumptions:true}),error=>error.code==='version_conflict'&&/内容已更改/.test(error.message));
 response=answer({missing:['磁场方向未给定'],scene:givenScene()});started=await f.ai.start(user,input);done=await finish(f.ai,user,started.id);
 assert.equal(done.result.status,'needs_confirmation');assert.equal(done.result.candidate,undefined);
});
test('cancellation aborts provider; deleting history never resets quota',async t=>{
 let aborted=false,entered=false;
 const f=await fixture({complete:(_messages,{signal})=>{entered=true;return new Promise((_r,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new HTTPError(499,'cancelled'));},{once:true}));}});t.after(f.close);
 f.ai.configuration={...configuration,dailyStudent:1};
 const user=f.users[1],started=await f.ai.start(user,{mode:'tutor',prompt:'虚构测试',consent:true});
 while(!entered)await sleep(5);
 f.ai.cancel(user,started.id);await sleep(20);assert.equal(aborted,true);await f.ai.remove(user,started.id);assert.equal(f.ai.usage(user).calls,1);
 await assert.rejects(()=>f.ai.start(user,{mode:'tutor',prompt:'again',consent:true}),/上限/);
});
test('restart marks in-flight jobs interrupted without replay',async t=>{
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer()),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 const user=f.users[1],started=await f.ai.start(user,{mode:'tutor',prompt:'fixture',consent:true});await finish(f.ai,user,started.id);
 f.db.prepare("UPDATE ai_jobs SET status='running' WHERE id=?").run(started.id);
 const restarted=await new AIService(f.db,{dataDir:f.root,resources:f.resources,configuration,provider:{describe:()=>({configured:true})}}).init();
 assert.equal(restarted.get(user,started.id).status,'interrupted');assert.equal(restarted.get(user,started.id).result.answer,answer().answer);await restarted.close();
});

test('extraction applies only selected text candidates as pending new questions',async t=>{
 const response=answer({questions:[{title:'第一题',sourceText:'1. 已知 q 和 m，求半径。'},{title:'第二题',sourceText:'2. 依据图示判断方向。'}]});
 const f=await fixture({complete:async()=>({content:JSON.stringify(response),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 const user=f.users[1],started=await f.ai.start(user,{mode:'extract',prompt:'整理虚构题',consent:true});const done=await finish(f.ai,user,started.id);
 await assert.rejects(()=>f.ai.apply(user,done.id,{questionIndices:[9],confirmGivens:true}),/有效/);
 const state=await f.ai.apply(user,done.id,{questionIndices:[1],confirmGivens:true});
 assert.equal(state.paper.questions.length,1);assert.equal(state.paper.questions[0].title,'第二题');
 assert.equal(state.paper.questions[0].review,'pending');assert.equal(state.paper.questions[0].attachments.length,0);
 assert.match(state.paper.questions[0].notes[0].text,/原文件/);
});
test('assignment policy is rechecked at start and apply and only current question is sent',async t=>{
 let mode='disabled',seen='';
 const f=await fixture({complete:async messages=>{seen=JSON.stringify(messages);return {content:JSON.stringify(answer({scene:givenScene()})),model:'fixture',usage:{totalTokens:100}};}});t.after(f.close);
 const user=f.users[1];
 f.ai.resolveContext=async(_u,input)=>({assignment:{id:input.assignmentId,title:'虚构作业',aiPolicy:mode,version:1},paper:f.state.paper,question:f.q,record:null,resource:null});
 f.ai.validateContextPolicy=async(_u,_task,{action})=>{if(mode==='disabled')throw new HTTPError(403,'教师已禁用');};
 const input={mode:'scene',prompt:'虚构场景',consent:true,assignmentId:'assignment-fictional'};
 await assert.rejects(()=>f.ai.start(user,input),/禁用/);mode='hints';await assert.rejects(()=>f.ai.start(user,input),/只允许/);
 const hint=await f.ai.start(user,{...input,mode:'tutor'});await finish(f.ai,user,hint.id);assert.match(seen,/教师任务策略/);
 mode='allowed';const started=await f.ai.start(user,input),done=await finish(f.ai,user,started.id);
 assert.equal(done.assignmentId,'assignment-fictional');assert.equal(done.result.candidate.harness.passed,true);
 mode='disabled';await assert.rejects(()=>f.ai.apply(user,done.id,{confirmGivens:true,acceptAssumptions:true}),/禁用/);
 mode='allowed';const state=await f.ai.apply(user,done.id,{confirmGivens:true,acceptAssumptions:true});
 assert.equal(state.paper.questions[0].sourceText,f.q.sourceText);assert.notEqual(state.paper.id,f.state.paper.id);
 assert.equal(f.resources.state(user,f.state.paper.id).paper.questions[0].scenes.length,1);
});


test('provider endpoint validation rejects private, mixed DNS and transition addresses',async()=>{
 const {isPublicAddress,validateModelEndpoint}=await import('../server/exam/model-network.mjs');
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.4','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::'])assert.equal(isPublicAddress(address),false,address);
 for(const address of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(isPublicAddress(address),true,address);
 await assert.rejects(()=>validateModelEndpoint('https://user:secret@example.com/v1'),/HTTPS/);
 await assert.rejects(()=>validateModelEndpoint('https://localhost/v1'),/本机/);
 await assert.rejects(()=>validateModelEndpoint('https://example.com/v1',{lookupImpl:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]}),/受限制/);
 const valid=await validateModelEndpoint('https://example.com/v1',{lookupImpl:async()=>[{address:'8.8.8.8',family:4}]});
 assert.equal(valid.host,'example.com');assert.equal(valid.addresses[0].address,'8.8.8.8');
});
test('personal API configuration freezes per job and does not consume shared quota',async t=>{
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer()),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 let version='personal-one',blocked;
 f.ai.configurationFor=async user=>({configuration:{...configuration,apiKey:'never-return-'+user.id,model:version,dailyTotal:1},apiSource:'personal'});
 f.ai.providerFactory=config=>({describe:()=>({configured:true,model:config.model}),complete:async()=>{await new Promise(resolve=>{blocked=resolve;});return {content:JSON.stringify(answer()),model:config.model,usage:{totalTokens:100}};}});
 const user=f.users[1],before=(await f.ai.config(user)).usage.siteCalls;
 const started=await f.ai.start(user,{mode:'tutor',prompt:'personal fixture',consent:true});while(!blocked)await sleep(5);version='personal-two';blocked();
 const done=await finish(f.ai,user,started.id);assert.equal(done.model,'personal-one');assert.equal(done.apiSource,'personal');
 assert.equal((await f.ai.config(user)).usage.siteCalls,before);
 assert.equal(JSON.stringify(done).includes('never-return-'),false);assert.equal(f.ai.usage(user).calls,1);
 assert.equal(f.db.prepare("SELECT tokens FROM ai_usage_sources WHERE user_id=? AND api_source='personal'").get(user.id).tokens,100);
 const restarted=await new AIService(f.db,{dataDir:f.root,resources:f.resources,configuration,provider:f.ai.provider}).init();
 assert.equal(restarted.usage(user).siteCalls,before);assert.equal(restarted.usage(user).calls,1);await restarted.close();
});


test('shutdown waits for real abort cleanup before database may close',async t=>{
 let cleanupFinished=false,startedProvider;
 const f=await fixture({complete:(_messages,{signal})=>new Promise((_resolve,reject)=>{
  startedProvider=true;signal.addEventListener('abort',()=>{setTimeout(()=>{cleanupFinished=true;reject(new HTTPError(499,'fixture aborted'));},30);},{once:true});
 })});
 t.after(f.close);const user=f.users[1];
 const job=await f.ai.start(user,{mode:'tutor',prompt:'shutdown fixture',consent:true});
 while(!startedProvider)await sleep(5);
 await f.ai.close();assert.equal(cleanupFinished,true);assert.equal(f.ai.running.size,0);assert.equal(f.ai.tasks.size,0);
 assert.equal(f.ai.get(user,job.id).status,'interrupted');await f.ai.close();
 const reopened=await new AIService(f.db,{dataDir:f.root,resources:f.resources,configuration,provider:f.ai.provider}).init();
 assert.equal(reopened.get(user,job.id).status,'interrupted');assert.equal(reopened.queue.length,0);await reopened.close();
});


test('semantically reversed but physically self-consistent scenes are blocked',async t=>{
 const {checkSourceGrounding,attachGrounding}=await import('../server/exam/ai-grounding.mjs');
 const valid=givenScene(),source='质子沿纸面向右，磁场垂直纸面向里。';
 const wrong=structuredClone(valid);wrong.objects[1].charge=-1;
 assert.equal(auditSceneSync(wrong).harness.passed,true);
 const grounded=attachGrounding(auditSceneSync(wrong),{sourceText:source,givens:['质子']});
 assert.equal(grounded.harness.passed,false);assert.match(grounded.harness.violations.join(' '),/正负号/);
 const fieldWrong=structuredClone(valid);fieldWrong.objects[0].B=100;
 assert.equal(checkSourceGrounding(fieldWrong,{sourceText:source}).passed,false);
 assert.equal(checkSourceGrounding(valid,{sourceText:source}).passed,true);
 const mixed=checkSourceGrounding(wrong,{sourceText:'正电粒子和负电粒子分别演示。'});
 assert.equal(mixed.checked.length,0);
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer({scene:wrong,givens:['质子']})),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 const user=f.users[1],job=await f.ai.start(user,{mode:'scene',prompt:'按原题搭建',resourceId:f.state.paper.id,questionId:f.q.id,consent:true});
 const done=await finish(f.ai,user,job.id);
 assert.equal(done.result.candidate.harness.passed,false);assert.equal(done.usage.calls,2);
 await assert.rejects(()=>f.ai.apply(user,done.id,{version:f.state.resource.version,confirmGivens:true,acceptAssumptions:true}),/尚未通过/);
});

test('DNS validation cancellation is real and late resolution cannot send a request',async()=>{
 const {validateModelEndpoint}=await import('../server/exam/model-network.mjs');
 const controller=new AbortController();let resolved;
 const pending=validateModelEndpoint('https://example.com/v1',{signal:controller.signal,lookupImpl:()=>new Promise(r=>{resolved=r;})});
 controller.abort();await assert.rejects(()=>pending,error=>error.code==='ai_cancelled');
 resolved([{address:'8.8.8.8',family:4}]);await sleep(5);
});
test('unknown visual model falls back explicitly without claiming verified vision',async()=>{
 let body;
 const provider=new ModelProvider({...configuration,visionModel:''},{fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}],usage:{prompt_tokens:-1,completion_tokens:Infinity,total_tokens:-999}}));}});
 assert.equal(provider.describe().visionFallback,true);assert.equal(provider.describe().effectiveVisionModel,'test');
 const response=await provider.complete([{role:'user',content:'synthetic'}],{images:true});assert.equal(body.model,'test');
 assert.equal(provider.describe().visionVerified,undefined);assert.equal(response.usage.totalTokens,0);
});


test('API probes charge the same source ledger and cannot bypass shared daily cap',async t=>{
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer()),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 f.ai.providerFactory=c=>({probe:async()=>({ok:true,model:c.model,usage:{inputTokens:50,outputTokens:5,totalTokens:55}})});
 const teacher=f.users[0],c={...configuration,dailyTotal:1};
 const first=await f.ai.probe(teacher,c,{apiSource:'shared'});assert.equal(first.ok,true);
 assert.equal(f.ai.usage(teacher,c).siteCalls,1);assert.equal(f.ai.usage(teacher,c).reservedTokens,55);
 await assert.rejects(()=>f.ai.probe(teacher,c,{apiSource:'shared'}),/全站.*次数/);
 await assert.rejects(()=>f.ai.probe(f.users[1],c,{apiSource:'shared'}),/只有教师/);
 await f.ai.probe(f.users[1],c,{apiSource:'personal'});assert.equal(f.ai.usage(f.users[1],c).siteCalls,1);
 assert.equal(f.db.prepare("SELECT count(*) n FROM ai_probes WHERE status='completed'").get().n,2);
});
test('probe failure before network refunds token reservation but keeps attempt quota',async t=>{
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer()),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 f.ai.providerFactory=()=>({probe:async()=>{throw new HTTPError(400,'private address','ai_endpoint_private');}});
 const user=f.users[1];await assert.rejects(()=>f.ai.probe(user,configuration),/private/);
 assert.equal(f.ai.usage(user).reservedTokens,0);assert.equal(f.ai.usage(user).calls,1);
 assert.equal(f.db.prepare("SELECT status FROM ai_probes WHERE user_id=?").get(user.id).status,'failed');
});
test('shutdown also awaits a probe abort before database close',async t=>{
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer()),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 let initiated=false,aborted=false;
 f.ai.providerFactory=()=>({probe:({signal})=>new Promise((_r,reject)=>{initiated=true;signal.addEventListener('abort',()=>setTimeout(()=>{aborted=true;reject(new HTTPError(499,'cancel','ai_cancelled'));},20),{once:true});})});
 const promise=f.ai.probe(f.users[1],configuration);const settled=promise.catch(e=>e.code);
 while(!initiated)await sleep(5);await f.ai.close();assert.equal(aborted,true);assert.equal(await settled,'ai_cancelled');
 assert.equal(f.ai.probeRunning.size,0);assert.equal(f.ai.probeTasks.size,0);
 assert.equal(f.db.prepare('SELECT status FROM ai_probes').get().status,'interrupted');
});


test('extract apply preserves private original image and exact source anchor within quota',async t=>{
 const png=await sharp({create:{width:64,height:48,channels:4,background:'#dfeffa'}}).png().toBuffer();
 let calls=0;
 const response=answer({questions:[{title:'图示题',sourceText:'依据所附原图判断粒子方向。',sourceRefs:[{sourceName:'原图.png',imageName:'原图.png'}]}]});
 const f=await fixture({complete:async()=>{calls++;return {content:JSON.stringify(response),model:'fixture',usage:{totalTokens:100}};}});t.after(f.close);
 const user=f.users[1],job=await f.ai.start(user,{mode:'extract',prompt:'识别原图',consent:true,attachments:[{filename:'原图.png',data:png.toString('base64')}]});
 await finish(f.ai,user,job.id);const sources=f.ai.sources(user,job.id).sources;
 assert.equal(sources.length,2);assert.ok(sources.some(s=>s.kind==='original'));assert.ok(sources.some(s=>s.kind==='image'));
 assert.throws(()=>f.ai.sources(f.users[0],job.id),/无权/);assert.throws(()=>f.ai.sourceAsset(f.users[2],job.id,sources[0].id),/无权/);
 const asset=f.ai.sourceAsset(user,job.id,sources.find(s=>s.kind==='original').id);
 const raw=await import('node:fs/promises').then(fs=>fs.readFile(asset.path));assert.deepEqual(raw,png);
 const used=f.resources.usedBytes(user.id);f.resources.quotaBytes=used+1;
 const state=await f.ai.apply(user,job.id,{confirmGivens:true,questionIndices:[0]});
 assert.equal(state.paper.sources.length,1);assert.equal(state.paper.questions[0].attachments.length,1);
 assert.equal(state.paper.questions[0].sourceAnchors[0].sourceId,state.paper.sources[0].id);
 assert.equal(state.paper.questions[0].review,'pending');assert.equal(f.ai.sources(user,job.id).sources.length,0);
 assert.ok(f.resources.usedBytes(user.id)<=used+1);assert.equal(calls,1);
 const restored=await f.resources.portable(user,state.paper.id,state.paper);
 assert.ok(restored.assets[state.paper.sources[0].asset.id].url.startsWith('data:image/png;base64,'));
 assert.ok(restored.assets[state.paper.questions[0].attachments[0].id].url.startsWith('data:image/png;base64,'));
});
test('failed source transfer keeps originals for a retry without another model call',async t=>{
 const png=await sharp({create:{width:30,height:24,channels:4,background:'#ffffff'}}).png().toBuffer();let calls=0;
 const f=await fixture({complete:async()=>{calls++;return {content:JSON.stringify(answer({questions:[{title:'私有题',sourceText:'保留原图。'}]})),model:'fixture',usage:{totalTokens:100}};}});t.after(f.close);
 const user=f.users[1],job=await f.ai.start(user,{mode:'extract',prompt:'保留原图',resourceId:f.state.paper.id,consent:true,attachments:[{filename:'对照.png',data:png.toString('base64')}]});
 await finish(f.ai,user,job.id);const originals=f.ai.sources(user,job.id).sources.length,realUpdate=f.resources.update;
 f.resources.update=()=>{throw new HTTPError(409,'fixture CAS failure');};
 await assert.rejects(()=>f.ai.apply(user,job.id,{version:f.state.resource.version,confirmGivens:true,questionIndices:[0]}),/CAS/);
 assert.equal(f.ai.sources(user,job.id).sources.length,originals);assert.equal(f.ai.get(user,job.id).status,'completed');
 f.resources.update=realUpdate;
 const state=await f.ai.apply(user,job.id,{version:f.state.resource.version,confirmGivens:true,questionIndices:[0]});
 assert.equal(state.paper.questions[1].attachments.length,1);assert.equal(calls,1);assert.equal(f.ai.sources(user,job.id).sources.length,0);
});
test('expired original cache blocks apply rather than silently dropping source images',async t=>{
 const png=await sharp({create:{width:30,height:24,channels:4,background:'#ffffff'}}).png().toBuffer();
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer({questions:[{title:'过期题',sourceText:'对照原图。'}]})),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 const user=f.users[1],job=await f.ai.start(user,{mode:'extract',prompt:'原图',consent:true,attachments:[{filename:'过期.png',data:png.toString('base64')}]});
 await finish(f.ai,user,job.id);f.db.prepare('UPDATE ai_sources SET expires_at=0 WHERE job_id=?').run(job.id);
 await assert.rejects(()=>f.ai.apply(user,job.id,{confirmGivens:true,questionIndices:[0]}),error=>error.code==='ai_sources_expired');
 await f.ai.sourceStore.sweep();assert.equal(f.db.prepare('SELECT count(*) n FROM ai_sources WHERE job_id=?').get(job.id).n,0);
});
test('homepage scene proposal creates a personal pending inquiry after explicit confirmation',async t=>{
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer({scene:givenScene(),assumptions:['示例参数，仅供演示']})),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 const user=f.users[1],prompt='用质子与向里匀强磁场做演示，参数由示例确定。';
 const job=await f.ai.start(user,{mode:'scene',prompt,consent:true});await finish(f.ai,user,job.id);
 await assert.rejects(()=>f.ai.apply(user,job.id,{confirmGivens:true}),/演示假设/);
 const state=await f.ai.apply(user,job.id,{confirmGivens:true,acceptAssumptions:true});
 assert.equal(state.paper.questions[0].sourceText,prompt);assert.equal(state.paper.questions[0].review,'pending');
 assert.equal(state.paper.questions[0].scenes.length,1);assert.ok(state.paper.questions[0].notes.some(n=>n.kind==='assumption'));
});


test('PDF original bytes and page-one anchor survive extraction apply',async t=>{
 const pdf=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../tests/fixtures/synthetic-physics-scan.pdf',import.meta.url))).catch(()=>null);
 if(!pdf){t.skip('synthetic PDF from live fixture builder not available');return;}
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer({questions:[{title:'PDF页图题',sourceText:'所附原页中的题目。',sourceRefs:[{sourceName:'扫描原页.pdf',page:1}]}]})),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 const user=f.users[1],job=await f.ai.start(user,{mode:'extract',prompt:'保留PDF原稿和页图',consent:true,attachments:[{filename:'扫描原页.pdf',data:pdf.toString('base64')}]});
 const done=await finish(f.ai,user,job.id);assert.equal(done.status,'completed',JSON.stringify(done.error));
 assert.ok(f.ai.sources(user,job.id).sources.some(s=>s.kind==='page'&&s.page===1));
 const state=await f.ai.apply(user,job.id,{confirmGivens:true,questionIndices:[0]});
 assert.equal(state.paper.sources[0].type,'pdf');assert.equal(state.paper.sources[0].pageCount,1);
 assert.equal(state.paper.questions[0].sourceAnchors[0].page,1);
 const portable=await f.resources.portable(user,state.paper.id,state.paper);
 assert.deepEqual(Buffer.from(portable.assets[state.paper.sources[0].asset.id].url.split(',')[1],'base64'),pdf);
 assert.equal(portable.assets[state.paper.questions[0].attachments[0].id].mime,'image/png');
});


test('explicit SI numbers are compared to native units rather than merely self-consistent',async()=>{
 const {checkSourceGrounding}=await import('../server/exam/ai-grounding.mjs');
 const scene=givenScene();
 const source='质量 m=1.6726219e-27 kg，电荷 q=+1.602176634e-19 C，初速度 v=1.0×10^5 m/s，磁感应强度 B=0.1 T，方向向里。';
 const correct=checkSourceGrounding(scene,{sourceText:source});assert.equal(correct.passed,true,JSON.stringify(correct));
 assert.ok(correct.checked.some(c=>c.kind==='numeric-magneticMagnitudeT'));
 assert.ok(correct.checked.some(c=>c.kind==='numeric-massKg'));assert.ok(correct.checked.some(c=>c.kind==='numeric-chargeC'));assert.ok(correct.checked.some(c=>c.kind==='numeric-speedMS'));
 const wrong=structuredClone(scene);wrong.objects[0].B=-0.1;
 assert.equal(auditSceneSync(wrong).harness.passed,true);
 assert.equal(checkSourceGrounding(wrong,{sourceText:source}).passed,false);
 const wrongMass=structuredClone(scene);wrongMass.objects[1].mass=1.6726219e-27;
 assert.equal(checkSourceGrounding(wrongMass,{sourceText:source}).passed,false);
 const conflict=checkSourceGrounding(scene,{sourceText:'B=0.1 T，另一处又说B=0.2 T。'});
 assert.equal(conflict.checked.some(c=>c.kind==='numeric-magneticMagnitudeT'),false);
});


test('associated private task resources cannot evade policy by omitting assignmentId',async t=>{
 let calls=0,policy='disabled',configReads=0;
 const f=await fixture({complete:async()=>{calls++;return {content:JSON.stringify(answer()),model:'fixture',usage:{totalTokens:100}};}});t.after(f.close);
 const user=f.users[1],id='assignment-linked-private';
 f.resources.assignmentContext=(u,resourceId)=>u.id===user.id&&resourceId===f.state.paper.id?{assignmentId:id}:null;
 f.ai.resolveContext=async(_u,input)=>({assignment:{id,title:'关联任务',aiPolicy:policy,version:1},paper:f.state.paper,question:f.q,record:null,resource:f.resources.readable(user,input.resourceId||f.state.paper.id),version:f.state.resource.version});
 f.ai.validateContextPolicy=()=>{};
 f.ai.configurationFor=async()=>{configReads++;return {configuration,apiSource:'personal'};};
 f.ai.providerFactory=()=>f.ai.provider;
 const input={mode:'scene',prompt:'尝试绕过任务限制',resourceId:f.state.paper.id,questionId:f.q.id,consent:true};
 await assert.rejects(()=>f.ai.start(user,input),/禁用/);assert.equal(configReads,0);assert.equal(calls,0);
 policy='hints';await assert.rejects(()=>f.ai.start(user,input),/只允许/);assert.equal(configReads,0);
 await assert.rejects(()=>f.ai.start(user,{...input,assignmentId:'another-task'}),error=>error.code==='ai_assignment_mismatch');
 const job=await f.ai.start(user,{...input,mode:'tutor'});await finish(f.ai,user,job.id);assert.equal(f.ai.get(user,job.id).assignmentId,id);
 policy='disabled';await assert.rejects(()=>f.ai.start(user,{mode:'tutor',prompt:'省略task/resource再次追问',followupTo:job.id,consent:true}),/禁用/);
});


test('recognized standard strip and half-plane answers use actual native evidence and hints hide final values',async()=>{
 const {trustedTutoring,probeConfirmedEntry}=await import('../server/exam/ai-concepts.mjs');
 const strip='在0<x<d的带状匀强磁场内B垂直纸面向里，边界外无场。一正电粒子从(0,0)以速度沿+x方向射入，已知r=d/2，忽略其他力。求最远距离。';
 assert.equal(await trustedTutoring(strip),null);
 const model={confirmed:true,classical:true,kind:'strip-r-equals-half-width',charge:1,B:-1,incoming:'+x',start:[0,0],radiusOverWidth:.5};
 const result=await probeConfirmedEntry(model);assert.equal(result.trustedTool.readback.farBoundaryReached,false);
 assert.ok(Math.abs(result.trustedTool.readback.maxXOverR-1)<1e-7);assert.equal(result.trustedTool.readback.maxXVelocityOverInitial[1],1);
 assert.match(result.answer,/不能从.*穿出/);assert.match(result.answer,/最大.*速度沿.*\+y/);
 const hint=await probeConfirmedEntry(model,{hintsOnly:true});assert.equal(hint.trustedTool.readback,undefined);assert.equal(hint.trustedTool.nativeHarness,undefined);assert.doesNotMatch(hint.answer,/x_.*max|d\/2|\(0,d\)/);
 const half='在x>0半平面有B垂直纸面向外的匀强磁场，质量m电荷+q的粒子从原点沿+x以速率v射入，只受洛伦兹力。求首次返回。';
 assert.equal(await trustedTutoring(half),null);const back=await probeConfirmedEntry({confirmed:true,classical:true,kind:'half-plane-return',charge:1,B:1,incoming:'+x',start:[0,0]});assert.ok(Math.abs(back.trustedTool.readback.firstReturnYOverR+2)<1e-7);
 assert.equal(await trustedTutoring('某粒子入射到一个磁场，条件不清。'),null);
});
test('math escape repair restores only known commands in explicit math and renders',async()=>{
 const {repairMathEscapes}=await import('../server/exam/ai-format.mjs'),katex=await import('katex');
 const broken='正文'+String.fromCharCode(12)+'rac 不改；$'+String.fromCharCode(12)+'rac{mv}{qB}$';
 const fixed=repairMathEscapes(broken);assert.equal(fixed.repaired,1);assert.ok(fixed.text.startsWith('正文'+String.fromCharCode(12)));
 const math=fixed.text.match(/\$(.*?)\$/)[1];assert.doesNotThrow(()=>katex.default.renderToString(math,{throwOnError:true,trust:false}));
 const unknown=repairMathEscapes('$a'+String.fromCharCode(12)+'rob$');assert.equal(unknown.repaired,0);assert.ok(unknown.warnings.length);
 const parsed=parseAIResult(JSON.stringify(answer({answer:'$$'+String.fromCharCode(8)+'egin{aligned}r&=1'+String.raw`\\`+'T&=2'+String.raw`\end{aligned}`+'$$'})),'tutor');
 assert.ok(parsed.formatWarnings.length);assert.doesNotThrow(()=>katex.default.renderToString(parsed.answer.slice(2,-2),{throwOnError:true,trust:false}));
});
test('concurrent source applies create one resource and never call the model again',async t=>{
 const png=await sharp({create:{width:48,height:36,channels:4,background:'#ffffff'}}).png().toBuffer();let calls=0;
 const f=await fixture({complete:async()=>{calls++;return {content:JSON.stringify(answer({questions:[{title:'重复导入测试',sourceText:'核对原图。'}]})),model:'fixture',usage:{totalTokens:100}};}});t.after(f.close);
 const user=f.users[1],job=await f.ai.start(user,{mode:'extract',prompt:'原图',consent:true,attachments:[{filename:'重复.png',data:png.toString('base64')}]});await finish(f.ai,user,job.id);
 const before=f.db.prepare('SELECT count(*) n FROM resources WHERE owner_id=?').get(user.id).n,input={confirmGivens:true,questionIndices:[0]};
 const attempts=await Promise.allSettled([f.ai.apply(user,job.id,input),f.ai.apply(user,job.id,input)]);
 assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);assert.equal(f.db.prepare('SELECT count(*) n FROM resources WHERE owner_id=?').get(user.id).n,before+1);assert.equal(calls,1);
});


test('DeepSeek thinking is enabled for learning and explicitly disabled for cheap extraction/probes',async()=>{
 const bodies=[],provider=new ModelProvider({...configuration,baseURL:'https://api.deepseek.com/v1',maxTokens:8192},{fetchImpl:async(_u,o)=>{bodies.push(JSON.parse(o.body));return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}]}));}});
 await provider.complete([{role:'user',content:'synthetic'}],{task:'tutor'});assert.equal(bodies[0].thinking.type,'enabled');assert.equal(bodies[0].reasoning_effort,'high');assert.equal(bodies[0].max_tokens,8192);
 await provider.complete([{role:'user',content:'synthetic'}],{task:'extract'});assert.equal(bodies[1].thinking.type,'disabled');
 await provider.complete([{role:'user',content:'synthetic'}],{task:'probe',maxTokens:256});assert.equal(bodies[2].max_tokens,256);assert.equal(bodies[2].thinking.type,'disabled');
});


test('upstream empty/invalid/incomplete responses reject safely without process crash',async()=>{
 const {EventEmitter}=await import('node:events'),{createProviderResponse,readProviderMessage}=await import('../server/exam/model-network.mjs');
 assert.equal((await createProviderResponse(204,Buffer.from('ignored')).text()),'');
 assert.equal((await createProviderResponse(205,Buffer.from('ignored')).text()),'');
 assert.throws(()=>createProviderResponse(700,Buffer.from('bad')),error=>error.code==='ai_provider_status_invalid');
 function incoming(status){const r=new EventEmitter();r.statusCode=status;r.headers={};r.complete=false;r.destroy=()=>{};return r;}
 const good=incoming(204),pending=readProviderMessage(good);good.emit('data',Buffer.from('ignored'));good.complete=true;good.emit('end');
 assert.equal((await pending).status,204);
 await assert.rejects(()=>readProviderMessage(incoming(700)),error=>error.code==='ai_provider_status_invalid');
 const cut=incoming(200),interrupted=readProviderMessage(cut);cut.emit('data',Buffer.from('{"partial":'));cut.emit('close');
 await assert.rejects(()=>interrupted,error=>error.code==='ai_response_interrupted');
 const abort=incoming(200),aborted=readProviderMessage(abort);abort.emit('aborted');
 await assert.rejects(()=>aborted,error=>error.code==='ai_response_interrupted');
 const redirect=incoming(302);await assert.rejects(()=>readProviderMessage(redirect),error=>error.code==='ai_endpoint_redirect');
});


test('awaiting configuration cannot enqueue after shutdown or race a live probe',async t=>{
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer()),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 let release,entered=false;
 f.ai.configurationFor=()=>new Promise(resolve=>{entered=true;release=()=>resolve({configuration,apiSource:'personal'});});
 const pending=f.ai.start(f.users[1],{mode:'tutor',prompt:'configuration gate',consent:true});
 while(!entered)await sleep(2);await f.ai.close();release();
 await assert.rejects(()=>pending,error=>error.status===503);assert.equal(f.db.prepare('SELECT count(*) n FROM ai_jobs').get().n,0);
});
test('teacher task policy is rechecked after private source cache awaits before any paid call',async t=>{
 let calls=0,enabled=true,release,cacheEntered=false;
 const f=await fixture({complete:async()=>{calls++;return {content:JSON.stringify(answer()),model:'fixture',usage:{totalTokens:100}};}});t.after(f.close);
 const user=f.users[1],assignment={id:'assignment-policy-race',title:'private race',aiPolicy:'allowed',version:1};
 f.ai.resolveContext=async()=>({assignment,paper:f.state.paper,question:f.q,resource:f.resources.readable(user,f.state.paper.id),version:f.state.resource.version});
 f.ai.validateContextPolicy=()=>{if(!enabled)throw new HTTPError(403,'教师刚禁用本任务','ai_assignment_policy');};
 const realCapture=f.ai.sourceStore.capture.bind(f.ai.sourceStore);
 f.ai.sourceStore.capture=async(...args)=>{cacheEntered=true;await new Promise(resolve=>{release=resolve;});return realCapture(...args);};
 const job=await f.ai.start(user,{mode:'tutor',prompt:'policy cache gate',assignmentId:assignment.id,resourceId:f.state.paper.id,questionId:f.q.id,consent:true});
 while(!cacheEntered)await sleep(2);enabled=false;release();
 const done=await finish(f.ai,user,job.id);assert.equal(done.status,'failed');assert.equal(done.error.code,'ai_assignment_policy');assert.equal(calls,0);
});


test('independent review cannot erase source uncertainty or claim original image verification',async()=>{
 const {reviewTutoring}=await import('../server/exam/ai-review.mjs');
 const draft=answer({missing:['题图中的电荷正负号看不清']});
 const provider={complete:async(_m,o)=>{assert.equal(o.task,'review');return {content:JSON.stringify(answer({review:{verdict:'supported',issues:[]}})),model:'fixture-review',usage:{totalTokens:100}};}};
 const checked=await reviewTutoring(provider,{draft,job:{prompt:'核对思路',mode:'tutor',configuration},documents:{documents:[],images:[{name:'synthetic',source:'synthetic.png'}]}});
 assert.equal(checked.result.status,'needs_confirmation');assert.deepEqual(checked.result.missing,draft.missing);
 assert.equal(checked.review.imageSourceVerified,false);assert.equal(checked.review.verification,'independent-model-review');
});
test('default tutor pipeline keeps draft audit and delivers an independently corrected answer',async t=>{
 let calls=0;
 const f=await fixture({complete:async messages=>{
  calls++;const reviewing=messages[0].content.includes('独立的高中物理审校员');
  return {content:JSON.stringify(answer(reviewing?{answer:'修正后：周期是正的量值，应使用 $|q|$。',review:{verdict:'corrected',issues:['初稿混淆电荷符号和量值']}}:{answer:'初稿错误答案。'})),model:'fixture',usage:{inputTokens:50,outputTokens:50,totalTokens:100}};
 }});t.after(f.close);f.ai.reviewEnabled=true;
 const job=await f.ai.start(f.users[1],{mode:'tutor',prompt:'讨论一般量值公式',consent:true});
 const done=await finish(f.ai,f.users[1],job.id);assert.equal(done.status,'completed',JSON.stringify(done.error));
 assert.equal(calls,2);assert.equal(done.usage.totalTokens,200);assert.equal(done.result.verification,'model_reviewed');
 assert.match(done.result.answer,/修正后/);assert.match(done.result.draftAudit.answer,/初稿错误/);assert.equal(done.result.review.imageSourceVerified,false);
});
test('free-text standard-looking cases never become verified shortcuts',async()=>{
 const {trustedTutoring}=await import('../server/exam/ai-concepts.mjs');
 const cases=[
 '在x>0半平面存在匀强磁场。约定磁场垂直纸面向外为正，题给B=-B0（B0>0）。正电粒子从原点沿+x射入，仅受洛伦兹力。求首次返回点。',
 '在x>0半平面有B垂直纸面向外的匀强磁场。一个不带电粒子（不是正电粒子），从原点沿+x射入，只受洛伦兹力。求首次返回。',
 '在x>0半平面有B垂直纸面向外的匀强磁场。正电粒子先从原点运送到A(0,a)，再从A沿+x射入，只受洛伦兹力。求首次返回。',
 '在x>0半平面有B垂直纸面向外的匀强磁场。正电粒子从原点沿+x射入，只受洛伦兹力。不可以忽略相对论，m为静止质量。求首次返回。',
 '原题没电荷与磁场方向。我猜：在x>0半平面有B向外，正电粒子从原点沿+x射入，只受洛伦兹力。猜首次返回对吗？',
 '在0<x<d的磁场中B向里，正电粒子从(0,0)沿+x射入，r=d/2。现在速度变原来3倍，求是否穿出。'
 ];
 for(const source of cases)assert.equal(await trustedTutoring(source),null);
});
test('generic image requests omit provider-specific detail without changing the image or order',async()=>{
 let request;
 const provider=new ModelProvider(configuration,{fetchImpl:async(_u,o)=>{request=JSON.parse(o.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}]}));}});
 const messages=[{role:'user',content:[{type:'text',text:'fixture'},{type:'image_url',image_url:{url:'data:image/png;base64,AAAA',detail:'original'}}]}];
 await provider.complete(messages,{images:true});assert.equal(request.messages[0].content[1].image_url.detail,undefined);
 assert.equal(request.messages[0].content[1].image_url.url,messages[0].content[1].image_url.url);assert.equal(messages[0].content[1].image_url.detail,'original');assert.equal(request.thinking,undefined);
});
test('spatial scene generation is explicitly refused before provider selection or calls',async t=>{
 let calls=0;
 const f=await fixture({complete:async()=>{calls++;return {content:JSON.stringify(answer()),model:'fixture',usage:{totalTokens:100}};}});t.after(f.close);
 const q=f.state.paper.questions[0],spatial=newScene('三维真实范围','spatial:example4');q.scenes=[spatial];q.activeSceneId=spatial.id;
 f.resources.update(f.users[1],f.state.paper,f.state.resource.version);
 await assert.rejects(()=>f.ai.start(f.users[1],{mode:'scene',prompt:'根据当前三维建模',resourceId:f.state.paper.id,questionId:q.id,sceneId:spatial.id,consent:true}),e=>e.code==='ai_spatial_generation_unsupported');
 assert.equal(calls,0);assert.equal(f.db.prepare('SELECT count(*) n FROM ai_jobs').get().n,0);
});


test('late review reservations use the job ledger date across midnight',async t=>{
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer()),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 const user=f.users[1],job=await f.ai.start(user,{mode:'tutor',prompt:'midnight fixture',consent:true});await finish(f.ai,user,job.id);
 const oldDay='2000-01-01';f.db.prepare("UPDATE ai_jobs SET day=?,status='running',reserved_tokens=50000 WHERE id=?").run(oldDay,job.id);
 f.db.prepare('INSERT INTO ai_usage_sources(day,user_id,api_source,calls,tokens) VALUES(?,?,?,1,145000)').run(oldDay,user.id,'shared');
 assert.throws(()=>f.ai.reserveTokens(user,job.id,150000,configuration,'shared'),e=>e.code==='ai_token_quota');
 assert.equal(f.db.prepare('SELECT tokens FROM ai_usage_sources WHERE day=? AND user_id=?').get(oldDay,user.id).tokens,145000);
 assert.equal(f.ai.usage(user,configuration,'shared',oldDay).reservedTokens,145000);
});


test('review has a separate output budget and truncated responses expose known usage only',async()=>{
 let body;
 const provider=new ModelProvider({...configuration,reviewMaxTokens:16384,reviewTimeoutMs:180000},{fetchImpl:async(_u,o)=>{body=JSON.parse(o.body);return new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"partial":'}}],model:'test',usage:{prompt_tokens:120,completion_tokens:16384,total_tokens:16504}}));}});
 await assert.rejects(()=>provider.complete([{role:'user',content:'fixture'}],{task:'review'}),e=>{assert.equal(e.usage.totalTokens,16504);assert.equal(e.partialContent,'{"partial":');return e.code==='ai_response_incomplete';});
 assert.equal(body.max_tokens,16384);assert.equal(JSON.stringify(body).includes('reasoning_content'),false);
});
test('failed independent review retains draft privately and counts all known billed calls',async t=>{
 let calls=0;
 const f=await fixture({complete:async()=>{
  calls++;if(calls===1)return {content:JSON.stringify(answer({answer:'未审初稿'})),model:'fixture',usage:{inputTokens:50,outputTokens:50,totalTokens:100}};
  const error=new HTTPError(502,'fixture truncated','ai_response_incomplete');error.model='fixture';error.usage={inputTokens:50,outputTokens:100,totalTokens:150};error.partialContent='{"partial":';throw error;
 }});t.after(f.close);f.ai.reviewEnabled=true;
 const user=f.users[1],job=await f.ai.start(user,{mode:'tutor',prompt:'known-cost failure',consent:true}),done=await finish(f.ai,user,job.id);
 assert.equal(done.status,'failed');assert.equal(done.usage.totalTokens,250);assert.equal(done.usage.calls,2);assert.equal(done.result,null);
 const row=f.db.prepare('SELECT draft_json,review_json FROM ai_jobs WHERE id=?').get(job.id);
 assert.match(row.draft_json,/未审初稿/);assert.match(row.review_json,/partial/);assert.equal(row.draft_json.includes('reasoning_content'),false);
 assert.equal(f.ai.usage(user).reservedTokens,250);
});
test('hints review actually receives images and student DTO hides complete draft',async t=>{
 let calls=0,visionOptions;
 const f=await fixture({complete:async(_m,o)=>{
  calls++;
  return {content:JSON.stringify(answer(calls===1?{answer:'完整初稿：最终答案为42。'}:{answer:'ignored full field',nextStep:'先根据已知电荷符号判断力的方向。',question:'你能写出叉积方向吗？',review:{verdict:'corrected',issues:['初稿含完整答案42，需隐藏']}})),model:'fixture',usage:{totalTokens:100}};
 }});t.after(f.close);f.ai.reviewEnabled=true;
 const user=f.users[1];f.ai.resolveContext=async()=>({assignment:{id:'hint-dto',title:'hints',aiPolicy:'hints',version:1},paper:f.state.paper,question:f.q,record:f.s,resource:f.resources.readable(user,f.state.paper.id),version:f.state.resource.version});f.ai.validateContextPolicy=()=>{};
 const job=await f.ai.start(user,{mode:'tutor',prompt:'只给下一步提示',assignmentId:'hint-dto',resourceId:f.state.paper.id,questionId:f.q.id,consent:true}),done=await finish(f.ai,user,job.id);
 assert.equal(done.status,'completed',JSON.stringify(done.error));assert.equal(done.result.draftAudit,undefined);assert.equal(done.result.sourcePreview,undefined);
 assert.doesNotMatch(JSON.stringify(done.result),/答案为42|答案42/);assert.match(done.result.answer,/下一步/);
 const raw=JSON.parse(f.db.prepare('SELECT result_json FROM ai_jobs WHERE id=?').get(job.id).result_json);
 assert.match(raw.draftAudit.answer,/答案为42/);assert.deepEqual(raw.sourcePreview.snapshot,f.s.snapshot);
 const {reviewTutoring}=await import('../server/exam/ai-review.mjs');
 await reviewTutoring({complete:async(m,o)=>{visionOptions={m,o};return {content:JSON.stringify(answer({review:{verdict:'supported',issues:[]}})),model:'vision-fixture',usage:{totalTokens:100}};}},{draft:answer(),job:{mode:'tutor',prompt:'核对',configuration:{...configuration,reviewModel:'text-strong'}},documents:{documents:[],images:[{url:'data:image/png;base64,AAAA',name:'synthetic',source:'s.png'}]}});
 assert.equal(visionOptions.o.modelOverride,configuration.visionModel);assert.equal(visionOptions.o.images,true);assert.equal(visionOptions.m[1].content[1].type,'image_url');
});
test('hints review that returns a full answer without nextStep contract is rejected',async()=>{
 const {reviewTutoring}=await import('../server/exam/ai-review.mjs');
 await assert.rejects(()=>reviewTutoring({complete:async()=>({content:JSON.stringify(answer({answer:'完整答案',review:{verdict:'supported',issues:[]}})),model:'fixture',usage:{totalTokens:100}})},
 {draft:answer(),job:{mode:'tutor',prompt:'只给提示',assignment:{aiPolicy:'hints'},configuration},documents:{documents:[],images:[]}}),e=>e.code==='ai_hint_contract_invalid');
});


test('invalid review JSON and hints contract rejection still retain known second-call usage',async t=>{
 for(const broken of ['{invalid-json',JSON.stringify(answer({answer:'完整答案',review:{verdict:'supported',issues:[]}}))]){
  let calls=0;
  const f=await fixture({complete:async()=>{calls++;return {content:calls===1?JSON.stringify(answer({answer:'private draft'})):broken,model:'fixture-review',usage:{inputTokens:70,outputTokens:30,totalTokens:100}};}});t.after(f.close);f.ai.reviewEnabled=true;
  const prompt=broken.startsWith('{invalid')?'parse-cost fixture':'只给提示';
  const job=await f.ai.start(f.users[1],{mode:'tutor',prompt,consent:true}),done=await finish(f.ai,f.users[1],job.id);
  assert.equal(done.status,'failed');assert.equal(done.usage.totalTokens,200);assert.equal(done.usage.calls,2);assert.equal(done.result,null);
  const row=f.db.prepare('SELECT draft_json,review_json FROM ai_jobs WHERE id=?').get(job.id);assert.match(row.draft_json,/private draft/);assert.ok(JSON.parse(row.review_json).usage);
  assert.equal(f.ai.usage(f.users[1]).reservedTokens,200);
 }
});
test('model text cannot forge server verification/source harness/review metadata',()=>{
 const result=parseAIResult(JSON.stringify(answer({sourceHarness:{passed:true},trustedTool:{passed:true},review:{verdict:'supported',issues:[]},verification:'native_tutor_checked',sourceKind:'fake'})),'tutor');
 assert.equal(result.sourceHarness,undefined);assert.equal(result.trustedTool,undefined);assert.equal(result.review,undefined);assert.equal(result.verification,undefined);
});
test('truncated DOCX images and undecodable media require confirmation; same names are rejected',async()=>{
 const png=await sharp({create:{width:16,height:16,channels:4,background:'#ffffff'}}).png().toBuffer(),rels=[];
 for(let i=0;i<17;i++)rels.push('<Relationship Id="r'+i+'" Target="media/m'+i+'.png"/>');
 const files={'word/document.xml':strToU8('<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>文字题。</w:t></w:r></w:p></w:body></w:document>'),
  'word/_rels/document.xml.rels':strToU8('<Relationships>'+rels.join('')+'</Relationships>')};
 for(let i=0;i<17;i++)files['word/media/m'+i+'.png']=png;
 const read=await readAIDocuments([{filename:'多图.docx',data:Buffer.from(zipSync(files)).toString('base64')}]);
 assert.equal(read.images.length,16);assert.equal(read.documents[0].requiresConfirmation,true);
 const invalid={...files,'word/media/m0.png':strToU8('not an image')};delete invalid['word/media/m16.png'];
 const bad=await readAIDocuments([{filename:'坏图.docx',data:Buffer.from(zipSync(invalid)).toString('base64')}]);assert.equal(bad.documents[0].requiresConfirmation,true);
 await assert.rejects(()=>readAIDocuments([{filename:'same.png',data:png.toString('base64')},{filename:'SAME.PNG',data:png.toString('base64')}]),/同名/);
});


test('default sixteen-k first student requests fit the unchanged daily budget',async t=>{
 const {loadModelConfiguration}=await import('../server/exam/model-provider.mjs'),config=await loadModelConfiguration({});
 assert.equal(config.maxTokens,16384);assert.equal(config.reviewMaxTokens,16384);assert.equal(config.dailyTokenStudent,150000);
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer({scene:givenScene()})),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 f.ai.configuration={...config,apiKey:'fixture-not-transmitted'};
 const job=await f.ai.start(f.users[1],{mode:'scene',prompt:'按已给全部参数搭建',resourceId:f.state.paper.id,questionId:f.q.id,sceneId:f.s.id,consent:true});
 const done=await finish(f.ai,f.users[1],job.id);assert.equal(done.status,'completed',JSON.stringify(done.error));assert.equal(done.result.candidate.harness.passed,true);
});
test('page number wins over decorative name typo and existing asset metadata stays complete',async t=>{
 const pdf=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../tests/fixtures/synthetic-physics-scan.pdf',import.meta.url))).catch(()=>null);if(!pdf){t.skip('synthetic PDF fixture unavailable');return;}
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer({questions:[{title:'明确第一页',sourceText:'只导题干页。',sourceRefs:[{sourceName:'可靠源.pdf',page:1,imageName:'微小拼写差异'}]}]})),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 const user=f.users[1],job=await f.ai.start(user,{mode:'extract',prompt:'原稿',resourceId:f.state.paper.id,consent:true,attachments:[{filename:'可靠源.pdf',data:pdf.toString('base64')}]});await finish(f.ai,user,job.id);
 const state=await f.ai.apply(user,job.id,{version:f.state.resource.version,confirmGivens:true,questionIndices:[0]}),q=state.paper.questions.at(-1);
 assert.equal(q.attachments.length,1);const metadata=f.resources.asset(state.paper.id,q.attachments[0].id);assert.equal(metadata.page,1);assert.equal(metadata.sourceName,'可靠源.pdf');
 assert.equal(q.sourceAnchors[0].page,1);assert.equal(state.paper.sources.at(-1).pages[0].page,1);
});
test('unmatched page reference keeps private sources but never attaches unrelated pages',async t=>{
 const pdf=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../tests/fixtures/synthetic-physics-scan.pdf',import.meta.url))).catch(()=>null);if(!pdf){t.skip('synthetic PDF fixture unavailable');return;}
 const f=await fixture({complete:async()=>({content:JSON.stringify(answer({questions:[{title:'未知出处',sourceText:'原页未对应。',sourceRefs:[{sourceName:'wrong-source.pdf',page:1}]}]})),model:'fixture',usage:{totalTokens:100}})});t.after(f.close);
 const user=f.users[1],job=await f.ai.start(user,{mode:'extract',prompt:'原稿',consent:true,attachments:[{filename:'实际源.pdf',data:pdf.toString('base64')}]});await finish(f.ai,user,job.id);
 const state=await f.ai.apply(user,job.id,{confirmGivens:true,questionIndices:[0]});assert.equal(state.paper.questions[0].attachments.length,0);
 assert.ok(state.paper.questions[0].notes.some(n=>n.kind==='unknown'));assert.equal(state.paper.sources.length,1);assert.equal(state.paper.sources[0].pages.length,1);
});
test('source emission count and angular spread cannot be invented by native defaults',()=>{
 const scene=givenScene();scene.objects[1]={id:'o3',kind:'source',x:0,y:0,mass:1,charge:1,speed:1,heading:0};
 assert.throws(()=>auditSceneSync(scene),/sourceType|count|spread/);
});

test('server metric scales admit only numerical zero roundoff and expose effective tolerances',()=>{
 const scene=givenScene();scene.duration=2;
 scene.objects[0].B=-200;
 const electric={...scene.objects[0],id:'o3',kind:'electric',E0:3,fieldAngle:-90,waveform:'dc',period:.65,phase:0};
 delete electric.B;scene.objects.splice(1,0,electric);scene.objects[2].id='o4';scene.objects[2].defs.speed='o3.E0 / abs(o1.B)';
 const checks=[{traceId:'o4',timeUs:2,metric:'yCm',expected:0},{traceId:'o4',timeUs:2,side:'before',metric:'forceN',expected:0}];
 const r=auditSceneSync(scene,checks);assert.equal(r.harness.passed,true);assert.ok(r.harness.checks.every(c=>c.pass));
 assert.ok(r.harness.checks[0].serverRoundoffTolerance>Math.abs(r.harness.checks[0].value));
 assert.equal(r.harness.checks[1].modelAbsoluteToleranceApplied,false);assert.ok(r.harness.checks[1].effectiveTolerance<1e-25);
 const wrong=structuredClone(scene);wrong.objects[1].E0=3.01;wrong.objects[2].defs={};wrong.objects[2].speed=.15;
 assert.equal(auditSceneSync(wrong,checks).harness.passed,false);
 assert.throws(()=>auditSceneSync(wrong,[{...checks[1],absoluteTolerance:1e-10}]),/误差/);
});
test('repair cannot pass by deleting, moving or relaxing original validation checks',async t=>{
 const {preserveValidationChecks}=await import('../server/exam/ai-validation.mjs');
 const original=[{traceId:'o2',timeUs:0,metric:'forceN',expected:0,relativeTolerance:.001}];
 assert.equal(preserveValidationChecks(original,[]).scopeChanged,true);
 assert.equal(preserveValidationChecks(original,[{...original[0],expected:10}]).scopeChanged,true);
 assert.equal(preserveValidationChecks(original,[{...original[0],timeUs:.1}]).scopeChanged,true);
 let calls=0;
 const f=await fixture({complete:async()=>{calls++;return {content:JSON.stringify(answer({answer:'错误工程解释：x方向合力为零保证y=0。',scene:givenScene(),checks:calls===1?original:[]})),model:'fixture',usage:{totalTokens:100}};}});t.after(f.close);
 const user=f.users[1],job=await f.ai.start(user,{mode:'scene',prompt:'按原题生成',resourceId:f.state.paper.id,questionId:f.q.id,consent:true}),done=await finish(f.ai,user,job.id);
 assert.equal(done.status,'completed');assert.equal(done.result.candidate.harness.passed,false);
 assert.equal(done.result.candidate.harness.validationScope.scopeChanged,true);
 assert.equal(done.result.harnessAttempts[0].submittedChecks.length,1);assert.equal(done.result.harnessAttempts[1].submittedChecks.length,0);
 assert.equal(done.result.harnessAttempts[1].actualChecks.length,1);assert.equal(done.result.harnessAttempts[1].actualChecks[0].pass,false);
 assert.doesNotMatch(done.result.answer,/x方向合力/);assert.match(done.result.answer,/改变了原始数值检查范围/);
 await assert.rejects(()=>f.ai.apply(user,job.id,{version:f.state.resource.version,confirmGivens:true,acceptAssumptions:true}),/未通过/);
});


test('cancelled DOCX job terminates document parsing, sends no model request and leaves no source cache',async t=>{
 let modelCalls=0;const f=await fixture({complete:async()=>{modelCalls++;return {content:JSON.stringify(answer()),model:'fixture',usage:{inputTokens:1,outputTokens:1,totalTokens:2}};}});t.after(f.close);
 const xml='<w:document xmlns:w="urn:w"><w:body>'+('<w:p><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="SimSun"/><w:sz w:val="22"/><w:lang w:val="en-US"/></w:rPr><w:t>m=1kg.</w:t></w:r></w:p>').repeat(15000)+'</w:body></w:document>';
 const input={mode:'extract',prompt:'仅识别合成材料',consent:true,attachments:[{filename:'synthetic-cancel.docx',data:Buffer.from(zipSync({'word/document.xml':strToU8(xml)},{level:0})).toString('base64')}]};
 const user=f.users[1],job=await f.ai.start(user,input);
 await sleep(100);f.ai.cancel(user,job.id);await f.ai.tasks.get(job.id);
 assert.equal(f.ai.get(user,job.id).status,'cancelled');assert.equal(modelCalls,0);
 assert.equal(f.ai.sources(user,job.id).sources.length,0);
 const {readdir}=await import('node:fs/promises');assert.deepEqual(await readdir(f.ai.documentRoot),[]);
});


test('trusted UI context labels and own followup chain survive reload without expanding source data',async t=>{
 let calls=0;const f=await fixture({complete:async()=>{calls++;return {content:JSON.stringify(answer()),model:'fixture',usage:{inputTokens:10,outputTokens:10,totalTokens:20}};}});t.after(f.close);
 const user=f.users[1],input={mode:'tutor',prompt:'围绕当前场景提问',resourceId:f.state.paper.id,questionId:f.q.id,sceneId:f.s.id,view:'private',consent:true,
  uiContext:{resourceTitle:'forged title',view:'workshop',followupTo:'forged-parent'}};
 const first=await f.ai.start(user,input);const completed=await finish(f.ai,user,first.id);
 assert.deepEqual(completed.result.sourcePreview.snapshot,f.s.snapshot);
 assert.deepEqual(first.uiContext,{resourceTitle:f.state.paper.title,questionTitle:f.q.title,sceneTitle:f.s.title,view:'private',followupTo:null,threadId:first.id,threadTitle:input.prompt,turn:1});
 assert.deepEqual(Object.keys(first.uiContext).sort(),['followupTo','questionTitle','resourceTitle','sceneTitle','threadId','threadTitle','turn','view']);
 const saved=f.resources.state(user,f.state.paper.id);saved.paper.title='后来改名的资源';saved.paper.questions[0].title='后来改名的题目';saved.paper.questions[0].scenes[0].snapshot.scene.objects[0].B=123;f.resources.update(user,saved.paper,saved.resource.version);
 assert.deepEqual(f.ai.get(user,first.id).result.sourcePreview.snapshot,f.s.snapshot);
 assert.equal(f.ai.get(user,first.id).uiContext.resourceTitle,first.uiContext.resourceTitle);
 const next=await f.ai.start(user,{...input,followupTo:first.id,prompt:'继续核对这个问题'});await finish(f.ai,user,next.id);
 assert.equal(next.uiContext.followupTo,first.id);assert.equal(next.uiContext.resourceTitle,'后来改名的资源');assert.equal(next.uiContext.questionTitle,'后来改名的题目');
 assert.equal(next.uiContext.threadId,first.id);assert.equal(next.uiContext.turn,2);assert.deepEqual(f.ai.thread(user,next.id).items.map(j=>j.id),[first.id,next.id]);
 const both=await f.ai.start(user,{...input,previousJobId:first.id,followupTo:next.id,prompt:'两个兼容字段指定不同本人记录'});await finish(f.ai,user,both.id);assert.equal(both.uiContext.followupTo,first.id);
 await assert.rejects(()=>f.ai.start(f.users[2],{mode:'tutor',prompt:'越权父链',consent:true,followupTo:first.id}),error=>error.status===404);
 f.db.prepare("UPDATE ai_jobs SET context_json='{}' WHERE id=?").run(first.id);assert.equal(f.ai.get(user,first.id).uiContext,undefined);assert(f.ai.list(user).items.some(j=>j.id===first.id));assert.equal(calls,3);
});

test('multi-turn agent follows its own branch and handwriting sends only the supplied ink',async t=>{
 const seen=[];const f=await fixture({complete:async(messages,options)=>{seen.push({messages,options});return {content:JSON.stringify(options.task==='formula'?{status:'answer',latex:'\\frac{m v}{q B}',variables:[{symbol:'m',meaning:'质量符号'}],ambiguities:[],warnings:[]}:answer()),model:'fixture',usageKnown:true,usage:{inputTokens:10,outputTokens:10,totalTokens:20}};}});t.after(f.close);
 const user=f.users[1],one=await f.ai.start(user,{mode:'tutor',prompt:'第一轮：记住讨论半径',consent:true});await finish(f.ai,user,one.id);
 const two=await f.ai.start(user,{mode:'tutor',prompt:'第二轮：再看周期',consent:true,followupTo:one.id});await finish(f.ai,user,two.id);
 const three=await f.ai.start(user,{mode:'review',prompt:'第三轮：比较前两个结论',consent:true,followupTo:two.id});await finish(f.ai,user,three.id);
 const context=JSON.parse(seen[2].messages[1].content[0].text);assert.deepEqual(context.previousDialogue.map(d=>d.request),['第一轮：记住讨论半径','第二轮：再看周期']);
 const ink=await sharp({create:{width:280,height:110,channels:4,background:'#fff'}}).png().toBuffer();
 const job=await f.ai.start(user,{mode:'formula',prompt:'转录笔迹',consent:true,resourceId:f.state.paper.id,questionId:f.q.id,sceneId:f.s.id,attachments:[{filename:'handwriting.png',data:ink.toString('base64')}]});
 const done=await finish(f.ai,user,job.id);assert.equal(done.status,'completed');assert.equal(done.result.verification,'handwriting-transcription-only');assert.equal(done.result.formula.requiresConfirmation,true);
 const sent=seen.at(-1);assert.equal(sent.options.task,'formula');assert.equal(sent.options.images,true);assert.equal(sent.messages[1].content.filter(p=>p.type==='image_url').length,1);assert.equal(JSON.stringify(sent.messages).includes(f.q.sourceText),false);assert.equal(JSON.stringify(sent.messages).includes('snapshot'),false);
 assert.ok(done.activity.some(e=>e.title==='读取本次手写笔迹'));assert.equal(done.usage.calls,1);
});
