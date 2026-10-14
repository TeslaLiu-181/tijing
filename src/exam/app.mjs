import {PAPER_FORMAT,SCENE_RUNTIME_FILES,newPaper,newQuestion,newScene,getQuestion,getScene,validatePaper,checkSnapshot,templates,cloneVariant,clone,uid,now,imageMime} from './model.mjs';
import {htmlPaper,readJSONResource,importResource,exportResource,scriptJSON} from './resources.mjs';
import {EditorClient} from './editor-client.mjs';
import {sourceView,markdown,esc} from './source-view.mjs';
import {createCropDialog} from './crop-dialog.mjs';
import {readDraft,saveDraft} from './drafts.mjs';
import {paperContentKey} from './paper-content.mjs';
import {setupMobileWorkspace} from './mobile.mjs';
import {createWorkspaceChrome} from './workspace-chrome.mjs';
import {setupMathComposers} from './math-composer.mjs';
setupMathComposers({fontsDirectory:null,recognizeFormula:options=>window.examWeb?.recognizeFormula?window.examWeb.recognizeFormula(options):Promise.reject(Error('手写识别需要在已登录的学习空间中连接模型。'))});

const $=id=>document.getElementById(id),desktop=window.examNative||null,web=window.examWeb||null,native=desktop||web;
let paper=null,client=null,runtimes={},queue=Promise.resolve(),saveTimer,toastTimer,dirty=false,exportDirty=false,saveChain=Promise.resolve(),editMode='',importDraft=null,recovery=null,undoAction=null,saveError=null;
let selectedToken=null,loading=false,nativeList=[],dataDirectory='',savingCount=0,applyingAI=false,editorEpoch=0,readonlyContentKey=null;
// Web layout preferences belong to this browser, independently of the paper.
// Keep the v1 storage key so existing panel sizes migrate into the new choices.
const workspaceChrome=web?createWorkspaceChrome({onToolbarAction:action=>run(()=>client?.toolbarAction(action)),onPreferencesChange:value=>{try{localStorage.setItem('tijing-workspace-chrome-v1',JSON.stringify(value));}catch{}}}):null;
if(workspaceChrome){try{const saved=localStorage.getItem('tijing-workspace-chrome-v1');if(saved)workspaceChrome.restore(JSON.parse(saved));}catch{}}
if(!web)setupMobileWorkspace();
const q=()=>paper?getQuestion(paper):null,s=()=>getScene(q()),call=(method,args={})=>native.call(method,args);
const nativePaper=()=>{const p=clone(paper);for(const asset of Object.values(p.assets)){delete asset.url;delete asset.displayURL;}return p;};
const sceneKey=record=>JSON.stringify(record?.snapshot.scene);
const contextKey=context=>{const fields={...context};delete fields.viewport;return JSON.stringify(fields);};
const syncWorkspace=()=>workspaceChrome?.sync({active:!!paper&&!document.body.classList.contains('web-home')&&!document.body.classList.contains('web-auth'),sandboxActive:!!s()&&!loading});

function toast(message,undo){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;if(undo){undoAction=undo;const b=document.createElement('button');b.id='undo-action';b.textContent='撤销';$('toast').append(b);}toastTimer=setTimeout(()=>$('toast').hidden=true,undo?10000:4500);}
function busy(title,message=''){if(!title){$('busy').hidden=true;return;}$('busy-title').textContent=title;$('busy-message').textContent=message;$('busy').hidden=false;}
function run(action,title){queue=queue.catch(()=>{}).then(async()=>{try{if(title)busy(title);return await action();}catch(error){toast(error.message||String(error));}finally{if(title)busy();}});return queue;}
function webRun(action){const pending=queue.catch(()=>{}).then(action);queue=pending.catch(error=>{toast(error.message||String(error));});return pending;}
function checkEditorEpoch(expected){if(expected!==editorEpoch)throw Object.assign(Error('编辑会话已改变，请重新打开当前题目。'),{code:'context_changed'});}
function readonlyContentChanged(){return !!(paper&&web?.readonly(paper.id)&&readonlyContentKey!==paperContentKey(paper));}
function markDirty({structure=false,auto=true}={}){paper.revision++;paper.updatedAt=now();dirty=true;exportDirty=true;if(saveError?.code!=='version_conflict')saveError=null;
 $('save-status').textContent=web?(web.readonly(paper.id)?'当前探究保留在本页 · 保存副本可跨设备继续':'修改已保留，正在同步…'):native?'修改已保留，正在保存…':'修改已保留，正在保存本机草稿…';
 if(auto&&(!web||!web.readonly(paper.id))&&saveError?.code!=='version_conflict'){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=null;persist();},web?1500:800);}if(structure)renderNavigation();}
