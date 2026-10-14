import {PaperView as NativePaperView} from './planar-view.mjs';
import {resolveScene} from './planar-relations.mjs';
import {solveScene} from './planar-physics.mjs';
import {EXAMPLE_CATALOG,EXAMPLE_CATEGORIES} from './planar-example-catalog.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let gallerySerial=0;

/** Native previews are display-only copies; choosing remains the host's action. */
export function createExampleGallery({example,PaperView=NativePaperView,onChoose}={}){
 if(typeof example!=='function')throw Error('场景图库需要原生示例读取函数。');
 const serial=++gallerySerial,dialog=document.createElement('dialog');
 dialog.className='example-gallery-dialog';dialog.setAttribute('aria-labelledby','example-gallery-title-'+serial);
 dialog.innerHTML='<div class="example-gallery-shell"><header class="example-gallery-header"><div><span class="example-gallery-eyebrow">原生场景图库</span><h2 id="example-gallery-title-'+serial+'">选一个关系，开始探究</h2><p>所有数值均为演示赋值；缩略图来自场景的原生求解。</p></div><button type="button" data-gallery-action="close" aria-label="关闭场景图库">×</button></header><div class="example-gallery-controls"><div class="example-gallery-search"><span aria-hidden="true">⌕</span><input type="search" data-gallery-search aria-label="搜索场景图库" placeholder="搜索场景、关系或关键词，例如：圆 / energy"><button type="button" data-gallery-action="clear" aria-label="清除场景搜索">×</button></div><div class="example-gallery-categories" aria-label="按类别筛选"><button type="button" data-gallery-category="all" aria-pressed="true">全部 <small>'+EXAMPLE_CATALOG.length+'</small></button>'+EXAMPLE_CATEGORIES.map(category=>'<button type="button" data-gallery-category="'+category.id+'" aria-pressed="false">'+esc(category.label)+' <small>'+EXAMPLE_CATALOG.filter(item=>item.category===category.id).length+'</small></button>').join('')+'</div><div class="example-gallery-count" role="status"></div></div><div class="example-gallery-scroll"><div class="example-gallery-grid">'+EXAMPLE_CATALOG.map(item=>'<button type="button" class="example-gallery-card" data-gallery-example="'+item.id+'" aria-label="载入'+esc(item.title)+'"><div class="example-gallery-thumbnail"><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet"></svg><span class="example-gallery-preview-state">等待原生预览</span><span class="example-gallery-preview-caption" hidden></span></div><div class="example-gallery-card-copy"><div class="example-gallery-card-meta"><span>'+esc(EXAMPLE_CATEGORIES.find(category=>category.id===item.category)?.label)+'</span><small>演示赋值</small></div><h3>'+esc(item.title)+'</h3><p>'+esc(item.description)+'</p><span class="example-gallery-open">打开场景 <span aria-hidden="true">↗</span></span></div></button>').join('')+'</div><p class="example-gallery-empty" hidden>没有匹配场景，试试“磁场”“几何”或清除筛选。</p></div><footer class="example-gallery-footer"><span>先选场景，再调参数、播放轨迹或打开曲线。</span><span>Esc 关闭</span></footer></div>';
 document.body.append(dialog);
 const search=dialog.querySelector('[data-gallery-search]'),scroll=dialog.querySelector('.example-gallery-scroll'),cards=new Map([...dialog.querySelectorAll('[data-gallery-example]')].map(card=>[card.dataset.galleryExample,card]));
 const cache=new Map(),queue=[],queued=new Set();let category='all',observer=null,scheduled=null,epoch=0,destroyed=false;

 function cancelQueue(){epoch++;queue.length=0;queued.clear();if(scheduled!==null){if('cancelIdleCallback'in window)cancelIdleCallback(scheduled);else clearTimeout(scheduled);scheduled=null;}observer?.disconnect();observer=null;}
 function visible(card){const box=card.getBoundingClientRect(),bounds=scroll.getBoundingClientRect();return box.bottom>bounds.top&&box.top<bounds.bottom&&box.right>bounds.left&&box.left<bounds.right;}
 function schedule(){if(scheduled!==null||!dialog.open||!queue.length||destroyed)return;const version=epoch;const run=()=>{scheduled=null;if(version!==epoch||!dialog.open||destroyed)return;const id=queue.shift();queued.delete(id);const card=cards.get(id);if(card&&!card.hidden&&!cache.has(id)&&visible(card))renderPreview(id,card);schedule();};scheduled='requestIdleCallback'in window?requestIdleCallback(run,{timeout:500}):setTimeout(run,40);}
 function enqueue(id){const card=cards.get(id);if(!dialog.open||card.hidden||cache.has(id)||queued.has(id))return;queued.add(id);queue.push(id);schedule();}
 function installPreview(id,card){const stored=cache.get(id);if(!stored)return;const svg=card.querySelector('svg');svg.innerHTML=stored.markup;svg.setAttribute('viewBox',stored.viewBox);card.dataset.previewStatus=stored.status;const state=card.querySelector('.example-gallery-preview-state');state.hidden=stored.status==='ready';state.textContent=stored.message||'';const caption=card.querySelector('.example-gallery-preview-caption');caption.textContent=stored.caption||'';caption.hidden=!stored.caption;}
 function renderPreview(id,card){
  const svg=card.querySelector('svg'),state=card.querySelector('.example-gallery-preview-state');let view;
  card.dataset.previewStatus='loading';state.textContent='正在求解原生场景';state.hidden=false;
  try{
   const model=structuredClone(example(id));if(!model.objects.length)throw Error('该原生示例尚未准备完成。');
   const resolved=resolveScene(model),allTraces=solveScene(resolved.scene),traces=allTraces.slice(0,4);
   // Only display flags on this fresh copy change. Values, definitions,
   // enabled states and simulation duration retain the native example.
   Object.assign(model.display,{labels:false,axes:false,grid:false,velocity:false,electricForce:false,magneticForce:false,force:false,tracks:true,ink:false});
   model.teaching.enabled=false;model.trail.enabled=false;for(const key of Object.keys(model.aids))if(typeof model.aids[key]==='boolean')model.aids[key]=false;
   for(const object of model.objects){object.labelVisible=false;if(object.kind==='point'||object.kind==='label')object.visible=false;}
   view=new PaperView(svg,undefined,{idPrefix:'gallery-'+serial+'-'+id+'-'});view.width=svg.clientWidth;view.height=svg.clientHeight;view.time=0;
   view.set(model,traces,{present:true,selected:null,trace:null,segment:0,readingSide:'after'});view.fit({paddingX:24,paddingY:20,minWidth:.01,minHeight:.01,minScale:.2});
   const caption=allTraces.length>traces.length?'轨迹预览 '+traces.length+' / '+allTraces.length:resolved.issues.length?'部分关系未定义':'原生轨迹';
   cache.set(id,{markup:svg.innerHTML,viewBox:svg.getAttribute('viewBox'),status:'ready',caption});
  }catch(error){cache.set(id,{markup:'',viewBox:'0 0 240 150',status:'error',message:'暂无法预览；仍可打开场景核对。',caption:''});card.dataset.previewError=error.message;}
  finally{view?.destroy();installPreview(id,card);}
 }
 function watch(){
  cancelQueue();if(!dialog.open)return;
  observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)enqueue(entry.target.dataset.galleryExample);},{root:scroll,threshold:.05});
  for(const [id,card]of cards)if(!card.hidden){if(cache.has(id))installPreview(id,card);else observer.observe(card);}
 }
 function filter(){
  const words=search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);let count=0;
  for(const item of EXAMPLE_CATALOG){const text=[item.id,item.title,item.description,item.keywords,EXAMPLE_CATEGORIES.find(value=>value.id===item.category)?.label,item.recommended?.plotGroup==='energy'?'energy 能量 动能':item.recommended?.plotGroup].join(' ').toLowerCase(),show=(category==='all'||item.category===category)&&words.every(word=>text.includes(word));cards.get(item.id).hidden=!show;if(show)count++;}
  for(const button of dialog.querySelectorAll('[data-gallery-category]'))button.setAttribute('aria-pressed',String(button.dataset.galleryCategory===category));
  dialog.querySelector('.example-gallery-count').textContent=count+' 个场景';dialog.querySelector('.example-gallery-empty').hidden=count>0;scroll.scrollTop=0;watch();
 }
 function open(options={}){if(destroyed)return;if(typeof options.search==='string')search.value=options.search;if(options.category==='all'||EXAMPLE_CATEGORIES.some(value=>value.id===options.category))category=options.category;if(!dialog.open)dialog.showModal();filter();search.focus();}
 function close(){cancelQueue();if(dialog.open)dialog.close();}
 search.addEventListener('input',filter);
 // A focused search input can consume the browser's native Escape action.
 // Handle it inside the dialog and keep the canvas shortcut from seeing it.
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',cancelQueue);
 dialog.addEventListener('click',event=>{
  const button=event.target.closest('button');if(button){event.stopPropagation();if(button.dataset.galleryAction==='close')close();else if(button.dataset.galleryAction==='clear'){search.value='';filter();search.focus();}else if(button.dataset.galleryCategory){category=button.dataset.galleryCategory;filter();}else if(button.dataset.galleryExample){const id=button.dataset.galleryExample,meta=EXAMPLE_CATALOG.find(item=>item.id===id);close();onChoose?.(id,structuredClone(meta));}return;}
  if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();}
 });
 return {open,close,destroy(){if(destroyed)return;destroyed=true;close();cache.clear();dialog.remove();}};
}
