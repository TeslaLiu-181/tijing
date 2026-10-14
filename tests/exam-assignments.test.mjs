import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {openDatabase} from '../server/exam/database.mjs';
import {Accounts,hashPassword} from '../server/exam/auth.mjs';
import {Resources} from '../server/exam/resources.mjs';
import {Assignments} from '../server/exam/assignments.mjs';
import {newPaper,newQuestion,newScene,clone} from '../src/exam/model.mjs';
import sharp from 'sharp';

const image=await sharp({create:{width:200,height:120,channels:3,background:'#007b73'}}).png().toBuffer();
async function fixture(){
  const directory=await mkdtemp(join(tmpdir(),'tijing-assignments-')),db=await openDatabase(directory),accounts=new Accounts(db);
  await accounts.initialize({adminUsername:'qa-teacher',adminPassword:'Teacher-test-2026',inviteCode:'assignment-legacy',className:'虚构学习空间'});
  const teacher=db.prepare("SELECT * FROM users WHERE role='teacher'").get(),user={id:teacher.id,role:'teacher'},resources=new Resources(db,directory),tasks=new Assignments(db,resources);
  await tasks.cleanupPending();resources.assignmentContext=(user,id)=>tasks.resourceContext(user,id);
  async function student(username,inviteCode='assignment-legacy'){return (await accounts.register({username,displayName:'虚构'+username,password:'Student-test-2026',inviteCode},'127.0.0.1')).user;}
  async function paper(actor,{document=true}={}){
    const p=newPaper('虚构任务原稿'),q=newQuestion('虚构观察题','已知$m,q,v,B$，请解释轨迹。'),q2=newQuestion('私人未提交题','只供作者保留。');
    q.sourceId='source-qa';q.scenes=[newScene('虚构自建场景','lesson:ex2')];q.activeSceneId=q.scenes[0].id;q.review='confirmed';q2.scenes=[newScene('私人场景','lesson:ex1')];q2.activeSceneId=q2.scenes[0].id;
    const aid=crypto.randomUUID(),hidden=crypto.randomUUID();p.assets[aid]={id:aid,name:'合成图.png',mime:'image/png',kind:'image',url:'data:image/png;base64,'+image.toString('base64')};
    p.assets[hidden]={id:hidden,name:'未提交合成图.png',mime:'image/png',kind:'image',url:'data:image/png;base64,'+image.toString('base64')};q.attachments=[{id:aid}];q2.attachments=[{id:hidden}];p.questions=[q,q2];p.activeQuestionId=q.id;
    let raw=null;if(document){raw=crypto.randomUUID();p.assets[raw]={id:raw,name:'虚构文档.pdf',mime:'application/pdf',kind:'original',url:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4 fictional document').toString('base64')};p.sources=[{id:'source-qa',title:'虚构材料',type:'pdf',asset:p.assets[raw],paragraphs:[{text:'未明确提交的私有原文'}]}];}
    const state=await resources.importPortable(actor,p);return {...state,aid,hidden,raw};
  }
  const classA=accounts.groups.create(user,{kind:'class',name:'虚构行政班甲',inviteCode:'assignment-class-a'}),classB=accounts.groups.create(user,{kind:'class',name:'虚构行政班乙',inviteCode:'assignment-class-b'}),
    learning=accounts.groups.create(user,{kind:'learning',name:'虚构跨班探究组'});
  const alice=await student('qa-alice',classA.inviteCode),bob=await student('qa-bob',classB.inviteCode),outsider=await student('qa-outsider');
  accounts.groups.assign(user,learning.id,{userIds:[alice.id,bob.id]});
  return {directory,db,accounts,resources,tasks,teacher:user,alice,bob,outsider,classA,classB,learning,paper,student,close:()=>db.close()};
}
const reject=(promise,status)=>assert.rejects(promise,error=>error.status===status);
const throws=(action,status)=>assert.throws(action,error=>error.status===status);

test('assignment lifecycle, explicit snapshot submission, private review and persistent historical progress',async t=>{
  const env=await fixture(),{tasks,resources,teacher,alice,bob,outsider}=env;let task,studentPaper,submitted;
  try{
    await t.test('drafts and materials remain private until publish; cross-class recipients are deduplicated',async()=>{
      const material=await env.paper(teacher);
      task=await tasks.create(teacher,{title:'虚构场景搭建任务',instructions:'搭建匀强磁场中粒子运动，说明$r=mv/(qB)$。',kind:'scene',groupIds:[env.classA.id,env.learning.id],rubric:[{label:'题意一致',description:'说明已知条件与演示假设'}],
        material:{resourceId:material.paper.id,resourceVersion:material.resource.version,selection:'question',questionId:material.paper.questions[0].id}});
      assert.equal(task.status,'draft');assert.equal(tasks.list(alice).total,0);throws(()=>tasks.get(alice,task.id),404);throws(()=>tasks.material(alice,task.id),404);
      await reject(tasks.create(alice,{title:'spoof',instructions:'spoof',groupIds:[env.classA.id]}),403);
      await reject(tasks.create(teacher,{title:'bad',instructions:'bad',groupIds:[env.classA.id],status:'unknown'}),400);
      task=await tasks.update(teacher,task.id,{status:'published'},task.version);assert.equal(task.progress.total,2);assert.equal(task.progress.notSubmitted,2);
      assert.equal(tasks.list(alice).total,1);throws(()=>tasks.get(outsider,task.id),404);
      const state=tasks.material(alice,task.id);assert.equal(state.paper.questions.length,1);assert.equal(state.resource.writable,false);assert.equal(state.resource.contextType,'assignment');
      assert.equal(state.paper.assets[material.hidden],undefined);assert.equal(state.paper.assets[material.raw],undefined);
      assert.equal(state.paper.sources[0].paragraphs,undefined);assert.equal(resources.usedBytes(teacher.id)>0,true);
    });
    await t.test('a student chooses an immutable submitted subset, with structure checks and no automatic marks',async()=>{
      studentPaper=await env.paper(alice);
      throws(()=>resources.state(teacher,studentPaper.paper.id),404);
      submitted=await tasks.submit(alice,task.id,{resourceId:studentPaper.paper.id,resourceVersion:studentPaper.resource.version,selection:'scene',questionId:studentPaper.paper.questions[0].id,sceneId:studentPaper.paper.questions[0].scenes[0].id,note:'虚构说明：请检查转向'},0);
      assert.equal(submitted.submission.status,'submitted');assert.equal(submitted.submission.revision,1);assert.equal(submitted.submission.checks.sceneCount,1);
      assert.equal(submitted.submission.checks.requiresTeacherReview,true);assert.equal(submitted.submission.checks.score,undefined);
      const state=tasks.snapshotState(teacher,submitted.submission.snapshotId);assert.equal(state.paper.questions.length,1);assert.equal(state.paper.questions[0].scenes.length,1);
      assert.equal(state.paper.assets[studentPaper.raw],undefined);assert.equal(state.paper.assets[studentPaper.hidden],undefined);
      assert.match(state.paper.assets[studentPaper.aid].displayURL,/^\/api\/resources\/exam-/);assert.equal(state.resource.owned,false);
      throws(()=>tasks.snapshotState(bob,submitted.submission.snapshotId),404);throws(()=>tasks.detailSubmission(bob,task.id,submitted.submission.id),404);
      throws(()=>tasks.snapshotAsset(teacher,submitted.submission.snapshotId,studentPaper.hidden),404);
      await reject(tasks.submit(bob,task.id,{resourceId:studentPaper.paper.id,resourceVersion:1},0),404);
      assert.equal(tasks.get(teacher,task.id).assignment.progress.submitted,1);
    });
    await t.test('editing and deleting private originals cannot change the submitted material or asset',async()=>{
      const draft=clone(studentPaper.paper);draft.title='未提交的私人修改';draft.questions[0].sourceText='未公开私有内容';
      resources.update(alice,draft,studentPaper.resource.version);
      assert.equal(tasks.snapshotState(teacher,submitted.submission.snapshotId).paper.title,'虚构任务原稿');
      await resources.delete(alice,studentPaper.paper.id,studentPaper.resource.version+1);
      throws(()=>resources.state(alice,studentPaper.paper.id),404);
      const asset=tasks.snapshotAsset(teacher,submitted.submission.snapshotId,studentPaper.aid);assert.equal((await readFile(asset.path)).equals(image),true);
      const portable=await tasks.portable(teacher,submitted.submission.snapshotId);assert.match(portable.assets[studentPaper.aid].url,/^data:image\/png;base64,/);
      const injection=clone(tasks.snapshotState(teacher,submitted.submission.snapshotId).paper);injection.assets[studentPaper.hidden]={id:studentPaper.hidden,name:'spoof',mime:'image/png'};
      await reject(tasks.portable(teacher,submitted.submission.snapshotId,injection),400);await reject(tasks.fork(teacher,submitted.submission.snapshotId,injection),400);
      const fork=await tasks.fork(alice,submitted.submission.snapshotId);assert.notEqual(fork.paper.id,submitted.submission.snapshotId);assert.equal(fork.resource.writable,true);
      const edited=clone(fork.paper);edited.questions[0].sourceText='个人副本修改';resources.update(alice,edited,fork.resource.version);
      assert.notEqual(tasks.snapshotState(teacher,submitted.submission.snapshotId).paper.questions[0].sourceText,'个人副本修改');
    });
    await t.test('reviews require recipient teacher and current version, and retain each revision feedback',async()=>{
      throws(()=>tasks.review(bob,task.id,submitted.submission.id,{status:'completed',feedback:'spoof'},submitted.submission.version),403);
      throws(()=>tasks.review(teacher,task.id,submitted.submission.id,{status:'returned',feedback:'',rubricFeedback:[]},submitted.submission.version),400);
      throws(()=>tasks.review(teacher,task.id,submitted.submission.id,{status:'returned',feedback:'修改',rubricFeedback:[{id:'missing',feedback:'spoof'}]},submitted.submission.version),400);
      submitted=tasks.review(teacher,task.id,submitted.submission.id,{status:'returned',feedback:'虚构建议：请补充受力方向。',rubricFeedback:[{id:task.rubric[0].id,feedback:'演示值需标明是假设'}]},submitted.submission.version);
      assert.equal(submitted.submission.status,'returned');assert.equal(submitted.submission.rubricFeedback.length,1);
      throws(()=>tasks.review(teacher,task.id,submitted.submission.id,{status:'completed',feedback:'stale'},submitted.submission.version-1),409);
      const next=await env.paper(alice);submitted=await tasks.submit(alice,task.id,{resourceId:next.paper.id,resourceVersion:next.resource.version,selection:'scene',questionId:next.paper.questions[0].id,sceneId:next.paper.questions[0].scenes[0].id,note:'虚构修订说明'},submitted.submission.version);
      assert.equal(submitted.revisions.length,2);assert.equal(submitted.revisions[1].feedback,'虚构建议：请补充受力方向。');assert.equal(submitted.submission.feedback,'');
      submitted=tasks.review(teacher,task.id,submitted.submission.id,{status:'completed',feedback:'虚构人工评阅：本次任务已完成。'},submitted.submission.version);
      await reject(tasks.submit(alice,task.id,{resourceId:next.paper.id,resourceVersion:next.resource.version},submitted.submission.version),409);
      assert.equal(tasks.get(teacher,task.id).assignment.progress.completed,1);
    });
    await t.test('frozen enrolment explains historical progress after class transfers and explicit new-member refresh',async()=>{
      env.accounts.groups.removeMember(teacher,env.learning.id,alice.id);env.accounts.groups.assign(teacher,env.classB.id,{userIds:[alice.id]});
      const detail=tasks.get(teacher,task.id);assert.equal(detail.assignment.progress.total,2);assert.equal(detail.students.find(student=>student.id===alice.id).className,'虚构行政班甲');
      assert.equal(tasks.get(alice,task.id).assignment.groups.some(group=>group.id===env.classA.id),true);
      throws(()=>tasks.get(outsider,task.id),404);
      const newcomer=await env.student('qa-newcomer',env.classA.inviteCode);assert.equal(tasks.list(newcomer).total,0);
      task=await tasks.update(teacher,task.id,{refreshRecipients:true},task.version);assert.equal(task.progress.total,3);assert.equal(tasks.list(newcomer).total,1);
      await reject(tasks.update(teacher,task.id,{groupIds:[env.classB.id]},task.version),400);
      await reject(tasks.update(teacher,task.id,{title:'stale'},task.version-1),409);
      task=await tasks.update(teacher,task.id,{status:'archived'},task.version);const p=await env.paper(bob);await reject(tasks.submit(bob,task.id,{resourceId:p.paper.id,resourceVersion:p.resource.version},0),409);
      assert.equal(tasks.snapshotState(teacher,submitted.submission.snapshotId).paper.questions.length,1);
    });
    await t.test('restart preserves assignment state, roster, revisions and independent files',async()=>{
      const restarted=new Assignments(env.db,resources);await restarted.cleanupPending();const detail=restarted.detailSubmission(alice,task.id,submitted.submission.id);
      assert.equal(detail.submission.status,'completed');assert.equal(detail.revisions.length,2);assert.equal(restarted.get(teacher,task.id).assignment.progress.total,3);
      assert.equal(restarted.snapshotState(teacher,detail.revisions[1].snapshotId).paper.questions.length,1);
      const outsiderId='user-'+crypto.randomUUID(),hash=await hashPassword('Other-test-2026');
      env.db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(outsiderId,'qa-other-teacher','虚构其他教师',hash,'teacher',new Date().toISOString());
      throws(()=>restarted.get({id:outsiderId,role:'teacher'},task.id),404);throws(()=>restarted.snapshotState({id:outsiderId,role:'teacher'},submitted.submission.snapshotId),404);
    });
  }finally{env.close();}
});

test('deadlines, document opt-in, submission idempotency and simultaneous CAS prevent accidental duplicate snapshots',async()=>{
  const env=await fixture();try{
    const {tasks,teacher,alice}=env,p=await env.paper(alice),input={resourceId:p.paper.id,resourceVersion:p.resource.version,includeOriginals:true,requestId:crypto.randomUUID()};
    let task=await tasks.create(teacher,{title:'虚构文档任务',instructions:'上传材料并解释其来源',kind:'document',groupIds:[env.classA.id],status:'published',dueAt:new Date(Date.now()-60000).toISOString(),allowLate:false});
    await reject(tasks.submit(alice,task.id,input,0),409);assert.equal(env.db.prepare('SELECT count(*) AS n FROM assignment_snapshots').get().n,0);
    task=await tasks.update(teacher,task.id,{allowLate:true},task.version);
    await reject(tasks.submit(alice,task.id,{...input,includeOriginals:false},0),400);
    const first=await tasks.submit(alice,task.id,input,0);assert.equal(first.submission.late,true);assert.equal(tasks.snapshotState(teacher,first.submission.snapshotId).resource.originalFiles.length,1);
    const retried=await tasks.submit(alice,task.id,input,0);assert.equal(retried.submission.id,first.submission.id);assert.equal(retried.submission.revision,1);
    await reject(tasks.submit(alice,task.id,{...input,note:'changed'},first.submission.version),409);
    const both=await Promise.allSettled([tasks.submit(alice,task.id,{...input,requestId:crypto.randomUUID(),note:'A'},first.submission.version),tasks.submit(alice,task.id,{...input,requestId:crypto.randomUUID(),note:'B'},first.submission.version)]);
    assert.equal(both.filter(result=>result.status==='fulfilled').length,1);assert.equal(both.filter(result=>result.status==='rejected'&&result.reason.status===409).length,1);
    assert.equal(env.db.prepare('SELECT count(*) AS n FROM assignment_snapshots').get().n,2);
    assert.equal(tasks.get(teacher,task.id).assignment.progress.late,1);
  }finally{env.close();}
});

test('snapshot JSON and attachments consume normal account quota; failed copies and interrupted staging do not become readable',async()=>{
  const env=await fixture();try{
    const {tasks,resources,teacher,alice}=env,p=await env.paper(alice),task=await tasks.create(teacher,{title:'虚构容量测试',instructions:'仅用合成资料验收',kind:'scene',groupIds:[env.classA.id],status:'published'});
    const before=resources.usedBytes(alice.id);resources.quotaBytes=before+100;
    await reject(tasks.submit(alice,task.id,{resourceId:p.paper.id,resourceVersion:p.resource.version},0),413);
    assert.equal(env.db.prepare('SELECT count(*) AS n FROM assignment_snapshots').get().n,0);
    resources.quotaBytes=500*1024*1024;
    const submission=await tasks.submit(alice,task.id,{resourceId:p.paper.id,resourceVersion:p.resource.version,selection:'scene',questionId:p.paper.questions[0].id,sceneId:p.paper.questions[0].scenes[0].id},0);
    const storage=env.db.prepare('SELECT bytes,paper_json FROM assignment_snapshots WHERE id=?').get(submission.submission.snapshotId);
    const meta=env.db.prepare('SELECT note,checks_json,rubric_json,requirements_json FROM assignment_submission_revisions WHERE snapshot_id=?').get(submission.submission.snapshotId);
    assert.equal(storage.bytes,image.length+Buffer.byteLength(storage.paper_json,'utf8')+Object.values(meta).reduce((n,value)=>n+Buffer.byteLength(value,'utf8'),0));assert.equal(resources.usedBytes(alice.id),before+storage.bytes);
    resources.quotaBytes=resources.usedBytes(alice.id)+image.length-1;
    await reject(env.paper(alice,{document:false}),413);
    const leftover='exam-'+crypto.randomUUID(),folder=resources.files.folder(leftover);await mkdir(folder,{recursive:true});await writeFile(join(folder,'.assignment-pending'),'synthetic interrupted copy');await writeFile(join(folder,'partial'),'data');
    assert.equal(tasks.hasSnapshot(leftover),false);throws(()=>tasks.snapshotState(teacher,leftover),404);const cleanup=await tasks.cleanupPending();assert.equal(cleanup.cleaned,1);await assert.rejects(stat(folder),{code:'ENOENT'});
    resources.quotaBytes=500*1024*1024;
    const old=env.db.prepare('SELECT revision FROM assignment_submissions WHERE id=?').get(submission.submission.id).revision;
    env.db.prepare('UPDATE assignment_submissions SET revision=20 WHERE id=?').run(submission.submission.id);
    await reject(tasks.submit(alice,task.id,{resourceId:p.paper.id,resourceVersion:p.resource.version},submission.submission.version),413);
    env.db.prepare('UPDATE assignment_submissions SET revision=? WHERE id=?').run(old,submission.submission.id);
  }finally{env.close();}
});

test('teacher material changes retain precisely referenced historical materials, and task policy is authoritative',async()=>{
  const env=await fixture();try{
    const {tasks,teacher,alice,bob}=env,material=await env.paper(teacher),student=await env.paper(alice);
    let task=await tasks.create(teacher,{title:'虚构历史材料任务',instructions:'第一版要求',kind:'scene',groupIds:[env.learning.id],status:'published',aiPolicy:'hints',
      material:{resourceId:material.paper.id,resourceVersion:material.resource.version,selection:'question',questionId:material.paper.questions[0].id}});
    assert.equal(tasks.taskPolicy(alice,task.id).aiPolicy,'hints');throws(()=>tasks.taskPolicy(env.outsider,task.id),404);
    const originalMaterialId=task.materialId,submitted=await tasks.submit(alice,task.id,{resourceId:student.paper.id,resourceVersion:student.resource.version},0);
    assert.equal(submitted.submission.requirements.materialId,originalMaterialId);
    const updated=clone(material.paper);updated.title='第二版材料';env.resources.update(teacher,updated,material.resource.version);
    task=await tasks.update(teacher,task.id,{instructions:'第二版要求',aiPolicy:'disabled',material:{resourceId:material.paper.id,resourceVersion:material.resource.version+1}},task.version);
    assert.notEqual(task.materialId,originalMaterialId);assert.equal(tasks.taskPolicy(alice,task.id).aiPolicy,'disabled');
    assert.equal(tasks.snapshotState(alice,originalMaterialId).paper.questions.length,1);throws(()=>tasks.snapshotState(bob,originalMaterialId),404);
    await tasks.cleanupPending();assert.equal(tasks.hasSnapshot(originalMaterialId),true);
    const history=tasks.detailSubmission(alice,task.id,submitted.submission.id);assert.equal(history.submission.requirements.instructions,'第一版要求');assert.equal(history.submission.requirements.aiPolicy,'hints');
    task=await tasks.update(teacher,task.id,{material:null},task.version);assert.equal(task.materialId,null);assert.equal(tasks.hasSnapshot(originalMaterialId),true);
    await reject(tasks.update(teacher,task.id,{aiPolicy:'spoof'},task.version),400);
  }finally{env.close();}
});

test('archive, deadline, requirements and private-resource changes during asynchronous copying reject obsolete submissions',async()=>{
  const env=await fixture();try{
    const {tasks,resources,teacher,alice}=env,p=await env.paper(alice);let resourceVersion=p.resource.version;
    for(const change of ['archive','deadline','requirements','resource']){
      const task=await tasks.create(teacher,{title:'虚构竞态-'+change,instructions:'原要求',kind:'scene',groupIds:[env.classA.id],status:'published'}),baseline=env.db.prepare('SELECT count(*) AS n FROM assignment_snapshots').get().n;
      let signalEntered,release;const entered=new Promise(resolve=>signalEntered=resolve),gate=new Promise(resolve=>release=resolve),copy=tasks.copyAsset;
      let first=true;tasks.copyAsset=async function(...args){if(first){first=false;signalEntered();await gate;}return copy.apply(this,args);};
      const pending=tasks.submit(alice,task.id,{resourceId:p.paper.id,resourceVersion},0);const rejected=assert.rejects(pending,error=>error.status===409);
      try{
        await entered;
        if(change==='resource'){const edited=clone(resources.state(alice,p.paper.id).paper);edited.title='并发修改原稿';resources.update(alice,edited,resourceVersion);resourceVersion++;}
        else await tasks.update(teacher,task.id,change==='archive'?{status:'archived'}:change==='deadline'?{dueAt:new Date(Date.now()-1000).toISOString(),allowLate:false}:{instructions:'并发更新的要求'},task.version);
      }finally{release();tasks.copyAsset=copy;}
      await rejected;
      assert.equal(env.db.prepare('SELECT count(*) AS n FROM assignment_snapshots').get().n,baseline);assert.equal(tasks.get(teacher,task.id).assignment.progress.submitted,0);
    }
  }finally{env.close();}
});

test('real database reopen retains task snapshots, bundle exports and attributed private copies',async()=>{
  const env=await fixture();let reopened,closed=false;try{
    const p=await env.paper(env.teacher);let task=await env.tasks.create(env.teacher,{title:'虚构重启任务',instructions:'说明$r=mv/(qB)$',kind:'scene',groupIds:[env.classA.id],status:'published',
      material:{resourceId:p.paper.id,resourceVersion:p.resource.version}});
    const copied=await env.tasks.fork(env.alice,task.materialId);assert.equal(copied.resource.origin.author,env.db.prepare('SELECT display_name FROM users WHERE id=?').get(env.teacher.id).display_name);assert.equal(copied.resource.origin.title,p.paper.title);assert(!copied.resource.origin.title.includes(task.title));
    const submitted=await env.tasks.submit(env.alice,task.id,{resourceId:copied.paper.id,resourceVersion:copied.resource.version},0);
    assert.equal(env.tasks.snapshotState(env.teacher,submitted.submission.snapshotId).resource.origin.title,copied.resource.origin.title);
    env.close();closed=true;reopened=await openDatabase(env.directory);const resources=new Resources(reopened,env.directory),tasks=new Assignments(reopened,resources);await tasks.cleanupPending();
    assert.equal(tasks.get(env.alice,task.id).assignment.submission.id,submitted.submission.id);assert.equal(tasks.get(env.teacher,task.id).assignment.progress.submitted,1);
    const exported=await tasks.export(env.teacher,submitted.submission.snapshotId,{kind:'bundle'},resolve('dist/exam'));assert.equal(exported.mime,'application/zip');assert.equal(exported.content[0],0x50);assert.equal(exported.content[1],0x4b);
    const imageAsset=tasks.snapshotAsset(env.teacher,submitted.submission.snapshotId,p.aid);assert.equal((await readFile(imageAsset.path)).equals(image),true);
  }finally{if(!closed)env.close();reopened?.close();}
});

test('HTTP assignment endpoints enforce sessions, CSRF, scoped snapshot reads, downloads, immutable writes and durable notifications',async()=>{
  const {createExamServer}=await import('../server/exam/http.mjs'),{createServer}=await import('node:net');
  const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const dataDir=await mkdtemp(join(tmpdir(),'tijing-assignment-http-')),origin='http://127.0.0.1:'+port,options={dataDir,resourceDir:resolve('dist/exam'),publicOrigin:origin,adminUsername:'qa-http-teacher',adminPassword:'Teacher-http-2026',inviteCode:'assignment-http-legacy',aiEnv:{}};
  let app=await createExamServer(options);await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));
  async function api(actor,path,method='GET',body,version,csrf=true){
    const headers={Origin:origin};if(actor){headers.Cookie=actor.cookie;if(csrf&&method!=='GET'&&method!=='HEAD')headers['X-CSRF-Token']=actor.csrf;}
    if(body!==undefined)headers['Content-Type']='application/json';if(version!==undefined)headers['X-Resource-Version']=String(version);
    const response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),bytes=Buffer.from(await response.arrayBuffer()),isJSON=(response.headers.get('content-type')||'').includes('application/json');
    return {status:response.status,value:isJSON?JSON.parse(bytes.toString()):bytes,headers:response.headers};
  }
  const actor=result=>({user:result.value.user,cookie:result.headers.get('set-cookie').split(';')[0],csrf:result.value.csrf});
  try{
    assert.equal((await api(null,'/api/assignments')).status,401);
    const login=await api(null,'/api/auth/login','POST',{username:'qa-http-teacher',password:'Teacher-http-2026'});assert.equal(login.status,200);const teacher=actor(login);
    const classA=(await api(teacher,'/api/groups','POST',{kind:'class',name:'虚构HTTP任务行政班',inviteCode:'http-task-class'})).value;
    const alice=actor(await api(null,'/api/auth/register','POST',{username:'qa-http-alice',displayName:'虚构HTTP学生',password:'Student-http-2026',inviteCode:classA.inviteCode})),
      bob=actor(await api(null,'/api/auth/register','POST',{username:'qa-http-bob',displayName:'虚构HTTP范围外学生',password:'Student-http-2026',inviteCode:'assignment-http-legacy'}));
    const paper=newPaper('虚构HTTP场景'),q=newQuestion('虚构HTTP题目','说明 $F=qvB$'),assetId=crypto.randomUUID();q.scenes=[newScene('合成轨迹','lesson:ex2')];q.activeSceneId=q.scenes[0].id;q.attachments=[{id:assetId}];
    paper.questions=[q];paper.activeQuestionId=q.id;paper.assets[assetId]={id:assetId,name:'合成图片.png',mime:'image/png',kind:'image',url:'data:image/png;base64,'+image.toString('base64')};
    const imported=await api(alice,'/api/import','POST',{filename:'synthetic.json',data:Buffer.from(JSON.stringify(paper)).toString('base64')});assert.equal(imported.status,201);
    assert.equal((await api(teacher,'/api/assignments','POST',{title:'bad',instructions:'bad',groupIds:[classA.id]},undefined,false)).status,403);
    const created=await api(teacher,'/api/assignments','POST',{title:'虚构HTTP任务',instructions:'构建场景并说明关系',kind:'scene',groupIds:[classA.id],status:'published',aiPolicy:'hints'});assert.equal(created.status,201);const task=created.value;
    assert.equal((await api(bob,'/api/assignments/'+task.id)).status,404);assert.equal((await api(alice,'/api/assignments/'+task.id)).status,200);
    const submitted=await api(alice,'/api/assignments/'+task.id+'/submissions','POST',{resourceId:imported.value.resource.id,resourceVersion:imported.value.resource.version,requestId:crypto.randomUUID()},0);assert.equal(submitted.status,201);const submission=submitted.value.submission;
    const state=await api(teacher,'/api/resources/'+submission.snapshotId);assert.equal(state.status,200);assert.equal(state.value.resource.assignmentSnapshot,true);assert.equal(state.value.resource.writable,false);
    assert.equal((await api(teacher,'/api/resources/'+imported.value.resource.id)).status,404);
    assert.equal((await api(bob,'/api/resources/'+submission.snapshotId)).status,404);assert.equal((await api(bob,'/api/assignments/'+task.id+'/submissions/'+submission.id)).status,404);
    const imagePath=state.value.paper.assets[assetId].displayURL,imageResponse=await api(teacher,imagePath);assert.equal(imageResponse.status,200);assert.equal(imageResponse.value.equals(image),true);
    const head=await api(alice,imagePath,'HEAD');assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),image.length);
    assert.equal((await api(bob,imagePath)).status,404);
    for(const [action,method,body] of [['','PUT',{paper:state.value.paper}],['','DELETE'],['/publish','POST',{}],['/documents','POST',{}],['/image','POST',{}]])assert.equal((await api(alice,'/api/resources/'+submission.snapshotId+action,method,body,1)).status,403);
    const zipped=await api(alice,'/api/resources/'+submission.snapshotId+'/export','POST',{kind:'bundle'});assert.equal(zipped.status,200);assert.equal(zipped.value.subarray(0,2).toString(),'PK');
    const feedback=await api(teacher,'/api/assignments/'+task.id+'/submissions/'+submission.id,'PUT',{status:'completed',feedback:'虚构人工评阅完成'},submission.version);assert.equal(feedback.status,200);
    assert.equal((await api(alice,'/api/assignments/'+task.id)).value.assignment.submission.status,'completed');
    const notices=(await api(alice,'/api/notifications')).value.notifications;assert(notices.some(notice=>notice.type==='assignment'&&notice.kind==='assignment-published'));assert(notices.some(notice=>notice.kind==='assignment-reviewed'));
    assert.equal((await api(bob,'/api/notifications')).value.notifications.some(notice=>notice.targetId===task.id),false);
    await app.close();app=await createExamServer(options);await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));
    assert.equal((await api(alice,'/api/assignments/'+task.id)).value.assignment.submission.status,'completed');assert.equal((await api(teacher,imagePath)).value.equals(image),true);
  }finally{await app.close();}
});

