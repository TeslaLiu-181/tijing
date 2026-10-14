import test from 'node:test';
import assert from 'node:assert/strict';
import {advance,compileField,fieldsAt,solveScene,atTime,pathGeometry,forcesAt,segmentState,norm,sub,E,U,TAU} from '../src/planar-physics.mjs';
import {resolveScene,setDefinition,createResolver} from '../src/planar-relations.mjs';
import {toNative} from '../src/planar-expressions.mjs';
import {createObject,emptyScene,example,prepareScene,validate} from '../src/planar-model.mjs';
const close=(a,b,tol=2e-9)=>assert.ok(Math.abs(a-b)<=tol*Math.max(Math.abs(a),Math.abs(b),1e-30),`${a} != ${b}`);
const vec=(a,b,tol=2e-9)=>assert.ok(norm(sub(a,b))<=tol*Math.max(norm(a),norm(b),1e-6),`${a} != ${b}`);
const magnetic=(id,shape='infinite',extra={})=>Object.assign(createObject('field',id,[0,0],shape),extra);
const electric=(id,shape='infinite',extra={})=>Object.assign(createObject('electric',id,[0,0],shape),extra);
const particle=(id='o9',extra={})=>Object.assign(createObject('particle',id),extra);
const scene=(objects,duration=1)=>({...emptyScene(),objects,duration});

test('uniform E+B exact propagation, drift, zero B and small-B limit',()=>{
 vec(advance([1,2],[3,-4],0,.4,[5,6]).p,[2.6,.88]);vec(advance([1,2],[3,-4],0,.4,[5,6]).v,[5,-1.6]);
 vec(advance([0,0],[1.5,0],2,1,[0,3]).p,[1.5,0]);vec(advance([0,0],[1.5,0],2,1,[0,3]).v,[1.5,0]);
 const a=advance([0,0],[4,7],1e-10,.6,[2,-3]),b=advance([0,0],[4,7],0,.6,[2,-3]);vec(a.p,b.p);vec(a.v,b.v);
 const t=TAU/2,state=advance([0,0],[4,7],2,t,[0,3]);vec(state.p,[1.5*t,0]);vec(state.v,[4,7]);
});
test('all covering sources add independently of ordering, including cancellation',()=>{
 const fields=[magnetic('o1','infinite',{B:90}),magnetic('o2','infinite',{B:-90}),electric('o3','infinite',{E0:12,fieldAngle:37}),electric('o4','infinite',{E0:12,fieldAngle:217})].map(o=>compileField(o));
 const a=fieldsAt(fields,[0,0]),b=fieldsAt([...fields].reverse(),[0,0]);assert.deepEqual(a,b);assert.equal(a.B,0);assert.deepEqual(a.electric,[0,0]);
 const model=scene(fields.map(f=>f.object).concat(particle()));validate(model);const s=solveScene(model)[0].segments[0];vec(s.p1,[.15,0]);assert.equal(s.C,null);
});
test('electric acceleration from rest and exact rectangular exit',()=>{
 const field=electric('o1','rectangle',{width:2,height:10,E0:1,fieldAngle:0}),p=particle('o2',{speed:0,mass:1}),model=scene([field,p]);
 const trace=solveScene(model)[0];assert.equal(trace.truncated,false);assert.equal(trace.segments.length,2);
 const a=E*1000/U,t=Math.sqrt(.02/a);close(trace.segments[0].dt,t);vec(trace.segments[0].p1,[.01,0]);close(trace.segments[0].v1[0],a*t);assert.equal(trace.segments[0].C,null);
 const last=atTime(trace,1e-6);close(last.p[0],.01+a*t*(1e-6-t));
});
test('a resting particle on an ideal boundary uses the entering-side convention',()=>{
 const f=electric('o1','rectangle',{width:2,height:10,E0:1,fieldAngle:0}),p=particle('o2',{x:-1,speed:0,mass:1});
 let t=solveScene(scene([f,p]))[0];assert.equal(t.truncated,false);assert.deepEqual(t.segments[0].fieldIds,['o1']);assert.ok(t.segments.at(-1).p1[0]>.01);
 p.x=1;t=solveScene(scene([f,p]))[0];assert.deepEqual(t.segments[0].fieldIds,[]);vec(t.segments[0].p1,[.01,0]);
});

test('acceleration from a rounded electrode boundary includes its launching field',()=>{
 const field=electric('o1','rectangle',{x:0,y:(.06+.01)/.01,width:3,height:2,E0:25,fieldAngle:270});
 const p=particle('o2',{x:0,y:8,speed:0,mass:1,charge:1});
 const trace=solveScene(scene([field,p],.3))[0],exit=trace.segments[0];
 assert.equal(trace.truncated,false);assert.deepEqual(exit.fieldIds,['o1']);
 vec(exit.p1,[0,.06]);close(norm(exit.v1),Math.sqrt(2*E*500/U));
 // A genuinely outside stationary point must not be pulled into the field.
 const outside=solveScene(scene([field,{...p,y:8+1e-6}],.3))[0];
 assert.deepEqual(outside.segments[0].fieldIds,[]);assert.equal(norm(outside.segments[0].v1),0);
});

