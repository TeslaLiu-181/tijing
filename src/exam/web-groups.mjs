import {$,esc,icon,copyText} from './web-ui.mjs';

export function createGroupsUI(ctx) {
  let library=null, editing=null, roster=null, students=[], selected=new Set();
  const panel=document.createElement('div');panel.id='web-groups-panel';panel.hidden=true;document.querySelector('.library-content').append(panel);
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="group-edit-dialog"><div class="dialog-heading"><h2 id="group-edit-heading">创建行政班</h2><button data-web-close="group-edit-dialog" aria-label="关闭">×</button></div>
      <form id="group-edit-form"><label class="text-label">名称<input id="group-edit-name" required maxlength="50"></label><label class="text-label">说明<textarea id="group-edit-description" rows="3" maxlength="300" placeholder="写下这个班级或小组的用途"></textarea></label>
      <label id="group-invite-label" class="text-label">注册邀请码<input id="group-edit-invite" minlength="6" maxlength="64" autocomplete="off"><small>新学生使用行政班邀请码注册，将获得对应的行政班归属。</small></label>
      <p id="group-edit-note" class="web-subtle"></p><div class="dialog-actions"><button type="button" data-web-close="group-edit-dialog">取消</button><button class="primary" type="submit">保存</button></div></form></dialog>
    <dialog id="group-members-dialog"><div class="dialog-heading"><div><span class="web-eyebrow" id="group-roster-eyebrow">教师管理</span><h2 id="group-roster-title">管理成员</h2></div><button data-web-close="group-members-dialog" aria-label="关闭">×</button></div>
      <p id="group-roster-note" class="web-subtle"></p><div class="roster-tools"><input id="group-roster-search" placeholder="搜索昵称或账号" aria-label="搜索学生"><select id="group-roster-class" aria-label="按行政班筛选"></select><button id="group-roster-all" type="button">选中当前筛选</button></div>
      <div id="group-roster-list"></div><div class="dialog-actions"><span id="group-roster-count"></span><button id="group-roster-assign" class="primary" type="button">添加选中学生</button></div></dialog>
  `);
  const groups = () => library?.groups || [];
  function render(value) {
    library=value;const teacher=ctx.user()?.role==='teacher',classes=groups().filter(group=>group.kind==='class'),learning=groups().filter(group=>group.kind==='learning');
    const card=group=>'<article class="group-card '+(group.archived?'is-archived':'')+'"><div class="group-card-top"><span class="group-art">'+icon(group.kind==='class'?'class':'group')+'</span><span class="resource-tag">'+(group.legacy?'原学习空间':group.archived?'已归档':group.kind==='class'?'行政班':'学习小组')+'</span></div><h3>'+esc(group.name)+'</h3><p>'+esc(group.description || (group.kind==='class'?'每名学生只有一个行政班，由教师调整归属。':'可跨班组合，学生可以参加多个学习小组。'))+'</p><div class="group-card-meta"><span>'+group.memberCount+' 名学生</span><button data-group-resources="'+group.id+'">查看投送 '+icon('book')+'</button></div>'+(teacher&&group.writable?'<div class="group-card-actions"><button data-group-members="'+group.id+'">管理成员</button><button data-group-edit="'+group.id+'">编辑</button>'+(group.inviteCode?'<button data-group-copy="'+group.id+'">复制邀请码</button>':'')+'<button data-group-archive="'+group.id+'">'+(group.archived?'恢复':'归档')+'</button></div>':'')+'</article>';
    const section=(title,items,kind)=>'<section class="group-section"><div class="section-heading"><h2>'+title+'<span>'+items.filter(group=>!group.archived).length+'</span></h2>'+(teacher?'<button data-new-group="'+kind+'" class="secondary-button">＋ 新建'+(kind==='class'?'行政班':'小组')+'</button>':'')+'</div>'+(items.length?'<div class="group-grid">'+items.map(card).join('')+'</div>':'<div class="section-empty">'+(kind==='class'?'行政班归属待教师确认。':'老师创建学习小组并添加成员后，会显示在这里。')+'</div>')+'</section>';
    panel.innerHTML='<div class="page-heading"><span class="web-eyebrow">'+(teacher?'组织教学 · 分层投送':'一起学习 · 各自探索')+'</span><h1>'+(teacher?'班级与学习小组':'我的班级与小组')+'</h1><p>行政班确定归属，学习小组连接不同的学习需求。</p></div>'+(teacher?'<div class="dashboard-stats"><div><span>行政班</span><strong>'+classes.filter(group=>!group.archived).length+'</strong></div><div><span>学习小组</span><strong>'+learning.filter(group=>!group.archived&&!group.legacy).length+'</strong></div><div><span>学生账号</span><strong>'+value.studentCount+'</strong></div><button id="group-pending"><span>行政班待确认</span><strong>'+value.pendingClassCount+'</strong><small>查看并安排归属 ↗</small></button></div>':'')+
      section('行政班',teacher?classes:value.administrativeClass?[value.administrativeClass]:[],'class')+section('学习小组',learning,'learning');
  }
  function openEdit(group,kind) {
    editing=group||{kind};$('group-edit-heading').textContent=(group?'编辑':'创建')+(editing.kind==='class'?'行政班':'学习小组');
    $('group-edit-name').value=group?.name||'';$('group-edit-description').value=group?.description||'';
    $('group-invite-label').hidden=editing.kind!=='class'&&!editing.legacy;$('group-edit-invite').value=group?.inviteCode||'';
    $('group-edit-invite').required=editing.kind==='class'&&!!group;$('group-edit-invite').placeholder='留空时自动生成';
    $('group-edit-note').textContent=editing.kind==='class'?'每名学生只能有一个行政班，已有学生可在成员管理中调整归属。':'成员由教师选择，可跨行政班组合，不会改变学生的行政班。';
    $('group-edit-dialog').showModal();$('group-edit-name').focus();
  }
  async function openRoster(group,pending=false) {
    roster=group||null;selected=new Set();students=(await ctx.request('/api/students')).students;
    $('group-roster-title').textContent=group?group.name+' · 成员':'确认学生行政班';
    $('group-roster-note').textContent=group?.kind==='learning'?'选择需要加入的学生。移出小组会停止后续小组投送，账号与个人资源保留。':'选择学生和目标行政班。调整后仅改变行政归属，学习小组与个人资源保留。';
    const classes=groups().filter(group=>group.kind==='class'&&!group.archived);
    $('group-roster-class').innerHTML='<option value="">全部行政班</option><option value="pending">行政班待确认</option>'+classes.map(group=>'<option value="'+group.id+'">'+esc(group.name)+'</option>').join('');
    $('group-roster-search').value='';$('group-roster-class').value=pending?'pending':'';
    let target=$('group-roster-target');if(target)target.remove();
    if(!group){target=document.createElement('select');target.id='group-roster-target';target.setAttribute('aria-label','选择目标行政班');target.innerHTML='<option value="">选择目标行政班</option>'+classes.map(group=>'<option value="'+group.id+'">'+esc(group.name)+'</option>').join('');$('group-roster-count').before(target);}
    $('group-roster-assign').hidden=false;$('group-roster-assign').textContent=group?.kind==='learning'?'添加选中学生':'调整行政班';
    renderRoster();$('group-members-dialog').showModal();
  }
  function filteredStudents(){
    const value=$('group-roster-search').value.trim().toLowerCase(),classId=$('group-roster-class').value;
    return students.filter(student=>(!value||(student.displayName+' '+student.username).toLowerCase().includes(value))&&(!classId||(classId==='pending'?!student.classId:student.classId===classId)));
  }
  function isMember(student){return roster&&(roster.kind==='class'?student.classId===roster.id:student.groupIds.includes(roster.id));}
  function renderRoster(){
    $('group-roster-list').innerHTML=filteredStudents().map(student=>'<div class="roster-row"><label><input type="checkbox" data-group-student="'+student.id+'" '+(isMember(student)?'checked disabled':selected.has(student.id)?'checked':'')+'><span class="student-avatar">'+esc(student.displayName.slice(0,1))+'</span><span><strong>'+esc(student.displayName)+'</strong><small>'+esc(student.username)+' · '+esc(student.className||'行政班待确认')+(student.disabled?' · 已停用':'')+'</small></span></label><div class="roster-row-actions">'+(isMember(student)&&roster.kind==='learning'?'<button data-group-remove="'+student.id+'">移出</button>':'')+'<button data-group-reset="'+student.id+'">重置密码</button><button data-group-disable="'+student.id+'" data-disabled="'+Number(!student.disabled)+'">'+(student.disabled?'启用':'停用')+'</button></div></div>').join('')||'<p class="web-subtle">没有匹配的学生。</p>';
    $('group-roster-count').textContent='已选择 '+selected.size+' 名学生';
  }
  $('group-roster-search').addEventListener('input',renderRoster);$('group-roster-class').addEventListener('change',renderRoster);
  $('group-edit-form').addEventListener('submit',event=>ctx.run(event,async()=>{
    const body={name:$('group-edit-name').value,description:$('group-edit-description').value};
    if(!$('group-invite-label').hidden&&$('group-edit-invite').value.trim())body.inviteCode=$('group-edit-invite').value.trim();
    const result=editing.id?await ctx.request('/api/groups/'+editing.id,{method:'PUT',body,version:editing.version}):await ctx.request('/api/groups',{method:'POST',body:{...body,kind:editing.kind}});
    $('group-edit-dialog').close();await ctx.refresh();ctx.notify('已保存'+(result.kind==='class'?'行政班':'学习小组')+'。');
  }));
  document.addEventListener('change',event=>{const id=event.target.dataset.groupStudent;if(id){event.target.checked?selected.add(id):selected.delete(id);$('group-roster-count').textContent='已选择 '+selected.size+' 名学生';}});
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    const action=async()=>{
      if(button.dataset.newGroup){openEdit(null,button.dataset.newGroup);return;}
      if(button.dataset.groupEdit){openEdit(groups().find(group=>group.id===button.dataset.groupEdit));return;}
      if(button.dataset.groupResources){await ctx.selectResources(button.dataset.groupResources);return;}
      if(button.dataset.groupMembers){await openRoster(groups().find(group=>group.id===button.dataset.groupMembers));return;}
      if(button.dataset.groupCopy){const group=groups().find(group=>group.id===button.dataset.groupCopy);ctx.notify(await copyText(group.inviteCode)?'邀请码已复制。':'复制未完成，请在编辑窗口选中邀请码。');return;}
      if(button.dataset.groupArchive){const group=groups().find(group=>group.id===button.dataset.groupArchive);if(!group.archived&&!confirm('归档“'+group.name+'”？将停止新注册和新投送，已有成员仍可查看保留的资源。'))return;await ctx.request('/api/groups/'+group.id,{method:'PUT',body:{archived:!group.archived},version:group.version});await ctx.refresh();return;}
      if(button.dataset.groupReset){ctx.resetStudent(students.find(student=>student.id===button.dataset.groupReset));return;}
      if(button.dataset.groupDisable){await ctx.request('/api/students/'+button.dataset.groupDisable,{method:'PUT',body:{disabled:button.dataset.disabled==='1'}});await openRoster(roster);return;}
      if(button.dataset.groupRemove){if(!confirm('从这个学习小组移出该学生？账号和个人资源保留。'))return;await ctx.request('/api/groups/'+roster.id+'/members/'+button.dataset.groupRemove,{method:'DELETE'});await ctx.refresh();await openRoster(groups().find(group=>group.id===roster.id));return;}
      if(button.id==='group-pending'){await openRoster(null,true);return;}
      if(button.id==='group-roster-all'){for(const student of filteredStudents())if(!isMember(student))selected.add(student.id);renderRoster();return;}
      if(button.id==='group-roster-assign'){const id=roster?.id||$('group-roster-target').value;if(!id)throw Error('请选择目标行政班');if(!selected.size)throw Error('请先选择学生');await ctx.request('/api/groups/'+id+'/members',{method:'POST',body:{userIds:[...selected]}});await ctx.refresh();await openRoster(groups().find(group=>group.id===id));ctx.notify('成员已更新。');}
    };
    if(button.dataset.newGroup||Object.keys(button.dataset).some(key=>key.startsWith('group'))||button.id.startsWith('group-'))ctx.run(event,action);
  });
  return {render,show(value){render(value);panel.hidden=false;},hide(){panel.hidden=true;},reset(){library=null;students=[];roster=null;editing=null;selected.clear();panel.replaceChildren();$('group-roster-list').replaceChildren();}};
}
