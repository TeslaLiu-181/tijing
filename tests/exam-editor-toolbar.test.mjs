import test from 'node:test';
import assert from 'node:assert/strict';
import {attachExamBridge,editorToolbarState} from '../src/exam/bridge.mjs';
import {EditorClient} from '../src/exam/editor-client.mjs';
function nativeHarness({readonly=false,compact=true,kind='planar'}={}){
 const old={window:globalThis.window,document:globalThis.document,setInterval:globalThis.setInterval},messages=[],classes=new Set(),windowEvents=new Map(),documentEvents=new Map(),ticks=[];const parent={postMessage:value=>messages.push(value)};
 globalThis.window={parent,__EXAM_HOST__:true,__EXAM_GENERATION__:'g1',__EXAM_COMPACT_HOST__:compact,__EXAM_READONLY_PREVIEW__:readonly,addEventListener:(name,fn)=>windowEvents.set(name,fn)};globalThis.document={body:{classList:{add:name=>classes.add(name)}},addEventListener:(name,fn,capture)=>documentEvents.set(name,{fn,capture})};globalThis.setInterval=fn=>{ticks.push(fn);return 1;};
 const snapshot={scene:{id:'synthetic'},context:{timeUs:0}},actions=kind==='planar'?[{id:'examples',label:'场景图库',enabled:true},{id:'undo',label:'撤销',enabled:false}]:[{id:'reset',label:'初态',enabled:true}],calls=[];const api={snapshot:()=>structuredClone(snapshot),load(){},pause(){},flush(){},toolbarState:()=>({kind,actions,scene:'must-not-leak'}),toolbarAction:action=>{calls.push(action);}};attachExamBridge(api);
 const send=(method,params={},extra={},source=parent)=>windowEvents.get('message')({source,data:{type:'exam-editor/request',id:'r-'+messages.length,method,params,token:'t1',generation:'g1',...extra}});
 return {messages,classes,documentEvents,ticks,actions,calls,snapshot,send,restore(){globalThis.window=old.window;globalThis.document=old.document;globalThis.setInterval=old.setInterval;}};
}
function clientHarness(options={}){const old=globalThis.window,messages=[];globalThis.window={addEventListener(){},removeEventListener(){}};const contentWindow={postMessage:value=>messages.push(value)},frame={contentWindow,removeAttribute(){},set src(value){},srcdoc:''},client=new EditorClient(frame,{planar:'<html><head></head><body></body></html>',example4:'<html><head></head><body></body></html>'},()=>{},options);client.token='t1';client.generation='g1';client.kind='planar';return {client,frame,messages,receive:data=>client.receive({source:contentWindow,data}),restore(){client.destroy();globalThis.window=old;}};}

test('native toolbar channels keep snapshot structure, enforce actions and publish only changed metadata',async()=>{
 const h=nativeHarness();try{
  assert(h.classes.has('exam-host-compact'));await h.send('load',{snapshot:h.snapshot});const state=h.messages.find(m=>m.type==='exam-editor/toolbar-state');assert.deepEqual(state,{type:'exam-editor/toolbar-state',token:'t1',generation:'g1',state:{kind:'planar',actions:[{id:'examples',label:'场景图库',enabled:true},{id:'undo',label:'撤销',enabled:false}]}});
  const before=h.messages.filter(m=>m.type==='exam-editor/toolbar-state').length;h.ticks[0]();h.ticks[0]();assert.equal(h.messages.filter(m=>m.type==='exam-editor/toolbar-state').length,before);h.actions[1].enabled=true;h.ticks[0]();assert.equal(h.messages.filter(m=>m.type==='exam-editor/toolbar-state').length,before+1);
  await h.send('toolbar-action',{action:'examples'});assert.deepEqual(h.calls,['examples']);assert.deepEqual(h.messages.filter(m=>m.type==='exam-editor/reply').at(-1).result,{...h.snapshot,localRevision:0});assert.deepEqual(h.snapshot,{scene:{id:'synthetic'},context:{timeUs:0}});
  for(const [action,extra] of [['eval',{}],['reset',{}],['load',{}],['examples',{token:'old'}],['examples',{generation:'old'}],['examples',{generation:undefined}]])await h.send('toolbar-action',{action},extra);h.actions[1].enabled=false;await h.send('toolbar-action',{action:'undo'});assert.deepEqual(h.calls,['examples']);assert(h.messages.filter(m=>m.type==='exam-editor/reply'&&m.error).length>=7);
  const count=h.messages.length;await h.send('toolbar-action',{action:'examples'},{},{});assert.equal(h.messages.length,count);
  for(const event of ['pointerdown','focusin']){assert.equal(h.documentEvents.get(event).capture,true);h.documentEvents.get(event).fn({clientX:100,text:'must-not-leak'});}assert.deepEqual(h.messages.slice(-2),[{type:'exam-editor/interaction',token:'t1',generation:'g1'},{type:'exam-editor/interaction',token:'t1',generation:'g1'}]);assert(!h.documentEvents.has('mousemove'));
 }finally{h.restore();}
});

