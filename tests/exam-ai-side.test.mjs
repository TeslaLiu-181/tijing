import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,example} from '../src/planar-model.mjs';
import {runAgentTool,agentTools} from '../server/exam/ai-agent-tools.mjs';
const scope=scene=>({mode:'tutor',record:{kind:'planar',title:'合成侧读数',snapshot:{scene}}});
test('L events round-trip to default after and explicit before with exact segment evidence',async()=>{
 const scene=example('geometry-l-region'),ctx=scope(scene),events=(await runAgentTool('query_events',{},ctx)).events.filter(e=>['enter','exit'].includes(e.kind)),timesUs=events.map(e=>e.timeUs),after=await runAgentTool('query_motion',{timesUs},ctx),before=await runAgentTool('query_motion',{timesUs,side:'before'},ctx);
 for(const [i,e] of events.entries()){assert.deepEqual(after.readings[i].fields,e.afterFields);assert.deepEqual(before.readings[i].fields,e.beforeFields);assert.equal(after.readings[i].segmentIndex,e.afterSegmentIndex);assert.equal(before.readings[i].segmentIndex,e.beforeSegmentIndex);assert.equal(after.readings[i].side,'after');assert.equal(before.readings[i].side,'before');assert.equal(after.readings[i].boundaryTimeUs,e.timeUs);assert.equal(after.readings[i].boundaryKind,'boundary');}
 assert.equal(after.readings[0].totalForceN[0]>0,true);assert.equal(after.readings[1].totalForceN[0],0);assert.equal(before.readings[0].totalForceN[0],0);assert.equal(before.readings[1].totalForceN[0]>0,true);
});
test('delayed-source AC switch public force sides are opposite while state remains continuous',async()=>{
 const scene=emptyScene();scene.duration=.75;const f=createObject('electric','o1',[0,0],'infinite');Object.assign(f,{E0:.4,fieldAngle:90,waveform:'square',period:.37,phase:23});const s=createObject('source','o2');Object.assign(s,{mass:1,charge:1,speed:.9,count:2,spread:0,interval:.1234567});scene.objects=[f,s];const ctx=scope(scene),events=(await runAgentTool('query_events',{traceId:'o2:1'},ctx)).events,e=events.find(e=>e.kind==='switch'&&e.timeUs>.5&&e.timeUs<.6),after=(await runAgentTool('query_motion',{traceId:'o2:1',timesUs:[e.timeUs]},ctx)).readings[0],before=(await runAgentTool('query_motion',{traceId:'o2:1',timesUs:[e.timeUs],side:'before'},ctx)).readings[0];
 assert(after.totalForceN[1]<0);assert(before.totalForceN[1]>0);assert.equal(after.segmentIndex,e.nextSegmentIndex);assert.equal(before.segmentIndex,e.segmentIndex);assert(Math.abs(after.xCm-before.xCm)<1e-10);assert(Math.abs(after.vyMs-before.vyMs)<1e-8);assert.equal(before.boundaryKind,'switch');assert.equal(after.boundaryKind,'switch');
});
test('side schema validates input and exposes unavailable birth/endpoint explanations without zero fabrication',async()=>{
 assert.equal(agentTools.find(t=>t.function.name==='query_motion').function.parameters.properties.side.default,'after');const scene=example('geometry-l-region'),ctx=scope(scene);await assert.rejects(()=>runAgentTool('query_motion',{timesUs:[0],side:'left'},ctx),e=>e.status===400&&e.code==='ai_tool_input');
 const before=(await runAgentTool('query_motion',{timesUs:[0],side:'before'},ctx)).readings[0];assert.equal(before.available,false);assert.equal(before.code,'before_birth');assert.equal(before.totalForceN,undefined);assert.equal(before.boundaryTimeUs,0);
 const end=(await runAgentTool('query_motion',{timesUs:[scene.duration]},ctx)).readings[0];assert(end.available);assert(end.endpointOnly);assert.equal(end.dynamicsAvailable,false);assert.equal(end.totalForceN,undefined);assert.equal(end.fields,undefined);assert(Number.isFinite(end.kineticEV));assert.match(end.reason,/观察终点/);
});


test('ordinary limit coinciding with a square switch does not expose incoming force as after',async()=>{
 const scene=emptyScene();scene.duration=.5;const field=createObject('electric','o1',[0,0],'infinite');Object.assign(field,{E0:1,fieldAngle:90,waveform:'square',period:1,phase:0});scene.objects=[field,createObject('particle','o2')];const ctx=scope(scene),after=(await runAgentTool('query_motion',{timesUs:[.5]},ctx)).readings[0],before=(await runAgentTool('query_motion',{timesUs:[.5],side:'before'},ctx)).readings[0];assert(after.available);assert.equal(after.dynamicsAvailable,false);assert.equal(after.totalForceN,undefined);assert.equal(after.fields,undefined);assert.equal(before.dynamicsAvailable,true);assert(before.totalForceN[1]>0);assert.equal(after.kineticEV,before.kineticEV);
});
