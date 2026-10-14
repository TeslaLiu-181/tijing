import {kinds} from '../planar-model.mjs';

const events={initial:'初态',birth:'发射',enter:'进场',exit:'出场',switch:'交变场换向',boundary:'场域边界', 'vx-zero':'水平速度为零','vy-zero':'竖直速度为零'};
const fail=message=>{throw Error(message);};

/** Location-only questions. Selected labels and time never become invented readings. */
export function buildSceneQuestion(snapshot,input){
 const scene=snapshot?.scene;if(!Array.isArray(scene?.objects)||!Number.isFinite(scene.duration)||scene.duration<=0)fail('请先打开有效的平面场景。');
 if(!input||!['object','trajectory','event'].includes(input.kind))fail('不支持的场景提问类型。');
 const side=input.side??snapshot.context?.readingSide??'after';if(!['before','after'].includes(side))fail('取样侧只能是前侧或后侧。');
 const requestedTime=input.timeUs??snapshot.context?.timeUs??0,tolerance=32*Number.EPSILON*Math.max(scene.duration,Math.abs(requestedTime));
 if(!Number.isFinite(requestedTime)||requestedTime< -tolerance||requestedTime>scene.duration+tolerance)fail('提问时刻超出当前场景观察范围。');
 const timeUs=Math.max(0,Math.min(scene.duration,requestedTime));let objectId=input.objectId,traceId,index;
 if(input.kind!=='object'){
  if(typeof input.traceId!=='string')fail('请明确选择本场景的一条轨迹。');
  const match=input.traceId.match(/^(o\d+)(?::(0|[1-9]\d*))?$/);if(!match)fail('轨迹编号不正确。');
  if(objectId!==undefined&&objectId!==match[1])fail('轨迹与选中对象不属于同一实例。');objectId=match[1];traceId=input.traceId;index=match[2]===undefined?null:Number(match[2]);
 }
 const object=scene.objects.find(object=>object.id===objectId);if(!object||!Object.hasOwn(kinds,object.kind)||typeof object.label!=='string')fail('当前场景中没有这个对象。');
 if(traceId){
  if(object.enabled===false)fail('这个对象未启用，没有当前可用轨迹。');
  if(object.kind==='particle'){if(index!==null)fail('单粒子的轨迹编号不能包含源实例序号。');}
  else if(object.kind==='source'){if(index===null||!Number.isInteger(object.count)||object.count<1||object.count>100||index>=object.count||!Number.isFinite(object.interval)||object.interval<0)fail('粒子源实例超出当前发射范围。');}
  else fail('只有粒子或粒子源实例可以提问轨迹。');
 }
 if(input.kind==='event'&&!Object.hasOwn(events,input.eventKind))fail('请从实际时间轴选择受支持的事件类型。');
 let field;if(input.fieldId!==undefined){if(input.kind!=='event'||!['enter','exit','switch','boundary'].includes(input.eventKind))fail('此类节点不指定场域。');field=scene.objects.find(object=>object.id===input.fieldId);if(!field||!['field','electric'].includes(field.kind))fail('当前场景没有这个关联场域。');}
 const label=object.label.replace(/\s+/g,' ').trim()||object.id,who=traceId?(index===null?label+' 的轨迹 ['+traceId+']':label+' 的第 '+(index+1)+' 条实例轨迹 ['+traceId+']'):kinds[object.kind]+' '+label+' ['+object.id+']';
 const contextLabel=who+' · '+timeUs+' μs · '+(side==='before'?'前侧':'后侧')+(field?' · '+kinds[field.kind]+' '+field.label+' ['+field.id+']':''),selection={kind:input.kind,objectId:object.id,...(traceId?{traceId}:{}),timeUs,side,...(input.kind==='event'?{eventKind:input.eventKind}:{}),...(field?{fieldId:field.id}:{})};
 const scope='定位：'+contextLabel+'。';let question;
 if(input.kind==='object')question='请依据当前模型解释这个对象的构造输入、依赖关系与仍可自由调节的量，标明参数单位，并说明应该修改哪个输入来观察变化。不要把演示设置当成题设条件。';
 else if(input.kind==='trajectory')question='请用原生运动工具核查这条轨迹在所选时刻和取样侧的速度、方向与受力，并解释各场的作用和适用条件。先检查实例是否已发射、轨迹是否已计算到这里；没有证据时说明不可用，不编造读数。';
 else question='已选择“'+events[input.eventKind]+'”节点。请先核查原生事件记录，再比较此时刻前后两侧的速度、受力、参与场域及运动规律。若事件未被原生记录证实或后续轨迹尚未计算，保留待确认，不仅凭线条推测数值。';
 return {prompt:scope+'\n'+question,contextLabel,selection};
}
