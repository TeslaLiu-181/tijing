import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,example,validate} from '../src/planar-model.mjs';
import {resolveScene} from '../src/planar-relations.mjs';
import {solveScene,segmentState,forcesAt} from '../src/planar-physics.mjs';
import {PaperView} from '../src/planar-view.mjs';
import {buildScene} from '../server/exam/ai-harness.mjs';
import {sceneChanges} from '../server/exam/ai-scene-changes.mjs';

function viewFor(scene,traces=[]){const view=Object.create(PaperView.prototype);Object.assign(view,{model:scene,traces,width:800,height:600,view:{x:0,y:0,scale:80},time:0,touch:false,editor:[],ui:{present:true,selected:null,trace:traces[0]?.particle.traceId,readingSide:'after'},svg:{setAttribute(){},querySelectorAll:()=>[]}});return view;}
const motion=scene=>solveScene(resolveScene(scene).scene).map(trace=>({id:trace.particle.traceId,truncated:trace.truncated,segments:trace.segments.map(segment=>({t:segment.t,dt:segment.dt,end:segment.end,fields:segment.fieldIds,states:[0,segment.dt/2,segment.dt].map(local=>{const state=segmentState(segment,local);return {p:state.p,v:state.v,force:forcesAt(segment,state.v,local)};})}))}));

test('fit and zoom retain metre-scale question coordinates without cropping them',()=>{
 const scene=emptyScene();scene.objects=[createObject('point','o1',[-80,-1000]),createObject('point','o2',[160,340])];
 const original=structuredClone(scene),view=viewFor(scene);view.render=()=>{};view.selectedSegment=()=>({seg:null});view.fit();
 assert(view.view.scale<1);
 for(const point of [[-80,-1000],[160,340]]){const [x,y]=view.screen(point);assert(x>=60&&x<=740);assert(y>=40&&y<=560);}
 const before=view.view.scale;view.zoom(1/1.2);assert(view.view.scale<before);assert.deepEqual(scene,original);
});

test('initial teaching framing can prioritize field geometry while fit-all retains outgoing tracks',()=>{
 const scene=example('circle'),trace=solveScene(resolveScene(scene).scene)[0];
 const far=structuredClone(trace);far.segments=[{...trace.segments[0],p:[0,0],p1:[10,0],v:[1e5,0],dt:.0001,C:null,a:[0,0],sines:[]}];
 const view=viewFor(scene,[far]);view.render=()=>{};view.selectedSegment=()=>({seg:null});view.fit({includeTracks:false});const focused=view.view.scale;
 view.fit();assert(view.view.scale<focused/10);assert.equal(far.segments[0].p1[0],10);
});

test('style survives the proposal schema, changes reviewable presentation, and leaves native motion identical',()=>{
 const scene=example('geometry-transform-fields'),before=structuredClone(scene),original=motion(scene);
 scene.objects.find(o=>o.id==='o9').style={color:'#B5574B',strokeWidth:2.65,dash:'dotted',opacity:.45};scene.objects.find(o=>o.id==='o10').style={color:'#365970',pointSize:8};
 validate(scene);const proposal=buildScene(scene);assert.deepEqual(proposal.objects.find(o=>o.id==='o9').style,scene.objects.find(o=>o.id==='o9').style);assert.deepEqual(motion(proposal),original);
 assert(sceneChanges(before,scene).changed.find(o=>o.id==='o9').fields.some(field=>field.key==='style'));
 const invalid=structuredClone(scene);invalid.objects[0].style={color:'#365970'};assert.throws(()=>validate(invalid),/不支持/);
});

test('styled square-wave field markers still switch exactly by side and retain black-white display rules',()=>{
 const scene=emptyScene(),field=Object.assign(createObject('field','o1',[0,0],'circle'),{waveform:'square',period:.4,phase:0,B:100,style:{color:'#B5574B',strokeWidth:2.65,dash:'solid',opacity:.45}});scene.objects=[field];scene.display.ink=false;scene.display.labels=false;
 const view=viewFor(scene);view.time=.2e-6;view.render();const after=view.field(field);assert.match(view.svg.innerHTML,/data-net-b-mt="-100"/);assert.match(view.svg.innerHTML,/<path[^>]+data-net-marker="magnetic"/);assert.match(after,/stroke="#b5574b"/);assert.match(after,/stroke-dasharray="" stroke-width="2.65"/);assert.match(after,/<g opacity="0.45"/);
 view.ui.readingSide='before';view.render();assert.match(view.svg.innerHTML,/data-net-b-mt="100"/);assert.match(view.svg.innerHTML,/<circle[^>]+data-net-marker="magnetic"/);
 scene.display.ink=true;assert.match(view.field(field),/stroke="#171717"/);assert.equal(field.style.color,'#B5574B');assert.equal(field.B,100);
});

test('trajectory strokes, marker radii and zero opacity use display overrides without changing the trace',()=>{
 const scene=emptyScene(),particle=Object.assign(createObject('particle','o1'),{style:{color:'#8670a6',strokeWidth:3,dash:'dotted',pointSize:10,opacity:.4}});scene.objects=[particle];scene.display.ink=false;scene.display.labels=false;scene.display.velocity=false;scene.display.axes=false;
 const traces=solveScene(scene),before=JSON.stringify(traces),view=viewFor(scene,traces);view.time=.1e-6;view.render();assert.match(view.svg.innerHTML,/stroke="#8670a6" stroke-width="3.7" stroke-dasharray="2 4" opacity="0.4"/);assert.match(view.svg.innerHTML,/r="11" fill="#8670a6"/);assert.equal(JSON.stringify(traces),before);
 particle.style.opacity=0;view.render();assert.match(view.svg.innerHTML,/<g opacity="0" data-style-owner="o1">/);assert.match(view.svg.innerHTML,/stroke-dasharray="2 4" opacity="0"/);
});
