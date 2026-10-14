import {readMotionState,readWaveFactor} from './planar-motion-readings.mjs';
import {segmentState,forcesAt,E,TAU} from './planar-physics.mjs';
import {motionStages,stageName} from './planar-teaching.mjs';

const US=1e6,EPS=Number.EPSILON;
const finite=Number.isFinite;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const speed=state=>Math.hypot(...state.v);
const timeEpsilon=duration=>Math.max(1e-22,Math.abs(duration)*1e-12);
const labelOf=object=>String(object?.label||object?.id||'未命名场域');
const fieldKind=object=>object?.kind==='electric'?'电场':object?.kind==='field'?'磁场':'场域';
const fieldInfo=(ids,objects)=>ids.map(id=>({id,kind:objects.get(id)?.kind||'unknown',label:labelOf(objects.get(id)||{id})}));

function bisect(fn,a,b,tol){
 let fa=fn(a),fb=fn(b);if(fa===0)return a;if(fb===0)return b;
 if(!finite(fa)||!finite(fb)||Math.sign(fa)===Math.sign(fb))return null;
 for(let n=0;n<64&&b-a>tol;n++){const m=(a+b)/2,fm=fn(m);if(!finite(fm))return null;if(fm===0)return m;if(Math.sign(fm)===Math.sign(fa)){a=m;fa=fm;}else{b=m;fb=fm;}}
 return (a+b)/2;
}
function numericalRoots(seg,lo,hi,tol,component){
 const v=t=>segmentState(seg,t).v[component],a=t=>{const state=segmentState(seg,t);return forcesAt(seg,state.v,t).acceleration[component];};
 const n=24,nodes=Array.from({length:n+1},(_,i)=>lo+(hi-lo)*i/n),roots=[],critical=[lo,hi];
 // Do not turn a numerical near-zero plateau into a row of invented roots.
 // This is explicitly finite evidence, unlike an analytically unforced axis.
 if(nodes.every(t=>{const state=segmentState(seg,t),acc=forcesAt(seg,state.v,t).acceleration;return Math.abs(state.v[component])<=64*EPS*Math.max(1,speed(state))&&Math.abs(acc[component])<=64*EPS*Math.max(1,Math.hypot(...acc));}))
  return {roots:[],interval:[lo,hi],total:0,method:'native-numerical-zero-interval',sampled:true,toleranceSeconds:tol};
 for(let i=0;i<n;i++){const t=bisect(a,nodes[i],nodes[i+1],tol);if(t!==null)critical.push(t);}
 for(const t of nodes)if(v(t)===0)roots.push(t);
 for(let i=0;i<n;i++){const t=bisect(v,nodes[i],nodes[i+1],tol);if(t!==null)roots.push(t);}
 for(const t of critical){const state=segmentState(seg,t),roundoff=64*EPS*Math.max(1,speed(state));if(Math.abs(state.v[component])<=roundoff)roots.push(t);}
 const unique=roots.sort((a,b)=>a-b).filter((t,i,all)=>!i||t-all[i-1]>tol*4);return {roots:unique,total:unique.length,firstRoot:unique[0],lastRoot:unique.at(-1),method:'native-numerical',toleranceSeconds:tol};
}
function velocityZeros(seg,lo,hi,limit,component){
 const tol=timeEpsilon(seg.dt),v=seg.v,a=seg.a||[0,0],w=seg.w||0,other=1-component;
 const driven=w?seg.sines?.some(h=>Math.hypot(...h.a)>0):seg.sines?.some(h=>h.a[component]!==0);
 if(hi<lo||!finite(hi)||!finite(lo))return {roots:[],total:0};
 const velocityRoundoff=32*EPS*Math.max(1,Math.hypot(...v)),coupling=component===0?w:-w,balance=a[component]+coupling*v[other],balanceRoundoff=64*EPS*Math.max(1,Math.abs(a[component]),Math.abs(coupling*v[other]));
 // Without B the other axis is independent, including its sine forcing.
 if(!driven&&Math.abs(v[component])<=velocityRoundoff&&(!w||a[other]===0)&&Math.abs(balance)<=balanceRoundoff)
  return {roots:[],interval:[lo,hi],total:0,method:'constant-component',toleranceSeconds:tol};
 if(!driven&&!w){const root=a[component]?-v[component]/a[component]:null,inside=root!==null&&root>=lo-tol&&root<=hi+tol,t=inside?clamp(root,lo,hi):undefined;return {roots:inside&&limit>0?[t]:[],total:inside?1:0,firstRoot:t,lastRoot:t,method:'native-linear',toleranceSeconds:tol};}
 if(driven||Math.abs(w)*seg.dt<.01){const found=numericalRoots(seg,lo,hi,tol,component);found.roots=found.roots.slice(0,limit);return found;}
 // vx=(vx0-ay/w)cos+(vy0+ax/w)sin+ay/w;
 // vy=(vy0+ax/w)cos-(vx0-ay/w)sin-ax/w.
 const A=component===0?v[0]-a[1]/w:v[1]+a[0]/w,B=component===0?v[1]+a[0]/w:-(v[0]-a[1]/w),C=component===0?a[1]/w:-a[0]/w,R=Math.hypot(A,B);
 if(!R||Math.abs(C)>R*(1+32*EPS))return {roots:[],total:0,method:'native-analytic',toleranceSeconds:tol};
 const angle=Math.acos(clamp(-C/R,-1,1)),phi=Math.atan2(B,A),phases=angle===0||angle===Math.PI?[phi+angle]:[phi+angle,phi-angle];
 const thetaLo=Math.min(w*lo,w*hi),thetaHi=Math.max(w*lo,w*hi),ranges=phases.map(base=>({base,first:Math.ceil((thetaLo-base)/TAU-1e-12),last:Math.floor((thetaHi-base)/TAU+1e-12)})).filter(r=>r.first<=r.last);
 const total=ranges.reduce((n,r)=>n+r.last-r.first+1,0),roots=[],firstRoot=total?clamp(Math.min(...ranges.map(r=>(r.base+TAU*(w>0?r.first:r.last))/w)),lo,hi):undefined,lastRoot=total?clamp(Math.max(...ranges.map(r=>(r.base+TAU*(w>0?r.last:r.first))/w)),lo,hi):undefined;
 const cursors=ranges.map(r=>({...r,k:w>0?r.first:r.last}));
 while(roots.length<Math.min(total,limit)){let chosen=null,t=Infinity;for(const cursor of cursors){if(cursor.k<cursor.first||cursor.k>cursor.last)continue;const candidate=(cursor.base+TAU*cursor.k)/w;if(candidate<t){chosen=cursor;t=candidate;}}if(!chosen)break;const previous=chosen.k;chosen.k+=w>0?1:-1;if(t>=lo-tol&&t<=hi+tol)roots.push(clamp(t,lo,hi));if(previous===chosen.k)break;}
 return {roots,total,firstRoot,lastRoot,method:'native-analytic',toleranceSeconds:tol};
}

