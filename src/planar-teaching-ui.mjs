import {lessons} from './planar-lessons.mjs';
import {teachingState,midpointConstruction,motionStages,stageName} from './planar-teaching.mjs';
import {E,norm} from './planar-physics.mjs';
import {tex,num,quantity} from './lorentz-math.mjs';
const raw=String.raw,esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const q=(n,u)=>tex(quantity(n,u)),row=(label,value)=>`<div class="teach-readout"><span>${label}</span><strong>${value}</strong></div>`;

export function teachingPanel(model,traces,ui){
 const cfg=model.teaching,meta=lessons.find(l=>l.id===model.lesson),trace=traces.find(t=>t.particle.traceId===ui.trace)||traces[0];
 let out=`<div class="lesson-heading"><span>专题强化 6</span><h2>组合场 · 过程与几何</h2><p>分阶段，找边界速度，连接运动轨迹。</p></div><label class="small-label" for="lesson-select">逐题场景</label><select id="lesson-select" class="full-select"><option value="">选择题目…</option>${lessons.map(l=>`<option value="${l.id}" ${model.lesson===l.id?'selected':''}>${l.title}</option>`).join('')}</select><div class="lesson-presets">${lessons.filter(l=>l.preset).map(l=>`<button data-lesson="${l.id}">${l.id==='ex2'?'偏转后入磁场':l.id==='p2'?'三级组合场':'反复进出场'}</button>`).join('')}</div>`;
 if(meta){out+=`<div class="lesson-card"><h3>${meta.title}</h3><p>${meta.condition}</p><p class="lesson-focus">${meta.focus}</p><p class="lesson-question">${meta.question}</p>${meta.note?`<p class="lesson-note">${meta.note}</p>`:''}<details><summary>题设关系与核对提示</summary><div class="lesson-formula">${tex(meta.formula,true)}${tex(meta.result,true)}</div></details></div>`;
 const params=model.objects.filter(o=>o.kind==='parameter'&&!Object.keys(o.defs||{}).length);
 out+=`<details class="lesson-parameters"><summary>演示赋值 · 自由参数</summary><p>下面数值是演示设定。质量与电荷在粒子属性中调整；关系式随参数更新。</p>${params.map(o=>`<label>${tex(o.label)}<span><input data-lesson-param="${o.id}" aria-label="演示参数 ${esc(o.label)}" type="number" min="0.000001" step="any" value="${o.value}"> ${esc(o.unit==='speed'?'×10⁵ m/s':o.unit)}</span></label>`).join('')}<button id="lesson-reset" class="wide-button">恢复本题初始设定</button></details>`;
 }
 out+=`<section class="section"><h3>分步展示</h3><div class="teaching-switches">${[['enabled','启用教学辅助'],['components','分速度与合速度'],['componentFirst','水平 / 垂直场分量'],['componentSecond','竖直 / 沿场分量'],['midpoint','类平抛中点关系'],['boundaries','边界 / 换向点'],['pauseAtBoundary','播放到边界自动暂停'],['pastOnly','只显示已经过的轨迹']].map(([k,t])=>`<label><input data-teach="${k}" type="checkbox" ${cfg[k]?'checked':''}>${t}</label>`).join('')}</div><label class="small-label" for="teaching-frame">分解坐标</label><select id="teaching-frame" class="full-select"><option value="xy" ${cfg.frame==='xy'?'selected':''}>水平 x / 竖直 y</option><option value="field" ${cfg.frame==='field'?'selected':''}>垂直合电场 / 沿合电场</option></select><p class="note">分速度与合速度使用同一箭头比例。无恒定合电场时使用 x、y 轴。</p></section>`;
 out+=`<section class="section"><h3>过程导航</h3><select id="teach-trace" class="full-select" aria-label="教学观察粒子">${traces.map(t=>`<option value="${esc(t.particle.traceId)}" ${t===trace?'selected':''}>${esc(t.particle.label)}</option>`).join('')}</select><div class="field-actions"><button id="teach-previous">上一边界</button><button id="teach-next">下一边界</button></div><div class="stage-list">${motionStages(trace).map((g,i)=>`<button data-stage="${g.index}" data-stage-time="${g.start+(trace?.particle.birth||0)}"><span>${i+1}</span><b>${stageName(g.first)}</b><small>${num(g.start*1e6)}–${num(g.end*1e6)} μs${g.last.end==='limit'?' · 观察终点':''}</small></button>`).join('')}</div><p class="note">时间按粒子发射后计；点击运动段到达段起点。进出场和换向节点可在时间轴选择变化前或变化后。相切不误记为穿越。</p></section><div id="teaching-live"></div>`;
 out+=`<details class="lesson-coverage"><summary>题目范围与模型边界</summary><p>例1–4、训练1第1–6题（第6题分三入口），以及选练1的 xy 截面。例4按教参平面展开。例5、选练2–4涉及三维场或三维受力约束，未用二维轨迹冒充完整复现。</p><p>忽略重力、边缘场、粒子相互作用和材料碰撞。理想方波磁场忽略感生电场。调大长度或降低速度后，可在“参数”页延长观察时段。</p><p>练6(2)的首半周期出场条件存在冲突，见该题提示。</p></details>`;
 return out;
}

