const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Edit the vertex list without replacing the polygon or any bound field. */
export function createPolygonEditor({scene,view,mutate,editPolygonVertices,addConstruction,onApplied,toast}){
 const dialog=document.createElement('dialog');dialog.className='polygon-editor-dialog';
 dialog.innerHTML='<form><div class="polygon-editor-heading"><div><span>保留区域与场的绑定</span><h2>编辑多边形顶点</h2></div><button type="button" data-polygon-action="cancel" aria-label="关闭顶点编辑">×</button></div><p class="polygon-editor-description"></p><p class="polygon-editor-order-note">顶点、边和坐标公式继续按第 N 个的序号解释；修改顺序后，下游引用按新顺序计算。</p><div class="polygon-editor-list"></div><button type="button" data-polygon-action="add" class="polygon-editor-add">＋ 追加顶点</button><p class="polygon-editor-state" role="status"></p><div class="polygon-editor-actions"><button type="button" data-polygon-action="cancel">取消</button><button type="submit" class="primary">应用顶点</button></div></form>';
 document.body.append(dialog);let owner=null,entries=[],linked=false,keepOrder=false;
 const object=id=>scene().objects.find(o=>o.id===id),el=selector=>dialog.querySelector(selector);
 const entryPoint=entry=>entry.id?[object(entry.id)?.x,object(entry.id)?.y]:entry.point;
 function reset(){owner=null;entries=[];view.constructionDraft=null;view.render();if(dialog.open)dialog.close();}
 function applyDraft(model){
  const inputs=linked?entries.map(entry=>entry.id||addConstruction(model,{tool:'point',position:entry.point}).primaryId):undefined;
  return editPolygonVertices(model,owner,linked?{inputs}:{points:entries.map(entry=>entry.point)});
 }
 function preview(){
  const points=entries.map(entryPoint).filter(p=>p?.length===2&&p.every(Number.isFinite));view.constructionDraft={tool:'polygon',points,closed:true,cursor:null};view.render();
  const state=el('.polygon-editor-state'),apply=el('[type="submit"]');
  try{
   const result=applyDraft(structuredClone(scene())),polygon=object(owner);apply.disabled=false;state.className='polygon-editor-state'+(result.defined?'':' is-warning');
   state.textContent=result.defined?entries.length+' 个顶点；应用后保留 '+polygon.label+' 和绑定场的身份。':(result.states.find(s=>s.id===owner)?.message||'当前多边形暂时无定义。')+' 可保留关系，调整顶点后恢复。';
   apply.textContent=result.defined?'应用顶点':'应用并保留无定义关系';
  }catch(error){state.className='polygon-editor-state is-error';state.textContent=error.message;apply.disabled=true;apply.textContent='应用顶点';}
 }
 function render(){
  const polygon=object(owner);if(!polygon){reset();return;}
  const points=scene().objects.filter(o=>o.kind==='point'),canReorder=!keepOrder;
  el('.polygon-editor-list').innerHTML=entries.map((entry,index)=>{
   const frozen=!linked&&Object.keys(polygon.defs||{}).some(key=>new RegExp('^point'+index+'(?:[xy])?$').test(key));
   return '<div class="polygon-editor-row" data-polygon-row="'+index+'"><span class="polygon-editor-index">'+(index+1)+'</span><div class="polygon-editor-value">'+(linked?'<select data-polygon-point aria-label="第'+(index+1)+'个顶点引用">'+(entry.id&&!object(entry.id)?'<option value="'+esc(entry.id)+'">已删除 '+esc(entry.id)+'</option>':'')+points.map(p=>'<option value="'+p.id+'" '+(p.id===entry.id?'selected':'')+'>'+esc(p.label)+' · '+p.id+(p._error?' · 暂无定义':'')+'</option>').join('')+'<option value="new" '+(!entry.id?'selected':'')+'>新建自由点</option></select>':'')+(!entry.id?'<div class="polygon-editor-coordinates"><label>x <input type="number" step="any" value="'+esc(entry.point[0])+'" data-polygon-coordinate="0" aria-label="第'+(index+1)+'点横坐标" '+(frozen?'disabled':'')+'> cm</label><label>y <input type="number" step="any" value="'+esc(entry.point[1])+'" data-polygon-coordinate="1" aria-label="第'+(index+1)+'点纵坐标" '+(frozen?'disabled':'')+'> cm</label></div>':'<small>'+esc((entryPoint(entry)||[]).map(n=>Number.isFinite(n)?Number(n.toPrecision(5)):'?').join(', '))+' cm</small>')+(frozen?'<small>坐标由原有公式控制</small>':'')+'</div><div class="polygon-editor-row-actions"><button type="button" data-polygon-action="up" aria-label="上移第'+(index+1)+'个顶点" '+(!canReorder||index===0?'disabled':'')+'>↑</button><button type="button" data-polygon-action="down" aria-label="下移第'+(index+1)+'个顶点" '+(!canReorder||index===entries.length-1?'disabled':'')+'>↓</button><button type="button" data-polygon-action="remove" aria-label="删除第'+(index+1)+'个顶点" '+(!canReorder||entries.length<=3?'disabled':'')+'>×</button></div></div>';
  }).join('');
  el('[data-polygon-action="add"]').disabled=entries.length>=64;preview();
 }
 function open(id){
  const polygon=object(id);if(polygon?.kind!=='polygon'||polygon.construction&&polygon.construction.type!=='polygon'){toast?.('派生多边形请调整构造参数或重选输入。');return;}
  reset();owner=id;linked=!!polygon.construction;keepOrder=!linked&&Object.keys(polygon.defs||{}).some(key=>/^point\d+(?:[xy])?$/.test(key));
  entries=linked?polygon.construction.inputs.map(id=>({id})):polygon.points.map(point=>({point:[...point]}));
  el('h2').textContent='编辑 '+polygon.label+' 的顶点';el('.polygon-editor-description').textContent=linked?'按顺序选择已有点，或填写坐标新建自由点。新点在应用时才创建，取消不会留下额外对象。':'坐标使用厘米。'+(keepOrder?'已有顶点公式时保留顺序；解除相关依赖后可删除或重排。':'可修改、追加、删除或重排顶点。');render();dialog.showModal();
 }
 dialog.addEventListener('click',event=>{
  const button=event.target.closest('[data-polygon-action]');if(!button)return;const action=button.dataset.polygonAction,index=Number(button.closest('[data-polygon-row]')?.dataset.polygonRow);
  if(action==='cancel'){reset();return;}
  if(action==='add'){
   const first=entryPoint(entries[0]),last=entryPoint(entries.at(-1)),point=[0,1].map(i=>(Number(first?.[i])||0)/2+(Number(last?.[i])||0)/2);entries.push({point});
  }else if(action==='remove')entries.splice(index,1);
  else if(action==='up'||action==='down'){const other=index+(action==='up'?-1:1);[entries[index],entries[other]]=[entries[other],entries[index]];}
  render();
 });
 dialog.addEventListener('change',event=>{
  const row=event.target.closest('[data-polygon-row]');if(!row)return;const index=Number(row.dataset.polygonRow);
  if(event.target.matches('[data-polygon-point]')){entries[index]=event.target.value==='new'?{point:entryPoint(entries[index]).map(n=>Number.isFinite(n)?n:0)}:{id:event.target.value};render();}
 });
 dialog.addEventListener('input',event=>{
  if(!event.target.matches('[data-polygon-coordinate]'))return;const index=Number(event.target.closest('[data-polygon-row]').dataset.polygonRow),axis=Number(event.target.dataset.polygonCoordinate);entries[index].point[axis]=event.target.valueAsNumber;preview();
 });
 el('form').addEventListener('submit',event=>{
  event.preventDefault();const id=owner;let result;try{applyDraft(structuredClone(scene()));}catch(error){el('.polygon-editor-state').textContent=error.message;return;}
  mutate(model=>{result=applyDraft(model);});if(!result)return;reset();onApplied?.(id);toast?.(result.defined?'顶点已更新，区域与场绑定保持。':'顶点已更新，当前几何暂时无定义；调整后会恢复。');
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();reset();});
 return {open,reset,get active(){return dialog.open;},destroy(){reset();dialog.remove();}};
}
