import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject} from '../src/planar-model.mjs';
import {solveScene} from '../src/planar-physics.mjs';
import {extractTimelineEvents} from '../src/planar-timeline-events.mjs';
import {findNextTimelineEvent} from '../src/planar-timeline-navigation.mjs';
function walk(options){const events=[];let timeUs=0,afterEvent=null;for(let i=0;i<12;i++){const next=findNextTimelineEvent({...options,timeUs,afterEvent});if(!next)return events;events.push(next);afterEvent=next;timeUs=next.timeUs*1e-6*1e6;}assert.fail('continuous next-event navigation did not terminate');}

test('continuous next jumps retain native square switches closer than the old time bias',()=>{
 const scene=emptyScene(),first=createObject('electric','o1',[0,0],'infinite'),second=createObject('electric','o2',[0,0],'infinite');Object.assign(first,{E0:.5,fieldAngle:0,waveform:'square',period:1,phase:0});Object.assign(second,{E0:.5,fieldAngle:90,waveform:'square',period:1+2e-10,phase:0});scene.objects=[first,second,createObject('particle','o3')];scene.duration=.6;const traces=solveScene(scene),before=JSON.stringify({scene,traces}),all=extractTimelineEvents({scene,traces}).events.filter(e=>e.kind==='switch');assert.equal(all.length,2);assert(all[1].timeUs-all[0].timeUs>0&&all[1].timeUs-all[0].timeUs<1e-9);
 const biased=extractTimelineEvents({scene,traces,rangeUs:{start:all[0].timeUs+1e-9,end:scene.duration}}).events.filter(e=>e.kind==='switch');assert.equal(biased.length,0);
 const series=walk({scene,traces,traceId:'o3',accept:e=>e.kind==='switch'});assert.deepEqual(series.map(e=>e.fieldId),['o1','o2']);assert.deepEqual(series.map(e=>e.timeUs),all.map(e=>e.timeUs));assert.deepEqual(series.map(e=>e.segmentIndex),[0,1]);assert.equal(findNextTimelineEvent({scene,traces,timeUs:0,accept:e=>e.fieldId==='o2'}).fieldId,'o2');assert.equal(JSON.stringify({scene,traces}),before);
 console.log(JSON.stringify({case:'close-native-switches',previousBiasUs:1e-9,continuousNext:series.map(e=>({fieldId:e.fieldId,timeUs:e.timeUs,segmentIndex:e.segmentIndex})),gapUs:series[1].timeUs-series[0].timeUs}));
});

test('continuous numerical-root jumps avoid reselected approximate roots using only cursor precision',()=>{
 const scene=emptyScene(),field=createObject('electric','o1',[0,0],'infinite'),particle=createObject('particle','o2');Object.assign(field,{E0:1,fieldAngle:90,waveform:'sine',period:.4,phase:90});Object.assign(particle,{mass:1,charge:1,speed:.05,heading:270});scene.objects=[field,particle];scene.duration=.8;const traces=solveScene(scene),options={scene,traces,traceId:'o2',velocityComponents:['y'],accept:e=>e.kind==='vy-zero'},roots=extractTimelineEvents({...options}).events.filter(e=>e.kind==='vy-zero');assert.equal(roots.length,4);
 const naive=extractTimelineEvents({...options,rangeUs:{start:roots[0].timeUs,end:scene.duration}}).events.find(e=>e.kind==='vy-zero'&&e.timeUs>roots[0].timeUs);assert.equal(naive.segmentIndex,roots[0].segmentIndex);assert(naive.timeUs>roots[0].timeUs&&naive.timeUs-roots[0].timeUs<naive.toleranceUs+roots[0].toleranceUs);
 const series=walk(options);assert.equal(series.length,4);assert.deepEqual(series.map(e=>e.segmentIndex),roots.map(e=>e.segmentIndex));for(const [i,event] of series.entries()){assert(Math.abs(event.timeUs-roots[i].timeUs)<=event.toleranceUs+roots[i].toleranceUs);if(i)assert(event.timeUs-series[i-1].timeUs>event.toleranceUs+series[i-1].toleranceUs);}
 const manual=findNextTimelineEvent({...options,timeUs:roots[0].timeUs-.01,afterEvent:roots[0]});assert.equal(manual.segmentIndex,roots[0].segmentIndex);assert.equal(manual.kind,'vy-zero');
 console.log(JSON.stringify({case:'native-numerical-repeat',naiveDuplicate:{timeUs:naive.timeUs,shiftUs:naive.timeUs-roots[0].timeUs,toleranceUs:naive.toleranceUs},continuousNext:series.map(e=>({timeUs:e.timeUs,segmentIndex:e.segmentIndex,residualMS:e.residualMS,toleranceUs:e.toleranceUs}))}));
});


test('future source-instance births remain navigable while current births are not repeated',()=>{
 const scene=emptyScene(),source=createObject('source','o1');Object.assign(source,{count:3,interval:.1});scene.objects=[source];scene.duration=.5;const traces=solveScene(scene),before=JSON.stringify({scene,traces}),accept=e=>e.kind==='birth';
 const selected=findNextTimelineEvent({scene,traces,timeUs:0,traceId:'o1:2',accept});assert(selected);assert.equal(selected.kind,'birth');assert.equal(selected.traceId,'o1:2');assert(Math.abs(selected.timeUs-.2)<1e-15);assert.equal(selected.segmentIndex,0);
 assert.equal(findNextTimelineEvent({scene,traces,timeUs:selected.timeUs*1e-6*1e6,traceId:'o1:2',afterEvent:selected,accept}),null);
 assert.equal(findNextTimelineEvent({scene,traces,timeUs:0,traceId:'o1:0',accept}),null);
 const series=walk({scene,traces,accept});assert.deepEqual(series.map(e=>e.traceId),['o1:1','o1:2']);assert(series.every(e=>e.kind==='birth'&&e.timeUs>0));assert.equal(JSON.stringify({scene,traces}),before);
 console.log(JSON.stringify({case:'future-source-births',selected:{traceId:selected.traceId,timeUs:selected.timeUs},continuousNext:series.map(e=>({traceId:e.traceId,timeUs:e.timeUs})),repeatAtSelectedBirth:null}));
});
