import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {HTTPError,requireCondition} from './errors.mjs';
import {secureProviderFetch,validateModelEndpoint} from './model-network.mjs';
import {readChatCompletionStream} from './ai-stream.mjs';

export function parseEnvironment(text) {
 const result={};
 for(const line of String(text).split(/\r?\n/)) {
  const match=line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(!match)continue;
  let value=match[2];if(value.length>=2&&((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))))value=value.slice(1,-1);
  result[match[1]]=value;
 }
 return result;
}
export async function loadModelConfiguration(env=process.env) {
 let file={};if(env.EXAM_AI_ENV_FILE)file=parseEnvironment(await readFile(env.EXAM_AI_ENV_FILE,'utf8'));
 const pick=(key,fallback)=>env[key]||file[key]||fallback;
 const apiKey=pick('EXAM_AI_API_KEY',file.DEEPSEEK_API_KEY||env.DEEPSEEK_API_KEY||'');
 const baseURL=pick('EXAM_AI_BASE_URL',file.DEEPSEEK_BASE_URL||env.DEEPSEEK_BASE_URL||'https://api.deepseek.com/v1');
 const url=new URL(baseURL);requireCondition(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash,500,'模型端点必须为 HTTPS 根路径');
 const model=pick('EXAM_AI_MODEL','deepseek-flash'),visionModel=pick('EXAM_AI_VISION_MODEL','deepseek-flash'),reviewModel=pick('EXAM_AI_REVIEW_MODEL',model);
 requireCondition([model,visionModel,reviewModel].every(x=>typeof x==='string'&&/^[a-zA-Z0-9._:/-]{1,100}$/.test(x)),500,'模型编号不正确');
 const positive=(key,fallback,max)=>{const n=Number(pick(key,fallback));requireCondition(Number.isSafeInteger(n)&&n>0&&n<=max,500,key+' 配置不正确');return n;};
 return {reviewModelExplicit:!!(env.EXAM_AI_REVIEW_MODEL||file.EXAM_AI_REVIEW_MODEL),apiKey,baseURL:baseURL.replace(/\/$/,''),model,visionModel,reviewModel,jsonFormat:pick('EXAM_AI_JSON_FORMAT','true')!=='false',
  maxTokens:positive('EXAM_AI_MAX_TOKENS',16384,32768),reviewMaxTokens:positive('EXAM_AI_REVIEW_MAX_TOKENS',16384,32768),timeoutMs:positive('EXAM_AI_TIMEOUT_MS',120000,300000),reviewTimeoutMs:positive('EXAM_AI_REVIEW_TIMEOUT_MS',180000,300000),jobTimeoutMs:positive('EXAM_AI_JOB_TIMEOUT_MS',600000,900000),
  dailyStudent:positive('EXAM_AI_DAILY_STUDENT',30,1000),dailyTeacher:positive('EXAM_AI_DAILY_TEACHER',100,1000),
  dailyTokenStudent:positive('EXAM_AI_DAILY_TOKEN_STUDENT',150000,10000000),dailyTokenTeacher:positive('EXAM_AI_DAILY_TOKEN_TEACHER',500000,20000000),
  dailyTokenTotal:positive('EXAM_AI_DAILY_TOKEN_TOTAL',2000000,50000000),parallel:positive('EXAM_AI_PARALLEL',2,8),dailyTotal:positive('EXAM_AI_DAILY_TOTAL',300,5000)};
}
const tokenCount=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>=0&&n<=20000000?n:0;};
const knownUsage=value=>!!value&&value.total_tokens!=null&&Number.isSafeInteger(Number(value.total_tokens))&&Number(value.total_tokens)>=0&&Number(value.total_tokens)<=20000000;
const normalizedUsage=value=>({inputTokens:tokenCount(value?.prompt_tokens),outputTokens:tokenCount(value?.completion_tokens),totalTokens:tokenCount(value?.total_tokens)});
function attachResponseUsage(error,value,model){
 if(knownUsage(value)){error.usage=normalizedUsage(value);error.usageKnown=true;}
 if(model)error.model=String(model);return error;
}
export class ModelProvider {
 constructor(config,{fetchImpl=secureProviderFetch}={}){this.config=config;this.fetch=fetchImpl;}
 describe(){
  const c=this.config;
  return {configured:!!c.apiKey,provider:new URL(c.baseURL).hostname,model:c.model,visionModel:c.visionModel,reviewModel:c.reviewModel||c.model,
   imageInput:!!(c.visionModel||c.model),effectiveVisionModel:c.visionModel||c.model,visionFallback:!c.visionModel,formats:['png','jpeg','webp','gif','pdf','doc','docx'],
   limits:{fileMB:12,totalMB:24,files:4,pdfPages:12,outputTokens:c.maxTokens,reviewOutputTokens:c.reviewMaxTokens||c.maxTokens,jobTimeoutSeconds:(c.jobTimeoutMs||600000)/1000,dailyStudent:c.dailyStudent,dailyTeacher:c.dailyTeacher}};
 }
 async probe({signal,vision=false}={}) {
  await validateModelEndpoint(this.config.baseURL,{signal});
  let messages;
  if(vision) {
   requireCondition(this.config.visionModel||this.config.model,400,'尚未配置模型','ai_vision_unconfigured');
   const png=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180"><rect width="400" height="180" fill="white"/><circle cx="100" cy="90" r="50" fill="#ff0000"/><rect x="240" y="40" width="100" height="100" fill="#0000ff"/></svg>')).png().toBuffer();
   messages=[{role:'system',content:'Inspect the supplied image. Return JSON only: ok:true, left_shape, left_color, right_shape, right_color, count. Use English color and shape names.'},
    {role:'user',content:[{type:'text',text:'Identify the shapes and colors on the left and right. This is a synthetic API test, no private user data.'},{type:'image_url',image_url:{url:'data:image/png;base64,'+png.toString('base64'),detail:'original'}}]}];
  } else messages=[{role:'system',content:'Return only a JSON object with key ok set to true.'},{role:'user',content:'API connectivity test. No user content. Return JSON.'}];
  const result=await this.complete(messages,{signal,maxTokens:256,images:vision,task:'probe'});
  let parsed;try{parsed=JSON.parse(result.content);}catch{throw new HTTPError(502,'模型未按测试要求返回 JSON，可关闭 JSON 格式选项后重试','ai_probe_invalid');}
  requireCondition(parsed.ok===true,502,'模型连通，但未按测试要求响应','ai_probe_invalid');
  if(vision)requireCondition(parsed.left_shape==='circle'&&parsed.left_color==='red'&&['square','rectangle'].includes(parsed.right_shape)&&parsed.right_color==='blue'&&parsed.count===2,502,'视觉接口可调用，但合成图形识别未通过','ai_probe_vision_failed');
  return {ok:true,model:result.model,provider:result.provider,usage:result.usage,testedAt:new Date().toISOString(),
   kind:vision?'synthetic-image-probe':'text-model-probe',visionVerified:vision,limitations:vision?['合成图形通过不代表所有试题图片都能准确识别。']:[]};
 }
 async complete(messages,{images=false,signal,json=true,maxTokens,task='tutor',modelOverride,tools,toolChoice='auto',onProgress}={}) {
  const c=this.config;requireCondition(c.apiKey,503,'AI 尚未配置，请联系教师或管理员','ai_unconfigured');
  const timeout=AbortSignal.timeout(task==='review'?(c.reviewTimeoutMs||c.timeoutMs):c.timeoutMs),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const providerHost=new URL(c.baseURL).hostname,deepseek=providerHost==='api.deepseek.com';
  const selected=modelOverride||(images?(c.visionModel||c.model):c.model);
  requireCondition(typeof selected==='string'&&/^[a-zA-Z0-9._:/-]{1,100}$/.test(selected),400,'模型编号不正确');
  const easy=task==='probe'||task==='extract'||task==='formula';
  const requestMessages=deepseek?messages:messages.map(message=>Array.isArray(message.content)?{...message,content:message.content.map(part=>{
   if(part.type!=='image_url')return part;const {detail,...imageURL}=part.image_url;return {...part,image_url:imageURL};
  })}:message);
  let response;
  try {
   response=await this.fetch(c.baseURL+'/chat/completions',{method:'POST',signal:combined,stream:!!onProgress,timeoutMs:task==='review'?(c.reviewTimeoutMs||c.timeoutMs):c.timeoutMs,
    headers:{'content-type':'application/json',authorization:'Bearer '+c.apiKey},
    body:JSON.stringify({model:selected,messages:requestMessages,max_tokens:Math.min(maxTokens||(task==='review'?(c.reviewMaxTokens||c.maxTokens):c.maxTokens),task==='review'?(c.reviewMaxTokens||c.maxTokens):c.maxTokens),
     ...(deepseek?{thinking:{type:easy?'disabled':'enabled'},...(easy?{}:{reasoning_effort:'high'})}:{}),temperature:.25,...(json&&c.jsonFormat!==false?{response_format:{type:'json_object'}}:{}),...(tools?.length?{tools,tool_choice:toolChoice}:{}),...(onProgress?{stream:true,stream_options:{include_usage:true}}:{})})});
  }catch(error){
   if(error instanceof HTTPError)throw error;
   if(signal?.aborted)throw new HTTPError(499,'已取消此次 AI 请求','ai_cancelled');
   throw new HTTPError(502,combined.aborted?'模型响应超时，请稍后重试':'无法连接模型服务，请稍后重试','ai_provider_unavailable');
  }
  if(!response.ok){
   await response.body?.cancel().catch(()=>{});
   const message=response.status===401||response.status===403?'模型授权失效，请联系管理员':response.status===402?'模型账户余额不足，请联系管理员':response.status===429?'模型服务繁忙，请稍后重试':response.status===400&&images?'接口拒绝了图片或请求参数，请核对视觉模型与 JSON 选项':'模型服务暂时不可用';
   throw new HTTPError(502,message,'ai_provider_error');
  }
  let data;
  try{
   if(response.headers.get('content-type')?.toLowerCase().includes('text/event-stream'))data=await readChatCompletionStream(response,{onProgress,signal:combined});
   else{const raw=await response.text();requireCondition(raw.length<=2_000_000,502,'模型返回内容过大','ai_response_invalid');try{data=JSON.parse(raw);}catch{throw new HTTPError(502,'模型响应格式不正确','ai_response_invalid');}}
  }catch(error){
   if(signal?.aborted)throw attachResponseUsage(new HTTPError(499,'已取消此次 AI 请求','ai_cancelled'),error.streamUsage,error.model||selected);
   if(combined.aborted)throw attachResponseUsage(new HTTPError(502,'模型响应超时，请稍后重试','ai_provider_unavailable'),error.streamUsage,error.model||selected);
   attachResponseUsage(error,error.streamUsage,error.model||selected);
   if(error instanceof HTTPError)throw error;
   throw attachResponseUsage(new HTTPError(502,'模型输出中断，请稍后重试','ai_provider_unavailable'),error.streamUsage,error.model||selected);
  }
  const choice=data.choices?.[0],content=choice?.message?.content,toolCalls=choice?.message?.tool_calls;
  const hasTools=tools?.length&&choice?.finish_reason==='tool_calls'&&Array.isArray(toolCalls)&&toolCalls.length>0;
  if(hasTools&&!(toolCalls.length<=6&&toolCalls.every(call=>typeof call.id==='string'&&call.id.length<=200&&call.type==='function'&&typeof call.function?.name==='string'&&typeof call.function?.arguments==='string'&&call.function.arguments.length<=150000)))throw attachResponseUsage(new HTTPError(502,'模型工具调用格式不正确','ai_response_invalid'),data.usage,data.model||selected);
  if(!hasTools&&(choice?.finish_reason!=='stop'||typeof content!=='string'||!content.trim())) {
   const error=new HTTPError(502,choice?.finish_reason==='length'?'模型输出未完成，请缩小问题范围后重试':'模型没有返回完整内容','ai_response_incomplete');
   attachResponseUsage(error,data.usage,data.model||selected);
   error.partialContent=typeof content==='string'?content.slice(0,45000):'';
   throw error;
  }
  const assistantMessage={role:'assistant',content:typeof content==='string'?content:null,...(hasTools?{tool_calls:toolCalls}:{}),...(deepseek&&typeof choice?.message?.reasoning_content==='string'?{reasoning_content:choice.message.reasoning_content}:{})};
  return {content:typeof content==='string'?content:'',...(hasTools?{toolCalls,assistantMessage}:{}),model:String(data.model||selected),usageKnown:knownUsage(data.usage),usage:normalizedUsage(data.usage),provider:providerHost};
 }
}
