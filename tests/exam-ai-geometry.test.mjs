import {checkSnapshot} from '../src/exam/model.mjs';
import {resolveScene} from '../src/planar-relations.mjs';
import {solveScene,segmentState,forcesAt} from '../src/planar-physics.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,example} from '../src/planar-model.mjs';
import {addConstruction,fillRegion,ensureGeometryFeature} from '../src/planar-constructions.mjs';
import {buildScene,sceneSchema,auditSceneSync} from '../server/exam/ai-harness.mjs';
const point=(s,p)=>addConstruction(s,{tool:'point',position:p}).primaryId;
test('AI native schema contains typed feature aliases, transforms and continuous field regions',()=>{
 const schema=sceneSchema();assert.equal(schema.geometryTools.length,33);assert(schema.constructionTypes['edge-line']);assert(schema.constructionTypes.tangent);assert(schema.constructionTypes['fixed-angle-ray']);assert(schema.constructionTypes['compass-circle']);assert(schema.fieldRegionBinding.continuous);assert(schema.objects.label.defaults.labelWidth===320);
});
test('AI proposals read back derived polygons, aliases and the real bound field trajectory',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),poly=addConstruction(scene,{tool:'regular-polygon',inputs:[A,B],count:4}).primaryId,V=ensureGeometryFeature(scene,poly,'vertex',4),edge=ensureGeometryFeature(scene,poly,'edge',4);addConstruction(scene,{tool:'parallel',inputs:[edge,V]});const field=fillRegion(scene,poly,'field',{B:-100});scene.duration=.2;
 const particle=createObject('particle','o'+scene.nextId++,[1,1]);scene.objects.push(particle);const audit=auditSceneSync(scene);assert.equal(audit.harness.passed,true);assert.equal(audit.harness.traces.length,1);assert.equal(audit.snapshot.scene.objects.find(o=>o.id===field.id).regionSource,poly);assert.equal(audit.snapshot.scene.objects.find(o=>o.id===V).construction.inputs[0],poly);
 const proposal=structuredClone(scene);delete proposal.objects.find(o=>o.id===V).index;assert.throws(()=>buildScene(proposal),/index/);
});
test('AI path point cannot invent a path parameter and constructed output cannot also take definitions',()=>{
 const proposal={duration:1,objects:[{kind:'point',id:'o1',x:0,y:0},{kind:'circle',id:'o2',construction:{type:'circle-radius',inputs:['o1']},radius:2},{kind:'point',id:'o3',construction:{type:'point-on',inputs:['o2'],pathUnit:'deg'}}]};
 assert.throws(()=>buildScene(proposal),/pathT/);proposal.objects[2].pathT=90;assert.equal(auditSceneSync(proposal).harness.passed,true);proposal.objects[2].defs={x:'3'};assert.throws(()=>buildScene(proposal),/同时/);
});


test('optional pixel label offsets round-trip and enter proposals without changing native motion',()=>{
 const scene=example('geometry-transform-fields'),before=resolveScene(scene),ids=scene.objects.map(o=>o.id),target=scene.objects.find(o=>o.construction?.type==='rotate');
 assert(scene.objects.every(o=>!Object.hasOwn(o,'labelOffset')));assert.equal(scene.objects.find(o=>o.id==='o1').label,String.raw`\alpha`);assert.equal(target.label,'A′');const definitions=structuredClone(target.defs);
 const evidence=scene=>solveScene(scene).map(t=>({id:t.particle.traceId,truncated:t.truncated,segments:t.segments.map(s=>({t:s.t,dt:s.dt,end:s.end,ids:s.fieldIds,states:[0,s.dt/2,s.dt].map(time=>{const state=segmentState(s,time);return {p:state.p,v:state.v,forces:forcesAt(s,state.v,time)};})}))}));
 const motion=evidence(before.scene);target.labelOffset={x:40,y:-30};const snapshot=checkSnapshot('planar',{scene:JSON.parse(JSON.stringify(scene))}),proposal=buildScene(snapshot.scene);
 assert.deepEqual(proposal.objects.find(o=>o.id===target.id).labelOffset,{x:40,y:-30});assert.deepEqual(snapshot.scene.objects.map(o=>o.id),ids);assert.deepEqual(snapshot.scene.objects.find(o=>o.id===target.id).defs,definitions);assert.deepEqual(evidence(resolveScene(proposal).scene),motion);assert(snapshot.scene.objects.filter(o=>o.id!==target.id).every(o=>!Object.hasOwn(o,'labelOffset')));
 assert.equal(sceneSchema().optionalDisplayProperties.labelOffset.properties.x.unit,'px');for(const labelOffset of [{x:2001,y:0},{x:0,y:Infinity},[0,0],null,{x:1},{x:0,y:0,z:1}]){const invalid=structuredClone(snapshot.scene);invalid.objects.find(o=>o.id===target.id).labelOffset=labelOffset;assert.throws(()=>buildScene(invalid));}
 const missing={duration:1,objects:[{id:'o1',kind:'particle',x:0,y:0,labelOffset:{x:1,y:2}}]};assert.throws(()=>buildScene(missing),/必填/);
});


test('constraint proposals explicitly supply ratio, polar distance/angle, fixed length and ray angle',()=>{
 const schema=sceneSchema();
 for(const [tool,args,required] of [['ratio-point',{factor:.25},['factor']],['polar-point',{length:1,angle:30},['length','angle']],['fixed-segment',{length:3},['length']],['fixed-angle-ray',{angle:45},['angle']]]){
  const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),target=addConstruction(scene,{tool,inputs:tool==='polar-point'?[A]:[A,B],...args}).primaryId;
  assert.equal(auditSceneSync(scene).harness.passed,true);assert.deepEqual(schema.geometryTools.find(item=>item.id===tool).parameters.map(p=>p.key).sort(),[...required].sort());
  for(const key of required){const missing=structuredClone(scene),object=missing.objects.find(o=>o.id===target);delete object[key];delete object.defs[key];assert.throws(()=>buildScene(missing),new RegExp(key));}
 }
});
