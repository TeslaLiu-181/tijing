import {segmentState,waveFactor} from './planar-physics.mjs';
const US=1e6;
const sideValue=side=>{if(!['before','after'].includes(side))throw Error('读取侧须为before或after。');return side;};
// Covers only a few floating-point ULPs from s <-> us conversion and clock
// addition. This is not a physical time step and never probes t +/- epsilon.
const sameTime=(a,b)=>a===b||Math.abs(a-b)<=Math.max(Number.MIN_VALUE,4*Number.EPSILON*Math.max(Math.abs(a),Math.abs(b)));
const clock=(trace,segment)=>trace.particle.birth+segment.t;
const atSegment=(segment,local,finished=false)=>({...segmentState(segment,local),segment,local,finished});
const kindAt=(previous,index)=>index===0?'birth':previous.end==='boundary'?'boundary':previous.end==='switch'?'switch':'segment';

/** Read an actual native segment at the requested side of its clock seam. */
export function readMotionState(trace,timeSeconds,{side='after'}={}){
 side=sideValue(side);const unavailable=(reason,code,extra={})=>({available:false,dynamicsAvailable:false,state:null,segmentIndex:null,side,reason,code,...extra});
 if(!Number.isFinite(timeSeconds))return unavailable('读取时刻须为有限数值。','invalid_time');
 const segments=trace?.segments||[],birth=trace?.particle?.birth??0;
 if(!segments.length)return unavailable(timeSeconds<birth?'粒子尚未发射。':'此时刻没有已计算的运动段。',timeSeconds<birth?'before_birth':'no_trajectory');
 // Native segments are ordered. Locate one segment and examine only adjacent
 // seams, avoiding a scan of thousands of segments on every animation frame.
 let lo=0,hi=segments.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(clock(trace,segments[mid])<=timeSeconds)lo=mid+1;else hi=mid;}
 const index=lo-1,candidates=[index,index+1].filter(i=>i>=0&&i<segments.length);
 let seam=null;
 for(const i of candidates){const time=clock(trace,segments[i]);if(sameTime(timeSeconds,time)&&(!seam||Math.abs(timeSeconds-time)<Math.abs(timeSeconds-seam.time)))seam={index:i,time};}
 if(seam){
  const i=seam.index,previous=segments[i-1],extra={boundaryTimeUs:seam.time*US,boundaryKind:kindAt(previous,i)};
  if(side==='before'){
   if(!previous)return unavailable('发射前没有这个粒子的运动状态。','before_birth',extra);
   return {available:true,dynamicsAvailable:true,state:atSegment(previous,previous.dt),segmentIndex:i-1,side,...extra};
  }
  return {available:true,dynamicsAvailable:true,state:atSegment(segments[i],0),segmentIndex:i,side,...extra};
 }
 if(timeSeconds<birth)return unavailable('粒子尚未发射。','before_birth');
 const lastIndex=segments.length-1,last=segments[lastIndex],end=birth+(last.t+last.dt);
 if(sameTime(timeSeconds,end)){
  const physicalBoundary=['boundary','switch'].includes(last.end),extra={boundaryTimeUs:end*US,boundaryKind:physicalBoundary?last.end:trace.truncated?'truncated':'limit'};
  if(side==='after'&&(trace.truncated||physicalBoundary))return unavailable('此处只有已计算的前侧，后续运动段尚未计算。','after_uncomputed',extra);
  return {available:true,dynamicsAvailable:side==='before',state:atSegment(last,last.dt),segmentIndex:lastIndex,side,...extra,endpointOnly:true,
   reason:trace.truncated?'轨迹在此截断；此读数来自最后已计算运动段。':side==='after'?'观察终点的位置、速度和动能可读，但时刻之后的场侧与受力尚未计算。':'观察终点的前侧读数来自最后已计算运动段。'};
 }
 if(timeSeconds>end)return unavailable('该时刻超出已计算轨迹。','past_computed');
 if(index<0)return unavailable('此时刻没有已计算的运动段。','no_trajectory');
 const segment=segments[index],local=timeSeconds-birth-segment.t;
 if(local<0||local>segment.dt)return unavailable('该时刻不在已计算的运动段内。','uncomputed_gap');
 return {available:true,dynamicsAvailable:true,state:atSegment(segment,local),segmentIndex:index,side};
}

/** One-sided square-wave display uses the same scene clock as native motion. */
export function readWaveFactor(field,timeSeconds=0,{side='after'}={}){
 side=sideValue(side);if(field.waveform!=='square')return waveFactor(field,timeSeconds);
 const half=field.period*1e-6/2,phase=(field.phase||0)/180,cycles=timeSeconds/half+phase,nearest=Math.round(cycles),boundary=(nearest-phase)*half;
 const index=sameTime(timeSeconds,boundary)?nearest-(side==='before'?1:0):Math.floor(cycles);
 return ((index%2)+2)%2===0?1:-1;
}