async function persist(){if(!paper||!dirty)return;clearTimeout(saveTimer);saveTimer=null;if(web&&(web.readonly(paper.id)||saveError?.code==='version_conflict'))return;
 dirty=false;const current=clone(paper);savingCount++;saveChain=saveChain.catch(()=>{}).then(async()=>{try{if(native){const disk=clone(current);for(const asset of Object.values(disk.assets)){delete asset.url;delete asset.displayURL;}await call('save',{paper:disk});}else await saveDraft(current);if(paper?.id===current.id)$('save-status').textContent=web?'已保存到个人空间':native?'已自动保存到本机':'本机草稿已保存 · 导出HTML可带到其他电脑';}catch(error){dirty=true;saveError=error;$('save-status').textContent='保存未完成：'+error.message;web?.saveError(error);}finally{savingCount--;}});await saveChain;}

function receiveSnapshot(snapshot){
 if(!paper||!s()||loading||applyingAI)return;
 const record=s(),previous=sceneKey(record),context=JSON.stringify(record.snapshot.context),checked=checkSnapshot(record.kind,snapshot);
 delete checked.localRevision;
 if(previous===JSON.stringify(checked.scene)&&context===JSON.stringify(checked.context))return;
 // Keep runtime size for refitting and export. A resize alone is not an edit.
 if(previous===JSON.stringify(checked.scene)&&contextKey(record.snapshot.context)===contextKey(checked.context)){record.snapshot=checked;return;}
 record.snapshot=checked;record.updatedAt=now();
 if(previous!==sceneKey(record)){record.status='draft';renderSceneTabs();renderNavigation();renderStatus();}
 // Playback stays in the browser. Paused observations and physical edits are
 // saved, without sending the animation's clock to the server on every tick.
 markDirty({auto:!web||previous!==sceneKey(record)||!checked.context.playing});
}
async function capture(){
 if(!paper||!client||!s()||!selectedToken||loading)return;
 const snapshot=await client.pause();receiveSnapshot(snapshot);const settled=await client.read();receiveSnapshot(settled);
}
async function loadCurrent(){
 renderNavigation();renderSceneTabs();renderSource();renderStatus();
 const record=s();$('empty-scene').hidden=!!record;$('editor').hidden=!record;syncWorkspace();
 if(!record){selectedToken=null;client.token=null;$('editor').srcdoc='';workspaceChrome?.setToolbarState(null);web?.contextChanged?.();return;}
 selectedToken=paper.id+':'+q().id+':'+record.id+':'+uid();loading=true;$('scene-loading').hidden=false;workspaceChrome?.setToolbarState(null);syncWorkspace();
 try{if(web&&!runtimes[record.kind])runtimes[record.kind]=await(await fetch(SCENE_RUNTIME_FILES[record.kind])).text();await client.load(record,selectedToken);loading=false;receiveSnapshot(await client.read());if(document.body.classList.contains('lecture'))await client.presentation(true);}
 finally{loading=false;$('scene-loading').hidden=true;syncWorkspace();web?.contextChanged?.();}
}
function renderNavigation(){
 if(!paper)return;$('paper-title').textContent=paper.title;document.title=paper.title+' · 题景试卷讲解';
 const index=paper.questions.findIndex(x=>x.id===q()?.id),scenes=paper.questions.reduce((n,q)=>n+q.scenes.length,0),pending=paper.questions.filter(q=>q.review!=='confirmed').length;
 $('paper-meta').textContent=paper.questions.length+' 道题 · '+scenes+' 个场景'+(pending?' · '+pending+' 题待校对':'');
 $('question-position').textContent=q()?'第 '+(index+1)+' / '+paper.questions.length+' 题':'整卷备课';
 $('question-title').textContent=q()?.title||'先导入试卷，或新增题目';
 $('previous-question').disabled=index<=0;$('next-question').disabled=index<0||index>=paper.questions.length-1;
 $('question-list').innerHTML=paper.questions.map((item,i)=>'<button class="question-item '+(item.id===q()?.id?'active':'')+'" data-question="'+item.id+'"><span class="number">'+String(i+1).padStart(2,'0')+'</span><strong>'+esc(item.title)+'</strong><small>'+item.scenes.length+' 场景'+(item.review==='confirmed'?' · 已校对':' · <span class="pending-dot">待校对</span>')+'</small></button>').join('');
 $('lecture-question').innerHTML=paper.questions.map((item,i)=>'<option value="'+item.id+'" '+(item.id===q()?.id?'selected':'')+'>'+String(i+1).padStart(2,'0')+' '+esc(item.title)+'</option>').join('');
 if(native){nativeList=nativeList.map(item=>item.id===paper.id?{...item,title:paper.title,questionCount:paper.questions.length}:item);$('paper-select').innerHTML=nativeList.map(p=>'<option value="'+p.id+'" '+(p.id===paper.id?'selected':'')+'>'+esc(p.title)+(p.error?'（读取失败）':'')+'</option>').join('');}
 syncWorkspace();
}
function renderSceneTabs(){
 const question=q();$('scene-tabs').innerHTML=question?.scenes.map(record=>'<button role="tab" aria-selected="'+String(record.id===s()?.id)+'" data-scene="'+record.id+'" class="'+(record.id===s()?.id?'active':'')+'"><span class="scene-dot '+(record.status==='ready'?'ready':'')+'">●</span>'+esc(record.title)+(record.kind==='example4'?' · 空间':'')+'</button>').join('')||'<span class="eyebrow">尚未添加场景</span>';
 $('scene-menu-button').disabled=!s();$('quick-restore').disabled=!s();$('show-scene-note').disabled=!s();
}
function renderSource(){ ($('source-content')||$('source-panel')).innerHTML=sourceView(paper,q()); }
function renderStatus(){const record=s();$('scene-status').textContent=record?record.title+' · '+(record.status==='ready'?'已标记核对':'可继续搭建 / 改编')+(record.part?' · '+record.part:''):'本题保留原文与题图；添加场景后可以直接演示。';}
async function selectQuestion(id){await capture();const question=paper.questions.find(q=>q.id===id);if(!question)return;paper.activeQuestionId=question.id;if(web&&innerWidth<1000)document.body.classList.add('questions-hidden');markDirty({structure:true});await loadCurrent();}
async function selectScene(id){await capture();if(!q().scenes.some(s=>s.id===id))return;q().activeSceneId=id;markDirty();await loadCurrent();}
async function adoptPaper(data,{skipSave=false}={}){if(!skipSave){await capture();await persist();if(web&&saveError)throw saveError;}clearTimeout(saveTimer);saveTimer=null;paper=validatePaper(data,{portable:!native});readonlyContentKey=web?.readonly(paper.id)?paperContentKey(paper):null;saveError=null;exportDirty=false;dirty=false;recovery=null;$('draft-recovery').hidden=true;web?.showEditor(paper);await loadCurrent();$('save-status').textContent=web?(web.readonly(paper.id)?'共享原题 · 改编可保存为个人副本':dirty?'修改已保留，正在同步…':'已保存到个人空间 · 修改自动同步'):native?'试卷已载入 · 修改自动保存到本机':'文件版本已载入 · 导出可保存改编结果';}
async function copyWeb(){await capture();const state=await call('fork',{paper:nativePaper()});nativeList=state.papers;await adoptPaper(state.paper,{skipSave:true});web.notify('已创建个人副本，修改会保存到我的资源。');}
async function ensureEditable(){if(web&&paper&&web.readonly(paper.id))await copyWeb();}

