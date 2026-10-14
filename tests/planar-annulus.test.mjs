import test from 'node:test';
import assert from 'node:assert/strict';
import {createObject,emptyScene,example,validate} from '../src/planar-model.mjs';
import {compileField,fieldsAt,solveScene,forcesAt,segmentState,norm,dot,E,U,overlapping} from '../src/planar-physics.mjs';
import {properties,resolveScene,createResolver,setDefinition,geometryFeatures,pathParameter} from '../src/planar-relations.mjs';
import {curvePoint,curveParameter} from '../src/planar-geometry.mjs';
import {buildScene,sceneSchema,auditSceneSync,readStoredScene} from '../server/exam/ai-harness.mjs';
const get=(s,id)=>s.objects.find(o=>o.id===id),close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const clean=s=>{const r=resolveScene(s);assert.deepEqual(r.issues,[]);validate(s);return r;};
function straight({y=0,x=-3,heading=0,speed=1,charge=0,innerRadius=1,kind='field',duration=.6}={}){const s=emptyScene(),f=createObject(kind,'o1',[0,0],'annulus'),p=createObject('particle','o2',[x,y]);Object.assign(f,{radius:2,innerRadius,B:80,E0:2,fieldAngle:0});Object.assign(p,{mass:1,charge,speed,heading});s.objects=[f,p];s.nextId=3;s.duration=duration;return s;}

test('annulus contains excludes the hole and uses the correct inner normal for rate, curvature and jerk',()=>{
 const o=createObject('field','o1',[0,0],'annulus'),field=compileField(o,1),active=(p,v,acc=[0,0],jerk=[0,0])=>fieldsAt([field],p,{v,acc,jerk,tol:1e-12}).ids.length===1;
 assert.equal(field.edges.length,2);assert.equal(field.edges[1].inner,true);assert.equal(field.contains([0,0]),false);assert.equal(field.contains([1.5,0]),true);assert.equal(field.contains([3,0]),false);
 assert.equal(active([1,0],[1,0]),true);assert.equal(active([1,0],[-1,0]),false);assert.equal(active([1,0],[0,1]),true);assert.equal(active([2,0],[0,1]),false);
 for(const [p,expectedOut] of [[[1,0],true],[[2,0],false]]){assert.equal(active(p,[0,0],[1,0]),expectedOut);assert.equal(active(p,[0,0],[-1,0]),!expectedOut);assert.equal(active(p,[0,0],[0,0],[1,0]),expectedOut);assert.equal(active(p,[0,0],[0,0],[-1,0]),!expectedOut);}
 const disk=structuredClone(o);disk.innerRadius=0;assert.equal(compileField(disk).edges.length,1);assert.equal(compileField(disk).contains([0,0]),true);
 assert.equal(overlapping(o,{...o,id:'o2',innerRadius:1.9,radius:3}),true);assert.equal(overlapping(o,{...o,id:'o2',shape:'circle',radius:.5}),false);
});

test('a stationary particle in the hole is field-free and native inner/outer tangent paths do not invent crossings',()=>{
 const hole=straight({x:0,speed:0,charge:1,kind:'electric'}),stationary=solveScene(clean(hole).scene)[0];assert.equal(stationary.segments.length,1);assert.deepEqual(stationary.segments[0].fieldIds,[]);assert.deepEqual(stationary.segments[0].p1,[0,0]);assert.deepEqual(stationary.segments[0].v1,[0,0]);
 const inner=straight({y:1}),innerTrace=solveScene(clean(inner).scene)[0];assert.deepEqual(innerTrace.segments.map(s=>s.fieldIds),[[],['o1'],[]]);close(innerTrace.segments[1].p[0]*100,-Math.sqrt(3));close(innerTrace.segments[1].p1[0]*100,Math.sqrt(3));
 const outer=straight({y:2}),outerTrace=solveScene(clean(outer).scene)[0];assert.equal(outerTrace.segments.length,1);assert.deepEqual(outerTrace.segments[0].fieldIds,[]);
 const alongInner=straight({x:1,y:0,heading:90,duration:.3}),innerStart=solveScene(clean(alongInner).scene)[0];assert.deepEqual(innerStart.segments.map(s=>s.fieldIds),[['o1'],[]]);
 const alongOuter=straight({x:2,y:0,heading:90,duration:.3}),outerStart=solveScene(clean(alongOuter).scene)[0];assert.deepEqual(outerStart.segments.map(s=>s.fieldIds),[[]]);
 console.log(JSON.stringify({case:'annulus-hole-and-tangencies',holeSegments:stationary.segments.length,innerTangent:innerTrace.segments.map(s=>s.fieldIds),outerTangent:outerTrace.segments.map(s=>s.fieldIds)}));
});

test('the native annular-electric lesson traverses two shells, conserves energy in the hole, and degenerates exactly to disk',()=>{
 for(const [R,r,expectedWork] of [[2,1,40],[2,0,80],[2.4,1.2,48]]){
  const scene=example('annular-electric');get(scene,'o1').value=R;get(scene,'o2').value=r;const trace=solveScene(clean(scene).scene)[0],inside=trace.segments.filter(s=>s.fieldIds.includes('o4')),deltaKEV=U*(norm(trace.segments.at(-1).v1)**2-norm(trace.segments[0].v)**2)/(2*E),workEV=inside.reduce((sum,s)=>sum+2000*(s.p1[0]-s.p[0]),0);
  assert.equal(trace.truncated,false);assert.equal(trace.segments.length,r===0?3:5);close(deltaKEV,expectedWork);close(workEV,expectedWork);assert.equal(get(scene,'o4').innerRadius,r);assert.equal(get(scene,'o4').radius,R);
  if(r>0){const hole=trace.segments[2];assert.deepEqual(hole.fieldIds,[]);close(hole.p[0]*100,-r);close(hole.p1[0]*100,r);close(norm(hole.v1),norm(hole.v));}
  else{const disk=structuredClone(scene);get(disk,'o4').shape='circle';delete get(disk,'o4').innerRadius;delete get(disk,'o4').defs.innerRadius;assert.deepEqual(solveScene(clean(disk).scene)[0].segments,trace.segments);}
  assert(scene.objects.some(o=>o.kind==='label'&&/演示赋值/.test(o.label)));console.log(JSON.stringify({case:'annular-electric',R,r,segments:trace.segments.length,fieldSequence:trace.segments.map(s=>s.fieldIds),deltaKEV,electricWorkEV:workEV}));
 }
});

