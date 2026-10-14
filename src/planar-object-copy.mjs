import {validate} from './planar-model.mjs';
import {resolveScene,cloneDefinitions} from './planar-relations.mjs';

export const hasObjectDependencies=object=>!!object?.construction||!!object?.regionSource||Object.keys(object?.defs||{}).length>0;

/** Read a resolved instant without changing the original construction. */
export function snapshotObject(scene,id){
 const candidate=structuredClone(scene);resolveScene(candidate);const object=candidate.objects.find(o=>o.id===id);
 if(!object)throw Error('没有找到要复制的对象。');
 if(object._error)throw Error('对象当前暂未定义，不能把旧坐标作为独立快照复制。');
 const copy=structuredClone(object);copy.defs={};if(copy.construction)copy.construction=null;if(copy.regionSource)copy.regionSource='';
 return copy;
}

function copyLabel(scene,object){
 // A standalone annotation is content, not a variable name to which a prime applies.
 if(object.kind==='label')return object.label;
 let label=object.label+"'";
 if(label.length<=60){while(scene.objects.some(o=>o.label===label)&&label.length<60)label+="'";if(!scene.objects.some(o=>o.label===label))return label;}
 let index=1;do{label='C_{'+object.id.slice(1)+'}^{'+index+++'}';}while(scene.objects.some(o=>o.label===label));return label;
}

/** A linked copy stays on its inputs. Only an independent snapshot can be placed. */
export function insertObjectCopy(scene,source,{position}={}){
 if(!source)throw Error('请选择要复制的对象。');
 if(position!==undefined&&(!Array.isArray(position)||position.length!==2||position.some(n=>!Number.isFinite(n))))throw Error('副本位置须为有限二维坐标。');
 if(position!==undefined&&hasObjectDependencies(source))throw Error('受关系控制的对象请选择独立快照后再放置。');
 const before=structuredClone(scene);
 try{
  scene.nextId=Math.max(Number.isInteger(scene.nextId)?scene.nextId:1,...scene.objects.map(o=>Number(o.id.slice(1))+1));
  const copy=structuredClone(source),oldId=source.id;copy.id='o'+scene.nextId++;copy.label=copyLabel(scene,copy);cloneDefinitions(copy,oldId);
  // Paired intersection/tangent history belongs to this new branch, not the original pair.
  if(copy.construction&&['intersection','tangent'].includes(copy.construction.type))copy.construction.group='g'+copy.id.slice(1);
  if(position){const delta=position.map((value,index)=>value-[source.x,source.y][index]);copy.x=position[0];copy.y=position[1];if(copy.points)copy.points=copy.points.map(point=>point.map((value,index)=>value+delta[index]));}
  scene.objects.push(copy);resolveScene(scene);validate(scene);return {id:copy.id,object:copy,linked:hasObjectDependencies(copy),defined:!copy._error};
 }catch(error){Object.assign(scene,before);throw error;}
}