test('selected question or scene cannot reveal unrelated private source filenames, paragraphs or originals',async()=>{
  const env=await fixture();try{
    const {tasks,teacher,alice,resources}=env,p=await env.paper(alice),paper=clone(p.paper);
    paper.questions[0].sourceId=paper.sources[0].id;
    const privateAsset=await resources.writeAsset(paper.id,Buffer.from('%PDF-1.4 unrelated private source'),{name:'虚构未提交班务资料.pdf',mime:'application/pdf',kind:'original'}),privateSourceId='private-source-'+crypto.randomUUID();
    paper.assets[privateAsset.id]=privateAsset;paper.sources.push({id:privateSourceId,title:'虚构未提交班务资料',type:'pdf',asset:privateAsset,paragraphs:[{text:'未提交来源私有文字'}]});paper.questions[1].sourceId=privateSourceId;
    const saved=resources.update(alice,paper,p.resource.version,[privateAsset]);
    const task=await tasks.create(teacher,{title:'虚构来源隐私任务',instructions:'只提交第一个场景',kind:'scene',groupIds:[env.classA.id],status:'published'});
    const input={resourceId:paper.id,resourceVersion:saved.version,selection:'scene',questionId:paper.questions[0].id,sceneId:paper.questions[0].scenes[0].id};
    let submitted=await tasks.submit(alice,task.id,input,0),opened=tasks.snapshotState(teacher,submitted.submission.snapshotId);
    assert.equal(opened.paper.sources.length,1);assert.equal(opened.paper.sources[0].id,paper.sources[0].id);assert.equal(JSON.stringify(opened).includes('未提交班务资料'),false);assert.equal(opened.paper.assets[privateAsset.id],undefined);
    submitted=await tasks.submit(alice,task.id,{...input,includeOriginals:true},submitted.submission.version);opened=tasks.snapshotState(teacher,submitted.submission.snapshotId);
    assert.equal(opened.resource.originalFiles.length,1);assert.equal(opened.resource.originalFiles[0].id,p.raw);assert.equal(JSON.stringify(opened).includes('未提交班务资料'),false);
    throws(()=>tasks.snapshotAsset(teacher,submitted.submission.snapshotId,privateAsset.id),404);
    const unlinked=clone(resources.state(alice,paper.id).paper);delete unlinked.questions[0].sourceId;const changed=resources.update(alice,unlinked,saved.version);
    submitted=await tasks.submit(alice,task.id,{...input,resourceVersion:changed.version,includeOriginals:true},submitted.submission.version);opened=tasks.snapshotState(teacher,submitted.submission.snapshotId);
    assert.equal(opened.paper.sources.length,0);assert.equal(opened.resource.originalFiles.length,0);
  }finally{env.close();}
});

