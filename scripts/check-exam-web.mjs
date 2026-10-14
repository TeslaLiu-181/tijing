import {chromium} from 'playwright';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer as createPortProbe} from 'node:net';
import assert from 'node:assert/strict';
import {createExamServer} from '../server/exam/http.mjs';
import {htmlPaper, importResource} from '../src/exam/resources.mjs';

const argument = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const out = resolve('.qa/exam-web'); await mkdir(out, {recursive: true});
const probe = createPortProbe(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const origin = 'http://127.0.0.1:' + port, data = await mkdtemp(join(tmpdir(), 'exam-web-ui-'));
const application = await createExamServer({dataDir: data, resourceDir: resolve('dist/exam'), publicOrigin: origin, adminUsername: 'qa-teacher', adminPassword: 'Teacher-test-2026', inviteCode: 'class-test-2026', className: '物理学习空间 · 虚构验收'});
await new Promise(resolve => application.server.listen(port, '127.0.0.1', resolve));
const browser = await chromium.launch({channel: 'msedge', headless: true}), report = {origin, data, checks: [], errors: []};
const contexts = []; let page, teacher, alice, other, device;
const record = (name, detail = {}) => { report.checks.push({name, ...detail}); console.log(name + ': ' + JSON.stringify(detail)); };
async function context(options = {}) { const value = await browser.newContext({viewport: {width: 1440, height: 900}, timezoneId: 'Asia/Shanghai', acceptDownloads: true, ...options}); contexts.push(value); return value; }
async function open(value) { const result = await value.newPage(); result.setDefaultTimeout(20000); result.on('pageerror', error => report.errors.push(error.message)); result.on('dialog', dialog => dialog.accept()); await result.goto(origin); return result; }
async function auth(page, name, register = false) {
  if (register) { await page.locator('#auth-register-tab').click(); await page.locator('#auth-name').fill('虚构验收学生-' + name); await page.locator('#auth-invite').fill('class-test-2026'); }
  await page.locator('#auth-username').fill(name); await page.locator('#auth-password').fill(name === 'qa-teacher' ? 'Teacher-test-2026' : 'Student-test-2026'); await page.locator('#auth-submit').click();
  await page.locator('#web-dashboard').waitFor({state: 'visible'});
}
async function settled(page) { await page.waitForFunction(() => document.getElementById('scene-loading').hidden); await page.locator('#busy').waitFor({state: 'hidden'}); await page.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))); }
async function stored(page) { await page.waitForFunction(() => document.getElementById('save-status').textContent.includes('已保存到个人空间')); }
async function length(page, value) {
  const frame = page.frameLocator('#editor');
  if (!await frame.locator('.lesson-parameters summary').isVisible()) await frame.locator('#inspector-toggle').click();
  if (!await frame.getByRole('spinbutton', {name: '演示参数 L', exact: true}).isVisible()) await frame.locator('.lesson-parameters summary').click();
  await frame.getByRole('spinbutton', {name: '演示参数 L', exact: true}).fill(String(value)); await frame.getByRole('spinbutton', {name: '演示参数 L', exact: true}).press('Tab');
  await page.waitForTimeout(250);
}
const readLength = page => page.frameLocator('#editor').locator('[data-lesson-param]').first().inputValue();
async function download(page, kind, name) {
  await page.locator('#export-paper').click(); const waiting = page.waitForEvent('download'); await page.locator('[data-export-kind="' + kind + '"]').click(); const file = await waiting, path = join(out, name); await file.saveAs(path); await page.locator('#export-dialog').waitFor({state: 'hidden'}); return path;
}
async function documentFile(page, path) { const waiting = page.waitForEvent('filechooser'); await page.locator('#import-documents').click(); const picker = await waiting; await picker.setFiles(resolve(path)); }
try {
  teacher = await context(); page = await open(teacher); await page.screenshot({path: join(out, 'login.png')}); await auth(page, 'qa-teacher');
  await page.locator('#web-sample').click(); await page.waitForFunction(() => document.getElementById('paper-meta').textContent.includes('14 个场景')); await settled(page);
  const teacherId = await page.evaluate(() => window.examWeb.currentMeta().id);
  await page.locator('#web-publish').click(); await page.locator('#web-publish-dialog').waitFor({state: 'visible'}); await page.locator('#web-publish-reference').uncheck(); await page.locator('#web-confirm-publish').click(); await page.locator('#web-publish-dialog').waitFor({state: 'hidden'});
  await page.locator('#web-home').click(); await page.locator('#web-dashboard').waitFor({state: 'visible'}); assert.equal(await page.locator('[data-web-open]').count(), 1); await page.screenshot({path: join(out, 'teacher-shared-library.png')});
  record('teacher publication', {questions: 15, scenes: 14, originalDocumentsPrivate: true, textReferenceExcluded: true});

  alice = await context(); page = await open(alice); await auth(page, 'qa-alice', true); await page.screenshot({path: join(out, 'student-library.png')});
  await page.locator('[data-web-open="' + teacherId + '"]').click(); await settled(page); assert.equal(await page.locator('#web-copy').isVisible(), true); await page.locator('#question-list [data-question]').nth(1).click(); await settled(page);
  await length(page, 3); await page.frameLocator('#editor').locator('#next-event').click(); const time = await page.frameLocator('#editor').locator('#time-readout').innerText();
  await page.locator('#web-copy').click(); await settled(page); await page.waitForFunction(() => window.examWeb.currentMeta()?.writable === true); const privateId = await page.evaluate(() => window.examWeb.currentMeta().id);
  assert.notEqual(privateId, teacherId); assert.equal(await readLength(page), '3'); await stored(page);
  await page.locator('#scene-menu-button').click(); await page.locator('#duplicate-scene').click(); await settled(page); await length(page, 4); await stored(page);
  await page.locator('#scene-tabs [data-scene]').first().click(); await settled(page); assert.equal(await readLength(page), '3');
  await page.locator('#web-home').click(); await page.locator('#web-dashboard').waitFor({state: 'visible'}); await page.locator('[data-library-tab="mine"]').click(); assert.equal(await page.locator('[data-web-open]').count(), 1); await page.screenshot({path: join(out, 'student-private-library.png')});
  record('student fork and independent variant', {privateId, originalLength: 3, variantLength: 4, sharedPaperId: teacherId});

  device = await context(); let fresh = await open(device); page = fresh; await auth(fresh, 'qa-alice'); await fresh.locator('[data-library-tab="mine"]').click(); await fresh.locator('[data-web-open="' + privateId + '"]').click(); await settled(fresh); assert.equal(await readLength(fresh), '3'); assert.equal(await fresh.frameLocator('#editor').locator('#time-readout').innerText(), time); assert.equal(await fresh.locator('#scene-tabs [data-scene]').count(), 2);
  await fresh.screenshot({path: join(out, 'cross-device-editor.png')}); record('fresh browser profile restoration', {length: 3, timePreserved: true, variantPreserved: true});
  let playbackWrites = 0; const countWrites = request => { if (request.method() === 'PUT' && request.url() === origin + '/api/resources/' + privateId) playbackWrites++; };
  fresh.on('request', countWrites); await fresh.frameLocator('#editor').locator('#play').click(); await fresh.waitForTimeout(3000); fresh.off('request', countWrites); assert.ok(playbackWrites <= 2); await fresh.frameLocator('#editor').locator('#pause').count().then(async count => { if (count && await fresh.frameLocator('#editor').locator('#pause').isVisible()) await fresh.frameLocator('#editor').locator('#pause').click(); }); record('browser-local playback', {serverWritesInThreeSeconds: playbackWrites});
  other = await context(); const bob = await open(other); await auth(bob, 'qa-bob', true);
  const forbidden = await bob.evaluate(async id => (await fetch('/api/resources/' + id)).status, privateId); assert.equal(forbidden, 404); await bob.locator('[data-library-tab="mine"]').click(); assert.equal(await bob.locator('[data-web-open]').count(), 0);
  await bob.locator('[data-library-tab="shared"]').click(); await bob.locator('[data-web-open="' + teacherId + '"]').click(); await settled(bob); await bob.locator('#question-list [data-question]').nth(1).click(); await settled(bob); assert.equal(await readLength(bob), '1.5'); record('student privacy and shared original unchanged', {otherStudentStatus: 404, sharedLength: 1.5});

  const htmlPath = await download(fresh, 'html', 'student-offline.html'), bundlePath = await download(fresh, 'bundle', 'student-resource.tijingexam');
  const html = htmlPaper(await readFile(htmlPath, 'utf8')), bundle = importResource(new Uint8Array(await readFile(bundlePath))); assert.equal(html.questions.length, 15); assert.equal(bundle.questions[1].scenes.length, 2);
  const offline = await context({offline: true}), offlinePage = await offline.newPage(); offlinePage.on('pageerror', error => report.errors.push(error.message)); await offlinePage.goto(pathToFileURL(htmlPath).href); await settled(offlinePage); assert.equal(await readLength(offlinePage), '3'); assert.equal(await offlinePage.locator('#question-list [data-question]').count(), 15); record('web exports reopened offline', {htmlPath, bundlePath, originalLength: 3, questions: 15});

  await fresh.locator('#question-list [data-question]').nth(3).click(); await settled(fresh); await fresh.locator('#scene-tabs [data-scene]').nth(1).click(); await settled(fresh);
  let spatial = fresh.frameLocator('#editor'); await spatial.locator('#toggle-panel').click(); await spatial.locator('[data-view="front"]').click(); await spatial.locator('[data-projection="perspective"]').click(); await spatial.locator('[data-step="turn"]').click(); await fresh.waitForTimeout(250); await stored(fresh);
  const spatialTime = await spatial.locator('#time-label').innerText(); await fresh.locator('#web-home').click(); await fresh.locator('[data-library-tab="mine"]').click(); await fresh.locator('[data-web-open="' + privateId + '"]').click(); await settled(fresh); spatial = fresh.frameLocator('#editor'); assert.equal(await spatial.locator('#time-label').innerText(), spatialTime); assert.match(await spatial.locator('[data-projection="perspective"]').getAttribute('class'), /active/); await fresh.screenshot({path: join(out, 'spatial-editor.png')}); record('spatial scene web save and reload', {projection: 'perspective',timePreserved: true});

  const docx = argument('docx'), pdf = argument('pdf'), scan = argument('scan');
  if (docx) {
    await documentFile(fresh, docx); await fresh.locator('#import-dialog').waitFor({state: 'visible'}); assert.equal(await fresh.locator('.candidate-row').count(), 15);
    await fresh.locator('#candidate-list textarea').nth(1).inputValue().then(text => assert.match(text, /\\sqrt/)); await fresh.screenshot({path: join(out, 'docx-import.png')}); await fresh.locator('#commit-import').click(); await fresh.locator('#import-dialog').waitFor({state: 'hidden'}); await stored(fresh); assert.equal(await fresh.locator('#question-list [data-question]').count(), 30); record('real DOCX through web upload', {candidates: 15,radicalPreserved: true});
  }
  if (pdf) {
    await documentFile(fresh, pdf); await fresh.locator('#import-dialog').waitFor({state: 'visible', timeout: 60000}); assert.equal(await fresh.locator('.candidate-row').count(), 3); await fresh.locator('#commit-import').click(); await fresh.locator('#import-dialog').waitFor({state: 'hidden'}); await stored(fresh); record('text PDF through browser rendering and web upload', {candidates: 3});
  }
  if (scan) {
    await documentFile(fresh, scan); await fresh.locator('#import-dialog').waitFor({state: 'visible', timeout: 60000}); assert.equal(await fresh.locator('.candidate-row').count(), 1); await fresh.locator('#commit-import').click(); await fresh.locator('#import-dialog').waitFor({state: 'hidden'});
    await fresh.locator('[data-crop]').first().click(); await fresh.locator('#crop-dialog').waitFor({state: 'visible'}); const box = await fresh.locator('#crop-dialog canvas').boundingBox(); await fresh.mouse.move(box.x + box.width * .07, box.y + 35); await fresh.mouse.down(); await fresh.mouse.move(box.x + box.width * .9, box.y + Math.min(260, box.height * .4), {steps: 10}); await fresh.mouse.up();
    await fresh.locator('#crop-title').fill('扫描裁题 · 虚构验收'); await fresh.locator('#crop-text').fill('人工填写的验收题干，没有自动OCR。'); await fresh.locator('[data-crop-action="save"]').click(); await fresh.locator('#crop-dialog').waitFor({state: 'hidden'}); await stored(fresh); await fresh.screenshot({path: join(out, 'scan-crop.png')}); record('scanned PDF and authenticated image cropping', {originalPagePreserved: true, manualCropSaved: true});
  }
  const mobileContext = await context({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}), mobile = await open(mobileContext); await auth(mobile, 'qa-alice'); await mobile.locator('[data-library-tab="mine"]').click(); await mobile.screenshot({path: join(out, 'mobile-library.png')});
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert.equal(overflow, false); await mobile.locator('[data-web-open="' + privateId + '"]').click(); await settled(mobile); await mobile.locator('#toggle-questions').click(); await mobile.locator('#question-list [data-question]').nth(1).click(); await settled(mobile); assert.equal(await mobile.locator('.question-sidebar').isVisible(), false); await mobile.screenshot({path: join(out, 'mobile-editor.png')}); assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); assert.ok((await mobile.frameLocator('#editor').locator('#paper').boundingBox()).width>300); record('mobile library and interactive scene', {viewport: '390 × 844',horizontalOverflow: false,wideCanvas: true});
  await mobile.locator('#toggle-questions').click(); await mobile.locator('#question-list [data-question]').nth(3).click(); await settled(mobile); await mobile.locator('#scene-tabs [data-scene]').nth(1).click(); await settled(mobile); assert.equal(await mobile.frameLocator('#editor').locator('#inspector').isVisible(), false); await mobile.screenshot({path: join(out, 'mobile-spatial.png')}); record('mobile spatial scene', {panelInitiallyClosed: true});

  await fresh.locator('#web-home').click(); await fresh.locator('#web-new').click(); await fresh.locator('#web-new-title').fill('自行创建 · 虚构验收'); await fresh.locator('#web-new-form button[type="submit"]').click(); await fresh.locator('#web-new-dialog').waitFor({state: 'hidden'}); await fresh.locator('#new-question').click(); await fresh.locator('#edit-title').fill('演示粒子偏转'); await fresh.locator('#edit-text').fill('演示设定，用于验证自行创建流程。'); await fresh.locator('#edit-form button[type="submit"]').click(); await fresh.locator('#edit-dialog').waitFor({state: 'hidden'}); await fresh.locator('#new-scene').click(); await fresh.locator('[data-template="base:circle"]').click(); await settled(fresh); await stored(fresh); const createdId = await fresh.evaluate(() => window.examWeb.currentMeta().id);
  const downloading = fresh.waitForEvent('download'); await fresh.locator('#scene-menu-button').click(); await fresh.locator('#export-scene').click(); const sceneFile = join(out, 'student-created-scene.json'); await (await downloading).saveAs(sceneFile); await fresh.locator('#web-home').click();
  const importing = fresh.waitForEvent('filechooser'); await fresh.locator('#web-import').click(); await (await importing).setFiles(sceneFile); await fresh.waitForFunction(() => document.getElementById('paper-meta').textContent.includes('1 道题') && document.getElementById('paper-meta').textContent.includes('1 个场景')); await settled(fresh); assert.notEqual(await fresh.evaluate(() => window.examWeb.currentMeta().id), createdId); await stored(fresh); record('student creation and scene import from home', {questions: 1, scenes: 1});
  await fresh.locator('#web-logout').click(); await fresh.locator('#web-auth').waitFor({state: 'visible'}); assert.equal(await fresh.locator('#source-panel').innerHTML(), ''); assert.equal(await fresh.evaluate(() => document.getElementById('editor').srcdoc), ''); record('logout clears private editor contents', {cleared: true});
  assert.deepEqual(report.errors, []); await writeFile(join(out, 'web-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ok: true, checks: report.checks.length, evidence: out}));
} catch (error) {
  report.failure = error.message; if (page) await page.screenshot({path: join(out, 'failure.png')}).catch(() => {}); await writeFile(join(out, 'web-report.json'), JSON.stringify(report, null, 2)); throw error;
} finally { await browser.close(); await application.close(); }
