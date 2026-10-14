import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readChatCompletionStream} from '../server/exam/ai-stream.mjs';
import {readProviderStream} from '../server/exam/model-network.mjs';
import {ModelProvider} from '../server/exam/model-provider.mjs';
import {agentTools} from '../server/exam/ai-agent-tools.mjs';

const event=value=>'data: '+JSON.stringify(value)+'\r\n\r\n';
function stream(text,size=7,onCancel=()=>{}){const bytes=new TextEncoder().encode(text);return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=size)controller.enqueue(bytes.slice(i,i+size));controller.close();},cancel:onCancel}),{headers:{'content-type':'text/event-stream'}});}
const config={apiKey:'fixture-not-transmitted',baseURL:'https://api.deepseek.com/v1',model:'fixture',maxTokens:1000,timeoutMs:1000};

test('SSE handles split UTF-8 and reports progress without exposing private continuation',async()=>{
 const content='{"answer":"中文公式与α"}',progress=[];
 const text=': keepalive\n\n'+event({model:'fixture',choices:[{index:0,delta:{reasoning_content:'private continuation only'}}]})+event({choices:[{index:0,delta:{content:content.slice(0,12)}}]})+event({choices:[{index:0,delta:{content:content.slice(12)},finish_reason:'stop'}]})+event({choices:[],usage:{prompt_tokens:8,completion_tokens:12,total_tokens:20}})+'data: [DONE]\n\n';
 const value=await readChatCompletionStream(stream(text,3),{onProgress:p=>progress.push(p)});
 assert.equal(value.choices[0].message.content,content);assert.equal(value.choices[0].message.reasoning_content,'private continuation only');assert.equal(value.usage.total_tokens,20);
 assert.equal(progress.at(-1).textCharacters,content.length);assert.equal(JSON.stringify(progress).includes('private continuation'),false);assert.equal(value.choices[0].finish_reason,'stop');
});
test('streamed tool name and JSON argument fragments are reconstructed before execution',async()=>{
 const text=event({model:'fixture',choices:[{index:0,delta:{reasoning_content:'internal',tool_calls:[{index:0,id:'tool-1',type:'function',function:{name:'query_',arguments:'{"timesUs":['}}]}}]})+event({choices:[{index:0,delta:{tool_calls:[{index:0,function:{name:'motion',arguments:'0.01]}'}}]},finish_reason:'tool_calls'}]})+event({choices:[],usage:{prompt_tokens:12,completion_tokens:18,total_tokens:30}})+'data: [DONE]\n\n';
 let body,options;const provider=new ModelProvider(config,{fetchImpl:async(_url,input)=>{options=input;body=JSON.parse(input.body);return stream(text,11);}});
 const progress=[],result=await provider.complete([{role:'user',content:'fixture'}],{tools:agentTools,onProgress:p=>progress.push(p)});
 assert.equal(body.stream,true);assert.equal(body.stream_options.include_usage,true);assert.equal(options.stream,true);
 assert.equal(result.toolCalls[0].function.name,'query_motion');assert.deepEqual(JSON.parse(result.toolCalls[0].function.arguments),{timesUs:[.01]});assert.equal(result.assistantMessage.reasoning_content,'internal');assert.equal(result.usage.totalTokens,30);assert.equal(result.usageKnown,true);assert.ok(progress.length>0);
});
test('unfinished streams reject and do not manufacture a final answer',async()=>{
 const unfinished=event({choices:[{index:0,delta:{content:'{"answer":"unfinished'}}]});
 await assert.rejects(()=>readChatCompletionStream(stream(unfinished)),error=>error.code==='ai_response_interrupted');
 const provider=new ModelProvider(config,{fetchImpl:async()=>stream(event({model:'fixture',choices:[{index:0,delta:{content:'partial'},finish_reason:'length'}],usage:{prompt_tokens:12,completion_tokens:1000,total_tokens:1012}})+'data: [DONE]\n\n')});
 await assert.rejects(()=>provider.complete([{role:'user',content:'fixture'}],{onProgress:()=>{}}),error=>error.code==='ai_response_incomplete'&&error.usage.totalTokens===1012);
});
test('malformed frames retain a usage chunk that was already received',async()=>{
 const provider=new ModelProvider(config,{fetchImpl:async()=>stream(event({model:'fixture',choices:[],usage:{prompt_tokens:9,completion_tokens:7,total_tokens:16}})+'data: {broken\n\n')});
 await assert.rejects(()=>provider.complete([{role:'user',content:'fixture'}],{onProgress:()=>{}}),error=>error.code==='ai_response_invalid'&&error.usage.totalTokens===16);
});
test('HTTPS response stream delivers headers promptly and cancellation destroys the source',async()=>{
 const incoming=new EventEmitter();incoming.statusCode=200;incoming.headers={'content-type':'text/event-stream'};incoming.complete=false;let destroyed=false;incoming.destroy=()=>{destroyed=true;incoming.emit('close');};
 const response=readProviderStream(incoming),reader=response.body.getReader();incoming.emit('data',Buffer.from('data: {}\n\n'));
 const first=await reader.read();assert.equal(new TextDecoder().decode(first.value),'data: {}\n\n');assert.equal(incoming.complete,false);
 await reader.cancel();assert.equal(destroyed,true);
});
test('a provider returning regular JSON still completes when progress is requested',async()=>{
 const provider=new ModelProvider(config,{fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],usage:{prompt_tokens:1,completion_tokens:2,total_tokens:3}}),{headers:{'content-type':'application/json'}})});
 const result=await provider.complete([{role:'user',content:'fixture'}],{onProgress:()=>{}});assert.equal(result.content,'{"ok":true}');assert.equal(result.usage.totalTokens,3);
});

