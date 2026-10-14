import {createObject,validate} from './planar-model.mjs';
import {createResolver,resolveScene,setDefinition,canonicalExpression} from './planar-relations.mjs';
import {toNative} from './planar-expressions.mjs';

/** Measurements are ordinary typed definitions, so they can drive later geometry. */
export function measurementOptions(object){
 if(!object)return [];
 const id=object.id,options=[];
 const region=['circle','polygon'].includes(object.kind)||['field','electric'].includes(object.kind)&&['circle','annulus','rectangle','triangle','polygon'].includes(object.shape);
 if(region)options.push({key:'area',name:'面积',symbol:'S',unit:'cm2',expression:`area(${id})`},{key:'perimeter',name:'周长',symbol:'L',unit:'cm',expression:`perimeter(${id})`});
 if(object.kind==='ruler'||object.kind==='line'&&object.lineType==='segment')options.push({key:'length',name:'线段长',symbol:'l',unit:'cm',expression:`distance(${id}.point0, ${id}.point1)`});
 if(object.kind==='angle')options.push({key:'angle',name:'夹角',symbol:'\\theta',unit:'deg',expression:`acos(max(-1, min(1, dot(unit(vector(${id}.point1, ${id}.point0)), unit(vector(${id}.point1, ${id}.point2))))))`});
 return options;
}

export function readMeasurements(scene,id){
 const options=measurementOptions(scene.objects.find(o=>o.id===id));if(!options.length)return [];
 const resolver=createResolver(scene);
 return options.map(option=>{
  try{return {...option,value:toNative(resolver.evaluate(option.expression),option.unit),defined:true};}
  catch(error){return {...option,defined:false,reason:error.message};}
 });
}

export function addMeasurementParameter(scene,id,key){
 const source=scene.objects.find(o=>o.id===id),option=measurementOptions(source).find(item=>item.key===key);
 if(!option)throw Error('这个对象没有所选测量量。');
 const expression=canonicalExpression(scene,option.expression),value=toNative(createResolver(scene).evaluate(expression),option.unit);
 const existing=scene.objects.find(o=>o.kind==='parameter'&&o.unit===option.unit&&o.defs?.value===expression);
 if(existing)return {id:existing.id,created:false,sourceId:id,...option};
 const before=structuredClone(scene);
 try{
  scene.nextId=Math.max(Number.isInteger(scene.nextId)?scene.nextId:1,...scene.objects.map(o=>Number(o.id.slice(1))+1));
  const parameter=createObject('parameter','o'+scene.nextId++);parameter.value=value;parameter.unit=option.unit;parameter.label=option.symbol+'_{'+id.slice(1)+'}';
  while(scene.objects.some(o=>o.label===parameter.label))parameter.label+="'";
  scene.objects.push(parameter);setDefinition(scene,parameter.id,'value',expression);resolveScene(scene);validate(scene);
  return {id:parameter.id,created:true,sourceId:id,...option};
 }catch(error){Object.assign(scene,before);throw error;}
}
