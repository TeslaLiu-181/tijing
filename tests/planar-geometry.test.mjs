import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,prepareScene,validate,example} from '../src/planar-model.mjs';
import {addConstruction,fillRegion,moveConstructionPoint,geometryToolSchema,constructionOwns,ensureGeometryFeature} from '../src/planar-constructions.mjs';
import {resolveScene,createResolver,setDefinition,inheritResolverState,properties,targets,assignValue} from '../src/planar-relations.mjs';
import {compileField,solveScene,forcesAt,E,U} from '../src/planar-physics.mjs';
import {polygonGeometry,polygonContains,constructionSpecs} from '../src/planar-geometry.mjs';
const close=(a,b,eps=1e-9)=>assert(Math.abs(a-b)<=eps,`${a} != ${b}`),object=(s,id)=>s.objects.find(o=>o.id===id);
const point=(s,p)=>addConstruction(s,{tool:'point',position:p}).primaryId;
test('tool schema and typed common constructions retain parent references while moving',()=>{
 const s=emptyScene(),A=point(s,[0,0]),B=point(s,[4,0]),P=point(s,[1,2]);
 const l=addConstruction(s,{tool:'line',inputs:[A,B]}).primaryId,M=addConstruction(s,{tool:'midpoint',inputs:[A,B]}).primaryId,parallel=addConstruction(s,{tool:'parallel',inputs:[l,P]}).primaryId,perp=addConstruction(s,{tool:'perpendicular',inputs:[l,P]}).primaryId,F=addConstruction(s,{tool:'foot',inputs:[P,l]}).primaryId,C=addConstruction(s,{tool:'circle-point',inputs:[A,P]}).primaryId;
 close(object(s,M).x,2);close(object(s,F).x,1);close(object(s,F).y,0);close(object(s,C).radius,Math.sqrt(5));assert(constructionOwns(object(s,l),'point10x'));assert(constructionOwns(object(s,M),'x'));
 moveConstructionPoint(s,B,[4,4]);close(object(s,M).y,2);close(object(s,F).x,1.5);close(object(s,F).y,1.5);
 const v=object(s,parallel).points.map((p,i,a)=>i? [p[0]-a[0][0],p[1]-a[0][1]]:p)[1];close(v[0],v[1]);const q=object(s,perp).points;close((q[1][0]-q[0][0])+(q[1][1]-q[0][1]),0);
 assert.equal(moveConstructionPoint(s,M,[9,9]).moved,false);assert(geometryToolSchema().every(t=>t.id&&t.label&&t.category&&Array.isArray(t.steps)&&Number.isInteger(t.min)&&Number.isInteger(t.max)));
});
test('path points drag on finite lines, circles and a polygon without breaking constraints',()=>{
 const s=emptyScene(),A=point(s,[0,0]),B=point(s,[4,0]),C=point(s,[0,3]);
 const line=addConstruction(s,{tool:'segment',inputs:[A,B]}).primaryId,circle=addConstruction(s,{tool:'circle-radius',inputs:[A],radius:2}).primaryId,poly=addConstruction(s,{tool:'polygon',inputs:[A,B,C]}).primaryId;
 const L=addConstruction(s,{tool:'point-on',inputs:[line],position:[2,1]}).primaryId,Q=addConstruction(s,{tool:'point-on',inputs:[circle],position:[0,2]}).primaryId,R=addConstruction(s,{tool:'point-on',inputs:[poly],position:[2,0]}).primaryId;
 close(object(s,L).x,2);close(object(s,L).y,0);close(object(s,Q).pathT,90);moveConstructionPoint(s,L,[9,2]);close(object(s,L).x,4);moveConstructionPoint(s,Q,[2,0]);close(object(s,Q).x,2);moveConstructionPoint(s,R,[0,2]);close(object(s,R).x,0);close(object(s,R).y,2);
 const parameter=createObject('parameter','o'+s.nextId++);parameter.unit='deg';parameter.value=180;s.objects.push(parameter);setDefinition(s,Q,'pathT',parameter.id+'.value');resolveScene(s);close(object(s,Q).x,-2);assert.equal(moveConstructionPoint(s,Q,[0,2]).moved,false);
});
test('intersection identities survive tangency, disappearance, saved reload and recovery',()=>{
 const s=emptyScene(),O=point(s,[0,0]),A=point(s,[-3,0]),B=point(s,[3,0]);const circle=addConstruction(s,{tool:'circle-radius',inputs:[O],radius:2}).primaryId,line=addConstruction(s,{tool:'line',inputs:[A,B]}).primaryId,ids=addConstruction(s,{tool:'intersection',inputs:[line,circle]}).createdIds;
 close(object(s,ids[0]).x,-2);close(object(s,ids[1]).x,2);moveConstructionPoint(s,A,[-3,2]);moveConstructionPoint(s,B,[3,2]);assert(ids.every(id=>object(s,id)._defined));close(object(s,ids[0]).y,2);close(object(s,ids[1]).y,2);
 moveConstructionPoint(s,A,[-3,3]);moveConstructionPoint(s,B,[3,3]);assert(ids.every(id=>!object(s,id)._defined));const reloaded=prepareScene(JSON.parse(JSON.stringify(s)));resolveScene(reloaded);moveConstructionPoint(reloaded,A,[-3,0]);moveConstructionPoint(reloaded,B,[3,0]);assert(ids.every(id=>object(reloaded,id)._defined));close(object(reloaded,ids[0]).x,-2);close(object(reloaded,ids[1]).x,2);assert.equal(object(reloaded,ids[0]).construction.group,object(reloaded,ids[1]).construction.group);
});
test('three-point circles become undefined without losing objects, then recover',()=>{
 const s=emptyScene(),A=point(s,[0,0]),B=point(s,[2,0]),C=point(s,[0,2]);const circle=addConstruction(s,{tool:'circle-three',inputs:[A,B,C]}).primaryId,field=fillRegion(s,circle,'field',{B:-100});close(object(s,circle).x,1);close(object(s,circle).radius,Math.sqrt(2));moveConstructionPoint(s,C,[3,0]);assert.equal(resolveScene(s).fieldUnavailable,true);assert.equal(object(s,circle)._defined,false);assert(s.objects.some(o=>o.id===field.id));moveConstructionPoint(s,C,[0,2]);assert.equal(resolveScene(s).fieldUnavailable,false);close(field.radius,Math.sqrt(2));
});
test('concave region membership respects notches and clockwise orientation',()=>{
 const pts=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]];for(const points of [pts,[...pts].reverse()]){const g=polygonGeometry(points);assert(polygonContains(g,[.5,2]));assert(polygonContains(g,[2,.5]));assert(!polygonContains(g,[2,2]));close(g.area,5);}
 assert.throws(()=>polygonGeometry([[0,0],[2,2],[0,2],[2,0]]),/自交/);assert.throws(()=>polygonGeometry([[0,0],[1,0],[2,0]]),/面积/);
});
test('dynamic polygon changes bound electric geometry and real entry/exit motion',()=>{
 const s=emptyScene(),ids=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]].map(p=>point(s,p));const poly=addConstruction(s,{tool:'polygon',inputs:ids}).primaryId,field=fillRegion(s,poly,'electric',{E0:1,fieldAngle:0}),particle=createObject('particle','o'+s.nextId++,[-1,2]);particle.speed=1;s.objects.push(particle);s.duration=.5;
 let resolved=resolveScene(s),trace=solveScene(resolved.scene)[0];assert.equal(trace.segments.length,3);assert.deepEqual(trace.segments.map(seg=>seg.fieldIds),[[],[field.id],[]]);close(trace.segments[1].p1[0],.01,1e-11);close(trace.segments[1].p1[1],.02,1e-11);
 const acc=E*1000/(particle.mass*U),timeInside=(-1e5+Math.sqrt(1e10+2*acc*.01))/acc;close(trace.segments[1].dt,timeInside,1e-16);const f=forcesAt(trace.segments[1],trace.segments[1].v);close(f.electric[0],E*1000,1e-29);
 moveConstructionPoint(s,ids[3],[2,1]);moveConstructionPoint(s,ids[4],[2,3]);close(field.points[3][0],2);assert(compileField(field).contains([.015,.02]));resolved=resolveScene(s);trace=solveScene(resolved.scene)[0];close(trace.segments[1].p1[0],.02,1e-10);assert(!trace.truncated);
});
test('bound region invalidity pauses physics and restores the original field identity',()=>{
 const s=emptyScene(),ids=[[0,0],[2,0],[2,2],[0,2]].map(p=>point(s,p)),poly=addConstruction(s,{tool:'polygon',inputs:ids}).primaryId,field=fillRegion(s,poly,'field',{B:-100}),particle=createObject('particle','o'+s.nextId++,[.5,.5]);s.objects.push(particle);
 moveConstructionPoint(s,ids[1],[1,3]);let r=resolveScene(s);assert.equal(r.fieldUnavailable,true);assert.equal(solveScene(r.scene).length,0);assert(s.objects.some(o=>o.id===field.id));validate(s);moveConstructionPoint(s,ids[1],[2,0]);r=resolveScene(s);assert.equal(r.fieldUnavailable,false);assert(solveScene(r.scene).length>0);assert.equal(field.regionSource,poly);
});
test('incremental dependencies update only downstream algorithms and preserve independent chains',()=>{
 const s=emptyScene(),A=point(s,[0,0]),B=point(s,[2,0]),C=point(s,[5,0]),D=point(s,[7,0]);const M=addConstruction(s,{tool:'midpoint',inputs:[A,B]}).primaryId,N=addConstruction(s,{tool:'midpoint',inputs:[C,D]}).primaryId;resolveScene(s);object(s,A).x=1;const r=resolveScene(s,{changedIds:[A]});close(object(s,M).x,1.5);close(object(s,N).x,6);assert(r.dependencyGraph.evaluated.includes(M));assert(!r.dependencyGraph.evaluated.includes(N));assert(r.dependencyGraph.dirty.includes(M));assert(!r.dependencyGraph.dirty.includes(N));assert.equal(r.dependencyGraph.physicsDirty,false);
});
test('real cycles and deleted inputs are diagnosed while same-object free properties remain valid',()=>{
 const s=emptyScene(),A=point(s,[0,0]),B=point(s,[2,0]),M=addConstruction(s,{tool:'midpoint',inputs:[A,B]}).primaryId;setDefinition(s,A,'y',A+'.x + 1');resolveScene(s);close(object(s,A).y,1);object(s,A).construction={type:'midpoint',inputs:[M,B]};object(s,A).defs={};let r=resolveScene(s);assert(r.issues.some(i=>/循环/.test(i.message)));object(s,A).construction=null;object(s,A).x=0;r=resolveScene(s);assert.equal(r.issues.length,0);s.objects=s.objects.filter(o=>o.id!==B);r=resolveScene(s);assert(r.issues.some(i=>/删除/.test(i.message)));assert(s.objects.some(o=>o.id===M));
});
test('polygon area/perimeter units and multi-digit vertices remain genuine dependencies',()=>{
 const s=emptyScene(),ids=Array.from({length:12},(_,i)=>point(s,[2*Math.cos(i*Math.PI/6),2*Math.sin(i*Math.PI/6)])),poly=addConstruction(s,{tool:'polygon',inputs:ids}).primaryId,P=point(s,[0,0]);setDefinition(s,P,'position',`vertex(${poly}, 11)`);resolveScene(s);close(object(s,P).x,object(s,ids[10]).x);const r=createResolver(s);close(r.evaluate(`area(${poly})`).n,.0012,1e-12);close(r.evaluate(`perimeter(${poly})`).n,48*Math.sin(Math.PI/12)*.01,1e-12);const free=createObject('polygon','o'+s.nextId++);free.points=object(s,poly).points.map(p=>[...p]);s.objects.push(free);setDefinition(s,free.id,'point10',`pos(${ids[10]})`);resolveScene(s);moveConstructionPoint(s,ids[10],[1,-1.6]);resolveScene(s);close(free.points[10][0],1);close(free.points[10][1],-1.6);
});


