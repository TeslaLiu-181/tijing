import {tex,num} from './lorentz-math.mjs';
import {properties,targets,bindingKey,definitionTex,displayExpression} from './planar-relations.mjs';
import {constructionOwns} from './planar-geometry.mjs';
import {geometryToolSchema} from './planar-constructions.mjs';
import {units} from './planar-expressions.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const math=value=>{try{return tex(value);}catch{return esc(value);}};
const kinds={parameter:'参数',point:'点',line:'线',circle:'圆',polygon:'多边形',particle:'粒子',source:'发射源',field:'磁场',electric:'电场',ruler:'直尺',angle:'角',label:'标注'};
const tools=new Map(geometryToolSchema().map(tool=>[tool.id,tool.label]));
const geometryKey=key=>['position','x','y','radius','width','height','area','perimeter'].includes(key)||/^point\d+(?:[xy])?$/.test(key);
const filters=new Set(['all','free','dependent','undefined']);

/** Reads already-resolved values. Selection and edits stay in the app pipeline. */
export function createAlgebraPanel({container,onSelect=()=>{},onEditDefinition=()=>{},onGraph=()=>{},onVisibility=()=>{},onViewChange=()=>{}}={}){
 if(!container)throw Error('代数列表缺少工具窗容器。');
 const panel=document.createElement('div');panel.className='algebra-panel';
 panel.innerHTML='<div class="algebra-toolbar"><input type="search" data-algebra-search aria-label="搜索对象标签、ID或定义" placeholder="搜索名称、ID或表达式"><select data-algebra-filter aria-label="筛选代数对象"><option value="all">全部对象</option><option value="free">自由对象</option><option value="dependent">依赖对象</option><option value="undefined">暂未定义</option></select></div><p class="algebra-count" role="status"></p><div class="algebra-list"></div><p class="algebra-empty" hidden></p>';
 container.append(panel);const search=panel.querySelector('[data-algebra-search]'),filter=panel.querySelector('[data-algebra-filter]'),list=panel.querySelector('.algebra-list'),rows=new Map();
 let current={scene:{objects:[]},dependencyGraph:{nodes:[],edges:[]},selectedId:null},preferences={version:1,search:'',filter:'all',expandedIds:[]},order='';
 const snapshot=()=>structuredClone(preferences),emit=()=>onViewChange(snapshot());
 function state(object,node){return {dependent:!!object.construction||!!object.regionSource||Object.keys(object.defs||{}).length>0,undefined:object._defined===false||!!object._error||node?.defined===false,message:object._error||node?.message||''};}
 function controlled(object,key){return constructionOwns(object,key)||!!object.regionSource&&geometryKey(key);}
 function issue(object,key){
  const issues=object._issues||{},bound=bindingKey(object,key)||key;
  if(issues[bound])return issues[bound];
  if(['x','y','position'].includes(key)&&issues.position)return issues.position;
  if(constructionOwns(object,key)&&issues.construction)return issues.construction;
  if(object.regionSource&&geometryKey(key)&&issues.regionSource)return issues.regionSource;
  if(['area','perimeter'].includes(key))return issues.construction||issues.position||Object.entries(issues).find(([name])=>/^point\d/.test(name))?.[1]||'';
  return '';
 }
 function value(object,key,spec){
  const problem=issue(object,key);if(problem)return '<span class="algebra-value-unavailable" title="'+esc(problem)+'">暂未定义</span>';
  let value=key==='position'?[object.x,object.y]:/^point\d+$/.test(key)?object.points?.[Number(key.slice(5))]:object[key];
  if(Array.isArray(value)){if(value.length!==2||!value.every(Number.isFinite))return '<span class="algebra-value-unavailable">—</span>';return math('('+value.map(number=>num(number,5)).join(',\\,')+')\\,\\mathrm{cm}');}
  if(!Number.isFinite(value))return '<span class="algebra-value-unavailable">—</span>';
  const unit=units[spec?.unit||'']?.tex||'';return math(num(value,5)+(spec?.unit==='speed'?'\\times10^5\\,\\mathrm{m\\,s^{-1}}':unit?'\\,'+unit:''));
 }
 function specs(object){
  const all={...properties(object)},target=targets(object),keep=new Set([...(object.kind==='parameter'?[]:['x','y']),...Object.keys(object.defs||{})]);
  if(object.kind==='parameter')keep.add('value');
  if(['particle','source'].includes(object.kind))for(const key of ['mass','charge','speed','heading'])keep.add(key);
  if(object.kind==='source'){for(const key of ['count','spread','speedSpan','interval'])keep.add(key);if(object.sourceType==='circle')keep.add('radius');else if(object.sourceType==='line')for(const key of ['length','angle'])keep.add(key);else if(object.sourceType==='rectangle')for(const key of ['width','height','angle'])keep.add(key);}
  if(['field','electric'].includes(object.kind)){keep.add(object.kind==='field'?'B':'E0');if(object.kind==='electric')keep.add('fieldAngle');if(['circle','annulus','semicircle','sector'].includes(object.shape))keep.add('radius');if(object.shape==='annulus')keep.add('innerRadius');if(['rectangle','triangle'].includes(object.shape))for(const key of ['width','height'])keep.add(key);if(!['infinite','circle','annulus','polygon'].includes(object.shape))keep.add('angle');if(object.shape==='sector')keep.add('sectorAngle');if(object.waveform!=='dc')for(const key of ['period','phase'])keep.add(key);}
  if(object.kind==='circle')keep.add('radius');if(object.kind==='polygon')for(const key of ['area','perimeter','count'])keep.add(key);
  for(const key of ['pathT','factor','index','length','angle'])if(all[key]&&object.construction)keep.add(key);
  if(object.kind==='ruler')for(const key of ['length','angle'])keep.add(key);if(object.kind==='angle')keep.add('angle');
  const entries=Object.entries(all).filter(([key])=>keep.has(key)&&!/^point\d+[xy]$/.test(key));
  if(object.kind!=='parameter'&&target.position)entries.push(['position',target.position]);
  for(const [index]of(object.points||[]).entries())if(index<8&&target['point'+index])entries.push(['point'+index,target['point'+index]]);
  for(const [key,expression]of Object.entries(object.defs||{}))if(!entries.some(([name])=>name===key)&&target[key])entries.push([key,target[key]]);
  return entries;
 }
 function summaryKeys(object){
  if(object.kind==='parameter')return ['value'];if(object.kind==='point')return ['x','y'];
  if(['particle','source'].includes(object.kind))return ['speed','heading',object.kind==='source'?'count':'charge'];
  if(object.kind==='polygon')return ['area','perimeter',...(object.construction?.type==='regular-polygon'?['count']:[])];
  if(object.kind==='circle')return ['radius','x','y'];
  if(['field','electric'].includes(object.kind))return [object.kind==='field'?'B':'E0',...(object.kind==='electric'?['fieldAngle']:[]),...(['circle','annulus','semicircle','sector'].includes(object.shape)?['radius',...(object.shape==='annulus'?['innerRadius']:[])]:['rectangle','triangle'].includes(object.shape)?['width','height']:[])];
  return ['x','y'];
 }
 function rowHTML(object,node,parents,children){
  const status=state(object,node),entries=specs(object),byKey=new Map(entries),name=id=>current.scene.objects.find(value=>value.id===id)?.label||({axisX:'x 轴',axisY:'y 轴'}[id])||id;
  const relation=object.regionSource?'场域跟随 '+math(name(object.regionSource)):object.construction?esc(tools.get(object.construction.type)||object.construction.type)+'('+object.construction.inputs.map(id=>math(name(id))).join(', ')+')':status.dependent?'表达式定义':'自由对象';
  const summary=summaryKeys(object).filter(key=>byKey.has(key)).map(key=>'<span><small>'+esc(byKey.get(key).name)+'</small> '+value(object,key,byKey.get(key))+'</span>').join('');
  const selected=object.id===current.selectedId,expanded=preferences.expandedIds.includes(object.id),target=targets(object);
  return '<div class="algebra-object-heading"><button type="button" data-algebra-action="select" class="algebra-object-name" aria-pressed="'+selected+'"><strong>'+math(object.label||object.id)+'</strong><small>'+esc(kinds[object.kind]||object.kind)+' · '+esc(object.id)+'</small></button><span class="algebra-object-state '+(status.undefined?'undefined':status.dependent?'dependent':'free')+'">'+(status.undefined?'暂未定义':status.dependent?'依赖':'自由')+'</span><button type="button" data-algebra-action="visibility" class="algebra-visibility" '+(object.kind==='parameter'?'disabled':'')+' aria-pressed="'+(object.visible!==false)+'" aria-label="'+(object.visible===false?'显示':'隐藏')+'对象" title="'+(object.kind==='parameter'?'参数没有独立画布图形':'只切换画布显示，不停用物理对象')+'">'+(object.visible===false?'○':'◉')+'</button></div><div class="algebra-summary">'+summary+'</div><details class="algebra-object-details" '+(expanded?'open':'')+'><summary><span>'+relation+'</span><small>关系与值</small></summary>'+(status.message?'<p class="algebra-object-error">'+esc(status.message)+'</p>':'')+'<dl class="algebra-properties">'+entries.map(([key,spec])=>{const bound=bindingKey(object,key),centerDerived=!!object.points&&['position','x','y'].includes(key),geometryControlled=controlled(object,key),readOnly=spec.readOnly||geometryControlled||centerDerived,expression=object.defs?.[bound||key];let equation='';if(expression){try{equation=math(definitionTex(current.scene,expression));}catch{equation=esc(displayExpression(current.scene,expression));}}return '<div class="algebra-property" data-algebra-property="'+esc(key)+'"><dt>'+esc(spec.name)+'</dt><dd>'+value(object,key,spec)+'</dd><button type="button" data-algebra-action="'+(readOnly?'graph':'edit')+'" data-algebra-key="'+esc(bound||key)+'" '+(spec.readOnly||centerDerived&&!geometryControlled?'disabled':'')+' title="'+(centerDerived?'中心由端点或顶点派生':spec.readOnly?'派生量，只读':readOnly?'由构造或区域控制，查看关系':'使用现有公式编辑器')+'" aria-label="'+(readOnly?'查看':'编辑')+esc(spec.name)+'">'+(readOnly?'◇':'ƒ')+'</button>'+(equation?'<div class="algebra-expression">'+equation+'</div>':'')+'</div>';}).join('')+'</dl>'+((object.points?.length||0)>8?'<p class="algebra-more-points">共 '+object.points.length+' 个顶点；完整坐标请定位后在参数窗查看。</p>':'')+'<div class="algebra-one-hop">'+[['输入',parents],['下游',children]].map(([label,ids])=>'<div><small>'+label+'</small><span>'+([...new Set(ids)].map(id=>'<button type="button" data-algebra-action="select" data-algebra-target="'+esc(id)+'">'+math(name(id))+'</button>').join('')||'<em>无</em>')+'</span></div>').join('')+'</div><button type="button" data-algebra-action="graph" class="algebra-graph">完整关系图 ↗</button></details>';
 }
 function render(){
  const objects=current.scene?.objects||[],nodes=new Map((current.dependencyGraph?.nodes||[]).map(node=>[node.id,node])),parents=new Map(),children=new Map();
  for(const edge of current.dependencyGraph?.edges||[]){if(!parents.has(edge.to))parents.set(edge.to,[]);parents.get(edge.to).push(edge.from);if(!children.has(edge.from))children.set(edge.from,[]);children.get(edge.from).push(edge.to);}
  const nextOrder=objects.map(object=>object.id).join('|'),words=preferences.search.trim().toLowerCase().split(/\s+/).filter(Boolean);let count=0;
  for(const object of objects){let row=rows.get(object.id);if(!row){row=document.createElement('section');row.className='algebra-object';row.dataset.algebraId=object.id;rows.set(object.id,row);}
   const node=nodes.get(object.id),status=state(object,node),text=[object.id,object.label,kinds[object.kind],...Object.entries(object.defs||{}).flat(),object.construction?.type,tools.get(object.construction?.type)].join(' ').toLowerCase(),shown=words.every(word=>text.includes(word))&&(preferences.filter==='all'||preferences.filter==='undefined'&&status.undefined||preferences.filter==='dependent'&&status.dependent||preferences.filter==='free'&&!status.dependent);
   row.hidden=!shown;if(shown)count++;row.classList.toggle('selected',object.id===current.selectedId);
   const signature=JSON.stringify([object,node,object._issues||{},object._error||'',preferences.expandedIds.includes(object.id),parents.get(object.id),children.get(object.id),(parents.get(object.id)||[]).map(id=>objects.find(value=>value.id===id)?.label),(children.get(object.id)||[]).map(id=>objects.find(value=>value.id===id)?.label)]);
   if(row.__signature!==signature){row.__signature=signature;row.innerHTML=rowHTML(object,node,parents.get(object.id)||node?.inputs||[],children.get(object.id)||[]);}row.querySelector('.algebra-object-name')?.setAttribute('aria-pressed',String(object.id===current.selectedId));
  }
  for(const [id,row]of rows)if(!objects.some(object=>object.id===id)){row.remove();rows.delete(id);}
  if(order!==nextOrder){for(const object of objects)list.append(rows.get(object.id));order=nextOrder;}
  panel.querySelector('.algebra-count').textContent=count+' / '+objects.length+' 个对象 · 眼睛仅控制显示';const empty=panel.querySelector('.algebra-empty');empty.hidden=count>0;empty.textContent=objects.length?'没有匹配对象，试试其它筛选或表达式关键词。':'画布还没有对象。添加点、参数或场域后，这里会显示当前值与关系。';
 }
 function update(value){current={...current,...value};render();}
 function restore(value){if(value?.version!==1)return;if(typeof value.search==='string')preferences.search=value.search.slice(0,120);if(filters.has(value.filter))preferences.filter=value.filter;if(Array.isArray(value.expandedIds))preferences.expandedIds=[...new Set(value.expandedIds.filter(id=>typeof id==='string'))];search.value=preferences.search;filter.value=preferences.filter;render();}
 search.addEventListener('input',()=>{preferences.search=search.value;render();emit();});filter.addEventListener('change',event=>{event.stopPropagation();preferences.filter=filter.value;render();emit();});
 panel.addEventListener('toggle',event=>{if(!event.target.matches('.algebra-object-details'))return;const id=event.target.closest('[data-algebra-id]').dataset.algebraId,wasOpen=preferences.expandedIds.includes(id);if(wasOpen===event.target.open)return;preferences.expandedIds=event.target.open?[...preferences.expandedIds,id]:preferences.expandedIds.filter(value=>value!==id);emit();},true);
 panel.addEventListener('click',event=>{const button=event.target.closest('[data-algebra-action]');if(!button)return;event.stopPropagation();const id=button.dataset.algebraTarget||button.closest('[data-algebra-id]')?.dataset.algebraId;if(!id)return;if(button.dataset.algebraAction==='select')onSelect(id);else if(button.dataset.algebraAction==='edit')onEditDefinition(id,button.dataset.algebraKey);else if(button.dataset.algebraAction==='graph')onGraph(id);else if(button.dataset.algebraAction==='visibility')onVisibility(id);});
 render();return {update,snapshot,restore,destroy(){rows.clear();panel.remove();}};
}
