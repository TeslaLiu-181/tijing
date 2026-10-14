import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer as portProbe} from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {createExamServer} from '../server/exam/http.mjs';
import {hashPassword} from '../server/exam/auth.mjs';
import {newPaper,newQuestion,newScene,clone} from '../src/exam/model.mjs';

const image=await sharp({create:{width:24,height:24,channels:3,background:'#fff'}}).png().toBuffer();
async function freePort(){const probe=portProbe();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port;}
function paperFixture(){
  const paper=newPaper('虚构分层资源'),images=[];
  for(let i=0;i<2;i++){const q=newQuestion('虚构题'+(i+1),'给定L、m、q；仅用于测试。');q.scenes=[newScene('原题场景','lesson:ex2')];q.activeSceneId=q.scenes[0].id;const id=crypto.randomUUID();paper.assets[id]={id,name:'合成题图'+i+'.png',mime:'image/png',kind:'image',url:'data:image/png;base64,'+image.toString('base64')};q.attachments=[{id}];paper.questions.push(q);images.push(id);}
  const raw=crypto.randomUUID();paper.assets[raw]={id:raw,name:'虚构原文档.pdf',mime:'application/pdf',kind:'original',url:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4 fictional source').toString('base64')};
  paper.sources=[{id:'source-test',title:'虚构材料',type:'pdf',asset:paper.assets[raw],paragraphs:[{text:'完整原文不默认公开'}]}];
  paper.activeQuestionId=paper.questions[0].id;return {paper,images,raw};
}
async function environment(){
  const data=await mkdtemp(join(tmpdir(),'tijing-community-test-')),port=await freePort(),origin='http://127.0.0.1:'+port;
  const options={dataDir:data,resourceDir:resolve('dist/exam'),publicOrigin:origin,adminUsername:'qa-teacher',adminPassword:'Teacher-test-2026',inviteCode:'legacy-test-invite'};
  let app=await createExamServer(options);await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));
  async function api(actor,path,method='GET',body,version){
    const headers={Origin:origin};if(actor){headers.Cookie=actor.cookie;if(method!=='GET')headers['X-CSRF-Token']=actor.csrf;}if(body!==undefined)headers['Content-Type']='application/json';if(version!==undefined)headers['X-Resource-Version']=String(version);
    const response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),text=await response.text();
    return {status:response.status,value:(response.headers.get('content-type')||'').includes('application/json')?JSON.parse(text):text,headers:response.headers};
  }
  const actor=result=>({user:result.value.user,csrf:result.value.csrf,cookie:result.headers.get('set-cookie').split(';')[0]});
  async function login(name,password){const result=await api(null,'/api/auth/login','POST',{username:name,password});assert.equal(result.status,200);return actor(result);}
  async function register(name,inviteCode='legacy-test-invite'){const result=await api(null,'/api/auth/register','POST',{username:name,password:'Student-test-2026',displayName:'虚构学生-'+name,inviteCode,role:'teacher',classId:'spoof'});assert.equal(result.status,200);return actor(result);}
  async function importPaper(user){const fixture=paperFixture(),result=await api(user,'/api/import','POST',{filename:'fixture.json',data:Buffer.from(JSON.stringify(fixture.paper)).toString('base64')});assert.equal(result.status,201);return {...result.value,...fixture};}
  return {get app(){return app;},data,api,login,register,importPaper,async restart(){await app.close();app=await createExamServer(options);await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));},close:()=>app.close()};
}

