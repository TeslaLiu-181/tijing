// SI units throughout. Uniform-field segments are analytic; boundaries change B,
// never position or velocity. The sandbox deliberately has only x,y motion.
export const E=1.602176634e-19, U=1.66053906660e-27, TAU=2*Math.PI;
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const mul=(a,s)=>a.map(x=>x*s);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm=a=>Math.hypot(...a);
export const unit=a=>norm(a)?mul(a,1/norm(a)):[0,0,0];
export const rad=d=>d*Math.PI/180;
export const deg=r=>r*180/Math.PI;
export const direction=(az,el)=>[Math.cos(rad(el))*Math.cos(rad(az)),Math.cos(rad(el))*Math.sin(rad(az)),Math.sin(rad(el))].map(x=>Math.abs(x)<1e-15?0:x);
export const rotate2=(p,a)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a),p[2]||0];

export function uniform(p,v,B,q,m,t){
 const b=norm(B),w=q*b/m;
 if(!w||!b)return {p:add(p,mul(v,t)),v:[...v]};
 const axis=mul(B,1/b),vp=mul(axis,dot(v,axis)),vt=sub(v,vp),c=cross(vt,axis),a=w*t;
 // sinc/cosc avoid cancellation for short boundary probes and nearly zero B.
 const s=Math.abs(a)<1e-5?t*(1-a*a/6):Math.sin(a)/w;
 const k=Math.abs(a)<1e-5?t*(a/2-a*a*a/24):(1-Math.cos(a))/w;
 return {p:add(p,add(mul(vp,t),add(mul(vt,s),mul(c,k)))),v:add(vp,add(mul(vt,Math.cos(a)),mul(c,Math.sin(a))))};
}
export function orbit(p,v,B,q,m){
 const b=norm(B),axis=unit(B),parallel=mul(axis,dot(v,axis)),perp=sub(v,parallel),w=q*b/m;
 const speed=norm(v),vp=norm(perp),force=vp>speed*1e-12?mul(cross(v,B),q):[0,0,0];
 const curved=!!w&&vp>speed*1e-12;
 return {force,speed,parallel,perp,axis,w,curved,r:curved?vp/Math.abs(w):null,T:curved?TAU/Math.abs(w):null,
  pitch:curved?Math.abs(dot(v,axis))*TAU/Math.abs(w):null,center:curved?add(p,mul(cross(perp,axis),1/w)):null};
}
export function handBasis(v,B,q,type){
 if(!q||!norm(v)||!norm(B)||norm(cross(unit(v),unit(B)))<1e-9)return null;
 if(type==='left'){
  const y=mul(unit(v),Math.sign(q)),z=mul(unit(sub(B,mul(y,dot(B,y)))),-1),x=unit(cross(y,z));
  return {x,y,z,thumb:mul(x,-1),fingers:y,palmOut:z};
 }
 const z=unit(cross(v,B)),x=unit(v),y=cross(z,x);
 return {x,y,z,thumb:z,fingers:x,angle:Math.acos(Math.max(-1,Math.min(1,dot(unit(v),unit(B)))))};
}

export function initial(c){
 const p=[c.x*.01,c.y*.01,0],v=mul(direction(c.az,c.module==='sandbox'?0:c.el),c.speed*1e5);
 return {p,v,q:c.charge*E,m:c.mass*U};
}
export function fieldVector(c){
 if(c.module==='sandbox')return [0,0,c.B*.001];
 if(c.module==='beam')return mul([0,Math.sin(rad(c.beamAngle)),Math.cos(rad(c.beamAngle))].map(x=>Math.abs(x)<1e-15?0:x),c.B*.001);
 return mul(direction(c.baz,c.bel),c.B*.001);
}

