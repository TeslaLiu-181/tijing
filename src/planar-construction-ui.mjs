const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories={point:'点与交点',line:'线与约束',circle:'圆',polygon:'区域',transform:'几何变换'};

/** Picked free points/features stay in a draft until one atomic construction. */
export function createConstructionUI({scene,view,mutate,addConstruction,redefineConstruction,acceptsInput,schema,resolveFeature,formulaEditor,readParameter,canonicalize=text=>text,onCreated,onModeChange,onOpenPalette,onViewChange=()=>{},toast,container}){
  const tools=schema(),byId=new Map(tools.map(t=>[t.id,t]));
  let preferences={version:1,search:'',collapsed:[],recent:[],repeat:false};
  const aliases={point:'点 point free',midpoint:'中点 midpoint center','point-on':'路径 path on',intersection:'交点 intersection cross',parallel:'平行 parallel',perpendicular:'垂直 perpendicular','perp-bisector':'中垂 perpendicular bisector','circle-radius':'半径 radius circle','circle-point':'圆上 circle point','circle-three':'三点 circle three',polygon:'多边形 polygon',rectangle:'矩形 rectangle',tangent:'切线 tangent',rotate:'旋转 rotate rotation',translate:'平移 translate translation',dilate:'缩放 scale dilation','reflect-line':'对称 reflect mirror','reflect-point':'对称 reflect mirror',segment:'线段 segment',ray:'射线 ray',line:'直线 line'};
  const palette=document.createElement('div');palette.className='geometry-tool-palette';
  palette.innerHTML='<div class="geometry-palette-search"><input type="search" data-construction-search aria-label="搜索构造工具" placeholder="搜索工具 · Ctrl+K"><button type="button" data-construction-clear aria-label="清除工具搜索">×</button></div><div class="geometry-recent-tools" hidden><h4>最近使用</h4><div></div></div><label class="geometry-repeat"><input type="checkbox" data-construction-repeat>连续使用此工具 <small>Esc 结束</small></label><p class="geometry-search-empty" hidden>没有匹配工具，试试“圆 / circle”“垂直”。</p>'+Object.entries(categories).map(([category,title])=>'<details class="geometry-tool-category" data-construction-category="'+category+'" open><summary>'+title+' <small>'+tools.filter(t=>t.category===category).length+'</small></summary><div>'+tools.filter(t=>t.category===category).map(t=>'<button type="button" data-geometry-tool="'+t.id+'" title="'+esc(t.steps.join(' → '))+'">'+esc(t.label)+'</button>').join('')+'</div></details>').join('');
  container.append(palette);
  const search=palette.querySelector('[data-construction-search]');
  function snapshot(){return structuredClone(preferences);}
  function preferenceChanged(){onViewChange(snapshot());}
  function filterPalette(){
    const words=preferences.search.trim().toLowerCase().split(/\s+/).filter(Boolean);let matches=0;
    for(const section of palette.querySelectorAll('[data-construction-category]')){let count=0;for(const button of section.querySelectorAll('[data-geometry-tool]')){const tool=byId.get(button.dataset.geometryTool),text=[tool.label,tool.id,...tool.steps,categories[tool.category],aliases[tool.id]||''].join(' ').toLowerCase(),visible=words.every(word=>text.includes(word));button.hidden=!visible;if(visible)count++;}section.hidden=!count;section.open=words.length?count>0:!preferences.collapsed.includes(section.dataset.constructionCategory);section.querySelector('summary small').textContent=count;matches+=count;}
    palette.querySelector('.geometry-search-empty').hidden=matches>0;
    const recent=palette.querySelector('.geometry-recent-tools');recent.hidden=!preferences.recent.length;recent.querySelector('div').innerHTML=preferences.recent.map(id=>'<button type="button" data-geometry-tool="'+id+'" title="'+esc(byId.get(id).steps.join(' → '))+'">'+esc(byId.get(id).label)+'</button>').join('');
  }
  function rememberTool(id){preferences.recent=[id,...preferences.recent.filter(value=>value!==id)].slice(0,6);filterPalette();preferenceChanged();}
  function restore(value){if(value?.version!==1)return;if(typeof value.search==='string')preferences.search=value.search.slice(0,120);if(Array.isArray(value.collapsed))preferences.collapsed=[...new Set(value.collapsed.filter(key=>Object.hasOwn(categories,key)))];if(Array.isArray(value.recent))preferences.recent=[...new Set(value.recent.filter(id=>byId.has(id)))].slice(0,6);if(typeof value.repeat==='boolean')preferences.repeat=value.repeat;search.value=preferences.search;palette.querySelector('[data-construction-repeat]').checked=preferences.repeat;filterPalette();}
  search.addEventListener('input',()=>{preferences.search=search.value;filterPalette();preferenceChanged();});
  palette.querySelector('[data-construction-clear]').addEventListener('click',()=>{preferences.search='';search.value='';filterPalette();preferenceChanged();search.focus();});
  palette.querySelector('[data-construction-repeat]').addEventListener('change',event=>{preferences.repeat=event.target.checked;preferenceChanged();});
  for(const section of palette.querySelectorAll('[data-construction-category]'))section.addEventListener('toggle',()=>{if(preferences.search.trim())return;const key=section.dataset.constructionCategory,wasCollapsed=preferences.collapsed.includes(key);if(wasCollapsed===!section.open)return;preferences.collapsed=section.open?preferences.collapsed.filter(value=>value!==key):[...preferences.collapsed,key];preferenceChanged();});
  const status=document.createElement('div');status.className='construction-status';status.hidden=true;document.getElementById('stage').append(status);
  const dialog=document.createElement('dialog');dialog.className='construction-parameter-dialog';dialog.innerHTML='<form><h2></h2><p></p><div class="construction-parameter-fields"></div><div class="construction-parameter-error" hidden role="alert"></div><div class="construction-parameter-actions"><button type="button" data-construct-cancel>取消</button><button type="submit" class="primary">创建并保持关系</button></div></form>';document.body.append(dialog);
  let current=null,inputs=[],cursor=null,parameterResolve=null,parameterValidate=null,parameterContext=null,completing=false,editing=null,replaceIndex=0,modeVersion=0,folded=false,statusDrag=null;
  const object=id=>scene().objects.find(o=>o.id===id);
  const inputPoint=input=>typeof input==='string'?(object(input)?.kind==='point'?[object(input).x,object(input).y]:null):input.position||input.feature?.kind==='vertex'&&object(input.feature.owner)?.points?.[input.feature.index-1];
  const inputLabel=input=>typeof input==='string'?object(input)?.label||input:input.position?'新点 ('+input.position.map(n=>Number(n.toPrecision(4))).join(', ')+')':(object(input.feature.owner)?.label||input.feature.owner)+' · '+(input.feature.kind==='vertex'?'顶点':'边')+input.feature.index;
  const currentPoints=()=>inputs.map(inputPoint).filter(Boolean);
  function materializeInputs(model,picked){return picked.map(input=>typeof input==='string'?input:input.position?addConstruction(model,{tool:'point',position:input.position}).primaryId:resolveFeature(input.feature,model));}
  function describe(){if(!current)return '';if(editing)return '替换输入 '+(replaceIndex+1)+'：'+(current.close?'选择顶点':current.steps[replaceIndex]);if(current.close)return inputs.length<3?'依次选择至少三个顶点；空白处可创建新点':'继续添加顶点，点击首点或按 Enter 闭合';return current.steps[Math.min(inputs.length,current.steps.length-1)]||'点击画布完成构造';}
  function sync(){
    if(!current)return;
    if(editing&&!object(editing)){cancel();return;}if(!editing)inputs=inputs.filter(input=>typeof input==='string'?input==='axisX'||input==='axisY'||!!object(input):!!input.position||!!object(input.feature?.owner));
    status.hidden=false;status.classList.toggle('is-collapsed',folded);status.innerHTML='<div class="construction-status-heading" title="拖动标题移动提示窗"><strong>'+esc((editing?'重选 · ':'')+current.label)+'</strong><span>'+esc(describe())+'</span><button type="button" data-construction-fold aria-label="'+(folded?'展开构造提示':'收起构造提示')+'" aria-expanded="'+(!folded)+'">'+(folded?'+':'−')+'</button></div><div class="construction-picked">'+inputs.map((id,index)=>'<button type="button" '+(editing?'data-construction-replace="'+index+'" class="'+(replaceIndex===index?'is-current':'')+'" aria-pressed="'+(replaceIndex===index)+'" title="选择要替换的输入"':'data-construction-remove="'+index+'" title="移除此输入"')+'>'+(editing?'<small>'+(index+1)+'</small> ':'')+esc(inputLabel(id))+(editing?'':' <small>×</small>')+'</button>').join('')+'</div><div class="construction-status-actions">'+(!editing&&inputs.length?'<button type="button" data-construction-back>撤回一步</button>':'')+(current.close||editing?'<button type="button" data-construction-finish '+(inputs.length<current.min?'disabled':'')+'>'+(editing?'应用输入 · Enter':'完成多边形')+'</button>':'')+'<button type="button" data-construction-cancel>取消 Esc</button></div>';
    const points=currentPoints();view.constructionDraft={tool:current.id,points,cursor,closed:!!current.close};view.render();
    for(const button of palette.querySelectorAll('[data-geometry-tool]'))button.classList.toggle('active',button.dataset.geometryTool===current.id);
  }
  function cancel({changeMode=true}={}){
    modeVersion++;current=null;inputs=[];cursor=null;editing=null;replaceIndex=0;status.hidden=true;view.constructionDraft=null;view.render();
    for(const button of palette.querySelectorAll('.active'))button.classList.remove('active');
    formulaEditor?.reset();if(dialog.open)dialog.close();if(parameterResolve){parameterResolve(null);parameterResolve=null;}parameterValidate=null;parameterContext=null;completing=false;
    if(changeMode)onModeChange?.('select');
  }
  function begin(id){const selected=byId.get(id);if(!selected)return;cancel({changeMode:false});current=selected;onModeChange?.('construct:'+id);sync();}
  function edit(id){const o=object(id),selected=byId.get(o?.construction?.type);if(!selected||!redefineConstruction)return;cancel({changeMode:false});current=selected;editing=id;inputs=[...o.construction.inputs];onModeChange?.('construct:'+current.id);sync();}
  search.addEventListener('keydown',event=>{if(event.key==='Escape'&&current){event.preventDefault();event.stopPropagation();cancel();search.blur();}});
  function parameters(tool,validate,context){
    if(!tool.parameters?.length)return Promise.resolve({});
    dialog.querySelector('h2').textContent=tool.label;
    dialog.querySelector('p').textContent='数值使用显示单位；输入表达式可保持与已有参数的连续关系。';
    dialog.querySelector('.construction-parameter-fields').innerHTML=tool.parameters.map(p=>'<div class="construction-parameter-row"><label for="construction-input-'+esc(p.key)+'">'+esc(p.label||p.key)+(p.unit?' / '+esc(p.unit):'')+'</label><div class="construction-parameter-control"><input id="construction-input-'+esc(p.key)+'" name="'+esc(p.key)+'" data-expression-key="'+esc(p.expressionKey||'')+'" value="'+esc(p.default??'')+'" required autocomplete="off" placeholder="数值或表达式">'+(formulaEditor&&p.expressionKey?'<button type="button" data-construction-formula="'+esc(p.key)+'" aria-label="图形编辑'+esc(p.label)+'">ƒ 图形公式</button>':'')+'</div>'+(p.integer?'<small>整数'+(p.min!==undefined?'，最小 '+p.min:'')+(p.max!==undefined?'，最大 '+p.max:'')+'；也可引用已有参数。</small>':'')+'<small class="construction-once-note" hidden></small></div>').join('');
    parameterValidate=validate;parameterContext=context;
    dialog.querySelector('.construction-parameter-error').hidden=true;dialog.showModal();dialog.querySelector('input')?.focus();
    return new Promise(resolve=>{parameterResolve=resolve;});
  }
  function validateParameter(value,meta){
    if(!Number.isFinite(value))throw Error(meta.label+'须为有限数值。');
    if(meta.integer&&!Number.isInteger(value))throw Error(meta.label+'须为整数。');
    if(meta.min!==undefined&&(meta.exclusiveMin?value<=meta.min:value<meta.min))throw Error(meta.label+'须'+(meta.exclusiveMin?'大于':'不小于')+meta.min+'。');
    if(meta.max!==undefined&&value>meta.max)throw Error(meta.label+'须不大于'+meta.max+'。');
  }
  dialog.querySelector('form').addEventListener('submit',event=>{
    event.preventDefault();const values={},error=dialog.querySelector('.construction-parameter-error');
    try{
    for(const input of dialog.querySelectorAll('input')){
      const text=input.value.trim(),value=Number(text),meta=current.parameters.find(p=>p.key===input.name);
      if(text&&Number.isFinite(value)){
        validateParameter(value,meta);
        values[input.name]=value;
      }else if(text&&input.dataset.expressionKey)values[input.dataset.expressionKey]=canonicalize(text);
      else throw Error('请填写有效数值或数学表达式。');
    }
    parameterValidate?.(values);
    dialog.close();const done=parameterResolve;parameterResolve=null;parameterValidate=null;done?.(values);
    }catch(cause){error.textContent=cause.message;error.hidden=false;}
  });
  dialog.addEventListener('click',async event=>{
    const button=event.target.closest('[data-construction-formula]');if(!button||!formulaEditor)return;event.preventDefault();
    const version=modeVersion,tool=current,key=button.dataset.constructionFormula,input=dialog.querySelector('[name="'+key+'"]'),error=dialog.querySelector('.construction-parameter-error');button.disabled=true;
    try{
      const values={};for(const field of dialog.querySelectorAll('input')){const text=field.value.trim(),number=Number(text);if(text&&Number.isFinite(number))values[field.name]=number;else if(text&&field.dataset.expressionKey)values[field.dataset.expressionKey]=text;}
      const result=await formulaEditor.open({tool:tool.id,...parameterContext,parameter:key,values,expression:input.value});if(!result||version!==modeVersion||!dialog.open)return;
      input.value=result.continuous?result.expression:String(result.nativeValue);const note=input.closest('.construction-parameter-row').querySelector('.construction-once-note');note.hidden=false;note.textContent=result.continuous?'持续定义；创建后随引用参数联动。':result.expression+' = '+result.nativeValue+' '+result.unit+'，仅计算此次。';error.hidden=!result.warning;if(result.warning)error.textContent='参数有效；当前几何暂未定义：'+result.warning;input.focus();
    }catch(cause){if(version===modeVersion){error.textContent=cause.message;error.hidden=false;}}finally{if(button.isConnected)button.disabled=false;}
  });
  dialog.addEventListener('input',event=>{const note=event.target.closest('.construction-parameter-row')?.querySelector('.construction-once-note');if(note)note.hidden=true;});
  const cancelParameters=()=>{formulaEditor?.reset();dialog.close();const done=parameterResolve;parameterResolve=null;parameterContext=null;done?.(null);};
  dialog.querySelector('[data-construct-cancel]').addEventListener('click',cancelParameters);dialog.addEventListener('cancel',event=>{event.preventDefault();cancelParameters();});
  async function complete(position=cursor||[0,0]){
    const tool=current;if(!tool||completing||inputs.length<tool.min)return false;completing=true;
    const picked=[...inputs],target=editing,version=modeVersion,values=target?{}:await parameters(tool,values=>{const candidate=structuredClone(scene()),result=addConstruction(candidate,{tool:tool.id,inputs:materializeInputs(candidate,picked),position,...values});for(const meta of tool.parameters)validateParameter(readParameter(candidate,result.primaryId,meta),meta);},{inputs:picked,position,materializeInputs:candidate=>materializeInputs(candidate,picked)});
    if(version!==modeVersion)return false;if(!values){cancel();return false;}
    let result;mutate(model=>{result=target?redefineConstruction(model,target,{inputs:materializeInputs(model,picked)}):addConstruction(model,{tool:tool.id,inputs:materializeInputs(model,picked),position,...values});});
    completing=false;if(!result||!object(result.primaryId))return false;
    const createdId=result.primaryId,issue=object(createdId)?._error,repeat=preferences.repeat&&!target;rememberTool(tool.id);cancel();onCreated?.(createdId,result);
    toast?.(issue?'关系已保存，当前暂未定义：'+issue:target?'构造输入已更新，原对象和下游关系已保留。':tool.label+'已创建，拖动自由输入点会保持约束。');if(repeat)begin(tool.id);return true;
  }
  function pick({id,point,candidates=[],pointId,features=[]}){
    if(!current)return false;cursor=point;
    if(!current.max){complete(point);return true;}
    const inputIndex=editing?replaceIndex:inputs.length,expected=current.inputKinds[Math.min(inputIndex,current.inputKinds.length-1)];
    // Draft points have no DOM/object ID yet. Match the visible first point in
    // screen pixels so polygon closure still works with zoom and touch input.
    const screenPoint=view.screen(point),pending=expected==='point'&&inputs.find(input=>typeof input!=='string'&&inputPoint(input)&&Math.hypot(...view.screen(inputPoint(input)).map((coordinate,index)=>coordinate-screenPoint[index]))<=(view.touch?22:14));
    if(!editing&&current.close&&(id===inputs[0]||pending===inputs[0])&&inputs.length>=current.min){complete(point);return true;}
    if(!id&&pending)id=pending;
    if(!id||typeof id==='string'&&!acceptsInput(scene(),current.id,inputIndex,id))id=[...(pointId?[pointId]:[]),...candidates].find(candidate=>acceptsInput(scene(),current.id,inputIndex,candidate));
    if(!id&&resolveFeature){const feature=features.find(f=>expected==='point'?f.kind==='vertex':['line','curve','vector'].includes(expected)&&f.kind==='edge');if(feature)id={feature};}
    if(!id&&expected==='point'){
      id={position:[...point]};
    }
    if(!id||typeof id==='string'&&!acceptsInput(scene(),current.id,inputIndex,id)){toast?.(describe()+(expected==='point'?'；也可点击空白处新建点。':'。'));return true;}
    if(inputs.some((value,index)=>(value===id||typeof value!=='string'&&typeof id!=='string'&&JSON.stringify(value)===JSON.stringify(id))&&(!editing||index!==replaceIndex))){toast?.(current.close&&!editing?'请选择新的顶点，或点击第一个顶点闭合。':'两个输入不能是同一个对象。');return true;}
    if(editing){inputs[replaceIndex]=id;replaceIndex=(replaceIndex+1)%inputs.length;sync();return true;}
    inputs.push(id);sync();if(!current.close&&inputs.length>=current.max)complete(point);return true;
  }
  palette.addEventListener('click',event=>{const button=event.target.closest('[data-geometry-tool]');if(button){event.stopPropagation();begin(button.dataset.geometryTool);}});
  status.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;event.stopPropagation();if(button.hasAttribute('data-construction-fold')){folded=!folded;sync();}else if(button.hasAttribute('data-construction-cancel'))cancel();else if(button.hasAttribute('data-construction-finish'))complete();else if(button.dataset.constructionReplace!==undefined){replaceIndex=Number(button.dataset.constructionReplace);sync();}else{if(button.dataset.constructionRemove!==undefined)inputs.splice(Number(button.dataset.constructionRemove),1);else inputs.pop();sync();}});
  status.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button')||!event.target.closest('.construction-status-heading'))return;const box=status.getBoundingClientRect(),stage=status.parentElement.getBoundingClientRect();statusDrag={pointer:event.pointerId,x:event.clientX,y:event.clientY,left:box.left-stage.left,top:box.top-stage.top};status.setPointerCapture(event.pointerId);event.preventDefault();});
  status.addEventListener('pointermove',event=>{if(statusDrag?.pointer!==event.pointerId)return;const stage=status.parentElement;Object.assign(status.style,{left:Math.max(8,Math.min(stage.clientWidth-status.offsetWidth-8,statusDrag.left+event.clientX-statusDrag.x))+'px',top:Math.max(8,Math.min(stage.clientHeight-status.offsetHeight-8,statusDrag.top+event.clientY-statusDrag.y))+'px',right:'auto',bottom:'auto',transform:'none'});});
  for(const type of ['pointerup','pointercancel'])status.addEventListener(type,event=>{if(statusDrag?.pointer===event.pointerId)statusDrag=null;});
  function shortcut(event){if(!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='k'||event.target.closest('input,textarea,select,math-field,[contenteditable=true]')||document.querySelector('dialog[open]'))return;event.preventDefault();event.stopPropagation();onOpenPalette?.();search.focus();search.select();}
  document.addEventListener('keydown',shortcut);filterPalette();
  return {begin,edit,cancel,pick,sync,palette,snapshot,restore,get active(){return !!current;},get hint(){return describe();},
    move(point){if(current){cursor=point;view.constructionDraft={tool:current.id,points:currentPoints(),cursor,closed:!!current.close};view.render();}},
    keydown(event){if(!current||dialog.open)return false;if(event.key==='Escape'){event.preventDefault();cancel();return true;}if(event.key==='Backspace'){event.preventDefault();if(editing)replaceIndex=(replaceIndex-1+inputs.length)%inputs.length;else inputs.pop();sync();return true;}if(event.key==='Enter'&&inputs.length>=current.min){event.preventDefault();complete();return true;}return false;},
    destroy(){cancel({changeMode:false});document.removeEventListener('keydown',shortcut);palette.remove();status.remove();dialog.remove();}
  };
}
