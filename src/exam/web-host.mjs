import {icon,dateText} from './web-ui.mjs';
import {setupWebHeader} from './web-header.mjs';
import {createUpdatesUI} from './web-updates.mjs';
import {createAccountCenter} from './web-account-center.mjs';
import {createGroupsUI} from './web-groups.mjs';
import {createWorkshopUI} from './web-workshop.mjs';
import {createFeedbackUI} from './web-feedback.mjs';
import {createForumUI} from './web-forum.mjs';
import {createAIUI} from './web-ai.mjs';
import {buildSceneQuestion} from './scene-question.mjs';
import {createAIDock} from './web-ai-dock.mjs';
import {createAssignmentsUI} from './web-assignments.mjs';
import {createHandwritingFormulaUI} from './handwriting-formula.mjs';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const MB = 1024 * 1024;
let session = null, library = {mine: [], shared: [], usage: {}}, activeTab = 'shared', currentId = null, hooks = null, progress = () => {}, passwordUser = null;
const metadata = new Map();let lastPrivateContext=null;
let aiDock=null,dockWanted=false,dockTicket=0,dockAutoImmersive=false,dockLayoutFrame=0;
let readyResolve, readyReject, pdfLoading, sessionEpoch=0;
let wechatPending=null;
const sessionTab=crypto.randomUUID(),sessionChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('tijing-account'):null;
const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
document.body.classList.add('web', 'web-auth');
document.body.insertAdjacentHTML('beforeend', `
<div id="web-auth" class="web-auth-screen"><div class="auth-story"><div class="auth-logo">题景<span>物理学习空间</span></div><div class="auth-copy"><span class="web-eyebrow">观察 · 探究 · 改编</span><h1>把一道题，<br>变成可以探索的场景。</h1><p>打开老师的共享试卷，观察运动与受力。<br>也可以导入自己的题目，保存每一次新的尝试。</p><svg class="auth-orbit" viewBox="0 0 520 250" fill="none" aria-hidden="true"><path d="M40 162h430M104 28v200" stroke="#c4d9d5"/><path d="M104 88Q210 90 260 162C330 255 415 207 415 142" stroke="#368d8b" stroke-width="2"/><path d="M260 162a83 83 0 1 1 155-20" stroke="#b7cfce" stroke-dasharray="5 7"/><circle cx="104" cy="88" r="5" fill="#368d8b"/><circle cx="415" cy="142" r="6" fill="#bf9360"/><path d="M142 36v46m-4-6 4 6 4-6M196 36v46m-4-6 4 6 4-6" stroke="#bf9360"/><circle cx="319" cy="117" r="5" stroke="#8eadb5"/><path d="m316 114 6 6m-6 0 6-6" stroke="#8eadb5"/></svg></div><small>题目与场景在这里相遇</small></div><div class="auth-card"><span class="web-eyebrow">欢迎回来</span><h2 id="auth-heading">进入学习空间</h2><p id="auth-space-name">与你的题目，继续上一次探索。</p><div class="auth-tabs"><button id="auth-login-tab" class="active" type="button">登录</button><button id="auth-register-tab" type="button">学生注册</button></div><form id="web-auth-form"><label>账号<input id="auth-username" autocomplete="username" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_.\\-]+" placeholder="字母、数字或下划线"></label><label id="auth-name-label" hidden>昵称<input id="auth-name" autocomplete="nickname" maxlength="30" placeholder="在学习空间中显示的名字"></label><label>密码<input id="auth-password" type="password" autocomplete="current-password" required minlength="8" maxlength="128" placeholder="至少8个字符"></label><label id="auth-invite-label" hidden>班级邀请码<input id="auth-invite" autocomplete="off" maxlength="64" placeholder="向老师获取邀请码"></label><p id="auth-error" class="web-error" role="alert" hidden></p><button id="auth-submit" class="web-primary" type="submit">登录</button></form><p id="auth-footnote">个人资源自动保存在服务器，换一台设备也能继续。</p></div></div>
<section id="web-dashboard" hidden><aside class="library-nav"><div><span class="web-eyebrow">观察 · 探究 · 表达</span><h2>我的物理空间</h2></div>
  <button data-library-tab="shared" class="active nav-primary"><span>${icon('home')}</span><i class="nav-full-label">学习资源</i><i class="nav-short-label">学习</i><small id="shared-count">0</small></button>
  <button data-library-tab="ai" class="nav-primary"><span>${icon('scene')}</span><i class="nav-full-label">AI探究助手</i><i class="nav-short-label">AI</i></button>
  <button data-library-tab="assignments" class="nav-primary"><span>${icon('document')}</span><i class="nav-full-label">学习任务</i><i class="nav-short-label">作业</i></button>
  <button data-library-tab="workshop" class="nav-secondary"><span>${icon('workshop')}</span>创意工坊</button>
  <button data-library-tab="forum" class="nav-secondary"><span>${icon('feedback')}</span>讨论社区</button>
  <button data-library-tab="mine" class="nav-primary"><span>${icon('book')}</span><i class="nav-full-label">我的资源</i><i class="nav-short-label">我的</i><small id="mine-count">0</small></button>
  <button data-library-tab="groups" class="nav-secondary"><span>${icon('group')}</span><i id="nav-groups-label">班级与小组</i></button>
  <button data-library-tab="feedback" class="nav-secondary"><span>${icon('feedback')}</span><i id="nav-feedback-label">我的反馈</i></button>
  <label class="mobile-nav-more" aria-label="更多学习功能"><span>${icon('group')}</span><i id="mobile-nav-label">更多</i><select id="mobile-nav-select" aria-label="选择更多学习功能"><option value="" disabled>更多功能</option><option value="workshop">创意工坊</option><option value="forum">讨论社区</option><option value="groups">班级与小组</option><option value="feedback">教学反馈</option><option value="updates">更新记录</option></select></label><div class="library-nav-bottom"><span class="web-space-heading">个人空间<button id="web-updates-open" type="button" aria-haspopup="dialog">更新记录 ${icon('chevron-right')}</button></span><strong id="web-usage"></strong><div class="usage-track"><i id="web-usage-bar"></i></div><p>让每一次探索都有处可存。</p></div></aside>
  <div class="library-content"><div id="web-resource-panel"><div id="web-welcome"></div><div class="library-intro"><div><span class="web-eyebrow" id="library-eyebrow">教师投送 · 自由探究</span><h1 id="library-title">学习资源</h1><p id="library-description"></p></div><div class="library-actions"><button id="web-new" class="web-primary">＋ 新建资源</button><button id="web-import">导入资源</button></div></div>
  <div class="library-tools"><label><span>⌕</span><input id="web-search" placeholder="搜索试卷或资源" aria-label="搜索试卷或资源"></label><select id="web-group-filter" aria-label="按班级或小组查看投送"></select><span id="library-result"></span><button id="web-refresh" aria-label="刷新资源">↻</button></div>
  <div class="home-resource-layout"><div id="web-resource-grid"></div><aside id="web-learning-aside"></aside></div><div id="web-library-empty" hidden><div>${icon('book')}</div><h3>从一个问题开始</h3><p id="library-empty-text"></p><button id="web-empty-new" class="web-primary">新建我的第一份资源</button><button id="web-sample">体验入门示例</button></div><p class="library-bottom-note">模板提供探索的起点；题设、公式与题图请对照原文核对。</p></div></div></section>
<div id="web-context-banner" hidden><span id="web-context-text"></span><button id="web-copy">保存为我的副本</button><button id="web-reload" hidden>打开最新版</button><button id="web-assignment-return" hidden>返回学习任务</button></div>
<dialog id="web-new-dialog"><div class="dialog-heading"><h2>新建我的资源</h2><button data-web-close="web-new-dialog">×</button></div><form id="web-new-form"><label class="text-label">资源名称<input id="web-new-title" required maxlength="140" placeholder="例如：磁场中的圆周运动"></label><p class="dialog-intro">添加题目，选择场景模板，逐步搭建自己的演示。</p><div class="dialog-actions"><button type="button" data-web-close="web-new-dialog">取消</button><button class="primary" type="submit">创建</button></div></form></dialog>
<dialog id="web-publish-dialog"><div class="dialog-heading"><h2>发布共享试卷</h2><button data-web-close="web-publish-dialog">×</button></div><p class="dialog-intro">学生将看到当前保存版本的题目、题图和场景。之后继续编辑自己的资源，学生看到的共享版保持不变；再次发布才会更新。</p><p id="web-publish-summary" class="export-summary"></p><h3 class="target-heading">选择投送对象</h3><div id="web-publish-targets"></div><label class="check"><input id="web-publish-reference" type="checkbox" checked>共享文字参考解析（图片中的内容保持原样）</label><p class="web-subtle">原始上传文档留在个人空间。学生保存改编时，会创建个人副本。</p><div class="dialog-actions"><button data-web-close="web-publish-dialog">取消</button><button id="web-confirm-publish" class="primary">发布共享版</button></div></dialog>
<dialog id="web-account-dialog"><div class="dialog-heading"><h2>修改密码</h2><button data-web-close="web-account-dialog">×</button></div><form id="web-password-form"><label class="text-label">当前密码<input id="web-old-password" type="password" autocomplete="current-password" required></label><label class="text-label">新密码<input id="web-new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label class="text-label">再次输入新密码<input id="web-repeat-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><p id="web-password-error" class="web-error" hidden></p><div class="dialog-actions"><button type="button" data-web-close="web-account-dialog">取消</button><button class="primary" type="submit">保存密码</button></div></form></dialog>
<dialog id="web-reset-dialog"><div class="dialog-heading"><h2>重置学生密码</h2><button data-web-close="web-reset-dialog">×</button></div><form id="web-reset-form"><p id="web-reset-name"></p><label class="text-label">新密码<input id="web-reset-password" type="password" minlength="8" maxlength="128" required autocomplete="new-password"></label><p class="web-subtle">重置后，该学生需要重新登录。</p><div class="dialog-actions"><button type="button" data-web-close="web-reset-dialog">取消</button><button class="primary" type="submit">重置密码</button></div></form></dialog>
<div id="web-toast" role="status" hidden></div>
<input id="web-file-input" type="file" hidden><input id="web-document-input" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff" hidden>
`);

