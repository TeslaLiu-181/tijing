import {tex} from './lorentz-math.mjs';

const limit=40,itemKeys=['id','name','timeUs','traceId','side'];
const validName=name=>typeof name==='string'&&name.trim().length>0&&name.length<=80;
const labelHTML=value=>{try{return tex(String(value));}catch{return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}};

/** Bookmarks store observation preferences, not native event identities or model edits. */
export function createTimelineBookmarks({container,onSeek,onChange=()=>{}}={}){
 if(!container||typeof onSeek!=='function')throw Error('时间书签缺少工具栏或定位接口。');
 const element=document.createElement('details');element.className='timeline-bookmarks';element.innerHTML='<summary aria-label="固定时间书签">书签 <span class="timeline-bookmarks-count">0</span></summary><div class="timeline-bookmarks-popup"><div class="timeline-bookmarks-heading"><strong>固定时间书签</strong><button type="button" data-bookmark-action="close" aria-label="关闭时间书签">×</button></div><p class="timeline-bookmarks-purpose">记录观察时刻与前／后侧。重算后仍定位原时间，不会自动追随新的进出场事件。</p><button type="button" class="timeline-bookmarks-add" data-bookmark-action="add">＋ 保存当前时刻</button><p class="timeline-bookmarks-current"></p><p class="timeline-bookmarks-error" role="alert" hidden></p><div class="timeline-bookmarks-list"></div><p class="timeline-bookmarks-empty">尚无书签；先选择粒子轨道，再保存观察时刻。</p></div>';
 container.append(element);const popup=element.querySelector('.timeline-bookmarks-popup'),list=element.querySelector('.timeline-bookmarks-list'),error=element.querySelector('.timeline-bookmarks-error'),rows=new Map();
 let state={durationUs:null,timeUs:null,readingSide:'after',selectedTraceId:null,traces:[]},items=[],nextId=1,destroyed=false;
 const traces=()=>new Map((state.traces||[]).map(trace=>[trace.particle?.traceId,trace.particle?.label||trace.particle?.traceId]).filter(([id])=>typeof id==='string'));
 const message=text=>{error.textContent=text;error.hidden=!text;};
 function entries(){
  const actual=traces();return items.map(item=>{const traceLabel=actual.get(item.traceId)||item.traceId;let reason='';if(!Number.isFinite(state.durationUs)||state.durationUs<0)reason='当前观察时长不可用。';else if(item.timeUs>state.durationUs)reason='固定时刻 '+item.timeUs+' μs 超出当前观察时长 '+state.durationUs+' μs。';else if(!actual.has(item.traceId))reason='当前没有轨道 '+item.traceId+' 的可用运动数据；不会改选其它粒子。';return {...item,traceLabel,available:!reason,reason};});
 }
 const snapshot=()=>({version:1,items:items.map(item=>({...item}))});
 function position(){if(!element.open||destroyed)return;const anchor=element.querySelector('summary').getBoundingClientRect(),box=popup.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(anchor.right-box.width,innerWidth-box.width-8))+'px';popup.style.top=Math.max(8,Math.min(anchor.top-box.height-7,innerHeight-box.height-8))+'px';}
 function currentReason(){if(!Number.isFinite(state.durationUs)||state.durationUs<0||!Number.isFinite(state.timeUs)||state.timeUs<0||state.timeUs>state.durationUs)return '当前时刻不在观察时长范围内。';if(!['before','after'].includes(state.readingSide))return '请确认当前读数的前／后侧。';if(!traces().has(state.selectedTraceId))return '当前没有选中的实际粒子轨道。';if(items.length>=limit)return '已保存 40 条书签；请删除一条后再添加，现有记录不会被替换。';return '';}
 function render(){
  const values=entries(),keep=new Set(values.map(item=>item.id));for(const [id,row] of rows)if(!keep.has(id)){row.remove();rows.delete(id);}
  for(const [index,item] of values.entries()){
   let row=rows.get(item.id);if(!row){row=document.createElement('section');row.className='timeline-bookmark-item';row.dataset.bookmarkId=item.id;row.innerHTML='<label>名称<input type="text" maxlength="80" data-bookmark-name aria-label="书签名称"></label><div class="timeline-bookmark-readout"></div><p class="timeline-bookmark-unavailable"></p><div class="timeline-bookmark-actions"><button type="button" data-bookmark-action="jump">定位</button><button type="button" data-bookmark-action="delete">删除</button></div>';rows.set(item.id,row);list.append(row);}
   if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
   const input=row.querySelector('[data-bookmark-name]');if(document.activeElement!==input&&input.value!==item.name)input.value=item.name;
   const readout=row.querySelector('.timeline-bookmark-readout'),identity=JSON.stringify([item.timeUs,item.side,item.traceLabel,item.traceId]);
   if(readout.dataset.identity!==identity){readout.innerHTML='<span>'+item.timeUs+' μs · '+(item.side==='before'?'前侧':'后侧')+'</span><small>'+labelHTML(item.traceLabel)+' <code>['+item.traceId+']</code></small>';readout.dataset.identity=identity;}
   const reason=row.querySelector('.timeline-bookmark-unavailable');reason.textContent=item.reason;reason.hidden=item.available;row.dataset.available=String(item.available);row.querySelector('[data-bookmark-action="jump"]').disabled=!item.available;
  }
  element.querySelector('.timeline-bookmarks-count').textContent=String(items.length);element.querySelector('.timeline-bookmarks-empty').hidden=items.length>0;
  const reason=currentReason();element.querySelector('[data-bookmark-action="add"]').disabled=!!reason;element.querySelector('.timeline-bookmarks-current').textContent=reason||'当前：'+state.timeUs+' μs · '+(state.readingSide==='before'?'前侧':'后侧')+' · '+(traces().get(state.selectedTraceId)||state.selectedTraceId);
  position();
 }
 function changed(cause){render();onChange(snapshot(),{cause});}
 function add(){const reason=currentReason();if(reason){message(reason);return false;}while(items.some(item=>item.id==='tb-'+nextId))nextId++;const id='tb-'+nextId++,name='观察 '+(nextId-1);items.push({id,name,timeUs:state.timeUs,traceId:state.selectedTraceId,side:state.readingSide});message('');changed('add');return true;}
 function jump(id){const item=entries().find(item=>item.id===id);if(!item){message('此书签已删除。');return false;}if(!item.available){message(item.reason);return false;}message('');onSeek({timeUs:item.timeUs,traceId:item.traceId,side:item.side});return true;}
 function rename(input){const item=items.find(item=>item.id===input.closest('[data-bookmark-id]')?.dataset.bookmarkId);if(!item)return;if(!validName(input.value)){message('名称须为 1–80 个字符，不能全为空白。');input.value=item.name;return;}const name=input.value.trim();if(name!==item.name){item.name=name;message('');changed('rename');}}
 function reset(){items=[];nextId=1;element.open=false;message('');changed('reset');}
 function restore(value){
  if(value===undefined||value===null){items=[];nextId=1;message('');changed('restore');return true;}
  let candidate;try{
   if(value.version!==1||!Array.isArray(value.items))throw Error('书签存档格式不正确；原记录保留。');
   if(value.items.length>limit)throw Error('书签存档超过 40 条，未载入也未截取；原记录保留。');
   const ids=new Set();candidate=value.items.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).length!==itemKeys.length||Object.keys(item).some(key=>!itemKeys.includes(key))||typeof item.id!=='string'||!/^tb-[1-9]\d{0,15}$/.test(item.id)||ids.has(item.id)||!validName(item.name)||!Number.isFinite(item.timeUs)||item.timeUs<0||typeof item.traceId!=='string'||!/^o\d+(?::\d+)?$/.test(item.traceId)||!['before','after'].includes(item.side))throw Error('书签存档含无效或重复记录；原记录保留。');ids.add(item.id);return {...item,name:item.name.trim()};});
  }catch(e){message(e.message);return false;}
  items=candidate;nextId=1;message('');changed('restore');return true;
 }
 element.addEventListener('click',event=>{const button=event.target.closest('[data-bookmark-action]');if(!button)return;event.preventDefault();const action=button.dataset.bookmarkAction,id=button.closest('[data-bookmark-id]')?.dataset.bookmarkId;if(action==='close')element.open=false;else if(action==='add')add();else if(action==='jump')jump(id);else if(action==='delete'){items=items.filter(item=>item.id!==id);message('');changed('delete');}});
 element.addEventListener('change',event=>{if(event.target.matches('[data-bookmark-name]'))rename(event.target);});
 element.addEventListener('keydown',event=>{if(event.target.matches('[data-bookmark-name]')&&event.key==='Enter'){event.preventDefault();event.stopPropagation();rename(event.target);event.target.blur();}else if(event.key==='Escape'&&element.open){event.preventDefault();event.stopPropagation();element.open=false;}});
 element.addEventListener('toggle',position);const outside=event=>{if(element.open&&!element.contains(event.target))element.open=false;},privateReset=()=>{state={durationUs:null,timeUs:null,readingSide:'after',selectedTraceId:null,traces:[]};reset();};document.addEventListener('pointerdown',outside);window.addEventListener('resize',position);window.addEventListener('exam-private-reset',privateReset);render();
 return {element,update(values={}){state={...state,...values};render();},snapshot,restore,entries,jump,reset,destroy(){if(destroyed)return;destroyed=true;document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',position);window.removeEventListener('exam-private-reset',privateReset);rows.clear();element.remove();}};
}
