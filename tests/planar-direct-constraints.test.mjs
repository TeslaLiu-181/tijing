import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,prepareScene,validate} from '../src/planar-model.mjs';
import {addConstruction,fillRegion,moveConstructionPoint,redefineConstruction,geometryToolSchema,constructionOwns} from '../src/planar-constructions.mjs';
import {resolveScene,createResolver,setDefinition,properties} from '../src/planar-relations.mjs';
import {solveScene} from '../src/planar-physics.mjs';
const object=(s,id)=>s.objects.find(o=>o.id===id),point=(s,p)=>addConstruction(s,{tool:'point',position:p}).primaryId,close=(a,b,eps=1e-9)=>assert(Math.abs(a-b)<=eps,`${a} != ${b}`);
function parameter(s,value,unit=''){const p=createObject('parameter','o'+s.nextId++);Object.assign(p,{value,unit});s.objects.push(p);return p.id;}

test('signed ratio points keep factor definitions, allow external/coincident cases and move actual bound field motion',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[4,0]),lambda=parameter(scene,.5),P=addConstruction(scene,{tool:'ratio-point',inputs:[A,B],factorExpr:lambda+'.value'}).primaryId,circle=addConstruction(scene,{tool:'circle-radius',inputs:[P],radius:1}).primaryId,field=fillRegion(scene,circle,'electric',{E0:1,fieldAngle:0}),particle=createObject('particle','o'+scene.nextId++,[-2,0]);particle.speed=1;scene.objects.push(particle);scene.duration=.7;
 let trace=solveScene(resolveScene(scene).scene)[0];close(object(scene,P).x,2);close(trace.segments[0].p1[0]*100,1);close(trace.segments[1].p1[0]*100,3);
 object(scene,lambda).value=0;trace=solveScene(resolveScene(scene,{changedIds:[lambda]}).scene)[0];close(object(scene,field.id).x,0);close(trace.segments[0].p1[0]*100,-1);close(trace.segments[1].p1[0]*100,1);
 object(scene,lambda).value=-.5;resolveScene(scene,{changedIds:[lambda]});close(object(scene,P).x,-2);object(scene,lambda).value=1.5;resolveScene(scene,{changedIds:[lambda]});close(object(scene,P).x,6);moveConstructionPoint(scene,B,[0,0]);assert(object(scene,P)._defined);close(object(scene,P).x,0);assert.equal(object(scene,P).defs.factor,lambda+'.value');
 const C=point(scene,[0,4]),result=redefineConstruction(scene,P,{inputs:[A,C]});assert(result.defined);close(object(scene,P).y,6);assert.equal(object(scene,field.id).regionSource,circle);
});

test('polar points respect cm/m and global degree direction, accept zero radius and pause/recover invalid dimensional definitions',()=>{
 const scene=emptyScene(),O=point(scene,[1,2]),r=parameter(scene,.02,'m'),theta=parameter(scene,90,'deg'),P=addConstruction(scene,{tool:'polar-point',inputs:[O],lengthExpr:r+'.value',angleExpr:theta+'.value'}).primaryId,circle=addConstruction(scene,{tool:'circle-radius',inputs:[P],radius:1}).primaryId,field=fillRegion(scene,circle,'field',{B:-80});close(object(scene,P).x,1);close(object(scene,P).y,4);close(object(scene,P).length,2);
 object(scene,theta).value=180;resolveScene(scene,{changedIds:[theta]});close(object(scene,P).x,-1);close(object(scene,field.id).x,-1);object(scene,r).value=0;resolveScene(scene,{changedIds:[r]});assert(object(scene,P)._defined);close(object(scene,P).x,1);close(object(scene,P).y,2);
 setDefinition(scene,P,'length',theta+'.value');let result=resolveScene(scene);assert.equal(result.fieldUnavailable,true);assert.equal(object(scene,P)._defined,false);setDefinition(scene,P,'length',r+'.value');object(scene,r).value=.01;result=resolveScene(scene);assert.equal(result.fieldUnavailable,false);close(object(scene,P).x,0);assert.equal(object(scene,P).defs.angle,theta+'.value');
 const restored=prepareScene(JSON.parse(JSON.stringify(scene)));resolveScene(restored);assert.equal(object(restored,P).construction.type,'polar-point');assert.equal(object(restored,P).defs.length,r+'.value');close(object(restored,P).length,1);validate(restored);
});