const teacherRegistration=document.createElement('button');teacherRegistration.type='button';teacherRegistration.id='auth-teacher-tab';teacherRegistration.textContent='教师注册';$('auth-register-tab').after(teacherRegistration);
$('web-auth-form').insertAdjacentHTML('afterend','<div class="auth-wechat-row"><button id="auth-wechat" type="button" disabled>微信扫码登录／注册</button><p id="auth-wechat-note">正在读取微信登录状态…</p></div>');
const toolbar = document.createElement('div');
toolbar.className = 'web-toolbar';
toolbar.innerHTML = '<button id="web-home">资源首页</button><button id="web-publish" hidden>投送资源</button><button id="web-post" hidden>发布工坊</button><button id="web-send-feedback" hidden>反馈原题</button><button id="web-ai-current" hidden>AI辅导 / 建模</button><button id="web-notifications" aria-label="消息中心">'+icon('bell')+'<b id="web-notification-badge" hidden></b></button><details class="web-user-menu"><summary><span class="user-avatar">'+icon('group')+'</span><span id="web-user-name"></span><span class="menu-chevron">⌄</span></summary><div><span id="web-user-role"></span><button id="web-admin" hidden>班级与小组</button><button id="web-feedback-inbox">我的反馈</button><button id="web-profile">我的社区主页</button><button id="web-api-settings">API连接设置</button><button id="web-assignments-menu">学习任务</button><button id="web-account">修改密码</button><button id="web-unpublish" hidden>撤下班级投送</button><button id="web-logout">退出登录</button></div></details>';
$('lecture-mode').after(toolbar);
const accountEntry=document.createElement('button');accountEntry.id='web-account-center';accountEntry.type='button';accountEntry.textContent='账号与个性化';$('web-profile').before(accountEntry);
const banner = $('web-context-banner');
$('scene-tabs').closest('.scene-strip').after(banner);
const workStrip=document.createElement('div');workStrip.id='web-work-view';workStrip.hidden=true;banner.after(workStrip);
setupWebHeader();
const updatesUI = createUpdatesUI();
for(const button of document.querySelectorAll('[data-web-close]'))button.setAttribute('aria-label','关闭对话框');

