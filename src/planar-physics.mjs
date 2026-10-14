import {polygonGeometry,polygonContains,polygonInsideLimit} from './planar-geometry.mjs';
// Planar analytic motion. Positions are metres here; the editor uses centimetres.
export const E=1.602176634e-19,U=1.66053906660e-27,TAU=2*Math.PI;
export const add=(a,b)=>[a[0]+b[0],a[1]+b[1]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],mul=(a,k)=>[a[0]*k,a[1]*k];
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],norm=a=>Math.hypot(...a),unit=a=>norm(a)?mul(a,1/norm(a)):[0,0];
export const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],rad=a=>a*Math.PI/180,deg=a=>a*180/Math.PI;
export const rotate=(p,a)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)];
export const direction=a=>[Math.cos(rad(a)),Math.sin(rad(a))].map(x=>Math.abs(x)<1e-15?0:x);
// AC phase is tied to the scene clock, never restarted on emission or entry.
export function waveFactor(o,time=0){
 if(!o.waveform||o.waveform==='dc')return 1;
 const cycles=time/(o.period*1e-6)+(o.phase||0)/360;
 if(o.waveform==='sine'){const value=Math.sin(TAU*cycles);return Math.abs(value)<1e-14?0:value;}
 const half=2*cycles,nearest=Math.round(half),k=Math.abs(half-nearest)<1e-10?nearest:Math.floor(half);return ((k%2)+2)%2===0?1:-1;
}
export const electricAt=(o,time=0)=>mul(direction(o.fieldAngle),o.E0*1000*waveFactor(o,time));
function nextSwitch(o,time,tol){
 const half=o.period*1e-6/2,phase=(o.phase||0)/180,k=Math.floor((time+tol)/half+phase)+1;return (k-phase)*half-time;
}
export function advance(p,v,w,t,a=[0,0]){
 const clean=values=>{const roundoff=8*Number.EPSILON*(norm(v)+norm(a)*Math.abs(t));return values.map(x=>Math.abs(x)<=roundoff?0:x);};
 if(!w)return {p:add(p,add(mul(v,t),mul(a,t*t/2))),v:clean(add(v,mul(a,t)))};
 // Integrate the constant affine Lorentz equation exactly. Series near B=0
 // avoid subtracting the two large E/B drift terms in a nearly cancelled field.
 const z=w*t,z2=z*z,small=Math.abs(z)<.01;
 const s=t*(small?1-z2/6+z2*z2/120-z2*z2*z2/5040:Math.sin(z)/z);
 const k=t*(small?z*(.5-z2/24+z2*z2/720-z2*z2*z2/40320):2*Math.sin(z/2)**2/z);
 const c=t*t*(small?.5-z2/24+z2*z2/720-z2*z2*z2/40320:2*Math.sin(z/2)**2/z2);
 const d=t*t*(small?z*(1/6-z2/120+z2*z2/5040-z2*z2*z2/362880):(z-Math.sin(z))/z2);
 return {p:add(p,[v[0]*s+v[1]*k+a[0]*c+a[1]*d,v[1]*s-v[0]*k+a[1]*c-a[0]*d]),v:clean([v[0]*Math.cos(z)+v[1]*Math.sin(z)+a[0]*s+a[1]*k,v[1]*Math.cos(z)-v[0]*Math.sin(z)+a[1]*s-a[0]*k])};
}
export function orbit(p,v,w){return w&&norm(v)>0?{C:add(p,[v[1]/w,-v[0]/w]),r:norm(v)/Math.abs(w),T:TAU/Math.abs(w)}:{C:null,r:null,T:null};}
export function polygonFor(o){
 if(o.shape==='polygon')return o.points.map(p=>[...p]);
 const w=o.width/2,h=o.height/2;
 const local=o.shape==='triangle'?[[-w,-h],[w,-h],[-w,h]]:[[-w,-h],[w,-h],[w,h],[-w,h]];
 return local.map(p=>add([o.x,o.y],rotate(p,rad(o.angle))));
}
export function compileField(o,scale=.01){
 const center=[o.x*scale,o.y*scale],angle=rad(o.angle),x=rotate([1,0],angle),y=rotate([0,1],angle),line=(n,d)=>({kind:'line',n,d:dot(n,center)+d});
 let edges=[],vertices=[],polygon=null;
 if(o.shape==='polygon'){polygon=polygonGeometry(o.points.map(p=>mul(p,scale)));vertices=polygon.points;edges=polygon.edges;}
 else if(o.shape==='annulus'){
  if(!Number.isFinite(o.radius)||o.radius<=0||!Number.isFinite(o.innerRadius)||o.innerRadius<0||o.innerRadius>=o.radius)throw Error('环形场须满足0≤内半径<外半径。');
  edges=[{kind:'circle',center,r:o.radius*scale}];if(o.innerRadius>0)edges.push({kind:'circle',center,r:o.innerRadius*scale,inner:true});
 } else if(['circle','semicircle','sector'].includes(o.shape)){
  edges=[{kind:'circle',center,r:o.radius*scale}];
  if(o.shape!=='circle'){edges.push(line(mul(y,-1),0));if(o.shape==='sector'&&o.sectorAngle<180)edges.push(line(rotate([0,1],angle+rad(o.sectorAngle)),0));}
 }
 else if(['rectangle','triangle'].includes(o.shape)){
  vertices=polygonFor(o).map(p=>mul(p,scale));edges=vertices.map((p,i)=>{const v=sub(vertices[(i+1)%vertices.length],p),n=unit([v[1],-v[0]]);return {kind:'line',n,d:dot(n,p)};});
 }else if(o.shape==='half')edges=[line(mul(x,-1),0)];
 else if(o.shape==='strip')edges=[line(x,o.width*scale/2),line(mul(x,-1),o.width*scale/2)];
 else if(o.shape==='quadrant')edges=[line(mul(x,-1),0),line(mul(y,-1),0)];
 const contains=(p,margin=0)=>polygon?polygonContains(polygon,p,margin):edges.every(b=>b.kind==='circle'?(b.inner?norm(sub(p,b.center))>=b.r+margin:norm(sub(p,b.center))<=b.r-margin):dot(b.n,p)<=b.d-margin);
 return {id:o.id,B:o.kind==='electric'?0:(o.B||0)*.001,electric:o.kind==='electric'?mul(direction(o.fieldAngle),o.E0*1000):[0,0],center,edges,vertices,polygon,contains,object:o};
}
function lineLine(a,b){const d=cross(a.n,b.n);return Math.abs(d)<1e-12?[]:[[(a.d*b.n[1]-a.n[1]*b.d)/d,(a.n[0]*b.d-a.d*b.n[0])/d]];}
export function circleLine(C,r,b){const d=b.d-dot(b.n,C);if(Math.abs(d)>r+1e-12)return [];const foot=add(C,mul(b.n,d)),side=[-b.n[1],b.n[0]],h=Math.sqrt(Math.max(0,r*r-d*d));return [add(foot,mul(side,h)),add(foot,mul(side,-h))];}
export function circleCircle(C,r,D,R){const diff=sub(D,C),d=norm(diff);if(d<1e-14||d>r+R+1e-12||d<Math.abs(r-R)-1e-12)return [];const u=mul(diff,1/d),a=(r*r-R*R+d*d)/(2*d),h=Math.sqrt(Math.max(0,r*r-a*a)),foot=add(C,mul(u,a)),side=[-u[1],u[0]];return [add(foot,mul(side,h)),add(foot,mul(side,-h))];}
function intersect(a,b){if(a.kind==='line'&&b.kind==='line')return lineLine(a,b);if(a.kind==='circle'&&b.kind==='circle')return circleCircle(a.center,a.r,b.center,b.r);return a.kind==='circle'?circleLine(a.center,a.r,b):circleLine(b.center,b.r,a);}
export function overlapping(a,b){
 // Region vertices, circular boundaries, intersections and nearby points find
 // shared area. A shared edge or a tangency alone is allowed.
 const A=compileField(a,1),B=compileField(b,1),edges=[...A.edges,...B.edges],seeds=[A.center,B.center,...A.vertices,...B.vertices];
 for(const edge of edges)if(edge.kind==='circle')for(const d of [[1,0],[-1,0],[0,1],[0,-1]])seeds.push(add(edge.center,mul(d,edge.r)));
 for(const edge of edges)if(edge.kind==='line')for(const c of [A.center,B.center])seeds.push(add(c,mul(edge.n,edge.d-dot(edge.n,c))));
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++)seeds.push(...intersect(edges[i],edges[j]));
 const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],...edges.filter(e=>e.kind==='line').map(e=>mul(e.n,-1))];
 const eps=1e-6,inside=p=>A.contains(p,1e-9)&&B.contains(p,1e-9);
 return seeds.some(p=>inside(p)||dirs.some(d=>inside(add(p,mul(unit(d),eps)))));
}
export function overlapPair(objects){const fields=objects.filter(o=>o.kind==='field'&&o.enabled);for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++)if(overlapping(fields[i],fields[j]))return [fields[i],fields[j]];return null;}
function rayTimes(p,v,b){
 if(b.kind==='line'){const d=dot(v,b.n);return Math.abs(d)>1e-18?[(b.d-dot(p,b.n))/d]:[];}
 const d=sub(p,b.center),a=dot(v,v),b0=2*dot(d,v),c=dot(d,d)-b.r*b.r,disc=b0*b0-4*a*c;if(!a||disc<0)return [];
 return [(-b0-Math.sqrt(disc))/(2*a),(-b0+Math.sqrt(disc))/(2*a)];
}
function eventTimes(p,v,w,b){
 if(!w||!norm(v))return rayTimes(p,v,b);
 const {C,r}=orbit(p,v,w),start=Math.atan2(p[1]-C[1],p[0]-C[0]);
 const points=b.kind==='line'?circleLine(C,r,b):circleCircle(C,r,b.center,b.r);
 return points.map(p=>{let a=(((Math.atan2(p[1]-C[1],p[0]-C[0])-start)*-Math.sign(w))%TAU+TAU)%TAU;if(a<1e-10)a=TAU;return a/Math.abs(w);});
}
const J=v=>[v[1],-v[0]];
const distanceToSegment=(p,a,b)=>{const v=sub(b,a),n=dot(v,v);return norm(sub(p,add(a,mul(v,n?Math.max(0,Math.min(1,dot(sub(p,a),v)/n)):0))));};
function sumStable(values){let sum=0,c=0,scale=0;for(const v of values){const y=v-c,t=sum+y;c=(t-sum)-y;sum=t;scale+=Math.abs(v);}return Math.abs(sum)<=16*Number.EPSILON*scale?0:sum;}
function sineModes(fields,time,ratio){
 const groups=new Map(),modes=[];
 for(const f of fields)if(f.object.waveform==='sine'&&norm(f.electric)){const period=f.object.period;if(!groups.has(period))groups.set(period,[]);groups.get(period).push(f);}
 // Combine equal frequencies before integrating; opposite AC fields really
 // cancel, including a stationary particle exactly on their common boundary.
 for(const [period,group] of groups){const frequency=TAU/(period*1e-6);for(let k=0;k<2;k++){
  const electric=[0,1].map(i=>sumStable(group.map(f=>f.electric[i]*direction(f.object.phase)[k])));if(norm(electric))modes.push({electric,a:mul(electric,ratio),frequency,phase:frequency*time+k*Math.PI/2});
 }}return modes;
}
export function fieldsAt(fields,p,limit=null,time=0){
 const inside=f=>f.polygon?(limit?polygonInsideLimit(f.polygon,p,limit):f.contains(p)):!limit?f.contains(p):f.edges.every(edge=>{
  const delta=edge.kind==='circle'?sub(p,edge.center):null,side=edge.inner?-1:1,n=delta?mul(unit(delta),side):edge.n,d=delta?side*(norm(delta)-edge.r):dot(n,p)-edge.d;
  const roundoff=128*Number.EPSILON*Math.max(norm(p),edge.r||Math.abs(edge.d),1e-9),gap=Math.max(roundoff,norm(limit.v)*limit.tol*4);
  if(Math.abs(d)>gap)return d<0;
  const rate=dot(n,limit.v),curvature=dot(n,limit.acc)+(delta?side*(dot(limit.v,limit.v)-rate*rate)/edge.r:0);
  // A numerical zero plateau around a tangency is not an entry. Resolve the
  // one-sided region using direction, then curvature at a stationary contact.
  if(Math.abs(rate)>Math.sqrt(2*gap*Math.abs(curvature))+norm(limit.v)*1e-12)return rate<0;
  if(Math.abs(curvature)>1e-12*Math.max(norm(limit.acc),delta?dot(limit.v,limit.v)/edge.r:0,1e-30))return curvature<0;
  if(limit.jerk){const third=dot(n,limit.jerk)+(delta?side*3*(dot(limit.v,limit.acc)-rate*curvature)/edge.r:0);if(Math.abs(third)>1e-12*Math.max(norm(limit.jerk),delta?3*norm(limit.v)*norm(limit.acc)/edge.r:0,1e-30))return third<0;}
  return d<=roundoff;
 });
 const active=fields.filter(inside).sort((a,b)=>a.id.localeCompare(b.id));
 return {ids:active.map(f=>f.id),B:sumStable(active.map(f=>f.B*waveFactor(f.object,time))),electric:[0,1].map(i=>sumStable(active.map(f=>(f.electric?.[i]||0)*waveFactor(f.object,time))))};
}

