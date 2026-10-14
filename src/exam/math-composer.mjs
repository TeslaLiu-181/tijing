import katex from 'katex';
import {markdown} from './source-view.mjs';
import {createFormulaEditor} from '../formula-editor.mjs';

const templates=[
 {name:'行内公式',hint:'在句子中插入公式',prefix:'$',suffix:'$',value:'F=qvB'},
 {name:'独立公式',hint:'独占一行，适合推导',prefix:'\n$$\n',suffix:'\n$$\n',value:'r=\\frac{mv}{qB}'},
 {name:'分式',hint:'分子 / 分母',prefix:'$\\frac{',suffix:'}{b}$',value:'a'},
 {name:'根式',hint:'平方根',prefix:'$\\sqrt{',suffix:'}$',value:'x'},
 {name:'矢量',hint:'带箭头的矢量',prefix:'$\\vec{',suffix:'}$',value:'v'},
 {name:'下标',hint:'变量下标',prefix:'$',suffix:'_{0}$',value:'v'},
 {name:'角度',hint:'角度与单位',prefix:'$',suffix:'^{\\circ}$',value:'30'},
 {name:'多行推导',hint:'对齐等号的推导',prefix:'\n$$\n\\begin{aligned}\n',suffix:'\n\\end{aligned}\n$$\n',value:'F&=qvB\\\\\nr&=\\frac{mv}{qB}'}
];
const defaultSelector='textarea[data-math-editor],#edit-text,#edit-reference,#edit-part,#crop-text,#forum-compose-body,#forum-edit-comment-body,#forum-reply-body';
const equations=text=>[...String(text).replace(/\x60{3}[\s\S]*?\x60{3}|\x60[^\x60\n]*\x60/g,'').matchAll(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\((.+?)\\\)|\$([^$\n]+)\$/g)].map(m=>({source:m[1]||m[2]||m[3]||m[4],display:!!(m[1]||m[2])}));

