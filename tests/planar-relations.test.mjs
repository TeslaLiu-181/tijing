import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,example,prepareScene,validate} from '../src/planar-model.mjs';
import {resolveScene,setDefinition,createResolver,cloneDefinitions,snapPoint,pathParameter,definitionTex} from '../src/planar-relations.mjs';
import {toNative} from '../src/planar-expressions.mjs';
import {solveScene,norm,sub,E,U} from '../src/planar-physics.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<=1e-11*Math.max(1,Math.abs(a),Math.abs(b)),`${a} ≠ ${b}`);
const clean=scene=>{const r=resolveScene(scene);assert.deepEqual(r.issues,[]);validate(scene);return r;};

test('root expressions retain dimensions, degrees and editable definitions',()=>{
 const scene=example('dependency-triangle');clean(scene);const [a,field,p]=scene.objects;
 close(field.width/field.height,Math.SQRT2);a.value=3.25;clean(scene);close(field.width,Math.SQRT2*3.25);close(p.x,-field.width/2);close(p.y,0);
 const r=createResolver(scene);close(toNative(r.evaluate('sin(30) + cos(60)')),1);close(toNative(r.evaluate('2^3^2')),512);close(toNative(r.evaluate('-2^2')),-4);
 close(toNative(r.evaluate('sqrt(2) * o2.height + 2'),'cm'),Math.SQRT2*3.25+2);
 close(toNative(r.evaluate('1 m + 2 cm'),'cm'),102);
 assert.throws(()=>toNative(r.evaluate('o2.B + o2.width'),'cm'),/量纲/);
 assert.match(definitionTex(scene,field.defs.width),/sqrt/);
 assert.doesNotMatch(definitionTex(scene,'sqrt(2) * a'),/已删除/);
 assert.throws(()=>r.evaluate('globalThis.alert(1)'),/找不到引用对象/);
});

test('equal-radius formula converts u, e, mT, cm and speed units without drift',()=>{
 const scene=example('dependency-circle');clean(scene);const [field,line,p]=scene.objects;
 for(const B of [-90,30,135]){field.B=B;clean(scene);const radius=p.mass*U*p.speed*1e5/(Math.abs(p.charge*E*B*.001));close(radius,field.radius*.01);}
 setDefinition(scene,p.id,'speed',`abs(${p.id}.charge * ${field.id}.B) * ${field.id}.radius / ${p.id}.mass`);clean(scene);
 close(toNative(createResolver(scene).evaluate(`orbitRadius(${p.id}.mass, ${p.id}.charge, ${p.id}.speed, ${field.id}.B)`),'cm'),field.radius);
 const tracks=solveScene(resolveScene(scene).scene);assert.equal(tracks.length,1);assert.ok(tracks[0].segments.some(s=>s.C));
});

test('intersection branch survives tangency, undefined state and recovery',()=>{
 const scene=example('dependency-circle');clean(scene);const [field,line,p]=scene.objects;
 assert.ok(p.x<0);setDefinition(scene,p.id,'position','intersect(o1, o2, 2)');clean(scene);assert.ok(p.x>0);
 line.points=[[-3,2],[3,2]];clean(scene);close(p.x,0);close(p.y,2);
 line.points=[[-3,2.2],[3,2.2]];let result=resolveScene(scene);assert.ok(p._error.includes('交点'));assert.equal(solveScene(result.scene).length,0);assert.ok(p.defs.position.includes('2'));
 line.points=[[-3,.6],[3,.6]];result=clean(scene);assert.ok(p.x>0);assert.equal(solveScene(result.scene).length,1);
 field.B=0;result=resolveScene(scene);assert.ok(p._error.includes('圆轨道'));field.B=-60;clean(scene);
});

test('finite segments, circular paths, projections and composite geometric references',()=>{
 const scene=emptyScene();scene.objects=[Object.assign(createObject('circle','o1'),{radius:2}),Object.assign(createObject('line','o2'),{points:[[3,0],[4,0]],lineType:'segment'}),createObject('point','o3')];
 setDefinition(scene,'o3','position','intersect(o1, o2, 1)');assert.ok(resolveScene(scene).issues.length);
 scene.objects[1].lineType='line';clean(scene);close(scene.objects[2].x,-2);
 scene.objects[2].pathT=45;setDefinition(scene,'o3','position','on(o1, o3.pathT)');clean(scene);close(scene.objects[2].x,Math.SQRT2);close(scene.objects[2].y,Math.SQRT2);
 close(pathParameter(scene,'o1',[0,-2]),270);
 setDefinition(scene,'o3','position','foot(point(1, 2), line(point(0, 0), point(1, 0)))');clean(scene);close(scene.objects[2].x,1);close(scene.objects[2].y,0);
 setDefinition(scene,'o3','position','intersect(perp(axisX, point(1, 2)), line(point(0, 0), point(2, 2)), 1)');clean(scene);close(scene.objects[2].x,1);close(scene.objects[2].y,1);
 scene.objects[1].points[0]=[0,0];setDefinition(scene,'o2','point1','o2.point0 + 2 cm * unit(rotate(vector(end(axisX, 1), end(axisX, 2)), 90))');clean(scene);close(scene.objects[1].points[1][0],0);close(scene.objects[1].points[1][1],2);
});

