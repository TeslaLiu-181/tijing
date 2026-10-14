import {esc} from './web-ui.mjs';
import {tex} from '../lorentz-math.mjs';

const statuses={running:'正在进行',completed:'完成',failed:'未完成',cancelled:'已停止'};
const seconds=(start,end)=>{const n=Math.max(0,(Date.parse(end||new Date().toISOString())-Date.parse(start))/1000);return Number.isFinite(n)?n<1?'<1秒':n<60?Math.round(n)+'秒':Math.floor(n/60)+'分'+Math.round(n%60)+'秒':'';};
const number=value=>Number.isFinite(value)?value!==0&&(Math.abs(value)<.001||Math.abs(value)>=1e6)?value.toExponential(3):String(Number(value.toPrecision(6))):'—';
export const hasSourcePreview=job=>['completed','applied'].includes(job?.status)&&!['hints','disabled'].includes(job.aiPolicy)&&!job.result?.review?.hintsOnly&&job.result?.sourcePreview?.kind==='planar'&&Array.isArray(job.result.sourcePreview.snapshot?.scene?.objects);
function jump(job,timeUs,traceId,side,label='在本轮场景中查看'){return hasSourcePreview(job)&&Number.isFinite(timeUs)?'<button type="button" class="ai-native-jump" data-ai-source-preview="'+esc(job.id)+'" data-ai-source-time="'+esc(timeUs)+'"'+(traceId?' data-ai-source-trace="'+esc(traceId)+'"':'')+(['before','after'].includes(side)?' data-ai-source-side="'+side+'"':'')+'>'+esc(label)+' ↗</button>':'';}
function eventJump(job,event){
 if(!hasSourcePreview(job))return '';
 if(['enter','exit','switch','boundary'].includes(event.kind)&&('beforeSegmentIndex' in event||'afterSegmentIndex' in event))return (Number.isInteger(event.beforeSegmentIndex)?jump(job,event.timeUs,event.traceId,'before','前侧查看'):'<small class="ai-reading-endpoint">前侧未计算</small>')+(Number.isInteger(event.afterSegmentIndex)?jump(job,event.timeUs,event.traceId,'after','后侧查看'):'<small class="ai-reading-endpoint">后侧未计算</small>');
 return jump(job,event.timeUs,event.traceId,'after');
}
function readingScope(reading){const side=reading.side==='before'?'前侧':reading.side==='after'?'后侧':null;return '<small class="ai-reading-side">'+esc(side?(reading.available?'取样：':'请求：')+side:'取样侧未记录')+'</small>'+(reading.endpointOnly?'<small class="ai-reading-endpoint">仅终点状态</small>':'')+(reading.dynamicsAvailable===false&&reading.available?'<small class="ai-reading-endpoint">后侧场/力未计算</small>':'');}
function eventLabel(event){const label=event.label||(event.kind==='vx-zero'?'vx=0':event.kind==='vy-zero'?'vy=0':event.kind||'未命名事件');return esc(label)+(['vx-zero','vy-zero'].includes(event.kind)?'<small>'+esc(event.kind==='vx-zero'?'横向速度分量 vx':'纵向速度分量 vy')+'</small>':'');}
function nativeScope(value){const scope=value.traceScope,range=value.rangeUs;return '<p class="ai-native-scope">'+[scope&&Number.isFinite(scope.computed)&&Number.isFinite(scope.total)?'本次读取 '+scope.computed+' / '+scope.total+' 条轨道':'',range&&Number.isFinite(range.start)&&Number.isFinite(range.end)?'范围 '+number(range.start)+'–'+number(range.end)+' μs':'',value.truncated?'该轨道尚未计算到观察终点':'',value.limited?'事件列表已按工具上限截取':''].filter(Boolean).map(esc).join(' · ')+'</p>';}
const inspectionKinds={particle:'粒子',source:'粒子源',field:'磁场',electric:'电场',point:'点',line:'线',circle:'圆',polygon:'多边形',parameter:'自由参数',ruler:'直尺',angle:'量角器',label:'标注'};
const inspectionUnits={speed:'10⁵ m/s',us:'μs',deg:'°',cm2:'cm²',m2:'m²'};
function inspectionLabel(value){const label=String(value??'');if(label.length<=120&&/[\\_^]/.test(label))try{return tex(label);}catch{}return esc(label);}
function inspectionCount(value){
 const returned=Number.isInteger(value.returnedCount)?value.returnedCount:value.objects?.length??value.inspections?.length??0,total=Number.isInteger(value.objectCount)?value.objectCount:null;
 return '详细读取 '+returned+(total===null?' 个对象 · 场景总数未记录':' / '+total+' 个对象')+(value.limited?' · 返回范围受限':'');
}
function inspectionControl(parameter){
 const definition=!!parameter.byDefinition||Object.keys(parameter.componentDefinitions||{}).length>0;
 const control=parameter.byRegion?['区域控制','region']:parameter.byConstruction?['构造控制','construction']:definition?['依赖定义','definition']:parameter.readOnly?['派生读数','derived']:parameter.editable?['可直接改数值','editable']:parameter.controlNote?['端点派生','derived']:['不能直接改数值','derived'];
 return '<span class="ai-inspection-control is-'+control[1]+'">'+control[0]+'</span>'+(parameter.definitionEditable?'<small>'+(parameter.definitionTargetValueType==='vector'?'可改位置定义':'可改标量定义')+'</small>':'');
}
function inspectionValue(parameter){
 if(parameter.defined!==true||parameter.currentValue===null||parameter.currentValue===undefined)return '<span class="ai-inspection-unavailable">当前未定义</span>';
 const value=parameter.currentValue;
 return parameter.valueType==='vector'&&Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)?esc('('+value.map(number).join(', ')+')'):typeof value==='number'&&Number.isFinite(value)?esc(number(value)):'<span class="ai-inspection-unavailable">无有效读数</span>';
}
function inspectionOutput(event,job){
 const value=event.output;if(!Array.isArray(value.inspections))return '';
 const names=new Map();for(const object of [...(job.result?.sourcePreview?.snapshot?.scene?.objects||[]),...(value.objects||[]),...value.inspections])if(object.id&&object.label)names.set(object.id,object.label);
 const reference=id=>names.has(id)?inspectionLabel(names.get(id)):'名称未在本次返回';
 const references=ids=>{if(!Array.isArray(ids))return '未记录';if(!ids.length)return '无';const labels=ids.filter(id=>names.has(id)).map(id=>inspectionLabel(names.get(id))),unknown=ids.length-labels.length;return [...labels,...(unknown?[unknown+' 个对象的名称未返回']:[])].join('、');};
 const cards=value.inspections.map(object=>{
  const issues=(object.issues||[]).map(issue=>typeof issue==='string'?issue:issue.message).filter(Boolean),defined=object.defined===true?'已定义':object.defined===false?'当前未定义':'状态未记录';
  const rows=(object.parameters||[]).map(parameter=>'<tr><th scope="row">'+esc(parameter.name||'未命名参数')+(parameter.unit?'<small>'+esc(inspectionUnits[parameter.unit]||parameter.unit)+'</small>':'')+'</th><td>'+inspectionValue(parameter)+(parameter.error?'<small class="ai-inspection-error">'+esc(parameter.error)+'</small>':'')+'</td><td>'+inspectionControl(parameter)+(parameter.controlNote?'<small>'+esc(parameter.controlNote)+'</small>':'')+'</td></tr>').join('');
  return '<details class="ai-inspection-object" data-ai-preserve="inspection-'+esc(job.id)+'-'+esc(event.id)+'-'+esc(object.id)+'"'+(object.defined===false?' open':'')+'><summary><strong>'+inspectionLabel(object.label||'未命名对象')+'</strong><span>'+esc(inspectionKinds[object.kind]||'对象')+'</span><small class="ai-inspection-status '+(object.defined===false?'is-undefined':'')+'">'+defined+'</small></summary><div class="ai-inspection-body">'+(issues.length?'<ul class="ai-inspection-issues">'+issues.map(issue=>'<li>'+esc(issue)+'</li>').join('')+'</ul>':'')+'<dl class="ai-inspection-dependencies">'+(object.construction?'<div><dt>构造输入</dt><dd>'+references(object.construction.inputs)+'</dd></div>':'')+(object.regionSource?'<div><dt>绑定区域</dt><dd>'+reference(object.regionSource)+'</dd></div>':'')+'<div><dt>直接上游</dt><dd>'+references(object.dependencies?.directUpstream)+'</dd></div><div><dt>直接下游</dt><dd>'+references(object.dependencies?.directDownstream)+'</dd></div></dl>'+(rows?'<div class="ai-inspection-table-scroll" tabindex="0" aria-label="'+esc((object.label||'对象')+'的参数控制表')+'"><table class="ai-inspection-table"><thead><tr><th>参数</th><th>当前值</th><th>修改方式</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="ai-inspection-empty">本次没有返回可确认的几何或物理参数；显示样式不列作物理自由量。</p>')+'</div></details>';
 }).join('');
 return '<div class="ai-native-card ai-inspection-card"><div class="ai-native-card-heading"><strong>对象与参数控制</strong></div><p class="ai-native-scope">'+esc(inspectionCount(value))+'</p>'+(value.limited?'<p class="ai-inspection-limit">'+esc(Array.isArray(value.remainingIds)?'还有 '+value.remainingIds.length+' 个对象未返回详细信息；可继续指定对象读取。':'部分对象未返回详细信息。')+'</p>':'')+'<div class="ai-inspection-list">'+(cards||'<p class="ai-inspection-empty">本次没有返回对象详细条目。</p>')+'</div><p class="ai-native-rounding">数值来自原生依赖解析，未计算运动轨迹。当前未定义时不使用存档缓存；显示值保留有效数字，完整关系和原始数值可展开下方 JSON。</p></div>';
}
function nativeOutput(event,job){
 const value=event.output;if(!value||event.type!=='tool')return '';
 if(event.name==='inspect_scene')return inspectionOutput(event,job);
 if(event.name==='query_motion'&&Array.isArray(value.readings))return '<div class="ai-native-card"><div class="ai-native-card-heading"><strong>原生运动读数</strong><span>'+esc(value.traceId||'')+'</span></div>'+nativeScope(value)+'<div class="ai-native-table-scroll" tabindex="0" aria-label="原生运动数值表"><table class="ai-native-table ai-native-motion"><thead><tr><th>t / μs</th><th>位置 / cm</th><th>速度 / m·s⁻¹</th><th>K / eV</th></tr></thead><tbody>'+value.readings.map(reading=>'<tr class="'+(reading.available?'':'unavailable')+'"><th scope="row">'+esc(number(reading.timeUs))+readingScope(reading)+(reading.available?jump(job,reading.timeUs,value.traceId,reading.side):'')+'</th>'+(reading.available?'<td class="ai-native-components"><span>x <b>'+esc(number(reading.xCm))+'</b></span><span>y <b>'+esc(number(reading.yCm))+'</b></span></td><td class="ai-native-components"><span>vₓ <b>'+esc(number(reading.vxMs))+'</b></span><span>vᵧ <b>'+esc(number(reading.vyMs))+'</b></span></td><td>'+esc(number(reading.kineticEV))+'</td>':'<td colspan="3">'+esc(reading.reason||'此时刻没有可用读数')+'</td>')+'</tr>').join('')+'</tbody></table></div><p class="ai-native-rounding">显示值保留有效数字；原始数值在下方工具记录中。取样侧未记录的旧读数不补写前/后结论。</p></div>';
 if(event.name==='query_events'&&Array.isArray(value.events))return '<div class="ai-native-card"><div class="ai-native-card-heading"><strong>原生关键事件</strong><span>'+value.events.length+' 项</span></div>'+nativeScope(value)+(value.events.length?'<div class="ai-native-table-scroll" tabindex="0" aria-label="原生事件与时刻表"><table class="ai-native-table ai-native-events"><thead><tr><th>t / μs</th><th>实际事件与轨道</th></tr></thead><tbody>'+value.events.map(event=>'<tr><th scope="row">'+esc(number(event.timeUs))+eventJump(job,event)+'</th><td>'+eventLabel(event)+'<small>轨道 '+esc(event.traceId||'—')+'</small></td></tr>').join('')+'</tbody></table></div>':'<p>本次读取范围内没有返回离散事件；这不等于轨道不存在连续零分量区间。</p>')+(value.limitations?.length?'<ul class="ai-native-limitations">'+value.limitations.map(item=>'<li>'+esc(typeof item==='string'?item:item.message||JSON.stringify(item))+'</li>').join('')+'</ul>':'')+'</div>';
 return '';
}
function outputSummary(event){
  const value=event.output;if(!value)return '';
  if(event.type==='model')return value.reasoning?'已连接模型，正在推理':value.toolRequests?'正在准备 '+value.toolRequests+' 个工具请求':value.textCharacters?'已接收 '+value.textCharacters+' 字输出，完整答复将统一呈现':'';
  if(value.error)return value.error;
  if(event.name==='inspect_scene')return inspectionCount(value)+(Number.isFinite(value.durationUs)?' · '+number(value.durationUs)+' μs':'');
  if(event.name==='query_motion')return (value.readings?.filter(x=>x.available).length||0)+' 条原生读数';
  if(event.name==='query_events')return (value.events?.length||0)+' 个关键节点'+(value.limited?' · 已截取部分':'');
  if(event.name==='search_selected_sources')return (value.matches?.length||0)+' 处原文匹配';
  if(event.name==='test_scene')return value.harness?.passed?'临时场景已通过原生计算':'发现待修正的构造或物理问题';
  if(event.name==='evaluate_relation')return '已按原生表达式和量纲计算';
  return '已返回工具结果';
}
export function renderAIActivity(job){
  const events=job.activity||[];if(!events.length)return '';
  const running=['queued','running'].includes(job.status),tools=events.filter(e=>e.type==='tool');
  return '<details class="ai-activity" data-ai-preserve="activity" '+(running?'open':'')+'><summary><span class="ai-activity-indicator '+(running?'is-running':'')+'" aria-hidden="true">'+(running?'':'✓')+'</span><span>处理过程'+(tools.length?' · '+tools.length+' 次工具调用':'')+'</span><small>'+seconds(job.createdAt,running?null:job.updatedAt)+'</small></summary><ol>'+events.map(event=>{
    const status=statuses[event.status]||event.status,summary=outputSummary(event);
    return '<li class="ai-activity-row '+esc(event.status)+' '+esc(event.type)+'"><span class="ai-activity-dot" aria-hidden="true">'+(event.status==='completed'?'✓':event.status==='failed'?'!':event.status==='cancelled'?'−':'')+'</span><div><div class="ai-activity-title"><strong>'+esc(event.title)+'</strong><small>'+esc(status)+' · '+seconds(event.startedAt,event.completedAt)+'</small></div>'+(summary?'<p>'+esc(summary)+'</p>':'')+nativeOutput(event,job)+(event.type==='tool'&&(event.input||event.output)?'<details class="ai-tool-detail" data-ai-preserve="tool-'+esc(event.id)+'"><summary>原始工具输入与 JSON</summary>'+(event.input?'<div><span>输入</span><pre>'+esc(JSON.stringify(event.input,null,2))+'</pre></div>':'')+(event.output?'<div><span>结果</span><pre>'+esc(JSON.stringify(event.output,null,2))+'</pre></div>':'')+'</details>':'')+'</div></li>';
  }).join('')+'</ol></details>';
}