/** Enhance a normal textarea; source Markdown remains the saved value. */
export function enhanceMathEditor(textarea,{render=markdown,recognizeFormula,fontsDirectory}={}){
 if(!textarea||textarea.dataset.mathReady==='true')return null;
 textarea.dataset.mathReady='true';
 const tools=document.createElement('div'),preview=document.createElement('div');
 tools.className='math-composer-tools';tools.innerHTML='<div class="math-composer-toolbar"><button type="button" class="math-tools-toggle" aria-expanded="false"><span aria-hidden="true">ƒ</span> 公式工具</button><button type="button" class="math-graphical-editor">图形公式</button><span class="math-composer-status" role="status">支持 LaTeX 与 Markdown</span><button type="button" class="math-preview-toggle" aria-pressed="false">预览排版</button></div><div class="math-template-list" hidden></div>';
 preview.className='math-composer-preview community-markdown';preview.hidden=true;preview.setAttribute('aria-label','文字与公式实时预览');
 textarea.before(tools);textarea.after(preview);textarea.classList.add('math-composer-input');
 const list=tools.querySelector('.math-template-list'),status=tools.querySelector('.math-composer-status'),toggle=tools.querySelector('.math-tools-toggle'),previewToggle=tools.querySelector('.math-preview-toggle');
 templates.forEach((entry,index)=>{const b=document.createElement('button');b.type='button';b.textContent=entry.name;b.title=entry.hint;b.dataset.mathTemplate=index;list.append(b);});
 let timer,open=false,graphical=null,graphicEpoch=0;
 function update(){
  clearTimeout(timer);const found=equations(textarea.value);let error='';
  for(const eq of found){try{katex.renderToString(eq.source,{throwOnError:true,trust:false,displayMode:eq.display,strict:'ignore'});}catch(e){error=String(e.message).replace(/^KaTeX parse error:\s*/,'').slice(0,160);break;}}
  tools.classList.toggle('has-math-error',!!error);status.textContent=error?'公式格式待检查：'+error:found.length?'已识别 '+found.length+' 处公式':'支持 LaTeX 与 Markdown';
  if(open)preview.innerHTML=textarea.value.trim()?render(textarea.value):'<p class="math-preview-empty">输入文字或插入公式，即可查看排版。</p>';else preview.replaceChildren();
 }
 function clear(){graphicEpoch++;graphical?.reset();clearTimeout(timer);open=false;preview.hidden=true;preview.replaceChildren();previewToggle.setAttribute('aria-pressed','false');previewToggle.textContent='预览排版';status.textContent='支持 LaTeX 与 Markdown';tools.classList.remove('has-math-error');list.hidden=true;toggle.setAttribute('aria-expanded','false');}
 function insert(index){
  const entry=templates[index],start=textarea.selectionStart,end=textarea.selectionEnd,selection=textarea.value.slice(start,end)||entry.value,text=entry.prefix+selection+entry.suffix;
  textarea.focus();textarea.setRangeText(text,start,end,'end');textarea.setSelectionRange(start+entry.prefix.length,start+entry.prefix.length+selection.length);textarea.dispatchEvent(new Event('input',{bubbles:true}));update();
 }
 const onInput=()=>{clearTimeout(timer);timer=setTimeout(update,120);};
 textarea.addEventListener('input',onInput);
 const onClick=async event=>{
  const button=event.target.closest('button');if(!button)return;
  event.preventDefault();event.stopPropagation();
  if(button===toggle){list.hidden=!list.hidden;toggle.setAttribute('aria-expanded',String(!list.hidden));}
  else if(button===previewToggle){open=!open;preview.hidden=!open;previewToggle.setAttribute('aria-pressed',String(open));previewToggle.textContent=open?'收起预览':'预览排版';update();}
  else if(button.classList.contains('math-graphical-editor')){
   const text=textarea.value,start=textarea.selectionStart,end=textarea.selectionEnd,ticket=graphicEpoch;
   const matches=[...text.matchAll(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\((.+?)\\\)|\$([^$\n]+)\$/g)];
   const found=matches.find(m=>start>=m.index&&end<=m.index+m[0].length),latex=found?(found[1]||found[2]||found[3]||found[4]):'';
   graphical??=createFormulaEditor({fontsDirectory,onRecognize:recognizeFormula});
   try{const value=await graphical.open({latex,mode:'notation'});if(!value||ticket!==graphicEpoch||!textarea.isConnected)return;if(textarea.value!==text){status.textContent='原文已更新，请重新选择公式位置。';return;}
    const lo=found?found.index:start,hi=found?found.index+found[0].length:end,display=!!(found&&(found[1]||found[2])),markup=display?'$$\n'+value.latex+'\n$$':'$'+value.latex+'$';
    textarea.focus();textarea.setRangeText(markup,lo,hi,'end');textarea.dispatchEvent(new Event('input',{bubbles:true}));update();
   }catch(e){status.textContent=e.message;}
  }
  else if(button.dataset.mathTemplate!==undefined)insert(Number(button.dataset.mathTemplate));
 };
 tools.addEventListener('click',onClick);
 // Form values are assigned programmatically when an editor opens.
 const dialog=textarea.closest('dialog'),onToggle=()=>{if(dialog?.open)update();};dialog?.addEventListener('toggle',onToggle);
 const form=textarea.closest('form');form?.addEventListener('reset',clear);dialog?.addEventListener('close',clear);
 update();
 return {textarea,update,clear,destroy(){graphicEpoch++;graphical?.destroy();clearTimeout(timer);textarea.removeEventListener('input',onInput);form?.removeEventListener('reset',clear);dialog?.removeEventListener('close',clear);dialog?.removeEventListener('toggle',onToggle);tools.removeEventListener('click',onClick);tools.remove();preview.remove();textarea.classList.remove('math-composer-input');delete textarea.dataset.mathReady;}};
}

/** Also observes replies/editors inserted after the first page render. */
export function setupMathComposers({root=document,selector=defaultSelector,render=markdown,recognizeFormula,fontsDirectory}={}){
 const editors=new Set(),scan=node=>{const candidates=[];if(node.matches?.(selector))candidates.push(node);if(node.querySelectorAll)candidates.push(...node.querySelectorAll(selector));for(const input of candidates){const editor=enhanceMathEditor(input,{render,recognizeFormula,fontsDirectory});if(editor)editors.add(editor);}};
 scan(root);
 const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)scan(node);for(const editor of editors)if(!editor.textarea.isConnected){editor.destroy();editors.delete(editor);}});
 observer.observe(root===document?document.body:root,{childList:true,subtree:true});
 const clearAll=()=>{for(const editor of editors)editor.clear();};window.addEventListener('exam-private-reset',clearAll);
 return {reset:clearAll,refresh(){scan(root);for(const editor of editors)editor.update();},destroy(){window.removeEventListener('exam-private-reset',clearAll);observer.disconnect();for(const editor of editors)editor.destroy();editors.clear();}};
}
