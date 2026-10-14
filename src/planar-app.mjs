import {attachExamBridge} from './exam/bridge.mjs';
import {createObject,example,emptyScene,prepareScene,validate,fieldNames,waveNames,sourceNames,kinds,isField} from './planar-model.mjs';
import {solveScene,pathGeometry,segmentState,segmentElectric,forcesAt,nearestTime,E,add,sub,mul,norm,dot,unit,rotate,rad,deg,TAU,advance} from './planar-physics.mjs';
import {readMotionState,readWaveFactor} from './planar-motion-readings.mjs';
import {lessonScene,lessons,lessonDuration} from './planar-lessons.mjs';
import {teachingDefaults,boundaryTimes,nextBoundary,motionStages} from './planar-teaching.mjs';
import {teachingPanel,liveTeaching,teachingHUD} from './planar-teaching-ui.mjs';
import {trailSeconds} from './planar-trails.mjs';
import {PaperView} from './planar-view.mjs';
import {tex,num,quantity} from './lorentz-math.mjs';
import {units,toNative} from './planar-expressions.mjs';
import {resolveScene,bindingKey,setDefinition,snapPoint,snapHeading,pathDefinition,pathParameter,pathKeyFor,definitionTex,createResolver,properties,targets,buildDependencyGraph,inheritResolverState,canonicalExpression} from './planar-relations.mjs';
import {createRelationsUI} from './planar-relations-ui.mjs';
import {createContextMenu} from './planar-context-menu.mjs';
import {mountWorkspaceLayout} from './planar-workspace-layout.mjs';
import {createTimeline} from './planar-timeline.mjs';
import {createFormulaEditor} from './formula-editor.mjs';
import {addConstruction,fillRegion,geometryToolSchema,acceptsGeometryInput,moveConstructionPoint,constructionInfo,constructionOwns,ensureGeometryFeature,redefineConstruction,editPolygonVertices} from './planar-constructions.mjs';
import {createConstructionUI} from './planar-construction-ui.mjs';
import {createPolygonEditor} from './planar-polygon-editor.mjs';
import {createConstructionFormulaEditor} from './planar-construction-formula.mjs';
import {createExampleGallery} from './planar-example-gallery.mjs';
import {exampleMetadata} from './planar-example-catalog.mjs';
import {advancedWorkbenchHelpHTML} from './planar-help-content.mjs';
import {createMotionPlot} from './planar-motion-plot.mjs';
import {createParameterBoard} from './planar-parameter-board.mjs';
import {createAlgebraPanel} from './planar-algebra-panel.mjs';
import {resolveParameterSlider} from './planar-parameter-slider.mjs';
import {createParameterSliderDialog} from './planar-parameter-slider-dialog.mjs';
import {createParameterPlayback} from './planar-parameter-playback.mjs';
import {measurementOptions,readMeasurements,addMeasurementParameter} from './planar-measurements.mjs';
import {hasObjectDependencies,snapshotObject,insertObjectCopy} from './planar-object-copy.mjs';
import {objectStyleKeys} from './planar-object-style.mjs';
import {createObjectStyleDialog} from './planar-object-style-dialog.mjs';
import {createDependencyGraphUI} from './planar-dependency-graph.mjs';
import {createFieldProbe} from './planar-field-probe.mjs';
const $=id=>document.getElementById(id),s=String.raw,esc=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const readonlyPreview=window.__EXAM_READONLY_PREVIEW__===true,canAskAI=!readonlyPreview&&window.__EXAM_HOST_CAPABILITIES__?.includes('ai.compose'),canRecognizeFormula=!readonlyPreview&&window.__EXAM_HOST_CAPABILITIES__?.includes('formula.recognize');
let composingAI=false;
let parameterPlayback=null,parameterScan=null;
let model=lessonScene('ex2'),traces=[],time=0,playing=false,lastFrame=0,lastReadout=0,pendingCopy=null;
const ui={selected:'o3',trace:'o3',segment:0,readingSide:'after',tool:'select',addType:null,panel:'teaching',sidebar:innerWidth>1000,present:false,geometry:false,rate:1,objectSearch:''};
const history=[],future=[],pointers=new Map();let drag=null,angleDraft=[];
const inspectorClose=document.createElement('button');inspectorClose.id='inspector-close';inspectorClose.textContent='收起参数 ×';inspectorClose.setAttribute('aria-label','收起参数面板');$('inspector').prepend(inspectorClose);inspectorClose.addEventListener('click',()=>{ui.sidebar=false;chrome();});
let liveFrame=0,pendingLive=null,inputEdit=null,scrub=null,resolution={issues:[]};
let examFitPending=!window.__EXAM_INITIAL_SNAPSHOT__?.context?.view;
let examFitObjectsOnly=window.__EXAM_INITIAL_SNAPSHOT__?.context?.fitObjectsOnly===true;
const view=new PaperView($('paper'),()=>{if(model.teaching?.enabled&&!window.__EXAM_HOST__||examFitPending){view.fit({includeTracks:!examFitObjectsOnly});examFitPending=false;}scaleNote();});
const relations=createRelationsUI({model:()=>model,selected:()=>object(),ui,mutate,select,toast,recognizeFormula:canRecognizeFormula?params=>examBridge?.requestHost('formula.recognize',params):undefined,openDependencyGraph:id=>openDependencyGraph(id),refresh:()=>{chrome();renderPanel();view.render();}});
const contextMenu=createContextMenu({onAction:contextAction,onPopoverClose:()=>finishInput()});
let rightGesture=null,popoverSignature='';
const workspaceLayout=mountWorkspaceLayout({onInspectorToggle:visible=>{ui.sidebar=visible;chrome();}});
const fieldProbeUI=readonlyPreview?null:createFieldProbe({container:document.querySelector('[data-workspace-window="fieldProbe"] .workspace-window-content'),onLocate:point=>{view.fieldProbePoint=point;workspaceLayout.open('fieldProbe');view.render();syncFieldProbe();},onPick:()=>tool('field-probe'),onSelect:id=>{ui.panel='objects';ui.sidebar=true;tool('select');select(id);}});
function syncFieldProbe(){if(fieldProbeUI?.point)fieldProbeUI.update(view.inspectField(fieldProbeUI.point));}
function resetFieldProbe(){fieldProbeUI?.reset();view.fieldProbePoint=null;workspaceLayout.close('fieldProbe');}
const timelineUI=createTimeline({readonly:readonlyPreview,onAskAI:canAskAI?(event,{side})=>requestSceneQuestion({kind:'event',objectId:event.objectId,traceId:event.traceId,timeUs:event.timeUs,side,eventKind:event.kind,fieldId:event.fieldId}):undefined,onSeekUs:(value,options)=>{playing=false;setTime(value*1e-6,options);},onSelectTrace:id=>{const trace=traces.find(t=>t.particle.traceId===id);if(trace)select(trace.particle.objectId,id);},onEvent:(event,{state,side}={})=>{ui.segment=state?.segmentIndex??event.segmentIndex??0;if(side)ui.readingSide=side;view.render();transport();}});
const notationEditor=createFormulaEditor({fontsDirectory:null,onRecognize:canRecognizeFormula?params=>examBridge?.requestHost('formula.recognize',params):undefined,onConfirm:(value,options)=>{const target=model.objects.find(o=>o.id===options.context.owner);if(!target)throw Error('标注对象已切换。');if(value.latex.length>(target.kind==='label'?4000:60))throw Error(target.kind==='label'?'公式标注请控制在4000字符以内。':'对象名称请控制在60字符以内；长公式请放在独立标注中。');}});
const parameterSliderDialog=readonlyPreview?null:createParameterSliderDialog();
const objectStyleDialog=readonlyPreview?null:createObjectStyleDialog();
const exampleGallery=readonlyPreview?null:createExampleGallery({example,PaperView,onChoose:loadExample});
const constructionSpecsUI=new Map(geometryToolSchema().map(t=>[t.id,t])),constructionNames=new Map(geometryToolSchema().map(t=>[t.id,t.label]));
const constructionFormula=readonlyPreview?null:createConstructionFormulaEditor({scene:()=>model,onRecognize:canRecognizeFormula?params=>examBridge?.requestHost('formula.recognize',params):undefined});
const constructionUI=readonlyPreview?null:createConstructionUI({onOpenPalette:()=>workspaceLayout.open('construction'),scene:()=>model,view,mutate:operation=>mutate(()=>operation(model)),addConstruction,redefineConstruction,formulaEditor:constructionFormula,readParameter:(candidate,id,meta)=>toNative(createResolver(candidate).get(id,meta.key),meta.unit||''),canonicalize:text=>canonicalExpression(model,text),acceptsInput:acceptsGeometryInput,schema:geometryToolSchema,resolveFeature:(feature,candidate)=>{if(candidate)return ensureGeometryFeature(candidate,feature.owner,feature.kind,feature.index);let id;mutate(()=>{id=ensureGeometryFeature(model,feature.owner,feature.kind,feature.index);});return id;},onModeChange:kind=>tool(kind),onCreated:id=>{ui.panel='objects';select(id);},toast,container:document.querySelector('[data-workspace-window="construction"] .workspace-window-content')});
const polygonEditor=readonlyPreview?null:createPolygonEditor({scene:()=>model,view,mutate:operation=>mutate(()=>operation(model)),editPolygonVertices,addConstruction,onApplied:id=>{ui.panel='objects';select(id);},toast});
if(!readonlyPreview)$('measure-menu').innerHTML='<span>∠</span>测量与标注';
const dependencyGraphUI=createDependencyGraphUI({getGraph:()=>resolution.dependencyGraph||buildDependencyGraph(model),onSelect:id=>select(id),onHighlight:ids=>{view.dependencyHighlights=ids;view.render();}});
if(!readonlyPreview){const items=[['blank-menu','新建空白画布'],...(!window.__EXAM_HOST__?[['save-menu','保存场景文件']]:[])];for(const [id,title] of items){const button=document.createElement('button');button.id=id;button.textContent=title;$('workspace-actions').querySelector('div').prepend(button);}}
const workspaceFileMenu=$('workspace-actions').querySelector('div');workspaceFileMenu.id='workspace-file-menu';workspaceFileMenu.className='workspace-file-menu';workspaceFileMenu.hidden=true;workspaceFileMenu.setAttribute('role','menu');workspaceFileMenu.setAttribute('aria-label','场景文件与操作');document.body.append(workspaceFileMenu);
for(const button of workspaceFileMenu.querySelectorAll('button'))button.setAttribute('role','menuitem');
$('workspace-actions').addEventListener('toggle',()=>{const open=$('workspace-actions').open;workspaceFileMenu.hidden=!open;if(open){const box=$('workspace-actions').getBoundingClientRect();workspaceFileMenu.style.left=Math.max(8,Math.min(box.left,innerWidth-workspaceFileMenu.offsetWidth-8))+'px';workspaceFileMenu.style.top=Math.min(box.bottom+6,innerHeight-workspaceFileMenu.offsetHeight-8)+'px';workspaceFileMenu.querySelector('button')?.focus();}});
workspaceFileMenu.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey))event.stopPropagation();const buttons=[...workspaceFileMenu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(event.key==='Escape'||event.key==='Tab'){$('workspace-actions').open=false;$('workspace-actions').querySelector('summary').focus();if(event.key==='Escape')event.preventDefault();}});
let toastTimer;function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3300);}
function label(code){try{return tex(code);}catch{return esc(code);}}
const object=()=>model.objects.find(o=>o.id===ui.selected);
const physical=o=>['particle','source','field','electric'].includes(o?.kind);
const geometryControlled=(o,key)=>constructionOwns(o,key)||!!o.regionSource&&(['position','x','y','radius','width','height','angle','points'].includes(key)||/^point\d+(?:[xy])?$/.test(key));
const motionKey=scene=>JSON.stringify([scene.duration,scene.objects.filter(physical).map(o=>{const {label,visible,labelVisible,labelOffset,style,...state}=o;return [state,o._error||''];})]);
const parameterBoard=readonlyPreview?null:createParameterBoard({container:document.querySelector('[data-workspace-window="variables"] .workspace-window-content'),scene:()=>model,renderInput:o=>input('value',o.label,'数值',units[o.unit]?.tex||o.unit,o.value,{owner:o,prefix:'board-'+o.id}),renderValue:o=>o._issues?.value||o._error?tex('\\text{暂未定义}'):tex(quantity(o.value,units[o.unit]?.tex||o.unit,5)),syncInput:syncParameterControl,isEditing:element=>inputEdit?.target===element||scrub?.input===element,onSelect:id=>{ui.panel='objects';ui.sidebar=true;select(id);},onAdd:()=>{pendingCopy=null;tool('select');addObject('parameter',[0,0]);workspaceLayout.open('variables');},onGraph:id=>openDependencyGraph(id)});
const motionPlotUI=readonlyPreview?null:createMotionPlot({container:document.querySelector('[data-workspace-window="plot"] .workspace-window-content'),onSeekUs:(value,options)=>{playing=false;setTime(value*1e-6,options);},onSelectTrace:id=>{const trace=traces.find(t=>t.particle.traceId===id);if(trace)select(trace.particle.objectId,id);},onFitTimeline:()=>timelineUI.snapshot(),onExport:({value,name,type})=>download(value,name,type)});
const algebraPanel=readonlyPreview?null:createAlgebraPanel({container:document.querySelector('[data-workspace-window="algebra"] .workspace-window-content'),onSelect:id=>{if(model.objects.some(o=>o.id===id))select(id);},onEditDefinition:(id,key)=>{stopParameterScan();select(id);relations.open(key);},onGraph:openDependencyGraph,onVisibility:id=>{const target=model.objects.find(o=>o.id===id);if(target)mutate(()=>target.visible=target.visible===false,{reset:false,solve:false});}});
parameterPlayback=readonlyPreview?null:createParameterPlayback({scene:()=>model,onConfigureSlider:editParameterSlider,
 onStart:({id,initialValue})=>{finishInput();playing=false;parameterScan={id,initialValue,selected:ui.selected};transport();},
 onStep:({id,value})=>{const edit={spec:{owner:id,key:'value'}};scheduleLive(candidate=>writeInput(candidate,edit.spec,value),edit);flushLive();if(edit.error)throw Error(edit.error);},
 onStop:({id,initialValue,restore})=>{
  const scan=parameterScan;parameterScan=null;if(!scan)return;
  const current=model.objects.find(o=>o.id===id);if(!current||current.value===initialValue)return;
  // Rebuild only the scanned value; panning and display choices made during a scan stay intact.
  const baseline=structuredClone(model);baseline.objects.find(o=>o.id===id).value=initialValue;inheritResolverState(model,baseline);const resolved=resolveScene(baseline,{changedIds:[id]});validate(baseline);
  if(restore){const changed=motionKey(model)!==motionKey(baseline);model=baseline;update({reset:changed,solve:changed,resolved});}
  else{remember(baseline,scan.selected);chrome();}
 },
 onState:state=>{for(const button of document.querySelectorAll('[data-parameter-playback]'))button.setAttribute('aria-pressed',String(state.running&&button.dataset.parameterPlayback===state.id));}
});
if(parameterPlayback){$('stage').append(parameterPlayback.element);const positionScanStatus=()=>{parameterPlayback.element.style.bottom=Math.max(12,innerHeight-$('simulation-timeline').getBoundingClientRect().top+12)+'px';};new ResizeObserver(positionScanStatus).observe($('simulation-timeline'));positionScanStatus();}
function stopParameterScan(reason='已切换到其他操作。'){parameterPlayback?.stop({reason});}
function openDependencyGraph(id){stopParameterScan();dependencyGraphUI.open(id);}
function openParameterScan(id){stopParameterScan();finishInput();parameterPlayback?.open(id);}
function update({panel=true,fit=false,reset=true,solve=true,resolved}={}){
 model.teaching??={...teachingDefaults};resolution=resolved||resolveScene(model);if(reset){playing=false;time=0;ui.readingSide='after';}if(resolution.fieldUnavailable)playing=false;if(solve)traces=solveScene(resolution.scene);
 if(!traces.some(t=>t.particle.traceId===ui.trace))ui.trace=traces.find(t=>t.particle.objectId===ui.selected)?.particle.traceId||traces[0]?.particle.traceId||null;
 const activeTrace=traces.find(t=>t.particle.traceId===ui.trace);ui.segment=Math.max(0,Math.min(ui.segment,(activeTrace?.segments.length||1)-1));
 view.time=time;view.set(model,traces,ui);if(fit)view.fit({includeTracks:!examFitObjectsOnly});chrome();if(panel)renderPanel();else syncPanel();syncObjectPopover();parameterBoard?.sync();constructionUI?.sync();algebraPanel?.update({scene:model,dependencyGraph:resolution.dependencyGraph,selectedId:ui.selected});transport();
 if(panel&&traces.some(t=>t.truncated))toast('部分轨迹尚未算到观察终点，请缩短时长以完整观察。');
}
// Keep only the newest pointer/input sample per paint. Commit history separately,
// so a continuous adjustment updates live but still undoes in one step.
function scheduleLive(apply,context){pendingLive={apply,context};if(!liveFrame)liveFrame=requestAnimationFrame(flushLive);}
function cancelLive(){if(liveFrame)cancelAnimationFrame(liveFrame);liveFrame=0;pendingLive=null;}
function flushLive(){
 if(liveFrame)cancelAnimationFrame(liveFrame);liveFrame=0;const job=pendingLive;pendingLive=null;if(!job)return;
 const candidate=structuredClone(model);
 try{
  job.apply(candidate);inheritResolverState(model,candidate);const owner=job.context.spec?.owner||job.context.object?.id,resolved=resolveScene(candidate,owner?{changedIds:[owner]}:undefined);validate(candidate);const reset=motionKey(candidate)!==motionKey(model);model=candidate;
  job.context.error=null;if(job.context.target){job.context.target.removeAttribute('aria-invalid');job.context.target.removeAttribute('title');}
  update({panel:false,reset,solve:reset||job.context.solve,resolved});
 }catch(error){
  job.context.error=error.message;
  if(job.context.target){job.context.target.setAttribute('aria-invalid','true');job.context.target.title=error.message;}
  else $('tool-hint').textContent=error.message+'（保持上一个有效位置）';
 }
}
function inputSpec(e){
 if(e.id==='trail-duration'||e.id==='trail-duration-slider')return {key:'duration',trail:true};
 if(e.dataset.prop)return {owner:e.dataset.owner,key:e.dataset.prop};
 if(e.id==='object-label')return {owner:e.dataset.owner,key:'label'};
 if(e.id==='duration')return {key:'duration'};
 if(e.id==='arc-start'||e.id==='arc-end')return {key:e.id==='arc-start'?'start':'end',aid:true};
 return null;
}
function readInput(scene,spec){
 if(spec.trail)return scene.trail[spec.key];
 if(spec.aid)return scene.aids[spec.key]*100;if(spec.key==='duration')return scene.duration;
 const o=scene.objects.find(o=>o.id===spec.owner),point=spec.key.match(/^point(\d+)(x|y)$/);
 return point?o?.points[Number(point[1])][point[2]==='x'?0:1]:o?.[spec.key];
}
function writeInput(scene,spec,value){
 if(spec.trail){scene.trail[spec.key]=value;return;}
 if(spec.aid){scene.aids[spec.key]=spec.key==='start'?Math.max(0,Math.min(value/100,scene.aids.end-.001)):Math.min(1,Math.max(value/100,scene.aids.start+.001));return;}
 if(spec.key==='duration'){scene.duration=value;return;}
 const o=scene.objects.find(o=>o.id===spec.owner),point=spec.key.match(/^point(\d+)(x|y)$/);
 if(geometryControlled(o,spec.key))throw Error('这个量由几何构造控制，请调整输入对象或构造参数。');
 if(bindingKey(o,spec.key))throw Error('这个量由依赖定义控制，请调整自由量或先解除依赖。');
 if(o.points&&['x','y'].includes(spec.key)&&Object.keys(o.defs||{}).some(k=>k.startsWith('point')))throw Error('端点已建立依赖，请调整自由端点或其路径参数。');
 if(point)o.points[Number(point[1])][point[2]==='x'?0:1]=value;
 else if(['x','y'].includes(spec.key)&&o.points){const axis=spec.key==='x'?0:1,delta=value-o[spec.key];o.points=o.points.map(p=>p.map((v,i)=>v+(i===axis?delta:0)));o[spec.key]=value;}
 else o[spec.key]=value;
}
function previewInput(e){
 if(readonlyPreview)return;
 const spec=inputSpec(e);if(!spec)return;stopParameterScan('已转为手动调参。');const raw=e.value,value=e.type==='text'?raw:e.valueAsNumber,valid=e.validity.valid;
 if(inputEdit?.target!==e){finishInput();inputEdit={target:e,spec,before:structuredClone(model),selected:ui.selected,time,readingSide:ui.readingSide,playing,solve:!spec.trail&&(spec.key==='duration'||physical(model.objects.find(o=>o.id===spec.owner)))};}
 const edit=inputEdit;if(e.value!==raw)e.value=raw;
 if(raw===''&&e.type!=='text'||!valid||e.type!=='text'&&!Number.isFinite(value)){
  cancelLive();edit.error='请输入有效范围内的完整数值。';e.setAttribute('aria-invalid','true');e.title=edit.error;return;
 }
 scheduleLive(candidate=>writeInput(candidate,spec,value),edit);
}
function finishInput(e=inputEdit?.target){
 if(!inputEdit||e!==inputEdit.target)return;flushLive();const edit=inputEdit;inputEdit=null;
 if(JSON.stringify(edit.before)!==JSON.stringify(model))remember(edit.before,edit.selected);
 if(edit.error){e.value=readInput(model,edit.spec);e.removeAttribute('aria-invalid');e.removeAttribute('title');toast(edit.error+' 已保留最后一个有效值。');}
 chrome();syncPanel();
}
function cancelInput(){
 if(!inputEdit)return;cancelLive();const edit=inputEdit;inputEdit=null;model=edit.before;time=edit.time;ui.readingSide=edit.readingSide;playing=edit.playing;
 edit.target.value=readInput(model,edit.spec);edit.target.removeAttribute('aria-invalid');edit.target.removeAttribute('title');update({reset:false,panel:false});
}
function remember(before,selected=ui.selected){history.push({model:before,selected});if(history.length>40)history.shift();future.length=0;}
function resetEditingTools(){stopParameterScan();parameterPlayback?.close();contextMenu.close();contextMenu.closePopover();notationEditor.reset();parameterSliderDialog?.reset();objectStyleDialog?.reset();exampleGallery?.close();polygonEditor?.reset();constructionUI?.cancel({changeMode:false});dependencyGraphUI.close();pendingCopy=null;ui.tool='select';view.preview=null;view.snapPreview=null;view.hoverRegion=null;}
function mutate(fn,{fit=false,reset,solve=true}={}){if(readonlyPreview)return;stopParameterScan();finishInput();const prior=model,before=structuredClone(model),selected=ui.selected;try{fn();if(model!==prior){resetEditingTools();resetFieldProbe();view.resetFieldDisplay();timelineUI.clearBookmarks();relations.restored();}const resolved=resolveScene(model);validate(model);if(JSON.stringify(before)!==JSON.stringify(model))remember(before,selected);update({fit,reset:reset??motionKey(before)!==motionKey(model),solve,resolved});}catch(error){model=before;ui.selected=selected;toast(error.message);update({reset:false});}}
function select(id,trace){const changed=id!==ui.selected||trace&&trace!==ui.trace;ui.selected=id;if(changed){ui.trace=trace||traces.find(t=>t.particle.objectId===id)?.particle.traceId||ui.trace;ui.segment=0;model.aids.start=0;model.aids.end=1;}view.ui=ui;view.render();chrome();renderPanel();algebraPanel?.update({scene:model,dependencyGraph:resolution.dependencyGraph,selectedId:ui.selected});if(changed)transport();}
function scaleNote(){if($('scale-note')){const metres=view.view.scale<1;$('scale-note').innerHTML=tex(metres?s`1\,\mathrm{m}`:s`1\,\mathrm{cm}`)+' · '+Math.round(view.view.scale*(metres?100:1))+' px';}}
function chrome(){
 if(readonlyPreview){ui.tool='pan';ui.sidebar=false;ui.present=true;}
 document.body.classList.toggle('teaching-on',!!model.teaching?.enabled);
 document.body.classList.toggle('panel-closed',!ui.sidebar||ui.present);document.body.classList.toggle('present',ui.present);
 $('present').classList.toggle('active',ui.present);$('present').textContent=ui.present?'退出投屏':'投屏';$('inspector-toggle').textContent=ui.sidebar&&!ui.present?'参数 ›':'‹ 参数';
 $('undo').disabled=!history.length;$('redo').disabled=!future.length;
 document.querySelectorAll('[data-panel]').forEach(b=>b.classList.toggle('active',b.dataset.panel===ui.panel));
 document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===ui.tool));
 $('field-probe-button').setAttribute('aria-pressed',String(ui.tool==='field-probe'));
 for(const [id,tool] of [['field-menu','field'],['electric-menu','electric'],['source-menu','source'],['measure-menu','ruler']])$(id).classList.toggle('active',ui.tool===tool);
 $('geometry-button').classList.toggle('active',ui.panel==='geometry'&&ui.sidebar);
 $('track-mode').value=model.display.tracks?(model.trail.enabled?'both':'full'):model.trail.enabled?'trail':'none';
 document.querySelectorAll('[data-snap-toggle]').forEach(b=>{const active=!!model.snap[b.dataset.snapToggle];b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 $('snap-grid-size').innerHTML=tex(`${num(model.snap.step)}\\,\\mathrm{cm}`);
 const notice=$('dependency-notice'),incomplete=traces.some(t=>t.truncated);notice.hidden=!resolution.issues.length&&!incomplete;notice.textContent=resolution.issues.length?(resolution.fieldUnavailable?'场定义暂不可用，仿真暂停。':`${resolution.issues.length} 个对象暂不可用。`)+resolution.issues.map(x=>x.label+'：'+x.message).join('；')+' 条件恢复后自动恢复。':incomplete?'部分轨迹尚未算到观察终点，请缩短观察时长。':'';
 const hints={select:'拖动对象或蓝色手柄 · 滑杆连续调参 · ƒ 定义依赖',pan:'单指拖动画布 · 双指或按钮缩放',particle:'点按放置粒子；按住拖动可设初速度方向',source:'点按放置粒子源；拖动可设置方向或发射范围',field:ui.addType==='annulus'?'从圆心拖出外边界；内半径初始为一半，可在参数中调整':ui.addType==='circle'?'从圆心拖出圆形磁场':'拖动画出区域，点按可放置默认尺寸',ruler:'拖出直尺，端点可继续调整',line:'从第一点拖到第二点；端点支持精确捕捉',circle:'从圆心拖出辅助圆',point:'点按放置辅助点；可捕捉并锁定交点或路径',angle:`量角器：${['先点第一个端点','再点顶点','最后点第二个端点'][angleDraft.length]}`,label:'点按放置标注，右侧可修改字母或 LaTeX',duplicate:'点按放置副本'};
 hints['field-probe']='场强探针：点按任意位置查看合场与各场贡献 · V 返回选择';$('tool-hint').textContent=hints[ui.tool]||'';const o=object();$('selection-info').innerHTML=o?label(o.label)+' · '+kinds[o.kind]:`${model.objects.length} 个场景对象`;
 if(ui.tool==='electric')$('tool-hint').textContent=['circle','annulus','semicircle','sector'].includes(ui.addType)?'从圆心拖出场域；波形与周期在参数栏设置':'拖出电场区域；强度、方向与波形可在参数栏调整';
 $('paper').style.cursor=ui.tool==='pan'?'grab':ui.tool==='select'?'default':'crosshair';scaleNote();
 const actions=$('selection-actions');actions.hidden=!o||ui.present||ui.tool!=='select';$('selection-action-label').innerHTML=o?label(o.label):'';
 $('inspector-toggle').setAttribute('aria-expanded',String(ui.sidebar&&!ui.present));
 $('paper').setAttribute('aria-label','平面带电粒子物理沙盒。'+(hints[ui.tool]||''));
 if(relations.picking)$('tool-hint').textContent='点选一个场景对象，将引用插入表达式';
 if(constructionUI?.active)$('tool-hint').textContent=constructionUI.hint;
 if(ui.tool.startsWith('fill-'))$('tool-hint').textContent='选择一个已构造的圆或多边形，将'+(ui.tool==='fill-electric'?'电场':'磁场')+'持续绑定到此区域。';
 workspaceLayout.sync({sidebar:ui.sidebar,present:ui.present,readonly:readonlyPreview,tool:ui.tool,panel:ui.panel});
}
const section=(title,content,extra='')=>`<section class="section"><h3>${title}<span>${extra}</span></h3>${content}</section>`;
function input(key,code,name,unit,value,options={}){
 const {min,step='any',max,owner=object(),prefix='prop',definition:withDefinition=true}=options,o=owner,parameterSlider=o.kind==='parameter'&&key==='value'?resolveParameterSlider(o):null,bound=bindingKey(o,key),controlled=geometryControlled(o,key),range=parameterSlider?[parameterSlider.min,parameterSlider.max]:sliderBounds(key,value,options),rangeStep=parameterSlider?.step??step,disabled=bound||controlled||parameterSlider?.representable===false?'disabled':'',definition=bound?`<div class="bound-definition">${label(definitionTex(model,o.defs[bound]))}</div>`:controlled?`<div class="bound-definition">${esc(o.regionSource?'由绑定区域控制':constructionNames.get(o.construction?.type)||'由几何构造控制')}</div>`:'',id=prefix+'-'+key;
 return `<div class="property ${bound||controlled?'bound':''}" data-property="${key}"><div class="form-row"><label for="${id}" data-scrub="${key}" title="横向拖动微调；Shift 更精细">${tex(code)} ${name}</label><span class="number-controls"><input id="${id}" data-prop="${key}" data-owner="${o.id}" data-unit="${esc(unit)}" aria-label="${name}" type="number" value="${value}" ${bound||controlled?'readonly':''} ${min!==undefined?`min="${min}"`:''} ${max!==undefined?`max="${max}"`:''} step="${step}">${withDefinition?controlled?`<button data-open-dependency="${o.id}" class="formula-button active" title="查看构造输入" aria-label="查看${name}的构造关系">◇</button>`:`<button data-fx="${key}" data-fx-owner="${o.id}" class="formula-button ${bound?'active':''}" title="${bound?'编辑依赖':'定义数学关系'}" aria-label="定义${name}">ƒ</button>`:''}</span></div><div class="unit-value">${tex(quantity(value,unit,5))}</div><input class="parameter-slider ${parameterSlider?.representable===false?'is-unrepresentable':''}" data-prop="${key}" data-owner="${o.id}" type="range" min="${range[0]}" max="${range[1]}" step="${rangeStep}" value="${value}" ${disabled} aria-label="连续调节${name}">${parameterSlider?`<div class="parameter-slider-actions"><button type="button" data-slider-settings="${o.id}">${parameterSlider.configured?'滑杆设置':'范围与步长'}</button><button type="button" data-parameter-playback="${o.id}" ${bound?'disabled':''} aria-pressed="false">扫描播放</button><button type="button" data-slider-nearest="${o.id}" ${parameterSlider.representable?'hidden':''} ${bound?'disabled':''}>回到最近刻度</button></div><p class="parameter-slider-note" ${parameterSlider.representable?'hidden':''}>${esc(parameterSlider.reason||'')}</p>`:''}${definition}</div>`;
}
// Range preferences never constrain exact numeric inputs or dependency values.
function syncParameterControl(property,o){
 if(o?.kind!=='parameter'||!property)return;
 const state=resolveParameterSlider(o),range=property.querySelector('input[type=range]');
 if(range){if(state.configured){range.min=String(state.min);range.max=String(state.max);}else if(o.value<Number(range.min)||o.value>Number(range.max)){range.min=String(Math.min(Number(range.min),o.value));range.max=String(Math.max(Number(range.max),o.value));}range.step=String(state.step);range.disabled=!!bindingKey(o,'value')||!state.representable;range.classList.toggle('is-unrepresentable',!state.representable);if(range!==document.activeElement&&range!==inputEdit?.target)range.value=String(o.value);}
 const message=property.querySelector('.parameter-slider-note');if(message){message.hidden=state.representable;message.textContent=state.reason||'';}
 const nearest=property.querySelector('[data-slider-nearest]');if(nearest){nearest.hidden=state.representable;nearest.disabled=!!bindingKey(o,'value');}
 const settings=property.querySelector('[data-slider-settings]');if(settings)settings.textContent=state.configured?'滑杆设置':'范围与步长';
}
async function editParameterSlider(id){
 const parameter=model.objects.find(o=>o.id===id&&o.kind==='parameter');if(!parameter||!parameterSliderDialog)return;
 stopParameterScan();finishInput();const config=await parameterSliderDialog.open(structuredClone(parameter));if(config===null)return;
 mutate(()=>{const current=model.objects.find(o=>o.id===id);if(!current||current.kind!=='parameter')return;if(config===undefined)delete current.slider;else current.slider=config;},{reset:false,solve:false});
}
async function editObjectStyle(id){
 const target=model.objects.find(o=>o.id===id);if(!target||!objectStyleDialog)return;stopParameterScan();finishInput();
 const style=await objectStyleDialog.open(structuredClone(target),{ink:model.display.ink});if(style===null)return;
 mutate(()=>{const current=model.objects.find(o=>o.id===id);if(!current)return;if(style===undefined)delete current.style;else current.style=style;},{reset:false,solve:false});
 toast(style?.color&&model.display.ink?'样式已保存；当前按黑白模式显示。':'对象样式已更新，位置与运动时刻保持不变。');
}
function useMeasurement(id,key){
 let result;mutate(()=>{result=addMeasurementParameter(model,id,key);ui.selected=result.id;ui.panel='objects';},{reset:false,solve:false});
 if(result){workspaceLayout.open('variables');toast(result.name+'已作为持续依赖量加入参数台，可继续被公式引用。');}
}
function measurementPanel(o){
 const measurements=readMeasurements(model,o.id);if(!measurements.length)return '';
 return section('几何测量',`<div class="measurement-list" data-measurement-source="${o.id}">${measurements.map(item=>`<div class="measurement-row"><span>${item.name}</span><strong data-measurement-value="${item.key}">${item.defined?tex(quantity(item.value,units[item.unit].tex,5)):'暂未定义'}</strong><button type="button" data-use-measurement="${item.key}" data-measurement-owner="${o.id}" ${item.defined?'':'disabled'} aria-label="将${item.name}作为参数引用">引用到参数台</button></div>`).join('')}</div><p class="note">测量值跟随几何变化；加入参数台后可在公式中继续引用。</p>`);
}
function syncMeasurements(container){
 for(const list of container.querySelectorAll('[data-measurement-source]'))for(const item of readMeasurements(model,list.dataset.measurementSource)){
  const output=list.querySelector('[data-measurement-value="'+item.key+'"]'),button=list.querySelector('[data-use-measurement="'+item.key+'"]');
  if(output){output.innerHTML=item.defined?tex(quantity(item.value,units[item.unit].tex,5)):'暂未定义';output.title=item.reason||'';}if(button)button.disabled=!item.defined;
 }
}
function sliderBounds(key,value,{min,max,owner=object()}={}){
 if(key==='mass')return [min??1e-8,Math.max(value*4,value<.01?.002:6)];
 if(key==='heading'||key==='angle'||key==='fieldAngle'||key==='phase')return [-180,Math.max(360,value)];
 if(key==='period')return [.000001,Math.max(2,value*3)];
 if(key==='E0')return [0,Math.max(50,value*3)];
 if(key.startsWith('pathT')){try{const path=owner.construction?.type==='point-on'?owner.construction.inputs[0]:pathDefinition(owner,key==='pathT'?'position':'point'+key.slice(5)),r=createResolver(model),g=r.geometry(r.evaluate(path));if(g.kind==='circle')return [Math.min(0,value),Math.max(360,value)];if(g.kind==='polygon')return [0,g.points.length];if(g.domain==='segment')return [0,1];return [g.domain==='ray'?0:Math.min(-2,value),Math.max(2,value)];}catch{return [Math.min(-2,value),Math.max(2,value)];}}
 const span=key==='B'?Math.max(200,Math.abs(value)*2):Math.max(5,Math.abs(value)*3);
 return [min??Math.min(-span,value),max??Math.max(span,value)];
}
const opt=(key,name,current)=>`<option value="${esc(key)}" ${key===current?'selected':''}>${esc(name)}</option>`;
function renderPanel(){
 if(ui.panel==='teaching'){$('panel-content').innerHTML=teachingPanel(model,traces,ui);syncTeaching();return;}
 if(ui.panel==='relations'){relations.render();return;}
 if(ui.panel==='geometry'){geometryPanel();return;}if(ui.panel==='display'){displayPanel();return;}
 let out=section('场景对象',model.objects.length?`<input id="object-search" type="search" value="${esc(ui.objectSearch)}" placeholder="查找对象名称或类型" aria-label="查找场景对象"><div class="object-list">${model.objects.map(o=>`<div class="object-row ${o.id===ui.selected?'selected':''} ${o.enabled?'':'muted'}" data-select="${o.id}" data-search-label="${esc(o.label+' '+kinds[o.kind])}" role="button" tabindex="0" aria-label="选择${esc(o.label)}"><span class="type">${kinds[o.kind]}</span><span class="object-label">${label(o.label)}</span><button data-visible="${o.id}" title="${o.visible?'隐藏':'显示'}对象">${o.visible?'◉':'○'}</button></div>`).join('')}</div>`:'<p class="empty">从左侧添加粒子、粒子源、电场或磁场。可以在画布任意位置搭建。</p>',`${model.objects.length} 个`);
 const o=object();if(o){
  out+=`<div class="section-title">${kinds[o.kind]}属性<small>${physical(o)?'初态实时演算':'独立几何测量'}</small></div>`;
  out+=section('基本设置',`<div class="form-row"><label for="object-label">标注</label><input id="object-label" data-owner="${o.id}" type="text" value="${esc(o.label)}" maxlength="${o.kind==='label'?4000:60}" aria-label="对象标注"></div><button type="button" data-edit-notation="${o.id}" class="wide-button">图形编辑标注公式</button>${objectStyleKeys(o).length?`<button type="button" data-object-style="${o.id}" class="wide-button">对象样式</button>`:''}`+
   `<div class="check-list">${physical(o)?`<label><input id="object-enabled" type="checkbox" ${o.enabled?'checked':''}>参与仿真</label>`:''}<label><input id="object-visible" type="checkbox" ${o.visible?'checked':''}>显示对象</label></div>`+
   (o.kind==='parameter'?'':isField(o)&&o.shape==='infinite'?'<p class="note">覆盖全平面；无限场不设置位置与尺寸。</p>':input('x','x_0','横坐标','cm',o.x)+input('y','y_0','纵坐标','cm',o.y)));
  if(o._error)out+=`<div class="object-issue">${esc(o._error)}<button data-open-dependency="${o.id}">查看依赖来源</button></div>`;
  if(o.construction||o.regionSource){const info=constructionInfo(model,o.id);out+=section('构造关系',`<p class="note">${esc(o.regionSource?'场域持续跟随所选几何区域':constructionNames.get(info.type)||info.type)}</p><div class="construction-input-links">${info.inputs.map(id=>`<button type="button" data-focus-object="${id}">${label(model.objects.find(x=>x.id===id)?.label||id)}</button>`).join('')}</div><button type="button" data-open-dependency="${o.id}" class="wide-button">查看输入与下游关系图</button>`+(o.regionSource?`<label class="small-label">改为绑定其他区域</label><select id="field-region-source" class="full-select">${model.objects.filter(x=>['circle','polygon'].includes(x.kind)).map(x=>opt(x.id,x.label+' · '+kinds[x.kind],o.regionSource)).join('')}</select><button type="button" data-detach-region="${o.id}" class="wide-button" ${o._error?'disabled':''}>解除区域绑定，保留当前场域</button>`:`<button type="button" data-edit-construction="${o.id}" class="wide-button">重选构造输入，保留下游</button><button type="button" data-detach-construction="${o.id}" class="wide-button" ${o._error?'disabled':''}>解除几何构造，保留独立公式</button>`));}
  const constructionParameters=constructionSpecsUI.get(o.construction?.type)?.parameters?.filter(p=>p.key!=='radius')||[];
  if(constructionParameters.length)out+=section('构造参数',constructionParameters.map(p=>{const meta=properties(o)[p.key];return input(p.key,meta?.tex||p.key,p.label,units[p.unit]?.tex||p.unit,o[p.key],{min:p.min,max:p.max,step:p.integer?1:'any'});}).join('')+(o.construction?.type==='regular-polygon'?`<div class="form-row"><label>生成方向</label><select id="polygon-orientation"><option value="1" ${o.construction.orientation!==-1?'selected':''}>逆时针</option><option value="-1" ${o.construction.orientation===-1?'selected':''}>顺时针</option></select></div>`:''));
  if(o.kind==='parameter')out+=section('自由量',`<div class="form-row"><label>单位</label><select id="parameter-unit">${Object.keys(units).map(k=>opt(k,({speed:'10⁵ m/s',deg:'°',us:'μs'})[k]||k||'无量纲',o.unit)).join('')}</select></div>`+input('value',o.label,'数值',units[o.unit].tex,o.value)+`<p class="note">其他参数可以引用这个自由量。滑动数值，整条依赖随之更新。</p>`);
  if(o.kind==='circle')out+=section('辅助圆',input('radius','R','半径','cm',o.radius,{min:.000001}));
  if(o.kind==='label')out+=section('公式排版',input('fontSize','s','字号','px',o.fontSize??20,{min:10,max:72,step:1,definition:false})+input('labelWidth','W','标注宽度','px',o.labelWidth??320,{min:80,max:1200,step:10,definition:false})+input('labelHeight','H','标注高度','px',o.labelHeight??100,{min:40,max:600,step:10,definition:false}));
  if(o.kind==='line')out+=section('辅助线',`<div class="form-row"><label>类型</label><select id="line-type" ${constructionOwns(o,'lineType')?'disabled':''}>${[['line','直线'],['segment','线段'],['ray','射线']].map(([k,v])=>opt(k,v,o.lineType)).join('')}</select></div>`+(constructionOwns(o,'lineType')?'<p class="note">线的类型持续跟随原图形。</p>':''));
  const pathKeys=Object.keys(o).filter(k=>/^pathT\d*$/.test(k));if(pathKeys.length)out+=section('沿路径移动',pathKeys.map(k=>input(k,'t_{p'+k.slice(5)+'}',k==='pathT'?'路径参数':'端点 '+(Number(k.slice(5))+1)+' 路径参数','',o[k])).join('')+`<p class="note">圆上用角度（度）；线段上 ${tex('0\\leq t_p\\leq1')}。也可直接拖动路径上的点。</p>`);
  if(['particle','source'].includes(o.kind)){
   out+=section('粒子参数',`<div class="form-row"><label>类型预设</label><select id="particle-preset" aria-label="粒子类型"><option value="custom">自定义参数</option value="proton">质子</option><option value="electron">电子</option><option value="alpha">α 粒子</option></select></div>`+
    input('mass','m','质量','u',o.mass,{min:1e-8})+input('charge','q','电荷量','e',o.charge)+input('speed','v_0','初速率',s`10^5\,m\,s^{-1}`,o.speed,{min:0})+input('heading',s`\theta_0`,o.kind==='source'?'中心方向':'速度方向',s`{}^\circ`,o.heading)+`<p class="note">角度从正 ${tex('x')} 轴逆时针量起。拖动蓝色箭头端点也可设置方向。</p>`);
  }
  if(o.kind==='source'){
   out+=section('粒子源',`<div class="form-row"><label>发射范围</label><select id="source-type" aria-label="粒子源类型">${Object.entries(sourceNames).map(([k,v])=>opt(k,v,o.sourceType)).join('')}</select></div>`+
    input('count','N','发射数量','',o.count,{min:1,max:100,step:1})+input('interval',s`\Delta t_e`,'发射间隔',s`\mu s`,o.interval,{min:0})+input('spread',s`\Delta\theta`,'方向张角',s`{}^\circ`,o.spread,{min:0,max:360})+input('speedSpan',s`\Delta v`,'速率范围',s`10^5\,m\,s^{-1}`,o.speedSpan,{min:0})+
    (o.sourceType==='line'?input('length','L','源长度','cm',o.length,{min:.01}):'')+(o.sourceType==='circle'?input('radius','R_s','源半径','cm',o.radius,{min:.01}):'')+
    (o.sourceType==='rectangle'?input('width','W_s','源宽度','cm',o.width,{min:.01})+input('height','H_s','源高度','cm',o.height,{min:.01}):'')+
    (o.sourceType==='line'||o.sourceType==='rectangle'?input('angle',s`\eta`,'范围转角',s`{}^\circ`,o.angle):'')+`<p class="note">间隔为零时同时发射。方向与速率在设定范围内均匀取样；区域源在范围内取样。观察时长会限制实际发射数量。</p>`);
  }
  if(isField(o)){
   const electric=o.kind==='electric';
   out+=section(electric?'电场参数':'磁场参数',`<div class="form-row"><label>区域类型</label><select id="field-type" aria-label="场域类型" ${o.regionSource?'disabled':''}>${Object.entries(fieldNames).map(([k,v])=>opt(k,electric?v.replace('磁场','电场'):v,o.shape)).join('')}</select></div>`+
    (electric?`<div class="form-row"><label for="waveform">时间变化</label><select id="waveform" aria-label="电场波形">${Object.entries(waveNames).map(([k,v])=>opt(k,v,o.waveform)).join('')}</select></div>`+input('E0',o.waveform==='dc'?'E':'E_0',o.waveform==='dc'?'电场强度':'电场峰值','kV/m',o.E0,{min:0})+input('fieldAngle',s`\varphi_E`,'电场正向',s`{}^\circ`,o.fieldAngle):input('B','B','磁感应强度','mT',o.B))+
    `<div class="field-actions"><button id="reverse-field">反转方向</button><button id="zero-field">设为零场</button></div><p class="note">${electric?'方向从正 '+tex('x')+' 轴逆时针量起。箭头指向正电荷受力方向；也可拖动场中心的方向手柄。':'正值用点表示，指向纸外；负值用叉表示，指向纸内。'}</p>`+
    (['circle','annulus','semicircle','sector'].includes(o.shape)?input('radius','R',o.shape==='annulus'?'外半径':'场域半径','cm',o.radius,{min:o.shape==='annulus'?.000001:.01}):'')+(o.shape==='annulus'?input('innerRadius','r','内半径','cm',o.innerRadius,{min:0})+'<p class="note">0 ≤ r &lt; R；内孔无此场，内半径为 0 时恢复圆形场域。</p>':'')+(['rectangle','triangle','strip'].includes(o.shape)?input('width','W','宽度','cm',o.width,{min:.000001}):'')+(['rectangle','triangle'].includes(o.shape)?input('height','H','高度','cm',o.height,{min:.000001}):'')+
    (o.shape==='sector'?input('sectorAngle',s`\alpha`,'扇形张角',s`{}^\circ`,o.sectorAngle,{min:.01,max:180}):'')+
    (!['circle','annulus','infinite','polygon'].includes(o.shape)?input('angle',s`\eta`,'区域转角',s`{}^\circ`,o.angle):'')+`<p class="note">场域内空间均匀。电场按矢量叠加，磁场按纸内／纸外正负叠加。${['semicircle','sector'].includes(o.shape)?'圆弧从区域转角起逆时针展开；半圆固定展开 '+tex('180^\\circ')+'。':''}</p>`);
   if(electric&&o.waveform!=='dc')out+=section('交变电场',input('period','T_E','交变周期',s`\mu s`,o.period,{min:.000001})+input('phase',s`\phi_E`,'初相位',s`{}^\circ`,o.phase)+`<div id="wave-readout">${waveReadout(o)}</div><p class="note">正弦波按 ${tex(s`E(t)=E_0\sin(2\pi t/T_E+\phi_E)`)}；方波按同一相位每半周期反向。所有粒子共用同一时钟。</p>`+syncControls(o));
  }
  if(o.kind==='field'){out+=section('磁场时间规律',`<select id="magnetic-waveform" class="full-select" aria-label="磁场波形"><option value="dc" ${o.waveform!=='square'?'selected':''}>恒定磁场</option><option value="square" ${o.waveform==='square'?'selected':''}>每半周期反向（理想模型）</option></select>`+(o.waveform==='square'?input('period','T_B','交变周期',s`\mu s`,o.period,{min:.000001})+input('phase',s`\phi_B`,'初相位',s`{}^\circ`,o.phase)+`<p class="note">0°从所填 B 开始，180°从反向开始。磁场正值仍为纸外；忽略换向产生的感生电场。</p>`:''));}
  out+=measurementPanel(o);
  if(o.kind==='polygon')out+=section('区域填充',`<div class="field-actions"><button type="button" data-fill-region="electric" data-region="${o.id}">填充电场</button><button type="button" data-fill-region="field" data-region="${o.id}">填充磁场</button></div>`);
  if(o.kind==='polygon'&&(!o.construction||o.construction.type==='polygon'))out+='<button type="button" data-edit-polygon="'+o.id+'" class="wide-button">编辑顶点数量与顺序</button>';
  if(o.points&&!o.regionSource){const content=o.points.map((p,i)=>input('point'+i+'x',`x_${i+1}`,'端点横坐标','cm',p[0])+input('point'+i+'y',`y_${i+1}`,'端点纵坐标','cm',p[1])).join('');out+=o.construction?`<details class="relation-details"><summary>派生顶点坐标 · ${o.points.length} 个</summary>${content}</details>`:section('测量端点',content+'<p class="note">可直接拖动蓝色端点，测量值随位置更新。</p>');}
  out+=`<div class="field-actions"><button id="duplicate">${hasObjectDependencies(o)?'复制对象…':'复制并放置'}</button><button id="delete" class="danger">删除对象</button></div>`;
 }
 $('panel-content').innerHTML=out;filterObjects();syncPanel();
}
function filterObjects(){const needle=ui.objectSearch.trim().toLocaleLowerCase();for(const row of $('panel-content').querySelectorAll('[data-select]'))row.hidden=!!needle&&!row.dataset.searchLabel.toLocaleLowerCase().includes(needle);}
function traceOptions(){return traces.map(t=>opt(t.particle.traceId,t.particle.index===undefined?t.particle.label.replace(/[_{}]/g,''):'源 '+t.particle.objectId.slice(1)+' · 第 '+(t.particle.index+1)+' 个',ui.trace)).join('');}
function segmentOptions(segments){return segments.length?segments.map((p,i)=>opt(String(i),`第 ${i+1} 段 · ${p.C?'磁场圆弧':norm(p.a||[0,0])||p.sines?.length?(p.w?'复合场':p.sines?.length?'交变电场':'电场'):'直线'}${p.end==='limit'?' · 终点':''}`,String(ui.segment))).join(''):'<option>暂无轨迹</option>';}
function geometryReadout(seg){
 if(!seg)return '<p class="empty">当前没有有效轨迹。请添加粒子或调整观察时长。</p>';
 const g=pathGeometry(seg,model.aids.start,model.aids.end),row=(name,code)=>`<div class="row"><span>${name}</span>${tex(code)}</div>`;
 if(!seg.C)return `<div class="readout">${row('两端连线',s`\ell=${quantity(g.chord*100,'cm')}`)}${row('轨迹路程',s`s=${quantity(g.length*100,'cm')}`)}${row('起点速率',s`v_P=${quantity(norm(g.a.v)/1e5,s`10^5\,m\,s^{-1}`)}`)}${row('终点速率',s`v_Q=${quantity(norm(g.b.v)/1e5,s`10^5\,m\,s^{-1}`)}`)}${row('电场做功',s`W_E=${quantity(g.work/E,'eV')}`)}${row('速度夹角',g.delta===null?s`\delta\text{ 未定义}`:s`\delta=${num(deg(g.delta))}^{\circ}`)}${row('用时',s`\Delta t=${quantity(g.dt*1e6,s`\mu s`)}`)}</div><p class="note">本段不使用固定圆心、半径或圆弧公式。静止端点没有速度方向。端点比例按本段的时间选取。</p>`;
 return `<div class="readout">${row('半径',s`r=${quantity(seg.r*100,'cm')}`)}${row('弦长',s`\ell=${quantity(g.chord*100,'cm')}`)}${row('弧长',s`s=${quantity(g.length*100,'cm')}`)}${row('实际累计转角',s`\varphi=${num(deg(g.phi))}^{\circ}`)}${row('两端速度夹角',s`\delta=${num(deg(g.delta))}^{\circ}`)}${row('弦切角',g.alpha===null?s`\alpha\text{ 未定义}`:s`\alpha=${num(deg(g.alpha))}^{\circ}`)}${row('该段用时',s`\Delta t=${quantity(g.dt*1e6,s`\mu s`)}`)}${row('回旋周期',s`T=${quantity(seg.T*1e6,s`\mu s`)}`)}${tex(s`\Delta t=\frac{\varphi}{2\pi}T`,true)}</div><p class="note">${tex('O_1')} 是轨迹圆心。${tex('Q_t')} 为人为截取的观察终点。累计转角可超过一圈，不能用速度夹角代替。</p>`;
}
function instantReadout(){
 const {trace}=view.selectedSegment(),reading=readMotionState(trace,time,{side:ui.readingSide}),state=reading.state;if(!reading.available)return `<p class="note">${esc(reading.reason||'当前时刻尚未发射，或轨迹暂不可用。')}</p>`;
 const seg=state.segment,forces=forcesAt(seg,state.v,state.local),instantE=segmentElectric(seg,state.local),row=(name,code)=>`<div class="row"><span>${name}</span>${tex(code)}</div>`;
 if(reading.dynamicsAvailable===false)return `<div class="readout">${row('终点速率',s`v=${quantity(norm(state.v)/1e5,s`10^5\,m\,s^{-1}`)}`)}${row('终点动能',s`K=${quantity(forces.energy/E,'eV')}`)}</div><p class="note">这里只计算到该终点的位置、速度与动能。后侧运动段尚未计算，不显示后侧合场或受力。</p>`;
 const names=seg.fieldIds.map(id=>model.objects.find(o=>o.id===id)?.label||id);
 return `<div class="readout">${row('合电场',s`\vec E_\Sigma=(${num(instantE[0]/1000)},\,${num(instantE[1]/1000)})\,\mathrm{kV/m}`)}${row('合磁场',s`B_\Sigma=${quantity(seg.B*1000,'mT')}`)}${row('速率',s`v=${quantity(norm(state.v)/1e5,s`10^5\,m\,s^{-1}`)}`)}${row('电场力',s`|\vec F_E|=${quantity(norm(forces.electric),'N')}`)}${row('磁场力',s`|\vec F_B|=${quantity(norm(forces.magnetic),'N')}`)}${row('合力',s`|\vec F|=${quantity(norm(forces.total),'N')}`)}${row('动能',s`K=${quantity(forces.energy/E,'eV')}`)}</div><p class="note">${reading.endpointOnly?'已计算终点；没有后续运动段。':['boundary','switch'].includes(reading.boundaryKind)?(reading.side==='before'?'变化前一侧。':'变化后一侧。'):''}当前经过：${names.length?names.map(label).join('、'):'无场区'}。受力箭头在同一粒子处按同一比例显示。</p>`;
}
function geometryPanel(){
 const {trace,segments,seg}=view.selectedSegment();if(trace)ui.trace=trace.particle.traceId;
 const flags=[['center','轨迹圆心'],['radius','辅助半径'],['circle','轨迹整圆'],['chord','端点连线'],['arc','选中轨迹'],['tangent','两端切线'],['angles','圆弧角度']];
 let out=section('选择轨迹',`<div class="form-row"><label>粒子轨迹</label><select id="trace-select" aria-label="选择粒子轨迹">${traceOptions()}</select></div><div class="form-row"><label>运动分段</label><select id="segment-select" aria-label="选择轨迹段" ${segments.length?'':'disabled'}>${segmentOptions(segments)}</select></div><p class="note">每次进入或离开场域均分段；也可直接点选画布上的轨迹。</p>`);
 out+=section('当前时刻的合场与受力',`<div id="instant-readout">${instantReadout()}</div>`);
 out+=section('几何辅助',`<div class="check-list">${flags.map(([k,v])=>`<label><input data-aid="${k}" type="checkbox" ${model.aids[k]?'checked':''} ${['center','radius','circle','angles'].includes(k)&&!seg?.C?'disabled':''}>${v}</label>`).join('')}</div><div class="field-actions"><button id="focus-arc">放大本段</button><button id="clear-aids">隐藏辅助</button></div>`);
 out+=section('所选时间区间',`<div id="arc-controls" ${seg?'':'hidden'}><div class="range-row"><label>起点 ${tex('P')} <span id="arc-start-value">${tex(`${num(model.aids.start*100)}\\%`)}</span></label><input id="arc-start" type="range" min="0" max="99.9" step=".1" value="${model.aids.start*100}" aria-label="轨迹起点"></div><div class="range-row"><label>终点 ${tex('Q')} <span id="arc-end-value">${tex(`${num(model.aids.end*100)}\\%`)}</span></label><input id="arc-end" type="range" min=".1" max="100" step=".1" value="${model.aids.end*100}" aria-label="轨迹终点"></div><p class="note">按本段时间的百分比截取。打开连线或选中轨迹后，可拖动蓝色 ${tex('P,Q')} 端点。</p></div><div id="geometry-readout">${geometryReadout(seg)}</div>`);
 $('panel-content').innerHTML=out;
}
function syncPanel(){
 if(ui.panel==='relations'){relations.sync();return;}
 // Updating values rather than replacing the form preserves focus, caret and
 // range-pointer capture during an in-progress edit.
 for(const e of $('panel-content').querySelectorAll('[data-prop],#object-label,#duration,#arc-start,#arc-end,#trail-duration,#trail-duration-slider')){
  const spec=inputSpec(e),value=readInput(model,spec);if(value===undefined)continue;
  if(e!==document.activeElement&&e!==inputEdit?.target)e.value=String(value);
  const unit=e.dataset.unit??(e.id==='duration'?s`\mu s`:null),property=e.closest('.property'),readout=property?.querySelector('.unit-value')||e.parentElement.nextElementSibling;
  const o=model.objects.find(o=>o.id===spec.owner),error=o?._issues?.[bindingKey(o,spec.key)||spec.key];
  if(unit!==null&&readout?.classList.contains('unit-value'))readout.innerHTML=error?tex('\\text{暂未定义}'):tex(quantity(value,unit,5));
  if(property){property.classList.toggle('invalid',!!error);if(o?.kind==='parameter')syncParameterControl(property,o);}
  if(o?.kind!=='parameter'&&e.type==='range'&&e!==inputEdit?.target&&(value<Number(e.min)||value>Number(e.max))){e.min=String(Math.min(Number(e.min),value));e.max=String(Math.max(Number(e.max),value));e.value=String(value);}
 }
 for(const row of $('panel-content').querySelectorAll('[data-select]')){const o=model.objects.find(o=>o.id===row.dataset.select);if(o){row.querySelector('.object-label').innerHTML=label(o.label);row.setAttribute('aria-label','选择'+o.label);row.dataset.searchLabel=o.label+' '+kinds[o.kind];}}
 syncMeasurements($('panel-content'));
 if($('geometry-readout')){
  const {segments,seg}=view.selectedSegment();
  if(document.activeElement!==$('trace-select'))$('trace-select').innerHTML=traceOptions();
  if(document.activeElement!==$('segment-select'))$('segment-select').innerHTML=segmentOptions(segments);
  $('segment-select').disabled=!segments.length;$('arc-controls').hidden=!seg;
  $('arc-start-value').innerHTML=tex(`${num(model.aids.start*100)}\\%`);$('arc-end-value').innerHTML=tex(`${num(model.aids.end*100)}\\%`);
  $('geometry-readout').innerHTML=geometryReadout(seg);
  $('instant-readout').innerHTML=instantReadout();for(const e of document.querySelectorAll('[data-aid]'))if(['center','radius','circle','angles'].includes(e.dataset.aid))e.disabled=!seg?.C;
 }
}
function quickProperties(o){
 if(o.kind==='label')return '<button type="button" class="context-more" data-edit-notation="'+o.id+'">图形编辑公式</button>'+input('fontSize','s','字号','px',o.fontSize??20,{owner:o,prefix:'context-prop',min:10,max:72,step:1,definition:false});
 const available=properties(o),parameters=constructionSpecsUI.get(o.construction?.type)?.parameters||[],keys=o.kind==='parameter'?['value']:o.kind==='particle'||o.kind==='source'?['speed','heading',...(o.kind==='source'?['count','interval']:[]),'charge','mass','x','y']:o.kind==='electric'?['E0','fieldAngle']:o.kind==='field'?['B']:o.points?[]:['radius','x','y'];
 if(isField(o)){
  if(o.kind==='electric'&&o.waveform!=='dc')keys.push('period','phase');
  if(['circle','annulus','semicircle','sector'].includes(o.shape))keys.push('radius');if(o.shape==='annulus')keys.push('innerRadius');
  if(['rectangle','triangle','strip'].includes(o.shape))keys.push('width');
  if(['rectangle','triangle'].includes(o.shape))keys.push('height');
  if(o.shape==='sector')keys.push('sectorAngle');
  if(!['infinite','circle','annulus','polygon'].includes(o.shape))keys.push('angle');
  if(!['infinite','polygon'].includes(o.shape))keys.push('x','y');
 }
 keys.push(...parameters.map(p=>p.key));
 return [...new Set(keys)].filter(key=>available[key]&&Number.isFinite(o[key])).map(key=>{
  const meta=available[key],parameter=parameters.find(p=>p.key===key),positive=['mass','radius','width','height','length','period'].includes(key),options={owner:o,prefix:'context-prop',...(positive?{min:1e-8}:['speed','E0','interval','innerRadius'].includes(key)?{min:0}:key==='count'?{min:1,step:1}:{}),...(parameter?{min:parameter.min,max:parameter.max,step:parameter.integer?1:'any'}:{})};
  return input(key,meta.tex,meta.name,units[meta.unit]?.tex||meta.unit,o[key],options);
 }).join('');
}
const objectPopoverSignature=o=>JSON.stringify([o.id,o.label,o.defs,o.kind,o.shape,o.visible,o.enabled,o.waveform,o.regionSource,o.construction?.type,o.construction?.inputs,o.slider]);
function objectPopoverHTML(o){
 return '<div class="context-settings"><label><input type="checkbox" data-context-toggle="visible" data-owner="'+o.id+'" '+(o.visible?'checked':'')+'>显示对象</label>'+(physical(o)?'<label><input type="checkbox" data-context-toggle="enabled" data-owner="'+o.id+'" '+(o.enabled?'checked':'')+'>参与仿真</label>':'')+'</div>'+quickProperties(o)+measurementPanel(o)+(objectStyleKeys(o).length?'<button type="button" class="context-more" data-object-style="'+o.id+'">对象样式…</button>':'')+'<button type="button" class="context-more" data-context-properties="'+o.id+'">完整属性与依赖 ↗</button>';
}
function openObjectPopover(o,point){
 popoverSignature=objectPopoverSignature(o);
 contextMenu.showPopover({x:point[0],y:point[1],title:o.label.replace(/[{}]/g,''),subtitle:kinds[o.kind]+' · 拖动标题移动',html:objectPopoverHTML(o),value:o.id});
}
function syncObjectPopover(){
 if(!contextMenu.popoverOpen)return;const o=model.objects.find(o=>o.id===contextMenu.value);if(!o){contextMenu.closePopover();return;}
 syncMeasurements(contextMenu.body);
 const signature=objectPopoverSignature(o);
 if(signature!==popoverSignature&&!contextMenu.body.contains(document.activeElement)){
  popoverSignature=signature;contextMenu.showPopover({x:parseFloat(contextMenu.popover.style.left),y:parseFloat(contextMenu.popover.style.top),title:o.label.replace(/[{}]/g,''),subtitle:kinds[o.kind]+' · 拖动标题移动',html:objectPopoverHTML(o),value:o.id});
 }
 for(const e of contextMenu.body.querySelectorAll('[data-prop]')){
  const spec=inputSpec(e),value=readInput(model,spec);if(value===undefined)continue;if(e!==document.activeElement&&e!==inputEdit?.target)e.value=String(value);
  if(o.kind!=='parameter'&&e.type==='range'){e.min=String(Math.min(Number(e.min),value));e.max=String(Math.max(Number(e.max),value));}
  const unit=e.dataset.unit,property=e.closest('.property');if(o.kind==='parameter')syncParameterControl(property,o);if(unit!==undefined)property.querySelector('.unit-value').innerHTML=o._issues?.[bindingKey(o,spec.key)||spec.key]?tex('\\text{暂未定义}'):tex(quantity(value,unit,5));
 }
}
function contextAction(action,{id,point,world}={}){
 if(action==='probe-field'){fieldProbeUI?.locate(world);return;}
 const o=id&&model.objects.find(o=>o.id===id);if(o&&ui.selected!==id)select(id);
 if(action==='object-style'&&o){editObjectStyle(o.id);return;}
 if(action==='ask-ai-object'&&o){requestSceneQuestion({kind:'object',objectId:o.id});return;}
 if(action==='ask-ai-trajectory'&&o){requestSceneQuestion({kind:'trajectory',objectId:o.id,traceId:ui.trace});return;}
 if(action.startsWith('measure-')&&o){useMeasurement(o.id,action.slice(8));return;}
 if(action==='quick-properties'&&o){openObjectPopover(o,point);return;}
 if(action==='properties'&&o){ui.panel='objects';ui.sidebar=true;chrome();renderPanel();return;}
 if(action==='dependencies'&&o){stopParameterScan();relations.open(Object.keys(o.defs||{})[0]);return;}
 if(action==='notation'&&o){editNotation(o.id);return;}
 if(action==='dependency-graph'){openDependencyGraph(id);return;}
 if(action==='fill-electric'||action==='fill-field'){fillGeometryRegion(action==='fill-electric'?'electric':'field',id,point);return;}
 if(action==='detach-region'&&o?.regionSource){mutate(()=>o.regionSource='');return;}
 if(action==='edit-polygon'&&o?.kind==='polygon'){stopParameterScan();contextMenu.closePopover();constructionUI?.cancel();polygonEditor?.open(o.id);return;}
 if(action==='reset-label-position'&&o){mutate(()=>{delete o.labelOffset;},{reset:false,solve:false});return;}
 if(action==='edit-construction'&&o?.construction){stopParameterScan();contextMenu.closePopover();ui.sidebar=false;chrome();constructionUI?.edit(o.id);return;}
 if(action==='detach-construction'&&o?.construction){mutate(()=>{o.construction=null;const remaining=targets(o);for(const key of Object.keys(o.defs||{}))if(!remaining[key])delete o.defs[key];});toast('已解除几何构造，保留当前几何和仍适用的独立公式。');return;}
 if(action==='visible'&&o){mutate(()=>o.visible=!o.visible,{reset:false,solve:false});return;}
 if(action==='enabled'&&o){mutate(()=>o.enabled=!o.enabled);return;}
 if(action==='label-visible'&&o){mutate(()=>o.labelVisible=o.labelVisible===false,{reset:false,solve:false});return;}
 if(action==='duplicate'&&o){beginDuplicate(o,point);return;}
 if(action==='delete'&&o){mutate(()=>{model.objects=model.objects.filter(item=>item.id!==id);ui.selected=null;});return;}
 if(action==='point-here'){addObject('point',world);return;}
 if(action==='particle-here'){addObject('particle',world);return;}
 if(action==='label-here'){addObject('label',world);return;}
 if(action==='parameter-here'){addObject('parameter',world);return;}
 if(action==='grid'){mutate(()=>model.display.grid=!model.display.grid,{reset:false,solve:false});return;}
 if(action==='axes'){mutate(()=>model.display.axes=!model.display.axes,{reset:false,solve:false});return;}
 if(action==='copy-coordinates'){navigator.clipboard?.writeText(world.map(v=>Number(v.toPrecision(7))).join(', ')+' cm').then(()=>toast('已复制此处坐标。')).catch(()=>toast('此处坐标：'+world.map(v=>Number(v.toPrecision(7))).join(', ')+' cm'));return;}
 const button=$(action);if(button)button.click();
}
async function requestSceneQuestion(selection){
 if(!canAskAI||composingAI)return;stopParameterScan();finishInput();playing=false;transport();composingAI=true;
 try{await examBridge.requestHost('ai.compose',{timeUs:time*1e6,side:ui.readingSide,...selection});toast('已写入AI草稿，核对问题后再发送。');}
 catch(error){toast(error.message);}finally{composingAI=false;}
}
function openSceneContext(event,{keyboard:keyboardRequest=false,objectId}={}){
 event.preventDefault();if(readonlyPreview)return;
 if(!keyboardRequest&&!objectId&&rightGesture?.moved){rightGesture=null;return;}
 const keyboard=keyboardRequest||event.clientX===0&&event.clientY===0,box=$('paper').getBoundingClientRect();
 const point=keyboard?[box.left+box.width*.55,box.top+box.height*.4]:[event.clientX,event.clientY],world=view.world([point[0]-box.left,point[1]-box.top]);
 const hit=event.target.closest('[data-object]'),hitTrace=event.target.closest('[data-trace]')?.dataset.trace,id=objectId||(keyboard?ui.selected:hit?.dataset.object||rightGesture?.id||null),o=model.objects.find(o=>o.id===id);rightGesture=null;
 const overlaps=keyboard||objectId?[]:[...new Set(document.elementsFromPoint(point[0],point[1]).map(e=>e.closest?.('[data-object]')?.dataset.object).filter(Boolean))].map(id=>model.objects.find(o=>o.id===id)).filter(Boolean);
 if(o&&(ui.selected!==o.id||hitTrace&&ui.trace!==hitTrace))select(o.id,hitTrace);
 const value={id:o?.id,point,world},sections=o?[
  ...(canAskAI?[{items:[{id:'ask-ai-object',label:'向AI询问这个对象',icon:'✧'},...(traces.some(t=>t.particle.traceId===ui.trace&&t.particle.objectId===o.id)?[{id:'ask-ai-trajectory',label:'请AI分析此刻的运动',icon:'↗'}]:[])]}]:[]),
  {items:[{id:'quick-properties',label:'快捷参数',icon:'⚙'},{id:'properties',label:'完整属性',icon:'☷',shortcut:'I'},{id:'notation',label:'图形编辑标注',icon:'T'},...(objectStyleKeys(o).length?[{id:'object-style',label:'对象样式',icon:'◒'}]:[]),{id:'dependencies',label:Object.keys(o.defs||{}).length?'编辑依赖关系':'定义几何 / 公式依赖',icon:'ƒ'},{id:'dependency-graph',label:'查看输入与下游关系',icon:'◇'}]},
  ...(measurementOptions(o).length?[{title:'连续测量',items:measurementOptions(o).map(item=>({id:'measure-'+item.key,label:item.name+' → 参数台',icon:'ƒ',disabled:!!o._error}))}]:[]),
  ...(['circle','polygon'].includes(o.kind)?[{title:'把区域用于仿真',items:[{id:'fill-electric',label:'填充电场',icon:'⇢',disabled:!!o._error},{id:'fill-field',label:'填充磁场',icon:'⊗',disabled:!!o._error}]}]:[]),
  ...(o.kind==='polygon'&&(!o.construction||o.construction.type==='polygon')?[{items:[{id:'edit-polygon',label:'编辑顶点与顺序',icon:'◇'}]}]:[]),
  ...(o.regionSource?[{items:[{id:'detach-region',label:'解除区域绑定，保留场域',icon:'◇',disabled:!!o._error}]}]:o.construction?[{items:[{id:'edit-construction',label:'重选构造输入',icon:'↗'},{id:'detach-construction',label:'解除几何构造',icon:'◇',disabled:!!o._error}]}]:[]),
  {items:[{id:'visible',label:'显示对象',checked:o.visible},...(physical(o)?[{id:'enabled',label:'参与仿真',checked:o.enabled}]:[]),{id:'label-visible',label:'显示标注',checked:o.labelVisible!==false},{id:'reset-label-position',label:'恢复标注位置',icon:'↶',disabled:!o.labelOffset}]},
  {items:[{id:'duplicate',label:hasObjectDependencies(o)?'复制对象…':'复制并放置',icon:'⧉'},{id:'delete',label:'删除对象',icon:'×',shortcut:'Delete',danger:true}]}
 ]:[
  {title:'在此处创建',items:[{id:'point-here',label:'自由点',icon:'•'},{id:'particle-here',label:'带电粒子',icon:'⊕'},{id:'label-here',label:'公式标注',icon:'T'},{id:'parameter-here',label:'自由参数',icon:'α'}]},
  {items:[{id:'fit',label:'适配完整场景',icon:'⊡',shortcut:'F'},{id:'grid',label:'厘米网格',checked:!!model.display.grid},{id:'axes',label:'坐标轴',checked:!!model.display.axes}]},
  {items:[{id:'undo',label:'撤销',shortcut:'Ctrl Z',disabled:!history.length},{id:'redo',label:'重做',shortcut:'Ctrl Shift Z',disabled:!future.length},{id:'copy-coordinates',label:'复制此处坐标',icon:'⌖'}]}
 ];
 sections.unshift({items:[{id:'probe-field',label:'查看此处合场',icon:'⌖'}]});
 if(overlaps.length>1)sections.push({title:'此处重叠的对象',items:overlaps.filter(item=>item.id!==o?.id).slice(0,10).map(item=>({label:item.label.replace(/[{}]/g,'')+' · '+kinds[item.kind],icon:'↗',action:()=>{select(item.id);openObjectPopover(item,point);}}))});
 contextMenu.open({x:point[0],y:point[1],title:o?o.label.replace(/[{}]/g,''):'场景画布',subtitle:o?kinds[o.kind]:world.map(v=>Number(v.toPrecision(4))).join(', ')+' cm',sections,footer:'右键拖动平移 · 滚轮缩放 · Shift+F10 当前对象',value});
}
function waveReadout(o){return `<div class="readout"><div class="row"><span>当前有向场强</span>${tex(s`E(t)=${quantity(o.E0*readWaveFactor(o,time,{side:ui.readingSide}),'kV/m')}`)}</div><div class="row"><span>频率</span>${tex(s`f_E=${quantity(1/o.period,'MHz')}`)}</div></div>`;}
function syncControls(o){const particles=model.objects.filter(p=>['particle','source'].includes(p.kind)&&p.enabled),fields=model.objects.filter(p=>p.kind==='field'&&p.enabled);if(!particles.length||!fields.length)return '';
 return `<details class="relation-details"><summary>按回旋周期锁定电场</summary><label class="small-label" for="sync-particle">参考粒子</label><select id="sync-particle" class="full-select">${particles.map(p=>opt(p.id,p.label,particles[0].id)).join('')}</select><label class="small-label" for="sync-magnet">参考磁场（该回旋区的场强）</label><select id="sync-magnet" class="full-select">${fields.map(p=>opt(p.id,p.label,fields[0].id)).join('')}</select><button id="sync-period" class="wide-button">建立周期依赖</button><p class="note">${tex(s`T_E=2\pi m/(|q|\,|B|)`)}。参考场应代表回旋区的合磁场；选中的单个场强不会自动计入其他叠加场。初相位仍可独立设置。</p></details>`;
}
function trailReadout(){const {trace}=view.selectedSegment();return tex(s`\tau=${quantity(trace?trailSeconds(trace,time,model)*1e6:model.trail.duration,s`\mu s`)}`);}
function displayPanel(){const names={axes:'坐标轴',grid:'厘米网格',marks:'场方向标记',labels:'数学标注',velocity:'速度箭头',electricForce:'电场力',magneticForce:'磁场力',force:'合力',ink:'黑白题图风格'};
 $('panel-content').innerHTML=section('运动轨迹','<p class="note">观察时长、播放倍率、完整轨迹和拖尾参数已整合到底部仿真时间轴。展开分轨，可以查看进出场与速度分量为零等关键节点。</p>')+section('纸面显示',`<div class="check-list">${Object.entries(names).map(([k,v])=>`<label><input data-display="${k}" type="checkbox" ${model.display[k]?'checked':''}>${v}</label>`).join('')}</div><p class="note">黑白模式采用细实线边界、实线轨迹与虚线辅助线。取消黑白模式后，轨迹使用少量颜色区分。</p>`)+section('课堂操作','<p class="note">右键单击打开参数菜单，右键拖动平移纸面；也可以用左侧平移工具和双指缩放。工具窗可拖动、调整大小、停靠或收起。</p><p class="note">投屏模式收起编辑工具与参数栏。图形导出为独立 SVG，保留当前视图中的数学标注与内嵌字体。</p>');
}
function palette(kind){
 const entries=kind==='electric'?Object.entries(fieldNames).map(([k,v])=>[k,v.replace('磁场','电场')]):kind==='field'?Object.entries(fieldNames):kind==='source'?Object.entries(sourceNames):[['ruler','直尺 · 两端点'],['angle','量角器 · 三点'],['label','公式 / 文字标注']];
 $('palette').innerHTML=`<h3>${kind==='electric'?'添加电场':kind==='field'?'添加磁场':kind==='source'?'添加粒子源':'构造与测量'}</h3>${['electric','field'].includes(kind)?`<button data-fill-region="${kind}">选择几何区域并填充${kind==='electric'?'电场':'磁场'}</button>`:''}${entries.filter(([k])=>k!=='polygon').map(([k,v])=>`<button data-add="${kind==='measure'?['segment','ray'].includes(k)?'line':k:kind}" data-type="${k}">${v}</button>`).join('')}<p>选择工具后，在画布点按或拖动放置。${kind==='electric'?'每种区域均可设置恒定、正弦或方波电场。':''}</p>`;$('palette').hidden=false;workspaceLayout.anchorPopover($('palette'),$(kind==='measure'?'measure-menu':kind+'-menu'));
}
function fillGeometryRegion(kind,id=ui.selected,at=null){
 let region=model.objects.find(o=>o.id===id);if(region?.regionSource)region=model.objects.find(o=>o.id===region.regionSource);
 if(!region||!['circle','polygon'].includes(region.kind)){tool('fill-'+kind);toast('点击一个已构造的圆或多边形区域。');return false;}
 let added;mutate(()=>{added=fillRegion(model,region.id,kind);ui.selected=added.id;ui.panel='objects';});
 if(added&&model.objects.some(o=>o.id===added.id)){tool('select');select(added.id);openObjectPopover(added,at||[Math.max(80,innerWidth*.58),100]);return true;}return false;
}
async function editNotation(id){stopParameterScan();const o=model.objects.find(o=>o.id===id);if(!o)return;try{const result=await notationEditor.open({mode:'notation',latex:o.label,context:{owner:id},target:{name:o.kind==='label'?'独立公式标注':o.label+' · 对象标注'}});if(!result||!model.objects.some(o=>o.id===id))return;mutate(()=>{const target=model.objects.find(o=>o.id===id);target.label=result.latex;if(target.kind==='label'){target.fontSize??=20;target.labelWidth??=320;target.labelHeight??=100;}},{reset:false});}catch(error){toast(error.message);}}
function tool(kind,type=null){if(kind!=='field-probe')stopParameterScan();if(constructionUI?.active&&!kind.startsWith('construct:'))constructionUI.cancel({changeMode:false});ui.tool=kind;ui.addType=type;angleDraft=[];$('palette').hidden=true;$('examples').hidden=true;view.hoverRegion=null;if(kind==='field-probe'){workspaceLayout.close('fields');workspaceLayout.close('fieldProbe');toast('点按画布查看此处合场；明细窗中也可输入坐标。');}chrome();}
function syncTeaching(){const {trace}=view.selectedSegment(),reading=readMotionState(trace,time,{side:ui.readingSide});if($('teaching-live'))$('teaching-live').innerHTML=liveTeaching(model,trace,time,{side:ui.readingSide});const hud=$('teaching-hud');hud.innerHTML=teachingHUD(model,trace,time,{side:ui.readingSide});hud.hidden=!model.teaching.enabled;for(const b of document.querySelectorAll('[data-stage]')){const stage=motionStages(trace).find(x=>x.index===Number(b.dataset.stage));b.classList.toggle('active',!!stage&&reading.available&&reading.segmentIndex>=stage.index&&reading.segmentIndex<=stage.endIndex);}}
function loadExample(id,meta=exampleMetadata(id)){
 const recommendation=meta?.recommended||{},compact=innerWidth<1000||innerHeight<650;
 mutate(()=>{model=example(id);ui.selected=(recommendation.selectedParameter?model.objects.find(o=>o.kind==='parameter'&&o.label===recommendation.selectedParameter):null)?.id||(recommendation.variables?model.objects.find(o=>o.kind==='parameter'):null)?.id||model.objects.find(o=>['particle','source'].includes(o.kind))?.id;ui.trace=id==='velocity-selector'?ui.selected+':1':null;ui.segment=0;ui.panel='objects';ui.sidebar=!compact&&!recommendation.variables;},{fit:true,reset:true});
 if(compact||!recommendation.variables)workspaceLayout.close('variables');if(compact||!recommendation.plotGroup)workspaceLayout.close('plot');
 if(recommendation.variables&&!compact){workspaceLayout.restore({version:1,windows:{variables:{mode:'right',width:320,height:440,open:true,collapsed:false}}});workspaceLayout.open('variables');}
 if(recommendation.plotGroup)motionPlotUI?.restore({version:1,group:recommendation.plotGroup,follow:true,full:true,rangeUs:{start:0,end:model.duration},hiddenChannels:[]});
 timelineUI.restore({...timelineUI.snapshot(),startUs:0,endUs:model.duration,filter:'all',folded:[]});algebraPanel?.restore({version:1,search:'',filter:'all',expandedIds:[]});
 const selectedScene=model;requestAnimationFrame(()=>{if(model===selectedScene){view.fit();scaleNote();}});chrome();transport();
 toast(meta?meta.title+' · '+meta.description+' 所列数值为演示赋值。'+(compact?' 左侧“变量”和“曲线”可展开观察。':recommendation.plotGroup?' 左侧“曲线”可展开对照。':''):'已载入演示场景。');
}
function loadLesson(id){mutate(()=>{model=lessonScene(id);ui.selected=model.objects.find(o=>o.kind==='particle').id;ui.trace=ui.selected;ui.segment=0;ui.panel='teaching';ui.sidebar=true;ui.geometry=false;},{fit:true,reset:true});timelineUI.restore({...timelineUI.snapshot(),startUs:0,endUs:model.duration,filter:'all',folded:[]});requestAnimationFrame(()=>view.fit());}
function transport(){syncTeaching();syncFieldProbe();$('play').textContent=playing?'暂停':'播放';$('timeline').value=model.duration?String(time/(model.duration*1e-6)*1000):'0';$('time-readout').innerHTML=tex(s`t=${quantity(time*1e6,s`\mu s`)}\;/\;${quantity(model.duration,s`\mu s`)}`);if($('instant-readout'))$('instant-readout').innerHTML=instantReadout();if($('wave-readout')&&object())$('wave-readout').innerHTML=waveReadout(object());if($('trail-readout'))$('trail-readout').innerHTML=trailReadout();timelineUI.update({scene:model,traces,durationUs:model.duration,timeUs:time*1e6,readingSide:ui.readingSide,playing,rate:ui.rate,selectedTraceId:ui.trace,trail:model.trail});motionPlotUI?.update({scene:model,traces,timeUs:time*1e6,readingSide:ui.readingSide,selectedTraceId:ui.trace});}
function setTime(value,{side='after'}={}){stopParameterScan('已转为查看粒子运动时刻。');time=Math.max(0,Math.min(model.duration*1e-6,value));ui.readingSide=side==='before'?'before':'after';view.time=time;view.render();transport();}
function undo(redo=false){stopParameterScan('扫描已结束，可整轮撤销。');const from=redo?future:history,to=redo?history:future;if(!from.length)return;resetEditingTools();const before=structuredClone(model);to.push({model:before,selected:ui.selected});const saved=from.pop();model=saved.model;ui.selected=saved.selected;relations.restored();const changed=motionKey(before)!==motionKey(model),labels=scene=>JSON.stringify(scene.objects.filter(physical).map(o=>[o.id,o.label]));update({reset:changed,solve:changed||labels(before)!==labels(model)});}
function beginDuplicate(source,point){
 if(!source||readonlyPreview)return;finishInput();source=model.objects.find(o=>o.id===source.id);if(!source)return;
 const placeSnapshot=()=>{try{pendingCopy=snapshotObject(model,source.id);tool('duplicate');toast('点按放置独立快照；复制当前数值，不继承构造、区域绑定或公式。');}catch(error){toast(error.message);}};
 if(!hasObjectDependencies(source)){placeSnapshot();return;}
 const box=$('paper').getBoundingClientRect(),at=point||[box.left+box.width*.5,box.top+box.height*.3];
 contextMenu.open({x:at[0],y:at[1],title:'复制 '+source.label.replace(/[{}]/g,'').slice(0,80),subtitle:'选择副本如何处理已有关系',sections:[{items:[
  {label:'保留关系，创建同源副本',icon:'◇',action:()=>{let result;mutate(()=>{const current=model.objects.find(o=>o.id===source.id);result=insertObjectCopy(model,current);ui.selected=result.id;ui.panel='objects';ui.sidebar=true;});if(result)toast(result.defined?'同源副本已创建；位置继续由原输入控制，可重选输入或调整独立参数。':'同源副本保留了当前未定义的关系；原输入恢复后会重新有效。');}},
  {label:'独立快照，复制并放置',icon:'⧉',disabled:!!source._error,action:placeSnapshot}
 ]}],footer:'同源副本保留公式与输入；独立快照固定当前数值。粒子与场的副本会独立参与仿真。'});
}
function addObject(kind,p,type,change){
 mutate(()=>{let o;if(pendingCopy)o=insertObjectCopy(model,pendingCopy,{position:p}).object;else{o=createObject(kind,'o'+model.nextId++,p,type);model.objects.push(o);}change?.(o);ui.selected=o.id;ui.trace=o.id;ui.segment=0;ui.panel='objects';ui.sidebar=true;ui.geometry=false;});
 pendingCopy=null;tool('select');
}
function focusArc(){const {seg}=view.selectedSegment();if(!seg)return;const points=Array.from({length:81},(_,i)=>mul(segmentState(seg,seg.dt*(model.aids.start+(model.aids.end-model.aids.start)*i/80)).p,100));if(seg.C&&model.aids.circle){const C=mul(seg.C,100),r=seg.r*100;points.push([C[0]-r,C[1]-r],[C[0]+r,C[1]+r]);}const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);view.view={x:(left+right)/2,y:(top+bottom)/2,scale:Math.max(.001,Math.min(300,(view.width-140)/(right-left+.6),(view.height-100)/(top-bottom+.6)))};view.render();scaleNote();}

