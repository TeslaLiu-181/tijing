import {mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join,resolve,extname,basename,sep} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {transaction} from './database.mjs';
import {requireCondition,HTTPError} from './errors.mjs';
const sourceMime={'.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.doc':'application/msword',
 '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.tif':'image/tiff','.tiff':'image/tiff'};
const TTL=24*60*60*1000,MAX_CACHE=64*1024*1024;
export class AISources {
 constructor(db,{dataDir,resources,mutate=(_user,operation)=>operation()}){
  this.db=db;this.resources=resources;this.mutate=mutate;this.root=resolve(dataDir,'ai-sources');
  db.exec(`CREATE TABLE IF NOT EXISTS ai_sources(
   id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   kind TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,path TEXT NOT NULL,bytes INTEGER NOT NULL,source_name TEXT NOT NULL,page INTEGER,
   sha256 TEXT NOT NULL,created_at TEXT NOT NULL,expires_at INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS ai_sources_user ON ai_sources(user_id);
   CREATE INDEX IF NOT EXISTS ai_sources_job ON ai_sources(job_id);`);
 }
 folder(jobId){
  requireCondition(/^ai-[a-f0-9-]{36}$/.test(jobId),400,'AI 源资料编号不正确');
  const folder=resolve(this.root,jobId);requireCondition(folder.startsWith(this.root+sep),400,'AI 源目录不正确');return folder;
 }
 async init(){
  await mkdir(this.root,{recursive:true,mode:0o700});await this.sweep();
  const jobs=new Set(this.db.prepare('SELECT DISTINCT job_id FROM ai_sources').all().map(r=>r.job_id));
  for(const entry of await readdir(this.root,{withFileTypes:true}))if(entry.isDirectory()&&/^ai-[a-f0-9-]{36}$/.test(entry.name)&&!jobs.has(entry.name))
   await rm(this.folder(entry.name),{recursive:true,force:true});
  this.timer=setInterval(()=>this.sweep().catch(()=>{}),60000);this.timer.unref();return this;
 }
 used(userId){return this.db.prepare('SELECT coalesce(sum(bytes),0) n FROM ai_sources WHERE user_id=?').get(userId).n;}
 rows(user,jobId){return this.db.prepare('SELECT * FROM ai_sources WHERE job_id=? AND user_id=? AND expires_at>? ORDER BY kind,page,id').all(jobId,user.id,Date.now());}
 list(user,jobId){return {sources:this.rows(user,jobId).map(r=>({id:r.id,kind:r.kind,name:r.name,mime:r.mime,bytes:r.bytes,sourceName:r.source_name,page:r.page,
  url:'/api/ai/jobs/'+jobId+'/sources/'+r.id,expiresAt:r.expires_at}))};}
 asset(user,jobId,id){
  const row=this.db.prepare('SELECT * FROM ai_sources WHERE id=? AND job_id=? AND user_id=? AND expires_at>?').get(id,jobId,user.id,Date.now());
  requireCondition(row,404,'AI 原页不存在、已过期或无权访问');
  const path=resolve(this.folder(jobId),row.path);requireCondition(path.startsWith(this.folder(jobId)+sep),400,'AI 源文件路径不正确');
  return {path,metadata:{id:row.id,name:row.name,mime:row.mime,bytes:row.bytes,kind:row.kind,page:row.page,sourceName:row.source_name,sha256:row.sha256}};
 }
 async capture(user,jobId,inputs,documents){
  const items=[];
  for(const input of inputs||[]){
   const name=basename(String(input.filename).replaceAll('\\','/')).replace(/[\x00-\x1f]/g,'').slice(-160);let mime=sourceMime[extname(name).toLowerCase()];
   requireCondition(mime,400,'AI 原文件类型不正确');
   const data=Buffer.from(input.data,'base64');
   if(mime.startsWith('image/')) {
    const info=await sharp(data,{limitInputPixels:20000000,animated:false}).metadata();
    mime=({png:'image/png',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',tiff:'image/tiff'})[info.format];
    requireCondition(mime,400,'原始图片格式不支持');
   }
   items.push({kind:'original',name,mime,sourceName:name,page:null,data});
  }
  for(const image of documents.images||[]){
   requireCondition(image.url.startsWith('data:image/png;base64,'),400,'处理页图类型不正确');
   items.push({kind:image.page?'page':'image',name:image.name,mime:'image/png',sourceName:image.source,page:image.page||null,data:Buffer.from(image.url.slice('data:image/png;base64,'.length),'base64')});
  }
  if(!items.length)return {sources:[]};
  const bytes=items.reduce((n,i)=>n+i.data.length,0);requireCondition(bytes<=MAX_CACHE,413,'本次原文件与处理页图超过 64 MB，请拆分材料');
  // Resources.usedBytes includes this table in the integrated server. Pure unit
  // fixtures can still run before that integration by taking the larger total.
  const resourceBytes=this.resources.usedBytes(user.id);
  requireCondition(resourceBytes+bytes<=this.resources.quotaBytes,413,'个人空间容量不足，请清理旧资源或 AI 原页缓存');
  const folder=this.folder(jobId),written=[],expiresAt=Date.now()+TTL;await mkdir(folder,{recursive:true,mode:0o700});
  try{
   for(const item of items){
    const id='ai-source-'+randomUUID(),extension=item.mime==='image/png'?'.png':extname(item.name).toLowerCase(),path=id+extension;
    await writeFile(join(folder,path),item.data,{mode:0o600,flag:'wx'});written.push(join(folder,path));
    item.record={id,jobId,userId:user.id,path,kind:item.kind,name:item.name,mime:item.mime,bytes:item.data.length,sourceName:item.sourceName,page:item.page,
     sha256:createHash('sha256').update(item.data).digest('hex'),createdAt:new Date().toISOString(),expiresAt};
   }
   const stmt=this.db.prepare('INSERT INTO ai_sources(id,job_id,user_id,kind,name,mime,path,bytes,source_name,page,sha256,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
   transaction(this.db,()=>{requireCondition(this.resources.usedBytes(user.id)+bytes<=this.resources.quotaBytes,413,'写入前个人空间容量已变化，请清理后重试');for(const item of items){const r=item.record;stmt.run(r.id,jobId,user.id,r.kind,r.name,r.mime,r.path,r.bytes,r.sourceName,r.page,r.sha256,r.createdAt,r.expiresAt);}});
   return this.list(user,jobId);
  }catch(error){
   this.db.prepare('DELETE FROM ai_sources WHERE job_id=? AND user_id=?').run(jobId,user.id);
   for(const path of written)await rm(path,{force:true});throw error;
  }finally{for(const item of items)item.data=null;}
 }
 async remove(jobId){
  await rm(this.folder(jobId),{recursive:true,force:true});
  this.db.prepare('DELETE FROM ai_sources WHERE job_id=?').run(jobId);
 }
 sweep(){
  if(this.sweeping)return this.sweeping;
  this.sweeping=(async()=>{
  const expired=this.db.prepare('SELECT job_id,user_id FROM ai_sources GROUP BY job_id,user_id HAVING max(expires_at)<=?').all(Date.now());
  for(const r of expired)await this.mutate({id:r.user_id},async()=>{
   const deadline=this.db.prepare('SELECT max(expires_at) deadline FROM ai_sources WHERE job_id=? AND user_id=?').get(r.job_id,r.user_id)?.deadline;
   if(deadline!==null&&deadline!==undefined&&deadline<=Date.now())await this.remove(r.job_id);
  });
  })().finally(()=>{this.sweeping=null;});return this.sweeping;
 }
 async cleanupTransferred(jobId){await rm(this.folder(jobId),{recursive:true,force:true});}
 async close(){clearInterval(this.timer);await this.sweeping;}
}
