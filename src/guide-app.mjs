import {topics,parameterOf,initialParameters,questionOf} from './guide-curriculum.mjs';
import {evaluateTopic,verticalState,norm,cross,dot,unit} from './guide-physics.mjs';
import {tex,prose,sourceParagraph,sourceFigure,numberTex,mathErrors} from './guide-math.mjs';
import {GuideScene,palette} from './guide-scene.mjs';
import {encodeState,decodeState} from './guide-state.mjs';

const $=id=>document.getElementById(id);
let state={topic:topics[0],question:0,mode:'lesson',params:initialParameters(topics[0]),part:0,reveal:0,hand:null,handStep:0,field:true,forces:false,resultants:false,moment:false,paper:'question',plot:'a'};
let model,scene,playing=false,animationValue=0,animationTime=0,animationBase=null,lastFrame=0,lastSceneUpdate=0,toastTimer;
const quantitative=()=>!state.topic.symbolic||state.mode==='explore';
const currentQuestion=()=>questionOf(state.topic,state.question);
const mathBlock=value=>`<div class="math-block">${tex(value,true)}</div>`;
const displayValue=(value,unitValue='')=>tex(numberTex(value)+(unitValue?String.raw`\,${unitValue}`:''));
const announce=message=>{$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3000);};

function renderNavigation(){
 let section='';$('topic-list').innerHTML=topics.map(t=>{
  const heading=t.section!==section?`<div class="nav-section">${t.section}</div>`:'';section=t.section;
  return heading+`<button class="topic-button${t.id===state.topic.id?' active':''}" data-topic="${t.id}" aria-pressed="${t.id===state.topic.id}"><span class="topic-number">${t.label}</span><span class="topic-name">${t.title}</span></button>`;
 }).join('');
 $('topic-list').querySelectorAll('[data-topic]').forEach(button=>button.onclick=()=>selectTopic(button.dataset.topic));
}
function renderHeader(){
 $('section-label').textContent=state.topic.section+' / '+state.topic.label;$('lesson-title').innerHTML=prose(state.topic.title);
 $('question-tabs').innerHTML=state.topic.questions.map((q,i)=>`<button data-question="${i}" class="${i===state.question?'active':''}" aria-pressed="${i===state.question}">${prose(q.title)}</button>`).join('');
 $('question-tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>selectQuestion(Number(b.dataset.question)));
 document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===state.mode);b.setAttribute('aria-pressed',b.dataset.mode===state.mode);});
 $('lesson-position').textContent=`${String(topics.indexOf(state.topic)+1).padStart(2,'0')} / 19  ·  ${state.topic.label}  ·  ${state.question+1} / ${state.topic.questions.length} 小问`;
 $('mode-description').textContent=state.mode==='lesson'?'题设条件 · 新小问答案先隐藏':'自由探究 · 参数为演示设定，原题答案暂不显示';
}
function renderQuestion(){
 const q=currentQuestion();
 let images=state.topic.figures;
 if(state.topic.id==='crossed')images=q.arrangement==='parallel'?[]:[q.arrangement==='separate'?'rId24':'rId23'];
 $('source-figures').innerHTML=images.length?images.map((id,i)=>`<img src="${sourceFigure(id)}" alt="${state.topic.label}导学案原图${i+1}" data-figure="${id}">`).join(''):'<p class="measurement-note">本小问没有单独原图，场景依据“同向平行电流”的文字条件还原。后续小问对应丙图、丁图。</p>';
 $('figure-caption').textContent=state.topic.label+(images.length?' · 导学案原图':' · 文字条件');$('enlarge-figure').disabled=!images.length;
 const prompt=q.refs.length?q.refs.map(i=>sourceParagraph(i)).join('<br>'):prose(q.title);
 let carry='';
 if(state.mode==='lesson'&&state.question>0){
  if(state.topic.id==='example-1')carry=String.raw`M=0.75\,\mathrm{kg}`;
  if(state.topic.id==='exercise-9')carry=String.raw`t_0=\frac{mg}{\mu kBL}`;
 }
 $('current-question').innerHTML='<span class="question-kicker">当前小问</span>'+prompt+(carry?'<div class="carry-forward">沿用前问结果 '+tex(carry)+'</div>':'');
 const ids=[...state.topic.stem];
 if(!ids.length)ids.push(...state.topic.questions.flatMap(q=>q.refs));
 $('stem-content').innerHTML=ids.map(i=>`<p>${sourceParagraph(i)}</p>`).join('');
 $('full-stem').open=true;
}
function renderParameters(){
 const open=$('parameter-panel').open;
 $('parameters').innerHTML=state.topic.controls.map(key=>{
  const d=parameterOf(state.topic,key),v=state.params[key],disabled=state.mode==='lesson'?'disabled':'';
  return `<div class="parameter"><div class="parameter-label"><label for="parameter-${key}">${tex(d.tex)} <span class="name">${d.name}</span></label><span class="parameter-readout" id="readout-${key}">${displayValue(v,d.unit)}</span></div><input type="range" id="range-${key}" aria-label="${d.name}滑块" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" ${disabled}><div class="edit-value"><span>${tex(String(d.min))} — ${tex(String(d.max))}</span><input type="number" id="parameter-${key}" aria-label="${d.name}数值" min="${d.min}" max="${d.max}" step="any" value="${Number(v.toFixed(6))}" ${disabled}></div></div>`;
 }).join('');
 for(const key of state.topic.controls){
  const d=parameterOf(state.topic,key);
  const change=(raw,range=false)=>{
   if(state.mode!=='explore')return;
   if(raw.trim()===''||!Number.isFinite(Number(raw))){announce('请输入有效数字。');syncParameterValues();return;}
   const value=Math.max(d.min,Math.min(d.max,Number(raw)));state.params[key]=value;state.params.parallelField=0;playing=false;animationValue=0;
   if(value!==Number(raw))announce('已调整到本题参数允许范围。');
   if(!range)$(`range-${key}`).value=value;
   syncParameterValues(range?key:null);recompute();
  };
  $(`range-${key}`).oninput=e=>change(e.target.value,true);$(`parameter-${key}`).onchange=e=>change(e.target.value);
 }
 $('parameter-note').textContent=state.mode==='lesson'?'题设已锁定 · 探究模式可调整':'当前改动不会覆盖原题条件';
 $('parameters').hidden=state.mode==='lesson';$('parameter-panel').querySelector('.parameter-actions').hidden=state.mode==='lesson';
 let hint=$('lesson-parameter-hint');if(!hint){hint=document.createElement('p');hint.id='lesson-parameter-hint';hint.className='measurement-note';hint.style.padding='0 15px 14px';$('parameter-panel').append(hint);}hint.textContent='题设条件见原文，未知量保留符号。进入自由探究后可调整演示数值。';hint.hidden=state.mode==='explore';
 $('parameter-panel').open=state.mode==='explore'?true:open&&state.mode==='lesson';
 $('numeric-convention').textContent=state.mode==='lesson'?'题给近似值优先':'按实际角度计算 · 数值为演示设定';
 $('reverse-current').disabled=state.mode!=='explore';$('parallel-field').disabled=state.mode!=='explore';
 $('parallel-field').hidden=!['rail','rail-side','pulley','cannon'].includes(state.topic.kind);
 $('parallel-field').innerHTML=tex(String.raw`\vec B\parallel I\vec L`);
}
function syncParameterValues(activeRange){
 for(const key of state.topic.controls){const d=parameterOf(state.topic,key),value=state.params[key];$(`readout-${key}`).innerHTML=displayValue(value,d.unit);$(`parameter-${key}`).value=Number(value.toFixed(6));if(activeRange!==key)$(`range-${key}`).value=value;}
}
function givenFieldVisible(){
 if(['exercise-1','exercise-2','exercise-5','exercise-8','exercise-10'].includes(state.topic.id))return false;
 if(state.topic.kind==='horseshoe')return state.question>0;
 if(state.topic.id==='crossed')return state.question===2||state.question===3;
 return ['rail','rail-side','pulley','cannon','vertical','radial'].includes(state.topic.kind);
}
function renderHandControls(){
 $('part-select').innerHTML=state.topic.parts.map((part,i)=>`<option value="${i}" ${i===state.part?'selected':''}>${part}</option>`).join('');
 const sample=model.samples[Math.min(state.part,model.samples.length-1)];
 document.querySelectorAll('[data-hand]').forEach(b=>{
  const right=b.dataset.hand==='right';b.disabled=right?!model.right||!model.right.value:!sample||!norm(sample.tangent)||norm(cross(sample.tangent,sample.B))<1e-8;
  b.classList.toggle('active',b.dataset.hand===state.hand);b.setAttribute('aria-pressed',b.dataset.hand===state.hand);
  b.title=right&&!model.right?'本题磁场不是由可示范握法的源电流给出':b.disabled?'当前条件下没有可用的方向关系':'';
 });
 $('hand-instruction').hidden=!state.hand;
 if(state.hand){
  const isStraight=model.right?.style==='straight';
  const lines=state.hand==='left'?[
   '掌心朝向来磁场，让磁感线穿入掌心。',
   '四指并拢，指向选中电流元的电流方向。',
   '拇指与四指垂直，指向这个电流元所受的安培力。'
  ]:isStraight?[
   '右手拇指沿源导线的电流方向。',
   '四指弯曲方向，对应环绕源导线的磁感线。',
   '沿场线找到选中位置的局部磁场，再按需要切换左手。'
  ]:[
   '右手四指弯曲，沿线圈或螺线管的电流绕向。',
   '拇指给出内部／轴向磁场方向，也指向等效 N 极。',
   '线圈外部的局部磁场仍要沿场线判断，不能处处套用轴向方向。'
  ];
  $('hand-text').innerHTML=prose(lines[state.handStep])+(sample?.isReaction?'<br>左手示范仍作用于导线，磁体受力取反作用方向。':'');
  $('hand-next').textContent=state.handStep===2?'重新示范 →':'下一步手势 →';
 }
}
function renderAnalysis(){
 const q=currentQuestion();
 if(state.mode==='explore')$('solution-steps').innerHTML='<div class="empty-analysis">当前为自由探究。原题答案暂不展示，请查看“当前关系”；返回题设后可继续原题解析。</div>';
 else if(!state.reveal)$('solution-steps').innerHTML='<div class="empty-analysis">先根据原题与场景作出判断。<br>点击“展开下一步解析”，再逐步揭示正确推理。</div>';
 else $('solution-steps').innerHTML=q.steps.slice(0,state.reveal).map((step,i)=>`<article class="solution-step"><h3><span>${String(i+1).padStart(2,'0')}</span>${step.title}</h3><p>${prose(step.text)}</p>${step.tex?mathBlock(step.tex):''}</article>`).join('');
 $('topic-notice').textContent=state.topic.notice||(['rail','rail-side','pulley','cannon','vertical','radial'].includes(state.topic.kind)?'几何角度按题图显示，题设数值计算使用题目给定的近似值。':'场线、局部电流元和转动趋势用于方向判断；箭头长度不代表测得的力大小。');
 $('reveal-caption').textContent=state.mode==='explore'?'原题解析已暂时隐藏':state.reveal?`已展开 ${state.reveal} / ${q.steps.length} 步`:'当前问答案已隐藏';
 $('reveal-next').textContent=state.mode==='explore'?'查看当前关系 →':state.reveal>=q.steps.length?'已展开全部解析':'展开下一步解析 →';
 $('reveal-next').disabled=state.mode==='lesson'&&state.reveal>=q.steps.length;
 $('layer-field').checked=state.field;$('layer-forces').checked=state.forces;$('layer-resultants').checked=state.resultants;$('layer-moment').checked=state.moment;
 $('layer-moment').disabled=!model.moment;
 $('play-trend').textContent=playing?'Ⅱ 暂停变化':'▶ 演示变化';
 $('scene-badge').textContent=playing?(state.topic.kind==='vertical'?'按时间关系演示':'过程／方向变化示意'):state.mode==='explore'?'自由探究 · 演示设定':'原题关键状态';
}
function renderMeasurement(){
 const mayShow=state.mode==='explore'||state.reveal>0;
 $('live-relation').innerHTML=`<div class="metric-card${model.invalid?' warn':''}">${mayShow?model.status:'先判断，再查看关系'}</div>`;
 if(!mayShow){$('measurement-values').innerHTML='<p class="measurement-note">先按题图判断方向；解析与数值将在揭示后显示。</p>';$('plot-panel').hidden=true;$('local-relation').innerHTML='';return;}
 let values=[];
 const item=(label,value,unitValue='')=>`<div class="metric-row"><span class="metric-name">${tex(label)}</span><span class="metric-value">${displayValue(value,unitValue)}</span></div>`;
 const metric=model.metric||{};
 if(quantitative()){
  if(['rail','rail-side','pulley','cannon'].includes(state.topic.kind)){
   values=[item('I',metric.I,String.raw`\mathrm A`),item(String.raw`F_{\mathrm{安}}`,metric.F,String.raw`\mathrm N`),item('N',metric.N,String.raw`\mathrm N`),item(String.raw`f_{\parallel}`,metric.f,String.raw`\mathrm N`),item(String.raw`a_{\parallel}`,metric.a,String.raw`\mathrm{m\,s^{-2}}`)];
   if(state.topic.kind==='pulley')values.push(item('T',model.T,String.raw`\mathrm N`));
   if(state.topic.id==='exercise-8')values.push(item('B',metric.B,String.raw`\mathrm T`));
  }else if(state.topic.kind==='vertical'){
   if(model.valid)values=[item('t_0',metric.t0,String.raw`\mathrm s`),item('t',metric.t,String.raw`\mathrm s`),item('I(t)',metric.I,String.raw`\mathrm A`),item('v(t)',metric.v,String.raw`\mathrm{m\,s^{-1}}`),item('a(t)',metric.a,String.raw`\mathrm{m\,s^{-2}}`),item('f(t)',metric.f,String.raw`\mathrm N`)];
  }else if(state.topic.kind==='radial'){
   if(model.valid)values=[item('\\theta',metric.theta,String.raw`{}^\circ`),item(String.raw`T_{\mathrm{合}}`,metric.T,String.raw`\mathrm N`),item('\\sin\\theta',metric.sinTheta)];
  }else{
   values=[item('I',state.params.I,String.raw`\mathrm A`)];if(state.params.J!==undefined)values.push(item(String.raw`I_{\mathrm{源}}`,state.params.J,String.raw`\mathrm A`));
   if(state.params.angle!==undefined)values.push(item('\\varphi',state.params.angle,String.raw`{}^\circ`));
   values.push('<p class="measurement-note">场与力以方向示意为主；不从图示尺寸推算真实场强或磁力数值。</p>');
  }
 }else{
  const expressions={
   'guide-balance':String.raw`f=BIL\sin\theta,\quad N=G-BIL\cos\theta`,
   'exercise-1':String.raw`f=mg\sin\theta`,
   'exercise-2':String.raw`B=\frac{mg\sin\theta}{IL}`, 'exercise-5':String.raw`a_0=\frac{BEL}{m(R+r)}`,
   'exercise-6':String.raw`\sin\theta=\frac{BIL}{mg}`, 'exercise-8':String.raw`B_{\min}=\frac{mg\sin\alpha}{Il}`,
   'exercise-9':String.raw`t_0=\frac{mg}{\mu kBL},\quad v_{\max}=\frac{gt_0}{2}`,
   'exercise-10':String.raw`I=\frac{\mu mg}{BL(\cos\beta+\mu\sin\beta)}`
  };
  values=[mathBlock(expressions[state.topic.id]||String.raw`\mathrm d\vec F=I\,\mathrm d\vec\ell\times\vec B`),'<p class="measurement-note">题设保留符号关系。进入自由探究，可使用并调整明确标注的演示数值。</p>'];
 }
 $('measurement-values').innerHTML=values.join('');
 $('plot-panel').hidden=state.topic.kind!=='vertical'||!model.valid;
 if(state.topic.kind==='vertical'&&model.valid)renderPlot();
 const sample=model.samples[Math.min(state.part,model.samples.length-1)];
 if(sample?.isNonCurrent){$('local-relation').innerHTML='<h3>悬挂物受力</h3>'+mathBlock(String.raw`Mg-T=Ma`)+'<p>悬挂物不通电。这里分析重力与绳张力，不使用左手定则。</p>';return;}
 $('local-relation').innerHTML=`<h3>${prose(state.topic.parts[state.part])}</h3>${mathBlock(String.raw`\mathrm d\vec F=I\,\mathrm d\vec\ell\times\vec B`)}<p>${!sample||norm(sample.force)<1e-8?'当前局部安培力为零，不显示无意义的受力方向。':sample.isReaction?'左手定则用于导线；磁体受力来自相反作用。':'局部受力与整体合力分别显示，不能用一个代表元替代整体。'}</p>`;
}
function renderPlot(){
 const plot=state.plot,x0=35,y0=plot==='a'?90:145,width=238,height=plot==='a'?57:98;
 const scale=plot==='a'?10:plot==='v'?model.vmax:model.fmax;
 const value=tau=>{const r=verticalState(state.params,tau);return plot==='a'?r.a:plot==='v'?r.v:r.f;};
 const path=[];for(let i=0;i<=150;i++){const tau=i/150*2.45,x=x0+tau/2.5*width,v=value(tau);path.push(`${i?'L':'M'}${x},${y0-v/Math.max(scale,1e-8)*height}`);}
 const markerX=x0+(model.t/model.t0)/2.5*width;
 const tickTop=(y0+13)/185*100,positiveTop=(y0-height)/185*100;
 const area=plot==='a'?`<path d="M${x0} ${y0}V${y0-height}L${x0+width/2.5} ${y0}Z" fill="#dae9d5"/>`:'';
 $('plot').innerHTML=`<svg viewBox="0 0 305 185" aria-label="随时间变化的物理量图像">${area}<path d="M${x0} 22V${plot==='a'?162:y0}M${x0} ${y0}H285" fill="none" stroke="#a8b9a0"/><path d="${path.join(' ')}" fill="none" stroke="${plot==='f'?palette.friction:palette.magnetic}" stroke-width="2"/><line x1="${markerX}" y1="25" x2="${markerX}" y2="${plot==='a'?153:y0}" stroke="#94af91" stroke-dasharray="4 3"/></svg><span class="plot-label" style="left:9%;top:8%">${tex(plot==='a'?'a/g':plot==='v'?String.raw`v/v_{\max}`:'f/(2mg)')}</span><span class="plot-label" style="left:7%;top:${positiveTop}%">${tex('1')}</span>${plot==='a'?`<span class="plot-label" style="left:7%;top:79.5%">${tex('-1')}</span>`:''}<span class="plot-label" style="left:91%;top:${tickTop}%">${tex('t/t_0')}</span><span class="plot-label" style="left:43%;top:${tickTop}%">${tex('1')}</span><span class="plot-label" style="left:74%;top:${tickTop}%">${tex('2')}</span>`;
 document.querySelectorAll('[data-plot]').forEach(b=>b.classList.toggle('active',b.dataset.plot===plot));
}
function cameraUI(){
 if(!scene)return;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',scene.view===b.dataset.view);b.setAttribute('aria-pressed',scene.view===b.dataset.view);});
 document.querySelectorAll('[data-projection]').forEach(b=>{b.classList.toggle('active',scene.projection===b.dataset.projection);b.setAttribute('aria-pressed',scene.projection===b.dataset.projection);});
 const labels={source:'题图方向 · 拖动旋转，滚轮缩放',free:'自由三维观察 · 滚轮缩放',plane:'平面观察 · 保持空间方向不变',top:'从上向下观察',left:'从左向右观察'};
 $('camera-caption').textContent=scene.focused?'局部放大 · 点击题图视角返回':labels[scene.view];
}
function recompute(params=state.params){
 model=evaluateTopic(state.topic,params,state.question,state.mode);
 if(state.hand==='left'){const sample=model.samples[Math.min(state.part,model.samples.length-1)];if(!sample||!norm(sample.tangent)||norm(cross(sample.tangent,sample.B))<1e-8)state.hand=null;}
 if(state.hand==='right'&&(!model.right||!model.right.value))state.hand=null;
 scene?.update(state.topic,params,state.question,model,state);
 renderHandControls();renderAnalysis();renderMeasurement();cameraUI();
}
function refreshAll(resetCamera=true){
 renderNavigation();renderHeader();renderQuestion();renderParameters();recompute();
 if(resetCamera&&scene){scene.setView(currentQuestion().view||'source');cameraUI();}
}
function stop(){playing=false;animationTime=0;animationValue=0;animationBase=null;}
function prepareQuestion(){
 stop();state.params=initialParameters(state.topic,state.question);state.part=currentQuestion().part||0;state.reveal=0;state.hand=null;state.handStep=0;
 state.field=givenFieldVisible();state.forces=(state.topic.id==='guide-balance'&&state.question===1)||(state.topic.kind==='horseshoe'&&state.question===2)||(state.topic.id==='crossed'&&state.question===2);state.resultants=false;state.moment=false;
 state.paper='question';selectPaper('question');refreshAll();$('parameter-panel').open=state.mode==='explore';
}
function selectTopic(id){const next=topics.find(t=>t.id===id);if(!next)return;state.topic=next;state.question=0;prepareQuestion();}
function selectQuestion(index){state.question=index;prepareQuestion();}
function selectPaper(name){state.paper=name;for(const id of ['question','analysis','measure'])$(`paper-${id}`).hidden=id!==name;document.querySelectorAll('[data-paper]').forEach(b=>b.classList.toggle('active',b.dataset.paper===name));}
function changeMode(mode){if(mode===state.mode)return;state.mode=mode;prepareQuestion();if(mode==='explore'){state.field=true;state.forces=true;recompute();selectPaper('measure');announce('已进入自由探究；参数为演示设定。');}}
function revealNext(){
 if(state.mode==='explore'){selectPaper('measure');return;}
 state.reveal=Math.min(currentQuestion().steps.length,state.reveal+1);state.field=true;
 state.forces=state.reveal>=2;state.resultants=state.reveal>=currentQuestion().steps.length;
 if(state.topic.kind==='magnet-loop'&&state.question===0){state.moment=true;state.forces=false;}
 if(state.topic.kind==='horseshoe'&&state.question===0)state.forces=false;
 recompute();selectPaper('analysis');
}
function setPart(part){state.part=part;recompute();}

