import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject} from '../src/planar-model.mjs';
import {particleTypes} from '../src/lorentz-presets.mjs';
import {checkSourceGrounding,attachGrounding} from '../server/exam/ai-grounding.mjs';
function scene(mass,charge,{count=1,source=false}={}){
 const result=emptyScene();result.objects=[];
 for(let index=0;index<count;index++){const p=createObject(source?'source':'particle','o'+(index+1),[0,index]);Object.assign(p,{mass,charge,speed:1,heading:0});result.objects.push(p);}
 result.nextId=count+1;return result;
}
const speciesChecks=value=>value.checked.filter(check=>check.kind.startsWith('numeric-species-'));
test('affirmative single electrons and protons use the shared native species constants without claiming full source verification',()=>{
 for(const [type,text]of [['electron','一个电子以速度v沿+x进入磁场。'],['proton','一颗质子从原点沿+x射入。'],['electron','已知该粒子为电子，沿+x入射。'],['proton','粒子类型为质子。']]){
  const p=particleTypes[type],result=checkSourceGrounding(scene(p.mass,p.charge),{sourceText:text});
  assert.equal(result.passed,true);assert.equal(speciesChecks(result).length,2);assert.equal(result.coverage,'partial');assert.equal(result.sourceSemanticsVerified,false);
  assert.equal(speciesChecks(result).find(c=>c.kind==='numeric-species-massU').expected,p.mass);
  assert.equal(speciesChecks(result).find(c=>c.kind==='numeric-species-chargeE').expected,p.charge);
 }
});
test('a correct sign cannot hide wrong electron/proton mass or charge magnitude',()=>{
 for(const [name,text,mass,charge,metric]of [
  ['electron mass','一个电子以速度v沿+x进入磁场。',1,-1,'massU'],
  ['electron charge','一个电子以速度v沿+x进入磁场。',particleTypes.electron.mass,-2,'chargeE'],
  ['proton mass','一个质子以速度v沿+x进入磁场。',4,1,'massU'],
  ['proton charge','一个质子以速度v沿+x进入磁场。',particleTypes.proton.mass,3,'chargeE']
 ]){
  const result=checkSourceGrounding(scene(mass,charge),{sourceText:text});
  assert.equal(result.passed,false,name);assert(speciesChecks(result).some(c=>c.kind==='numeric-species-'+metric&&!c.pass),name);assert(result.contradictions.length);
  const candidate={snapshot:{scene:scene(mass,charge)},harness:{passed:true,warnings:[],violations:[]}};attachGrounding(candidate,{sourceText:text});assert.equal(candidate.harness.passed,false);assert(candidate.harness.violations.length);
 }
});
test('negation, unconfirmed hypotheses, OCR doubt and multi-particle context do not become implicit species constraints',()=>{
 const inputs=[
  '这不是电子，而是质量未知的负电粒子。',
  '一个电子（待确认）从原点入场。',
  '可能是一个质子从原点入场。',
  '原题未给粒子种类，我考虑假设它是电子作演示。',
  '题目没有给出种类。假设一个质子以速度v进入磁场，仅为示例。',
  '如果是一个电子，轨迹会怎样？',
  '原图看不清，粒子类型为电子尚待确认。',
  '两个电子同时从原点进入磁场。',
  '两种粒子分别是电子和质子，比较它们的轨迹。',
  '一束电子射入磁场。',
  '电子甲与电子乙同时运动。'
 ];
 for(const sourceText of inputs){
  const result=checkSourceGrounding(scene(1,-2),{sourceText});
  assert.equal(speciesChecks(result).length,0,sourceText);assert.equal(result.sourceSemanticsVerified,false);
 }
 const unknown=checkSourceGrounding(scene(1,-1),{sourceText:'某粒子，种类未知。'});assert.equal(unknown.scope,'no-applicable-rule');assert.equal(unknown.coverage,'none');
 assert(unknown.limitations.some(line=>line.includes('checked为空')&&line.includes('绝不')));
});
test('reported model givens and multiple scene objects cannot establish one authoritative species',()=>{
 const reported=checkSourceGrounding(scene(1,-1),{sourceText:'粒子种类未知，请列出演示假设。',givens:['一个电子以速度v运动。']});
 assert.equal(speciesChecks(reported).length,0);
 const multiple=checkSourceGrounding(scene(1,-1,{count:2}),{sourceText:'一个电子以速度v进入磁场。'});
 assert.equal(speciesChecks(multiple).length,0);
 const emitted=checkSourceGrounding(scene(1,-1,{source:true}),{sourceText:'一个电子以速度v进入磁场。'});
 assert.equal(speciesChecks(emitted).length,0);
});
test('species numerical comparison reuses the existing half-percent tolerance and leaves explicit generic charge signs meaningful',()=>{
 const p=particleTypes.electron,approx=checkSourceGrounding(scene(p.mass*1.003,p.charge*1.003),{sourceText:'一个电子以速度v进入磁场。'});assert.equal(approx.passed,true);
 const bad=checkSourceGrounding(scene(p.mass*1.02,p.charge),{sourceText:'一个电子以速度v进入磁场。'});assert.equal(bad.passed,false);
 const generic=checkSourceGrounding(scene(1,1),{sourceText:'粒子明确带负电，但不能确定它是否为电子。'});
 assert.equal(speciesChecks(generic).length,0);assert.equal(generic.passed,false);assert(generic.checked.some(check=>check.kind==='chargeSign'&&!check.pass));
});