document.addEventListener('click',event=>{
 const row=event.target.closest('[data-select]');if(row&&!event.target.closest('button')){select(row.dataset.select);return;}
 const b=event.target.closest('button');if(!b)return;
 if(readonlyPreview&&!['play','step','reset-time','next-event','zoom-in','zoom-out','fit','pan-left','pan-right','pan-up','pan-down','inspector-close'].includes(b.id))return;
 if(b.closest('#workspace-actions,#workspace-file-menu'))$('workspace-actions').open=false;
 if(b.dataset.parameterPlayback){openParameterScan(b.dataset.parameterPlayback);return;}
 if(b.dataset.objectStyle){editObjectStyle(b.dataset.objectStyle);return;}
 if(b.dataset.useMeasurement){useMeasurement(b.dataset.measurementOwner,b.dataset.useMeasurement);return;}
 if(b.dataset.sliderSettings){editParameterSlider(b.dataset.sliderSettings);return;}
 if(b.dataset.sliderNearest){const parameter=model.objects.find(o=>o.id===b.dataset.sliderNearest&&o.kind==='parameter');if(parameter&&!bindingKey(parameter,'value'))mutate(()=>parameter.value=resolveParameterSlider(parameter).nearest);return;}
 if(b.dataset.contextProperties){contextAction('properties',{id:b.dataset.contextProperties});return;}
 if(b.dataset.editNotation){editNotation(b.dataset.editNotation);return;}
 if(b.dataset.openDependency){openDependencyGraph(b.dataset.openDependency);return;}
 if(b.dataset.focusObject){select(b.dataset.focusObject);return;}
 if(b.dataset.fillRegion){fillGeometryRegion(b.dataset.fillRegion,b.dataset.region||ui.selected);return;}
 if(b.dataset.detachRegion){contextAction('detach-region',{id:b.dataset.detachRegion});return;}
 if(b.dataset.editPolygon){contextAction('edit-polygon',{id:b.dataset.editPolygon});return;}
 if(b.dataset.editConstruction){contextAction('edit-construction',{id:b.dataset.editConstruction});return;}
 if(b.dataset.detachConstruction){contextAction('detach-construction',{id:b.dataset.detachConstruction});return;}
 if(b.dataset.fx||b.id==='relations-open')stopParameterScan();
 if(b.dataset.fxOwner&&b.dataset.fxOwner!==ui.selected)select(b.dataset.fxOwner);
 if(relations.click(b))return;
 if(b.dataset.lesson){loadLesson(b.dataset.lesson);return;}
 if(b.dataset.stage){playing=false;ui.segment=Number(b.dataset.stage);setTime(Number(b.dataset.stageTime));return;}
 if(b.id==='lesson-reset'){loadLesson(model.lesson);return;}
 if(b.id==='teach-next'){playing=false;setTime(nextBoundary(view.selectedSegment().trace,time)??model.duration*1e-6);return;}
 if(b.id==='teach-previous'){playing=false;const {trace}=view.selectedSegment(),before=boundaryTimes(trace).filter(t=>t<time-1e-16);setTime(before.at(-1)||0);return;}
 if(b.dataset.tool){tool(b.dataset.tool);return;}if(b.dataset.add){tool(b.dataset.add,b.dataset.type);return;}
 if(b.dataset.panel){ui.panel=b.dataset.panel;ui.sidebar=true;ui.geometry=ui.panel==='geometry';view.ui=ui;view.render();chrome();renderPanel();return;}
 if(b.dataset.visible){const o=model.objects.find(o=>o.id===b.dataset.visible);o.visible=!o.visible;view.set(model,traces,ui);syncFieldProbe();renderPanel();return;}
 if(b.dataset.example){loadExample(b.dataset.example);return;}
 switch(b.dataset.quick||b.id){
  case 'properties':ui.panel='objects';ui.sidebar=true;ui.geometry=false;chrome();renderPanel();$('panel-content').querySelector('.section-title')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});break;
  case 'tools-more':{const rail=$('tool-rail'),bottom=rail.scrollTop+rail.clientHeight>=rail.scrollHeight-3;rail.scrollBy({top:(bottom?-1:1)*rail.clientHeight*.7,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});break;}
  case 'source-menu':palette('source');break;case 'field-menu':palette('field');break;case 'electric-menu':palette('electric');break;case 'measure-menu':palette('measure');break;
  case 'geometry-button':ui.panel='geometry';ui.sidebar=true;ui.geometry=true;chrome();renderPanel();view.render();break;
  case 'examples-button':stopParameterScan();finishInput();exampleGallery?.open();break;
  case 'blank-menu':case 'blank':mutate(()=>{model=emptyScene();ui.selected=null;ui.trace=null;},{fit:true,reset:true});break;
  case 'duplicate':if(object())beginDuplicate(object());break;
  case 'delete':if(object())mutate(()=>{model.objects=model.objects.filter(o=>o.id!==ui.selected);ui.selected=null;});break;
  case 'undo':undo();break;case 'redo':undo(true);break;
  case 'sync-period':{const p=$('sync-particle').value,B=$('sync-magnet').value;mutate(()=>setDefinition(model,ui.selected,'period',`2 * pi * ${p}.mass / abs(${p}.charge * ${B}.B)`));break;}
  case 'reverse-field':case 'zero-field':{const o=object(),key=o.kind==='electric'?(b.id==='zero-field'?'E0':'fieldAngle'):'B';if(bindingKey(o,key)){relations.open(key);toast('该量由表达式定义，请调整自由量。');}else mutate(()=>o[key]=b.id==='zero-field'?0:key==='fieldAngle'?(o[key]+180)%360:-o[key]);break;}
  case 'play':stopParameterScan('已转为播放粒子运动。');if(resolution.fieldUnavailable){toast('先恢复未定义的场，才能继续仿真。');break;}if(time>=model.duration*1e-6)time=0;playing=!playing;lastFrame=performance.now();transport();break;
  case 'step':playing=false;setTime(time+model.duration*1e-6/150);break;case 'reset-time':playing=false;setTime(0);break;
  case 'next-event':{playing=false;const event=timelineUI.nextEvent(time*1e6,ui.trace);if(event)timelineUI.showEvent([event]);else setTime(model.duration*1e-6);break;}
  case 'zoom-in':view.zoom(1.2);scaleNote();break;case 'zoom-out':view.zoom(1/1.2);scaleNote();break;case 'fit':view.fit();scaleNote();break;
  case 'pan-left':view.pan(-60,0);break;case 'pan-right':view.pan(60,0);break;case 'pan-up':view.pan(0,-60);break;case 'pan-down':view.pan(0,60);break;
  case 'focus-arc':focusArc();break;case 'clear-aids':for(const k of Object.keys(model.aids))if(typeof model.aids[k]==='boolean')model.aids[k]=false;renderPanel();view.render();break;
  case 'inspector-toggle':if(ui.present){ui.present=false;ui.sidebar=true;ui.tool=ui.previousTool||'select';}else ui.sidebar=!ui.sidebar;chrome();break;
  case 'present':ui.present=!ui.present;if(ui.present){ui.previousTool=ui.tool;ui.tool='pan';}else ui.tool=ui.previousTool||'select';chrome();view.render();break;
  case 'fullscreen':if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen();break;
  case 'save-menu':case 'save':download(JSON.stringify({format:'planar-particle-sandbox/5',scene:{...model,version:5},view:view.view,fieldDensity:view.fieldDensity(),selected:ui.selected,trace:ui.trace,segment:ui.segment,time,readingSide:ui.readingSide,rate:ui.rate,workspace:workspaceLayout.snapshot(),timelineView:timelineUI.snapshot(),motionPlotView:motionPlotUI?.snapshot(),constructionView:constructionUI?.snapshot(),algebraView:algebraPanel?.snapshot(),parameterPlaybackView:parameterPlayback?.snapshot()},null,2),'粒子沙盒备课.json','application/json');break;
  case 'load':$('file-input').click();break;
  case 'export':download(view.exportSVG(),'带电粒子题图.svg','image/svg+xml');toast('已导出当前题图，包含内嵌数学字体。');break;
  case 'help':$('help-dialog').showModal();break;case 'help-close':$('help-dialog').close();break;
 }
});
document.addEventListener('change',event=>{
 const e=event.target;
 if(readonlyPreview&&e.id!=='rate')return;
 if(e.dataset.contextToggle){const o=model.objects.find(o=>o.id===e.dataset.owner);if(o)mutate(()=>o[e.dataset.contextToggle]=e.checked,{reset:e.dataset.contextToggle==='enabled'});return;}
 if(e.id==='lesson-select'){if(e.value)loadLesson(e.value);return;}
 if(e.dataset.teach){mutate(()=>model.teaching[e.dataset.teach]=e.checked,{reset:false,solve:false});return;}
 if(e.id==='teaching-frame'){mutate(()=>model.teaching.frame=e.value,{reset:false,solve:false});return;}
 if(e.id==='teach-trace'){ui.trace=e.value;ui.selected=traces.find(t=>t.particle.traceId===e.value)?.particle.objectId;ui.segment=0;view.render();renderPanel();return;}
 if(e.dataset.lessonParam){const n=Number(e.value);if(!Number.isFinite(n)||n<=0){toast('演示参数须为正数');renderPanel();return;}mutate(()=>{model.objects.find(o=>o.id===e.dataset.lessonParam).value=n;resolveScene(model);model.duration=lessonDuration(model);},{fit:true});return;}
 if(relations.change(e))return;if(inputSpec(e)){previewInput(e);if(e.type==='range'||document.activeElement!==e)finishInput(e);return;}
 if(e.id==='parameter-unit')mutate(()=>object().unit=e.value);if(e.id==='line-type')mutate(()=>object().lineType=e.value);
 if(e.id==='object-enabled'||e.id==='object-visible')mutate(()=>object()[e.id==='object-enabled'?'enabled':'visible']=e.checked);
 if(e.id==='field-type'){
  let removedDefinition=false;mutate(()=>{const o=object(),prior=o.shape;o.shape=e.value;
   const removeDefinition=key=>{if(o.defs?.[key]){delete o.defs[key];removedDefinition=true;}};
   if(o.shape==='polygon'&&prior!=='polygon'){const center=[o.x,o.y],points=createObject(o.kind,o.id,center,'polygon').points,centroid=mul(points.reduce(add),1/points.length);o.points=points.map(point=>add(point,sub(center,centroid)));for(const key of ['position','x','y'])removeDefinition(key);}
   if(o.shape!=='polygon'&&prior==='polygon'){delete o.points;for(const key of Object.keys(o.defs||{}))if(/^point\d+(?:[xy])?$/.test(key))removeDefinition(key);}
   if(o.shape==='annulus'&&o.innerRadius===undefined)o.innerRadius=o.radius/2;
   if(o.shape!=='annulus'&&prior==='annulus'){delete o.innerRadius;removeDefinition('innerRadius');}
  });if(object()?._error)toast('形状已切换，但仍有原定义暂不可用；请查看依赖并修改公式，或撤销恢复。');else if(removedDefinition)toast('已切换场域，移除了新形状不适用的几何定义；可撤销恢复。');
 }if(e.id==='source-type')mutate(()=>object().sourceType=e.value);
 if(e.id==='field-region-source')mutate(()=>{const o=object(),region=model.objects.find(x=>x.id===e.value);if(!region)return;o.regionSource=region.id;o.shape=region.kind==='circle'?'circle':'polygon';if(o.shape==='circle')delete o.points;});
 if(e.id==='polygon-orientation')mutate(()=>object().construction.orientation=Number(e.value));
 if(e.id==='waveform'||e.id==='magnetic-waveform')mutate(()=>object().waveform=e.value);
 if(e.id==='track-mode')mutate(()=>{model.display.tracks=['full','both'].includes(e.value);model.trail.enabled=['trail','both'].includes(e.value);},{reset:false,solve:false});
 if(e.id==='trail-auto'||e.id==='trail-enabled')mutate(()=>model.trail[e.id==='trail-auto'?'auto':'enabled']=e.checked,{reset:false,solve:false});
 if(e.id==='particle-preset'&&e.value!=='custom'){const presets={proton:[1.0072764666,1],electron:[.000548579909,-1],alpha:[4.001506179,2]};if(bindingKey(object(),'mass')||bindingKey(object(),'charge'))toast('质量或电荷量已建立依赖，请先解除对应定义。');else mutate(()=>{[object().mass,object().charge]=presets[e.value];});}
 if(e.id==='rate'){ui.rate=Number(e.value);transport();}
 if(e.dataset.aid){model.aids[e.dataset.aid]=e.checked;view.render();}
 if(e.dataset.display){model.display[e.dataset.display]=e.checked;chrome();view.render();}
 if(e.id==='trace-select'){ui.trace=e.value;ui.segment=0;model.aids.start=0;model.aids.end=1;view.render();renderPanel();}
 if(e.id==='segment-select'){ui.segment=Number(e.value);model.aids.start=0;model.aids.end=1;view.render();renderPanel();}
});
document.addEventListener('input',event=>{const e=event.target;if(readonlyPreview&&e.id!=='timeline')return;if(e.id==='object-search'){ui.objectSearch=e.value;filterObjects();return;}if(relations.input(e))return;if(inputSpec(e))previewInput(e);else if(e.id==='timeline'){playing=false;setTime(Number(e.value)/1000*model.duration*1e-6);}});
document.addEventListener('focusout',event=>finishInput(event.target));

