import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve, relative, extname, join} from 'node:path';
import {openDatabase, getSetting} from './database.mjs';
import {Accounts} from './auth.mjs';
import {ExamService} from './service.mjs';
import {HTTPError, requireCondition} from './errors.mjs';
import {lockDirectory} from './lock.mjs';
import {Workshop} from './workshop.mjs';
import {Feedback} from './feedback.mjs';
import {Forum} from './forum.mjs';
import {Assignments} from './assignments.mjs';
import {AIService} from './ai-service.mjs';
import {createAIContext} from './ai-context.mjs';
import {AISettings} from './ai-settings.mjs';
import {AccountProfiles,updateProfile} from './account-profiles.mjs';
import {WechatAccounts} from './wechat-accounts.mjs';

const MB = 1024 * 1024;
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
const staticTypes = {'.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.mjs': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf'};
const inlineImages = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const attachment = name => `attachment; filename="resource"; filename*=UTF-8''${encodeURIComponent(String(name).replace(/[\r\n]/g, '').slice(0, 250))}`;

export function taskQueue(limit, maximum = 128) {
  let running = 0;
  const waiting = [];
  async function enter() {
    if (running < limit) { running++; return; }
    if (waiting.length >= maximum) throw new HTTPError(503, '正在处理其他文件，请稍后再试');
    await new Promise(resolve => waiting.push(resolve));
  }
  return async action => { await enter(); try { return await action(); } finally { const next = waiting.shift(); if (next) next(); else running--; } };
}

async function readJSON(request, maximum = 10 * MB) {
  requireCondition((request.headers['content-type'] || '').split(';')[0] === 'application/json', 415, '请使用 JSON 请求');
  requireCondition(!request.headers['content-length'] || Number(request.headers['content-length']) <= maximum, 413, '上传内容过大');
  let size = 0;
  const parts = [];
  for await (const chunk of request) { size += chunk.length; requireCondition(size <= maximum, 413, '上传内容过大'); parts.push(chunk); }
  try { const body = JSON.parse(Buffer.concat(parts).toString('utf8')); requireCondition(body && typeof body === 'object' && !Array.isArray(body), 400, '请求数据不正确'); return body; }
  catch (error) { if (error instanceof HTTPError) throw error; throw new HTTPError(400, 'JSON 格式不正确'); }
}

function respond(response, status, body, headers = {}) {
  response.writeHead(status, {'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store', ...headers});
  response.end(JSON.stringify(body));
}

export async function createExamServer(options) {
  const {dataDir, resourceDir, publicOrigin, adminUsername, adminPassword, inviteCode, className, requireTeacher = true} = options;
  const origin = new URL(publicOrigin).origin, unlock = await lockDirectory(dataDir);
  let db, accounts, service, assignments, ai, aiSettings, profiles, wechat;
  try {
    db = await openDatabase(dataDir); accounts = new Accounts(db, {secureCookie: origin.startsWith('https:')});
    await accounts.initialize({adminUsername, adminPassword, inviteCode, className});
    profiles=await new AccountProfiles(db,{dataDir}).init();
    wechat=new WechatAccounts(db,accounts,{publicOrigin:origin,env:options.wechatEnv||process.env,fetcher:options.wechatFetcher});
    if (requireTeacher && !accounts.hasTeacher()) throw Error('尚未设置教师账号，请先运行 npm run setup:web');
    service = await new ExamService(db, options).init();
    assignments=new Assignments(db,service.resources);await assignments.cleanupPending();
    service.resources.assignmentContext=(user,id)=>assignments.resourceContext(user,id);
    service.resources.afterFork=(user,sourceId,newId)=>assignments.inheritResourceContext(user,sourceId,newId);
    aiSettings=await new AISettings(db,{dataDir,env:options.aiEnv||process.env}).init();
    const aiContext=createAIContext(assignments,service.resources);
    ai=await new AIService(db,{dataDir,resources:service.resources,mutate:(user,operation)=>service.mutate(user,operation),env:options.aiEnv||process.env,configurationFor:user=>aiSettings.configurationFor(user),...aiContext}).init();
    service.resources.afterAIApply=(user,jobId,resourceId)=>{
      const job=ai.row(user,jobId),context=JSON.parse(job.context_json||'{}');
      if(context.assignmentId){aiContext.validateContextPolicy(user,{id:context.assignmentId,version:context.assignmentVersion},{mode:job.mode,action:'apply'});assignments.linkResource(user,context.assignmentId,resourceId);}
    };
    aiSettings.probeExecutor=(user,configuration,options)=>ai.probe(user,configuration,options);
  } catch (error) { await ai?.close();await service?.close();db?.close();await unlock();throw error; }
  const workshop = new Workshop(db, service.resources), forum = new Forum(db, accounts.groups, service.resources, workshop), feedback = new Feedback(db, service.resources, accounts.groups, forum);
  workshop.notifications = forum;assignments.notifications=forum;forum.assignments=assignments;
  const hashing = taskQueue(4), importing = taskQueue(2, 64);
  let closing = false;

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', csp);
    try {
      const url = new URL(request.url, 'http://internal'), path = url.pathname;
      requireCondition(!closing, 503, '服务正在重启，请稍后再试');
      if (path === '/health' && request.method === 'GET') return respond(response, 200, {ok: true, product: '题景学习空间'});
      if (!path.startsWith('/api/')) return await staticFile(request, response, path, resourceDir);
      if (request.method !== 'GET' && request.method !== 'HEAD') requireCondition(request.headers.origin === origin, 403, '请求来源不正确', 'origin_mismatch');
      if(path==='/api/auth/wechat/status'&&request.method==='GET')return respond(response,200,wechat.status(request));
      if(path==='/api/auth/wechat/start'&&request.method==='POST'){
        const result=wechat.start(request,await readJSON(request,8192),accounts.authenticate(request),request.socket.remoteAddress||'unknown');
        return respond(response,200,{url:result.url},{'Set-Cookie':result.cookies});
      }
      if(path==='/api/auth/wechat/callback'&&request.method==='GET'){
        try{const result=await wechat.callback(request,url.searchParams,accounts.authenticate(request));response.writeHead(303,{'Location':result.redirect,'Cache-Control':'no-store','Set-Cookie':result.cookies});}
        catch(error){console.warn('[wechat-oauth]',error.code||'callback_failed');response.writeHead(303,{'Location':'/?wechat=error','Cache-Control':'no-store','Set-Cookie':[wechat.cookies('exam_wechat'),wechat.cookies('exam_wechat_pending')]});}
        return response.end();
      }
      if(path==='/api/auth/wechat/complete'&&request.method==='POST'){
        requireCondition(!accounts.authenticate(request),409,'已有账号登录，请先退出或使用账号绑定功能');
        const input=await readJSON(request,8192),auth=await hashing(()=>wechat.complete(request,input,request.socket.remoteAddress||'unknown'));
        return respond(response,200,{user:auth.user,csrf:auth.csrf,className:getSetting(db,'class_name')},{'Set-Cookie':auth.cookies});
      }
      if (path === '/api/auth/login' || path === '/api/auth/register' || path === '/api/auth/teacher-register') {
        requireCondition(request.method === 'POST', 405, '请求方法不正确');
        const input = await readJSON(request, 8192), address = request.socket.remoteAddress || 'unknown';
        const auth = await hashing(() => path==='/api/auth/teacher-register'?accounts.registerTeacher(input,address):path.endsWith('/register') ? accounts.register(input, address) : accounts.login(input, address));
        return respond(response, 200, {user: auth.user, csrf: auth.csrf, className: getSetting(db, 'class_name')}, {'Set-Cookie': auth.cookie});
      }
      const session = accounts.authenticate(request);
      if (path === '/api/me' && request.method === 'GET') return respond(response, 200, {user: session?.user || null, csrf: session?.csrf || null, className: getSetting(db, 'class_name')});
      requireCondition(session, 401, '请先登录', 'authentication_required');
      const user = session.user;
      if (request.method !== 'GET' && request.method !== 'HEAD') requireCondition(request.headers['x-csrf-token'] === session.csrf, 403, '登录状态已改变，请刷新页面', 'csrf_mismatch');
      if (path === '/api/auth/logout' && request.method === 'POST') return respond(response, 200, {ok: true}, {'Set-Cookie': accounts.logout(session)});
      if (path === '/api/auth/password' && request.method === 'POST') { const input = await readJSON(request, 8192); return respond(response, 200, {ok: await hashing(() => accounts.changePassword(session, input))}); }

      if(path==='/api/account'&&request.method==='GET')return respond(response,200,{user:accounts.public(user),profile:forum.profile(user,user.id),wechat:wechat.account(user)});
      if(path==='/api/account/profile'&&request.method==='PUT'){
        updateProfile(db,user,await readJSON(request,16384),Number(request.headers['x-resource-version']));
        return respond(response,200,{user:accounts.public(user),profile:forum.profile(user,user.id)});
      }
      if(path==='/api/account/images'&&request.method==='POST')return respond(response,201,await profiles.upload(user,await readJSON(request,6*MB)));
      const profileImage=path.match(/^\/api\/profile\/images\/(profile-[a-f0-9-]{36})$/);
      if(profileImage&&request.method==='GET'){const bytes=await profiles.image(user,profileImage[1]);response.writeHead(200,{'Content-Type':'image/webp','Content-Length':bytes.length,'Cache-Control':'private, no-store'});return response.end(bytes);}
      if(path==='/api/account/wechat'&&request.method==='DELETE')return respond(response,200,await hashing(async()=>wechat.unbind(user,(await readJSON(request,8192)).password)));
      if(path==='/api/account/admin/teachers'&&request.method==='GET')return respond(response,200,{teachers:accounts.listTeachers(user)});
      const teacherAccount=path.match(/^\/api\/account\/admin\/teachers\/(user-[a-f0-9-]{36})$/);
      if(teacherAccount&&request.method==='PUT')return respond(response,200,await hashing(async()=>accounts.manageTeacher(user,teacherAccount[1],await readJSON(request,8192))));


      if (path === '/api/groups' && request.method === 'GET') return respond(response, 200, accounts.groups.list(user));
      if (path === '/api/groups' && request.method === 'POST') return respond(response, 201, accounts.groups.create(user, await readJSON(request, 8192)));
      const group = path.match(/^\/api\/groups\/(group-[a-f0-9-]{36})(?:\/(members)(?:\/(user-[a-f0-9-]{36}))?)?$/);
      if (group) {
        const [, groupId, action, memberId] = group;
        if (!action && request.method === 'PUT') return respond(response, 200, accounts.groups.update(user, groupId, await readJSON(request, 8192), Number(request.headers['x-resource-version'])));
        if (action === 'members' && !memberId && request.method === 'GET') return respond(response, 200, {students: accounts.groups.students(user, groupId)});
        if (action === 'members' && !memberId && request.method === 'POST') return respond(response, 200, accounts.groups.assign(user, groupId, await readJSON(request, 65536)));
        if (action === 'members' && memberId && request.method === 'DELETE') return respond(response, 200, {ok: accounts.groups.removeMember(user, groupId, memberId)});
      }
      if (path === '/api/workshop' && request.method === 'GET') return respond(response, 200, workshop.list(user, Object.fromEntries(url.searchParams)));
      if (path === '/api/workshop' && request.method === 'POST') return respond(response, 201, await service.mutate(user, async () => workshop.publish(user, await readJSON(request, 16384), Number(request.headers['x-resource-version']))));
      const work = path.match(/^\/api\/workshop\/(work-[a-f0-9-]{36})(?:\/(like|remix))?$/);
      if (work) {
        const [, workId, action] = work;
        if (!action && request.method === 'GET') return respond(response, 200, workshop.state(user, workId));
        if (!action && request.method === 'PUT') return respond(response, 200, workshop.visibility(user, workId, await readJSON(request, 8192), Number(request.headers['x-resource-version'])));
        if (action === 'like' && request.method === 'PUT') return respond(response, 200, workshop.like(user, workId, await readJSON(request, 8192)));
        if (action === 'remix' && request.method === 'POST') return respond(response, 201, await service.mutate(user, async () => workshop.remix(user, workId, await readJSON(request))));
      }
      if (path === '/api/feedback' && request.method === 'GET') return respond(response, 200, feedback.list(user, Object.fromEntries(url.searchParams)));
      if (path === '/api/feedback' && request.method === 'POST') return respond(response, 201, feedback.submit(user, await readJSON(request, 16384)));
      const feedbackItem = path.match(/^\/api\/feedback\/(feedback-[a-f0-9-]{36})$/);
      if (feedbackItem && request.method === 'PUT') return respond(response, 200, feedback.reply(user, feedbackItem[1], await readJSON(request, 16384), Number(request.headers['x-resource-version'])));

      if(path==='/api/forum/boards'&&request.method==='GET')return respond(response,200,{boards:forum.boards(user)});
      if(path==='/api/forum/boards'&&request.method==='POST')return respond(response,201,forum.createBoard(user,await readJSON(request,8192)));
      const forumBoard=path.match(/^\/api\/forum\/boards\/(board-[a-z0-9-]+)$/);
      if(forumBoard&&request.method==='PUT')return respond(response,200,forum.updateBoard(user,forumBoard[1],await readJSON(request,8192),Number(request.headers['x-resource-version'])));
      if(path==='/api/forum/topics'&&request.method==='GET')return respond(response,200,forum.list(user,Object.fromEntries(url.searchParams)));
      if(path==='/api/forum/topics'&&request.method==='POST')return respond(response,201,forum.create(user,await readJSON(request,131072)));
      const topic=path.match(/^\/api\/forum\/topics\/(topic-[a-f0-9-]{36})(?:\/(comments|like|bookmark|accept))?$/);
      if(topic){const [,topicId,action]=topic,n=Number(request.headers['x-resource-version']);
        if(!action&&request.method==='GET')return respond(response,200,forum.detail(user,topicId,Object.fromEntries(url.searchParams)));
        if(!action&&request.method==='PUT')return respond(response,200,forum.update(user,topicId,await readJSON(request,131072),n));
        if(!action&&request.method==='DELETE')return respond(response,200,forum.remove(user,topicId,n));
        if(action==='comments'&&request.method==='POST')return respond(response,201,forum.comment(user,topicId,await readJSON(request,65536)));
        if(action==='like'&&request.method==='PUT')return respond(response,200,forum.reaction(user,topicId,await readJSON(request,8192)));
        if(action==='bookmark'&&request.method==='PUT')return respond(response,200,forum.bookmark(user,topicId,await readJSON(request,8192)));
        if(action==='accept'&&request.method==='PUT')return respond(response,200,forum.accept(user,topicId,await readJSON(request,8192),n));
      }
      const comment=path.match(/^\/api\/forum\/comments\/(comment-[a-f0-9-]{36})(?:\/(like))?$/);
      if(comment){const [,commentId,action]=comment,n=Number(request.headers['x-resource-version']);
        if(!action&&request.method==='PUT')return respond(response,200,forum.updateComment(user,commentId,await readJSON(request,65536),n));
        if(!action&&request.method==='DELETE')return respond(response,200,forum.removeComment(user,commentId,n));
        if(action==='like'&&request.method==='PUT')return respond(response,200,forum.reaction(user,commentId,await readJSON(request,8192)));
      }
      if(path==='/api/notifications'&&request.method==='GET')return respond(response,200,forum.notifications(user));
      if(path==='/api/notifications'&&request.method==='PUT')return respond(response,200,forum.readNotifications(user,await readJSON(request,8192)));
      const profile=path.match(/^\/api\/profiles\/(user-[a-f0-9-]{36})$/);
      if(profile&&request.method==='GET')return respond(response,200,forum.profile(user,profile[1]));
      if(path==='/api/profile'&&request.method==='PUT')return respond(response,200,forum.updateProfile(user,await readJSON(request,8192)));
      if(path==='/api/reports'&&request.method==='POST')return respond(response,201,forum.report(user,await readJSON(request,8192)));
      if(path==='/api/reports'&&request.method==='GET')return respond(response,200,forum.reports(user,Object.fromEntries(url.searchParams)));
      const report=path.match(/^\/api\/reports\/(report-[a-f0-9-]{36})$/);
      if(report&&request.method==='PUT')return respond(response,200,forum.resolveReport(user,report[1],await readJSON(request,8192),Number(request.headers['x-resource-version'])));

      if(path==='/api/assignments'&&request.method==='GET')return respond(response,200,assignments.list(user,Object.fromEntries(url.searchParams)));
      if(path==='/api/assignments'&&request.method==='POST')return respond(response,201,await service.mutate(user,async()=>assignments.create(user,await readJSON(request,131072))));
      const task=path.match(/^\/api\/assignments\/(assignment-[a-f0-9-]{36})(?:\/(material|submissions)(?:\/(submission-[a-f0-9-]{36}))?)?$/);
      if(task){const [,taskId,action,submissionId]=task,n=Number(request.headers['x-resource-version']);
        if(!action&&request.method==='GET')return respond(response,200,assignments.get(user,taskId));
        if(!action&&request.method==='PUT')return respond(response,200,await service.mutate(user,async()=>assignments.update(user,taskId,await readJSON(request,131072),n)));
        if(action==='material'&&request.method==='GET')return respond(response,200,assignments.material(user,taskId));
        if(action==='submissions'&&!submissionId&&request.method==='POST')return respond(response,201,await service.mutate(user,async()=>assignments.submit(user,taskId,await readJSON(request,65536),n)));
        if(action==='submissions'&&submissionId&&request.method==='GET')return respond(response,200,assignments.detailSubmission(user,taskId,submissionId));
        if(action==='submissions'&&submissionId&&request.method==='PUT')return respond(response,200,assignments.review(user,taskId,submissionId,await readJSON(request,65536),n));
      }
      if(path==='/api/ai/settings'&&request.method==='GET')return respond(response,200,await aiSettings.get(user,{groupId:url.searchParams.get('groupId')||''}));
      if(path==='/api/ai/settings'&&request.method==='PUT')return respond(response,200,await aiSettings.save(user,await readJSON(request,16384)));
      if(path==='/api/ai/settings/probe'&&request.method==='POST')return respond(response,200,await aiSettings.probe(user,await readJSON(request,16384)));
      if(path==='/api/ai/config'&&request.method==='GET')return respond(response,200,await ai.config(user));
      if(path==='/api/ai/jobs'&&request.method==='GET')return respond(response,200,ai.list(user,Object.fromEntries(url.searchParams)));
      if(path==='/api/ai/jobs'&&request.method==='POST')return respond(response,202,await importing(async()=>ai.start(user,await readJSON(request,48*MB))));
      const aiSource=path.match(/^\/api\/ai\/jobs\/(ai-[a-f0-9-]{36})\/sources(?:\/([a-zA-Z0-9_-]{1,100}))?$/);
      if(aiSource){
        const [,jobId,sourceId]=aiSource;
        if(!sourceId&&request.method==='GET')return respond(response,200,await ai.sources(user,jobId));
        if(sourceId&&['GET','HEAD'].includes(request.method)){
          const source=await ai.sourceAsset(user,jobId,sourceId),info=await stat(source.path);
          response.writeHead(200,{'Content-Type':inlineImages.has(source.metadata.mime)?source.metadata.mime:'application/octet-stream','Content-Length':info.size,'Cache-Control':'private, no-store',...(!inlineImages.has(source.metadata.mime)?{'Content-Disposition':attachment(source.metadata.name)}:{})});
          if(request.method==='HEAD')response.end();else createReadStream(source.path).on('error',()=>response.destroy()).pipe(response);return;
        }
      }
      const aiJob=path.match(/^\/api\/ai\/jobs\/(ai-[a-f0-9-]{36})(?:\/(apply|cancel|thread))?$/);
      if(aiJob){const [,jobId,action]=aiJob;
        if(!action&&request.method==='GET')return respond(response,200,ai.get(user,jobId));
        if(action==='thread'&&request.method==='GET')return respond(response,200,ai.thread(user,jobId));
        if(!action&&request.method==='DELETE')return respond(response,200,await ai.remove(user,jobId));
        if(action==='cancel'&&request.method==='POST')return respond(response,200,ai.cancel(user,jobId));
        if(action==='apply'&&request.method==='POST'){
          const result=await ai.apply(user,jobId,await readJSON(request,16384));return respond(response,201,result);
        }
      }

      if (path === '/api/library' && request.method === 'GET') return respond(response, 200, service.resources.library(user));
      if (path === '/api/classroom' && request.method === 'GET') return respond(response, 200, accounts.classroom(user));
      if (path === '/api/classroom' && request.method === 'PUT') return respond(response, 200, accounts.updateClassroom(user, await readJSON(request, 8192)));
      if (path === '/api/students' && request.method === 'GET') return respond(response, 200, {students: accounts.students(user, url.searchParams.get('groupId'))});
      const student = path.match(/^\/api\/students\/(user-[a-f0-9-]{36})$/);
      if (student && request.method === 'PUT') return respond(response, 200, {ok: await accounts.manageStudent(user, student[1], await readJSON(request, 8192))});
      if (path === '/api/resources' && request.method === 'POST') return respond(response, 201, await service.mutate(user, async () => service.resources.create(user, (await readJSON(request, 8192)).title)));
      if (path === '/api/import' && request.method === 'POST') return respond(response, 201, await importing(() => service.mutate(user, async () => service.importFile(user, await readJSON(request, 145 * MB)))));
      if (path === '/api/sample' && request.method === 'POST') return respond(response, 201, await importing(() => service.mutate(user, () => service.sample(user))));
      const discard = path.match(/^\/api\/imports\/([a-f0-9-]{36})$/);
      if (discard && request.method === 'DELETE') return respond(response, 200, {ok: await service.discard(user.id, discard[1])});

      const resource = path.match(/^\/api\/resources\/(exam-[a-f0-9-]{36})(?:\/(fork|publish|export|portable|documents|commit|image|assets)(?:\/([a-zA-Z0-9_-]{1,100}))?)?$/);
      requireCondition(resource, 404, '接口不存在');
      const [, id, action, assetId] = resource;
      const view = url.searchParams.get('view') || undefined;
      if(assignments.hasSnapshot(id)) {
        requireCondition(!view||view==='private',400,'作业快照查看方式不正确');
        if(action==='assets'&&assetId&&['GET','HEAD'].includes(request.method)){
          const asset=assignments.snapshotAsset(user,id,assetId),info=await stat(asset.path);
          response.writeHead(200,{'Content-Type':inlineImages.has(asset.metadata.mime)?asset.metadata.mime:'application/octet-stream','Content-Length':info.size,'Cache-Control':'private, no-store',...(!inlineImages.has(asset.metadata.mime)?{'Content-Disposition':attachment(asset.metadata.name)}:{})});
          if(request.method==='HEAD')response.end();else createReadStream(asset.path).on('error',()=>response.destroy()).pipe(response);return;
        }
        if(!action&&request.method==='GET')return respond(response,200,assignments.snapshotState(user,id));
        if(action==='fork'&&request.method==='POST')return respond(response,201,await service.mutate(user,async()=>assignments.fork(user,id,(await readJSON(request)).paper)));
        if(action==='portable'&&request.method==='POST'){const input=await readJSON(request);return respond(response,200,await assignments.portable(user,id,input.paper,input));}
        if(action==='export'&&request.method==='POST'){
          const file=await assignments.export(user,id,await readJSON(request),service.resourceDir);
          response.writeHead(200,{'Content-Type':file.mime,'Cache-Control':'no-store','Content-Disposition':attachment(file.filename)});response.end(file.content);return;
        }
        assignments.snapshot(user,id);throw new HTTPError(403,'作业与提交快照不可修改；请保存个人副本');
      }
      service.resources.readable(user, id, {view});
      if (view && view !== 'private' && ((!action && ['PUT','DELETE'].includes(request.method)) || ['publish','documents','commit','image'].includes(action))) throw new HTTPError(403, '请返回个人原稿进行修改');
      if (action === 'assets' && assetId && ['GET', 'HEAD'].includes(request.method)) {
        const asset = service.resources.assetFor(user, id, assetId, {view}), info = await stat(asset.path);
        response.writeHead(200, {'Content-Type': inlineImages.has(asset.metadata.mime) ? asset.metadata.mime : 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'private, no-store',
          ...(!inlineImages.has(asset.metadata.mime) ? {'Content-Disposition': attachment(asset.metadata.name)} : {})});
        if (request.method === 'HEAD') response.end(); else createReadStream(asset.path).on('error', () => response.destroy()).pipe(response);
        return;
      }
      if (!action && request.method === 'GET') return respond(response, 200, service.resources.state(user, id, {view}));
      const version = Number(request.headers['x-resource-version']);
      if (!action && request.method === 'PUT') return respond(response, 200, await service.mutate(user, async () => { const input = await readJSON(request); requireCondition(input.paper?.id === id, 400, '资源编号不一致'); return service.resources.update(user, input.paper, version); }));
      if (!action && request.method === 'DELETE') return respond(response, 200, {ok: await service.mutate(user, () => service.resources.delete(user, id, version))});
      if (action === 'fork' && request.method === 'POST') return respond(response, 201, await service.mutate(user, async () => service.resources.fork(user, id, (await readJSON(request)).paper, {view})));
      if (action === 'publish' && request.method === 'POST') return respond(response, 200, await service.mutate(user, async () => { const input = await readJSON(request, 16384); return service.resources.publish(user, id, version, input.includeReference !== false, input.groupIds); }));
      if (action === 'publish' && request.method === 'DELETE') return respond(response, 200, {ok: await service.mutate(user, () => service.resources.unpublish(user, id, version))});
      if (action === 'documents' && request.method === 'POST') return respond(response, 200, await importing(() => service.mutate(user, async () => service.preview(user, id, await readJSON(request, 145 * MB), version))));
      if (action === 'commit' && request.method === 'POST') return respond(response, 200, await service.mutate(user, async () => service.commit(user, id, await readJSON(request), version)));
      if (action === 'image' && request.method === 'POST') return respond(response, 200, await service.mutate(user, async () => service.image(user, id, await readJSON(request, 20 * MB), version)));
      if (action === 'portable' && request.method === 'POST') { const input = await readJSON(request); return respond(response, 200, await service.resources.portable(user, id, input.paper, {...input, view})); }
      if (action === 'export' && request.method === 'POST') {
        const file = await service.export(user, id, {...await readJSON(request), view});
        response.writeHead(200, {'Content-Type': file.mime, 'Cache-Control': 'no-store', 'Content-Disposition': attachment(file.filename)});
        response.end(file.content); return;
      }
      throw new HTTPError(405, '请求方法不正确');
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const status = error instanceof HTTPError ? error.status : error.code ? 500 : 400;
      if (status >= 500) console.error('[exam-web]', error.stack || error);
      respond(response, status, {error: status >= 500 ? '处理未完成，请稍后重试' : error.message, code: error.code || 'request_failed'});
    }
  });
  server.requestTimeout = 180000;
  server.headersTimeout = 15000;
  return {server,db,accounts,service,workshop,feedback,forum,assignments,ai,aiSettings,async close(){closing=true;await ai.close();await new Promise(resolve=>server.close(resolve));await service.close();db.close();await unlock();}};
}

