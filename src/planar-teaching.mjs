import {add,sub,mul,dot,norm,unit,segmentState} from './planar-physics.mjs';
import {readMotionState} from './planar-motion-readings.mjs';

export const teachingDefaults={enabled:false,components:true,componentFirst:true,componentSecond:true,frame:'xy',midpoint:false,boundaries:true,pauseAtBoundary:true,pastOnly:false};

// Numerical sampling breaks in sinusoidal fields are not new teaching stages.
export function motionStages(trace){
 const stages=[];
 for(const [index,seg] of (trace?.segments||[]).entries()){
  const previous=stages.at(-1);
  if(previous?.last.end==='sample'){previous.last=seg;previous.endIndex=index;previous.end=seg.t+seg.dt;}
  else stages.push({first:seg,last:seg,index,endIndex:index,start:seg.t,end:seg.t+seg.dt});
 }
 return stages;
}
export function stageName(seg){
 if(!seg)return '尚未发射';
 if(seg.sines?.length)return seg.w?'交变复合场':'交变电场';
 if(seg.C)return '磁场 · 匀速圆周';
 if(norm(seg.a))return seg.w?'电磁复合场':'电场 · 匀变速';
 return norm(seg.v)?'无合力 · 匀速直线':'静止';
}
export function boundaryTimes(trace){return motionStages(trace).filter(s=>['boundary','switch'].includes(s.last.end)).map(s=>s.end+trace.particle.birth);}
export function nextBoundary(trace,time){const eps=Math.max(1e-20,(trace?.duration||0)*1e-10);return boundaryTimes(trace).find(t=>t>time+eps);}

export function teachingState(trace,time,frame='xy',{side='after'}={}){
 const reading=readMotionState(trace,time,{side});if(!reading.available)return null;
 // The timeline, forces and geometric constructions share the chosen side.
 const state=reading.state,seg=state.segment,local=state.local;
 let axes=[[1,0],[0,1]],names=['x','y'];
 if(reading.dynamicsAvailable!==false&&frame==='field'&&norm(seg.electric)&&!seg.sines?.length){
  const parallel=unit(seg.electric),perp=[parallel[1],-parallel[0]];
  if(dot(perp,seg.v)<0){perp[0]*=-1;perp[1]*=-1;}
  axes=[perp,parallel];names=['\\perp','\\parallel'];
 }
 const values=axes.map(a=>{const v=dot(state.v,a);return Math.abs(v)<norm(state.v)*1e-10?0:v;});
 return {seg,local,state,axes,names,values,vectors:axes.map((a,i)=>mul(a,values[i])),energy:seg.m*dot(state.v,state.v)/2,work:seg.m*(dot(state.v,state.v)-dot(seg.v,seg.v))/2,atBoundary:['boundary','switch'].includes(reading.boundaryKind),side:reading.side,endpointOnly:reading.endpointOnly===true,dynamicsAvailable:reading.dynamicsAvailable!==false};
}

export function midpointConstruction(seg,local){
 if(!seg)return {valid:false,reason:'选择一条有效粒子轨迹。'};
 if(seg.w||seg.sines?.length||!norm(seg.a))return {valid:false,reason:'中点关系仅用于恒定合电场、无磁力的类平抛段。'};
 if(!norm(seg.v)||Math.abs(dot(unit(seg.v),unit(seg.a)))>1e-8)return {valid:false,reason:'本段入场速度不垂直于加速度；不套用从入场点起的中点关系。'};
 if(local<=Math.max(1e-20,seg.dt*1e-7))return {valid:false,reason:'从入场点推进一小段时间后显示中点关系。'};
 const state=segmentState(seg,local),u=unit(seg.v),a=unit(seg.a),delta=sub(state.p,seg.p),parallel=dot(delta,u);
 const foot=add(seg.p,mul(u,parallel)),mid=mul(add(seg.p,foot),.5);
 // Derive the tangent intersection from the actual velocity, not a forced midpoint.
 const lambda=dot(delta,a)/dot(state.v,a),intersection=sub(state.p,mul(state.v,lambda));
 return {valid:true,start:seg.p,end:state.p,foot,mid,intersection,velocity:state.v,distance:Math.abs(parallel),error:norm(sub(mid,intersection)),u,a};
}

export function teachingOverlay(view){
 const cfg=view.model.teaching;if(!cfg?.enabled)return '';
 const {trace}=view.selectedSegment();if(!trace||!view.model.objects.some(o=>o.id===trace.particle.objectId&&o.visible))return '';
 const data=teachingState(trace,view.time,cfg.frame,{side:view.ui.readingSide});let out='';
 const cm=p=>mul(p,100),palette=view.model.display.ink?['#31596a','#986b37']:['#217f92','#c27934'];
 if(cfg.boundaries){let n=0;for(const stage of motionStages(trace)){
  if(!['boundary','switch'].includes(stage.last.end))continue;
  ++n;if(cfg.pastOnly&&view.time+1e-18<stage.end+trace.particle.birth)continue;
  const p=cm(stage.last.p1);out+=view.dot(p,5,`fill="white" stroke="#677f8a" stroke-width="1.5"`)+view.label(`Q_{${n}}`,p,-32,n%2?25:24,'#516f7d');
 }}
 if(!data)return `<g data-teaching="true" pointer-events="none">${out}</g>`;
 const {seg,local,state,vectors,names}=data,p=cm(state.p);
 if(cfg.midpoint){const g=midpointConstruction(seg,local);if(g.valid){
  const A=cm(g.start),H=cm(g.foot),I=cm(g.intersection),P=cm(g.end),color='#9a6d40';
  out+=view.line(A,H,{color,dash:'6 4'})+view.line(H,P,{color,dash:'3 5'})+view.line(P,add(I,mul(sub(I,P),.16)),{color,width:1.6,dash:'8 4'});
  out+=view.dot(I,4,`fill="white" stroke="${color}" stroke-width="2"`)+view.label('I',I,0,-24,color)+view.label('A_0',A,-16,22,color)+view.label('H',H,16,22,color);
  out+=view.label('A_0I=IH',mul(add(A,H),.5),0,31,color);
 }}
 if(cfg.components&&norm(state.v)){
  const total=norm(state.v),length=84,ends=vectors.map(v=>add(p,mul(v,length/total/view.view.scale)));
  const sum=add(p,mul(state.v,length/total/view.view.scale));
  for(let i=0;i<2;i++)if((i?cfg.componentSecond:cfg.componentFirst)&&norm(vectors[i])>total*1e-9){
   out+=view.arrow(p,vectors[i],{length:length*norm(vectors[i])/total,color:palette[i]});
   const at=ends[i],u=unit(vectors[i]);out+=view.label(`v_{${names[i]}}`,at,u[1]*18+u[0]*12,-u[0]*22-u[1]*12,palette[i]);
   out+=view.line(at,sum,{color:palette[i],dash:'3 4',width:1});
  }
  out+=view.arrow(p,state.v,{length,color:'#203f50'})+view.label('\\vec v',sum,24,24,'#203f50');
 }
 return `<g data-teaching="true" pointer-events="none">${out}</g>`;
}
