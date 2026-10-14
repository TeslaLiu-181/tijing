import {add,sub,mul,dot,cross,norm,unit,rotate,radians} from '../guide-physics.mjs';
export {add,sub,mul,dot,cross,norm,unit,rotate,radians};
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const lerp=(a,b,t)=>a+(b-a)*t;

// Exact constant-field solution in the xy plane; z is parallel to B. Gravity
// is included in a0. The sign of q and B is retained in the angular velocity.
export function uniformMotion({r0=[0,0,0],v0=[0,0,0],a0=[0,0,0],omega=0},t){
 if(Math.abs(omega)<1e-12)return {r:add(add(r0,mul(v0,t)),mul(a0,t*t/2)),v:add(v0,mul(a0,t)),a:a0};
 const vd=[a0[1]/omega,-a0[0]/omega,0],u=sub(v0,vd),s=Math.sin(omega*t),c=Math.cos(omega*t);
 const v=[vd[0]+u[0]*c+u[1]*s,vd[1]+u[1]*c-u[0]*s,v0[2]+a0[2]*t];
 const r=add(r0,[vd[0]*t+(u[0]*s+u[1]*(1-c))/omega,vd[1]*t+(u[1]*s-u[0]*(1-c))/omega,v0[2]*t+a0[2]*t*t/2]);
 return {r,v,a:add(a0,[omega*v[1],-omega*v[0],0])};
}
export function rk4(state,dt,derivative){
 const a=derivative(state),b=derivative(add(state,mul(a,dt/2))),c=derivative(add(state,mul(b,dt/2))),d=derivative(add(state,mul(c,dt)));
 return state.map((value,i)=>value+dt*(a[i]+2*b[i]+2*c[i]+d[i])/6);
}
export function sampleSeries(samples,t){
 if(t<=samples[0].t)return samples[0];if(t>=samples.at(-1).t)return samples.at(-1);
 let lo=0,hi=samples.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(samples[mid].t>t)hi=mid;else lo=mid;}
 const a=samples[lo],b=samples[hi],f=(t-a.t)/(b.t-a.t),result={t};
 for(const key of Object.keys(a))if(key!=='t')result[key]=Array.isArray(a[key])?a[key].map((x,i)=>lerp(x,b[key][i],f)):lerp(a[key],b[key],f);
 return result;
}
export function linearDrag(a,k,t){
 if(a<=0)return {x:0,v:0,a:0};
 if(Math.abs(k)<1e-10)return {x:.5*a*t*t,v:a*t,a};
 const e=Math.exp(-k*t),one=-Math.expm1(-k*t);
 return {x:a/k*(t-one/k),v:a/k*one,a:a*e};
}
export function timeAtDistance(a,k,distance){
 if(a<=0||distance<0)return null;let hi=Math.sqrt(2*distance/a)+1;
 while(linearDrag(a,k,hi).x<distance)hi*=2;
 let lo=0;for(let i=0;i<70;i++){const mid=(lo+hi)/2;if(linearDrag(a,k,mid).x<distance)lo=mid;else hi=mid;}return (lo+hi)/2;
}
export function slidingState(p,variant,t){
 const {m,q,B,mu,g}=p,k=mu*q*B/m,angle=radians(p.theta||0),G=variant==='horizontal'?g:g*Math.cos(angle),drive=variant==='horizontal'?p.F/m:g*Math.sin(angle),a0=drive-mu*G;
 if(variant!=='ring'){
  const state=linearDrag(a0,k,t),N=m*G+q*B*state.v;
  return {...state,N,f:mu*N,normalSign:1,terminal:k>0?a0/k:Infinity,criticalTime:null};
 }
 if(a0<=0)return {x:0,v:0,a:0,N:m*G,f:m*drive,normalSign:1,terminal:0,criticalTime:null};
 const vc=m*G/(q*B),tc=Math.log1p(k*vc/a0)/k,vt=(drive+mu*G)/k;
 let state;
 if(t<=tc){const ev=Math.expm1(k*t);state={v:a0/k*ev,x:a0/k*(ev/k-t),a:a0*Math.exp(k*t)};}
 else{const xc=a0/k*(Math.expm1(k*tc)/k-tc),dt=t-tc,e=Math.exp(-k*dt);state={v:vt+(vc-vt)*e,x:xc+vt*dt+(vc-vt)*(-Math.expm1(-k*dt))/k,a:(drive+mu*G-k*vc)*e};}
 const signed=m*G-q*B*state.v,N=Math.abs(signed);return {...state,N,f:mu*N,normalSign:Math.sign(signed),terminal:vt,criticalTime:tc};
}
export function pendulumPath(p,{duration=8,step=.001}={}){
 const {m,q,B,L,g}=p,angle=radians(p.theta),Bvec=[0,-B,0];let state=[L*Math.sin(angle),-L*Math.cos(angle),0,0,0,0],samples=[];
 const derivative=y=>{const r=y.slice(0,3),v=y.slice(3),external=add([0,-g,0],mul(cross(v,Bvec),q/m));const a=sub(external,mul(r,(dot(r,external)+dot(v,v))/(L*L)));return [...v,...a];};
 const initialEnergy=m*g*state[1],scale=m*g*L;let energyError=0,lengthError=0,tangentError=0;
 const count=Math.round(duration/step);
 for(let i=0;i<=count;i++){
  const r=state.slice(0,3),vel=state.slice(3),energy=.5*m*dot(vel,vel)+m*g*r[1];energyError=Math.max(energyError,Math.abs(energy-initialEnergy)/scale);lengthError=Math.max(lengthError,Math.abs(norm(r)-L));tangentError=Math.max(tangentError,Math.abs(dot(r,vel)));
  if(i%4===0||i===count)samples.push({t:i*step,r,v:vel,energy});
  if(i===count)break;state=rk4(state,step,derivative);
  // Roundoff-level projection enforces the holonomic constraint; error checks
  // retain the independently computed mechanical energy, not a rescaled speed.
  const rn=mul(unit(state.slice(0,3)),L),vn=state.slice(3);state=[...rn,...sub(vn,mul(rn,dot(rn,vn)/(L*L)))];
 }
 return {samples,duration,energyError,lengthError,tangentError,initialEnergy};
}
export function trackPath({R=1,g=10,electricAcceleration=0},step=.0008){
 let state=[0,0],t=0,samples=[{t:0,angle:0,w:0}],energyError=0;
 const derivative=([angle,w])=>[w,(g*Math.cos(angle)-electricAcceleration*Math.sin(angle))/R];
 for(let i=0;i<30000;i++){
  const next=rk4(state,step,derivative);
  if(next[0]>=Math.PI/2){const f=(Math.PI/2-state[0])/(next[0]-state[0]);t+=step*f;const w=Math.sqrt(2*(g-electricAcceleration)/R);samples.push({t,angle:Math.PI/2,w});return {samples,duration:t,energyError};}
  state=next;t+=step;
  const specificK=.5*(R*state[1])**2,expected=g*R*Math.sin(state[0])-electricAcceleration*R*(1-Math.cos(state[0]));energyError=Math.max(energyError,Math.abs(specificK-expected)/(g*R));
  if(i%3===0)samples.push({t,angle:state[0],w:state[1]});
 }
 throw Error('此电场条件下小球没有到达最低点');
}
export function trackFieldPath(p){
 const arc=trackPath(p),vC=Math.sqrt(2*p.g*p.R),decel=p.mu*p.g,vD=Math.sqrt(vC*vC-2*decel*p.L),tSlide=(vC-vD)/decel,omega=p.q*p.B/p.m,radius=vD/omega,h=radius/2;
 const tC=arc.duration,tD=tC+tSlide,duration=tD+Math.PI/(3*omega);
 function at(t){
  if(t<=tC){const s=sampleSeries(arc.samples,t),a=s.angle,v=Math.sqrt(2*p.g*p.R*Math.sin(a));return {r:[-p.L-p.R*Math.cos(a),p.R*(1-Math.sin(a)),0],v:[v*Math.sin(a),-v*Math.cos(a),0],phase:0,frictionWork:0,electricWork:0};}
  if(t<=tD){const dt=t-tC,x=vC*dt-.5*decel*dt*dt;return {r:[-p.L+x,0,0],v:[vC-decel*dt,0,0],phase:1,frictionWork:p.mu*p.m*p.g*x,electricWork:0};}
  const a=omega*(Math.min(t,duration)-tD),r=[radius*Math.sin(a),radius*(Math.cos(a)-1),0];return {r,v:[vD*Math.cos(a),-vD*Math.sin(a),0],phase:2,frictionWork:p.mu*p.m*p.g*p.L,electricWork:p.q*p.E*r[1]};
 }
 return {arc,vC,vD,radius,h,tC,tD,duration,at,loss:p.mu*p.m*p.g*p.L+p.q*p.E*h};
}