test('accelerated motion parallel to another region edge does not exhaust crossing search',()=>{
 const accelerator=electric('o1','rectangle',{x:-7,y:0,width:2,height:2,E0:20,fieldAngle:0});
 const laterSquare=magnetic('o2','rectangle',{x:1,y:-1,width:2,height:2,B:100});
 const p=particle('o3',{x:-8,y:0,speed:0,mass:1,charge:1});
 const trace=solveScene(scene([accelerator,laterSquare,p],.6))[0];
 assert.equal(trace.truncated,false);assert(trace.segments.length>=3);
 vec(trace.segments[0].p1,[-.06,0]);close(norm(trace.segments[0].v1),Math.sqrt(2*E*400/U));
 assert(trace.segments.some(s=>s.fieldIds.includes('o2')));
});
test('crossed-field selector transmits the balanced speed and deflects either side',()=>{
 const model=example('velocity-selector');validate(model);const traces=solveScene(model);assert.equal(traces.length,3);traces.forEach(t=>assert.equal(t.truncated,false));
 const central=atTime(traces[1],.5e-6);vec(central.v,[1.5e5,0]);close(central.p[0],.04);assert.ok(Math.abs(central.p[1])<1e-12);
 assert.ok(atTime(traces[0],.5e-6).p[1]>0);assert.ok(atTime(traces[2],.5e-6).p[1]<0);
 assert.ok(traces[1].segments.some(s=>s.fieldIds.length===2));
 const active=traces[1].segments.find(s=>s.fieldIds.length===2);assert.equal(pathGeometry(active).work,0);assert.deepEqual(forcesAt(active,active.v).total,[0,0]);
});

test('noncircular length, work and zero-speed endpoints use the actual trajectory',()=>{
 const s=solveScene(scene([electric('o1','infinite',{E0:10,fieldAngle:90}),magnetic('o2','infinite',{B:100}),particle('o3',{speed:0,mass:1})],1))[0].segments[0];
 const period=TAU/Math.abs(s.w),r=1e5/Math.abs(s.w);s.dt=period;const g=pathGeometry(s);close(g.length,8*r,2e-8);close(g.chord,TAU*r);assert.equal(g.alpha,null);assert.equal(g.delta,null);assert.equal(g.work,0);
 s.dt=period*20;close(pathGeometry(s).length,20*8*r,2e-8);
});
test('electric parameters participate in units, dependencies and save restoration',()=>{
 const m=scene([electric('o1'),magnetic('o2','infinite',{B:100}),particle('o3')]);
 setDefinition(m,'o3','speed','o1.E0 / o2.B');assert.equal(resolveScene(m).issues.length,0);close(m.objects[2].speed,1);
 m.objects[0].E0=20;resolveScene(m);close(m.objects[2].speed,2);close(toNative(createResolver(m).evaluate('15 kV / m'),'V/m'),15000);
 const restored=prepareScene(JSON.parse(JSON.stringify(m)));resolveScene(restored);validate(restored);assert.deepEqual(solveScene(restored),solveScene(m));
 setDefinition(m,'o1','E0','1 / 0');assert.equal(resolveScene(m).fieldUnavailable,true);
});
test('electric work equals change in kinetic energy; neutral particles are unaffected',()=>{
 const model=scene([electric('o1','infinite',{E0:7,fieldAngle:20}),magnetic('o2','infinite',{B:80}),particle('o3',{heading:120,speed:2,mass:2})],.3);
 const t=solveScene(model)[0],s=t.segments[0],dp=sub(s.p1,s.p),work=s.q*(s.electric[0]*dp[0]+s.electric[1]*dp[1]);close(work,.5*s.m*(norm(s.v1)**2-norm(s.v)**2),2e-9);
 model.objects[2].charge=0;const n=solveScene(model)[0];vec(n.segments[0].v1,n.segments[0].v);assert.equal(n.segments[0].C,null);
});
test('thin overlapping strip is not skipped during electric acceleration',()=>{
 const model=scene([electric('o1','infinite',{E0:2,fieldAngle:90}),magnetic('o2','strip',{width:.00001,B:50}),particle('o3',{x:-1,speed:2})],.12);
 const t=solveScene(model)[0];assert.equal(t.truncated,false);assert.ok(t.segments.some(s=>s.fieldIds.includes('o2')));
 for(let i=1;i<t.segments.length;i++){vec(t.segments[i].p,t.segments[i-1].p1);vec(t.segments[i].v,t.segments[i-1].v1);}
});
test('circle entry and exit survive same-side endpoints and electric turning',()=>{
 const model=scene([electric('o1','infinite',{E0:10,fieldAngle:0}),magnetic('o2','circle',{radius:.5,B:0}),particle('o3',{x:2,speed:2,heading:180,mass:1})],.45);
 const t=solveScene(model)[0];assert.equal(t.truncated,false);assert.ok(t.segments.some(s=>s.fieldIds.includes('o2')));assert.ok(t.segments[0].p[0]>.005&&t.segments.at(-1).p1[0]>.005);
 assert.equal(t.segments.filter(s=>s.fieldIds.includes('o2')).length,1);
});
test('uniform drift crosses a circular region and a tangent does not enter',()=>{
 const objects=[electric('o1','infinite',{E0:10,fieldAngle:90}),magnetic('o2','infinite',{B:100}),magnetic('o3','circle',{radius:1,B:0}),particle('o4',{x:-2,speed:1})];
 let t=solveScene(scene(objects,.4))[0];assert.equal(t.truncated,false);assert.ok(t.segments.some(s=>s.fieldIds.includes('o3')));close(t.segments.find(s=>s.fieldIds.includes('o3')).dt,.2e-6,1e-7);
 objects[3].y=1;t=solveScene(scene(objects,.4))[0];assert.equal(t.truncated,false);assert.equal(t.segments.some(s=>s.fieldIds.includes('o3')),false);
});
test('example scenes remain finite and old scenes migrate without electric sources',()=>{
 for(const name of ['electric-deflection','velocity-selector','crossed-drift','field-cancellation']){const m=example(name);validate(m);for(const t of solveScene(m)){assert.equal(t.truncated,false,name);for(const s of t.segments)assert.ok([...s.p1,...s.v1].every(Number.isFinite));}}
 const old=example('circle');old.version=2;delete old.display.electricForce;delete old.display.magneticForce;old.display.force=true;prepareScene(old);validate(old);assert.equal(old.version,4);assert.equal(old.display.magneticForce,true);assert.equal(old.objects.some(o=>o.kind==='electric'),false);
});

