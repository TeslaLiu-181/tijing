import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject} from '../src/planar-model.mjs';
import {solveScene,segmentState,E,U,TAU} from '../src/planar-physics.mjs';
import {extractTimelineEvents} from '../src/planar-timeline-events.mjs';
import {runAgentTool} from '../server/exam/ai-agent-tools.mjs';
const close=(a,b,tol=1e-9)=>assert(Math.abs(a-b)<=tol*Math.max(Math.abs(a),Math.abs(b),1e-20),`${a} != ${b}`);
function circular(turns=1.5){const s=emptyScene(),f=createObject('field','o1',[0,0],'infinite'),p=createObject('particle','o2');Object.assign(f,{B:100});Object.assign(p,{mass:1,charge:1,speed:1,heading:0});s.objects=[f,p];const periodUs=TAU*U/(E*.1)*1e6;s.duration=turns*periodUs;return {scene:s,trace:solveScene(s)[0],periodUs};}
function electric(angle,heading=0,waveform='dc'){const s=emptyScene(),f=createObject('electric','o1',[0,0],'infinite'),p=createObject('particle','o2');Object.assign(f,{E0:1,fieldAngle:angle,waveform,period:.4,phase:90});Object.assign(p,{mass:1,charge:1,speed:waveform==='sine'?0:1,heading});s.objects=[f,p];s.duration=waveform==='sine'?.8:2;return {scene:s,trace:solveScene(s)[0]};}

test('native vx circle roots use the correct cosine coefficient while vy roots remain aligned',()=>{
 const {scene,trace,periodUs}=circular(),found=extractTimelineEvents({scene,traces:[trace]}),x=found.events.filter(e=>e.kind==='vx-zero'),y=found.events.filter(e=>e.kind==='vy-zero');assert.equal(x.length,3);assert.equal(y.length,4);x.forEach((e,i)=>close(e.timeUs,(.25+i*.5)*periodUs));y.forEach((e,i)=>close(e.timeUs,i*.5*periodUs));assert.equal(found.tracks[0].velocityRootCount,7);assert.deepEqual(found.tracks[0].velocityRootCounts,{x:3,y:4});assert(x.every(e=>e.component==='x'&&e.method==='native-analytic'&&e.residualMS<1e-7&&e.toleranceUs>0));
});
test('linear vx roots and decoupled continuous zero axes do not scatter fake dots',()=>{
 const a=electric(0,180),found=extractTimelineEvents({scene:a.scene,traces:[a.trace]}),x=found.events.filter(e=>e.kind==='vx-zero');assert.equal(x.length,1);close(x[0].timeUs,1e5*U/(E*1000)*1e6);assert.equal(x[0].method,'native-linear');assert.equal(found.events.filter(e=>e.kind==='vy-zero').length,0);assert.deepEqual(found.tracks[0].zeroIntervals.map(i=>i.component),['y']);close(found.tracks[0].zeroIntervals[0].endUs,2);
 const b=electric(90,90),vertical=extractTimelineEvents({scene:b.scene,traces:[b.trace]});assert.equal(vertical.events.filter(e=>e.kind==='vx-zero').length,0);assert.equal(vertical.tracks[0].zeroIntervals[0].component,'x');assert.equal(vertical.tracks[0].zeroIntervals[0].kind,'vx-zero');
});
test('native sine roots retain residuals while the orthogonal unforced axis merges into one exact zero band',()=>{
 const {scene,trace}=electric(90,0,'sine'),found=extractTimelineEvents({scene,traces:[trace]}),x=found.events.filter(e=>e.kind==='vx-zero'),y=found.events.filter(e=>e.kind==='vy-zero');assert.equal(x.length,0);assert.equal(found.tracks[0].zeroIntervals.filter(i=>i.component==='x').length,1);assert.equal(found.tracks[0].zeroIntervals[0].method,'constant-component');assert(y.length>=4);assert(y.every(e=>e.method==='native-numerical'&&e.residualMS<1e-6&&e.toleranceUs>0));for(const e of y){const seg=trace.segments[e.segmentIndex],local=e.timeUs*1e-6-seg.t;assert(Math.abs(segmentState(seg,Math.max(0,Math.min(seg.dt,local))).v[1])<1e-6);}
});
test('root budgets are trace-total, fairly split, redistributed from an unused axis, and single-axis filters get the full allowance',()=>{
 const {scene,trace}=circular(30),both=extractTimelineEvents({scene,traces:[trace],maxVelocityRoots:10}),zero=both.events.filter(e=>e.kind.endsWith('-zero'));assert.equal(zero.length,10);assert.equal(zero.filter(e=>e.component==='x').length,5);assert.equal(zero.filter(e=>e.component==='y').length,5);assert.deepEqual(both.tracks[0].velocityRootCounts,{x:60,y:61});assert.deepEqual(both.tracks[0].omittedVelocityRootsByComponent,{x:55,y:56});assert.equal(both.limitations.filter(l=>l.kind==='dense').length,2);
 const single=extractTimelineEvents({scene,traces:[trace],velocityComponents:['x'],maxVelocityRoots:10});assert.equal(single.events.filter(e=>e.kind==='vx-zero').length,10);assert.equal(single.events.filter(e=>e.kind==='vy-zero').length,0);assert.equal(single.tracks[0].omittedVelocityRootsByComponent.x,50);
 const one=electric(90,0,'sine'),onlyY=extractTimelineEvents({scene:one.scene,traces:[one.trace],maxVelocityRoots:3});assert.equal(onlyY.events.filter(e=>e.kind==='vy-zero').length,3);assert.equal(onlyY.events.filter(e=>e.kind==='vx-zero').length,0);
});
test('two close square-wave switches are attributed only to the field changing at that exact native seam',()=>{
 const scene=emptyScene(),first=createObject('electric','o1',[0,0],'infinite'),second=createObject('electric','o2',[0,0],'infinite');Object.assign(first,{E0:.5,fieldAngle:0,waveform:'square',period:1,phase:0});Object.assign(second,{E0:.5,fieldAngle:90,waveform:'square',period:1+1e-8,phase:0});scene.objects=[first,second,createObject('particle','o3')];scene.duration=.6;const trace=solveScene(scene)[0],events=extractTimelineEvents({scene,traces:[trace]}).events.filter(e=>e.kind==='switch');assert.equal(events.length,2);assert.deepEqual(events.map(e=>e.fieldId),['o1','o2']);close(events[0].timeUs,.5);close(events[1].timeUs,(1+1e-8)/2);assert(events[1].timeUs>events[0].timeUs);
});
test('query_events exposes component filtering and range scope without accepting invalid component lists',async()=>{
 const {scene,periodUs}=circular(),scope={mode:'tutor',record:{kind:'planar',title:'合成速度根',snapshot:{scene}}},found=await runAgentTool('query_events',{velocityComponents:['x'],startUs:periodUs/8,endUs:3*periodUs/8},scope),roots=found.events.filter(e=>e.kind.endsWith('-zero'));assert.equal(roots.length,1);assert.equal(roots[0].kind,'vx-zero');assert.equal(roots[0].component,'x');assert.equal(found.tracks[0].velocityRootCounts.x,1);assert.equal(found.tracks[0].velocityRootCounts.y,0);close(roots[0].timeUs,periodUs/4);
 for(const velocityComponents of [[],['x','x'],['z'],'both'])await assert.rejects(()=>runAgentTool('query_events',{velocityComponents},scope),e=>e.status===400&&e.code==='ai_tool_input');
});