function notify(message) { const active=document.querySelector('dialog[open]');if(active){let feedback=active.querySelector('.web-inline-feedback');if(!feedback){feedback=document.createElement('p');feedback.className='web-inline-feedback';feedback.setAttribute('role','status');const actions=active.querySelector('.dialog-actions');actions?actions.before(feedback):active.append(feedback);}feedback.textContent=message;return;} const node = $('web-toast'); node.textContent = message; node.hidden = false; clearTimeout(notify.timer); notify.timer = setTimeout(() => node.hidden = true, 5000); }
function authMode(mode) {
  const register=!!mode,teacher=mode==='teacher';wechatPending=null;
  $('web-auth-form').dataset.role=teacher?'teacher':'student';
  $('web-auth-form').dataset.register = String(register);
  $('auth-login-tab').classList.toggle('active', !register); $('auth-register-tab').classList.toggle('active', register&&!teacher);$('auth-teacher-tab').classList.toggle('active',teacher);
  $('auth-name-label').hidden=!register;$('auth-invite-label').hidden=!register||teacher;
  $('auth-name').required=register;$('auth-invite').required=register&&!teacher;
  $('auth-password').autocomplete = register ? 'new-password' : 'current-password';
  $('auth-submit').textContent = register ? teacher?'创建教师账号':'创建学生账号' : '登录';
  $('auth-heading').textContent = register ? teacher?'创建你的教学空间':'开启你的探索' : '进入学习空间';
  $('auth-footnote').textContent=teacher?'独立管理班级、小组与教学API，开始你的教学探索。':'个人资源自动保存在服务器，换一台设备也能继续。';
  $('auth-error').hidden = true;
}
function showAuth() {
  dockTicket++;dockWanted=false;dockAutoImmersive=false;aiDock?.reset();
  sessionEpoch++; session = null; groupsUI.reset();workshopUI.reset();feedbackUI.reset();forumUI.reset();aiUI.reset();assignmentsUI.reset();accountUI.reset();wechatPending=null; document.body.classList.add('web-auth'); document.body.classList.remove('web-home'); $('web-auth').hidden = false;
  metadata.clear();lastPrivateContext=null; currentId = null; hooks?.clear();
  library = {mine: [], shared: [], usage: {}}; $('web-resource-grid').replaceChildren();
  for (const dialog of document.querySelectorAll('dialog')) if (dialog.open) dialog.close();
  for (const form of document.querySelectorAll('dialog form')) form.reset();
  for (const feedback of document.querySelectorAll('.web-inline-feedback')) feedback.remove();
  window.dispatchEvent(new Event('exam-private-reset'));
  $('web-context-banner').hidden = true; $('web-toast').hidden = true; document.title = '题景 · 学习空间';$('paper-title').textContent='题景 · 学习空间';
  for(const id of ['web-context-text','web-work-view','web-user-name','web-user-role','web-toast'])$(id).replaceChildren();
  refreshWechatStatus();
}
function renderSessionUser(){
  const user=session.user;$('web-user-name').textContent=user.displayName;$('web-user-role').textContent=user.isPlatformAdmin?'平台管理员':user.role==='teacher'?'教师':'学生';
  const avatar=document.querySelector('.web-user-menu .user-avatar');avatar.innerHTML=user.avatarURL?'<img src="'+esc(user.avatarURL)+'" alt="我的头像">':icon('group');
}
function signedIn(value) {
  sessionEpoch++; session = value; $('web-auth').hidden = true; document.body.classList.remove('web-auth');
  renderSessionUser();wechatPending=null;
  $('web-admin').hidden = value.user.role !== 'teacher'; $('auth-password').value = '';
  readyResolve(value);
}
function announceSession(kind,userId=null){sessionChannel?.postMessage({kind,userId,sender:sessionTab});}
function changedSession(){
 showAuth();authMode(false);$('auth-error').textContent='登录状态已在其他页面改变，请刷新本页后继续。';$('auth-error').hidden=false;
}
if(sessionChannel)sessionChannel.onmessage=event=>{
 const value=event.data;if(!value||value.sender===sessionTab||!['login','logout'].includes(value.kind))return;
 // Reauthentication as the same person should refresh CSRF without discarding
 // an unsaved paper. A different identity must clear private UI immediately.
 if(value.kind==='login'&&session?.user.id===value.userId){
  const expected=sessionEpoch;
  request('/api/me').then(actual=>{if(expected!==sessionEpoch)return;if(actual.user?.id!==value.userId){changedSession();return;}session={...session,...actual};}).catch(error=>{if(error.code!=='context_changed')notify('登录连接已更新，请稍后重试保存。');});
 }else changedSession();
};

