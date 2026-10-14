import {$,esc,icon,dateText} from './web-ui.mjs';
import {markdown} from './source-view.mjs';
import {createAISettingsUI} from './web-ai-settings.mjs';
import {createScenePreview} from './ai-scene-preview.mjs';
import {renderAIActivity,renderSceneChanges,hasSourcePreview} from './web-ai-activity.mjs';

const modes={tutor:{name:'答疑辅导',hint:'讲清概念、逐步提示，或检查你的推理',icon:'feedback'},scene:{name:'搭建场景',hint:'生成独立变式，先核对题设与物理证据',icon:'scene'},extract:{name:'识别题目',hint:'从图片、PDF、Word中整理可确认题干',icon:'document'},review:{name:'核查思路',hint:'检查条件、单位、公式和已有场景',icon:'book'}};
const terminal=new Set(['completed','failed','cancelled','interrupted','applied']);
const itemText=value=>typeof value==='string'?value:value?.text||value?.message||value?.description||value?.label||JSON.stringify(value);
const list=(values,empty)=>values?.length?'<ul>'+values.map(v=>'<li>'+markdown(itemText(v))+'</li>').join('')+'</ul>':'<p class="ai-empty-note">'+esc(empty)+'</p>';
const number=value=>value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value).toLocaleString('zh-CN'):'—';
const metric=value=>Number.isFinite(Number(value))?(Number(value)!==0&&(Math.abs(Number(value))<.001||Math.abs(Number(value))>1e6)?Number(value).toExponential(3):Number(value).toLocaleString('zh-CN',{maximumSignificantDigits:6})):'—';

