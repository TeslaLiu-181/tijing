import {randomUUID} from 'node:crypto';
import {readFile,mkdir,readdir,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {AISources} from './ai-sources.mjs';
import {trustedTutoring} from './ai-concepts.mjs';
import {paperContentFingerprint} from './ai-content.mjs';
import {reviewTutoring} from './ai-review.mjs';
import {preserveValidationChecks,sceneValidationMessage} from './ai-validation.mjs';
import {ModelProvider,loadModelConfiguration} from './model-provider.mjs';
import {readAIDocuments} from './ai-documents.mjs';
import {parseAIResult,auditScene,sceneHash} from './ai-harness.mjs';
import {attachGrounding} from './ai-grounding.mjs';
import {completeWithTools} from './ai-agent-tools.mjs';
import {phaseActivity,toolActivity,publicActivity} from './ai-run-events.mjs';
import {recognizeHandwrittenFormula,FORMULA_LIMITS} from './ai-formula.mjs';
import {sceneChanges} from './ai-scene-changes.mjs';
import {modes,systemPrompt,contextText} from './ai-prompts.mjs';
import {clone,newScene,newQuestion,newPaper,uid,now,validatePaper,imageMime} from '../../src/exam/model.mjs';
import {transaction} from './database.mjs';
import {HTTPError,requireCondition} from './errors.mjs';
const extnameSafe=name=>String(name).split('.').at(-1).toLowerCase();
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const terminal=new Set(['completed','failed','cancelled','interrupted','applied']);
const protectedResult=(row,user)=>{
 const result=row.result_json?JSON.parse(row.result_json):null;if(!result)return null;
 const policy=JSON.parse(row.context_json||'{}').aiPolicy,hintsOnly=result.review?.hintsOnly||['hints','hints_only'].includes(policy);
 if(user?.role==='student'&&hintsOnly){delete result.draftAudit;delete result.nativeTools;delete result.sourcePreview;result.givens=[];result.assumptions=[];result.followUps=[];if(result.review)result.review.issues=['当前任务仅允许下一步提示，完整初稿不对学生展示。'];
  if(result.sourceHarness)result.sourceHarness={supported:result.sourceHarness.supported,schemaValid:result.sourceHarness.schemaValid,passed:result.sourceHarness.passed,relationshipsValid:result.sourceHarness.relationshipsValid,limitations:['已核对原生模型结构；仅提示模式不展示完整推导读数。']};}
 return result;
};
const publicContext=row=>{const value=JSON.parse(row.context_json||'{}');delete value.contentFingerprint;return value;};
const visibleActivity=(row,user)=>{const events=publicActivity(row),policy=JSON.parse(row.context_json||'{}').aiPolicy;return user?.role==='student'&&['hints','hints_only'].includes(policy)?events.map(({input,output,...event})=>event):events;};
const publicJob=(row,user)=>({id:row.id,mode:row.mode,apiSource:row.api_source||'shared',status:row.status,phase:row.phase,prompt:row.prompt,
 resourceId:row.resource_id,questionId:row.question_id,sceneId:row.scene_id,version:row.resource_version,
 createdAt:row.created_at,updatedAt:row.updated_at,model:row.model||null,usage:JSON.parse(row.usage_json||'{}'),
 result:protectedResult(row,user),error:row.error_json?JSON.parse(row.error_json):null,
 ...publicContext(row),activity:visibleActivity(row,user),attachments:JSON.parse(row.attachments_json||'[]'),appliedResourceId:row.applied_resource_id||null,appliedSceneId:row.applied_scene_id||null});
export class AIService {
 constructor(db,{dataDir,resources,provider,configuration,configurationFor,providerFactory,reviewEnabled=true,mutate,resolveContext,validateContextPolicy,readContextAttachment,env=process.env}={}) {
  this.db=db;this.resources=resources;this.dataDir=resolve(dataDir);this.provider=provider;this.configuration=configuration;
  this.reviewEnabled=reviewEnabled;this.providerFactory=providerFactory||((c)=>new ModelProvider(c));this.configurationFor=configurationFor;this.env=env;this.readContextAttachment=readContextAttachment;this.resolveContext=resolveContext;this.validateContextPolicy=validateContextPolicy;this.mutationQueues=new Map();this.mutate=mutate||((user,operation)=>{const previous=this.mutationQueues.get(user.id)||Promise.resolve();const next=previous.catch(()=>{}).then(operation);this.mutationQueues.set(user.id,next);next.finally(()=>{if(this.mutationQueues.get(user.id)===next)this.mutationQueues.delete(user.id);}).catch(()=>{});return next;});this.queue=[];this.running=new Map();this.tasks=new Map();this.probeRunning=new Map();this.probeTasks=new Map();this.closed=false;
  db.exec(`
   CREATE TABLE IF NOT EXISTS ai_jobs (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,status TEXT NOT NULL,phase TEXT NOT NULL,prompt TEXT NOT NULL,
    resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,question_id TEXT,scene_id TEXT,resource_version INTEGER,
    scene_hash TEXT,attachments_json TEXT NOT NULL DEFAULT '[]',result_json TEXT,usage_json TEXT,error_json TEXT,
    model TEXT,day TEXT NOT NULL,reserved_tokens INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
    applied_resource_id TEXT,applied_scene_id TEXT,context_json TEXT NOT NULL DEFAULT '{}',api_source TEXT NOT NULL DEFAULT 'shared',draft_json TEXT,review_json TEXT
   );
   CREATE TABLE IF NOT EXISTS ai_probes(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,day TEXT NOT NULL,api_source TEXT NOT NULL,
    status TEXT NOT NULL,model TEXT NOT NULL,usage_json TEXT,error_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS ai_jobs_user ON ai_jobs(user_id,created_at);
   CREATE INDEX IF NOT EXISTS ai_jobs_quota ON ai_jobs(day,user_id);
   CREATE TABLE IF NOT EXISTS ai_usage (
    day TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calls INTEGER NOT NULL DEFAULT 0,tokens INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,user_id)
   );
  `);
  if(!db.prepare('PRAGMA table_info(ai_jobs)').all().some(c=>c.name==='context_json'))db.exec("ALTER TABLE ai_jobs ADD COLUMN context_json TEXT NOT NULL DEFAULT '{}'");
  if(!db.prepare('PRAGMA table_info(ai_jobs)').all().some(c=>c.name==='api_source'))db.exec("ALTER TABLE ai_jobs ADD COLUMN api_source TEXT NOT NULL DEFAULT 'shared'");
  if(!db.prepare('PRAGMA table_info(ai_jobs)').all().some(c=>c.name==='api_owner_id'))db.exec("ALTER TABLE ai_jobs ADD COLUMN api_owner_id TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE TABLE IF NOT EXISTS ai_usage_sources(
   day TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,api_source TEXT NOT NULL,
   calls INTEGER NOT NULL DEFAULT 0,tokens INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,user_id,api_source));
   INSERT OR IGNORE INTO ai_usage_sources(day,user_id,api_source,calls,tokens) SELECT day,user_id,'shared',calls,tokens FROM ai_usage;
   INSERT OR IGNORE INTO ai_usage_sources(day,user_id,api_source,calls,tokens)
    SELECT day,user_id,api_source,count(*),sum(reserved_tokens) FROM ai_jobs GROUP BY day,user_id,api_source;`);
  for(const column of ['draft_json','review_json'])if(!db.prepare('PRAGMA table_info(ai_jobs)').all().some(c=>c.name===column))db.exec('ALTER TABLE ai_jobs ADD COLUMN '+column+' TEXT');
  if(!db.prepare('PRAGMA table_info(ai_jobs)').all().some(c=>c.name==='events_json'))db.exec("ALTER TABLE ai_jobs ADD COLUMN events_json TEXT NOT NULL DEFAULT '[]'");
  // Provider requests cannot be resumed after restart. Preserve evidence and
  // require an explicit resend; never silently repeat a billable request.
  db.prepare("UPDATE ai_jobs SET status='interrupted',phase='服务重启，未自动重试',error_json=?,updated_at=? WHERE status IN ('queued','running')")
   .run(JSON.stringify({code:'ai_interrupted',message:'服务重启中断了请求，请自行重新发送。不会自动重试。'}),now());
 }
 async init() {
  this.configuration??=await loadModelConfiguration(this.env);
  this.provider??=new ModelProvider(this.configuration);
  this.documentRoot=join(this.dataDir,'ai-staging');await mkdir(this.documentRoot,{recursive:true,mode:0o700});
  // These directories only hold disposable input conversions from this
  // process. A crash can leave them behind; no committed resource lives here.
  for(const entry of await readdir(this.documentRoot,{withFileTypes:true})) {
   if(!entry.isDirectory()||!/^tijing-ai-[A-Za-z0-9]+$/.test(entry.name))continue;
   const target=resolve(this.documentRoot,entry.name);
   requireCondition(target.startsWith(resolve(this.documentRoot)+sep),500,'AI 临时目录不正确');
   await rm(target,{recursive:true,force:true});
  }
  this.sourceStore=await new AISources(this.db,{dataDir:this.dataDir,resources:this.resources,mutate:this.mutate}).init();
  return this;
 }
 async reloadConfiguration(configuration) {
  requireCondition(!this.closed,503,'AI 服务正在关闭');
  requireCondition(this.running.size===0&&this.queue.length===0,409,'请等当前 AI 任务完成或取消后再切换接口','ai_configuration_busy');
  const next=configuration||await loadModelConfiguration(this.env);
  // Endpoint DNS is validated by the settings probe and again on each request.
  requireCondition(next&&typeof next.apiKey==='string'&&typeof next.baseURL==='string'&&typeof next.model==='string',400,'AI 配置不完整');
  this.configuration={...next};this.provider=new ModelProvider(this.configuration);
  return this.provider.describe();
 }
 async probe(user,config,{vision=false,apiSource='personal'}={}) {
  requireCondition(!this.closed,503,'AI 服务正在关闭');
  requireCondition(['personal','shared'].includes(apiSource),400,'API 来源不正确');
  requireCondition(apiSource!=='shared'||user.role==='teacher',403,'只有教师可以测试统一连接');
  requireCondition(typeof vision==='boolean',400,'视觉测试选项不正确');
  const c={...this.configuration,...config};
  requireCondition(c.apiKey,400,'请先填写 API Key');
  requireCondition(!this.probeRunning.has(user.id)&&!this.db.prepare("SELECT id FROM ai_jobs WHERE user_id=? AND status IN ('queued','running')").get(user.id),409,'请先完成当前 AI 请求或连接测试');
  requireCondition(this.running.size+this.probeRunning.size<c.parallel&&this.queue.length===0,429,'AI 服务正在处理其他请求，请稍后测试');
  const usage=this.usage(user,c,apiSource),reserved=vision?2304:1280;
  requireCondition(usage.calls<usage.callLimit,429,'今日 AI 请求次数已达上限','ai_daily_quota');
  requireCondition(apiSource==='personal'||usage.siteCalls<c.dailyTotal,429,'全站今日 AI 请求次数已达上限','ai_daily_quota');
  requireCondition(usage.reservedTokens+reserved<=usage.tokenLimit,429,'今日 AI 用量已达上限','ai_token_quota');
  const total=this.db.prepare("SELECT coalesce(sum(tokens),0) n FROM ai_usage_sources WHERE day=? AND api_source='shared'").get(day()).n;
  requireCondition(apiSource==='personal'||total+reserved<=usage.siteTokenLimit,429,'全站今日 AI 用量已达上限','ai_token_quota');
  const id='probe-'+randomUUID(),stamp=now(),probeDay=day(),controller=new AbortController();
  transaction(this.db,()=>{
   this.db.prepare("INSERT INTO ai_probes(id,user_id,day,api_source,status,model,created_at,updated_at) VALUES(?,?,?,?,'running',?,?,?)").run(id,user.id,probeDay,apiSource,vision?(c.visionModel||c.model):c.model,stamp,stamp);
   this.db.prepare('INSERT INTO ai_usage_sources(day,user_id,api_source,calls,tokens) VALUES(?,?,?,1,?) ON CONFLICT(day,user_id,api_source) DO UPDATE SET calls=calls+1,tokens=tokens+excluded.tokens')
    .run(probeDay,user.id,apiSource,reserved);
  });
  this.probeRunning.set(user.id,controller);
  const task=(async()=>{
   try{
    const result=await this.providerFactory(c).probe({vision,signal:controller.signal});
    const actual=Number.isSafeInteger(result.usage?.totalTokens)&&result.usage.totalTokens>0?result.usage.totalTokens:reserved;
    this.db.prepare('UPDATE ai_usage_sources SET tokens=max(0,tokens+?) WHERE day=? AND user_id=? AND api_source=?').run(actual-reserved,probeDay,user.id,apiSource);
    this.db.prepare("UPDATE ai_probes SET status='completed',usage_json=?,updated_at=? WHERE id=?").run(JSON.stringify(result.usage||{}),now(),id);
    return {...result,apiSource,probeId:id};
   }catch(error){
    const unsent=new Set(['ai_endpoint_invalid','ai_endpoint_private','ai_endpoint_dns','ai_vision_unconfigured','ai_unconfigured']);
    if(unsent.has(error.code))this.db.prepare('UPDATE ai_usage_sources SET tokens=max(0,tokens-?) WHERE day=? AND user_id=? AND api_source=?').run(reserved,probeDay,user.id,apiSource);
    this.db.prepare("UPDATE ai_probes SET status=?,error_code=?,updated_at=? WHERE id=?")
     .run(controller.signal.aborted?'interrupted':'failed',error instanceof HTTPError?error.code:'ai_probe_failed',now(),id);
    if(error instanceof HTTPError)throw error;
    throw new HTTPError(502,'接口测试未完成，请稍后重试','ai_probe_failed');
   }finally{this.probeRunning.delete(user.id);this.probeTasks.delete(id);this.pump();}
  })();
  this.probeTasks.set(id,task);return task;
 }
 usage(user,configuration=this.configuration,apiSource='shared',forDay=day()) {
  const d=forDay,rows=this.db.prepare('SELECT coalesce(sum(calls),0) calls,coalesce(sum(tokens),0) reserved FROM ai_usage_sources WHERE day=? AND user_id=?').get(d,user.id),
   global=this.db.prepare("SELECT coalesce(sum(calls),0) calls,coalesce(sum(tokens),0) reserved FROM ai_usage_sources WHERE day=? AND api_source='shared'").get(d);
  const c=configuration,callLimit=user.role==='teacher'?c.dailyTeacher:c.dailyStudent;
  return {day:d,calls:rows.calls,callLimit,remainingCalls:Math.max(0,callLimit-rows.calls),
   reservedTokens:rows.reserved,tokenLimit:user.role==='teacher'?(c.dailyTokenTeacher||500000):(c.dailyTokenStudent||150000),
   apiSource,siteCalls:global.calls,siteCallLimit:c.dailyTotal,siteTokenLimit:c.dailyTokenTotal||2000000};
 }
 async profileFor(user) {
  if(!this.configurationFor)return {configuration:this.configuration,provider:this.provider,apiSource:'shared'};
  const value=await this.configurationFor(user),configuration={...this.configuration,...(value?.configuration||value||{})};
  const apiSource=value?.apiSource==='personal'?'personal':'shared';delete configuration.apiSource;delete configuration.configuration;
  if(apiSource==='personal'||!configuration.reviewModelExplicit||new URL(configuration.baseURL).origin!==new URL(this.configuration.baseURL).origin)configuration.reviewModel=configuration.model;
  return {configuration,provider:this.providerFactory(configuration),apiSource};
 }
 async config(user) {const profile=await this.profileFor(user);return {...profile.provider.describe(),apiSource:profile.apiSource,modes,
  usage:this.usage(user,profile.configuration,profile.apiSource),notice:'题目、选中场景及上传资料将发送给模型提供商。密钥仅在服务器使用；AI 不替代教师核对。'};}
 row(user,id) {const row=this.db.prepare('SELECT * FROM ai_jobs WHERE id=? AND user_id=?').get(id,user.id);requireCondition(row,404,'AI 请求不存在或无权访问');return row;}
 get(user,id) {return publicJob(this.row(user,id),user);}
 thread(user,id) {
  const items=[],seen=new Set();let row=this.row(user,id);
  while(row&&items.length<32&&!seen.has(row.id)){
   seen.add(row.id);items.unshift(publicJob(row,user));
   const parent=JSON.parse(row.context_json||'{}').uiContext?.followupTo;
   row=parent?this.db.prepare('SELECT * FROM ai_jobs WHERE id=? AND user_id=?').get(parent,user.id):null;
  }
  return {items,truncated:!!row};
 }
 list(user,{limit=30,before}={}) {
  const count=Math.min(50,Math.max(1,Number(limit)||30));
  const rows=before?this.db.prepare('SELECT * FROM ai_jobs WHERE user_id=? AND created_at<? ORDER BY created_at DESC LIMIT ?').all(user.id,String(before),count)
   :this.db.prepare('SELECT * FROM ai_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT ?').all(user.id,count);
  return {items:rows.map(row=>publicJob(row,user)),next:rows.length===count?rows.at(-1).created_at:null,usage:this.usage(user)};
 }
 async start(user,input) {
  requireCondition(!this.closed,503,'AI 服务正在关闭');
  requireCondition(input && modes[input.mode],400,'请选择辅导、场景搭建、题目识别或思路核查');
  requireCondition(input.consent===true,400,'请确认将选中题目及资料发送给模型提供商','ai_consent_required');
  requireCondition(typeof input.prompt==='string',400,'问题必须为文字');
  for(const key of ['resourceId','questionId','sceneId','assignmentId','previousJobId','followupTo'])if(input[key]!==undefined&&input[key]!==null)requireCondition(typeof input[key]==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(input[key]),400,'上下文编号不正确');
  const prompt=String(input.prompt||'').trim();requireCondition(prompt&&prompt.length<=8000,400,'请填写 1–8000 字的问题');
  input={...input};
  const attached=input.resourceId&&this.resources.assignmentContext?await this.resources.assignmentContext(user,input.resourceId):null;
  if(attached?.assignmentId) {
   requireCondition(!input.assignmentId||input.assignmentId===attached.assignmentId,409,'资源属于另一份任务，不能混用任务上下文','ai_assignment_mismatch');
   input.assignmentId=attached.assignmentId;
  }
  if(input.previousJobId||input.followupTo) {
   const previous=this.row(user,input.previousJobId||input.followupTo),prior=JSON.parse(previous.context_json||'{}');
   if(prior.assignmentId) {
    requireCondition(!input.assignmentId||input.assignmentId===prior.assignmentId,409,'上一条答复属于另一份任务，不能混用任务上下文','ai_assignment_mismatch');
    input.assignmentId=prior.assignmentId;
   }
  }
  requireCondition(!this.db.prepare("SELECT id FROM ai_jobs WHERE user_id=? AND status IN ('queued','running')").get(user.id),409,'请先完成或取消当前 AI 请求');
  requireCondition(this.queue.length+this.running.size<6,429,'AI 等待队列已满，请稍后重试');
  let resource=null,paper=null,question=null,record=null,version=null,context=null;
  if(input.assignmentId) {
   requireCondition(typeof this.resolveContext==='function',400,'此版本尚未接入作业 AI 上下文');
   context=await this.resolveContext(user,input);
   requireCondition(context&&context.assignment&&context.assignment.id===input.assignmentId,404,'作业不存在或无权访问');
   paper=context.paper||null;question=context.question||null;record=context.record||null;version=context.version??context.assignment.version??null;
   resource=context.resource||null;
   const policy=context.assignment.aiPolicy;
   requireCondition(!['disabled','off','none'].includes(policy),403,'教师已禁用本任务的 AI 辅助','ai_assignment_policy');
   requireCondition(!['hints','hints_only'].includes(policy)||['tutor','review'].includes(input.mode),403,'本任务只允许分步提示，不允许自动生成场景或完整答案','ai_assignment_policy');
   if(this.validateContextPolicy)await this.validateContextPolicy(user,context.assignment,{mode:input.mode,action:'start'});
  } else if(input.resourceId) {
   requireCondition(['private','shared','workshop'].includes(input.view||'private'),400,'资源查看方式不正确');
   resource=this.resources.readable(user,input.resourceId,{view:input.view||'private'});paper=this.resources.paperFor(user,resource);
   version=resource._view==='private'?resource.version:resource._view==='shared'?resource.published_version:resource.workshop_version;
   if(input.questionId) {question=paper.questions.find(q=>q.id===input.questionId);requireCondition(question,404,'题目不存在或无权访问');}
   if(input.sceneId) {requireCondition(question,400,'请选择场景所在题目');record=question.scenes.find(s=>s.id===input.sceneId);requireCondition(record,404,'场景不存在或无权访问');}
  } else requireCondition(!input.questionId&&!input.sceneId,400,'题目及场景必须属于所选资源');
  requireCondition(!(input.mode==='scene'&&record&&record.kind!=='planar'),400,'当前 AI 生成仅支持原生平面场景；三维和补充模型可答疑或手动探究，不能自动转成平面','ai_spatial_generation_unsupported');
  requireCondition(!question || question.sourceText.length<=80000,413,'当前题干过长，请先拆分题目');
  const attachments=input.attachments||[];
  requireCondition(Array.isArray(attachments)&&attachments.length<=4,400,'每次最多上传 4 个文件');
  requireCondition(attachments.every(a=>a&&typeof a.filename==='string'&&typeof a.data==='string'&&a.data.length<=17*1024*1024),413,'文件内容不正确或超过 12 MB');
  requireCondition(attachments.reduce((n,a)=>n+a.data.length,0)<=34*1024*1024,413,'一次上传总量请小于 24 MB');
  if(input.mode==='formula'){
   requireCondition(attachments.length===1&&/\.png$/i.test(attachments[0].filename),400,'手写识别只接收一张已确认的 PNG 笔迹','ai_formula_input');
   const bytes=Buffer.from(attachments[0].data,'base64');
   requireCondition(bytes.length>=24&&bytes.length<=FORMULA_LIMITS.imageBytes&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.subarray(12,16).toString()==='IHDR',400,'手写PNG无效或超过3MB','ai_formula_input');
   requireCondition(bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(16)*bytes.readUInt32BE(20)<=FORMULA_LIMITS.imagePixels,400,'手写图像超过200万像素，请缩小画布','ai_formula_input');
  }
  const history=[];
  if(input.previousJobId||input.followupTo) {
   const old=this.row(user,input.previousJobId||input.followupTo);
   requireCondition(terminal.has(old.status)&&old.result_json,400,'前一条 AI 请求尚未完成');
   const turns=this.thread(user,old.id).items.slice(-12);let characters=0;
   for(const turn of turns.reverse()){
    const answer=String(turn.result?.answer||'');if(!answer)continue;
    const entry={request:turn.prompt,answer,mode:turn.mode,source:turn.uiContext,verification:turn.result?.verification};
    const size=JSON.stringify(entry).length;if(characters+size>32000&&history.length)break;
    if(size>32000){entry.answer=answer.slice(0,Math.max(2000,32000-turn.prompt.length));entry.truncated=true;}
    history.unshift(entry);characters+=Math.min(size,32000);
   }
  }
  requireCondition(!this.probeRunning.has(user.id),409,'请先完成当前 API 连接测试');
  const profile=await this.profileFor(user),config=profile.configuration;
  requireCondition(!this.closed,503,'AI 服务正在关闭');
  requireCondition(!this.probeRunning.has(user.id),409,'请先完成当前 API 连接测试');
  requireCondition(config.apiKey,503,'AI 尚未配置，请设置自己的 API 或联系教师','ai_unconfigured');
  const reserve=input.mode==='formula'?FORMULA_LIMITS.outputTokens+4096+prompt.length*2:config.maxTokens+(config.reviewMaxTokens||config.maxTokens)+(prompt.length+(question?.sourceText.length||0))*2+20000;
  const usage=this.usage(user,config,profile.apiSource);
  requireCondition(usage.calls<usage.callLimit,429,'今日 AI 请求次数已达上限','ai_daily_quota');
  requireCondition(profile.apiSource==='personal'||usage.siteCalls<config.dailyTotal,429,'全站今日 AI 请求次数已达上限','ai_daily_quota');
  requireCondition(usage.reservedTokens+reserve<=usage.tokenLimit,429,'今日 AI 用量已达上限，请明日再试或缩小资料','ai_token_quota');
  const globalReserved=this.db.prepare("SELECT coalesce(sum(tokens),0) n FROM ai_usage_sources WHERE day=? AND api_source='shared'").get(day()).n;
  requireCondition(profile.apiSource==='personal'||globalReserved+reserve<=usage.siteTokenLimit,429,'全站今日 AI 用量已达上限','ai_token_quota');
  if(context?.assignment&&this.validateContextPolicy)await this.validateContextPolicy(user,context.assignment,{mode:input.mode,action:'start'});
  requireCondition(!this.closed,503,'AI 服务正在关闭');
  requireCondition(!this.probeRunning.has(user.id),409,'请先完成当前 API 连接测试');
  requireCondition(!this.db.prepare("SELECT id FROM ai_jobs WHERE user_id=? AND status IN ('queued','running')").get(user.id),409,'请先完成或取消当前 AI 请求');
  requireCondition(this.queue.length+this.running.size<6,429,'AI 等待队列已满，请稍后重试');
  const id='ai-'+randomUUID(),stamp=now(),names=attachments.map(a=>({name:a.filename.slice(0,160),bytes:Math.floor(a.data.length*.75)}));
  const parentId=input.previousJobId||input.followupTo,priorThread=parentId?this.thread(user,parentId).items:[],priorUI=priorThread.at(-1)?.uiContext;
  transaction(this.db,()=>{
  this.db.prepare(`INSERT INTO ai_jobs(id,user_id,mode,status,phase,prompt,resource_id,question_id,scene_id,resource_version,scene_hash,attachments_json,day,reserved_tokens,created_at,updated_at)
   VALUES(?,?,?,'queued','等待模型空闲',?,?,?,?,?,?,?,?,?,?,?)`).run(id,user.id,input.mode,prompt,resource?.id||null,question?.id||null,record?.id||null,version,
    record?sceneHash(record.snapshot):null,JSON.stringify(names),day(),Math.ceil(reserve),stamp,stamp);
   this.db.prepare('INSERT INTO ai_usage_sources(day,user_id,api_source,calls,tokens) VALUES(?,?,?,1,?) ON CONFLICT(day,user_id,api_source) DO UPDATE SET calls=calls+1,tokens=tokens+excluded.tokens')
    .run(day(),user.id,profile.apiSource,Math.ceil(reserve));
   this.db.prepare('UPDATE ai_jobs SET api_source=?,api_owner_id=? WHERE id=?').run(profile.apiSource,config.apiOwnerId||'',id);
   // Labels and parent links come only from the authorized saved source/own job.
   // Store no new original text here; older jobs legitimately lack these labels.
   const uiContext={resourceTitle:paper?.title||resource?.title||null,questionTitle:question?.title||null,sceneTitle:record?.title||null,
    view:resource?._view||(resource?(resource.owner_id===user.id?'private':'shared'):context?.assignment?'assignment':null),
    followupTo:parentId||null,threadId:priorUI?.threadId||priorThread[0]?.id||id,
    threadTitle:priorUI?.threadTitle||String(priorThread[0]?.prompt||prompt).split('【我的问题】').at(-1).slice(0,100),turn:(priorUI?.turn||priorThread.length)+1};
   const privateContent=resource&&paper?.id===resource.id&&resource.owner_id===user.id&&(!resource._view||resource._view==='private')
    ?paperContentFingerprint(this.resources.paperFor(user,{...resource,_view:'private'})):null;
   this.db.prepare('UPDATE ai_jobs SET context_json=? WHERE id=?').run(JSON.stringify({
    ...(context?{assignmentId:context.assignment.id,assignmentTitle:context.assignment.title||'',aiPolicy:context.assignment.aiPolicy,
      assignmentVersion:context.assignment.version,sourceTitle:question?.title||'AI 作业草稿',sourceText:question?.sourceText||''}:{}),uiContext,...(privateContent?{contentFingerprint:privateContent}:{})}),id);
  });
  const job={id,user:{id:user.id,role:user.role},mode:input.mode,prompt,resource,question:question?clone(question):null,
   record:record?clone(record):null,attachments,history,paper:paper?clone(paper):null,assignment:context?.assignment||null,configuration:{...config},provider:profile.provider,apiSource:profile.apiSource};
  this.queue.push(job);this.pump();
  return this.get(user,id);
 }
 reserveTokens(user,id,tokens,config=this.configuration,apiSource='shared') {
  const row=this.row(user,id),usage=this.usage(user,config,apiSource,row.day),delta=Math.ceil(tokens)-row.reserved_tokens;
  requireCondition(usage.reservedTokens+delta<=usage.tokenLimit,429,'当前资料超过剩余 AI 用量，请缩小题目范围','ai_token_quota');
  const total=this.db.prepare("SELECT coalesce(sum(tokens),0) n FROM ai_usage_sources WHERE day=? AND api_source='shared'").get(row.day).n;
  requireCondition(apiSource==='personal'||total+delta<=usage.siteTokenLimit,429,'全站今日 AI 剩余用量不足','ai_token_quota');
  this.db.prepare('UPDATE ai_usage_sources SET tokens=max(0,tokens+?) WHERE day=? AND user_id=? AND api_source=?').run(delta,row.day,user.id,apiSource);
  this.db.prepare('UPDATE ai_jobs SET reserved_tokens=? WHERE id=?').run(Math.ceil(tokens),id);
 }
 status(id,status,phase,extra={}) {
  const current=this.db.prepare('SELECT status,reserved_tokens,day,user_id,api_source,events_json FROM ai_jobs WHERE id=?').get(id);
  if(!current || terminal.has(current.status))return false;
  if(extra.reserved_tokens!==undefined)this.db.prepare('UPDATE ai_usage_sources SET tokens=max(0,tokens+?) WHERE day=? AND user_id=? AND api_source=?')
   .run(extra.reserved_tokens-current.reserved_tokens,current.day,current.user_id,current.api_source||'shared');
  const stamp=now(),events=phaseActivity(JSON.parse(current.events_json||'[]'),{status,phase,stamp});
  this.db.prepare('UPDATE ai_jobs SET status=?,phase=?,updated_at=?,events_json=? WHERE id=?').run(status,phase,stamp,JSON.stringify(events),id);
  for(const [key,value] of Object.entries(extra)) {
   requireCondition(['result_json','usage_json','error_json','model','reserved_tokens'].includes(key),500,'AI 内部状态字段不正确');
   this.db.prepare('UPDATE ai_jobs SET '+key+'=? WHERE id=?').run(value,id);
  }
  return true;
 }
 activity(id,event) {
  const row=this.db.prepare('SELECT status,events_json FROM ai_jobs WHERE id=?').get(id);if(!row||terminal.has(row.status))return;
  const events=toolActivity(JSON.parse(row.events_json||'[]'),event);
  this.db.prepare('UPDATE ai_jobs SET events_json=?,updated_at=? WHERE id=?').run(JSON.stringify(events),now(),id);
 }
 pump() {
  while(!this.closed && this.running.size+this.probeRunning.size<this.configuration.parallel && this.queue.length) {
   const job=this.queue.shift(),controller=new AbortController();this.running.set(job.id,controller);
   const deadline=setTimeout(()=>{
    if(!terminal.has(this.db.prepare('SELECT status FROM ai_jobs WHERE id=?').get(job.id)?.status)) {
     this.status(job.id,'failed','处理时间超过上限',{error_json:JSON.stringify({code:'ai_job_timeout',message:'AI 处理超过本次任务时间上限，已停止。请缩小资料或问题范围。'})});
     controller.abort();
    }
   },job.configuration.jobTimeoutMs||600000);deadline.unref();
   const task=this.execute(job,controller.signal).catch(()=>{
    if(!this.closed)this.status(job.id,'failed','请求未完成',{error_json:JSON.stringify({code:'ai_failed',message:'AI 处理未完成，请稍后重试'})});
   }).finally(()=>{clearTimeout(deadline);this.running.delete(job.id);this.tasks.delete(job.id);this.pump();});
   this.tasks.set(job.id,task);
  }
 }
 async validateExecutionPolicy(job,signal) {
  requireCondition(!this.closed&&!signal?.aborted,499,'此次 AI 请求已停止','ai_cancelled');
  if(job.assignment&&this.validateContextPolicy)await this.validateContextPolicy(job.user,job.assignment,{mode:job.mode,action:'execute'});
  requireCondition(!this.closed&&!signal?.aborted,499,'此次 AI 请求已停止','ai_cancelled');
 }
 async execute(job,signal) {
  if(job.mode==='formula')return this.executeFormula(job,signal);
  const {id,user}=job;let calls=[],documents;
  try {
   if(signal.aborted)return;
   await this.validateExecutionPolicy(job,signal);
   this.status(id,'running','读取选中资料');
   documents=await readAIDocuments(job.attachments,{signal,root:this.documentRoot});
   // Only attachments exposed by this authenticated question snapshot are sent.
   // Other questions and private original files never enter the prompt.
   if(job.question) for(const a of job.question.attachments||[]) {
    if(documents.images.length>=16)break;
    const metadata=job.paper?.assets?.[a.id];if(!metadata||!imageMime.test(metadata.mime))continue;
    let data;
    if(job.resource) {
     const asset=this.resources.assetFor(user,job.resource.id,a.id,{view:job.resource._view});data=await readFile(asset.path);
    } else if(job.assignment && this.readContextAttachment) {
     data=await this.readContextAttachment(user,job.assignment,a.id);
     requireCondition(Buffer.isBuffer(data)||data instanceof Uint8Array,400,'作业题图内容格式不正确');
    } else {
     documents.warnings.push('当前作业题图未接入识别，请对照原图补传或由教师配置。');continue;
    }
    const suffix=({'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif'})[metadata.mime]||'.png';
    const parsed=await readAIDocuments([{filename:'当前题图-'+a.id+suffix,data:Buffer.from(data).toString('base64')}],{signal,root:this.documentRoot});
    documents.images.push(...parsed.images);documents.warnings.push(...parsed.warnings);
   }
   this.status(id,'running','保存私有对照原页');
   await this.mutate(user,()=>this.sourceStore.capture(user,id,job.attachments,documents));
   if(signal.aborted){await this.sourceStore.remove(id);return;}
   let nativeEvidence=job.record&&job.record.kind!=='planar'?{supported:false,limitations:['当前选中三维或补充模型；AI原生自动核验仅覆盖平面，文字答疑不构成已验证物理结论。']}:null;
   if(job.record?.kind==='planar') {
    this.status(id,'running','读取原生场景与物理数据');
    try{nativeEvidence=(await auditScene(job.record.snapshot.scene,[],{signal,source:true})).harness;}
    catch(error){nativeEvidence={passed:false,error:error.message};}
   }
   const policyPrompt=job.assignment&&['hints','hints_only'].includes(job.assignment.aiPolicy)?'\n教师任务策略：本任务只允许提示和检查。必须采用逐步提示，不直接给最终完整答案，不提供完整场景或可提交作业。':'';
   const messages=[{role:'system',content:systemPrompt(job.mode)+policyPrompt},{role:'user',content:[
    {type:'text',text:contextText({...job,documents,nativeEvidence})},
    ...documents.images.map(i=>({type:'image_url',image_url:{url:i.url,detail:'original'}}))]}];
   const inputUpper=Buffer.byteLength(systemPrompt(job.mode),'utf8')+Buffer.byteLength(messages[1].content[0].text,'utf8')+documents.images.length*1024+4096;
   this.reserveTokens(user,id,2*inputUpper+job.configuration.maxTokens+(job.configuration.reviewMaxTokens||job.configuration.maxTokens),job.configuration,job.apiSource);
   this.status(id,'running',documents.images.length?'模型识别题图并分析':'模型分析中');
   await this.validateExecutionPolicy(job,signal);
   let response,agentActivities=[];
   if(['tutor','review','scene'].includes(job.mode)){
    const run=await completeWithTools(job.provider,messages,{...job,documents},{signal,
     completeOptions:{images:documents.images.length>0,task:job.mode},onResponse:value=>calls.push(value),onEvent:event=>this.activity(id,event),
     reserve:async conversation=>{await this.validateExecutionPolicy(job,signal);const textBytes=conversation.reduce((sum,message)=>sum+Buffer.byteLength(typeof message.content==='string'?message.content:JSON.stringify((message.content||[]).filter(p=>p.type!=='image_url')),'utf8'),0);this.reserveTokens(user,id,calls.reduce((n,r)=>n+r.usage.totalTokens,0)+textBytes+documents.images.length*1024+job.configuration.maxTokens+(job.configuration.reviewMaxTokens||job.configuration.maxTokens)+4096,job.configuration,job.apiSource);}});
    response=run.response;agentActivities=run.activities;
   }else{response=await job.provider.complete(messages,{images:documents.images.length>0,signal,task:job.mode});calls.push(response);}
   this.db.prepare('UPDATE ai_jobs SET draft_json=?,model=?,usage_json=? WHERE id=?').run(JSON.stringify({model:response.model,usage:response.usage,content:response.content}),response.model,JSON.stringify({...response.usage,calls:calls.length}),id);
   let result=parseAIResult(response.content,job.mode);
   this.db.prepare('UPDATE ai_jobs SET draft_json=?,model=?,usage_json=? WHERE id=?').run(JSON.stringify({model:response.model,usage:response.usage,result}),response.model,JSON.stringify({...response.usage,calls:calls.length}),id);
   result.documentWarnings=[...documents.warnings,...(result.formatWarnings||[])];result.documentSummary=documents.documents.map(d=>({name:d.name,type:d.type,pages:d.pages,textCharacters:d.text.length}));
   if(nativeEvidence)result.sourceHarness=nativeEvidence;
   if(job.mode==='scene' && result.scene && !result.missing.length) {
    this.status(id,'running','原生物理与依赖核验');
    let candidate,repairedScene=false;const harnessAttempts=[],originalChecks=clone(result.checks||[]);
    try{candidate=attachGrounding(await auditScene(result.scene,result.checks||[],{signal}),{sourceText:[job.question?.sourceText||'',job.prompt,...documents.documents.map(d=>d.text)].join('\n'),givens:result.givens,assumptions:result.assumptions});}
    catch(error){candidate={harness:{passed:false,warnings:[error.message],violations:[error.message]}};}
    // At most one repair, with actual native diagnostics. Neither proposal is
    // allowed to overwrite an existing scene or bypass user confirmation.
    harnessAttempts.push({attempt:1,submittedChecks:clone(result.checks||[]),actualChecks:clone(candidate.harness.checks||[]),passed:candidate.harness.passed,warnings:candidate.harness.warnings,violations:candidate.harness.violations,issues:candidate.harness.issues});
    if(!candidate.harness.passed && !signal.aborted) {
     repairedScene=true;
     this.status(id,'running','模型修正原生核验问题');
     const repair=[...messages,{role:'assistant',content:response.content},{role:'user',content:'原生求解器核验未通过。只修正提案实现错误，不能改变题设、假设或偷偷补条件；若条件不足必须转 needs_confirmation。真实工具反馈：'+JSON.stringify(candidate.harness)}];
     this.reserveTokens(user,id,calls.reduce((n,r)=>n+r.usage.totalTokens,0)+inputUpper+Buffer.byteLength(response.content,'utf8')+Buffer.byteLength(JSON.stringify(candidate.harness),'utf8')+job.configuration.maxTokens+4096,job.configuration,job.apiSource);
     await this.validateExecutionPolicy(job,signal);
     response=await job.provider.complete(repair,{images:documents.images.length>0,signal,task:'scene'});calls.push(response);
     result=parseAIResult(response.content,job.mode);result.documentWarnings=[...documents.warnings,...(result.formatWarnings||[])];
     if(result.scene && !result.missing.length) {
      const contract=preserveValidationChecks(originalChecks,result.checks||[]);
      try{candidate=attachGrounding(await auditScene(result.scene,contract.effective,{signal}),{sourceText:[job.question?.sourceText||'',job.prompt,...documents.documents.map(d=>d.text)].join('\n'),givens:result.givens,assumptions:result.assumptions});}
      catch(error){candidate={harness:{passed:false,warnings:[error.message],violations:[error.message]}};}
      candidate.harness.validationScope={originalChecks,repairedChecks:clone(result.checks||[]),...contract};
      if(contract.scopeChanged){candidate.harness.passed=false;candidate.harness.violations.push('模型修正删除或放宽了原始数值检查，不能自动应用');}
      this.db.prepare('UPDATE ai_jobs SET review_json=? WHERE id=?').run(JSON.stringify({stage:'scene-repair',model:response.model,usage:response.usage,result}),id);
     }
    }
    if(harnessAttempts.length&&repairedScene)harnessAttempts.push({attempt:2,submittedChecks:clone(result.checks||[]),actualChecks:clone(candidate.harness.checks||[]),validationScope:candidate.harness.validationScope,passed:candidate.harness.passed,warnings:candidate.harness.warnings,violations:candidate.harness.violations,issues:candidate.harness.issues});
    result.harnessAttempts=harnessAttempts;
    if(result.scene && !result.missing.length)result.candidate=candidate;
    if(result.candidate&&!result.candidate.harness.passed)result.followUps.push('场景尚未通过原生物理核验，须修正后才能创建。');
   }
   if(['tutor','review'].includes(job.mode)&&this.reviewEnabled) {
    await this.validateExecutionPolicy(job,signal);
    this.status(id,'running','独立审校条件、推导与结论');
    const draft=result,firstModel=response.model,firstUsage=calls.reduce((n,r)=>n+r.usage.totalTokens,0);
    const reviewed=await reviewTutoring(job.provider,{draft,job,documents,nativeEvidence:agentActivities.length?{...(nativeEvidence||{}),toolEvidence:agentActivities.map(({name,status,output})=>({name,status,output}))}:nativeEvidence,signal,inputUpper,
     reserve:tokens=>this.reserveTokens(user,id,firstUsage+tokens,job.configuration,job.apiSource)});
    calls.push(reviewed.response);response=reviewed.response;result=reviewed.result;
    this.db.prepare('UPDATE ai_jobs SET review_json=? WHERE id=?').run(JSON.stringify({model:response.model,usage:response.usage,result,review:reviewed.review}),id);
    result.review=reviewed.review;result.draftAudit={model:firstModel,answer:draft.answer,status:draft.status,missing:draft.missing,reviewedAt:now()};
    result.documentWarnings=[...documents.warnings,...(draft.formatWarnings||[]),...(result.formatWarnings||[])];
    result.documentSummary=documents.documents.map(d=>({name:d.name,type:d.type,pages:d.pages,textCharacters:d.text.length}));
    if(nativeEvidence)result.sourceHarness=nativeEvidence;
   }
   if(documents.documents.some(d=>d.requiresConfirmation)) {
    result.status='needs_confirmation';
    for(const document of documents.documents.filter(d=>d.requiresConfirmation))result.missing.push('资料「'+document.name+'」有未完整读取的题图/公式，请对照原稿、补传缺图或拆分材料后再识别：'+document.warnings.filter(w=>/未能|未完整|未被可靠|须另存/.test(w)).join('；'));
   }
   if(job.mode==='scene')result.answer=sceneValidationMessage(result);
   if(result.status==='needs_confirmation')result.followUps=['请对照原稿补充以上缺失条件，完成后继续核对。'];
   delete result.scene;delete result.checks;
   if(agentActivities.length)result.nativeTools=agentActivities.map(({name,title,status,output})=>({name,title,status,output}));
   // Tool readings belong to the scene captured for this request. Retain that
   // exact source for read-only replay instead of seeking a later edited scene.
   if(job.record?.kind==='planar'&&(nativeEvidence||agentActivities.length))result.sourcePreview={kind:'planar',snapshot:clone(job.record.snapshot)};
   result.verification=result.candidate?.harness.passed?'native_scene_checked':result.review?'model_reviewed':nativeEvidence?.supported===false?'source_unsupported':nativeEvidence?'native_context_checked':'model_response_only';
   if(result.status==='needs_confirmation')delete result.candidate;
   if(result.candidate?.snapshot?.scene)result.sceneChanges=sceneChanges(job.record?.kind==='planar'?job.record.snapshot.scene:null,result.candidate.snapshot.scene);
   const usage=calls.reduce((a,r)=>({inputTokens:a.inputTokens+r.usage.inputTokens,outputTokens:a.outputTokens+r.usage.outputTokens,totalTokens:a.totalTokens+r.usage.totalTokens}),{inputTokens:0,outputTokens:0,totalTokens:0});
   const allUsageKnown=calls.every(c=>c.usageKnown!==false),reserved=allUsageKnown&&usage.totalTokens>0?usage.totalTokens:this.db.prepare('SELECT reserved_tokens FROM ai_jobs WHERE id=?').get(id).reserved_tokens;
   if(!signal.aborted)this.status(id,'completed',result.status==='needs_confirmation'?'待你确认条件':'结果已生成',
    {result_json:JSON.stringify(result),usage_json:JSON.stringify({...usage,calls:calls.length,completeBilling:allUsageKnown}),model:response.model,reserved_tokens:reserved});
  } catch(error) {
   if(error.usage)calls.push({usage:error.usage,model:error.model||null,usageKnown:error.usageKnown!==false});
   const knownUsage=calls.reduce((a,r)=>({inputTokens:a.inputTokens+r.usage.inputTokens,outputTokens:a.outputTokens+r.usage.outputTokens,totalTokens:a.totalTokens+r.usage.totalTokens}),{inputTokens:0,outputTokens:0,totalTokens:0});
   if(signal.aborted){if(calls.length)this.db.prepare('UPDATE ai_jobs SET usage_json=? WHERE id=?').run(JSON.stringify({...knownUsage,calls:calls.length}),id);return;}
   if(error.usage)this.db.prepare('UPDATE ai_jobs SET review_json=? WHERE id=?').run(JSON.stringify({error:error.code,model:error.model,usage:error.usage,partialContent:error.partialContent||''}),id);
   const known=error instanceof HTTPError;
   this.status(id,'failed','请求未完成',{usage_json:JSON.stringify({...knownUsage,calls:calls.length}),...(error.usage&&error.usageKnown!==false&&calls.every(c=>c.usageKnown!==false)?{reserved_tokens:knownUsage.totalTokens}:{}),error_json:JSON.stringify({code:known?error.code:'ai_failed',message:known?error.message:'AI 处理失败，请稍后重试'})});
  } finally{job.attachments=null;job.paper=null;job.question=null;job.record=null;job.configuration=null;job.provider=null;documents=null;}
 }
 async executeFormula(job,signal) {
  const {id,user}=job;let response;
  try{
   await this.validateExecutionPolicy(job,signal);this.status(id,'running','读取本次手写笔迹');
   const documents=await readAIDocuments(job.attachments,{signal,root:this.documentRoot});
   requireCondition(documents.images.length===1,400,'请只发送一张手写笔迹','ai_formula_input');
   await this.mutate(user,()=>this.sourceStore.capture(user,id,job.attachments,documents));
   if(signal.aborted){await this.sourceStore.remove(id);return;}
   await this.validateExecutionPolicy(job,signal);this.status(id,'running','识别公式结构与不清楚的符号');
   const recognized=await recognizeHandwrittenFormula(job.provider,{image:documents.images[0],signal,maxTokens:Math.min(FORMULA_LIMITS.outputTokens,job.configuration.maxTokens)});
   response=recognized.response;const result=recognized.result;
   this.db.prepare('UPDATE ai_jobs SET draft_json=?,model=?,usage_json=? WHERE id=?').run(JSON.stringify({model:response.model,result}),response.model,JSON.stringify({...response.usage,calls:1}),id);
   if(!signal.aborted)this.status(id,'completed','请对照笔迹确认公式',{result_json:JSON.stringify(result),usage_json:JSON.stringify({...response.usage,calls:1,completeBilling:response.usageKnown!==false}),model:response.model,...(response.usageKnown!==false?{reserved_tokens:response.usage.totalTokens}:{})});
  }catch(error){
   const usage=error.usage||response?.usage;
   if(signal.aborted){if(usage)this.db.prepare('UPDATE ai_jobs SET usage_json=? WHERE id=?').run(JSON.stringify({...usage,calls:1}),id);return;}
   this.status(id,'failed','手写公式识别未完成',{...(usage?{usage_json:JSON.stringify({...usage,calls:1}),...(error.usageKnown!==false&&response?.usageKnown!==false?{reserved_tokens:usage.totalTokens}:{})}:{}),error_json:JSON.stringify({code:error instanceof HTTPError?error.code:'ai_formula_failed',message:error instanceof HTTPError?error.message:'手写公式识别失败，请重试或直接编辑公式'})});
  }finally{job.attachments=null;job.paper=null;job.question=null;job.record=null;job.configuration=null;job.provider=null;}
 }
 cancel(user,id) {
  const row=this.row(user,id);
  if(!terminal.has(row.status)) {
   this.db.prepare("UPDATE ai_jobs SET status='cancelled',phase='已取消',updated_at=? WHERE id=?").run(now(),id);
   this.running.get(id)?.abort();this.queue=this.queue.filter(j=>j.id!==id);
  }
  return this.get(user,id);
 }
 async remove(user,id) {
  this.cancel(user,id);
  await this.tasks.get(id)?.catch(()=>{});
  await this.mutate(user,async()=>{await this.sourceStore.remove(id);this.db.prepare('DELETE FROM ai_jobs WHERE id=? AND user_id=?').run(id,user.id);});
  return {removed:true};
 }
 sources(user,id){this.row(user,id);return this.sourceStore.list(user,id);}
 sourceAsset(user,id,sourceId){this.row(user,id);return this.sourceStore.asset(user,id,sourceId);}
 async apply(user,id,input) {
  requireCondition(!this.closed,503,'AI 服务正在关闭');
  const row=this.row(user,id),result=row.result_json&&JSON.parse(row.result_json),context=JSON.parse(row.context_json||'{}');
  requireCondition(!context.contentFingerprint||row.resource_id,409,'原资料已删除，不能应用本轮提案，请重新选择资料','version_conflict');
  if(context.assignmentId) {
   requireCondition(typeof this.validateContextPolicy==='function',403,'作业策略验证尚未配置，不能自动应用');
   await this.validateContextPolicy(user,{id:context.assignmentId,title:context.assignmentTitle,aiPolicy:context.aiPolicy,version:context.assignmentVersion},{mode:row.mode,action:'apply'});
   requireCondition(!['disabled','off','none','hints','hints_only'].includes(context.aiPolicy),403,'本任务不允许自动生成并应用场景','ai_assignment_policy');
  }
  if(row.mode==='extract')return this.applyExtract(user,row,result,input);
  requireCondition(row.status==='completed' && result?.candidate?.harness?.passed,400,'该场景尚未通过核验或已经应用');
  requireCondition(!result.missing.length && result.status==='answer',400,'请先确认尚不清楚的题目条件');
  requireCondition(input.confirmGivens===true,400,'请对照原题确认已识别题设','ai_givens_confirmation');
  requireCondition(!result.assumptions.length||input.acceptAssumptions===true,400,'请明确接受列出的演示假设','ai_assumptions_confirmation');
  if(!row.resource_id) {
    return this.mutate(user,async()=>{
    const paper=newPaper(context.assignmentTitle?context.assignmentTitle+' · AI 草稿':'AI 探究 · 待校对'),
     q=newQuestion(context.sourceTitle||String(input.title||'AI 整理题意 · 待校对'),context.sourceText||row.prompt),record=this.makeScene(row,result,input);
    for(const given of result.givens)q.notes.push({kind:'known',text:'模型整理题设（待校对）：'+given});
    for(const assumption of result.assumptions)q.notes.push({kind:'assumption',text:assumption});
    q.scenes.push(record);q.activeSceneId=record.id;q.notes.push({kind:'limitation',text:'AI 场景为个人探究草稿，题设、演示假设与原页须对照校对。'});
    paper.questions.push(q);paper.activeQuestionId=q.id;
    return this.persistWithSources(user,row,paper,[q],null,record.id);
   });
  }
  requireCondition(row.question_id,400,'请在个人资源中选择题目后搭建场景');
  return this.mutate(user,async()=>{
   const current=this.resources.writable(user,row.resource_id,input.version),paper=this.resources.paperFor(user,current),contentProtected=this.validateSourceContent(row,paper,'scene');
   const q=paper.questions.find(q=>q.id===row.question_id);requireCondition(q,409,'题目已删除或更新');
   if(row.scene_id) {
    const original=q.scenes.find(s=>s.id===row.scene_id);requireCondition(original,409,'原场景已删除或更新','version_conflict');
    if(!contentProtected)requireCondition(sceneHash(original.snapshot)===row.scene_hash,409,'当前场景已变化，请重新生成提案','version_conflict');
   }
   const record=this.makeScene(row,result,input);
   q.scenes.push(record);q.activeSceneId=record.id;paper.activeQuestionId=q.id;paper.revision++;paper.updatedAt=now();
   return this.persistWithSources(user,row,paper,[q],current.version,record.id);
  });
 }
 validateSourceContent(row,paper,mode) {
  const fingerprint=JSON.parse(row.context_json||'{}').contentFingerprint;
  if(fingerprint){
   requireCondition(fingerprint.version==='paper-content/1'&&/^[a-f0-9]{64}$/.test(fingerprint.sha256),409,'原内容校验记录不完整，请重新生成提案','version_conflict');
   requireCondition(paperContentFingerprint(paper).sha256===fingerprint.sha256,409,
    mode==='extract'?'识别后资源正文、题图或场景内容已更改，请重新识别或新建资源':'原题正文、题图或场景内容已更改，请重新生成提案','version_conflict');
   return true;
  }
  requireCondition(this.resources.row(row.resource_id)?.version===row.resource_version,409,
   mode==='extract'?'识别后资源已更新，请重新识别或新建资源':'生成后原题已更新，请重新生成场景','version_conflict');
  return false;
 }
 makeScene(row,result,input) {
  const record=newScene(String(input.title||'AI 场景 · 待教师复核').slice(0,140));record.snapshot=clone(result.candidate.snapshot);record.baseline=clone(record.snapshot);
  record.status='draft';record.ai={jobId:row.id,model:row.model,givens:result.givens,assumptions:result.assumptions,createdAt:now(),harnessVersion:result.candidate.harness.version};return record;
 }
 markApplied(id,resourceId,sceneId=null) {
  this.db.prepare("UPDATE ai_jobs SET status='applied',phase='已导入个人草稿',applied_resource_id=?,applied_scene_id=?,updated_at=? WHERE id=?").run(resourceId,sceneId,now(),id);
 }
 async applyExtract(user,row,result,input) {
  requireCondition(row.status==='completed'&&result?.status==='answer'&&!result.missing.length,400,'请先确认未看清的题目条件');
  requireCondition(input.confirmGivens===true,400,'请对照原文确认选中题干','ai_givens_confirmation');
  requireCondition(Array.isArray(result.questions)&&result.questions.length,400,'没有可导入的题目候选');
  requireCondition(Array.isArray(input.questionIndices)&&input.questionIndices.length>0&&input.questionIndices.length<=40
   &&input.questionIndices.every(i=>Number.isInteger(i)&&i>=0&&i<result.questions.length),400,'请选择有效的题目候选');
  const questions=[...new Set(input.questionIndices)].map(i=>newQuestion(result.questions[i].title,result.questions[i].sourceText));
  for(const q of questions)q.notes.push({kind:'limitation',text:'AI 识别题目，原文件与处理页图保留在个人资源；文字与原页锚点仍待校对。'});
  return this.mutate(user,async()=>{
   if(row.resource_id) {
    const current=this.resources.writable(user,row.resource_id,input.version),paper=this.resources.paperFor(user,current);
    this.validateSourceContent(row,paper,'extract');
    if(row.question_id){const original=paper.questions.find(q=>q.id===row.question_id);requireCondition(original,409,'原题已删除或更新','version_conflict');if(row.scene_id)requireCondition(original.scenes.some(s=>s.id===row.scene_id),409,'原场景已删除或更新','version_conflict');}
    paper.questions.push(...questions);paper.activeQuestionId=questions[0].id;paper.revision++;
    return this.persistWithSources(user,row,paper,questions,current.version);
   }
   const paper=newPaper('AI 整理材料 · 待校对');paper.questions=questions;paper.activeQuestionId=questions[0].id;
   return this.persistWithSources(user,row,paper,questions);
  });
 }
 async persistWithSources(user,row,paper,questions,version=null,sceneId=null) {
  requireCondition(this.row(user,row.id).status==='completed',409,'此 AI 提案已经应用或状态已改变','ai_already_applied');
  const cached=this.sourceStore.rows(user,row.id),expected=JSON.parse(row.attachments_json||'[]');
  if(cached.length)this.db.prepare('UPDATE ai_sources SET expires_at=max(expires_at,?) WHERE job_id=? AND user_id=?').run(Date.now()+300000,row.id,user.id);
  requireCondition(!expected.length||cached.length>0,410,'AI 对照原页已过期，请重新上传资料后导入','ai_sources_expired');
  const added=[],originals=new Map(),images=[];
  try {
   for(const source of cached) {
    const reused=Object.values(paper.assets).find(a=>a.sha256===source.sha256&&a.mime===source.mime&&a.kind===source.kind&&(a.page??null)===(source.page??null)&&a.sourceName===source.source_name);
    const existing=reused||await this.resources.writeAsset(paper.id,await readFile(this.sourceStore.asset(user,row.id,source.id).path),
     {id:uid(),name:source.name,mime:source.mime,kind:source.kind});
    const asset={...existing,...(source.page?{page:source.page}:{}),sourceName:source.source_name};
    if(!reused)added.push(asset);
    paper.assets[asset.id]=asset;
    if(source.kind==='original') {
     const record={id:uid(),title:source.source_name,type:source.mime==='application/pdf'?'pdf':source.mime.includes('wordprocessingml')?'docx':source.mime==='application/msword'?'doc':extnameSafe(source.name),
      createdAt:now(),asset,warnings:['AI 识别材料，题目与原页对应关系待校对。'],aiJobId:row.id};
     const pages=cached.filter(i=>i.kind==='page'&&i.source_name===source.source_name).map(i=>i.page);
     if(pages.length)record.pageCount=Math.max(...pages);
     paper.sources.push(record);originals.set(source.source_name,record);
    } else images.push({source,asset});
   }
   for(const [name,sourceRecord] of originals)sourceRecord.pages=images.filter(i=>i.source.source_name===name).map(i=>({assetId:i.asset.id,name:i.asset.name,page:i.source.page,kind:i.source.kind}));
   // References are selected only from this owner's cached sources. If a model
   // supplied no reliable page reference, preserve all uploaded page images
   // rather than inventing a crop or silently dropping the original diagram.
   const candidates=row.result_json?JSON.parse(row.result_json).questions||[]:[];
   for(const question of questions) {
    const modelQuestion=candidates.find(q=>q.title===question.title&&q.sourceText===question.sourceText),refs=modelQuestion?.sourceRefs||[];
    const matches=(item,ref)=>ref.sourceName===item.source.source_name&&
     (ref.page?item.source.kind==='page'&&ref.page===item.source.page:!ref.imageName||ref.imageName===item.source.name);
    const matched=refs.length?images.filter(i=>refs.some(r=>matches(i,r))):[];
    const chosen=refs.length?matched:(images.length===1?images:[]);
    const unmatched=refs.filter(ref=>!images.some(item=>matches(item,ref)));
    if(unmatched.length||(!refs.length&&images.length>1))question.notes.push({kind:'unknown',text:'未可靠对应题目原页，未把未匹配的整份资料图片自动附到该题。原件与全部页图已保存在个人来源，请人工选择题干页，避免把解析页混入。'});
    for(const item of chosen) {
     if(!question.attachments.some(a=>a.id===item.asset.id))question.attachments.push({...item.asset});
     const original=originals.get(item.source.source_name);
     if(original) {
      const anchor={sourceId:original.id,...(item.source.page?{page:item.source.page}:{image:item.asset.id}),aiRecognized:true};
      question.sourceAnchors??=[];if(!question.sourceAnchors.some(a=>JSON.stringify(a)===JSON.stringify(anchor)))question.sourceAnchors.push(anchor);
     }
    }
    if(images.length===1&&!refs.length)question.notes.push({kind:'limitation',text:'模型未给明确锚点；已关联唯一原图，仍待人工校对，未自动裁题。'});
   }
   let state;
   if(version===null)state=this.resources.insert(user,validatePaper(paper),Object.values(paper.assets),{sourceJobId:row.id});
   else{this.resources.update(user,validatePaper(paper),version,added,{sourceJobId:row.id});state=this.resources.state(user,paper.id);}
   this.markApplied(row.id,paper.id,sceneId);await this.sourceStore.cleanupTransferred(row.id);return state;
  } catch(error) {
   for(const asset of added) {
    // If commit succeeded, its assets must stay even if later cleanup failed.
    if(!this.resources.asset(paper.id,asset.id))await rm(this.resources.files.assetPath(paper.id,asset.path),{force:true});
   }
   throw error;
  }
 }
 async close(){
  if(this.closePromise)return this.closePromise;
  this.closed=true;
  this.closePromise=(async()=>{
   this.db.prepare("UPDATE ai_jobs SET status='interrupted',phase='服务关闭，请自行重新发送',error_json=?,updated_at=? WHERE status IN ('queued','running')")
    .run(JSON.stringify({code:'ai_interrupted',message:'服务关闭中断了请求。不会自动重试或重复收费。'}),now());
   for(const job of this.queue){job.attachments=null;job.paper=null;job.question=null;job.record=null;job.configuration=null;job.provider=null;}
   this.queue=[];
   for(const controller of this.running.values())controller.abort();
   for(const controller of this.probeRunning.values())controller.abort();
   // Closing SQLite is safe only after file subprocesses, worker cancellation,
   // provider requests and their finally handlers have all settled.
   await Promise.allSettled([...this.tasks.values(),...this.probeTasks.values()]);
   await this.sourceStore?.close();
   await Promise.allSettled([...this.mutationQueues.values()]);
  })();
  return this.closePromise;
 }
}