export function timelineReadings(trace,timeUs,segmentIndexOrOptions){
 const time=timeUs/US,options=typeof segmentIndexOrOptions==='object'?segmentIndexOrOptions||{}:{};
 let reading=readMotionState(trace,time,options);
 if(Number.isInteger(segmentIndexOrOptions)&&(!reading.available||reading.segmentIndex!==segmentIndexOrOptions)){
  const alternate=readMotionState(trace,time,{side:reading.side==='after'?'before':'after'});
  if(!alternate.available||alternate.segmentIndex!==segmentIndexOrOptions)return null;reading=alternate;
 }
 if(!reading.available)return null;
 const {state,segmentIndex,side,boundaryTimeUs,boundaryKind,reason,endpointOnly,dynamicsAvailable}=reading,forces=dynamicsAvailable?forcesAt(state.segment,state.v,state.local):null;
 return {timeUs,xCm:state.p[0]*100,yCm:state.p[1]*100,vxMS:state.v[0],vyMS:state.v[1],speedMS:speed(state),kineticEV:state.segment.m*speed(state)**2/(2*E),dynamicsAvailable,...(forces?{electricForceN:forces.electric,magneticForceN:forces.magnetic,totalForceN:forces.total,fieldIds:[...state.segment.fieldIds]}:{}),segmentIndex,localSeconds:state.local,side,...(boundaryTimeUs!==undefined?{boundaryTimeUs,boundaryKind}:{}),...(reason?{reason}:{}),...(endpointOnly?{endpointOnly:true}:{})};
}

