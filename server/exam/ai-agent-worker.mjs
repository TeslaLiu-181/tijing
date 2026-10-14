import {inspectSceneControls} from '../../src/planar-scene-inspector.mjs';
import {readMotionState} from '../../src/planar-motion-readings.mjs';
import {parentPort,workerData} from 'node:worker_threads';
import {readStoredScene,sourceTraceSelection,solveSelectedTraces} from './ai-harness.mjs';
import {resolveScene,createResolver} from '../../src/planar-relations.mjs';
import {forcesAt,norm,E} from '../../src/planar-physics.mjs';
import {extractTimelineEvents} from '../../src/planar-timeline-events.mjs';

try {
  const {action,args}=workerData,scene=readStoredScene(workerData.scene),resolution=action==='inspect_scene'?null:resolveScene(scene);
  let result;
  if(action==='inspect_scene'){result=inspectSceneControls(scene,{objectIds:args.objectIds,header:workerData.inspectionHeader});}
  else if(action==='evaluate_relation') {
    const value=createResolver(scene).evaluate(args.expression);
    result={expression:args.expression,value,units:'物理量返回SI数值与原生量纲向量；画布坐标的原生显示单位为cm。',issues:resolution.issues};
  } else {
    if(resolution.fieldUnavailable)throw Error('场依赖尚未定义，不能报告有效运动数据。');
    const selection=sourceTraceSelection(resolution.scene,{traceId:args.traceId,maxTraces:action==='query_motion'?1:24,allowPartial:action==='query_motion'}),traces=solveSelectedTraces(resolution.scene,selection.particles),trace=traces[0];
    if(!trace)throw Error('没有找到这个粒子的轨迹。');
    if(action==='query_events'){
      const found=extractTimelineEvents({scene,traces:args.traceId?[trace]:traces,durationUs:scene.duration,rangeUs:{start:args.startUs??0,end:args.endUs??scene.duration},maxVelocityRoots:80,velocityComponents:args.velocityComponents||['x','y']});
      result={rangeUs:found.rangeUs,events:found.events.slice(0,80),tracks:found.tracks.map(t=>({traceId:t.id,label:t.label,zeroIntervals:t.zeroIntervals,truncated:t.truncated,computedEndUs:t.computedEndUs,omittedVelocityRoots:t.omittedVelocityRoots,velocityRootCount:t.velocityRootCount,velocityRootCounts:t.velocityRootCounts,omittedVelocityRootsByComponent:t.omittedVelocityRootsByComponent})),limited:found.events.length>80,limitations:found.limitations,method:'shared-native-timeline-events',traceScope:{selection:selection.selection,total:selection.total,computed:traces.length}};
      parentPort.postMessage({ok:true,result});
    }else{
    const readings=args.timesUs.map(timeUs=>{
      const reading=readMotionState(trace,timeUs*1e-6,{side:args.side||'after'}),{state,available,...evidence}=reading;
      if(!available)return {timeUs,available:false,...evidence};
      const forces=evidence.dynamicsAvailable?forcesAt(state.segment,state.v,state.local):null;
      return {timeUs,available:true,...evidence,xCm:state.p[0]*100,yCm:state.p[1]*100,vxMs:state.v[0],vyMs:state.v[1],speedMs:norm(state.v),kineticEV:state.segment.m*norm(state.v)**2/(2*E),...(forces?{electricForceN:forces.electric,magneticForceN:forces.magnetic,totalForceN:forces.total,fields:state.segment.fieldIds||[]}:{})};
    });
    result={traceId:trace.particle.traceId,method:'native-piecewise-electromagnetic-solver',truncated:!!trace.truncated,readings,traceScope:{selection:args.traceId?'requested':'default-first',total:selection.total,computed:traces.length}};
    }
  }
  if(action!=='query_events')parentPort.postMessage({ok:true,result});
}catch(error){parentPort.postMessage({ok:false,error:error.message});}
