import {tex,num} from './lorentz-math.mjs';
import {targets,properties,bindingKey,setDefinition,definitionTex,displayExpression,geometryFeatures,pathKeyFor,canonicalExpression,createResolver} from './planar-relations.mjs';
import {createObject,kinds} from './planar-model.mjs';
import {createFormulaEditor} from './formula-editor.mjs';
import {sceneFormulaReferences,parameterExpression} from './planar-formula-references.mjs';
import {constructionOwns} from './planar-geometry.mjs';
const $=id=>document.getElementById(id),esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),opt=(value,name,current)=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(name)}</option>`;
const section=(title,body)=>`<section class="section"><h3>${title}</h3>${body}</section>`;
const operations={intersect:'两曲线交点',on:'点在线 / 圆上',mid:'两点中点',foot:'点到直线的垂足',toward:'方向指向某点',parallel:'方向平行于直线',perp:'方向垂直于直线',distance:'两点距离'};
const safeTex=code=>{try{return tex(code);}catch{return esc(code);}};
export function createRelationsUI({model,selected,ui,mutate,select,refresh,toast,recognizeFormula,openDependencyGraph}){
 let owner=null,key='position',draft='',locked=true,refId='',refKey='',operation='intersect',a='',b='',branch='1',pick=false;
 const object=()=>selected();
 const writable=o=>Object.fromEntries(Object.entries(targets(o)).filter(([key])=>!constructionOwns(o,key)&&!(o.kind==='parameter'&&key!=='value')&&!(o.points&&['position','x','y'].includes(key))&&!(o.regionSource&&(['position','x','y','radius','width','height','angle'].includes(key)||/^point\d+(?:[xy])?$/.test(key)))));
 const initialKey=o=>{const options=writable(o),preferred=o.kind==='parameter'?'value':o.points?'point0':'position';return options[preferred]?preferred:Object.keys(options)[0]||null;};
 const formulaEditor=createFormulaEditor({fontsDirectory:null,onRecognize:recognizeFormula,validateDependency:(value,options)=>{
  const candidate=structuredClone(model()),source=canonicalExpression(candidate,value.expression);setDefinition(candidate,options.context.owner,options.context.key,source,value.continuous);
  // A new GUI definition is applied only after its actual target can be read.
  // Existing constraints still retain their definitions if geometry later
  // becomes undefined; this check does not alter that recovery behavior.
  createResolver(candidate).get(options.context.owner,options.context.key);
 }});
 async function graphicalFormula(){
  const o=object();if(!o||!key)return;const scene=model(),targetKey=key,ownerId=o.id;
  const references=sceneFormulaReferences(scene);
  try{
   const result=await formulaEditor.open({mode:'dependency',expression:draft.trim()?parameterExpression(scene,draft):'',references,target:{canonical:o.id+'.'+targetKey,name:o.label+' · '+(targets(o)[targetKey]?.name||targetKey),unit:targets(o)[targetKey]?.unit},continuous:locked,context:{owner:ownerId,key:targetKey}});
   if(!result||!model().objects.some(x=>x.id===ownerId))return;
   mutate(()=>setDefinition(model(),ownerId,targetKey,canonicalExpression(model(),result.expression),result.continuous));
   owner=ownerId;key=targetKey;draft=displayExpression(model(),result.expression);locked=result.continuous;refresh();
  }catch(error){toast(error.message);}
 }
 function open(target){const o=object();if(!o)return;owner=o.id;key=target||key;if(!writable(o)[key])key=initialKey(o);if(key)key=bindingKey(o,key)||key;draft=key&&o.defs?.[key]?displayExpression(model(),o.defs[key]):'';locked=true;ui.panel='relations';ui.sidebar=true;ui.geometry=false;refresh();}
 function insert(text){const e=$('relation-expression');if(!e)return;const start=e.selectionStart??e.value.length,end=e.selectionEnd??start;e.value=e.value.slice(0,start)+text+e.value.slice(end);draft=e.value;e.focus();e.setSelectionRange(start+text.length,start+text.length);preview();}
 function preview(){
  if(!$('definition-preview'))return;try{$('definition-preview').innerHTML=draft.trim()?safeTex(definitionTex(model(),draft)):'<span>点击对象插入引用，或输入数学表达式</span>';}catch(error){$('definition-preview').textContent=error.message;}
 }
 function status(){
  const o=object(),e=$('relation-state');if(e)e.textContent=o?o._issues?.[key]||o._error||(o.defs?.[key]?'定义有效；自由量变化时自动更新。':'当前为自由量，未建立持续依赖。'):'';
  if(e)e.classList.toggle('error',!!o?._error);
  for(const row of document.querySelectorAll('[data-dependency-row]')){const target=model().objects.find(o=>o.id===row.dataset.dependencyRow),message=target?._issues?.[row.dataset.key];row.classList.toggle('invalid',!!message);row.querySelector('.dependency-state').textContent=message||'联动中';}
 }
 function buildOptions(){
  const o=object(),features=geometryFeatures(model(),o?.id),points=features.points.map(p=>[p.expr,p.name]),curves=features.curves.map(c=>[c.expr,c.name]),lines=features.curves.filter(c=>c.g.kind==='line').map(c=>[c.expr,c.name]);
  const first=['intersect','on','parallel','perp'].includes(operation)?(operation==='parallel'||operation==='perp'?lines:curves):points;
  const second=operation==='intersect'?curves:operation==='foot'?lines:points;
  if(!first.some(x=>x[0]===a))a=first[0]?.[0]||'';if(!second.some(x=>x[0]===b))b=second.find(x=>x[0]!==a)?.[0]||second[0]?.[0]||'';
  return `<div class="form-row"><label>构造方式</label><select id="construct-op">${Object.entries(operations).map(([k,v])=>opt(k,v,operation)).join('')}</select></div><label class="small-label">${['intersect','on','parallel','perp'].includes(operation)?'选择曲线 / 边':'选择第一个点'}</label><select id="construct-a" class="full-select">${first.map(([k,v])=>opt(k,v,a)).join('')}</select>`+
   (!['on','toward','parallel','perp'].includes(operation)?`<label class="small-label">${operation==='intersect'||operation==='foot'?'选择另一条曲线 / 边':'选择第二个点'}</label><select id="construct-b" class="full-select">${second.map(([k,v])=>opt(k,v,b)).join('')}</select>`:'')+
   (operation==='intersect'?`<div class="form-row"><label>交点分支</label><select id="construct-branch">${opt('1','第 1 个交点',branch)+opt('2','第 2 个交点',branch)}</select></div>`:'')+
   `<button id="construct-definition" class="wide-button">生成定义</button><p class="note">生成后可修改表达式，再选择持续依赖或只计算一次。</p>`;
 }
 function referenceOptions(){const o=model().objects.find(o=>o.id===refId)||object();if(!o)return '';refId=o.id;const options=[['','整个对象（用于构造）'],...Object.entries({...properties(o),...targets(o)}).map(([k,v])=>[k,v.name+(v.readOnly?'（测量值）':'')])];if(!options.some(x=>x[0]===refKey))refKey='';return options.map(([k,v])=>opt(k,v,refKey)).join('');}
 function render(){
  const scene=model(),o=object();if(o?.id!==owner){owner=o?.id;key=o?initialKey(o):null;draft=o?.defs?.[key]?displayExpression(scene,o.defs[key]):'';}
  if(o&&!writable(o)[key])key=initialKey(o);
  let html=section('捕捉',`<div class="snap-settings">${[['grid','网格吸附'],['geometry','几何吸附'],['lock','捕获后锁定关系']].map(([k,label])=>`<label><input type="checkbox" data-snap-setting="${k}" ${scene.snap[k]?'checked':''}>${label}</label>`).join('')}</div><div class="form-row"><label>网格间距 ${tex('h')}</label><select id="snap-step">${[.01,.05,.1,.25,.5,1,2,5].map(n=>opt(String(n),n+' cm',String(scene.snap.step))).join('')}</select></div><div class="form-row"><label>方向步长 ${tex('\\Delta\\theta')}</label><select id="snap-angle">${[0,1,5,15,30,45,90].map(n=>opt(String(n),n?n+'°':'关闭',String(scene.snap.angle))).join('')}</select></div><p class="note">几何目标优先于网格。按住 Alt 可暂时自由拖动。勾选锁定后，捕获的交点、路径和方向会保持关系。</p>`);
  html=`<details class="relation-details snap-options"><summary>捕捉设置</summary>${html}</details><button id="add-parameter" class="wide-button">＋ 自由参数</button><button id="scene-dependency-graph" class="wide-button">查看输入、下游与完整关系图</button>`;
  if(o&&key){
   html+=section('编辑定义',`<label class="small-label">目标对象</label><select id="relation-owner" class="full-select">${scene.objects.map(x=>opt(x.id,kinds[x.kind]+' · '+x.label,o.id)).join('')}</select><div class="form-row"><label>定义哪个量</label><select id="relation-target">${Object.entries(writable(o)).map(([k,v])=>opt(k,v.name,key)).join('')}</select></div>`+
    `<button type="button" id="graphical-definition" class="wide-button">图形公式编辑 · 分式 / 根式 / 手写</button><textarea id="relation-expression" aria-label="关系表达式" spellcheck="false" rows="3" placeholder="例如 sqrt(2) * B_1.height">${esc(draft)}</textarea><div id="definition-preview" class="definition-preview"></div>`+
    `<div class="formula-tokens">${['sqrt(2)','abs()','sin()','point(, )'].map(t=>`<button data-formula-token="${t}">${safeTex(t==='sqrt(2)'?'\\sqrt{2}':t==='abs()'?'|\\square|':t==='sin()'?'\\sin(\\square)':'(x,y)')}</button>`).join('')}</div>`+
    `<label class="relation-lock"><input id="relation-lock" type="checkbox" ${locked?'checked':''}>持续依赖 <span>取消勾选则只计算一次</span></label><div class="field-actions"><button id="apply-definition" class="primary">应用定义</button><button id="unlink-definition" ${o.defs?.[key]?'':'disabled'}>解除依赖</button></div><p id="relation-state" class="note"></p>`);
   html+=`<details class="relation-details" open><summary>图形构造</summary>${buildOptions()}</details>`;
   html+=`<details class="relation-details"><summary>插入对象引用</summary><select id="reference-object" class="full-select">${scene.objects.map(x=>opt(x.id,x.label+' · '+kinds[x.kind],refId||o.id)).join('')}</select><select id="reference-property" class="full-select">${referenceOptions()}</select><div class="field-actions"><button id="insert-reference">插入引用</button><button id="pick-reference" class="${pick?'active':''}">${pick?'请点画布对象':'在画布点选'}</button></div></details>`;
  }else html+=section(o?'几何约束':'建立依赖',o?'<p class="note">这个对象的几何量由构造输入决定。可在关系图中选择它的输入点，或在参数页调整构造参数。</p>':'<p class="note">先在画布选择对象，或添加自由参数、辅助点、线、圆。也可打开“典型场景 → 依赖构造”体验。</p>');
  const definitions=scene.objects.flatMap(x=>Object.entries(x.defs||{}).map(([k,text])=>`<div class="dependency-row" data-dependency-row="${x.id}" data-key="${k}"><button data-edit-definition="${x.id}" data-key="${k}" class="dependency-title">${safeTex(x.label)} · ${esc(targets(x)[k]?.name||k)}</button><div class="dependency-formula">${safeTex(definitionTex(scene,text))}</div><span class="dependency-state"></span></div>`));
  if(definitions.length)html+=section('场景中的依赖',definitions.join(''));
  html+=`<details class="relation-details"><summary>表达式与构造说明</summary><p class="note">数值可用分数、根式、幂及常用函数。加减中的纯数字沿用所引用参数的显示单位；物理量乘除自动换算单位。角度默认用度，定义及单位会随场景保存。</p><div class="function-list">${[
   ['sqrt(2) * 对象.height','根式比例'],['abs(粒子.charge * 磁场.B) * 圆.radius / 粒子.mass','按给定半径计算速率'],['pos(A) / center(A)','位置 / 圆心'],['point(x, y) / polar(r, θ)','坐标 / 极坐标'],['vertex(A, i) / edge(A, i)','顶点 / 边（从 1 起）'],['end(l, i) / mid(P, Q)','端点 / 中点'],['line(P, Q) / circle(P, r)','由点构造直线 / 圆'],['intersect(c, l, 1)','交点，分支 1 或 2'],['on(c, θ) / on(l, t)','圆上角度 / 线上比例位置'],['foot(P, l)','垂足'],['bearing(P, Q)','从 P 指向 Q 的角度'],['distance(P, Q)','两点距离'],['parallel(l, P) / perp(l, P)','过 P 的平行线 / 垂线'],['vector(P, Q), unit(v), rotate(v, θ)','向量、单位向量与旋转'],['axisX / axisY','坐标轴'],['cm, m, u, e, mT, T, deg, rad, us','可显式输入单位，如 2 cm']
  ].map(([code,name])=>`<p><span>${name}</span><code>${esc(code)}</code></p>`).join('')}</div><p class="note">引用仅使用场景参数和构造几何；仿真出射点等结果暂不作为依赖输入。粒子源的定义作用于中心参数，张角与速率分散继续控制各粒子。</p></details>`;
  $('panel-content').innerHTML=html;preview();status();
 }
 function generated(){
  const o=object();if(!o||!a)throw Error('请先选择构造对象。');const vectorKey=key==='position'||/^point\d+$/.test(key)?key:o.points?'point0':'position';let expr;
  if(operation==='intersect'){key=vectorKey;expr=`intersect(${a}, ${b}, ${branch})`;}
  if(operation==='on'){key=vectorKey;expr=`on(${a}, ${o.id}.${pathKeyFor(key)})`;}
  if(operation==='mid'){key=vectorKey;expr=`mid(${a}, ${b})`;}
  if(operation==='foot'){key=vectorKey;expr=`foot(${a}, ${b})`;}
  if(['toward','parallel','perp'].includes(operation)){
   if(o.points?.length===2){
    const length=Math.hypot(o.points[1][0]-o.points[0][0],o.points[1][1]-o.points[0][1]);if(!length)throw Error('先设置两个不同的端点。');key='point1';
    const v=operation==='toward'?`vector(${o.id}.point0, ${a})`:`vector(end(${a}, 1), end(${a}, 2))`;
    expr=`${o.id}.point0 + ${length} cm * unit(${operation==='perp'?`rotate(${v}, 90)`:v})`;
   }else{key=o.kind==='electric'?'fieldAngle':typeof o.heading==='number'?'heading':typeof o.angle==='number'?'angle':null;if(!key)throw Error('请选择粒子、源、有转角的场域或两端点的线。');expr=operation==='toward'?`bearing(pos(${o.id}), ${a})`:`bearing(end(${a}, 1), end(${a}, 2))${operation==='perp'?' + 90':''}`;}
  }
  if(operation==='distance'){if(!properties(o)[key]||properties(o)[key].unit!=='cm')key=properties(o).radius?'radius':properties(o).width?'width':o.kind==='parameter'?'value':'x';expr=`distance(${a}, ${b})`;}
  draft=displayExpression(model(),expr);render();$('relation-expression').focus();
 }
 function click(button){
  if(button.dataset.fx){open(button.dataset.fx);return true;}
  if(button.dataset.formulaToken){insert(button.dataset.formulaToken);return true;}
  if(button.dataset.editDefinition){select(button.dataset.editDefinition);open(button.dataset.key);return true;}
  if(button.dataset.snapToggle){mutate(()=>{const k=button.dataset.snapToggle;model().snap[k]=!model().snap[k];if(k==='grid'&&model().snap.grid)model().display.grid=true;},{reset:false});return true;}
  switch(button.id){
   case 'scene-dependency-graph':openDependencyGraph?.(object()?.id);return true;
   case 'graphical-definition':graphicalFormula();return true;
   case 'relations-button':open();return true;
   case 'add-parameter':mutate(()=>{const o=createObject('parameter','o'+model().nextId++);model().objects.push(o);ui.selected=o.id;ui.panel='objects';});return true;
   case 'apply-definition':try{mutate(()=>{const o=object(),source=canonicalExpression(model(),draft);for(const match of source.matchAll(new RegExp('\\b'+o.id+'\\.(pathT\\d?)\\b','g')))if(o[match[1]]===undefined)o[match[1]]=0;setDefinition(model(),o.id,key,source,locked);});}catch(e){toast(e.message);}return true;
   case 'unlink-definition':mutate(()=>{delete object().defs[key];});draft='';refresh();return true;
   case 'construct-definition':try{generated();}catch(e){toast(e.message);}return true;
   case 'insert-reference':{const o=model().objects.find(o=>o.id===refId);if(o)insert(displayExpression(model(),o.id+(refKey?'.'+refKey:'')));return true;}
   case 'pick-reference':pick=!pick;ui.pickReference=pick;button.textContent=pick?'请点画布对象':'在画布点选';toast('点击画布中的对象，将它插入当前表达式。');return true;
  }return false;
 }
 function change(e){
  if(e.dataset.snapSetting){mutate(()=>{model().snap[e.dataset.snapSetting]=e.checked;if(e.dataset.snapSetting==='grid'&&e.checked)model().display.grid=true;},{reset:false});return true;}
  if(e.id==='snap-step'||e.id==='snap-angle'){mutate(()=>model().snap[e.id==='snap-step'?'step':'angle']=Number(e.value),{reset:false});return true;}
  if(e.id==='relation-owner'){select(e.value);render();return true;}
  if(e.id==='relation-target'){open(e.value);return true;}
  if(e.id==='relation-lock'){locked=e.checked;return true;}
  if(e.id==='reference-object'){refId=e.value;$('reference-property').innerHTML=referenceOptions();return true;}
  if(e.id==='reference-property'){refKey=e.value;return true;}
  if(e.id==='construct-op'){operation=e.value;render();return true;}
  if(e.id==='construct-a'){a=e.value;return true;}if(e.id==='construct-b'){b=e.value;return true;}if(e.id==='construct-branch'){branch=e.value;return true;}
  return false;
 }
 function input(e){if(e.id==='relation-expression'){draft=e.value;preview();return true;}return false;}
 function pickObject(id){if(!pick)return false;const o=model().objects.find(o=>o.id===id);if(o){insert(displayExpression(model(),o.id));pick=false;ui.pickReference=false;const b=$('pick-reference');if(b)b.textContent='在画布点选';}return true;}
 function restored(){formulaEditor.reset();const o=object();if(!o){owner=null;draft='';return;}owner=o.id;if(!writable(o)[key])key=initialKey(o);draft=key&&o.defs?.[key]?displayExpression(model(),o.defs[key]):'';}
 return {open,render,click,change,input,sync:status,pickObject,restored,get picking(){return pick;}};
}
