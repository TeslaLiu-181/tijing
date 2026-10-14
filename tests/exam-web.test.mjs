import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createServer as createPortProbe} from 'node:net';
import sharp from 'sharp';
import {zipSync, strToU8} from 'fflate';
import {createExamServer} from '../server/exam/http.mjs';
import {newPaper, newQuestion, newScene, validatePaper} from '../src/exam/model.mjs';
import {htmlPaper, importResource} from '../src/exam/resources.mjs';

async function portNumber() { const probe = createPortProbe(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); return port; }
const png = await sharp({create: {width: 32, height: 24, channels: 3, background: '#ffffff'}}).png().toBuffer();
function fixture() {
  const paper = newPaper('虚构验收试卷'), question = newQuestion('验收题1', '给定 m、q、L；数值仅为验收演示。');
  question.scenes = [newScene('原题场景', 'lesson:ex2')]; question.activeSceneId = question.scenes[0].id;
  paper.questions = [question]; paper.activeQuestionId = question.id;
  const imageId = crypto.randomUUID(), rawId = crypto.randomUUID();
  paper.assets[imageId] = {id: imageId, name: '合成验收题图.png', mime: 'image/png', kind: 'image', url: 'data:image/png;base64,' + png.toString('base64')};
  paper.assets[rawId] = {id: rawId, name: '仅限教师原始资料.pdf', mime: 'application/pdf', kind: 'original', url: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 synthetic original').toString('base64')};
  question.attachments = [{id: imageId}]; question.referenceText = '虚构验收解析。';
  paper.sources = [{id: 'source-fixture', title: '合成验收材料', type: 'pdf', asset: paper.assets[rawId], paragraphs: [{text: '不应发布的原始段落'}]}];
  question.sourceId = 'source-fixture';
  return {paper, imageId, rawId};
}
const docx = zipSync({'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>1.合成验收题一：给定L，观察运动。</w:t></w:r></w:p><w:p><w:r><w:t>2.合成验收题二：讨论磁场方向。</w:t></w:r></w:p></w:body></w:document>')});

