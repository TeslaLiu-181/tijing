import {LorentzScene} from './lorentz-scene.mjs';
import {modules,shapes,experiment,particleTypes,particlePreset,defaultUI,base} from './lorentz-presets.mjs';
import {solve,atTime,norm,dot,unit,cross,mul,geometry,sampleSegment,deg,E,U,TAU} from './lorentz-physics.mjs';
import {tex,num,quantity} from './lorentz-math.mjs';
const $=id=>document.getElementById(id),html=(id,content)=>$(id).innerHTML=content;
let c=experiment('sandbox'),ui=defaultUI(),result,time=0,playing=false,pinned=null,lastFrame=0,lastMetrics=0,scene,quickTools=false;
const remembered={},s=String.raw;
let toastTimer,handCardKey;function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
const option=(value,label,current)=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`;
const folds=new Map();
const section=(name,content,note='')=>`<details class="param-section" data-section="${name}" ${folds.get(name)===false?'':'open'}><summary class="section-title">${name}<span>${note}</span></summary>${content}</details>`;
function control(key,label,unit,title,{min=-1e6,max=1e6,step='any',slider=false}={}){
 return `<div class="control"><div class="control-top"><label for="p-${key}">${tex(label)} <span>${title}</span></label><input id="p-${key}" data-param="${key}" type="number" value="${c[key]}" min="${min}" max="${max}" step="${step}" aria-label="${title}"></div>${slider?`<input data-range="${key}" type="range" min="${min}" max="${max}" step="${step==='any'?(max-min)/200:step}" value="${c[key]}" aria-label="${title}滑块">`:''}<div class="control-value" id="value-${key}">${tex(quantity(c[key],unit,5))}</div></div>`;
}
const checks=items=>`<div class="check-grid">${items.map(([key,label])=>`<label><input type="checkbox" data-ui="${key}" ${ui[key]?'checked':''}>${label}</label>`).join('')}</div>`;
const buttons=(data,values,current)=>`<div class="button-row">${values.map(([v,label])=>`<button data-${data}="${v}" class="${current===v?'active':''}">${label}</button>`).join('')}</div>`;

function renderParameters(){
 document.querySelectorAll('details[data-section]').forEach(el=>folds.set(el.dataset.section,el.open));
 let content='';
 if(c.module==='sandbox'){
  content+=section('典型场景',`<div class="preset-grid">${Object.entries(shapes).map(([k,v])=>`<button data-shape="${k}" class="${c.shape===k?'active':''}">${v}</button>`).join('')}</div>`,'载入典型初态');
 }
 if(c.module!=='beam'){
  content+=section('粒子',`<label class="select-row">类型<select id="particle-type">${Object.entries(particleTypes).map(([k,v])=>option(k,v.name,c.type)).join('')}</select></label>`+
   control('mass','m','u','质量',{min:1e-8,max:1e5})+control('charge','q','e','电荷量',{min:-100,max:100,step:'any'})+
   buttons('charge-sign',[['positive','正电荷'],['negative','负电荷'],['zero','中性']],c.charge>0?'positive':c.charge<0?'negative':'zero'));
  content+=section('运动初态',control('speed','v_0',s`10^5\,m\,s^{-1}`,'速率',{min:0,max:300})+
   control('az',s`\beta`,s`{}^{\circ}`,'平面方位角',{min:-180,max:180,step:1,slider:true})+
   (c.module!=='sandbox'?control('el',s`\gamma`,s`{}^{\circ}`,'仰角',{min:-90,max:90,step:1,slider:true}):'')+
   (c.module==='sandbox'?control('x','x_0','cm','初始横坐标',{min:-30,max:30})+control('y','y_0','cm','初始纵坐标',{min:-30,max:30}):''));
 }else{
  content+=section('电子枪',control('voltage','U','V','加速电压',{min:1,max:2000,step:1,slider:true})+`<div class="math-panel">${tex(s`v_0=\sqrt{\frac{2eU}{m_e}}`,true)}</div><p class="small-note">电子沿正 ${tex('x')} 方向发射；电压只决定入射速率。</p>`);
 }
 content+=section(c.module==='sandbox'?'场域设置':'磁场',(c.module==='sandbox'?`<label class="select-row">区域类型<select id="field-shape">${Object.entries(shapes).map(([key,name])=>option(key,name,c.shape)).join('')}</select></label><p class="small-note">此处更换类型保留粒子初态。</p>`:'')+control('B',c.module==='sandbox'?s`B_z`:'B','mT',c.shape==='double'&&c.module==='sandbox'?'左侧场强':'磁感应强度',{min:-1000,max:1000})+
  `<div class="button-row"><button id="reverse-B">反转磁场</button><button id="zero-B">无磁场</button></div><p class="small-note">正负号控制方向；关系式中的 ${tex('B')} 表示磁场大小。</p>`+
  (c.module==='sandbox'&&c.shape==='double'?control('B2',s`B_{z2}`,'mT','右侧场强',{min:-1000,max:1000}):'')+
  (['direction','space'].includes(c.module)?
   buttons('B-axis',[['z','沿 z 轴'],['y','沿 y 轴'],['x','沿 x 轴']],c.bel===90?'z':c.bel===0&&c.baz===90?'y':c.bel===0&&c.baz===0?'x':null)+
   control('baz',s`\phi_B`,s`{}^{\circ}`,'场方位角',{min:-180,max:180,step:1,slider:true})+control('bel',s`\gamma_B`,s`{}^{\circ}`,'场仰角',{min:-90,max:90,step:1,slider:true})+
   `<div class="button-row"><button id="parallel">平行入射</button><button id="perpendicular">垂直入射</button><button id="oblique">斜入射</button></div>`:'')+
  (c.module==='sandbox'&&c.shape!=='unbounded'?
   control('cx','x_B','cm',c.shape==='circle'?'区域圆心横坐标':'区域位置横坐标',{min:-20,max:20})+control('cy','y_B','cm',c.shape==='circle'?'区域圆心纵坐标':'区域位置纵坐标',{min:-20,max:20})+
   (c.shape!=='circle'?control('angle',s`\eta`,s`{}^{\circ}`,'场域转角',{min:-180,max:180,step:1,slider:true}):'')+
   (['strip','rectangle'].includes(c.shape)?control('width','d','cm','区域宽度',{min:.01,max:30}):'')+
   (c.shape==='rectangle'?control('height','H','cm','区域高度',{min:.01,max:30}):'')+
   (c.shape==='circle'?control('radius','R_B','cm','区域半径',{min:.01,max:30}):''):'')+
  (c.module==='beam'?control('beamAngle',s`\psi`,s`{}^{\circ}`,'横向磁场转角',{min:-180,max:180,step:1,slider:true})+
   buttons('beam-axis',[['0','竖直偏转'],['90','水平偏转']],String(c.beamAngle))+
   control('width','d','cm','偏转区长度',{min:.1,max:3})+control('cx','x_B','cm','偏转区中心',{min:-2,max:1})+
   control('screen','x_s','cm','屏幕位置',{min:1,max:10})+control('screenSize','a_s','cm','屏幕边长',{min:1,max:10}):'')+
  (c.module==='sandbox'?`<p class="small-note">${tex(s`\vec v=(v_x,v_y,0),\quad\vec B=(0,0,B_z)`)}<br>场域互不重叠；边界外为无场区。</p>`:''));
 content+=section('方向示范',buttons('hand',[['left','左手定则'],['right','叉乘右手']],ui.hand)+`<p class="small-note">再次点击可隐藏。右手表示 ${tex(s`\vec v\times\vec B`)}；负电荷的磁力反向。</p>`);
 if(c.module==='sandbox'){
  const curved=result.segments.filter(s=>s.curved),selected=Math.min(ui.segment,curved.length-1);
  content+=section('数学辅助',`<label class="select-row">选择轨迹段<select id="segment" ${curved.length?'':'disabled'}>${curved.length?curved.map((seg,i)=>option(String(i),`第 ${i+1} 段 · ${seg.id===2?'右区':'磁场区'}${seg.ends==='limit'?'（至观察终点）':''}`,String(selected))).join(''):option('0','当前没有圆弧','0')}</select></label>`+
    checks([['center','圆心'],['radius','半径'],['chord','轨迹弦'],['arc','轨迹弧'],['tangent','入出切线'],['angles','角度'],['reference','参考整圆']])+`<div id="geometry-readout" class="math-panel"></div><p class="small-note">辅助量对应所选同一匀强场段。${tex('P')} 为段起点，${tex('Q')} 为离场点；${tex('Q_t')} 表示观察终点。</p>`);
 }
 if(c.module==='space')content+=section('运动分解',checks([['components','速度分解与投影']])+`<div class="math-panel">${tex(s`r=\frac{mv_\perp}{|q|B}`,true)}${tex(s`T=\frac{2\pi m}{|q|B},\quad h=|v_\parallel|T`,true)}</div>`);
 content+=section('观察与讲解',control('duration',s`t_{\max}`,s`\mu s`,'观察时长',{min:.000001,max:10000})+
   `<details class="explain"><summary>课堂提问与关系式</summary><p>${modules[c.module].intro}</p>${tex(s`\vec F_B=q\,\vec v\times\vec B`,true)}${tex(s`F_B=|q|vB\sin\theta`,true)}<p>磁力始终垂直速度，只改变方向，不改变速率。圆心随所在磁场段确定。</p></details>`);
 html('parameters',content);renderGeometry();
}
function renderGeometry(){
 if(!$('geometry-readout'))return;const segments=result.segments.filter(s=>s.curved),seg=segments[Math.min(ui.segment,segments.length-1)];
 if(!seg){html('geometry-readout','当前为直线或静止状态，没有轨道圆心与圆弧。');return;}
 const g=geometry(seg),row=(label,code)=>`<div class="math-row"><span>${label}</span>${tex(code)}</div>`;
 html('geometry-readout',row('半径',`r=${quantity(seg.r*100,'cm')}`)+row('累计转角',s`\varphi=${num(deg(g.phi))}^{\circ}`)+row('速度夹角',s`\delta=${num(deg(g.deflection))}^{\circ}`)+row('弦切角',g.chordAngle===null?s`\alpha\text{ 不适用}`:s`\alpha=${num(deg(g.chordAngle))}^{\circ}`)+row('轨迹弦',s`\ell=${quantity(g.chord*100,'cm')}`)+row('轨迹弧长',s`L=${quantity(g.arcLength*100,'cm')}`)+row('该段时间',s`\Delta t=${quantity(seg.dt*1e6,s`\mu s`)}`)+tex(s`\Delta t=\frac{\varphi}{2\pi}T`,true)+(g.phi>TAU?'<p class="small-note">多圈轨迹在平面上重合，累计转角以上方数值为准。</p>':''));
}
function renderChrome(){
 html('modules',Object.entries(modules).map(([key,m])=>`<button data-module="${key}" class="${c.module===key?'active':''}">${m.name}</button>`).join(''));
 $('scene-tag').textContent=modules[c.module].tag;$('scene-title').textContent=c.module==='sandbox'?shapes[c.shape]:modules[c.module].name;
 $('scene-subtitle').textContent=c.module==='sandbox'?'平面运动 · 无重力 · 区域互不重叠':c.module==='beam'?'经典电子运动 · 静态磁偏转':'点选平移或旋转 · 单指拖动 · 按钮缩放';
 html('layers',[['velocity','速度'],['field','磁场'],['force','磁力'],['trajectory','完整轨迹'],['grid','网格'],['vectorPlane','矢量平面']].filter(([key])=>!(c.module==='direction'&&key==='trajectory')&&!(key==='vectorPlane'&&c.module!=='direction')).map(([key,label])=>`<button data-layer="${key}" class="${ui[key]?'active':''}">${label}</button>`).join('')+['left','right'].map((key,i)=>`<button data-hand="${key}" class="${ui.hand===key?'active':''}">${i?'右手':'左手'}</button>`).join('')+(c.module==='sandbox'?`<button id="geometry-toggle" class="${quickTools?'active':''}">几何辅助</button>`:''));
 $('quick-tools').hidden=!(quickTools&&c.module==='sandbox');
 if(quickTools&&c.module==='sandbox'){
  const curved=result.segments.filter(seg=>seg.curved);html('quick-tools',`<h3>当前圆弧的数学辅助</h3><label class="select-row">轨迹段<select id="quick-segment">${curved.map((seg,i)=>option(String(i),`第 ${i+1} 段`,String(ui.segment))).join('')}</select></label>`+checks([['center','圆心'],['radius','半径'],['chord','轨迹弦'],['arc','轨迹弧'],['tangent','切线'],['angles','角度'],['reference','参考圆']])+`<div class="button-row"><button id="focus-geometry">放大圆弧</button><button id="show-geometry-values">查看数值</button></div>`);
 }
 document.querySelectorAll('input[data-ui]').forEach(el=>el.checked=!!ui[el.dataset.ui]);
 $('view').value=ui.view==='free'?'space':ui.view;$('projection').textContent=ui.projection==='ortho'?'正交':'透视';
 $('touch-tools').classList.toggle('collapsed',!ui.touchTools);$('touch-tools-body').hidden=!ui.touchTools;
 $('touch-toggle').textContent=ui.touchTools?'收起':'展开';$('touch-toggle').setAttribute('aria-expanded',String(ui.touchTools));
 document.querySelectorAll('[data-drag-mode]').forEach(el=>{const active=el.dataset.dragMode===scene.dragMode;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
 $('drag-hint').textContent=(scene.dragMode==='pan'?'单指平移':'单指旋转')+' · 双指缩放';
 document.body.classList.toggle('panel-closed',!ui.panel);$('panel-toggle').textContent=ui.panel?'参数 ›':'‹ 参数';
 $('rate').value=String(ui.rate);$('screen-card').hidden=c.module!=='beam';$('screen-inner').hidden=!ui.screen;
 const caption={plane:'沿 +z 轴看向原点 · xy 投影',xz:'沿 −y 轴看向原点 · xz 投影',yz:'沿 +x 轴看向原点 · yz 投影',field:'沿磁场轴观察 · 垂直场轴投影',space:'空间观察',free:'自由视角'};
 $('view-caption').innerHTML=caption[ui.view]+(c.module==='sandbox'?' · 网格间距 '+tex(s`1\,\mathrm{cm}`):'');
 $('pin').hidden=c.module==='direction';$('clear-pin').hidden=!pinned;renderHandCard();
}
function renderHandCard(){
 $('hand-card').hidden=!ui.hand;if(!ui.hand){handCardKey=null;return;}
 const state=atTime(result,time),valid=norm(state.v)>0&&norm(state.B)>0&&state.q!==0&&norm(cross(unit(state.v),unit(state.B)))>1e-9;
 const key=[ui.hand,ui.handStep,valid,state.q<0].join(':');if(key===handCardKey)return;handCardKey=key;
 const left=ui.hand==='left',negative=state.q<0,steps=left?['磁场穿掌','四指方向','拇指指力']:['速度起始','四指弯转','拇指法向'];
 const descriptions=left?[
  `让磁感线穿入掌心。斜入射时，用垂直速度的磁场分量确定掌面。`,
  negative?`负电荷：四指沿 ${tex(s`-\vec v`)}。电子的实际运动仍沿 ${tex(s`\vec v`)}。`:`正电荷：四指沿粒子的实际速度 ${tex(s`\vec v`)}。`,
  `拇指所指就是实际磁力 ${tex(s`\vec F_B`)} 的方向。`
 ]:[`先沿 ${tex(s`\vec v`)} 伸出四指，注意从速度向磁场的次序。`,`四指从 ${tex(s`\vec v`)} 向 ${tex(s`\vec B`)} 按小于平角的方向弯转。`,negative?`拇指得到 ${tex(s`\vec v\times\vec B`)}，实际磁力因 ${tex('q<0')} 而反向。`:`拇指得到 ${tex(s`\vec v\times\vec B`)}；${tex('q>0')} 时磁力与它同向。`];
 html('hand-card',`<h3>${left?'左手定则':'叉乘右手示意'}</h3><div class="hand-step">${steps.map((v,i)=>`<span class="${i===ui.handStep?'active':''}">${i+1} ${v}</span>`).join('')}</div><p>${valid?descriptions[ui.handStep]:'当前磁力为零，没有唯一受力方向；手模型暂时隐藏。'}</p><div class="hand-buttons"><button id="hand-next">下一步 →</button><button id="hand-focus" ${valid?'':'disabled'}>放大手势</button><button id="hand-hide">隐藏</button></div>`);
}
function renderScreen(){
 if(c.module!=='beam')return;const hit=result.hit,size=c.screenSize,scale=176/size,inside=hit?.inside;
 // Looking from screen toward gun (-x), keep +y up as in the main beam view.
 // Screen-right is then -z: a view change must not silently mirror the spot.
 const x=hit?110-hit.p[2]*100*scale:110,y=hit?110-hit.p[1]*100*scale:110;
 const axis=(value,x,y)=>`<foreignObject x="${x}" y="${y}" width="25" height="24"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:12px;color:#7c9478">${tex(value)}</div></foreignObject>`;
 html('screen-svg',`<rect x="22" y="22" width="176" height="176" rx="3" fill="#eaf2e8" stroke="#c9d9c6"/><path d="M22 110H198M110 22V198" stroke="#acbfa8" stroke-dasharray="3 4"/><path d="M193 107l5 3-5 3M107 27l3-5 3 5" fill="none" stroke="#819c7d"/>${axis('-z',193,116)}${axis('y',119,15)}${axis('O',98,115)}${inside?`<circle cx="${x}" cy="${y}" r="10" fill="#aad37a" opacity=".25"/><circle cx="${x}" cy="${y}" r="4.5" fill="#7eae40"/>`:''}`);
 html('screen-readout',inside?tex(s`(y_s,z_s)=(${num(hit.p[1]*100)},${num(hit.p[2]*100)})\,\mathrm{cm}`):hit?'电子越过屏幕范围':'观察时段内未到达屏幕');
}
function renderMetrics(){
 const state=atTime(result,time),angle=norm(state.v)&&norm(state.B)?Math.acos(Math.max(-1,Math.min(1,dot(unit(state.v),unit(state.B))))):null;
 const metric=(label,code)=>`<div><div class="metric-label">${label}</div><div class="metric-value">${tex(code)}</div></div>`;
 let out=metric('速率',s`v=${quantity(norm(state.v),s`m\,s^{-1}`)}`);
 if(c.module==='direction')out+=metric('速度与磁场夹角',angle===null?s`\theta\text{ —}`:s`\theta=${num(deg(angle))}^{\circ}`)+metric('磁力大小',ui.force?s`F_B=${quantity(norm(state.force),'N')}`:s`F_B=\,?`);
 else if(c.module==='space')out+=metric('回旋半径',s`r=${quantity(state.r===null?null:state.r*100,'cm')}`)+metric('回旋周期',s`T=${quantity(state.T===null?null:state.T*1e6,s`\mu s`)}`)+metric('螺距',s`h=${quantity(state.pitch===null?null:state.pitch*100,'cm')}`);
 else if(c.module==='sandbox')out+=metric('当前区域',state.segment.id===0?s`B=0`:s`B_z=${quantity(state.B[2]*1000,'mT')}`)+metric('当前磁力',ui.force?s`F_B=${quantity(norm(state.force),'N')}`:s`F_B=\,?`);
 else out+=metric('入射动能',s`E_k=${quantity(c.voltage,'eV')}`);
 html('metrics',out);html('time-readout',`${tex(s`t=${quantity(time*1e6,s`\mu s`)}\;/\;${quantity(result.duration*1e6,s`\mu s`)}`)}`);
}
function validate(config){
 if(!config||!modules[config.module]||!shapes[config.shape]||!particleTypes[config.type])throw new Error('实验类型或场域格式不正确');
 for(const [key,value] of Object.entries(base()))if(typeof value==='number'&&!Number.isFinite(config[key]))throw new Error(`参数 ${key} 必须为有限数值`);
 if(config.mass<=0||config.speed<0||config.duration<=0||config.width<=0||config.height<=0||config.radius<=0||config.voltage<=0||config.screenSize<=0)throw new Error('质量、时长和尺寸须为正；速率不能为负');
 if(config.module==='sandbox')config.el=0;
 if(config.module==='beam'&&(config.cx-config.width/2<=-3||config.cx+config.width/2>=config.screen))throw new Error('磁偏转区应位于电子枪与屏幕之间');
}
function rebuild({fit=false,controls=false,reset=true}={}){
 validate(c);if(reset){time=0;playing=false;}
 result=solve(c);time=Math.min(time,result.duration);ui.segment=Math.max(0,Math.min(ui.segment,result.segments.filter(s=>s.curved).length-1));
 scene.update(c,result,ui,pinned,fit);scene.updateTime(time);renderChrome();if(controls)renderParameters();else renderGeometry();renderScreen();renderMetrics();updateTransport();
 if(result.truncated)toast('该实验的跨区次数过多，请缩短观察时长。');
}
function updateTransport(){$('play').textContent=playing?'暂停':'播放';$('time-slider').value=result.duration?String(time/result.duration*1000):'0';}
function changeModule(module){remembered[c.module]={c:structuredClone(c),ui:structuredClone(ui)};const old=remembered[module];c=old?.c||experiment(module);ui=old?.ui||{...defaultUI(),view:module==='sandbox'?'plane':'space',hand:module==='direction'?'left':null};if(innerWidth<800){ui.panel=false;ui.touchTools=false;}pinned=null;scene.setProjection(ui.projection);rebuild({fit:true,controls:true});$('parameters').scrollTop=0;}
function editParameter(key,value){
 const before={...c};c[key]=value;if(['mass','charge'].includes(key))c.type='custom';
 try{validate(c);rebuild();const number=$(`p-${key}`),range=document.querySelector(`[data-range="${key}"]`);if(number)number.value=c[key];if(range)range.value=c[key];if($('particle-type'))$('particle-type').value=c.type;
  const val=$(`value-${key}`);if(val){const units={mass:'u',charge:'e',speed:s`10^5\,m\,s^{-1}`,az:s`{}^{\circ}`,el:s`{}^{\circ}`,B:'mT',B2:'mT',baz:s`{}^{\circ}`,bel:s`{}^{\circ}`,angle:s`{}^{\circ}`,beamAngle:s`{}^{\circ}`,duration:s`\mu s`,voltage:'V'};val.innerHTML=tex(quantity(c[key],units[key]||'cm',5));}
 }catch(error){c=before;const input=$(`p-${key}`);if(input)input.value=c[key];toast(error.message);}
}

