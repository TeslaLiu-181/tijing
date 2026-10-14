import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {EditorClient} from '../src/exam/editor-client.mjs';

test('host draft composition is limited to the declared active editor capability',async()=>{
 const originalWindow=globalThis.window,replies=[],calls=[];globalThis.window={addEventListener(){},removeEventListener(){}};
 const contentWindow={postMessage:message=>replies.push(message)},frame={contentWindow,removeAttribute(){},set src(value){}};
 const client=new EditorClient(frame,{},()=>{},{hostCapabilities:['ai.compose'],onHostRequest:async(method,params)=>{calls.push({method,params});return {prepared:true};}});
 client.token='scene-token';client.generation='generation-1';
 const message={type:'exam-editor/host-request',id:'host-1',method:'ai.compose',params:{objectId:'o1'},token:client.token,generation:client.generation};
 try{
  client.receive({source:{},data:message});client.receive({source:contentWindow,data:{...message,generation:'old-generation'}});await setImmediate();assert.equal(calls.length,0);
  client.receive({source:contentWindow,data:message});await setImmediate();assert.deepEqual(calls,[{method:'ai.compose',params:{objectId:'o1'}}]);assert.deepEqual(replies.at(-1).result,{prepared:true});
  client.receive({source:contentWindow,data:{...message,id:'host-2',method:'formula.recognize'}});await setImmediate();assert.equal(calls.length,1);assert.match(replies.at(-1).error,/不能调用/);
 }finally{client.destroy();globalThis.window=originalWindow;}
});

test('read-only previews cannot compose drafts and stale host replies cannot target a newly loaded scene',async()=>{
 const originalWindow=globalThis.window,replies=[];globalThis.window={addEventListener(){},removeEventListener(){}};
 const contentWindow={postMessage:message=>replies.push(message)},frame={contentWindow,removeAttribute(){},set src(value){}};let calls=0,finish;
 const readonly=new EditorClient(frame,{},()=>{},{readonly:true,hostCapabilities:['ai.compose'],onHostRequest:()=>{calls++;}}),editable=new EditorClient(frame,{},()=>{},{hostCapabilities:['ai.compose'],onHostRequest:()=>new Promise(resolve=>finish=resolve)});
 try{
  for(const client of [readonly,editable]){client.token='a';client.generation='g1';}
  const data={type:'exam-editor/host-request',id:'host-1',method:'ai.compose',token:'a',generation:'g1'};
  readonly.receive({source:contentWindow,data});await setImmediate();assert.equal(calls,0);assert.match(replies.at(-1).error,/不能调用/);replies.length=0;
  editable.receive({source:contentWindow,data});await setImmediate();editable.token='b';editable.generation='g2';finish({prepared:true});await setImmediate();assert.deepEqual(replies,[]);
 }finally{readonly.destroy();editable.destroy();globalThis.window=originalWindow;}
});
