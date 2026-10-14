import {tex,num,quantity} from './lorentz-math.mjs';
import {norm} from './planar-physics.mjs';
import {fieldMarkDensity} from './planar-field-display.mjs';
const raw=String.raw;
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const math=value=>{try{return tex(value);}catch{return esc(value);}};
const signed=value=>(value>0?'+':'')+num(value,8);
const angle=vector=>{const d=Math.atan2(vector[1],vector[0])*180/Math.PI;return (d+360)%360;};
const directionB=value=>value>0?'⊙ 纸面外':value<0?'× 纸面内':'无方向';
const directionE=value=>norm(value)?`与 +x 轴成 ${Number(angle(value).toFixed(2))%360}°`:'无方向';
function emptyText(rows,zero){
 if(!rows.length)return '此处没有启用的同类场。';
 if(zero&&rows.some(o=>o.kind==='magnetic'?o.B!==0:norm(o.electric)>0))return '各场相消，合场为 0；画布此层留白。';
 return zero?'这些场在当前时刻均为 0。':'';
}
export function fieldProbeHTML(reading){
 const magnetic=reading.contributions.filter(c=>c.kind==='magnetic'),electric=reading.contributions.filter(c=>c.kind==='electric'),E=reading.electric,Esize=norm(E);
 const source=c=>`<button type="button" data-probe-object="${esc(c.id)}" title="查看此场的参数">${math(c.label)}</button>${!c.visible?'<small>外观已隐藏，仍参与合成</small>':''}`;
 const bRows=magnetic.map(c=>`<tr data-probe-contribution="${esc(c.id)}"><td>${source(c)}</td><td>${math(signed(c.B*1000)+raw`\,\mathrm{mT}`)}</td><td>${directionB(c.B)}</td></tr>`).join('');
 const eRows=electric.map(c=>`<tr data-probe-contribution="${esc(c.id)}"><td>${source(c)}</td><td>${math(raw`(${num(c.electric[0]/1000,8)},\,${num(c.electric[1]/1000,8)})`)}<small>${directionE(c.electric)}</small></td></tr>`).join('');
 const zeroB=emptyText(magnetic,reading.B===0),zeroE=emptyText(electric,Esize===0),limited=[['magnetic',Math.abs(reading.B)],['electric',Esize]].some(([kind,value])=>value&&reading.references[kind]&&fieldMarkDensity(value,reading.references[kind]).limited);
 // Named contributions avoid presenting a false exact equality when nearly
 // cancelling inputs require more digits than fit in the displayed rows.
 const bExpression=magnetic.length>1?math(raw`B_\Sigma=\sum_i B_i=${num(reading.B*1000,8)}\,\mathrm{mT}`):'';
 const Bsection=`<section class="probe-field-section"><h3>${reading.unavailable.length?'有效场的合磁场':'合磁场'}</h3><div class="probe-net" data-probe-net="magnetic" data-value="${reading.B}">${math(raw`B_\Sigma=${quantity(reading.B*1000,'mT',6)}`)}<span>${directionB(reading.B)}</span></div>${zeroB?`<p class="probe-zero">${zeroB}</p>`:''}${magnetic.length?`<table><thead><tr><th>来源</th><th>当前贡献</th><th>方向</th></tr></thead><tbody>${bRows}</tbody></table>`:''}${bExpression?`<div class="probe-equation">${bExpression}</div>`:''}</section>`;
 const Esection=`<section class="probe-field-section"><h3>${reading.unavailable.length?'有效场的合电场':'合电场'}</h3><div class="probe-net" data-probe-net="electric" data-ex="${E[0]}" data-ey="${E[1]}">${math(raw`\vec E_\Sigma=(${num(E[0]/1000,6)},\,${num(E[1]/1000,6)})\,\mathrm{kV/m}`)}</div><div class="probe-electric-size">${math(raw`|\vec E_\Sigma|=${quantity(Esize/1000,'kV/m',6)}`)}<span>${directionE(E)}</span></div>${zeroE?`<p class="probe-zero">${zeroE}</p>`:''}${electric.length?`<table><thead><tr><th>来源</th><th>当前 (Eₓ, Eᵧ) / kV·m⁻¹</th></tr></thead><tbody>${eRows}</tbody></table>`:''}</section>`;
 return `<div class="probe-position">${math(raw`(x,y)=(${num(reading.pointCm[0])},\,${num(reading.pointCm[1])})\,\mathrm{cm}`)}<span>${math(raw`t=${quantity(reading.timeUs,raw`\mu s`)}`)} · ${reading.side==='before'?'变化前一侧':'当前时刻'}</span></div>
 ${reading.unavailable.length?`<p class="probe-warning">${reading.unavailable.map(o=>esc(o.label)).join('、')} 的定义暂不可用，完整合场尚不能确定；下列读数只统计有效场。</p>`:''}
 ${electric.length&&!magnetic.length?Esection+Bsection:Bsection+Esection}
 ${reading.onBoundary?'<p class="probe-note">此点位于场域边界，按几何范围列出各场；粒子跨界前后的场强以对应运动段为准。</p>':''}
 <p class="probe-note">磁场按有向值相加，电场按矢量相加。边界与名称对应各场对象，点、叉和箭头表示合场。${limited?'此处已达到绘图疏密的显示范围，读数仍为实际数值。':'同类场按统一疏密标尺比较强弱。'}</p>`;
}
export function createFieldProbe({container,onLocate,onPick,onSelect}){
 let point=null,last='';container.classList.add('field-probe-content');
 container.innerHTML='<div class="probe-locate"><label>x / cm<input type="number" step="any" data-probe-x aria-label="探针 x 坐标" value="0"></label><label>y / cm<input type="number" step="any" data-probe-y aria-label="探针 y 坐标" value="0"></label><button type="button" data-probe-locate>查询</button><button type="button" data-probe-pick>点取</button></div><div class="probe-results"><p class="probe-empty">点按画布，查看该位置的合场与各场贡献。也可输入坐标查询。</p></div>';
 const results=container.querySelector('.probe-results'),x=container.querySelector('[data-probe-x]'),y=container.querySelector('[data-probe-y]');
 function locate(p){if(!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)))return;point=[...p];x.value=String(Number(p[0].toPrecision(9)));y.value=String(Number(p[1].toPrecision(9)));last='';onLocate(point);}
 function fromInputs(){for(const input of [x,y]){input.setCustomValidity(input.value.trim()===''||!Number.isFinite(Number(input.value))?'请输入有限数值坐标':'');if(!input.reportValidity())return;}locate([Number(x.value),Number(y.value)]);}
 container.addEventListener('click',event=>{if(event.target.closest('[data-probe-locate]'))fromInputs();if(event.target.closest('[data-probe-pick]'))onPick();const button=event.target.closest('[data-probe-object]');if(button)onSelect(button.dataset.probeObject);});
 container.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-probe-x],[data-probe-y]')){event.preventDefault();event.stopPropagation();fromInputs();}});
 return {get point(){return point;},locate,update(reading){if(!point)return;const signature=JSON.stringify(reading);if(signature===last)return;last=signature;results.innerHTML=fieldProbeHTML(reading);},reset(){point=null;last='';x.value=y.value='0';results.innerHTML='<p class="probe-empty">点按画布，查看该位置的合场与各场贡献。也可输入坐标查询。</p>';}};
}
