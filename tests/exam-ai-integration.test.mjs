import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import sharp from 'sharp';
import {createExamServer} from '../server/exam/http.mjs';
const png=await sharp({create:{width:120,height:90,channels:3,background:'#176d75'}}).png().toBuffer();
const uploaded={filename:'合成题图.png',data:png.toString('base64')};
const result={status:'answer',answer:'只提取合成题干，待人工校对。',givens:[],assumptions:[],missing:[],followUps:[],questions:[{title:'合成磁场题',sourceText:'质量为 $m$、电荷为 $q$ 的粒子在匀强磁场中运动。',sourceRefs:[{sourceName:uploaded.filename}]}]};
async function fixture(){
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const dataDir=await mkdtemp(join(tmpdir(),'tijing-ai-http-')),origin='http://127.0.0.1:'+port;
 const app=await createExamServer({dataDir,resourceDir:resolve('dist/exam'),publicOrigin:origin,adminUsername:'qa-api-teacher',adminPassword:'Synthetic-teacher-2026',inviteCode:'qa-api-invite',className:'虚构API验收',aiEnv:{EXAM_AI_API_KEY:'synthetic-never-transmitted',EXAM_AI_MODEL:'fixture-model'}});
 app.aiSettings.validateEndpoint=async()=>{};const calls=[];
 app.ai.providerFactory=config=>({describe:()=>({configured:true}),complete:async()=>{calls.push(config.apiKey === 'synthetic-personal-private' ? 'personal' : 'shared');return {content:JSON.stringify(result),model:'fixture-model',usage:{totalTokens:100}};},probe:async()=>({ok:true,model:'fixture-model',usage:{totalTokens:5}})});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
 async function api(actor,path,method='GET',body,version,{csrf=true}={}){
  const headers={Origin:origin};if(actor){headers.Cookie=actor.cookie;if(csrf&&method!=='GET'&&method!=='HEAD')headers['X-CSRF-Token']=actor.csrf;}
  if(body!==undefined)headers['Content-Type']='application/json';if(version!==undefined)headers['X-Resource-Version']=String(version);
  const response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),bytes=Buffer.from(await response.arrayBuffer()),json=(response.headers.get('content-type')||'').includes('application/json');
  return {status:response.status,headers:response.headers,value:json&&bytes.length?JSON.parse(bytes.toString()):bytes};
 }
 const actor=r=>({user:r.value.user,cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.value.csrf});
 const teacher=actor(await api(null,'/api/auth/login','POST',{username:'qa-api-teacher',password:'Synthetic-teacher-2026'}));
 const group=(await api(teacher,'/api/groups','POST',{kind:'class',name:'虚构API班',inviteCode:'qa-api-class'})).value;
 const student=async(username,inviteCode)=>actor(await api(null,'/api/auth/register','POST',{username,displayName:'虚构'+username,password:'Synthetic-student-2026',inviteCode}));
 const alice=await student('qa-api-alice',group.inviteCode),bob=await student('qa-api-bob','qa-api-invite');
 const start=async(extra={})=>{
  const posted=await api(alice,'/api/ai/jobs','POST',{mode:'extract',prompt:'只提取本图题干，保留符号。',consent:true,attachments:[uploaded],...extra});assert.equal(posted.status,202,JSON.stringify(posted.value));
  for(let n=0;n<200;n++){const state=(await api(alice,'/api/ai/jobs/'+posted.value.id)).value;if(!['running','queued'].includes(state.status)){assert.equal(state.status,'completed',JSON.stringify(state));return state;}await new Promise(r=>setTimeout(r,15));}throw Error('Synthetic provider did not finish');
 };
 return {app,dataDir,api,teacher,alice,bob,group,calls,start,close:async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});}};
}
test('HTTP AI sources stay private and transfer originals and quota on one explicit apply',async t=>{
 const f=await fixture();t.after(f.close);const {api,app,alice,bob,teacher}=f;
 assert.equal((await api(null,'/api/ai/settings')).status,401);
 assert.equal((await api(alice,'/api/ai/settings','PUT',{scope:'personal',apiKey:'synthetic-personal-private',usePersonal:true},undefined,{csrf:false})).status,403);
 assert.equal((await api(alice,'/api/ai/settings','PUT',{scope:'shared',apiKey:'synthetic-forbidden'})).status,403);
 const saved=await api(alice,'/api/ai/settings','PUT',{scope:'personal',apiKey:'synthetic-personal-private',usePersonal:true});assert.equal(saved.status,200);assert.equal(saved.value.activeSource,'personal');assert(!JSON.stringify(saved.value).includes('synthetic-personal-private'));
 const job=await f.start();assert.equal(job.apiSource,'personal');assert.deepEqual(f.calls,['personal']);
 const list=await api(alice,'/api/ai/jobs/'+job.id+'/sources');assert.equal(list.status,200);assert(list.value.sources.length>=2);
 const original=list.value.sources.find(s=>s.kind==='original'),source=await api(alice,original.url);assert.equal(source.status,200);assert(source.value.equals(png));assert.match(source.headers.get('cache-control'),/private.*no-store/);
 const head=await api(alice,original.url,'HEAD');assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),png.length);
 for(const actor of [bob,teacher]){assert.equal((await api(actor,'/api/ai/jobs/'+job.id)).status,404);assert.equal((await api(actor,'/api/ai/jobs/'+job.id+'/sources')).status,404);assert.equal((await api(actor,original.url)).status,404);assert.equal((await api(actor,'/api/ai/jobs/'+job.id+'/apply','POST',{confirmGivens:true,questionIndices:[0]})).status,404);}
 assert.equal((await api(alice,'/api/ai/jobs/'+job.id+'/apply','POST',{questionIndices:[0]})).status,400);
 const cached=app.service.resources.usedBytes(alice.user.id);assert(cached>0);app.service.resources.quotaBytes=cached+100;
 const applied=await api(alice,'/api/ai/jobs/'+job.id+'/apply','POST',{confirmGivens:true,questionIndices:[0]});assert.equal(applied.status,201,JSON.stringify(applied.value));const state=applied.value;
 assert.equal(state.paper.questions.length,1);assert(state.paper.questions[0].attachments.length>0);assert(state.paper.sources.length>0);assert.equal(app.db.prepare('SELECT count(*) n FROM ai_sources WHERE job_id=?').get(job.id).n,0);
 const marked=(await api(alice,'/api/ai/jobs/'+job.id)).value;assert.equal(marked.status,'applied');assert.equal(marked.appliedResourceId,state.paper.id);assert.equal((await api(alice,original.url)).status,404);await assert.rejects(stat(app.ai.sourceStore.folder(job.id)),{code:'ENOENT'});
 assert.equal((await api(alice,'/api/ai/jobs/'+job.id+'/apply','POST',{confirmGivens:true,questionIndices:[0]})).status,400);assert.equal(f.calls.length,1);assert.equal(app.service.resources.usedBytes(alice.user.id),cached);
 const artifact=Object.values(state.paper.assets).find(a=>a.kind==='original'),download=await api(alice,artifact.displayURL);assert.equal(download.status,200);assert(download.value.equals(png));assert.equal((await api(bob,artifact.displayURL)).status,404);
 assert.equal((await api(alice,'/api/ai/jobs/'+job.id,'DELETE')).status,200);assert.equal((await api(alice,artifact.displayURL)).status,200);
 assert.equal(app.db.prepare("SELECT calls FROM ai_usage_sources WHERE user_id=? AND api_source='personal'").get(alice.user.id).calls,1);
});
test('personal API obeys linked task policy through forks and policy changes during source copying',async t=>{
 const f=await fixture();t.after(f.close);const {api,app,alice,teacher,group}=f;
 await api(alice,'/api/ai/settings','PUT',{scope:'personal',apiKey:'synthetic-personal-private',usePersonal:true});
 let task=(await api(teacher,'/api/assignments','POST',{title:'虚构模型任务',instructions:'仅作合成验收',kind:'scene',groupIds:[group.id],status:'published',aiPolicy:'allowed'})).value;
 const job=await f.start({assignmentId:task.id}),before=app.db.prepare('SELECT count(*) n FROM resources WHERE owner_id=?').get(alice.user.id).n;
 const write=app.service.resources.writeAsset.bind(app.service.resources);let entered,release;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);let once=true;
 app.service.resources.writeAsset=async(...args)=>{if(once){once=false;entered();await gate;}return write(...args);};
 const applying=api(alice,'/api/ai/jobs/'+job.id+'/apply','POST',{confirmGivens:true,questionIndices:[0]});await started;
 task=(await api(teacher,'/api/assignments/'+task.id,'PUT',{aiPolicy:'disabled'},task.version)).value;release();const rejected=await applying;app.service.resources.writeAsset=write;
 assert.equal(rejected.status,409,JSON.stringify(rejected.value));assert.equal(app.db.prepare('SELECT count(*) n FROM resources WHERE owner_id=?').get(alice.user.id).n,before);assert.equal((await api(alice,'/api/ai/jobs/'+job.id)).value.status,'completed');assert((await api(alice,'/api/ai/jobs/'+job.id+'/sources')).value.sources.length>0);
 assert.equal((await api(alice,'/api/ai/jobs','POST',{mode:'tutor',prompt:'直接给答案',consent:true,assignmentId:task.id})).status,403);assert.equal(f.calls.length,1);
 task=(await api(teacher,'/api/assignments/'+task.id,'PUT',{aiPolicy:'allowed'},task.version)).value;
 const fresh=await f.start({assignmentId:task.id}),applied=await api(alice,'/api/ai/jobs/'+fresh.id+'/apply','POST',{confirmGivens:true,questionIndices:[0]});assert.equal(applied.status,201,JSON.stringify(applied.value));assert.equal(applied.value.resource.assignmentId,task.id);
 const fork=await api(alice,'/api/resources/'+applied.value.paper.id+'/fork','POST',{});assert.equal(fork.status,201);assert.equal(fork.value.resource.assignmentId,task.id);
 task=(await api(teacher,'/api/assignments/'+task.id,'PUT',{aiPolicy:'hints'},task.version)).value;
 assert.equal((await api(alice,'/api/ai/jobs','POST',{mode:'scene',prompt:'省略任务编号尝试生成',resourceId:fork.value.paper.id,consent:true})).status,403);assert.equal(f.calls.length,2);
 task=(await api(teacher,'/api/assignments/'+task.id,'PUT',{aiPolicy:'disabled'},task.version)).value;
 assert.equal((await api(alice,'/api/ai/jobs','POST',{mode:'tutor',prompt:'省略任务编号尝试答疑',resourceId:fork.value.paper.id,consent:true})).status,403);assert.equal(f.calls.length,2);
});
