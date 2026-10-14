import {$,esc,icon} from './web-ui.mjs';

const clean=value=>({configured:!!value?.configured,usePersonal:!!value?.usePersonal,baseURL:value?.baseURL||'',model:value?.model||'',visionModel:value?.visionModel||'',jsonMode:value?.jsonMode!==false});
const redact=(value,key='')=>{let text=String(value?.message||value||'连接失败');if(key)text=text.split(key).join('[密钥已隐藏]');return text.replace(/(?:sk-|Bearer\s+)[a-zA-Z0-9._-]{12,}/g,'[密钥已隐藏]').slice(0,900);};

/** Keys live only in the password input and this request's local payload. */
export function createAISettingsUI(ctx){
 let data=null,scope='personal',editingGroupId='',generation=0,busy=false;
 document.body.insertAdjacentHTML('beforeend','<dialog id="ai-settings-dialog" class="ai-settings-dialog"><div class="dialog-heading"><div><span class="web-eyebrow">连接管理</span><h2>API 连接设置</h2></div><button type="button" id="ai-settings-close" aria-label="关闭API设置">×</button></div><p class="ai-settings-intro">使用教师提供的模型服务，或配置自己的API连接。密钥仅保存在服务器，不会显示给其他用户。</p><div id="ai-settings-summary"></div><div class="ai-settings-tabs" id="ai-settings-tabs" hidden><button type="button" data-ai-settings-scope="shared">教师提供的连接</button><button type="button" data-ai-settings-scope="personal">我的个人连接</button></div><form id="ai-settings-form"><fieldset id="ai-settings-source"><legend>我的使用方式</legend><label><input type="radio" name="ai-connection-source" value="shared">使用教师提供的连接</label><label><input type="radio" name="ai-connection-source" value="personal">使用自己的个人连接</label></fieldset><div class="ai-settings-fields"><label class="text-label">API 服务地址<input id="ai-settings-base-url" type="url" required maxlength="500" placeholder="https://api.deepseek.com/v1" autocomplete="off"><small>支持兼容服务的 HTTPS 公网地址；请填写 API 基础地址，不填写聊天接口路径或密钥参数。</small></label><div class="form-columns"><label class="text-label">对话模型<input id="ai-settings-model" required maxlength="100" placeholder="填写服务商提供的模型名" autocomplete="off"></label><label class="text-label">视觉模型（可选）<input id="ai-settings-vision-model" maxlength="100" placeholder="用于识别图片的模型名" autocomplete="off"><small>留空会尝试使用对话模型；图像能力请用测试图验证。</small></label></div><label class="text-label" for="ai-settings-key">API 密钥<input id="ai-settings-key" type="password" maxlength="4096" autocomplete="new-password" spellcheck="false" placeholder="粘贴新密钥"><small id="ai-settings-key-hint"></small></label><details class="ai-settings-advanced"><summary>高级连接选项</summary><label class="check"><input id="ai-settings-json-mode" type="checkbox" checked>服务支持 JSON 结构化输出</label><p>模型输出仍会经过结构校验、题设检查与原生求解器核验。个人API不会绕过作业的独立完成或仅提示要求。</p></details></div><div id="ai-settings-feedback" class="ai-settings-feedback" role="status" hidden></div><label class="check ai-settings-vision-probe"><input id="ai-settings-probe-vision" type="checkbox">使用测试图验证图像识别能力（不上传私人资料）</label><div class="ai-settings-probe-row"><button type="button" id="ai-settings-probe">'+icon('scene')+' 测试连接</button><span>测试会发送一个小额模型请求，成功后仍需保存。</span></div><div class="dialog-actions"><button type="button" id="ai-settings-clear" class="danger" hidden>删除已保存密钥</button><button type="button" id="ai-settings-cancel">取消</button><button type="submit" id="ai-settings-save" class="primary">保存连接</button></div></form></dialog>');
 const dialog=$('ai-settings-dialog');
 dialog.querySelector('.ai-settings-fields').insertAdjacentHTML('beforebegin','<label class="ai-settings-group-choice"><span id="ai-settings-group-label">教学连接</span><select id="ai-settings-target-group" aria-label="选择班级或小组的模型连接"></select><small id="ai-settings-group-hint"></small></label><button id="ai-settings-inherit" type="button" hidden>恢复继承默认教学连接</button>');
 dialog.querySelector('[data-ai-settings-scope=shared]').textContent='我的教学连接';
 function feedback(message='',type='info'){const box=$('ai-settings-feedback');box.textContent=message;box.hidden=!message;box.className='ai-settings-feedback '+type;}
 function updateSourceState(){const disabled=scope==='personal'&&dialog.querySelector('[name="ai-connection-source"]:checked')?.value==='shared';const fields=dialog.querySelector('.ai-settings-fields');fields.querySelectorAll('input').forEach(input=>input.disabled=disabled||busy);fields.hidden=disabled;dialog.querySelector('.ai-settings-vision-probe').hidden=disabled;dialog.querySelector('.ai-settings-probe-row').hidden=disabled;dialog.querySelector('.ai-settings-group-choice').hidden=scope==='personal'&&!disabled;$('ai-settings-probe').disabled=disabled||busy;$('ai-settings-clear').hidden=disabled||!current().configured;}
 function setBusy(value){busy=value;for(const button of dialog.querySelectorAll('button'))button.disabled=value;for(const input of dialog.querySelectorAll('#ai-settings-source input'))input.disabled=value;$('ai-settings-target-group').disabled=value;dialog.setAttribute('aria-busy',String(value));updateSourceState();}
 function current(){return data?.[scope]||clean(null);}
 function clearInput(){$('ai-settings-key').value='';}
 function render(){
  const config=current();$('ai-settings-tabs').hidden=!data?.canManageShared;$('ai-settings-source').hidden=scope!=='personal';
  dialog.querySelectorAll('[data-ai-settings-scope]').forEach(b=>b.classList.toggle('active',b.dataset.aiSettingsScope===scope));
  $('ai-settings-base-url').value=config.baseURL;$('ai-settings-model').value=config.model;$('ai-settings-vision-model').value=config.visionModel;$('ai-settings-json-mode').checked=config.jsonMode;
  clearInput();$('ai-settings-probe-vision').checked=false;$('ai-settings-key-hint').textContent=config.configured?'已保存密钥；留空将保留原密钥。其他用户无法读取。':'未保存密钥；使用此连接前需填写有效密钥。';
  const choices=(data?.teachingGroups||[]).filter(group=>scope!=='shared'||group.writable);
  $('ai-settings-target-group').innerHTML=choices.map(group=>'<option value="'+esc(group.id)+'">'+esc(group.name)+(group.kind==='default'?'':' · '+esc(group.ownerName))+'</option>').join('')||'<option value="">暂无可用的教学连接</option>';
  $('ai-settings-target-group').value=scope==='shared'?editingGroupId:data?.activeGroupId||'';
  $('ai-settings-group-label').textContent=scope==='shared'?'为哪个教学范围配置 API':'选择你要使用的教学连接';
  $('ai-settings-group-hint').textContent=scope==='shared'?(editingGroupId?(data?.sharedInherited?'当前继承默认连接。保存后仅覆盖这个班级或小组。':'这是该班级或小组的专属连接，只供其成员使用。'):'作为你名下班级和小组的默认连接，其他教师无法读取或修改。'):(data?.unavailable?'原来的连接已不可用，请选择当前所属班级或小组。':'只列出你有权使用的连接。使用教师服务时，无需填写或知道其密钥。');
  $('ai-settings-inherit').hidden=scope!=='shared'||!editingGroupId||!!data?.sharedInherited;
  dialog.querySelector('[name="ai-connection-source"][value="'+(data?.personal.usePersonal?'personal':'shared')+'"]').checked=true;$('ai-settings-clear').hidden=!config.configured;
  const active=data?.activeTeaching||data?.shared,activeName=data?.teachingGroups.find(group=>group.id===data.activeGroupId)?.name||'教学连接';
  $('ai-settings-summary').innerHTML='<div class="ai-settings-connection '+(active?.configured?'ready':'unconfigured')+'"><span>'+icon('group')+'</span><div><strong>'+esc(activeName)+'</strong><small>'+esc(active?.configured?'已配置 · '+(active.model||'模型可用'):'尚未配置或不可用，请联系负责教师')+'</small></div><b>'+esc(data?.activeSource==='shared'?'当前使用':'教学服务')+'</b></div><div class="ai-settings-connection '+(data?.personal.configured?'ready':'unconfigured')+'"><span>'+icon('bookmark')+'</span><div><strong>我的个人连接</strong><small>'+esc(data?.personal.configured?'已配置 · '+(data.personal.model||'模型可用'):'可选；仅用于你自己的请求')+'</small></div><b>'+esc(data?.activeSource==='personal'?'当前使用':'私人服务')+'</b></div>';
  updateSourceState();feedback('');
 }
 async function load(){const ticket=generation,value=await ctx.request('/api/ai/settings'+(scope==='shared'&&editingGroupId?'?groupId='+encodeURIComponent(editingGroupId):''));if(ticket!==generation)return;data={...value,shared:clean(value.shared),personal:clean(value.personal),canManageShared:!!value.canManageShared};render();}
 async function show(){generation++;const ticket=generation;scope=ctx.user()?.role==='teacher'?'shared':'personal';editingGroupId='';clearInput();feedback('正在读取已保存的连接状态…');dialog.showModal();try{await load();}catch(e){if(ticket===generation&&e.code!=='context_changed')feedback(redact(e),'error');}}
 function hide(){generation++;clearInput();dialog.close();feedback('');}
 function payload({clearKey=false,validate=true}={}){
  const body={scope,baseURL:$('ai-settings-base-url').value.trim(),model:$('ai-settings-model').value.trim(),visionModel:$('ai-settings-vision-model').value.trim(),jsonMode:$('ai-settings-json-mode').checked};
  if(scope==='shared')body.groupId=editingGroupId;
  if(scope==='personal')body.usePersonal=dialog.querySelector('[name="ai-connection-source"]:checked')?.value==='personal';
  if(scope==='personal'&&data?.teachingGroups.some(group=>group.id===$('ai-settings-target-group').value))body.selectedGroupId=$('ai-settings-target-group').value;
  const key=$('ai-settings-key').value.trim();if(key)body.apiKey=key;if(clearKey){body.clearKey=true;if(scope==='personal')body.usePersonal=false;}
  if(validate&&!clearKey){
   if(!body.baseURL||!body.model)throw Error('请填写 API 服务地址与对话模型。');
   let url;try{url=new URL(body.baseURL);}catch{throw Error('请填写有效的 HTTPS API 基础地址。');}
   if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('API地址必须是 HTTPS 公网地址，不能带账号、密钥参数或片段。');
   if(!key&&!current().configured&&(scope==='shared'||body.usePersonal))throw Error('此连接尚未保存密钥，请先填写 API 密钥。');
  }
  return body;
 }
 async function save(event){
  event.preventDefault();if(busy)return;const ticket=generation;let body;
  try{
   // Switching back to shared does not require a configured personal service.
   const useShared=scope==='personal'&&dialog.querySelector('[name="ai-connection-source"]:checked')?.value==='shared';
   body=useShared?{scope:'personal',usePersonal:false,...(data?.teachingGroups.some(group=>group.id===$('ai-settings-target-group').value)?{selectedGroupId:$('ai-settings-target-group').value}:{})}:payload();
   setBusy(true);feedback('正在保存连接…');await ctx.request('/api/ai/settings',{method:'PUT',body});if(ticket!==generation)return;clearInput();await load();feedback('连接已保存。新的AI请求将使用当前选定的来源。','success');await ctx.onAIConnectionChanged?.();
  }catch(e){if(ticket===generation&&e.code!=='context_changed')feedback(redact(e,body?.apiKey||$('ai-settings-key').value),'error');}finally{if(ticket===generation)setBusy(false);}
 }
 async function probe(){
  if(busy)return;const ticket=generation;let body;
  try{body=payload();body.vision=$('ai-settings-probe-vision').checked;setBusy(true);feedback('正在向选定的服务发送测试请求…');const result=await ctx.request('/api/ai/settings/probe',{method:'POST',body});if(ticket!==generation)return;const connected=result.connected===true||result.ok===true;feedback(connected?'连接测试通过：'+(result.provider||'兼容模型服务')+' · '+(result.model||body.model)+(result.usage?.totalTokens?' · 本次 '+result.usage.totalTokens+' tokens':'')+(result.visionVerified?'；图像能力已用测试图验证。':'；本次未验证图像识别能力。')+(result.limitations?.length?' '+result.limitations.map(v=>redact(v)).join('；'):'')+'请保存连接后使用。':'测试未确认连通，请核对地址、模型和密钥。',connected?'success':'error');}
  catch(e){if(ticket===generation&&e.code!=='context_changed')feedback(redact(e,body?.apiKey||$('ai-settings-key').value),'error');}finally{if(ticket===generation)setBusy(false);}
 }
 async function removeKey(){
  if(busy)return;const warning=scope==='shared'?'删除所选教学连接的密钥？使用此连接的学生将暂时无法调用模型。':'删除你的个人密钥？之后将改用教师提供的统一连接。';
  if(!confirm(warning))return;const ticket=generation;
  try{const body={scope,clearKey:true,...(scope==='shared'?{groupId:editingGroupId}:{})};setBusy(true);await ctx.request('/api/ai/settings',{method:'PUT',body});if(ticket!==generation)return;clearInput();await load();feedback('已删除所选连接的密钥。','success');await ctx.onAIConnectionChanged?.();}catch(e){if(ticket===generation&&e.code!=='context_changed')feedback(redact(e),'error');}finally{if(ticket===generation)setBusy(false);}
 }
 $('ai-settings-form').addEventListener('submit',save);$('ai-settings-probe').addEventListener('click',probe);$('ai-settings-clear').addEventListener('click',removeKey);$('ai-settings-close').addEventListener('click',hide);$('ai-settings-cancel').addEventListener('click',hide);
 dialog.addEventListener('click',async event=>{const b=event.target.closest('[data-ai-settings-scope]');if(!b||busy)return;scope=b.dataset.aiSettingsScope;if(scope==='shared'&&!data?.canManageShared){scope='personal';return;}editingGroupId='';try{setBusy(true);await load();}catch(e){feedback(redact(e),'error');}finally{setBusy(false);}});
 $('ai-settings-target-group').addEventListener('change',async()=>{if(scope!=='shared'||busy)return;const next=$('ai-settings-target-group').value;if($('ai-settings-key').value&&!confirm('切换教学范围会清空尚未保存的密钥输入，继续？')){$('ai-settings-target-group').value=editingGroupId;return;}editingGroupId=next;try{setBusy(true);await load();}catch(e){feedback(redact(e),'error');}finally{setBusy(false);}});
 $('ai-settings-inherit').addEventListener('click',async()=>{if(busy||!editingGroupId||!confirm('恢复继承后，这个班级或小组将使用你的默认教学连接，继续？'))return;try{setBusy(true);await ctx.request('/api/ai/settings',{method:'PUT',body:{scope:'shared',groupId:editingGroupId,inherit:true}});await load();feedback('已恢复继承默认教学连接。','success');await ctx.onAIConnectionChanged?.();}catch(e){feedback(redact(e),'error');}finally{setBusy(false);}});
 dialog.addEventListener('change',event=>{if(event.target.name==='ai-connection-source')updateSourceState();});
 dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();return;}generation++;clearInput();feedback('');});dialog.addEventListener('close',clearInput);
 return {show,reset(){generation++;clearInput();dialog.close();data=null;feedback('');$('ai-settings-summary').replaceChildren();$('ai-settings-base-url').value='';$('ai-settings-model').value='';$('ai-settings-vision-model').value='';setBusy(false);}};
}