function openEdit(mode){
 editMode=mode;$('edit-title').value=mode==='paper'?paper.title:mode==='question'?q().title:mode==='scene'?s().title:mode==='note'?'场景备注':'';
 $('edit-heading').textContent=({paper:'试卷名称',question:'编辑题目',new:'新增题目',scene:'场景名称与小问',note:'场景备注'})[mode];
 $('edit-text-label').hidden=!['question','new','note'].includes(mode);$('edit-reference-label').hidden=!['question','new'].includes(mode);$('edit-part-label').hidden=mode!=='scene';
 $('edit-text').value=mode==='question'?q().sourceText:mode==='note'?s().note||'':'';$('edit-reference').value=mode==='question'?q().referenceText:'';$('edit-part').value=mode==='scene'?s().part:'';
 $('edit-dialog').showModal();$('edit-title').focus();
}
function openTemplates(){const count=q()?.scenes.length||0;$('template-title').value=count?'演示 '+(count+1):'原题场景';$('template-options').innerHTML=[...new Set(templates.map(t=>t.group))].map(group=>'<div class="template-group"><h3>'+esc(group)+'</h3><div class="template-grid">'+templates.filter(t=>t.group===group).map(t=>'<button data-template="'+t.id+'">'+esc(t.title)+'</button>').join('')+'</div></div>').join('');$('template-dialog').showModal();}
async function addTemplate(key){
 await capture();if(!q()){const question=newQuestion('自由探究');paper.questions.push(question);paper.activeQuestionId=question.id;}
 const record=newScene($('template-title').value||'演示场景',key);q().scenes.push(record);q().activeSceneId=record.id;$('template-dialog').close();markDirty({structure:true});await loadCurrent();
}
async function duplicate(){
 await capture();const original=s(),variant=cloneVariant(original);q().scenes.push(variant);q().activeSceneId=variant.id;markDirty({structure:true});await loadCurrent();toast('已复制为独立变式，原场景保留。');
}
async function restoreBaseline(){await capture();const record=s();record.snapshot=clone(record.baseline);record.snapshot.context.timeUs=0;record.status='draft';markDirty();await loadCurrent();}
async function removeScene(){
 await capture();const question=q(),record=s(),index=question.scenes.indexOf(record),paperId=paper.id;
 if(!confirm('删除“'+record.title+'”？可以立即撤销。'))return;
 question.scenes.splice(index,1);question.activeSceneId=question.scenes[Math.min(index,question.scenes.length-1)]?.id||null;markDirty({structure:true});await loadCurrent();
 toast('场景已删除',async()=>{if(paper.id!==paperId)throw Error('请先返回原试卷');question.scenes.splice(index,0,record);question.activeSceneId=record.id;markDirty({structure:true});await loadCurrent();});
}
async function readyScene(){
 await capture();const record=s(),checked=checkSnapshot(record.kind,record.snapshot);
 if(record.kind==='planar'&&(!checked.scene.objects.some(o=>['particle','source'].includes(o.kind)&&o.enabled)||checked.scene.objects.some(o=>o.enabled&&o._error)))throw Error('先添加有效粒子并修正未定义的关系，再标记核对');
 record.status=record.status==='ready'?'draft':'ready';markDirty();renderSceneTabs();renderStatus();
}

