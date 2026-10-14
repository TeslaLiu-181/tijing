const DEFAULTS={particles:{title:'粒子与发射源',x:.02,y:.08,width:245,height:120},fields:{title:'电场与磁场',x:.05,y:.18,width:250,height:150},fieldProbe:{title:'场强叠加详情',x:.68,y:.08,width:350,height:445},construction:{title:'构造与约束',x:.1,y:.25,width:290,height:400},assist:{title:'辅助与捕捉',x:.72,y:.02,width:290,height:120},view:{title:'视图与选择',x:.75,y:.77,width:300,height:116},algebra:{title:'代数列表',x:.1,y:.08,width:330,height:520},variables:{title:'自由参数台',x:.57,y:.12,width:330,height:480},plot:{title:'运动曲线',x:.18,y:.64,width:560,height:430},inspector:{title:'参数与教学',x:.95,y:.04,width:325,height:510,mode:'right'}};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const button=(text,action,title)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.dataset.layoutAction=action;if(title)b.setAttribute('aria-label',title);return b;};

export function mountWorkspaceLayout({root=document,onInspectorToggle=()=>{},onLayoutChange=()=>{}}={}){
 const stage=root.getElementById?.('stage')||root.querySelector('#stage'),rail=root.getElementById?.('tool-rail')||root.querySelector('#tool-rail');
 if(!stage||!rail)throw Error('缺少沙盒工作区或工具栏');
 if(window.__EXAM_READONLY_PREVIEW__===true)return {sync(){},restore(){},snapshot:()=>({version:1,windows:{}}),anchorPopover(){},open(){},collapse(){},close(){},reset(){},destroy(){}};
 const byId=id=>root.getElementById?.(id)||root.querySelector('#'+id),layer=document.createElement('div');layer.id='workspace-window-layer';stage.append(layer);
 let state={version:1,windows:{}},readonly=false,present=false,drag=null,pending=0;
 const windows=new Map(),original=[];
 function move(node,parent){if(!node)return;const slot=document.createComment('Workspace layout origin');node.before(slot);original.push({node,slot});parent.append(node);}
 function make(name,nodes){
  const defaults=DEFAULTS[name],element=name==='inspector'?byId('inspector'):document.createElement('section');
  if(name==='inspector')move(element,layer);else layer.append(element);
  element.classList.add('workspace-window');element.dataset.workspaceWindow=name;element.hidden=name!=='inspector';
  const header=document.createElement('div');header.className='workspace-window-heading';header.innerHTML='<span class="workspace-grip" aria-hidden="true">⠿</span><strong></strong>';header.querySelector('strong').textContent=defaults.title;
  const actions=document.createElement('div');actions.className='workspace-window-actions';
  const menu=document.createElement('details');menu.className='workspace-window-menu';menu.innerHTML='<summary aria-label="调整工具窗布局">⋯</summary><div></div>';const body=menu.lastElementChild;
  for(const [text,action] of [['自由浮动','float'],['停靠左侧','dock-left'],['停靠右侧','dock-right'],['停靠顶部','dock-top'],['紧凑显示','scale-down'],['放大界面','scale-up'],['恢复默认','reset-window']])body.append(button(text,action));
  actions.append(menu,button('−','collapse','折叠工具窗内容'),button('×','close','收起工具窗'));header.append(actions);
  let content;
  if(name==='inspector'){
   content=document.createElement('div');content.className='workspace-window-content';const existing=[...element.children];for(const child of existing)content.append(child);element.append(header,content);
  }else{content=document.createElement('div');content.className='workspace-window-content';element.append(header,content);for(const node of nodes)move(node,content);}
  const popover=menu.lastElementChild;popover.classList.add('workspace-floating-menu');popover.dataset.layoutMenuFor=name;
  menu.addEventListener('toggle',()=>{if(!menu.open){menu.append(popover);return;}document.body.append(popover);const trigger=menu.firstElementChild.getBoundingClientRect();popover.style.left=clamp(trigger.right-165,8,Math.max(8,innerWidth-173))+'px';popover.style.top=clamp(trigger.bottom+5,8,Math.max(8,innerHeight-popover.scrollHeight-8))+'px';});
  const resize=document.createElement('div');resize.className='workspace-window-resize';resize.tabIndex=0;resize.setAttribute('role','separator');resize.setAttribute('aria-label','调整'+defaults.title+'尺寸');element.append(resize);
  resize.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const pref=state.windows[name];pref.width=clamp(pref.width+(event.key==='ArrowLeft'?-10:event.key==='ArrowRight'?10:0),200,900);pref.height=clamp(pref.height+(event.key==='ArrowUp'?-10:event.key==='ArrowDown'?10:0),85,900);layout();emit();});
  windows.set(name,{element,header,content,resize});state.windows[name]={x:defaults.x,y:defaults.y,width:defaults.width,height:defaults.height,mode:defaults.mode||'float',collapsed:false,scale:1,open:name==='inspector'};
  return element;
 }
 const grab=selector=>root.querySelector(selector);
 make('particles',[grab('[data-tool="particle"]'),byId('source-menu')]);
 make('fields',[byId('electric-menu'),byId('field-menu'),byId('field-probe-button')]);make('fieldProbe',[]);
 make('construction',[byId('measure-menu'),byId('geometry-button'),grab('#tool-rail [data-panel="relations"]')]);
 make('assist',[grab('.snap-bar')]);make('view',[grab('.view-controls')]);make('variables',[]);make('algebra',[]);make('plot',[]);make('inspector',[]);
 for(const child of [...rail.children])if(child.tagName==='HR')child.remove();
 rail.classList.add('workspace-rail');rail.setAttribute('aria-label','分类工具与窗口');
 for(const [name,label,glyph] of [['particles','粒子','●'],['fields','场域','⇢'],['construction','构造','△'],['algebra','代数','≡'],['variables','变量','α'],['plot','曲线','⌁'],['inspector','参数','ƒ'],['assist','辅助','⌖'],['view','视图','⌕']]){
  const b=document.createElement('button');b.type='button';b.dataset.workspaceOpen=name;b.innerHTML='<span></span><small></small>';b.firstChild.textContent=glyph;b.lastChild.textContent=label;b.title=DEFAULTS[name].title;b.setAttribute('aria-label','打开'+DEFAULTS[name].title);rail.append(b);
 }
 const resetButton=document.createElement('button');resetButton.type='button';resetButton.dataset.layoutReset='true';resetButton.innerHTML='<span>↺</span><small>布局</small>';resetButton.setAttribute('aria-label','恢复默认工具布局');rail.append(resetButton);
 const oldMore=byId('tools-more');if(oldMore)oldMore.hidden=true;
 document.body.classList.add('workspace-layout-ready');
 function emit(){onLayoutChange(snapshot(),{cause:'user'});}
 function layout(){
  pending=0;const bounds=stage.getBoundingClientRect(),pad=8;
  let left=0,right=0;
  for(const [name,{element,header}] of windows){
   const pref=state.windows[name],shown=pref.open&&!readonly&&!present;element.hidden=!shown;
   const algebraLeft=name==='algebra'?Math.max(pad,rail.getBoundingClientRect().right-bounds.left+8):pad;
   const w=clamp(pref.width,name==='inspector'?250:200,Math.max(200,bounds.width-(name==='algebra'?algebraLeft+pad:pad*2))),h=clamp(pref.height,85,Math.max(85,bounds.height-pad*2));
   element.style.setProperty('--workspace-ui-scale',pref.scale);element.dataset.dock=pref.mode;element.classList.toggle('window-collapsed',pref.collapsed);
   let x=pad+pref.x*Math.max(0,bounds.width-w-pad*2),y=pad+pref.y*Math.max(0,bounds.height-h-pad*2);
   if(pref.mode==='left'){x=name==='algebra'?algebraLeft:pad;y=pad;if(shown&&!pref.collapsed)left=Math.max(left,w+x+pad);}
   if(pref.mode==='right'){x=bounds.width-w-pad;y=pad;if(shown&&!pref.collapsed)right=Math.max(right,w+pad*2);}
   if(pref.mode==='top'){x=pad;y=pad;}
   if(name==='algebra'&&pref.mode!=='right')x=Math.max(algebraLeft,x);
   element.style.width=w+'px';element.style.height=pref.collapsed?'auto':h+'px';element.style.left=clamp(x,0,Math.max(0,bounds.width-w))+'px';element.style.top=clamp(y,0,Math.max(0,bounds.height-(pref.collapsed?40:h)))+'px';
   element.style.right='auto';element.style.bottom='auto';header.querySelector('[data-layout-action="collapse"]').textContent=pref.collapsed?'＋':'−';
   rail.querySelector('[data-workspace-open="'+name+'"]')?.classList.toggle('active',shown);
  }
  // Reserve canvas space only for docked windows; floating windows do not
  // resize physical coordinates or manufacture a new simulation state.
  const reserve=bounds.width>850&&left+right<bounds.width-300;
  stage.style.setProperty('--workspace-left-space',reserve?left+'px':'0px');stage.style.setProperty('--workspace-right-space',reserve?right+'px':'0px');
 }
 function schedule(){if(!pending)pending=requestAnimationFrame(layout);}
 function raise(name){const order=[...windows.keys()].filter(key=>key!==name).sort((a,b)=>Number(windows.get(a).element.style.zIndex||25)-Number(windows.get(b).element.style.zIndex||25));order.push(name);order.forEach((key,index)=>windows.get(key).element.style.zIndex=String(25+index));}
 function open(name){const pref=state.windows[name];if(!pref||readonly)return;pref.open=true;pref.collapsed=false;raise(name);if(name==='inspector')onInspectorToggle(true);layout();emit();}
 function collapse(name){const pref=state.windows[name];if(!pref)return;pref.collapsed=!pref.collapsed;layout();emit();}
 function close(name){const pref=state.windows[name];if(!pref)return;pref.open=false;if(name==='inspector')onInspectorToggle(false);layout();emit();}
 function snapshot(){return structuredClone(state);}
 function restore(value){
  if(value?.version!==1||!value.windows)return;
  for(const [name,pref] of Object.entries(value.windows)){if(!state.windows[name])continue;const target=state.windows[name];for(const key of ['x','y'])if(Number.isFinite(pref[key]))target[key]=clamp(pref[key],0,1);for(const key of ['width','height'])if(Number.isFinite(pref[key]))target[key]=clamp(pref[key],85,900);if(['float','left','right','top'].includes(pref.mode))target.mode=pref.mode;if(Number.isFinite(pref.scale))target.scale=clamp(pref.scale,.85,1.3);for(const key of ['collapsed','open'])if(typeof pref[key]==='boolean')target[key]=pref[key];}layout();
 }
 function reset(){for(const [name,defaults] of Object.entries(DEFAULTS))state.windows[name]={x:defaults.x,y:defaults.y,width:defaults.width,height:defaults.height,mode:defaults.mode||'float',collapsed:false,scale:1,open:name==='inspector'};onInspectorToggle(true);layout();emit();}
 function sync(values={}){if('readonly' in values)readonly=!!values.readonly;if('present'in values)present=!!values.present;if('sidebar'in values)state.windows.inspector.open=!!values.sidebar;document.body.classList.toggle('workspace-layout-readonly',readonly);layout();}
 function anchorPopover(element,source){if(!element||!source)return;const stageBox=stage.getBoundingClientRect(),box=source.getBoundingClientRect(),w=Math.min(280,stageBox.width-16),h=Math.min(element.scrollHeight||250,stageBox.height-24);element.style.width=w+'px';element.style.left=clamp(box.right-stageBox.left+6,8,Math.max(8,stageBox.width-w-8))+'px';element.style.top=clamp(box.top-stageBox.top,8,Math.max(8,stageBox.height-h-8))+'px';element.style.maxHeight=Math.max(80,stageBox.height-24)+'px';element.style.zIndex='55';}
 function onClick(event){
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.workspaceOpen){event.preventDefault();const name=b.dataset.workspaceOpen;state.windows[name]?.open?close(name):open(name);return;}
  if(b.dataset.layoutReset){reset();return;}
  const action=b.dataset.layoutAction,name=b.closest('[data-workspace-window]')?.dataset.workspaceWindow||b.closest('[data-layout-menu-for]')?.dataset.layoutMenuFor;if(!action||!name)return;
  const pref=state.windows[name];windows.get(name)?.header.querySelector('details')?.removeAttribute('open');
  if(action==='close'){close(name);return;}if(action==='collapse'){collapse(name);return;}
  if(action==='float')pref.mode='float';if(action.startsWith('dock-'))pref.mode=action.slice(5);
  if(action==='scale-down')pref.scale=clamp(pref.scale-.1,.85,1.3);if(action==='scale-up')pref.scale=clamp(pref.scale+.1,.85,1.3);
  if(action==='reset-window')Object.assign(pref,DEFAULTS[name],{mode:DEFAULTS[name].mode||'float',collapsed:false,scale:1,open:true});layout();emit();
 }
 layer.addEventListener('click',onClick);rail.addEventListener('click',onClick);document.body.addEventListener('click',event=>{if(event.target.closest('.workspace-floating-menu'))onClick(event);});
 layer.addEventListener('pointerdown',event=>{
  const element=event.target.closest('[data-workspace-window]');if(!element||readonly)return;const name=element.dataset.workspaceWindow,pref=state.windows[name],resizing=!!event.target.closest('.workspace-window-resize'),handle=event.target.closest('.workspace-window-heading');
  raise(name);if(!resizing&&(!handle||event.target.closest('button,input,select,summary')))return;event.preventDefault();const box=element.getBoundingClientRect(),bounds=stage.getBoundingClientRect();drag={id:event.pointerId,name,resize:resizing,x:event.clientX,y:event.clientY,left:box.left-bounds.left,top:box.top-bounds.top,width:box.width,height:box.height,target:event.target};drag.target.setPointerCapture(event.pointerId);pref.mode='float';document.body.classList.add('workspace-window-dragging');
 });
 layer.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const pref=state.windows[drag.name],bounds=stage.getBoundingClientRect(),dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(drag.resize){pref.width=clamp(drag.width+dx,200,Math.max(200,bounds.width-16));pref.height=clamp(drag.height+dy,85,Math.max(85,bounds.height-16));}else{pref.x=clamp((drag.left+dx-8)/Math.max(1,bounds.width-drag.width-16),0,1);pref.y=clamp((drag.top+dy-8)/Math.max(1,bounds.height-drag.height-16),0,1);}layout();});
 function endDrag(){if(!drag)return;const current=drag;drag=null;if(current.target.hasPointerCapture(current.id))current.target.releasePointerCapture(current.id);document.body.classList.remove('workspace-window-dragging');emit();}
 layer.addEventListener('pointerup',endDrag);layer.addEventListener('pointercancel',endDrag);layer.addEventListener('lostpointercapture',endDrag);
 const observer=new ResizeObserver(schedule);observer.observe(stage);layout();
 return {sync,restore,snapshot,anchorPopover,open,collapse,close,reset,destroy(){endDrag();observer.disconnect();if(pending)cancelAnimationFrame(pending);for(const {node,slot} of original)if(slot.parentNode)slot.replaceWith(node);layer.remove();document.body.classList.remove('workspace-layout-ready','workspace-layout-readonly');}};
}
