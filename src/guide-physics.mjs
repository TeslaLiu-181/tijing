export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,k)=>a.map(v=>v*k);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm=a=>Math.hypot(...a);
export const unit=a=>norm(a)>1e-10?mul(a,1/norm(a)):[0,0,0];
export const radians=x=>x*Math.PI/180;
export function rotate(v,axis,angle){const n=unit(axis),c=Math.cos(angle),s=Math.sin(angle);return add(add(mul(v,c),mul(cross(n,v),s)),mul(n,dot(n,v)*(1-c)));}
export const line=(a,b,n=24)=>Array.from({length:n+1},(_,i)=>add(a,mul(sub(b,a),i/n)));
export function circle(center,u,v,r,n=96){return Array.from({length:n+1},(_,i)=>add(center,add(mul(u,r*Math.cos(i*2*Math.PI/n)),mul(v,r*Math.sin(i*2*Math.PI/n)))));}
export const transformPath=(path,pivot,axis,angle)=>path.map(p=>add(pivot,rotate(sub(p,pivot),axis,angle)));

// Biot–Savart quadrature for finite wires and closed coils. The wire-core exclusion
// is geometric: we do not invent a finite field value on an ideal current filament.
export function fieldFromPaths(paths,point){
 let B=[0,0,0];
 for(const path of paths){
  for(let i=1;i<path.points.length;i++){
   const a=path.points[i-1],b=path.points[i],r=sub(point,mul(add(a,b),.5)),d=norm(r);
   if(d<.045)continue;
   B=add(B,mul(cross(sub(b,a),r),path.current/(d*d*d)));
  }
 }
 return B;
}
export function makePathField(paths){
 const segments=[];
 for(const path of paths)for(let i=1;i<path.points.length;i++){
  const a=path.points[i-1],b=path.points[i];segments.push([(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,(b[0]-a[0])*path.current,(b[1]-a[1])*path.current,(b[2]-a[2])*path.current]);
 }
 return point=>{let bx=0,by=0,bz=0;for(const s of segments){const x=point[0]-s[0],y=point[1]-s[1],z=point[2]-s[2],d2=x*x+y*y+z*z;if(d2<.045**2)continue;const k=1/(d2*Math.sqrt(d2));bx+=(s[4]*z-s[5]*y)*k;by+=(s[5]*x-s[3]*z)*k;bz+=(s[3]*y-s[4]*x)*k;}return [bx,by,bz];};
}
export function poleField(north,south,point,strength=1){
 const a=sub(point,north),b=sub(point,south),da=norm(a),db=norm(b);
 if(da<.08||db<.08)return [0,0,0];
 return mul(sub(mul(a,1/da**3),mul(b,1/db**3)),strength);
}
export function integrateForce(path,current,field,pivot=[0,0,0]){
 let force=[0,0,0],torque=[0,0,0];
 for(let i=1;i<path.length;i++){
  const p=mul(add(path[i-1],path[i]),.5),dF=mul(cross(sub(path[i],path[i-1]),field(p)),current);
  force=add(force,dF);torque=add(torque,cross(sub(p,pivot),dF));
 }
 return {force,torque};
}
export function samplePath(points,fraction,current,field,name){
 const i=Math.min(points.length-2,Math.max(0,Math.floor(fraction*(points.length-1))));
 const pos=mul(add(points[i],points[i+1]),.5),tangent=mul(unit(sub(points[i+1],points[i])),Math.sign(current)),B=field(pos);
 return {name,pos,tangent,B,force:mul(cross(tangent,B),Math.abs(current)),current};
}
function trig(deg,mode){
 if(mode==='lesson'&&Math.abs(deg-37)<1e-8)return [.6,.8];
 if(mode==='lesson'&&Math.abs(deg-53)<1e-8)return [.8,.6];
 return [Math.sin(radians(deg)),Math.cos(radians(deg))];
}
const force=(name,vector,at,role='magnetic')=>({name,vector,at,role});

export function evaluateRail(topic,p,questionIndex,mode){
 const a=radians(p.alpha||0),t=[Math.cos(a),Math.sin(a),0],n=[-Math.sin(a),Math.cos(a),0];
 const [sinA,cosA]=trig(p.alpha||0,mode),[sinQ,cosQ]=trig(p.theta||0,mode);
 const L=p.L||1,m=topic.id==='guide-balance'?(p.G||10)/10:(p.m||1),g=10,mg=m*g;
 let I=p.E!==undefined?p.E/(p.R+(p.r||1))*(p.polarity||1):p.I;
 let Bmag=p.B??1,B=[0,Bmag,0],direction=topic.current||1,noSolution=false;
 const style=topic.fieldMode;
 if(topic.id==='guide-balance')B=[Bmag*cosQ,Bmag*sinQ,0];
 else if(topic.kind==='pulley')B=[Bmag*sinQ,Bmag*cosQ,0];
 else if(style==='down-normal')B=mul(n,-Bmag);
 else if(style==='down-slope')B=mul(t,-Bmag);
 else if(style==='up-normal')B=mul(n,Bmag);
 else if(style==='optimum'){
  // Here theta is the deviation from the optimal plane-normal direction.
  const denominator=Math.abs(I)*L*Math.abs(cosQ);noSolution=mg*sinA>1e-8&&(denominator<1e-8||!!p.parallelField);
  Bmag=noSolution?0:denominator>1e-8?mg*sinA/denominator:0;
  B=mul(add(mul(n,cosQ),mul(t,sinQ)),Bmag*Math.sign(I||1));
 }else if(style==='minimum-current'){
  const denominator=Bmag*L*(cosQ+p.mu*sinQ);
  noSolution=p.mu>1e-8&&(denominator<1e-8||!!p.parallelField);I=!noSolution&&denominator>1e-8?p.mu*mg/denominator:0;
  B=[Bmag*sinQ,-Bmag*cosQ,0];
 }
 if(p.parallelField)B=[0,0,Bmag];
 const currentVector=[0,0,direction*I],F=mul(cross(currentVector,B),L);
 // Use the question's given trigonometric values for scalar calculation; the
 // 3D slope still keeps the stated geometric angle instead of secretly rotating it.
 let ft=dot(F,t),fn=dot(F,n);
 if(!p.parallelField&&(style==='down-normal'||style==='up-normal')){ft=direction*(style==='down-normal'?1:-1)*I*L*Bmag;fn=0;}
 if(!p.parallelField&&style==='down-slope'){ft=0;fn=-direction*I*L*Bmag;}
 const requiredN=mg*cosA-fn,N=Math.max(0,requiredN);
 let f=0,accel=0,status='平衡',T=0,drive=ft-mg*sinA;
 let unknownFriction=topic.id==='guide-balance'||topic.id==='exercise-1';
 if(topic.kind==='pulley'){
  drive=p.M*g+ft;
  const maxF=p.mu*N;
  if(questionIndex===0&&mode==='lesson'){f=-maxF;T=p.M*g;accel=0;status='临界平衡';}
  else if(Math.abs(drive)<=maxF+1e-8){f=-drive;T=p.M*g;status='静止平衡';}
  else{f=-Math.sign(drive)*maxF;accel=(drive+f)/(m+p.M);T=p.M*(g-accel);status='解锁瞬间';}
 }else if(style==='minimum-current'){f=-p.mu*N;accel=(ft+f)/m;status='匀速条件';}
 else if(unknownFriction){f=-drive;status='按已知静止求受力';}
 else if(Math.abs(drive)<=(p.mu||0)*N+1e-7){f=-drive;status='静止平衡';}
 else {f=-Math.sign(drive)*(p.mu||0)*N;accel=(drive+f)/m;status='存在滑动趋势';}
 if(requiredN< -1e-7){status='接触条件不成立';f=0;}
 if(noSolution)status=style==='optimum'?'不存在满足平衡的有限磁场':'不存在满足该匀速条件的电流';
 const origin=[0,.12,0];
 const forces=[force(String.raw`F_{\mathrm{安}}`,F,origin),force(topic.id==='guide-balance'?'G':'mg',[0,-mg,0],origin,'gravity'),force('N',mul(n,N),origin,'normal'),force('f',mul(t,f),origin,'friction')];
 if(topic.kind==='pulley'){forces.push(force('T',[T,0,0],origin,'tension'),force('T',[0,T,0],[3.18,-1.78,0],'tension'),force('Mg',[0,-p.M*g,0],[3.18,-1.78,0],'gravity'));}
 const tangent=unit(currentVector),field=()=>B;
 const samples=[{name:topic.parts[0],pos:origin,tangent,B,force:F,current:I}];
 if(topic.kind==='pulley')samples.push({name:'悬挂物',pos:[3.18,-1.78,0],tangent:[0,0,0],B:[0,0,0],force:[0,-p.M*accel,0],current:0,isNonCurrent:true});
 return {kind:topic.kind,t,n,I,B,Bmag,F,ft,fn,N,f,accel,T,mg,status,invalid:requiredN< -1e-7||noSolution,
  samples,field,forces,
  center:[0,0,0],right:null,metric:{I:noSolution&&style==='minimum-current'?null:I,N,f,F:norm(F),a:accel,M:p.M,R:p.R,B:noSolution&&style==='optimum'?null:Bmag},
  displayTrigs:{sinA,cosA,sinQ,cosQ},direction,requiredN};
}

export function verticalState(p,tau){
 const g=10,valid=p.mu>0&&p.B>0&&p.k>0&&p.L>0,t0=valid?p.m*g/(p.mu*p.k*p.B*p.L):Infinity;
 if(!valid)return {valid:false,t0,status:'无有限最大速度时刻'};
 const t=tau*t0,I=p.k*t,N=p.B*I*p.L,stopped=tau>=2;
 const v=stopped?0:g*t-.5*g/t0*t*t;
 const s=stopped?2*g*t0*t0/3:.5*g*t*t-g*t*t*t/(6*t0);
 const f=stopped?p.m*g:p.mu*N,a=stopped?0:g*(1-tau);
 return {valid:true,t0,t,I,N,v,s,f,a,stopped,vmax:g*t0/2,fmax:2*p.m*g,stopTime:2*t0,status:stopped?'已停止，静摩擦平衡':tau<1?'向下加速':tau===1?'速度最大':'继续下滑并减速'};
}
export function evaluateVertical(topic,p){
 const k=verticalState(p,p.tau),tau=p.tau;
 const y=k.valid?1.2-2.4*Math.min(1,(.5*Math.min(tau,2)**2-Math.min(tau,2)**3/6)/(2/3)):1.2;
 const pos=[0,y,.09],B=[0,-p.B,0],I=k.I||0,F=[0,0,-p.B*I*p.L];
 return {kind:'vertical',...k,center:[0,0,0],field:()=>B,samples:[{name:'导体棒中点',pos,tangent:I?[1,0,0]:[0,0,0],B,force:F,current:I}],
  forces:[force(String.raw`F_{\mathrm{安}}`,F,pos),force('N',[0,0,k.N||0],pos,'normal'),force('mg',[0,-p.m*10,0],pos,'gravity'),force('f',[0,k.f||0,0],pos,'friction')],
  metric:{I,N:k.N,f:k.f,v:k.v,a:k.a,t:k.t,t0:k.t0},right:null,barY:y,invalid:!k.valid};
}
export function evaluateRadial(topic,p){
 const ratio=p.B*p.I*p.L/(p.m*10),valid=Math.abs(ratio)<=1;
 const theta=Math.asin(Math.max(-1,Math.min(1,ratio))),axis=[0,1.35,0],length=p.length||2.4;
 const pos=[length*Math.sin(theta),axis[1]-length*Math.cos(theta),0],B=mul(unit(sub(axis,pos)),p.B),Ivec=[0,0,-p.I],F=mul(cross(Ivec,B),p.L),T=p.m*10*Math.cos(theta);
 return {kind:'radial',theta,ratio,valid,invalid:!valid,axis,pos,center:[.5,0,0],field:pt=>mul(unit([axis[0]-pt[0],axis[1]-pt[1],0]),p.B),
  samples:[{name:'导体棒中点',pos,tangent:unit(Ivec),B,force:F,current:p.I}],right:null,
  forces:[force(String.raw`F_{\mathrm{安}}`,F,pos),force(String.raw`T_{\mathrm{合}}`,mul(unit(sub(axis,pos)),T),pos,'tension'),force('mg',[0,-p.m*10,0],pos,'gravity')],
  status:valid?'悬线静止平衡':'电流过大，无此范围内的平衡位置',metric:{theta:theta*180/Math.PI,T,I:p.I,B:p.B,sinTheta:ratio}};
}

export function evaluateDirection(topic,p,index=0){
 const kind=topic.kind,question=topic.questions[index],angle=radians(p.angle||0),I=p.I??1,J=p.J??1;
 let wires=[],pivot=[0,0,0],samples=[],right=null,field=()=>[0,0,0],targetPath,magnet=null,net={force:[0,0,0],torque:[0,0,0]},transform={},moment=null;
 if(kind==='horseshoe'||kind==='bar-turn'){
  const height=p.height,base=kind==='horseshoe'?.55:-.4;
  pivot=[0,height,0];
  const north=[-1.25,base,0],south=[1.25,base,0];magnet={type:kind==='horseshoe'?'horseshoe':'bar',north,south};
  field=pos=>poleField(north,south,pos,p.B);
  targetPath=transformPath(line([-2.25,height,0],[2.25,height,0],96),pivot,[0,1,0],angle);
  wires.push({id:'target',points:targetPath,current:I,role:'target'});
  samples=[samplePath(targetPath,.24,I,field,topic.parts[0]),samplePath(targetPath,.76,I,field,topic.parts[1])];
 }else if(kind==='magnet-loop'){
  const gap=p.gap,poleN=[-.6,0,0],poleS=[-3,0,0];pivot=[gap+.5,0,0];magnet={type:'bar',north:poleN,south:poleS};field=pos=>poleField(poleN,poleS,pos,p.B);
  targetPath=transformPath(circle(pivot,[0,1,0],[0,0,1],.95),pivot,[0,1,0],angle);
  moment=rotate([I,0,0],[0,1,0],angle);wires.push({id:'target',points:targetPath,current:I,role:'target',closed:true});
  samples=[samplePath(targetPath,.24,I,field,topic.parts[0]),samplePath(targetPath,.74,I,field,topic.parts[1])];
  right={style:'loop',anchor:pivot,axis:unit(moment),radius:.95,value:I,source:'线圈'};
 }else if(kind==='crossed'){
  const separate=question.arrangement==='separate',parallel=question.arrangement==='parallel';
  const sourceY=-1.05-p.gap;
  const source=separate?line([-2.3,sourceY,0],[2.3,sourceY,0],96):line([0,-2.25,0],[0,2.25,0],96);
  pivot=separate?[0,.3,0]:parallel?[p.gap*3,0,0]:[0,0,p.gap];
  const initial=separate?line([0,-1.05,0],[0,1.65,0],72):parallel?line([p.gap*3,-2,0],[p.gap*3,2,0],96):line([-2.15,0,p.gap],[2.15,0,p.gap],96);
  targetPath=transformPath(initial,pivot,[0,0,1],angle);
  wires=[{id:'source',points:source,current:J,role:'source'},{id:'target',points:targetPath,current:I,role:'target'}];
  field=makePathField([wires[0]]);
  samples=[samplePath(targetPath,.24,I,field,topic.parts[0]),samplePath(targetPath,.76,I,field,topic.parts[1])];
  right={style:'straight',anchor:separate?[0,sourceY,0]:[0,0,0],axis:mul(separate?[1,0,0]:[0,1,0],Math.sign(J)),radius:.28,value:J,source:'AB'};
  transform={separate,parallel};
 }else if(kind==='dual-loop'){
  const source=circle([0,0,0],[1,0,0],[0,0,-1],1.55,128);
  // A small insulation clearance keeps the ideal filaments disjoint at crossings.
  targetPath=transformPath(circle([0,0,0],[1,0,0],[0,-1,0],1.47,128),pivot,[1,0,0],angle);
  wires=[{id:'source',points:source,current:J,role:'source',closed:true},{id:'target',points:targetPath,current:I,role:'target',closed:true}];
  field=makePathField([wires[0]]);
  samples=[samplePath(targetPath,.74,I,field,topic.parts[0]),samplePath(targetPath,.24,I,field,topic.parts[1])];
  right={style:'loop',anchor:[0,0,0],axis:[0,Math.sign(J),0],radius:1.55,value:J,source:'L_2'};
  moment=rotate([0,0,-I],[1,0,0],angle);
 }else if(kind==='solenoid'){
  const axis=rotate([1,0,0],[0,1,0],angle),u=rotate([0,1,0],[0,1,0],angle),v=rotate([0,0,1],[0,1,0],angle);
  const sourcePaths=[];
  for(let turn=0;turn<9;turn++){const center=mul(axis,-1.65+3.3*turn/8);sourcePaths.push({points:circle(center,u,v,.36,64),current:J});}
  pivot=[0,p.height,0];targetPath=circle(pivot,[1,0,0],[0,1,0],.72,96);
  wires=[{id:'target',points:targetPath,current:I,role:'target',closed:true}];field=makePathField(sourcePaths);
  samples=[samplePath(targetPath,.01,I,field,topic.parts[0]),samplePath(targetPath,.49,I,field,topic.parts[1])];
  right={style:'solenoid',anchor:[0,0,0],axis:mul(axis,Math.sign(J)),radius:.36,value:J,source:'螺线管'};transform={axis,u,v};moment=[0,0,I];
 }else if(kind==='frame'){
  const source=line([2.9,-1.35,0],[-2.9,-1.35,0],128);
  // Initial frame lies in the yz plane. Its near vertical edge carries current down.
  pivot=[0,.5,0];const bottom=-1.35+p.gap,top=2.15;
  const corners=[[0,bottom,1],[0,bottom,-1],[0,top,-1],[0,top,1],[0,bottom,1]];
  targetPath=[];for(let i=1;i<corners.length;i++)targetPath.push(...line(corners[i-1],corners[i],32).slice(i===1?0:1));
  targetPath=transformPath(targetPath,pivot,[0,1,0],angle);
  wires=[{id:'source',points:source,current:J,role:'source'},{id:'target',points:targetPath,current:I,role:'target',closed:true}];field=makePathField([wires[0]]);
  samples=[samplePath(targetPath,.875,I,field,topic.parts[0]),samplePath(targetPath,.375,I,field,topic.parts[1]),samplePath(targetPath,.125,I,field,topic.parts[2]),samplePath(targetPath,.625,I,field,topic.parts[3])];
  right={style:'straight',anchor:[0,-1.35,0],axis:[-Math.sign(J),0,0],radius:.25,value:J,source:'PQ'};
 }else if(kind==='reaction'||kind==='scale'){
  const base=kind==='scale'?.55:-.8,cx=kind==='scale'?.35:0;
  magnet={type:'bar',north:[cx-1.4,base,0],south:[cx+1.4,base,0]};
  // The source drawing prescribes a local tangent but has no field magnitude or
  // magnetization data. This nonuniform tangent field is explicitly a diagram,
  // not a numerical solution inferred from the drawing's pixel dimensions.
  field=pos=>mul([Math.max(.08,pos[1]-base)*.7,-(pos[0]-cx)*.46,0],p.B);
  pivot=[p.wireX,p.height,0];targetPath=line(add(pivot,[0,0,-.8]),add(pivot,[0,0,.8]),48);
  wires=[{id:'target',points:targetPath,current:I,role:'target'}];samples=[samplePath(targetPath,.5,I,field,topic.parts[0])];
  const wireForce=integrateForce(targetPath,I,field,pivot).force;
  samples.push({...samples[0],name:'磁体整体',pos:[cx,base,0],force:mul(wireForce,-1),isReaction:true,handAt:pivot});
 }
 if(targetPath)net=integrateForce(targetPath,I,field,pivot);
 const selected=samples[0];
 const forces=samples.filter(x=>!x.isReaction).map((x,i)=>force(`\\mathrm dF_{${i+1}}`,x.force,x.pos));
 if(kind==='reaction'||kind==='scale'){
  const reaction=mul(net.force,-1),at=samples[1].pos,weight=norm(reaction)*1.7+1;
  forces.push(force(String.raw`F_{\mathrm{磁体}}`,reaction,at,'reaction'),force('mg',[0,-weight,0],at,'gravity'),force('N',[0,weight-reaction[1],0],at,'normal'),force(kind==='scale'?String.raw`F_{\mathrm{弹}}`:'f',[-reaction[0],0,0],at,kind==='scale'?'tension':'friction'));
 }
 return {kind,wires,pivot,center:kind==='solenoid'?[0,.4,0]:kind==='magnet-loop'?[-.5,0,0]:[0,0,0],samples,field,right,magnet,transform,netForce:net.force,torque:kind==='solenoid'?mul(net.torque,-1):net.torque,
  forces,moment,metric:{I,B:p.B,J,angle:p.angle,gap:p.gap},invalid:!selected||norm(selected.B)<1e-9||!I,status:'方向与趋势示意'};
}

export function evaluateTopic(topic,p,index,mode='lesson'){
 if(['rail','rail-side','pulley','cannon'].includes(topic.kind))return evaluateRail(topic,p,index,mode);
 if(topic.kind==='vertical')return evaluateVertical(topic,p);
 if(topic.kind==='radial')return evaluateRadial(topic,p);
 return evaluateDirection(topic,p,index);
}

// A proper rotation basis preserves left-hand chirality. Canonical left thumb is
// -x, fingers +y, palm outward +z; B enters the palm along its negative normal.
export function leftHandBasis(currentDirection,B){
 const y=unit(currentDirection),perp=sub(B,mul(y,dot(B,y)));
 if(norm(y)<1e-8||norm(perp)<1e-8)return null;
 const z=mul(unit(perp),-1),x=unit(cross(y,z));
 return {x,y,z,thumb:mul(x,-1),fingers:y,palmOut:z};
}
