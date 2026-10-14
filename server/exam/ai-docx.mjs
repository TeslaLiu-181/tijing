import {Worker} from 'node:worker_threads';
import {HTTPError} from './errors.mjs';

export const AI_DOCX_LIMITS={expandedBytes:36*1024*1024,xmlBytes:4*1024*1024,timeoutMs:15000,heapMb:256};

// ZIP inflation, DOM construction and traversal are synchronous. Keep all three
// outside the HTTP event loop; settle only after termination has freed the worker.
export async function extractAIDocx(bytes,{signal,timeoutMs=AI_DOCX_LIMITS.timeoutMs}={}) {
  if(signal?.aborted)throw new HTTPError(499,'已取消 Word 文件读取','ai_cancelled');
  return new Promise((resolve,reject)=>{
    const data=Uint8Array.from(bytes);
    const worker=new Worker(new URL('./ai-docx-worker.mjs',import.meta.url),{
      workerData:{data,limits:{maxBytes:AI_DOCX_LIMITS.expandedBytes,maxXmlBytes:AI_DOCX_LIMITS.xmlBytes}},
      transferList:[data.buffer],execArgv:[],resourceLimits:{maxOldGenerationSizeMb:AI_DOCX_LIMITS.heapMb}});
    let finished=false;
    const finish=async(error,result)=>{
      if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      try{await worker.terminate();}catch{}
      error?reject(error):resolve(result);
    };
    const abort=()=>finish(new HTTPError(499,'已取消 Word 文件读取','ai_cancelled'));
    const timer=setTimeout(()=>finish(new HTTPError(422,'Word 结构解析超过 15 秒，请拆分材料后重试。','ai_docx_timeout')),
      Math.max(1,Math.min(AI_DOCX_LIMITS.timeoutMs,Number(timeoutMs)||AI_DOCX_LIMITS.timeoutMs)));
    signal?.addEventListener('abort',abort,{once:true});
    worker.once('message',message=>finish(message.ok?null:new HTTPError(message.code==='docx_invalid'?400:413,message.message,
      message.code==='docx_invalid'?'ai_document_invalid':'ai_docx_complexity'),message.result));
    worker.once('error',error=>finish(error.code==='ERR_WORKER_OUT_OF_MEMORY'
      ?new HTTPError(413,'Word 结构过于复杂，已停止读取，请按章节拆分材料。','ai_docx_complexity')
      :new HTTPError(400,'Word 读取进程失败，请检查文件或重新导出 DOCX。','ai_document_invalid')));
    worker.once('exit',()=>{if(!finished)finish(new HTTPError(400,'Word 读取进程意外结束，请拆分材料后重试。','ai_document_invalid'));});
    if(signal?.aborted)abort();
  });
}
