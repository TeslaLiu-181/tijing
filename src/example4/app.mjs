import {attachExamBridge} from '../exam/bridge.mjs';
import {SpatialScene} from './scene.mjs';
import {defaults,solveExample4,stateAt,milestones} from './physics.mjs';
import {tex,num,quantity} from '../lorentz-math.mjs';

const $=id=>document.getElementById(id),raw=String.raw;
let config={...defaults},result=solveExample4(config),time=0,playing=false,rate=1,last=performance.now(),lastText=0,scene;
const q=(value,unit)=>tex(quantity(value,unit)),metric=(name,value)=>`<div class="metric"><span>${name}</span><strong>${value}</strong></div>`;
function markView(name){document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$('view-hint').textContent=name==='front'?'运动平面正视 · B 指向纸内 · 拖动可继续旋转':name==='side'?'沿 x 方向三个界面重合；曲率分析请切回“运动平面”':name==='top'?'从上方观察空间位置；曲率分析请切回“运动平面”':'拖动旋转 · 滚轮缩放 · 右键平移';}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),2500);}
function controls(){
 for(const slider of document.querySelectorAll('[data-param-slider]'))slider.value=config[slider.dataset.paramSlider];
 $('beta').value=config.beta;$('beta-value').textContent=config.beta.toFixed(2);$('beta-status').textContent={critical:'临界',escape:'会穿出',return:'不穿出'}[result.status];
 document.querySelectorAll('[data-beta]').forEach(b=>b.classList.toggle('active',Math.abs(Number(b.dataset.beta)-config.beta)<1e-9));
 $('conclusion').textContent=result.status==='critical'?'B=B*：最右点与界面Ⅲ相切，随后返回界面Ⅱ。':result.status==='escape'?'B<B*：转弯半径偏大，粒子先穿过界面Ⅲ。':'B>B*：转弯半径变小，粒子在界面Ⅲ之前转回。';
 $('milestones').innerHTML=milestones(result).map((s,i)=>`<button data-step="${s.id}"><span>${i+1}</span>${s.label}</button>`).join('');
 $('formulas').innerHTML=tex(raw`E=\frac{mv_0^2}{qL}`,true)+tex(raw`v_{O_1}=\sqrt2v_0,\quad\theta=45^\circ`,true)+tex(raw`R+R\cos45^\circ=L`,true)+tex(raw`B^*=\frac{(\sqrt2+1)mv_0}{qL}`,true);
 $('field-values').innerHTML=metric('电场 E',q(result.electric/1000,'kV/m'))+metric('临界 B*',q(result.critical*1000,'mT'))+metric('当前 B',q(result.B*1000,'mT'));
}
function readouts(){const a=stateAt(result,time),atEnd=time>=result.total-1e-16,atTurn=result.reachesTurn&&Math.abs(time-result.tTurn)<result.total*1e-9;
 $('phase-tag').textContent=atEnd?'本段观察结束':atTurn?'最右位置':a.phase==='electric'?'电场阶段':'磁场阶段';
 $('phase-title').textContent=atEnd?(result.status==='escape'?'穿出界面Ⅲ':'返回电场边界'):atTurn?(result.status==='critical'?'临界相切':'到达最右点'):a.phase==='electric'?'匀加速偏转':'匀速圆周运动';
 $('position-readout').innerHTML=tex(raw`x=${num(Math.abs(a.p[0])<1e-10?0:a.p[0])}L,\ y=${num(Math.abs(a.p[1])<1e-10?0:a.p[1])}L,\ z=0`);
 $('metrics').innerHTML=metric('速率',q(a.speed/1e5,raw`10^5\,m/s`))+metric('分速度 / v₀',tex(raw`(${num(a.v[0])},\ ${num(a.v[1])},\ 0)`))+metric('动能',q(a.energy,'eV'))+metric('电场用时',q(Math.min(time,result.tE)*1e6,raw`\mu s`))+metric('磁场用时',q(Math.max(0,time-result.tE)*1e6,raw`\mu s`));
 $('play').textContent=playing?'暂停':'播放';$('timeline').value=Math.round(time/result.total*1000);$('time-label').innerHTML=tex(raw`t=${quantity(time*1e6,raw`\mu s`)}\;/\;${texSafeTotal()}`);
 document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',Math.abs(time-milestones(result).find(s=>s.id===b.dataset.step).time)<result.total*1e-8));
}
function texSafeTotal(){return quantity(result.total*1e6,raw`\mu s`);}
function setTime(t){time=Math.max(0,Math.min(result.total,t));scene.updateTime(time);readouts();}
function changeConfig(values){const next={...config,...values};try{const solved=solveExample4(next);config=next;result=solved;playing=false;time=0;scene.rebuild(result);controls();readouts();}catch(e){toast(e.message);for(const e of document.querySelectorAll('[data-param]'))e.value=config[e.dataset.param];}}
function nextKey(){return milestones(result).find(s=>s.time>time+result.total*1e-9);}
try{scene=new SpatialScene($('scene'),markView);scene.rebuild(result);}catch(error){$('render-error').hidden=false;$('render-error').textContent='无法启动三维画面。请使用支持 WebGL 2 的 Edge 或 Chrome，并启用浏览器硬件加速。'+error.message;throw error;}
if(innerWidth<800){document.body.classList.add('panel-hidden');$('toggle-panel').textContent='显示讲解';$('toggle-panel').setAttribute('aria-expanded','false');}
controls();readouts();
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
 if(b.id==='parameters-toggle'){document.body.classList.remove('panel-hidden');$('toggle-panel').textContent='收起讲解';$('toggle-panel').setAttribute('aria-expanded','true');$('spatial-parameters').open=true;$('spatial-parameters').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});return;}
 if(b.id==='spatial-inspector-close'){$('toggle-panel').click();return;}
 if(b.dataset.view){scene.setView(b.dataset.view);return;}
 if(b.dataset.projection){scene.setProjection(b.dataset.projection);document.querySelectorAll('[data-projection]').forEach(x=>x.classList.toggle('active',x===b));return;}
 if(b.dataset.beta){changeConfig({beta:Number(b.dataset.beta)});return;}
 if(b.dataset.step){playing=false;const step=milestones(result).find(x=>x.id===b.dataset.step);if(step.id==='turn'){document.querySelector('[data-show="geometry"]').checked=true;scene.setOptions({geometry:true});}setTime(step.time);return;}
 switch(b.id){case 'play':if(time>=result.total-1e-16)setTime(0);playing=!playing;last=performance.now();readouts();break;case 'reset':playing=false;setTime(0);break;case 'next':playing=false;setTime(nextKey()?.time??result.total);break;case 'fit':scene.fit();break;case 'zoom-in':scene.zoom(1.2);break;case 'zoom-out':scene.zoom(1/1.2);break;case 'toggle-panel':{const hidden=document.body.classList.toggle('panel-hidden');b.textContent=hidden?'显示讲解':'收起讲解';b.setAttribute('aria-expanded',String(!hidden));break;}case 'fullscreen':if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen();break;case 'reset-all':changeConfig(defaults);for(const input of document.querySelectorAll('[data-param]'))input.value=config[input.dataset.param];break;}
});
document.addEventListener('change',event=>{const e=event.target;if(e.dataset.paramSlider){const field=document.querySelector('[data-param="'+e.dataset.paramSlider+'"]');field.value=e.value;field.dispatchEvent(new Event('change',{bubbles:true}));return;}if(e.dataset.show){scene.setOptions({[e.dataset.show]:e.checked});scene.updateTime(time);}if(e.dataset.param){if(!e.validity.valid||e.value===''){toast('请输入允许范围内的正数');e.value=config[e.dataset.param];return;}changeConfig({[e.dataset.param]:Number(e.value)});}if(e.id==='rate')rate=Number(e.value);});
document.addEventListener('input',event=>{const e=event.target;if(e.id==='timeline'){playing=false;setTime(Number(e.value)/1000*result.total);}if(e.id==='beta')changeConfig({beta:Number(e.value)});if(e.dataset.paramSlider){const next=Number(e.value);if(Number.isFinite(next)){document.querySelector('[data-param="'+e.dataset.paramSlider+'"]').value=e.value;changeConfig({[e.dataset.paramSlider]:next});}}});
document.addEventListener('keydown',event=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(event.code==='Space'){event.preventDefault();$('play').click();}if(event.key.toLowerCase()==='r')$('reset').click();});
document.addEventListener('keydown',event=>{if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;const views={'1':'spatial','2':'front','3':'top','4':'side'};if(views[event.key]){event.preventDefault();scene.setView(views[event.key]);}else if(event.key.toLowerCase()==='f')$('fit').click();else if(event.key.toLowerCase()==='i')$('toggle-panel').click();});
for(const [id,title] of [['fit','适配画面 · F'],['toggle-panel','显示 / 收起讲解 · I'],['reset','回到初态 · R']])$(id).title=title;
function loadExamSnapshot(snapshot){
 const c=snapshot.context||{},refit=c.viewport?(Math.abs(innerWidth/c.viewport.width-1)>.2||Math.abs(innerHeight/c.viewport.height-1)>.2):innerWidth<800;scene.externalCameraLoaded=!!c.camera&&!refit;changeConfig(snapshot.scene.config);playing=false;
 if(['ortho','perspective'].includes(c.projection)){scene.setProjection(c.projection);document.querySelectorAll('[data-projection]').forEach(b=>b.classList.toggle('active',b.dataset.projection===c.projection));}
 if(c.view&&c.view!=='free')scene.setView(c.view);
 if(c.camera){scene.camera.position.fromArray(c.camera.position);scene.camera.up.fromArray(c.camera.up);scene.controls.target.fromArray(c.camera.target);scene.camera.zoom=c.camera.zoom;if(c.camera.extent)scene.extent=c.camera.extent;scene.camera.updateProjectionMatrix();scene.controls.update();scene.mode=c.view||'free';markView(scene.mode);}
 if(c.show){scene.setOptions(c.show);for(const e of document.querySelectorAll('[data-show]'))e.checked=!!scene.viewOptions[e.dataset.show];}
 const panelOpen=c.panelClosed===false&&innerWidth>=800&&!matchMedia('(pointer:coarse)').matches;document.body.classList.toggle('panel-hidden',!panelOpen);$('toggle-panel').textContent=panelOpen?'收起讲解':'显示讲解';$('toggle-panel').setAttribute('aria-expanded',String(panelOpen));
 if(c.autoPause!==undefined)$('auto-pause').checked=!!c.autoPause;
 for(const e of document.querySelectorAll('[data-param]'))e.value=config[e.dataset.param];
 setTime((Number(c.timeUs)||0)*1e-6);scene.resize();if(refit)scene.fit();scene.render();
}
if(window.__EXAM_INITIAL_SNAPSHOT__)loadExamSnapshot(window.__EXAM_INITIAL_SNAPSHOT__);
attachExamBridge({
 // Keep the spatial controls reachable when the host merges all top bars.
 toolbarState:()=>({kind:'example4',actions:[{id:'reset',label:'恢复题设',enabled:true},{id:'parameters',label:'演示参数',enabled:true},{id:'explanation',label:document.body.classList.contains('panel-hidden')?'显示讲解':'收起讲解',enabled:true}]}),
 toolbarAction:action=>{const target={reset:'reset-all',parameters:'parameters-toggle',explanation:'toggle-panel'}[action];if(!target)throw Error('空间场景不支持这项操作');$(target).click();},
 snapshot:()=>({scene:{format:'example4-model/1',config:{...config}},context:{timeUs:time*1e6,playing,projection:scene.projection,view:scene.mode,viewport:{width:innerWidth,height:innerHeight},camera:{position:scene.camera.position.toArray(),target:scene.controls.target.toArray(),up:scene.camera.up.toArray(),zoom:scene.camera.zoom,extent:scene.extent},show:{...scene.viewOptions},panelClosed:document.body.classList.contains('panel-hidden'),autoPause:$('auto-pause').checked}}),
 load:loadExamSnapshot,flush:()=>{scene.resize();scene.render();},pause:()=>{playing=false;readouts();},presentation:enabled=>{document.body.classList.toggle('panel-hidden',!!enabled);}
});
function frame(now){if(playing){let t=Math.min(result.total,time+Math.min((now-last)/1000,.1)*result.total/9*rate);const next=nextKey();if($('auto-pause').checked&&next&&t>=next.time){t=next.time;playing=false;}time=t;if(time>=result.total)playing=false;scene.updateTime(time);if(!playing||now-lastText>100){readouts();lastText=now;}}last=now;scene.render();requestAnimationFrame(frame);}requestAnimationFrame(frame);