async function request(path, {method = 'GET', body, version, binary = false} = {}) {
  const epoch=sessionEpoch;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = session?.csrf || '';
  if (version !== undefined) headers['X-Resource-Version'] = String(version);
  const response = await fetch(path, {method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store'});
  if(epoch!==sessionEpoch){const error=new Error('登录身份已改变');error.code='context_changed';throw error;}
  if (!response.ok) {
    const value = await response.json().catch(() => ({})), error = new Error(value.error || '请求未完成，请稍后再试');
    error.status = response.status; error.code = value.code;
    if (response.status === 401 && session) showAuth();
    throw error;
  }
  const value=binary?response:await response.json();
  if(epoch!==sessionEpoch){const error=new Error('登录身份已改变');error.code='context_changed';throw error;}
  return value;
}

function remember(state) {
  if (state.resource) metadata.set(state.resource.id, state.resource);
  for (const item of state.papers || []) if (item.id !== state.resource?.id && item.id !== currentId) metadata.set(item.id, item);
  return state;
}

async function refreshLibrary() {
  const [next,community]=await Promise.all([request('/api/library'),request('/api/forum/topics')]);library={...next,community};
  for (const item of [...library.shared, ...library.mine]) metadata.set(item.id, item);
  renderLibrary();forumUI.refreshNotices().catch(error=>{if(error.code!=='context_changed')notify(error.message);});return library;
}

function renderLibrary({deferDomain=false}={}) {
  const resourceTab = activeTab === 'shared' || activeTab === 'mine', shared = activeTab === 'shared', teacher = session?.user.role === 'teacher';
  for (const button of document.querySelectorAll('[data-library-tab]')) button.classList.toggle('active',button.dataset.libraryTab===activeTab);
  const secondary=['workshop','forum','groups','feedback'].includes(activeTab);$('mobile-nav-select').value=secondary?activeTab:'';document.querySelector('.mobile-nav-more').classList.toggle('is-active',secondary);$('mobile-nav-label').textContent=secondary?({workshop:'工坊',forum:'社区',groups:'群组',feedback:'反馈'})[activeTab]:'更多';
  $('shared-count').textContent=library.shared.length;$('mine-count').textContent=library.mine.length;
  $('nav-groups-label').textContent=teacher?'班级与小组':'我的群组';$('nav-feedback-label').textContent=teacher?'教学反馈':'我的反馈';
  $('web-feedback-inbox').textContent=teacher?'教学反馈':'我的反馈';
  $('web-usage').textContent=((library.usage.bytes||0)/MB).toFixed(1)+' / '+Math.round((library.usage.limit||0)/MB)+' MB';
  $('web-usage-bar').style.width=Math.min(100,(library.usage.bytes||0)/(library.usage.limit||1)*100)+'%';
  $('web-resource-panel').hidden=!resourceTab;groupsUI.hide();workshopUI.hide();feedbackUI.hide();forumUI.hide();aiUI.hide();assignmentsUI.hide();
  if(deferDomain)return;
  if(activeTab==='ai'){aiUI.show(library).catch(error=>{if(error.code!=='context_changed')notify(error.message);});return;}
  if(activeTab==='assignments'){assignmentsUI.show(library).catch(error=>{if(error.code!=='context_changed')notify(error.message);});return;}
  if(activeTab==='forum'){forumUI.show().catch(error=>notify(error.message));return;}
  if(activeTab==='groups'){groupsUI.show(library);return;}
  if(activeTab==='workshop'){workshopUI.show().catch(error=>notify(error.message));return;}
  if(activeTab==='feedback'){feedbackUI.show(library).catch(error=>notify(error.message));return;}
  const previous=$('web-group-filter').value;
  $('web-group-filter').innerHTML='<option value="">全部投送对象</option>'+(library.groups||[]).map(group=>'<option value="'+group.id+'">'+esc(group.name)+'</option>').join('');
  $('web-group-filter').value=previous;$('web-group-filter').hidden=!shared;
  const needle=$('web-search').value.trim().toLowerCase(),selectedGroup=$('web-group-filter').value,all=shared?library.shared:library.mine;
  const items=all.filter(item=>(item.title+' '+item.author).toLowerCase().includes(needle)&&(!shared||!selectedGroup||item.groups?.some(group=>group.id===selectedGroup)));
  $('library-title').textContent=shared?'学习资源':'我的题目与场景';
  $('library-eyebrow').textContent=shared?'观察现象 · 追问原因':'动手搭建 · 保存想法';
  $('library-description').textContent=shared?'按班级和小组接收学习材料。打开原题探究，有疑问时可以直接向教师反馈。':'整理文档、搭建场景、改编习题；完成作品后，可以分享至创意工坊。';
  $('web-new').hidden=$('web-import').hidden=shared&&!teacher;
  const className=library.administrativeClass?.name||'行政班待教师确认',recent=library.mine[0];
  $('web-welcome').innerHTML=shared?'<section class="welcome-card"><div><span class="web-eyebrow">'+(teacher?'教学工作台':'欢迎回来，'+esc(session.user.displayName))+'</span><h2>'+(teacher?'把合适的问题，送到合适的学习小组。':'从一个问题，开始今天的探索。')+'</h2><p>'+(teacher?library.studentCount+' 名学生 · '+library.groups.filter(group=>group.kind==='class'&&!group.archived).length+' 个行政班':esc(className)+' · '+library.groups.filter(group=>group.kind==='learning'&&!group.legacy&&!group.archived).length+' 个学习小组')+'</p></div><span class="welcome-orbit">'+icon('scene')+'</span></section>'+(recent?'<button class="continue-card" data-web-open="'+recent.id+'"><span>'+icon('book')+'</span><div><small>继续上一次探索</small><strong>'+esc(recent.title)+'</strong></div><b>继续 ↗</b></button>':''):'';
  const aside=$('web-learning-aside');aside.hidden=!shared;
  if(shared)aside.innerHTML='<section class="home-explore-card"><span class="web-eyebrow">探索 · 交流 · 创造</span><h3>你的灵感，可以走得更远。</h3><p>动手改变一个条件，观察新的结果。把发现带到社区，和同学一起讨论。</p><button data-library-tab="workshop">'+icon('workshop')+'逛逛创意工坊 <b>↗</b></button><button data-library-tab="forum">'+icon('feedback')+'进入讨论社区 <b>↗</b></button></section><section class="home-discussion-card"><div><h3>最近的讨论</h3><button data-library-tab="forum">全部 ↗</button></div>'+(library.community?.topics?.slice(0,3).map(topic=>'<button data-topic-open="'+topic.id+'"><span>'+esc(topic.title)+'</span><small>'+esc(topic.author.name)+' · '+topic.commentCount+' 条回复</small></button>').join('')||'<p>还没有公开讨论。一个好问题，就能打开新的交流。</p>')+'</section>';
  $('library-result').textContent=items.length+' 份资源';
  $('web-resource-grid').innerHTML=items.map(item=>'<article class="resource-card"><button class="resource-card-open" data-web-open="'+item.id+'" '+(shared?'data-resource-view="shared"':'')+'><div class="resource-card-top"><span class="resource-art">'+icon(item.sceneCount?'scene':'document')+'</span><span class="resource-tag">'+(shared?'教师投送':item.communityPublished?'已发布工坊':item.published?'已投送':'个人资源')+'</span></div><h3>'+esc(item.title)+'</h3><p>'+item.questionCount+' 道题<span>·</span>'+item.sceneCount+' 个场景</p>'+(shared?'<div class="resource-group-tags">'+(item.groups||[]).map(group=>'<span>'+esc(group.name)+'</span>').join('')+'</div>':item.origin?'<p class="resource-origin">二创自 '+esc(item.origin.title)+'</p>':'')+'<div class="resource-card-bottom"><span>'+esc(shared?item.author:'仅自己可见 · '+dateText(item.updatedAt))+'</span><span>打开 ↗</span></div></button>'+(!shared?'<button class="resource-delete" data-web-delete="'+item.id+'" aria-label="删除'+esc(item.title)+'">删除</button>':'')+'</article>').join('');
  $('web-library-empty').hidden=!!items.length;$('library-empty-text').textContent=needle?'没有匹配的资源。':shared?'老师投送至你所在的班级或小组后，资源会显示在这里。':'把一道题或一个想法，变成你的第一份资源。';
  $('web-empty-new').hidden=shared||!!needle;$('web-sample').hidden=!!needle;
}

async function showHome() {
  await hooks?.beforeLeave();
  dockTicket++;dockAutoImmersive=false;aiDock?.detach(document.querySelector('.library-content'));aiUI.setSurface('page');aiUI.hide();
  const exiting=hooks?.context(),exitingMeta=metadata.get(exiting?.id);if(exiting&&exitingMeta?.writable)lastPrivateContext={...exiting,view:'private',meta:{...exitingMeta}};
  hooks?.clear();
  currentId = null; document.body.classList.add('web-home'); document.body.classList.remove('lecture');
  hooks?.syncWorkspace?.();
  $('lecture-mode').textContent = '投屏讲解'; $('web-dashboard').hidden = false; banner.hidden = true;
  $('web-publish').hidden=$('web-unpublish').hidden=$('web-post').hidden=$('web-send-feedback').hidden=$('web-ai-current').hidden=$('web-assignment-return').hidden=true;
  $('paper-title').textContent = '题景 · 物理学习空间';document.title='题景 · 物理学习空间';
  await refreshLibrary();
}

function showEditor(paper) {
  currentId=paper.id;document.body.classList.remove('web-home');$('web-dashboard').hidden=true;
  hooks?.syncWorkspace?.();
  const meta=metadata.get(paper.id),teacher=session?.user.role==='teacher',assignment=meta?.contextType==='assignment',taskContext=!!meta?.assignmentId;
  $('web-ai-current').hidden=taskContext&&meta.aiPolicy==='disabled';$('web-ai-current').disabled=taskContext&&!meta.aiPolicy;
  $('web-ai-current').textContent=taskContext&&!meta.aiPolicy?'读取任务AI策略…':meta?.aiPolicy==='hints'?'AI分步提示':'AI辅导 / 建模';
  $('web-assignment-return').hidden=!taskContext;
  $('web-publish').hidden=!(teacher&&meta?.writable);$('web-publish').textContent=meta?.published?'更新投送版':'投送资源';
  $('web-unpublish').hidden=!(teacher&&meta?.writable&&meta.published);
  $('web-post').hidden=!meta?.writable;$('web-post').textContent=meta?.communityPublished?'更新工坊作品':'发布工坊';
  $('web-send-feedback').hidden=assignment||!(session?.user.role==='student'&&!meta?.writable&&meta?.authorRole==='teacher');
  banner.hidden=!!meta?.writable&&!meta?.origin&&!taskContext;
  $('web-context-text').textContent=assignment?(meta.submissionId?'已提交作品的只读快照 · 本轮提交不会随个人原稿修改。':'学习任务起始材料 · 保存个人副本后再继续搭建。'):taskContext?'任务关联个人原稿 · 修改自动保存，提交需返回任务确认。':meta?.view==='workshop'?'创意工坊作品 · 保存二创会创建独立副本并保留来源。':meta?.origin?'二创自“'+meta.origin.title+'” · '+meta.origin.author:'教师投送快照 · 可以自由探究，保存改编时创建个人副本。';
  $('web-copy').hidden=!!meta?.writable;$('web-copy').textContent=meta?.view==='workshop'?'保存为我的二创':'保存为我的副本';$('web-reload').hidden=assignment;$('web-reload').textContent=meta?.owned&&!meta?.writable?'编辑我的原稿':'打开最新版';
  const strip=$('web-work-view');
  if(meta?.view==='workshop'||assignment){
    strip.hidden=false;strip.innerHTML='<span>'+icon(assignment?'document':'workshop')+' '+esc(meta.author)+' · '+(assignment?'任务快照':'工坊作品')+'</span>'+(meta.originalFiles||[]).map(file=>'<a href="'+esc(file.url)+'" download>'+icon('document')+'下载 '+esc(file.name)+'</a>').join('');
  }else strip.hidden=true;
  document.title=paper.title+' · 题景';
  syncAIControls();
  if(dockWanted&&!aiDock?.isOpen)openAIDock().catch(error=>{if(error.code!=='context_changed')notify(error.message);});
  else editorContextChanged();
  if(taskContext&&!meta.aiPolicy)resolveCurrentContext().catch(error=>{if(error.code!=='context_changed')notify(error.message);});
}

function contextKey(context){const meta=metadata.get(context?.id)||{};return JSON.stringify([context?.id,context?.questionId,context?.sceneId,meta.view||'private',meta.assignmentId]);}
async function resolveCurrentContext(){
 const context=hooks?.context();if(!context)return null;const expected=contextKey(context);let meta=metadata.get(context.id)||{};
 if(meta.assignmentId){
  const task=(await request('/api/assignments/'+meta.assignmentId)).assignment;
  if(!hooks?.context()||contextKey(hooks.context())!==expected){const error=new Error('当前题目或场景已切换');error.code='context_changed';throw error;}
  meta={...meta,assignmentTitle:task.title,aiPolicy:task.mine?'allowed':task.aiPolicy};metadata.set(context.id,meta);
  if(currentId===context.id){$('web-ai-current').hidden=meta.aiPolicy==='disabled';$('web-ai-current').disabled=false;$('web-ai-current').textContent=meta.aiPolicy==='hints'?'AI分步提示':'AI辅导 / 建模';}
  syncAIControls();
 }
 return {...hooks.context(),meta,view:meta.view||'private',...(meta.assignmentId?{assignmentId:meta.assignmentId,assignmentTitle:meta.assignmentTitle,aiPolicy:meta.aiPolicy}:{} )};
}

function syncAIControls(){
 const button=$('web-ai-current'),mobile=$('mobile-ai-current'),open=!!aiDock?.isOpen,meta=metadata.get(currentId);
 button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-controls','web-ai-dock');button.classList.toggle('active',open);
 if(currentId)button.textContent=meta?.assignmentId&&!meta.aiPolicy?'读取任务AI策略…':open?'收起AI侧栏':meta?.aiPolicy==='hints'?'AI分步提示':'AI助手';
 if(mobile){mobile.hidden=button.hidden||!currentId;mobile.disabled=button.disabled;mobile.textContent='AI';mobile.classList.toggle('active',open);mobile.setAttribute('aria-expanded',String(open));mobile.setAttribute('aria-label',open?'收起场景AI侧栏':'展开场景AI侧栏');}
}
function editorContextChanged(){
 syncAIControls();
 if(currentId&&aiDock?.isOpen){fitDockCanvas();Promise.resolve(aiUI.contextChanged()).catch(error=>{if(error.code!=='context_changed')notify(error.message);});}
}
function restoreDockCanvas(){
 if(document.body.classList.contains('workspace-chrome-active')){dockAutoImmersive=false;return;}
 if(!dockAutoImmersive||document.fullscreenElement)return;
 dockAutoImmersive=false;
 const landscape=matchMedia('(max-width:1000px) and (max-height:600px) and (orientation:landscape)').matches;
 if(!landscape&&document.body.classList.contains('canvas-focus'))$('canvas-exit')?.click();
}
function fitDockCanvas(){
 if(document.body.classList.contains('workspace-chrome-active')){dockAutoImmersive=false;return;}
 if(!currentId||$('editor').hidden)return;
 if(matchMedia('(max-width:1000px)').matches){
  if(!document.body.classList.contains('canvas-focus')){dockAutoImmersive=true;$('canvas-focus')?.click();}
 }else restoreDockCanvas();
}
async function openAIDock(){
 if(!session||!currentId)return;
 const ticket=++dockTicket;dockWanted=true;fitDockCanvas();aiUI.setSurface('dock');aiDock.attach(aiUI.element);aiDock.setSection('thread');aiDock.show(aiUI.state());syncAIControls();
 try{await aiUI.showDock();if(ticket===dockTicket&&aiDock.isOpen)aiDock.update(aiUI.state());}
 finally{if(ticket!==dockTicket&&!aiDock.isOpen)aiUI.hide();syncAIControls();}
}
function collapseAIDock(){dockTicket++;dockWanted=false;aiDock?.collapse();aiUI.hide();restoreDockCanvas();syncAIControls();(document.body.classList.contains('canvas-focus')?$('mobile-ai-current'):$('web-ai-current'))?.focus({preventScroll:true});}
async function routeAI({surface='dock'}={}){
 if(surface==='dock'&&currentId)return openAIDock();
 dockTicket++;aiDock?.detach(document.querySelector('.library-content'));aiUI.setSurface('page');return selectTab('ai',false,{preserveAIContext:true});
}

const domainContext = {
  updateUser:user=>{if(session?.user.id===user.id){session={...session,user};renderSessionUser();}},
  openAccount:()=>accountUI.show(),
  request, user:()=>session?.user, notify, run:uiRun, refresh:refreshLibrary, selectTab, meta:()=>metadata.get(currentId),
  context:()=>hooks?.context(),currentContext:resolveCurrentContext,readScene:()=>hooks?.readScene?.(), beforeLeave:()=>hooks?.beforeLeave(),
  prepareAI:source=>hooks.prepareAI(source),openAI:routeAI,onAIState:state=>{aiDock?.update(state);syncAIControls();},
  applyAI:(job,body)=>{const expected=sessionEpoch,userId=session?.user.id;return hooks.applyAI(async()=>{
    if(expected!==sessionEpoch)throw Object.assign(Error('登录身份已改变'),{code:'context_changed'});
    const payload={...body};
    if(job.resourceId){const latest=await request('/api/resources/'+job.resourceId);if(!latest.resource?.writable)throw Error('请先保存为个人副本，再在个人题目中重新生成。');payload.version=latest.resource.version;}
    // Metadata changes only after all old saves are drained inside applyAI.
    const state=await request('/api/ai/jobs/'+job.id+'/apply',{method:'POST',body:payload});
    const actual=await request('/api/me');
    if(actual.user?.id!==userId){changedSession();throw Object.assign(Error('登录身份已改变'),{code:'context_changed'});}
    if(expected!==sessionEpoch)throw Object.assign(Error('登录身份已改变'),{code:'context_changed'});
    session={...session,...actual};return remember(state);
  });},
  openAssignment:id=>assignmentsUI.open(id),
  openTaskAI:task=>{const personalOption=lastPrivateContext&&(!lastPrivateContext.meta.assignmentId||lastPrivateContext.meta.assignmentId===task.id)?lastPrivateContext:null;return aiUI.compose('tutor',{id:task.materialId||undefined,materialId:task.materialId,assignmentId:task.id,title:task.title,assignmentTitle:task.title,aiPolicy:task.mine?'allowed':task.aiPolicy,view:'private',personalOption,meta:{contextType:'assignment',assignmentId:task.id,aiPolicy:task.mine?'allowed':task.aiPolicy}});},
  selectResources:async id=>{await selectTab('shared');$('web-group-filter').value=id;renderLibrary();},
  open:(id,options)=>hooks.open(id,options),adopt:async state=>{remember(state);await hooks.adopt(state);},
  openWork:async id=>{await hooks.beforeLeave();const state=remember(await request('/api/workshop/'+id));workshopUI.remember(state.post);await hooks.adopt(state);},
  published:post=>{const meta=metadata.get(post.resourceId);metadata.set(post.resourceId,{...meta,communityPublished:true,workshopId:post.id});showEditor({id:currentId});},
  resetStudent:user=>{passwordUser=user.id;$('web-reset-name').textContent='为 '+user.displayName+' 设置新密码';$('web-reset-password').value='';$('web-reset-dialog').showModal();}
};
const groupsUI=createGroupsUI(domainContext),workshopUI=createWorkshopUI(domainContext),feedbackUI=createFeedbackUI(domainContext),forumUI=createForumUI(domainContext),assignmentsUI=createAssignmentsUI(domainContext),aiUI=createAIUI(domainContext);
const accountUI=createAccountCenter({...domainContext,openSettings:()=>aiUI.openSettings(),changePassword:()=>{$('web-password-form').reset();$('web-password-error').hidden=true;$('web-account-dialog').showModal();}});
aiDock=createAIDock({onVisibilityChange:syncAIControls,onAction:async (action,{section}={})=>{
 if(action==='collapse'){collapseAIDock();return;}
 if(action==='settings')return aiUI.openSettings();
 if(action==='history')return section==='history'?aiUI.showHistory():aiUI.resume();
 if(action==='new'){
  if(aiUI.state().running){notify('当前请求仍在处理中，请先完成或取消。');return false;}
  const changed=await aiUI.newInquiry();if(changed===false)return false;await aiUI.useCurrentScene();return true;
 }
}});
window.addEventListener('resize',()=>{cancelAnimationFrame(dockLayoutFrame);dockLayoutFrame=requestAnimationFrame(()=>{if(aiDock.isOpen)fitDockCanvas();});});
document.addEventListener('click',event=>{if(event.target.closest('#canvas-exit'))dockAutoImmersive=false;});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)requestAnimationFrame(()=>{if(aiDock.isOpen)fitDockCanvas();else restoreDockCanvas();});});
async function selectTab(tab,deferDomain=false,{preserveAIContext=false}={}){if(!['shared','ai','assignments','workshop','forum','mine','groups','feedback'].includes(tab))return;if(tab==='ai'&&!preserveAIContext)aiUI.clearContext();if(currentId)await showHome();activeTab=tab;$('web-search').value='';renderLibrary({deferDomain});document.querySelector('.library-content').scrollTop=0;}
async function uiRun(event,operation){
  event?.preventDefault();const button=event?.submitter||event?.target?.closest?.('button');if(button?.disabled)return;
  if(button)button.disabled=true;
  try{return await operation();}catch(error){if(error.code!=='context_changed')notify(error.message);}finally{if(button?.isConnected)button.disabled=false;}
}

