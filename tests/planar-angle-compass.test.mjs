import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,validate} from '../src/planar-model.mjs';
import {addConstruction,fillRegion,redefineConstruction,geometryToolSchema,constructionOwns} from '../src/planar-constructions.mjs';
import {resolveScene,properties,setDefinition,createResolver} from '../src/planar-relations.mjs';
import {solveScene,norm,E,U} from '../src/planar-physics.mjs';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);
const get=(scene,id)=>scene.objects.find(o=>o.id===id);
const point=(scene,p)=>addConstruction(scene,{tool:'point',position:p}).primaryId;
const clean=scene=>{const result=resolveScene(scene);assert.deepEqual(result.issues,[]);validate(scene);return result;};

test('fixed-angle rays preserve the oriented angle definition, ray domain and reselected identity',()=>{
 const scene=emptyScene(),A=point(scene,[1,2]),B=point(scene,[3,2]),C=point(scene,[1,4]),theta=createObject('parameter','o'+scene.nextId++);Object.assign(theta,{unit:'deg',value:90});scene.objects.push(theta);
 const id=addConstruction(scene,{tool:'fixed-angle-ray',inputs:[A,B],angleExpr:theta.id+'.value'}).primaryId;clean(scene);assert.equal(get(scene,id).lineType,'ray');close(get(scene,id).points[0][0],1);close(get(scene,id).points[0][1],2);close(get(scene,id).points[1][0],1);close(get(scene,id).points[1][1],4);assert.equal(properties(get(scene,id)).angle.unit,'deg');assert.equal(constructionOwns(get(scene,id),'lineType'),true);
 theta.value=-90;clean(scene);close(get(scene,id).points[1][1],0);const definitions=structuredClone(get(scene,id).defs);redefineConstruction(scene,id,{inputs:[A,C]});clean(scene);assert.equal(get(scene,id).id,id);assert.deepEqual(get(scene,id).defs,definitions);close(get(scene,id).points[1][0],3);close(get(scene,id).points[1][1],2);
 const before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,id,{inputs:[A,id]}),/正确几何输入/);assert.equal(JSON.stringify(scene),before);assert.throws(()=>setDefinition(scene,id,'point0','point(0,0)'),/构造/);
 const schema=geometryToolSchema().find(t=>t.id==='fixed-angle-ray');assert.deepEqual(schema.inputKinds,['point','point']);assert.equal(schema.parameters[0].default,45);assert.equal(schema.parameters[0].expressionKey,'angleExpr');
});

test('the fixed-angle ray drives downstream points, a bound electric region and fresh motion across angle changes',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),D=point(scene,[0,1]),theta=createObject('parameter','o'+scene.nextId++);Object.assign(theta,{unit:'deg',value:0});scene.objects.push(theta);
 const ray=addConstruction(scene,{tool:'fixed-angle-ray',inputs:[A,B],angleExpr:theta.id+'.value'}).primaryId,P=addConstruction(scene,{tool:'point-on',inputs:[ray],parameter:.5}).primaryId,polygon=addConstruction(scene,{tool:'polygon',inputs:[A,P,D]}).primaryId,field=fillRegion(scene,polygon,'electric',{E0:1,fieldAngle:0}),particle=createObject('particle','o'+scene.nextId++,[-1,.25]);Object.assign(particle,{mass:1,charge:1,speed:1,heading:0});scene.objects.push(particle);scene.duration=.4;const ids=scene.objects.map(o=>o.id);
 for(const angle of [0,45]){
  get(scene,theta.id).value=angle;const resolution=clean(scene);assert.deepEqual(get(scene,field.id).points,get(scene,polygon).points);const trace=solveScene(resolution.scene)[0],inside=trace.segments.filter(s=>s.fieldIds.includes(field.id));assert.equal(inside.length,1);const exit=inside[0].p1[0]*100;close(exit,angle===0?.75:.25);assert.equal(trace.truncated,false);
  console.log(JSON.stringify({tool:'fixed-angle-ray',angle,rayId:ray,pointId:P,polygonId:polygon,fieldId:field.id,exitXCm:exit,finalSpeedMS:norm(trace.segments.at(-1).v1)}));
 }
 get(scene,B).x=get(scene,A).x;get(scene,B).y=get(scene,A).y;const failed=resolveScene(scene);assert.equal(get(scene,ray)._defined,false);assert.equal(failed.fieldUnavailable,true);assert.equal(solveScene(failed.scene).length,0);
 get(scene,B).x=2;clean(scene);assert.deepEqual(scene.objects.map(o=>o.id),ids);assert.equal(get(scene,field.id)._defined,true);
 const before=JSON.stringify(scene);assert.throws(()=>redefineConstruction(scene,ray,{inputs:[A,P]}),/循环/);assert.equal(JSON.stringify(scene),before);
});

test('compass circles migrate AB rather than CB, retain field identity and native electric work after radius changes',()=>{
 const scene=emptyScene(),C=point(scene,[-1,0]),A=point(scene,[3,0]),B=point(scene,[5,0]),circle=addConstruction(scene,{tool:'compass-circle',inputs:[C,A,B]}).primaryId,field=fillRegion(scene,circle,'electric',{E0:1,fieldAngle:0}),particle=createObject('particle','o'+scene.nextId++,[-4,0]);Object.assign(particle,{mass:1,charge:1,speed:1,heading:0});scene.objects.push(particle);scene.duration=.8;const ids=scene.objects.map(o=>o.id);
 for(const endpoint of [5,4]){
  get(scene,B).x=endpoint;const resolution=clean(scene),radius=endpoint-3;close(get(scene,circle).x,-1);close(get(scene,circle).radius,radius);assert.equal(get(scene,field.id).regionSource,circle);close(get(scene,field.id).radius,radius);assert.equal(constructionOwns(get(scene,circle),'radius'),true);
  const trace=solveScene(resolution.scene)[0],inside=trace.segments.filter(s=>s.fieldIds.includes(field.id));assert.equal(inside.length,1);close(inside[0].p1[0]*100,-1+radius);const deltaKEV=U*(norm(trace.segments.at(-1).v1)**2-norm(trace.segments[0].v)**2)/(2*E);close(deltaKEV,20*radius);
  console.log(JSON.stringify({tool:'compass-circle',circleId:circle,fieldId:field.id,radiusCm:radius,exitXCm:inside[0].p1[0]*100,deltaKEV}));
 }
 get(scene,B).x=3;const failed=resolveScene(scene);assert.equal(get(scene,circle)._defined,false);assert.equal(failed.fieldUnavailable,true);assert.equal(solveScene(failed.scene).length,0);assert.throws(()=>createResolver(scene).get(circle,'radius'),/半径|圆/);
 get(scene,B).x=5;clean(scene);assert.deepEqual(scene.objects.map(o=>o.id),ids);close(get(scene,circle).radius,2);
 const definitions=structuredClone(get(scene,circle).defs);redefineConstruction(scene,circle,{inputs:[A,C,B]});clean(scene);assert.deepEqual(get(scene,circle).defs,definitions);close(get(scene,circle).x,3);close(get(scene,circle).radius,6);
 const schema=geometryToolSchema().find(t=>t.id==='compass-circle');assert.deepEqual(schema.inputKinds,['point','point','point']);assert.equal(geometryToolSchema().length,33);
});
