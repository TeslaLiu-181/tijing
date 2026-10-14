import {resolveParameterSlider} from './planar-parameter-slider.mjs';

const modes=new Set(['pingpong','loop']),unitNames={speed:'10⁵ m/s',deg:'°',us:'μs',cm2:'cm²',m2:'m²','':'无量纲'};
let instances=0;
const same=(a,b)=>Math.abs(a-b)<=16*Number.EPSILON*Math.max(Math.abs(a),Math.abs(b),Number.MIN_VALUE);

/** A scan uses existing display-unit ticks. It never clips or normalizes model data. */
export function parameterPlaybackTarget(scene,id){
 const object=scene?.objects?.find(object=>object.id===id);
 if(object?.kind!=='parameter')throw Error('请选择仍存在的自由参数。');
 if(object.defs?.value||object.construction)throw Error('此参数由依赖定义控制；扫描只允许自由输入的参数。');
 const slider=resolveParameterSlider(object);
 if(!slider.configured)throw Error('请先设置固定滑杆范围和步长，再扫描此参数。');
 if(!Number.isFinite(object.value)||!slider.representable)throw Error(slider.reason||'当前参数值不在固定滑杆刻度上。');
 const count=Math.round((slider.lastTick-slider.min)/slider.step),index=Math.round((object.value-slider.min)/slider.step);
 if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(index))throw Error('滑杆刻度数量超出可精确扫描的范围，请调整步长。');
 return {id,object,min:slider.min,max:slider.max,step:slider.step,lastTick:slider.lastTick,count,index,value:object.value,unit:object.unit||''};
}

/** Endpoints occur once: ping-pong reverses; a loop wraps to the first tick. */
export function nextParameterPlaybackTick({index,count,direction=1,mode}){
 if(!modes.has(mode)||!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(index)||index<0||index>count||![1,-1].includes(direction))throw Error('扫描刻度状态无效。');
 if(mode==='loop')return {index:index===count?0:index+1,direction:1};
 if(index===count)direction=-1;else if(index===0)direction=1;
 return {index:index+direction,direction};
}