test('malformed rubric rows are client errors and normalized submission notes are billed as stored',async()=>{
  const env=await fixture();try{
    const {tasks,teacher,alice,resources}=env;
    await reject(tasks.create(teacher,{title:'虚构输入校验任务',instructions:'核对输入',groupIds:[env.classA.id],rubric:[null]}),400);
    const task=await tasks.create(teacher,{title:'虚构规范说明任务',instructions:'按条件解释轨迹',kind:'scene',groupIds:[env.classA.id],status:'published',rubric:[{label:'解释'}]}),p=await env.paper(alice);
    const submitted=await tasks.submit(alice,task.id,{resourceId:p.paper.id,resourceVersion:p.resource.version,note:'   虚构说明   '},0);
    assert.equal(submitted.submission.note,'虚构说明');
    const storage=env.db.prepare('SELECT bytes,paper_json,origin_json FROM assignment_snapshots WHERE id=?').get(submitted.submission.snapshotId),revision=env.db.prepare('SELECT note,checks_json,rubric_json,requirements_json FROM assignment_submission_revisions WHERE snapshot_id=?').get(submitted.submission.snapshotId);
    const paper=JSON.parse(storage.paper_json),actual=Object.values(paper.assets).reduce((n,asset)=>n+asset.bytes,0)+Buffer.byteLength(storage.paper_json,'utf8')+Object.values(revision).reduce((n,value)=>n+Buffer.byteLength(value,'utf8'),0);
    assert.equal(storage.bytes,actual);
    throws(()=>tasks.review(teacher,task.id,submitted.submission.id,{status:'returned',feedback:'虚构反馈',rubricFeedback:[null]},submitted.submission.version),400);
  }finally{env.close();}
});