test('administrative classes, cross-class groups, targeted sharing, creativity and feedback',async t=>{
  const env=await environment(),{api}=env;
  let teacher,alice,bob,classA,classB,learning,shared,publicState,post,remix,feedback,outsider;
  try{
    teacher=await env.login('qa-teacher','Teacher-test-2026');alice=await env.register('qa-alice');bob=await env.register('qa-bob');
    await t.test('legacy enrolment preserves access but never guesses an administrative class',async()=>{
      const list=await api(teacher,'/api/groups');assert.equal(list.status,200);assert.equal(list.value.pendingClassCount,2);assert.equal(list.value.groups.filter(group=>group.kind==='class').length,0);
      const mine=await api(alice,'/api/groups');assert.equal(mine.value.administrativeClass,null);assert(mine.value.groups.some(group=>group.legacy));assert.equal(alice.user.role,'student');
    });
    await t.test('teachers create classes and groups; students cannot change their own class',async()=>{
      classA=(await api(teacher,'/api/groups','POST',{kind:'class',name:'虚构行政班甲',inviteCode:'class-a-test'})).value;
      classB=(await api(teacher,'/api/groups','POST',{kind:'class',name:'虚构行政班乙',inviteCode:'class-b-test'})).value;
      learning=(await api(teacher,'/api/groups','POST',{kind:'learning',name:'虚构跨班探究组'})).value;
      assert.equal((await api(alice,'/api/groups','POST',{kind:'class',name:'spoof'})).status,403);
      assert.equal((await api(teacher,'/api/groups/'+classA.id+'/members','POST',{userIds:[alice.user.id]})).status,200);
      assert.equal((await api(teacher,'/api/groups/'+classB.id+'/members','POST',{userIds:[bob.user.id]})).status,200);
      assert.equal((await api(alice,'/api/students/'+alice.user.id,'PUT',{classId:classB.id})).status,403);
      assert.equal((await api(alice,'/api/groups/'+classB.id+'/members','POST',{userIds:[alice.user.id]})).status,403);
      assert.equal((await api(teacher,'/api/groups/'+classA.id+'/members/'+alice.user.id,'DELETE')).status,400);
      assert.equal((await api(alice,'/api/groups')).value.administrativeClass.id,classA.id);
      const fresh=await env.register('qa-invited','class-a-test');assert.equal((await api(fresh,'/api/groups')).value.administrativeClass.id,classA.id);
    });
    await t.test('cross-class groups coexist with one hard class assignment and reject stale metadata',async()=>{
      assert.equal((await api(teacher,'/api/groups/'+learning.id+'/members','POST',{userIds:[alice.user.id,bob.user.id]})).status,200);
      assert.equal((await api(alice,'/api/groups')).value.administrativeClass.id,classA.id);assert.equal((await api(bob,'/api/groups')).value.administrativeClass.id,classB.id);
      assert.equal((await api(teacher,'/api/students/'+alice.user.id,'PUT',{classId:learning.id})).status,400);
      const changed=await api(teacher,'/api/groups/'+learning.id,'PUT',{name:'虚构跨班合作组'},learning.version);assert.equal(changed.status,200);
      assert.equal((await api(teacher,'/api/groups/'+learning.id,'PUT',{name:'stale'},learning.version)).status,409);learning=changed.value;
      const groupList=(await api(alice,'/api/groups')).value.groups;assert(groupList.some(group=>group.id===learning.id));assert(!JSON.stringify(groupList).includes('inviteCode'));
    });
    await t.test('targeted papers and their images remain inaccessible outside recipient classes',async()=>{
      const imported=await env.importPaper(teacher);shared={...imported,paper:(await api(teacher,'/api/resources/'+imported.resource.id)).value.paper};
      const pub=await api(teacher,'/api/resources/'+shared.paper.id+'/publish','POST',{groupIds:[classA.id],includeReference:false},shared.resource.version);assert.equal(pub.status,200);
      assert.equal((await api(alice,'/api/resources/'+shared.paper.id)).status,200);
      for(const [path,method,body] of [['','GET'],['/assets/'+shared.images[0],'GET'],['/export','POST',{kind:'html'}],['/fork','POST',{}]])assert.equal((await api(bob,'/api/resources/'+shared.paper.id+path,method,body)).status,404);
      const current=(await api(teacher,'/api/resources/'+shared.paper.id)).value;
      assert.equal((await api(teacher,'/api/resources/'+shared.paper.id+'/publish','POST',{groupIds:[]},current.resource.version)).status,400);
      const result=await api(teacher,'/api/resources/'+shared.paper.id+'/publish','POST',{groupIds:[learning.id]},current.resource.version);assert.equal(result.status,200);assert.equal((await api(bob,'/api/resources/'+shared.paper.id)).status,200);
    });
    await t.test('student work publishes explicit snapshots, without default original documents',async()=>{
      const imported=await env.importPaper(alice);publicState=(await api(alice,'/api/resources/'+imported.resource.id)).value;publicState.images=imported.images;publicState.raw=imported.raw;
      const result=await api(alice,'/api/workshop','POST',{resourceId:publicState.paper.id,title:'虚构公开场景',category:'scene',selection:'scene',questionId:publicState.paper.questions[0].id,sceneId:publicState.paper.questions[0].scenes[0].id,description:'自建作品，仅用于测试'},publicState.resource.version);
      assert.equal(result.status,201);post=result.value;const opened=await api(bob,'/api/workshop/'+post.id);assert.equal(opened.status,200);assert.equal(opened.value.paper.questions.length,1);assert.equal(opened.value.resource.writable,false);
      assert.equal(opened.value.paper.assets[publicState.raw],undefined);assert.equal(opened.value.paper.sources[0].paragraphs,undefined);
      assert.equal((await api(bob,'/api/resources/'+publicState.paper.id+'/assets/'+publicState.images[1]+'?view=workshop')).status,404);
      assert.equal((await api(bob,'/api/resources/'+publicState.paper.id+'/assets/'+publicState.raw+'?view=workshop')).status,404);
      assert.equal((await api(bob,'/api/resources/'+publicState.paper.id+'?view=private')).status,404);
      assert.equal((await api(null,'/api/workshop')).status,401);
      const draft=clone(publicState.paper);draft.title='未公开的私有修改';assert.equal((await api(alice,'/api/resources/'+draft.id,'PUT',{paper:draft},publicState.resource.version)).status,200);
      assert.equal((await api(bob,'/api/workshop/'+post.id)).value.paper.title,'虚构公开场景');
    });
    await t.test('likes are unique, cancellable and cannot be self-generated',async()=>{
      assert.equal((await api(alice,'/api/workshop/'+post.id+'/like','PUT',{liked:true})).status,400);
      assert.equal((await api(bob,'/api/workshop/'+post.id+'/like','PUT',{liked:true})).value.likeCount,1);
      assert.equal((await api(bob,'/api/workshop/'+post.id+'/like','PUT',{liked:true})).value.likeCount,1);
      assert.equal((await api(bob,'/api/workshop/'+post.id+'/like','PUT',{liked:false})).value.likeCount,0);
      assert.equal((await api(bob,'/api/workshop/'+post.id+'/like','PUT',{liked:true})).value.likeCount,1);
    });
    await t.test('remixes keep attribution and independent parameters, and cannot inject hidden assets',async()=>{
      const bad=clone(publicState.paper);assert.equal((await api(bob,'/api/workshop/'+post.id+'/remix','POST',{paper:bad})).status,400);
      const result=await api(bob,'/api/workshop/'+post.id+'/remix','POST',{});assert.equal(result.status,201);remix=result.value;
      assert.equal(remix.resource.origin.id,post.id);assert.equal(remix.paper.questions.length,1);
      const paper=clone(remix.paper);paper.questions[0].scenes[0].snapshot.scene.objects[0].value=3;
      assert.equal((await api(bob,'/api/resources/'+paper.id,'PUT',{paper},remix.resource.version)).status,200);
      assert.equal((await api(bob,'/api/workshop/'+post.id)).value.paper.questions[0].scenes[0].snapshot.scene.objects[0].value,1.5);
      assert.equal((await api(bob,'/api/workshop/'+post.id)).value.post.remixCount,1);
      assert.equal((await api(teacher,'/api/resources/'+paper.id)).status,404);
    });
    await t.test('original files require explicit publication and remain scoped to the public snapshot',async()=>{
      const fresh=(await api(alice,'/api/resources/'+publicState.paper.id)).value;
      const result=await api(alice,'/api/workshop','POST',{resourceId:fresh.paper.id,title:'虚构共享文档',category:'document',selection:'paper',includeOriginals:true},fresh.resource.version);
      assert.equal(result.status,201);post=result.value;
      const state=(await api(bob,'/api/workshop/'+post.id)).value;assert.equal(state.resource.originalFiles.length,1);
      const doc=await api(bob,state.resource.originalFiles[0].url);assert.equal(doc.status,200);assert.match(doc.headers.get('content-disposition'),/attachment/);assert.equal(doc.headers.get('x-content-type-options'),'nosniff');
    });
    await t.test('teaching feedback is anchored and private to its author and receiving teacher',async()=>{
      const state=(await api(alice,'/api/resources/'+shared.paper.id)).value,question=state.paper.questions[0];
      const result=await api(alice,'/api/feedback','POST',{resourceId:state.paper.id,view:'shared',questionId:question.id,sceneId:question.scenes[0].id,category:'help',message:'虚构反馈：希望说明转弯方向。',teacherId:bob.user.id,classId:classB.id});assert.equal(result.status,201);feedback=result.value;
      assert.equal(feedback.questionId,question.id);assert.equal((await api(bob,'/api/feedback')).value.feedback.length,0);
      const inbox=(await api(teacher,'/api/feedback?groupId='+classA.id)).value;assert.equal(inbox.feedback.length,1);assert.equal(inbox.feedback[0].classId,classA.id);
      assert.equal((await api(bob,'/api/feedback?before='+feedback.id)).status,404);
      assert.equal((await api(bob,'/api/feedback/'+feedback.id,'PUT',{reply:'spoof',status:'resolved'},feedback.version)).status,403);
      const reply=await api(teacher,'/api/feedback/'+feedback.id,'PUT',{reply:'虚构教师回复：请对照速度与磁场方向。',status:'answered'},feedback.version);assert.equal(reply.status,200);
      assert.equal((await api(teacher,'/api/feedback/'+feedback.id,'PUT',{reply:'stale',status:'resolved'},feedback.version)).status,409);
      assert.equal((await api(alice,'/api/feedback')).value.feedback[0].reply,reply.value.reply);
      assert.equal((await api(alice,'/api/feedback','POST',{resourceId:state.paper.id,questionId:'missing',category:'help',message:''})).status,409);
    });
    await t.test('teacher moderation withdraws public work without reading or deleting private drafts',async()=>{
      const hidden=await api(teacher,'/api/workshop/'+post.id,'PUT',{visible:false,reason:'虚构审核说明'},post.version);assert.equal(hidden.status,200);
      assert.equal((await api(bob,'/api/workshop/'+post.id)).status,404);assert.equal((await api(alice,'/api/resources/'+publicState.paper.id)).status,200);
      assert.equal((await api(teacher,'/api/resources/'+publicState.paper.id)).status,404);
      const own=(await api(alice,'/api/resources/'+publicState.paper.id)).value;
      assert.equal((await api(alice,'/api/workshop','POST',{resourceId:own.paper.id,title:'bypass',category:'paper'},own.resource.version)).status,403);
      const restored=await api(teacher,'/api/workshop/'+post.id,'PUT',{visible:true},hidden.value.version);assert.equal(restored.status,200);post=restored.value;
      assert.equal((await api(bob,'/api/workshop/'+post.id)).status,200);
    });
    await t.test('restart and fresh login retain class assignments, feedback, likes and remixes',async()=>{
      await env.restart();const fresh=await env.login('qa-alice','Student-test-2026');
      assert.equal((await api(fresh,'/api/groups')).value.administrativeClass.id,classA.id);assert.equal((await api(fresh,'/api/feedback')).value.feedback[0].status,'answered');
      assert.equal((await api(bob,'/api/workshop/'+post.id)).value.post.likeCount,1);assert.equal((await api(bob,'/api/resources/'+remix.paper.id)).status,200);
      assert.equal((await api(teacher,'/api/groups')).value.groups.filter(group=>group.legacy).length,1);
    });
    await t.test('archive closes enrolment; teacher class transfers preserve cross-class groups',async()=>{
      const a=(await api(teacher,'/api/groups')).value.groups.find(group=>group.id===classA.id);
      assert.equal((await api(teacher,'/api/groups/'+a.id,'PUT',{archived:true},a.version)).status,200);
      assert.equal((await api(null,'/api/auth/register','POST',{username:'qa-closed',displayName:'虚构',password:'Student-test-2026',inviteCode:'class-a-test'})).status,400);
      assert.equal((await api(teacher,'/api/students/'+alice.user.id,'PUT',{classId:classB.id})).status,200);
      const member=(await api(alice,'/api/groups')).value;assert.equal(member.administrativeClass.id,classB.id);assert(member.groups.some(group=>group.id===learning.id));
      assert.equal((await api(teacher,'/api/feedback?groupId='+classA.id)).value.feedback.length,1);
    });
  }finally{await env.close();}
});