function resourcePath(id,action){const view=metadata.get(id)?.view;return '/api/resources/'+id+'/'+action+(view&&view!=='private'?'?view='+view:'');}

async function files(input, accept) {
  input.value = ''; if (accept) input.accept = accept;
  return new Promise(resolve => { input.onchange = () => resolve([...input.files]); input.oncancel = () => resolve([]); input.click(); });
}
function base64(bytes) { let value = ''; for (let i = 0; i < bytes.length; i += 32768) value += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(value); }
function download(blob, name) { const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }

async function pdfRenderer() {
  if (!pdfLoading) pdfLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/pdf-browser.js'; script.onload = () => resolve(window.renderExamPDF); script.onerror = () => { pdfLoading = null; reject(Error('PDF 读取组件未能载入，请重试')); }; document.head.append(script);
  });
  return pdfLoading;
}

const handwritingUI=createHandwritingFormulaUI({request,currentContext:resolveCurrentContext});
const host = {
  ready, attach(value) { hooks = value;syncAIControls(); }, readonly(id) { return metadata.get(id)?.writable === false; }, showEditor, showHome,contextChanged:editorContextChanged,
  currentMeta() { return metadata.get(currentId); }, user() { return session?.user; }, notify,
  async recognizeFormula(options={}){if(!session)throw Error('请先登录学习空间。');const expected=sessionEpoch,current=await resolveCurrentContext();if(expected!==sessionEpoch)throw Error('登录身份已改变');return handwritingUI.open({...options,context:current});},
  async composeSceneQuestion(selection={}){
    if(!session)throw Error('请先登录学习空间。');const expected=sessionEpoch,current=await resolveCurrentContext(),key=contextKey(current);
    if(expected!==sessionEpoch)throw Object.assign(Error('登录身份已改变。'),{code:'context_changed'});
    if(current?.sceneKind!=='planar')throw Error('请先打开一个平面场景。');
    if(current.aiPolicy==='disabled'&&session.user.role!=='teacher')throw Error('此作业要求独立完成，不能调用AI。');
    const snapshot=await hooks.readScene();
    if(expected!==sessionEpoch||!hooks.context()||contextKey(hooks.context())!==key)throw Object.assign(Error('当前题目或场景已切换，请重新选择提问对象。'),{code:'context_changed'});
    const draft=buildSceneQuestion(snapshot,selection),result=await aiUI.composeSelection(current,draft);
    if(expected!==sessionEpoch)throw Object.assign(Error('登录身份已改变。'),{code:'context_changed'});return result;
  },
  onClose() {}, onProgress(listener) { progress = listener; },
  saveError(error) {
    if (error.code !== 'version_conflict') return;
    banner.hidden = false; $('web-context-text').textContent = '另一页面已经更新了这份资源。当前修改保留在这里，可以另存副本或打开最新版。';
    $('web-copy').textContent = '另存当前副本'; $('web-reload').hidden = false;
  },
  async call(method, args = {}) {
    await ready;
    const paper = args.paper, id = paper?.id || args.id || currentId;
    const meta = metadata.get(id);
    switch (method) {
      case 'init': { await refreshLibrary(); return {paper: null, papers: library.mine, directory: '服务器个人空间'}; }
      case 'open': return remember(await request('/api/resources/' + id + (args.view ? '?view='+args.view : '')));
      case 'create': return remember(await request('/api/resources', {method: 'POST', body: {title: args.title}}));
      case 'save': { const result = await request('/api/resources/' + id, {method: 'PUT', body: {paper}, version: meta?.version}); metadata.set(id, {...meta, version: result.version, title: paper.title}); return result; }
      case 'documents': {
        const [file] = await files($('web-document-input'));
        if (!file) return null;
        if (file.size > 50 * MB) throw Error('单个文档最多50 MB，请拆分后导入');
        progress({message: '正在读取 ' + file.name});
        const bytes = new Uint8Array(await file.arrayBuffer()); let pages;
        if (file.name.toLowerCase().endsWith('.pdf')) {
          const render = await pdfRenderer();
          pages = await render(bytes, event => progress({message: '读取原页 ' + event.completed + ' / ' + event.total}));
        }
        return request('/api/resources/' + id + '/documents', {method: 'POST', body: {paper, filename: file.name, data: base64(bytes), pages}, version: metadata.get(id)?.version});
      }
      case 'commitDocuments': return remember(await request('/api/resources/' + id + '/commit', {method: 'POST', body: args, version: meta?.version}));
      case 'discardDocuments': return request('/api/imports/' + args.id, {method: 'DELETE'});
      case 'import': {
        const [file] = await files($('web-file-input'), '.tijingexam,.zip,.json,.html');
        if (!file) return null;
        if (file.size > 100 * MB) throw Error('资源文件最多100 MB');
        return remember(await request('/api/import', {method: 'POST', body: {filename: file.name, data: base64(new Uint8Array(await file.arrayBuffer()))}}));
      }
      case 'sample': return remember(await request('/api/sample', {method: 'POST', body: {}}));
      case 'portable': return request(resourcePath(id,'portable'), {method: 'POST', body: args});
      case 'image': {
        const asset = await request('/api/resources/' + id + '/image', {method: 'POST', body: args, version: meta?.version});
        metadata.set(id, {...meta, version: asset.version}); delete asset.version; return asset;
      }
      case 'export': {
        const result = await request(resourcePath(id,'export'), {method: 'POST', body: args, binary: true});
        const name = paper.title + '.' + (args.kind === 'html' ? 'html' : args.kind === 'json' ? 'json' : 'tijingexam');
        download(await result.blob(), name); return {path: name};
      }
      case 'fork': return remember(await request(meta?.view==='workshop'?'/api/workshop/'+meta.workshopId+'/remix':resourcePath(id,'fork'), {method:'POST',body:{paper}}));
      default: throw Error('网页端不支持这个操作');
    }
  }
};
window.examWeb = host;