test('private task drafts keep owner-only task links, inherit on copies and never leak assignment context to public audiences',async()=>{
  const env=await fixture();try{
    const {tasks,teacher,alice,bob,resources}=env,material=await env.paper(teacher),task=await tasks.create(teacher,{title:'虚构关联原稿任务',instructions:'独立搭建并说明',kind:'scene',groupIds:[env.learning.id],status:'published',aiPolicy:'hints',
      material:{resourceId:material.paper.id,resourceVersion:material.resource.version}}),copy=await tasks.fork(alice,task.materialId);
    assert.equal(copy.resource.contextType,'assignment-draft');assert.equal(copy.resource.assignmentId,task.id);assert.equal(copy.resource.aiPolicy,'hints');assert.equal(copy.resource.writable,true);
    assert.equal(tasks.resourceContext(bob,copy.paper.id),null);assert.equal(tasks.resourceContext(teacher,copy.paper.id),null);
    const forked=await resources.fork(alice,copy.paper.id),inherited=tasks.inheritResourceContext(alice,copy.paper.id,forked.paper.id);assert.equal(inherited.resource.assignmentId,task.id);assert.deepEqual(inherited.resource.origin,copy.resource.origin);
    const second=await tasks.create(teacher,{title:'虚构其他关联任务',instructions:'另一任务',groupIds:[env.learning.id],status:'published'});throws(()=>tasks.linkResource(alice,second.id,copy.paper.id),409);
    throws(()=>tasks.linkResource(teacher,task.id,copy.paper.id),404);
    const {Workshop}=await import('../server/exam/workshop.mjs'),workshop=new Workshop(env.db,resources),post=workshop.publish(alice,{resourceId:copy.paper.id,title:'虚构公开关联场景',category:'scene',selection:'scene',questionId:copy.paper.questions[0].id,sceneId:copy.paper.questions[0].scenes[0].id},copy.resource.version);
    const publicCopy=workshop.state(bob,post.id);assert.equal(publicCopy.resource.assignmentId,undefined);assert.equal(publicCopy.resource.contextType,undefined);assert.equal(publicCopy.resource.aiPolicy,undefined);assert.equal(JSON.stringify(publicCopy).includes(task.title),false);assert.equal(JSON.stringify(workshop.describe(bob,workshop.row(post.id))).includes(task.title),false);
    let updatedTask=await tasks.update(teacher,task.id,{aiPolicy:'disabled'},task.version);assert.equal(resources.state(alice,copy.paper.id).resource.aiPolicy,'disabled');
    updatedTask=await tasks.update(teacher,task.id,{status:'archived'},updatedTask.version);assert.equal(resources.state(alice,copy.paper.id).resource.assignmentId,task.id);
    const rowsBefore=env.db.prepare('SELECT count(*) AS n FROM assignment_resource_links').get().n;await resources.delete(alice,forked.paper.id,forked.resource.version);assert.equal(env.db.prepare('SELECT count(*) AS n FROM assignment_resource_links').get().n,rowsBefore-1);
  }finally{env.close();}
});

