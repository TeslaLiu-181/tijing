import {HTTPError,requireCondition} from './errors.mjs';

/** Parse OpenAI-compatible SSE, retaining provider continuation only in memory. */
export async function readChatCompletionStream(response,{onProgress,signal}={}){
  const reader=response.body?.getReader();requireCondition(reader,502,'模型未返回可读取的数据流','ai_response_invalid');
  const decoder=new TextDecoder(),toolCalls=new Map();let buffer='',eventLines=[],content='',reasoning='',finishReason=null,usage=null,model=null,done=false,bytes=0,lastProgress=0;
  function progress(force=false){const stamp=Date.now();if(!force&&stamp-lastProgress<800)return;lastProgress=stamp;onProgress?.({textCharacters:content.length,toolRequests:toolCalls.size,receiving:true,reasoning:reasoning.length>0&&!content.length});}
  function dispatch(){
    if(!eventLines.length)return;const data=eventLines.join('\n');eventLines=[];
    if(!data.trim())return;if(data.trim()==='[DONE]'){done=true;return;}
    let event;try{event=JSON.parse(data);}catch{throw new HTTPError(502,'模型流式响应格式不正确','ai_response_invalid');}
    if(event.model)model=event.model;if(event.usage)usage=event.usage;
    if(event.error)throw new HTTPError(502,'模型在输出过程中报告错误','ai_provider_error');
    const choice=event.choices?.find(c=>c.index===0)||event.choices?.find(c=>c.index==null),delta=choice?.delta||{};
    if(typeof delta.content==='string')content+=delta.content;
    if(typeof delta.reasoning_content==='string')reasoning+=delta.reasoning_content;
    for(const partial of delta.tool_calls||[]){
      requireCondition(Number.isInteger(partial.index)&&partial.index>=0&&partial.index<6,502,'流式工具编号不正确','ai_response_invalid');
      let call=toolCalls.get(partial.index);if(!call){call={id:'',type:'function',function:{name:'',arguments:''}};toolCalls.set(partial.index,call);}
      if(partial.id)call.id=partial.id;if(partial.type)call.type=partial.type;
      if(partial.function?.name)call.function.name+=partial.function.name;
      if(typeof partial.function?.arguments==='string')call.function.arguments+=partial.function.arguments;
    }
    if(choice?.finish_reason)finishReason=choice.finish_reason;progress();
  }
  function consume(text,flush=false){
    buffer+=text;let index;
    while(!done&&(index=buffer.search(/[\r\n]/))>=0){
      // A CR at the chunk boundary may be the first half of CRLF.
      if(!flush&&buffer[index]==='\r'&&index===buffer.length-1)break;
      const line=buffer.slice(0,index),width=buffer[index]==='\r'&&buffer[index+1]==='\n'?2:1;buffer=buffer.slice(index+width);
      if(!line)dispatch();else if(line.startsWith('data:'))eventLines.push(line.slice(5).replace(/^ /,''));
    }
    if(flush&&!done){if(buffer.startsWith('data:'))eventLines.push(buffer.slice(5).replace(/^ /,''));buffer='';dispatch();}
  }
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  const checkAbort=()=>{if(signal?.aborted)throw new HTTPError(499,'已取消此次 AI 请求','ai_cancelled');};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    checkAbort();
    while(!done){const next=await reader.read();checkAbort();if(next.done)break;bytes+=next.value.byteLength;requireCondition(bytes<=2_000_000,502,'模型返回内容过大','ai_response_invalid');consume(decoder.decode(next.value,{stream:true}));}
    if(done)cancel();else consume(decoder.decode(),true);checkAbort();
    requireCondition(done||finishReason,502,'模型输出在完成标记前中断','ai_response_interrupted');
    progress(true);checkAbort();
    return {model,usage,choices:[{index:0,finish_reason:finishReason,message:{role:'assistant',content,reasoning_content:reasoning,...(toolCalls.size?{tool_calls:[...toolCalls.entries()].sort((a,b)=>a[0]-b[0]).map(([,call])=>call)}:{})}}]};
  }catch(error){
    cancel();if(usage){error.streamUsage=usage;error.model=model;}throw error;
  }finally{signal?.removeEventListener('abort',cancel);reader.releaseLock();}
}
