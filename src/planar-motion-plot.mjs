import {sampleMotionSeries} from './planar-motion-series.mjs';
import {readMotionState} from './planar-motion-readings.mjs';
import {forcesAt,E,norm} from './planar-physics.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>Number.isFinite(value)?value!==0&&(Math.abs(value)<.001||Math.abs(value)>=1e6)?value.toExponential(3):String(Number(value.toPrecision(6))):'—';
const names={velocity:'速度',energy:'能量与电场功',position:'位置',force:'合力'},colors=['#2e8273','#c58b4c','#547aab'],P={left:74,right:18,top:18,bottom:36};
const csv=value=>String(value??'').includes(',')?'"'+String(value).replace(/"/g,'""')+'"':String(value??'');

export function createMotionPlot({container,onSeekUs=()=>{},onSelectTrace=()=>{},onExport,onFitTimeline,onViewChange=()=>{}}={}){
 if(!container)throw Error('运动曲线缺少工具窗容器');
 let W=560,H=235;
 const root=document.createElement('div');root.className='motion-plot';container.append(root);
 root.innerHTML='<div class="motion-plot-tools"><select data-motion-control="group" aria-label="运动曲线类型">'+Object.entries(names).map(([key,name])=>'<option value="'+key+'">'+name+'</option>').join('')+'</select><label><input type="checkbox" data-motion-control="follow" checked>跟随当前粒子</label><select data-motion-control="trace" aria-label="曲线粒子轨道"></select></div><div class="motion-plot-range"><label>从 <input type="number" min="0" step="any" data-motion-control="start" aria-label="曲线起始微秒时刻"></label><label>到 <input type="number" min="0" step="any" data-motion-control="end" aria-label="曲线结束微秒时刻"> μs</label><button type="button" data-motion-action="range">应用范围</button><button type="button" data-motion-action="full">全程</button>'+(onFitTimeline?'<button type="button" data-motion-action="timeline">时间轴窗口</button>':'')+'</div><div class="motion-plot-channels"></div><div class="motion-plot-viewport"><svg class="motion-plot-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" tabindex="0" role="img" aria-label="原生运动采样曲线，点击定位时刻"></svg><div class="motion-plot-empty" role="status"></div></div><div class="motion-plot-readout"></div><p class="motion-plot-note"></p><div class="motion-plot-export"><span>原生采样 · 最多1200点</span><button type="button" data-motion-action="csv">导出CSV</button><button type="button" data-motion-action="svg">导出SVG</button></div>';
 const q=selector=>root.querySelector(selector),svg=q('svg'),windowElement=container.closest('[data-workspace-window]');
 let state=null,series=null,sampledTrace=null,cacheKey='',traceList=null,axis=null,view={version:1,group:'velocity',follow:true,traceId:null,rangeUs:null,full:true,hiddenChannels:[]};
 const activeTrace=()=>{const id=view.follow?state?.selectedTraceId:view.traceId;return state?.traces?.find(trace=>trace.particle.traceId===id)||state?.traces?.[0]||null;};
 const emit=()=>onViewChange(snapshot());
 function range(){return view.rangeUs||{start:0,end:state?.scene?.duration||1};}
 function syncControls(){
  q('[data-motion-control=group]').value=view.group;q('[data-motion-control=follow]').checked=view.follow;q('[data-motion-control=trace]').disabled=view.follow;
  const trace=activeTrace();q('[data-motion-control=trace]').value=trace?.particle.traceId||'';
  for(const key of ['start','end'])if(document.activeElement!==q('[data-motion-control='+key+']'))q('[data-motion-control='+key+']').value=fmt(range()[key]);
 }
 function compute(){
  const trace=activeTrace(),r=range(),key=[view.group,r.start,r.end].join('|');if(sampledTrace===trace&&key===cacheKey)return;
  sampledTrace=trace;cacheKey=key;series=trace?sampleMotionSeries(trace,{rangeUs:r,group:view.group,maxPoints:1200}):null;render();
 }
 function render(){
  const empty=q('.motion-plot-empty'),channels=series?.channels||[];
  const port=q('.motion-plot-viewport');if(port.clientWidth&&port.clientHeight){W=port.clientWidth;H=port.clientHeight;svg.setAttribute('viewBox','0 0 '+W+' '+H);}
  q('.motion-plot-channels').innerHTML=channels.map((channel,index)=>'<label style="--motion-channel:'+colors[index%colors.length]+'"><input type="checkbox" data-motion-channel="'+esc(channel.key)+'" '+(view.hiddenChannels.includes(channel.key)?'':'checked')+'><i></i>'+esc(channel.label)+' <small>'+esc(channel.unit)+'</small></label>').join('');
  const shown=channels.filter(channel=>!view.hiddenChannels.includes(channel.key)),points=series?.chunks.flatMap(chunk=>chunk.points)||[],numbers=points.flatMap(point=>shown.map(channel=>point.values[channel.key])).filter(Number.isFinite);
  const valid=!!points.length&&!!numbers.length&&!series?.limited;empty.hidden=valid;empty.textContent=series?.reason||(!activeTrace()?'先添加参与仿真的粒子。':!shown.length?'选择至少一条曲线。':'当前窗口没有已计算的运动数据。');
  if(series?.limited)empty.textContent+=' 最少需要 '+series.minimumRequiredPoints+' 点；请缩小时间范围。';
  q('[data-motion-action=csv]').disabled=!valid;q('[data-motion-action=svg]').disabled=!valid;
  q('.motion-plot-note').textContent=[series?.availableRangeUs?'数据范围 '+fmt(series.availableRangeUs.start)+'–'+fmt(series.availableRangeUs.end)+' μs。':'',series?.truncated?'轨迹未算到观察终点。':'',view.group==='energy'?'电场功按 K(t)−K(出生) 显示，采用功能关系，未作独立功积分证明。':'曲线连接原生采样点；场域或换向切口保持分段。',...(series?.limitations||[])].filter(Boolean).join(' ');
  if(!valid){svg.replaceChildren();axis=null;cursor();return;}
  let min=Math.min(...numbers),max=Math.max(...numbers);if(min===max){const pad=min===0?1:Math.abs(min)*.1;min-=pad;max+=pad;}else{const pad=(max-min)*.08;min-=pad;max+=pad;}
  const r=range(),span=Math.max(Number.EPSILON,r.end-r.start),x=time=>P.left+(time-r.start)/span*(W-P.left-P.right),y=value=>H-P.bottom-(value-min)/(max-min)*(H-P.top-P.bottom);axis={x,y,min,max,range:r};
  let markup='<rect width="'+W+'" height="'+H+'" fill="white"/><g class="motion-plot-grid">';
  for(let index=0;index<=4;index++){const value=min+(max-min)*index/4,at=y(value);markup+='<path d="M'+P.left+' '+at+'H'+(W-P.right)+'"/><text x="'+(P.left-8)+'" y="'+(at+4)+'" text-anchor="end">'+esc(fmt(value))+'</text>';}
  for(let index=0;index<=5;index++){const time=r.start+span*index/5,at=x(time);markup+='<path d="M'+at+' '+P.top+'V'+(H-P.bottom)+'"/><text x="'+at+'" y="'+(H-14)+'" text-anchor="middle">'+esc(fmt(time))+'</text>';}
  markup+='</g><text class="motion-plot-unit" x="'+P.left+'" y="12">'+esc(channels[0]?.unit||'')+'</text><text class="motion-plot-unit" x="'+(W-P.right)+'" y="'+(H-2)+'" text-anchor="end">时间 / μs</text>';
  shown.forEach(channel=>{const color=colors[channels.indexOf(channel)%colors.length];for(const [chunkIndex,chunk] of series.chunks.entries()){
   const finitePoints=chunk.points.filter(point=>Number.isFinite(point.values[channel.key]));
   // Each native chunk starts a new path; no straight line bridges a force jump.
   markup+='<path class="motion-plot-line" d="'+finitePoints.map((point,index)=>(index?'L':'M')+x(point.timeUs)+' '+y(point.values[channel.key])).join('')+'" stroke="'+color+'"/>';
   const endpoints=finitePoints.length===1?finitePoints:view.group==='force'?[finitePoints[0],finitePoints.at(-1)].filter(Boolean):[];
   for(const point of endpoints){const pointIndex=chunk.points.indexOf(point);markup+='<circle class="motion-plot-point" cx="'+x(point.timeUs)+'" cy="'+y(point.values[channel.key])+'" r="3.5" fill="'+color+'" data-motion-chunk="'+chunkIndex+'" data-motion-point="'+pointIndex+'"><title>'+esc(channel.label+' '+fmt(point.values[channel.key])+' '+channel.unit+' · '+fmt(point.timeUs)+' μs · '+point.side)+'</title></circle>';}
  }});
  svg.innerHTML=markup+'<path class="motion-plot-cursor" d=""/>';cursor();
 }
 function cursor(){
  if(!state)return;const trace=activeTrace(),reading=trace?readMotionState(trace,state.timeUs*1e-6,{side:state.readingSide||'after'}):null,node=q('.motion-plot-cursor');
  if(node&&axis){const at=axis.x(state.timeUs);node.toggleAttribute('hidden',state.timeUs<axis.range.start||state.timeUs>axis.range.end);node.setAttribute('d','M'+at+' '+P.top+'V'+(H-P.bottom));}
  let values=null;if(reading?.available){const s=reading.state,K=s.segment.m*norm(s.v)**2/2/E;
   if(view.group==='position')values={x:s.p[0]*100,y:s.p[1]*100};
   if(view.group==='velocity')values={vx:s.v[0]/1e5,vy:s.v[1]/1e5,speed:norm(s.v)/1e5};
   if(view.group==='energy'){const birth=readMotionState(trace,trace.particle.birth,{side:'after'});values={K,WE:birth.available?K-birth.state.segment.m*norm(birth.state.v)**2/2/E:undefined};}
   if(view.group==='force'&&reading.dynamicsAvailable){const force=forcesAt(s.segment,s.v,s.local).total;values={Fx:force[0],Fy:force[1],magnitude:norm(force)};}
  }
  q('.motion-plot-readout').innerHTML='<strong>'+fmt(state.timeUs)+' μs · '+(state.readingSide==='before'?'前侧':'后侧')+'</strong>'+(values?(series?.channels||[]).filter(channel=>!view.hiddenChannels.includes(channel.key)).map(channel=>'<span>'+esc(channel.label)+' <b>'+fmt(values[channel.key])+'</b> '+esc(channel.unit)+'</span>').join(''):'<span>'+esc(reading?.reason||'当前侧没有可用读数。')+'</span>');
 }
 function update(next){const changed=state?.traces!==next.traces;state={...state,...next};if(view.full||!view.rangeUs)view.rangeUs={start:0,end:state.scene?.duration||1};
  if(changed||traceList!==state.traces){traceList=state.traces;q('[data-motion-control=trace]').innerHTML=(state.traces||[]).map(trace=>'<option value="'+esc(trace.particle.traceId)+'">'+esc(trace.particle.label||trace.particle.traceId)+'</option>').join('');sampledTrace=null;}
  syncControls();if(!windowElement?.hidden)compute();cursor();
 }
 function setRange(value,full=false){if(!Number.isFinite(value?.start)||!Number.isFinite(value?.end)||value.start<0||value.end<=value.start){q('.motion-plot-note').textContent='请填写非负起点，且终点大于起点。';return;}view.rangeUs={start:value.start,end:value.end};view.full=full;syncControls();compute();emit();}
 function exportData(type){if(!series?.chunks.length||series.limited)return;let value,name;if(type==='text/csv'){const channels=series.channels.filter(channel=>!view.hiddenChannels.includes(channel.key));value='\ufeff'+['traceId,segmentIndex,timeUs,side,'+channels.map(channel=>csv(channel.key+' / '+channel.unit+(channel.key==='WE'?' (K(t)-K(birth))':''))).join(','),...series.chunks.flatMap(chunk=>chunk.points.map(point=>[sampledTrace.particle.traceId,chunk.segmentIndex,point.timeUs,point.side,...channels.map(channel=>point.values[channel.key])].map(csv).join(',')))].join('\r\n');name='原生运动_'+view.group+'.csv';}else{value='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -48 '+W+' '+(H+48)+'"><style>.motion-plot-line{fill:none;stroke-width:1.8}.motion-plot-grid path{fill:none;stroke:#e0e9e4;stroke-width:.7}text{font:11px Microsoft YaHei,Arial;fill:#4d6b5b}.motion-plot-cursor{stroke:#556f7c;stroke-dasharray:4 3}</style><text x="'+P.left+'" y="-31">'+esc(names[view.group]+' · '+(sampledTrace.particle.label||sampledTrace.particle.traceId)+' · 原生采样')+'</text>'+series.channels.filter(channel=>!view.hiddenChannels.includes(channel.key)).map((channel,index)=>'<text x="'+(P.left+index*150)+'" y="-11" style="fill:'+colors[series.channels.indexOf(channel)%colors.length]+'">'+esc(channel.label+' / '+channel.unit)+'</text>').join('')+svg.innerHTML+'</svg>';name='原生运动_'+view.group+'.svg';}
  if(onExport)onExport({value,name,type});else{const url=URL.createObjectURL(new Blob([value],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 }
 function click(event){const button=event.target.closest('[data-motion-action]');if(!button)return;const action=button.dataset.motionAction;if(action==='range')setRange({start:Number(q('[data-motion-control=start]').value),end:Number(q('[data-motion-control=end]').value)});if(action==='full')setRange({start:0,end:state?.scene?.duration||1},true);if(action==='timeline'){const value=onFitTimeline?.();if(value)setRange({start:value.startUs??value.start,end:value.endUs??value.end});}if(action==='csv')exportData('text/csv');if(action==='svg')exportData('image/svg+xml');}
 function change(event){const node=event.target,key=node.dataset.motionControl;if(key==='group'){view.group=node.value;view.hiddenChannels=[];compute();emit();}if(key==='follow'){const current=activeTrace();view.follow=node.checked;if(!view.follow)view.traceId=current?.particle.traceId||null;syncControls();compute();emit();}if(key==='trace'){view.traceId=node.value;view.follow=false;onSelectTrace(view.traceId);syncControls();compute();emit();}if(node.dataset.motionChannel){view.hiddenChannels=node.checked?view.hiddenChannels.filter(key=>key!==node.dataset.motionChannel):[...new Set([...view.hiddenChannels,node.dataset.motionChannel])];render();emit();}}
 function seek(event){if(!axis)return;const point=event.target.closest('[data-motion-point]');if(point){const value=series.chunks[Number(point.dataset.motionChunk)]?.points[Number(point.dataset.motionPoint)];if(value)onSeekUs(value.timeUs,{side:view.group==='force'&&['before','after'].includes(value.side)?value.side:'after'});return;}const location=svg.createSVGPoint();location.x=event.clientX;location.y=event.clientY;const at=location.matrixTransform(svg.getScreenCTM().inverse()),time=axis.range.start+(at.x-P.left)/(W-P.left-P.right)*(axis.range.end-axis.range.start);if(at.x>=P.left&&at.x<=W-P.right)onSeekUs(Math.max(axis.range.start,Math.min(axis.range.end,time)),{side:'after'});}
 const visibility=new MutationObserver(()=>{if(!windowElement?.hidden&&state)compute();});if(windowElement)visibility.observe(windowElement,{attributes:true,attributeFilter:['hidden']});
 const resize=new ResizeObserver(()=>{const port=q('.motion-plot-viewport');if(series&&!windowElement?.hidden&&(port.clientWidth!==W||port.clientHeight!==H))render();});resize.observe(q('.motion-plot-viewport'));
 root.addEventListener('click',click);root.addEventListener('change',change);svg.addEventListener('click',seek);
 function snapshot(){return structuredClone(view);}
 function restore(value){if(value?.version!==1)return;if(Object.hasOwn(names,value.group))view.group=value.group;if(typeof value.follow==='boolean')view.follow=value.follow;if(typeof value.traceId==='string')view.traceId=value.traceId;if(Array.isArray(value.hiddenChannels))view.hiddenChannels=value.hiddenChannels.filter(key=>typeof key==='string');if(typeof value.full==='boolean')view.full=value.full;if(Number.isFinite(value.rangeUs?.start)&&Number.isFinite(value.rangeUs?.end)&&value.rangeUs.end>value.rangeUs.start&&value.rangeUs.start>=0)view.rangeUs={...value.rangeUs};syncControls();cacheKey='';if(state&&!windowElement?.hidden)compute();}
 return {update,snapshot,restore,destroy(){visibility.disconnect();resize.disconnect();root.removeEventListener('click',click);root.removeEventListener('change',change);svg.removeEventListener('click',seek);root.remove();}};
}