const fieldValue=value=>value==null?'未设置':typeof value==='boolean'?value?'是':'否':typeof value==='number'?Number(value.toPrecision(7)).toString():typeof value==='string'?value:JSON.stringify(value);
export function renderSceneChanges(change){
  if(!change)return '';
  const rows=object=>object.fields.map(field=>'<tr><th>'+esc(field.label)+(field.unit?'<small>'+esc(field.unit)+'</small>':'')+'</th><td><del>'+esc(fieldValue(field.before))+'</del></td><td><ins>'+esc(fieldValue(field.after))+'</ins>'+(field.derived?'<small>随依赖更新</small>':'')+'</td></tr>').join('');
  return '<section class="ai-scene-changes"><div><strong>场景变更预览</strong><span>＋'+change.added.length+'　−'+change.removed.length+'　修改 '+change.changed.length+'</span></div><p>'+esc(change.hasBaseline?'比较本轮保存版本的几何、物理参数与依赖。确认后创建独立变式。':'这是一个新场景提案。展开对象可核对数值和依赖。')+'</p>'+(change.duration?'<div class="ai-duration-change">观察时长 <del>'+esc(fieldValue(change.duration.before))+'</del> → <ins>'+esc(fieldValue(change.duration.after))+' μs</ins></div>':'')+change.changed.map(object=>'<details data-ai-preserve="change-'+esc(object.id)+'"><summary>修改 '+esc(object.label)+' · '+esc(object.kindLabel)+' <small>'+object.fields.length+'项</small></summary><table><thead><tr><th>参数</th><th>原值</th><th>提案</th></tr></thead><tbody>'+rows(object)+'</tbody></table></details>').join('')+change.added.map(object=>'<details data-ai-preserve="add-'+esc(object.id)+'"><summary>＋ '+esc(object.label)+' · '+esc(object.kindLabel)+'</summary><table><tbody>'+object.fields.map(field=>'<tr><th>'+esc(field.label)+'</th><td>'+esc(fieldValue(field.after))+(field.unit?' '+esc(field.unit):'')+'</td></tr>').join('')+'</tbody></table>'+(Object.keys(object.definitions||{}).length?'<p>持续依赖</p><pre>'+esc(JSON.stringify(object.definitions,null,2))+'</pre>':'')+'</details>').join('')+(change.removed.length?'<div class="ai-removed-objects">提案中移除：'+change.removed.map(o=>esc(o.label+' · '+o.kindLabel)).join('、')+'</div>':'')+'</section>';
}