function organize(){
 $('organize-list').innerHTML=paper.questions.map((question,i)=>'<div class="organize-row"><span>'+String(i+1).padStart(2,'0')+'</span><strong>'+esc(question.title)+'</strong><button data-move-question="'+question.id+'" data-direction="-1" '+(i===0?'disabled':'')+'>↑</button><button data-move-question="'+question.id+'" data-direction="1" '+(i===paper.questions.length-1?'disabled':'')+'>↓</button><button data-edit-question="'+question.id+'">编辑</button><button data-delete-question="'+question.id+'" class="danger">删除</button></div>').join('');$('organize-dialog').showModal();
}
async function deleteQuestion(id){
 await capture();const index=paper.questions.findIndex(q=>q.id===id),question=paper.questions[index],paperId=paper.id;if(!question||!confirm('删除这道题及其场景？可以立即撤销。'))return;
 paper.questions.splice(index,1);paper.activeQuestionId=paper.questions[Math.min(index,paper.questions.length-1)]?.id||null;markDirty({structure:true});$('organize-dialog').close();await loadCurrent();toast('题目已删除',async()=>{if(paper.id!==paperId)throw Error('请先返回原试卷');paper.questions.splice(index,0,question);paper.activeQuestionId=question.id;markDirty({structure:true});await loadCurrent();});
}

function candidateSelection(){return [...$('candidate-list').querySelectorAll('[data-candidate]:checked')].map(e=>e.dataset.candidate);}
function renderCandidates(){
 $('candidate-list').innerHTML=importDraft.candidates.map(item=>{const assets=item.attachments.map(a=>importDraft.assets[a.id]).filter(a=>a?.url).sort((a,b)=>(b.bytes||0)-(a.bytes||0)),preview=assets[0];return '<div class="candidate-row"><input type="checkbox" data-candidate="'+item.id+'" checked><div><input class="candidate-title" data-candidate-title="'+item.id+'" value="'+esc(item.title)+'" aria-label="候选题目标题"><textarea data-candidate-text="'+item.id+'" aria-label="候选题干">'+esc(item.sourceText)+'</textarea><small class="'+(item.needsOutline?'scan-badge':'')+'">'+(item.needsOutline?'原页待整理：可导入后裁题、填写条件':'分题候选：导入后仍需对照原文校对')+' · '+item.attachments.length+' 张原图 / 原页</small></div><div>'+(preview?'<img src="'+preview.url+'" alt="候选题图预览">':'')+'</div></div>';}).join('');
 $('import-warnings').innerHTML=(importDraft.errors||[]).map(message=>'<p class="source-note">'+esc(message)+'</p>').join('')+(importDraft.sources||[]).flatMap(source=>source.warnings||[]).map(message=>'<p class="source-note">'+esc(message)+'</p>').join('');countCandidates();
}
function countCandidates(){ $('candidate-count').textContent='选中 '+candidateSelection().length+' / '+(importDraft?.candidates.length||0)+' 条'; }
function syncCandidates(){for(const item of importDraft.candidates){item.title=$('candidate-list').querySelector('[data-candidate-title="'+item.id+'"]')?.value||item.title;item.sourceText=$('candidate-list').querySelector('[data-candidate-text="'+item.id+'"]')?.value??item.sourceText;}}
async function previewDocuments(){await capture();await persist();const draft=await call('documents',{paper:nativePaper()});if(!draft)return;importDraft=draft;renderCandidates();$('import-dialog').showModal();}
async function cancelImport(){if(importDraft&&native)await call('discardDocuments',{id:importDraft.id});importDraft=null;$('import-dialog').close();}
function mergeCandidates(){
 syncCandidates();const ids=candidateSelection();if(ids.length<2)throw Error('至少选择两个条目后再合并');const items=importDraft.candidates.filter(q=>ids.includes(q.id)),first=clone(items[0]);first.id=uid();first.title=items[0].title+' · 合并待核对';first.sourceText=items.map(q=>q.sourceText).join('\n\n');first.referenceText=items.map(q=>q.referenceText||'').filter(Boolean).join('\n\n');first.parts=items.flatMap(q=>q.parts);first.notes=items.flatMap(q=>q.notes);first.sourceAnchors=items.flatMap(q=>q.sourceAnchors||[]);first.attachments=[...new Map(items.flatMap(q=>q.attachments).map(a=>[a.id,a])).values()];first.review='pending';const index=importDraft.candidates.indexOf(items[0]);importDraft.candidates=importDraft.candidates.filter(q=>!ids.includes(q.id));importDraft.candidates.splice(index,0,first);renderCandidates();
}
async function commitImport(){
 syncCandidates();const ids=candidateSelection(),questions=importDraft.candidates.filter(q=>ids.includes(q.id));if(!questions.length)throw Error('请选择至少一道题或一份待整理材料');
 const response=await call('commitDocuments',{paper:nativePaper(),id:importDraft.id,questions});importDraft=null;$('import-dialog').close();nativeList=response.papers;await adoptPaper(response.paper);toast('已导入 '+questions.length+' 个条目。原文校对与场景搭建分别进行。');
}

