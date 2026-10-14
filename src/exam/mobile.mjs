// Controls outside the embedded runtime share the same save and navigation actions.
export function setupMobileWorkspace(){
 const $=id=>document.getElementById(id),landscape=matchMedia('(max-width:1000px) and (max-height:600px) and (orientation:landscape)');
 const compact=matchMedia('(max-width:560px)');
 // Compact drawers share the same space; resizing or leaving immersion must
 // not restore both over the paper. Wider views can keep both panels open.
 function settlePanels(){if(compact.matches&&!document.body.classList.contains('questions-hidden')&&!document.body.classList.contains('source-hidden'))document.body.classList.add('questions-hidden');$('toggle-source').classList.toggle('active',!document.body.classList.contains('source-hidden'));}
 compact.addEventListener('change',settlePanels);
 const enter=document.createElement('button');enter.id='canvas-focus';enter.textContent='沉浸画布';enter.setAttribute('aria-label','展开沙盒画布');enter.setAttribute('aria-pressed','false');$('lecture-mode').before(enter);
 const bar=document.createElement('div');bar.id='mobile-sandbox-bar';bar.innerHTML='<button id="canvas-exit" aria-label="退出沉浸画布">‹ 返回</button><span id="canvas-focus-title"></span><div><select id="canvas-question-select" aria-label="切换题目"></select><select id="canvas-scene-select" aria-label="切换演示场景"></select><button data-focus-proxy="toggle-source">原题</button><button id="mobile-ai-current" data-focus-proxy="web-ai-current" aria-label="展开场景AI侧栏" aria-controls="web-ai-dock" aria-expanded="false" hidden>AI</button><button data-focus-proxy="export-paper">保存 / 导出</button><button id="canvas-fullscreen" aria-label="切换全屏画布">⛶</button></div>';document.body.prepend(bar);
 const questionSelect=$('canvas-question-select'),sceneSelect=$('canvas-scene-select');
 // Keep the frequent canvas controls in one row on phones. Online AI adds a
 // sixth action, so move export and fullscreen into an accessible overflow.
 let more=null;
 if($('web-ai-current')){
  more=document.createElement('details');more.id='canvas-more-tools';more.className='canvas-more-tools';
  more.innerHTML='<summary id="canvas-more-summary" aria-label="更多画布操作">⋯</summary><div class="canvas-more-menu"></div>';
  const save=bar.querySelector('[data-focus-proxy="export-paper"]'),fullscreen=$('canvas-fullscreen');save.before(more);more.lastElementChild.append(save,fullscreen);
  document.addEventListener('click',event=>{if(more.open&&!more.contains(event.target))more.open=false;});
  more.addEventListener('keydown',event=>{if(event.key==='Escape'&&more.open){event.preventDefault();more.open=false;more.firstElementChild.focus();}});
 }
 let previousPanels=null,dismissed=false,pendingSync=0;
 function sync(){
  pendingSync=0;const currentQuestion=$('lecture-question').value;
  questionSelect.replaceChildren(...[...$('lecture-question').options].map(source=>new Option(source.textContent,source.value,false,source.value===currentQuestion)));
  sceneSelect.replaceChildren(...[...$('scene-tabs').querySelectorAll('[data-scene]')].map(button=>new Option(button.textContent.trim(),button.dataset.scene,false,button.classList.contains('active'))));
  $('canvas-focus-title').textContent=$('question-title').textContent;
 }
 const scheduleSync=()=>{if(!pendingSync)pendingSync=requestAnimationFrame(sync);};
 new MutationObserver(scheduleSync).observe($('lecture-question'),{childList:true,subtree:true});
 new MutationObserver(scheduleSync).observe($('scene-tabs'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 new MutationObserver(scheduleSync).observe($('question-title'),{childList:true,characterData:true,subtree:true});
 questionSelect.addEventListener('change',()=>{[...document.querySelectorAll('[data-question]')].find(b=>b.dataset.question===questionSelect.value)?.click();scheduleSync();});
 sceneSelect.addEventListener('change',()=>{[...document.querySelectorAll('[data-scene]')].find(b=>b.dataset.scene===sceneSelect.value)?.click();scheduleSync();});
 const active=()=>!document.body.classList.contains('web-home')&&!document.body.classList.contains('web-auth')&&!$('editor').hidden;
 function focus(enabled){
  if(enabled===document.body.classList.contains('canvas-focus'))return;
  if(enabled){previousPanels={questions:document.body.classList.contains('questions-hidden'),source:document.body.classList.contains('source-hidden')};document.body.classList.add('questions-hidden','source-hidden');}
  else if(previousPanels){document.body.classList.toggle('questions-hidden',previousPanels.questions);document.body.classList.toggle('source-hidden',previousPanels.source);previousPanels=null;}
  document.body.classList.toggle('canvas-focus',enabled);if(!enabled)settlePanels();enter.setAttribute('aria-pressed',String(enabled));$('toggle-source').classList.toggle('active',!document.body.classList.contains('source-hidden'));scheduleSync();
 }
 enter.addEventListener('click',()=>{dismissed=false;focus(true);});
 $('canvas-exit').addEventListener('click',()=>{dismissed=true;focus(false);if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});});
 $('canvas-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('canvas-fullscreen').setAttribute('aria-label','此浏览器暂不支持全屏，当前已展开沉浸画布');}});
 document.addEventListener('fullscreenchange',()=>{$('canvas-fullscreen').textContent=document.fullscreenElement?'⊡':'⛶';$('canvas-fullscreen').setAttribute('aria-label',document.fullscreenElement?'退出全屏画布':'进入全屏画布');});
 bar.addEventListener('click',event=>{const proxy=event.target.closest('[data-focus-proxy]');if(proxy)$(proxy.dataset.focusProxy)?.click();if(event.target.closest('.canvas-more-menu button')&&more)more.open=false;});
 const observer=new MutationObserver(()=>{scheduleSync();if(!active()){focus(false);return;}if(landscape.matches&&!dismissed)focus(true);});
 observer.observe($('editor'),{attributes:true,attributeFilter:['hidden','src','srcdoc']});
 new MutationObserver(()=>{if(document.body.classList.contains('web-home')||document.body.classList.contains('web-auth')){dismissed=false;focus(false);}}).observe(document.body,{attributes:true,attributeFilter:['class']});
 landscape.addEventListener('change',()=>{dismissed=false;if(active())focus(landscape.matches);});
 sync();
}