document.addEventListener('pointerdown',e=>{if(readonlyPreview)return;const label=e.target.closest('[data-scrub]');if(!label||e.button!==0)return;const input=$(label.htmlFor)||$('prop-'+label.dataset.scrub);if(!input||input.readOnly)return;e.preventDefault();label.setPointerCapture(e.pointerId);finishInput();const slider=label.closest('.property').querySelector('.parameter-slider'),parameter=model.objects.find(o=>o.id===input.dataset.owner&&o.kind==='parameter');scrub={parameter:parameter?.slider?structuredClone(parameter):null,label,input,id:e.pointerId,x:e.clientX,value:input.valueAsNumber,step:(Number(slider.max)-Number(slider.min))/400};});
document.addEventListener('pointermove',e=>{if(!scrub||e.pointerId!==scrub.id)return;const {input}=scrub;let v=scrub.value+(e.clientX-scrub.x)*scrub.step*(e.shiftKey?0.1:1);if(scrub.parameter)v=resolveParameterSlider({...scrub.parameter,value:v}).nearest;else{if(input.min!=='')v=Math.max(Number(input.min),v);if(input.max!=='')v=Math.min(Number(input.max),v);if(input.step!=='any')v=Math.round(v/Number(input.step))*Number(input.step);}input.value=String(v);previewInput(input);});
document.addEventListener('pointerup',e=>{if(scrub?.id===e.pointerId){finishInput(scrub.input);scrub=null;}});
document.addEventListener('pointercancel',e=>{if(scrub?.id===e.pointerId){cancelInput();scrub=null;}});

