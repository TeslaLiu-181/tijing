import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {createExamServer} from '../server/exam/http.mjs';
import {newQuestion,newScene} from '../src/exam/model.mjs';

test('forum community permissions, state changes, messages and moderation',async t=>{
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const origin='http://127.0.0.1:'+port,dataDir=await mkdtemp(join(tmpdir(),'tijing-forum-test-')),options={dataDir,resourceDir:resolve('dist/exam'),publicOrigin:origin,adminUsername:'qa-teacher',adminPassword:'Teacher-forum-2026',inviteCode:'forum-test'};
  let app=await createExamServer(options);await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
  const api=async(actor,path,method='GET',body,version)=>{const headers={Origin:origin};if(actor){headers.Cookie=actor.cookie;if(method!=='GET')headers['X-CSRF-Token']=actor.csrf;}if(body!==undefined)headers['Content-Type']='application/json';if(version!==undefined)headers['X-Resource-Version']=String(version);
    const r=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,value:await r.json(),headers:r.headers};};
  const login=async(name,password)=>{const r=await api(null,'/api/auth/login','POST',{username:name,password});assert.equal(r.status,200);return {...r.value,cookie:r.headers.get('set-cookie').split(';')[0]};};
  const register=async(name)=>{const r=await api(null,'/api/auth/register','POST',{username:name,password:'Student-forum-2026',displayName:'虚构'+name,inviteCode:'forum-test'});assert.equal(r.status,200);return {...r.value,cookie:r.headers.get('set-cookie').split(';')[0]};};
  const create=async(actor,input)=>{const r=await api(actor,'/api/forum/topics','POST',{boardId:'board-questions',title:'虚构磁场探究问题',body:'根据 $F=qvB$，下一步怎样得到半径？',kind:'question',tags:['磁场'],...input});assert.equal(r.status,201,JSON.stringify(r.value));return r.value;};
  const detail=async(actor,id)=>(await api(actor,'/api/forum/topics/'+id)).value;
  let teacher,alice,bob,classA,classB,board,topic,privateTopic,reply,nested,resource,work;
  try{
    teacher=await login('qa-teacher','Teacher-forum-2026');alice=await register('qa-alice');bob=await register('qa-bob');
    await t.test('logged-in access, teacher-only announcements and protected board creation',async()=>{
      assert.equal((await api(null,'/api/forum/topics')).status,401);assert.equal((await api(alice,'/api/forum/boards')).value.boards.length,3);
      assert.equal((await api(alice,'/api/forum/boards','POST',{name:'spoof'})).status,403);
      assert.equal((await api(alice,'/api/forum/topics','POST',{boardId:'board-announcements',title:'非法公告',body:'不能冒充教师'})).status,403);
      const notice=await create(teacher,{boardId:'board-announcements',title:'虚构学习通知',kind:'discussion'});assert.equal((await api(alice,'/api/forum/topics/'+notice.id+'/comments','POST',{body:'收到，感谢老师'})).status,201);
    });
    await t.test('class-scoped boards cannot leak through list, search, profiles or direct reads',async()=>{
      classA=(await api(teacher,'/api/groups','POST',{kind:'class',name:'虚构甲班',inviteCode:'forum-a'})).value;classB=(await api(teacher,'/api/groups','POST',{kind:'class',name:'虚构乙班',inviteCode:'forum-b'})).value;
      await api(teacher,'/api/groups/'+classA.id+'/members','POST',{userIds:[alice.user.id]});await api(teacher,'/api/groups/'+classB.id+'/members','POST',{userIds:[bob.user.id]});
      board=(await api(teacher,'/api/forum/boards','POST',{name:'虚构甲班探究',groupId:classA.id,teacherOnly:false})).value;
      privateTopic=await create(alice,{boardId:board.id,title:'只有虚构甲班可见',body:'甲班群组专属正文'});
      assert.equal((await api(bob,'/api/forum/topics/'+privateTopic.id)).status,404);
      assert.equal((await api(bob,'/api/forum/topics?search=甲班')).value.total,0);
      assert.equal((await api(bob,'/api/forum/topics?boardId='+board.id)).status,404);
      assert.equal((await api(bob,'/api/profiles/'+alice.user.id)).value.topicCount,0);
    });
    await t.test('authors edit with versions; other students cannot edit or moderate',async()=>{
      topic=await create(alice);assert.equal((await api(bob,'/api/forum/topics/'+topic.id,'PUT',{body:'篡改'},topic.version)).status,403);
      const r=await api(alice,'/api/forum/topics/'+topic.id,'PUT',{body:'先令 $qvB=mv^2/r$，还有哪些条件？'},topic.version);assert.equal(r.status,200);topic=r.value;
      assert.equal((await api(alice,'/api/forum/topics/'+topic.id,'PUT',{title:'过期修改'},1)).status,409);
      assert.equal((await api(alice,'/api/forum/topics/'+topic.id,'PUT',{pinned:true},topic.version)).status,403);
      assert.equal((await api(alice,'/api/forum/topics','POST',{boardId:'board-questions',title:'标签校验',body:'测试输入',tags:['a'.repeat(21)]})).status,400);
    });
    await t.test('threaded replies, parent validation, acceptance and author-only comment editing',async()=>{
      reply=(await api(bob,'/api/forum/topics/'+topic.id+'/comments','POST',{body:'因为速度方向始终垂直洛伦兹力，所以 $r=mv/(qB)$。'})).value;
      nested=(await api(alice,'/api/forum/topics/'+topic.id+'/comments','POST',{body:'谢谢，速度大小是否不变？',parentId:reply.id})).value;
      assert.equal(nested.parentId,reply.id);assert.equal((await api(alice,'/api/forum/topics/'+privateTopic.id+'/comments','POST',{body:'跨主题回复',parentId:reply.id})).status,400);
      assert.equal((await api(alice,'/api/forum/comments/'+reply.id,'PUT',{body:'篡改'},reply.version)).status,403);
      const changed=await api(bob,'/api/forum/comments/'+reply.id,'PUT',{body:'洛伦兹力不做功，速率不变。$r=mv/(qB)$'},reply.version);assert.equal(changed.status,200);reply=changed.value;
      assert.equal((await api(bob,'/api/forum/comments/'+reply.id,'PUT',{body:'过期'},1)).status,409);
      const accepted=await api(alice,'/api/forum/topics/'+topic.id+'/accept','PUT',{commentId:reply.id},topic.version);assert.equal(accepted.status,200);topic=accepted.value;assert(topic.solved);
      assert((await detail(alice,topic.id)).comments.find(c=>c.id===reply.id).accepted);
    });
    await t.test('likes are unique and cancellable; bookmarks filter without showing private topics',async()=>{
      assert.equal((await api(alice,'/api/forum/topics/'+topic.id+'/like','PUT',{liked:true})).status,400);
      for(let i=0;i<2;i++)assert.equal((await api(bob,'/api/forum/topics/'+topic.id+'/like','PUT',{liked:true})).value.likeCount,1);
      assert.equal((await api(bob,'/api/forum/topics/'+topic.id+'/like','PUT',{liked:false})).value.likeCount,0);
      await api(bob,'/api/forum/topics/'+topic.id+'/like','PUT',{liked:true});assert.equal((await api(alice,'/api/notifications')).value.notifications.filter(n=>n.kind==='like').length,1);
      assert.equal((await api(bob,'/api/forum/topics/'+topic.id+'/bookmark','PUT',{bookmarked:true})).status,200);
      assert.equal((await api(bob,'/api/forum/topics?bookmarked=1')).value.total,1);
      assert.equal((await api(bob,'/api/forum/topics/'+privateTopic.id+'/bookmark','PUT',{bookmarked:true})).status,404);
    });
    await t.test('notifications are user-private and respect later membership changes',async()=>{
      const notices=(await api(alice,'/api/notifications')).value;assert(notices.unread>=2);const bobNotices=(await api(bob,'/api/notifications')).value;assert(bobNotices.notifications.some(n=>n.kind==='accepted'));
      const privateReply=(await api(teacher,'/api/forum/topics/'+privateTopic.id+'/comments','POST',{body:'班内交流回复'})).value;assert(privateReply.id);
      assert((await api(alice,'/api/notifications')).value.notifications.some(n=>n.targetId===privateTopic.id));
      await api(teacher,'/api/students/'+alice.user.id,'PUT',{classId:classB.id});
      assert(!(await api(alice,'/api/notifications')).value.notifications.some(n=>n.targetId===privateTopic.id));assert.equal((await api(alice,'/api/forum/topics/'+privateTopic.id)).status,404);
      await api(teacher,'/api/students/'+alice.user.id,'PUT',{classId:classA.id});
      const ownNotice=notices.notifications[0].id;await api(bob,'/api/notifications','PUT',{id:ownNotice});assert((await api(alice,'/api/notifications')).value.notifications.find(n=>n.id===ownNotice)?.read===false);
      await api(alice,'/api/notifications','PUT',{all:true});assert.equal((await api(alice,'/api/notifications')).value.unread,0);
    });
    await t.test('teacher moderation locks replies, hides public topics and prevents author bypass',async()=>{
      topic=(await api(teacher,'/api/forum/topics/'+topic.id,'PUT',{locked:true,pinned:true},topic.version)).value;assert(topic.locked);assert(topic.pinned);
      assert.equal((await api(bob,'/api/forum/topics/'+topic.id+'/comments','POST',{body:'锁定后回复'})).status,403);
      topic=(await api(teacher,'/api/forum/topics/'+topic.id,'PUT',{locked:false,hidden:true},topic.version)).value;
      assert.equal((await api(bob,'/api/forum/topics/'+topic.id)).status,404);assert.equal((await api(alice,'/api/forum/topics/'+topic.id,'PUT',{body:'绕过撤下'},topic.version)).status,403);
      topic=(await api(teacher,'/api/forum/topics/'+topic.id,'PUT',{hidden:false},topic.version)).value;
    });
    await t.test('resource references validate the whole board audience',async()=>{
      resource=(await api(teacher,'/api/resources','POST',{title:'虚构教师甲班投送'})).value;const paper=resource.paper,q=newQuestion('虚构问题','测试资源');q.scenes=[newScene('原题场景','lesson:ex2')];q.activeSceneId=q.scenes[0].id;paper.questions=[q];paper.activeQuestionId=q.id;
      await api(teacher,'/api/resources/'+paper.id,'PUT',{paper},resource.resource.version);const current=(await api(teacher,'/api/resources/'+paper.id)).value;
      await api(teacher,'/api/resources/'+paper.id+'/publish','POST',{groupIds:[classA.id]},current.resource.version);
      assert.equal((await api(alice,'/api/forum/topics','POST',{boardId:'board-questions',title:'非法公开链接',body:'引用班内材料',reference:{type:'resource',id:paper.id}})).status,400);
      const linked=await create(alice,{boardId:board.id,reference:{type:'resource',id:paper.id}});assert.equal(linked.reference.title,paper.title);
      const workResult=await api(teacher,'/api/workshop','POST',{resourceId:paper.id,title:'虚构公开场景',description:'公开一份场景',category:'scene',selection:'scene',questionId:q.id,sceneId:q.scenes[0].id},current.resource.version+1);assert.equal(workResult.status,201);work=workResult.value;
      const publicRef=await create(bob,{reference:{type:'workshop',id:work.id}});assert.equal(publicRef.reference.type,'workshop');
      assert.equal((await api(bob,'/api/resources/'+paper.id+'?view=shared')).status,404);assert.equal((await api(bob,'/api/resources/'+paper.id+'?view=workshop')).status,200);
    });
    await t.test('public profiles expose only self-written biography and authorized activity',async()=>{
      await api(alice,'/api/profile','PUT',{bio:'虚构兴趣：电磁场',color:'blue',username:'leak',classId:classA.id});
      const profile=(await api(bob,'/api/profiles/'+alice.user.id)).value;assert.equal(profile.bio,'虚构兴趣：电磁场');assert.equal(profile.color,'blue');
      for(const key of ['username','classId','passwordHash','groupIds'])assert(!Object.hasOwn(profile,key));assert.equal((await api(bob,'/api/profile','PUT',{bio:'测试',color:'invalid'})).status,400);
    });
    await t.test('reports are deduplicated and moderator actions keep evidence and remove accepted hidden answers',async()=>{
      const r=await api(alice,'/api/reports','POST',{type:'comment',targetId:reply.id,reason:'虚构举报验收说明'});assert.equal(r.status,201);
      assert.equal((await api(alice,'/api/reports','POST',{type:'comment',targetId:reply.id,reason:'重复虚构举报'})).value.id,r.value.id);
      assert.equal((await api(bob,'/api/reports')).status,403);const list=(await api(teacher,'/api/reports')).value.reports;assert.equal(list.length,1);
      assert.equal((await api(teacher,'/api/reports/'+r.value.id,'PUT',{status:'resolved',resolution:'虚构撤下检查',hide:true},list[0].version)).status,200);
      const state=await detail(alice,topic.id);assert(!state.topic.solved);assert.equal(state.comments.find(c=>c.id===reply.id).body,'');
      assert.equal((await api(bob,'/api/forum/comments/'+reply.id+'/like','PUT',{liked:true})).status,404);
      assert(app.db.prepare('SELECT count(*) AS n FROM community_audit').get().n>=3);
    });
    await t.test('soft deletion removes content and clears accepted replies; restart retains discussion and bookmarks',async()=>{
      const deletedReport=(await api(bob,'/api/reports','POST',{type:'comment',targetId:nested.id,reason:'虚构内容删除后的举报处理'})).value;
      const c=(await detail(alice,topic.id)).comments.find(c=>c.id===nested.id);assert.equal((await api(alice,'/api/forum/comments/'+c.id,'DELETE',undefined,c.version)).status,200);
      assert.equal((await detail(alice,topic.id)).comments.find(x=>x.id===c.id).body,'');
      assert((await api(teacher,'/api/reports')).value.reports.some(r=>r.id===deletedReport.id));
      assert.equal((await api(teacher,'/api/reports/'+deletedReport.id,'PUT',{status:'resolved',resolution:'内容已删除，虚构验收完成'},1)).status,200);
      await app.close();app=await createExamServer(options);await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
      assert((await api(bob,'/api/forum/topics?bookmarked=1')).value.topics.some(x=>x.id===topic.id));const current=(await detail(alice,topic.id)).topic;
      assert.equal((await api(bob,'/api/forum/topics/'+topic.id,'DELETE',undefined,current.version)).status,403);
      assert.equal((await api(alice,'/api/forum/topics/'+topic.id,'DELETE',undefined,current.version)).status,200);assert.equal((await api(bob,'/api/forum/topics/'+topic.id)).status,404);
    });
  }finally{await app.close();}
});
