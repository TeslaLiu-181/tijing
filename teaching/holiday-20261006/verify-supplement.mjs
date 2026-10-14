import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import katex from 'katex';
import {supplementalLessons,supplementSnapshot} from '../../src/supplement/catalog.mjs';
import {evaluateSupplement} from '../../src/supplement/models.mjs';
import {pendulumPath} from '../../src/supplement/physics.mjs';
import {validatePaper} from '../../src/exam/model.mjs';
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex'),base='.qa/holiday-20261006/',report={createdAt:new Date().toISOString(),lessons:[],papers:[],parameterBoundaryStates:0,formulaCount:0};
function finite(value){if(typeof value==='number')assert.ok(Number.isFinite(value));else if(value&&typeof value==='object')Object.values(value).forEach(finite);}
function formula(value){katex.renderToString(value,{throwOnError:true,strict:'ignore'});report.formulaCount++;}
for(const lesson of supplementalLessons){
 formula(lesson.formula);const entry={id:lesson.id,title:lesson.title,variants:[]};
 for(const variant of lesson.variants){const scene=supplementSnapshot(lesson.id).scene;scene.variant=variant.id;const snapshots=[0,.5,1].map(progress=>{const m=evaluateSupplement(scene,progress);finite(m);assert.ok(m.items.length);return {progress,metrics:m.metrics,status:m.status,warnings:m.warnings};});entry.variants.push({id:variant.id,readings:snapshots});}
 for(const [key,control]of Object.entries(lesson.controls))for(const value of [control.min,control.max]){const scene=supplementSnapshot(lesson.id).scene;scene.params[key]=value;finite(evaluateSupplement(scene,.6));report.parameterBoundaryStates++;}
 if(lesson.family==='pendulum'){const data=pendulumPath(lesson.defaults);entry.solver={energyError:data.energyError,lengthError:data.lengthError,tangentError:data.tangentError,steps:8000};}
 report.lessons.push(entry);
}
for(let number=2;number<=6;number++){
 const native=JSON.parse(await readFile(`dist/holiday-20261006/假期作业${number}.json`,'utf8')),full=validatePaper(JSON.parse(await readFile(`dist/holiday-20261006-full/假期作业${number}.json`,'utf8')),{portable:true});assert.equal(full.questions.length,12);assert.equal(full.id,native.id);
 const paper={number,questions:12,nativeScenes:0,supplementScenes:0,sourceTextUnchanged:true,nativePhysicsUnchanged:true};
 for(const question of full.questions){
  const before=native.questions.find(q=>q.id===question.id);assert.equal(question.sourceText,before.sourceText);assert.ok(question.scenes.length);assert.ok(question.referenceText.trim());
  for(const attachment of before.attachments.filter(a=>a.role==='source'))assert.equal(full.assets[attachment.id].sha256,native.assets[attachment.id].sha256);
  for(const scene of question.scenes){if(scene.kind==='supplement'){paper.supplementScenes++;continue;}const old=before.scenes.find(s=>s.id===scene.id);assert.ok(old);assert.deepEqual(scene.snapshot.scene,old.snapshot.scene);assert.deepEqual(scene.baseline.scene,old.baseline.scene);paper.nativeScenes++;}
  const display=[...question.referenceText.matchAll(/\$\$([\s\S]*?)\$\$/g)];for(const m of display)formula(m[1]);const inline=question.referenceText.replace(/\$\$[\s\S]*?\$\$/g,'');for(const m of inline.matchAll(/(?<!\$)\$([^$\n]+)\$(?!\$)/g))formula(m[1]);
 }
 paper.contentSha256=hash(full);report.papers.push(paper);
}
report.nativeScenes=report.papers.reduce((n,p)=>n+p.nativeScenes,0);report.supplementScenes=report.papers.reduce((n,p)=>n+p.supplementScenes,0);report.variantCount=report.lessons.reduce((n,p)=>n+p.variants.length,0);assert.equal(report.nativeScenes,49);assert.equal(report.supplementScenes,38);assert.equal(report.variantCount,66);
await writeFile(base+'supplement-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({questions:60,nativeScenes:report.nativeScenes,supplementScenes:report.supplementScenes,comparisonStates:report.variantCount,parameterBoundaryStates:report.parameterBoundaryStates,formulas:report.formulaCount,report:base+'supplement-verification.json'},null,2));
