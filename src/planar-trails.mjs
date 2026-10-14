import {TAU} from './planar-physics.mjs';

// Reconstruct from physical time; seeking backwards never leaves stale ink.
export function trailSeconds(trace,time,scene){
 if(!scene.trail.auto)return scene.trail.duration*1e-6;
 const local=time-trace.particle.birth;
 const previous=trace.segments.filter(s=>s.t<=local&&s.w).at(-1),magnetic=previous||trace.segments.find(s=>s.w);
 return Math.min(scene.duration*1e-6,magnetic?TAU/Math.abs(magnetic.w):scene.duration*1e-6/6);
}
export function trailWindows(trace,time,scene){
 if(!scene.trail.enabled)return [];
 const seconds=trailSeconds(trace,time,scene),head=time-trace.particle.birth,windows=[];
 for(let band=0;band<12;band++){
  const lo=Math.max(0,head-seconds+seconds*band/12),hi=Math.min(trace.duration,head-seconds+seconds*(band+1)/12);
  if(hi<=lo)continue;
  for(const [index,segment] of trace.segments.entries()){
   const a=Math.max(lo,segment.t),b=Math.min(hi,segment.t+segment.dt);if(b<=a)continue;
   windows.push({index,from:(a-segment.t)/segment.dt,to:(b-segment.t)/segment.dt,opacity:.12+.88*(band+1)/12});
  }
 }
 return windows;
}
