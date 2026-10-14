import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,prepareScene,example} from '../src/planar-model.mjs';
import {addConstruction,fillRegion,moveConstructionPoint,redefineConstruction,ensureGeometryFeature,editPolygonVertices,constructionOwns,acceptsGeometryInput,geometryToolSchema} from '../src/planar-constructions.mjs';
import {resolveScene,setDefinition} from '../src/planar-relations.mjs';
import {solveScene} from '../src/planar-physics.mjs';
import {auditSceneSync,buildScene} from '../server/exam/ai-harness.mjs';
const object=(s,id)=>s.objects.find(o=>o.id===id),point=(s,p)=>addConstruction(s,{tool:'point',position:p}).primaryId;
const close=(a,b,eps=1e-9)=>assert(Math.abs(a-b)<=eps,`${a} != ${b}`);

test('whole shape rotation follows input kinds, circle radius and line domain continuously',()=>{
 const scene=emptyScene(),O=point(scene,[0,0]),A=point(scene,[2,0]),B=point(scene,[4,0]),C=point(scene,[2,2]),R=createObject('parameter','o'+scene.nextId++);R.value=2;R.unit='cm';scene.objects.push(R);
 const sourceCircle=addConstruction(scene,{tool:'circle-radius',inputs:[A],radiusExpr:R.id+'.value'}).primaryId,sourceLine=addConstruction(scene,{tool:'segment',inputs:[A,B]}).primaryId,sourcePoly=addConstruction(scene,{tool:'polygon',inputs:[A,B,C]}).primaryId;
 const ids=[A,sourceLine,sourceCircle,sourcePoly].map(source=>addConstruction(scene,{tool:'rotate',inputs:[source,O],angle:90}).primaryId);assert.deepEqual(ids.map(id=>object(scene,id).kind),['point','line','circle','polygon']);close(object(scene,ids[0]).y,2);close(object(scene,ids[2]).x,0);close(object(scene,ids[2]).y,2);close(object(scene,ids[2]).radius,2);assert.equal(object(scene,ids[1]).lineType,'segment');assert(constructionOwns(object(scene,ids[2]),'radius'));assert(constructionOwns(object(scene,ids[1]),'lineType'));
 const field=fillRegion(scene,ids[2],'field',{B:80});R.value=3;resolveScene(scene,{changedIds:[R.id]});close(field.radius,3);moveConstructionPoint(scene,A,[3,1]);close(field.x,-1);close(field.y,3);assert.equal(field.B,80);object(scene,sourceLine).lineType='ray';resolveScene(scene,{changedIds:[sourceLine]});assert.equal(object(scene,ids[1]).lineType,'ray');assert.throws(()=>setDefinition(scene,ids[2],'radius','9'),/控制/);
});

test('whole polygon translations, symmetries and negative homothety preserve vertex ordinals',()=>{
 const scene=emptyScene(),O=point(scene,[0,0]),V=point(scene,[2,1]),vector=addConstruction(scene,{tool:'segment',inputs:[O,V]}).primaryId,vertices=[[1,1],[3,1],[1,2]].map(p=>point(scene,p)),poly=addConstruction(scene,{tool:'polygon',inputs:vertices}).primaryId;
 for(const [tool,anchor,factor,map] of [['translate',vector,2,p=>[p[0]+4,p[1]+2]],['reflect-line','axisY',1,p=>[-p[0],p[1]]],['reflect-point',O,1,p=>[-p[0],-p[1]]],['dilate',O,-2,p=>[-2*p[0],-2*p[1]]]]){
  const target=addConstruction(scene,{tool,inputs:[poly,anchor],factor}).primaryId;object(scene,target).points.forEach((p,i)=>p.forEach((v,j)=>close(v,map(object(scene,poly).points[i])[j])));const alias=ensureGeometryFeature(scene,target,'vertex',2);close(object(scene,alias).x,map(object(scene,poly).points[1])[0]);assert.equal(object(scene,alias).index,2);
 }
 const defaultScale=addConstruction(scene,{tool:'dilate',inputs:[poly,O]}).primaryId;assert.equal(object(scene,defaultScale).factor,2);
 const scale=scene.objects.find(o=>o.construction?.type==='dilate');close(scale.area,object(scene,poly).area*4);close(scale.perimeter,object(scene,poly).perimeter*2);
});

