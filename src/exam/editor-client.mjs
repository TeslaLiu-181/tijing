import {EDITOR_TOOLBAR_ACTIONS,editorToolbarState} from './bridge.mjs';
import {scriptJSON} from './resources.mjs';
import {uid,SCENE_RUNTIME_FILES} from './model.mjs';

export class EditorClient{
 constructor(frame,runtimes,onState,{readonly=false,compactUI=false,onInteraction,onToolbar,onHostRequest,hostCapabilities=onHostRequest?['formula.recognize']:[]}={}){this.frame=frame;this.runtimes=runtimes;this.onState=onState;this.readonly=readonly;this.compactUI=!!compactUI&&!readonly;this.onInteraction=onInteraction;this.onToolbar=onToolbar;this.toolbarState=null;this.kind=null;this.onHostRequest=onHostRequest;this.hostCapabilities=readonly?[]:hostCapabilities.filter(method=>['formula.recognize','ai.compose'].includes(method));this.pending=new Map();this.sequence=0;this.token=null;this.generation=null;this.boot=null;this.listener=event=>this.receive(event);window.addEventListener('message',this.listener);}
 receive(event){
  if(event.source!==this.frame.contentWindow)return;const message=event.data;
  if(['exam-editor/interaction','exam-editor/toolbar-state'].includes(message?.type)){
   if(!this.token||message.token!==this.token||message.generation!==this.generation)return;
   if(message.type==='exam-editor/interaction'){this.onInteraction?.();return;}
   if(!this.compactUI||this.readonly)return;const state=editorToolbarState(message.state);if(!state||state.kind!==this.kind)return;this.toolbarState=state;this.onToolbar?.(state);return;
  }
  if(message?.type==='exam-editor/host-request'&&message.token===this.token&&message.generation===this.generation){
   const token=this.token,generation=this.generation,reply=value=>{if(this.token===token&&this.generation===generation)this.frame.contentWindow.postMessage({type:'exam-editor/host-reply',id:message.id,token,...value},'*');};
   if(this.readonly||!this.hostCapabilities.includes(message.method)||!this.onHostRequest){reply({error:'此视图不能调用这项学习空间操作，请在可编辑场景中重试。'});return;}
   Promise.resolve().then(()=>this.onHostRequest(message.method,message.params||{})).then(result=>reply({result})).catch(error=>reply({error:error.message||'学习空间操作未完成'}));return;
  }
  if(message?.type==='exam-editor/ready'&&this.boot&&message.generation===this.generation&&!this.boot.sent){const boot=this.boot;boot.sent=true;this.request('load',{snapshot:boot.snapshot}).then(result=>{if(this.boot===boot&&boot.generation===this.generation){clearTimeout(boot.timer);this.boot=null;boot.resolve(result);}}).catch(error=>{if(this.boot===boot){clearTimeout(boot.timer);this.boot=null;boot.reject(error);}});}
  if(message?.type==='exam-editor/state'&&message.token===this.token)this.onState?.(message.snapshot);
  if(message?.type==='exam-editor/reply'){const pending=this.pending.get(message.id);if(!pending||message.token!==pending.token||pending.generation!==this.generation||pending.method==='toolbar-action'&&(message.generation!==pending.generation||message.token!==this.token))return;clearTimeout(pending.timer);this.pending.delete(message.id);if(message.error)pending.reject(Error(message.error));else pending.resolve(message.result);}
 }
 request(method,params={}){if(method==='toolbar-action'&&(this.readonly||!this.compactUI||!EDITOR_TOOLBAR_ACTIONS[this.kind]?.includes?.(params.action)||!this.toolbarState?.actions.some(item=>item.id===params.action&&item.enabled)))return Promise.reject(Error('此视图不能调用这项原生工具栏操作'));const generation=this.generation,id='request-'+(++this.sequence),token=this.token;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('场景尚未响应，请稍后再试'));},12000);this.pending.set(id,{resolve,reject,timer,token,generation,method});this.frame.contentWindow.postMessage({type:'exam-editor/request',id,method,params,token,generation},'*');});}
 clearPending(message='场景已切换'){for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(Error(message));}this.pending.clear();if(this.boot){clearTimeout(this.boot.timer);this.boot.reject(Error(message));this.boot=null;}}
 async load(record,token){
  this.clearPending();this.toolbarState=null;this.onToolbar?.(null);this.kind=record.kind;this.token=token;this.generation=uid();const generation=this.generation,html=this.runtimes[record.kind];if(!html)throw Error('未找到相应的演示程序');
  const initial='<script>window.__EXAM_HOST__=true;window.__EXAM_HOST_CAPABILITIES__='+scriptJSON(this.hostCapabilities)+';window.__EXAM_READONLY_PREVIEW__='+scriptJSON(this.readonly)+';window.__EXAM_COMPACT_HOST__='+scriptJSON(this.compactUI)+';window.__EXAM_GENERATION__='+scriptJSON(generation)+';window.__EXAM_INITIAL_SNAPSHOT__='+scriptJSON(record.snapshot)+';</script>';
  const style='<style>.exam-hosted>header .brand,.exam-hosted #save,.exam-hosted #load,.exam-hosted #fullscreen,.exam-hosted .lesson-entry{display:none}.exam-hosted>header{height:45px}.exam-host-compact>header{display:none!important}.exam-hosted .brand-mark,.exam-hosted .brand-copy,.exam-hosted .header-note{display:none}.exam-hosted #reset-all{margin-left:auto}.exam-hosted #teaching-hud{top:auto;bottom:75px}'+(this.compactUI?'body>header{display:none!important}':'')+(this.readonly?'body>header,body #tool-rail,body #tools-more,body #inspector,body #selection-actions,body .snap-bar,body .track-controls,body #canvas-heading,body .canvas-status,body #teaching-hud{display:none!important}body .view-controls #inspector-toggle{display:none!important}body>footer{height:57px;min-height:57px}body .view-controls{bottom:12px}':'')+'</style>';
  const waiting=new Promise((resolve,reject)=>{this.boot={resolve,reject,snapshot:record.snapshot,generation,sent:false,timer:setTimeout(()=>{if(this.boot?.generation===generation){this.boot=null;reject(Error('演示程序未启动，请确认浏览器支持 WebGL 或重试载入'));}},20000)};});
  if(window.examNative){const url=new URL(SCENE_RUNTIME_FILES[record.kind],location.href);url.searchParams.set('examSession',generation);this.frame.removeAttribute('srcdoc');this.frame.src=url.href;}else{this.frame.removeAttribute('src');this.frame.srcdoc=html.replace('</head>',()=>initial+style+'</head>');}return waiting;
 }
 async read(){return this.request('read');}
 async pause(){return this.request('pause');}
 async toolbarAction(action){return this.request('toolbar-action',{action});}
 async presentation(enabled){return this.request('presentation',{enabled});}
 destroy(){window.removeEventListener('message',this.listener);this.clearPending('预览已关闭');this.token=null;this.generation=null;this.onState=null;this.onInteraction=null;this.onToolbar=null;this.toolbarState=null;this.kind=null;this.frame.removeAttribute('srcdoc');this.frame.src='about:blank';}
}