async function importSelected(data){
 if(data.type==='scene'){
  if(web&&!paper){const state=await call('create',{title:data.title||'导入场景'});nativeList=state.papers;await adoptPaper(state.paper,{skipSave:true});}
  await ensureEditable();
  await capture();if(!q()){const question=newQuestion('导入场景');paper.questions.push(question);paper.activeQuestionId=question.id;}
  const record=newScene(data.title||'导入场景');record.kind=data.kind;record.snapshot=checkSnapshot(data.kind,data.snapshot);record.baseline=clone(record.snapshot);q().scenes.push(record);q().activeSceneId=record.id;markDirty({structure:true});await loadCurrent();return;
 }
 if(native){nativeList=data.papers;await adoptPaper(data.paper);}
 else{const imported=validatePaper(data.paper,{portable:true});imported.id='exam-'+uid();await adoptPaper(imported);markDirty();}
 toast('试卷资源已载入，可继续逐题讲解和改编。');
}
async function chooseResource(){await capture();await persist();if(native){const result=await call('import');if(result)await importSelected(result);}else $('resource-input').click();}
async function browserResource(file){if(!file)return;if(file.size>200*1024*1024)throw Error('资源文件超过200 MB');const name=file.name.toLowerCase();let data;if(name.endsWith('.html'))data={type:'paper',paper:htmlPaper(await file.text())};else if(name.endsWith('.json'))data=readJSONResource(await file.text());else data={type:'paper',paper:importResource(new Uint8Array(await file.arrayBuffer()))};await importSelected(data);}

function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportDialog(){await capture();await persist();if(!paper.questions.length)throw Error('先添加题目再导出');$('export-summary').innerHTML='<div class="export-summary">'+paper.questions.length+' 道题，'+paper.questions.reduce((n,q)=>n+q.scenes.length,0)+' 个独立场景。<br>'+paper.questions.filter(q=>q.review!=='confirmed').length+' 道题仍标为待校对；没有场景的题目也会保留原文。</div>';$('export-dialog').showModal();}
async function portablePaper(includeOriginals){return native?await call('portable',{paper:nativePaper(),includeOriginals}):validatePaper(paper,{portable:true});}
async function exportPaper(kind){
 await capture();await persist();const includeOriginals=$('include-originals').checked&&kind!=='html',includeReference=$('include-reference').checked;
 if(native){const copy=nativePaper();if(!includeReference)for(const question of copy.questions)question.referenceText='';const result=await call('export',{paper:copy,kind,includeOriginals});if(result){exportDirty=false;$('export-dialog').close();toast('已导出 '+result.path.split(/[\\/]/).at(-1));}return;}
 const output=await portablePaper(includeOriginals);if(!includeReference)for(const question of output.questions)question.referenceText='';
 if(kind==='html'){
  const root=document.documentElement.cloneNode(true);root.querySelector('#paper-data').textContent=scriptJSON(output);root.querySelector('#editor').removeAttribute('srcdoc');root.querySelector('#editor').removeAttribute('src');
  for(const dialog of root.querySelectorAll('dialog'))dialog.removeAttribute('open');
  root.querySelector('#busy').setAttribute('hidden','');root.querySelector('#toast').setAttribute('hidden','');root.querySelector('#scene-menu').setAttribute('hidden','');root.querySelector('#draft-recovery').setAttribute('hidden','');
  download('<!doctype html>\n'+root.outerHTML,paper.title+'.html','text/html;charset=utf-8');
 }else if(kind==='bundle')download(exportResource(output,{includeOriginals}),paper.title+'.tijingexam','application/zip');
 else download(JSON.stringify(output,null,2),paper.title+'.json','application/json');
 exportDirty=false;$('export-dialog').close();toast('已下载整卷文件，当前题目与变式已保存。');
}
async function exportScene(){await capture();const record=s();download(JSON.stringify({format:'particle-exam-scene/1',title:record.title,kind:record.kind,snapshot:record.snapshot},null,2),record.title+'.json','application/json');}

