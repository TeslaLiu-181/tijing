import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,example} from '../src/planar-model.mjs';
import {resolveScene} from '../src/planar-relations.mjs';
import {solveScene,atTime,forcesAt,waveFactor} from '../src/planar-physics.mjs';
import {extractTimelineEvents,timelineReadings} from '../src/planar-timeline-events.mjs';
import {readMotionState,readWaveFactor} from '../src/planar-motion-readings.mjs';
const traceOf=s=>solveScene(resolveScene(s).scene)[0];
function square(){const scene=emptyScene();scene.duration=.75;const field=createObject('electric','o1',[0,0],'infinite');Object.assign(field,{E0:.4,fieldAngle:90,waveform:'square',period:.37,phase:23});const source=createObject('source','o2');Object.assign(source,{mass:1,charge:1,speed:.9,count:2,spread:0,interval:.1234567});scene.objects=[field,source];return {scene,field,trace:solveScene(scene)[1]};}
test('L-region event times select exact before/after native segments despite microsecond ULP roundtrip',()=>{
 const scene=example('geometry-l-region'),trace=traceOf(scene),events=extractTimelineEvents({scene,traces:[trace]}).events.filter(e=>['enter','exit'].includes(e.kind));assert.equal(events.length,2);
 for(const event of events){const before=readMotionState(trace,event.timeUs*1e-6,{side:'before'}),after=readMotionState(trace,event.timeUs*1e-6);assert.equal(before.segmentIndex,event.beforeSegmentIndex);assert.equal(after.segmentIndex,event.afterSegmentIndex);assert.equal(before.state.local,before.state.segment.dt);assert.equal(after.state.local,0);assert.equal(before.boundaryKind,'boundary');assert.equal(after.boundaryTimeUs,event.timeUs);assert.deepEqual(before.state.segment.fieldIds,event.beforeFields);assert.deepEqual(after.state.segment.fieldIds,event.afterFields);assert.deepEqual(timelineReadings(trace,event.timeUs,event.segmentIndex).fieldIds,event.beforeFields);assert.deepEqual(timelineReadings(trace,event.timeUs,{side:'after'}).fieldIds,event.afterFields);}
 // The global physics API keeps its existing behavior; only the reading layer snaps seams.
 assert.equal(atTime(trace,events[0].timeUs*1e-6).segment,trace.segments[0]);
});
test('delayed square switch side force agrees with exact one-sided global field display',()=>{
 const {scene,field,trace}=square(),event=extractTimelineEvents({scene,traces:[trace]}).events.find(e=>e.kind==='switch'&&e.timeUs>.5&&e.timeUs<.6),t=event.timeUs*1e-6,before=readMotionState(trace,t,{side:'before'}),after=readMotionState(trace,t);
 assert.equal(event.nextSegmentIndex,event.afterSegmentIndex);assert.equal(before.boundaryKind,'switch');assert.equal(after.boundaryKind,'switch');const force=r=>forcesAt(r.state.segment,r.state.v,r.state.local).total[1];assert(force(before)>0);assert(force(after)<0);assert.equal(readWaveFactor(field,t,{side:'before'}),1);assert.equal(readWaveFactor(field,t),-1);assert.equal(readWaveFactor(field,t-1e-18),1);assert.equal(readWaveFactor(field,t+1e-18),-1);
 for(const waveform of ['dc','sine']){const f={...field,waveform};assert.equal(readWaveFactor(f,t,{side:'before'}),waveFactor(f,t));assert.equal(readWaveFactor(f,t),waveFactor(f,t));}
});
test('ordinary readings stay unchanged; before birth, observation endpoint and genuine truncation are distinct',()=>{
 const scene=example('geometry-l-region'),trace=traceOf(scene),time=.05e-6,legacy=atTime(trace,time),ordinary=readMotionState(trace,time);assert.deepEqual(ordinary.state.p,legacy.p);assert.deepEqual(ordinary.state.v,legacy.v);assert.equal(ordinary.state.segment,legacy.segment);assert.equal(ordinary.boundaryKind,undefined);
 const born=square().trace,birth=born.particle.birth;assert.equal(readMotionState(born,birth,{side:'before'}).code,'before_birth');assert.equal(readMotionState(born,birth).segmentIndex,0);assert.equal(readMotionState(born,birth).state.local,0);assert.equal(readMotionState(born,birth).boundaryKind,'birth');
 const endpoint=readMotionState(trace,scene.duration*1e-6);assert(endpoint.available);assert(endpoint.endpointOnly);assert.equal(endpoint.dynamicsAvailable,false);assert.equal(readMotionState(trace,scene.duration*1e-6,{side:'before'}).dynamicsAvailable,true);assert.equal(timelineReadings(trace,scene.duration,{side:'after'}).totalForceN,undefined);assert.equal(endpoint.boundaryKind,'limit');assert.match(endpoint.reason,/观察终点/);
 const dense=emptyScene();dense.duration=1;const f=createObject('electric','o1',[0,0],'infinite');Object.assign(f,{E0:.1,fieldAngle:90,waveform:'square',period:.0001});dense.objects=[f,createObject('particle','o2')];const truncated=traceOf(dense);assert(truncated.truncated);const last=truncated.segments.at(-1),end=truncated.particle.birth+last.t+last.dt;assert(readMotionState(truncated,end,{side:'before'}).available);assert.equal(readMotionState(truncated,end).code,'after_uncomputed');assert.equal(readMotionState(truncated,end+1e-8).code,'past_computed');
 assert.throws(()=>readMotionState(trace,0,{side:'left'}),/before/);
});
test('locating one frame uses logarithmic segment accesses rather than a full 6000-node scan',()=>{
 const trace=traceOf(example('geometry-l-region')),base=trace.segments[0],dt=1e-9,segments=Array.from({length:6000},(_,i)=>({...base,t:i*dt,dt,p:[base.p[0]+base.v[0]*i*dt,base.p[1]],end:'sample'}));let accesses=0;
 const counted=new Proxy(segments,{get(target,key){if(/^\d+$/.test(String(key)))accesses++;return Reflect.get(target,key);}}),dense={...trace,segments:counted,truncated:false,duration:6000*dt},reading=readMotionState(dense,(4521.5)*dt);assert.equal(reading.segmentIndex,4521);assert(accesses<32,`segment accesses ${accesses}`);
});
