import {mkdir,readFile,writeFile,rename,readdir,copyFile,stat} from 'node:fs/promises';
import {join,resolve,relative,extname,sep,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {newPaper,newQuestion,validatePaper,clone,now,uid,collectAssets,imageMime} from '../../src/exam/model.mjs';

const mimes={'.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.tif':'image/tiff','.tiff':'image/tiff','.txt':'text/plain'};
const extensionFor=mime=>Object.entries(mimes).find(([key,value])=>value===mime)?.[0]||'.bin';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

export class PaperStore{
 constructor(root){this.root=resolve(root);this.pending=new Map();this.cache=new Map();this.urls=new Map();}
 async init(){await mkdir(this.root,{recursive:true});return this;}
 folder(id){if(!/^exam-[a-f0-9-]{36}$/i.test(id))throw Error('试卷编号不正确');return join(this.root,id);}
 assetPath(paperId,path){const root=this.folder(paperId),target=resolve(root,path),rel=relative(root,target);if(rel==='..'||rel.startsWith('..'+sep)||!rel.replaceAll('\\','/').startsWith('assets/')||/^[a-zA-Z]:/.test(rel))throw Error('资料路径超出试卷目录');return target;}
 async list(){await this.init();const entries=[];for(const item of await readdir(this.root,{withFileTypes:true}))if(item.isDirectory()&&/^exam-[a-f0-9-]{36}$/i.test(item.name))try{const p=await this.open(item.name);entries.push({id:p.id,title:p.title,updatedAt:p.updatedAt,questionCount:p.questions.length});}catch(error){entries.push({id:item.name,title:item.name,error:error.message});}return entries.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));}
 async create(title){const paper=newPaper(title);await this.save(paper);return paper;}
 newQuestion(title,text){return newQuestion(title,text);}
 async open(id){if(this.cache.has(id))return clone(this.cache.get(id));const p=validatePaper(JSON.parse(await readFile(join(this.folder(id),'paper.json'),'utf8')));if(p.id!==id)throw Error('试卷内容与目录编号不一致');this.cache.set(id,p);return clone(p);}
 async save(input){
  const paper=validatePaper(input),folder=this.folder(paper.id);
  // Browser state may include display URLs. Disk metadata keeps only relative
  // asset references, so playback does not rewrite every page image.
  for(const asset of Object.values(paper.assets)){if(!asset.path)throw Error('资料尚未保存：'+asset.name);this.assetPath(paper.id,asset.path);delete asset.url;}
  paper.updatedAt=now();const content=JSON.stringify(paper,null,2);
  const pending=(this.pending.get(paper.id)||Promise.resolve()).catch(()=>{}).then(async()=>{await mkdir(join(folder,'assets'),{recursive:true});const temp=join(folder,'.save-'+uid()+'.json');await writeFile(temp,content,'utf8');await rename(temp,join(folder,'paper.json'));});
  this.pending.set(paper.id,pending);await pending;this.cache.set(paper.id,paper);return {savedAt:paper.updatedAt,revision:paper.revision};
 }
 async flush(){await Promise.all(this.pending.values());}
 async addAsset(paper,path,{kind='original',name=basename(path)}={}){const info=await stat(path);if(info.size>150*1024*1024)throw Error('单份资料超过150 MB');return this.writeAsset(paper,await readFile(path),{extension:extname(path).toLowerCase(),name,kind});}
 async writeAsset(paper,bytes,{extension='.png',name='题图',kind='image',mime}={}){
  if(!/^\.[a-z0-9]+$/i.test(extension))throw Error('资料扩展名不正确');
  const id=uid(),path='assets/'+id+extension,data=Buffer.from(bytes),asset={id,path,name,mime:mime||mimes[extension]||'application/octet-stream',kind,bytes:data.length,sha256:digest(data)};
  if(asset.mime==='image/png'&&data.length>=24&&data.subarray(0,8).toString('hex')==='89504e470d0a1a0a'){asset.width=data.readUInt32BE(16);asset.height=data.readUInt32BE(20);}
  await mkdir(join(this.folder(paper.id),'assets'),{recursive:true});await writeFile(this.assetPath(paper.id,path),data);paper.assets[id]=asset;return {...asset};
 }
 async portable(input,{includeOriginals=true}={}){
  const p=validatePaper(input),keep=collectAssets(p,{includeOriginals});
  for(const [id,asset] of Object.entries(p.assets)){
   if(!keep.has(id)){delete p.assets[id];continue;}
   const bytes=await readFile(this.assetPath(p.id,asset.path));asset.url='data:'+asset.mime+';base64,'+bytes.toString('base64');delete asset.path;
  }
  if(!includeOriginals)p.sources=p.sources.map(({asset,...source})=>source);
  return validatePaper(p,{portable:true});
 }
 async forUI(input){const p=validatePaper(input);for(const asset of Object.values(p.assets))if(imageMime.test(asset.mime)){const key=p.id+':'+asset.id;if(!this.urls.has(key)){const bytes=await readFile(this.assetPath(p.id,asset.path));this.urls.set(key,'data:'+asset.mime+';base64,'+bytes.toString('base64'));}asset.url=this.urls.get(key);}return p;}
 async importPortable(input){
  const p=validatePaper(input,{portable:true});p.id='exam-'+uid();p.importedAt=now();
  const registered={};
  for(const [id,asset] of Object.entries(p.assets)){
   if(!asset.url)continue;
   const bytes=Buffer.from(asset.url.split(',')[1],'base64');if(asset.sha256&&digest(bytes)!==asset.sha256)throw Error('资料校验不一致：'+asset.name);
   const path='assets/'+id+extensionFor(asset.mime);await mkdir(join(this.folder(p.id),'assets'),{recursive:true});await writeFile(this.assetPath(p.id,path),bytes);registered[id]={...asset,path,bytes:bytes.length,sha256:digest(bytes)};delete registered[id].url;
  }
  p.assets=registered;await this.save(p);return p;
 }
 async addDataImage(input,{url,name='裁切题图'}){
  if(typeof url!=='string'||!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=\r\n]+$/.test(url))throw Error('请提供 PNG、JPEG 或 WebP 图片');
  const mime=url.slice(5,url.indexOf(';')),bytes=Buffer.from(url.split(',')[1],'base64');if(bytes.length>20*1024*1024)throw Error('裁切题图超过20 MB');
  const p=validatePaper(input);const asset=await this.writeAsset(p,bytes,{name,extension:extensionFor(mime),mime,kind:'crop'});return {...asset,url};
 }
}