// All intervals and markers originate in the existing native solver output.
// Layout, filter and viewport choices never change scene or trace objects.
export function extractTimelineEvents({scene,traces,durationUs=scene?.duration||0,rangeUs={start:0,end:durationUs},velocityTraceIds=null,velocityComponents=['x','y'],maxVelocityRoots=2048}={}){
 if(!Array.isArray(velocityComponents)||!velocityComponents.length||velocityComponents.length>2||new Set(velocityComponents).size!==velocityComponents.length||velocityComponents.some(c=>!['x','y'].includes(c)))throw Error('速度分量须为x/y的非空不重复数组。');
 if(!Number.isSafeInteger(maxVelocityRoots)||maxVelocityRoots<0||maxVelocityRoots>10000)throw Error('速度零点预算须为0–10000的整数。');
 const objects=new Map((scene?.objects||[]).map(o=>[o.id,o])),startUs=Math.max(0,rangeUs.start||0),endUs=Math.min(durationUs,rangeUs.end??durationUs),tracks=[],events=[],limitations=[];
 for(const trace of traces||[]){
  const birthUs=trace.particle.birth*US,computedEndUs=(trace.particle.birth+trace.duration)*US,owner=objects.get(trace.particle.objectId);
  const track={id:trace.particle.traceId,objectId:trace.particle.objectId,label:trace.particle.label||owner?.label||trace.particle.traceId,birthUs,computedEndUs,endUs:durationUs,truncated:!!trace.truncated,reason:trace.reason||'',intervals:[],events:[],zeroIntervals:[],velocityRootCount:0,velocityRootCounts:{x:0,y:0},omittedVelocityRoots:0,omittedVelocityRootsByComponent:{x:0,y:0},future:birthUs>durationUs};
  const add=event=>{if(event.timeUs<startUs-1e-10||event.timeUs>endUs+1e-10)return;event.traceId=track.id;event.objectId=track.objectId;event.id=track.id+':'+event.kind+':'+Number(event.timeUs).toPrecision(14)+':'+(event.fieldId||'');track.events.push(event);events.push(event);};
  if(birthUs<=durationUs)add({kind:birthUs?'birth':'initial',timeUs:birthUs,label:birthUs?'发射':'初态',segmentIndex:0,method:'native-initial'});
  for(const stage of motionStages(trace)){
   const first=stage.first,last=stage.last,fields=fieldInfo(first.fieldIds,objects),stageStartUs=(trace.particle.birth+stage.start)*US,stageEndUs=(trace.particle.birth+stage.end)*US;
   track.intervals.push({startUs:stageStartUs,endUs:stageEndUs,index:stage.index,endIndex:stage.endIndex,fields,fieldIds:[...first.fieldIds],motion:stageName(first),kind:fields.some(f=>f.kind==='electric')?(fields.some(f=>f.kind==='field')?'combined':'electric'):fields.length?'magnetic':'free'});
   if(last.end==='boundary'){
    const next=trace.segments[stage.endIndex+1],before=last.fieldIds,after=next?.fieldIds;
    if(after){
     for(const id of before.filter(id=>!after.includes(id))){const object=objects.get(id);add({kind:'exit',timeUs:stageEndUs,label:'离开'+fieldKind(object)+' '+labelOf(object||{id}),fieldId:id,fieldKind:object?.kind,segmentIndex:stage.endIndex,beforeSegmentIndex:stage.endIndex,afterSegmentIndex:stage.endIndex+1,nextSegmentIndex:stage.endIndex+1,beforeFields:[...before],afterFields:[...after],method:'native-boundary'});}
     for(const id of after.filter(id=>!before.includes(id))){const object=objects.get(id);add({kind:'enter',timeUs:stageEndUs,label:'进入'+fieldKind(object)+' '+labelOf(object||{id}),fieldId:id,fieldKind:object?.kind,segmentIndex:stage.endIndex,beforeSegmentIndex:stage.endIndex,afterSegmentIndex:stage.endIndex+1,nextSegmentIndex:stage.endIndex+1,beforeFields:[...before],afterFields:[...after],method:'native-boundary'});}
    }else add({kind:'boundary',timeUs:stageEndUs,label:'到达场域边界（后续未计算）',segmentIndex:stage.endIndex,beforeSegmentIndex:stage.endIndex,afterSegmentIndex:null,nextSegmentIndex:null,method:'native-boundary'});
   }
   if(last.end==='switch'){
    const changed=last.fieldIds.map(id=>objects.get(id)).filter(o=>o?.waveform==='square'&&readWaveFactor(o,stageEndUs/US,{side:'before'})!==readWaveFactor(o,stageEndUs/US,{side:'after'}));
    if(changed.length)for(const object of changed)add({kind:'switch',timeUs:stageEndUs,label:fieldKind(object)+' '+labelOf(object)+' 换向',fieldId:object.id,fieldKind:object.kind,segmentIndex:stage.endIndex,beforeSegmentIndex:stage.endIndex,afterSegmentIndex:trace.segments[stage.endIndex+1]?stage.endIndex+1:null,nextSegmentIndex:trace.segments[stage.endIndex+1]?stage.endIndex+1:null,method:'native-switch'});
    else add({kind:'switch',timeUs:stageEndUs,label:'交变场换向',segmentIndex:stage.endIndex,beforeSegmentIndex:stage.endIndex,afterSegmentIndex:trace.segments[stage.endIndex+1]?stage.endIndex+1:null,nextSegmentIndex:trace.segments[stage.endIndex+1]?stage.endIndex+1:null,method:'native-switch'});
   }
  }
  if(!velocityTraceIds||velocityTraceIds.includes(track.id)){
   const axes=velocityComponents.map(component=>({component,index:component==='x'?0:1,events:[],total:0,lastRootTime:null,lastInterval:null}));
   for(const axis of axes)for(const [index,seg] of trace.segments.entries()){
    const offset=trace.particle.birth+seg.t,lo=Math.max(0,startUs/US-offset),hi=Math.min(seg.dt,endUs/US-offset);if(hi<lo)continue;
    const found=velocityZeros(seg,lo,hi,Math.max(0,maxVelocityRoots-axis.events.length)+1,axis.index),kind=axis.component==='x'?'vx-zero':'vy-zero',symbol=axis.component==='x'?'vx':'vy';
    if(found.interval){const span={kind,component:axis.component,startUs:(offset+found.interval[0])*US,endUs:(offset+found.interval[1])*US,label:symbol+(found.sampled?'≈0（有限数值区间）':'=0（持续）'),method:found.method,segmentIndex:index,...(found.sampled?{sampled:true}:{} )};const prev=axis.lastInterval;if(prev&&prev.method===span.method&&Math.abs(prev.endUs-span.startUs)<timeEpsilon(trace.duration)*US*4)prev.endUs=span.endUs;else{track.zeroIntervals.push(span);axis.lastInterval=span;}if(found.sampled&&!limitations.some(l=>l.traceId===track.id&&l.kind==='sampled-zero'&&l.component===axis.component))limitations.push({traceId:track.id,kind:'sampled-zero',component:axis.component,message:symbol+'的近零区间来自有限数值采样，不代表恒等解析证明。'});}
    const first=found.firstRoot===undefined?null:offset+found.firstRoot,last=found.lastRoot===undefined?null:offset+found.lastRoot,duplicate=first!==null&&axis.lastRootTime!==null&&Math.abs(first-axis.lastRootTime)<=timeEpsilon(trace.duration)*4;
    axis.total+=Math.max(0,found.total-(duplicate?1:0));if(last!==null)axis.lastRootTime=last;
    for(const local of found.roots){const timeUs=(offset+local)*US,prev=axis.events.at(-1);if(prev&&Math.abs(prev.timeUs-timeUs)<=timeEpsilon(trace.duration)*US*4||axis.events.length>=maxVelocityRoots)continue;const state=segmentState(seg,local);axis.events.push({kind,component:axis.component,timeUs,label:symbol+'=0',segmentIndex:index,method:found.method,residualMS:Math.abs(state.v[axis.index]),toleranceUs:(found.toleranceSeconds||0)*US});}
   }
   const quotas=axes.map((axis,index)=>Math.min(axis.events.length,Math.floor(maxVelocityRoots/axes.length)+(index<maxVelocityRoots%axes.length?1:0)));let spare=maxVelocityRoots-quotas.reduce((a,b)=>a+b,0);
   for(const [index,axis] of axes.entries()){const extra=Math.min(spare,axis.events.length-quotas[index]);quotas[index]+=extra;spare-=extra;}
   for(const [index,axis] of axes.entries()){for(const event of axis.events.slice(0,quotas[index]))add(event);track.velocityRootCounts[axis.component]=axis.total;track.omittedVelocityRootsByComponent[axis.component]=Math.max(0,axis.total-quotas[index]);}
   track.velocityRootCount=axes.reduce((n,a)=>n+a.total,0);track.omittedVelocityRoots=Object.values(track.omittedVelocityRootsByComponent).reduce((a,b)=>a+b,0);
  }

  track.events.sort((a,b)=>a.timeUs-b.timeUs||a.kind.localeCompare(b.kind));
  const unique=[];for(const event of track.events){const previous=unique.at(-1);if(previous?.kind===event.kind&&previous.fieldId===event.fieldId&&Math.abs(previous.timeUs-event.timeUs)<=timeEpsilon(trace.duration)*US*4){const n=events.indexOf(event);if(n>=0)events.splice(n,1);}else unique.push(event);}track.events=unique;
  if(track.truncated)limitations.push({traceId:track.id,kind:'truncated',message:'轨迹仅计算到 '+computedEndUs.toPrecision(5)+' μs；之后不提供事件。'});
  for(const component of velocityComponents){const omitted=track.omittedVelocityRootsByComponent[component];if(omitted)limitations.push({traceId:track.id,kind:'dense',component,message:'当前窗口的v'+component+'零点过密，'+omitted+'个尚未显示；放大时间窗口后重新定位。'});}
  tracks.push(track);
 }
 return {durationUs,rangeUs:{start:startUs,end:endUs},tracks,events:events.sort((a,b)=>a.timeUs-b.timeUs),limitations};
}