const crop=createCropDialog($('crop-dialog'),async payload=>{
 await ensureEditable();
 const original=payload.source,question=q();let asset;
 if(native)asset=await call('image',{paper:nativePaper(),url:payload.url,name:payload.title||'裁切题图'});
 else asset={id:uid(),name:payload.title||'裁切题图',mime:'image/png',kind:'crop',url:payload.url};
 asset.sourceAssetId=original.id;asset.crop=payload.rect;paper.assets[asset.id]=asset;
 if(payload.mode==='new'){const added=newQuestion(payload.title||'裁切题目',payload.text);added.attachments=[{id:asset.id,name:asset.name,page:original.page}];added.sourceId=question?.sourceId;added.sourceAnchors=clone(question?.sourceAnchors||[]);added.notes.push({kind:'unknown',text:'从原页裁切；题干和条件尚需校对。'});paper.questions.push(added);paper.activeQuestionId=added.id;}
 else{question.attachments=question.attachments.filter(a=>a.id!==original.id);question.attachments.push({id:asset.id,name:asset.name,page:original.page});if(payload.text)question.sourceText=payload.text;question.review='pending';}
 markDirty({structure:true});await loadCurrent();
});

document.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.dataset.close){$(b.dataset.close).close();return;}
 if(b.dataset.question){run(()=>selectQuestion(b.dataset.question));return;}if(b.dataset.scene){run(()=>selectScene(b.dataset.scene));return;}
 if(b.dataset.template){run(()=>addTemplate(b.dataset.template));return;}
 if(b.dataset.exportKind){run(()=>exportPaper(b.dataset.exportKind),'正在导出整卷');return;}
 if(b.dataset.crop){run(async()=>{await ensureEditable();const reference=q().attachments.find(a=>a.id===b.dataset.crop),asset={...paper.assets[b.dataset.crop],...reference,url:paper.assets[b.dataset.crop].url||paper.assets[b.dataset.crop].displayURL};await capture();await crop.open(asset,q().title);});return;}
 if(b.dataset.removeImage){run(async()=>{await ensureEditable();q().attachments=q().attachments.filter(a=>a.id!==b.dataset.removeImage);q().review='pending';markDirty();renderSource();});return;}
 if(b.dataset.moveQuestion){run(async()=>{await capture();const index=paper.questions.findIndex(q=>q.id===b.dataset.moveQuestion),to=index+Number(b.dataset.direction);if(to<0||to>=paper.questions.length)return;const [question]=paper.questions.splice(index,1);paper.questions.splice(to,0,question);markDirty({structure:true});organize();});return;}
 if(b.dataset.editQuestion){run(async()=>{await selectQuestion(b.dataset.editQuestion);$('organize-dialog').close();openEdit('question');});return;}
 if(b.dataset.deleteQuestion){run(()=>deleteQuestion(b.dataset.deleteQuestion));return;}
 if(b.id!=='scene-menu-button')$('scene-menu').hidden=true;
 const actions={
  'new-question':async()=>{await capture();openEdit('new');},'new-paper':async()=>{await capture();await persist();editMode='new-paper';openEdit('paper');editMode='new-paper';$('edit-title').value='';$('edit-heading').textContent='新建试卷';},
  'edit-question':async()=>{await capture();openEdit('question');},'new-scene':openTemplates,'empty-add-scene':openTemplates,'duplicate-scene':duplicate,'delete-scene':removeScene,'restore-scene':restoreBaseline,'quick-restore':restoreBaseline,
  'rename-scene':async()=>{await capture();openEdit('scene');},'show-scene-note':async()=>{await capture();openEdit('note');},
  'scene-ready':readyScene,'baseline-scene':async()=>{await capture();if(!confirm('把当前场景保存为新的原题基线？'))return;s().baseline=clone(s().snapshot);s().baseline.context.timeUs=0;markDirty();toast('原题基线已更新。');},
  'previous-question':()=>selectQuestion(paper.questions[paper.questions.indexOf(q())-1]?.id),'next-question':()=>selectQuestion(paper.questions[paper.questions.indexOf(q())+1]?.id),
  'import-documents':previewDocuments,'import-resources':chooseResource,'empty-import-scene':chooseResource,'export-paper':exportDialog,'export-scene':exportScene,
  'cancel-import':cancelImport,'cancel-import-bottom':cancelImport,'commit-import':commitImport,'merge-candidates':mergeCandidates,
  'select-all-candidates':()=>{for(const e of $('candidate-list').querySelectorAll('[data-candidate]'))e.checked=true;countCandidates();},
  'clear-candidates':()=>{for(const e of $('candidate-list').querySelectorAll('[data-candidate]'))e.checked=false;countCandidates();},
  'organize':organize,'rename-paper':()=>{$('organize-dialog').close();openEdit('paper');},'open-directory':()=>call('directory'),
  'toggle-source':()=>{if(workspaceChrome){workspaceChrome.togglePanel('source');return;}const hidden=document.body.classList.toggle('source-hidden');if(!hidden&&matchMedia('(max-width:560px)').matches)document.body.classList.add('questions-hidden');b.classList.toggle('active',!hidden);},
  'toggle-questions':()=>{if(workspaceChrome){workspaceChrome.togglePanel('questions');return;}const hidden=document.body.classList.toggle('questions-hidden');if(!hidden&&matchMedia('(max-width:560px)').matches){document.body.classList.add('source-hidden');$('toggle-source').classList.remove('active');}},
  'scene-menu-button':()=>{$('scene-menu').hidden=!$('scene-menu').hidden;},
  'lecture-mode':async()=>{await capture();const enabled=document.body.classList.toggle('lecture');b.textContent=enabled?'退出投屏':'投屏讲解';if(s())await client.presentation(enabled);},
  'restore-draft':async()=>{await adoptPaper(recovery);markDirty();},'dismiss-draft':()=>{$('draft-recovery').hidden=true;recovery=null;},
  'undo-action':async()=>{const undo=undoAction;undoAction=null;$('toast').hidden=true;if(undo)await undo();},
  'import-sample':async()=>{await capture();await persist();const result=await call('sample');await importSelected(result);}
 };
 if(actions[b.id])run(async()=>{if(['new-question','edit-question','new-scene','empty-add-scene','duplicate-scene','delete-scene','rename-scene','show-scene-note','scene-ready','baseline-scene','restore-scene','quick-restore','organize','rename-paper','import-documents'].includes(b.id))await ensureEditable();return actions[b.id]();},b.id==='import-documents'?'正在读取试卷':undefined);
});
$('edit-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
 const title=$('edit-title').value.trim();if(!title)throw Error('请填写标题');
 if(editMode==='new-paper'){const state=await call('create',{title});nativeList=state.papers;await adoptPaper(state.paper);}
 else if(editMode==='paper'){paper.title=title;markDirty({structure:true});}
 else if(editMode==='new'){const item=newQuestion(title,$('edit-text').value);item.referenceText=$('edit-reference').value;paper.questions.push(item);paper.activeQuestionId=item.id;markDirty({structure:true});await loadCurrent();}
 else if(editMode==='question'){q().title=title;q().sourceText=$('edit-text').value;q().referenceText=$('edit-reference').value;q().review='pending';markDirty({structure:true});renderSource();}
 else if(editMode==='scene'){s().title=title;s().part=$('edit-part').value;markDirty();renderSceneTabs();renderStatus();}
 else if(editMode==='note'){s().note=$('edit-text').value;markDirty();}
 $('edit-dialog').close();
 });});
