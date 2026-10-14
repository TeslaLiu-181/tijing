import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {PAPER_FORMAT,validatePaper,newPaper,newQuestion,newScene,checkSnapshot,uid,collectAssets,clone} from './model.mjs';

export function htmlPaper(text){
 const match=String(text).match(/<script\b[^>]*\bid=["']paper-data["'][^>]*>([\s\S]*?)<\/script\s*>/i);
 if(!match)throw Error('这个 HTML 没有本工作台的试卷资源数据。请导入资源包或场景 JSON。');
 return validatePaper(JSON.parse(match[1]),{portable:true});
}
const toBytes=url=>Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0));
const toURL=(bytes,mime)=>{let value='';for(let offset=0;offset<bytes.length;offset+=32768)value+=String.fromCharCode(...bytes.subarray(offset,offset+32768));return 'data:'+mime+';base64,'+btoa(value);};
export function exportResource(input,{includeOriginals=true}={}){
 const paper=validatePaper(input,{portable:true}),keep=collectAssets(paper,{includeOriginals}),files={};
 for(const [id,asset] of Object.entries(paper.assets)){
  if(!keep.has(id)){delete paper.assets[id];continue;}
  if(!asset.url)continue;const path='assets/'+id;files[path]=toBytes(asset.url);asset.bundlePath=path;delete asset.url;delete asset.path;
 }
 if(!includeOriginals)paper.sources=paper.sources.map(({asset,...source})=>source);
 files['paper.json']=strToU8(JSON.stringify(paper));return zipSync(files,{level:0});
}
export function importResource(bytes){
 if(bytes.byteLength>200*1024*1024)throw Error('资源包超过200 MB');
 let total=0,count=0;const files=unzipSync(new Uint8Array(bytes),{filter:entry=>{count++;total+=entry.originalSize;if(count>5000||total>256*1024*1024)throw Error('资源展开内容过大');if(!/^(?:paper\.json|project\.json|assets\/[a-zA-Z0-9_.-]+)$/.test(entry.name))throw Error('资源包中有不安全的资料路径');return true;}});
 if(files['project.json'])return legacyProject(JSON.parse(strFromU8(files['project.json'])),files);
 if(!files['paper.json'])throw Error('资源包缺少试卷数据');
 const paper=JSON.parse(strFromU8(files['paper.json']));
 for(const asset of Object.values(paper.assets||{})){if(!asset.bundlePath||!files[asset.bundlePath])throw Error('资源包缺少资料：'+asset.name);asset.url=toURL(files[asset.bundlePath],asset.mime);delete asset.bundlePath;delete asset.path;}
 return validatePaper(paper,{portable:true});
}
function legacyProject(data,files){
 if(data.format!=='planar-agent-project/1'||!Array.isArray(data.questions))throw Error('旧项目格式不正确');
 const paper=newPaper(data.title);paper.sources=clone(data.sources||[]);
 for(const old of data.questions){const q=newQuestion(old.title,old.sourceText);q.referenceText=old.referenceText||'';q.parts=old.parts||[];q.notes=old.notes||[];q.review='pending';
  const active=newScene('原题场景');active.snapshot=checkSnapshot('planar',{scene:old.scene,context:old.context||{}});active.baseline=checkSnapshot('planar',{scene:old.originalScene||old.scene,context:{timeUs:0}});q.scenes=[active];q.activeSceneId=active.id;
  for(const asset of old.attachments||[]){if(!files[asset.path])throw Error('旧项目缺少资料：'+asset.name);const extension=asset.path.split('.').at(-1).toLowerCase(),mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'})[extension]||'application/octet-stream',id=asset.id||uid();paper.assets[id]={id,name:asset.name||'原题资料',mime,url:toURL(files[asset.path],mime),kind:asset.kind||'image'};q.attachments.push({...asset,id});}
  paper.questions.push(q);
 }
 // Native Agent sessions and chat histories are intentionally not part of the
 // classroom resource model; the original bundle remains untouched.
 paper.sources=paper.sources.map(({asset,...source})=>source);paper.activeQuestionId=paper.questions[0]?.id||null;return validatePaper(paper,{portable:true});
}
export function readJSONResource(text){
 const data=JSON.parse(text);if(data.format===PAPER_FORMAT)return {type:'paper',paper:validatePaper(data,{portable:true})};
 if(/^planar-particle-sandbox\/[1-5]$/.test(data.format))return {type:'scene',kind:'planar',snapshot:checkSnapshot('planar',{scene:data.scene,context:{...(data.view?{view:data.view}:{}),...(data.fieldDensity?{fieldDensity:data.fieldDensity}:{}),selected:data.selected,trace:data.trace,segment:data.segment||0,timeUs:(Number(data.time)||0)*1e6}})};
 if(data.format==='particle-exam-scene/1')return {type:'scene',kind:data.kind,snapshot:checkSnapshot(data.kind,data.snapshot),title:data.title};
 throw Error('请选择试卷资源或本沙盒的场景 JSON');
}
export function scriptJSON(data){return JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