test('a charged native particle crosses a magnetic shell and hole repeatedly while magnetic power remains zero',()=>{
 const s=straight({x:-3,speed:2,charge:1,duration:.6});get(s,'o1').B=20;const trace=solveScene(clean(s).scene)[0];assert.equal(trace.truncated,false);assert.deepEqual(trace.segments.map(seg=>seg.fieldIds),[[],['o1'],[],['o1'],[]]);let maxPowerRatio=0;
 for(const seg of trace.segments)for(const t of [0,seg.dt/2,seg.dt]){const state=segmentState(seg,t),force=forcesAt(seg,state.v,t);close(norm(state.v),200000);const ratio=Math.abs(dot(force.magnetic,state.v))/Math.max(1e-100,norm(force.magnetic)*norm(state.v));maxPowerRatio=Math.max(maxPowerRatio,ratio);assert(ratio<1e-12);}
 console.log(JSON.stringify({case:'magnetic-annulus',segments:trace.segments.length,fieldSequence:trace.segments.map(s=>s.fieldIds),finalSpeedMS:norm(trace.segments.at(-1).v1),maxMagneticPowerRatio:maxPowerRatio}));
});

test('typed radius dependencies, undefined recovery, measurements and strict AI shape inputs preserve the true annulus',()=>{
 const scene=example('annular-electric'),ids=scene.objects.map(o=>o.id);assert.equal(properties(get(scene,'o4')).innerRadius.unit,'cm');assert.equal(properties(get(scene,'o4')).radius.name,'外半径');assert.equal(Object.hasOwn(createObject('field','o9'),'innerRadius'),false);
 let r=createResolver(scene);close(r.evaluate('area(o4)').n*10000,3*Math.PI);close(r.evaluate('perimeter(o4)').n*100,6*Math.PI);assert.equal(r.geometry(r.evaluate('o4')).kind,'annulus');let features=geometryFeatures(scene).curves.filter(c=>c.expr.includes('o4'));assert.equal(features.length,2);assert(features.every(c=>c.g.kind==='circle'));assert(features.some(c=>c.expr.includes('innerRadius')));
 for(const expression of ['on(o4, 0)','intersect(o4, axisX, 1)'])assert.throws(()=>r.evaluate(expression),/环域不是单条/);assert.throws(()=>r.evaluate('vertex(o4,1)'),/环域没有/);assert.throws(()=>r.evaluate('edge(o4,1)'),/环域边界/);const g=r.geometry(r.evaluate('o4'));assert.throws(()=>curvePoint(g,0),/环域不是单条/);assert.throws(()=>curveParameter(g,[0,0]),/环域不是单条/);assert.throws(()=>pathParameter(scene,'o4',[0,0]),/环域不是单条/);close(Math.abs(r.evaluate('intersect(circle(pos(o4), o4.radius), axisX, 1)').p[0])*100,2);
 get(scene,'o2').value=2.5;let failed=resolveScene(scene);validate(scene);assert.equal(failed.fieldUnavailable,true);assert.equal(get(scene,'o4').innerRadius,2.5);assert(get(scene,'o4')._issues.annulus);assert.equal(solveScene(failed.scene).length,0);assert.throws(()=>createResolver(scene).evaluate('area(o4)'),/内半径/);assert.throws(()=>createResolver(scene).evaluate('perimeter(o4)'),/内半径/);const restored=readStoredScene(JSON.parse(JSON.stringify(scene)));assert.equal(resolveScene(restored).fieldUnavailable,true);
 get(scene,'o2').value=1.2;setDefinition(scene,'o4','radius','2 * o2.value');clean(scene);assert.deepEqual(scene.objects.map(o=>o.id),ids);close(get(scene,'o4').radius,2.4);close(get(scene,'o4').innerRadius,1.2);get(scene,'o2').value=0;assert.equal(resolveScene(scene).fieldUnavailable,true);get(scene,'o2').value=1;clean(scene);
 get(scene,'o2').value=0;delete get(scene,'o4').defs.radius;get(scene,'o4').radius=2;clean(scene);r=createResolver(scene);close(r.evaluate('area(o4)').n*10000,4*Math.PI);close(r.evaluate('perimeter(o4)').n*100,4*Math.PI);features=geometryFeatures(scene).curves.filter(c=>c.expr.includes('o4'));assert.equal(features.length,1);
 const proposal=example('annular-electric');assert.equal(auditSceneSync(proposal).harness.passed,true);for(const key of ['radius','innerRadius']){const missing=structuredClone(proposal);delete get(missing,'o4')[key];delete get(missing,'o4').defs[key];assert.throws(()=>buildScene(missing),new RegExp(key));}
 const invalid=structuredClone(proposal);get(invalid,'o2').value=3;assert.equal(auditSceneSync(invalid).harness.passed,false);const bound=structuredClone(proposal);get(bound,'o4').regionSource='o3';assert.throws(()=>buildScene(bound),/环形场不能/);assert.deepEqual(sceneSchema().fieldShapeProperties.annulus.required,['radius','innerRadius']);
});
