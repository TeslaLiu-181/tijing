import test from 'node:test';
import assert from 'node:assert/strict';
import {example,validate,prepareScene} from '../src/planar-model.mjs';
import {resolveScene} from '../src/planar-relations.mjs';
import {solveScene,E,U,norm} from '../src/planar-physics.mjs';
const close=(actual,expected,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<=tolerance*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);
const get=(scene,id)=>scene.objects.find(o=>o.id===id);
function solved(scene){const resolution=resolveScene(scene);assert.deepEqual(resolution.issues,[]);validate(scene);const traces=solveScene(resolution.scene);assert.equal(traces.length,1);assert.equal(traces[0].truncated,false);return traces[0];}

test('regular-field examples continuously preserve the circumradius, native measurements, and electric work',()=>{
 for(const [n,R] of [[3,.5],[6,2],[12,3]]){
  const scene=example('geometry-regular-field');get(scene,'o1').value=n;get(scene,'o2').value=R;const trace=solved(scene),polygon=get(scene,'o6'),field=get(scene,'o7');
  assert.equal(polygon.points.length,n);assert.deepEqual(field.points,polygon.points);for(const p of polygon.points)close(Math.hypot(...p),R);
  close(get(scene,'o9').value,n*R*R*Math.sin(2*Math.PI/n)/2);close(get(scene,'o10').value,2*n*R*Math.sin(Math.PI/n));
  assert.equal(get(scene,'o5').defs.angle,'360 deg / o1.value');assert.equal(polygon.defs.count,'o1.value');assert.equal(field.regionSource,'o6');assert.equal(trace.particle.mass,1);assert.equal(trace.particle.charge,1);
  const inField=trace.segments.filter(s=>s.fieldIds.includes('o7')),first=trace.segments[0],last=trace.segments.at(-1),deltaK=U*(norm(last.v1)**2-norm(first.v)**2)/2,work=E*1000*inField.reduce((sum,s)=>sum+s.p1[0]-s.p[0],0);
  assert.ok(trace.segments.every(s=>[...s.p1,...s.v1].every(Number.isFinite)));assert.ok(deltaK>=-1e-25);assert.ok(Math.abs(deltaK-work)<=1e-11*Math.max(Math.abs(work),1e-20));
  if(R===.5)assert.equal(inField.length,0);else{assert.equal(inField.length,1);assert.ok(norm(last.v1)>norm(first.v));}
  console.log(JSON.stringify({example:'geometry-regular-field',n,R,areaCm2:get(scene,'o9').value,perimeterCm:get(scene,'o10').value,segments:trace.segments.length,fieldVisits:inField.length,finalSpeedMS:norm(last.v1),deltaKEV:deltaK/E,electricWorkEV:work/E}));
 }
});

test('wedge-field native exits turn clockwise by alpha in the documented slider range',()=>{
 for(const [L,alpha,r] of [[3,60,1.2],[3,120,.5],[3,120,1.5]]){
  const scene=example('geometry-wedge-field');get(scene,'o1').value=L;get(scene,'o2').value=alpha;get(scene,'o3').value=r;const trace=solved(scene),triangle=get(scene,'o7'),field=get(scene,'o8'),particle=get(scene,'o9');
  assert.ok(L>2*r*Math.sin(alpha*Math.PI/360));close(Math.hypot(...triangle.points[1]),L);close(Math.hypot(...triangle.points[2]),L);assert.deepEqual(field.points,triangle.points);assert.equal(field.regionSource,'o7');
  close(particle.speed*1e5,E*.080*r*.01/U);assert.equal(particle.defs.speed,'orbitSpeed(o9.mass, o9.charge, o8.B, o3.value)');assert.equal(particle.mass,1);assert.equal(particle.charge,1);
  const inside=trace.segments.filter(s=>s.fieldIds.includes('o8'));assert.equal(inside.length,1);const exit=inside[0];assert.equal(exit.end,'boundary');
  close(exit.p1[0]*100,r*Math.sin(alpha*Math.PI/180));close(exit.p1[1]*100,-r*(1-Math.cos(alpha*Math.PI/180)));const heading=Math.atan2(exit.v1[1],exit.v1[0])*180/Math.PI;close(heading,-alpha);
  for(const s of trace.segments){close(norm(s.v),norm(trace.segments[0].v));close(norm(s.v1),norm(trace.segments[0].v));}assert.deepEqual(trace.segments.at(-1).fieldIds,[]);assert.ok((exit.t+exit.dt)*1e6<scene.duration);
  console.log(JSON.stringify({example:'geometry-wedge-field',L,alpha,r,exitCm:exit.p1.map(v=>v*100),exitHeadingDeg:heading,exitTimeUs:(exit.t+exit.dt)*1e6,segments:trace.segments.length,speedMS:norm(exit.v1)}));
 }
});

test('the new examples retain IDs and recover undefined geometry without clipping typed values',()=>{
 const regular=example('geometry-regular-field'),ids=regular.objects.map(o=>o.id);get(regular,'o1').value=2;let resolution=resolveScene(regular);assert.equal(get(regular,'o6')._defined,false);assert.equal(resolution.fieldUnavailable,true);
 get(regular,'o1').value=13;resolution=resolveScene(regular);assert.deepEqual(resolution.issues,[]);assert.equal(get(regular,'o1').value,13);assert.equal(get(regular,'o6').points.length,13);assert.deepEqual(regular.objects.map(o=>o.id),ids);
 const wedge=example('geometry-wedge-field'),wedgeIds=wedge.objects.map(o=>o.id);get(wedge,'o2').value=0;resolution=resolveScene(wedge);assert.equal(get(wedge,'o7')._defined,false);assert.equal(resolution.fieldUnavailable,true);
 get(wedge,'o2').value=60;get(wedge,'o1').value=1.5;resolution=resolveScene(wedge);assert.deepEqual(resolution.issues,[]);assert.equal(get(wedge,'o1').value,1.5);assert.deepEqual(wedge.objects.map(o=>o.id),wedgeIds);
});

test('example slider preferences, colors, and explicit demo assignments survive snapshot preparation',()=>{
 for(const name of ['geometry-regular-field','geometry-wedge-field']){const scene=example(name);resolveScene(scene);validate(scene);const restored=prepareScene(JSON.parse(JSON.stringify(scene)));validate(restored);assert.deepEqual(restored.objects,scene.objects);assert.equal(scene.display.ink,false);assert.ok(scene.objects.some(o=>o.kind==='label'&&/演示赋值/.test(o.label)));assert.ok(!scene.objects.some(o=>/质子/.test(o.label)));}
 const regular=example('geometry-regular-field');assert.deepEqual(get(regular,'o1').slider,{min:3,max:12,step:1});assert.deepEqual(get(regular,'o2').slider,{min:.5,max:3,step:.1});
 const wedge=example('geometry-wedge-field');assert.deepEqual(get(wedge,'o1').slider,{min:3,max:5,step:.25});assert.deepEqual(get(wedge,'o2').slider,{min:30,max:120,step:5});assert.deepEqual(get(wedge,'o3').slider,{min:.5,max:1.5,step:.1});
});