test('all seven electric regions keep field membership and velocity continuous',()=>{
 for(const shape of ['infinite','circle','rectangle','triangle','half','strip','quadrant'])for(const charge of [-1,1])for(const heading of [0,45,180]){
  const m=scene([electric('o1',shape,{E0:4,fieldAngle:35,angle:17}),magnetic('o2','infinite',{B:70}),particle('o3',{x:-2,y:-.6,speed:1.7,charge,heading})],.5),compiled=m.objects.filter(o=>o.kind!=='particle').map(o=>compileField(o));
  const t=solveScene(m)[0];assert.equal(t.truncated,false,`${shape}/${charge}/${heading}`);
  for(const [i,s] of t.segments.entries()){
   assert.deepEqual(fieldsAt(compiled,segmentState(s,s.dt*.5).p).ids,s.fieldIds,shape);
   if(i){vec(s.p,t.segments[i-1].p1);vec(s.v,t.segments[i-1].v1);}
   const d=sub(s.p1,s.p),work=s.q*(s.electric[0]*d[0]+s.electric[1]*d[1]),K0=s.m*norm(s.v)**2/2,K1=s.m*norm(s.v1)**2/2;
   assert.ok(Math.abs(K1-K0-work)<1e-8*Math.max(K0,K1,Math.abs(work),1e-30));
  }
 }
});
test('curved crossing of a magnetic disk agrees with an independent fine-step RK4 reference',()=>{
 const m=scene([electric('o1','infinite',{E0:Math.sqrt(10),fieldAngle:Math.atan2(1,3)*180/Math.PI}),magnetic('o2','circle',{radius:2,B:100}),particle('o3',{x:-3,y:.3,speed:2,mass:1})],.4);
 const t=solveScene(m)[0];assert.equal(t.truncated,false);assert.ok(t.segments.some(s=>s.fieldIds.includes('o2')));
 const derivative=y=>{const B=y[0]*y[0]+y[1]*y[1]<=.02**2?.1:0,ratio=E/U;return [y[2],y[3],ratio*(3000+y[3]*B),ratio*(1000-y[2]*B)];};
 const shift=(y,k,h)=>y.map((v,i)=>v+k[i]*h);let y=[-.03,.003,2e5,0];const h=.4e-6/160000;
 for(let i=0;i<160000;i++){const a=derivative(y),b=derivative(shift(y,a,h/2)),c=derivative(shift(y,b,h/2)),d=derivative(shift(y,c,h));y=y.map((v,j)=>v+h*(a[j]+2*b[j]+2*c[j]+d[j])/6);}
 const end=t.segments.at(-1);vec(end.p1,y.slice(0,2),3e-5);vec(end.v1,y.slice(2),3e-5);
});
