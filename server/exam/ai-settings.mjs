import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ModelProvider,loadModelConfiguration} from './model-provider.mjs';
import {requireCondition,HTTPError} from './errors.mjs';
import {validateModelEndpoint} from './model-network.mjs';
import {getSetting,setSetting} from './database.mjs';
import {Groups} from './groups.mjs';
const safeString=(value,max,label)=>{requireCondition(typeof value==='string'&&value.trim().length<=max,400,label+'不正确');return value.trim();};
const publicConfig=c=>({configured:!!c.apiKey,baseURL:c.baseURL,model:c.model,visionModel:c.visionModel,jsonMode:(c.jsonMode??c.jsonFormat)!==false});

export class AISettings {
 constructor(db,{dataDir,env=process.env,validateEndpoint=validateModelEndpoint,providerFactory=config=>new ModelProvider(config)}={}){
  this.db=db;this.root=join(dataDir,'ai-config');this.env=env;this.groups=new Groups(db);this.probes=new Map();this.writes=new Map();this.validateEndpoint=validateEndpoint;this.providerFactory=providerFactory;
 }
 async init(){
  await mkdir(this.root,{recursive:true,mode:0o700});this.defaults=await loadModelConfiguration(this.env);
  this.db.exec('CREATE TABLE IF NOT EXISTS ai_config_probe_usage(user_id TEXT NOT NULL,day TEXT NOT NULL,calls INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day))');
  const owner=this.groups.row(this.groups.legacyId())?.owner_id;
  if(owner&&!getSetting(this.db,'ai_teacher_configs_migrated')){
   const target=this.teachingFile(owner);
   // The previous site-wide secret belongs only to the original teacher.
   // Retain shared.json for rollback; new teachers never inherit its key.
   if(!await this.read(target))await this.write(target,{...this.defaults,...await this.read(join(this.root,'shared.json'))});
   setSetting(this.db,'ai_teacher_configs_migrated','1');
  }
  return this;
 }
 empty(){return {...this.defaults,apiKey:'',reviewModelExplicit:false};}
 teachingFile(ownerId,groupId=''){
  requireCondition(/^user-[a-f0-9-]{36}$/.test(ownerId)&&(!groupId||/^group-[a-f0-9-]{36}$/.test(groupId)),403,'连接归属不正确');
  return join(this.root,groupId?'group-'+groupId+'.json':'teacher-'+ownerId+'.json');
 }
 filename(user,scope,groupId=''){
  requireCondition(scope==='shared'||scope==='personal',400,'配置范围不正确');requireCondition(/^user-[a-f0-9-]{36}$/.test(user.id),403,'账号标识不正确');
  requireCondition(typeof groupId==='string'&&(!groupId||/^group-[a-f0-9-]{36}$/.test(groupId)),400,'班级或小组编号不正确');
  if(scope==='shared'){requireCondition(user.role==='teacher',403,'只有教师可以管理教学API');if(groupId)this.groups.owned(user,groupId);return this.teachingFile(user.id,groupId);}
  return join(this.root,user.id+'.json');
 }
 async read(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
 async write(target,value){const temporary=target+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(temporary,target);}finally{await rm(temporary,{force:true});}}
 async personal(user){return await this.read(this.filename(user,'personal'))||{...publicConfig(this.empty()),apiKey:'',usePersonal:false,selectedGroupId:''};}
 teachingGroups(user){
  return this.db.prepare(`SELECT g.id,g.owner_id AS ownerId,g.name,g.kind,u.display_name AS ownerName FROM learning_groups g JOIN users u ON u.id=g.owner_id
   WHERE g.archived=0 AND u.disabled=0 AND (g.owner_id=? OR (g.kind='class' AND g.id=(SELECT class_id FROM users WHERE id=?))
   OR EXISTS(SELECT 1 FROM group_members m WHERE m.group_id=g.id AND m.user_id=?)) ORDER BY g.kind,g.created_at,g.id`).all(user.id,user.id,user.id);
 }
 async teaching(ownerId,groupId=''){
  const teacher=await this.read(this.teachingFile(ownerId)),override=groupId?await this.read(this.teachingFile(ownerId,groupId)):null;
  return {...this.empty(),...teacher,...override,apiOwnerId:ownerId,inherited:!!groupId&&!override};
 }
 async selectedTeaching(user,personal){
  const groups=this.teachingGroups(user),requested=personal.selectedGroupId||'';
  const group=requested?groups.find(item=>item.id===requested):groups.find(item=>item.id===user.classId)||groups.find(item=>item.id===this.groups.legacyId())||groups[0];
  if(requested&&!group)return {...this.empty(),unavailable:true,groupId:requested,apiOwnerId:null};
  if(user.role==='teacher'&&!requested)return {...await this.teaching(user.id),groupId:'',ownerName:user.displayName};
  return group?{...await this.teaching(group.ownerId,group.id),groupId:group.id,ownerName:group.ownerName}:{...this.empty(),groupId:'',apiOwnerId:null};
 }
 async get(user,{groupId=''}={}){
  const personal=await this.personal(user),selected=await this.selectedTeaching(user,personal),canManageShared=user.role==='teacher';
  if(groupId&&canManageShared)this.groups.owned(user,groupId);
  const editing=canManageShared?await this.teaching(user.id,groupId):selected;
  const choices=this.teachingGroups(user).map(group=>({id:group.id,name:group.name,ownerName:group.ownerName,kind:group.kind,writable:group.ownerId===user.id}));
  if(canManageShared)choices.unshift({id:'',name:'我的默认教学连接',ownerName:user.displayName,kind:'default',writable:true});
  return {shared:publicConfig(editing),personal:{...publicConfig(personal),usePersonal:!!personal.usePersonal},canManageShared,
   activeSource:personal.usePersonal?'personal':'shared',activeGroupId:selected.groupId,activeTeacher:selected.ownerName||'',unavailable:!!selected.unavailable,
   teachingGroups:choices,activeTeaching:publicConfig(selected),editingGroupId:groupId,sharedInherited:!!editing.inherited};
 }
 async configurationFor(user){const personal=await this.personal(user);return personal.usePersonal?{...this.empty(),...personal,apiSource:'personal',apiOwnerId:user.id}:{...await this.selectedTeaching(user,personal),apiSource:'shared'};}
 async candidate(user,input){
  requireCondition(input&&typeof input==='object'&&!Array.isArray(input),400,'API配置不正确');
  const scope=input.scope||'personal',groupId=input.groupId||'';this.filename(user,scope,groupId);
  const old=scope==='shared'?await this.teaching(user.id,groupId):await this.personal(user);
  const baseURL=safeString(input.baseURL??old.baseURL,500,'API地址');let url;
  try{url=new URL(baseURL);}catch{throw new HTTPError(400,'API地址格式不正确','ai_endpoint_invalid');}
  requireCondition(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash,400,'API地址需为无账户信息的HTTPS公网地址');
  const model=safeString(input.model??old.model,100,'文本模型'),visionModel=safeString(input.visionModel??old.visionModel,100,'视觉模型');
  requireCondition(/^[a-zA-Z0-9._:/-]{1,100}$/.test(model)&&(!visionModel||/^[a-zA-Z0-9._:/-]{1,100}$/.test(visionModel)),400,'请填写有效模型编号');
  for(const key of ['usePersonal','clearKey','jsonMode','inherit'])if(input[key]!==undefined)requireCondition(typeof input[key]==='boolean',400,'配置选项不正确');
  if(input.selectedGroupId!==undefined){
   requireCondition(scope==='personal'&&typeof input.selectedGroupId==='string',400,'请选择教学连接');
   requireCondition((user.role==='teacher'&&input.selectedGroupId==='')||this.teachingGroups(user).some(group=>group.id===input.selectedGroupId),403,'不属于这个班级或小组，无法使用其API');
  }
  const supplied=input.apiKey===undefined?'':safeString(input.apiKey,4096,'API Key');
  requireCondition(!supplied||supplied.length>=8&&!/[\r\n]/.test(supplied),400,'API Key格式不正确');
  if(new URL(old.baseURL).origin!==url.origin&&old.apiKey&&!supplied&&!input.clearKey)throw new HTTPError(400,'更换API服务需填写新的密钥，避免把原密钥发送给其他服务','ai_endpoint_key_change');
  const config={baseURL:baseURL.replace(/\/$/,''),model,visionModel,apiKey:input.clearKey?'':supplied||old.apiKey||'',jsonMode:input.jsonMode??old.jsonMode??old.jsonFormat??true,jsonFormat:input.jsonMode??old.jsonMode??old.jsonFormat??true};
  if(scope==='personal'){config.usePersonal=input.clearKey?false:input.usePersonal??old.usePersonal??false;config.selectedGroupId=input.selectedGroupId??old.selectedGroupId??'';requireCondition(!config.usePersonal||config.apiKey,400,'先保存个人API Key再启用个人连接');}
  const onlySelection=scope==='personal'&&input.usePersonal===false&&Object.keys(input).every(key=>['scope','usePersonal','selectedGroupId'].includes(key));
  const onlyClear=input.clearKey===true&&Object.keys(input).every(key=>['scope','clearKey','groupId'].includes(key));
  const inherit=input.inherit===true;requireCondition(!inherit||(scope==='shared'&&!!groupId),400,'只有班级或小组连接可以恢复继承');
  if(!onlySelection&&!onlyClear&&!inherit)await this.validateEndpoint(config.baseURL);
  return {scope,groupId,config,inherit};
 }
 async save(user,input){
  const key=this.filename(user,input?.scope||'personal',input?.groupId||''),previous=this.writes.get(key)||Promise.resolve();
  const pending=previous.catch(()=>{}).then(()=>this.persist(user,input));this.writes.set(key,pending);
  try{return await pending;}finally{if(this.writes.get(key)===pending)this.writes.delete(key);}
 }
 async persist(user,input){
  const {scope,groupId,config,inherit}=await this.candidate(user,input);
  const active=scope==='shared'?this.db.prepare("SELECT 1 FROM ai_jobs WHERE status IN ('queued','running') AND api_source='shared' AND (api_owner_id=? OR api_owner_id='')").get(user.id):this.db.prepare("SELECT 1 FROM ai_jobs WHERE user_id=? AND status IN ('queued','running')").get(user.id);
  requireCondition(!active,409,'相关AI请求仍在运行，请完成或取消后再修改连接');
  const target=this.filename(user,scope,groupId);if(inherit)await rm(target,{force:true});else await this.write(target,config);
  return this.get(user,{groupId});
 }
 async probe(user,input){
  requireCondition(input&&typeof input==='object'&&!Array.isArray(input),400,'API配置不正确');
  if(input.vision!==undefined)requireCondition(typeof input.vision==='boolean',400,'视觉测试选项不正确');
  const {scope,config}=await this.candidate(user,input),last=this.probes.get(user.id)||[];const recent=last.filter(time=>Date.now()-time<60000);
  requireCondition(recent.length<3,429,'连接测试次数较多，请一分钟后再试');this.probes.set(user.id,[...recent,Date.now()]);
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const used=this.db.prepare('SELECT calls FROM ai_config_probe_usage WHERE user_id=? AND day=?').get(user.id,day)?.calls||0;
  requireCondition(used<20,429,'今日连接测试已达20次上限，请明天再试');
  this.db.prepare('INSERT INTO ai_config_probe_usage(user_id,day,calls) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET calls=calls+1').run(user.id,day);
  const configValue={...this.empty(),...config,apiOwnerId:user.id},options={vision:input.vision===true,apiSource:scope};
  const result=this.probeExecutor?await this.probeExecutor(user,configValue,options):await this.providerFactory(configValue).probe(options);return {...result,connected:result.ok===true};
 }
}
