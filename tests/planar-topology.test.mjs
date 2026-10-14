import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject} from '../src/planar-model.mjs';
import {addConstruction,fillRegion,editPolygonVertices,ensureGeometryFeature} from '../src/planar-constructions.mjs';
import {resolveScene,setDefinition} from '../src/planar-relations.mjs';
import {solveScene} from '../src/planar-physics.mjs';
const object=(s,id)=>s.objects.find(o=>o.id===id),point=(s,p)=>addConstruction(s,{tool:'point',position:p}).primaryId;
const close=(a,b,eps=1e-9)=>assert(Math.abs(a-b)<=eps,`${a} != ${b}`);

test('adding and reordering polygon inputs keeps region/field identity, ordinal aliases and real exits',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[3,0]),C=point(scene,[0,3]),D=point(scene,[3,3]),poly=addConstruction(scene,{tool:'polygon',inputs:[A,B,C]}).primaryId,V=ensureGeometryFeature(scene,poly,'vertex',2),edge=ensureGeometryFeature(scene,poly,'edge',3),field=fillRegion(scene,poly,'electric',{E0:1,fieldAngle:0}),p=createObject('particle','o'+scene.nextId++,[-1,2]);p.charge=0;scene.objects.push(p);scene.duration=.5;
 let trace=solveScene(resolveScene(scene).scene)[0];close(trace.segments[1].p1[0]*100,1);const ids=scene.objects.map(o=>o.id),nextId=scene.nextId;
 const result=editPolygonVertices(scene,poly,{inputs:[A,B,D,C,A]});assert(result.defined);assert.equal(object(scene,poly).construction.inputs.length,4);assert.equal(object(scene,field.id).regionSource,poly);assert.equal(object(scene,field.id).E0,1);assert.deepEqual(scene.objects.map(o=>o.id),ids);assert.equal(scene.nextId,nextId);
 trace=solveScene(result.resolution.scene)[0];close(trace.segments[1].p1[0]*100,3);assert.deepEqual(trace.segments.map(s=>s.fieldIds),[[],[field.id],[]]);close(object(scene,poly).area,9);
 editPolygonVertices(scene,poly,{inputs:[C,D,B,A]});assert.equal(object(scene,V).index,2);assert.equal(object(scene,edge).index,3);close(object(scene,V).x,3);close(object(scene,V).y,3);assert.deepEqual(object(scene,edge).points,[[3,0],[0,0]]);
});

test('free polygon coordinates retain index definitions and do not silently discard removed targets',()=>{
 const scene=emptyScene(),parameter=createObject('parameter','o1'),poly=createObject('polygon','o2');parameter.unit='cm';parameter.value=3;poly.points=[[0,0],[3,0],[0,3]];scene.objects=[parameter,poly];scene.nextId=3;setDefinition(scene,'o2','point1x','o1.value');const field=fillRegion(scene,'o2','field',{B:100});
 editPolygonVertices(scene,'o2',{points:[[0,0],[4,0],[4,3],[0,3]]});assert.equal(object(scene,'o2').defs.point1x,'o1.value');close(object(scene,'o2').points[1][0],3);assert.equal(object(scene,field.id).regionSource,'o2');object(scene,'o1').value=2;resolveScene(scene,{changedIds:['o1']});close(object(scene,field.id).points[1][0],2);
 setDefinition(scene,'o2','point3','point(0, 3)');resolveScene(scene);const before=JSON.stringify(scene);assert.throws(()=>editPolygonVertices(scene,'o2',{points:[[0,0],[2,0],[0,2]]}),/定义目标/);assert.equal(JSON.stringify(scene),before);
});

test('self-intersection and degeneration are explicit undefined states and recover the same field',()=>{
 const scene=emptyScene(),ids=[[0,0],[2,0],[2,2],[0,2]].map(p=>point(scene,p)),poly=addConstruction(scene,{tool:'polygon',inputs:ids}).primaryId,field=fillRegion(scene,poly,'field',{B:-100}),p=createObject('particle','o'+scene.nextId++,[1,1]);scene.objects.push(p);
 let result=editPolygonVertices(scene,poly,{inputs:[ids[0],ids[2],ids[1],ids[3]]});assert.equal(result.defined,false);assert(result.fieldUnavailable);assert(result.states.some(s=>/自交/.test(s.message)));assert.equal(solveScene(result.resolution.scene).length,0);assert(scene.objects.some(o=>o.id===field.id));
 result=editPolygonVertices(scene,poly,{inputs:[ids[0],ids[1],ids[1]]});assert.equal(result.defined,false);assert(result.fieldUnavailable);
 result=editPolygonVertices(scene,poly,{inputs:ids});assert(result.defined);assert.equal(result.fieldUnavailable,false);assert.equal(object(scene,field.id).regionSource,poly);assert.equal(solveScene(result.resolution.scene).length,1);
});

test('wrong input, size, missing IDs, cycles and derived polygons reject atomically',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),C=point(scene,[0,2]),poly=addConstruction(scene,{tool:'polygon',inputs:[A,B,C]}).primaryId,V=ensureGeometryFeature(scene,poly,'vertex',1),circle=addConstruction(scene,{tool:'circle-radius',inputs:[A],radius:1}).primaryId,regular=addConstruction(scene,{tool:'regular-polygon',inputs:[A,B],count:5}).primaryId;
 for(const action of [()=>editPolygonVertices(scene,poly,{inputs:[A,B]}),()=>editPolygonVertices(scene,poly,{inputs:[...Array(64).fill(A),B]}),()=>editPolygonVertices(scene,poly,{inputs:[A,B,'o999']}),()=>editPolygonVertices(scene,poly,{inputs:[A,B,circle]}),()=>editPolygonVertices(scene,poly,{inputs:[V,B,C]}),()=>editPolygonVertices(scene,regular,{inputs:[A,B,C]}),()=>editPolygonVertices(scene,poly,{points:[[0,0],[2,0],[0,2]]})]){const before=JSON.stringify(scene);assert.throws(action);assert.equal(JSON.stringify(scene),before);}
 const free=createObject('polygon','o'+scene.nextId++);scene.objects.push(free);const before=JSON.stringify(scene);assert.throws(()=>editPolygonVertices(scene,free.id,{points:[[0,0],[Infinity,0],[0,2]]}));assert.equal(JSON.stringify(scene),before);
});

test('ordinal aliases disappear and recover when vertex count changes without index migration',()=>{
 const scene=emptyScene(),ids=[[0,0],[3,0],[3,3],[0,3]].map(p=>point(scene,p)),poly=addConstruction(scene,{tool:'polygon',inputs:ids}).primaryId,V=ensureGeometryFeature(scene,poly,'vertex',4),edge=ensureGeometryFeature(scene,poly,'edge',4),n=createObject('parameter','o'+scene.nextId++);n.value=4;scene.objects.push(n);setDefinition(scene,V,'index',n.id+'.value');resolveScene(scene);
 editPolygonVertices(scene,poly,{inputs:ids.slice(0,3)});assert.equal(object(scene,V)._defined,false);assert.equal(object(scene,edge)._defined,false);assert.equal(object(scene,V).defs.index,n.id+'.value');assert.equal(object(scene,edge).index,4);
 editPolygonVertices(scene,poly,{inputs:ids});assert(object(scene,V)._defined);assert(object(scene,edge)._defined);close(object(scene,V).y,3);assert.equal(object(scene,edge).construction.inputs[0],poly);
});