document.addEventListener('change',event=>{const e=event.target;if(e.id==='paper-select')run(async()=>{await capture();await persist();const state=await call('open',{id:e.value});nativeList=state.papers;await adoptPaper(state.paper);});if(e.id==='lecture-question')run(()=>selectQuestion(e.value));if(e.id==='question-reviewed')run(async()=>{await ensureEditable();q().review=e.checked?'confirmed':'pending';markDirty({structure:true});renderSource();});if(e.dataset.candidate)countCandidates();});
$('resource-input').addEventListener('change',event=>{const file=event.target.files[0];run(()=>browserResource(file),'正在导入资源');event.target.value='';});
window.addEventListener('beforeunload',event=>{if((web&&paper&&!web.readonly(paper.id)&&(dirty||savingCount))||(!native&&dirty&&saveError)){event.preventDefault();event.returnValue='';}});

async function initialize(){
 document.body.classList.toggle('offline',!native);if(innerWidth<1000)document.body.classList.add('questions-hidden','source-hidden');
 $('toggle-source').classList.toggle('active',!document.body.classList.contains('source-hidden'));
 if(native){if(desktop)$('editor').setAttribute('sandbox','allow-scripts allow-same-origin allow-downloads allow-modals');native.onClose(async()=>{try{await capture();await persist();if(saveError)throw saveError;await call('finishClose');}catch(error){toast('退出前保存未完成：'+error.message);}});native.onProgress(progress=>{$('busy-message').textContent=progress.message||'';});const state=await call('init');nativeList=state.papers;dataDirectory=state.directory;paper=state.paper;runtimes=web?{}:Object.fromEntries(await Promise.all(Object.entries(SCENE_RUNTIME_FILES).map(async([kind,path])=>[kind,await(await fetch(path)).text()])));$('mode-label').textContent=web?'学习空间':'本机备课';}
 else{paper=validatePaper(JSON.parse($('paper-data').textContent),{portable:true});runtimes=JSON.parse($('engine-data').textContent);$('mode-label').textContent='离线课件 · 可改编';$('import-sample').hidden=true;try{const draft=await readDraft(paper.id);if(draft&&draft.revision>paper.revision){recovery=validatePaper(draft,{portable:true});$('draft-recovery').hidden=false;}}catch(error){$('save-status').textContent='浏览器未提供草稿存储，请导出文件保存修改。';}}
 client=new EditorClient($('editor'),runtimes,snapshot=>{try{receiveSnapshot(snapshot);}catch(error){toast('场景状态未保存：'+error.message);}},{compactUI:!!web,onInteraction:()=>workspaceChrome?.handleEditorInteraction(),onToolbar:state=>workspaceChrome?.setToolbarState(state),hostCapabilities:web?['formula.recognize','ai.compose']:[],onHostRequest:(method,params)=>{if(method==='ai.compose'&&web?.composeSceneQuestion)return web.composeSceneQuestion(params);if(method==='formula.recognize'&&web?.recognizeFormula)return web.recognizeFormula(params);throw Error('这项操作需要在网页学习空间中使用。');}});
 if(web){
  $('paper-select').previousElementSibling.textContent='我的资源';$('new-paper').textContent='＋ 新建资源';$('import-documents').textContent='导入文档';
 web.attach({syncWorkspace,
   beforeLeave:()=>webRun(async()=>{await capture();await persist();await saveChain;if(saveError)throw saveError;}),
   prepareAI:source=>{const expected=editorEpoch;return webRun(async()=>{checkEditorEpoch(expected);if(!paper||paper.id!==source?.id)return;await capture();checkEditorEpoch(expected);await persist();await saveChain;checkEditorEpoch(expected);if(saveError)throw saveError;if(readonlyContentChanged())throw Error('当前共享场景有未保存的内容修改，请先“保存为我的副本”，再让AI分析这些修改。');});},
   // Applying a server proposal is one editor transaction. In particular, an
   // old queued save must never run with the proposal's new resource version.
   applyAI:operation=>{const expected=editorEpoch;return webRun(async()=>{
    checkEditorEpoch(expected);
    const areas=[document.querySelector('.workspace'),document.querySelector('.app-header'),$('mobile-sandbox-bar'),$('workspace-topbar')].filter(Boolean),states=areas.map(node=>node.inert);
    areas.forEach(node=>{node.inert=true;});busy('正在应用AI提案','先保存当前编辑，再载入服务器确认后的版本。');
    try{
     await capture();checkEditorEpoch(expected);await persist();await saveChain;checkEditorEpoch(expected);if(saveError)throw saveError;
     if(readonlyContentChanged())throw Error('当前共享场景有未保存的内容修改，请先保存个人副本，再应用AI提案。');
     applyingAI=true;const state=await operation();checkEditorEpoch(expected);nativeList=state.papers;await adoptPaper(state.paper,{skipSave:true});return state;
    }finally{applyingAI=false;areas.forEach((node,index)=>{node.inert=states[index];});busy();}
   });},
   clear:()=>{editorEpoch++;clearTimeout(saveTimer);saveTimer=null;paper=null;readonlyContentKey=null;nativeList=[];dirty=false;saveError=null;selectedToken=null;importDraft=null;client.token=null;$('editor').srcdoc='';$('editor').hidden=true;$('scene-loading').hidden=true;busy();
    for(const id of ['question-list','scene-tabs',workspaceChrome?'source-content':'source-panel','candidate-list','organize-list','paper-select','lecture-question','question-title','question-position','scene-status','paper-meta','save-status','import-warnings','candidate-count','canvas-focus-title','canvas-question-select','canvas-scene-select'])$(id)?.replaceChildren();workspaceChrome?.reset();syncWorkspace();$('edit-form').reset();const canvas=$('crop-dialog').querySelector('canvas');canvas.width=canvas.height=1;},
   readScene:()=>{const expected=editorEpoch;return webRun(async()=>{checkEditorEpoch(expected);await capture();checkEditorEpoch(expected);await persist();await saveChain;checkEditorEpoch(expected);if(saveError)throw saveError;if(readonlyContentChanged())throw Error('当前共享场景有未保存的内容修改，请先保存为个人副本，再让AI分析这些修改。');return s()?clone(s().snapshot):null;});},
   context:()=>paper?{id:paper.id,title:paper.title,questionId:q()?.id,questionTitle:q()?.title,sceneId:s()?.id,sceneTitle:s()?.title,sceneKind:s()?.kind,dirty:dirty||savingCount>0,loading,originalCount:Object.values(paper.assets).filter(asset=>asset.kind==='original').length}:null,
   open:(id,options={})=>webRun(async()=>{await capture();await persist();await saveChain;if(saveError)throw saveError;const state=await call('open',{id,view:options.view});nativeList=state.papers;await adoptPaper(state.paper,{skipSave:true});if(options.questionId&&paper.questions.some(question=>question.id===options.questionId))await selectQuestion(options.questionId);if(options.sceneId&&q()?.scenes.some(scene=>scene.id===options.sceneId))await selectScene(options.sceneId);}),
   adopt:state=>webRun(async()=>{nativeList=state.papers;await adoptPaper(state.paper);}),import:data=>webRun(()=>importSelected(data)),copy:()=>webRun(copyWeb),
   reload:(id,options={})=>webRun(async()=>{const state=await call('open',{id,view:options.view});nativeList=state.papers;await adoptPaper(state.paper,{skipSave:true});})
  });
  await web.showHome();
 }else await loadCurrent();$('save-status').textContent=web?'个人资源自动保存到服务器':native?'资料保存位置：'+dataDirectory:'离线文件已就绪 · 修改后可导出新HTML';
}
initialize().catch(error=>{toast(error.message);$('mode-label').textContent='载入未完成';});
