import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {topics} from '../src/guide-curriculum.mjs';

mkdirSync('.qa/guide-gallery',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1536,height:1000},offline:true});
const page=await context.newPage(),errors=[],requests=[],coverage=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
await page.goto(pathToFileURL(resolve('安培力三维实验室.html')).href);await page.waitForFunction(()=>window.guide?.snapshot().webgl);await page.evaluate(()=>document.fonts.ready);
const snapshot=()=>page.evaluate(()=>window.guide.snapshot());
assert.equal((await snapshot()).topicCount,19);
assert.equal(await page.evaluate(()=>document.fonts.check('16px KaTeX_Main')),true);
for(const [position,topic] of topics.entries()){
 await page.locator(`[data-topic="${topic.id}"]`).click();
 const group={topic:topic.id,questions:[],hands:[]};
 assert.equal(await page.locator('#question-tabs button').count(),topic.questions.length);
 for(let i=0;i<topic.questions.length;i++){
  await page.locator(`[data-question="${i}"]`).click();let s=await snapshot();assert.equal(s.reveal,0);assert.equal(s.hand,null);
  assert.ok(!/正确路径.*[ABCD]/.test(await page.locator('#current-question').textContent()));
  assert.ok((await page.locator('#current-question').textContent()).trim());
  if(topic.questions[i].arrangement!=='parallel')assert.ok(await page.locator('#source-figures img').evaluateAll(imgs=>imgs.length>0&&imgs.every(img=>img.complete&&img.naturalWidth>0)));
  for(let j=0;j<topic.questions[i].steps.length;j++)await page.locator('#reveal-next').click();
  s=await snapshot();assert.equal(s.reveal,topic.questions[i].steps.length);assert.equal(await page.locator('.solution-step').count(),topic.questions[i].steps.length);
  assert.equal(s.mathErrors.length,0,JSON.stringify(s.mathErrors));group.questions.push({index:i,revealed:s.reveal,status:s.model.status,metric:s.model.metric});
 }
 for(let part=0;part<topic.parts.length;part++){await page.locator('#part-select').selectOption(String(part));assert.equal((await snapshot()).part,part);}
 await page.locator('#part-select').selectOption('0');
 for(const hand of ['left','right']){
  const button=page.locator(`[data-hand="${hand}"]`);
  if(await button.isEnabled()){
   await button.click();assert.equal((await snapshot()).audit.hand.type,hand);
   await page.locator('#hand-next').click();await page.locator('#hand-next').click();
   await page.locator('#focus-hand').click();assert.equal((await snapshot()).camera.focused,true);
   await page.locator('[data-view="source"]').click();await page.locator('#hide-hand').click();group.hands.push(hand);
  }
 }
 await page.locator('[data-question="0"]').click();
 await page.locator('[data-view="source"]').click();await page.locator('[data-paper="question"]').click();
 await page.locator('#layer-field').check();await page.locator('#layer-forces').check();
 await page.screenshot({path:`.qa/guide-gallery/${String(position+1).padStart(2,'0')}-${topic.id}.png`,fullPage:true});
 coverage.push(group);console.log('checked',position+1,topic.id,group.questions.length,'questions');
}

await page.locator('[data-topic="example-1"]').click();await page.locator('[data-question="1"]').click();
let s=await snapshot();assert.ok(Math.abs(s.model.metric.a-3.2)<1e-8);
 await page.locator('#part-select').selectOption('1');assert.ok(await page.locator('[data-hand="left"]').isDisabled());await page.locator('#part-select').selectOption('0');
