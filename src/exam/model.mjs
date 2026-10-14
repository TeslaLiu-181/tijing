import {emptyScene,prepareScene,validate,example} from '../planar-model.mjs';
import {resolveScene} from '../planar-relations.mjs';
import {lessons,lessonScene} from '../planar-lessons.mjs';
import {defaults as spatialDefaults,solveExample4} from '../example4/physics.mjs';
import {validateSupplement} from '../supplement/catalog.mjs';

export const PAPER_FORMAT='particle-exam/1';
export const SCENE_RUNTIME_FILES=Object.freeze({planar:'planar.html',example4:'example4.html',supplement:'supplement.html'});
export const now=()=>new Date().toISOString(),clone=value=>structuredClone(value);
export function uid(){
 if(crypto.randomUUID)return crypto.randomUUID();
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
export const limitText=(text,fallback='未命名')=>String(text??fallback).trim().slice(0,140)||fallback;
export const imageMime=/^image\/(?:png|jpeg|webp|gif)$/;
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);

export function assertData(value,depth=0){
 if(depth>45)throw Error('资源结构嵌套过深');
 if(typeof value==='number'&&!Number.isFinite(value))throw Error('资源包含无效数值');
 if(value&&typeof value==='object'){
  if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('只接受 JSON 数据');
  for(const [key,item] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw Error('资源包含不允许的属性');assertData(item,depth+1);}
 }else if(value!==null&&!['string','number','boolean','undefined'].includes(typeof value))throw Error('资源包含不支持的数据类型');
}
export function checkSnapshot(kind,input){
 assertData(input);
 const snapshot=clone(input||{});snapshot.context??={};
 if(typeof snapshot.context!=='object'||Array.isArray(snapshot.context))throw Error('场景观察状态不正确');
 const context=snapshot.context;
 if(context.viewport&&(!['width','height'].every(key=>Number.isFinite(context.viewport[key])&&context.viewport[key]>0)))throw Error('场景窗口尺寸不正确');
 if(context.timeUs!==undefined&&(!Number.isFinite(context.timeUs)||context.timeUs<0))throw Error('观察时刻须为非负数');
 if(context.fitObjectsOnly!==undefined&&typeof context.fitObjectsOnly!=='boolean')throw Error('场域取景设置须为布尔值');
 if(kind==='planar'){
  if(context.fieldDensity!==undefined){if(!context.fieldDensity||typeof context.fieldDensity!=='object'||Array.isArray(context.fieldDensity))throw Error('场强显示标尺格式不正确');for(const [key,value]of Object.entries(context.fieldDensity))if(!['magnetic','electric'].includes(key)||!Number.isFinite(value)||value<=0)throw Error('场强显示标尺须为正数');}
  snapshot.scene=prepareScene(snapshot.scene);if(snapshot.scene.objects.length>500)throw Error('单场景最多包含500个对象');
  validate(snapshot.scene);resolveScene(snapshot.scene);validate(snapshot.scene);
  context.timeUs=Math.min(context.timeUs||0,snapshot.scene.duration);
  if(context.view&&(!['x','y','scale'].every(k=>Number.isFinite(context.view[k]))||context.view.scale<=0))throw Error('场景视图参数不正确');
 }else if(kind==='example4'){
  if(snapshot.scene?.format!=='example4-model/1')throw Error('例4空间场景格式不正确');
  const r=solveExample4(snapshot.scene.config);context.timeUs=Math.min(context.timeUs||0,r.total*1e6);
  if(context.projection&&!['ortho','perspective'].includes(context.projection))throw Error('投影方式不正确');
  if(context.camera){
   for(const key of ['position','target','up'])if(!Array.isArray(context.camera[key])||context.camera[key].length!==3||context.camera[key].some(n=>!Number.isFinite(n)))throw Error('空间视角参数不正确');
   if(!Number.isFinite(context.camera.zoom)||context.camera.zoom<=0)throw Error('空间缩放参数不正确');
   if(context.camera.extent!==undefined&&(!Number.isFinite(context.camera.extent)||context.camera.extent<=0))throw Error('空间视野范围不正确');
  }
 }else if(kind==='supplement'){
  snapshot.scene=validateSupplement(snapshot.scene);
  if(context.progress!==undefined&&(!Number.isFinite(context.progress)||context.progress<0||context.progress>1))throw Error('补充模型进度不正确');
  for(const key of ['showForces','showField'])if(context[key]!==undefined&&typeof context[key]!=='boolean')throw Error('补充模型显示状态不正确');
  if(context.view!==undefined&&!['front','spatial','top','side'].includes(context.view))throw Error('补充模型视角不正确');
  if(context.camera){
   for(const key of ['position','target','up'])if(!Array.isArray(context.camera[key])||context.camera[key].length!==3||context.camera[key].some(n=>!Number.isFinite(n)))throw Error('空间视角参数不正确');
   for(const key of ['zoom','extent'])if(!Number.isFinite(context.camera[key])||context.camera[key]<=0)throw Error('空间视野范围不正确');
  }
 }else throw Error('不支持的场景类型');
 return snapshot;
}
export const genericTemplates=[
 ['empty','空白场景'],['circle','圆形有界磁场'],['rectangle','矩形磁场进出'],['source','点源粒子束'],
 ['double','相邻不同磁场'],['quadrant','第一象限'],['electric-deflection','电场加速与偏转'],
 ['velocity-selector','速度选择器'],['crossed-drift','复合场从静止开始'],['cyclotron','回旋加速器']
];
export const templates=[
 ...genericTemplates.map(([id,title])=>({id:'base:'+id,title,group:'通用场景',kind:'planar'})),
 ...lessons.map(l=>({id:'lesson:'+l.id,title:l.title,group:'已制作的专题强化6场景',kind:'planar'})),
 {id:'spatial:example4',title:'例4 · 空间界面与临界相切',group:'空间演示',kind:'example4'}
];
export function snapshotForTemplate(key){
 if(key==='spatial:example4')return {kind:'example4',snapshot:{scene:{format:'example4-model/1',config:{...spatialDefaults}},context:{timeUs:0,projection:'ortho',view:'spatial'}}};
 const [type,name]=key.split(':');if(!templates.some(t=>t.id===key))throw Error('未知场景模板');
 const scene=type==='lesson'?lessonScene(name):example(name);
 return {kind:'planar',snapshot:{scene,context:{timeUs:0,sidebar:false,panel:type==='lesson'?'teaching':'objects'}}};
}
export function newScene(title='原题场景',key='base:empty'){
 const {kind,snapshot}=snapshotForTemplate(key);
 return {id:uid(),title:limitText(title),kind,snapshot,baseline:clone(snapshot),status:'draft',part:'',createdAt:now(),updatedAt:now()};
}
export function newQuestion(title='新题目',sourceText=''){
 return {id:uid(),title:limitText(title),sourceText:String(sourceText),referenceText:'',attachments:[],notes:[],parts:[],scenes:[],activeSceneId:null,review:'pending',createdAt:now()};
}
export function newPaper(title='我的试卷'){
 return {format:PAPER_FORMAT,id:'exam-'+uid(),title:limitText(title),createdAt:now(),updatedAt:now(),revision:0,sources:[],assets:{},questions:[],activeQuestionId:null};
}
export const getQuestion=paper=>paper.questions.find(q=>q.id===paper.activeQuestionId)||paper.questions[0]||null;
export const getScene=question=>question?.scenes.find(s=>s.id===question.activeSceneId)||question?.scenes[0]||null;
export function validatePaper(input,{portable=false}={}){
 assertData(input);const paper=clone(input);
 if(paper.format!==PAPER_FORMAT||!safeId(paper.id)||!Array.isArray(paper.questions)||paper.questions.length>1000)throw Error('试卷资源格式不正确');
 if(!paper.assets||typeof paper.assets!=='object'||Array.isArray(paper.assets)||Object.keys(paper.assets).length>5000||!Array.isArray(paper.sources))throw Error('试卷资料格式不正确');
 paper.title=limitText(paper.title);paper.revision=Number.isSafeInteger(paper.revision)&&paper.revision>=0?paper.revision:0;
 const questionIds=new Set(),sceneIds=new Set();let totalBytes=0;
 for(const [id,asset] of Object.entries(paper.assets)){
  if(!safeId(id)||asset.id!==id||typeof asset.name!=='string'||typeof asset.mime!=='string')throw Error('资料编号或类型不正确');
  if(asset.displayURL!==undefined&&(typeof asset.displayURL!=='string'||!/^\/api\/resources\/exam-[a-f0-9-]{36}\/assets\/[a-zA-Z0-9_-]{1,100}(?:\?view=(?:shared|workshop))?$/i.test(asset.displayURL)))throw Error('在线题图地址不正确');
  if(asset.url!==undefined){
   if(typeof asset.url!=='string'||!/^data:[a-zA-Z0-9.+/-]+;base64,[a-zA-Z0-9+/=\r\n]*$/.test(asset.url))throw Error('资料仅接受内嵌数据');
   if(!asset.url.startsWith('data:'+asset.mime+';base64,'))throw Error('资料内容类型不一致');
   totalBytes+=asset.url.length*.75;if(totalBytes>200*1024*1024)throw Error('试卷资源总大小超过200 MB');
  }else if(portable&&imageMime.test(asset.mime))throw Error('课件缺少内嵌题图：'+asset.name);
 }
 for(const q of paper.questions){
  if(!safeId(q.id)||questionIds.has(q.id)||!Array.isArray(q.scenes)||q.scenes.length>100)throw Error('题目编号重复或场景数量不正确');questionIds.add(q.id);
  q.title=limitText(q.title);q.sourceText=String(q.sourceText??'');q.referenceText=String(q.referenceText??'');
  if(q.sourceText.length>500000||q.referenceText.length>500000)throw Error('单题文字过长');
  q.notes=Array.isArray(q.notes)?q.notes:[];q.parts=Array.isArray(q.parts)?q.parts:[];q.attachments=Array.isArray(q.attachments)?q.attachments:[];
  q.review=q.review==='confirmed'?'confirmed':'pending';
  for(const asset of q.attachments)if(!paper.assets[asset.id])throw Error('缺少题图或原页：'+(asset.name||asset.id));
  for(const s of q.scenes){
   if(!safeId(s.id)||sceneIds.has(s.id))throw Error('场景编号重复');sceneIds.add(s.id);
   s.title=limitText(s.title);s.snapshot=checkSnapshot(s.kind,s.snapshot);s.baseline=checkSnapshot(s.kind,s.baseline||s.snapshot);s.status=s.status==='ready'?'ready':'draft';s.part=String(s.part??'');
  }
  q.activeSceneId=q.scenes.some(s=>s.id===q.activeSceneId)?q.activeSceneId:q.scenes[0]?.id||null;
 }
 paper.activeQuestionId=paper.questions.some(q=>q.id===paper.activeQuestionId)?paper.activeQuestionId:paper.questions[0]?.id||null;
 return paper;
}
export function cloneVariant(record,title){
 const result=clone(record);result.id=uid();result.title=limitText(title||record.title+' · 变式');result.status='draft';result.baseline=clone(record.snapshot);result.createdAt=result.updatedAt=now();return result;
}
export function collectAssets(paper,{includeOriginals=true}={}){
 const ids=new Set(paper.questions.flatMap(q=>q.attachments.map(a=>a.id)));
 if(includeOriginals)for(const source of paper.sources)if(source.asset?.id)ids.add(source.asset.id);
 return ids;
}
export function emptySnapshot(){return {scene:emptyScene(),context:{timeUs:0,sidebar:false,panel:'objects'}};}
