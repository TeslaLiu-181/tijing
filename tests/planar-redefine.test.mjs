import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject} from '../src/planar-model.mjs';
import {addConstruction,fillRegion,moveConstructionPoint,redefineConstruction,ensureGeometryFeature,geometryToolSchema} from '../src/planar-constructions.mjs';
import {resolveScene,setDefinition} from '../src/planar-relations.mjs';
import {solveScene} from '../src/planar-physics.mjs';
const object=(s,id)=>s.objects.find(o=>o.id===id),point=(s,p)=>addConstruction(s,{tool:'point',position:p}).primaryId;
const close=(a,b,eps=1e-9)=>assert(Math.abs(a-b)<=eps,`${a} != ${b}`);

test('reselecting circle center preserves IDs, definitions, bound field and actual boundary motion',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[3,0]),R=createObject('parameter','o'+scene.nextId++);R.unit='cm';R.value=2;scene.objects.push(R);
 const circle=addConstruction(scene,{tool:'circle-radius',inputs:[A],radiusExpr:R.id+'.value'}).primaryId,center=addConstruction(scene,{tool:'center',inputs:[circle]}).primaryId,field=fillRegion(scene,circle,'electric',{E0:1,fieldAngle:0}),particle=createObject('particle','o'+scene.nextId++,[-3,0]);particle.charge=0;scene.objects.push(particle);scene.duration=1;
 let trace=solveScene(resolveScene(scene).scene)[0];close(trace.segments[0].p1[0]*100,-2);close(trace.segments[1].p1[0]*100,2);
 const ids=scene.objects.map(o=>o.id),definition=object(scene,circle).defs.radius,nextId=scene.nextId;object(scene,circle).label='C';object(scene,circle).labelVisible=false;
 const result=redefineConstruction(scene,circle,{inputs:[B]});assert.equal(result.primaryId,circle);assert.deepEqual(result.changedIds,[circle]);assert(result.defined);assert.equal(object(scene,circle).defs.radius,definition);assert.equal(object(scene,circle).label,'C');assert.equal(object(scene,circle).labelVisible,false);assert.equal(scene.nextId,nextId);assert.deepEqual(scene.objects.map(o=>o.id),ids);close(object(scene,center).x,3);close(object(scene,field.id).x,3);assert.equal(object(scene,field.id).regionSource,circle);assert.equal(object(scene,field.id).E0,1);
 trace=solveScene(result.resolution.scene)[0];close(trace.segments[0].p1[0]*100,1);close(trace.segments[1].p1[0]*100,5);assert.deepEqual(trace.segments.map(s=>s.fieldIds),[[],[field.id],[]]);R.value=3;object(scene,R.id).value=3;resolveScene(scene,{changedIds:[R.id]});close(object(scene,circle).radius,3);
});

test('intersection pairs reselect together and legitimate disappearance retains downstream region identity',()=>{
 const scene=emptyScene(),O=point(scene,[0,0]),A=point(scene,[-3,1]),B=point(scene,[3,1]),C=point(scene,[-3,3]),D=point(scene,[3,3]);const circle=addConstruction(scene,{tool:'circle-radius',inputs:[O],radius:2}).primaryId,L=addConstruction(scene,{tool:'line',inputs:[A,B]}).primaryId,N=addConstruction(scene,{tool:'line',inputs:[C,D]}).primaryId,ids=addConstruction(scene,{tool:'intersection',inputs:[L,circle]}).createdIds,poly=addConstruction(scene,{tool:'polygon',inputs:[O,...ids]}).primaryId,field=fillRegion(scene,poly,'field',{B:80});
 const group=object(scene,ids[0]).construction.group,result=redefineConstruction(scene,ids[1],{inputs:[N,circle]});assert.deepEqual(result.changedIds,ids);assert.equal(result.defined,false);assert(result.states.every(s=>!s.defined&&/不存在/.test(s.message)));assert(result.fieldUnavailable);assert(ids.every(id=>object(scene,id).construction.group===group));assert(ids.every(id=>object(scene,id).construction.inputs[0]===N));assert.equal(object(scene,field.id).regionSource,poly);
 const recovered=redefineConstruction(scene,ids[0],{inputs:[L,circle]});assert(recovered.states.every(s=>s.defined));assert.equal(recovered.fieldUnavailable,false);close(object(scene,ids[0]).x,-Math.sqrt(3));close(object(scene,ids[1]).x,Math.sqrt(3));assert.equal(object(scene,field.id).id,field.id);
});