export function liveTeaching(model,trace,time,{side='after'}={}){
 const cfg=model.teaching,data=teachingState(trace,time,cfg.frame,{side});
 if(!data)return '<p class="note">当前没有可观察的粒子轨迹。</p>';
 const {seg,local,state,names,values}=data,g=midpointConstruction(seg,local);
 const stage=motionStages(trace).find(x=>x.start<=seg.t&&x.end>=seg.t+seg.dt-1e-18),first=stage?.first||seg,kinetic0=first.m*norm(first.v)**2/2,energy=seg.m*norm(state.v)**2/2;
 let out=`<section class="section"><h3>${data.endpointOnly?'已计算末段':'此刻'} · ${stageName(seg)}</h3>${row('本段已用时间',q((seg.t+local-first.t)*1e6,raw`\mu s`))}${row('分速度',tex(raw`v_{${names[0]}}=${num(values[0]/1e5)},\ v_{${names[1]}}=${num(values[1]/1e5)}`))}<p class="note">速度单位：10⁵ m/s；分量保留正负号。</p>${row('速率',q(norm(state.v)/1e5,raw`10^5\,m/s`))}${row('动能',q(energy/E,'eV'))}${row('本段电场做功',q(Math.abs(energy-kinetic0)<Math.max(energy,kinetic0)*1e-10?0:(energy-kinetic0)/E,'eV'))}<p class="note">${data.endpointOnly?'当前为已计算终点；所示末段不代表后侧运动或受力。':data.atBoundary?`边界 / 换向时刻 · ${data.side==='before'?'变化前一侧':'变化后一侧'}。位置与速度连续，合场和受力取所选一侧。`:'磁力不做功；本段电场做功等于动能变化。'}</p></section>`;
 if(cfg.midpoint)out+=`<section class="section"><h3>速度反向延长线</h3>${g.valid?`${row('两半位移',tex(raw`A_0I=IH=${quantity(g.distance*50,'cm')}`))}<p class="note">A₀为本段入场点，H 为粒子在入场方向上的投影，I 为速度切线与 A₀H 的交点。初速度垂直恒定加速度且无磁力时，I 是中点。式中 x 沿入场速度、y 沿加速度；入场速度水平时即为水平位移中点。</p>${tex(raw`x=v_0t,\ y=\tfrac12at^2,\ \frac{v_y}{v_x}=\frac{2y}{x}`,true)}`:`<p class="lesson-note">${g.reason}</p>`}</section>`;
 return out;
}

export function teachingHUD(model,trace,time,{side='after'}={}){
 if(!model.teaching.enabled)return '';
 const data=teachingState(trace,time,model.teaching.frame,{side});if(!data)return '';
 return `<span class="hud-kicker">${data.endpointOnly?'已计算终点':data.atBoundary?`边界时刻 · ${data.side==='before'?'变化前':'变化后'}`:'当前运动阶段'}</span><strong>${stageName(data.seg)}</strong><span>${tex(raw`v=${quantity(norm(data.state.v)/1e5,raw`10^5\,m/s`)}`)}</span><button data-panel="teaching">教学辅助</button>`;
}
