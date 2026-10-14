export const EDITOR_TOOLBAR_ACTIONS=Object.freeze({
 planar:Object.freeze(['examples','undo','redo','blank','export','load','help']),
 example4:Object.freeze(['reset','parameters','explanation']),
 supplement:Object.freeze(['reset','parameters','explanation'])
});
// Only fixed metadata crosses this channel; it never becomes scene/context.
export function editorToolbarState(value){
 const allowed=Object.hasOwn(EDITOR_TOOLBAR_ACTIONS,value?.kind)?EDITOR_TOOLBAR_ACTIONS[value.kind]:null;if(!allowed||!Array.isArray(value.actions))return null;
 const seen=new Set(),actions=[];
 for(const action of value.actions){if(!action||!allowed.includes(action.id)||seen.has(action.id)||typeof action.label!=='string'||!action.label.trim()||action.label.length>80)continue;seen.add(action.id);actions.push({id:action.id,label:action.label,enabled:action.enabled===true});}
 return {kind:value.kind,actions};
}

// An embedded editor only accepts its own parent. The token scopes replies to
// the currently loaded question/scene, including quick consecutive switches.
export function attachExamBridge(api){
 if(window.parent===window||!window.__EXAM_HOST__)return;
 document.body.classList.add('exam-hosted');
 const generation=window.__EXAM_GENERATION__,readonly=window.__EXAM_READONLY_PREVIEW__===true,compact=window.__EXAM_COMPACT_HOST__===true&&!readonly;
 if(compact)document.body.classList.add('exam-host-compact');
 let token=null,last='',lastToolbar='',revision=0,hostSequence=0;const hostPending=new Map();
 const capture=()=>({...api.snapshot(),localRevision:revision});
 function toolbar(){return typeof api.toolbarState==='function'?editorToolbarState(api.toolbarState()):null;}
 function publishToolbar(){if(!token||!compact)return;const state=toolbar();if(!state)return;const key=JSON.stringify(state);if(key===lastToolbar)return;lastToolbar=key;window.parent.postMessage({type:'exam-editor/toolbar-state',token,generation,state},'*');}
 function publish(force=false){
  if(!token)return;publishToolbar();
  const snapshot=capture(),key=JSON.stringify(snapshot);
  if(!force&&key===last)return;last=key;
  window.parent.postMessage({type:'exam-editor/state',token,generation,snapshot},'*');
 }
 window.addEventListener('message',async event=>{
  if(event.source!==window.parent)return;
  if(event.data?.type==='exam-editor/host-reply'){
   const pending=hostPending.get(event.data.id);if(!pending||event.data.token!==token||pending.token!==token)return;
   hostPending.delete(event.data.id);event.data.error?pending.reject(Error(event.data.error)):pending.resolve(event.data.result);return;
  }
  if(event.data?.type!=='exam-editor/request')return;
  const {id,method,params={},token:requestToken,generation:requestGeneration}=event.data;
  try{
   if(requestGeneration!==undefined&&requestGeneration!==generation)throw Error('当前演示程序已经切换');
   let result;
   if(method==='load'){for(const pending of hostPending.values())pending.reject(Error('场景已切换'));hostPending.clear();api.pause?.();api.load(params.snapshot);token=requestToken;revision=0;last='';lastToolbar='';result=capture();publishToolbar();}
   else{
    if(!token||requestToken!==token)throw Error('当前题目或场景已经切换');
    if(method==='toolbar-action'){
     const state=compact&&!readonly?toolbar():null,action=params.action;
     if(requestGeneration!==generation||!state||typeof api.toolbarAction!=='function'||!EDITOR_TOOLBAR_ACTIONS[state.kind].includes(action)||!state.actions.some(item=>item.id===action&&item.enabled))throw Error('此视图不能调用这项原生工具栏操作');
     api.flush?.();await api.toolbarAction(action);
     if(token!==requestToken)throw Error('当前题目或场景已经切换');
     result=capture();
    }else{api.flush?.();
    if(method==='read')result=capture();
    else if(method==='pause'){api.pause?.();result=capture();}
    else if(method==='presentation'){api.presentation?.(params.enabled);result=capture();}
    else throw Error('不支持的场景操作');
    }
   }
   window.parent.postMessage({type:'exam-editor/reply',id,token:requestToken,generation,result},'*');publish(true);
  }catch(error){window.parent.postMessage({type:'exam-editor/reply',id,token:requestToken,generation,error:String(error.message||error)},'*');}
 });
 for(const event of ['pointerdown','focusin'])document.addEventListener(event,()=>{if(compact&&token)window.parent.postMessage({type:'exam-editor/interaction',token,generation},'*');},true);
 for(const event of ['change','pointerup'])document.addEventListener(event,()=>{revision++;});
 setInterval(()=>{if(token)publish();else window.parent.postMessage({type:'exam-editor/ready',generation:window.__EXAM_GENERATION__},'*');},200);
 window.parent.postMessage({type:'exam-editor/ready',generation:window.__EXAM_GENERATION__},'*');
 return {requestHost(method,params={}){if(!token)return Promise.reject(Error('场景尚未连接学习空间'));const id='host-'+(++hostSequence);return new Promise((resolve,reject)=>{hostPending.set(id,{resolve,reject,token});window.parent.postMessage({type:'exam-editor/host-request',id,method,params,token,generation:window.__EXAM_GENERATION__},'*');});}};
}