function local(event){const box=$('paper').getBoundingClientRect();return [event.clientX-box.left,event.clientY-box.top];}
function capturePoint(p,event,exclude=null){return snapPoint(model,p,{exclude,scale:view.view.scale,grid:!event.altKey&&model.snap.grid,geometry:!event.altKey&&model.snap.geometry,tolerance:event.pointerType==='touch'?22:14});}
function showCapture(capture){view.snapPreview=capture?.name?{p:capture.p,name:capture.name}:null;}
function lockCapture(scene,o,key,capture){
 if(!scene.snap.lock||!capture?.expr||capture.grid)return;
 if(capture.path){const pathKey=pathKeyFor(key);o[pathKey]=capture.path.t;setDefinition(scene,o.id,key,`on(${capture.path.curve}, ${o.id}.${pathKey})`);}else setDefinition(scene,o.id,key,capture.expr);
}
$('paper').addEventListener('pointerdown',event=>{
 if(event.button>2)return;event.preventDefault();$('paper').focus();const pixel=local(event),p=view.world(pixel);pointers.set(event.pointerId,pixel);$('paper').setPointerCapture(event.pointerId);
 if(event.button===2)rightGesture={pixel,id:event.target.closest('[data-object]')?.dataset.object,moved:false};else rightGesture=null;
 if(pointers.size===2){cancelLive();if(drag?.before){model=drag.before;update({reset:false,panel:false});}const a=[...pointers.values()];drag={kind:'pinch',distance:norm(sub(a[0],a[1])),mid:mul(add(a[0],a[1]),.5),view:{...view.view}};return;}
 if(ui.tool==='pan'||event.button===2||event.button===1){drag={kind:'pan',pixel,view:{...view.view}};return;}
 if(ui.tool==='field-probe'&&!readonlyPreview){fieldProbeUI.locate(p);drag=null;return;}
 stopParameterScan();
 const hit=event.target.closest('[data-object]'),track=event.target.closest('[data-trace]'),handle=event.target.closest('[data-handle]');
 if(relations.picking){relations.pickObject(hit?.dataset.object);drag=null;return;}
 if(constructionUI?.active){const capture=capturePoint(p,event),elements=document.elementsFromPoint(event.clientX,event.clientY),candidates=[...new Set(elements.flatMap(e=>[e.closest?.('[data-object]')?.dataset.object,e.closest?.('[data-geometry-axis]')?.dataset.geometryAxis]).filter(Boolean))],features=elements.map(e=>e.closest?.('[data-geometry-feature]')).filter(Boolean).map(e=>({owner:e.dataset.geometryOwner,kind:e.dataset.geometryFeature,index:Number(e.dataset.geometryIndex)})),pointId=capture.expr?.match(/^pos\((o\d+)\)$/)?.[1];constructionUI.pick({id:hit?.dataset.object,point:capture.p,candidates,pointId,features});drag=null;return;}
 if(ui.tool==='fill-field'||ui.tool==='fill-electric'){fillGeometryRegion(ui.tool==='fill-electric'?'electric':'field',hit?.dataset.object,[event.clientX,event.clientY]);drag=null;return;}
 const labelHit=event.target.closest('[data-label-owner]');
 if(ui.tool==='select'&&labelHit&&!readonlyPreview){select(labelHit.dataset.labelOwner,labelHit.dataset.trace);playing=false;const o=object();drag={kind:'label-offset',p,pixel,before:structuredClone(model),object:structuredClone(o),solve:false};transport();return;}
 const editsMotion=['particle','source','field','electric'].includes(ui.tool)||ui.tool==='duplicate'&&physical(pendingCopy)||ui.tool==='select'&&physical(model.objects.find(o=>o.id===hit?.dataset.object));
 if(editsMotion){playing=false;if(time){setTime(0);toast('已回到初态，现在可以编辑位置与方向。');}}
 if(ui.tool==='select'){
  if(handle?.dataset.object==='arc'){drag={kind:handle.dataset.handle,p,pixel,before:structuredClone(model),solve:false};return;}
   if(hit){select(hit.dataset.object,track?.dataset.trace);const o=object(),key=handle?.dataset.handle||'move',geometryKey=key==='move'?'position':key;if(geometryControlled(o,geometryKey)&&!(o.construction?.type==='point-on'&&key==='move')){toast('此处由构造关系控制，请拖动自由输入点；右键可查看关系。');return;}if(!handle&&o.points&&Object.keys(o.defs||{}).some(k=>k.startsWith('point'))){toast('端点已建立依赖，请拖动自由端点或调整其路径参数。');return;}drag={kind:key,p,pixel,before:structuredClone(model),object:structuredClone(o),solve:physical(o)};return;}
   if(track){ui.trace=track.dataset.trace;ui.selected=traces.find(t=>t.particle.traceId===ui.trace)?.particle.objectId;const tr=traces.find(t=>t.particle.traceId===ui.trace),seg=tr?.segments[Number(track.dataset.segment)];ui.segment=Math.max(0,tr?.segments.indexOf(seg)||0);ui.panel='geometry';ui.sidebar=true;ui.geometry=true;chrome();renderPanel();view.render();return;}
  ui.selected=null;chrome();renderPanel();view.render();return;
 }
 const startCapture=capturePoint(p,event);showCapture(startCapture);drag={kind:'add',tool:ui.tool,type:ui.addType,p:startCapture.p,pixel,startCapture};
});
$('paper').addEventListener('pointermove',event=>{
 const pixel=local(event),p=view.world(pixel);if(constructionUI?.active&&!['pan','pinch'].includes(drag?.kind))constructionUI.move(capturePoint(p,event).p);
 if(ui.tool.startsWith('fill-')){const id=event.target.closest('[data-object]')?.dataset.object,o=model.objects.find(o=>o.id===id);view.hoverRegion=['circle','polygon'].includes(o?.kind)?id:o?.regionSource||null;view.render();}
 if(!pointers.has(event.pointerId)||!drag)return;pointers.set(event.pointerId,pixel);
 if(drag.kind==='pinch'){const a=[...pointers.values()];if(a.length<2)return;view.view={...drag.view};const mid=mul(add(a[0],a[1]),.5);view.zoom(norm(sub(a[0],a[1]))/Math.max(1,drag.distance),drag.mid);view.pan(...sub(mid,drag.mid));scaleNote();return;}
 if(drag.kind==='pan'){if(rightGesture&&norm(sub(pixel,rightGesture.pixel))>4){rightGesture.moved=true;contextMenu.close();}view.view={...drag.view};view.pan(...sub(pixel,drag.pixel));return;}
 if(drag.kind==='add'){const captured=capturePoint(p,event);showCapture(captured);if(['field','electric'].includes(drag.tool)&&['circle','annulus','semicircle','sector','rectangle','triangle'].includes(drag.type)||['circle','line','ruler'].includes(drag.tool)){view.preview={kind:['semicircle','sector'].includes(drag.type)?'circle':['field','electric'].includes(drag.tool)?drag.type:drag.tool,a:drag.p,b:captured.p};view.render();}else view.render();return;}
 if(drag.kind==='arcStart'||drag.kind==='arcEnd'){
  const chosen=view.selectedSegment().seg;if(chosen&&!chosen.C){const key=drag.kind==='arcStart'?'start':'end',value=nearestTime(chosen,mul(p,.01),model.aids[key]);scheduleLive(candidate=>{candidate.aids[key]=key==='start'?Math.min(value,candidate.aids.end-.001):Math.max(value,candidate.aids.start+.001);},drag);return;}
  const {seg}=view.selectedSegment();if(!seg)return;const C=mul(seg.C,100),start=Math.atan2(seg.p[1]-seg.C[1],seg.p[0]-seg.C[0]),theta=Math.atan2(p[1]-C[1],p[0]-C[0]),total=Math.abs(seg.w*seg.dt);let a=(((theta-start)*-Math.sign(seg.w))%TAU+TAU)%TAU;const key=drag.kind==='arcStart'?'start':'end';a+=Math.round((model.aids[key]*total-a)/TAU)*TAU;const value=Math.max(0,Math.min(1,a/total));scheduleLive(candidate=>{candidate.aids[key]=key==='start'?Math.min(value,candidate.aids.end-.001):Math.max(value,candidate.aids.start+.001);},drag);return;
 }
 const current=drag,original=current.object;if(!original)return;
 if(current.kind==='label-offset'){const offset=original.labelOffset||{x:0,y:0};scheduleLive(candidate=>{candidate.objects.find(o=>o.id===original.id).labelOffset={x:Math.max(-2000,Math.min(2000,offset.x+pixel[0]-current.pixel[0])),y:Math.max(-2000,Math.min(2000,offset.y+pixel[1]-current.pixel[1]))};},current);return;}
 const boundKey=current.kind==='move'?'position':/^point\d+$/.test(current.kind)?current.kind:null;
 const path=boundKey&&pathDefinition(original,boundKey);
 const proposed=current.kind==='move'?add([original.x,original.y],sub(p,current.p)):p;
 if(current.kind==='move'){if(bindingKey(original,'x'))proposed[0]=original.x;if(bindingKey(original,'y'))proposed[1]=original.y;}
 const captured=capturePoint(proposed,event,original.id);showCapture(captured);
 current.capture=null;
 scheduleLive(candidate=>{
  const o=candidate.objects.find(o=>o.id===original.id);
  const write=(key,value)=>{if(!bindingKey(o,key)&&!geometryControlled(o,key))o[key]=value;};
  if(o.construction?.type==='point-on'&&current.kind==='move'){const result=moveConstructionPoint(candidate,o.id,p);if(!result.moved)throw Error(result.reason);return;}
  if(path){o[pathKeyFor(boundKey)]=pathParameter(candidate,path,p);return;}
  if(current.kind==='move'){
   const delta=sub(captured.p,[original.x,original.y]);write('x',captured.p[0]);write('y',captured.p[1]);
   if(o.points)o.points=original.points.map((point,i)=>o.defs?.['point'+i]?o.points[i]:add(point,delta));
   else if(!bindingKey(o,'x')&&!bindingKey(o,'y'))current.capture={...captured,key:'position'};
  }
  if(current.kind==='heading'&&!bindingKey(o,'heading')){const direction=event.altKey?{value:deg(Math.atan2(p[1]-o.y,p[0]-o.x))}:snapHeading(candidate,o,p,view.view.scale);o.heading=direction.value;current.capture={...direction,key:'heading'};showCapture({p,name:direction.name});}
  if(current.kind==='fieldAngle'&&!bindingKey(o,'fieldAngle')){const direction=event.altKey?{value:deg(Math.atan2(p[1]-o.y,p[0]-o.x))}:snapHeading(candidate,o,p,view.view.scale);o.fieldAngle=direction.value;current.capture={...direction,key:'fieldAngle'};showCapture({p,name:direction.name});}
  if(current.kind==='radius')write('radius',Math.max(.000001,norm(sub(captured.p,[o.x,o.y]))));
  if(current.kind==='innerRadius')write('innerRadius',norm(sub(captured.p,[o.x,o.y])));
  if(current.kind==='length'){write('length',Math.max(.000001,2*norm(sub(captured.p,[o.x,o.y]))));write('angle',deg(Math.atan2(p[1]-o.y,p[0]-o.x))-90);}
  if(current.kind==='size'){const a=rotate(sub(captured.p,[o.x,o.y]),-rad(o.angle));write('width',Math.max(.000001,2*Math.abs(a[0])));write('height',Math.max(.000001,2*Math.abs(a[1])));}
  if(current.kind==='label-size'){o.labelWidth=Math.max(80,Math.min(1200,2*Math.abs(p[0]-o.x)*view.view.scale));o.labelHeight=Math.max(40,Math.min(600,2*Math.abs(p[1]-o.y)*view.view.scale));}
  if(current.kind==='angle'){const a=deg(Math.atan2(p[1]-o.y,p[0]-o.x))-90;write('angle',!event.altKey&&candidate.snap.grid&&candidate.snap.angle?Math.round(a/candidate.snap.angle)*candidate.snap.angle:a);}
  if(/^point\d+$/.test(current.kind)&&!bindingKey(o,current.kind)&&!geometryControlled(o,current.kind)){o.points[Number(current.kind.slice(5))]=captured.p;current.capture={...captured,key:current.kind};}
 },current);
});
function finishPointer(event,cancel=false){
 if(!pointers.has(event.pointerId))return;if(cancel)cancelLive();else flushLive();const pixel=local(event),current=drag,captured=capturePoint(view.world(pixel),event,current?.object?.id),p=captured.p;pointers.delete(event.pointerId);drag=null;view.preview=null;view.snapPreview=null;
 if(!current)return;if(cancel){if(current.before){model=current.before;update({reset:false});}else view.render();return;}
 if(current.kind==='pan'||current.kind==='pinch'){scaleNote();return;}
 if(current.kind==='add'){
  const moved=norm(sub(pixel,current.pixel))>7,kind=current.tool;
  if(kind==='angle'){angleDraft.push(p);if(angleDraft.length===3){const points=[...angleDraft];addObject('angle',points[1],null,o=>o.points=points);}else{chrome();toast(['','再点量角器顶点。','再点第二个端点。'][angleDraft.length]);}return;}
  if(kind==='field'||kind==='electric')addObject(kind,current.p,current.type,o=>{if(moved&&['circle','annulus','semicircle','sector'].includes(o.shape)){o.radius=Math.max(.05,norm(sub(p,current.p)));if(o.shape==='annulus')o.innerRadius=o.radius/2;}if(moved&&['rectangle','triangle'].includes(o.shape)){[o.x,o.y]=mul(add(current.p,p),.5);o.width=Math.max(.05,Math.abs(p[0]-current.p[0]));o.height=Math.max(.05,Math.abs(p[1]-current.p[1]));}if(['circle','annulus','semicircle','sector'].includes(o.shape))lockCapture(model,o,'position',current.startCapture);});
  else if(kind==='ruler'||kind==='line')addObject(kind,current.p,current.type,o=>{if(moved)o.points=[current.p,p];lockCapture(model,o,'point0',current.startCapture);if(moved)lockCapture(model,o,'point1',captured);});
  else if(kind==='circle')addObject(kind,current.p,null,o=>{if(moved)o.radius=Math.max(.000001,norm(sub(p,current.p)));lockCapture(model,o,'position',current.startCapture);});
  else if(kind==='point')addObject(kind,current.p,null,o=>lockCapture(model,o,'position',current.startCapture));
  else if(kind==='particle')addObject('particle',current.p,null,o=>{if(moved)o.heading=deg(Math.atan2(p[1]-current.p[1],p[0]-current.p[0]));lockCapture(model,o,'position',current.startCapture);});
  else if(kind==='source')addObject('source',current.p,current.type,o=>{if(!moved)return;if(o.sourceType==='point')o.heading=deg(Math.atan2(p[1]-current.p[1],p[0]-current.p[0]));if(o.sourceType==='circle')o.radius=Math.max(.05,norm(sub(p,current.p)));if(o.sourceType==='rectangle'){[o.x,o.y]=mul(add(p,current.p),.5);o.width=Math.max(.05,Math.abs(p[0]-current.p[0]));o.height=Math.max(.05,Math.abs(p[1]-current.p[1]));}if(o.sourceType==='line'){[o.x,o.y]=mul(add(p,current.p),.5);o.length=Math.max(.05,norm(sub(p,current.p)));o.angle=deg(Math.atan2(p[1]-current.p[1],p[0]-current.p[0]))-90;}});
  else if(kind==='label')addObject('label',current.p);
  else if(kind==='duplicate')addObject(pendingCopy?.kind,current.p);
  view.render();return;
 }
 if(current.before){
  if(current.capture&&model.snap.lock&&!current.error){const before=structuredClone(model);try{lockCapture(model,object(),current.capture.key,current.capture);resolveScene(model);validate(model);}catch(error){model=before;toast('此次位置已捕捉，关系未锁定：'+error.message);}}
  if(JSON.stringify(current.before)!==JSON.stringify(model))remember(current.before);update({reset:false});if(current.error)toast(current.error+' 已保留最后一个有效位置。');
 }
}
$('paper').addEventListener('pointerup',e=>finishPointer(e));$('paper').addEventListener('pointercancel',e=>finishPointer(e,true));$('paper').addEventListener('contextmenu',openSceneContext);
document.addEventListener('contextmenu',event=>{const row=event.target.closest('.parameter-board-item-heading,.algebra-object-heading,[data-select]');if(!row||readonlyPreview)return;const id=row.dataset.select||row.closest('[data-parameter-id]')?.dataset.parameterId||row.closest('[data-algebra-id]')?.dataset.algebraId;if(id)openSceneContext(event,{objectId:id});});
$('paper').addEventListener('wheel',e=>{e.preventDefault();view.zoom(Math.exp(-e.deltaY*.0015),local(e));scaleNote();},{passive:false});
document.addEventListener('keydown',event=>{
 if(document.querySelector('dialog[open]')){if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s')event.preventDefault();return;}
 if(readonlyPreview){if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();return;}if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;const keys={f:'fit',r:'reset-time',n:'next-event','.':'step'};if(event.code==='Space'&&document.activeElement?.tagName!=='BUTTON'){event.preventDefault();$('play').click();}else if(keys[event.key.toLowerCase()]){event.preventDefault();$(keys[event.key.toLowerCase()]).click();}return;}
 if(event.repeat||event.altKey)return;
 const focusedRow=document.activeElement?.closest?.('[data-select]');if(focusedRow&&(event.key==='Enter'||event.code==='Space')){event.preventDefault();select(focusedRow.dataset.select);return;}
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();$('save').click();return;}
 const typing=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||!!document.activeElement?.closest?.('[contenteditable=true],math-field');
 if(!typing&&(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)){event.preventDefault();const id=focusedRow?.dataset.select||document.activeElement?.closest?.('[data-parameter-id]')?.dataset.parameterId||document.activeElement?.closest?.('[data-algebra-id]')?.dataset.algebraId;openSceneContext(event,{keyboard:true,objectId:id});return;}
 if(!typing&&constructionUI?.keydown(event))return;
 if(!typing&&!event.ctrlKey&&!event.metaKey&&!$('help-dialog').open){const shortcuts={v:()=>tool('select'),h:()=>tool('pan'),p:()=>tool('particle'),b:()=>palette('field'),e:()=>palette('electric'),f:()=>$('fit').click(),i:()=>$('inspector-toggle').click(),r:()=>$('reset-time').click(),n:()=>$('next-event').click(),'.':()=>$('step').click()};const action=shortcuts[event.key.toLowerCase()];if(action){event.preventDefault();action();return;}}
 if(inputEdit&&event.key==='Escape'){event.preventDefault();cancelInput();return;}if(inputEdit&&event.key==='Enter'){event.preventDefault();finishInput();return;}if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;if(event.key==='Escape'){$('workspace-actions').open=false;$('palette').hidden=true;$('examples').hidden=true;cancelLive();if(drag?.before){model=drag.before;update({reset:false});}drag=null;pointers.clear();tool('select');view.preview=null;view.render();}if(event.key==='Delete'&&ui.tool==='select'&&!ui.present)document.querySelector('[data-quick="delete"]')?.click();if(event.code==='Space'&&!['BUTTON','SUMMARY'].includes(document.activeElement?.tagName)&&!$('help-dialog').open){event.preventDefault();$('play').click();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);}});
