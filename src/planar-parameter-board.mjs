import {tex} from './lorentz-math.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const math=value=>{try{return tex(String(value));}catch{return esc(value);}};
const unitNames={speed:'10⁵ m/s',us:'μs',deg:'°',cm2:'cm²','':'无量纲'};

/** Values flow through the app's normal data-prop handlers, not a second editor. */
export function createParameterBoard({container,scene,renderInput,renderValue,syncInput,onSelect=()=>{},onAdd=()=>{},onGraph=()=>{},isEditing=()=>false}={}){
 if(!container||typeof scene!=='function'||typeof renderInput!=='function'||typeof renderValue!=='function')throw Error('自由参数台缺少场景或控件接口');
 const board=document.createElement('div');board.className='parameter-board';container.append(board);let signature='';
 const rows=new Map();
 const parameters=()=>scene()?.objects?.filter(object=>object.kind==='parameter')||[];
 function status(object,row){
  const input=row.querySelector('input[type=number]'),error=object._issues?.value||object._error||(input?.getAttribute('aria-invalid')==='true'?input.title||'输入尚未生效，请修正后重试。':''),bound=!!object.defs?.value;
  const label=row.querySelector('.parameter-board-status');label.textContent=error|| (bound?'由表达式定义 · 可查看依赖':'自由输入 · 可连续调节');row.dataset.state=error?'invalid':bound?'bound':'free';
 }
 function sync(){
  const objects=parameters(),next=JSON.stringify(objects.map(object=>[object.id,object.label,object.unit||'',object.defs||{},object.construction||null,object.slider||null]));
  if(next!==signature){
   const freeCount=objects.filter(object=>!object.defs?.value&&!object.construction).length;
   signature=next;rows.clear();board.innerHTML='<div class="parameter-board-toolbar"><span>'+freeCount+' 个自由量'+(objects.length>freeCount?' · '+(objects.length-freeCount)+' 个依赖量':'')+'</span><button type="button" data-parameter-board-action="add">＋ 添加</button></div>'+(objects.length?'':'<div class="parameter-board-empty"><span>α</span><h3>把自由量放在一起调</h3><p>当前场景还没有自由参数。可创建 R、α 或 n，再用表达式连接几何与物理量。</p><button type="button" data-parameter-board-action="add">创建自由参数</button></div>');
   for(const object of objects){const row=document.createElement('section');row.className='parameter-board-item';row.dataset.parameterId=object.id;row.innerHTML='<div class="parameter-board-item-heading"><strong>'+math(object.label||object.id)+'</strong><span>'+esc(unitNames[object.unit]||object.unit||'无量纲')+'</span><button type="button" data-parameter-board-action="select" aria-label="定位参数 '+esc(object.label||object.id)+'">定位</button><button type="button" data-parameter-board-action="graph" aria-label="查看参数 '+esc(object.label||object.id)+' 的关系图">关系</button></div><div class="parameter-board-controls">'+renderInput(object)+'</div><p class="parameter-board-status" role="status"></p>';board.append(row);rows.set(object.id,row);}
  }
  for(const object of objects){const row=rows.get(object.id);if(!row)continue;
   syncInput?.(row.querySelector('.property'),object);
   for(const input of row.querySelectorAll('[data-prop]')){if(document.activeElement===input||isEditing(input))continue;const value=object[input.dataset.prop];if(value!==undefined&&Number.isFinite(value)){if(input.type==='range'&&!syncInput){input.min=String(Math.min(Number(input.min),value));input.max=String(Math.max(Number(input.max),value));}input.value=String(value);}}
   for(const output of row.querySelectorAll('.unit-value'))output.innerHTML=renderValue(object);status(object,row);
  }
 }
 function click(event){const button=event.target.closest('[data-parameter-board-action]');if(!button)return;const action=button.dataset.parameterBoardAction,id=button.closest('[data-parameter-id]')?.dataset.parameterId;if(action==='add')onAdd();else if(id&&action==='select')onSelect(id);else if(id&&action==='graph')onGraph(id);}
 board.addEventListener('click',click);sync();
 return {sync,destroy(){board.removeEventListener('click',click);rows.clear();board.remove();}};
}