document.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.dataset.dragMode){scene.setDragMode(b.dataset.dragMode);renderChrome();return;}
 if(b.dataset.pan){scene.panView(...b.dataset.pan.split(',').map(Number));return;}
 if(b.dataset.zoom){scene.zoomView(Number(b.dataset.zoom));return;}
 if(b.dataset.module){changeModule(b.dataset.module);return;}
 if(b.dataset.shape){c=experiment('sandbox',b.dataset.shape);ui.segment=0;rebuild({fit:true,controls:true});return;}
 if(b.dataset.layer){ui[b.dataset.layer]=!ui[b.dataset.layer];rebuild({reset:false});return;}
 if(b.dataset.hand){ui.hand=ui.hand===b.dataset.hand?null:b.dataset.hand;ui.handStep=0;playing=false;rebuild({reset:false,controls:true});return;}
 if(b.dataset.chargeSign){c.charge=b.dataset.chargeSign==='zero'?0:(Math.abs(c.charge)||1)*(b.dataset.chargeSign==='negative'?-1:1);c.type='custom';rebuild({controls:true});return;}
 if(b.dataset.bAxis){c.baz=b.dataset.bAxis==='y'?90:0;c.bel=b.dataset.bAxis==='z'?90:0;rebuild({controls:true});return;}
 if(b.dataset.beamAxis){c.beamAngle=Number(b.dataset.beamAxis);rebuild({controls:true,fit:true});return;}
 switch(b.id){
  case 'play':if(time>=result.duration)time=0;playing=!playing;lastFrame=performance.now();updateTransport();break;
  case 'step':playing=false;time=Math.min(result.duration,time+result.duration/120);scene.updateTime(time);renderMetrics();renderHandCard();updateTransport();break;
  case 'reset-time':playing=false;time=0;scene.updateTime(time);renderMetrics();renderHandCard();updateTransport();break;
  case 'reset-preset':c=experiment(c.module,c.shape);rebuild({controls:true,fit:true});break;
  case 'reverse-B':c.B=-c.B;rebuild({controls:true});break;
  case 'zero-B':c.B=0;rebuild({controls:true});break;
  case 'parallel':c.az=c.baz;c.el=c.bel;rebuild({controls:true,fit:true});break;
  case 'perpendicular':c.az=c.baz+90;if(c.az>180)c.az-=360;c.el=0;rebuild({controls:true,fit:true});break;
  case 'oblique':c.baz=0;c.bel=90;c.az=0;c.el=30;rebuild({controls:true,fit:true});break;
  case 'hand-next':ui.handStep=(ui.handStep+1)%3;rebuild({reset:false});break;
  case 'hand-hide':ui.hand=null;rebuild({controls:true,reset:false});break;
  case 'hand-focus':scene.focusHand();break;
  case 'panel-toggle':ui.panel=!ui.panel;renderChrome();break;
  case 'geometry-toggle':quickTools=!quickTools;renderChrome();break;
  case 'focus-geometry':scene.focusSegment();quickTools=false;renderChrome();break;
  case 'show-geometry-values':ui.panel=true;quickTools=false;renderChrome();{const section=$('geometry-readout').closest('details');section.open=true;$('geometry-readout').scrollIntoView({block:'center',behavior:'smooth'});}break;
  case 'projection':ui.projection=ui.projection==='ortho'?'perspective':'ortho';scene.setProjection(ui.projection);renderChrome();break;
  case 'fit':case 'camera-reset':scene.fitAll();renderChrome();break;
  case 'touch-toggle':ui.touchTools=!ui.touchTools;renderChrome();break;
  case 'pin':pinned=result.segments.flatMap(seg=>sampleSegment(seg,Math.min(800,Math.max(80,Math.ceil(Math.abs(seg.w*seg.dt)*20)))));rebuild({reset:false});toast('已保留灰色对照轨迹，可修改参数比较。');break;
  case 'clear-pin':pinned=null;rebuild({reset:false});break;
  case 'screen-toggle':$('screen-card').classList.toggle('large');break;
  case 'screen-collapse':ui.screen=!ui.screen;renderChrome();break;
  case 'event-time':{
   const boundary=result.segments.map(seg=>seg.t).concat(result.duration).find(t=>t>time+result.duration*1e-7);
   playing=false;time=boundary??0;scene.updateTime(time);renderMetrics();renderHandCard();updateTransport();break;
  }
  case 'fullscreen':if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>toast('可使用浏览器的全屏功能。'));break;
  case 'save':save();break;
  case 'load':$('config-file').click();break;
  case 'help':$('help-dialog').showModal();break;
  case 'close-help':$('help-dialog').close();break;
 }
});
document.addEventListener('change',event=>{
 const target=event.target;
 if(target.dataset.param){if(!target.validity.valid){toast('请输入有效范围内的数值。');target.value=c[target.dataset.param];return;}editParameter(target.dataset.param,Number(target.value));}
 if(target.dataset.ui){ui[target.dataset.ui]=target.checked;rebuild({reset:false});}
 if(target.id==='particle-type'){if(target.value==='custom')c.type='custom';else particlePreset(c,target.value);rebuild({controls:true,fit:true});}
 if(target.id==='field-shape'){c.shape=target.value;ui.segment=0;rebuild({controls:true,fit:true});}
 if(target.id==='view'){ui.view=target.value;scene.resetView(ui.view);renderChrome();}
 if(target.id==='rate')ui.rate=Number(target.value);
 if(target.id==='segment'||target.id==='quick-segment'){ui.segment=Number(target.value);scene.ui=ui;scene.drawHelpers();renderGeometry();renderChrome();if($('segment'))$('segment').value=String(ui.segment);}
});
let rangeRequest=null;
document.addEventListener('input',event=>{
 if(event.target.dataset.range){const key=event.target.dataset.range,value=Number(event.target.value);cancelAnimationFrame(rangeRequest);rangeRequest=requestAnimationFrame(()=>editParameter(key,value));}
 if(event.target.id==='time-slider'){playing=false;time=Number(event.target.value)/1000*result.duration;scene.updateTime(time);renderMetrics();renderHandCard();updateTransport();}
});
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName)&&!$('help-dialog').open){event.preventDefault();$('play').click();}});
function save(){
 const data={format:'lorentz-classroom-1',config:c,ui,time,camera:scene.snapshot()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='洛伦兹力备课配置.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前实验、视角与播放位置。');
}
$('config-file').addEventListener('change',async event=>{
 const file=event.target.files[0];if(!file)return;
 try{
  const data=JSON.parse(await file.text());if(data.format!=='lorentz-classroom-1')throw new Error('请选择洛伦兹力实验室的备课配置');validate(data.config);
  const camera=data.camera;if(!camera||!['ortho','perspective'].includes(camera.projection)||!['space','free','plane','xz','yz','field'].includes(camera.view)||![camera.zoom,camera.extent].every(v=>Number.isFinite(v)&&v>0)||!['position','up','target'].every(key=>Array.isArray(camera[key])&&camera[key].length===3&&camera[key].every(Number.isFinite)))throw new Error('视角数据不完整');
  const newUI={...defaultUI()};for(const [key,value] of Object.entries(newUI)){if(typeof data.ui?.[key]===typeof value)newUI[key]=data.ui[key];}
  newUI.hand=['left','right'].includes(data.ui?.hand)?data.ui.hand:null;newUI.handStep=Math.max(0,Math.min(2,Math.trunc(data.ui?.handStep||0)));newUI.view=camera.view;newUI.projection=camera.projection;newUI.segment=Math.max(0,Math.trunc(newUI.segment)||0);newUI.rate=[.25,.5,1,2,4].includes(newUI.rate)?newUI.rate:1;
  c=data.config;ui=newUI;pinned=null;time=Number.isFinite(data.time)?Math.max(0,data.time):0;playing=false;rebuild({fit:true,controls:true,reset:false});scene.restore(camera);renderChrome();toast('已恢复实验、视角与播放位置。');
 }catch(error){toast('未载入：'+error.message);}event.target.value='';
});
function helpContent(){return `<div class="eyebrow">LORENTZ LAB · OFFLINE CLASSROOM</div><h2>把方向、轨迹与几何联系起来</h2><p>四个入口共用一致的洛伦兹力关系。先隐藏磁力或轨迹让学生判断，再切换视角验证。右侧参数和视角操作栏均可收起。触屏时先点“平移”或“旋转”，再单指拖动画面；也可点方向箭头移动，用“＋／−”放大缩小、“复位”恢复完整场景。支持双指缩放。鼠标左键随所选模式拖动，滚轮缩放；空格播放／暂停。</p><h3>方向与运动</h3>${tex(s`\vec F_B=q\vec v\times\vec B,\qquad\vec F_B\cdot\vec v=0`,true)}<p>左手四指沿正电荷的速度、负电荷速度的反向。叉乘右手先得到 ${tex(s`\vec v\times\vec B`)}；乘以负电荷量后磁力反向。零电荷、零速度、零磁场或平行入射时磁力为零，手模型隐藏。</p>${tex(s`r=\frac{mv_\perp}{|q|B},\quad T=\frac{2\pi m}{|q|B},\quad h=|v_\parallel|T`,true)}<p>空间模块允许螺旋运动；平面沙盒严格采用 ${tex(s`z=v_z=0`)}，磁场仅沿 ${tex('z')} 轴。方位角由正 ${tex('x')} 轴朝正 ${tex('y')} 轴计，仰角从 ${tex('xy')} 平面计。正交／透视只改变观察方式。</p><h3>有界磁场与数学辅助</h3><p>半平面沿局部正横轴有场；条形关于区域中心对称；第一象限沿两条局部正轴有场；相邻双区域由一条公共边界分开。区域位置和转角均可调整，区域之间不重叠。出场后沿切线飞行，跨区时速度连续。</p><p>选中某一磁场段，再显示圆心、半径、轨迹弦、弧、切线或角度。${tex(s`\varphi`)} 是实际累计转角，${tex(s`\delta`)} 是两个速度的最小夹角，二者不能混用。${tex('Q_t')} 表示人为截取的观察终点。弦切角取入射切线与有向弦的夹角；整圈端点重合时不定义。</p><h3>电子束与屏幕</h3><p>电子沿正 ${tex('x')} 方向发射，磁场在 ${tex('yz')} 平面内旋转。屏幕小窗从屏幕朝电子枪观察：正 ${tex('y')} 向上、负 ${tex('z')} 向右。可点击小窗标题放大。屏幕显示本次实验的预计落点；未到达屏幕或越过边缘时如实提示。</p><h3>模型与保存</h3><p>经典、非相对论、静态匀强磁场模型；忽略重力、阻力和粒子相互作用。匀强段采用解析运动，标准平面边界采用交点事件；播放速度只影响观察节奏。箭头长度用于辨认方向，不按不同物理量共用比例尺。</p><p>质量单位 ${tex(s`u=1.66053906660\times10^{-27}\,\mathrm{kg}`)}；电荷单位 ${tex(s`e=1.602176634\times10^{-19}\,\mathrm C`)}。参数使用输入框编辑，符号、数值与关系式使用 LaTeX 排版。保存／载入可恢复当前实验和视角；“保留对照”保留一条临时灰色轨迹。</p><p>教学依据：人教版选择性必修第二册配套课件《磁场对运动电荷的作用力》《带电粒子在匀强磁场中的运动》。本程序按理解难点组织，不逐题复刻课件。</p>`;}
try{
 scene=new LorentzScene($('viewport'),$('labels'),view=>{ui.view=view;renderChrome();});
 if(innerWidth<800){ui.panel=false;ui.touchTools=false;}rebuild({fit:true,controls:true});html('help-content',helpContent());
 function frame(now){
  if(playing){const elapsed=Math.min((now-lastFrame)/1000,.1);time=Math.min(result.duration,time+elapsed*result.duration/8*ui.rate);if(time>=result.duration)playing=false;scene.updateTime(time);updateTransport();if(now-lastMetrics>130){renderMetrics();renderHandCard();lastMetrics=now;}}
  lastFrame=now;scene.render();requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
 window.lorentz={snapshot:()=>({config:structuredClone(c),ui:structuredClone(ui),time,playing,camera:scene.snapshot(),hand:scene.handAudit||null,webgl:scene.renderer.getContext() instanceof WebGL2RenderingContext,
  current:atTime(result,time),segments:result.segments.map(seg=>({id:seg.id,t:seg.t,dt:seg.dt,p:seg.p,v:seg.v,end:seg.end,r:seg.r,T:seg.T,ends:seg.ends})),hit:result.hit,pinned:!!pinned,duration:result.duration})};
}catch(error){$('scene-title').textContent='实验室未能启动';$('scene-subtitle').textContent=error.message;toast('启动失败：'+error.message);console.error(error);}
$('viewport').addEventListener('sceneerror',event=>toast(event.detail));
