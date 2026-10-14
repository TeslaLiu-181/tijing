import {properties,targets,bindingKey,createResolver,resolveScene} from './planar-relations.mjs';
import {constructionOwns} from './planar-geometry.mjs';
import {geometryToolSchema} from './planar-constructions.mjs';
import {toNative} from './planar-expressions.mjs';
const regionKey=key=>['position','x','y','radius','width','height','angle'].includes(key)||/^point\d+(?:[xy])?$/.test(key);
function activeKeys(o){
 const keys=new Set(),add=(...values)=>values.forEach(v=>keys.add(v));
 if(o.kind==='parameter')add('value');
 if(['particle','source'].includes(o.kind))add('mass','charge','speed','heading','x','y','position');
 if(o.kind==='source'){add('count','spread','speedSpan','interval');if(o.sourceType==='line')add('length','angle');if(o.sourceType==='circle')add('radius','angle');if(o.sourceType==='rectangle')add('width','height','angle');}
 if(['field','electric'].includes(o.kind)){
  add(o.kind==='electric'?'E0':'B');if(o.kind==='electric')add('fieldAngle');if(o.waveform!=='dc')add('period','phase');
  if(['circle','annulus','semicircle','sector'].includes(o.shape))add('radius');if(o.shape==='annulus')add('innerRadius');
  if(['rectangle','triangle','strip'].includes(o.shape))add('width');if(['rectangle','triangle'].includes(o.shape))add('height');
  if(o.shape==='sector')add('sectorAngle');if(!['circle','annulus','infinite','polygon'].includes(o.shape))add('angle');
  if(!['infinite','polygon'].includes(o.shape))add('x','y','position');
 }
 if(o.kind==='point'||o.kind==='circle')add('x','y','position');if(o.kind==='circle')add('radius');
 const schema=geometryToolSchema().find(t=>t.id===o.construction?.type);for(const param of schema?.parameters||[])add(param.key);
 for(const key of Object.keys(o))if(/^pathT\d*$/.test(key))add(key);
 if(o.points){for(let i=0;i<o.points.length;i++)add('point'+i+'x','point'+i+'y','point'+i);}
 if(o.kind==='polygon')add('area','perimeter');
 return [...keys];
}
function closure(map,id){const found=new Set(),pending=[...(map.get(id)||[])];while(pending.length){const next=pending.shift();if(next===id||found.has(next))continue;found.add(next);pending.push(...(map.get(next)||[]));}return [...found];}
function parameterInfo(o,key,resolver){
 const spec=properties(o)[key]||targets(o)[key];if(!spec)return null;
 const vector=key==='position'||/^point\d+$/.test(key),definition=bindingKey(o,key),componentKeys=vector?(key==='position'?['x','y']:[key+'x',key+'y']):[],componentDefinitions=Object.fromEntries(componentKeys.filter(k=>o.defs?.[k]).map(k=>[k,o.defs[k]])),byConstruction=constructionOwns(o,key),byRegion=!!o.regionSource&&regionKey(key),readOnly=!!spec.readOnly;
 const derivedPosition=key==='position'&&!!o.points,definitionEditable=!readOnly&&!byConstruction&&!byRegion&&!derivedPosition;
 let currentValue=null,defined=true,error;
 try{const value=resolver.get(o.id,key);currentValue=vector?value.p.map(v=>v*100):toNative(value,spec.unit||'');}catch(cause){defined=false;error=cause.message;}
 return {key,name:spec.name,unit:spec.unit||'',valueType:vector?'vector':'scalar',currentValue,defined,
  editable:!vector&&!readOnly&&!byConstruction&&!byRegion&&!definition&&!Object.keys(componentDefinitions).length,
  definitionEditable,definitionTarget:definition||key,definitionTargetValueType:definition==='position'||/^point\d+$/.test(definition||key)?'vector':'scalar',readOnly,byDefinition:definition,byConstruction,byRegion,
  ...(definition?{expression:o.defs[definition]}:{}),...(Object.keys(componentDefinitions).length?{componentDefinitions,definitionEditReplaces:componentKeys}:{}),...(derivedPosition?{controlNote:'中心位置由端点派生，不能直接定义。'}:{}),...(error?{error}:{})};
}

/** Geometry-only metadata; the caller supplies the authorized saved scene. */
export function inspectSceneControls(input,{objectIds,maxObjects=30,maxBytes=65536,header={}}={}){
 const scene=structuredClone(input),resolution=resolveScene(scene),resolver=createResolver(scene),allIds=scene.objects.map(o=>o.id),filtered=objectIds!==undefined;
 if(filtered&&(!Array.isArray(objectIds)||!objectIds.length||objectIds.length>20||new Set(objectIds).size!==objectIds.length||objectIds.some(id=>typeof id!=='string'||!/^o\d+$/.test(id)||!allIds.includes(id))))throw Error('对象筛选须为本轮场景内1–20个有效、不重复的对象ID。');
 const selected=filtered?objectIds:allIds,objects=[],inspections=[];
 const result={...header,objectCount:allIds.length,returnedCount:0,limited:false,remainingIds:[],objects,inspections,method:'native-source-geometry-inspection',limitations:['仅检查本轮授权保存场景；不读取其他资源，也未计算物理轨迹。','raw objects保留存档和最后有限缓存；有效当前数值须以inspections.parameters的defined/currentValue为准。','参数清单限当前几何和物理界面有明确用途的目标；显示样式不是物理自由量。','依赖关系为对象级聚合；对象图回边本身不证明属性循环，请查看实际issues。']};
 const baseNote=header.note||'raw对象数值可能是最后有限缓存，不代表未定义几何的当前值。';
 const updateEnvelope=count=>{
  result.returnedCount=count;result.remainingIds=filtered?[]:selected.slice(count);result.limited=result.remainingIds.length>0;
  result.note=baseNote+(result.limited?' 本轮详细信息已达到载荷上限，请用objectIds继续读取remainingIds；未返回对象不代表不存在。':'');
 };
 const bytes=()=>new TextEncoder().encode(JSON.stringify(result)).byteLength;
 updateEnvelope(0);
 for(const id of selected){
  if(!filtered&&objects.length>=maxObjects)break;
  const o=scene.objects.find(o=>o.id===id),raw=JSON.parse(JSON.stringify(input.objects.find(o=>o.id===id))),info={id,label:o.label,kind:o.kind,defined:o._defined!==false,issues:resolution.issues.filter(i=>i.id===id),construction:o.construction?{type:o.construction.type,inputs:[...o.construction.inputs],...(o.construction.group?{group:o.construction.group,branch:o.construction.branch}:{})}:null,regionSource:o.regionSource||null,dependencies:{level:'objects',directUpstream:[...(resolver.graph.parents.get(id)||[])],directDownstream:[...(resolver.graph.children.get(id)||[])],upstream:closure(resolver.graph.parents,id),downstream:closure(resolver.graph.children,id)},parameters:activeKeys(o).map(key=>parameterInfo(o,key,resolver)).filter(Boolean)};
  objects.push(raw);inspections.push(info);updateEnvelope(objects.length);
  // Count the entire DTO, including unreturned IDs and caller-owned title/units.
  // Never shorten an expression or partially return one object's metadata.
  if(bytes()>maxBytes){
   if(filtered)throw Error('所选对象完整控制信息超过64KiB，请减少objectIds后重试；不会截断参数或表达式。');
   objects.pop();inspections.pop();updateEnvelope(objects.length);break;
  }
 }
 if(bytes()>maxBytes)throw Error('当前场景摘要超过64KiB，请用objectIds缩小请求。');
 return result;
}
