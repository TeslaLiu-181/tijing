import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,example} from '../src/planar-model.mjs';
import {resolveScene} from '../src/planar-relations.mjs';
import {solveScene,E,U,TAU} from '../src/planar-physics.mjs';
import {sampleMotionSeries} from '../src/planar-motion-series.mjs';
const traceOf=s=>solveScene(resolveScene(s).scene)[0],points=s=>s.chunks.flatMap(c=>c.points),close=(a,b,tol=1e-9)=>assert(Math.abs(a-b)<=tol*Math.max(Math.abs(a),Math.abs(b),1e-20),`${a} != ${b}`);
function electric(){const s=emptyScene();s.duration=.3;const f=createObject('electric','o1',[0,0],'infinite');Object.assign(f,{E0:1,fieldAngle:0});const p=createObject('particle','o2');Object.assign(p,{mass:1,charge:1,speed:0});s.objects=[f,p];return s;}

test('native velocity, position and work-energy samples match constant electric acceleration without mutation',()=>{
 const scene=electric(),trace=traceOf(scene),before=JSON.stringify(trace),acc=E*1000/U;
 for(const group of ['velocity','position','energy']){const series=sampleMotionSeries(trace,{group});assert(series.pointCount<=1200);assert.equal(series.limited,false);assert(series.pointCount>=3);for(const point of points(series)){const t=point.timeUs*1e-6;if(group==='velocity'){close(point.values.vx,acc*t/1e5);assert.equal(point.values.vy,0);}else if(group==='position'){close(point.values.x,.5*acc*t*t*100);assert.equal(point.values.y,0);}else{const K=.5*U*(acc*t)**2/E;close(point.values.K,K);close(point.values.WE,K);assert.equal(series.workMethod,'work-energy-theorem');}}}
 assert.equal(JSON.stringify(trace),before);
});

test('pure magnetic energy stays constant while velocity curves require native cycle density',()=>{
 const s=emptyScene();s.duration=2;const f=createObject('field','o1',[0,0],'infinite');f.B=100;const p=createObject('particle','o2');Object.assign(p,{mass:1,charge:1,speed:1});s.objects=[f,p];const trace=traceOf(s),energy=sampleMotionSeries(trace,{group:'energy'});assert.equal(energy.limited,false);for(const sample of points(energy)){close(sample.values.K,energy.chunks[0].points[0].values.K,1e-12);assert(Math.abs(sample.values.WE)<1e-10);}
 const limited=sampleMotionSeries(trace,{group:'velocity',maxPoints:2});assert(limited.limited);assert.deepEqual(limited.chunks,[]);assert(limited.minimumRequiredPoints>2);const periodUs=TAU/Math.abs(trace.segments[0].w)*1e6,narrow=sampleMotionSeries(trace,{group:'velocity',rangeUs:{start:0,end:periodUs/8},maxPoints:6});assert.equal(narrow.limited,false);assert(narrow.pointCount<=6);assert(narrow.pointCount>=3);
});

test('force curves retain before and after jumps as different native chunks at the same clock',()=>{
 const scene=example('geometry-l-region'),trace=traceOf(scene),force=sampleMotionSeries(trace,{group:'force'});assert.equal(force.chunks.length,3);assert.equal(force.limited,false);for(let i=0;i<2;i++){const before=force.chunks[i].points.at(-1),after=force.chunks[i+1].points[0];assert.equal(before.side,'before');assert.equal(after.side,'after');assert.equal(before.timeUs,after.timeUs);assert.notEqual(before.values.Fx,after.values.Fx);}
 const enter=force.chunks[1].startUs,exit=force.chunks[1].endUs,window=sampleMotionSeries(trace,{group:'force',rangeUs:{start:enter,end:exit},maxPoints:4});assert.equal(window.limited,false);assert.equal(window.pointCount,4);assert.equal(window.chunks[0].points[0].side,'before');assert.equal(window.chunks.at(-1).points[0].side,'after');assert.equal(window.chunks[0].points[0].timeUs,enter);assert.equal(window.chunks.at(-1).points[0].timeUs,exit);assert.equal(sampleMotionSeries(trace,{group:'force',rangeUs:{start:enter,end:exit},maxPoints:3}).limited,true);
 const square=emptyScene();square.duration=.75;const f=createObject('electric','o1',[0,0],'infinite');Object.assign(f,{E0:.4,fieldAngle:90,waveform:'square',period:.37,phase:23});const src=createObject('source','o2');Object.assign(src,{mass:1,charge:1,count:2,interval:.1234567,spread:0});square.objects=[f,src];const delayed=solveScene(square)[1],series=sampleMotionSeries(delayed,{group:'force'});for(let i=0;i<series.chunks.length-1;i++){const before=series.chunks[i].points.at(-1),after=series.chunks[i+1].points[0];assert.equal(before.timeUs,after.timeUs);assert.equal(before.values.Fy,-after.values.Fy);}assert.equal(series.chunks.at(-1).points.at(-1).side,'before');
});

test('birth and true truncation clip ranges, and dense windows cannot lose complete native segments',()=>{
 const scene=electric();const source=createObject('source','o2');Object.assign(source,{mass:1,charge:1,count:2,interval:.15,spread:0});scene.objects[1]=source;const trace=solveScene(scene)[1],s=sampleMotionSeries(trace,{group:'position',rangeUs:{start:0,end:.3}});assert.equal(s.availableRangeUs.start,.15);assert(points(s).every(p=>p.timeUs>=s.birthUs));assert.equal(sampleMotionSeries(trace,{rangeUs:{start:0,end:.1}}).pointCount,0);
 const dense=electric();dense.duration=1;Object.assign(dense.objects[0],{waveform:'square',period:.0001,fieldAngle:90});const truncated=traceOf(dense);assert(truncated.truncated);const limited=sampleMotionSeries(truncated,{group:'force'});assert(limited.limited);assert.deepEqual(limited.chunks,[]);assert(limited.minimumRequiredPoints>1200);const narrow=sampleMotionSeries(truncated,{group:'force',rangeUs:{start:.00002,end:.0002},maxPoints:30});assert.equal(narrow.limited,false);assert(narrow.pointCount<=30);const clipped=sampleMotionSeries(truncated,{group:'force',rangeUs:{start:limited.computedEndUs-.0002,end:1},maxPoints:30});assert.equal(clipped.limited,false);assert(clipped.truncated);assert.equal(clipped.availableRangeUs.end,clipped.computedEndUs);assert(points(clipped).every(p=>p.timeUs<=clipped.computedEndUs));assert.equal(clipped.chunks.at(-1).points.at(-1).side,'before');
});

test('high-frequency sine lower bounds budget in every dynamic group and recovers in a smaller window',()=>{
 const scene=electric();scene.duration=.08;Object.assign(scene.objects[0],{waveform:'sine',period:.01,fieldAngle:90});const trace=traceOf(scene);
 for(const group of ['velocity','energy','position','force']){const limited=sampleMotionSeries(trace,{group,maxPoints:50});assert(limited.limited);assert.deepEqual(limited.chunks,[]);assert(limited.minimumRequiredPoints>50);const narrow=sampleMotionSeries(trace,{group,rangeUs:{start:.002,end:.004},maxPoints:30});assert.equal(narrow.limited,false);assert(narrow.pointCount<=30);assert(narrow.chunks.length>0);}
 assert.throws(()=>sampleMotionSeries(trace,{group:'bad'}));assert.throws(()=>sampleMotionSeries(trace,{maxPoints:1}));assert.throws(()=>sampleMotionSeries(trace,{rangeUs:{start:1,end:0}}));
});