test('tangent pairs reselect together, keep branches and recover after the new point leaves the circle',()=>{
 const scene=emptyScene(),O=point(scene,[0,0]),P=point(scene,[4,0]),Q=point(scene,[1,0]),circle=addConstruction(scene,{tool:'circle-radius',inputs:[O],radius:2}).primaryId,ids=addConstruction(scene,{tool:'tangent',inputs:[P,circle]}).createdIds,parallel=addConstruction(scene,{tool:'parallel',inputs:[ids[0],O]}).primaryId;
 const result=redefineConstruction(scene,ids[0],{inputs:[Q,circle]});assert.deepEqual(result.changedIds,ids);assert(result.states.every(s=>!s.defined));assert.equal(object(scene,parallel)._defined,false);assert(ids.every((id,i)=>object(scene,id).construction.branch===i+1));moveConstructionPoint(scene,Q,[5,.2]);assert(ids.every(id=>object(scene,id)._defined));assert(object(scene,parallel)._defined);assert(ids.every(id=>object(scene,id).construction.inputs[0]===Q));
});

test('input type, missing object, direct and indirect cycles reject without changing any serialized scene data',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),C=point(scene,[0,2]),M=addConstruction(scene,{tool:'midpoint',inputs:[A,B]}).primaryId,N=addConstruction(scene,{tool:'midpoint',inputs:[M,C]}).primaryId,circle=addConstruction(scene,{tool:'circle-radius',inputs:[A],radius:2}).primaryId;
 for(const inputs of [[A],[A,'o999'],[circle,B],[M,B],[N,B]]){const before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,M,{inputs}));assert.equal(JSON.stringify(scene),before);}
 object(scene,M).defs.x='9';const before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,M,{inputs:[A,C]}),/同时/);assert.equal(JSON.stringify(scene),before);
});

test('structural cycles are rejected even when a different undefined input masks numerical evaluation',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),C=point(scene,[4,0]),M=addConstruction(scene,{tool:'midpoint',inputs:[A,B]}).primaryId,N=addConstruction(scene,{tool:'midpoint',inputs:[M,C]}).primaryId,circle=addConstruction(scene,{tool:'circle-radius',inputs:[A],radius:1}).primaryId,farA=point(scene,[-2,3]),farB=point(scene,[2,3]),farLine=addConstruction(scene,{tool:'line',inputs:[farA,farB]}).primaryId,I=addConstruction(scene,{tool:'intersection',inputs:[farLine,circle]}).primaryId;
 assert.equal(object(scene,I)._defined,false);const before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,M,{inputs:[I,N]}),/循环/);assert.equal(JSON.stringify(scene),before);
});

test('independent property back-edges stay legal but real property cycles reject atomically',()=>{
 const scene=emptyScene(),F=createObject('field','o1',[0,0],'circle'),G=createObject('field','o2',[5,0],'circle');scene.objects=[F,G];scene.nextId=3;const M=addConstruction(scene,{tool:'center',inputs:[F.id]}).primaryId;
 setDefinition(scene,G.id,'B',M+'.x / (1 cm) * (1 mT)');resolveScene(scene);const result=redefineConstruction(scene,M,{inputs:[G.id]});assert(result.defined);close(object(scene,M).x,5);close(object(scene,G.id).B,5);
 setDefinition(scene,F.id,'x',M+'.x');resolveScene(scene);const before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,M,{inputs:[F.id]}),/循环/);assert.equal(JSON.stringify(scene),before);
});

