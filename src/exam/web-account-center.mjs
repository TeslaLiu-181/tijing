import {$,esc,icon} from './web-ui.mjs';
const themes={teal:'青绿',blue:'湖蓝',amber:'暖金',violet:'浅紫',rose:'玫瑰'};
const interests=value=>[...new Set(value.split(/[,，;；\n]/).map(item=>item.trim()).filter(Boolean))];

export function createAccountCenter(ctx){
 let data=null,groups=[],draft={},generation=0,busy=false,dirty=false,teachers=[],resetTarget=null;
 document.body.insertAdjacentHTML('beforeend',`<dialog id="account-center" aria-labelledby="account-center-title">
  <header class="account-center-heading"><div><span class="web-eyebrow">你的空间，由你定义</span><h2 id="account-center-title">账号与个性化</h2></div><button type="button" id="account-center-close" aria-label="关闭账号中心">${icon('close')}</button></header>
  <nav class="account-center-tabs" role="tablist" aria-label="账号设置分类">
   <button type="button" role="tab" data-account-tab="profile" aria-controls="account-pane-profile">个人资料</button>
   <button type="button" role="tab" data-account-tab="security" aria-controls="account-pane-security">登录与安全</button>
   <button type="button" role="tab" data-account-tab="teaching" aria-controls="account-pane-teaching">班级与模型</button>
   <button type="button" role="tab" data-account-tab="admin" aria-controls="account-pane-admin" hidden>教师管理</button>
  </nav>
  <div id="account-center-status" role="status" aria-live="polite" hidden></div>
  <div class="account-center-body">
   <section id="account-pane-profile" role="tabpanel" aria-label="个人资料"><form id="account-profile-form">
    <div class="account-profile-grid"><div class="account-fields">
     <h3>让大家认识你</h3><p class="account-help">这些资料展示在个人主页，对平台内已登录用户可见。无需填写真实姓名或联系方式。</p>
     <div class="account-field-pair"><label>昵称<input id="account-name" maxlength="30" required autocomplete="nickname"></label><label>个人签名<input id="account-headline" maxlength="60" placeholder="例如：用实验回答每一个好奇"></label></div>
     <div class="account-field-pair"><label>学科<input id="account-subject" maxlength="30" placeholder="例如：物理"></label><label>学段／年级<input id="account-grade" maxlength="30" placeholder="例如：高中"></label></div>
     <label>个人简介<textarea id="account-bio" maxlength="300" rows="3" placeholder="分享你的教学方向、学习方法或正在探索的问题。"></textarea><small>最多 300 字，可留空。</small></label>
     <label>兴趣课题<input id="account-interests" maxlength="180" placeholder="电磁场，实验探究，动态几何"><small>用逗号分隔，最多 8 个标签，每个最多 20 字。</small></label>
     <div class="account-topic-suggestions" aria-label="选择兴趣课题">${['电磁场','力学建模','天体运动','实验探究','动态几何','AI与物理'].map(tag=>`<button type="button" data-account-interest="${tag}">${tag}</button>`).join('')}</div>
     <fieldset class="account-theme-picker"><legend>主页主题色</legend>${Object.entries(themes).map(([value,label])=>`<label class="account-theme ${value}"><input type="radio" name="account-color" value="${value}" aria-label="${label}"><span>${label}</span></label>`).join('')}</fieldset>
    </div><aside class="account-preview-column"><span class="account-preview-label">主页预览</span><div id="account-profile-preview"></div>
     <div class="account-image-actions"><button type="button" id="account-avatar-upload">${icon('upload')} 上传头像</button><button type="button" id="account-avatar-clear">恢复默认头像</button><button type="button" id="account-cover-upload">${icon('upload')} 上传背景图</button><button type="button" id="account-cover-clear">使用主题背景</button></div>
     <label class="account-cover-position" id="account-cover-position-label" hidden>背景显示位置<input id="account-cover-position" type="range" min="0" max="100" value="50"></label>
     <p class="account-help">JPG、PNG 或 WebP，单张不超过 4 MB。头像会裁剪成正方形，保存资料后生效。</p>
    </aside></div>
    <footer class="account-form-footer"><span id="account-save-hint">按自己的节奏，留下探索的足迹。</span><div><button type="button" id="account-profile-reload">重新读取</button><button type="submit" class="web-primary">保存个人资料</button></div></footer>
   </form></section>
   <section id="account-pane-security" role="tabpanel" aria-label="登录与安全" hidden><div id="account-security-content"></div></section>
   <section id="account-pane-teaching" role="tabpanel" aria-label="班级与模型" hidden><div id="account-teaching-content"></div></section>
   <section id="account-pane-admin" role="tabpanel" aria-label="教师管理" hidden><div class="account-section-intro"><h3>教师账号管理</h3><p>教师自助创建独立空间。平台管理员可停用账号或重置登录密码，各教师的 API 密钥保持私有。</p></div><div id="account-teacher-list"></div>
    <form id="account-teacher-reset-form" class="account-reset-form" hidden><h4 id="account-teacher-reset-title"></h4><label>新登录密码<input id="account-teacher-reset-password" type="password" minlength="8" maxlength="128" required autocomplete="new-password"></label><div><button type="button" id="account-teacher-reset-cancel">取消</button><button class="web-primary" type="submit">保存新密码</button></div></form>
   </section>
  </div><input id="account-avatar-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><input id="account-cover-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>
 </dialog>`);
 const dialog=$('account-center');
 function status(message='',error=false){const node=$('account-center-status');node.textContent=message;node.hidden=!message;node.classList.toggle('is-error',error);}
 function setBusy(value){busy=value;dialog.setAttribute('aria-busy',String(value));for(const control of dialog.querySelectorAll('button,input,textarea'))control.disabled=value||control.hasAttribute('data-account-unavailable');}
 function close(){if(busy)return false;if(dirty&&!confirm('个人资料尚未保存，确定离开？'))return false;generation++;dialog.close();dirty=false;return true;}
 function tab(name){for(const button of dialog.querySelectorAll('[data-account-tab]')){const selected=button.dataset.accountTab===name;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}for(const section of dialog.querySelectorAll('[role=tabpanel]'))section.hidden=section.id!=='account-pane-'+name;if(name==='admin')loadTeachers();}
 function formValue(){return {displayName:$('account-name').value.trim(),headline:$('account-headline').value.trim(),subject:$('account-subject').value.trim(),grade:$('account-grade').value.trim(),bio:$('account-bio').value.trim(),interests:interests($('account-interests').value),color:dialog.querySelector('[name=account-color]:checked')?.value||'teal',avatarId:draft.avatarId,coverId:draft.coverId,coverPosition:Number($('account-cover-position').value)};}
 function preview(){
  const p=formValue(),name=p.displayName||'你的昵称',role=data?.user.isPlatformAdmin?'平台管理员':data?.user.role==='teacher'?'教师':'学生';
  $('account-profile-preview').innerHTML=`<article class="account-preview-card ${p.color}"><div class="account-preview-cover">${draft.coverURL?`<img src="${esc(draft.coverURL)}" alt="背景预览" style="object-position:50% ${p.coverPosition}%">`:`<span aria-hidden="true">${icon('scene')}</span>`}</div><div class="account-preview-info"><span class="account-preview-avatar">${draft.avatarURL?`<img src="${esc(draft.avatarURL)}" alt="头像预览">`:esc(name.slice(0,1))}</span><span class="account-role-badge">${role}</span><h3>${esc(name)}</h3><p>${esc(p.headline||'每个新问题，都是探索的开始。')}</p><small>${esc([p.subject,p.grade].filter(Boolean).join(' · '))}</small><div class="account-preview-tags">${p.interests.slice(0,8).map(tag=>`<span># ${esc(tag)}</span>`).join('')}</div></div></article>`;
  $('account-cover-position-label').hidden=!draft.coverURL;
  for(const button of dialog.querySelectorAll('[data-account-interest]'))button.setAttribute('aria-pressed',String(p.interests.includes(button.dataset.accountInterest)));
 }
 function render(){
  const p=data.profile;draft={avatarId:p.avatarId,coverId:p.coverId,avatarURL:p.avatarURL,coverURL:p.coverURL};
  for(const [id,key]of [['name','name'],['headline','headline'],['subject','subject'],['grade','grade'],['bio','bio']])$('account-'+id).value=p[key]||'';
  $('account-interests').value=p.interests.join('，');$('account-cover-position').value=p.coverPosition;
  dialog.querySelector(`[name=account-color][value="${p.color}"]`).checked=true;
  dialog.querySelector('[data-account-tab=admin]').hidden=!data.user.isPlatformAdmin;
  $('account-save-hint').textContent='按自己的节奏，留下探索的足迹。';preview();renderSecurity();renderTeaching();dirty=false;
 }
 function renderSecurity(){
  const wx=data.wechat;
  $('account-security-content').innerHTML=`<div class="account-section-intro"><h3>安心登录，继续探索</h3><p>账号是你的登录标识，修改昵称不会改变登录账号。</p></div>
   <article class="account-setting-row"><span class="account-setting-icon">${icon('key')}</span><div><h4>账号与密码</h4><p>登录账号：${esc(data.user.username)}</p><small>修改密码后，其他设备需要重新登录。</small></div><button type="button" data-account-action="password">修改密码</button></article>
   <article class="account-setting-row"><span class="account-setting-icon">${icon('link')}</span><div><h4>微信绑定 <span class="account-status-badge">${wx.bound?'已绑定':wx.enabled?'可绑定':'待开通'}</span></h4><p>${esc(wx.bound?'可以使用微信扫码登录这个账号。':wx.message)}</p></div><button type="button" data-account-action="${wx.bound?'unbind':'bind'}" ${!wx.enabled&&!wx.bound?'disabled data-account-unavailable':''}>${wx.bound?'解除绑定':'绑定微信'}</button></article>
   <form id="account-wechat-unbind-form" class="account-reset-form" hidden><label>当前登录密码<input id="account-wechat-password" type="password" required autocomplete="current-password"></label><p class="account-help">解除绑定后仍可使用账号密码登录。</p><button class="web-primary" type="submit">确认解除绑定</button></form>
   ${data.user.isPlatformAdmin&&!wx.enabled?'<p class="account-help">开通微信需要已审核的网站应用、回调域名及服务器配置。接入完成前，账号密码注册与登录正常使用。</p>':''}`;
  $('account-wechat-unbind-form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const ticket=generation;try{setBusy(true);const result=await ctx.request('/api/account/wechat',{method:'DELETE',body:{password:$('account-wechat-password').value}});if(ticket!==generation)return;data.wechat=result;renderSecurity();status('微信绑定已解除。');}catch(error){if(ticket===generation)status(error.message,true);}finally{if(ticket===generation)setBusy(false);}});
 }
 function renderTeaching(){
  const teacher=data.user.role==='teacher';
  $('account-teaching-content').innerHTML=`<div class="account-section-intro"><h3>${teacher?'属于你的教学空间':'你的班级与学习伙伴'}</h3><p>${teacher?'创建班级、管理学习小组，再为不同教学场景配置合适的模型服务。':'在所属班级与小组中接收资料，并选择教师提供的模型服务。'}</p></div>
   <div class="account-shortcuts"><button type="button" data-account-action="groups">${icon('group')}<strong>${teacher?'管理班级与小组':'查看班级与小组'}</strong><span>${groups.length} 个班级／小组</span>${icon('chevron-right')}</button><button type="button" data-account-action="api">${icon('sparkles')}<strong>API 连接与分配</strong><span>${teacher?'默认教学连接 · 班级／小组专属配置':'教师授权的连接 · 我的个人连接'}</span>${icon('chevron-right')}</button></div>
   <div class="account-group-chips">${groups.map(group=>`<span>${esc(group.name)}<small>${group.kind==='class'?'行政班':'学习小组'}</small></span>`).join('')||'<p class="account-help">还没有班级或小组。'+(teacher?'可以先创建一个班级，并将邀请码提供给学生。':'请联系教师获取加入方式。')+'</p>'}</div>
   <p class="account-help">${teacher?'教学连接只提供给你管理的班级与小组；其他教师无法覆盖或读取你的密钥。':'教师的密钥不会下发到浏览器。个人 API 仍受作业中的 AI 使用规则约束。'}</p>`;
 }
 async function load(){const ticket=generation;const [account,space]=await Promise.all([ctx.request('/api/account'),ctx.request('/api/groups')]);if(ticket!==generation)return;data=account;groups=space.groups.filter(group=>!group.archived);render();}
 async function show(name='profile'){const ticket=++generation;dirty=false;data=null;dialog.showModal();setBusy(true);status('正在读取账号资料…');try{await load();if(ticket!==generation)return;tab(name);status('');}catch(error){if(ticket===generation)status(error.message,true);}finally{if(ticket===generation)setBusy(false);}}
 async function loadTeachers(){const ticket=generation;try{const result=await ctx.request('/api/account/admin/teachers');if(ticket!==generation)return;teachers=result.teachers;
  $('account-teacher-list').innerHTML=teachers.map(t=>`<article class="account-teacher-row"><span class="account-teacher-initial">${esc(t.displayName.slice(0,1))}</span><div><strong>${esc(t.displayName)}</strong><small>${esc(t.username)} · ${t.groupCount} 个班级／小组</small></div><span class="account-status-badge">${t.isPlatformAdmin?'平台管理员':t.disabled?'已停用':'正常'}</span>${!t.isPlatformAdmin?`<button type="button" data-account-teacher-reset="${t.id}">重置密码</button><button type="button" data-account-teacher-toggle="${t.id}">${t.disabled?'恢复账号':'停用账号'}</button>`:''}</article>`).join('');
 }catch(error){if(ticket===generation)status(error.message,true);}}
 $('account-profile-form').addEventListener('input',()=>{dirty=true;$('account-save-hint').textContent='资料有修改，保存后会更新到个人主页。';preview();});
 $('account-profile-form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const value=formValue();if(value.interests.length>8||value.interests.some(tag=>tag.length>20)){status('最多8个兴趣课题，每个不超过20字。',true);return;}const ticket=generation;
  try{setBusy(true);status('正在保存资料…');const result=await ctx.request('/api/account/profile',{method:'PUT',body:value,version:data.profile.version});if(ticket!==generation)return;data={...data,...result};ctx.updateUser(result.user);render();status('个人资料已保存，主页和头像已更新。');}catch(error){if(ticket===generation)status(error.message,true);}finally{if(ticket===generation)setBusy(false);}});
 async function upload(kind,file){if(!file)return;if(file.size>4*1024*1024){status('请选择4 MB以内的图片。',true);return;}const ticket=generation;
  try{setBusy(true);status('正在处理图片…');const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('未能读取图片'));reader.readAsDataURL(file);});
   if(ticket!==generation)return;const result=await ctx.request('/api/account/images',{method:'POST',body:{kind,data:encoded}});if(ticket!==generation)return;draft[kind+'Id']=result.id;draft[kind+'URL']=result.url;dirty=true;preview();status('图片已预览，点击“保存个人资料”后生效。');
  }catch(error){if(ticket===generation)status(error.message,true);}finally{if(ticket===generation){setBusy(false);$('account-'+kind+'-file').value='';}}
 }
 for(const kind of ['avatar','cover']){
  $('account-'+kind+'-upload').addEventListener('click',()=>$('account-'+kind+'-file').click());
  $('account-'+kind+'-file').addEventListener('change',event=>upload(kind,event.target.files[0]));
  $('account-'+kind+'-clear').addEventListener('click',()=>{draft[kind+'Id']=draft[kind+'URL']=null;dirty=true;preview();});
 }
 $('account-profile-reload').addEventListener('click',async()=>{if(dirty&&!confirm('重新读取会放弃尚未保存的修改，继续？'))return;try{setBusy(true);await load();status('已读取最新资料。');}catch(error){status(error.message,true);}finally{setBusy(false);}});
 $('account-center-close').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.querySelector('[role=tablist]').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...dialog.querySelectorAll('[data-account-tab]')].filter(b=>!b.hidden),index=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();buttons[next].click();});
 dialog.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button||busy)return;try{
  if(button.dataset.accountTab){tab(button.dataset.accountTab);return;}
  if(button.dataset.accountInterest){const tags=interests($('account-interests').value),tag=button.dataset.accountInterest,next=tags.includes(tag)?tags.filter(value=>value!==tag):[...tags,tag];if(next.length>8){status('最多选择8个兴趣课题。',true);return;}$('account-interests').value=next.join('，');dirty=true;preview();return;}
  if(button.dataset.accountTeacherReset){resetTarget=teachers.find(t=>t.id===button.dataset.accountTeacherReset);$('account-teacher-reset-title').textContent='为 '+resetTarget.displayName+' 重置登录密码';$('account-teacher-reset-form').reset();$('account-teacher-reset-form').hidden=false;$('account-teacher-reset-password').focus();return;}
  if(button.dataset.accountTeacherToggle){const t=teachers.find(t=>t.id===button.dataset.accountTeacherToggle);if(!confirm(t.disabled?'恢复 '+t.displayName+' 的账号？':'停用 '+t.displayName+'？该教师将无法登录，所属教学连接不再接受新请求。已有班级和资料保留。'))return;await ctx.request('/api/account/admin/teachers/'+t.id,{method:'PUT',body:{disabled:!t.disabled}});await loadTeachers();status('账号状态已更新。');return;}
  const action=button.dataset.accountAction;
  if(action==='unbind'){$('account-wechat-unbind-form').hidden=false;$('account-wechat-password').focus();return;}
  if(action==='bind'){if(dirty){status('请先保存个人资料，再绑定微信。',true);return;}const result=await ctx.request('/api/auth/wechat/start',{method:'POST',body:{intent:'bind'}});location.assign(result.url);return;}
  if(action&&close()){if(action==='groups')await ctx.selectTab('groups');if(action==='api')await ctx.openSettings();if(action==='password')ctx.changePassword();}
 }catch(error){status(error.message,true);}});
 $('account-teacher-reset-cancel').addEventListener('click',()=>{$('account-teacher-reset-form').reset();$('account-teacher-reset-form').hidden=true;resetTarget=null;});
 $('account-teacher-reset-form').addEventListener('submit',async event=>{event.preventDefault();if(!resetTarget||busy)return;try{setBusy(true);await ctx.request('/api/account/admin/teachers/'+resetTarget.id,{method:'PUT',body:{password:$('account-teacher-reset-password').value}});$('account-teacher-reset-form').reset();$('account-teacher-reset-form').hidden=true;resetTarget=null;status('登录密码已重置，该教师需要重新登录。');}catch(error){status(error.message,true);}finally{setBusy(false);}});
 return {show,reset(){generation++;dialog.close();data=null;groups=[];draft={};teachers=[];resetTarget=null;dirty=false;busy=false;setBusy(false);$('account-avatar-file').value='';$('account-cover-file').value='';$('account-profile-form').reset();$('account-teacher-reset-form').reset();$('account-teacher-reset-form').hidden=true;for(const id of ['account-profile-preview','account-security-content','account-teaching-content','account-teacher-list'])$(id).replaceChildren();status('');}};
}