$('web-auth-form').addEventListener('submit', async event => {
  event.preventDefault(); const register = event.currentTarget.dataset.register === 'true'; $('auth-submit').disabled = true; $('auth-error').hidden = true;
  try {
    const path=wechatPending?'/api/auth/wechat/complete':'/api/auth/'+(register?(event.currentTarget.dataset.role==='teacher'?'teacher-register':'register'):'login');
    const value = await request(path, {method: 'POST', body: {username: $('auth-username').value, password: $('auth-password').value, displayName: $('auth-name').value, inviteCode: $('auth-invite').value}});
    signedIn(value);announceSession('login',value.user.id); if (hooks) await showHome();
  } catch (error) { $('auth-error').textContent = error.message; $('auth-error').hidden = false; }
  finally { $('auth-submit').disabled = false; }
});

$('web-new-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { const state = await host.call('create', {title: $('web-new-title').value}); $('web-new-dialog').close(); activeTab = 'mine'; await hooks.adopt(state); }
  catch (error) { notify(error.message); }
});
$('mobile-nav-select').addEventListener('change',event=>{
  if(event.target.value==='updates'){
    // An informational overlay must not switch the active learning page.
    event.target.value=['workshop','forum','groups','feedback'].includes(activeTab)?activeTab:'';
    updatesUI.open();return;
  }
  uiRun(null,()=>selectTab(event.target.value));
});
$('web-search').addEventListener('input',renderLibrary);$('web-group-filter').addEventListener('change',renderLibrary);
$('web-password-form').addEventListener('submit', async event => {
  event.preventDefault(); $('web-password-error').hidden = true;
  try {
    if ($('web-new-password').value !== $('web-repeat-password').value) throw Error('两次新密码不一致');
    await request('/api/auth/password', {method: 'POST', body: {currentPassword: $('web-old-password').value, password: $('web-new-password').value}});
    $('web-password-form').reset(); $('web-account-dialog').close(); notify('密码已更新，其他设备需要重新登录。');
  } catch (error) { $('web-password-error').textContent = error.message; $('web-password-error').hidden = false; }
});
$('web-reset-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { await request('/api/students/' + passwordUser, {method: 'PUT', body: {password: $('web-reset-password').value}}); $('web-reset-form').reset(); $('web-reset-dialog').close(); notify('学生密码已重置。'); }
  catch (error) { notify(error.message); }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  // Close the account menu before opening a dialog or navigating; otherwise
  // its overlay can cover controls when returning from account settings.
  const userMenu=button.closest('.web-user-menu');if(userMenu)userMenu.open=false;
  try {
    if (button.dataset.webClose) { $(button.dataset.webClose).close(); return; }
    if (button.dataset.libraryTab) { await selectTab(button.dataset.libraryTab); return; }
    if(button.hasAttribute('data-go-mine')){await selectTab('mine');return;}
    if (button.dataset.webOpen) { await hooks.open(button.dataset.webOpen,{view:button.dataset.resourceView}); return; }
    if (button.dataset.webDelete) {
      const item = metadata.get(button.dataset.webDelete);
      if (confirm('删除“' + item.title + '”及其中的题图与场景？删除后无法撤销。')) await request('/api/resources/' + item.id, {method: 'DELETE', version: item.version});
      await refreshLibrary(); return;
    }
    if (button.dataset.studentReset) { passwordUser = button.dataset.studentReset; $('web-reset-name').textContent = '为 ' + button.dataset.studentName + ' 设置新密码'; $('web-reset-password').value = ''; $('web-reset-dialog').showModal(); return; }
    if (button.dataset.studentDisable) { await request('/api/students/' + button.dataset.studentDisable, {method: 'PUT', body: {disabled: button.dataset.disabled === '1'}}); await students(); return; }
    switch (button.id) {
      case 'auth-login-tab': authMode(false); break;
      case 'auth-register-tab': authMode(true); break;
      case 'auth-teacher-tab': authMode('teacher'); break;
      case 'web-account-center': await accountUI.show();break;
      case 'web-home': await showHome(); break;
      case 'web-refresh': await refreshLibrary(); break;
      case 'web-new': case 'web-empty-new': $('web-new-title').value = ''; $('web-new-dialog').showModal(); $('web-new-title').focus(); break;
      case 'web-import': { const value = await host.call('import'); if (value) await hooks.import(value); break; }
      case 'web-sample': await hooks.import(await host.call('sample')); break;
      case 'web-copy': await hooks.copy(); break;
      case 'web-reload': {const meta=metadata.get(currentId);if(meta?.owned&&!meta.writable)await hooks.open(currentId,{view:'private'});else if(confirm('打开服务器最新版？当前未保存的改编会被替换。'))await hooks.reload(currentId,{view:meta?.view});break;}
      case 'web-publish': {await hooks.beforeLeave();const value=await request('/api/groups'),meta=metadata.get(currentId);$('web-publish-summary').textContent='投送“'+$('paper-title').textContent+'”的当前保存版本。';$('web-publish-targets').innerHTML=value.groups.filter(group=>group.writable&&!group.archived).map(group=>'<label class="target-option"><input type="checkbox" value="'+group.id+'" '+(meta.groups?.some(target=>target.id===group.id)?'checked':'')+'><span><strong>'+esc(group.name)+'</strong><small>'+(group.kind==='class'?'行政班':group.legacy?'原学习空间':'学习小组')+' · '+group.memberCount+' 名学生</small></span></label>').join('')||'<p>请先创建行政班或学习小组。</p>';$('web-publish-dialog').showModal();break;}
      case 'web-confirm-publish': {
        const meta = metadata.get(currentId), value = await request('/api/resources/' + currentId + '/publish', {method: 'POST', body: {includeReference: $('web-publish-reference').checked,groupIds:[...document.querySelectorAll('#web-publish-targets input:checked')].map(input=>input.value)}, version: meta.version});
        metadata.set(currentId, value); $('web-publish-dialog').close(); showEditor({id: currentId}); notify('已投送至选定的班级或小组。'); break;
      }
      case 'web-unpublish': {
        const meta = metadata.get(currentId); await request('/api/resources/' + currentId + '/publish', {method: 'DELETE', version: meta.version}); metadata.set(currentId, {...meta, published:false,version:meta.version+1,groups:[]}); showEditor({id: currentId}); notify('共享版已撤下，个人原稿保留。'); break;
      }
      case 'web-account': $('web-password-form').reset(); $('web-password-error').hidden = true; $('web-account-dialog').showModal(); break;
      case 'web-admin': await selectTab('groups'); break;
      case 'web-feedback-inbox': await selectTab('feedback'); break;
      case 'web-post': await workshopUI.publishDialog();break;
      case 'web-send-feedback': await feedbackUI.compose();break;
      case 'web-ai-current': if(aiDock.isOpen)collapseAIDock();else await openAIDock();break;
      case 'web-api-settings': await aiUI.openSettings();break;
      case 'web-assignments-menu': await selectTab('assignments');break;
      case 'web-assignment-return': {const meta=metadata.get(currentId);if(meta?.assignmentId)await assignmentsUI.open(meta.assignmentId);break;}
      case 'web-logout': await hooks.beforeLeave(); await request('/api/auth/logout', {method: 'POST'});announceSession('logout'); showAuth(); authMode(false); break;
    }
  } catch (error) { notify(error.message); }
});