test('same-object dependencies work; cycles are rejected and undefined fields pause physics',()=>{
 const scene=example('circle');setDefinition(scene,'o1','width','sqrt(2)*o1.height');clean(scene);
 assert.throws(()=>setDefinition(scene,'o1','height','o1.width'),/循环/);assert.equal(scene.objects[0].defs.height,undefined);clean(scene);
 const helper=Object.assign(createObject('parameter','o3'),{value:0});scene.objects.push(helper);setDefinition(scene,'o1','B','10 / o3.value');let r=resolveScene(scene);assert.equal(r.fieldUnavailable,true);assert.equal(solveScene(r.scene).length,0);
 helper.value=2;r=clean(scene);assert.equal(r.fieldUnavailable,false);close(scene.objects[0].B,5);
});

test('JSON, renamed objects, copying and removed references preserve relation identity',()=>{
 const scene=example('dependency-triangle');clean(scene);const [a,field]=scene.objects;
 a.label='new_name';a.value=4;clean(scene);close(field.height,4);
 const copy=structuredClone(field);copy.id='o4';copy.x=20;copy.enabled=false;copy.defs.width='sqrt(2) * o2.height';cloneDefinitions(copy,field.id);assert.ok(copy.defs.width.includes('o4.height'));scene.objects.push(copy);clean(scene);
 const saved=JSON.stringify(scene);assert.ok(!saved.includes('_issues'));assert.ok(saved.includes('sqrt'));const restored=prepareScene(JSON.parse(saved));clean(restored);restored.objects[0].value=1.5;clean(restored);close(restored.objects[1].height,1.5);
 const missing=restored.objects.shift();assert.ok(resolveScene(restored).issues.length);restored.objects.unshift(missing);clean(restored);
 const old={...emptyScene(),version:1};delete old.snap;prepareScene(old);validate(old);assert.equal(old.version,4);
});

test('grid coordinates and visible geometric candidates use mathematical positions',()=>{
 const scene=example('dependency-circle');clean(scene);scene.snap.step=.25;
 assert.deepEqual(snapPoint(scene,[.36,-.39],{geometry:false}).p,[.25,-.5]);
 const expected=[-Math.sqrt(4-.36),.6],candidate=snapPoint(scene,[expected[0]+.012,.61],{exclude:'o3',scale:100});
 close(norm(sub(candidate.p,expected)),0);assert.match(candidate.expr,/intersect/);
 const free=snapPoint(scene,[.36,-.39],{geometry:false,grid:false});assert.deepEqual(free.p,[.36,-.39]);
 const axisScene=emptyScene();axisScene.snap.step=.5;const axisSnap=snapPoint(axisScene,[2.005,.001]);assert.deepEqual(axisSnap.p,[2,0]);assert.ok(axisSnap.path);
});

test('two endpoints keep independent path parameters; axes use centimetre coordinates',()=>{
 const scene=emptyScene(),o=createObject('line','o1');o.pathT0=2;o.pathT1=3;scene.objects=[o];
 setDefinition(scene,'o1','point0','on(axisX, o1.pathT0)');setDefinition(scene,'o1','point1','on(axisY, o1.pathT1)');clean(scene);
 assert.deepEqual(o.points,[[2,0],[0,3]]);o.pathT0=4;clean(scene);assert.deepEqual(o.points,[[4,0],[0,3]]);
 close(o.x,2);close(o.y,1.5);close(toNative(createResolver(scene).evaluate('o1.x'),'cm'),2);
});

test('calculate once keeps the exact computed value without installing a dependency',()=>{
 const scene=example('dependency-triangle');clean(scene);const [a,field]=scene.objects;
 setDefinition(scene,field.id,'width','sqrt(3)*a',false);clean(scene);const width=field.width;
 assert.equal(field.defs.width,undefined);a.value=4;clean(scene);close(field.width,width);close(field.height,4);
});
