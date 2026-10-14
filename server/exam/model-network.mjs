import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import https from 'node:https';
import {HTTPError,requireCondition} from './errors.mjs';

function publicV4(address) {
 const a=address.split('.').map(Number);
 if(a.length!==4||a.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 const [x,y,z]=a;
 return !(x===0||x===10||x===127||x>=224||x===169&&y===254||x===172&&y>=16&&y<=31||x===192&&y===168||
  x===100&&y>=64&&y<=127||x===192&&(y===0||y===88&&z===99)||x===198&&(y===18||y===19||y===51&&z===100)||x===203&&y===0&&z===113);
}
function wordsV6(address) {
 let s=address.toLowerCase();
 if(s.includes('%'))return null;
 if(s.includes('.')) {
  const last=s.slice(s.lastIndexOf(':')+1),parts=last.split('.').map(Number);
  if(!publicV4(last))return null;
  s=s.slice(0,s.lastIndexOf(':')+1)+((parts[0]<<8)|parts[1]).toString(16)+':'+((parts[2]<<8)|parts[3]).toString(16);
 }
 const [left,right]=s.split('::'),a=left?left.split(':'):[],b=right?right.split(':'):[];
 if(s.includes('::'))return [...a,...Array(8-a.length-b.length).fill('0'),...b].map(x=>parseInt(x,16));
 return a.length===8?a.map(x=>parseInt(x,16)):null;
}
export function isPublicAddress(address) {
 const version=isIP(address);
 if(version===4)return publicV4(address);
 if(version!==6)return false;
 const w=wordsV6(address);if(!w||w.length!==8)return false;
 if(w.slice(0,5).every(n=>n===0)&&w[5]===0xffff)return publicV4([w[6]>>8,w[6]&255,w[7]>>8,w[7]&255].join('.'));
 // Accept global unicast only, excluding documentation and transition ranges.
 return (w[0]&0xe000)===0x2000&&!(w[0]===0x2001&&[0,0x10,0x20,0xdb8].includes(w[1]))&&w[0]!==0x2002;
}
export async function validateModelEndpoint(baseURL,{lookupImpl=dnsLookup,signal}={}) {
 let url;try{url=new URL(baseURL);}catch{throw new HTTPError(400,'API 服务地址格式不正确','ai_endpoint_invalid');}
 requireCondition(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash,400,'API 服务地址须为 HTTPS，不能包含账号、查询或片段','ai_endpoint_invalid');
 const host=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
 requireCondition(host&&host!=='localhost'&&!host.endsWith('.localhost')&&!host.endsWith('.local')&&!host.endsWith('.internal'),400,'API 服务地址不能指向本机或内部网络','ai_endpoint_private');
 requireCondition(!url.port||Number(url.port)>=1&&Number(url.port)<=65535,400,'API 端口不正确');
 requireCondition(url.pathname.length<=500,400,'API 路径过长');
 let addresses;
 if(isIP(host))addresses=[{address:host,family:isIP(host)}];
 else {
  let timer,abort;
  try {
   if(signal?.aborted)throw new HTTPError(499,'请求已取消','ai_cancelled');
   const interruption=new Promise((_r,reject)=>{
    timer=setTimeout(()=>reject(new HTTPError(502,'API 域名解析超时','ai_endpoint_dns')),10000);
    abort=()=>reject(new HTTPError(499,'请求已取消','ai_cancelled'));signal?.addEventListener('abort',abort,{once:true});
   });
   addresses=await Promise.race([lookupImpl(host,{all:true,verbatim:true}),interruption]);
  } catch(error){if(error instanceof HTTPError)throw error;throw new HTTPError(502,'无法解析 API 服务域名','ai_endpoint_dns');}
  finally{clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort);}
 }
 requireCondition(Array.isArray(addresses)&&addresses.length>0&&addresses.every(a=>isPublicAddress(a.address)),400,'API 服务地址解析到了受限制的网络','ai_endpoint_private');
 return {url,host,addresses};
}
export function createProviderResponse(status,body,headers={}) {
 requireCondition(Number.isInteger(status)&&status>=200&&status<=599,502,'模型接口返回无效 HTTP 状态','ai_provider_status_invalid');
 try {
  return new Response([204,205,304].includes(status)?null:body,{status,headers:{'content-type':String(headers['content-type']||'application/json')}});
 } catch{throw new HTTPError(502,'模型接口响应无法读取','ai_response_invalid');}
}
export function readProviderMessage(response) {
 return new Promise((resolve,reject)=>{
  let settled=false,size=0;const chunks=[];
  const fail=error=>{if(settled)return;settled=true;response.destroy?.();reject(error instanceof HTTPError?error:new HTTPError(502,'模型连接在响应完成前中断','ai_response_interrupted'));};
  if(response.statusCode>=300&&response.statusCode<400){fail(new HTTPError(502,'API 服务重定向被拒绝，请填写最终 HTTPS 接口地址','ai_endpoint_redirect'));return;}
  if(!Number.isInteger(response.statusCode)||response.statusCode<200||response.statusCode>599){fail(new HTTPError(502,'模型接口返回无效 HTTP 状态','ai_provider_status_invalid'));return;}
  response.on('data',chunk=>{
   if(settled)return;size+=chunk.length;
   if(size>2_000_000)fail(new HTTPError(502,'模型返回内容过大','ai_response_invalid'));else chunks.push(Buffer.from(chunk));
  });
  response.on('error',fail);
  response.on('aborted',()=>fail(new HTTPError(502,'模型响应尚未完成便断开连接','ai_response_interrupted')));
  response.on('close',()=>{if(!settled&&!response.complete)fail(new HTTPError(502,'模型响应未完整传输','ai_response_interrupted'));});
  response.on('end',()=>{
   if(settled)return;
   try{const result=createProviderResponse(response.statusCode,Buffer.concat(chunks),response.headers);settled=true;resolve(result);}
   catch(error){fail(error);}
  });
 });
}
export function readProviderStream(response){
 if(response.statusCode>=300&&response.statusCode<400){response.destroy();throw new HTTPError(502,'API 服务重定向被拒绝，请填写最终 HTTPS 接口地址','ai_endpoint_redirect');}
 if(!Number.isInteger(response.statusCode)||response.statusCode<200||response.statusCode>599){response.destroy();throw new HTTPError(502,'模型接口返回无效 HTTP 状态','ai_provider_status_invalid');}
 if([204,205].includes(response.statusCode)){response.destroy();return createProviderResponse(response.statusCode,null,response.headers);}
 let size=0,settled=false;
 const stream=new ReadableStream({start(controller){
  const fail=error=>{if(settled)return;settled=true;controller.error(error instanceof HTTPError?error:new HTTPError(502,'模型连接在输出完成前中断','ai_response_interrupted'));response.destroy();};
  response.on('data',chunk=>{if(settled)return;size+=chunk.length;if(size>2_000_000){fail(new HTTPError(502,'模型返回内容过大','ai_response_invalid'));return;}controller.enqueue(new Uint8Array(chunk));});
  response.on('error',fail);response.on('aborted',()=>fail(new HTTPError(502,'模型响应尚未完成便断开连接','ai_response_interrupted')));
  response.on('end',()=>{if(!settled){settled=true;controller.close();}});
  response.on('close',()=>{if(!settled&&!response.complete)fail(new HTTPError(502,'模型响应未完整传输','ai_response_interrupted'));});
 },cancel(){settled=true;response.destroy();}});
 return createProviderResponse(response.statusCode,stream,response.headers);
}
export async function secureProviderFetch(url,options={}) {
 const {host,addresses}=await validateModelEndpoint(url,{signal:options.signal});
 if(options.signal?.aborted)throw new HTTPError(499,'请求已取消','ai_cancelled');
 return new Promise((resolve,reject)=>{
  const pinned=addresses.find(a=>a.family===4)||addresses[0];
  const request=https.request(url,{method:options.method||'GET',headers:options.headers,servername:isIP(host)?undefined:host,
   lookup:(_hostname,_options,callback)=>{if(_options?.all)callback(null,[pinned]);else callback(null,pinned.address,pinned.family);},
   signal:options.signal,timeout:options.timeoutMs||120000},response=>{if(options.stream){try{resolve(readProviderStream(response));}catch(error){reject(error);}}else readProviderMessage(response).then(resolve,reject);});
  request.on('error',reject);request.on('timeout',()=>request.destroy(new Error('timeout')));
  request.on('upgrade',(_response,socket)=>{socket.destroy();reject(new HTTPError(502,'模型接口不应升级连接协议','ai_provider_status_invalid'));});
  request.end(options.body);
 });
}