/** Synchronous native callbacks keep each scan in the app's single undo transaction. */
export function createParameterPlayback({scene,onStart,onStep,onStop,onState=()=>{},onConfigureSlider=()=>{}}={}){
 if(typeof scene!=='function'||[onStart,onStep,onStop].some(callback=>typeof callback!=='function'))throw Error('参数扫描缺少场景或同步更新接口。');
 const id='parameter-playback-'+(++instances),dialog=document.createElement('dialog');dialog.id=id;dialog.className='parameter-playback-dialog';
 dialog.innerHTML='<header><div><span>逐刻度观察</span><h2>扫描播放</h2></div><button type="button" data-scan-action="close" aria-label="关闭扫描设置">×</button></header><p class="parameter-playback-purpose">扫描初态，各取值分别演算；不是时变场耦合。扫描会暂停运动播放，每个刻度按手动调参规则重算完整轨迹。</p><p class="parameter-playback-target"></p><form novalidate><label for="'+id+'-mode">播放方式<select id="'+id+'-mode" name="mode"><option value="pingpong">往返 · 到边界后反向</option><option value="loop">循环 · 末刻度回到首刻度</option></select></label><label for="'+id+'-interval">每步间隔（秒）<input id="'+id+'-interval" name="interval" type="number" min="0.15" step="any" value="0.25"></label><p class="parameter-playback-grid"></p><p class="parameter-playback-error" role="alert" hidden></p><footer><button type="button" data-scan-action="configure">设置滑杆</button><button type="button" data-scan-action="close">关闭</button><button type="submit" class="primary">开始扫描</button></footer></form>';
 const element=document.createElement('section');element.className='parameter-playback-status';element.hidden=true;element.setAttribute('aria-label','参数扫描状态');element.innerHTML='<button type="button" class="parameter-playback-dismiss" data-scan-action="dismiss" aria-label="关闭扫描状态" hidden>×</button><div><strong></strong><p class="parameter-playback-value" role="status" aria-live="polite"></p><p class="parameter-playback-explanation">扫描初态，各取值分别演算；不是时变场耦合。依赖暂时未定义时保留提示，下一有效刻度可恢复。</p></div><div class="parameter-playback-status-actions"><button type="button" data-scan-action="stop">停止 · 保留当前值</button><button type="button" data-scan-action="restore">停止并恢复扫描前值</button></div>';
 document.body.append(dialog,element);const form=dialog.querySelector('form'),modeInput=form.elements.namedItem('mode'),intervalInput=form.elements.namedItem('interval'),error=dialog.querySelector('.parameter-playback-error');
 let preferences={mode:'pingpong',interval:.25,lastId:null},selected=null,active=null,timer=null,destroyed=false,lastState={running:false,phase:'idle',id:null,value:null,mode:'pingpong',interval:.25,reason:''};
 const readValue=run=>scene()?.objects?.find(object=>object.id===run?.id)?.value;
 const synchronous=(value)=>{if(value&&typeof value.then==='function')throw Error('扫描更新接口必须同步完成。');};
 function emit(phase,reason=''){
  const run=active;lastState={running:!!run,phase,id:run?.id??lastState.id,value:run?readValue(run):lastState.value,mode:run?.mode??preferences.mode,interval:run?.interval??preferences.interval,reason};
  element.hidden=phase==='idle';element.dataset.running=String(lastState.running);element.querySelector('strong').textContent=lastState.running?'扫描初态 · '+(run.label||run.id):'扫描已停止';
  const suffix=run?(' '+(unitNames[run.unit]??run.unit)):'';element.querySelector('.parameter-playback-value').textContent=(lastState.value===null?'':'当前刻度：'+lastState.value+suffix)+(reason?' · '+reason:'');
  element.querySelector('.parameter-playback-status-actions').hidden=!lastState.running;element.querySelector('.parameter-playback-dismiss').hidden=lastState.running;onState({...lastState});
 }
 function currentTarget(run){
  const target=parameterPlaybackTarget(scene(),run.id);
  if(['min','max','step','unit'].some(key=>target[key]!==run[key]))throw Error('参数单位、滑杆范围或步长已改变，扫描已停止。');
  if(!same(target.value,run.value))throw Error('参数值已由其他操作改变，扫描已停止。');
  return target;
 }
 function stop({restore=false,reason=''}={}){
  if(timer!==null){clearTimeout(timer);timer=null;}
  const run=active;if(!run)return;active=null;
  lastState={...lastState,id:run.id,value:readValue(run)};
  try{synchronous(onStop({id:run.id,restore:!!restore,initialValue:run.initialValue,value:lastState.value,mode:run.mode,interval:run.interval,reason}));}
  catch(e){reason=reason?reason+'；'+e.message:e.message;}
  lastState.value=readValue(run);emit('stopped',reason|| (restore?'已恢复扫描前参数值；保留视图改动。':'保留当前参数值。'));if(dialog.open)updateDialog();
 }
 function schedule(run){
  if(active!==run)return;const started=performance.now(),delay=run.interval*1000;
  const wait=()=>{if(active!==run)return;const remaining=delay-(performance.now()-started);if(remaining>1){timer=setTimeout(wait,Math.min(remaining,2147483647));return;}timer=null;tick(run);};
  emit('waiting');if(active===run)timer=setTimeout(wait,Math.min(delay,2147483647));
 }
 function tick(run){
  if(active!==run)return;
  try{
   currentTarget(run);const next=nextParameterPlaybackTick(run),value=next.index===run.count?run.lastTick:run.min+next.index*run.step;
   emit('stepping');if(active!==run)return;synchronous(onStep({id:run.id,value}));if(active!==run)return;
   run.index=next.index;run.direction=next.direction;run.value=value;currentTarget(run);schedule(run);
  }catch(e){stop({reason:e.message});}
 }
 function draft(){const interval=intervalInput.valueAsNumber,mode=modeInput.value;if(!modes.has(mode)||!Number.isFinite(interval)||interval<.15||!Number.isFinite(interval*1000))throw Error('每步间隔须为有限数值，且至少为 0.15 秒。');return {mode,interval};}
 function updateDialog(){
  let reason='';try{draft();const target=parameterPlaybackTarget(scene(),selected);dialog.querySelector('.parameter-playback-target').textContent=(target.object.label||target.id)+' ['+target.id+'] · 当前值 '+target.value+' '+(unitNames[target.unit]??target.unit);dialog.querySelector('.parameter-playback-grid').textContent='固定范围 '+target.min+'–'+target.max+'，步长 '+target.step+'，末刻度 '+target.lastTick+'。从当前刻度开始；尚未启动时不改变参数。';if(active)reason='另一次扫描正在运行，请先停止。';}catch(e){reason=e.message;dialog.querySelector('.parameter-playback-grid').textContent='不自动猜测范围，也不把当前值改成最近刻度。';}
  error.textContent=reason;error.hidden=!reason;form.querySelector('[type="submit"]').disabled=!!reason;modeInput.disabled=intervalInput.disabled=!!active;
 }
 function start(){
  if(destroyed||active)return;try{
   const options=draft(),target=parameterPlaybackTarget(scene(),selected);preferences={...options,lastId:target.id};
   const run={...target,...options,initialValue:target.value,label:target.object.label||target.id,direction:1};delete run.object;active=run;emit('starting');
   if(active!==run)return;synchronous(onStart({id:run.id,mode:run.mode,interval:run.interval,min:run.min,max:run.max,step:run.step,lastTick:run.lastTick,initialValue:run.initialValue}));
   if(active!==run)return;currentTarget(run);dialog.close();schedule(run);
  }catch(e){if(active)stop({reason:e.message});error.textContent=e.message;error.hidden=false;}
 }
 function click(event){const button=event.target.closest('[data-scan-action]');if(!button)return;event.preventDefault();const action=button.dataset.scanAction;if(action==='close')dialog.close();else if(action==='dismiss')emit('idle');else if(action==='stop'||action==='restore')stop({restore:action==='restore'});else if(action==='configure'){if(active)stop();dialog.close();onConfigureSlider(selected);}}
 dialog.addEventListener('click',click);element.addEventListener('click',click);form.addEventListener('input',()=>{try{preferences={...preferences,...draft()};}catch{}updateDialog();});form.addEventListener('submit',event=>{event.preventDefault();start();});
 dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
 function reset(){stop({reason:'场景已切换或已退出，扫描停止。'});selected=null;if(dialog.open)dialog.close();lastState={...lastState,id:null,value:null};emit('idle');dialog.querySelector('.parameter-playback-target').textContent='';dialog.querySelector('.parameter-playback-grid').textContent='';error.textContent='';error.hidden=true;}
 window.addEventListener('exam-private-reset',reset);
 return {dialog,element,close(){if(dialog.open)dialog.close();if(!active)emit('idle');},open(parameterId){if(destroyed)return;selected=parameterId;dialog.querySelector('.parameter-playback-target').textContent='参数 ['+parameterId+']';modeInput.value=preferences.mode;intervalInput.value=String(preferences.interval);updateDialog();if(!dialog.open)dialog.showModal();},stop,isRunning:()=>!!active,snapshot:()=>({...preferences}),restore(value){if(!value||typeof value!=='object')return;preferences={mode:modes.has(value.mode)?value.mode:'pingpong',interval:Number.isFinite(value.interval)&&value.interval>=.15&&Number.isFinite(value.interval*1000)?value.interval:.25,lastId:typeof value.lastId==='string'?value.lastId:null};if(dialog.open){modeInput.value=preferences.mode;intervalInput.value=String(preferences.interval);updateDialog();}},destroy(){if(destroyed)return;reset();destroyed=true;window.removeEventListener('exam-private-reset',reset);dialog.remove();element.remove();}};
}