// All region presets are one region, or two disjoint half-planes. Arbitrary
// overlapping regions have no representation in this version.
export function regions(c){
 const angle=rad(c.angle),normal=rotate2([1,0,0],angle),other=rotate2([0,1,0],angle),center=[c.cx*.01,c.cy*.01,0];
 const local=p=>rotate2(sub(p,center),-angle),w=c.width*.01,h=c.height*.01,r=c.radius*.01;
 const line=(n,d)=>({kind:'line',n,d:dot(n,center)+d});
 let boundaries=[],inside;
 switch(c.shape){
  case 'unbounded':inside=()=>true;break;
  case 'half':boundaries=[line(normal,0)];inside=p=>local(p)[0]>=0;break;
  case 'strip':boundaries=[line(normal,-w/2),line(normal,w/2)];inside=p=>Math.abs(local(p)[0])<=w/2;break;
  case 'rectangle':boundaries=[line(normal,-w/2),line(normal,w/2),line(other,-h/2),line(other,h/2)];inside=p=>{const [x,y]=local(p);return Math.abs(x)<=w/2&&Math.abs(y)<=h/2;};break;
  case 'circle':boundaries=[{kind:'circle',center,r}];inside=p=>norm(sub(p,center))<=r;break;
  case 'quadrant':boundaries=[line(normal,0),line(other,0)];inside=p=>{const [x,y]=local(p);return x>=0&&y>=0;};break;
  case 'double':boundaries=[line(normal,0)];inside=p=>local(p)[0]<0;break;
  default:throw new Error('未知磁场区域');
 }
 return {boundaries,at:p=>inside(p)?1:c.shape==='double'?2:0,B:id=>[0,0,(id===1?c.B:id===2?c.B2:0)*.001],local,center,normal,other,w,h,r};
}

function rayIntersections(p,v,b){
 if(b.kind==='line'){const d=dot(v,b.n);return Math.abs(d)>1e-15?[((b.d-dot(p,b.n))/d)]:[];}
 const d=sub(p,b.center),a=dot(v,v),bb=2*dot(d,v),cc=dot(d,d)-b.r*b.r,disc=bb*bb-4*a*cc;
 if(!a||disc<0)return [];
 const root=Math.sqrt(Math.max(0,disc));return [(-bb-root)/(2*a),(-bb+root)/(2*a)];
}
function circleIntersections(C,r,b){
 if(b.kind==='line'){
  const distance=b.d-dot(b.n,C);if(Math.abs(distance)>r+1e-12)return [];
  const foot=add(C,mul(b.n,distance)),across=[-b.n[1],b.n[0],0],offset=Math.sqrt(Math.max(0,r*r-distance*distance));
  return [add(foot,mul(across,offset)),add(foot,mul(across,-offset))];
 }
 const d=norm(sub(b.center,C));if(d<1e-14||d>r+b.r+1e-12||d<Math.abs(r-b.r)-1e-12)return [];
 const n=mul(sub(b.center,C),1/d),a=(r*r-b.r*b.r+d*d)/(2*d),height=Math.sqrt(Math.max(0,r*r-a*a)),foot=add(C,mul(n,a)),t=[-n[1],n[0],0];
 return [add(foot,mul(t,height)),add(foot,mul(t,-height))];
}
function boundaryTimes(p,v,B,q,m,b){
 const o=orbit(p,v,B,q,m);
 if(!o.curved)return rayIntersections(p,v,b);
 const start=Math.atan2(p[1]-o.center[1],p[0]-o.center[0]),omega=-q*B[2]/m;
 return circleIntersections(o.center,o.r,b).map(hit=>{
  const end=Math.atan2(hit[1]-o.center[1],hit[0]-o.center[0]);
  let a=((end-start)*Math.sign(omega)%TAU+TAU)%TAU;
  if(a<1e-10)a=TAU;return a/Math.abs(omega);
 });
}

export function solveSandbox(c){
 const init=initial(c),reg=regions(c),horizon=c.duration*1e-6,segments=[];
 let {p,v,q,m}=init,t=0;
 const probeTime=Math.min(horizon*1e-7,1e-10/Math.max(norm(v),1)),timeEps=Math.max(horizon*1e-12,1e-22);
 let id=reg.at(add(p,mul(v,probeTime)));
 // At a tangent launch, curvature may immediately leave the closed boundary.
 // Decide from the analytic forward position, without nudging the actual state.
 const forward=uniform(p,v,reg.B(id),q,m,probeTime);
 if(reg.at(forward.p)!==id)id=reg.at(forward.p);
 // Limits actual transitions in an experiment, not animation frames.
 for(let count=0;t<horizon-timeEps&&count<600;count++){
  const B=reg.B(id),o=orbit(p,v,B,q,m);let dt=horizon-t,next=id,ends='limit';
  const candidates=reg.boundaries.flatMap(b=>boundaryTimes(p,v,B,q,m,b)).filter(x=>x>timeEps&&x<=dt+timeEps).sort((a,b)=>a-b);
  for(const candidate of candidates){
   const after=uniform(p,v,B,q,m,candidate+probeTime),newId=reg.at(after.p);
   if(newId!==id){dt=candidate;next=newId;ends='boundary';break;}
  }
  const end=uniform(p,v,B,q,m,dt);
  segments.push({p:[...p],v:[...v],B,q,m,t,dt,id,end,ends,...o});
  p=end.p;v=end.v;t+=dt;id=next;
 }
 return {segments,duration:t,requestedDuration:horizon,truncated:t<horizon-timeEps,initial:init,regions:reg,hit:null};
}
export function solveSpace(c){
 const {p,v,q,m}=initial(c),B=fieldVector(c),dt=c.duration*1e-6;
 return {segments:[{p,v,q,m,B,t:0,dt,id:1,end:uniform(p,v,B,q,m,dt),ends:'limit',...orbit(p,v,B,q,m)}],duration:dt,initial:{p,v,q,m},hit:null};
}