function animationParameters(progress){
 const p={...(animationBase||state.params)},kind=state.topic.kind;
 if(kind==='vertical'){p.tau=Math.min(2.4,progress*2.4);return p;}
 if(['horseshoe','bar-turn','dual-loop','solenoid','frame','crossed','magnet-loop'].includes(kind)){
  const axis=kind==='dual-loop'?0:kind==='crossed'?2:1;
  const base=evaluateTopic(state.topic,{...p,angle:0},state.question,state.mode),torque=base.torque?.[axis]||0;
  if(Math.abs(torque)>1e-6)p.angle=progress*(kind==='frame'?35:kind==='crossed'?65:75)*Math.sign(torque);
  else p.angle=(animationBase||state.params).angle||0;
  if(kind==='crossed'&&currentQuestion().arrangement!=='separate')p.gap=Math.max(.2,(animationBase||state.params).gap*(1-progress*.45));
  if(kind==='magnet-loop')p.gap=Math.max(.2,Math.min(1.8,(animationBase||state.params).gap+progress*.45*Math.sign(base.netForce?.[0]||0)));
  if(kind==='bar-turn')p.height=(animationBase||state.params).height-.26*progress;
  if(kind==='horseshoe')p.height=Math.max(.6,(animationBase||state.params).height-.09*progress);
  return p;
 }
 if(kind==='pulley'){p.theta=progress*53;return p;}
 if(state.topic.id==='exercise-10'){p.theta=progress*60;return p;}
 if(state.topic.id==='exercise-8'){p.theta=progress*55;return p;}
 if(kind==='radial'){p.I=(animationBase||state.params).I*(.3+.7*progress);return p;}
 return p;
}
function togglePlay(){
 const enabled=['vertical','horseshoe','bar-turn','dual-loop','solenoid','frame','crossed','magnet-loop','pulley','radial'].includes(state.topic.kind)||['exercise-8','exercise-10'].includes(state.topic.id);
 if(!enabled){announce('本问用静态关键状态讲解；可进入自由探究调参观察。');return;}
 if(model.invalid){announce(model.status==='方向与趋势示意'?'当前磁力为零，没有对应的受力变化可演示。':model.status);return;}
 playing=!playing;if(playing){if(animationValue>=1){animationTime=0;animationValue=0;animationBase=null;}if(!animationBase)animationBase={...state.params};state.hand=null;state.field=true;state.forces=true;state.resultants=true;selectPaper('measure');}
 renderAnalysis();
}

