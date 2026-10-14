import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,example} from '../src/planar-model.mjs';
import {addConstruction} from '../src/planar-constructions.mjs';
import {resolveScene} from '../src/planar-relations.mjs';
import {snapshotObject,insertObjectCopy,hasObjectDependencies} from '../src/planar-object-copy.mjs';

test('independent region snapshots are placed once and no longer follow the original geometry',()=>{
 const scene=example('geometry-transform-fields');resolveScene(scene);const field=scene.objects.find(o=>o.id==='o9'),before=JSON.stringify(scene);
 const draft=snapshotObject(scene,field.id);assert.equal(JSON.stringify(scene),before);assert.equal(hasObjectDependencies(draft),false);
 const origin=[field.x,field.y],placed=insertObjectCopy(scene,draft,{position:[origin[0]+4,origin[1]+2]}).object;
 assert.equal(placed.regionSource,'');assert.deepEqual(placed.defs,{});assert.deepEqual(placed.points,field.points.map(p=>[p[0]+4,p[1]+2]));assert.equal(placed.E0,field.E0);assert.equal(placed.fieldAngle,field.fieldAngle);
 const points=structuredClone(placed.points);scene.objects[0].value=35;resolveScene(scene);assert.deepEqual(placed.points,points);assert.notDeepEqual(field.points,scene.objects.find(o=>o.id==='o7').points);
});

test('linked intersection copies have separate branch groups and still follow the same source curves',()=>{
 const scene=emptyScene(),circle=Object.assign(createObject('circle','o1'),{radius:2}),line=Object.assign(createObject('line','o2'),{points:[[-3,.5],[3,.5]]});scene.objects=[circle,line];scene.nextId=3;
 const pair=addConstruction(scene,{tool:'intersection',inputs:['o1','o2']}),source=scene.objects.find(o=>o.id===pair.createdIds[1]),copy=insertObjectCopy(scene,source).object;
 assert.notEqual(copy.construction.group,source.construction.group);assert.deepEqual(copy.construction.inputs,source.construction.inputs);assert.equal(copy.construction.branch,source.construction.branch);
 line.points=[[-3,1],[3,1]];resolveScene(scene);assert.equal(copy.x,source.x);assert.equal(copy.y,source.y);assert.equal(copy._error,'');
 const before=JSON.stringify(scene);assert.throws(()=>insertObjectCopy(scene,source,{position:[2,2]}),/独立快照/);assert.equal(JSON.stringify(scene),before);
 line.points=[[-3,3],[3,3]];resolveScene(scene);const missing=JSON.stringify(scene);assert.throws(()=>snapshotObject(scene,source.id),/暂未定义/);assert.equal(JSON.stringify(scene),missing);
});

test('self definitions point to the new object and annotation text is preserved verbatim',()=>{
 const scene=emptyScene(),particle=Object.assign(createObject('particle','o1'),{defs:{heading:'o1.mass / o1.mass * 15'}}),label=Object.assign(createObject('label','o2'),{label:'\\frac{mv^2}{2}'});scene.objects=[particle,label];scene.nextId=3;
 const copy=insertObjectCopy(scene,particle).object;assert.equal(copy.defs.heading,'((o3.mass / o3.mass) * 15)');assert.equal(copy.label,particle.label+"'");
 const annotation=insertObjectCopy(scene,snapshotObject(scene,label.id),{position:[3,2]}).object;assert.equal(annotation.label,label.label);
});
