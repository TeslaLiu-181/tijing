import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {paperContentFingerprint} from '../server/exam/ai-content.mjs';
import {openDatabase} from '../server/exam/database.mjs';
import {Resources} from '../server/exam/resources.mjs';
import {AIService} from '../server/exam/ai-service.mjs';
import {newPaper,newQuestion,newScene} from '../src/exam/model.mjs';
import {example} from '../src/planar-model.mjs';
const config={apiKey:'synthetic-only-never-transmitted',baseURL:'https://example.invalid/v1',model:'fixture',maxTokens:1024,reviewMaxTokens:1024,parallel:2,dailyTeacher:100,dailyStudent:30,dailyTotal:300,timeoutMs:10000};
const candidate=()=>{const value=example('circle');value.objects[0].shape='infinite';value.objects[0].B=-100;Object.assign(value.objects[1],{charge:1,speed:1,heading:0,x:0,y:0});return value;};
const response=mode=>({content:JSON.stringify({status:'answer',answer:'合成验证。',givens:[],assumptions:[],missing:[],followUps:[],...(mode==='scene'?{scene:candidate()}:{questions:[{title:'合成识别题',sourceText:'合成原文，待校对。'}]})}),model:'fixture',usage:{inputTokens:10,outputTokens:10,totalTokens:20}});
async function fixture(mode='scene'){
 const root=await mkdtemp(join(tmpdir(),'tijing-content-test-')),db=await openDatabase(root),user={id:'synthetic-teacher',role:'teacher'};
 db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(user.id,user.id,user.id,'synthetic-unused',user.role,new Date().toISOString());
 const resources=new Resources(db,root),state=resources.create(user,'合成内容保护'),q=newQuestion('原题','正电粒子在垂直纸面向里的 0.1 T 无限匀强磁场中，向右以 100000 m/s 运动。'),scene=newScene();scene.snapshot={scene:candidate(),context:{timeUs:0}};scene.baseline=structuredClone(scene.snapshot);q.scenes=[scene,newScene('原题第二变式','base:circle')];q.activeSceneId=scene.id;
 const other=newQuestion('其他题','未发送给模型的另一题。');other.scenes=[newScene('其他平面','base:circle'),newScene('其他三维','spatial:example4')];other.activeSceneId=other.scenes[0].id;state.paper.questions=[q,other];state.paper.activeQuestionId=q.id;
 const asset=await resources.writeAsset(state.paper.id,Buffer.from('synthetic original file'),{name:'合成原件.txt',mime:'text/plain',kind:'original'});state.paper.assets[asset.id]=asset;q.attachments=[{id:asset.id,page:1}];resources.update(user,state.paper,state.resource.version,[asset]);
 const provider={describe:()=>({configured:true}),complete:async()=>response(mode)};
 const f={root,db,user,resources,q,scene,other,asset,mode,provider,ai:await new AIService(db,{dataDir:root,resources,configuration:config,provider,reviewEnabled:false}).init()};
 f.create=async(view='private')=>{const job=await f.ai.start(user,{mode,prompt:'合成内容一致性检查',resourceId:state.paper.id,questionId:q.id,sceneId:scene.id,view,consent:true});await f.ai.tasks.get(job.id);assert.equal(f.ai.get(user,job.id).status,'completed');return job;};
 f.saved=()=>resources.state(user,state.paper.id);f.close=async()=>{await f.ai.close();db.close();await rm(root,{recursive:true,force:true});};return f;
}
function changeView(paper){paper.revision+=5;paper.updatedAt='later';paper.activeQuestionId=paper.questions[1].id;for(const q of paper.questions){q.activeSceneId=q.scenes.at(-1).id;q.updatedAt='later';for(const s of q.scenes){s.updatedAt='later';s.snapshot.context={...s.snapshot.context,timeUs:.1,viewport:{width:900,height:600},playing:false};s.baseline.context={...s.baseline.context,timeUs:.1};if(s.kind==='example4')s.snapshot.context.camera={position:[1,2,3],target:[0,0,0],up:[0,1,0],zoom:2};else s.snapshot.context.view={x:2,y:3,scale:4};}}}
const apply=(f,job,version)=>f.ai.apply(f.user,job.id,{version,confirmGivens:true,acceptAssumptions:true,...(f.mode==='extract'?{questionIndices:[0]}:{})});
const conflict=error=>error.status===409&&error.code==='version_conflict';
test('content fingerprint ignores only schema-specific views and keeps semantic fields and stable key order',()=>{
 const paper=newPaper('合成'),q=newQuestion('题干','原文'),s=newScene();q.scenes=[s];q.activeSceneId=s.id;paper.questions=[q];paper.activeQuestionId=q.id;paper.assets.a={id:'a',name:'原图',mime:'image/png',path:'original.png',sha256:'original-hash',page:1};q.attachments=[{id:'a',page:1}];paper.sources=[{id:'src',asset:{...paper.assets.a}}];q.notes=[{kind:'reference',url:'https://example.invalid/meaningful-link'}];
 const original=paperContentFingerprint(paper);const view=structuredClone(paper);delete view.activeQuestionId;view.revision=99;view.updatedAt='later';view.questions[0].activeSceneId=null;view.questions[0].updatedAt='later';view.questions[0].scenes[0].updatedAt='later';view.questions[0].scenes[0].snapshot.context={timeUs:2,viewport:{width:900,height:600},camera:{zoom:2}};view.questions[0].scenes[0].baseline.context={timeUs:3};view.assets.a.url='data:image/png;base64,AAAA';view.assets.a.displayURL='/temporary';view.questions[0].attachments[0].displayURL='/temporary';view.sources[0].asset.url='/temporary';assert.deepEqual(paperContentFingerprint(view),original);
 const mutations=[p=>p.title+='改',p=>p.questions[0].sourceText+='改',p=>p.questions[0].referenceText='解析',p=>p.questions[0].review='confirmed',p=>p.questions[0].notes[0].url+='changed',p=>p.questions[0].scenes[0].status='ready',p=>p.questions[0].scenes[0].baseline.scene.duration+=1,p=>p.assets.a.sha256='changed',p=>p.assets.a.path='changed',p=>p.assets.a.name='changed',p=>p.questions[0].attachments[0].page=2];
 for(const mutate of mutations){const changed=structuredClone(paper);mutate(changed);assert.notEqual(paperContentFingerprint(changed).sha256,original.sha256);}
 const reordered=Object.fromEntries(Object.entries(paper).reverse());assert.deepEqual(paperContentFingerprint(reordered),original);
});
test('native label pixel offsets are view state while label text and coordinates remain content',()=>{
 const paper=newPaper('合成'),q=newQuestion('题干','原文'),scene=newScene('原图','base:rectangle');paper.questions=[q];q.scenes=[scene];const original=paperContentFingerprint(paper);
 for(const snapshot of [scene.snapshot,scene.baseline])snapshot.scene.objects[0].labelOffset={x:45,y:-20};
 assert.deepEqual(paperContentFingerprint(paper),original);
 const renamed=structuredClone(paper);renamed.questions[0].scenes[0].snapshot.scene.objects[0].label='另一场';assert.notEqual(paperContentFingerprint(renamed).sha256,original.sha256);
 const moved=structuredClone(paper);moved.questions[0].scenes[0].snapshot.scene.objects[0].x+=1;assert.notEqual(paperContentFingerprint(moved).sha256,original.sha256);
});
test('new private scene proposal accepts playback, viewport, camera and active ID saves but keeps fingerprint private',async t=>{
 const f=await fixture();t.after(f.close);const job=await f.create(),raw=JSON.parse(f.ai.row(f.user,job.id).context_json);assert.equal(raw.contentFingerprint.version,'paper-content/1');assert.equal(job.contentFingerprint,undefined);assert.equal(f.ai.get(f.user,job.id).contentFingerprint,undefined);
 const saved=f.saved();changeView(saved.paper);f.resources.update(f.user,saved.paper,saved.resource.version);const newest=f.saved();const result=await apply(f,job,newest.resource.version);assert.equal(result.paper.questions[0].scenes.length,3);assert.equal(result.paper.questions[1].scenes.length,2);assert.equal(f.ai.get(f.user,job.id).status,'applied');
});
test('whole-paper physics, other question text, attachment and baseline changes still reject new proposals',async()=>{
 const mutations=[p=>p.questions[0].scenes[0].snapshot.scene.objects[0].B=-120,p=>p.questions[0].sourceText+='新增条件',p=>p.questions[1].sourceText+='另一题内容修改',p=>p.questions[0].attachments[0].page=2,p=>p.questions[0].scenes[0].baseline.scene.objects[0].B=-125];
 for(const mutate of mutations){const f=await fixture();try{const job=await f.create(),saved=f.saved();mutate(saved.paper);f.resources.update(f.user,saved.paper,saved.resource.version);await assert.rejects(()=>apply(f,job,f.saved().resource.version),conflict);}finally{await f.close();}}
});
test('latest request CAS and legacy version/snapshot guards remain strict',async t=>{
 const f=await fixture();t.after(f.close);const job=await f.create(),saved=f.saved();changeView(saved.paper);f.resources.update(f.user,saved.paper,saved.resource.version);await assert.rejects(()=>apply(f,job,saved.resource.version),conflict);
 const context=JSON.parse(f.ai.row(f.user,job.id).context_json);delete context.contentFingerprint;f.db.prepare('UPDATE ai_jobs SET context_json=? WHERE id=?').run(JSON.stringify(context),job.id);await assert.rejects(()=>apply(f,job,f.saved().resource.version),conflict);
 f.db.prepare('UPDATE ai_jobs SET resource_version=? WHERE id=?').run(f.saved().resource.version,job.id);await assert.rejects(()=>apply(f,job,f.saved().resource.version),conflict);
});
test('fingerprint survives service restart and allows view-only extraction append; content edits reject extraction',async()=>{
 const f=await fixture('extract');try{const job=await f.create();await f.ai.close();f.ai=await new AIService(f.db,{dataDir:f.root,resources:f.resources,configuration:config,provider:f.provider,reviewEnabled:false}).init();const saved=f.saved();changeView(saved.paper);f.resources.update(f.user,saved.paper,saved.resource.version);const result=await apply(f,job,f.saved().resource.version);assert.equal(result.paper.questions.length,3);assert.equal(f.ai.get(f.user,job.id).contentFingerprint,undefined);}finally{await f.close();}
 const g=await fixture('extract');try{const job=await g.create(),saved=g.saved();saved.paper.questions[0].sourceText+='changed';g.resources.update(g.user,saved.paper,saved.resource.version);await assert.rejects(()=>apply(g,job,g.saved().resource.version),conflict);}finally{await g.close();}
});
test('shared source keeps strict guards and deleted private source cannot become a free new inquiry',async()=>{
 const f=await fixture();try{const saved=f.saved();f.db.prepare('UPDATE resources SET published_json=paper_json,published_version=version WHERE id=?').run(saved.paper.id);const job=await f.create('shared');assert.equal(JSON.parse(f.ai.row(f.user,job.id).context_json).contentFingerprint,undefined);const changed=f.saved();changeView(changed.paper);f.resources.update(f.user,changed.paper,changed.resource.version);await assert.rejects(()=>apply(f,job,f.saved().resource.version),conflict);}finally{await f.close();}
 const g=await fixture();try{const job=await g.create();g.db.prepare('DELETE FROM resources WHERE id=?').run(g.saved().paper.id);await assert.rejects(()=>apply(g,job,1),conflict);assert.equal(g.db.prepare('SELECT count(*) n FROM resources').get().n,0);}finally{await g.close();}
});
