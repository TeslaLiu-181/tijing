import {tex} from './lorentz-math.mjs';
import {validateParameterSlider,resolveParameterSlider} from './planar-parameter-slider.mjs';

const unitNames={speed:'10⁵ m/s',deg:'°',us:'μs',cm2:'cm²',m2:'m²','':'无量纲'};
let instances=0;

/** Returns a preference draft. The app performs one guarded mutation after confirmation. */
export function createParameterSliderDialog(){
 const id='parameter-slider-settings-'+(++instances),dialog=document.createElement('dialog');dialog.id=id;dialog.className='parameter-slider-dialog';
 dialog.innerHTML='<header><div><span>调节控件</span><h2>设置滑杆</h2></div><button type="button" data-slider-action="cancel" aria-label="关闭滑杆设置">×</button></header><p class="parameter-slider-purpose">范围和步长只用于滑杆与拖动微调，不改变当前值、单位或依赖。手动精确输入可以超出范围或刻度。</p><p class="parameter-slider-current"></p><form method="dialog"><div class="parameter-slider-settings-fields"><label for="'+id+'-min">最小值<input id="'+id+'-min" name="min" type="number" step="any" required></label><label for="'+id+'-max">最大值<input id="'+id+'-max" name="max" type="number" step="any" required></label><label for="'+id+'-step">滑动步长<input id="'+id+'-step" name="step" type="number" step="any" required></label></div><p class="parameter-slider-preview" role="status"></p><p class="parameter-slider-settings-error" role="alert" hidden></p><footer><button type="button" data-slider-action="auto">恢复自动范围</button><button type="button" data-slider-action="cancel">取消</button><button type="submit" class="primary">保存滑杆设置</button></footer></form>';
 document.body.append(dialog);const form=dialog.querySelector('form'),fields=Object.fromEntries(['min','max','step'].map(key=>[key,form.elements.namedItem(key)])),error=dialog.querySelector('.parameter-slider-settings-error'),preview=dialog.querySelector('.parameter-slider-preview');let parameter=null,done=null;
 const draft=()=>Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.valueAsNumber]));
 function update(){try{const slider=draft();validateParameterSlider(slider);const state=resolveParameterSlider({...parameter,slider});error.hidden=true;error.textContent='';preview.textContent='步长以最小值为起点；末刻度为 '+state.lastTick+'。'+(state.representable?'当前值可由滑杆表示。':state.reason)+' 保存设置不会把当前值改成最近刻度 '+state.nearest+'。';form.querySelector('[type=submit]').disabled=false;}catch(e){error.hidden=false;error.textContent=e.message;preview.textContent='';form.querySelector('[type=submit]').disabled=true;}}
 function finish(value){if(dialog.open)dialog.close();const resolve=done;done=null;parameter=null;resolve?.(value);}
 dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
 dialog.addEventListener('click',event=>{const button=event.target.closest('[data-slider-action]');if(!button)return;event.preventDefault();finish(button.dataset.sliderAction==='auto'?undefined:null);});
 form.addEventListener('input',update);form.addEventListener('submit',event=>{event.preventDefault();try{const config=draft();validateParameterSlider(config);finish(config);}catch(e){error.hidden=false;error.textContent=e.message;}});
 const reset=()=>{finish(null);form.reset();dialog.querySelector('h2').textContent='设置滑杆';dialog.querySelector('.parameter-slider-current').textContent='';preview.textContent='';error.textContent='';error.hidden=true;};
 window.addEventListener('exam-private-reset',reset);
 return {dialog,open(object){reset();if(object?.kind!=='parameter')throw Error('仅自由参数可配置滑杆。');parameter={value:object.value,unit:object.unit||''};const state=resolveParameterSlider(object);dialog.querySelector('h2').innerHTML='设置 '+tex(object.label||object.id)+' 的滑杆';dialog.querySelector('.parameter-slider-current').textContent='当前精确值：'+object.value+' '+(unitNames[object.unit]??object.unit??'无量纲');fields.min.value=String(state.min);fields.max.value=String(state.max);fields.step.value=String(state.step==='any'?1:state.step);update();dialog.showModal();return new Promise(resolve=>done=resolve);},reset,destroy(){reset();window.removeEventListener('exam-private-reset',reset);dialog.remove();}};
}
