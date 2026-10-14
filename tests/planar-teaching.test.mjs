import test from 'node:test';
import assert from 'node:assert/strict';
import {lessons,lessonScene,lessonDuration} from '../src/planar-lessons.mjs';
import {resolveScene} from '../src/planar-relations.mjs';
import {emptyScene,createObject,prepareScene,validate} from '../src/planar-model.mjs';
import {solveScene,segmentState,norm,sub,dot,rotate,TAU,E,U,waveFactor} from '../src/planar-physics.mjs';
import {midpointConstruction,teachingState,motionStages,nextBoundary} from '../src/planar-teaching.mjs';
const close=(a,b,tol=2e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(Math.abs(a),Math.abs(b),1e-5),`${a} != ${b}`);
const path=id=>solveScene(lessonScene(id))[0],boundary=t=>t.segments.filter(s=>s.end==='boundary');

test('every lesson resolves its expressions and produces finite complete trajectories',()=>{
 for(const l of lessons){const s=lessonScene(l.id);validate(s);assert.deepEqual(resolveScene(s).issues,[],l.id);
  for(const t of solveScene(s)){assert.ok(t.segments.length,l.id);assert.equal(t.truncated,false,l.id);for(const seg of t.segments)assert.ok([...seg.p,...seg.v,...seg.p1,...seg.v1,seg.dt].every(Number.isFinite),l.id);}
 }
});
test('example 1 preserves charge ratios and both exit angles',()=>{
 const ts=solveScene(lessonScene('ex1')),a=ts[0].segments[1],b=ts[1].segments[1];close(norm(b.v)/norm(a.v),Math.sqrt(3));close(a.r/b.r,Math.sqrt(3));close(Math.abs(a.w*a.dt),Math.PI/6);close(Math.abs(b.w*b.dt),Math.PI/3);
});
test('example 2 matches O, M, velocity and analytic stage times',()=>{
 const t=path('ex2'),[a,b]=t.segments,L=.015,v=1e5;close(norm(a.p1),0);close(a.v1[0],v);close(a.v1[1],-v/Math.sqrt(3));close(a.dt,2*Math.sqrt(3)*L/v);close(b.p1[0],0);close(b.p1[1],-2*L);close(b.dt,2*Math.PI*L/(3*v));
 const data=teachingState(t,a.dt,'xy',{side:'before'});assert.equal(data.seg,a);assert.ok(data.atBoundary);const after=teachingState(t,a.dt);assert.equal(after.seg,b);assert.ok(after.atBoundary);assert.equal(after.local,0);assert.equal(nextBoundary(t,a.dt),a.dt+b.dt);
});
test('midpoint is an actual tangent intersection for translated rotated and negative-charge motion',()=>{
 const original=path('ex2').segments[0];
 for(const angle of [0,.73,Math.PI/2])for(const sign of [1,-1]){
  const seg={...original,p:[.021,-.06],v:rotate(original.v,angle),a:rotate(original.a.map(x=>x*sign),angle)};
  for(const fraction of [.1,.5,1]){const g=midpointConstruction(seg,seg.dt*fraction);assert.ok(g.valid);close(norm(sub(g.mid,g.intersection)),0);close(norm(sub(g.start,g.mid)),norm(sub(g.mid,g.foot)));close((g.end[0]-g.intersection[0])*g.velocity[1]-(g.end[1]-g.intersection[1])*g.velocity[0],0,1e-5);}
 }
 assert.equal(midpointConstruction(original,0).valid,false);assert.equal(midpointConstruction({...original,w:1},original.dt).valid,false);assert.equal(midpointConstruction({...original,sines:[{}]},original.dt).valid,false);assert.equal(midpointConstruction({...original,v:[1,1]},original.dt).valid,false);assert.equal(midpointConstruction({...original,a:[0,0]},original.dt).valid,false);
});
test('example 3 exits vertically and example 4 only touches the far boundary',()=>{
 const a=boundary(path('ex3'));close(a[0].p1[1],-Math.sqrt(3)*.015);close(a[0].dt,8*Math.PI*.015/(3e5));close(a[1].p1[0],-.0225);close(a[1].p1[1],0);assert.ok(Math.abs(a[1].v1[0])<1e-5);
 const mag=path('ex4').segments.find(s=>s.C);close(mag.C[0]+mag.r,.03);close(mag.p1[0],.015);assert.equal(mag.end,'boundary');
});
test('exercise 1 target intersection moves left for stronger B and right for larger U',()=>{
 const hit=s=>{resolveScene(s);const seg=solveScene(s)[0].segments.find(s=>s.C);assert.ok(seg);const [x,y]=seg.p1,[vx,vy]=seg.v1;assert.ok(vx>0&&vy<0);return x+(-.03-y)/vy*vx;};
 const s=lessonScene('p1'),x=hit(s),strong=structuredClone(s),fast=structuredClone(s);strong.objects.find(o=>o.label==='|B|').value*=1.1;fast.objects.find(o=>o.label==='U').value*=1.2;assert.ok(hit(strong)<x);assert.ok(hit(fast)>x);
});
test('exercise 2 magnetic boundary separation is independent of deflection voltage',()=>{
 const base=lessonScene('p2');let d0;
 for(const voltage of [50,100,150]){const s=structuredClone(base);s.objects.find(o=>o.label==='U_2').value=voltage;resolveScene(s);const mag=solveScene(s)[0].segments.find(s=>s.C);const d=mag.p1[1]-mag.p[1];close(d,2*mag.m*mag.v[0]/Math.abs(mag.q*mag.B));if(d0)close(d,d0);d0=d;}
});
test('exercise 3 returns to the tangent at sqrt(3) R; exercise 4 first arc is 3/4 turn',()=>{
 const mag=path('p3').segments.find(s=>s.C),t=-mag.p1[1]/mag.v1[1];close(mag.p1[0]+t*mag.v1[0],-Math.sqrt(3)*.015);close(mag.r,.015/Math.sqrt(3));
 const arc=path('p4').segments.find(s=>s.C);close(Math.abs(arc.w*arc.dt),1.5*Math.PI);
});
test('exercise 5 fourth crossing and sixth crossing time follow textbook expressions',()=>{
 const crossing=boundary(path('p5'));assert.ok(crossing.length>=6);close(crossing[3].p1[0],2*(7-4*Math.sqrt(2))*.015);close(crossing[5].t+crossing[5].dt,(10+9*(Math.sqrt(2)-1)*Math.PI)*.015/1e5);
});
test('exercise 6 selection, contradictory part 2, and part 3 switching trajectory',()=>{
 const a=path('p6a');close(a.segments.at(-1).v1[0],1e5);assert.ok(Math.abs(a.segments.at(-1).v1[1])<1e-5);
 const s=lessonScene('p6b'),B=s.objects.find(o=>o.kind==='field'),t=solveScene(s)[0],end=boundary(t)[0];assert.ok(B.period*1e-6/2<.015/1e5);assert.ok(end.t+end.dt>B.period*1e-6/2);assert.ok(Math.abs(end.p1[1]-.0075)>.001);
 const exit=boundary(path('p6c'))[0];close(exit.p1[0],.015);close(exit.p1[1],-(6+Math.sqrt(3))/7*.015);
});
test('square B splits at exact switch, continuous state, no magnetic work, future-boundary navigation',()=>{
 const t=path('p6c');
 for(let i=0;i<t.segments.length-1;i++){const a=t.segments[i],b=t.segments[i+1];close(norm(sub(a.p1,b.p)),0);close(norm(sub(a.v1,b.v)),0);close(norm(a.v),norm(a.v1));if(a.end==='switch')close(a.B,-b.B);}
 assert.ok(t.segments.some(s=>s.end==='switch'));assert.ok(motionStages(t).length>=3);
});
test('lesson length scaling retains symbolic geometry and scales observation time',()=>{
 const s=lessonScene('ex2'),old=path('ex2');s.objects.find(o=>o.label==='L').value*=2;resolveScene(s);s.duration=lessonDuration(s);const changed=solveScene(s)[0];close(changed.segments[0].dt,2*old.segments[0].dt);close(changed.segments[1].p1[1],-.06);close(changed.segments[1].B,old.segments[1].B/2);
});
test('scene migration keeps legacy constant fields and roundtrips new teaching settings',()=>{
 const old=emptyScene();delete old.teaching;old.objects=[createObject('field','o1')];delete old.objects[0].waveform;prepareScene(old);validate(old);assert.equal(old.objects[0].waveform,'dc');assert.equal(old.teaching.enabled,false);
 const s=lessonScene('p6c'),loaded=prepareScene(JSON.parse(JSON.stringify({...s,version:5})));validate(loaded);assert.equal(loaded.objects.find(o=>o.kind==='field').waveform,'square');assert.equal(loaded.teaching.pauseAtBoundary,true);
});
