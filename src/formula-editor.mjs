import katex from 'katex';
import {expressionToFormula,formulaToExpression,validateFormulaLatex} from './formula-conversion.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const templates=[
 ['分式','\\frac{#0}{#?}'],['平方根','\\sqrt{#0}'],['n次根式','\\sqrt[#?]{#0}'],
 ['上标','#@^{#?}'],['下标','#@_{#?}'],['上下标','#@_{#?}^{#?}'],
 ['矢量','\\vec{#0}'],['绝对值','\\left|#0\\right|'],['括号','\\left(#0\\right)'],
 ['矩阵','\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}'],['等号','=']
];
const symbols=['\\pi','\\theta','\\alpha','\\beta','\\Delta','\\lambda','\\mu','\\omega','\\times','\\cdot','\\pm','\\le','\\ge','\\infty'];
let runtime,keyboardMounted=false;
async function mathRuntime(fontsDirectory){
 runtime??=import('mathlive');const lib=await runtime,Class=lib.MathfieldElement||globalThis.MathfieldElement;
 if(!Class)throw Error('图形公式组件未加载，请刷新后重试。');
 Class.fontsDirectory=fontsDirectory===undefined?'./mathlive/fonts':fontsDirectory;Class.soundsDirectory=null;Class.locale='zh-CN';
 // A hosted srcdoc has an opaque origin. Keep the keyboard in this document,
 // instead of the default proxy posting to a parent with targetOrigin=null.
 if(globalThis.window&&window!==window.top&&!keyboardMounted){
  // MathLive 0.111 installs a lazy proxy getter; evaluating that getter first
  // would post to opaque origin `null`. Replace only this configurable vendor
  // getter before using its official local-keyboard initializer.
  const descriptor=Object.getOwnPropertyDescriptor(window,'mathVirtualKeyboard');
  if(descriptor?.configurable)Object.defineProperty(window,'mathVirtualKeyboard',{configurable:true,writable:true,value:undefined});
  const keyboard=lib.initVirtualKeyboardInCurrentBrowsingContext();if(keyboard)keyboard.isSandbox=true;keyboardMounted=true;
 }
 return Class;
}
function renderLatex(latex){try{return katex.renderToString(latex,{throwOnError:true,trust:false,strict:'ignore',displayMode:true});}catch{return '<span>先填写完整的公式槽位</span>';}}
let instanceCounter=0;