test('fixed segments drive polygon/field geometry, keep a finite segment and recover after coincident directions',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[1,0]),C=point(scene,[0,2]),L=parameter(scene,.02,'m'),segment=addConstruction(scene,{tool:'fixed-segment',inputs:[A,B],lengthExpr:L+'.value'}).primaryId,X=point(scene,[2,0]);setDefinition(scene,X,'position',`end(${segment}, 2)`);const poly=addConstruction(scene,{tool:'polygon',inputs:[A,X,C]}).primaryId,field=fillRegion(scene,poly,'electric',{E0:.5,fieldAngle:0}),particle=createObject('particle','o'+scene.nextId++,[-1,1]);particle.speed=1;scene.objects.push(particle);scene.duration=.5;
 let result=resolveScene(scene),trace=solveScene(result.scene)[0];assert.equal(object(scene,segment).lineType,'segment');assert(constructionOwns(object(scene,segment),'lineType'));close(trace.segments[1].p1[0]*100,1);object(scene,L).value=.04;result=resolveScene(scene,{changedIds:[L]});trace=solveScene(result.scene)[0];close(object(scene,X).x,4);close(trace.segments[1].p1[0]*100,2);
 moveConstructionPoint(scene,B,[0,0]);result=resolveScene(scene);assert.equal(object(scene,segment)._defined,false);assert.equal(result.fieldUnavailable,true);assert.equal(solveScene(result.scene).length,0);validate(scene);moveConstructionPoint(scene,B,[1,0]);result=resolveScene(scene);assert.equal(result.fieldUnavailable,false);assert.equal(object(scene,segment).defs.length,L+'.value');close(object(scene,X).x,4);assert.equal(object(scene,field.id).regionSource,poly);
});

test('tool metadata and native dimensionless length fix support formula factories without polluting free objects',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[4,0]),tools=geometryToolSchema();assert.equal(tools.length,33);assert.equal(tools.find(t=>t.id==='ratio-point').parameters[0].default,.5);assert.equal(tools.find(t=>t.id==='polar-point').parameters[0].min,0);assert(tools.find(t=>t.id==='fixed-segment').parameters[0].exclusiveMin);assert.equal(properties(object(scene,A)).length,undefined);
 const resolver=createResolver(scene),unitLength=resolver.evaluate(`length(unit(vector(${A}, ${B})))`);close(unitLength.n,1);assert.deepEqual(unitLength.d,[0,0,0,0,0]);const ratio=addConstruction(scene,{tool:'ratio-point',inputs:[A,B],factorExpr:`length(unit(vector(${A}, ${B}))) / 2`}).primaryId;close(object(scene,ratio).x,2);assert.equal(properties(object(scene,ratio)).factor.unit,'');
 const polar=addConstruction(scene,{tool:'polar-point',inputs:[A]}).primaryId;close(object(scene,polar).x,1);close(object(scene,polar).y,0);assert.equal(object(scene,polar).angle,0);const fixed=addConstruction(scene,{tool:'fixed-segment',inputs:[A,B]}).primaryId;close(object(scene,fixed).points[1][0],2);assert.equal(properties(object(scene,fixed)).length.unit,'cm');
 const rotated=addConstruction(scene,{tool:'rotate',inputs:[fixed,A],angle:90}).primaryId;assert.equal(object(scene,rotated).kind,'line');close(object(scene,rotated).points[1][1],2);assert.throws(()=>addConstruction(scene,{tool:'polar-point',inputs:[A],length:-1}));assert.throws(()=>addConstruction(scene,{tool:'fixed-segment',inputs:[A,B],length:0}));
});