test('aborting a stream terminates its reader and preserves already received usage',async()=>{
 const abort=new AbortController();let cancelled=false,source;
 const provider=new ModelProvider(config,{fetchImpl:async()=>new Response(new ReadableStream({start(controller){source=controller;controller.enqueue(new TextEncoder().encode(event({model:'fixture-abort',choices:[],usage:{prompt_tokens:9,completion_tokens:7,total_tokens:16}})));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}})});
 const safety=setTimeout(()=>source?.error(new Error('fixture disconnect')),80);
 try{await assert.rejects(()=>provider.complete([{role:'user',content:'fixture'}],{signal:abort.signal,onProgress:()=>abort.abort()}),error=>error.code==='ai_cancelled'&&error.usage?.totalTokens===16&&error.model==='fixture-abort');assert.equal(cancelled,true);}finally{clearTimeout(safety);}
});

test('DONE ends a still-open response without waiting for network EOF',async()=>{
 let source,cancelled=false;const response=new Response(new ReadableStream({start(controller){source=controller;controller.enqueue(new TextEncoder().encode(event({choices:[{index:0,delta:{content:'done'},finish_reason:'stop'}]})+'data: [DONE]\n\n'));},cancel(){cancelled=true;}}));
 const safety=setTimeout(()=>source.close(),80);try{const value=await readChatCompletionStream(response);assert.equal(value.choices[0].message.content,'done');assert.equal(cancelled,true);}finally{clearTimeout(safety);}
});

test('SSE accepts CR-only records, split CRLF and empty keepalive records',async()=>{
 const text='data:\r\r'+event({choices:[{index:0,delta:{content:'兼容'},finish_reason:'stop'}]}).replaceAll('\r\n','\r')+'data: [DONE]\r\r';
 const value=await readChatCompletionStream(stream(text,1));assert.equal(value.choices[0].message.content,'兼容');
});

test('error frames and invalid tool contracts retain received provider usage',async()=>{
 for(const body of [event({model:'fixture-error',error:{message:'private provider detail'},usage:{prompt_tokens:2,completion_tokens:4,total_tokens:6}}),event({model:'fixture-error',choices:[{index:0,delta:{tool_calls:[{index:0,id:'tool-1',type:'wrong',function:{name:'query_motion',arguments:'{}'}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:2,completion_tokens:4,total_tokens:6}})+'data: [DONE]\n\n']){
  const provider=new ModelProvider(config,{fetchImpl:async()=>stream(body)});
  await assert.rejects(()=>provider.complete([{role:'user',content:'fixture'}],{tools:agentTools,onProgress:()=>{}}),error=>error.usage?.totalTokens===6&&error.model==='fixture-error');
 }
});

test('an incomplete usage object is not classified as a known zero-cost response',async()=>{
 const provider=new ModelProvider(config,{fetchImpl:async()=>stream(event({usage:{prompt_tokens:9}})+'data: {broken\n\n')});
 await assert.rejects(()=>provider.complete([{role:'user',content:'fixture'}],{onProgress:()=>{}}),error=>error.code==='ai_response_invalid'&&!error.usageKnown&&!error.usage);
});

test('null-body and invalid HTTP status destroy the incoming stream',()=>{
 for(const status of [204,205,700]){const incoming=new EventEmitter();incoming.statusCode=status;incoming.headers={};let destroyed=false;incoming.destroy=()=>{destroyed=true;};
  if(status===700)assert.throws(()=>readProviderStream(incoming),error=>error.code==='ai_provider_status_invalid');else assert.equal(readProviderStream(incoming).body,null);assert.equal(destroyed,true);
 }
});

test('the provider timeout cancels an open body while retaining known usage',async()=>{
 let source,cancelled=false;
 const provider=new ModelProvider({...config,timeoutMs:20},{fetchImpl:async()=>new Response(new ReadableStream({start(controller){source=controller;controller.enqueue(new TextEncoder().encode(event({model:'fixture-timeout',choices:[],usage:{prompt_tokens:4,completion_tokens:5,total_tokens:9}})));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}})});
 const safety=setTimeout(()=>source.error(new Error('fixture disconnect')),80);
 try{await assert.rejects(()=>provider.complete([{role:'user',content:'fixture'}],{onProgress:()=>{}}),error=>error.code==='ai_provider_unavailable'&&error.usage?.totalTokens===9&&error.model==='fixture-timeout');assert.equal(cancelled,true);}finally{clearTimeout(safety);}
});

test('native incoming abort rejects after parsed usage and destroys the source',async()=>{
 const incoming=new EventEmitter();incoming.statusCode=200;incoming.headers={'content-type':'text/event-stream'};incoming.complete=false;let destroyed=false;incoming.destroy=()=>{destroyed=true;incoming.emit('close');};
 const provider=new ModelProvider(config,{fetchImpl:async()=>{const response=readProviderStream(incoming);setImmediate(()=>{incoming.emit('data',Buffer.from(event({model:'fixture-disconnect',choices:[],usage:{prompt_tokens:6,completion_tokens:3,total_tokens:9}})));setImmediate(()=>incoming.emit('aborted'));});return response;}});
 await assert.rejects(()=>provider.complete([{role:'user',content:'fixture'}],{onProgress:()=>{}}),error=>error.code==='ai_response_interrupted'&&error.usage?.totalTokens===9);assert.equal(destroyed,true);
});

test('HTTP errors keep the safe provider message even when body cancellation rejects',async()=>{
 let cancelled=false;const provider=new ModelProvider(config,{fetchImpl:async()=>new Response(new ReadableStream({cancel(){cancelled=true;throw Error('private source error');}}),{status:401})});
 await assert.rejects(()=>provider.complete([{role:'user',content:'fixture'}],{onProgress:()=>{}}),error=>error.code==='ai_provider_error'&&!error.message.includes('private'));assert.equal(cancelled,true);
});

test('SSE sent without requested progress is accepted and nonzero choices are not answers',async()=>{
 const provider=new ModelProvider(config,{fetchImpl:async()=>stream(event({choices:[{index:0,delta:{content:'{"ok":true}'},finish_reason:'stop'}]})+'data: [DONE]\n\n')});
 assert.equal((await provider.complete([{role:'user',content:'fixture'}])).content,'{"ok":true}');
 const other=new ModelProvider(config,{fetchImpl:async()=>stream(event({choices:[{index:1,delta:{content:'wrong choice'},finish_reason:'stop'}]})+'data: [DONE]\n\n')});
 await assert.rejects(()=>other.complete([{role:'user',content:'fixture'}],{onProgress:()=>{}}),error=>error.code==='ai_response_incomplete');
});