/** One real two-dimensional MathLive field. Values never evaluate JavaScript. */
export function createFormulaEditor({fontsDirectory,onRecognize,validateDependency,onConfirm}={}){
 const id='formula-editor-'+(++instanceCounter),dialog=document.createElement('dialog');dialog.id=id;dialog.className='formula-editor-dialog';
 dialog.innerHTML='<div class="formula-editor-heading"><div><span>图形公式编辑器</span><h2>像写在纸上一样编辑公式</h2></div><button type="button" data-formula-action="close" aria-label="关闭公式编辑器">×</button></div><p class="formula-editor-context"></p><div class="formula-editor-toolbar"></div><div class="formula-mathfield-wrap"></div><div class="formula-matrix-tools" hidden><span>矩阵位置编辑</span><button type="button" data-formula-command="addRowAfter">增加一行</button><button type="button" data-formula-command="addColumnAfter">增加一列</button><button type="button" data-formula-command="removeRow">删除本行</button><button type="button" data-formula-command="removeColumn">删除本列</button></div><p class="formula-caret-note">点击分子、分母、指数或矩阵单元格直接编辑；方向键移动，Tab 跳到下一个空位。</p><div class="formula-editor-symbols"></div><div class="formula-reference-tools" hidden><label>插入具体对象与属性<select class="formula-reference-select"></select></label><button type="button" data-formula-action="reference">插入引用</button></div><section class="formula-variable-panel" hidden><h3>确认变量代表哪个量</h3><p>只绑定你明确选择的对象，不把当前数值当成固定常量。</p><div class="formula-variable-list"></div></section><div class="formula-dependency-options" hidden><label><input class="formula-equation-confirm" type="checkbox">确认等号左侧对应当前目标，只应用右侧</label><label><input class="formula-matrix-point" type="checkbox">把2行1列矩阵作为二维位置（point）</label><label><input class="formula-continuous" type="checkbox" checked>持续依赖；自由参数改变时联动</label></div><details class="formula-source-details"><summary>LaTeX源与依赖表达式</summary><label>LaTeX源<textarea class="formula-latex-source" rows="3" spellcheck="false"></textarea></label><div class="formula-converted" hidden><span>将应用的数学表达式</span><code></code></div></details><div class="formula-render-preview"></div><div class="formula-editor-error" hidden role="alert"></div><footer class="formula-editor-actions"><button type="button" data-formula-action="keyboard">屏幕键盘</button><button type="button" data-formula-action="handwriting" '+(onRecognize?'':'hidden')+'>手写公式</button><button type="button" data-formula-action="cancel">取消</button><button type="button" data-formula-action="confirm" class="primary">确认使用公式</button></footer>';
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector),toolbar=$('.formula-editor-toolbar'),symbolBar=$('.formula-editor-symbols'),wrap=$('.formula-mathfield-wrap'),source=$('.formula-latex-source'),error=$('.formula-editor-error'),preview=$('.formula-render-preview');
 for(const [label,latex] of templates){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.formulaTemplate=latex;toolbar.append(b);}
 for(const latex of symbols){const b=document.createElement('button');b.type='button';b.dataset.formulaTemplate=latex;b.innerHTML=renderLatex(latex);b.setAttribute('aria-label','插入 '+latex);symbolBar.append(b);}
 let field,options={},bindings={},converted=null,resolveOpen=null,requestToken=0,updatingSource=false,confirming=false;
 function report(message){error.textContent=message||'';error.hidden=!message;}
 function collectBindings(){for(const select of dialog.querySelectorAll('[data-formula-variable]'))bindings[select.dataset.formulaVariable]=select.value;}
 function update(){
  if(!field||updatingSource)return;collectBindings();const latex=field.getValue('latex-unstyled');source.value=latex;preview.innerHTML=renderLatex(latex);converted=null;report('');$('.formula-matrix-tools').hidden=!/\\begin\{[pbBvV]?matrix\}/.test(latex);
  if(options.mode!=='dependency'){$('.formula-variable-panel').hidden=true;$('.formula-variable-list').replaceChildren();$('.formula-converted').hidden=true;$('.formula-converted code').textContent='';return;}
  let needed=[];
  try{converted=formulaToExpression(latex,{references:options.references||[],bindings,target:options.target?.canonical,acceptEquation:$('.formula-equation-confirm').checked,matrixAsPoint:$('.formula-matrix-point').checked});}
  catch(e){report(e.message);needed=e.symbols||[];}
  const list=$('.formula-variable-list'),previous=new Map([...list.querySelectorAll('select')].map(el=>[el.dataset.formulaVariable,el.value])),symbolsToShow=[...new Set([...Object.keys(bindings),...needed])];
  list.innerHTML=symbolsToShow.map(symbol=>'<label><span>'+esc(symbol)+'</span><select data-formula-variable="'+esc(symbol)+'"><option value="">请选择实际物理量</option>'+[...(options.references||[]),...(options.target?[{canonical:options.target.canonical,label:'当前目标：'+options.target.name,unit:options.target.unit}]:[])].map(ref=>'<option value="'+esc(ref.canonical)+'" '+(bindings[symbol]===ref.canonical?'selected':'')+'>'+esc(ref.label||ref.canonical)+(ref.unit?' ['+esc(ref.unit)+']':'')+'</option>').join('')+'</select></label>').join('');
  for(const select of list.querySelectorAll('select'))if(previous.has(select.dataset.formulaVariable)&&!bindings[select.dataset.formulaVariable])select.value=previous.get(select.dataset.formulaVariable);
  $('.formula-variable-panel').hidden=!symbolsToShow.length;const convertedPanel=$('.formula-converted');convertedPanel.hidden=!converted;convertedPanel.querySelector('code').textContent=converted?.expression||'';
 }
 function setValue(latex){validateFormulaLatex(latex);updatingSource=true;field.setValue(latex,{silenceNotifications:true});updatingSource=false;update();}
 function close(value=null){requestToken++;confirming=false;if(!dialog.open)return;globalThis.mathVirtualKeyboard?.hide();dialog.close();const done=resolveOpen;resolveOpen=null;done?.(value);}
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{globalThis.mathVirtualKeyboard?.hide();if(resolveOpen){const done=resolveOpen;resolveOpen=null;done(null);}});
 source.addEventListener('input',()=>{try{setValue(source.value);}catch(e){report(e.message);}});
 dialog.addEventListener('change',event=>{if(event.target.matches('[data-formula-variable],.formula-equation-confirm,.formula-matrix-point,.formula-continuous'))update();});
 dialog.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;event.preventDefault();
  if(b.dataset.formulaCommand){field.focus();if(!field.executeCommand(b.dataset.formulaCommand))report('先点击矩阵中需要编辑的单元格。');else update();return;}
  if(b.dataset.formulaTemplate){field.focus();field.insert(b.dataset.formulaTemplate,{selectionMode:'placeholder'});update();return;}
  const action=b.dataset.formulaAction;
  if(action==='close'||action==='cancel'){close();return;}
  if(action==='keyboard'){const keyboard=globalThis.mathVirtualKeyboard;if(keyboard){keyboard.container=dialog;keyboard.visible=!keyboard.visible;}return;}
  if(action==='reference'){const ref=(options.references||[]).find(ref=>ref.canonical===$('.formula-reference-select').value);if(ref){field.focus();field.insert(ref.latex,{selectionMode:'after'});update();}return;}
  if(action==='handwriting'&&onRecognize){
   const ticket=++requestToken;b.disabled=true;
   try{const result=await onRecognize({context:options.context,mode:options.mode,target:options.target});if(ticket!==requestToken||!dialog.open)return;if(result?.latex)setValue(result.latex);}catch(e){if(ticket===requestToken)report(e.message);}finally{b.disabled=false;}return;
  }
  if(action!=='confirm'||confirming)return;
  const ticket=requestToken;confirming=true;b.disabled=true;
  try{
   const latex=validateFormulaLatex(field.getValue('latex-unstyled'));
   if(/\\placeholder(?:\[[^\]]*\])?\{\s*\}/.test(latex))throw Error('请填完整所有公式槽位。');
   update();let value={latex,bindings:{...bindings},continuous:$('.formula-continuous').checked};
   if(options.mode==='dependency'){
    if(!converted)throw Error(error.textContent||'先确认变量与可执行的依赖表达式。');
    value={...value,...converted};await validateDependency?.(value,options);
   }
   if(ticket!==requestToken||!dialog.open)return;await onConfirm?.(value,options);if(ticket!==requestToken||!dialog.open)return;close(value);
  }catch(e){if(ticket===requestToken)report(e.message);}finally{if(ticket===requestToken||!dialog.open){confirming=false;b.disabled=false;}}
 });
 return {
  dialog,async open(next={}){
   if(dialog.open)close();const ticket=++requestToken;confirming=false;$('[data-formula-action="confirm"]').disabled=false;options={mode:'notation',...next};bindings={...(next.bindings||{})};$('.formula-variable-list').replaceChildren();converted=null;
   const Class=await mathRuntime(fontsDirectory);if(ticket!==requestToken)return null;
   if(!field){field=new Class({mathVirtualKeyboardPolicy:window===window.top?'manual':'sandboxed'});field.smartMode=false;field.className='formula-mathfield';field.setAttribute('aria-label','可直接编辑结构位置的数学公式');field.addEventListener('input',update);wrap.append(field);}
   $('.formula-editor-context').textContent=options.target?'当前目标：'+options.target.name+(options.target.unit?' ['+options.target.unit+']':''):'编辑后插回原来的文字位置，原文由你决定如何保存。';
   $('.formula-dependency-options').hidden=options.mode!=='dependency';$('.formula-reference-tools').hidden=!(options.references?.length);
   
   $('.formula-equation-confirm').checked=false;$('.formula-matrix-point').checked=false;$('.formula-continuous').checked=next.continuous!==false;
   let latex=next.latex||'';
   if(next.expression){const value=expressionToFormula(next.expression,{references:next.references||[]});latex=value.latex;options.references=[...new Map([...(options.references||[]),...value.references].map(ref=>[ref.canonical,ref])).values()];}
   $('.formula-reference-tools').hidden=!(options.references?.length);$('.formula-reference-select').innerHTML=(options.references||[]).map(ref=>'<option value="'+esc(ref.canonical)+'">'+esc(ref.label||ref.canonical)+(ref.unit?' ['+esc(({speed:'10⁵ m/s',deg:'°',us:'μs',cm2:'cm²',m2:'m²'})[ref.unit]||ref.unit)+']':'')+'</option>').join('');
   if(latex)validateFormulaLatex(latex);field.setValue(latex,{silenceNotifications:true});update();dialog.showModal();field.focus();
   return new Promise(resolve=>{resolveOpen=resolve;});
  },
  reset(){close();if(field)field.setValue('',{silenceNotifications:true});source.value='';preview.replaceChildren();$('.formula-editor-context').textContent='';$('.formula-variable-list').replaceChildren();$('.formula-reference-select').replaceChildren();$('.formula-converted code').textContent='';$('.formula-converted').hidden=true;bindings={};converted=null;options={};report('');},
  destroy(){this.reset();dialog.remove();}
 };
}