test('zero scale keeps point defined, pauses degenerate regions and recovers same IDs after reload',()=>{
 let scene=emptyScene();const O=point(scene,[0,0]),A=point(scene,[2,0]),B=point(scene,[4,0]),C=point(scene,[2,2]),line=addConstruction(scene,{tool:'line',inputs:[A,B]}).primaryId,circle=addConstruction(scene,{tool:'circle-radius',inputs:[A],radius:2}).primaryId,poly=addConstruction(scene,{tool:'polygon',inputs:[A,B,C]}).primaryId,K=createObject('parameter','o'+scene.nextId++);K.value=2;scene.objects.push(K);
 const ids=[A,line,circle,poly].map(source=>addConstruction(scene,{tool:'dilate',inputs:[source,O],factorExpr:K.id+'.value'}).primaryId),field=fillRegion(scene,ids[3],'electric',{E0:1,fieldAngle:0});K.value=0;let r=resolveScene(scene,{changedIds:[K.id]});assert(object(scene,ids[0])._defined);close(object(scene,ids[0]).x,0);assert(ids.slice(1).every(id=>!object(scene,id)._defined));assert(r.fieldUnavailable);scene=prepareScene(JSON.parse(JSON.stringify(scene)));object(scene,K.id).value=-1.5;r=resolveScene(scene);assert(ids.every(id=>object(scene,id)._defined));assert.equal(r.fieldUnavailable,false);close(object(scene,ids[2]).radius,3);assert.equal(object(scene,field.id).E0,1);assert.equal(object(scene,field.id).fieldAngle,0);assert.equal(object(scene,field.id).regionSource,ids[3]);
});

test('rotated full region changes real exits while E direction, intensity and particle stay independent',()=>{
 const scene=example('geometry-transform-fields'),alpha=scene.objects.find(o=>o.kind==='parameter'),field=scene.objects.find(o=>o.kind==='electric'),particle=scene.objects.find(o=>o.kind==='particle'),before={mass:particle.mass,charge:particle.charge,speed:particle.speed,heading:particle.heading};let r=resolveScene(scene),trace=solveScene(r.scene)[0];close(trace.segments[1].p1[0]*100,1);const ids=scene.objects.map(o=>o.id);alpha.value=45;r=resolveScene(scene,{changedIds:[alpha.id]});trace=solveScene(r.scene)[0];close(trace.segments[1].p1[0]*100,Math.SQRT1_2,1e-8);assert.deepEqual(trace.segments.map(s=>s.fieldIds),[[],[field.id],[]]);assert.equal(field.E0,.5);assert.equal(field.fieldAngle,0);assert.deepEqual({mass:particle.mass,charge:particle.charge,speed:particle.speed,heading:particle.heading},before);assert.deepEqual(scene.objects.map(o=>o.id),ids);assert.equal(auditSceneSync(scene).harness.passed,true);
});

test('transform contract rejects nongeometry sources, wrong output kinds and incompatible reselect without mutation',()=>{
 const scene=emptyScene(),O=point(scene,[0,0]),A=point(scene,[2,0]),B=point(scene,[4,0]),circle=addConstruction(scene,{tool:'circle-radius',inputs:[A],radius:2}).primaryId,line=addConstruction(scene,{tool:'line',inputs:[A,B]}).primaryId,target=addConstruction(scene,{tool:'rotate',inputs:[circle,O],angle:30}).primaryId,field=fillRegion(scene,target,'field',{B:-80});assert.equal(acceptsGeometryInput(scene,'rotate',0,field.id),false);assert.equal(acceptsGeometryInput(scene,'rotate',0,'axisX'),false);
 const before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,target,{inputs:[line,O]}),/保留原图形类型/);assert.equal(JSON.stringify(scene),before);assert.equal(object(scene,target).kind,'circle');const proposal=structuredClone(scene);proposal.objects.find(o=>o.id===target).construction.inputs[0]=line;assert.equal(auditSceneSync(proposal).harness.passed,false);
 const dilation=addConstruction(scene,{tool:'dilate',inputs:[circle,O],factor:2}).primaryId,missing=structuredClone(scene);delete missing.objects.find(o=>o.id===dilation).factor;assert.throws(()=>buildScene(missing),/factor/);assert(geometryToolSchema().filter(t=>t.category==='transform').every(t=>t.inputKinds[0]==='geometry'&&t.outputKind==='input0'&&t.outputs[0]==='source-kind'));
});