test('concave vertex crossings and along-edge starts use true local region membership',()=>{
 const scene=emptyScene(),ids=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]].map(p=>point(scene,p)),poly=addConstruction(scene,{tool:'polygon',inputs:ids}).primaryId,field=fillRegion(scene,poly,'field',{B:-100});
 const p=createObject('particle','o'+scene.nextId++,[.5,.5]);Object.assign(p,{charge:0,speed:1,heading:45});scene.objects.push(p);scene.duration=.2;let trace=solveScene(resolveScene(scene).scene)[0];assert.equal(trace.segments.length,2);assert.deepEqual(trace.segments.map(s=>s.fieldIds),[[field.id],[]]);close(trace.segments[0].p1[0],.01,1e-12);close(trace.segments[0].p1[1],.01,1e-12);
 Object.assign(p,{x:1,y:1.5,heading:-90});scene.duration=.1;trace=solveScene(resolveScene(scene).scene)[0];assert.equal(trace.segments.length,1);assert.deepEqual(trace.segments[0].fieldIds,[field.id]);close(trace.segments[0].p1[1],.005,1e-12);
});
test('a circular trajectory grazing polygon boundary does not falsely enter from outside or exit from inside',()=>{
 for(const outside of [false,true]){
  const scene=emptyScene(),ids=[[-2,-2],[1,-2],[1,2],[-2,2]].map(p=>point(scene,p)),poly=addConstruction(scene,{tool:'polygon',inputs:ids}).primaryId,regional=fillRegion(scene,poly,'field',{B:0}),global=createObject('field','o'+scene.nextId++,[0,0],'infinite'),particle=createObject('particle','o'+scene.nextId++,outside?[3,0]:[-1,0]);
  Object.assign(particle,{speed:1,heading:outside?-90:90});global.B=(1e7*particle.mass*U/E)*1000;scene.objects.push(global,particle);scene.duration=.8;const trace=solveScene(resolveScene(scene).scene)[0];assert(!trace.truncated);assert(trace.segments.every(segment=>segment.fieldIds.includes(regional.id)===!outside));assert.equal(trace.segments.length,1);
 }
});
test('cloned candidates explicitly inherit pure resolver caches without modifying the source scene',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),C=point(scene,[5,0]),D=point(scene,[7,0]),M=addConstruction(scene,{tool:'midpoint',inputs:[A,B]}).primaryId,N=addConstruction(scene,{tool:'midpoint',inputs:[C,D]}).primaryId;resolveScene(scene);const candidate=structuredClone(scene);object(candidate,A).x=1;assert(inheritResolverState(scene,candidate));const resolution=resolveScene(candidate,{changedIds:[A]});close(object(candidate,M).x,1.5);close(object(scene,M).x,1);assert(resolution.dependencyGraph.evaluated.includes(M));assert(!resolution.dependencyGraph.evaluated.includes(N));assert.equal(object(scene,A).x,0);
});