// Electron gun travels along +x. Its field is transverse to x, so each magnetic
// arc lies in the plane spanned by x and x cross B; use that plane for exact exits.
export function solveBeam(c){
 const q=-E,m=9.1093837139e-31,speed=Math.sqrt(2*E*c.voltage/m),B=fieldVector(c),deflect=norm(B)?unit(mul(cross([1,0,0],B),-1)):[0,1,0];
 const p=[-.03,0,0],v=[speed,0,0],start=c.cx*.01-c.width*.005,endX=c.cx*.01+c.width*.005,screen=c.screen*.01;
 const total=Math.max(1e-15,c.duration*1e-6),segments=[];let pos=p,vel=v,t=0,hit=null;
 const append=(field,dt,id,ends)=>{const o=orbit(pos,vel,field,q,m),end=uniform(pos,vel,field,q,m,dt);segments.push({p:pos,v:vel,B:field,q,m,t,dt,id,ends,end,...o});pos=end.p;vel=end.v;t+=dt;};
 if(start>pos[0])append([0,0,0],Math.min((start-pos[0])/speed,total),0,'boundary');
 if(t<total){
  let dt=total-t,exit=false;
  if(norm(B)){
   const radius=m*speed/(E*norm(B)),fraction=(endX-start)/radius;
   if(fraction<=1){dt=Math.asin(Math.max(0,fraction))*radius/speed;exit=true;}
   else {dt=Math.PI*radius/speed;exit=true;}
  }else{dt=(endX-start)/speed;exit=true;}
  if(dt>total-t){dt=total-t;exit=false;}append(B,dt,1,exit?'boundary':'limit');
 }
 if(t<total){
  const untilScreen=(screen-pos[0])/vel[0],reaches=untilScreen>=0&&Number.isFinite(untilScreen)&&untilScreen<=total-t;
  append([0,0,0],reaches?untilScreen:total-t,0,reaches?'screen':'limit');
  if(reaches){const inside=Math.abs(pos[1])<=c.screenSize*.005&&Math.abs(pos[2])<=c.screenSize*.005;hit={p:pos,inside,t};}
 }
 return {segments,duration:t,initial:{p,v,q,m},hit,deflect};
}
export const solve=c=>c.module==='sandbox'?solveSandbox(c):c.module==='beam'?solveBeam(c):solveSpace(c);
export function atTime(result,t){
 const s=result.segments.find(s=>t<s.t+s.dt)||result.segments.at(-1);
 const dt=Math.max(0,Math.min(s.dt,t-s.t)),state=uniform(s.p,s.v,s.B,s.q,s.m,dt);
 return {...state,B:s.B,q:s.q,m:s.m,segment:s,localTime:dt,...orbit(state.p,state.v,s.B,s.q,s.m)};
}
export function sampleSegment(s,n=100){return Array.from({length:n+1},(_,i)=>uniform(s.p,s.v,s.B,s.q,s.m,s.dt*i/n).p);}
export function geometry(s){
 if(!s?.curved)return null;
 const phi=Math.abs(s.w*s.dt),chord=sub(s.end.p,s.p),length=norm(chord),dotv=dot(unit(s.v),unit(s.end.v));
 return {phi,deflection:Math.acos(Math.max(-1,Math.min(1,dotv))),chord:length,
  chordAngle:length>1e-10?Math.acos(Math.max(-1,Math.min(1,dot(unit(chord),unit(s.v))))):null,
  arcLength:norm(s.perp)*s.dt,cycles:phi/TAU};
}
