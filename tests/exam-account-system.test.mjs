import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {createExamServer} from '../server/exam/http.mjs';
import {AccountProfiles,profileAppearance,updateProfile} from '../server/exam/account-profiles.mjs';
import {AISettings} from '../server/exam/ai-settings.mjs';

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'tijing-accounts-'));
 const app=await createExamServer({dataDir:root,resourceDir:resolve('dist/exam'),publicOrigin:'http://127.0.0.1',adminUsername:'account-admin',adminPassword:'Admin-synthetic-2026',inviteCode:'legacy-accounts',aiEnv:{},wechatEnv:{}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+app.server.address().port;
 const api=async(actor,path,method='GET',body,version)=>{
  const response=await fetch(origin+path,{method,headers:{Origin:'http://127.0.0.1',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{}),...(body?{'Content-Type':'application/json'}:{}),...(version!==undefined?{'X-Resource-Version':String(version)}:{})},body:body?JSON.stringify(body):undefined});
  return {status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 const auth=async(path,input)=>{const result=await api(null,path,'POST',input);assert.equal(result.status,200,JSON.stringify(result.value));return {...result.value,cookie:result.cookie};};
 const admin=await auth('/api/auth/login',{username:'account-admin',password:'Admin-synthetic-2026'});
 const teacher=async name=>auth('/api/auth/teacher-register',{username:name,displayName:name,password:'Teacher-synthetic-2026',isPlatformAdmin:true,role:'admin'});
 const student=async(name,code)=>auth('/api/auth/register',{username:name,displayName:name,password:'Student-synthetic-2026',inviteCode:code,role:'teacher'});
 return {app,root,api,admin,teacher,student,close:async()=>{await app.close();await rm(root,{recursive:true,force:true});}};
}

test('self-service teachers own separate spaces and cannot acquire administrator or other teacher rights',async()=>{
 const f=await fixture();try{
  const a=await f.teacher('teacher-alpha'),b=await f.teacher('teacher-beta');assert.equal(f.admin.user.isPlatformAdmin,true);assert.equal(a.user.role,'teacher');assert.equal(a.user.isPlatformAdmin,false);
  const groupA=(await f.api(a,'/api/groups','POST',{kind:'class',name:'合成甲班',inviteCode:'alpha-class'})).value;
  const groupB=(await f.api(b,'/api/groups','POST',{kind:'class',name:'合成乙班',inviteCode:'beta-class'})).value;
  const alice=await f.student('student-alpha','alpha-class'),bob=await f.student('student-beta','beta-class');assert.equal(alice.user.role,'student');
  assert.equal((await f.api(a,'/api/students')).value.students.length,1);assert.equal((await f.api(b,'/api/students')).value.students[0].id,bob.user.id);
  assert.equal((await f.api(b,'/api/groups/'+groupA.id,'PUT',{name:'越权'},groupA.version)).status,404);
  assert.equal((await f.api(b,'/api/students/'+alice.user.id,'PUT',{password:'Unauthorized-2026'})).status,404);
  assert.equal((await f.api(a,'/api/account/admin/teachers')).status,403);
  assert.equal((await f.api(f.admin,'/api/account/admin/teachers')).value.teachers.length,3);
  assert.equal((await f.api(f.admin,'/api/account/admin/teachers/'+f.admin.user.id,'PUT',{disabled:true})).status,400);
  assert.equal((await f.api(f.admin,'/api/account/admin/teachers/'+b.user.id,'PUT',{disabled:true})).status,200);
  assert.equal((await f.api(b,'/api/library')).status,401);
  assert.equal((await f.api(null,'/api/auth/register','POST',{username:'new-beta',displayName:'合成学生',password:'Student-synthetic-2026',inviteCode:'beta-class'})).status,400);
  assert.equal((await f.api(f.admin,'/api/account/admin/teachers/'+b.user.id,'PUT',{disabled:false})).status,200);
  assert.equal((await f.api(null,'/api/auth/wechat/status')).value.enabled,false);
  assert.equal((await f.api(null,'/api/auth/wechat/start','POST',{intent:'login'})).status,503);
  assert.equal((await f.api(a,'/api/forum/boards/board-questions','PUT',{name:'越权公共版块'},1)).status,403);
  assert(groupB.id);
 }finally{await f.close();}
});

test('profile fields and re-encoded images persist, reject cross-account images and stale writes',async()=>{
 const f=await fixture();try{
  const teacher=await f.teacher('profile-teacher'),other=await f.teacher('profile-other');
  const profiles=await new AccountProfiles(f.app.db,{dataDir:f.root}).init();
  const bytes=await sharp({create:{width:120,height:80,channels:3,background:'#137b73'}}).png().toBuffer();
  const image=await profiles.upload(teacher.user,{kind:'avatar',data:bytes.toString('base64')});
  await assert.rejects(profiles.image(other.user,image.id),e=>e.status===404);
  assert.throws(()=>updateProfile(f.app.db,other.user,{avatarId:image.id},1),e=>e.status===404);
  await assert.rejects(profiles.upload(teacher.user,{kind:'cover',data:Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')}),e=>e.status===400);
  const old=(await f.api(teacher,'/api/account')).value.profile;
  const updated=await f.api(teacher,'/api/account/profile','PUT',{displayName:'合成昵称',bio:'观察与探究',headline:'每个问题都值得验证',subject:'物理',grade:'高中',interests:['电磁场','动态几何','电磁场'],avatarId:image.id,color:'blue',platform_admin:1},old.version);
  assert.equal(updated.status,200);assert.deepEqual(updated.value.profile.interests,['电磁场','动态几何']);assert.equal(updated.value.user.isPlatformAdmin,false);assert.equal(updated.value.user.displayName,'合成昵称');
  assert.equal((await f.api(teacher,'/api/account/profile','PUT',{bio:'过期覆盖'},old.version)).status,409);
  const metadata=await sharp(await profiles.image(other.user,image.id)).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,512);assert.equal(metadata.height,512);
  assert.equal((await f.api(teacher,'/api/me')).value.user.avatarURL,image.url);
  assert.equal(profileAppearance(f.app.db,teacher.user.id).bio,'观察与探究');
  assert.throws(()=>updateProfile(f.app.db,teacher.user,{interests:Array(9).fill('太多')}),e=>e.status===400);
  assert.throws(()=>updateProfile(f.app.db,teacher.user,{avatarId:'../../private'}),e=>e.status===404);
 }finally{await f.close();}
});

test('teaching keys belong to teachers, group overrides and revocation cannot leak a different key',async()=>{
 const f=await fixture();try{
  const a=await f.teacher('api-teacher-a'),b=await f.teacher('api-teacher-b');
  const classA=f.app.accounts.groups.create(a.user,{kind:'class',name:'甲班',inviteCode:'api-class-a'}),classB=f.app.accounts.groups.create(b.user,{kind:'class',name:'乙班',inviteCode:'api-class-b'});
  const alice=await f.student('api-alice','api-class-a'),bob=await f.student('api-bob','api-class-b');
  const settings=await new AISettings(f.app.db,{dataDir:f.root,env:{EXAM_AI_API_KEY:'synthetic-legacy-secret'},validateEndpoint:async()=>{}}).init();
  assert.equal((await settings.configurationFor(a.user)).apiKey,'');assert.equal((await settings.configurationFor(alice.user)).apiKey,'');
  await settings.save(a.user,{scope:'shared',apiKey:'synthetic-secret-alpha',model:'model-a'});await settings.save(b.user,{scope:'shared',apiKey:'synthetic-secret-beta',model:'model-b'});
  assert.equal((await settings.configurationFor(alice.user)).apiKey,'synthetic-secret-alpha');assert.equal((await settings.configurationFor(bob.user)).apiKey,'synthetic-secret-beta');
  await assert.rejects(settings.save(b.user,{scope:'shared',groupId:classA.id,apiKey:'synthetic-stolen'}),e=>e.status===404);
  await settings.save(a.user,{scope:'shared',groupId:classA.id,apiKey:'synthetic-class-override',model:'class-model'});
  assert.equal((await settings.configurationFor(alice.user)).apiKey,'synthetic-class-override');
  await settings.save(a.user,{scope:'shared',groupId:classA.id,inherit:true});assert.equal((await settings.configurationFor(alice.user)).apiKey,'synthetic-secret-alpha');
  const group=f.app.accounts.groups.create(a.user,{kind:'learning',name:'合成探究组'});f.app.accounts.groups.assign(a.user,group.id,{userIds:[alice.user.id]});
  await settings.save(a.user,{scope:'shared',groupId:group.id,apiKey:'synthetic-group-secret',model:'group-model'});
  await settings.save(alice.user,{scope:'personal',usePersonal:false,selectedGroupId:group.id});assert.equal((await settings.configurationFor(alice.user)).apiKey,'synthetic-group-secret');
  f.app.accounts.groups.removeMember(a.user,group.id,alice.user.id);assert.equal((await settings.configurationFor(alice.user)).apiKey,'');assert.equal((await settings.get(alice.user)).unavailable,true);
  await assert.rejects(settings.save(alice.user,{scope:'personal',usePersonal:false,selectedGroupId:classB.id}),e=>e.status===403);
  const views=JSON.stringify(await Promise.all([settings.get(a.user),settings.get(b.user),settings.get(alice.user),settings.get(bob.user)]));assert(!views.includes('synthetic-secret'));assert(!views.includes('synthetic-group-secret'));
  const saved=JSON.parse(await readFile(settings.filename(a.user,'shared'),'utf8'));assert.equal(saved.apiKey,'synthetic-secret-alpha');
 }finally{await f.close();}
});
