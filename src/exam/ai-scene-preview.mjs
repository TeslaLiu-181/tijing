import {$,esc,icon} from './web-ui.mjs';
import {EditorClient} from './editor-client.mjs';
import {uid} from './model.mjs';

export function createScenePreview(ctx){
 let client=null,sequence=0,requestId=null,latest=null,runtime=null;
 document.body.insertAdjacentHTML('beforeend','<dialog id="ai-scene-preview-dialog" class="ai-scene-preview-dialog"><div class="dialog-heading"><div><span class="web-eyebrow">通过原生核验的候选</span><h2>场景预览 · 尚未保存</h2></div><button type="button" id="ai-scene-preview-close" aria-label="关闭场景预览">×</button></div><p class="ai-preview-note">可播放、平移与缩放查看轨迹。此预览只读，关闭不会创建资源或修改原题；保存仍以服务器的已核验提案为准。</p><div id="ai-preview-evidence"></div><div class="ai-preview-stage"><iframe id="ai-preview-frame" title="只读候选场景预览" sandbox="allow-scripts"></iframe><div id="ai-preview-loading" class="ai-preview-loading"><span class="spinner"></span><p>正在启动原生沙盒…</p></div></div><p id="ai-preview-error" class="web-error" role="alert" hidden></p><div class="dialog-actions"><span>确认题设与假设后，再返回结果页保存。</span><button type="button" id="ai-scene-preview-return">返回结果</button></div></dialog>');
 const dialog=$('ai-scene-preview-dialog'),frame=$('ai-preview-frame');
 function cleanup(){sequence++;client?.destroy();client=null;latest=null;requestId=null;frame.removeAttribute('srcdoc');frame.src='about:blank';$('ai-preview-evidence').replaceChildren();$('ai-preview-error').hidden=true;}
 function hide(){cleanup();if(dialog.open)dialog.close();}
 async function show(job,{source=false,timeUs,traceId,side}={}){
  hide();const ticket=sequence;requestId=job.id;dialog.dataset.previewKind=source?'source':'candidate';$('ai-preview-loading').hidden=false;
  dialog.querySelector('.web-eyebrow').textContent=source?'本轮读取的源场景快照':'通过原生核验的候选';dialog.querySelector('h2').textContent=source?'回看本轮场景 · 只读':'场景预览 · 尚未保存';frame.title=source?'本轮读取的源场景只读回看':'只读候选场景预览';dialog.querySelector('.ai-preview-note').textContent=source?'回看本次请求读取的保存版本，可播放、暂停、平移与缩放。这里是源场景，不是新提案；关闭不会修改当前编辑内容，也不会创建资源。':'可播放、平移与缩放查看轨迹。此预览只读，关闭不会创建资源或修改原题；保存仍以服务器的已核验提案为准。';dialog.querySelector('.dialog-actions>span').textContent=source?'返回后继续本轮对话；当前编辑场景保持原样。':'确认题设与假设后，再返回结果页保存。';dialog.showModal();
  try{
   const current=await ctx.request('/api/ai/jobs/'+job.id);if(ticket!==sequence)return;
   if(ctx.user()?.role!=='teacher'&&['disabled','hints'].includes(current.aiPolicy)||current.result?.review?.hintsOnly)throw Error('此记录不能提供场景回看。');
   let snapshot;
   if(source){
    if(!['completed','applied'].includes(current.status)||current.result?.sourcePreview?.kind!=='planar'||!Array.isArray(current.result.sourcePreview.snapshot?.scene?.objects))throw Error('这条记录没有可回看的本轮源场景快照。');
    snapshot=structuredClone(current.result.sourcePreview.snapshot);snapshot.context={...snapshot.context,playing:false};
    if(side!==undefined&&!['before','after'].includes(side))throw Error('取样侧只能是事件前或事件后。');snapshot.context.readingSide=side||(['before','after'].includes(snapshot.context.readingSide)?snapshot.context.readingSide:'after');
    if(timeUs!==undefined){if(!Number.isFinite(timeUs)||timeUs<0||timeUs>snapshot.scene.duration)throw Error('该时刻超出本轮源场景的观察范围。');snapshot.context.timeUs=timeUs;}
    if(traceId){const owner=snapshot.scene.objects.find(object=>object.id===traceId||traceId.startsWith(object.id+':'));if(!owner||!['particle','source'].includes(owner.kind))throw Error('本轮源场景没有这条粒子轨道。');snapshot.context.trace=traceId;snapshot.context.selected=owner.id;}
    const h=current.result.sourceHarness,scope=h?.traceScope;
    $('ai-preview-evidence').innerHTML='<span>'+icon('scene')+' 本轮源场景</span>'+(Number.isFinite(snapshot.context.timeUs)?'<span>起始定位 '+esc(snapshot.context.timeUs)+' μs'+(traceId?' · '+esc(traceId):'')+' · '+(snapshot.context.readingSide==='before'?'前侧':'后侧')+'</span>':'')+(scope&&Number.isFinite(scope.computed)&&Number.isFinite(scope.total)?'<span>本轮原生读取 '+scope.computed+' / '+scope.total+' 条轨道</span>':'')+'<small>'+esc(h?.partial?'本轮仅读取部分轨道；回看不代表全场景已通过核验。':'回看用于对照工具读数，不是候选生成或整题正确性保证。')+'</small>';
   }else{
    if(current.status!=='completed'||!current.result?.candidate?.harness?.passed||current.result.missing?.length)throw Error('该提案尚不满足预览条件，请返回结果页核对。');
    snapshot=structuredClone(current.result.candidate.snapshot);const h=current.result.candidate.harness;
    if(!snapshot.scene?.objects)throw Error('当前候选不是可预览的平面场景。');
    $('ai-preview-evidence').innerHTML='<span>'+icon('scene')+' 已通过原生核验</span><span>'+(h.traces?.length||0)+' 条轨迹 · '+(h.checks?.length||0)+' 项数值检查</span><small>题设与演示假设仍需人工核对</small>';
   }
   runtime||=await(await fetch('/planar.html',{credentials:'same-origin',cache:'no-store'})).text();if(ticket!==sequence)return;
   client=new EditorClient(frame,{planar:runtime},state=>{latest=state;},{readonly:true});
   await client.load({kind:'planar',snapshot},uid());if(ticket!==sequence)return;
   await client.presentation(true);if(ticket!==sequence)return;$('ai-preview-loading').hidden=true;
  }catch(e){if(ticket!==sequence)return;$('ai-preview-loading').hidden=true;$('ai-preview-error').textContent=e.message;$('ai-preview-error').hidden=false;client?.destroy();client=null;}
 }
 $('ai-scene-preview-close').addEventListener('click',hide);$('ai-scene-preview-return').addEventListener('click',hide);dialog.addEventListener('cancel',cleanup);dialog.addEventListener('close',()=>{if(!dialog.open)cleanup();});
 return {show,hide,reset:hide,read:()=>client?.read(),jobId:()=>requestId,snapshot:()=>latest};
}