test('path reselection preserves parameter meaning and rejects unit reinterpretation',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[3,0]),C=point(scene,[4,0]),first=addConstruction(scene,{tool:'circle-radius',inputs:[A],radius:2}).primaryId,second=addConstruction(scene,{tool:'circle-radius',inputs:[B],radius:1}).primaryId,line=addConstruction(scene,{tool:'segment',inputs:[A,C]}).primaryId,P=addConstruction(scene,{tool:'point-on',inputs:[first],parameter:90}).primaryId;
 const result=redefineConstruction(scene,P,{inputs:[second]});assert(result.defined);close(object(scene,P).x,3);close(object(scene,P).y,1);assert.equal(object(scene,P).pathT,90);const before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,P,{inputs:[line]}),/参数单位不同/);assert.equal(JSON.stringify(scene),before);
 const radius=geometryToolSchema().find(t=>t.id==='circle-radius').parameters[0];assert.equal(radius.min,0);assert.equal(radius.exclusiveMin,true);
});

test('ordinal polygon aliases can reparent without changing index or downstream identity',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),poly=addConstruction(scene,{tool:'regular-polygon',inputs:[A,B],count:5}).primaryId,other=addConstruction(scene,{tool:'regular-polygon',inputs:[A,B],count:3}).primaryId,V=ensureGeometryFeature(scene,poly,'vertex',4),circle=addConstruction(scene,{tool:'circle-point',inputs:[A,V]}).primaryId;
 let result=redefineConstruction(scene,V,{inputs:[other]});assert.equal(result.defined,false);assert.equal(object(scene,V).index,4);assert.equal(object(scene,circle)._defined,false);result=redefineConstruction(scene,V,{inputs:[poly]});assert(result.defined);assert.equal(object(scene,circle).construction.inputs[1],V);close(object(scene,V).x,object(scene,poly).points[3][0]);
});


test('a missing geometric or arithmetic value cannot mask a new property cycle',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),M=addConstruction(scene,{tool:'midpoint',inputs:[A,B]}).primaryId,X=point(scene,[4,0]),circle=addConstruction(scene,{tool:'circle-radius',inputs:[A],radius:1}).primaryId,F=point(scene,[-2,3]),G=point(scene,[2,3]),L=addConstruction(scene,{tool:'line',inputs:[F,G]}).primaryId,I=addConstruction(scene,{tool:'intersection',inputs:[L,circle]}).primaryId;
 setDefinition(scene,X,'x',M+'.x');resolveScene(scene);let before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,M,{inputs:[I,X]}),/循环/);assert.equal(JSON.stringify(scene),before);
 object(scene,X).defs.x='o999.x + '+M+'.x';resolveScene(scene);before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,M,{inputs:[X,B]}),/循环/);assert.equal(JSON.stringify(scene),before);
 object(scene,X).defs={x:'o999.x',y:M+'.x'};resolveScene(scene);before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,M,{inputs:[X,B]}),/循环/);assert.equal(JSON.stringify(scene),before);
});


test('a deleted first curve cannot mask a legacy expression geometry cycle',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),C=point(scene,[4,0]),L=addConstruction(scene,{tool:'line',inputs:[A,B]}).primaryId,circle=addConstruction(scene,{tool:'circle-radius',inputs:[A],radius:1}).primaryId,X=point(scene,[1,0]);setDefinition(scene,X,'position',`intersect(${circle}, ${L}, 1)`);scene.objects=scene.objects.filter(o=>o.id!==circle);resolveScene(scene);const before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,L,{inputs:[X,C]}),/循环/);assert.equal(JSON.stringify(scene),before);
});


test('vertex references do not falsely depend on unrelated free polygon coordinates',()=>{
 const scene=emptyScene(),poly=createObject('polygon','o1');poly.points=[[0,0],[2,0],[0,2]];scene.objects=[poly];scene.nextId=2;const P=point(scene,[0,0]),Q=point(scene,[3,0]);setDefinition(scene,P,'position','vertex(o1, 1)');setDefinition(scene,'o1','point2',`pos(${P}) + point(0, 2)`);assert.equal(resolveScene(scene).issues.length,0);
 const circle=addConstruction(scene,{tool:'circle-radius',inputs:[Q],radius:1}).primaryId,result=redefineConstruction(scene,circle,{inputs:[P]});assert(result.defined);assert.equal(result.issues.length,0);close(object(scene,circle).x,0);
});
