import {_electron} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {htmlPaper,importResource} from '../src/exam/resources.mjs';

const argument=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const docx=argument('docx'),textPDF=argument('pdf'),scanPDF=argument('scan'),executable=argument('exe');
if(!docx)throw Error('请用 --docx=... 指定验收用的真实 Word 文档');
const output=resolve(executable?'.qa/exam-workbench/package':'.qa/exam-workbench'),data=join(tmpdir(),'exam-e2e-'+Date.now());await mkdir(output,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const launch=()=>_electron.launch({executablePath:executable?resolve(executable):createRequire(import.meta.url)('electron'),args:[...(!executable?[resolve('desktop/exam/main.mjs')]:[]),'--data-dir='+data,'--hidden'],cwd:tmpdir(),env,timeout:30000});
let application=await launch();
const report={data,errors:[],checks:[]};let page;
const record=(name,detail)=>{report.checks.push({name,...detail});console.log(name+': '+JSON.stringify(detail));};
async function shot(name){await page.locator('#busy').waitFor({state:'hidden'});const value=await application.evaluate(async({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.webContents.setBackgroundThrottling(false);await window.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');return (await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64');});await writeFile(join(output,name),Buffer.from(value,'base64'));}
async function chooseFiles(paths){await application.evaluate(({dialog},paths)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:paths});},paths);}
async function exportTo(kind,path){await application.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},path);await page.locator('#export-paper').click();await page.locator('[data-export-kind="'+kind+'"]').click();await page.locator('#export-dialog').waitFor({state:'hidden'});}
async function settled(){await page.waitForFunction(()=>document.getElementById('scene-loading').hidden);await page.waitForTimeout(120);}
try{
 page=await application.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',error=>report.errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 await page.waitForFunction(()=>document.getElementById('mode-label').textContent==='本机备课');
 await chooseFiles([resolve(docx)]);await page.locator('#import-documents').click();await page.locator('#import-dialog').waitFor({state:'visible'});
 const count=await page.locator('.candidate-row').count();assert.ok(count>1);
 const text=await page.locator('.candidate-row').nth(1).locator('textarea').inputValue();assert.match(text,/\\sqrt/);assert.doesNotMatch(text,/答案/);
 await shot('docx-candidates.png');await page.locator('#commit-import').click();await page.locator('#import-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#question-list [data-question]').count(),count);
 record('DOCX import',{questions:count,formulaPreserved:true,review:'pending'});
 await page.locator('#question-list [data-question]').nth(1).click();await settled();
 await page.locator('#new-scene').click();await page.locator('[data-template="lesson:ex2"]').click();await settled();
 let frame=page.frameLocator('#editor');await frame.locator('#inspector-toggle').click();await frame.locator('.lesson-parameters summary').click();
 await frame.getByRole('spinbutton',{name:'演示参数 L',exact:true}).fill('3');await frame.getByRole('spinbutton',{name:'演示参数 L',exact:true}).press('Tab');await frame.locator('#next-event').click();const time=await frame.locator('#time-readout').innerText();
 await page.locator('#next-question').click();await settled();await page.locator('#previous-question').click();await settled();
 frame=page.frameLocator('#editor');assert.equal(await frame.locator('[data-lesson-param]').first().inputValue(),'3');assert.equal(await frame.locator('#time-readout').innerText(),time);record('question switching',{lengthRestored:3,timePreserved:true});
 await page.locator('#scene-menu-button').click();await page.locator('#duplicate-scene').click();await settled();frame=page.frameLocator('#editor');await frame.locator('.lesson-parameters summary').click();await frame.getByRole('spinbutton',{name:'演示参数 L',exact:true}).fill('4');await frame.getByRole('spinbutton',{name:'演示参数 L',exact:true}).press('Tab');
 await page.locator('#scene-tabs [data-scene]').first().click();await settled();assert.equal(await page.frameLocator('#editor').locator('[data-lesson-param]').first().inputValue(),'3');
 await page.locator('#quick-restore').click();await settled();assert.equal(await page.frameLocator('#editor').locator('[data-lesson-param]').first().inputValue(),'1.5');record('variant isolation',{originalLength:3,variantLength:4,baselineLength:1.5});
 await page.locator('#question-list [data-question]').nth(3).click();await settled();await page.locator('#new-scene').click();await page.locator('[data-template="lesson:ex4"]').click();await settled();
 await page.locator('#new-scene').click();await page.locator('[data-template="spatial:example4"]').click();await settled();frame=page.frameLocator('#editor');await frame.locator('#toggle-panel').click();await frame.locator('[data-view="front"]').click();await frame.locator('[data-projection="perspective"]').click();await frame.locator('[data-step="turn"]').click();const spatialTime=await frame.locator('#time-label').innerText();
 await page.locator('#scene-tabs [data-scene]').first().click();await settled();await page.locator('#scene-tabs [data-scene]').nth(1).click();await settled();frame=page.frameLocator('#editor');assert.ok((await frame.locator('[data-projection="perspective"]').getAttribute('class')).includes('active'));assert.equal(await frame.locator('#time-label').innerText(),spatialTime);
 const dimensions=await frame.locator('canvas').evaluate(c=>({canvas:c.getBoundingClientRect().width,container:c.parentElement.getBoundingClientRect().width,dpr:devicePixelRatio}));assert.ok(Math.abs(dimensions.canvas-dimensions.container)<1);await shot('mixed-scenes.png');record('mixed scene switching',{projection:'perspective',timePreserved:true,canvasFits:true,deviceScaleFactor:dimensions.dpr});
 const htmlPath=join(output,'desktop-export.html'),bundlePath=join(output,'desktop-export.tijingexam');
 await exportTo('html',htmlPath);await exportTo('bundle',bundlePath);
 const html=htmlPaper(await readFile(htmlPath,'utf8')),bundle=importResource(new Uint8Array(await readFile(bundlePath)));assert.equal(html.questions.length,count);assert.equal(bundle.questions.length,count);assert.equal(html.questions[1].scenes.length,2);assert.equal(html.questions[3].scenes[1].kind,'example4');
 record('whole-paper exports',{questions:count,scenes:html.questions.reduce((n,q)=>n+q.scenes.length,0),html:htmlPath,bundle:bundlePath});
 if(textPDF){
  await chooseFiles([resolve(textPDF)]);await page.locator('#import-documents').click();await page.locator('#import-dialog').waitFor({state:'visible',timeout:60000});const pdfCount=await page.locator('.candidate-row').count();assert.equal(pdfCount,3);
  await shot('pdf-candidates.png');await page.locator('#commit-import').click();await page.locator('#import-dialog').waitFor({state:'hidden'});record('text PDF import',{questions:pdfCount,originalPages:true});
 }
 if(scanPDF){
  await chooseFiles([resolve(scanPDF)]);await page.locator('#import-documents').click();await page.locator('#import-dialog').waitFor({state:'visible',timeout:60000});assert.equal(await page.locator('.candidate-row').count(),1);assert.match(await page.locator('.candidate-row small').innerText(),/待整理/);
  await page.locator('#commit-import').click();await page.locator('#import-dialog').waitFor({state:'hidden'});await page.locator('[data-crop]').first().click();await page.locator('#crop-dialog').waitFor({state:'visible'});const box=await page.locator('#crop-dialog canvas').boundingBox();
  await page.mouse.move(box.x+box.width*.08,box.y+Math.min(box.height*.08,90));await page.mouse.down();await page.mouse.move(box.x+box.width*.85,box.y+Math.min(box.height*.34,390),{steps:12});await page.mouse.up();
  await page.locator('#crop-title').fill('扫描裁题验收样本');await page.locator('#crop-text').fill('用于验收的人工题干；没有自动识别或补写条件。');await page.locator('[data-crop-action="save"]').click();await page.locator('#crop-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#question-title').innerText(),'扫描裁题验收样本');
  await shot('scan-cropped.png');record('image-only PDF and crop',{materialItems:1,manualQuestion:true,automaticOCR:false});
 }
 if(executable){
  await page.locator('#import-sample').click();await page.waitForFunction(()=>document.getElementById('paper-meta').textContent.includes('14 个场景'));await settled();assert.equal(await page.locator('#question-list [data-question]').count(),15);
  const sampleHTML=join(output,'packaged-sample.html');await exportTo('html',sampleHTML);await chooseFiles([sampleHTML]);await page.locator('#import-resources').click();await page.waitForTimeout(300);await settled();assert.equal(await page.locator('#question-list [data-question]').count(),15);record('packaged sample and native resource import',{questions:15,scenes:14});
  const title=await page.locator('#paper-title').innerText();await application.close();application=await launch();page=await application.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',error=>report.errors.push(error.message));await page.waitForFunction(()=>document.getElementById('mode-label').textContent==='本机备课');await settled();assert.equal(await page.locator('#paper-title').innerText(),title);assert.equal(await page.locator('#question-list [data-question]').count(),15);await shot('packaged-workbench.png');record('packaged application restart',{paperPersisted:true,workingDirectory:tmpdir(),executable:resolve(executable)});
 }
 assert.deepEqual(report.errors,[]);await writeFile(join(output,'desktop-report.json'),JSON.stringify(report,null,2));
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await page.waitForTimeout(300).catch(()=>{});
 console.log(JSON.stringify({ok:true,evidence:output,checks:report.checks.length}));
}catch(error){report.failure=error.message;if(page)await shot('desktop-failure.png').catch(()=>{});await writeFile(join(output,'desktop-report.json'),JSON.stringify(report,null,2));throw error;}
finally{await application.close().catch(()=>{});}
