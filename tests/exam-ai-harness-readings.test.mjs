import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,example} from '../src/planar-model.mjs';
import {resolveScene} from '../src/planar-relations.mjs';
import {solveScene,E} from '../src/planar-physics.mjs';
import {extractTimelineEvents} from '../src/planar-timeline-events.mjs';
import {auditSceneSync} from '../server/exam/ai-harness.mjs';
import {preserveValidationChecks} from '../server/exam/ai-validation.mjs';

test('proposal checks distinguish exact incoming and outgoing boundary force',()=>{
 const scene=example('geometry-l-region');resolveScene(scene);const traces=solveScene(scene),event=extractTimelineEvents({scene,traces}).events.find(e=>e.kind==='enter');
 const force=scene.objects.find(o=>o.kind==='electric').E0*1000*E,checks=[{traceId:event.traceId,timeUs:event.timeUs,metric:'forceN',expected:0,side:'before'},{traceId:event.traceId,timeUs:event.timeUs,metric:'forceN',expected:force,side:'after'}];
 const result=auditSceneSync(scene,checks);assert.deepEqual(result.harness.checks.map(c=>c.pass),[true,true]);assert.equal(result.harness.checks[0].value,0);assert.ok(result.harness.checks[1].value>0);
 assert.throws(()=>auditSceneSync(scene,[{...checks[0],side:'left'}]),/核验指令/);
});

test('limit samples identify the computed side; checks never expose old force as the uncomputed after side',()=>{
 const scene=emptyScene();scene.duration=.5;scene.objects=[Object.assign(createObject('electric','o1',[0,0],'infinite'),{E0:1,fieldAngle:90,waveform:'square',period:1,phase:0}),createObject('particle','o2')];
 const checks=[{traceId:'o2',timeUs:.5,metric:'forceN',expected:E*1000,side:'before'},{traceId:'o2',timeUs:.5,metric:'forceN',expected:E*1000,side:'after'}],result=auditSceneSync(scene,checks),last=result.harness.traces[0].samples.at(-1);
 assert.equal(last.side,'before');assert.equal(last.endpointOnly,true);assert.equal(last.dynamicsAvailable,true);assert.deepEqual(result.harness.checks.map(c=>c.pass),[true,false]);assert.equal(result.harness.checks[1].value,null);assert.match(result.harness.checks[1].reason,/没有已计算后侧/);
 const state=auditSceneSync(scene,[{traceId:'o2',timeUs:.5,metric:'kineticEV',expected:last.kineticEV}]);assert.equal(state.harness.checks[0].pass,true);
});

test('sample work is cumulative from emission and check repair cannot change a reading side',()=>{
 const result=auditSceneSync(example('crossed-drift')),samples=result.harness.traces[0].samples;assert.equal(samples[0].workJ,0);
 for(const sample of samples){assert.equal(sample.workScope,'since-emission');assert.ok(Math.abs(sample.workJ/E-(sample.kineticEV-samples[0].kineticEV))<1e-8*Math.max(1,sample.kineticEV));}
 const base={traceId:'o1',timeUs:.2,metric:'forceN',expected:0,side:'before'};
 assert.equal(preserveValidationChecks([base],[{...base,side:'after'}]).scopeChanged,true);
 assert.equal(preserveValidationChecks([{...base,side:undefined}],[{...base,side:'after'}]).scopeChanged,false);
});
