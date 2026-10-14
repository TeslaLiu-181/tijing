import {repairResultMath} from './ai-format.mjs';
import {constructionSpecs} from '../../src/planar-geometry.mjs';
import {geometryToolSchema} from '../../src/planar-constructions.mjs';
import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {assertData,checkSnapshot} from '../../src/exam/model.mjs';
import {emptyScene,createObject,kinds,fieldNames,sourceNames,validate} from '../../src/planar-model.mjs';
import {targets,resolveScene} from '../../src/planar-relations.mjs';
import {solveScene,forcesAt,segmentState,norm,dot,E,U,emittedParticles,compileField,traceParticle} from '../../src/planar-physics.mjs';
import {objectStyleKeys} from '../../src/planar-object-style.mjs';
import {readMotionState} from '../../src/planar-motion-readings.mjs';
import {requireCondition,HTTPError} from './errors.mjs';

const constructionParameters=new Map(geometryToolSchema().map(tool=>[tool.id,(tool.parameters||[]).map(parameter=>parameter.key)]));
export const sceneHash = snapshot => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
const textList = (value,name) => {
  requireCondition(Array.isArray(value)&&value.length<=40&&value.every(x=>typeof x==='string'&&x.length<=1500),502,'模型 '+name+' 格式不正确','ai_response_invalid');
  return value.map(x=>x.trim()).filter(Boolean);
};
export function parseAIResult(text, mode) {
  let data;
  try{data=JSON.parse(String(text).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));assertData(data);}catch{throw new HTTPError(502,'模型未返回有效 JSON，请重试','ai_response_invalid');}
  requireCondition(data && !Array.isArray(data) && ['answer','needs_confirmation'].includes(data.status),502,'模型结果状态不正确','ai_response_invalid');
  requireCondition(typeof data.answer==='string'&&data.answer.length<=45000,502,'模型回答过长或格式不正确','ai_response_invalid');
  data.givens=textList(data.givens,'题设');data.assumptions=textList(data.assumptions,'演示假设');data.missing=textList(data.missing,'待确认条件');
  data.followUps=textList(data.followUps||[],'后续问题');
  if(data.missing.length)data.status='needs_confirmation';
  if(mode==='extract')requireCondition(data.questions===undefined || Array.isArray(data.questions)&&data.questions.length<=40&&data.questions.every(q=>typeof q.title==='string'&&q.title.length<=140&&typeof q.sourceText==='string'&&q.sourceText.length<=20000),502,'分题候选格式不正确','ai_response_invalid');
  if(mode==='extract')for(const question of data.questions||[]) {
   if(question.sourceRefs===undefined)continue;
   requireCondition(Array.isArray(question.sourceRefs)&&question.sourceRefs.length<=16&&question.sourceRefs.every(r=>r&&typeof r.sourceName==='string'&&r.sourceName.trim().length>0&&r.sourceName.length<=160&&
    (r.page==null||Number.isInteger(r.page)&&r.page>=1&&r.page<=12)&&(r.imageName==null||typeof r.imageName==='string'&&r.imageName.length<=250)),502,'识别原页锚点格式不正确','ai_response_invalid');
  }
  if(mode!=='scene')delete data.scene;
  delete data.harness;delete data.verified;delete data.tools;delete data.code;
  const safe={status:data.status,answer:data.answer,givens:data.givens,assumptions:data.assumptions,missing:data.missing,followUps:data.followUps};
  if(mode==='extract'&&data.questions)safe.questions=data.questions.map(q=>({title:q.title,sourceText:q.sourceText,...(q.sourceRefs?{sourceRefs:q.sourceRefs}: {})}));
  if(mode==='scene'){safe.scene=data.scene;safe.checks=data.checks;}
  if(mode==='review-result'){if(data.review)safe.review={verdict:data.review.verdict,issues:data.review.issues};safe.nextStep=data.nextStep;safe.question=data.question;}
  return repairResultMath(safe);
}
export function sceneSchema() {
  return {kind:'planar',units:{position:'cm',mass:'u',charge:'e',speed:'100000 m/s',heading:'deg',B:'mT',E0:'kV/m',duration:'us',period:'us'},
    objectKinds:kinds,fieldShapes:fieldNames,sourceTypes:sourceNames,constructionTypes:constructionSpecs,geometryTools:geometryToolSchema(),
    objects:Object.fromEntries(Object.keys(kinds).map(kind=>{const o=createObject(kind,'o1');return [kind,{defaults:o,definitions:Object.keys(targets(o))}];})),
    relationExamples:['o1.radius','2 * o1.value','-o2.B','orbitRadius(o3.mass, o3.charge, o3.speed, o1.B)','orbitSpeed(o3.mass, o3.charge, o1.B, o1.radius)','intersect(o1, axisX, 1)','mid(vertex(o2, 1), vertex(o2, 3))','bearing(pos(o3), pos(o1))'],
    optionalDisplayProperties:{style:{type:'object',optional:true,additionalProperties:false,byKind:Object.fromEntries(Object.keys(kinds).filter(kind=>objectStyleKeys(kind).length).map(kind=>[kind,objectStyleKeys(kind)])),properties:{color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},strokeWidth:{type:'number',minimum:.5,maximum:8,unit:'px'},dash:{enum:['solid','dashed','dotted']},opacity:{type:'number',minimum:0,maximum:1},pointSize:{type:'number',minimum:1,maximum:18,unit:'px'}},description:'可选绘图样式，按kind支持的属性局部覆盖；不改变几何或物理。pointSize指标记半径，不是物理尺寸；黑白显示保留线型/线宽但忽略自定义颜色。'},labelOffset:{type:'object',optional:true,required:['x','y'],properties:{x:{type:'number',unit:'px',minimum:-2000,maximum:2000},y:{type:'number',unit:'px',minimum:-2000,maximum:2000}},default:{x:0,y:0},description:'仅移动标注；x向右、y向下，不改变几何或物理参数。'},slider:{type:'object',optional:true,objectKinds:['parameter'],required:['min','max','step'],additionalProperties:false,properties:{min:{type:'number'},max:{type:'number'},step:{type:'number',exclusiveMinimum:0}},description:'仅自由参数的滑杆偏好，数值采用当前显示单位。须min<max且0<step<=max-min；不限制或改变value、defs与物理条件。'}},
    fieldShapeProperties:{annulus:{required:['radius','innerRadius'],properties:{radius:{type:'number',unit:'cm',exclusiveMinimum:0},innerRadius:{type:'number',unit:'cm',minimum:0,lessThan:'radius'}},regionSource:false,description:'同心圆环，0≤r<R；r=0精确退化圆场。内外半径均须明示数值或持续定义；整环不是单条曲线，请用circle(pos(id), id.radius)或circle(pos(id), id.innerRadius)选边界。'}},
    fieldRegionBinding:{sourceProperty:'regionSource',sourceKinds:['circle','polygon'],verticesProperty:'points',continuous:true},
    limits:{objects:60,particles:120,maxDurationUs:10000,polygonVertices:64},checkSide:{optional:true,values:['before','after'],default:'after',description:'在进出场或方波换向瞬间明确所读的一侧；观察终点没有后段时，forceN、radiusCm、magneticWorkZero的after读数不可用，可检查已计算前侧或延长观察时长。'},checks:['speed','kineticEV','xCm','yCm','forceN','radiusCm','magneticWorkZero']};
}
export function buildScene(input) {
  assertData(input);
  requireCondition(input && Array.isArray(input.objects)&&input.objects.length>0&&input.objects.length<=60,400,'AI 场景须包含 1–60 个对象','ai_scene_invalid');
  const scene=emptyScene();
  requireCondition(Number.isFinite(input.duration)&&input.duration>0&&input.duration<=10000,400,'观察时长须为 0–10000 μs','ai_scene_invalid');
  scene.duration=input.duration;
  scene.objects=input.objects.map(item=>{
    requireCondition(item&&kinds[item.kind]&&/^o\d+$/.test(item.id),400,'AI 对象编号或类型不正确','ai_scene_invalid');
    // Shape-specific geometry is part of the native schema (polygon points),
    // while explicit-input checks below still forbid inventing missing data.
    const values=item.values?{...item.values,...(item.defs?{defs:item.defs}:{})}:item;
    const object=createObject(item.kind,item.id,[0,0],values.shape||values.lineType||values.sourceType);
    // The proposal may only set actual native properties, never executable code.
    for(const [key,value] of Object.entries(values)) {
      if(['id','kind','values'].includes(key))continue;
      requireCondition(Object.hasOwn(object,key) || key==='labelOffset' || key==='style'&&objectStyleKeys(object).length>0 || key==='slider'&&object.kind==='parameter' || /^pathT\d*$/.test(key),400,'AI 对象包含不支持的属性 '+key,'ai_scene_invalid');
      object[key]=value;
    }
    const supplied=key=>Object.hasOwn(values,key)||Object.hasOwn(object.defs||{},key)
      || ['x','y'].includes(key)&&Object.hasOwn(object.defs||{},'position');
    const boundRegion=['field','electric'].includes(object.kind)&&!!object.regionSource;
    const critical=['particle','source'].includes(object.kind)?['mass','charge','speed','heading','x','y']:
      ['field','electric'].includes(object.kind)?['shape',...(boundRegion||object.shape==='polygon'?[]:['x','y']),object.kind==='field'?'B':'E0',...(object.kind==='electric'?['fieldAngle']:[])]:[];
    if(!object.construction){
      if(object.kind==='point')critical.push('x','y');
      if(object.kind==='line'&&!supplied('points')&&!([0,1].every(i=>supplied('point'+i)||supplied('point'+i+'x')&&supplied('point'+i+'y'))))critical.push('points');
      if(object.kind==='circle')critical.push('x','y','radius');
      if(object.kind==='polygon')critical.push('points');
    }else critical.push(...(constructionParameters.get(object.construction.type)||[]));
    if(object.construction?.type==='point-on')critical.push('pathT');
    if(['field','electric'].includes(object.kind)&&object.shape==='polygon'&&!boundRegion)critical.push('points');
    if(object.kind==='source') {
      critical.push('sourceType','count','spread','speedSpan','interval');
      if(object.sourceType==='line')critical.push('length','angle');
      if(object.sourceType==='circle')critical.push('radius','angle');
      if(object.sourceType==='rectangle')critical.push('width','height','angle');
    }
    if(['field','electric'].includes(object.kind)&&!boundRegion) {
      if(['circle','semicircle','sector','annulus'].includes(object.shape))critical.push('radius');
      if(object.shape==='annulus')critical.push('innerRadius');
      if(['rectangle','triangle'].includes(object.shape))critical.push('width','height');
      if(object.shape==='strip')critical.push('width');
      if(object.shape==='sector')critical.push('sectorAngle');
      if(object.waveform!=='dc')critical.push('period','phase');
    }
    requireCondition(critical.every(supplied),400,'物理必填参数不可静默使用默认值：'+critical.filter(k=>!supplied(k)).join('、'),'ai_scene_invalid');
    requireCondition(Object.values(object.defs||{}).every(x=>typeof x==='string'&&x.length<=1000),400,'依赖表达式过长','ai_scene_invalid');
    return object;
  });
  scene.nextId=Math.max(...scene.objects.map(o=>Number(o.id.slice(1))))+1;
  for(const key of ['display','aids','teaching'])if(input[key]) {
    for(const [name,value] of Object.entries(input[key])) {
      requireCondition(Object.hasOwn(scene[key],name),400,'AI 场景设置不正确','ai_scene_invalid');scene[key][name]=value;
    }
  }
  const particles=scene.objects.reduce((n,o)=>n+(o.kind==='particle'?1:o.kind==='source'?o.count:0),0);
  requireCondition(particles<=120,400,'AI 提案粒子数量过多','ai_scene_invalid');
  validate(scene);
  return scene;
}
function electricWorkEvidence(trace) {
 let workJ=0,kineticChangeJ=0,integralSteps=0;
 const segments=trace.segments.slice(0,60);
 for(const seg of segments) {
  let steps=Math.max(32,Math.ceil(Math.abs(seg.w*seg.dt)*12/Math.PI));
  for(const sine of seg.sines||[])steps=Math.max(steps,Math.ceil(Math.abs(sine.frequency*seg.dt)*12/Math.PI));
  steps=Math.min(512,steps+(steps%2));integralSteps+=steps;
  const power=t=>{const state=segmentState(seg,t);return dot(forcesAt(seg,state.v,t).electric,state.v);};
  let sum=power(0)+power(seg.dt);
  for(let i=1;i<steps;i++)sum+=(i%2?4:2)*power(seg.dt*i/steps);
  workJ+=sum*seg.dt/(steps*3);
  const end=segmentState(seg,seg.dt);kineticChangeJ+=seg.m*(dot(end.v,end.v)-dot(seg.v,seg.v))/2;
 }
 const first=trace.segments[0];
 const scale=Math.max(Math.abs(workJ),Math.abs(kineticChangeJ),first?first.m*dot(first.v,first.v)/2*1e-6:0,1e-25);
 return {electricWorkJ:workJ,kineticChangeJ,relativeResidual:Math.abs(workJ-kineticChangeJ)/scale,segmentsChecked:segments.length,
  totalSegments:trace.segments.length,integralSteps,method:'composite-Simpson-electric-power',sampled:true};
}
// Stored scenes have already crossed the resource permission boundary. Use the
// native migration/validation contract, never the stricter model proposal cap.
export function readStoredScene(input){return checkSnapshot('planar',{scene:input}).scene;}
export function sourceTraceSelection(scene,{traceId,maxTraces=24,allowPartial=false}={}){
 const objects=scene.objects.filter(o=>o.enabled&&['particle','source'].includes(o.kind));
 const total=objects.reduce((n,o)=>n+(o.kind==='particle'?1:o.count),0);
 if(traceId){
  requireCondition(typeof traceId==='string'&&/^o\d+(?::\d+)?$/.test(traceId),400,'粒子实例编号不正确','ai_tool_input');
  const owner=objects.find(o=>o.id===traceId.split(':')[0]),particles=owner?emittedParticles(owner):[];
  const particle=particles.find(p=>p.traceId===traceId)||(!traceId.includes(':')?particles[0]:null);
  requireCondition(particle,422,'没有找到这个启用粒子的轨迹。','ai_tool_input');return {particles:[particle],total,partial:false,selection:'requested'};
 }
 requireCondition(allowPartial||total<=maxTraces,422,`当前包含${total}条启用轨道；一次事件查询最多${maxTraces}条，请指定traceId按轨道查询。`,'ai_tool_limit');
 const particles=[];for(const o of objects){if(particles.length>=maxTraces)break;particles.push(...emittedParticles(o).slice(0,maxTraces-particles.length));}
 return {particles,total,partial:total>particles.length,selection:total>particles.length?'partial':'all'};
}
export function solveSelectedTraces(scene,particles){
 // Keep every resolved input object: field definitions may reference particles
 // outside this query. Select emitted states, rather than deleting scene data.
 const fields=scene.objects.filter(o=>o.enabled&&['field','electric'].includes(o.kind)).map(o=>compileField(o));
 return particles.map(p=>traceParticle(p,fields,scene.duration));
}
function sample(trace,timeUs,{side='after'}={}) {
  const reading=readMotionState(trace,timeUs*1e-6,{side});if(!reading.available)return null;
  const state=reading.state,f=forcesAt(state.segment,state.v,state.local),first=trace.segments[0],initialJ=first.m*dot(first.v,first.v)/2;
  return {timeUs,side:reading.side,endpointOnly:!!reading.endpointOnly,dynamicsAvailable:reading.dynamicsAvailable,
    ...(reading.reason?{reason:reading.reason}:{}),...(reading.boundaryKind?{boundaryKind:reading.boundaryKind,boundaryTimeUs:reading.boundaryTimeUs}:{}),
    xCm:state.p[0]*100,yCm:state.p[1]*100,velocity:state.v,speed:norm(state.v),kineticEV:f.energy/E,workJ:f.energy-initialJ,workScope:'since-emission',
    ...(reading.dynamicsAvailable?{electricForce:f.electric,magneticForce:f.magnetic,totalForce:f.total,forceN:norm(f.total),
      radiusCm:state.segment.r==null?null:state.segment.r*100,magneticPowerW:dot(f.magnetic,state.v)}:{})};
}
function serverRoundoffTolerance(metric,trace,state,scene,value) {
 if(!trace||!state||['forceN','radiusCm','magneticWorkZero'].includes(metric)&&!state.dynamicsAvailable)return 0;
 const initialSpeed=norm(trace.segments[0]?.v||[0,0]),speedScale=Math.max(initialSpeed,state.speed,1e-300);
 const travelCm=speedScale*scene.duration*1e-6*100;
 if(metric==='xCm'||metric==='yCm'){
  const coordinate=metric==='xCm'?'x':'y',coordinateScale=Math.max(Math.abs(trace.particle[coordinate]),Math.abs(value||0),travelCm,1e-300);
  return coordinateScale*1e-10;
 }
 if(metric==='speed')return speedScale*1e-10;
 if(metric==='forceN')return Math.max(norm(state.electricForce)+norm(state.magneticForce),Math.abs(value||0),1e-300)*128*Number.EPSILON;
 if(metric==='magneticWorkZero')return Math.max(norm(state.magneticForce)*state.speed,Math.abs(value||0),1e-300)*128*Number.EPSILON;
 if(metric==='kineticEV')return Math.max(trace.segments[0]?.m*initialSpeed**2/(2*E)||0,state.kineticEV,1e-300)*128*Number.EPSILON;
 if(metric==='radiusCm')return Math.max(Math.abs(state.radiusCm||0),Math.abs(value||0),1e-300)*1e-10;
 return 0;
}
export function auditSceneSync(input,checks=[],{source=false,traceId}={}) {
  const scene=source?readStoredScene(input):buildScene(input),resolved=resolveScene(scene),warnings=resolved.issues.map(i=>i.label+'：'+i.message);
  validate(scene);
  requireCondition(Array.isArray(checks)&&checks.length<=30,400,'物理核验条件数量不正确','ai_scene_invalid');
  const selection=source?sourceTraceSelection(resolved.scene,{traceId,allowPartial:true}):null;
  if(selection?.partial)warnings.push(`仅核验前${selection.particles.length}条，共${selection.total}条启用轨道；其余尚未核验，请指定traceId继续核对。`);
  const traces=resolved.fieldUnavailable?[]:source?solveSelectedTraces(resolved.scene,selection.particles):solveScene(resolved.scene), traceRows=[], violations=[];
  for(const trace of traces) {
    const times=[0,scene.duration*.25,scene.duration*.5,scene.duration*.75,scene.duration];
    const samples=times.map(t=>sample(trace,t,{side:t===scene.duration?'before':'after'})).filter(Boolean);
    for(const s of samples) {
      if([s.xCm,s.yCm,s.speed,s.kineticEV,...(s.dynamicsAvailable?[s.forceN,...s.totalForce]:[])].some(n=>!Number.isFinite(n)))violations.push('轨迹出现非有限数值');
      if(!s.dynamicsAvailable)continue;
      const magneticScale=Math.max(1e-24,norm(s.magneticForce)*s.speed);
      if(Math.abs(s.magneticPowerW)>magneticScale*1e-9)violations.push('磁场力与速度的正交核验失败');
    }
    if(trace.truncated)warnings.push(trace.particle.label+'：轨迹计算被截断，'+(trace.reason||'请减小观察时长'));
    const magneticOnly=scene.objects.filter(o=>o.enabled&&o.kind==='electric').length===0;
    const energyDrift=samples.length?Math.max(...samples.map(s=>Math.abs(s.kineticEV-samples[0].kineticEV)/Math.max(Math.abs(samples[0].kineticEV),1e-12))):0;
    if(magneticOnly && energyDrift>1e-8)violations.push('纯磁场动能守恒核验失败');
    const energyWork=electricWorkEvidence(trace);
    if(energyWork.relativeResidual>0.005)warnings.push(trace.particle.label+'：电场功与动能变化的数值积分核对偏差较大，需缩短时长复核');
    traceRows.push({energyWork,id:trace.particle.traceId,label:trace.particle.label,segments:trace.segments.length,truncated:trace.truncated,
      boundaryCount:trace.segments.filter(s=>s.end==='boundary').length,energyRelativeDrift:energyDrift,
      samples,events:trace.segments.slice(0,60).map(s=>({startUs:(s.t+trace.particle.birth)*1e6,endUs:(s.t+s.dt+trace.particle.birth)*1e6,
        end:s.end,fieldIds:s.fieldIds,positionCm:s.p1?.map(n=>n*100)}))});
  }
  if(!traces.length && scene.objects.some(o=>['particle','source'].includes(o.kind)&&o.enabled))warnings.push('没有可核验的粒子轨迹，请检查场域定义');
  const checksResult=checks.map(check=>{
    requireCondition(check && typeof check.traceId==='string'&&['speed','kineticEV','xCm','yCm','forceN','radiusCm','magneticWorkZero'].includes(check.metric)
      && (check.side===undefined||['before','after'].includes(check.side))&&Number.isFinite(check.timeUs)&&check.timeUs>=0&&check.timeUs<=scene.duration,400,'物理核验指令不正确','ai_scene_invalid');
    const side=check.side||'after',trace=traces.find(t=>t.particle.traceId===check.traceId),s=trace&&sample(trace,check.timeUs,{side}),value=check.metric==='magneticWorkZero'?s?.magneticPowerW:s?.[check.metric];
    requireCondition(Number.isFinite(check.expected)&&Number.isFinite(check.relativeTolerance??0.001)&&(check.relativeTolerance??0.001)>=0&&(check.relativeTolerance??0.001)<=0.05,400,'物理核验预期值不正确','ai_scene_invalid');
    requireCondition(check.absoluteTolerance===undefined||Number.isFinite(check.absoluteTolerance)&&check.absoluteTolerance>=0&&check.absoluteTolerance<=Math.max(Math.abs(check.expected)*0.05,1e-25),400,'绝对核验误差范围不正确','ai_scene_invalid');
    const roundoffTolerance=serverRoundoffTolerance(check.metric,trace,s,scene,value);
    const tolerance=(check.relativeTolerance??.001)*Math.max(Math.abs(check.expected),Math.abs(value||0))+roundoffTolerance;
    const pass=typeof value==='number'&&Number.isFinite(value)&&Math.abs(value-check.expected)<=tolerance;
    const dynamicsMetric=['forceN','radiusCm','magneticWorkZero'].includes(check.metric),reason=!s?'此时刻没有已计算的粒子状态。':dynamicsMetric&&!s.dynamicsAvailable?'该终点没有已计算后侧的合场、受力或回旋半径。':check.metric==='radiusCm'&&value===null?'此运动段没有固定回旋半径。':'';
    return {...check,side,...(reason?{reason}:{}),value:value??null,pass,effectiveTolerance:tolerance,serverRoundoffTolerance:roundoffTolerance,modelAbsoluteToleranceApplied:false};
  });
  if(checksResult.some(c=>!c.pass))violations.push('模型提出的数值结论与原生求解结果不一致');
  const dependencyProbes=[];
  for(const parameter of scene.objects.filter(o=>o.kind==='parameter'&&!o.defs?.value).slice(0,3)) {
    const probe=structuredClone(scene),p=probe.objects.find(o=>o.id===parameter.id),changedFrom=p.value;
    p.value=p.value===0?0.01:p.value*1.01;
    try {
      const result=resolveScene(probe);validate(probe);
      const changedProperties=[];
      for(const o of probe.objects) {
        const before=scene.objects.find(x=>x.id===o.id);
        for(const key of Object.keys(o.defs||{})) {
          const value=key==='position'?[o.x,o.y]:o[key],old=key==='position'?[before.x,before.y]:before[key];
          if(JSON.stringify(value)!==JSON.stringify(old))changedProperties.push({id:o.id,key,before:old??null,after:value??null});
        }
      }
      const motion=result.fieldUnavailable?[]:source?solveSelectedTraces(result.scene,sourceTraceSelection(result.scene,{traceId,allowPartial:true}).particles):solveScene(result.scene);
      dependencyProbes.push({source:parameter.id+'.value',before:changedFrom,after:p.value,changedProperties,issues:result.issues,
        trajectorySamples:motion.slice(0,3).map(t=>({id:t.particle.traceId,start:sample(t,0),end:sample(t,probe.duration,{side:'before'})})),sampled:true});
    } catch(error){dependencyProbes.push({source:parameter.id+'.value',before:changedFrom,after:p.value,error:error.message,sampled:true});}
  }
  return {snapshot:{scene,context:{timeUs:0,sidebar:true,panel:'objects'}},hash:sceneHash({scene}),
    harness:{version:'native-physics/1',schemaValid:true,relationshipsValid:resolved.issues.length===0,issues:resolved.issues,
      ...(source?{validationMode:'stored-source',partial:selection.partial,traceScope:{selection:selection.selection,total:selection.total,computed:traces.length,uncomputed:selection.total-traces.length,traceIds:traces.map(t=>t.particle.traceId),timeRangeUs:{start:0,end:scene.duration}}}:{}),
      traces:traceRows,dependencyProbes,checks:checksResult,warnings,violations:[...new Set(violations)],
      passed:resolved.issues.length===0&&!warnings.length&&!violations.length,limitations:['有限采样可核对数值和轨迹，不能证明题设正确或任意参数下的解析结论。',...(source&&selection.selection==='requested'&&selection.total>1?['本次仅核验指定轨道，其他轨道不在本次核验范围内。']:[])]}}
}
export async function auditScene(input,checks=[],{timeoutMs=12000,signal,source=false,traceId}={}) {
  if(signal?.aborted)throw new HTTPError(499,'已取消物理核验','ai_cancelled');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./ai-harness-worker.mjs',import.meta.url),{workerData:{input,checks,options:{source,traceId}},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:96}});
    let finished=false;
    const finish=(error,result)=>{
      if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();
      error?reject(error):resolve(result);
    };
    const abort=()=>finish(new HTTPError(499,'已取消物理核验','ai_cancelled'));
    const timer=setTimeout(()=>finish(new HTTPError(422,'场景计算超过 12 秒，请简化场域或缩短时长','ai_harness_timeout')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    worker.once('message',message=>finish(message.ok?null:new HTTPError(422,message.error,'ai_scene_invalid'),message.result));
    worker.once('error',()=>finish(new HTTPError(422,'场景验证失败，请简化后重试','ai_scene_invalid')));
    worker.once('exit',()=>{if(!finished)finish(new HTTPError(422,'场景核验进程意外结束','ai_scene_invalid'));});
  });
}