export function createAIUI(ctx){
 const sourceCache=new Map();let sourceZoom=1;
 let historyCursor=null,historyLoading=false,historySequence=0;
 let config=null,jobs=new Map(),current=null,activeJob=null,mode='tutor',source=null,files=[],followup=null,pollTimer=null,epoch=0,sourceEpoch=0,shown=false,surface='page',section='thread',submitting=false,pendingSource=null;
 const sourceByJob=new Map();
 const panel=document.createElement('section');panel.id='web-ai-panel';panel.hidden=true;document.querySelector('.library-content').append(panel);
 panel.innerHTML='<div class="ai-page-heading"><div><span class="web-eyebrow">AI 探究助手 · 有依据地推理</span><h1>从“看懂”，到“亲手验证”。</h1><p>围绕选中的问题逐步探究。题设、演示假设和物理核验分开呈现，生成内容由你决定是否保存。</p></div><div class="ai-heading-settings"><button id="ai-settings-open">API连接设置</button><span class="ai-heading-mark" aria-hidden="true">ƒ</span></div></div><div class="ai-layout"><main><section class="ai-compose-card"><div class="ai-mode-tabs" role="tablist" aria-label="选择AI任务">'+Object.entries(modes).map(([key,value])=>'<button data-ai-mode="'+key+'" role="tab" aria-selected="'+(key==='tutor')+'">'+icon(value.icon)+value.name+'</button>').join('')+'</div><form id="ai-request-form"><p id="ai-mode-description"></p><p id="ai-scene-capability" class="ai-capability-note" hidden></p><div id="ai-context" hidden></div><div class="ai-guidance-row"><label for="ai-guidance">辅导方式</label><select id="ai-guidance"><option value="hint">只提示下一步</option><option value="explain" selected>讲清概念与公式</option><option value="check">检查我的推理</option><option value="solution">完整推导</option></select></div><label class="ai-prompt-label" for="ai-prompt">写下问题、目标或你已经尝试的推理</label><textarea id="ai-prompt" data-math-editor rows="5" maxlength="8000" required placeholder="例如：我不理解磁场力为什么不做功。请先解释方向关系，再引导我用场景观察。"></textarea><div class="ai-attachment-area"><label class="ai-file-button" for="ai-files">'+icon('document')+' 添加资料<input id="ai-files" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf,.docx,.doc,.txt,.md"></label><span>图片 / PDF / Word · 最多4个，每个12MB</span></div><div id="ai-files-list"></div><p id="ai-attachment-note" class="ai-subtle">只发送你在这里选择的文件。识别资料临时保留24小时；确认导入题干后，原件与原页一并保存至你的个人资源。</p><div id="ai-followup-note" hidden></div><label class="ai-consent"><input id="ai-consent" type="checkbox" required><span>同意将本次选中的题目、场景与附件发送给 <strong id="ai-provider-name">模型服务</strong> 处理；不会自动发送其他个人文档。</span></label><div id="ai-request-error" class="web-error" hidden role="alert"></div><div class="ai-submit-row"><span id="ai-config-status"></span><button id="ai-submit" type="submit" class="web-primary">开始探究 '+icon('scene')+'</button></div></form></section><section id="ai-result-panel" hidden aria-live="polite"></section><section id="ai-first-note" class="ai-first-note"><div>'+icon('scene')+'</div><h2>先提问，再验证。</h2><p>“下一步提示”帮助你自己找到思路；“搭建场景”会调用原生求解器检查模型。扫描题目中看不清的条件会保留待确认。</p><div><button data-ai-example="tutor">为什么磁场力不做功？</button><button data-ai-example="review">检查我的单位与条件</button><button data-ai-example="extract">从一份资料整理题目</button></div></section></main><aside><section class="ai-side-card"><div class="section-heading"><h3>今日使用</h3><button id="ai-refresh" aria-label="刷新AI用量与历史">↻</button></div><div id="ai-usage"></div><p class="ai-subtle">请求失败或取消也可能已消耗模型服务用量。用量以服务器记录为准。</p></section><section class="ai-side-card"><div class="section-heading"><h3>我的探究记录</h3><button id="ai-history-new">新探究</button></div><div id="ai-history-list"></div><button id="ai-history-more" hidden>加载更早记录</button><p id="ai-history-error" class="web-error" hidden role="alert"></p></section><section class="ai-side-card ai-guide-card"><h3>模型能帮你做什么？</h3><p><strong>题目理解</strong>：识别条件，保留不清楚的文字。</p><p><strong>推理辅导</strong>：给提示、解释关系、检查过程。</p><p><strong>物理场景</strong>：生成变式，实际运行后给出核验摘要。</p><small>答疑文本是模型推理；只有显示原生核验的场景或读数，才经过程序检查。</small></section></aside></div>';
 document.body.insertAdjacentHTML('beforeend','<dialog id="ai-source-full-dialog" class="ai-source-full-dialog"><div class="dialog-heading"><h2 id="ai-source-full-caption">原页对照</h2><button type="button" data-web-close="ai-source-full-dialog" aria-label="关闭原页">×</button></div><div class="ai-source-zoom-controls"><button type="button" data-ai-source-zoom="out" aria-label="缩小原页">−</button><span id="ai-source-zoom-label">100%</span><button type="button" data-ai-source-zoom="in" aria-label="放大原页">＋</button><button type="button" data-ai-source-zoom="fit">适配</button></div><div class="ai-source-full-wrap"><img id="ai-source-full-image" alt="放大的本人上传原页"></div></dialog>');
 $('ai-source-full-dialog').addEventListener('click',event=>{const button=event.target.closest('[data-ai-source-zoom]');if(!button)return;sourceZoom=button.dataset.aiSourceZoom==='fit'?1:Math.max(.5,Math.min(4,sourceZoom*(button.dataset.aiSourceZoom==='in'?1.25:.8)));$('ai-source-full-image').style.width=(sourceZoom*100)+'%';$('ai-source-zoom-label').textContent=Math.round(sourceZoom*100)+'%';});
 $('ai-source-full-dialog').addEventListener('close',()=>{$('ai-source-full-image').removeAttribute('src');$('ai-source-full-caption').textContent='';});
 const settings=createAISettingsUI({...ctx,onAIConnectionChanged:refresh}),scenePreview=createScenePreview(ctx);
 const composeToggle=document.createElement('button');composeToggle.type='button';composeToggle.className='ai-compose-toggle';composeToggle.setAttribute('aria-controls','ai-request-form');panel.querySelector('.ai-compose-card').append(composeToggle);
 function setComposerCollapsed(collapsed){panel.classList.toggle('ai-compose-collapsed',!!collapsed);composeToggle.setAttribute('aria-expanded',String(!collapsed));composeToggle.textContent=collapsed?($('ai-prompt').value.trim()?'展开输入 · 草稿已保留 ↑':'继续提问 · 展开输入 ↑'):'收起输入，阅读答复 ↓';composeToggle.title=collapsed?'展开输入区，继续编辑；不会自动发送':'保留草稿、附件与发送选项，为答复腾出阅读空间';}
 composeToggle.addEventListener('click',()=>setComposerCollapsed(!panel.classList.contains('ai-compose-collapsed')));setComposerCollapsed(false);
 $('ai-prompt').addEventListener('focus',()=>setComposerCollapsed(false));
 $('ai-consent').nextElementSibling.innerHTML='同意发送本轮选中内容至 <strong id="ai-provider-name">模型服务</strong>';
 $('ai-consent').closest('label').title='本轮题目、选中场景与手动添加的资料会发送给所选模型服务；不会自动发送其他个人文档。';
 $('ai-submit').innerHTML='发送 ↑';$('ai-submit').title='发送本轮请求 · Ctrl+Enter';
 $('ai-prompt').addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();$('ai-request-form').requestSubmit();}});
 $('ai-context').insertAdjacentHTML('afterend','<div id="ai-context-change-note" class="ai-context-change-note" hidden></div><div id="ai-active-request" class="ai-active-request" hidden></div>');
 function error(message){if(message)setComposerCollapsed(false);$('ai-request-error').textContent=message||'';$('ai-request-error').hidden=!message;}
 const scopeKey=value=>[value?.id||value?.resourceId||'',value?.questionId||'',value?.sceneId||'',value?.view||value?.meta?.view||'private',value?.assignmentId||value?.meta?.assignmentId||''].join('|');
 function editorContext(){const value=ctx.context?.();if(!value)return null;const meta=value.meta||ctx.meta?.()||{};return {...value,id:value.id||value.resourceId,view:value.view||meta.view||'private',assignmentId:value.assignmentId||meta.assignmentId,meta};}
 const requestText=job=>job?.mode==='tutor'?String(job.prompt||'').replace(/^【辅导方式】(?:只给下一步提示，不直接给完整答案。|讲清概念与公式，并引导我验证。|检查我给出的推理，指出依据与待改进处。|给出完整推导，逐项标明适用条件。)\n【我的问题】/,''):String(job?.prompt||'');
 const sourceLabel=value=>value?.historicalUnknown?'历史记录：原上下文标签不可得':[...new Set([value?.assignmentTitle||value?.title,value?.questionTitle,value?.sceneTitle].filter(Boolean))].join(' · ')||(value?.assignmentId?'任务说明':value?.id?'已选资源':'本次提问 / 附件');
 function jobSource(job){
  if(!job)return null;const cached=sourceByJob.get(job.id),u=job.uiContext;
  if(!u&&!cached)return {id:job.resourceId,questionId:job.questionId,sceneId:job.sceneId,assignmentId:job.assignmentId,assignmentTitle:job.assignmentTitle,aiPolicy:job.aiPolicy,view:'unknown',historicalUnknown:true};
  const value={...cached,id:job.resourceId,questionId:job.questionId,sceneId:job.sceneId,assignmentId:job.assignmentId,assignmentTitle:job.assignmentTitle,aiPolicy:job.aiPolicy,
   title:u?.resourceTitle||cached?.title,questionTitle:u?.questionTitle||cached?.questionTitle,sceneTitle:u?.sceneTitle||cached?.sceneTitle,view:u?.view||cached?.view||'private'};
  const editor=editorContext();if(editor&&scopeKey(editor)===scopeKey(value))value.sceneKind=editor.sceneKind;
  return value;
 }
 function syncActive(){activeJob=[...jobs.values()].find(job=>!terminal.has(job.status))||null;}
 function state(){const phase=activeJob?.phase||(submitting?'正在提交本轮请求':''),scopeLabel=sourceLabel(activeJob?jobSource(activeJob):submitting?pendingSource:source||jobSource(current));return {running:!!activeJob||submitting,phase,scopeLabel,contextLabel:scopeLabel,status:phase||'可继续探究',section,surface};}
 function emitState(){ctx.onAIState?.(state());}
 function renderActive(){const area=$('ai-active-request');area.hidden=!activeJob||activeJob.id===current?.id;area.innerHTML=area.hidden?'':'<span>正在处理 '+esc(sourceLabel(jobSource(activeJob)))+' · '+esc(activeJob.phase||'处理中')+'</span><button type="button" id="ai-cancel-active">取消这个任务</button>';emitState();}
 function editorChanged(){
  const editor=editorContext(),area=$('ai-context-change-note');area.hidden=!editor;
  const different=!!source&&scopeKey(editor)!==scopeKey(source);area.hidden=!editor||!!source&&!different&&!source.historicalUnknown;area.dataset.changed=String(different||!!source?.historicalUnknown);
  area.innerHTML=editor?'<span>'+esc(different?'当前画布已切换到 '+sourceLabel(editor)+'；本轮来源仍为 '+sourceLabel(source):'当前画布：'+sourceLabel(editor))+'</span><button type="button" id="ai-use-current-context">'+(activeJob?'下一轮使用当前场景':'使用当前场景')+'</button>':'';emitState();
 }
 async function normalizeSource(){
  const ticket=epoch,before=editorContext();let value;
  try{value=await (ctx.currentContext?.()||ctx.context?.());}catch(error){if(ticket!==epoch)throw Object.assign(Error('登录身份已改变。'),{code:'context_changed'});throw error;}
  if(ticket!==epoch)throw Object.assign(Error('登录身份已改变。'),{code:'context_changed'});
  const after=editorContext(),meta=value?.meta||ctx.meta?.()||{};
  if(before&&(!after||scopeKey(before)!==scopeKey(after))){const error=new Error('当前题目或场景已切换，请重新选择本轮来源。');error.code='context_changed';throw error;}
  if(!value?.id&&!value?.resourceId&&!value?.assignmentId)return null;
  return {...value,id:value.id||value.resourceId,view:value.view||meta.view||'private',meta:{...meta},aiPolicy:value.aiPolicy||meta.aiPolicy||'allowed',assignmentId:value.assignmentId||meta.assignmentId,assignmentTitle:value.assignmentTitle||meta.assignmentTitle};
 }
 async function useCurrentScene(){const ticket=epoch,sourceTicket=sourceEpoch;let next;try{next=await normalizeSource();}catch(error){if(ticket!==epoch)return false;throw error;}if(ticket!==epoch||sourceTicket!==sourceEpoch)return false;if(!next){ctx.notify('请先打开题目或场景，再选择本轮来源。');return false;}source=next;sourceEpoch++;followup=null;$('ai-consent').checked=false;$('ai-followup-note').hidden=true;renderContext();setMode(mode);editorChanged();return true;}
 function setSurface(value){surface=value==='dock'?'dock':'page';panel.classList.toggle('ai-docked',surface==='dock');panel.dataset.aiSurface=surface;emitState();}
 function threadTurns(job){
  const previous=[],seen=new Set([job.id]);let parent=job.uiContext?.followupTo;
  while(parent&&previous.length<32&&!seen.has(parent)){seen.add(parent);const turn=jobs.get(parent);if(!turn)break;previous.unshift(turn);parent=turn.uiContext?.followupTo;}
  return previous.length?'<div class="ai-chat-turns">'+previous.map(turn=>'<article class="ai-chat-previous-turn"><div class="ai-chat-user community-markdown">'+markdown(requestText(turn))+'</div><div class="ai-chat-turn-meta"><span>'+esc(modes[turn.mode]?.name||'AI 探究')+' · '+dateText(turn.createdAt)+'</span><button type="button" data-ai-open-job="'+esc(turn.id)+'">查看这一轮</button></div><div class="ai-chat-assistant community-markdown">'+markdown(turn.result?.answer||turn.error?.message||turn.phase||'')+'</div></article>').join('')+'</div>':'';
 }
 async function loadThread(id){const ticket=epoch,value=await ctx.request('/api/ai/jobs/'+id+'/thread');if(ticket!==epoch)return;for(const job of value.items||[])jobs.set(job.id,job);if(current?.id===id&&jobs.has(id))current=jobs.get(id);}
 function restriction(){return source?.assignmentId?source.aiPolicy:null;}
 function renderContext(){
  const area=$('ai-context'),included=$('ai-include-context')?.checked,personalIncluded=$('ai-use-personal-option')?.checked;area.hidden=!source;if(!source){area.replaceChildren();editorChanged();return;}
  area.innerHTML='<div><span>'+icon(source.assignmentId?'group':'book')+'</span><p><strong>'+esc(sourceLabel(source))+'</strong><small>'+esc([source.questionTitle,source.sceneTitle].filter(Boolean).join(' · ')||(source.assignmentId?source.materialId?'任务说明与起始材料中的默认题目':'当前任务说明':'当前选中题目'))+'</small></p><button type="button" id="'+(source.assignmentId?'ai-back-assignment':'ai-back-resource')+'">'+(source.assignmentId?'返回任务 ↗':'返回题目 ↗')+'</button></div><label><input type="checkbox" id="ai-include-context" '+(source.assignmentId?'checked disabled':included!==false?'checked':'')+'> '+(source.assignmentId?'本轮使用任务说明'+(source.id?'与选中资料':''):'附带当前题目'+(source.sceneId?'与选中场景（服务器保存版本）':''))+'</label>'+(source.personalOption?'<label><input type="checkbox" id="ai-use-personal-option" '+(personalIncluded?'checked':'')+'>改为附带最近保存的个人题目 / 场景：'+esc(source.personalOption.title)+' · '+esc(source.personalOption.questionTitle||'')+'</label>':'')+(source.assignmentId?'<p class="ai-assignment-policy">'+esc(source.aiPolicy==='disabled'?'此作业由教师设置为独立完成，不能调用AI。':source.aiPolicy==='hints'?'此作业仅允许分步提示与思路核查；识别导入与自动建模不可用。':'此作业允许使用AI，提交时请注明如何使用了AI。')+'</p>':'');editorChanged();
 }
 function spatialSource(){if(!source)return false;const included=!!source.assignmentId||($('ai-include-context')?.checked??true);if(!included)return false;const selected=source.personalOption&&$('ai-use-personal-option')?.checked?source.personalOption:source;return !!selected.sceneKind&&selected.sceneKind!=='planar';}
 function setMode(next){
  syncActive();if(!modes[next])return;if(restriction()==='hints'&&['scene','extract'].includes(next)||spatialSource()&&next==='scene')next='tutor';mode=next;
  panel.querySelectorAll('[data-ai-mode]').forEach(b=>{const selected=b.dataset.aiMode===mode;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));b.disabled=restriction()==='disabled'||restriction()==='hints'&&['scene','extract'].includes(b.dataset.aiMode)||spatialSource()&&b.dataset.aiMode==='scene';});
  $('ai-mode-description').textContent=modes[mode].hint;$('ai-scene-capability').hidden=!spatialSource()&&mode!=='scene';$('ai-scene-capability').textContent=spatialSource()?'当前选中的是三维场景。本轮AI自动建模只支持平面电磁场；可以继续答疑与检查，三维沙盒仍可手动交互。':'自动建模当前支持平面带电粒子电磁场；其他场景请保留待确认条件。';$('ai-guidance').closest('.ai-guidance-row').hidden=mode!=='tutor';$('ai-guidance').querySelector('[value="solution"]').disabled=restriction()==='hints';
  if(restriction()==='hints'&&$('ai-guidance').value==='solution')$('ai-guidance').value='hint';
  $('ai-submit').disabled=!config?.configured||restriction()==='disabled'||!!activeJob||submitting;renderContext();renderActive();
 }
 function renderFiles(){$('ai-files-list').innerHTML=files.map((file,i)=>'<div class="ai-file-chip">'+icon('document')+'<span>'+esc(file.name)+'<small>'+number((file.size/1048576).toFixed(2))+' MB</small></span><button type="button" data-ai-remove-file="'+i+'" aria-label="移除'+esc(file.name)+'">×</button></div>').join('');}
 function renderUsage(){
  const usage=config?.usage||{},tokenUsed=Number(usage.reservedTokens)||0,tokenLimit=Number(usage.tokenLimit)||0;$('ai-provider-name').textContent=config?.provider||'模型服务';
  $('ai-config-status').textContent=config?.configured?(config.model||'模型已连接'):'未连接模型：可配置个人接口，或使用教师提供的统一接口';$('ai-config-status').classList.toggle('is-unconfigured',!config?.configured);
  $('ai-usage').innerHTML='<div class="ai-usage-value"><strong>'+number(usage.remainingCalls)+'</strong><span>今日剩余次数</span></div><div class="ai-usage-meta"><span>已用 '+number(usage.calls)+' 次</span><span>上限 '+number(usage.callLimit)+' 次</span></div><div class="ai-token-usage"><div><span>已用或预留 Token</span><strong>'+number(usage.reservedTokens)+' / '+number(usage.tokenLimit)+'</strong></div><div class="ai-token-track"><i style="width:'+(tokenLimit?Math.min(100,tokenUsed/tokenLimit*100):0)+'%"></i></div><p>次数与 Token 均受限；运行或失败请求可能暂按预留量计入。</p></div>';
 }
 function renderHistory(){
  $('ai-history-more').hidden=!historyCursor;$('ai-history-more').disabled=historyLoading;$('ai-history-more').textContent=historyLoading?'正在读取更早记录…':'加载更早记录';
  const groups=new Map();for(const j of [...jobs.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))){const key=j.uiContext?.threadId||j.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(j);}
  const turnRow=j=>'<div class="ai-history-row '+(j.id===current?.id?'active':'')+'"><button data-ai-open-job="'+esc(j.id)+'"><span>'+esc(modes[j.mode]?.name||'AI探究')+' <i class="ai-history-status '+esc(j.status)+'">'+esc(j.phase||j.status)+'</i></span><strong>'+esc(requestText(j).slice(0,72))+'</strong><small>'+dateText(j.createdAt)+'</small></button><button data-ai-delete-job="'+esc(j.id)+'" aria-label="删除这一轮记录">×</button></div>';
  $('ai-history-list').innerHTML=[...groups.values()].map(turns=>{const j=turns[0];return '<section class="ai-history-thread"><button class="ai-history-thread-title" data-ai-open-job="'+esc(j.id)+'"><strong>'+esc(j.uiContext?.threadTitle||requestText(j).slice(0,72))+'</strong><small>'+dateText(j.updatedAt)+' · '+Math.max(j.uiContext?.turn||1,turns.length)+'轮</small></button>'+(turns.length>1?'<details><summary>查看已载入的 '+turns.length+' 轮记录</summary>'+turns.map(turnRow).join('')+'</details>':turnRow(j))+'</section>';}).join('')||'<p class="ai-empty-note">还没有探究记录。只有你能查看自己的请求与上传资料摘要。</p>';
 }
 function groundingView(g){
  if(!g)return '';const names={chargeSign:'电荷正负',magneticDirection:'磁场方向','numeric-massKg':'质量','numeric-chargeC':'电荷量','numeric-speedMS':'速率','numeric-magneticMagnitudeT':'磁感应强度','numeric-electricMagnitudeVm':'电场强度','numeric-species-massU':'粒子预设质量','numeric-species-chargeE':'粒子预设电荷'},units={'numeric-massKg':'kg','numeric-chargeC':'C','numeric-speedMS':'m/s','numeric-magneticMagnitudeT':'T','numeric-electricMagnitudeVm':'V·m⁻¹','numeric-species-massU':'u','numeric-species-chargeE':'e'},types={particle:'粒子',field:'磁场',parameter:'自由量',electric:'电场',source:'粒子源'},direction=(kind,value)=>kind==='chargeSign'?value>0?'正电':value<0?'负电':'中性':kind==='magneticDirection'?value>0?'纸面外 ⊙':value<0?'纸面内 ×':'零场':units[kind]&&Number.isFinite(Number(value))?metric(value)+' '+units[kind]:itemText(value);
  return '<details class="ai-grounding"><summary>题设对照与提案实际参数（程序读取）</summary><p>这里显示提案真正采用的值。演示赋值须与原题字母关系区分；数值核验不代表所有题意都已被理解。</p>'+(g.checked?.length?'<table><thead><tr><th>核对项</th><th>识别条件</th><th>提案实际值</th><th>结果</th></tr></thead><tbody>'+g.checked.map(c=>'<tr><td>'+esc(names[c.kind]||c.kind)+'</td><td>'+esc(direction(c.kind,c.expected))+'</td><td>'+esc(direction(c.kind,c.actual))+'</td><td>'+esc(c.pass?'一致':'矛盾')+'</td></tr>').join('')+'</tbody></table>':'<p>本轮未匹配可自动核对的明确条件，需人工对照题设。</p>')+list(g.contradictions,'')+'<div class="ai-grounding-facts">'+(g.facts||[]).map(f=>'<div><strong>'+esc(f.label||f.id)+'</strong><span>'+esc(types[f.kind]||f.kind)+'</span><p>'+[
  f.chargeE!==undefined?'电荷 '+metric(f.chargeE)+' e（'+(f.chargeE>0?'正电':f.chargeE<0?'负电':'中性')+'）':'',
  f.massU!==undefined?'质量 '+metric(f.massU)+' u':'',
  f.speedMS!==undefined?'速率 '+metric(f.speedMS)+' m/s':'',
  f.headingDeg!==undefined?'初方向 '+metric(f.headingDeg)+'°':'',
  f.BmT!==undefined?'磁场 '+metric(f.BmT)+' mT · '+({out:'纸面外 ⊙',in:'纸面内 ×',zero:'零场'}[f.magneticDirection]||f.magneticDirection||''):'',
  f.E0kVm!==undefined?'电场强度 / 峰值 '+metric(f.E0kVm)+' kV/m':'',
  f.fieldAngleDeg!==undefined?'电场正向 '+metric(f.fieldAngleDeg)+'°':'',
  f.value!==undefined?'自由量 '+metric(f.value)+' '+(({speed:'10⁵ m/s',us:'μs',deg:'°','':'无量纲'})[f.unit]||f.unit||'无量纲'):'',
  f.xCm!==undefined?'位置 ('+metric(f.xCm)+', '+metric(f.yCm)+') cm':''
 ].filter(Boolean).map(esc).join('<br>')+'</p></div>').join('')+'</div>'+list(g.limitations,'')+'</details>';
 }
 function reviewCard(review){
  if(!review)return '';const title=review.verdict==='uncertain'?'二次审校仍有待确认项':review.verdict==='corrected'?'已完成二次审校并修正':'已进行二次模型审校';
  const image=review.imageSourceReviewed===true?'已进行AI图文审校，仍需对照原页与题设确认条件。':review.imageSourceReviewed===false?'本轮二次审校基于文本内容；若题设涉及原图，请继续对照原页。':'';
  return '<section class="ai-review-card '+(review.verdict==='uncertain'?'uncertain':'')+'"><div>'+icon('book')+'<strong>'+esc(title)+'</strong><span>'+esc(review.model||'')+'</span></div><p>这是模型层面的审稿；程序计算证据单独显示，整题仍需按题设核对。</p>'+(image?'<p class="ai-review-image-scope">'+esc(image)+'</p>':'')+((review.issues?.length||review.limitations?.length)?'<details><summary>审校发现与范围说明</summary>'+list(review.issues,'没有列出额外修正项')+list(review.limitations,'')+'</details>':'')+'</section>';
 }
 function evidence(h){
  if(!h)return '<p class="ai-evidence-empty">本次只有模型文本回复，未运行生成场景的原生求解器。</p>';
  if(h.error&&!h.passed&&!h.partial)return '<div class="ai-evidence-summary failed"><strong>原生读取或核验未完成</strong></div><p class="ai-evidence-empty">'+esc(h.error)+'</p>'+list(h.limitations,'请按题设核对；本条不提供已通过的原生数值证据。');
  const checks=h.checks||[],traces=h.traces||[],scope=h.traceScope||{},partial=h.partial===true,requested=scope.selection==='requested',issues=h.issues||[],violations=h.violations||[],incomplete=traces.filter(trace=>trace.truncated).length;
  // A bounded source read is not a failed physical result, nor proof for unread tracks.
  const abnormal=!!h.error||issues.length>0||violations.length>0||checks.some(c=>c.pass===false)||h.schemaValid===false||h.relationshipsValid===false;
  const title=partial?(abnormal?'部分轨道读取发现异常':'已读取部分轨道'):requested?(h.passed?'所选轨道通过原生核验':'所选轨道尚未通过原生核验'):(h.passed?'场景通过原生物理核验':'场景尚未通过原生物理核验');
  const computed=Number.isFinite(scope.computed)?scope.computed:traces.length,total=Number.isFinite(scope.total)?scope.total:null,range=scope.timeRangeUs,start=Array.isArray(range)?range[0]:range?.startUs??range?.start,end=Array.isArray(range)?range[1]:range?.endUs??range?.end;
  const scopeParts=[total!==null?'已读取 '+number(computed)+' / '+number(total)+' 条轨道':number(computed)+' 条轨迹',Number.isFinite(scope.uncomputed)?'未读取 '+number(scope.uncomputed)+' 条':'',Number.isFinite(start)&&Number.isFinite(end)?'时段 '+metric(start)+'–'+metric(end)+' μs':'',checks.length+' 项数值检查'];
  const state=value=>value===true?'通过':value===false?'未通过':'本次未声明';
  const checkTable=checks.length?'<table class="ai-sided-checks"><thead><tr><th>检查</th><th>轨道 / 时刻 / 侧</th><th>实际值</th><th>预期值</th><th>结果</th></tr></thead><tbody>'+checks.map(check=>{
   const available=check.value!==null&&check.value!==undefined,side=check.side==='before'?'前侧':check.side==='after'?'后侧':'侧未记录';
   return '<tr><td>'+esc(check.metric)+'</td><td>'+esc(check.traceId||'轨道未注明')+'<br>'+esc(Number.isFinite(check.timeUs)?metric(check.timeUs)+' μs':'时刻未注明')+'<br><strong>'+side+'</strong></td><td>'+esc(available?typeof check.value==='number'?metric(check.value):String(check.value):'不可用')+(check.reason?'<small>'+esc(check.reason)+'</small>':'')+'</td><td>'+esc(check.expected!==null&&check.expected!==undefined?String(check.expected):'未设定')+'</td><td>'+esc(!available?'未核验':check.pass===true?'通过':check.pass===false?'待修正':'未判定')+'</td></tr>';
  }).join('')+'</tbody></table>':'';
  return '<div class="ai-evidence-summary '+(partial&&!abnormal?'partial':h.passed&&!partial?'passed':'failed')+'">'+icon('scene')+'<strong>'+esc(title)+'</strong><span>'+esc(scopeParts.filter(Boolean).join(' · '))+'</span></div>'+(partial||requested?'<p class="ai-evidence-scope">'+esc(partial?'仅覆盖上方已读取的轨道与时段；其余轨道尚未核验，不能据此认定全场景通过。':'仅对本次指定轨道与读取时段作结论；其余轨道不在本次核验范围。')+'</p>':'')+(incomplete?'<p class="ai-evidence-incomplete">其中 '+number(incomplete)+' 条已读轨道未计算到观察终点；计算截断与未读取其他轨道分别记录。</p>':'')+(h.error?'<p class="ai-evidence-error">'+esc(h.error)+'</p>':'')+(issues.length?'<div class="ai-evidence-issues"><strong>实际依赖异常</strong>'+list(issues,'')+'</div>':'')+list(violations,partial?'本次已读范围内未记录违例；未读取轨道不作结论。':'未发现本轮检查范围内的违例')+(h.warnings?.length?'<div class="ai-evidence-warnings">'+list(h.warnings,'')+'</div>':'')+'<details class="ai-evidence-details"><summary>查看核验范围与实际读数</summary><p>结构校验 '+state(h.schemaValid)+' · 参数关系 '+state(h.relationshipsValid)+'</p>'+traces.map(t=>'<div><strong>'+esc(t.label||t.id)+'</strong><p>'+[t.segments!==undefined?number(t.segments)+' 个运动段':'',t.boundaryCount!==undefined?number(t.boundaryCount)+' 次边界事件':'',t.energyRelativeDrift!==undefined?'磁场段能量漂移 '+metric(t.energyRelativeDrift):'',t.truncated?'这条轨道未计算到终点':''].filter(Boolean).map(esc).join(' · ')+'</p></div>').join('')+checkTable+list(h.limitations,'核验仅覆盖当前模型、取样与声明的检查指标。')+'</details>'+groundingView(h.grounding);
 }
 function conditionSummary(r,id){
  const values=key=>Array.isArray(r[key])?r[key].filter(value=>String(itemText(value)||'').trim()):[],givens=values('givens'),assumptions=values('assumptions'),missing=values('missing');
  if(!givens.length&&!assumptions.length&&!missing.length)return '';
  const risk=assumptions.length||missing.length,counts=[givens.length?'已知条件 '+givens.length+' 项':'',assumptions.length?'演示假设 '+assumptions.length+' 项':'',missing.length?'待确认 '+missing.length+' 项':''].filter(Boolean);
  return '<details class="ai-condition-summary '+(risk?'has-risk':'')+'" data-ai-preserve="conditions-'+esc(id)+'-'+[givens.length,assumptions.length,missing.length].join('-')+'" '+(risk?'open':'')+'><summary><strong>'+esc(counts.join(' · '))+'</strong><span>'+esc(risk?'请先核对':'展开查看')+'</span></summary><div class="ai-result-overview">'+(givens.length?'<section><h3>已知条件</h3>'+list(givens,'')+'</section>':'')+(assumptions.length?'<section class="has-assumptions"><h3>演示假设 · 不是题设</h3>'+list(assumptions,'')+'</section>':'')+(missing.length?'<section class="ai-missing"><h3>待你确认的条件</h3>'+list(missing,'')+'<p>请补充这些条件后追问。条件不完整时不能创建场景或导入题目。</p></section>':'')+'</div></details>';
 }
 function sourceURL(value){
  try{const url=new URL(value,location.origin);return url.origin===location.origin&&url.pathname.startsWith('/api/ai/jobs/'+current.id+'/sources/')&&!url.search&&!url.hash?url.pathname:null;}catch{return null;}
 }
 function sourcePane(){
  const j=current,entry=sourceCache.get(j.id);if(j.status==='applied')return '<div class="ai-source-migrated"><strong>原文件与原页已保存至个人资源。</strong><p>临时缓存已迁移，打开保存的资源即可继续核对出处、题图与原稿。</p><button id="ai-open-applied">打开已保存资源 ↗</button></div>';
  if(!entry)return '<div class="ai-source-await"><p>原资料只在本人请求中查看，临时缓存保留24小时。</p><button data-ai-load-sources>载入原文件与原页</button></div>';
  if(entry.state==='loading')return '<div class="ai-source-await"><span class="spinner"></span><p>正在读取本次原页…</p></div>';
  if(entry.error)return '<div class="ai-source-unavailable"><strong>原资料暂不可用</strong><p>'+esc(entry.error)+'</p><p>缓存24小时后过期；若已导入，原页保存在个人资源。未导入时请重新上传识别。</p><button data-ai-load-sources>重新检查缓存</button></div>';
  if(entry.rows[0]?.expiresAt&&Date.now()>=entry.rows[0].expiresAt){entry.error='本次原资料缓存已过期；请重新上传，或打开已保存的个人资源。';entry.state='expired';return sourcePane();}
  const rows=entry.rows,allImages=rows.filter(s=>s.mime?.startsWith('image/')&&sourceURL(s.url)),originalImages=allImages.filter(s=>s.kind==='original'),images=allImages.filter(s=>s.kind==='original'||!originalImages.some(o=>(o.sourceName||o.name)===(s.sourceName||s.name)&&!s.page)),selected=images.find(s=>s.id===entry.chosen)||images[0];
  entry.chosen=selected?.id||null;
  return '<div class="ai-source-picker"><label for="ai-source-select">原页 / 图片</label><select id="ai-source-select" '+(images.length?'':'disabled')+'>'+images.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===entry.chosen?'selected':'')+'>'+esc(s.sourceName||s.name)+(s.page?' · 第'+s.page+'页':s.name!==(s.sourceName||s.name)?' · '+esc(s.name):'')+'</option>').join('')+'</select></div>'+(selected?'<figure class="ai-source-figure"><button type="button" data-ai-enlarge-source aria-label="放大原页"><img id="ai-source-preview" src="'+esc(sourceURL(selected.url))+'" alt="'+esc(selected.sourceName||selected.name)+(selected.page?'第'+selected.page+'页':'')+'"></button><figcaption>'+esc(selected.sourceName||selected.name)+(selected.page?' · 第'+selected.page+'页':'')+'<span>点按放大 · '+images.length+' 张原页 / 图片</span></figcaption></figure>':'<p class="ai-empty-note">本次没有可预览的原页图片；可以下载原文件对照。</p>')+'<div class="ai-source-originals">'+rows.filter(s=>s.kind==='original'&&sourceURL(s.url)).map(s=>'<a href="'+esc(sourceURL(s.url))+'" download="'+esc(s.name)+'" target="_blank" rel="noopener">'+icon('document')+esc(s.name)+'<small>'+number((s.bytes/1048576).toFixed(2))+' MB</small></a>').join('')+'</div><p class="ai-source-expiry">'+(rows[0]?.expiresAt?'临时缓存至 '+new Date(rows[0].expiresAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'临时缓存保留24小时')+'。保存后原页进入个人资源；不自动裁题。</p>';
 }
 function drawSources(){const node=$('ai-source-pane');if(node)node.innerHTML=sourcePane();}
 async function loadSources(force=false){
  if(!current)return;const id=current.id,ticket=epoch,previous=sourceCache.get(id);
  if(!force&&previous)return;sourceCache.set(id,{state:'loading',rows:[]});drawSources();
  try{const data=await ctx.request('/api/ai/jobs/'+id+'/sources');if(ticket!==epoch)return;sourceCache.set(id,{state:'ready',rows:data.sources||[],chosen:previous?.chosen});if(current?.id===id)drawSources();}
  catch(e){if(ticket!==epoch||e.code==='context_changed')return;sourceCache.set(id,{state:'unavailable',rows:[],error:e.message});if(current?.id===id)drawSources();}
 }
 function referenceButtons(q,i){
  return '<div class="ai-question-sources">'+(q.sourceRefs?.length?q.sourceRefs.map((ref,n)=>'<button type="button" data-ai-source-reference="'+i+'" data-ai-reference-index="'+n+'">'+icon('document')+esc(ref.sourceName)+(ref.page?' · 第'+ref.page+'页':ref.imageName?' · '+esc(ref.imageName):'')+'</button>').join(''):'<span>未建立可靠出处；原页将一并保留，需逐题核对。</span>')+'</div>';
 }
 function candidates(r){
  return r.questions.map((q,i)=>'<article class="ai-extracted-question"><label><input type="checkbox" data-ai-question-index="'+i+'" checked><strong>'+esc(q.title||'第 '+(i+1)+' 题')+'</strong></label><div class="community-markdown">'+markdown(q.sourceText||q.text||q.body||'')+'</div>'+referenceButtons(q,i)+'</article>').join('');
 }
 async function showReference(index,refIndex){
  await loadSources();const ref=current?.result?.questions?.[index]?.sourceRefs?.[refIndex],entry=sourceCache.get(current.id);if(!ref||!entry?.rows)return;
  const matches=entry.rows.filter(s=>(s.sourceName===ref.sourceName||s.name===ref.sourceName)&&(!ref.page||s.page===ref.page)&&(!ref.imageName||s.name===ref.imageName)),match=matches.find(s=>s.mime?.startsWith('image/'));
  if(match){entry.chosen=match.id;drawSources();$('ai-source-pane').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
  else ctx.notify('这个模型出处没有匹配到可预览原页，请从原文件与页码列表手动核对。');
 }
 function canApply(j){const r=j?.result;return !(ctx.user()?.role!=='teacher'&&['disabled','hints'].includes(j?.aiPolicy))&&j?.status==='completed'&&r?.status==='answer'&&!r.missing?.length&&((j.mode==='extract'&&r.questions?.length)||r.candidate?.harness?.passed);}
 function renderResult(){
  if(scenePreview.jobId()&&scenePreview.jobId()!==current?.id)scenePreview.hide();
  $('ai-first-note').hidden=!!current;$('ai-result-panel').hidden=!current;if(!current){$('ai-result-panel').replaceChildren();$('ai-result-panel').removeAttribute('data-job');renderHistory();renderActive();return;}const j=current,r=j.result,resultPanel=$('ai-result-panel'),sameJob=resultPanel.dataset.job===j.id,scroll=resultPanel.scrollTop,stickToBottom=resultPanel.scrollHeight-resultPanel.clientHeight-scroll<80,preserved=new Map([...resultPanel.querySelectorAll('details[data-ai-preserve]')].map(d=>[d.dataset.aiPreserve,d.open]));
  let html=threadTurns(j)+'<div class="ai-chat-user community-markdown"><span class="web-eyebrow">我的提问</span>'+markdown(requestText(j))+'</div><p class="ai-job-scope">'+esc(sourceLabel(jobSource(j)))+(j.version?' · 保存版本 '+esc(j.version):'')+'</p>'+'<div class="ai-result-heading"><div><span class="web-eyebrow">'+esc(modes[j.mode]?.name||'AI探究')+'</span><h2>'+esc(j.phase||'探究记录')+'</h2><small>'+esc(j.model||config?.model||'')+' · '+dateText(j.createdAt)+'</small></div><span class="ai-state '+esc(j.status)+'">'+esc(j.status==='completed'?'已完成':j.status==='applied'?'已保存':j.status==='failed'?'需重试':j.status==='cancelled'?'已取消':j.status==='interrupted'?'已中断':'处理中')+'</span></div>';
  if(!terminal.has(j.status))html+='<div class="ai-running"><span class="spinner"></span><div><strong>'+esc(j.phase||'等待处理')+'</strong><p>按真实处理阶段更新；原生核验与多页资料解析可能需要更久。</p></div><button id="ai-cancel-job">取消请求</button></div>';
  if(j.error)html+='<div class="web-error" role="alert">'+esc(j.error.message||j.error)+'<button id="ai-retry-job">重新编辑</button></div>';
  html+=renderAIActivity(j);
  if(r){
   const extraction=j.mode==='extract';if(extraction)html+='<details class="ai-extract-summary" '+(r.assumptions?.length||r.missing?.length?'open':'')+'><summary>识别说明与条件整理'+(r.missing?.length?' · '+r.missing.length+'项待确认':'')+'</summary>';
   html+=conditionSummary(r,j.id)+'<div class="ai-result-answer community-markdown">'+markdown(r.answer||'')+'</div>';if(extraction)html+='</details>';
   if(r.review)html+=reviewCard(r.review);
   if(r.candidate||r.sourceHarness){const harness=r.candidate?.harness||r.sourceHarness;html+='<section class="ai-result-evidence '+(harness?.partial?'is-partial':'')+'">'+evidence(harness)+'</section>';}
   else if(!extraction&&!r.review)html+='<p class="ai-verification-note">'+esc(r.verification==='native_context_checked'?'已有场景已运行原生核验，文字讲解仍需对照题设。':'本轮为模型文字推理，未进行生成场景的原生核验。')+'</p>';
   if(r.documentWarnings?.length)html+=extraction?'<details class="ai-extract-source-notes" '+(r.status==='needs_confirmation'?'open':'')+'><summary>资料解析提示 · '+r.documentWarnings.length+'项</summary><div class="ai-document-warnings">'+list(r.documentWarnings,'')+'</div></details>':'<div class="ai-document-warnings"><strong>资料解析提示</strong>'+list(r.documentWarnings,'')+'</div>';
   if(j.mode==='extract'&&r.questions?.length)html+='<section class="ai-extracted"><h3>对照原页，核对题干候选</h3><p>保存选中的题干，并保留本次原文件与原页出处。没有可靠映射时保留原页，标记待校对；不自动裁题。</p><div class="ai-extraction-review"><aside id="ai-source-pane">'+sourcePane()+'</aside><div class="ai-extracted-candidates">'+candidates(r)+'</div></div></section>';
   else if(j.attachments?.length)html+='<details class="ai-attached-source-review"><summary>对照本次上传的原资料</summary><div id="ai-source-pane">'+sourcePane()+'</div></details>';
   if(r.sceneChanges)html+=renderSceneChanges(r.sceneChanges);
   if(hasSourcePreview(j))html+='<div class="ai-source-preview-action"><button type="button" data-ai-source-preview="'+esc(j.id)+'">'+icon('scene')+' 回看本轮场景</button><span>只读对照这次请求读取的保存版本。</span></div>';
   if(canApply(j)&&j.result.candidate?.harness?.passed)html+='<div class="ai-preview-action"><button id="ai-preview-scene" class="web-primary">'+icon('scene')+' 预览场景</button><span>先看轨迹和参数，再确认保存。预览不会写入原题。</span></div>';
   if(canApply(j))html+='<section class="ai-apply-card"><h3>'+esc(j.mode==='extract'?'确认后导入题干':'确认后创建独立场景')+'</h3><p>'+esc(j.mode==='extract'?'保留为新的待校对题目，同时保存原文件与原页；出处关联仍需逐题核对。':'保留现有场景，另存一个可编辑变式，状态仍为“待教师复核”。')+'</p><label><input id="ai-confirm-givens" type="checkbox">我已对照原题，确认识别出的题设与条件</label>'+(r.assumptions?.length?'<label><input id="ai-confirm-assumptions" type="checkbox">我理解并接受上方列出的演示假设</label>':'')+'<div><input id="ai-scene-title" maxlength="140" placeholder="'+esc(j.mode==='extract'?'资料整理标题（可选）':'新场景名称（可选）')+'" aria-label="保存名称"><button id="ai-apply-job" class="web-primary" disabled>'+esc(j.mode==='extract'?'导入选中题干':'创建独立场景')+'</button></div><p id="ai-apply-error" class="web-error" hidden role="alert"></p></section>';
   if(j.status==='applied')html+='<div class="ai-applied-note">'+icon('bookmark')+'已保存至个人资源，可以继续编辑与提交。<button id="ai-open-applied">打开 ↗</button><button id="ai-explore-applied">继续探究这个变式</button></div>';
   html+='<div class="ai-followups">'+(r.followUps||[]).slice(0,5).map(v=>'<button data-ai-followup="'+esc(itemText(v))+'">'+esc(itemText(v))+'</button>').join('')+'<button data-ai-followup="请只给我下一步提示，不直接给完整答案。">只提示下一步</button><button data-ai-followup="请逐项检查单位、符号和适用条件。">检查单位与条件</button></div>';
  }
  if(r)html+='<div class="ai-thread-tail"><button type="button" id="ai-copy-answer">复制答复</button><button type="button" id="ai-continue-thread">继续这段对话</button></div>';
  const wasRunning=['queued','running'].includes(resultPanel.dataset.status);resultPanel.innerHTML=html;resultPanel.dataset.job=j.id;resultPanel.dataset.status=j.status;if(sameJob){for(const d of resultPanel.querySelectorAll('details[data-ai-preserve]'))if(preserved.has(d.dataset.aiPreserve))d.open=preserved.get(d.dataset.aiPreserve);if(wasRunning&&terminal.has(j.status)&&![...preserved].some(([key,open])=>key.startsWith('tool-')&&open)){const activity=resultPanel.querySelector('.ai-activity');if(activity)activity.open=false;}resultPanel.scrollTop=stickToBottom?resultPanel.scrollHeight:scroll;}else if(surface==='dock')resultPanel.scrollTop=resultPanel.scrollHeight;
  setMode(mode);renderHistory();if(r&&j.mode==='extract'&&j.status!=='applied'&&!sourceCache.has(j.id))loadSources();
 }
 async function refresh(){const ticket=epoch,serial=++historySequence;historyLoading=false;historyCursor=null;$('ai-history-error').hidden=true;const values=await Promise.all([ctx.request('/api/ai/config'),ctx.request('/api/ai/jobs?limit=20')]);if(ticket!==epoch||serial!==historySequence)return;config=values[0];historyCursor=values[1].next||values[1].nextCursor||null;const previousJobs=jobs;jobs=new Map((values[1].items||values[1].jobs||[]).map(j=>[j.id,j]));let ancestor=current?.id;const seen=new Set();while(ancestor&&!seen.has(ancestor)){seen.add(ancestor);const prior=previousJobs.get(ancestor);if(!prior)break;if(!jobs.has(ancestor))jobs.set(ancestor,prior);ancestor=prior.uiContext?.followupTo;}syncActive();if(current&&jobs.has(current.id))current=jobs.get(current.id);renderUsage();renderHistory();setMode(mode);}
 async function loadEarlier(){if(historyLoading||!historyCursor)return;const ticket=epoch,serial=historySequence,cursor=historyCursor;historyLoading=true;$('ai-history-error').hidden=true;renderHistory();try{const value=await ctx.request('/api/ai/jobs?limit=20&before='+encodeURIComponent(cursor));if(ticket!==epoch||serial!==historySequence)return;for(const job of value.items||value.jobs||[])jobs.set(job.id,job);historyCursor=value.next||value.nextCursor||null;}catch(e){if(ticket===epoch&&serial===historySequence&&e.code!=='context_changed'){$('ai-history-error').textContent='读取更早记录失败：'+e.message+'。可以再次点击重试。';$('ai-history-error').hidden=false;}}finally{if(ticket===epoch&&serial===historySequence){historyLoading=false;renderHistory();}}}
 function stopPoll(){clearTimeout(pollTimer);pollTimer=null;}
 async function poll(id,ticket=epoch){
  stopPoll();try{const j=await ctx.request('/api/ai/jobs/'+id);if(ticket!==epoch)return;jobs.set(j.id,j);syncActive();if(current?.id===id){current=j;renderResult();}else{renderHistory();setMode(mode);}if(!terminal.has(j.status))pollTimer=setTimeout(()=>poll(id,ticket),1500);else{if(followup===id&&!j.result){followup=j.uiContext?.followupTo||null;$('ai-followup-note').hidden=!followup;}if(shown)await refresh();}}
  catch(e){if(ticket!==epoch||e.code==='context_changed')return;error('读取处理进度失败：'+e.message);pollTimer=setTimeout(()=>poll(id,ticket),3000);}
 }
 async function attachments(selectedFiles=files){return await Promise.all(selectedFiles.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('无法读取 '+file.name));reader.onload=()=>resolve({filename:file.name,data:String(reader.result).split(',')[1]});reader.readAsDataURL(file);})));}
 async function start(event){
  event.preventDefault();error('');syncActive();if(activeJob||submitting){error('当前任务仍在处理，请等待或取消后再发送。');return;}if(!config?.configured){error('请打开“API连接设置”配置个人接口，或联系教师配置统一接口。');return;}if(restriction()==='disabled'){error('此作业要求独立完成。');return;}if(mode==='scene'&&spatialSource()){error('当前三维场景可答疑和检查；本轮自动建模仅支持平面电磁场。');return;}if(!$('ai-consent').checked){error('请明确同意发送本次选中的题目与资料。');return;}
  submitting=true;$('ai-submit').disabled=true;const ticket=epoch,sourceTicket=sourceEpoch;
  const pinned=source?{...source,meta:{...source.meta}}:null,include=!!pinned&&(!!pinned.assignmentId||$('ai-include-context')?.checked),selected=pinned?.personalOption&&$('ai-use-personal-option')?.checked?{...pinned.personalOption}:pinned;
  pendingSource=include?selected:null;emitState();
  const nextMode=mode,parent=followup,prompt=$('ai-prompt').value.trim(),selectedFiles=[...files],guidance=nextMode==='tutor'?{hint:'只给下一步提示，不直接给完整答案。',explain:'讲清概念与公式，并引导我验证。',check:'检查我给出的推理，指出依据与待改进处。',solution:'给出完整推导，逐项标明适用条件。'}[$('ai-guidance').value]:'';
  try{
   if(!prompt)throw Error('请先填写问题或目标。');if(include){if(ctx.prepareAI)await ctx.prepareAI(selected);else await ctx.beforeLeave();}
   const body={mode:nextMode,prompt:guidance?'【辅导方式】'+guidance+'\n【我的问题】'+prompt:prompt,consent:true,attachments:await attachments(selectedFiles)};
   if(ticket!==epoch)return;if(sourceTicket!==sourceEpoch)throw Object.assign(Error('本轮来源已改变，请核对后重新发送。'),{code:'ai_source_changed'});
   if(include&&selected?.id){if(selected.view==='unknown')throw Error('旧记录缺少原查看范围，请明确使用当前场景后再发送。');body.resourceId=selected.id;body.questionId=selected.questionId;body.sceneId=selected.sceneId;body.view=selected.view;}
   if(pinned?.assignmentId)body.assignmentId=pinned.assignmentId;if(parent)body.followupTo=parent;
   const j=await ctx.request('/api/ai/jobs',{method:'POST',body});if(ticket!==epoch)return;current=j;jobs.set(j.id,j);sourceByJob.set(j.id,include?selected:null);section='thread';followup=j.id;syncActive();$('ai-prompt').value='';$('ai-prompt').dispatchEvent(new Event('input',{bubbles:true}));files=[];renderFiles();$('ai-consent').checked=false;$('ai-followup-note').textContent='继续当前对话。最近的上下文会随下一轮发送；点击“新探究”开始独立问题。';$('ai-followup-note').hidden=false;renderResult();poll(j.id,ticket);
  }catch(e){if(ticket===epoch&&e.code!=='context_changed')error(e.message);}finally{if(ticket===epoch){submitting=false;pendingSource=null;setMode(mode);}}
 }
 async function apply(){
  const j=current;if(!canApply(j))return;const ticket=epoch,sourceTicket=sourceEpoch,button=$('ai-apply-job');button.disabled=true;$('ai-apply-error').hidden=true;
  try{
   const body={confirmGivens:$('ai-confirm-givens').checked,acceptAssumptions:!$('ai-confirm-assumptions')||$('ai-confirm-assumptions').checked,title:$('ai-scene-title').value.trim()};
   if(j.mode==='extract')body.questionIndices=[...panel.querySelectorAll('[data-ai-question-index]:checked')].map(e=>Number(e.dataset.aiQuestionIndex));
   if(!ctx.applyAI)throw Error('编辑器尚未提供安全应用入口，请重新载入学习空间。');
   await ctx.applyAI(j,body);if(ticket!==epoch)return;ctx.notify(j.mode==='extract'?'题干候选已保存，请逐题校对。':'已创建独立AI变式，请核对后再发布。');
   const latest=await ctx.request('/api/ai/jobs/'+j.id);if(ticket!==epoch)return;jobs.set(j.id,latest);if(current?.id===j.id)current=latest;
   const next=await normalizeSource();if(ticket!==epoch)return;
   // This changes only the next request, never the saved result's source labels.
   if(sourceTicket===sourceEpoch&&next?.id===latest.appliedResourceId&&(!latest.appliedSceneId||next.sceneId===latest.appliedSceneId)){
    source=next;sourceEpoch++;followup=null;$('ai-followup-note').textContent='后续提问已改为当前新变式：'+sourceLabel(next)+'。请再次确认发送；上方结果仍属于原提问。';$('ai-followup-note').hidden=false;
   }
   $('ai-consent').checked=false;section='thread';renderResult();editorChanged();await ctx.openAI?.({surface:'dock'});
  }catch(e){if(ticket!==epoch||e.code==='context_changed'||current?.id!==j.id)return;const area=$('ai-apply-error');if(!area)return;area.textContent=e.message;area.hidden=false;if(button.isConnected)button.disabled=false;}
 }
 function newInquiry(){setComposerCollapsed(false);syncActive();if(activeJob||submitting){if(activeJob)poll(activeJob.id);error('当前请求仍在处理中，可先取消再开始。');return false;}stopPoll();current=null;sourceEpoch++;followup=null;section='thread';$('ai-prompt').value='';$('ai-consent').checked=false;files=[];renderFiles();$('ai-followup-note').hidden=true;error('');renderResult();setMode('tutor');return true;}
 async function cancelActive(){syncActive();const target=activeJob||current;if(!target||terminal.has(target.status))return;const job=await ctx.request('/api/ai/jobs/'+target.id+'/cancel',{method:'POST',body:{}});jobs.set(job.id,job);if(current?.id===job.id)current=job;stopPoll();syncActive();renderResult();await refresh();}
 function beginFollowup(text){
  setComposerCollapsed(false);
  const origin=current;if(!origin)return;followup=origin.id;source=jobSource(origin);sourceEpoch++;section='thread';
  if(text==='请只给我下一步提示，不直接给完整答案。'){setMode('tutor');$('ai-guidance').value='hint';}if(text==='请逐项检查单位、符号和适用条件。')setMode('review');
  if(text)$('ai-prompt').value=text;$('ai-prompt').dispatchEvent(new Event('input',{bubbles:true}));$('ai-followup-note').textContent='继续 '+sourceLabel(source)+' 的当前对话分支；最多携带最近12轮文字与结果摘要。';$('ai-followup-note').hidden=false;$('ai-consent').checked=false;renderContext();setMode(mode);$('ai-prompt').focus();
 }
 panel.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.aiMode)setMode(b.dataset.aiMode);
  if(b.hasAttribute('data-ai-load-sources'))ctx.run(event,()=>loadSources(true));
  if(b.dataset.aiSourceReference!==undefined)ctx.run(event,()=>showReference(Number(b.dataset.aiSourceReference),Number(b.dataset.aiReferenceIndex)));
  if(b.dataset.aiSourceZoom){sourceZoom=b.dataset.aiSourceZoom==='fit'?1:Math.max(.5,Math.min(4,sourceZoom*(b.dataset.aiSourceZoom==='in'?1.25:.8)));$('ai-source-full-image').style.width=(sourceZoom*100)+'%';$('ai-source-zoom-label').textContent=Math.round(sourceZoom*100)+'%';}
  if(b.hasAttribute('data-ai-enlarge-source')){const entry=sourceCache.get(current.id),item=entry?.rows.find(s=>s.id===entry.chosen);if(item&&sourceURL(item.url)){sourceZoom=1;$('ai-source-full-image').style.width='100%';$('ai-source-zoom-label').textContent='100%';$('ai-source-full-image').src=sourceURL(item.url);$('ai-source-full-caption').textContent=(item.sourceName||item.name)+(item.page?' · 第'+item.page+'页':'');$('ai-source-full-dialog').showModal();}}
  if(b.dataset.aiRemoveFile!==undefined){files.splice(Number(b.dataset.aiRemoveFile),1);renderFiles();}
  if(b.dataset.aiExample){setMode(b.dataset.aiExample);$('ai-prompt').value={tutor:'为什么磁场力不做功？请通过方向关系引导我理解。',review:'请检查我提供的推理与单位，并标明每个公式的适用条件。',extract:'请整理所选资料中的题目。看不清的文字保留待确认，不要补写条件或参考答案。'}[b.dataset.aiExample];$('ai-prompt').dispatchEvent(new Event('input',{bubbles:true}));$('ai-prompt').focus();}
  if(b.dataset.aiFollowup)beginFollowup(b.dataset.aiFollowup);
  if(b.dataset.aiOpenJob)ctx.run(event,async()=>{const ticket=epoch;await loadThread(b.dataset.aiOpenJob);if(ticket!==epoch)return;const j=jobs.get(b.dataset.aiOpenJob);if(!j)return;current=j;section='thread';source=jobSource(j);sourceEpoch++;followup=j.result?j.id:null;$('ai-consent').checked=false;syncActive();renderContext();renderResult();if(activeJob)poll(activeJob.id);});
  if(b.dataset.aiDeleteJob)ctx.run(event,async()=>{if(!confirm('删除此探究记录？已保存的题目和场景保留，用量不会重置。'))return;const wasActive=activeJob?.id===b.dataset.aiDeleteJob;await ctx.request('/api/ai/jobs/'+b.dataset.aiDeleteJob,{method:'DELETE'});jobs.delete(b.dataset.aiDeleteJob);sourceCache.delete(b.dataset.aiDeleteJob);sourceByJob.delete(b.dataset.aiDeleteJob);if(wasActive)stopPoll();if(current?.id===b.dataset.aiDeleteJob){current=null;renderResult();}syncActive();renderHistory();setMode(mode);});
  if(b.id==='ai-settings-open')ctx.run(event,()=>settings.show());
  if(b.id==='ai-refresh')ctx.run(event,refresh);
  if(b.id==='ai-history-new')newInquiry();
  if(b.id==='ai-history-more')loadEarlier();
  if(b.id==='ai-back-assignment'&&source?.assignmentId)ctx.run(event,()=>ctx.openAssignment(source.assignmentId));
  if(b.id==='ai-back-resource'&&source?.id)ctx.run(event,()=>ctx.open(source.id,{view:source.view,questionId:source.questionId,sceneId:source.sceneId}));
  if(b.id==='ai-cancel-job'||b.id==='ai-cancel-active')ctx.run(event,cancelActive);
  if(b.id==='ai-use-current-context')ctx.run(event,useCurrentScene);
  if(b.id==='ai-retry-job'){setComposerCollapsed(false);source=jobSource(current);sourceEpoch++;followup=current.uiContext?.followupTo||null;mode=current.mode;$('ai-prompt').value=current.prompt;current=null;renderResult();setMode(mode);$('ai-consent').checked=false;}
  if(b.id==='ai-copy-answer')ctx.run(event,async()=>{await navigator.clipboard.writeText(current?.result?.answer||'');ctx.notify('已复制本轮答复。');});
  if(b.id==='ai-continue-thread')beginFollowup('');
  if(b.id==='ai-preview-scene')ctx.run(event,()=>scenePreview.show(current));
  if(b.dataset.aiSourcePreview)ctx.run(event,()=>scenePreview.show({id:b.dataset.aiSourcePreview},{source:true,timeUs:b.hasAttribute('data-ai-source-time')?Number(b.dataset.aiSourceTime):undefined,traceId:b.dataset.aiSourceTrace||undefined,side:b.dataset.aiSourceSide||undefined}));
  if(b.id==='ai-apply-job')apply();
  if(b.id==='ai-open-applied')ctx.run(event,()=>ctx.open(current.appliedResourceId,{view:'private',sceneId:current.appliedSceneId,questionId:current.questionId}));
  if(b.id==='ai-explore-applied')ctx.run(event,async()=>{const j=current;await ctx.open(j.appliedResourceId,{view:'private',sceneId:j.appliedSceneId,questionId:j.questionId});await useCurrentScene();section='thread';await ctx.openAI?.({surface:'dock'});$('ai-prompt').focus();});
 });
 panel.addEventListener('change',event=>{
  const e=event.target;
  if(e.id==='ai-use-personal-option'||e.id==='ai-include-context')setMode(mode);
  if(e.id==='ai-source-select'){const entry=sourceCache.get(current.id);if(entry){entry.chosen=e.value;drawSources();}}
  if(e.id==='ai-files'){const next=[...files,...e.files];e.value='';if(next.length>4){error('一次最多选择4个文件。');return;}if(next.some(f=>f.size>12*1048576)||next.reduce((n,f)=>n+f.size,0)>24*1048576){error('每个文件最多12MB，一次总计最多24MB。');return;}files=next;renderFiles();error('');}
  if(e.id==='ai-confirm-givens'||e.id==='ai-confirm-assumptions'||e.dataset.aiQuestionIndex!==undefined){const accepted=$('ai-confirm-givens')?.checked&&(!$('ai-confirm-assumptions')||$('ai-confirm-assumptions').checked),selected=current?.mode!=='extract'||!!panel.querySelector('[data-ai-question-index]:checked');if($('ai-apply-job'))$('ai-apply-job').disabled=!accepted||!selected;}
 });
 $('ai-request-form').addEventListener('submit',start);
 async function show({surface:nextSurface='page'}={}){const ticket=epoch;setSurface(nextSurface);shown=true;panel.hidden=false;try{await refresh();}catch(error){if(ticket!==epoch)return;throw error;}if(ticket!==epoch)return;if(!current&&activeJob)current=activeJob;if(current)await loadThread(current.id);if(ticket!==epoch)return;renderContext();renderResult();editorChanged();if(activeJob)poll(activeJob.id);}
 async function showDock(){const ticket=epoch,sourceTicket=sourceEpoch;setSurface('dock');if(!source&&!followup){let next;try{next=await normalizeSource();}catch(error){if(ticket!==epoch)return;throw error;}if(ticket!==epoch||sourceTicket!==sourceEpoch)return;source=next;sourceEpoch++;}if(ticket!==epoch)return;await show({surface:'dock'});}
 async function compose(next='tutor',explicitContext=null,{surface:nextSurface}={}){
  setComposerCollapsed(false);
  const ticket=epoch,sourceTicket=sourceEpoch;let nextSource;try{nextSource=explicitContext?{...explicitContext,meta:{...explicitContext.meta}}:await normalizeSource();}catch(error){if(ticket!==epoch)return;throw error;}if(ticket!==epoch||sourceTicket!==sourceEpoch)return;
  source=nextSource;sourceEpoch++;followup=null;section='thread';$('ai-consent').checked=false;setMode(next);
  const target=nextSurface||(ctx.context?.()?.id?'dock':'page');if(ctx.openAI)await ctx.openAI({surface:target});else await ctx.selectTab('ai',false,{preserveAIContext:true});
 }
 async function composeSelection(context,draft){
  setComposerCollapsed(false);
  if(submitting)throw Error('本轮正在提交，请提交结束后再把选中内容写入草稿。');
  if(!context||(typeof context.id!=='string'&&typeof context.resourceId!=='string')||typeof context.sceneId!=='string'||typeof draft?.prompt!=='string'||!draft.prompt.trim()||typeof draft.contextLabel!=='string')throw Error('请选择当前已保存场景中的对象或轨迹。');
  const ticket=epoch,meta={...context.meta},nextSource={...context,id:context.id||context.resourceId,meta,view:context.view||meta.view||'private',aiPolicy:context.aiPolicy||meta.aiPolicy||'allowed',assignmentId:context.assignmentId||meta.assignmentId,assignmentTitle:context.assignmentTitle||meta.assignmentTitle};
  const block='【选中场景提问 · '+sourceLabel(nextSource)+'】\n'+draft.prompt,existing=$('ai-prompt').value,nextPrompt=existing.includes(block)?existing:existing+(existing&&!existing.endsWith('\n')?'\n\n':'')+block;
  if(nextPrompt.length>$('ai-prompt').maxLength)throw Error('当前草稿过长，请先整理文字后再添加定位提问。');
  // Change the next draft, never the running job or a historical result's source.
  source=nextSource;sourceEpoch++;followup=null;section='thread';$('ai-prompt').value=nextPrompt;$('ai-prompt').dispatchEvent(new Event('input',{bubbles:true}));$('ai-consent').checked=false;error('');setMode('tutor');
  if($('ai-include-context'))$('ai-include-context').checked=true;
  $('ai-followup-note').textContent='仅写入草稿，核对后发送。'+(activeJob?'当前任务仍在处理并使用原来源；这份草稿用于下一轮。':'')+' 定位：'+draft.contextLabel;$('ai-followup-note').hidden=false;
  const sourceTicket=sourceEpoch;if(ctx.openAI)await ctx.openAI({surface:'dock'});else await showDock();
  if(ticket!==epoch||sourceTicket!==sourceEpoch)throw Object.assign(Error('登录身份或提问来源已改变，旧定位未继续应用。'),{code:'context_changed'});
  $('ai-prompt').focus();ctx.notify?.('仅写入草稿，核对后发送');return {prepared:true};
 }
 async function showHistory(){const ticket=epoch;section='history';try{await refresh();}catch(error){if(ticket!==epoch)return;throw error;}if(ticket===epoch)emitState();}
 function resume(){section='thread';renderResult();emitState();}
 return {element:panel,panel,setSurface,show,showDock,compose,composeSelection,open:compose,editorChanged,contextChanged:editorChanged,useCurrentScene,newInquiry,showHistory,resume,state,
  clearContext(){source=null;sourceEpoch++;followup=null;$('ai-consent').checked=false;$('ai-followup-note').hidden=true;renderContext();setMode('tutor');},openSettings:()=>settings.show(),refresh,
  hide(){shown=false;panel.hidden=true;},reset(){setComposerCollapsed(false);scenePreview.reset();settings.reset();epoch++;sourceEpoch++;historySequence++;historyCursor=null;historyLoading=false;$('ai-history-error').textContent='';$('ai-history-error').hidden=true;$('ai-usage').replaceChildren();$('ai-config-status').textContent='';stopPoll();config=null;jobs.clear();sourceByJob.clear();sourceCache.clear();if($('ai-source-full-dialog').open)$('ai-source-full-dialog').close();$('ai-source-full-image').removeAttribute('src');$('ai-source-full-caption').textContent='';current=null;activeJob=null;submitting=false;pendingSource=null;source=null;files=[];followup=null;shown=false;section='thread';panel.hidden=true;$('ai-prompt').value='';$('ai-consent').checked=false;renderFiles();renderHistory();renderContext();renderResult();$('ai-files').value='';$('ai-followup-note').textContent='';$('ai-followup-note').hidden=true;error('');emitState();}};
}