async function refreshWechatStatus(){
  try{const value=await request('/api/auth/wechat/status');$('auth-wechat').disabled=!value.enabled;$('auth-wechat-note').textContent=value.message;
    if(value.pending&&!session){authMode(value.pending.role==='teacher'?'teacher':true);wechatPending=value.pending;$('auth-heading').textContent='完成微信注册';$('auth-name').value=value.pending.nickname||'';$('auth-wechat-note').textContent='微信身份已确认。请设置登录账号和备用密码，完成注册。';}
  }catch(error){if(error.code!=='context_changed')$('auth-wechat-note').textContent='微信状态暂时无法读取，账号密码登录仍可使用。';}
}
$('auth-wechat').addEventListener('click',async()=>{const register=$('web-auth-form').dataset.register==='true',intent=register?($('web-auth-form').dataset.role==='teacher'?'register-teacher':'register-student'):'login';try{$('auth-wechat').disabled=true;const value=await request('/api/auth/wechat/start',{method:'POST',body:{intent}});location.assign(value.url);}catch(error){$('auth-error').textContent=error.message;$('auth-error').hidden=false;$('auth-wechat').disabled=false;}});
request('/api/me').then(async value => {
  $('auth-space-name').textContent = value.className || '与你的题目，继续上一次探索。';
  if (value.user) signedIn(value); else {authMode(false);await refreshWechatStatus();}
  const url=new URL(location.href),result=url.searchParams.get('wechat');
  if(result){url.searchParams.delete('wechat');history.replaceState(null,'',url.pathname+url.search+url.hash);if(result==='bound'&&value.user)await accountUI.show('security');if(result==='error'){$('auth-error').textContent='微信授权未完成或已过期，请重新发起。';$('auth-error').hidden=false;}}
}).catch(error => { $('auth-error').textContent = error.message; $('auth-error').hidden = false; readyReject(error); });