function staticEncodings(header='') {
  const weights=new Map(String(header).toLowerCase().split(',').map(part=>{
    const [name,...parameters]=part.trim().split(';'),q=parameters.find(p=>p.trim().startsWith('q='));
    const value=q===undefined?1:Number(q.trim().slice(2));return [name.trim(),Number.isFinite(value)&&value>=0&&value<=1?value:0];
  }));
  return ['br','gzip'].map(name=>({name,q:weights.get(name)??weights.get('*')??0})).filter(e=>e.q>0).sort((a,b)=>b.q-a.q).map(e=>e.name);
}

async function staticFile(request, response, path, resourceDir) {
  requireCondition(['GET', 'HEAD'].includes(request.method), 405, '请求方法不正确');
  let file;
  try { file = decodeURIComponent(path === '/' ? '/web.html' : path); } catch { throw new HTTPError(400, '网址不正确'); }
  requireCondition(/^\/(?:web\.html|web-host\.js|web\.css|app\.js|index\.html|style\.css|math\.css|planar\.html|example4\.html|supplement\.html|pdf-browser\.js|pdf\.worker\.mjs|pdf\/(?:cmaps|standard_fonts|wasm)\/[a-zA-Z0-9_.-]+)$/.test(file), 404, '页面不存在');
  const base = resolve(resourceDir), target = resolve(base, '.' + file), rel = relative(base, target);
  requireCondition(!rel.startsWith('..') && !rel.includes(':'), 404, '页面不存在');
  let info; try { info = await stat(target); } catch { throw new HTTPError(404, '页面不存在'); }
  let selected=target,selectedInfo=info,encoding=null;
  for(const candidate of staticEncodings(request.headers['accept-encoding'])) {
    const path=target+(candidate==='br'?'.br':'.gz');
    try {const compressed=await stat(path);if(compressed.isFile()&&compressed.mtimeMs>=info.mtimeMs){selected=path;selectedInfo=compressed;encoding=candidate;break;}}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const etag = `"${selectedInfo.size}-${Math.trunc(selectedInfo.mtimeMs)}-${encoding||'identity'}"`;
  const headers = {'Content-Type': staticTypes[extname(target)] || 'application/octet-stream', 'Cache-Control': file.endsWith('.html') ? 'no-store' : 'public, max-age=300', ETag: etag,
    Vary:'Accept-Encoding',...(encoding?{'Content-Encoding':encoding}:{})};
  if (request.headers['if-none-match'] === etag) { response.writeHead(304, headers); response.end(); return; }
  response.writeHead(200, {...headers, 'Content-Length': selectedInfo.size});
  if (request.method === 'HEAD') response.end(); else createReadStream(selected).on('error', () => response.destroy()).pipe(response);
}
