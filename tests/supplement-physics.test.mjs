import test from 'node:test';
import assert from 'node:assert/strict';
import {supplementalLessons,supplementSnapshot,validateSupplement} from '../src/supplement/catalog.mjs';
import {evaluateSupplement} from '../src/supplement/models.mjs';
import {uniformMotion,slidingState,pendulumPath,trackPath,trackFieldPath,triangleFlux,dot,cross,norm,sub} from '../src/supplement/physics.mjs';
import {checkSnapshot,newPaper,newQuestion,validatePaper} from '../src/exam/model.mjs';
import {exportResource,importResource} from '../src/exam/resources.mjs';
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const reading=(m,name)=>m.metrics.find(x=>x.label===name)?.value;
test('all 38 question models and 66 comparisons produce finite visible data',()=>{
 let variants=0;const walk=x=>{if(typeof x==='number')assert.ok(Number.isFinite(x));else if(x&&typeof x==='object')for(const v of Object.values(x))walk(v);};
 assert.equal(supplementalLessons.length,38);
 for(const lesson of supplementalLessons){for(const variant of lesson.variants){variants++;const s=supplementSnapshot(lesson.id).scene;s.variant=variant.id;for(const progress of [0,.5,1]){const result=evaluateSupplement(s,progress);walk(result);assert.ok(result.items.length);assert.ok(result.metrics.length);}}}
 assert.equal(variants,66);
});
test('uniform magnetic motion does no work; constant electric/gravity work matches kinetic change',()=>{
 const start={r0:[.4,-.2,0],v0:[2,3,.4],a0:[1,-4,0],omega:-2.2};
 for(const t of [.01,.2,1,3]){const s=uniformMotion(start,t),displacement=sub(s.r,start.r0);near((dot(s.v,s.v)-dot(start.v0,start.v0))/2,dot(start.a0,displacement),1e-10);near(dot([start.omega*s.v[1],-start.omega*s.v[0],0],s.v),0,1e-12);}
 const circle=uniformMotion({v0:[2,0,0],omega:2},Math.PI/4);near(circle.r[0],1);near(circle.r[1],-1);near(norm(circle.v),2);
});
test('ring contact reverses continuously, with zero friction and maximal acceleration at the transition',()=>{
 const p=supplementSnapshot('h4-7').scene.params,s0=slidingState(p,'ring',0),tc=s0.criticalTime,s=slidingState(p,'ring',tc),a=p.theta*Math.PI/180;
 near(s.N,0,1e-10);near(s.f,0,1e-10);near(s.a,p.g*Math.sin(a),1e-10);assert.ok(slidingState(p,'ring',tc-.01).normalSign>0);assert.ok(slidingState(p,'ring',tc+.01).normalSign<0);
 const end=slidingState(p,'ring',tc+10);assert.ok(end.v<s.terminal);assert.ok(end.a>0);assert.ok(end.a<s.a);
});
test('magnetic pendulum conserves energy, length, and canonical angular momentum',()=>{
 const p=supplementSnapshot('h3-8').scene.params,result=pendulumPath(p),canonical=s=>p.m*cross(s.r,s.v)[1]-.5*p.q*p.B*(s.r[0]**2+s.r[2]**2),initial=canonical(result.samples[0]);
 assert.ok(result.energyError<1e-8);assert.ok(result.lengthError<1e-12);assert.ok(result.tangentError<1e-12);
 for(const s of result.samples)near(canonical(s),initial,1e-8);assert.ok(Math.min(...result.samples.map(s=>Math.hypot(s.r[0],s.r[2])))>.01);assert.ok(Math.max(...result.samples.map(s=>Math.abs(s.r[2])))>.1);
});
test('bounded triangular field uses intersection area and has the exact endpoint flux',()=>{
 const B=.7,R=1.4,start=triangleFlux(B,R,0),end=triangleFlux(B,R,Math.PI/2);near(start.flux,-Math.PI*B*R*R/3,1e-12);near(end.flux,0);const middle=triangleFlux(B,R,Math.PI/3);assert.ok(middle.flux<0&&middle.flux>start.flux);assert.ok(Math.abs(middle.flux-start.flux*.5)>1e-3);
});
test('question 6.10 magnetic pressure has the correct downward Lorentz contribution',()=>{
 const s=supplementSnapshot('h6-10').scene,m=evaluateSupplement(s,1);near(reading(m,'甲最低点动能'),10);near(reading(m,'乙最低点动能'),7);near(reading(m,'甲最低点压力'),30+Math.sqrt(20));near(reading(m,'乙最低点压力'),24);assert.ok(reading(m,'甲最低点压力')>reading(m,'乙最低点压力'));
 const path=trackPath({R:1,g:10,electricAcceleration:3});assert.ok(path.energyError<1e-9);near(path.samples.at(-1).w,Math.sqrt(14));
});
test('full quarter-track to ground process preserves given values, work, and final geometry',()=>{
 const p=supplementSnapshot('h6-12').scene.params,r=trackFieldPath(p),end=r.at(r.duration);near(r.vD,2*Math.sqrt(3));near(r.h,2*Math.sqrt(3));near(r.loss,(4*Math.sqrt(3)+.4)*1e-5,1e-12);near(end.r[0],Math.sqrt(3)*r.h);near(end.r[1],-r.h);near(norm(end.v),r.vD);
 for(let i=0;i<=100;i++){const s=r.at(r.duration*i/100),energy=.5*p.m*dot(s.v,s.v)+p.m*p.g*s.r[1];near(p.m*p.g*p.R-energy,s.frictionWork-s.electricWork,2e-10);}
});
test('supplement resource survives export/import and rejects arbitrary or changed fixed data',()=>{
 const snapshot=supplementSnapshot('h6-12');assert.doesNotThrow(()=>checkSnapshot('supplement',snapshot));assert.throws(()=>checkSnapshot('supplement',{...snapshot,context:{progress:1.1}}));assert.throws(()=>validateSupplement({...snapshot.scene,params:{...snapshot.scene.params,g:9.8}}));assert.throws(()=>validateSupplement({...snapshot.scene,lesson:'javascript:alert(1)'}));
 const p=newPaper(),q=newQuestion();q.scenes=[{id:'verified-supplement',title:'末题',kind:'supplement',snapshot,baseline:snapshot,status:'ready'}];p.questions=[q];const restored=importResource(exportResource(p));assert.deepEqual(restored.questions[0].scenes[0].snapshot,snapshot);assert.doesNotThrow(()=>validatePaper(restored));
});
