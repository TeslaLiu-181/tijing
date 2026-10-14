import {test} from 'node:test';
import assert from 'node:assert/strict';
import {uniform,orbit,handBasis,norm,sub,dot,cross,E,U,TAU,solveSandbox,solveSpace,solveBeam,geometry,atTime} from '../src/lorentz-physics.mjs';
import {experiment} from '../src/lorentz-presets.mjs';
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps*Math.max(Math.abs(a),Math.abs(b),1e-15),`${a} != ${b}`);
const vector=(a,b,eps=1e-9)=>assert.ok(norm(sub(a,b))<=eps*Math.max(norm(a),norm(b),1e-12),`${a} != ${b}`);

test('uniform field: sign, one circle, speed, zero and parallel cases',()=>{
 const p=[0,0,0],v=[1e5,0,0],B=[0,0,.1],m=U,o=orbit(p,v,B,E,m);
 const quarter=uniform(p,v,B,E,m,o.T/4);vector(quarter.p,[o.r,-o.r,0]);vector(quarter.v,[0,-1e5,0],1e-8);
 const negative=uniform(p,v,B,-E,m,o.T/4);vector(negative.p,[o.r,o.r,0]);
 const end=uniform(p,v,B,E,m,o.T);assert.ok(norm(end.p)<1e-15);close(norm(end.v),1e5);
 for(const [velocity,field,charge] of [[v,[0,0,0],E],[v,B,0],[[0,0,1e5],B,E],[[0,0,0],B,E]]){
  const state=uniform(p,velocity,field,charge,m,1e-6);vector(state.v,velocity);vector(state.p,velocity.map(x=>x*1e-6));
  assert.equal(orbit(p,velocity,field,charge,m).T,null);
 }
});
test('helical pitch and handedness use the actual signed charge',()=>{
 const p=[0,0,0],v=[3e4,4e4,2e4],B=[0,0,.1],o=orbit(p,v,B,E,U),end=uniform(p,v,B,E,U,o.T);
 close(o.r,5e4*U/(E*.1));close(end.p[2],o.pitch);close(norm(end.v),norm(v));close(dot(o.force,v),0);
 for(const q of [E,-E]){
  const left=handBasis(v,B,q,'left'),right=handBasis(v,B,q,'right');
  vector(left.thumb,orbit(p,v,B,q,U).force.map(x=>x/norm(o.force)));vector(right.thumb,cross(v,B).map(x=>x/norm(cross(v,B))));
  close(dot(cross(left.x,left.y),left.z),1);close(dot(cross(right.x,right.y),right.z),1);
 }
 assert.equal(handBasis(v,B,0,'left'),null);assert.equal(handBasis([0,0,1],B,E,'right'),null);
});
test('straight and curved region boundaries preserve speed and velocity; circle exits lie on its boundary',()=>{
 for(const shape of ['strip','rectangle','circle','half','double']){
  const c=experiment('sandbox',shape),r=solveSandbox(c);
  assert.ok(r.segments.length>=2,shape);
  for(const s of r.segments){close(norm(s.end.v),norm(r.initial.v));close(s.p[2],0);close(s.end.p[2],0);}
  for(let i=1;i<r.segments.length;i++){vector(r.segments[i].p,r.segments[i-1].end.p);vector(r.segments[i].v,r.segments[i-1].end.v);}
  if(shape==='circle')for(const s of r.segments.filter(s=>s.id&&s.ends==='boundary'))close(norm(sub(s.end.p,[c.cx*.01,c.cy*.01,0])),c.radius*.01);
 }
 // A narrow region is encountered even though a frame could leap across it.
 const c={...experiment('sandbox','strip'),width:.0001,duration:.8};const r=solveSandbox(c);assert.ok(r.segments.some(s=>s.id===1&&s.dt>0));
 const tangent={...experiment('sandbox','half'),cx:0,x:0,y:0,az:90,charge:-1};
 assert.equal(solveSandbox(tangent).segments[0].id,0);
});
test('half-plane trajectory sweeps 270 degrees: time uses the real arc, not the 90 degree velocity angle',()=>{
 const r=solveSandbox({...experiment('sandbox','half'),cx:0,x:0,y:0,az:45,duration:.7}),s=r.segments.find(s=>s.curved),g=geometry(s);
 close(g.phi,Math.PI*1.5);close(g.deflection,Math.PI/2);close(s.dt/s.T,.75);close(g.chordAngle,Math.PI*.75);
 const quadrant=solveSandbox(experiment('sandbox','quadrant')).segments.find(s=>s.curved);
 close(geometry(quadrant).phi,Math.PI*.75);assert.ok(Math.abs(quadrant.end.p[0])<1e-12);
});
test('beam reaches the screen, changes spot sign, and does not invent an impact for a returning electron',()=>{
 const c=experiment('beam'),a=solveBeam(c),b=solveBeam({...c,B:-c.B}),zero=solveBeam({...c,B:0}),strong=solveBeam({...c,B:20});
 assert.ok(a.hit?.inside);close(a.hit.p[1],-b.hit.p[1]);close(a.hit.p[2],0);close(zero.hit.p[1],0);assert.equal(strong.hit,null);
 const horizontal=solveBeam({...c,beamAngle:90});close(horizontal.hit.p[2],-a.hit.p[1]);
 for(const r of [a,b,zero,strong,horizontal])for(const s of r.segments)close(norm(s.v),norm(s.end.v));
});
