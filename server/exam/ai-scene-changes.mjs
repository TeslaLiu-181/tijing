import {properties,bindingKey} from '../../src/planar-relations.mjs';
import {constructionOwns} from '../../src/planar-geometry.mjs';
import {kinds} from '../../src/planar-model.mjs';

function keysFor(o){
  const keys=['label','enabled',...(o.style?['style']:[])];
  if(o.kind==='parameter')return [...keys,'value','unit'];
  if(o.kind==='particle'||o.kind==='source')keys.push('x','y','mass','charge','speed','heading');
  if(o.kind==='source')keys.push('sourceType','count','spread','speedSpan','interval','radius','length','width','height','angle');
  if(o.kind==='field'||o.kind==='electric'){
    keys.push('shape','regionSource',o.kind==='field'?'B':'E0');if(o.kind==='electric')keys.push('fieldAngle');keys.push('waveform');
    if(o.waveform!=='dc')keys.push('period','phase');
    if(o.shape!=='infinite')keys.push('x','y');
    if(['circle','annulus','semicircle','sector'].includes(o.shape))keys.push('radius');if(o.shape==='annulus')keys.push('innerRadius');
    if(['rectangle','triangle','strip'].includes(o.shape))keys.push('width');
    if(['rectangle','triangle'].includes(o.shape))keys.push('height');
    if(o.shape==='polygon')keys.push('points');if(o.shape==='sector')keys.push('sectorAngle');
    if(!['circle','annulus','infinite','polygon'].includes(o.shape))keys.push('angle');
  }
  if(['point','circle','label'].includes(o.kind))keys.push('x','y');
  if(o.kind==='circle')keys.push('radius');
  if(o.points)keys.push('points');
  if(o.construction)keys.push('construction',...Object.keys(properties(o)).filter(key=>['count','index','angle','factor'].includes(key)||/^pathT\d*$/.test(key)));
  return [...new Set(keys)];
}
const objectInfo=o=>({id:o.id,label:o.label,kind:o.kind,kindLabel:kinds[o.kind]||o.kind});
const named={style:'绘图样式',label:'标注',enabled:'参与仿真',shape:'区域形状',regionSource:'区域依赖',waveform:'场随时间变化',points:'几何顶点',construction:'构造关系',unit:'单位',sourceType:'发射范围'};
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const same=(a,b)=>JSON.stringify(stable(a??null))===JSON.stringify(stable(b??null));
// Solver continuity anchors change during recomputation without changing the
// user's construction. Keep them out of the reviewable parameter comparison.
function valueFor(o,key){if(key!=='construction'||!o.construction)return o[key]??null;const {memory,permutation,...definition}=o.construction;return definition;}
function newInfo(o){const meta=properties(o);return {...objectInfo(o),fields:keysFor(o).filter(key=>key!=='label').map(key=>({key,label:meta[key]?.name||named[key]||key,after:valueFor(o,key),unit:meta[key]?.unit||''})),definitions:o.defs||{}};}

export function sceneChanges(before,after){
  const old=new Map((before?.objects||[]).map(o=>[o.id,o])),next=new Map((after?.objects||[]).map(o=>[o.id,o]));
  const added=[],removed=[],changed=[];
  for(const [id,o] of next){
    const prior=old.get(id);if(!prior||prior.kind!==o.kind){added.push(newInfo(o));if(prior)removed.push(objectInfo(prior));continue;}
    const fields=[],meta={...properties(prior),...properties(o)};
    for(const key of new Set([...keysFor(prior),...keysFor(o)]))if(!same(valueFor(prior,key),valueFor(o,key)))fields.push({key,label:meta[key]?.name||named[key]||key,before:valueFor(prior,key),after:valueFor(o,key),unit:meta[key]?.unit||'',derived:!!bindingKey(o,key)||constructionOwns(o,key)||!!o.regionSource&&['x','y','radius','points'].includes(key)});
    for(const key of new Set([...Object.keys(prior.defs||{}),...Object.keys(o.defs||{})]))if(!same(prior.defs?.[key],o.defs?.[key]))fields.unshift({key:'defs.'+key,label:(meta[key]?.name||key)+'的依赖',before:prior.defs?.[key]??null,after:o.defs?.[key]??null,unit:'',definition:true});
    if(fields.length)changed.push({...objectInfo(o),fields});
  }
  for(const [id,o] of old)if(!next.has(id))removed.push(objectInfo(o));
  return {hasBaseline:!!before,scope:'geometry-physics-definitions',added,removed,changed,duration:!same(before?.duration,after?.duration)?{before:before?.duration??null,after:after?.duration,unit:'μs'}:null};
}
