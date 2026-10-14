import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject} from '../src/planar-model.mjs';
import {resolveScene,setDefinition} from '../src/planar-relations.mjs';
import {E,U} from '../src/planar-physics.mjs';
import {readStoredScene,buildScene,auditScene,auditSceneSync} from '../server/exam/ai-harness.mjs';
import {runAgentTool} from '../server/exam/ai-agent-tools.mjs';

function scope(scene){return {mode:'tutor',record:{kind:'planar',title:'合成保存场景',snapshot:{scene}}};}
function largeScene(points=65){const scene=emptyScene();scene.duration=.1;for(let i=1;i<=points;i++)scene.objects.push(createObject('point','o'+i,[i,0]));scene.objects.push(createObject('particle','o'+(points+1)));scene.nextId=points+2;return scene;}

test('a saved 66-object scene supports native motion and relation reads without mutation',async()=>{
 const scene=largeScene(),before=JSON.stringify(scene);assert.equal(resolveScene(scene).issues.length,0);
 const motion=await runAgentTool('query_motion',{timesUs:[0]},scope(scene));assert.equal(motion.readings[0].available,true);assert.equal(motion.traceId,'o66');assert.equal(motion.traceScope.computed,1);
 const relation=await runAgentTool('evaluate_relation',{expression:'distance(pos(o1), pos(o65))'},scope(scene));assert.ok(Math.abs(relation.value.n-.64)<1e-12);assert.equal(JSON.stringify(scene),before);
 assert.throws(()=>buildScene(scene),/1–60/);await assert.rejects(()=>runAgentTool('test_scene',{scene},{...scope(scene),mode:'scene'}),/1–60/);
});

test('stored validation uses the real 500-object boundary and remains structurally strict',()=>{
 assert.equal(readStoredScene(largeScene(499)).objects.length,500);assert.throws(()=>readStoredScene(largeScene(500)),/500/);
 const bad=largeScene();bad.objects[0].x=Infinity;assert.throws(()=>readStoredScene(bad),/无效数值/);
});

test('source audit reads saved scenes while the proposal path retains both proposal limits',async()=>{
 const scene=largeScene(),before=JSON.stringify(scene),result=await auditScene(scene,[],{source:true});assert.equal(result.harness.passed,true);assert.equal(result.harness.validationMode,'stored-source');assert.equal(result.harness.partial,false);assert.equal(result.harness.traceScope.computed,1);assert.equal(JSON.stringify(scene),before);
 const proposal=emptyScene();proposal.objects=[createObject('source','o1'),createObject('source','o2')];proposal.objects.forEach(o=>o.count=100);assert.throws(()=>buildScene(proposal),/粒子数量/);assert.equal(readStoredScene(proposal).objects.length,2);
 const missing={duration:1,objects:[{id:'o1',kind:'particle',x:0,y:0}]};assert.throws(()=>buildScene(missing),/必填/);
});

test('motion solves one selected source instance and preserves unrelated field dependencies',async()=>{
 const scene=emptyScene();scene.duration=.1;const first=createObject('source','o1');Object.assign(first,{count:100,speed:2,speedSpan:1,spread:0,interval:0});const other=createObject('particle','o2');other.mass=2;
 const electric=createObject('electric','o3',[0,0],'infinite');Object.assign(electric,{E0:1,fieldAngle:90});scene.objects=[first,other,electric];setDefinition(scene,'o3','E0','1 kV/m * (o2.mass / (1 u))');assert.equal(resolveScene(scene).issues.length,0);
 const result=await runAgentTool('query_motion',{traceId:'o1:55',timesUs:[0,.01]},scope(scene));assert.equal(result.traceScope.total,101);assert.equal(result.traceScope.computed,1);assert.equal(result.traceId,'o1:55');
 assert.ok(Math.abs(result.readings[0].vxMs-(2+(55/99-.5))*1e5)<1e-8);assert.ok(Math.abs(result.readings[1].vyMs-E*2000/(first.mass*U)*1e-8)<1e-8);
 const defaultResult=await runAgentTool('query_motion',{timesUs:[0]},scope(scene));assert.equal(defaultResult.traceId,'o1:0');assert.equal(defaultResult.traceScope.selection,'default-first');assert.equal(defaultResult.traceScope.computed,1);
});

test('event queries require an explicit track above 24 and never return a fake full set',async()=>{
 const scene=emptyScene(),source=createObject('source','o1');source.count=25;source.interval=0;scene.objects=[source];scene.duration=.1;
 await assert.rejects(()=>runAgentTool('query_events',{},scope(scene)),/25.*24.*traceId/);
 const result=await runAgentTool('query_events',{traceId:'o1:24'},scope(scene));assert.equal(result.tracks.length,1);assert.equal(result.tracks[0].traceId,'o1:24');assert.equal(result.traceScope.total,25);assert.equal(result.traceScope.computed,1);
 await assert.rejects(()=>runAgentTool('query_motion',{traceId:'o1:25',timesUs:[0]},scope(scene)),/没有找到/);
});

test('source audit above 24 marks partial and individual audit states the actual scope',()=>{
 const scene=emptyScene();scene.duration=.1;scene.objects=Array.from({length:25},(_,i)=>createObject('particle','o'+(i+1)));
 const result=auditSceneSync(scene,[],{source:true});assert.equal(result.harness.partial,true);assert.equal(result.harness.passed,false);assert.equal(result.harness.traceScope.total,25);assert.equal(result.harness.traceScope.computed,24);assert(result.harness.warnings.some(w=>/其余尚未核验/.test(w)));
 const one=auditSceneSync(scene,[],{source:true,traceId:'o25'});assert.equal(one.harness.partial,false);assert.equal(one.harness.passed,true);assert.deepEqual(one.harness.traceScope.traceIds,['o25']);assert.equal(one.harness.traceScope.selection,'requested');
});

test('late source emissions retain their original birth and do not become zero readings',async()=>{
 const scene=emptyScene(),source=createObject('source','o1');source.count=2;source.interval=1;scene.objects=[source];scene.duration=.1;
 const result=await runAgentTool('query_motion',{traceId:'o1:1',timesUs:[0]},scope(scene));assert.equal(result.readings[0].available,false);assert.match(result.readings[0].reason,/尚未发射/);
});