document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>changeMode(b.dataset.mode));
document.querySelectorAll('[data-paper]').forEach(b=>b.onclick=()=>selectPaper(b.dataset.paper));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{scene?.setView(b.dataset.view);cameraUI();});
document.querySelectorAll('[data-projection]').forEach(b=>b.onclick=()=>{scene?.setProjection(b.dataset.projection);cameraUI();});
document.querySelectorAll('[data-hand]').forEach(b=>b.onclick=()=>{state.hand=b.dataset.hand;state.handStep=0;recompute();});
document.querySelectorAll('[data-plot]').forEach(b=>b.onclick=()=>{state.plot=b.dataset.plot;renderPlot();});
for(const key of ['field','forces','resultants','moment'])$(`layer-${key}`).onchange=e=>{state[key]=e.target.checked;recompute();};
$('part-select').onchange=e=>setPart(Number(e.target.value));$('reveal-next').onclick=revealNext;
$('hide-answer').onclick=()=>{state.reveal=0;state.forces=false;state.resultants=false;state.moment=false;state.hand=null;stop();recompute();};
$('hide-hand').onclick=()=>{state.hand=null;recompute();};$('hand-next').onclick=()=>{state.handStep=(state.handStep+1)%3;recompute();};$('focus-hand').onclick=()=>{scene?.focusHand();cameraUI();};
$('reset-question').onclick=prepareQuestion;$('play-trend').onclick=togglePlay;$('stop-trend').onclick=()=>{if(animationBase)state.params={...animationBase};stop();syncParameterValues();recompute();};
$('reverse-current').onclick=()=>{if(state.mode!=='explore')return;if(state.params.E!==undefined)state.params.polarity*=-1;else state.params.I*=-1;stop();syncParameterValues();recompute();};
$('parallel-field').onclick=()=>{if(state.mode!=='explore')return;state.params.parallelField=state.params.parallelField?0:1;recompute();};
$('enlarge-figure').onclick=()=>{$('figure-large').innerHTML=$('source-figures').innerHTML;$('figure-dialog').showModal();};
$('source-figures').onclick=()=>$('enlarge-figure').click();$('help-button').onclick=()=>$('help-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('save-state').onclick=()=>{
 const value=encodeState(state,scene.snapshot()),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='题景备课-'+state.topic.label.replaceAll(' ','')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('备课状态已导出，可与 HTML 一起带到教室。');
};
$('load-state').onclick=()=>$('state-file').click();
$('state-file').onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>100000)throw Error('状态文件过大，请选择程序导出的备课 JSON。');
  const saved=decodeState(JSON.parse(await file.text()));
  stop();state={...state,...saved,reveal:0,hand:null,handStep:0,forces:false,resultants:false,moment:false,paper:'question'};delete state.camera;
  state.field=givenFieldVisible();
  refreshAll(false);scene.restore(saved.camera);cameraUI();selectPaper('question');$('parameter-panel').open=state.mode==='explore';announce('备课状态已恢复；答案与手模型先隐藏。');
 }catch(error){announce('未载入：'+error.message);}finally{e.target.value='';}
};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{announce('可用浏览器 F11 进入全屏。');}};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'退出全屏 ⛶':'全屏 ⛶';});
document.addEventListener('keydown',e=>{
 if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;
 if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();togglePlay();}if(e.code==='KeyR')prepareQuestion();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){playing=false;renderAnalysis();}});
