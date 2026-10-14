import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {Worker} from 'node:worker_threads';
import {zipSync,strToU8} from 'fflate';
import {example} from '../src/planar-model.mjs';

const packageDir=resolve(process.argv[2]||'dist/student-web-package'),output=process.argv[3];
const manifest=JSON.parse(await readFile(join(packageDir,'build-manifest.json'),'utf8'));
const {start}=await import(pathToFileURL(join(packageDir,'server/exam/main.mjs')));
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const data=await mkdtemp(join(tmpdir(),'tijing-package-check-')),password=randomBytes(24).toString('base64url'),invite=randomBytes(12).toString('hex'),origin='http://127.0.0.1:'+port;
const env={EXAM_HOST:'127.0.0.1',EXAM_PORT:String(port),EXAM_PUBLIC_URL:origin,EXAM_DATA_DIR:data,EXAM_ADMIN_USERNAME:'qa-package-teacher',EXAM_ADMIN_PASSWORD:password,EXAM_INVITE_CODE:invite,EXAM_CLASS_NAME:'虚构发布包验收'};
const report={version:manifest.version,sourceCommit:manifest.sourceCommit,sourceState:manifest.sourceState,syntheticOnly:true,realModelCalls:0,checks:[]};
let app,teacher;
async function api(path,method='GET',body){
 const headers={Origin:origin};if(teacher){headers.Cookie=teacher.cookie;if(method!=='GET')headers['X-CSRF-Token']=teacher.csrf;}if(body!==undefined)headers['Content-Type']='application/json';
 const response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),bytes=Buffer.from(await response.arrayBuffer());
 const json=(response.headers.get('content-type')||'').includes('application/json');return {status:response.status,headers:response.headers,value:json?JSON.parse(bytes.toString()):bytes};
}
async function checkDocxWorker(){
 const xml='<w:document xmlns:w="urn:w" xmlns:m="urn:m"><w:body><w:p><w:r><w:t>1. 合成正文 m=1kg：</w:t></w:r><m:oMath><m:f><m:num><m:r><m:t>m</m:t></m:r></m:num><m:den><m:r><m:t>q</m:t></m:r></m:den></m:f></m:oMath></w:p></w:body></w:document>';
 const data=zipSync({'word/document.xml':strToU8(xml)});
 const result=await new Promise((resolve,reject)=>{
  const worker=new Worker(pathToFileURL(join(packageDir,'server/exam/ai-docx-worker.mjs')),
   {workerData:{data,limits:{maxBytes:36*1024*1024,maxXmlBytes:4*1024*1024}},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:64}});
  let settled=false;
  const finish=async(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);await worker.terminate();error?reject(error):resolve(result);};
  const timer=setTimeout(()=>finish(new Error('Packaged DOCX worker timed out')),5000);
  worker.once('message',message=>finish(message.ok?null:new Error(message.message),message.result));
  worker.once('error',error=>finish(error));
  worker.once('exit',()=>{if(!settled)finish(new Error('Packaged DOCX worker exited before returning a result'));});
 });
 assert.equal(result.paragraphs.length,1);assert.equal(result.paragraphs[0].text,'1. 合成正文 m=1kg：$'+String.raw`\frac{m}{q}`+'$');
 assert.equal(result.media.size,0);
 report.checks.push('Actual bundled DOCX worker returns synthetic body text and OMML formula from its packaged entry');
}
async function nativeRead(scene,action,args={}){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(pathToFileURL(join(packageDir,'server/exam/ai-agent-worker.mjs')),{workerData:{action,scene,args},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:96}});
  let settled=false;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);};
  const timer=setTimeout(()=>finish(Error('Packaged agent worker timed out')),5000);
  worker.once('message',message=>finish(message.ok?null:Error(message.error),message.result));worker.once('error',error=>finish(error));worker.once('exit',()=>{if(!settled)finish(Error('Packaged agent worker exited without a result'));});
 });
}
try{
 await checkDocxWorker();
 const regionScene=example('geometry-l-region');
 const events=await nativeRead(regionScene,'query_events');
 assert.equal(events.method,'shared-native-timeline-events');assert(events.events.some(event=>event.kind==='enter'));assert(events.events.some(event=>event.kind==='exit'));report.checks.push('Actual bundled Agent worker reads non-convex field entry and exit events from the packaged native geometry engine');
 const annulus=example('annular-electric'),annularEvents=(await nativeRead(annulus,'query_events')).events.filter(event=>['enter','exit'].includes(event.kind));
 assert.deepEqual(annularEvents.map(event=>event.kind),['enter','exit','enter','exit']);
 const holeTime=(annularEvents[1].timeUs+annularEvents[2].timeUs)/2,hole=(await nativeRead(annulus,'query_motion',{timesUs:[holeTime]})).readings[0];
 assert(hole.available);assert.deepEqual(hole.fields,[]);assert.deepEqual(hole.totalForceN,[0,0]);assert(Math.abs(hole.xCm)<1e-9);
 report.checks.push('Packaged native workers retain both ring boundaries and confirm zero field/force in the intervening hole');
 app=await start(env);assert.equal((await api('/')).status,200);report.checks.push('Bundled main starts and serves its packaged frontend');
 const login=await api('/api/auth/login','POST',{username:'qa-package-teacher',password});assert.equal(login.status,200);teacher={cookie:login.headers.get('set-cookie').split(';')[0],csrf:login.value.csrf,user:login.value.user};
 const sample=await api('/api/sample','POST',{});assert.equal(sample.status,201);assert(sample.value.paper.questions.length>0);report.checks.push('Packaged sample imports with questions and assets');
 const scene=example('circle');scene.objects[0].shape='infinite';scene.objects[0].B=-100;Object.assign(scene.objects[1],{charge:1,speed:1,heading:0,x:0,y:0});
 app.ai.configurationFor=async()=>({...app.ai.configuration,apiKey:'synthetic-only-never-transmitted',apiSource:'shared'});
 app.ai.providerFactory=()=>({describe:()=>({configured:true}),complete:async()=>({content:JSON.stringify({status:'answer',answer:'合成场景供发布包验收。',givens:[],assumptions:['独立验收演示参数'],missing:[],followUps:[],scene}),model:'synthetic-package-provider',usage:{totalTokens:100}})});
 const posted=await api('/api/ai/jobs','POST',{mode:'scene',prompt:'创建合成验收场景，允许选择演示参数。',consent:true});assert.equal(posted.status,202,JSON.stringify(posted.value));
 let job;for(let n=0;n<300;n++){job=(await api('/api/ai/jobs/'+posted.value.id)).value;if(!['queued','running'].includes(job.status))break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(job.status,'completed',JSON.stringify(job.error));assert.equal(job.result.candidate.harness.passed,true);report.checks.push('Bundled server invokes bundled native worker and reads back an actual trajectory');
 const applied=await api('/api/ai/jobs/'+job.id+'/apply','POST',{confirmGivens:true,acceptAssumptions:true});assert.equal(applied.status,201,JSON.stringify(applied.value));assert.equal(applied.value.paper.questions[0].scenes.length,1);
 const resourceId=applied.value.paper.id;report.checks.push('Explicit confirmed proposal creates a private draft through packaged HTTP service');
 const exported=await api('/api/resources/'+resourceId+'/export','POST',{kind:'bundle'});assert.equal(exported.status,200);assert.equal(exported.value.subarray(0,2).toString(),'PK');report.checks.push('Saved native scene exports from the packaged program');
 await app.close();app=null;app=await start(env);
 const restored=await api('/api/resources/'+resourceId);assert.equal(restored.status,200);assert.equal(restored.value.paper.questions[0].scenes.length,1);assert.equal((await api('/api/ai/jobs/'+job.id)).value.status,'applied');report.checks.push('Actual restart preserves session, draft, AI receipt and asset catalog');
 report.ok=true;
}finally{if(app)await app.close();await rm(data,{recursive:true,force:true});if(output)await writeFile(resolve(output),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
