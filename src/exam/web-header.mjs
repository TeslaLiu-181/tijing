import {setButtonIcon} from './web-ui.mjs';

// Keep the existing navigation nodes and handlers. Narrow screens move the
// less frequent actions into a menu instead of shrinking their text or icons.
export function setupWebHeader(){
 const $=id=>document.getElementById(id),header=document.querySelector('.app-header'),toolbar=header?.querySelector('.web-toolbar');
 if(!header||!toolbar)return;
 const icons={'toggle-questions':'book','import-documents':'file-import','import-resources':'folder-import','export-paper':'save','lecture-mode':'presentation','web-home':'home','web-publish':'upload','web-post':'workshop','web-send-feedback':'feedback','web-ai-current':'sparkles','web-admin':'group','web-feedback-inbox':'feedback','web-profile':'group','web-account-center':'group','web-api-settings':'settings','web-assignments-menu':'document','web-account':'key','web-unpublish':'eye','web-logout':'logout'};
 for(const [id,name]of Object.entries(icons))setButtonIcon($(id),name);
 $('toggle-questions').textContent='';
 const overflow=document.createElement('details');overflow.className='header-overflow';overflow.hidden=true;
 overflow.innerHTML='<summary aria-label="更多页面操作" title="更多页面操作">操作</summary><div class="header-overflow-menu" role="group" aria-label="页面导航与资源操作"></div>';
 setButtonIcon(overflow.firstElementChild,'more');toolbar.append(overflow);
 const menu=overflow.lastElementChild,narrow=matchMedia('(max-width:1100px)'),phone=matchMedia('(max-width:560px)');
 const entries=['import-documents','import-resources','lecture-mode','web-home','web-publish','web-post','web-send-feedback','export-paper'].map(id=>{
  const node=$(id),slot=document.createComment('Header action position');node.before(slot);return {id,node,slot};
 });
 function syncVisibility(){
  const visible=entries.some(({node})=>node.parentNode===menu&&!node.hidden&&getComputedStyle(node).display!=='none');
  const hideMenu=!visible;if(overflow.hidden!==hideMenu)overflow.hidden=hideMenu;
  if(!visible&&overflow.open)overflow.open=false;
 }
 function arrange(){
  overflow.open=false;
  for(const entry of entries){const compact=narrow.matches&&(entry.id!=='export-paper'||phone.matches);if(compact&&entry.node.parentNode!==menu)menu.append(entry.node);else if(!compact&&entry.node.parentNode===menu)entry.slot.after(entry.node);}
  header.classList.toggle('has-overflow',narrow.matches);syncVisibility();
 }
 narrow.addEventListener('change',arrange);phone.addEventListener('change',arrange);
 let pending=false;
 new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;syncVisibility();});}).observe(header,{subtree:true,attributes:true,attributeFilter:['hidden']});
 new MutationObserver(syncVisibility).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('pointerdown',event=>{if(!overflow.contains(event.target))overflow.open=false;});
 menu.addEventListener('click',event=>{if(event.target.closest('button'))overflow.open=false;});
 overflow.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();overflow.open=false;overflow.firstElementChild.focus();}});
 window.addEventListener('exam-private-reset',()=>{overflow.open=false;});
 arrange();
}
