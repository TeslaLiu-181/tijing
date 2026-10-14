import {test} from 'node:test';
import assert from 'node:assert/strict';
import {topics,initialParameters} from '../src/guide-curriculum.mjs';
import {evaluateTopic,verticalState,leftHandBasis,cross,dot,norm,unit,sub,makePathField,fieldFromPaths,line} from '../src/guide-physics.mjs';
const topic=id=>topics.find(t=>t.id===id);
const solve=(id,index=0,extra={},mode='lesson')=>{const t=topic(id);return evaluateTopic(t,{...initialParameters(t,index),...extra},index,mode);};
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('curriculum: 19 groups, complete questions and nonempty correct reasoning',()=>{
 assert.equal(topics.length,19);assert.equal(new Set(topics.map(t=>t.id)).size,19);
 for(const t of topics){assert.ok(t.figures.length);for(const q of t.questions){assert.ok(q.steps.length>=2);for(const s of q.steps){assert.ok(s.title&&s.text);assert.ok(!s.text.includes('String.raw'));}}}
});
test('example 1: source-given rounded trigonometry gives M=.75, a=3.2',()=>{
 const a=solve('example-1',0),b=solve('example-1',1);near(a.I,5);near(a.T,7.5);near(a.f,-2.5);near(b.N,1);near(b.accel,3.2);near(b.T,5.1);
 const precise=solve('example-1',1,{},'explore');assert.ok(Math.abs(precise.accel-3.2)>.001);
});
test('example 2: R=22/3 has zero friction, R=24 reaches limiting friction',()=>{const a=solve('example-2'),b=solve('example-2',1);near(a.I,6);near(a.N,16);near(a.f,0);near(b.I,2);near(b.f,8);near(b.accel,0);});
test('source rail questions and minima',()=>{
 const r=solve('guide-balance');near(r.N,10-4/Math.sqrt(2));near(r.f,4/Math.sqrt(2));
 const ex1=solve('exercise-1');near(ex1.ft,0);near(ex1.f,5);
 const ex2=solve('exercise-2');near(ex2.F[0],5*Math.cos(Math.PI/6));near(ex2.accel,0);
 const min=solve('exercise-8');near(min.Bmag,1);const tilted=solve('exercise-8',0,{theta:35});assert.ok(tilted.Bmag>min.Bmag);
 const current=solve('exercise-10');near(current.I,5);assert.ok(solve('exercise-10',0,{theta:0}).I>5);near(current.accel,0);
});
test('optimization boundaries do not invent huge finite B or a valid zero-current solution',()=>{
 const b=solve('exercise-8',0,{I:0});assert.equal(b.invalid,true);assert.equal(b.metric.B,null);near(norm(b.F),0);
 const reversed=solve('exercise-8',0,{I:-5});near(reversed.ft,5);near(reversed.Bmag,1);
 const i=solve('exercise-10',0,{B:0});assert.equal(i.invalid,true);assert.equal(i.metric.I,null);
 const frictionless=solve('exercise-10',0,{B:0,mu:0});assert.equal(frictionless.invalid,false);near(frictionless.I,0);
});
test('wire current cross field sign and parallel degeneracy',()=>{
 for(const id of ['guide-balance','example-1','example-2','exercise-2']){
  const t=topic(id),p=initialParameters(t),a=evaluateTopic(t,p,0),b=evaluateTopic(t,{...p,I:-(p.I||1),polarity:-1},0);
  a.F.forEach((f,i)=>near(f,-b.F[i]));const zero=solve(id,0,{parallelField:1});near(norm(zero.F),0);
 }
});
test('horseshoe and bar magnet: original current gives expected top-view torque and downward force after turn',()=>{
 assert.ok(solve('horseshoe').torque[1]>0);assert.ok(solve('horseshoe',3).netForce[1]<0);
 assert.ok(solve('exercise-3').torque[1]<0);assert.ok(solve('exercise-3',0,{angle:-25}).netForce[1]<0);
});
test('crossed wires preserve fixed geometry and turning sense',()=>{
 const parallel=solve('crossed',0);assert.ok(parallel.netForce[0]<0);near(norm(parallel.torque),0,1e-5);
 assert.ok(solve('crossed',1).torque[2]>0);const turn=solve('crossed',2);assert.ok(turn.torque[2]>0);assert.ok(turn.netForce[2]<0);
 assert.ok(solve('crossed',3).torque[2]>0);
});
test('coils and solenoid: source torque signs and attraction',()=>{
 assert.ok(solve('equivalent').netForce[0]<0);
 assert.ok(solve('example-3').torque[0]>0);
 assert.ok(solve('example-4').torque[1]>0);
 assert.ok(solve('exercise-7').torque[1]>0);assert.ok(solve('exercise-7',0,{angle:20}).netForce[1]<0);
});
test('reaction scenarios respect opposite forces and surface equilibrium',()=>{
 const a=solve('reaction'),b=solve('exercise-4');assert.ok(a.netForce[0]<0&&a.netForce[1]>0);assert.ok(b.netForce[0]>0&&b.netForce[1]<0);
 for(const r of [a,b]){const magnet=r.forces.slice(1);const sum=magnet.reduce((v,f)=>v.map((x,i)=>x+f.vector[i]),[0,0,0]);near(norm(sum),0);}
});
test('radial equilibrium and impossible-current boundary',()=>{
 const a=solve('exercise-6');near(a.ratio,.4);near(a.metric.T,Math.sqrt(84));near(norm(a.forces.reduce((v,f)=>v.map((x,i)=>x+f.vector[i]),[0,0,0])),0);
 assert.equal(solve('exercise-6',0,{I:11}).invalid,true);
});
test('time-dependent current: extrema and discontinuous friction at rest',()=>{
 const p=topic('exercise-9').defaults,t0=10;const a=verticalState(p,1),before=verticalState(p,2-1e-8),rest=verticalState(p,2);
 near(a.t0,t0);near(a.v,50);near(a.a,0);near(before.f,20,1e-6);near(rest.f,10);near(rest.v,0);near(rest.a,0);near(rest.s,2*10*100/3);
 assert.equal(verticalState({...p,B:0},1).valid,false);
});
test('left-hand model uses proper rotations, correct thumb, fingers and palm normal',()=>{
 for(const I of [[1,0,0],[0,1,0],[0,0,1],[-1,2,-.5]])for(const B of [[1,1,0],[0,0,-1],[-2,.4,1]]){
  const basis=leftHandBasis(I,B);if(!basis)continue;
  near(dot(basis.x,cross(basis.y,basis.z)),1);near(dot(basis.fingers,unit(I)),1);near(dot(basis.thumb,unit(cross(I,B))),1);assert.ok(dot(basis.palmOut,B)<0);
 }
 assert.equal(leftHandBasis([1,0,0],[2,0,0]),null);assert.equal(leftHandBasis([0,0,0],[1,0,0]),null);
});
test('optimized Biot-Savart evaluation matches independent segment quadrature',()=>{
 const paths=[{points:line([0,-2,0],[0,2,0],80),current:2}];const field=makePathField(paths);
 for(const p of [[1,0,.4],[-1,1,.7],[.2,-.2,2]])near(norm(sub(field(p),fieldFromPaths(paths,p))),0);
});