// An exact local trajectory with a bounded acceleration lies in a tube around
// its endpoint chord: max deviation <= |acceleration| * dt^2 / 8. This lets us
// isolate both crossings of a thin region without relying on endpoint occupancy.
function electricEventTimes(p,v,w,a,horizon,edge,timeTol,budget,dynamic=null){
 // A trajectory contained in a straight boundary has no crossing roots.
 // Subdividing that identically-zero residual exhausts the event budget,
 // e.g. an accelerator aligned with the top of a later magnetic square.
 if(!dynamic&&edge.kind==='line'&&dot(edge.n,v)===0){
  if(!w&&dot(edge.n,a)===0)return [];
  const acceleration=add(a,mul(J(v),w));
  if(w&&norm(acceleration)<=32*Number.EPSILON*(norm(a)+Math.abs(w)*norm(v)))return [];
 }
 const A=dynamic?.bound??norm(add(a,mul(J(v),w))),cache=new Map(),roots=[];
 // Evaluate boundary residuals from displacement, so tiny motion from rest is
 // not lost when added to a nonzero world coordinate.
 const state=t=>{if(!cache.has(t)){const value=dynamic?segmentState({...dynamic,p:[0,0]},t):advance([0,0],v,w,t,a);cache.set(t,{p:add(p,value.p),v:value.v,delta:value.p});}return cache.get(t);};
 const offset=edge.kind==='circle'?sub(p,edge.center):null,initial=edge.kind==='line'?dot(edge.n,p)-edge.d:dot(offset,offset)-edge.r*edge.r;
 const value=s=>initial+(edge.kind==='line'?dot(edge.n,s.delta):2*dot(offset,s.delta)+dot(s.delta,s.delta));
 const rateBound=dynamic?.sines.reduce((sum,h)=>sum+norm(h.a)*h.frequency,0)||0;
 const bound=(l,r)=>dynamic?norm(forcesAt(dynamic,state((l+r)/2).v,(l+r)/2).acceleration)+rateBound*(r-l)/2:A;
 const drift=w&&!dynamic?mul(J(a),1/w):null,u=drift?sub(v,drift):null,C=u?add(p,mul(J(u),1/w)):null,R=u?norm(u)/Math.abs(w):0;
 function excluded(l,r,L,H,A){
  let a=L.p,b=H.p,pad=A*(r-l)**2/8;
  // A drifting gyro-circle is a much tighter bound for many complete turns.
  if(C&&Math.abs(w*(r-l))>1&&R<pad){a=add(C,mul(drift,l));b=add(C,mul(drift,r));pad=R;}
  pad+=64*Number.EPSILON*(norm(a)+norm(b)+pad+(edge.r||Math.abs(edge.d))+1e-6);
  if(edge.kind==='line'){const x=dot(edge.n,a)-edge.d,y=dot(edge.n,b)-edge.d;return Math.min(x,y)>pad||Math.max(x,y)<-pad;}
  return distanceToSegment(edge.center,a,b)>edge.r+pad||Math.max(norm(sub(a,edge.center)),norm(sub(b,edge.center)))+pad<edge.r;
 }
 function bisect(l,r,f){if(f===0)return l;for(let i=0;i<60&&r-l>timeTol;i++){const m=(l+r)/2,g=value(state(m));if(g===0)return m;if((f<0)===(g<0)){l=m;f=g;}else r=m;}return (l+r)/2;}
 function search(l,r,L,H,depth){
  if(++budget.used>budget.max){budget.exhausted=true;return;}
  const localA=bound(l,r);if(excluded(l,r,L,H,localA))return;
  const mid=(l+r)/2,M=state(mid),half=(r-l)/2,f=value(L),g=value(H);let slope,curvatureBound;
  if(edge.kind==='line'){slope=dot(edge.n,M.v);curvatureBound=localA;}
  else{const d=sub(M.p,edge.center),speed=norm(M.v)+localA*half;slope=2*dot(d,M.v);curvatureBound=2*(speed*speed+(norm(d)+speed*half)*localA);}
  if(Math.abs(slope)>curvatureBound*half*(1+1e-12)){
   if((f<0)!==(g<0))roots.push(bisect(l,r,f));return;
  }
  if(r-l<=timeTol||depth>=52){if((f<0)!==(g<0))roots.push(mid);return;}
  search(l,mid,L,M,depth+1);if(!budget.exhausted)search(mid,r,M,H,depth+1);
 }
 search(0,horizon,state(0),state(horizon),0);return roots;
}
export function traceParticle(particle,fields,duration){
 let p=[particle.x*.01,particle.y*.01],v=mul(direction(particle.heading),particle.speed*1e5),time=0;
 const m=particle.mass*U,q=particle.charge*E,segments=[],horizon=Math.max(0,duration*1e-6-particle.birth),tol=Math.max(1e-22,horizon*1e-12),eps=tol*4,budget={used:0,max:100000,exhausted:false};
 const key=f=>f.ids.join('|');
 // Include a stationary boundary point to roundoff before determining its
 // outgoing side from acceleration. Strict containment can omit the very
 // electric field that launches a particle from rest at an electrode.
 let field=fieldsAt(fields,p,{v:[0,0],acc:[0,0],tol},particle.birth);
 const initialAcceleration=add(mul(field.electric,q/m),mul(J(v),q*field.B/m)),initialRate=fields.filter(f=>field.ids.includes(f.id)&&f.object.waveform==='sine').reduce((a,f)=>add(a,mul(f.electric,TAU/(f.object.period*1e-6)*Math.cos(TAU*particle.birth/(f.object.period*1e-6)+rad(f.object.phase)))),[0,0]);
 field=fieldsAt(fields,p,{v,acc:initialAcceleration,jerk:add(mul(initialRate,q/m),mul(J(initialAcceleration),q*field.B/m)),tol},particle.birth);
 if(!horizon)return {particle,segments,duration:0,truncated:false};
 for(let n=0;time<horizon-eps&&n<4000;n++){
  const globalTime=particle.birth+time,active=fields.filter(f=>field.ids.includes(f.id)),B=field.B,w=q*B/m;
  const sines=sineModes(active,globalTime,q/m),driven=sines.some(h=>norm(h.a));
  const electric=[0,1].map(i=>sumStable(active.filter(f=>f.object.waveform!=='sine').map(f=>(f.electric?.[i]||0)*waveFactor(f.object,globalTime)))),a=mul(electric,q/m);
  let dt=horizon-time,end='limit';
  for(const f of active)if(f.object.waveform==='square'&&(norm(f.electric)||f.B)){const switchTime=nextSwitch(f.object,globalTime,eps);if(switchTime<dt){dt=switchTime;end='switch';}}
  // Keep the convolution's total oscillation below pi/2. Eight-point Gaussian
  // quadrature then resolves sinusoidal forcing without a resonant denominator.
  if(sines.length){const step=Math.PI/(2*(Math.abs(w)+Math.max(...sines.map(s=>s.frequency))));if(step<dt){dt=step;end='sample';}}
  const acceleration=norm(a)+sines.reduce((sum,s)=>sum+norm(s.a),0),bound=acceleration+Math.abs(w)*(norm(v)+acceleration*dt);
  const segment={p,v,w,B,a,electric,m,q,sines,t:time,globalTime,fieldIds:field.ids,fieldId:field.ids[0]||null,bound:sines.length?bound:null};
  const stateAt=t=>segmentState(segment,t);
  const times=fields.flatMap(f=>f.edges.flatMap(edge=>norm(a)||driven?electricEventTimes(p,v,w,a,dt,edge,tol,budget,driven?segment:null):eventTimes(p,v,w,edge))).filter(t=>t>eps&&t<dt-eps).sort((a,b)=>a-b);
  if(budget.exhausted)break;
  const unique=times.filter((t,i)=>!i||t-times[i-1]>tol*2);
  for(const t of unique){const atRoot=stateAt(t),after=fieldsAt(fields,atRoot.p,{v:atRoot.v,acc:forcesAt(segment,atRoot.v,t).acceleration,tol},globalTime+t);if(key(after)!==key(field)){dt=t;end='boundary';break;}}
  const state=stateAt(dt),circular=!norm(a)&&!driven?orbit(p,v,w):{C:null,r:null,T:null};segments.push({...segment,dt,end,p1:state.p,v1:state.v,...circular});
  p=state.p;v=state.v;time+=dt;
  field=fieldsAt(fields,p,{v,acc:forcesAt(segment,v,dt).acceleration,tol},particle.birth+time);
 }
 return {particle,segments,duration:time,truncated:time<horizon-eps,reason:budget.exhausted?'边界求解达到当前计算上限':''};
}
export function emittedParticles(o){
 if(o.kind==='particle')return [{...o,objectId:o.id,traceId:o.id,birth:0}];
 const n=o.count,particles=[];
 for(let i=0;i<n;i++){
  const f=n===1?.5:i/(n-1);let offset=[0,0];
  if(o.sourceType==='line')offset=[0,(f-.5)*o.length];
  if(o.sourceType==='circle'){const angle=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt((i+.5)/n)*o.radius;offset=[r*Math.cos(angle),r*Math.sin(angle)];}
  if(o.sourceType==='rectangle'){const columns=Math.ceil(Math.sqrt(n)),row=Math.floor(i/columns),col=i%columns,rows=Math.ceil(n/columns);offset=[((col+.5)/columns-.5)*o.width,((row+.5)/rows-.5)*o.height];}
  const p=add([o.x,o.y],rotate(offset,rad(o.angle)));
  particles.push({...o,kind:'particle',x:p[0],y:p[1],speed:Math.max(0,o.speed+(f-.5)*o.speedSpan),heading:o.heading+(f-.5)*o.spread,objectId:o.id,traceId:o.id+':'+i,label:`{${o.label}}^{(${i+1})}`,birth:i*o.interval*1e-6,index:i});
 }
 return particles;
}
export function solveScene(scene){const fields=scene.objects.filter(o=>['field','electric'].includes(o.kind)&&o.enabled).map(o=>compileField(o));return scene.objects.filter(o=>['particle','source'].includes(o.kind)&&o.enabled).flatMap(o=>emittedParticles(o).map(p=>traceParticle(p,fields,scene.duration)));}
const gaussNodes=[.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363],gaussWeights=[.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];
export function segmentState(s,t){
 const state=advance(s.p,s.v,s.w,t,s.a);if(!s.sines?.length||!t)return state;
 const half=t/2;
 for(let i=0;i<4;i++)for(const sign of [-1,1]){
  const u=half*(1+sign*gaussNodes[i]),force=s.sines.reduce((a,h)=>add(a,mul(h.a,Math.sin(h.phase+h.frequency*u))),[0,0]);
  const kernel=advance([0,0],force,s.w,t-u),weight=half*gaussWeights[i];state.p=add(state.p,mul(kernel.p,weight));state.v=add(state.v,mul(kernel.v,weight));
 }
 return state;
}
export function segmentElectric(s,t=0){return s.sines?.length?add(s.electric,s.sines.reduce((a,h)=>add(a,mul(h.electric,Math.sin(h.phase+h.frequency*t))),[0,0])):s.electric;}
export function atTime(trace,time){const t=time-trace.particle.birth;if(t<0||!trace.segments.length)return null;const s=trace.segments.find(s=>t<s.t+s.dt)||trace.segments.at(-1),local=Math.max(0,Math.min(s.dt,t-s.t));return {...segmentState(s,local),segment:s,local,finished:t>trace.duration};}
export function arcGeometry(s,start=0,end=1){
 if(!s?.C)return null;const a=advance(s.p,s.v,s.w,s.dt*start),b=advance(s.p,s.v,s.w,s.dt*end),dt=(end-start)*s.dt,chord=sub(b.p,a.p),phi=Math.abs(s.w*dt);
 return {a,b,dt,phi,chord:norm(chord),length:norm(s.v)*dt,alpha:norm(chord)>1e-11?Math.acos(Math.max(-1,Math.min(1,dot(unit(a.v),unit(chord))))):null,delta:Math.acos(Math.max(-1,Math.min(1,dot(unit(a.v),unit(b.v)))))};
}
export function forcesAt(s,v,t=0){
 const electric=mul(segmentElectric(s,t)||[0,0],s.q),magnetic=mul(J(v),s.q*s.B),total=[0,1].map(i=>sumStable([electric[i],magnetic[i]]));
 return {electric,magnetic,total,acceleration:mul(total,1/s.m),energy:s.m*dot(v,v)/2};
}
function segmentLength(s,from,to){
 if(!norm(s.a||[0,0])&&!s.sines?.length)return norm(s.v)*(to-from);
 if(s.w&&!s.sines?.length){const period=TAU/Math.abs(s.w);if(to-from>period*1.01){const turns=Math.floor((to-from)/period);return turns*segmentLength(s,from,from+period)+segmentLength(s,from+turns*period,to);}}
 const speed=t=>norm(segmentState(s,t).v),simpson=(l,r,a,b,c)=>(r-l)*(a+4*b+c)/6;
 const lo=speed(from),mid=speed((from+to)/2),hi=speed(to),whole=simpson(from,to,lo,mid,hi),tol=Math.max(1e-18,Math.max(lo,mid,hi)*(to-from)*1e-9);
 function integrate(l,r,a,b,c,prev,error,depth){const m=(l+r)/2,d=speed((l+m)/2),e=speed((m+r)/2),left=simpson(l,m,a,d,b),right=simpson(m,r,b,e,c);return depth<=0||Math.abs(left+right-prev)<=15*error?left+right+(left+right-prev)/15:integrate(l,m,a,d,b,left,error/2,depth-1)+integrate(m,r,b,e,c,right,error/2,depth-1);}
 // Split at gyro fractions so a whole number of turns cannot alias Simpson's nodes.
 if(Math.abs(s.w*(to-from))>Math.PI/2){const n=Math.min(4096,Math.ceil(Math.abs(s.w*(to-from))/(Math.PI/2)));let result=0;for(let i=0;i<n;i++){const l=from+(to-from)*i/n,r=from+(to-from)*(i+1)/n,a=speed(l),b=speed((l+r)/2),c=speed(r);result+=integrate(l,r,a,b,c,simpson(l,r,a,b,c),tol/n,12);}return result;}
 return integrate(from,to,lo,mid,hi,whole,tol,16);
}
export function pathGeometry(s,start=0,end=1,measure=true){
 if(!s)return null;if(s.C)return {...arcGeometry(s,start,end),work:0};
 const a=segmentState(s,s.dt*start),b=segmentState(s,s.dt*end),chord=sub(b.p,a.p),length=measure?segmentLength(s,s.dt*start,s.dt*end):null,angle=(u,v)=>norm(u)&&norm(v)?Math.acos(Math.max(-1,Math.min(1,dot(unit(u),unit(v))))):null;
 return {a,b,dt:(end-start)*s.dt,chord:norm(chord),length,phi:null,alpha:angle(a.v,chord),delta:angle(a.v,b.v),work:s.m*sumStable([dot(b.v,b.v),-dot(a.v,a.v)])/2};
}
export function nearestTime(s,p,previous=0){
 const n=Math.min(2000,Math.max(80,Math.ceil(Math.abs(s.w*s.dt)*20))),distance=t=>norm(sub(segmentState(s,t*s.dt).p,p));let best=0,error=Infinity;
 for(let i=0;i<=n;i++){const t=i/n,d=distance(t);if(d<error-1e-10||Math.abs(d-error)<=1e-10&&Math.abs(t-previous)<Math.abs(best-previous)){error=d;best=t;}}
 let l=Math.max(0,best-1/n),r=Math.min(1,best+1/n);for(let i=0;i<35;i++){const a=l+(r-l)/3,b=r-(r-l)/3;if(distance(a)<distance(b))r=b;else l=a;}return (l+r)/2;
}
