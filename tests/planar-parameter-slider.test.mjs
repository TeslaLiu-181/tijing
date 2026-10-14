import test from 'node:test';import assert from 'node:assert/strict';
import {resolveParameterSlider,validateParameterSlider} from '../src/planar-parameter-slider.mjs';
import {emptyScene,createObject,prepareScene,validate} from '../src/planar-model.mjs';
import {newPaper,newQuestion,newScene} from '../src/exam/model.mjs';import {paperContentKey} from '../src/exam/paper-content.mjs';
import {checkSnapshot} from '../src/exam/model.mjs';import {buildScene,sceneSchema} from '../server/exam/ai-harness.mjs';

test('fixed integer slider preserves precise off-grid/out-of-range values and returns an explicit nearest tick',()=>{
 const parameter={kind:'parameter',value:6.5,unit:'',slider:{min:3,max:12,step:1}},before=structuredClone(parameter),state=resolveParameterSlider(parameter);
 assert.equal(state.representable,false);assert.equal(state.nearest,7);assert.match(state.reason,/刻度/);assert.deepEqual(parameter,before);
 assert.equal(resolveParameterSlider({...parameter,value:6}).representable,true);
 assert.equal(resolveParameterSlider({...parameter,value:6.000000000000001}).representable,false);
 const outside=resolveParameterSlider({...parameter,value:20});assert.equal(outside.nearest,12);assert.equal(outside.max,12);assert.match(outside.reason,/超出/);
 const automatic=resolveParameterSlider({value:6});assert.deepEqual([automatic.min,automatic.max,automatic.step,automatic.configured],[-18,18,'any',false]);
});
test('ticks start at configured min and floating display units do not require changing data',()=>{
 const half=resolveParameterSlider({value:2.5,slider:{min:.5,max:4.5,step:1}});assert.equal(half.representable,true);assert.equal(half.nearest,2.5);
 const off=resolveParameterSlider({value:2.2,slider:{min:.5,max:4.5,step:1}});assert.equal(off.representable,false);assert.equal(off.nearest,2.5);
 assert.equal(resolveParameterSlider({value:.3,slider:{min:0,max:1,step:.1}}).representable,true);
 const end=resolveParameterSlider({value:1,slider:{min:0,max:1,step:.3}});assert.equal(end.representable,false);assert(Math.abs(end.lastTick-.9)<1e-12);assert(Math.abs(end.nearest-.9)<1e-12);
});
test('optional slider schema round-trips without changing value/defs/unit and does not become a physical domain restriction',()=>{
 const scene=emptyScene(),parameter=createObject('parameter','o1');Object.assign(parameter,{label:'n',value:20,unit:'',slider:{min:3,max:12,step:1}});scene.objects=[parameter];validate(scene);
 const restored=prepareScene(JSON.parse(JSON.stringify(scene)));validate(restored);assert.equal(restored.objects[0].value,20);assert.equal(restored.objects[0].unit,'');assert.deepEqual(restored.objects[0].defs,parameter.defs);assert.deepEqual(restored.objects[0].slider,parameter.slider);
 for(const slider of [null,[],{min:3,max:3,step:1},{min:3,max:12,step:0},{min:3,max:12,step:15},{min:3,max:Infinity,step:1},{min:3,max:12,step:1,unit:'cm'}])assert.throws(()=>validateParameterSlider(slider));
 const other=emptyScene(),point=createObject('point','o1');point.slider=parameter.slider;other.objects=[point];assert.throws(()=>validate(other),/仅自由参数/);
});
test('paper content identity excludes only parameter control preferences in both current and baseline snapshots',()=>{
 const paper=newPaper('合成滑杆偏好'),question=newQuestion('合成问题'),scene=newScene('合成场景','base:empty'),parameter=createObject('parameter','o1');parameter.value=6;scene.snapshot.scene.objects=[parameter];scene.baseline=structuredClone(scene.snapshot);question.scenes=[scene];question.activeSceneId=scene.id;paper.questions=[question];paper.activeQuestionId=question.id;
 const before=paperContentKey(paper);for(const snapshot of [scene.snapshot,scene.baseline])snapshot.scene.objects[0].slider={min:3,max:12,step:1};assert.equal(paperContentKey(paper),before);
 scene.snapshot.scene.objects[0].value=7;assert.notEqual(paperContentKey(paper),before);scene.snapshot.scene.objects[0].value=6;
 const point=createObject('point','o2');scene.snapshot.scene.objects.push(point);const withPoint=paperContentKey(paper);point.slider={min:3,max:12,step:1};assert.notEqual(paperContentKey(paper),withPoint);
});

test('AI source/proposal normalization preserves valid parameter controls and rejects other object sliders',()=>{
 const scene=emptyScene(),parameter=createObject('parameter','o1');Object.assign(parameter,{value:20,slider:{min:3,max:12,step:1}});scene.objects=[parameter];
 const source=checkSnapshot('planar',{scene:JSON.parse(JSON.stringify(scene))}),proposal=buildScene(source.scene);assert.deepEqual(proposal.objects[0].slider,parameter.slider);assert.equal(proposal.objects[0].value,20);assert.deepEqual(sceneSchema().optionalDisplayProperties.slider.objectKinds,['parameter']);
 const other=emptyScene(),point=createObject('point','o1');point.slider=parameter.slider;other.objects=[point];assert.throws(()=>buildScene(other),/不支持的属性 slider/);
 const invalid=structuredClone(source.scene);invalid.objects[0].slider.step=0;assert.throws(()=>buildScene(invalid),/步长/);
});
