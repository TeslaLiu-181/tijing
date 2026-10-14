import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,solveExample4,stateAt,milestones} from '../src/example4/physics.mjs';
const close=(a,b,scale=1)=>assert.ok(Math.abs(a-b)<2e-9*Math.max(Math.abs(a),Math.abs(b),scale),`${a} != ${b}`);

test('critical model enters O1 at 45 degrees and touches III with vertical velocity',()=>{
 const r=solveExample4(defaults),entry=stateAt(r,r.tE),turn=stateAt(r,r.tTurn),exit=stateAt(r,r.total);
 close(entry.p[0],1);close(entry.p[1],0);close(entry.v[0],1);close(entry.v[1],-1);
 close(turn.p[0],2);close(turn.p[1],Math.SQRT2-1);close(turn.v[0],0);close(turn.v[1],Math.SQRT2);
 close(exit.p[0],1);close(exit.p[1],2*(Math.SQRT2-1));assert.equal(r.status,'critical');assert.equal(r.segments[1].end,'boundary');
 close(r.electric,r.m*r.v0**2/(r.q*r.L));close(r.B,(Math.SQRT2+1)*r.m*r.v0/(r.q*r.L));
});
test('weaker B crosses III while stronger B turns before it; magnetic speed and planarity hold',()=>{
 for(const beta of [.6,.8,1,1.3,1.6]){
  const r=solveExample4({...defaults,beta});close(stateAt(r,r.total).p[0],beta<1?2:1);
  if(beta<1){assert.equal(r.reachesTurn,false);assert.equal(r.status,'escape');}else{assert.ok(r.turn[0]<=2+1e-12);assert.equal(r.reachesTurn,true);}
  for(let i=0;i<=100;i++){const t=r.total*i/100,a=stateAt(r,t);assert.equal(a.p[2],0);assert.equal(a.v[2],0);if(t>=r.tE){close(a.speed,Math.SQRT2*r.v0);close(a.v[0]*a.acc[0]+a.v[1]*a.acc[1],0);}}
 }
});
test('symbolic L v0 m q relationships survive scaling without altering dimensionless geometry',()=>{
 const base=solveExample4(defaults),scaled=solveExample4({...defaults,length:4,mass:2,charge:3});
 close(scaled.total,base.total*2,1e-12);close(scaled.electric,base.electric/3);close(scaled.B,base.B/3);
 for(let i=0;i<=20;i++){const a=stateAt(base,base.total*i/20),b=stateAt(scaled,scaled.total*i/20);close(a.p[0],b.p[0]);close(a.p[1],b.p[1]);}
 assert.equal(milestones(base).length,4);assert.throws(()=>solveExample4({...defaults,charge:0}));
});