// Shoelace clipping against a fine disk polygon measures the projected area,
// avoiding the false BS cos(theta) rule for a partially covered tilted loop.
export function polygonArea(points){return Math.abs(points.reduce((s,p,i)=>{const n=points[(i+1)%points.length];return s+p[0]*n[1]-p[1]*n[0];},0))/2;}
export function convexIntersection(subject,clip){
 let output=subject;for(let i=0;i<clip.length&&output.length;i++){
  const a=clip[i],b=clip[(i+1)%clip.length],cross2=(u,w)=>(b[0]-a[0])*(w[1]-u[1])-(b[1]-a[1])*(w[0]-u[0]),inside=p=>cross2(a,p)>=-1e-12;
  const intersection=(u,w)=>{const du=cross2(a,u),dw=cross2(a,w),t=du/(du-dw);return [lerp(u[0],w[0],t),lerp(u[1],w[1],t)];};
  const input=output;output=[];for(let j=0;j<input.length;j++){const p=input[j],q=input[(j+1)%input.length],ip=inside(p),iq=inside(q);if(ip)output.push(p);if(ip!==iq)output.push(intersection(p,q));}
 }return output;
}
export function triangleFlux(B,R,angle){
 const r=R/Math.sqrt(3),axis=unit([Math.sqrt(3),-1,0]),base=[[-R,-r,0],[R,-r,0],[0,2*r,0]],points=base.map(p=>rotate(p,axis,angle));
 if(Math.abs(Math.cos(angle))<1e-10)return {flux:0,points,overlap:[],radius:r};
 const disk=Array.from({length:720},(_,i)=>[r*Math.cos(i*2*Math.PI/720),r*Math.sin(i*2*Math.PI/720)]),projection=points.map(p=>p.slice(0,2)),overlap=convexIntersection(disk,projection);
 return {flux:-B*(Math.abs(angle)<1e-10?Math.PI*r*r:polygonArea(overlap)),points,overlap,radius:r};
}
