import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';

const argument = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const root = resolve(argument('package') || 'dist/student-web-package'), data = await mkdtemp(join(tmpdir(), 'exam-web-package-'));
const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const origin = 'http://127.0.0.1:' + port, output = resolve('.qa/exam-web'); await mkdir(output, {recursive: true});
let child, stdout = '', stderr = ''; const report = {package: root, data, origin, checks: []};
async function start() {
  child = spawn(process.execPath, [join(root, 'server/exam/main.mjs')], {cwd: tmpdir(), env: {...process.env, EXAM_DATA_DIR: data, EXAM_HOST: '127.0.0.1', EXAM_PORT: String(port), EXAM_PUBLIC_URL: origin,
    EXAM_ADMIN_USERNAME: 'qa-pkgteacher', EXAM_ADMIN_PASSWORD: 'PackageTeacher-2026', EXAM_INVITE_CODE: 'package-test-2026', EXAM_CLASS_NAME: '打包程序 · 虚构验收'}, windowsHide: true});
  child.stdout.on('data', value => stdout += value); child.stderr.on('data', value => stderr += value);
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(origin + '/health')).ok) return; } catch {}
    if (child.exitCode !== null) throw Error('打包服务退出：' + stderr);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('打包服务未启动');
}
async function stop() { if (!child || child.exitCode !== null) return; const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await exited; }
async function api(actor, path, method = 'GET', body, version) {
  const headers = {Origin: origin}; if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (actor) { headers.Cookie = actor.cookie; if (method !== 'GET') headers['X-CSRF-Token'] = actor.csrf; }
  if (version !== undefined) headers['X-Resource-Version'] = String(version);
  const response = await fetch(origin + path, {method, headers, body: body !== undefined ? JSON.stringify(body) : undefined});
  return {status: response.status, headers: response.headers, value: await response.json()};
}
const actor = result => ({cookie: result.headers.get('set-cookie').split(';')[0], csrf: result.value.csrf});
const record = (name, detail = {}) => { report.checks.push({name, ...detail}); console.log(name + ': ' + JSON.stringify(detail)); };
try {
  await start(); const home = await fetch(origin); assert.equal(home.status, 200); assert.match(await home.text(), /web-host\.js/); record('compiled server launch', {node: process.versions.node, workingDirectory: tmpdir()});
  const auth = await api(null, '/api/auth/login', 'POST', {username: 'qa-pkgteacher', password: 'PackageTeacher-2026'}); assert.equal(auth.status, 200); const teacher = actor(auth);
  const sample = await api(teacher, '/api/sample', 'POST', {}); assert.equal(sample.status, 201); assert.equal(sample.value.paper.questions.length, 15);
  assert.equal((await api(teacher, '/api/resources/' + sample.value.paper.id + '/publish', 'POST', {}, sample.value.resource.version)).status, 200);
  const signup = await api(null, '/api/auth/register', 'POST', {username: 'qa-pkgstudent', displayName: '虚构打包验收学生', password: 'PackageStudent-2026', inviteCode: 'package-test-2026'}); assert.equal(signup.status, 200); const student = actor(signup);
  const shared = await api(student, '/api/resources/' + sample.value.paper.id); assert.equal(shared.status, 200); assert.equal(shared.value.resource.writable, false);
  const copied = await api(student, '/api/resources/' + sample.value.paper.id + '/fork', 'POST', {paper: shared.value.paper}); assert.equal(copied.status, 201);
  record('compiled resource operations', {questions: 15, studentRole: signup.value.user.role, sharedReadOnly: true, personalCopy: copied.value.paper.id});

  const classroom = await api(teacher, '/api/groups', 'POST', {kind:'class', name:'虚构编译验收行政班', inviteCode:'compiled-community-class'}); assert.equal(classroom.status,201);
  assert.equal((await api(teacher,'/api/groups/'+classroom.value.id+'/members','POST',{userIds:[signup.value.user.id]})).status,200);
  assert.equal((await api(student,'/api/groups')).value.administrativeClass.id,classroom.value.id);
  const question=copied.value.paper.questions.find(question=>question.scenes.length);
  const posted=await api(student,'/api/workshop','POST',{resourceId:copied.value.paper.id,title:'虚构编译验收作品',category:'scene',selection:'scene',questionId:question.id,sceneId:question.scenes[0].id},copied.value.resource.version);assert.equal(posted.status,201);
  assert.equal((await api(teacher,'/api/workshop/'+posted.value.id+'/like','PUT',{liked:true})).value.likeCount,1);
  assert.equal((await api(teacher,'/api/workshop/'+posted.value.id+'/remix','POST',{})).status,201);
  const sourceQuestion=shared.value.paper.questions.find(question=>question.scenes.length),submitted=await api(student,'/api/feedback','POST',{resourceId:sample.value.paper.id,view:'shared',questionId:sourceQuestion.id,category:'help',message:'虚构编译包反馈'});assert.equal(submitted.status,201);
  assert.equal((await api(teacher,'/api/feedback/'+submitted.value.id,'PUT',{reply:'虚构编译包回复',status:'resolved'},submitted.value.version)).status,200);
  record('compiled classes, workshop and feedback', {classAssigned:true,publicScene:true,uniqueLike:true,independentRemix:true,feedbackReplied:true});

  const topic=await api(student,'/api/forum/topics','POST',{boardId:'board-questions',title:'虚构编译版讨论',body:'比较 $r=mv/(qB)$ 的尺度关系。',kind:'question',reference:{type:'workshop',id:posted.value.id}});assert.equal(topic.status,201);
  const comment=await api(teacher,'/api/forum/topics/'+topic.value.id+'/comments','POST',{body:'虚构编译版回复'});assert.equal(comment.status,201);
  assert.equal((await api(student,'/api/forum/topics/'+topic.value.id+'/accept','PUT',{commentId:comment.value.id},topic.value.version)).status,200);
  assert((await api(student,'/api/notifications')).value.unread>0);
  assert.equal((await api(student,'/api/forum/topics/'+topic.value.id+'/bookmark','PUT',{bookmarked:true})).status,200);
  record('compiled discussion, formulas, acceptance, notifications and bookmarks',{threadedReplies:true,accepted:true,notifications:true,bookmarks:true});

  await stop(); await start();
  const reopened = await api(student, '/api/resources/' + copied.value.paper.id); assert.equal(reopened.status, 200); assert.equal(reopened.value.paper.questions.length, 15);
  assert((await api(student,'/api/forum/topics/'+topic.value.id)).value.topic.solved);
  assert.equal((await api(student,'/api/forum/topics?bookmarked=1')).value.total,1);
  record('compiled server restart', {sessionsAndResourcesRecovered: true,communityRecovered:true});
  const manifest = JSON.parse(await readFile(join(root, 'build-manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).dependencies).sort(), ['@xmldom/xmldom', 'fflate', 'sharp']);
  record('deployment contents', {files: manifest.files.length, deployMB: Math.round(manifest.totalBytes / 1024 / 1024 * 10) / 10, runtimeDependencies: 3});
  await writeFile(join(output, 'package-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ok: true, checks: report.checks.length}));
} catch (error) { report.failure = error.message; report.stderr = stderr; await writeFile(join(output, 'package-report.json'), JSON.stringify(report, null, 2)); throw error; }
finally { await stop(); }