test('readonly or noncompact native editors cannot receive toolbar actions, while example4 has its own whitelist',async()=>{
 for(const config of [{readonly:true,compact:true},{compact:false}]){const h=nativeHarness(config);try{await h.send('load',{snapshot:h.snapshot});assert.equal(h.classes.has('exam-host-compact'),false);await h.send('toolbar-action',{action:'examples'});assert.deepEqual(h.calls,[]);assert.match(h.messages.at(-1).error,/不能调用/);assert.equal(h.messages.some(m=>m.type==='exam-editor/toolbar-state'),false);const count=h.messages.length;for(const event of ['pointerdown','focusin'])h.documentEvents.get(event).fn({});assert.equal(h.messages.length,count);}finally{h.restore();}}
 const h=nativeHarness({kind:'example4'});try{await h.send('load',{snapshot:h.snapshot});await h.send('toolbar-action',{action:'reset'});await h.send('toolbar-action',{action:'examples'});assert.deepEqual(h.calls,['reset']);assert.match(h.messages.at(-1).error,/不能调用/);}finally{h.restore();}
 assert.equal(editorToolbarState({kind:'__proto__',actions:[]}),null);assert.deepEqual(editorToolbarState({kind:'planar',actions:[{id:'eval',label:'wrong',enabled:true}]}),{kind:'planar',actions:[]});
});

test('EditorClient verifies frame/token/generation and sends only authorized native requests',async()=>{
 const interactions=[],toolbars=[],h=clientHarness({compactUI:true,onInteraction:(...args)=>interactions.push(args),onToolbar:state=>toolbars.push(state)});try{
  const notify={type:'exam-editor/interaction',token:'t1',generation:'g1',x:100,text:'must-not-leak'};h.client.receive({source:{},data:notify});h.receive({...notify,token:'old'});h.receive({...notify,generation:'old'});h.receive({...notify,generation:undefined});assert.equal(interactions.length,0);h.receive(notify);assert.deepEqual(interactions,[[]]);
  const state={type:'exam-editor/toolbar-state',token:'t1',generation:'g1',state:{kind:'planar',actions:[{id:'examples',label:'场景图库',enabled:true},{id:'export',label:'导出',enabled:false}],private:'must-not-leak'}};h.receive({...state,generation:'old'});h.receive({...state,token:'old'});assert.equal(toolbars.length,0);h.receive(state);assert.deepEqual(toolbars,[{kind:'planar',actions:[{id:'examples',label:'场景图库',enabled:true},{id:'export',label:'导出',enabled:false}]}]);
  await assert.rejects(h.client.toolbarAction('eval'),/不能调用/);await assert.rejects(h.client.toolbarAction('export'),/不能调用/);await assert.rejects(h.client.toolbarAction('load'),/不能调用/);assert.equal(h.messages.length,0);
  const pending=h.client.toolbarAction('examples'),request=h.messages.at(-1);assert.deepEqual(request.params,{action:'examples'});assert.equal(request.generation,'g1');assert.equal(request.token,'t1');h.receive({type:'exam-editor/reply',id:request.id,token:'t1',generation:'old',result:{wrong:true}});assert.equal(h.client.pending.size,1);h.receive({type:'exam-editor/reply',id:request.id,token:'t1',generation:'g1',result:{scene:{},context:{},localRevision:0}});assert.deepEqual(await pending,{scene:{},context:{},localRevision:0});
 }finally{h.restore();}
});

test('compact boot injection is opt-in and readonly forces the flag off without removing preview protections',async()=>{
 for(const readonly of [false,true]){const toolbarReset=[],h=clientHarness({readonly,compactUI:true,onToolbar:state=>toolbarReset.push(state)});try{const loaded=h.client.load({kind:'planar',snapshot:{scene:{},context:{}}},'load-token'),generation=h.client.generation;assert.deepEqual(toolbarReset,[null]);assert(h.frame.srcdoc.includes('window.__EXAM_COMPACT_HOST__='+(!readonly)+';'));assert(h.frame.srcdoc.includes('.exam-host-compact>header{display:none!important}'));assert.equal(h.frame.srcdoc.includes('body>header{display:none!important}'),!readonly);if(readonly){assert(h.frame.srcdoc.includes('body>header,body #tool-rail'));await assert.rejects(h.client.request('toolbar-action',{action:'blank'}),/不能调用/);}
  h.receive({type:'exam-editor/ready',generation});const request=h.messages.at(-1);assert.equal(request.method,'load');h.receive({type:'exam-editor/reply',id:request.id,token:'load-token',generation,result:{scene:{},context:{},localRevision:0}});await loaded;
 }finally{h.restore();}}
 const h=clientHarness();try{assert.equal(h.client.compactUI,false);await assert.rejects(h.client.toolbarAction('examples'),/不能调用/);}finally{h.restore();}
});