test('v1 SQLite migration preserves accounts, sessions and content without guessing classes',async()=>{
  const data=await mkdtemp(join(tmpdir(),'tijing-v1-migration-')),file=join(data,'workspace.sqlite'),db=new DatabaseSync(file),stamp='2026-09-30T00:00:00.000Z';
  db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE COLLATE NOCASE,display_name TEXT,password_hash TEXT,role TEXT,disabled INTEGER DEFAULT 0,created_at TEXT);
    CREATE TABLE sessions(hash TEXT PRIMARY KEY,user_id TEXT,csrf TEXT,expires_at INTEGER);
    CREATE TABLE resources(id TEXT PRIMARY KEY,owner_id TEXT,title TEXT,question_count INTEGER,scene_count INTEGER,version INTEGER,paper_json TEXT,published_json TEXT,published_at TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE assets(resource_id TEXT,id TEXT,metadata_json TEXT,bytes INTEGER,PRIMARY KEY(resource_id,id));`);
  const teacherId='user-'+crypto.randomUUID(),studentId='user-'+crypto.randomUUID(),password=await hashPassword('Migration-test-2026'),paper=newPaper('虚构旧资源'),question=newQuestion('虚构旧题','原文保持不变。');
  question.scenes=[newScene('旧场景','lesson:ex2')];question.activeSceneId=question.scenes[0].id;paper.questions=[question];paper.activeQuestionId=question.id;
  db.prepare('INSERT INTO settings VALUES(?,?)').run('class_name','虚构旧学习空间');db.prepare('INSERT INTO settings VALUES(?,?)').run('invite_code','migration-legacy');
  const add=db.prepare('INSERT INTO users VALUES(?,?,?,?,?,0,?)');add.run(teacherId,'qa-v1teacher','虚构旧教师',password,'teacher',stamp);add.run(studentId,'qa-v1student','虚构旧学生',password,'student',stamp);
  const token=crypto.randomUUID().replaceAll('-','')+'abcdefghijk',hash=await import('node:crypto').then(module=>module.createHash('sha256').update(token).digest('hex'));
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash,studentId,'migration-csrf',Date.now()+86400000);
  const raw=JSON.stringify(paper);db.prepare('INSERT INTO resources VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(paper.id,teacherId,paper.title,1,1,7,raw,raw,stamp,stamp,stamp);db.close();
  const port=await freePort(),origin='http://127.0.0.1:'+port,options={dataDir:data,resourceDir:resolve('dist/exam'),publicOrigin:origin};
  let app=await createExamServer(options);await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));
  try{
    const response=await fetch(origin+'/api/resources/'+paper.id,{headers:{Cookie:'exam_session='+token}});assert.equal(response.status,200);assert.equal((await response.json()).paper.questions[0].sourceText,'原文保持不变。');
    assert.equal(app.db.prepare('SELECT class_id FROM users WHERE id=?').get(studentId).class_id,null);
    assert.equal(app.db.prepare('SELECT password_hash FROM users WHERE id=?').get(studentId).password_hash,password);
    assert.equal(app.db.prepare('SELECT paper_json FROM resources WHERE id=?').get(paper.id).paper_json,raw);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM sessions').get().n,1);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM resource_targets').get().n,1);
    const legacy=app.accounts.groups.legacyId();await app.close();app=await createExamServer(options);await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));
    assert.equal(app.accounts.groups.legacyId(),legacy);assert.equal(app.db.prepare('SELECT count(*) AS n FROM learning_groups').get().n,1);assert.equal(app.db.prepare('SELECT count(*) AS n FROM group_members').get().n,2);
  }finally{await app.close();}
});

test('group ownership is server-authoritative, and public scene visibility never widens targeted paper visibility',async()=>{
  const env=await environment(),{api}=env;
  try{
    const teacher=await env.login('qa-teacher','Teacher-test-2026'),alice=await env.register('qa-scoped-a'),bob=await env.register('qa-scoped-b');
    const classA=(await api(teacher,'/api/groups','POST',{kind:'class',name:'虚构范围班甲'})).value,classB=(await api(teacher,'/api/groups','POST',{kind:'class',name:'虚构范围班乙'})).value;
    await api(teacher,'/api/groups/'+classA.id+'/members','POST',{userIds:[alice.user.id]});await api(teacher,'/api/groups/'+classB.id+'/members','POST',{userIds:[bob.user.id]});
    const secondId='user-'+crypto.randomUUID(),encoded=await hashPassword('OtherTeacher-test-2026');
    env.app.db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(secondId,'qa-otherteacher','虚构其他教师',encoded,'teacher',new Date().toISOString());
    const other=await env.login('qa-otherteacher','OtherTeacher-test-2026'),foreign=(await api(other,'/api/groups','POST',{kind:'class',name:'虚构其他班',owner_id:teacher.user.id})).value;
    assert.equal((await api(teacher,'/api/groups/'+foreign.id,'PUT',{name:'unauthorized'},foreign.version)).status,404);
    const imported=await env.importPaper(teacher),privateState=(await api(teacher,'/api/resources/'+imported.resource.id)).value;
    assert.equal((await api(teacher,'/api/resources/'+privateState.paper.id+'/publish','POST',{groupIds:[foreign.id]},privateState.resource.version)).status,404);
    const published=await api(teacher,'/api/resources/'+privateState.paper.id+'/publish','POST',{groupIds:[classA.id]},privateState.resource.version);assert.equal(published.status,200);
    const post=await api(teacher,'/api/workshop','POST',{resourceId:privateState.paper.id,title:'虚构公开单场景',category:'scene',selection:'scene',questionId:privateState.paper.questions[0].id,sceneId:privateState.paper.questions[0].scenes[0].id},published.value.version);assert.equal(post.status,201);
    assert.equal((await api(alice,'/api/resources/'+privateState.paper.id+'?view=shared')).value.paper.questions.length,2);
    assert.equal((await api(bob,'/api/resources/'+privateState.paper.id)).value.paper.questions.length,1);
    assert.equal((await api(bob,'/api/resources/'+privateState.paper.id+'?view=shared')).status,404);
    assert.equal((await api(bob,'/api/resources/'+privateState.paper.id+'/assets/'+imported.images[1])).status,404);
    assert.equal((await api(alice,'/api/resources/'+privateState.paper.id+'/assets/'+imported.images[1]+'?view=workshop')).status,404);
    assert.equal((await api(alice,'/api/resources/'+privateState.paper.id+'/assets/'+imported.raw+'?view=shared')).status,404);
    assert.equal((await api(teacher,'/api/resources/'+privateState.paper.id+'?view=workshop','PUT',{paper:privateState.paper},published.value.version)).status,403);
    const publicFeedback=await api(bob,'/api/feedback','POST',{resourceId:privateState.paper.id,view:'workshop',questionId:privateState.paper.questions[0].id,category:'solution',message:'虚构公开作品反馈'});
    assert.equal(publicFeedback.status,201);assert.equal(publicFeedback.value.view,'workshop');assert.equal((await api(other,'/api/feedback/'+publicFeedback.value.id,'PUT',{reply:'foreign',status:'resolved'},publicFeedback.value.version)).status,404);
  }finally{await env.close();}
});