$('three-viewport').addEventListener('sceneerror',e=>{playing=false;$('scene-error').textContent=e.detail;$('scene-error').hidden=false;});

try{scene=new GuideScene($('three-viewport'),$('three-labels'),setPart);}
catch(error){$('scene-error').hidden=false;$('scene-error').textContent='三维图形未能启动。请使用支持 WebGL 2 的 Edge / Chrome，并开启硬件加速。';console.error(error);}
prepareQuestion();
function frame(now){
 const delta=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
 if(playing){
  animationTime+=delta;animationValue=Math.min(1,animationTime/6);
  if(now-lastSceneUpdate>130){state.params=animationParameters(animationValue);syncParameterValues();recompute();lastSceneUpdate=now;}
  if(animationValue>=1){playing=false;state.params=animationParameters(1);syncParameterValues();recompute();renderAnalysis();}
 }
 scene?.render(now/1000);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.guide={snapshot:()=>({topic:state.topic.id,question:state.question,mode:state.mode,params:{...state.params},part:state.part,reveal:state.reveal,hand:state.hand,handStep:state.handStep,paper:state.paper,playing,topicCount:topics.length,model:{kind:model.kind,status:model.status,metric:model.metric,invalid:model.invalid,netForce:model.netForce,torque:model.torque,samples:model.samples.map(s=>({pos:s.pos,tangent:s.tangent,B:s.B,force:s.force}))},camera:scene?.snapshot(),audit:scene?.audit,webgl:!!scene,mathErrors:[...mathErrors],render:scene?{calls:scene.renderer.info.render.calls,geometries:scene.renderer.info.memory.geometries}:null})};