function download(value,name,type){const blob=new Blob([value],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('file-input').addEventListener('change',async event=>{
 if(readonlyPreview){event.target.value='';return;}
 const file=event.target.files[0];if(!file)return;
 try{
  const data=JSON.parse(await file.text());if(!['planar-particle-sandbox/1','planar-particle-sandbox/2','planar-particle-sandbox/3','planar-particle-sandbox/4','planar-particle-sandbox/5'].includes(data.format))throw Error('请选择本沙盒导出的场景文件');const legacy=data.scene.version<3;
  const scene=prepareScene(data.scene);resolveScene(scene);validate(scene);const savedView=data.view;
  if(!savedView||!['x','y','scale'].every(k=>Number.isFinite(savedView[k]))||savedView.scale<=0)throw Error('视图参数不正确');
  finishInput();resetEditingTools();resetFieldProbe();view.resetFieldDisplay(data.fieldDensity);remember(structuredClone(model));model=scene;model.nextId=Math.max(0,...model.objects.map(o=>Number(o.id.slice(1))))+1;ui.selected=data.selected;ui.trace=data.trace;ui.segment=Math.max(0,Number(data.segment)||0);view.view=savedView;
  ui.rate=Number.isFinite(data.rate)&&data.rate>0?data.rate:1;workspaceLayout.restore(data.workspace);workspaceLayout.close('fieldProbe');if(typeof data.workspace?.windows?.inspector?.open==='boolean')ui.sidebar=data.workspace.windows.inspector.open;
  relations.restored();update();timelineUI.restore(data.timelineView||{version:1,startUs:0,endUs:model.duration});motionPlotUI?.restore(data.motionPlotView);constructionUI?.restore(data.constructionView);algebraPanel?.restore(data.algebraView||{version:1,search:'',filter:'all',expandedIds:[]});parameterPlayback?.restore(data.parameterPlaybackView);if(legacy){const tr=view.selectedSegment().trace,arc=tr?.segments.filter(s=>s.C)[Number(data.segment)||0];if(arc)ui.segment=tr.segments.indexOf(arc);renderPanel();}setTime(Number(data.time)||0,{side:data.readingSide});toast('已恢复场景、依赖、工具布局与时间轴视图。');
 }catch(error){toast('未载入：'+error.message);}event.target.value='';
});
$('help-content').innerHTML=`<h2>像在试卷上画图一样搭建</h2><p>从左侧选择粒子、粒子源、电场或磁场，然后在纸面点按／拖动放置。选中对象，在右侧编辑几何与物理参数；蓝色圆点用于移动、缩放和调整方向。新建、删除、移动及修改参数均可撤销。输入或拖动过程中，轨迹、辅助圆和读数会随有效参数实时更新；一次连续调整只记为一个撤销步骤。按 Esc 可取消当前调整。</p><h3>粒子源与场域</h3><p>点源可发出平行或扇形束；线源和区域源可在设定范围内发射。间隔为零时同时发射，大于零时按物理时间依次发射。各粒子互不作用。粒子源的蓝色手柄表示中心方向，各发射粒子的方向由中心方向与张角共同确定。</p><p>磁场垂直纸面，正值朝纸外用点表示，负值朝纸内用叉表示。所有场域都可重叠。电场按平面矢量叠加，磁场按纸内／纸外的正负叠加；无限场也可作为背景场。区域图案表示各个场源，当前位置的合场与受力请查看“辅助”页。可通过“参与仿真”切换不同方案。</p><h3>几何辅助</h3><p>点选一条轨迹，再选择一个运动分段。只有实际圆弧段才显示固定圆心、半径和圆弧角度；一般轨迹提供端点连线、切线、路程与动能变化。拖动 ${tex('P,Q')} 或调整百分比，可按时间比例截取该段上的任意区间；${tex('Q_t')} 表示观察终点。直尺和三点量角器还可用于任意位置的测量。</p>${tex(s`r=\frac{mv}{|q||B|},\quad T=\frac{2\pi m}{|q||B|},\quad \Delta t=\frac{\varphi}{2\pi}T`,true)}<p>圆弧段使用实际累计转角 ${tex(s`\varphi`)} 计算时间，不能用两个速度的最小夹角 ${tex(s`\delta`)} 代替。整圈轨迹在平面上重合，累计转角以读数为准。</p><h3>单位与模型</h3><p>编辑单位为：长度 cm、电场 kV/m、磁场 mT、质量 u、电荷 e、速率 ${tex(s`10^5\,\mathrm{m/s}`)}、时间 μs；内部统一 SI 单位。采用经典、非相对论、受电场力与磁场力的平面运动；忽略重力、碰撞和粒子相互作用。采用理想锐边界，不模拟边缘场。边界按即将进入的一侧判定；静止且受力指向场外的边界初态按场外处理。离开所有场后沿切线直飞。修改物理初态后重新发射，移动纸面或切换显示不改变运动。</p><h3>触屏、保存与题图</h3><p>选择工具拖动对象，平移工具单指移动纸面，双指缩放；右下角也提供按钮。保存／载入恢复完整场景，导出题图得到包含字体的 SVG，投屏模式收起编辑界面。</p>`;
$('help-content').insertAdjacentHTML('beforeend',`<h3>连续调参与精确构造</h3><p>参数下方的滑杆会连续更新图形；也可横向拖动参数名称微调，或直接输入精确数值。“辅助与捕捉”工具窗分别控制网格吸附、几何捕捉与捕获后的锁定。按住 Alt 可暂时自由拖动；网格间距和方向步长在“依赖”页设置。</p><p>从“构造”添加辅助点、直线、线段、射线和圆。点击参数旁的 ƒ 定义数学关系，使用图形构造或带对象引用的表达式。勾选“持续依赖”后保持联动，取消勾选则只计算一次。紫色虚线手柄表示已受依赖控制；请修改自由量、编辑定义或解除依赖。</p><p>可从典型场景打开“交点与等半径”或“根式边长比”。前者移动辅助直线可观察交点消失与恢复，后者调整自由参数 ${tex('a')} 可以保持 ${tex('W=\\sqrt{2}a,\\ H=a')}。路径上的点仍可沿路径拖动。关系无解时保留定义、隐藏未定义对象并暂停相关仿真，条件恢复后自动恢复。</p><p>表达式中的物理量引用会换算单位。可用 ${tex('\\sqrt{2}')}、分数、幂和常用函数；角度默认用度。${tex('\\operatorname{orbitSpeed}(m,q,B,R)')} 按纯磁场圆周条件计算初速率，${tex('\\operatorname{orbitRadius}(m,q,v,B)')} 计算纯磁场理论半径；存在合电场时，它不代表整段轨迹半径。零电荷或零场强时会报告圆轨道未定义。保存文件保留根式、对象引用和依赖关系；载入时支持原有场景。</p>`);
$('help-content').insertAdjacentHTML('beforeend',`<h3>电场与电磁复合场</h3><p>左侧“电场”可添加与磁场相同形状的有界或无限电场。场强和方向可连续调节，也可通过 ƒ 引用自由参数。场的方向与区域转角独立；方向手柄控制 ${tex('\\vec E')}。电场在每个区域内均匀，调参后从初态重新演算。</p>${tex(s`\vec F=q(\vec E_\Sigma+\vec v\times\vec B_\Sigma),\qquad \Delta K=W_E`,true)}<p>“显示”页可分别开关电场力、磁场力与合力；同一粒子的受力箭头使用相同缩放。静止粒子仍可受电场加速，磁场只改变运动方向。速度选择器示例包含慢、匹配、快三种入射速率，合力为零的粒子沿直线通过。</p><p>复合场轨迹一般不是固定圆弧；灰显的圆心、半径和圆弧角度表示该段不适用。辅助页的路程、端点速度和电场做功按实际运动计算，时间比例不等于路程比例。可从典型场景直接打开电场偏转、速度选择器、从静止开始和重叠磁场抵消。</p>`);
$('help-content').insertAdjacentHTML('beforeend',`<h3>半圆、扇形与交变电场</h3><p>电场和磁场均可选半圆或扇形。半圆从区域转角逆时针展开 ${tex('180^\\circ')}；扇形张角在 ${tex('0^\\circ<\\alpha\\le180^\\circ')} 内可调。弧端点、圆心和直边支持精确捕捉。</p><p>电场可选恒定、正弦或方波，设置峰值、正向、周期和初相位。正弦波为 ${tex(s`E(t)=E_0\sin(2\pi t/T_E+\phi_E)`)}，方波在正弦为正的半周期取正峰值，另一半取负峰值，换向瞬间取后侧值。场内箭头随实际时刻反向；蓝色编辑手柄只表示约定的正向。所有粒子共用场景时钟，发射和进场都不重置相位。</p><h3>回旋加速器</h3><p>典型场景提供两块半圆磁场和狭缝交变电场。${tex('D_1')} 控制半径、场强与半间隙，${tex('D_2')} 的对应量联动；电场周期跟随粒子的质量、电荷量和磁场强度。改变电场峰值可比较过缝增能；改变初相位，或通过 ƒ 解除周期依赖后调节周期，可观察失谐。辅助页可查看动能与各半圈的半径。</p>${tex(s`T_E=T_B=\frac{2\pi m}{|q||B|},\qquad K_{\max}=\frac{q^2B^2R^2}{2m}`,true)}<p>这里采用教学近似：磁场在两块 D 形区域内，间隙只有电场；未模拟真实电极屏蔽和出口装置。狭缝有有限宽度，过缝用时被实际计算，因此会有小幅相位滑移；课本“半圈等时、每圈加速两次”及最大动能公式使用窄缝近似。出场后自由飞行，程序不把粒子吸回装置。</p><h3>全程轨迹与拖尾</h3><p>底部时间轴的“轨迹”菜单可选“全程”“拖尾”“全程＋拖尾”或“隐藏”；相邻的“拖尾设置”可选择自动或自定拖尾时长。自动模式按最近回旋区的周期选取，无磁场时用观察时长的六分之一。拖尾按物理时间截取并渐隐，倒拖时间轴、暂停和复位均不会保留未来轨迹。圆心、整圆与选中弧属于独立辅助标记，需要时在“辅助”页开关。</p>`);
$('help-content').insertAdjacentHTML('afterbegin',advancedWorkbenchHelpHTML);
$('help-content').insertAdjacentHTML('afterbegin','<h3>合场图案与场强探针</h3><p>画布中的点、叉和箭头表示同类场叠加后的结果；合场为零的区域留白，源场的边界、名称和编辑手柄仍保留。磁场有向值相加，电场按矢量相加，两种场分别显示。强场更密，极小或极大场强的纹理受可读疏密范围限制，准确数值请用探针查看。</p><p>在“场域”工具窗点“场强探针”，再点画布；也可右键选择“查看此处合场”。浮窗列出各场的当前贡献和合场结果，支持输入厘米坐标，并随调参和时间轴同步更新。隐藏外观的已启用场仍参与合成，取消“参与仿真”的场不计入。按 V 返回选择模式。</p>');
update({fit:true});
$('help-content').insertAdjacentHTML('beforeend','<h3>常用快捷键</h3><p>V 选择 · H 平移 · P 粒子 · B 磁场 · E 电场 · I 参数面板 · F 适配 · 空格 播放/暂停 · R 初态 · N 下个关键节点 · Shift+F10 对象右键菜单 · Ctrl+K 构造工具搜索 · . 单步 · Ctrl+S 保存 · Ctrl+Z 撤销 · Ctrl+Shift+Z 重做。正在输入文字或数值时，字母快捷键不生效。</p>');
for(const [selector,key] of [['[data-tool="select"]','V'],['[data-tool="pan"]','H'],['[data-tool="particle"]','P'],['#field-menu','B'],['#electric-menu','E'],['#fit','F'],['#inspector-toggle','I']]){const b=document.querySelector(selector);if(b)b.title=b.textContent.trim()+' · '+key;}
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#workspace-actions,#workspace-file-menu'))$('workspace-actions').open=false;});
$('tool-rail').addEventListener('scroll',()=>{const rail=$('tool-rail');$('tools-more').textContent=rail.scrollTop+rail.clientHeight>=rail.scrollHeight-3?'⌃':'⌄';});
function loadExamSnapshot(snapshot){
 finishInput();flushLive();const candidate=prepareScene(structuredClone(snapshot.scene));resolveScene(candidate);validate(candidate);
 resetEditingTools();model=candidate;model.nextId=Math.max(0,...model.objects.map(o=>Number(o.id.slice(1))))+1;playing=false;history.length=0;future.length=0;
 const c=snapshot.context||{},viewportChanged=c.viewport?(Math.abs(innerWidth/c.viewport.width-1)>.2||Math.abs(innerHeight/c.viewport.height-1)>.2):innerWidth<800,refit=!c.view||viewportChanged;resetFieldProbe();view.resetFieldDisplay(c.fieldDensity);examFitPending=refit;examFitObjectsOnly=c.fitObjectsOnly===true;ui.selected=c.selected||model.objects.find(o=>['particle','source'].includes(o.kind))?.id||null;ui.trace=c.trace||null;ui.segment=Number(c.segment)||0;
 ui.sidebar=c.sidebar===true&&innerWidth>=800&&!matchMedia('(pointer:coarse)').matches;ui.panel=['teaching','objects','geometry','display','relations'].includes(c.panel)?c.panel:model.lesson?'teaching':'objects';ui.present=!!c.present;ui.geometry=ui.panel==='geometry';ui.rate=Number.isFinite(c.rate)&&c.rate>0?c.rate:1;
 if(c.view&&['x','y','scale'].every(k=>Number.isFinite(c.view[k]))&&c.view.scale>0)view.view={...c.view};
 workspaceLayout.restore(c.workspace);workspaceLayout.close('fieldProbe');relations.restored();update({fit:refit,reset:false});timelineUI.restore(c.timelineView||{version:1,startUs:0,endUs:model.duration});motionPlotUI?.restore(c.motionPlotView);constructionUI?.restore(c.constructionView);algebraPanel?.restore(c.algebraView||{version:1,search:'',filter:'all',expandedIds:[]});parameterPlayback?.restore(c.parameterPlaybackView);setTime(Math.min(model.duration,Math.max(0,Number(c.timeUs)||0))*1e-6,{side:c.readingSide});
}
if(window.__EXAM_INITIAL_SNAPSHOT__)loadExamSnapshot(window.__EXAM_INITIAL_SNAPSHOT__);
const examBridge=attachExamBridge({
 // The web workspace owns one compact top bar. These actions reuse the
 // native buttons so undo, dialogs and file handling keep their own rules.
 toolbarState:()=>({kind:'planar',actions:[['examples','典型场景','examples-button'],['undo','撤销','undo'],['redo','重做','redo'],['blank','空白画布','blank'],['export','导出题图','export'],['help','沙盒帮助','help']].map(([id,label,target])=>({id,label,enabled:!readonlyPreview&&!$(target).disabled}))}),
 toolbarAction:action=>{const target={examples:'examples-button',undo:'undo',redo:'redo',blank:'blank',export:'export',help:'help'}[action];if(readonlyPreview||!target||$(target).disabled)throw Error('当前场景不能执行这项操作');$(target).click();},
 snapshot:()=>({scene:structuredClone(model),context:{timeUs:time*1e6,readingSide:ui.readingSide,playing,selected:ui.selected,trace:ui.trace,segment:ui.segment,view:{...view.view},fieldDensity:view.fieldDensity(),viewport:{width:innerWidth,height:innerHeight},fitObjectsOnly:examFitObjectsOnly,sidebar:ui.sidebar,panel:ui.panel,present:ui.present,rate:ui.rate,workspace:workspaceLayout.snapshot(),timelineView:timelineUI.snapshot(),motionPlotView:motionPlotUI?.snapshot(),constructionView:constructionUI?.snapshot(),algebraView:algebraPanel?.snapshot(),parameterPlaybackView:parameterPlayback?.snapshot()}}),
 flush:()=>{finishInput();flushLive();},load:loadExamSnapshot,pause:()=>{stopParameterScan();playing=false;transport();},
 presentation:enabled=>{ui.present=!!enabled;if(enabled){ui.previousTool=ui.tool;ui.tool='pan';}else ui.tool=ui.previousTool||'select';chrome();view.render();}
});
function frame(now){if(playing){let next=Math.min(model.duration*1e-6,time+Math.min(.1,(now-lastFrame)/1000)*model.duration*1e-6/8*ui.rate);if(model.teaching.enabled&&model.teaching.pauseAtBoundary){const boundary=nextBoundary(view.selectedSegment().trace,time);if(boundary!==undefined&&next>=boundary){next=boundary;playing=false;}}time=next;ui.readingSide='after';if(time>=model.duration*1e-6)playing=false;view.time=time;view.render();if(!playing||now-lastReadout>100){transport();lastReadout=now;}}lastFrame=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