test('representative dynamic examples preserve field/point identities and symbolic driving parameters',()=>{
 const l=example('geometry-l-region');resolveScene(l);const field=l.objects.find(o=>o.kind==='electric'),polygon=l.objects.find(o=>o.kind==='polygon');assert(field.regionSource===polygon.id);const parameter=l.objects.find(o=>o.kind==='parameter');parameter.value=2;resolveScene(l,{changedIds:[parameter.id]});close(field.points[3][0],2);
 const s=example('geometry-intersections'),h=s.objects.find(o=>o.kind==='parameter'),region=s.objects.find(o=>o.kind==='field');let r=resolveScene(s);assert.equal(r.fieldUnavailable,false);h.value=2.5;r=resolveScene(s,{changedIds:[h.id]});assert.equal(r.fieldUnavailable,true);h.value=1;r=resolveScene(s,{changedIds:[h.id]});assert.equal(r.fieldUnavailable,false);assert(s.objects.some(o=>o.id===region.id));assert(s.objects.filter(o=>o.construction?.type==='intersection').every(o=>o._defined));
});


test('formula labels retain complete mathematical text and explicit pixel box without changing physics',()=>{
 const scene=emptyScene(),label=createObject('label','o1',[1,2]);label.label=String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`.repeat(30);scene.objects.push(label);validate(scene);assert(label.label.length>60);assert.equal(label.fontSize,20);assert.equal(label.labelWidth,320);assert.equal(label.labelHeight,100);label.fontSize=73;assert.throws(()=>validate(scene),/字号/);label.fontSize=20;label.label='x'.repeat(4001);assert.throws(()=>validate(scene),/过长/);
});


test('area and perimeter are referenceable read-only measurements, never editable definitions',()=>{
 const scene=emptyScene(),ids=[[0,0],[2,0],[0,2]].map(p=>point(scene,p)),id=addConstruction(scene,{tool:'polygon',inputs:ids}).primaryId,poly=object(scene,id),r=createResolver(scene);assert.equal(properties(poly).area.readOnly,true);assert.equal(targets(poly).area,undefined);close(r.get(id,'area').n,.0002,1e-12);assert.throws(()=>setDefinition(scene,id,'area','999'),/派生量/);assert.throws(()=>assignValue(poly,'perimeter',999),/派生量/);poly.defs.area='999';assert.throws(()=>validate(scene),/只读/);delete poly.defs.area;poly.area=999;resolveScene(scene);close(poly.area,2);
});


test('rotation, translation and reflections are true constrained outputs with native units',()=>{
 const scene=emptyScene(),O=point(scene,[0,0]),P=point(scene,[1,2]),A=point(scene,[0,0]),B=point(scene,[2,0]),segment=addConstruction(scene,{tool:'segment',inputs:[A,B]}).primaryId,R=addConstruction(scene,{tool:'rotate',inputs:[P,O],angle:90}).primaryId,T=addConstruction(scene,{tool:'translate',inputs:[P,segment],factor:2}).primaryId,mirror=addConstruction(scene,{tool:'reflect-line',inputs:[P,segment]}).primaryId,central=addConstruction(scene,{tool:'reflect-point',inputs:[P,O]}).primaryId;
 close(object(scene,R).x,-2);close(object(scene,R).y,1);close(object(scene,T).x,5);close(object(scene,T).y,2);close(object(scene,mirror).x,1);close(object(scene,mirror).y,-2);close(object(scene,central).x,-1);close(object(scene,central).y,-2);
 moveConstructionPoint(scene,B,[2,2]);close(object(scene,mirror).x,2);close(object(scene,mirror).y,1);close(object(scene,T).y,6);const angle=createObject('parameter','o'+scene.nextId++);angle.value=180;angle.unit='deg';scene.objects.push(angle);setDefinition(scene,R,'angle',angle.id+'.value');resolveScene(scene);close(object(scene,R).x,-1);close(object(scene,R).y,-2);
});
test('angle bisector and regular polygon follow free inputs and recover from invalid linked counts',()=>{
 const scene=emptyScene(),O=point(scene,[0,0]),A=point(scene,[2,0]),B=point(scene,[0,2]),bisector=addConstruction(scene,{tool:'angle-bisector',inputs:[A,O,B]}).primaryId,poly=addConstruction(scene,{tool:'regular-polygon',inputs:[O,A],count:4}).primaryId;
 close(object(scene,bisector).points[1][0],object(scene,bisector).points[1][1]);close(object(scene,poly).area,4);assert.equal(object(scene,poly).points.length,4);const field=fillRegion(scene,poly,'field',{B:-80}),n=createObject('parameter','o'+scene.nextId++);n.value=5;scene.objects.push(n);setDefinition(scene,poly,'count',n.id+'.value');resolveScene(scene);assert.equal(object(scene,poly).points.length,5);assert.equal(field.points.length,5);n.value=2;let r=resolveScene(scene,{changedIds:[n.id]});assert.equal(r.fieldUnavailable,true);validate(scene);n.value=6;r=resolveScene(scene,{changedIds:[n.id]});assert.equal(r.fieldUnavailable,false);assert.equal(field.points.length,6);moveConstructionPoint(scene,A,[3,0]);close(Math.hypot(field.points[1][0]-field.points[0][0],field.points[1][1]-field.points[0][1]),3);
});


test('polygon feature aliases retain IDs, feed later constructions and recover when edge count returns',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),poly=addConstruction(scene,{tool:'regular-polygon',inputs:[A,B],count:5}).primaryId;
 const V=ensureGeometryFeature(scene,poly,'vertex',4),edge=ensureGeometryFeature(scene,poly,'edge',4);
 assert.equal(ensureGeometryFeature(scene,poly,'vertex',4),V);assert.equal(ensureGeometryFeature(scene,poly,'edge',4),edge);
 const circle=addConstruction(scene,{tool:'circle-point',inputs:[A,V]}).primaryId,parallel=addConstruction(scene,{tool:'parallel',inputs:[edge,B]}).primaryId,field=fillRegion(scene,circle,'field',{B:80});
 assert(object(scene,V)._defined);assert.equal(object(scene,edge).lineType,'segment');close(object(scene,V).x,object(scene,poly).points[3][0]);
 object(scene,poly).count=3;let r=resolveScene(scene,{changedIds:[poly]});assert.equal(object(scene,V)._defined,false);assert.equal(object(scene,edge)._defined,false);assert.equal(object(scene,parallel)._defined,false);assert.equal(r.fieldUnavailable,true);
 object(scene,poly).count=5;r=resolveScene(scene,{changedIds:[poly]});assert.equal(r.fieldUnavailable,false);assert(object(scene,V)._defined);assert(object(scene,parallel)._defined);assert(scene.objects.some(o=>o.id===field.id));
 moveConstructionPoint(scene,B,[3,1]);close(object(scene,V).x,object(scene,poly).points[3][0]);close(object(scene,edge).points[1][1],object(scene,poly).points[4][1]);
 const n=createObject('parameter','o'+scene.nextId++);n.value=2;scene.objects.push(n);const linked=addConstruction(scene,{tool:'vertex-point',inputs:[poly],indexExpr:n.id+'.value'}).primaryId;
 close(object(scene,linked).x,object(scene,poly).points[1][0]);n.value=9;resolveScene(scene,{changedIds:[n.id]});assert.equal(object(scene,linked)._defined,false);n.value=1;resolveScene(scene,{changedIds:[n.id]});close(object(scene,linked).x,object(scene,A).x);
});
test('rectangle height projection and three-consecutive-point parallelogram are dynamic regions',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[4,0]),C=point(scene,[3,2]),rect=addConstruction(scene,{tool:'rectangle',inputs:[A,B,C]}).primaryId,par=addConstruction(scene,{tool:'parallelogram',inputs:[A,B,C]}).primaryId;
 assert.deepEqual(object(scene,rect).points,[[0,0],[4,0],[4,2],[0,2]]);const expected=[[0,0],[4,0],[3,2],[-1,2]];object(scene,par).points.forEach((p,i)=>p.forEach((v,j)=>close(v,expected[i][j])));
 const field=fillRegion(scene,rect,'electric',{E0:1});moveConstructionPoint(scene,B,[2,2]);const pts=object(scene,rect).points,u=[pts[1][0]-pts[0][0],pts[1][1]-pts[0][1]],v=[pts[2][0]-pts[1][0],pts[2][1]-pts[1][1]];close(u[0]*v[0]+u[1]*v[1],0);assert.deepEqual(field.points,pts);
 moveConstructionPoint(scene,C,[3,3]);assert.equal(resolveScene(scene).fieldUnavailable,true);moveConstructionPoint(scene,C,[3,2]);assert.equal(resolveScene(scene).fieldUnavailable,false);
});
test('paired tangents preserve contact identities through tangency, disappearance and reload',()=>{
 let scene=emptyScene();const O=point(scene,[0,0]),P=point(scene,[4,0]),circle=addConstruction(scene,{tool:'circle-radius',inputs:[O],radius:2}).primaryId,ids=addConstruction(scene,{tool:'tangent',inputs:[P,circle]}).createdIds;
 assert.equal(ids.length,2);const contacts=ids.map(id=>object(scene,id).points[1]);assert(contacts[0][1]*contacts[1][1]<0);
 const check=()=>{for(const id of ids){const line=object(scene,id),a=line.points[0],b=line.points[1],o=object(scene,O);close((b[0]-o.x)**2+(b[1]-o.y)**2,4,1e-8);close((b[0]-o.x)*(b[0]-a[0])+(b[1]-o.y)*(b[1]-a[1]),0,1e-8);}};check();
 moveConstructionPoint(scene,P,[4,.5]);check();for(let i=0;i<2;i++)assert(Math.sign(object(scene,ids[i]).points[1][1])===Math.sign(contacts[i][1]));
 moveConstructionPoint(scene,P,[2,0]);assert(ids.every(id=>object(scene,id)._defined));for(const id of ids)close(object(scene,id).points[0][0],object(scene,id).points[1][0]);
 moveConstructionPoint(scene,P,[1,0]);assert(ids.every(id=>!object(scene,id)._defined));scene=prepareScene(JSON.parse(JSON.stringify(scene)));resolveScene(scene);moveConstructionPoint(scene,P,[4,0]);assert(ids.every(id=>object(scene,id)._defined));check();for(let i=0;i<2;i++)assert(Math.sign(object(scene,ids[i]).points[1][1])===Math.sign(contacts[i][1]));
});


test('lazy polygon measurements rebuild the complete changed vertex set before measuring',()=>{
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),poly=addConstruction(scene,{tool:'regular-polygon',inputs:[A,B],count:3}).primaryId;
 object(scene,poly).count=6;const r=createResolver(scene);close(r.get(poly,'area').n,6*Math.sqrt(3)*1e-4,1e-12);close(r.get(poly,'perimeter').n,.12,1e-12);assert.equal(object(scene,poly).points.length,6);
});


test('deserialized constructions enforce the same typed inputs as the click tools',()=>{
 for(const tool of geometryToolSchema().filter(t=>t.id!=='point'))assert.deepEqual(tool.inputKinds,constructionSpecs[tool.id].inputKinds);
 const scene=emptyScene(),A=point(scene,[0,0]),B=point(scene,[2,0]),circle=addConstruction(scene,{tool:'circle-radius',inputs:[A],radius:2}).primaryId,M=addConstruction(scene,{tool:'midpoint',inputs:[A,B]}).primaryId;
 object(scene,M).construction.inputs=[circle,B];let r=resolveScene(scene);assert.equal(object(scene,M)._defined,false);assert(r.issues.some(i=>/类型不匹配/.test(i.message)));
 object(scene,M).construction.inputs=[A,B];r=resolveScene(scene);assert.equal(object(scene,M)._defined,true);close(object(scene,M).x,1);
});
