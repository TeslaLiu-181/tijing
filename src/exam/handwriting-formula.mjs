import {markdown} from './source-view.mjs';
import {validateFormulaLatex} from '../formula-conversion.mjs';
import {createFormulaEditor} from '../formula-editor.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const terminal=new Set(['completed','failed','cancelled','interrupted','applied']);
/** Local vector ink history; only the confirmed PNG is sent to the queued AI API. */
export function createHandwritingFormulaUI(ctx){
 const dialog=document.createElement('dialog');dialog.className='handwriting-formula-dialog';
 dialog.innerHTML='<div class="handwriting-heading"><div><span>手写公式识别</span><h2>写下公式，先核对再使用</h2></div><button type="button" data-handwriting-action="close" aria-label="关闭手写公式">×</button></div><p class="handwriting-scope">只发送你在画布中写下的这一张图片，不自动发送其他题图、场景或个人文档。</p><div class="handwriting-tools"><button type="button" data-handwriting-tool="pen" class="active">画笔</button><button type="button" data-handwriting-tool="eraser">橡皮</button><button type="button" data-handwriting-action="undo">撤销</button><button type="button" data-handwriting-action="redo">重做</button><button type="button" data-handwriting-action="clear">清空</button><label>笔粗<select class="handwriting-width"><option value="3">细</option><option value="5" selected>中</option><option value="8">粗</option></select></label></div><div class="handwriting-canvas-wrap"><canvas width="1100" height="420" aria-label="可用鼠标、手指或笔写公式的画布"></canvas><span class="handwriting-empty">用笔或手指写一条公式；分式和上下标可按纸面位置书写</span></div><div class="handwriting-preview-strip" hidden><img alt="本次将发送的本人手写公式"><span>实际识别图片</span></div><label class="handwriting-consent"><input type="checkbox">同意发送本次手写图片至 <strong class="handwriting-provider">模型服务</strong> 识别</label><div class="handwriting-job-status" role="status"></div><div class="handwriting-error" hidden role="alert"></div><section class="handwriting-result" hidden><h3>识别候选，仍需对照笔迹</h3><div class="handwriting-result-render"></div><div class="handwriting-correction-actions"><button type="button" data-handwriting-action="correct">图形校正候选</button><span>直接编辑分式、下标或符号；保留原笔迹对照</span></div><details class="handwriting-source-details"><summary>LaTeX源（可选）</summary><label>候选源<textarea class="handwriting-latex" rows="3" spellcheck="false"></textarea></label></details><div class="handwriting-variables"></div><div class="handwriting-ambiguities"></div><label class="handwriting-confirm"><input type="checkbox">我已逐项对照笔迹，校正了字符、正负号、根式范围与上下标</label></section><footer><button type="button" data-handwriting-action="cancel-job" hidden>取消识别请求</button><button type="button" data-handwriting-action="recognize" class="primary">确认图片并识别</button><button type="button" data-handwriting-action="accept" disabled>使用到图形编辑器</button></footer>';
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector),canvas=$('canvas'),drawing=canvas.getContext('2d'),empty=$('.handwriting-empty'),resultPanel=$('.handwriting-result'),error=$('.handwriting-error'),latexInput=$('.handwriting-latex'),status=$('.handwriting-job-status');
 let strokes=[],redo=[],active=null,tool='pen',options={},current=null,resolveOpen=null,epoch=0,privacyEpoch=0,timer=null,sending=false,pendingJob=null,candidateEditor=null,candidateInk=null,candidateDraft=null;
 function report(text){error.textContent=text||'';error.hidden=!text;}
 function repaint(){
  drawing.clearRect(0,0,canvas.width,canvas.height);drawing.lineCap='round';drawing.lineJoin='round';
  for(const stroke of [...strokes,...(active?[active]:[])]){
   drawing.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';drawing.strokeStyle='#172e35';drawing.fillStyle='#172e35';
   const points=stroke.points;if(!points.length)continue;
   if(points.length===1){drawing.beginPath();drawing.arc(points[0].x,points[0].y,stroke.width/2,0,2*Math.PI);drawing.fill();continue;}
   for(let i=1;i<points.length;i++){drawing.lineWidth=stroke.width*(stroke.tool==='pen'?.65+.55*(points[i].p||.5):2.5);drawing.beginPath();drawing.moveTo(points[i-1].x,points[i-1].y);drawing.lineTo(points[i].x,points[i].y);drawing.stroke();}
  }
  drawing.globalCompositeOperation='source-over';empty.hidden=strokes.some(stroke=>stroke.tool==='pen')||active?.tool==='pen';
 }
 function point(event){const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height,p:event.pressure||.5};}
 function invalidate(){candidateDraft=null;current=null;resultPanel.hidden=true;$('.handwriting-confirm input').checked=false;$('[data-handwriting-action="accept"]').disabled=true;report('');}
 canvas.addEventListener('pointerdown',event=>{
  if(sending||active)return;if(strokes.length>=300){report('一次最多300笔，请把长公式分成几次识别。');return;}if(event.pointerType==='mouse'&&event.button!==0)return;
  event.preventDefault();canvas.setPointerCapture(event.pointerId);active={id:event.pointerId,tool,width:Number($('.handwriting-width').value)*2,points:[point(event)]};invalidate();repaint();
 });
 canvas.addEventListener('pointermove',event=>{
  if(!active||event.pointerId!==active.id)return;event.preventDefault();
  for(const e of event.getCoalescedEvents?.()||[event]){if(active.points.length<3000)active.points.push(point(e));}repaint();
 });
 const finishStroke=event=>{if(!active||event.pointerId!==active.id)return;strokes.push(active);active=null;redo=[];repaint();};
 canvas.addEventListener('pointerup',finishStroke);canvas.addEventListener('pointercancel',finishStroke);
 function png(){
  // Inspect actual alpha pixels after erasing, rather than guessing from strokes.
  const pixels=drawing.getImageData(0,0,canvas.width,canvas.height).data;let x0=canvas.width,y0=canvas.height,x1=-1,y1=-1;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>20){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  if(x1<0)throw Error('先写一条公式，再确认识别图片。');
  x0=Math.max(0,x0-25);y0=Math.max(0,y0-25);x1=Math.min(canvas.width-1,x1+25);y1=Math.min(canvas.height-1,y1+25);
  const exported=document.createElement('canvas');exported.width=x1-x0+1;exported.height=y1-y0+1;const paint=exported.getContext('2d');paint.fillStyle='white';paint.fillRect(0,0,exported.width,exported.height);paint.drawImage(canvas,x0,y0,exported.width,exported.height,0,0,exported.width,exported.height);
  return exported.toDataURL('image/png');
 }
 function close(value=null){epoch++;clearTimeout(timer);candidateEditor?.reset();dialog.close();const done=resolveOpen;resolveOpen=null;done?.(value);}
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 function renderResult(job){
  const formula=job.result?.formula;if(!formula)throw Error('本轮没有有效的公式识别候选。');
  latexInput.value=candidateDraft?.jobId===job.id?candidateDraft.latex:formula.latex;renderCandidate();
  $('.handwriting-variables').innerHTML='<h4>模型原始识别的变量（校正后仍须另行绑定）</h4>'+formula.variables.map(variable=>'<p><strong>'+esc(variable.symbol)+'</strong> '+esc(variable.meaning)+'</p>').join('');
  $('.handwriting-ambiguities').innerHTML=(formula.ambiguities.length?'<h4>逐项确认歧义</h4>':'')+formula.ambiguities.map(ambiguity=>'<label><span>'+esc(ambiguity.description)+'</span><input type="checkbox" data-handwriting-ambiguity="'+esc(ambiguity.id)+'"> 我已对照笔迹，在候选公式中核对或校正'+(ambiguity.alternatives.length?'<small>可能：'+ambiguity.alternatives.map(esc).join(' / ')+'</small>':'')+'</label>').join('')+formula.warnings.map(warning=>'<p>'+esc(warning)+'</p>').join('');
  resultPanel.hidden=false;$('.handwriting-confirm input').checked=false;checkAcceptance();
 }
 function renderCandidate(){
  $('.handwriting-result-render').innerHTML=latexInput.value.trim()?markdown('$$\n'+latexInput.value+'\n$$'):'<p>未识别出清楚的公式，请补写或校正。</p>';
 }
 function changedCandidate(){
  candidateDraft={jobId:current?.id,latex:latexInput.value};renderCandidate();
  $('.handwriting-confirm input').checked=false;dialog.querySelectorAll('[data-handwriting-ambiguity]').forEach(input=>input.checked=false);checkAcceptance();
 }
 function correctionEditor(){
  if(!candidateEditor){
   candidateEditor=createFormulaEditor({fontsDirectory:null});
   candidateEditor.dialog.classList.add('handwriting-correction-dialog');
   candidateEditor.dialog.addEventListener('mount',event=>{if(event.target.matches('math-field')&&candidateEditor.dialog.open)event.target.focus();});
   candidateInk=document.createElement('div');candidateInk.className='handwriting-candidate-ink';candidateInk.innerHTML='<span>实际发送的原笔迹</span><img alt="本轮手写笔迹，供图形校正时对照">';
   candidateEditor.dialog.querySelector('.formula-editor-context').after(candidateInk);
  }
  const image=$('.handwriting-preview-strip img').getAttribute('src');if(image){candidateInk.querySelector('img').src=image;candidateInk.hidden=false;}else{candidateInk.querySelector('img').removeAttribute('src');candidateInk.hidden=true;}
  return candidateEditor;
 }
 function checkAcceptance(){
  const complete=!!latexInput.value.trim()&&$('.handwriting-confirm input').checked&&[...dialog.querySelectorAll('[data-handwriting-ambiguity]')].every(input=>input.checked);
  $('[data-handwriting-action="accept"]').disabled=!complete;
 }
 async function poll(id,ticket){
  try{
   const job=await ctx.request('/api/ai/jobs/'+id);if(ticket!==epoch||!dialog.open)return;current=job;status.textContent=job.phase||job.status;
   if(!terminal.has(job.status)){timer=setTimeout(()=>poll(id,ticket),1000);return;}
   sending=false;$('[data-handwriting-action="recognize"]').disabled=false;$('[data-handwriting-action="cancel-job"]').hidden=true;
   if(job.status!=='completed')throw Error(job.error?.message||job.error||'识别未完成，可以重新确认图片再试。');
   renderResult(job);
  }catch(e){if(ticket!==epoch||e.code==='context_changed')return;sending=false;report(e.message);$('[data-handwriting-action="recognize"]').disabled=false;}
 }
 dialog.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;event.preventDefault();
  if(b.dataset.handwritingTool){tool=b.dataset.handwritingTool;dialog.querySelectorAll('[data-handwriting-tool]').forEach(button=>button.classList.toggle('active',button===b));return;}
  const action=b.dataset.handwritingAction;
  if(action==='close'){close();return;}
  if(action==='undo'&&!sending){if(strokes.length)redo.push(strokes.pop());invalidate();repaint();return;}
  if(action==='redo'&&!sending){if(redo.length)strokes.push(redo.pop());invalidate();repaint();return;}
  if(action==='clear'&&!sending){strokes=[];redo=[];invalidate();repaint();return;}
  if(action==='correct'){
   if(sending||resultPanel.hidden)return;const ticket=epoch;b.disabled=true;
   try{const editor=correctionEditor(),value=await editor.open({mode:'notation',latex:latexInput.value,target:{name:'手写识别候选 · 图形校正'}});if(ticket!==epoch||!dialog.open)return;if(value){latexInput.value=value.latex;changedCandidate();status.textContent='候选已用图形编辑器校正；请再次对照笔迹、逐项核对歧义后确认使用。';}}
   catch(e){if(ticket===epoch)report(e.message);}finally{if(ticket===epoch)b.disabled=false;}return;
  }
  if(action==='accept'){
   try{checkAcceptance();if(b.disabled)return;const latex=validateFormulaLatex(latexInput.value);close({latex,variables:current?.result.formula.variables||[],variablesSource:'model-original',jobId:current?.id,confirmed:true});}catch(e){report(e.message);}return;
  }
  if(action==='cancel-job'&&current){const job=current,ticket=epoch;try{const cancelled=await ctx.request('/api/ai/jobs/'+job.id+'/cancel',{method:'POST',body:{}});if(ticket!==epoch||!dialog.open)return;current=cancelled;epoch++;clearTimeout(timer);sending=false;status.textContent='识别已取消，笔迹仍保留。';$('[data-handwriting-action="recognize"]').disabled=false;b.hidden=true;}catch(e){if(ticket===epoch&&e.code!=='context_changed')report(e.message);}return;}
  if(action!=='recognize'||sending)return;
  const ticket=epoch,privateTicket=privacyEpoch;
  try{
   report('');if(!$('.handwriting-consent input').checked)throw Error('请先确认只发送本次手写图片。');
   const image=png(),preview=$('.handwriting-preview-strip');preview.hidden=false;preview.querySelector('img').src=image;sending=true;b.disabled=true;
   // Context IDs are only used for permissions/task policy; the formula pipeline
   // must not automatically attach a question image or native scene.
   const context=options.context||await ctx.currentContext?.()||{};if(ticket!==epoch||!dialog.open)return;const body={mode:'formula',prompt:'转录这张本人手写公式，保留结构与歧义，不求解。',consent:true,attachments:[{filename:'handwriting.png',data:image.split(',')[1]}]};
   if(context.assignmentId)body.assignmentId=context.assignmentId;if(context.id||context.resourceId){body.resourceId=context.id||context.resourceId;body.questionId=context.questionId;body.sceneId=context.sceneId;body.view=context.view||context.meta?.view||'private';}
   // Keep a confirmed POST across a simple close/reopen, but never across private reset.
   const request=ctx.request('/api/ai/jobs',{method:'POST',body});pendingJob=request;const job=await request;if(pendingJob===request)pendingJob=null;if(privateTicket!==privacyEpoch)return;current=job;if(ticket!==epoch)return;status.textContent='识别已提交，正在读取笔迹…';$('.handwriting-consent input').checked=false;$('[data-handwriting-action="cancel-job"]').hidden=false;poll(current.id,ticket);
  }catch(e){if(privateTicket!==privacyEpoch)return;pendingJob=null;sending=false;if(ticket!==epoch)return;if(e.code!=='context_changed')report(e.message);b.disabled=false;}
 });
 latexInput.addEventListener('input',changedCandidate);
 dialog.addEventListener('change',event=>{if(event.target.matches('.handwriting-confirm input,[data-handwriting-ambiguity]'))checkAcceptance();});
 const reset=()=>{privacyEpoch++;epoch++;pendingJob=null;clearTimeout(timer);$('[data-handwriting-action="recognize"]').disabled=false;if(dialog.open)close();strokes=[];redo=[];active=null;sending=false;current=null;candidateDraft=null;candidateEditor?.reset();candidateInk?.querySelector('img').removeAttribute('src');$('[data-handwriting-action="correct"]').disabled=false;options={};latexInput.value='';$('.handwriting-preview-strip img').removeAttribute('src');$('.handwriting-preview-strip').hidden=true;$('.handwriting-result-render').replaceChildren();$('.handwriting-variables').replaceChildren();$('.handwriting-ambiguities').replaceChildren();$('.handwriting-consent input').checked=false;resultPanel.hidden=true;status.textContent='';report('');repaint();};
 window.addEventListener('exam-private-reset',reset);
 return {dialog,async open(next={}){if(resolveOpen)close();options=next;const ticket=++epoch;clearTimeout(timer);resultPanel.hidden=true;report('');repaint();const config=await ctx.request('/api/ai/config');if(ticket!==epoch)return null;if(pendingJob){try{await pendingJob;}catch{}if(ticket!==epoch)return null;}const existing=current,resume=existing&&!terminal.has(existing.status)?existing:null;sending=!!resume;$('.handwriting-provider').textContent=config.provider||'模型服务';$('[data-handwriting-action="recognize"]').disabled=!config.configured||sending;status.textContent=resume?'上一轮识别仍在处理中，笔迹与请求保留。':config.configured?'识别使用当前账号的视觉模型；结果需人工对照。':'尚未配置模型；可以保留笔迹或直接使用图形公式编辑。';dialog.showModal();$('[data-handwriting-action="cancel-job"]').hidden=!resume;if(resume)poll(resume.id,ticket);else if(existing?.status==='completed')renderResult(existing);return new Promise(resolve=>{resolveOpen=resolve;});},reset,destroy(){reset();candidateEditor?.destroy();window.removeEventListener('exam-private-reset',reset);dialog.remove();},get strokes(){return structuredClone(strokes);},exportPNG:png};
}