test('teacher task materials exclude reference solutions by default and only include them after explicit opt-in; student analysis remains submitted',async()=>{
  const env=await fixture();try{
    const {tasks,resources,teacher,alice}=env,p=await env.paper(teacher),paper=clone(p.paper),q=paper.questions[0];
    q.sourceText='题设条件必须保留：m、q、v、B。';q.referenceText='私有参考解析：先计算完整答案。';q.parts=['(1)分析题干的小问'];q.notes=[{kind:'unknown',text:'条件尚待核对'},{kind:'limitation',text:'题图信息待检查'},{kind:'answer',text:'答案专属笔记'},{kind:'solution',text:'解答专属笔记'}];q.scenes[0].note='场景说明应保留：先播放观察轨迹。';
    const saved=resources.update(teacher,paper,p.resource.version),input={resourceId:paper.id,resourceVersion:saved.version,selection:'question',questionId:q.id};
    await reject(tasks.create(teacher,{title:'虚构错误选项任务',instructions:'测试参数',kind:'scene',groupIds:[env.classA.id],material:{...input,includeSolutions:'true'}}),400);
    let task=await tasks.create(teacher,{title:'虚构默认无解析任务',instructions:'学生独立观察并解释',kind:'scene',groupIds:[env.classA.id],status:'published',material:input});
    const oldMaterial=task.materialId,opened=tasks.material(alice,task.id),materialQuestion=opened.paper.questions[0];
    assert.equal(materialQuestion.referenceText,'');assert.equal(JSON.stringify(opened).includes('答案专属笔记'),false);assert.equal(JSON.stringify(opened).includes('解答专属笔记'),false);
    assert.equal(materialQuestion.sourceText,q.sourceText);assert.deepEqual(materialQuestion.parts,q.parts);assert.equal(materialQuestion.scenes[0].note,q.scenes[0].note);assert.equal(materialQuestion.notes.length,2);
    assert.equal(resources.state(teacher,paper.id).paper.questions[0].referenceText,q.referenceText);
    const student=await env.paper(alice),studentDraft=clone(student.paper);studentDraft.questions[0].referenceText='学生自己的自编解析：供教师人工评阅。';studentDraft.questions[0].notes.push({kind:'answer',text:'学生自己的答案笔记'});
    const studentSaved=resources.update(alice,studentDraft,student.resource.version),submission=await tasks.submit(alice,task.id,{resourceId:student.paper.id,resourceVersion:studentSaved.version,includeSolutions:false},0);
    assert.equal(tasks.snapshotState(teacher,submission.submission.snapshotId).paper.questions[0].referenceText,studentDraft.questions[0].referenceText);
    assert.equal(tasks.snapshotState(teacher,submission.submission.snapshotId).paper.questions[0].notes.some(note=>note.kind==='answer'),true);
    task=await tasks.update(teacher,task.id,{material:{...input,includeSolutions:true}},task.version);assert.notEqual(task.materialId,oldMaterial);
    assert.equal(tasks.material(alice,task.id).paper.questions[0].referenceText,q.referenceText);assert.equal(tasks.material(alice,task.id).paper.questions[0].notes.length,4);
    assert.equal(tasks.snapshotState(alice,oldMaterial).paper.questions[0].referenceText,'');assert.equal(tasks.detailSubmission(alice,task.id,submission.submission.id).submission.requirements.materialId,oldMaterial);
    await tasks.cleanupPending();assert.equal(tasks.hasSnapshot(oldMaterial),true);
  }finally{env.close();}
});