test('student web service: authentication, resource isolation, publication and durable cross-device saves', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'exam-web-api-')), port = await portNumber(), origin = 'http://127.0.0.1:' + port;
  const options = {dataDir: directory, resourceDir: resolve('dist/exam'), publicOrigin: origin, adminUsername: 'qa-teacher', adminPassword: 'Teacher-test-2026', inviteCode: 'class-test-2026', quotaBytes: 50 * 1024 * 1024};
  let app = await createExamServer(options); await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
  const actors = {};
  async function api(actor, path, method = 'GET', body, version, extraHeaders = {}) {
    const headers = {Origin: origin};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (actor) { headers.Cookie = actor.cookie; if (method !== 'GET') headers['X-CSRF-Token'] = actor.csrf; }
    if (version !== undefined) headers['X-Resource-Version'] = String(version);
    Object.assign(headers, extraHeaders);
    const response = await fetch(origin + path, {method, headers, body: body !== undefined ? JSON.stringify(body) : undefined});
    const text = await response.text(), value = (response.headers.get('content-type') || '').includes('application/json') ? JSON.parse(text) : text;
    return {status: response.status, value, headers: response.headers, text};
  }
  async function identity(name, role) {
    const result = await api(null, role === 'teacher' ? '/api/auth/login' : '/api/auth/register', 'POST', {username: name,
      password: role === 'teacher' ? 'Teacher-test-2026' : 'Student-test-2026', displayName: '虚构验收学生-' + name, inviteCode: 'class-test-2026', role: 'teacher'});
    assert.equal(result.status, 200);
    const actor = {cookie: result.headers.get('set-cookie').split(';')[0], csrf: result.value.csrf, user: result.value.user}; actors[name] = actor; return actor;
  }
  let teacher, alice, bob, privateState, sharedId, ownCopy, pending;
  try {
    await t.test('invite registration cannot grant teacher authority; cookies and CSRF protect mutations', async () => {
      const wrong = await api(null, '/api/auth/register', 'POST', {username: 'qa-wrong', displayName: '虚构验收', password: 'Student-test-2026', inviteCode: 'wrong'}); assert.equal(wrong.status, 400);
      teacher = await identity('qa-teacher', 'teacher'); alice = await identity('qa-alice', 'student'); bob = await identity('qa-bob', 'student');
      assert.equal(alice.user.role, 'student'); assert.match((await api(null, '/api/auth/login', 'POST', {username: 'qa-teacher', password: 'Teacher-test-2026'})).headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
      assert.equal((await api(alice, '/api/resources', 'POST', {title: 'x'}, undefined, {'X-CSRF-Token': 'wrong'})).status, 403);
      assert.equal((await api(alice, '/api/resources', 'POST', {title: 'x'}, undefined, {Origin: 'https://different.example'})).status, 403);
      assert.equal((await api(alice, '/api/classroom')).status, 403); assert.equal((await api(null, '/api/library')).status, 401);
    });
    await t.test('all private resource operations and images are isolated across students', async () => {
      const {paper, imageId} = fixture();
      const imported = await api(alice, '/api/import', 'POST', {filename: 'synthetic.json', data: Buffer.from(JSON.stringify(paper)).toString('base64')});
      assert.equal(imported.status, 201); privateState = imported.value;
      assert.equal((await api(alice, '/api/resources/' + privateState.paper.id + '/assets/' + imageId)).status, 200);
      for (const [path, method, body] of [[`/api/resources/${privateState.paper.id}`, 'GET'], [`/api/resources/${privateState.paper.id}`, 'PUT', {paper: privateState.paper}],
        [`/api/resources/${privateState.paper.id}`, 'DELETE'], [`/api/resources/${privateState.paper.id}/fork`, 'POST', {}], [`/api/resources/${privateState.paper.id}/export`, 'POST', {paper: privateState.paper, kind: 'html'}],
        [`/api/resources/${privateState.paper.id}/assets/${imageId}`, 'GET']]) assert.equal((await api(bob, path, method, body, 1)).status, 404, path);
      assert.equal((await api(teacher, '/api/resources/' + privateState.paper.id)).status, 404);
      assert.equal((await api(bob, '/api/library')).value.mine.length, 0);
    });
    await t.test('server versions reject stale saves and URL/body substitution', async () => {
      const paper = structuredClone(privateState.paper); paper.title = '学生甲自己的改编';
      const saved = await api(alice, '/api/resources/' + paper.id, 'PUT', {paper}, privateState.resource.version); assert.equal(saved.status, 200);
      assert.equal((await api(alice, '/api/resources/' + paper.id, 'PUT', {paper: privateState.paper}, privateState.resource.version)).status, 409);
      const wrong = structuredClone(paper); wrong.id = newPaper().id;
      assert.equal((await api(alice, '/api/resources/' + paper.id, 'PUT', {paper: wrong}, saved.value.version)).status, 400);
      privateState = (await api(alice, '/api/resources/' + paper.id)).value;
    });
    await t.test('shared snapshot excludes original documents and is immutable to student edits', async () => {
      const {paper, imageId, rawId} = fixture();
      const imported = await api(teacher, '/api/import', 'POST', {filename: 'teacher-synthetic.json', data: Buffer.from(JSON.stringify(paper)).toString('base64')}); assert.equal(imported.status, 201);
      const state = imported.value; sharedId = state.paper.id;
      const published = await api(teacher, '/api/resources/' + sharedId + '/publish', 'POST', {includeReference: false}, state.resource.version);
      assert.equal(published.status, 200); state.resource.version = published.value.version;
      const shared = await api(alice, '/api/resources/' + sharedId); assert.equal(shared.status, 200); assert.equal(shared.value.resource.writable, false);
      assert.equal(shared.value.paper.questions[0].referenceText, ''); assert.equal(shared.value.paper.assets[rawId], undefined); assert.equal(shared.value.paper.sources[0].paragraphs, undefined);
      assert.equal((await api(alice, '/api/resources/' + sharedId + '/assets/' + rawId)).status, 404);
      assert.equal((await api(alice, '/api/resources/' + sharedId + '/assets/' + imageId)).status, 200);
      assert.equal((await api(alice, '/api/resources/' + sharedId, 'PUT', {paper: shared.value.paper}, shared.value.resource.version)).status, 403);
      assert.equal((await api(alice, '/api/resources/' + privateState.paper.id + '/publish', 'POST', {}, privateState.resource.version)).status, 403);
      const draft = state.paper; draft.title = '教师未发布的新稿'; draft.questions[0].scenes[0].snapshot.scene.objects[0].value = 3;
      assert.equal((await api(teacher, '/api/resources/' + sharedId, 'PUT', {paper: draft}, state.resource.version)).status, 200);
      assert.equal((await api(alice, '/api/resources/' + sharedId)).value.paper.title, '虚构验收试卷');
      const local = shared.value.paper; local.questions[0].scenes[0].snapshot.scene.objects[0].value = 4;
      ownCopy = (await api(alice, '/api/resources/' + sharedId + '/fork', 'POST', {paper: local})).value;
      assert.notEqual(ownCopy.paper.id, sharedId); assert.equal(ownCopy.paper.questions[0].scenes[0].snapshot.scene.objects[0].value, 4);
      assert.equal((await api(alice, '/api/resources/' + sharedId)).value.paper.questions[0].scenes[0].snapshot.scene.objects[0].value, 1.5);
    });
    await t.test('document candidates remain staged until commitment and are owner-bound', async () => {
      const input = {paper: privateState.paper, filename: 'synthetic.docx', data: Buffer.from(docx).toString('base64')};
      const preview = await api(alice, '/api/resources/' + privateState.paper.id + '/documents', 'POST', input, privateState.resource.version); assert.equal(preview.status, 200); pending = preview.value;
      assert.equal(pending.candidates.length, 2);
      assert.equal((await api(alice, '/api/resources/' + privateState.paper.id)).value.paper.questions.length, 1);
      assert.equal((await api(bob, '/api/imports/' + pending.id, 'DELETE')).status, 404);
      const committed = await api(alice, '/api/resources/' + privateState.paper.id + '/commit', 'POST', {paper: privateState.paper, id: pending.id, questions: pending.candidates}, privateState.resource.version);
      assert.equal(committed.status, 200); assert.equal(committed.value.paper.questions.length, 3); privateState = committed.value;
    });
    await t.test('cropped images register before metadata saves and exports remain portable', async () => {
      const response = await api(alice, '/api/resources/' + privateState.paper.id + '/image', 'POST', {paper: privateState.paper, url: 'data:image/png;base64,' + png.toString('base64'), name: '合成裁题.png'}, privateState.resource.version);
      assert.equal(response.status, 200); const asset = response.value;
      privateState.paper.assets[asset.id] = asset; privateState.paper.questions[0].attachments.push({id: asset.id});
      assert.equal((await api(alice, '/api/resources/' + privateState.paper.id, 'PUT', {paper: privateState.paper}, asset.version)).status, 200);
      privateState = (await api(alice, '/api/resources/' + privateState.paper.id)).value;
      const html = await api(alice, '/api/resources/' + privateState.paper.id + '/export', 'POST', {paper: privateState.paper, kind: 'html'}); assert.equal(html.status, 200);
      const restored = htmlPaper(html.text); assert.equal(restored.questions.length, 3); assert.ok(Object.values(restored.assets).every(a => a.url));
      assert.doesNotMatch(html.text, /<script src="web-host/); validatePaper(restored, {portable: true});
    });
    await t.test('unpublishing revokes shared access while personal copies remain usable', async () => {
      const state = (await api(teacher, '/api/resources/' + sharedId)).value;
      assert.equal((await api(teacher, '/api/resources/' + sharedId + '/publish', 'DELETE', undefined, state.resource.version)).status, 200);
      assert.equal((await api(alice, '/api/resources/' + sharedId)).status, 404);
      assert.equal((await api(alice, '/api/resources/' + ownCopy.paper.id)).status, 200);
    });
    await t.test('fresh login and process restart recover server data, sessions and assets', async () => {
      const fresh = await api(null, '/api/auth/login', 'POST', {username: 'qa-alice', password: 'Student-test-2026'}); assert.equal(fresh.status, 200);
      const device = {cookie: fresh.headers.get('set-cookie').split(';')[0], csrf: fresh.value.csrf};
      assert.equal((await api(device, '/api/resources/' + privateState.paper.id)).value.paper.title, '学生甲自己的改编');
      await assert.rejects(() => createExamServer(options), /另一服务/);
      await app.close(); app = await createExamServer(options); await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
      const reopened = await api(device, '/api/resources/' + privateState.paper.id); assert.equal(reopened.status, 200); assert.equal(reopened.value.paper.questions.length, 3);
      const imageId = Object.keys(reopened.value.paper.assets).find(id => reopened.value.paper.assets[id].mime === 'image/png');
      assert.equal((await api(device, '/api/resources/' + privateState.paper.id + '/assets/' + imageId)).status, 200);
      const bytes = await readFile(join(directory, 'workspace.sqlite')); assert.equal(bytes.subarray(0, 15).toString(), 'SQLite format 3');
    });
    await t.test('teacher can manage invitations and disable/reset student accounts without accessing their private papers', async () => {
      assert.equal((await api(teacher, '/api/classroom', 'PUT', {name: '虚构验收班级', inviteCode: 'new-class-test'})).status, 200);
      assert.equal((await api(null, '/api/auth/register', 'POST', {username: 'qa-oldcode', password: 'Student-test-2026', displayName: '虚构', inviteCode: 'class-test-2026'})).status, 400);
      assert.equal((await api(teacher, '/api/students/' + bob.user.id, 'PUT', {disabled: true})).status, 200);
      assert.equal((await api(bob, '/api/library')).status, 401);
      assert.equal((await api(teacher, '/api/students/' + bob.user.id, 'PUT', {disabled: false, password: 'NewStudent-test-2026'})).status, 200);
      assert.equal((await api(null, '/api/auth/login', 'POST', {username: 'qa-bob', password: 'Student-test-2026'})).status, 401);
      assert.equal((await api(null, '/api/auth/login', 'POST', {username: 'qa-bob', password: 'NewStudent-test-2026'})).status, 200);
      const list = await api(teacher, '/api/students'); assert.ok(list.value.students.some(u => u.id === alice.user.id && u.resourceCount > 0)); assert.ok(!JSON.stringify(list.value).includes('password_hash'));
    });
    await t.test('password changes invalidate other sessions and logout ends the active session', async () => {
      const first = await api(null, '/api/auth/login', 'POST', {username: 'qa-bob', password: 'NewStudent-test-2026'}), second = await api(null, '/api/auth/login', 'POST', {username: 'qa-bob', password: 'NewStudent-test-2026'});
      const deviceA = {cookie: first.headers.get('set-cookie').split(';')[0], csrf: first.value.csrf}, deviceB = {cookie: second.headers.get('set-cookie').split(';')[0], csrf: second.value.csrf};
      assert.equal((await api(deviceA, '/api/auth/password', 'POST', {currentPassword: 'wrong', password: 'UpdatedStudent-2026'})).status, 400);
      assert.equal((await api(deviceA, '/api/auth/password', 'POST', {currentPassword: 'NewStudent-test-2026', password: 'UpdatedStudent-2026'})).status, 200);
      assert.equal((await api(deviceB, '/api/library')).status, 401); assert.equal((await api(deviceA, '/api/library')).status, 200);
      assert.equal((await api(deviceA, '/api/auth/logout', 'POST')).status, 200); assert.equal((await api(deviceA, '/api/library')).status, 401);
      const encoded = app.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(bob.user.id).password_hash; assert.match(encoded, /^scrypt:/); assert.ok(!encoded.includes('UpdatedStudent'));
    });
    await t.test('quota, image-content checks and static path restrictions reject invalid imports without replacing saved data', async () => {
      const before = (await api(alice, '/api/library')).value.mine.length, quota = app.service.resources.quotaBytes;
      app.service.resources.quotaBytes = app.service.resources.usedBytes(alice.user.id) + 1;
      assert.equal((await api(alice, '/api/import', 'POST', {filename: 'quota.json', data: Buffer.from(JSON.stringify(fixture().paper)).toString('base64')})).status, 413);
      app.service.resources.quotaBytes = quota;
      const malformed = fixture().paper, picture = Object.values(malformed.assets).find(asset => asset.mime === 'image/png'); picture.mime = 'image/jpeg'; picture.url = picture.url.replace('image/png', 'image/jpeg');
      assert.equal((await api(alice, '/api/import', 'POST', {filename: 'wrong-image.json', data: Buffer.from(JSON.stringify(malformed)).toString('base64')})).status, 400);
      assert.equal((await api(alice, '/api/library')).value.mine.length, before);
      assert.equal((await fetch(origin + '/sample.tijingexam')).status, 404); assert.equal((await fetch(origin + '/server/exam/main.mjs')).status, 404);
      assert.equal((await fetch(origin + '/%2e%2e/workspace.sqlite')).status, 404);
    });
  } finally { await app.close(); }
});