await page.locator('[data-mode="explore"]').click();assert.equal((await snapshot()).mode,'explore');
const set=async(key,value)=>{await page.locator(`#parameter-${key}`).fill(String(value));await page.locator(`#parameter-${key}`).press('Tab');};
await set('B',1.4);s=await snapshot();assert.equal(s.params.B,1.4);
await page.locator('[data-view="free"]').click();await page.locator('[data-projection="perspective"]').click();
const beforeSave=await snapshot();const downloaded=page.waitForEvent('download');await page.locator('#save-state').click();const download=await downloaded;
const savedPath=resolve('.qa/saved-classroom.json');await download.saveAs(savedPath);
assert.equal(JSON.parse(readFileSync(savedPath,'utf8')).params.B,1.4);
await page.locator('[data-topic="example-3"]').click();await page.locator('#state-file').setInputFiles(savedPath);await page.waitForFunction(()=>window.guide.snapshot().topic==='example-1');
s=await snapshot();assert.equal(s.question,1);assert.equal(s.mode,'explore');assert.equal(s.params.B,1.4);assert.equal(s.reveal,0);assert.equal(s.hand,null);assert.equal(s.camera.projection,'perspective');assert.deepEqual(s.camera.position,beforeSave.camera.position);
const invalid=JSON.parse(readFileSync(savedPath,'utf8'));invalid.params.B=Infinity;writeFileSync('.qa/invalid-classroom.json',JSON.stringify(invalid));await page.locator('#state-file').setInputFiles(resolve('.qa/invalid-classroom.json'));await page.waitForFunction(()=>document.getElementById('toast').textContent.startsWith('未载入'));assert.equal((await snapshot()).params.B,1.4);
await page.locator('[data-mode="lesson"]').click();assert.equal((await snapshot()).params.B,1);assert.equal((await snapshot()).reveal,0);
await page.locator('[data-mode="explore"]').click();await set('B',0);assert.ok(await page.locator('[data-hand="left"]').isDisabled());
await set('B',1);await page.locator('#parallel-field').click();assert.ok((await snapshot()).model.metric.F<1e-8);assert.ok(await page.locator('[data-hand="left"]').isDisabled());
await page.locator('#parallel-field').click();await page.locator('#reverse-current').click();assert.equal((await snapshot()).audit.batteries[0].positiveSide,1);

await page.locator('[data-topic="exercise-9"]').click();await page.locator('[data-mode="explore"]').click();await set('tau',2);s=await snapshot();assert.equal(s.model.metric.v,0);assert.equal(s.model.metric.f,10);
await set('tau',0);await page.locator('#play-trend').click();await page.waitForFunction(()=>window.guide.snapshot().params.tau>.2);await page.locator('#play-trend').click();const paused=(await snapshot()).params.tau;
await page.waitForTimeout(200);assert.equal((await snapshot()).params.tau,paused);await page.locator('#play-trend').click();await page.waitForFunction(old=>window.guide.snapshot().params.tau>old,paused);await page.locator('#play-trend').click();

await page.locator('[data-topic="guide-balance"]').click();await page.locator('[data-mode="lesson"]').click();await page.locator('[data-view="free"]').click();
let box=await page.locator('#three-viewport canvas').boundingBox(),before=(await snapshot()).camera.position;
await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6,{steps:7});await page.mouse.up();assert.notDeepEqual((await snapshot()).camera.position,before);
await page.locator('[data-projection="ortho"]').click();const zoom=(await snapshot()).camera.zoom;box=await page.locator('#three-viewport canvas').boundingBox();await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.wheel(0,-150);await page.waitForTimeout(100);assert.ok((await snapshot()).camera.zoom>zoom);
await page.locator('[data-view="plane"]').click();s=await snapshot();assert.ok(Math.abs(s.camera.position[0]-s.camera.target[0])<1e-7);
await page.locator('[data-projection="perspective"]').click();assert.equal((await snapshot()).camera.view,'plane');
await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement);await page.locator('#fullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);
await page.locator('#enlarge-figure').click();assert.ok(await page.locator('#figure-dialog').isVisible());await page.locator('[data-close="figure-dialog"]').click();
await page.locator('#help-button').click();assert.ok(await page.locator('#help-dialog').isVisible());await page.locator('[data-close="help-dialog"]').click();
await page.locator('[data-view="source"]').click();await page.locator('[data-projection="ortho"]').click();await page.locator('.toast.visible').waitFor({state:'hidden'});
for(const [width,height,name] of [[1366,768,'projector'],[390,844,'mobile']]){
 await page.setViewportSize({width,height});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`.qa/guide-${name}.png`,fullPage:true});
}
s=await snapshot();assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);assert.deepEqual(s.mathErrors,[]);
writeFileSync('.qa/guide-browser-report.json',JSON.stringify({passed:true,browser:browser.version(),offline:true,errors,requests,coverage,mathErrors:s.mathErrors},null,2));
await browser.close();console.log('All guide browser checks passed.');
await import('./guide-focused-check.mjs');
