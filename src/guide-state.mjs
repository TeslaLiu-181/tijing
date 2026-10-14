import {topics,initialParameters,parameterDefinitions,parameterOf} from './guide-curriculum.mjs';

export function encodeState(state,camera){
 return {format:'tijing-ampere-guide',version:2,savedAt:new Date().toISOString(),topic:state.topic.id,question:state.question,mode:state.mode,params:{...state.params},part:state.part,camera};
}
export function decodeState(value){
 if(!value||value.format!=='tijing-ampere-guide'||value.version!==2)throw Error('这不是当前版本的备课状态文件。');
 const topic=topics.find(t=>t.id===value.topic);if(!topic)throw Error('状态文件中的题号不存在。');
 const question=value.question;if(!Number.isInteger(question)||question<0||question>=topic.questions.length)throw Error('状态文件中的小问编号无效。');
 if(!['lesson','explore'].includes(value.mode))throw Error('状态文件中的模式无效。');
 const baseline=initialParameters(topic,question),params={...baseline};
 if(!value.params||typeof value.params!=='object')throw Error('缺少备课参数。');
 for(const key of Object.keys(baseline)){
  const v=value.params[key];if(typeof v!=='number'||!Number.isFinite(v))throw Error(`参数 ${key} 无效。`);
  if(key==='polarity'){if(v!==1&&v!==-1)throw Error('电源极性无效。');}
  else if(key==='parallelField'){if(v!==0&&v!==1)throw Error('场向设置无效。');}
  else if(!topic.controls.includes(key)){if(v!==baseline[key])throw Error(`固定参数 ${key} 不匹配。`);}
  else if(parameterDefinitions[key]){const d=parameterOf(topic,key);if(v<d.min-1e-7||v>d.max+1e-7)throw Error(`参数 ${key} 超出允许范围。`);}
  else if(v!==baseline[key])throw Error(`固定参数 ${key} 不匹配。`);
  params[key]=v;
 }
 const part=value.part;if(!Number.isInteger(part)||part<0||part>=topic.parts.length)throw Error('电流元选择无效。');
 const c=value.camera;if(!c||!['ortho','perspective'].includes(c.projection)||!['source','free','plane','top','left'].includes(c.view))throw Error('相机设置无效。');
 for(const key of ['position','up','target'])if(!Array.isArray(c[key])||c[key].length!==3||c[key].some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>60))throw Error('相机坐标超出允许范围。');
 const distance=Math.hypot(...c.position.map((v,i)=>v-c.target[i])),upLength=Math.hypot(...c.up);
 if(distance<.1||upLength<.1||typeof c.zoom!=='number'||c.zoom<.25||c.zoom>6)throw Error('相机距离或缩放无效。');
 return {topic,question,mode:value.mode,params:value.mode==='lesson'?baseline:params,part,camera:{projection:c.projection,view:c.view,position:[...c.position],up:[...c.up],target:[...c.target],zoom:c.zoom,focused:!!c.focused}};
}
