import {extractTimelineEvents,timelineReadings} from './planar-timeline-events.mjs';
import {tex} from './lorentz-math.mjs';
import {readMotionState} from './planar-motion-readings.mjs';
import {forcesAt} from './planar-physics.mjs';
import {findNextTimelineEvent} from './planar-timeline-navigation.mjs';
import {createTimelineBookmarks} from './planar-timeline-bookmarks.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const fmt=n=>Number.isFinite(n)?n===0?'0':Math.abs(n)<.0001||Math.abs(n)>1e6?n.toExponential(3):Number(n.toPrecision(6)).toString():'—';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABEL=132;
const math=value=>{try{return tex(String(value));}catch{return esc(value);}};

export function createTimeline({root=document.getElementById('simulation-timeline'),onSeekUs=()=>{},onSelectTrace=()=>{},onEvent=()=>{},onAskAI,onViewChange=()=>{},readonly=false}={}){
 if(!root)throw Error('缺少仿真时间轴');
 const q=selector=>root.querySelector(selector),lanes=q('.timeline-lanes'),rows=q('.timeline-rows'),ruler=q('.timeline-ruler'),cursor=q('.timeline-cursor');
 let restoredRange=false,state=null,derived=null,traceRef=null,sceneRef=null,view={version:1,startUs:0,endUs:1,collapsed:innerWidth<800,height:185,filter:'all',eventFilter:'all',folded:[]},plotWidth=600,silentScroll=false,lastEvent=null,pending=0,drag=null;
 const clusters=new Map();
 const bookmarks=readonly?null:createTimelineBookmarks({container:q('.timeline-toolbar'),onSeek:({timeUs,traceId,side})=>{lastEvent=null;q('.timeline-event-detail').hidden=true;q('[data-timeline-action="close-event"]').hidden=true;onSelectTrace(traceId);onSeekUs(timeUs,{side});},onChange:(preferences,change)=>{if(derived){renderRows();syncCursor();}onViewChange(snapshot(),{cause:'bookmark',action:change.cause});}});
 const tooltip=document.createElement('div');tooltip.className='timeline-tooltip';tooltip.hidden=true;document.body.append(tooltip);
 function domain(){return Math.max(.000001,state?.durationUs||1);}
 function applyHeight(){
  const header=document.querySelector('body>header'),max=Math.max(80,innerHeight-(header?.getBoundingClientRect().height||0)-220),height=clamp(view.height,Math.min(128,max),max);
  root.style.height=view.collapsed?'auto':height+'px';root.style.maxHeight=view.collapsed?'none':max+'px';
  const handle=q('.timeline-height-resizer');if(handle){handle.setAttribute('aria-valuemin',String(Math.min(128,max)));handle.setAttribute('aria-valuemax',String(Math.round(max)));handle.setAttribute('aria-valuenow',String(Math.round(height)));}
 }

 function viewportWidth(){return Math.max(120,lanes.clientWidth-LABEL);}
 function x(timeUs){return clamp(timeUs/domain(),0,1)*plotWidth;}
 function visibleRange(){const span=viewportWidth()/Math.max(1,plotWidth)*domain();return {start:lanes.scrollLeft/Math.max(1,plotWidth)*domain(),end:Math.min(domain(),(lanes.scrollLeft+viewportWidth())/Math.max(1,plotWidth)*domain())};}
 function eventMatches(e){return view.eventFilter==='all'||view.eventFilter==='boundary'&&['enter','exit','boundary'].includes(e.kind)||view.eventFilter==='birth'&&['initial','birth'].includes(e.kind)||e.kind===view.eventFilter;}
 const velocityComponents=()=>view.eventFilter==='vx-zero'?['x']:view.eventFilter==='vy-zero'?['y']:['x','y'];
 function rebuild(){
  if(!state)return;
  const range=visibleRange();view.startUs=range.start;view.endUs=range.end;
  derived=extractTimelineEvents({scene:state.scene,traces:state.traces,durationUs:domain(),rangeUs:range,velocityComponents:velocityComponents()});
  renderAxis();renderRows();renderLimitations();syncCursor();
 }
 function renderAxis(){
  const visibleSpan=Math.max(1e-9,view.endUs-view.startUs),raw=visibleSpan/6,power=10**Math.floor(Math.log10(raw)),step=[1,2,5,10].find(v=>v*power>=raw)*power;
  const ticks=[];for(let t=Math.ceil(view.startUs/step)*step;t<=view.endUs+step*1e-8;t+=step)ticks.push('<span style="left:'+x(t)+'px">'+esc(fmt(t))+'</span>');
  ruler.innerHTML='<div class="timeline-ruler-label">时间 / μs</div><div class="timeline-ruler-scale" style="width:'+plotWidth+'px">'+ticks.join('')+'</div>';ruler.style.width=LABEL+plotWidth+'px';
  q('.timeline-range-label').textContent=fmt(view.startUs)+' – '+fmt(view.endUs)+' μs';
 }
 function renderRows(){
  clusters.clear();const tracks=derived.tracks.filter(t=>view.filter==='all'||t.id===view.filter),pastOnly=!!state.scene?.teaching?.pastOnly;
  const saved=bookmarks?.entries()||[],bookmarkRow=saved.length?'<div class="timeline-bookmark-track" style="width:'+(LABEL+plotWidth)+'px"><div class="timeline-bookmark-track-label">时间书签 <small>'+saved.length+'</small></div><div class="timeline-track-plot" style="width:'+plotWidth+'px">'+saved.filter(item=>item.available).map(item=>'<button type="button" class="timeline-bookmark-marker" data-timeline-bookmark="'+esc(item.id)+'" style="left:'+x(item.timeUs)+'px" title="'+esc(item.name+' · '+item.timeUs+' μs · '+item.traceLabel+' · '+(item.side==='before'?'前侧':'后侧')+' · 固定时间，不跟随事件')+'" aria-label="'+esc('定位书签 '+item.name+' · '+item.timeUs+' μs · '+(item.side==='before'?'前侧':'后侧'))+'">◆</button>').join('')+'</div></div>':'';
  if(!tracks.length){rows.innerHTML=bookmarkRow+'<div class="timeline-empty">没有可显示的粒子轨道。添加参与仿真的粒子后，时间轴会读取真实运动。</div>';rows.style.width=LABEL+plotWidth+'px';return;}
  rows.innerHTML=bookmarkRow+tracks.map((track,row)=>{
   const folded=view.folded.includes(track.id),intervals=folded?'':track.intervals.map(span=>{const end=pastOnly?Math.min(span.endUs,state.timeUs):span.endUs;if(end<=span.startUs)return '';const left=x(span.startUs),width=Math.max(.6,x(end)-left),label=span.fields.map(f=>f.label).join(' + ')||'无场域',visual=span.fields.length?span.fields.map(f=>math(f.label)).join(' + '):'无场域';return '<div class="timeline-interval '+span.kind+'" style="left:'+left+'px;width:'+width+'px" title="'+esc(label+' · '+fmt(span.startUs)+'–'+fmt(span.endUs)+' μs · '+span.motion)+'"><span>'+visual+'</span></div>';}).join('');
   const zeros=folded?'':track.zeroIntervals.filter(span=>view.eventFilter==='all'||view.eventFilter===span.kind).map(span=>{const kind=span.kind||'vy-zero',label=span.label||(span.component==='x'?'vx=0（持续）':'vy=0（持续）'),end=pastOnly?Math.min(span.endUs,state.timeUs):span.endUs;if(end<=span.startUs)return '';const width=Math.max(1,x(end)-x(span.startUs));return '<div class="timeline-zero-band '+kind+(span.sampled?' sampled-zero':'')+'" style="left:'+x(span.startUs)+'px;width:'+width+'px" title="'+esc(label+' · '+fmt(span.startUs)+'–'+fmt(span.endUs)+' μs')+'" aria-label="'+esc(label)+'">'+(width>55?'<span>'+esc((span.component==='x'?'vx':'vy')+(span.sampled?'≈0':'=0'))+'</span>':'')+'</div>';}).join('');
   const buckets=new Map();for(const e of track.events.filter(eventMatches)){if(pastOnly&&e.timeUs>state.timeUs+1e-9)continue;const key=Math.round(x(e.timeUs)/13);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(e);}
   let markers='';for(const [bucket,events] of buckets){const token=row+':'+bucket;clusters.set(token,events);const first=events[0],hasX=events.some(event=>event.kind==='vx-zero'),hasY=events.some(event=>event.kind==='vy-zero'),title=events.map(e=>e.label+' · '+fmt(e.timeUs)+' μs').join('\n');markers+='<button type="button" class="timeline-event '+first.kind+(hasX?' has-vx-zero':'')+(hasY?' has-vy-zero':'')+'" data-timeline-cluster="'+token+'" style="left:'+x(first.timeUs)+'px" aria-label="'+esc(title)+'" title="'+esc(title)+'">'+(events.length>1?'<b>'+events.length+'</b>':['vx-zero','vy-zero'].includes(first.kind)?'◇':first.kind==='enter'?'▸':first.kind==='exit'?'◂':first.kind==='switch'?'↕':'•')+((hasX||hasY)?'<small class="timeline-velocity-axis">'+(hasX&&hasY?'x/y':hasX?'x':'y')+'</small>':'')+'</button>';}
   const tail=track.truncated?'<div class="timeline-unknown-tail" style="left:'+x(track.computedEndUs)+'px;width:'+Math.max(0,plotWidth-x(track.computedEndUs))+'px" title="后续运动尚未计算"></div>':'';
   return '<div class="timeline-row '+(folded?'folded ':'')+(track.id===state.selectedTraceId?'selected':'')+'" data-timeline-trace="'+esc(track.id)+'" style="width:'+ (LABEL+plotWidth)+'px"><div class="timeline-track-label"><button type="button" data-timeline-fold="'+esc(track.id)+'" aria-label="'+esc((folded?'展开':'折叠')+'轨道'+track.label)+'">'+(folded?'›':'⌄')+'</button><button type="button" data-timeline-select="'+esc(track.id)+'"><strong>'+math(track.label)+'</strong><small>'+esc(track.future?'尚未发射':track.truncated?'计算未完成':track.intervals.length+' 个物理阶段')+'</small></button></div><div class="timeline-track-plot" style="width:'+plotWidth+'px">'+intervals+zeros+tail+markers+'</div></div>';
  }).join('');rows.style.width=LABEL+plotWidth+'px';
 }
 function renderLimitations(){const messages=derived.limitations;const box=q('.timeline-limitations');box.hidden=!messages.length;box.textContent=messages.map(v=>v.message).join(' ');}
 function syncCursor(){if(!state)return;const left=LABEL+x(state.timeUs);cursor.style.left=left+'px';cursor.style.height=Math.max(26,rows.scrollHeight+25)+'px';q('#timeline-seek-us').max=domain();if(document.activeElement!==q('#timeline-seek-us'))q('#timeline-seek-us').value=fmt(state.timeUs);}
 function syncControls(){
  if(!state)return;const active=document.activeElement;for(const [id,value] of [['duration',state.durationUs],['trail-duration',state.trail?.duration||.12],['trail-duration-slider',state.trail?.duration||.12],['rate',state.rate||1]]){const node=q('#'+id);if(node&&active!==node)node.value=value;}
  q('#timeline-track-filter').value=view.filter;q('#timeline-event-filter').value=view.eventFilter;const currentTrace=q('#timeline-current-trace');if(currentTrace)currentTrace.disabled=!(state.traces||[]).some(trace=>trace.particle.traceId===state.selectedTraceId);
  q('#trail-duration-slider').max=Math.max(domain(),(state.trail?.duration||.12)*2);q('#trail-auto').checked=state.trail?.auto!==false;q('#trail-enabled').checked=!!state.trail?.enabled;
  q('#duration').disabled=readonly;q('#trail-auto').disabled=readonly;q('#track-mode').disabled=readonly;q('#trail-duration').disabled=readonly||state.trail?.auto!==false;q('#trail-duration-slider').disabled=readonly||state.trail?.auto!==false;
  applyHeight();root.classList.toggle('timeline-collapsed',view.collapsed);q('[data-timeline-action="toggle"]').setAttribute('aria-expanded',String(!view.collapsed));q('[data-timeline-action="toggle"]').textContent=view.collapsed?'轨道 ▸':'轨道 ▾';
 }
 function update(values){
  const first=!state,previousDomain=state?domain():null,wasFull=!first&&view.startUs===0&&Math.abs(view.endUs-previousDomain)<=16*Number.EPSILON*Math.max(previousDomain,view.endUs);
  state={...state,...values};bookmarks?.update({durationUs:state.durationUs,timeUs:state.timeUs,readingSide:state.readingSide,selectedTraceId:state.selectedTraceId,traces:state.traces});if(first&&!restoredRange||wasFull&&domain()!==previousDomain){view.startUs=0;view.endUs=domain();}readonly=values.readonly??readonly;const changed=traceRef!==state.traces||sceneRef!==state.scene;traceRef=state.traces;sceneRef=state.scene;
  if(changed){const select=q('#timeline-track-filter'),prior=view.filter;select.innerHTML='<option value="all">全部轨道</option>'+(state.traces||[]).map(t=>'<option value="'+esc(t.particle.traceId)+'">'+esc(t.particle.label||t.particle.traceId)+'</option>').join('');if(![...select.options].some(o=>o.value===prior))view.filter='all';select.value=view.filter;lastEvent=null;q('.timeline-event-detail').hidden=true;}
  // A zoomed window keeps its scale when possible, but never points beyond a shorter run.
  const span=Math.min(domain(),Math.max(.000001,view.endUs-view.startUs));view.startUs=clamp(view.startUs,0,domain()-span);view.endUs=view.startUs+span;
  plotWidth=viewportWidth()*domain()/Math.max(.000001,Math.min(domain(),view.endUs-view.startUs));syncControls();if(changed){silentScroll=true;lanes.scrollLeft=clamp(view.startUs/domain()*plotWidth,0,plotWidth-viewportWidth());silentScroll=false;rebuild();}else{syncCursor();if(state.scene?.teaching?.pastOnly&&!view.collapsed)renderRows();}
  const detail=q('.timeline-event-detail');
  if(lastEvent&&!detail.hidden&&lastEvent.traceId===state.selectedTraceId&&['before','after'].includes(state.readingSide)&&detail._side!==state.readingSide&&Math.abs(state.timeUs-lastEvent.timeUs)<=4*Number.EPSILON*Math.max(Math.abs(state.timeUs),Math.abs(lastEvent.timeUs)))showEvent(detail._events,detail._selectedIndex,{side:state.readingSide,notify:false});
 }
 function setView(value={},options={}){
  if(!state)return;let start=Number(value.startUs),end=Number(value.endUs);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
  const span=clamp(end-start,Math.max(domain()/100000,.000001),domain());start=clamp(start,0,domain()-span);view.startUs=start;view.endUs=start+span;plotWidth=viewportWidth()*domain()/span;
  rows.style.width=LABEL+plotWidth+'px';ruler.style.width=LABEL+plotWidth+'px';silentScroll=true;lanes.scrollLeft=start/domain()*plotWidth;silentScroll=false;rebuild();if(!options.silent)onViewChange(snapshot(),{cause:'user'});
 }
 function zoom(factor){const span=view.endUs-view.startUs,next=span/factor,center=state.timeUs>=view.startUs&&state.timeUs<=view.endUs?state.timeUs:(view.startUs+view.endUs)/2;setView({startUs:center-next/2,endUs:center+next/2});}
 function snapshot(){return {...view,folded:[...view.folded],bookmarks:bookmarks?.snapshot()};}
 function restore(value){if(value?.version!==1)return;bookmarks?.restore(value.bookmarks);for(const key of ['collapsed'])if(typeof value[key]==='boolean')view[key]=value[key];if(Array.isArray(value.folded))view.folded=value.folded.filter(v=>typeof v==='string');if(typeof value.filter==='string')view.filter=value.filter;if(['all','boundary','vx-zero','vy-zero','switch','birth'].includes(value.eventFilter))view.eventFilter=value.eventFilter;if(Number.isFinite(value.height))view.height=clamp(value.height,120,600);if(Number.isFinite(value.startUs)&&Number.isFinite(value.endUs)&&value.endUs>value.startUs){view.startUs=value.startUs;view.endUs=value.endUs;restoredRange=true;if(state)setView(value,{silent:true});}syncControls();}
 function focusCurrentTrace(){
  const id=state?.selectedTraceId;if(!(state?.traces||[]).some(trace=>trace.particle.traceId===id))return;
  // Explicit focus keeps the teacher's multi-track comparison unchanged until requested.
  view.filter=id;view.collapsed=false;view.folded=view.folded.filter(value=>value!==id);syncControls();rebuild();lanes.scrollTop=0;onViewChange(snapshot(),{cause:'user'});
 }
 function boundaryFields(event,side){
  if(!['enter','exit','switch','boundary'].includes(event.kind)||!Array.isArray(event.beforeFields)||!Array.isArray(event.afterFields))return '';
  const names=ids=>ids.length?ids.map(id=>{const field=state.scene?.objects.find(object=>object.id===id);return esc(field?.kind==='electric'?'电场 ':field?.kind==='field'?'磁场 ':'场域 ')+math(field?.label||id);}).join(' + '):'无场域';
  return '<div class="timeline-event-fields"><span class="'+(side==='before'?'current':'')+'">事件前 <b>'+names(event.beforeFields)+'</b></span><span class="'+(side==='after'?'current':'')+'">事件后 <b>'+names(event.afterFields)+'</b></span></div>';
 }
 function showEvent(events,selectedIndex=0,{side:requestedSide,notify=true}={}){
  if(!events?.length)return;const detail=q('.timeline-event-detail');lastEvent=events[selectedIndex]||events[0];const trace=state.traces.find(t=>t.particle.traceId===lastEvent.traceId),split=['enter','exit','switch','boundary'].includes(lastEvent.kind),before=readMotionState(trace,lastEvent.timeUs*1e-6,{side:'before'}),after=readMotionState(trace,lastEvent.timeUs*1e-6,{side:'after'}),canBefore=before.available&&!!before.state,canAfter=after.available&&!!after.state&&!after.endpointOnly;
  const side=split?(['before','after'].includes(requestedSide)?requestedSide:canAfter?'after':canBefore?'before':'after'):'after',chosen=side==='before'?before:after,s=chosen.available?chosen.state:null,showDynamics=!!s&&chosen.dynamicsAvailable!==false&&!(chosen.endpointOnly&&side==='after'),force=showDynamics?forcesAt(s.segment,s.v,s.local):null;
  const readings=timelineReadings(trace,lastEvent.timeUs,{side});
  detail.hidden=false;q('[data-timeline-action="close-event"]').hidden=false;
  const sides=split?'<div class="timeline-event-sides" role="tablist" aria-label="边界事件取样侧"><button type="button" role="tab" data-timeline-side="before" aria-selected="'+(side==='before')+'" '+(!canBefore?'disabled':'')+' title="'+esc(before.reason||'读取同一事件时刻的前侧')+'">事件前</button><button type="button" role="tab" data-timeline-side="after" aria-selected="'+(side==='after')+'" '+(!canAfter?'disabled':'')+' title="'+esc(after.reason||'读取同一事件时刻的后侧')+'">事件后</button><span>同一时刻 · 不偏移时间</span></div>':'';
  const absent=split?(!canBefore?'<p class="timeline-side-unavailable">事件前：'+esc(before.reason||'没有前侧轨迹')+'</p>':'')+(!canAfter?'<p class="timeline-side-unavailable">事件后：'+esc(after.reason||'没有实际后侧运动段')+'</p>':''):'';
  const participating=s?.segment.fieldIds?.length?s.segment.fieldIds.map(id=>{const field=state.scene?.objects.find(object=>object.id===id);return esc(field?.kind==='electric'?'电场 ':field?.kind==='field'?'磁场 ':'场域 ')+math(field?.label||id);}).join(' + '):'无场域';
  const fieldCaption=side==='before'?'前侧参与场：':'后侧参与场：';
  const method=lastEvent.method==='native-numerical'?'原生运动状态数值定位 · |v'+(lastEvent.component==='x'||lastEvent.kind==='vx-zero'?'x':'y')+'|残差 '+fmt(lastEvent.residualMS)+' m/s · 时间精度 '+fmt(lastEvent.toleranceUs)+' μs':lastEvent.method==='native-analytic'||lastEvent.method==='native-linear'?'由原生分段运动公式定位':'由原生轨迹的真实运动段确定';
  detail.innerHTML=[
   '<div class="timeline-event-list">'+events.map((e,i)=>'<button type="button" data-timeline-detail-event="'+i+'" class="'+(i===selectedIndex?'active':'')+'">'+esc(e.label)+' <small>'+fmt(e.timeUs)+' μs</small></button>').join('')+'</div>',
   sides,
   '<div class="timeline-event-values">'+(readings?[['x',readings.xCm,'cm'],['y',readings.yCm,'cm'],['vx',readings.vxMS,'m/s'],['vy',readings.vyMS,'m/s'],['K',readings.kineticEV,'eV']].map(([label,value,unit])=>'<span>'+label+' <b>'+fmt(value)+' '+unit+'</b></span>').join(''):'<span>'+esc(chosen.reason||'当前侧没有可用运动读数')+'</span>')+'</div>',
   boundaryFields(lastEvent,side),
   showDynamics?'<div class="timeline-selected-fields">'+fieldCaption+participating+'</div>':s?'<p class="timeline-side-unavailable">后侧场/力未计算，仅有观察终点的位置、速度与动能。</p>':'',
   force?'<div class="timeline-event-forces"><span>Fx <b>'+fmt(force.total[0])+' N</b></span><span>Fy <b>'+fmt(force.total[1])+' N</b></span></div>':'',
   absent,
   chosen.endpointOnly?'<p class="timeline-side-unavailable">'+esc(chosen.reason||'仅观察终点状态，不构成事件后侧轨迹证明')+'</p>':'',
   '<p>'+esc(method)+'</p>',
   onAskAI?'<button type="button" data-timeline-action="ask-ai" class="timeline-ai-question">让AI解释这个节点 ↗</button>':''
  ].join('');
  detail._events=events;detail._selectedIndex=selectedIndex;detail._side=side;if(notify){onSelectTrace(lastEvent.traceId);onSeekUs(lastEvent.timeUs,{side});onEvent(lastEvent,{side,readings,trace,state:chosen});}
 }
 function nextEvent(timeUs=state?.timeUs||0,traceId=state?.selectedTraceId){if(!state)return null;return findNextTimelineEvent({scene:state.scene,traces:state.traces,durationUs:domain(),timeUs,traceId,velocityComponents:velocityComponents(),afterEvent:lastEvent,accept:eventMatches});}
 root.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;const action=b.dataset.timelineAction;
  if(action==='toggle'){view.collapsed=!view.collapsed;syncControls();if(!view.collapsed)rebuild();onViewChange(snapshot(),{cause:'user'});}
  if(action==='current-trace')focusCurrentTrace();if(action==='zoom-in')zoom(2);if(action==='zoom-out')zoom(.5);if(action==='fit')setView({startUs:0,endUs:domain()});
  if(action==='ask-ai'&&lastEvent){const detail=q('.timeline-event-detail');onAskAI?.(lastEvent,{side:detail._side||'after'});}
  if(action==='close-event'){q('.timeline-event-detail').hidden=true;b.hidden=true;lastEvent=null;}
  if(b.dataset.timelineCluster)showEvent(clusters.get(b.dataset.timelineCluster)||[]);
  if(b.dataset.timelineDetailEvent!==undefined){const events=q('.timeline-event-detail')._events||[],selected=events[Number(b.dataset.timelineDetailEvent)];if(selected)showEvent(events,Number(b.dataset.timelineDetailEvent));}
  if(b.dataset.timelineSide){const detail=q('.timeline-event-detail');showEvent(detail._events,detail._selectedIndex,{side:b.dataset.timelineSide});}
  if(b.dataset.timelineBookmark)bookmarks?.jump(b.dataset.timelineBookmark);
  if(b.dataset.timelineSelect)onSelectTrace(b.dataset.timelineSelect);
  if(b.dataset.timelineFold){const id=b.dataset.timelineFold;view.folded=view.folded.includes(id)?view.folded.filter(x=>x!==id):[...view.folded,id];renderRows();onViewChange(snapshot(),{cause:'user'});}
 });
 function seekInput(target){const value=Number(target.value);if(target.value.trim()&&Number.isFinite(value))onSeekUs(clamp(value,0,domain()));}
 root.addEventListener('change',event=>{const target=event.target;if(target.id==='timeline-track-filter'){view.filter=target.value;renderRows();onViewChange(snapshot(),{cause:'user'});}if(target.id==='timeline-event-filter'){view.eventFilter=target.value;rebuild();onViewChange(snapshot(),{cause:'user'});}if(target.id==='timeline-seek-us')seekInput(target);});
 lanes.addEventListener('scroll',()=>{if(!state||silentScroll)return;if(pending)cancelAnimationFrame(pending);pending=requestAnimationFrame(()=>{pending=0;rebuild();});});
 lanes.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey){event.preventDefault();zoom(event.deltaY<0?1.25:.8);}else if(event.shiftKey&&!event.deltaX){event.preventDefault();lanes.scrollLeft+=event.deltaY;}},{passive:false});
 lanes.addEventListener('pointerdown',event=>{if(event.target.closest('button,select,input'))return;if(event.pointerType==='touch'&&!event.target.closest('.timeline-ruler'))return;const box=lanes.getBoundingClientRect(),offset=event.clientX-box.left+lanes.scrollLeft-LABEL;if(offset<0)return;event.preventDefault();drag={id:event.pointerId};lanes.setPointerCapture(event.pointerId);onSeekUs(clamp(offset/plotWidth*domain(),0,domain()));});
 lanes.addEventListener('pointermove',event=>{if(drag?.id!==event.pointerId)return;const box=lanes.getBoundingClientRect();onSeekUs(clamp((event.clientX-box.left+lanes.scrollLeft-LABEL)/plotWidth*domain(),0,domain()));});
 const end=()=>{if(drag&&lanes.hasPointerCapture(drag.id))lanes.releasePointerCapture(drag.id);drag=null;};lanes.addEventListener('pointerup',end);lanes.addEventListener('pointercancel',end);
 root.addEventListener('keydown',event=>{if(event.target.id==='timeline-seek-us'&&event.key==='Enter'){event.preventDefault();event.stopPropagation();seekInput(event.target);}if(event.key===' '&&event.target.closest('button,input,select,textarea,summary'))event.stopPropagation();});
 lanes.addEventListener('keydown',event=>{if(event.target!==lanes)return;const step=(view.endUs-view.startUs)/100;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();onSeekUs(clamp(state.timeUs+(event.key==='ArrowLeft'?-step:step),0,domain()));}if(event.key==='Home'){event.preventDefault();event.stopPropagation();onSeekUs(0);}if(event.key==='End'){event.preventDefault();event.stopPropagation();onSeekUs(domain());}});
 lanes.addEventListener('pointerover',event=>{const b=event.target.closest('[data-timeline-cluster]');if(!b)return;const events=clusters.get(b.dataset.timelineCluster)||[];tooltip.textContent=events.map(e=>e.label+' · '+fmt(e.timeUs)+' μs').join(' / ');tooltip.hidden=false;const box=b.getBoundingClientRect();tooltip.style.left=clamp(box.left,8,innerWidth-280)+'px';tooltip.style.top=Math.max(8,box.top-tooltip.offsetHeight-8)+'px';});lanes.addEventListener('pointerout',()=>{tooltip.hidden=true;});
 for(const details of root.querySelectorAll('.timeline-toolbar details:not(.timeline-bookmarks)'))details.addEventListener('toggle',()=>{if(!details.open)return;const trigger=details.firstElementChild.getBoundingClientRect(),popover=details.lastElementChild;popover.style.left=clamp(trigger.right-240,8,Math.max(8,innerWidth-248))+'px';popover.style.bottom='auto';popover.style.top=Math.max(8,trigger.top-popover.scrollHeight-8)+'px';});
 const heightHandle=q('.timeline-height-resizer');let heightDrag=null;
 if(heightHandle){
  heightHandle.addEventListener('pointerdown',event=>{event.preventDefault();heightDrag={id:event.pointerId,y:event.clientY,height:root.getBoundingClientRect().height};heightHandle.setPointerCapture(event.pointerId);view.collapsed=false;});
  heightHandle.addEventListener('pointermove',event=>{if(heightDrag?.id!==event.pointerId)return;view.height=clamp(heightDrag.height+heightDrag.y-event.clientY,120,600);applyHeight();});
  const finishHeight=()=>{if(!heightDrag)return;const old=heightDrag;heightDrag=null;if(heightHandle.hasPointerCapture(old.id))heightHandle.releasePointerCapture(old.id);syncControls();onViewChange(snapshot(),{cause:'user'});};
  heightHandle.addEventListener('pointerup',finishHeight);heightHandle.addEventListener('pointercancel',finishHeight);heightHandle.addEventListener('lostpointercapture',finishHeight);
  heightHandle.addEventListener('dblclick',()=>{view.height=185;applyHeight();onViewChange(snapshot(),{cause:'user'});});
  heightHandle.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','Home'].includes(event.key))return;event.preventDefault();event.stopPropagation();view.collapsed=false;view.height=event.key==='Home'?185:clamp(view.height+(event.key==='ArrowUp'?16:-16),120,600);syncControls();onViewChange(snapshot(),{cause:'user'});});
 }
 const observer=new ResizeObserver(()=>{if(!state)return;applyHeight();const span=view.endUs-view.startUs;plotWidth=viewportWidth()*domain()/Math.max(.000001,span);silentScroll=true;lanes.scrollLeft=view.startUs/domain()*plotWidth;silentScroll=false;rebuild();});observer.observe(lanes);
 return {update,setView,restore,snapshot,clearBookmarks:()=>bookmarks?.reset(),nextEvent,showEvent,eventData:()=>derived,destroy(){end();bookmarks?.destroy();observer.disconnect();if(pending)cancelAnimationFrame(pending);tooltip.remove();}};
}
