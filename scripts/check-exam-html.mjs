import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {htmlPaper} from '../src/exam/resources.mjs';

const argument=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const input=resolve(argument('html')||'dist/exam/专题强化6整卷可视化.html'),bundle=resolve(argument('bundle')||'dist/exam/sample.tijingexam');
const output=resolve('.qa/exam-workbench');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),report={input,errors:[],network:[],checks:[]};
let context,page;
const record=(name,detail={})=>{report.checks.push({name,...detail});console.log(name+': '+JSON.stringify(detail));};
async function open(path){
 context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5,acceptDownloads:true,offline:true});page=await context.newPage();page.setDefaultTimeout(20000);
 page.on('pageerror',error=>report.errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))report.network.push(request.url());});page.on('dialog',dialog=>dialog.accept());
 await page.goto(pathToFileURL(path).href);await page.waitForFunction(()=>document.getElementById('mode-label').textContent==='离线课件 · 可改编');await settled();
}
async function settled(){await page.waitForFunction(()=>document.getElementById('scene-loading').hidden);await page.locator('#busy').waitFor({state:'hidden'});await page.evaluate(()=>document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))));}
async function setLength(value){const frame=page.frameLocator('#editor');if(!await frame.locator('.lesson-parameters summary').isVisible())await frame.locator('#inspector-toggle').click();if(!await frame.getByRole('spinbutton',{name:'演示参数 L',exact:true}).isVisible())await frame.locator('.lesson-parameters summary').click();await frame.getByRole('spinbutton',{name:'演示参数 L',exact:true}).fill(String(value));await frame.getByRole('spinbutton',{name:'演示参数 L',exact:true}).press('Tab');}
const length=()=>page.frameLocator('#editor').locator('[data-lesson-param]').first().inputValue();
async function download(kind,name){await page.locator('#export-paper').click();const waiting=page.waitForEvent('download');await page.locator('[data-export-kind="'+kind+'"]').click();const downloaded=await waiting,path=join(output,name);await downloaded.saveAs(path);await settled();return path;}
try{
 await open(input);assert.equal(await page.locator('#question-list [data-question]').count(),15);
 await page.locator('#question-list [data-question]').nth(1).click();await settled();assert.ok(await page.locator('#source-panel .katex').count()>0);assert.equal(await page.locator('.answer-reference').getAttribute('open'),null);
 await setLength(3);await page.frameLocator('#editor').locator('#next-event').click();const time=await page.frameLocator('#editor').locator('#time-readout').innerText();
 await page.locator('#next-question').click();await settled();await page.locator('#previous-question').click();await settled();assert.equal(await length(),'3');assert.equal(await page.frameLocator('#editor').locator('#time-readout').innerText(),time);
 await page.locator('#scene-menu-button').click();await page.locator('#duplicate-scene').click();await settled();await setLength(4);
 await page.locator('#scene-tabs [data-scene]').first().click();await settled();assert.equal(await length(),'3');await page.locator('#scene-tabs [data-scene]').nth(1).click();await settled();assert.equal(await length(),'4');
 await page.locator('#edit-question').click();const stem=(await page.locator('#edit-text').inputValue())+'\n\n验收：L 改为演示值 4；符号关系仍由教师核对。';await page.locator('#edit-text').fill(stem);await page.locator('#edit-form button[type="submit"]').click();await page.locator('#edit-dialog').waitFor({state:'hidden'});
 record('offline edits and question/variant switching',{originalLength:3,variantLength:4,timePreserved:true,stemEdited:true,formulaRendered:true});
 const changedHTML=await download('html','classroom-reexport.html'),changed=htmlPaper(await readFile(changedHTML,'utf8'));assert.equal(changed.questions[1].sourceText,stem);assert.equal(changed.questions[1].scenes[0].snapshot.scene.objects[0].value,3);assert.equal(changed.questions[1].scenes[1].snapshot.scene.objects[0].value,4);assert.ok(Object.values(changed.assets).some(asset=>asset.url));
 // The original file offers the more recent local draft instead of silently
 // replacing its exported content. The new export is tested in a fresh profile.
 await page.reload();await settled();await page.locator('#draft-recovery').waitFor({state:'visible'});await page.locator('#restore-draft').click();await page.locator('#draft-recovery').waitFor({state:'hidden'});await settled();assert.equal(await length(),'4');record('local draft recovery',{restoredLength:4});await context.close();
 await open(changedHTML);assert.equal(await length(),'4');assert.match(await page.locator('#source-panel').innerText(),/L 改为演示值 4/);record('reexport opened in fresh profile',{path:changedHTML,imagesPreserved:true});
 await page.locator('#question-list [data-question]').nth(3).click();await settled();await page.locator('#scene-tabs [data-scene]').nth(1).click();await settled();let frame=page.frameLocator('#editor');await frame.locator('#toggle-panel').click();await frame.locator('[data-view="front"]').click();await frame.locator('#zoom-in').click();await frame.locator('#zoom-in').click();const planeBefore=await frame.getByText('界面 Ⅰ',{exact:true}).boundingBox();
 await page.locator('#scene-tabs [data-scene]').first().click();await settled();await page.locator('#scene-tabs [data-scene]').nth(1).click();await settled();frame=page.frameLocator('#editor');const planeAfter=await frame.getByText('界面 Ⅰ',{exact:true}).boundingBox();assert.ok(Math.abs(planeBefore.x-planeAfter.x)<1&&Math.abs(planeBefore.y-planeAfter.y)<1);record('orthographic framing preserved',{maximumLabelDrift:Math.max(Math.abs(planeBefore.x-planeAfter.x),Math.abs(planeBefore.y-planeAfter.y))});
 await frame.locator('#fit').click();await frame.locator('[data-projection="perspective"]').click();await frame.locator('[data-step="turn"]').click();const spatialTime=await frame.locator('#time-label').innerText();
 const spatialHTML=await download('html','classroom-spatial-reexport.html');await context.close();await open(spatialHTML);frame=page.frameLocator('#editor');assert.ok((await frame.locator('[data-projection="perspective"]').getAttribute('class')).includes('active'));assert.equal(await frame.locator('#time-label').innerText(),spatialTime);const dimensions=await frame.locator('canvas').evaluate(c=>({canvas:c.getBoundingClientRect().width,container:c.parentElement.getBoundingClientRect().width,dpr:devicePixelRatio}));assert.ok(Math.abs(dimensions.canvas-dimensions.container)<1);await page.screenshot({path:join(output,'html-spatial.png')});record('spatial state reexport',{projection:'perspective',timePreserved:true,canvasFits:true,deviceScaleFactor:dimensions.dpr});
 await page.locator('#lecture-mode').click();await page.waitForFunction(()=>document.body.classList.contains('lecture'));await page.setViewportSize({width:1280,height:720});await settled();const width=await page.locator('#editor').evaluate(e=>e.getBoundingClientRect().width);assert.ok(width>1200);assert.equal(await page.locator('.question-sidebar').isVisible(),false);await page.screenshot({path:join(output,'html-lecture.png')});await page.locator('#lecture-mode').click();record('lecture layout',{viewport:'1280 × 720',canvasWidth:width});
 await page.locator('#resource-input').setInputFiles(bundle);await page.locator('#busy').waitFor({state:'hidden'});await page.waitForFunction(()=>document.getElementById('paper-meta').textContent.includes('14 个场景'));await settled();assert.equal(await page.locator('#question-list [data-question]').count(),15);await page.locator('#question-list [data-question]').nth(1).click();await settled();assert.equal(await page.locator('#scene-tabs [data-scene]').count(),1);
 await page.setViewportSize({width:1440,height:900});await page.locator('#source-panel img').first().waitFor({state:'visible'});assert.ok(await page.locator('#source-panel img').first().evaluate(e=>e.complete&&e.naturalWidth>0));await page.screenshot({path:join(output,'html-layout.png')});record('whole-paper bundle import',{questions:15,scenes:14,sourceImageLoaded:true});
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);record('true offline execution',{externalRequests:0,pageErrors:0});await writeFile(join(output,'html-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,checks:report.checks.length,evidence:output}));
}catch(error){report.failure=error.message;if(page)await page.screenshot({path:join(output,'html-failure.png')}).catch(()=>{});await writeFile(join(output,'html-report.json'),JSON.stringify(report,null,2));throw error;}
finally{await browser.close();}
