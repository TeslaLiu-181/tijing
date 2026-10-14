import {tex,num,quantity} from './lorentz-math.mjs';
import {compileField,polygonFor,add,sub,mul,dot,norm,unit,rotate,rad,deg,TAU,advance,pathGeometry,segmentState,forcesAt,direction} from './planar-physics.mjs';
import {readMotionState} from './planar-motion-readings.mjs';
import {teachingOverlay} from './planar-teaching.mjs';
import {trailWindows} from './planar-trails.mjs';
import {objectStyleOverrides} from './planar-object-style.mjs';
import {isField} from './planar-model.mjs';
import {bindingKey} from './planar-relations.mjs';
import {constructionOwns} from './planar-geometry.mjs';
import {FieldDisplay} from './planar-field-display.mjs';
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const cache=new Map();
function math(code){if(!cache.has(code)){let value;try{value=tex(code);}catch{value=tex('\\text{'+String(code).replace(/[\\{}]/g,'')+'}');}if(cache.size>800)cache.clear();cache.set(code,value);}return cache.get(code);}
const f=n=>Number(n.toFixed(3));
export class PaperView{
 constructor(svg,onResize,{idPrefix=''}={}){this.touch=matchMedia('(pointer:coarse)').matches;this.svg=svg;this.idPrefix=idPrefix;this.view={x:0,y:.4,scale:105};this.time=0;this.width=800;this.height=600;this.onResize=onResize;this.resizeObserver=new ResizeObserver(()=>{this.width=svg.clientWidth;this.height=svg.clientHeight;this.render();this.onResize?.();});this.resizeObserver.observe(svg);}
 paintId(name){return (this.idPrefix||'')+name;}
 destroy(){this.resizeObserver?.disconnect();this.onResize=null;this.model=null;this.traces=[];this.svg.replaceChildren();}
 screen(p){return [this.width/2+(p[0]-this.view.x)*this.view.scale,this.height/2-(p[1]-this.view.y)*this.view.scale];}
 world(p){return [this.view.x+(p[0]-this.width/2)/this.view.scale,this.view.y-(p[1]-this.height/2)/this.view.scale];}
 set(model,traces,ui){this.model=model;this.traces=traces;this.ui=ui;(this.fieldDisplay??=new FieldDisplay()).setScene(model);this.render();}
 fields(){if(!this.fieldDisplay)this.fieldDisplay=new FieldDisplay();if(this.fieldDisplay.scene!==this.model)this.fieldDisplay.setScene(this.model);return this.fieldDisplay;}
 inspectField(point){return this.fields().sample(point,this.time,this.ui?.readingSide||'after');}
 fieldDensity(){return this.fields().snapshotReferences();}
 resetFieldDisplay(references={}){this.fieldDisplay=new FieldDisplay();this.fieldDisplay.resetReferences(references);this.fieldProbePoint=null;}
 zoom(factor,point=[this.width/2,this.height/2]){const before=this.world(point);this.view.scale=Math.max(.001,Math.min(800,this.view.scale*factor));const after=this.world(point);this.view.x+=before[0]-after[0];this.view.y+=before[1]-after[1];this.render();}
 pan(dx,dy){this.view.x-=dx/this.view.scale;this.view.y+=dy/this.view.scale;this.render();}
 // Coordinates stay in cm, including questions whose specified paths span
 // metres. A fixed 8 px/cm floor cropped those paths even after "fit all".
 fit({paddingX=150,paddingY=100,minWidth=4,minHeight=3,minScale=.001,maxScale=180,includeTracks=true}={}){
  if(!this.model)return;const points=[];for(const o of this.model.objects){if(!o.visible||o._error||o.kind==='parameter')continue;points.push([o.x,o.y]);if((isField(o)&&['circle','annulus','semicircle','sector'].includes(o.shape))||o.kind==='circle')points.push([o.x-o.radius,o.y-o.radius],[o.x+o.radius,o.y+o.radius]);else if(isField(o)&&['rectangle','triangle'].includes(o.shape))points.push(...polygonFor(o));else if(o.points)points.push(...o.points);}
  if(includeTracks)for(const trace of this.traces){for(const seg of trace.segments){points.push(mul(seg.p,100),mul(seg.p1,100));if(seg.C||norm(seg.a||[0,0])||seg.sines?.length)for(let i=1;i<=24;i++)points.push(mul(segmentState(seg,seg.dt*i/24).p,100));}}
  const {seg}=this.selectedSegment();if(seg?.C&&this.model.aids.center)points.push(mul(seg.C,100));if(seg?.C&&this.model.aids.circle){const C=mul(seg.C,100),r=seg.r*100;points.push([C[0]-r,C[1]-r],[C[0]+r,C[1]+r]);}
  if(!points.length){this.view={x:0,y:0,scale:90};this.render();return;}
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  this.view={x:(minX+maxX)/2,y:(minY+maxY)/2,scale:Math.max(minScale,Math.min(maxScale,(this.width-paddingX)/Math.max(minWidth,maxX-minX+1.2),(this.height-paddingY)/Math.max(minHeight,maxY-minY+1.2)))};this.render();
 }
 line(a,b,{color='#161616',width=1.5,dash='',extra=''}={}){const p=this.screen(a),q=this.screen(b);return `<path d="M${p.map(f)}L${q.map(f)}" fill="none" stroke="${color}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''} ${extra}/>`;}
 poly(points,attr=''){return `<path d="${points.map((p,i)=>(i?'L':'M')+this.screen(p).map(f)).join('')}" ${attr}/>`;}
 circle(p,r,attr=''){const at=this.screen(p);return `<circle cx="${f(at[0])}" cy="${f(at[1])}" r="${f(r*this.view.scale)}" ${attr}/>`;}
 annulus(p,outer,inner,attr=''){
  const [cx,cy]=this.screen(p),circlePath=radius=>{const r=radius*this.view.scale;return `M${f(cx+r)},${f(cy)}A${f(r)},${f(r)} 0 1 0 ${f(cx-r)},${f(cy)}A${f(r)},${f(r)} 0 1 0 ${f(cx+r)},${f(cy)}Z`;};
  return `<path d="${circlePath(outer)}${inner>0?circlePath(inner):''}" fill-rule="evenodd" ${attr}/>`;
 }
 dot(p,r=4,attr=''){const at=this.screen(p),target=this.touch&&!this.ui?.present&&attr.includes('data-object=')?`<circle cx="${f(at[0])}" cy="${f(at[1])}" r="${Math.max(19,r)}" fill="transparent" stroke="none" ${(attr.match(/data-(?:object|handle)="[^"]+"/g)||[]).join(' ')} data-editor="true" class="touch-target"/>`:'';return target+`<circle cx="${f(at[0])}" cy="${f(at[1])}" r="${r}" ${attr}/>`;}
 label(code,p,dx=0,dy=-19,color='#171717',owner=null,traceId=null){
  const a=this.screen(p),size=this.model?.display.ink?20:18,editable=owner&&!this.ui?.present&&!window.__EXAM_READONLY_PREVIEW__,data=editable?` data-object="${owner.id}" data-label-owner="${owner.id}"${traceId?' data-trace="'+escape(traceId)+'"':''} title="拖动标注，不改变对象位置"`:'';
  return `<foreignObject x="${f(a[0]+dx-110)}" y="${f(a[1]+dy-13)}" width="220" height="64" pointer-events="none"><div xmlns="http://www.w3.org/1999/xhtml" style="text-align:center;color:${color};font-size:${size}px;line-height:1.5;padding-top:5px;white-space:nowrap"><span${data} style="background:white;box-shadow:0 0 0 2px white;${editable?'pointer-events:auto;cursor:grab;user-select:none':''}">${math(code)}</span></div></foreignObject>`;
 }
 styleFor(o){return objectStyleOverrides(o,{ink:!!this.model.display.ink});}
 objectOpacity(o,markup,style=this.styleFor(o)){return style.opacity===undefined?markup:`<g opacity="${style.opacity}" data-style-owner="${o.id}">${markup}</g>`;}
 objectLabel(o,p,dx=0,dy=-19,color='#171717',code=o.label,traceId=null){if(o.enabled!==false)color=this.styleFor(o).color??color;return this.label(code,p,dx+(o.labelOffset?.x||0),dy+(o.labelOffset?.y||0),color,o,traceId);}
 arrow(p,v,{length=65,color='#171717',label='',extra=''}={}){if(!norm(v))return '';const u=unit(v),end=add(p,mul(u,length/this.view.scale)),back=sub(end,mul(u,Math.min(8,length*.4)/this.view.scale)),side=mul([-u[1],u[0]],Math.min(4,length*.2)/this.view.scale);const content=this.line(p,end,{color,width:1.8,extra})+this.poly([end,add(back,side),sub(back,side),end],`fill="${color}" ${extra}`)+(label?this.label(label,end,10,-8,color):'');return extra.includes('data-editor')?`<g data-editor="true">${content}</g>`:content;}
 handle(p,name,id){const o=this.model.objects.find(o=>o.id===id),bound=o&&(constructionOwns(o,name==='move'?'position':name)||(name==='move'?bindingKey(o,'x')&&bindingKey(o,'y'):name==='size'?bindingKey(o,'width')&&bindingKey(o,'height'):bindingKey(o,name)));this.editor.push(this.dot(p,7,`fill="white" stroke="${bound?'#8d77ab':'#4280a5'}" ${bound?'stroke-dasharray="3 2"':''} stroke-width="2" data-handle="${name}" data-object="${id}" data-editor="true" class="handle"`));return '';}
 fieldPath(o){
  if(o.shape==='circle')return this.circle([o.x,o.y],o.radius);
  if(o.shape==='polygon')return o.points||[];
  let polygon=[this.world([-2,this.height+2]),this.world([this.width+2,this.height+2]),this.world([this.width+2,-2]),this.world([-2,-2])];
  for(const edge of compileField(o,1).edges){if(edge.kind!=='line')continue;const next=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=dot(edge.n,a)-edge.d,db=dot(edge.n,b)-edge.d;if(da<=0)next.push(a);if((da<=0)!==(db<=0))next.push(add(a,mul(sub(b,a),da/(da-db))));}polygon=next;}
  return polygon;
 }
 fieldRegion(o,attributes=''){
  const p=[o.x,o.y];
  if(o.shape==='circle')return this.circle(p,o.radius,attributes);
  if(o.shape==='annulus')return this.annulus(p,o.radius,o.innerRadius,`clip-rule="evenodd" ${attributes}`);
  if(['semicircle','sector'].includes(o.shape)){
   const a=this.screen(add(p,mul(direction(o.angle),o.radius))),b=this.screen(add(p,mul(direction(o.angle+(o.shape==='semicircle'?180:o.sectorAngle)),o.radius))),c=this.screen(p),r=o.radius*this.view.scale;
   return `<path d="M${c.map(f)}L${a.map(f)}A${f(r)},${f(r)} 0 0 0 ${b.map(f)}Z" ${attributes}/>`;
  }
  const points=o.shape==='polygon'?o.points:this.fieldPath(o);return points?.length?this.poly([...points,points[0]],attributes):'';
 }
 field(o){
  const style=this.styleFor(o),electric=o.kind==='electric',p=[o.x,o.y],color=o.enabled?(style.color??(electric?(this.model.display.ink?'#646464':'#b3833d'):'#171717')):'#a8adb0',width=style.strokeWidth??1.6,dash=style.dashArray??(electric?'7 4':''),pattern='transparent';let result='';const data=`data-object="${o.id}" data-field-type="${electric?'electric':'magnetic'}" class="field-body"`;
  if(o.shape==='circle')result+=this.circle(p,o.radius,`fill="${pattern}" stroke="${color}" stroke-dasharray="${dash}" stroke-width="${width}" ${data}`);
  else if(o.shape==='annulus')result+=this.annulus(p,o.radius,o.innerRadius,`fill="${pattern}" stroke="${color}" stroke-dasharray="${dash}" stroke-width="${width}" ${data}`);
  else if(['semicircle','sector'].includes(o.shape)){
   const a=this.screen(add(p,mul(direction(o.angle),o.radius))),b=this.screen(add(p,mul(direction(o.angle+(o.shape==='semicircle'?180:o.sectorAngle)),o.radius))),c=this.screen(p),r=o.radius*this.view.scale;
   result+=`<path d="M${c.map(f)}L${a.map(f)}A${f(r)},${f(r)} 0 0 0 ${b.map(f)}Z" fill="${pattern}" stroke="${color}" stroke-width="${width}" stroke-dasharray="${dash}" ${data}/>`;
  }
  else if(o.shape==='polygon'){
   const points=o.points||[];if(points.length>2)result+=this.poly([...points,points[0]],`fill="${pattern}" stroke="${color}" stroke-width="${width}" stroke-dasharray="${dash}" ${data}`);
  }
  else{
   const polygon=this.fieldPath(o);result+=this.poly(polygon,`fill="${pattern}" stroke="none" ${data}`)+' ';
   const edges=compileField(o,1).edges;
   for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],mid=mul(add(a,b),.5);if(edges.some(e=>Math.abs(dot(e.n,mid)-e.d)<1e-6))result+=this.line(a,b,{color,width,dash,extra:data});}
  }
  if(this.model.display.labels&&o.labelVisible!==false){const offset=['semicircle','sector'].includes(o.shape)?add(p,mul(direction(o.angle+(o.shape==='semicircle'?90:o.sectorAngle/2)),o.radius*.72)):o.shape==='annulus'?add(p,mul(direction(electric?-45:45),(o.radius+o.innerRadius)/2)):o.shape==='circle'?[o.x+o.radius*.45,o.y+o.radius*(electric?-.4:.4)]:o.shape==='rectangle'||o.shape==='triangle'?[o.x+o.width*(this.model.teaching?.enabled?.33:.15),o.y+o.height*(this.model.teaching?.enabled?-.32:electric?-.25:.25)]:o.shape==='quadrant'?add(p,rotate([.8,.8],rad(o.angle))):add(p,[.7,electric?-.7:.7]);result+=this.objectLabel(o,offset,0,0,color);}
  result=this.objectOpacity(o,result,style);
  if(this.ui.selected===o.id&&!this.ui.present){
   result+=this.dot(p,11,`fill="#fff" fill-opacity=".8" stroke="#4280a5" stroke-dasharray="3 2" data-object="${o.id}" data-editor="true"`);
   if(!o.regionSource&&['circle','annulus','semicircle','sector'].includes(o.shape))result+=this.handle(add(p,mul(direction(['circle','annulus'].includes(o.shape)?0:o.angle),o.radius)),'radius',o.id);
   if(o.shape==='annulus'&&o.innerRadius>0)result+=this.handle(add(p,[0,-o.innerRadius]),'innerRadius',o.id);
   if(!o.regionSource&&['rectangle','triangle'].includes(o.shape))result+=this.handle(add(p,rotate([o.width/2,o.height/2],rad(o.angle))),'size',o.id);
   if(!o.regionSource&&!['circle','annulus','infinite','polygon'].includes(o.shape))result+=this.handle(add(p,rotate([0,Math.max(1,o.height/2)+.45],rad(o.angle))),'angle',o.id);
   if(electric){const end=add(p,mul(direction(o.fieldAngle),85/this.view.scale));result+=this.arrow(p,direction(o.fieldAngle),{length:85,color:'#b3833d',label:o.waveform==='dc'?'\\vec E':'\\hat e_E',extra:'data-editor="true"'})+this.handle(end,'fieldAngle',o.id);}
  }
  return result;
 }
 trajectoryPath(seg,from=0,to=1){
  const a=segmentState(seg,seg.dt*from),end=segmentState(seg,seg.dt*to);let d='M'+this.screen(mul(a.p,100)).map(f);
  if(!seg.C){
   const A=seg.bound??norm(add(seg.a||[0,0],[seg.w*a.v[1],-seg.w*a.v[0]])),dt=seg.dt*(to-from),tinyGyro=!seg.sines?.length&&seg.w&&2*A/(seg.w*seg.w)*100*this.view.scale<.4;
   const n=tinyGyro?1:Math.min(8192,Math.max(2,Math.ceil(dt*Math.sqrt(A*100*this.view.scale/3.2))));
   for(let i=1;i<=n;i++)d+='L'+this.screen(mul(segmentState(seg,seg.dt*from+dt*i/n).p,100)).map(f);return d;
  }
  const span=Math.abs(seg.w*seg.dt*(to-from));
  // Repeated turns occupy the same circle; one full turn draws it exactly.
  const drawSpan=Math.min(span,TAU),parts=Math.max(1,Math.ceil(drawSpan/Math.PI)),dt=seg.w?drawSpan/Math.abs(seg.w):0;
  for(let i=1;i<=parts;i++){const state=advance(a.p,a.v,seg.w,dt*i/parts),p=this.screen(mul(state.p,100)),r=seg.r*100*this.view.scale;d+=`A${f(r)},${f(r)} 0 0 ${seg.w>0?1:0} ${p.map(f)}`;}
  return d;
 }
 source(o){
  const style=this.styleFor(o),p=[o.x,o.y],extra=`data-object="${o.id}"`,color=o.enabled?(style.color??'#171717'):'#aaa';let result='';
  if(o.sourceType==='point'){result+=this.dot(p,7,`fill="white" stroke="${color}" stroke-width="2" ${extra}`);for(const da of [-o.spread/2,0,o.spread/2])result+=this.arrow(p,direction(o.heading+da),{length:31,color,extra});}
  if(o.sourceType==='line'){const d=rotate([0,o.length/2],rad(o.angle));result+=this.line(sub(p,d),add(p,d),{color,width:3,extra});}
  if(o.sourceType==='circle')result+=this.circle(p,o.radius,`fill="none" stroke="${color}" stroke-dasharray="3 4" ${extra}`);
  if(o.sourceType==='rectangle')result+=this.poly([...polygonFor({...o,shape:'rectangle'}),polygonFor({...o,shape:'rectangle'})[0]],`fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="3 4" ${extra}`);
  result+=this.dot(p,11,`fill="transparent" ${extra}`);
  if(this.model.display.labels&&o.labelVisible!==false)result+=this.objectLabel(o,p,-15,24);
  result=this.objectOpacity(o,result,style);
  if(this.ui.selected===o.id&&!this.ui.present){result+=this.velocityHandle(o)+this.handle(p,'move',o.id);if(o.sourceType==='circle')result+=this.handle(add(p,[o.radius,0]),'radius',o.id);if(o.sourceType==='line')result+=this.handle(add(p,rotate([0,o.length/2],rad(o.angle))),'length',o.id);if(o.sourceType==='rectangle')result+=this.handle(add(p,rotate([o.width/2,o.height/2],rad(o.angle))),'size',o.id);}
  return result;
 }
 velocityHandle(o){const p=[o.x,o.y],end=add(p,mul(direction(o.heading),82/this.view.scale));return this.arrow(p,direction(o.heading),{length:82,color:'#4280a5',extra:'data-editor="true"'})+this.handle(end,'heading',o.id);}
 annotation(o){
  const points=o.points,style=this.styleFor(o);let result='';
  if(o.kind==='polygon'){
   if(!points?.length)return '';const selected=this.ui.selected===o.id||this.hoverRegion===o.id;
   result=this.poly([...points,points[0]],`fill="${style.color??'#dfede6'}" fill-opacity="${style.color?.08:.2}" stroke="${style.color??(selected?'#2c857a':'#799a8a')}" stroke-width="${(style.strokeWidth??1.3)+(selected?.8:0)}" stroke-dasharray="${style.dashArray??''}" data-object="${o.id}" class="geometry-region"`);
   if(!this.ui.present){
    points.forEach((p,i)=>{result+=this.line(p,points[(i+1)%points.length],{color:'transparent',width:this.touch?18:10,extra:`data-object="${o.id}" data-geometry-owner="${o.id}" data-geometry-feature="edge" data-geometry-index="${i+1}" data-editor="true"`});});
    points.forEach((p,i)=>{result+=this.dot(p,3.5,`fill="white" stroke="#719786" stroke-width="1.2" data-object="${o.id}" data-geometry-owner="${o.id}" data-geometry-feature="vertex" data-geometry-index="${i+1}" data-editor="true"`);});
   }
   if(this.model.display.labels&&o.labelVisible!==false)result+=this.objectLabel(o,[o.x,o.y],0,0,'#658579');
   if(selected&&!o.construction&&!this.ui.present)points.forEach((p,i)=>this.handle(p,'point'+i,o.id));return this.objectOpacity(o,result,style);
  }
  if(o.kind==='point'){result=this.dot([o.x,o.y],style.pointSize??5,`fill="white" stroke="${style.color??'#577d91'}" stroke-width="${style.strokeWidth??1.7}" data-object="${o.id}"`);if(this.model.display.labels&&o.labelVisible!==false)result+=this.objectLabel(o,[o.x,o.y],14,-19);if(this.ui.selected===o.id&&!this.ui.present)result+=this.handle([o.x,o.y],'move',o.id);return this.objectOpacity(o,result,style);}
  if(o.kind==='circle'){const p=[o.x,o.y];result=this.circle(p,o.radius,`fill="transparent" stroke="${style.color??(this.hoverRegion===o.id?'#2c857a':'#7c8b94')}" stroke-width="${(style.strokeWidth??1.2)+(this.hoverRegion===o.id?.8:0)}" stroke-dasharray="${style.dashArray??'5 5'}" data-object="${o.id}" class="geometry-region"`)+this.dot(p,3,`fill="${style.color??'#7c8b94'}" data-object="${o.id}"`);if(this.model.display.labels&&o.labelVisible!==false)result+=this.objectLabel(o,add(p,[o.radius*.7,o.radius*.7]),8,-10,'#738693');if(this.ui.selected===o.id&&!this.ui.present){if(!constructionOwns(o,'position'))result+=this.handle(p,'move',o.id);if(!constructionOwns(o,'radius'))result+=this.handle(add(p,[o.radius,0]),'radius',o.id);}return this.objectOpacity(o,result,style);}
  if(o.kind==='line'){
   const v=sub(points[1],points[0]),len=norm(v),extent=3*Math.hypot(this.width,this.height)/this.view.scale;
   const a=o.lineType==='line'&&len?sub(points[0],mul(unit(v),extent)):points[0],b=o.lineType!=='segment'&&len?add(points[1],mul(unit(v),extent)):points[1];
   result=this.line(a,b,{color:'transparent',width:this.touch?18:10,extra:`data-object="${o.id}" data-editor="true"`})+this.line(a,b,{color:style.color??'#81929c',width:style.strokeWidth??1.3,dash:style.dashArray??'7 5',extra:`data-object="${o.id}"`});
   if(this.model.display.labels&&o.labelVisible!==false)result+=this.objectLabel(o,mul(add(...points),.5),8,-19,'#748995');
  }
  if(o.kind==='label'){
   const p=[o.x,o.y],at=add(this.screen(p),[o.labelOffset?.x||0,o.labelOffset?.y||0]),width=o.labelWidth||320,height=o.labelHeight||100,size=o.fontSize||20;
   result=(o.labelVisible===false?'':`<foreignObject x="${f(at[0]-width/2)}" y="${f(at[1]-height/2)}" width="${width}" height="${height}" pointer-events="none"><div xmlns="http://www.w3.org/1999/xhtml" style="color:${style.color??'#171717'};display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:${size}px;line-height:1.5;overflow:hidden;pointer-events:none"><span style="pointer-events:auto;background:#fffffff0;padding:3px 5px" data-object="${o.id}">${math(o.label)}</span></div></foreignObject>`)+this.dot(p,12,`fill="transparent" data-object="${o.id}" data-editor="true"`);
   result=this.objectOpacity(o,result,style);
   if(this.ui.selected===o.id&&!this.ui.present){result+=`<rect x="${f(at[0]-width/2)}" y="${f(at[1]-height/2)}" width="${width}" height="${height}" rx="4" fill="none" stroke="#8aabb9" stroke-dasharray="4 4" pointer-events="none" data-editor="true"/>`;this.handle(p,'move',o.id);this.handle(this.world([at[0]+width/2,at[1]+height/2]),'label-size',o.id);}
   return result;
  }
  if(o.kind==='ruler'){result=this.line(points[0],points[1],{color:style.color??'#161616',width:style.strokeWidth??1.5,dash:style.dashArray??'5 4',extra:`data-object="${o.id}"`});if(o.labelVisible!==false)result+=this.objectLabel(o,mul(add(...points),.5),0,-20,'#171717',quantity(norm(sub(points[0],points[1])),'cm'));}
  if(o.kind==='angle'){
   result=this.poly(points,`fill="none" stroke="${style.color??'#555'}" stroke-width="${style.strokeWidth??1.3}" stroke-dasharray="${style.dashArray??'5 4'}" data-object="${o.id}"`);
   const a=sub(points[0],points[1]),b=sub(points[2],points[1]),angle=norm(a)&&norm(b)?Math.acos(Math.max(-1,Math.min(1,dot(unit(a),unit(b))))):null;if(o.labelVisible!==false)result+=this.objectLabel(o,points[1],25,-24,'#171717',angle===null?'\\text{未定义}':`${num(deg(angle))}^{\\circ}`);
  }
  if(this.ui.selected===o.id&&!this.ui.present)points?.forEach((p,i)=>{if(!constructionOwns(o,'point'+i))result+=this.handle(p,'point'+i,o.id);});return this.objectOpacity(o,result,style);
 }
 selectedSegment(){const trace=this.traces.find(t=>t.particle.traceId===this.ui.trace)||this.traces.find(t=>t.particle.objectId===this.ui.selected)||this.traces[0];const segments=trace?.segments||[];return {trace,segments,seg:segments[Math.min(this.ui.segment||0,segments.length-1)]};}
 aids(){
  const {seg}=this.selectedSegment(),u=this.model.aids;if(!seg)return '';const g=pathGeometry(seg,u.start,u.end,false),C=seg.C?mul(seg.C,100):null,a=mul(g.a.p,100),b=mul(g.b.p,100),r=seg.r*100,color=this.model.display.ink?'#353535':'#7b69a8';let result='';
  if(u.circle&&C)result+=this.circle(C,r,`fill="none" stroke="${color}" stroke-width="1.25" stroke-dasharray="7 5"`);
  if(u.center&&C)result+=this.dot(C,3.2,`fill="${color}"`)+this.label('O_1',C,-18,15,color);
  if(u.radius&&C)result+=this.line(C,a,{color,dash:'7 5'})+this.line(C,b,{color,dash:'7 5'})+this.label('r',mul(add(C,a),.5),-12,-9,color);
  if(u.chord&&g.chord>1e-11)result+=this.line(a,b,{color})+this.label('\\ell',mul(add(a,b),.5),12,-12,color);
  if(u.arc)result+=`<path d="${this.trajectoryPath(seg,u.start,u.end)}" stroke="${color}" stroke-width="3" fill="none"/>`;
  if(u.tangent)for(const [p,v] of [[a,g.a.v],[b,g.b.v]]){const d=mul(unit(v),80/this.view.scale);result+=this.line(sub(p,d),add(p,d),{color,dash:'5 5'});}
  if(u.angles&&C){
   const angle=Math.atan2(a[1]-C[1],a[0]-C[0]),sweep=-Math.sign(seg.w)*Math.min(g.phi,TAU-.01),radius=Math.min(r*.27,32/this.view.scale);
   result+=this.poly(Array.from({length:50},(_,i)=>add(C,[radius*Math.cos(angle+sweep*i/49),radius*Math.sin(angle+sweep*i/49)])),`fill="none" stroke="${color}" stroke-width="1.2"`)+this.label('\\varphi',C,23,-18,color);
   if(g.alpha!==null){const heading=Math.atan2(g.a.v[1],g.a.v[0]),end=Math.atan2(b[1]-a[1],b[0]-a[0]);let sweep=((end-heading+Math.PI*3)%TAU)-Math.PI;result+=this.poly(Array.from({length:30},(_,i)=>add(a,[radius*Math.cos(heading+sweep*i/29),radius*Math.sin(heading+sweep*i/29)])),`fill="none" stroke="${color}" stroke-width="1.2"`)+this.label('\\alpha',a,26,-20,color);}
  }
  if(u.radius&&C||u.arc||u.chord||u.tangent||u.angles&&C){result+=this.dot(a,3,`fill="${color}"`)+this.dot(b,3,`fill="${color}"`)+this.label('P',a,-15,20,color)+this.label(seg.end==='limit'&&u.end===1?'Q_t':'Q',b,18,-13,color);if(!this.ui.present&&this.ui.geometry)result+=this.handle(a,'arcStart','arc')+this.handle(b,'arcEnd','arc');}
  return result;
 }
 render(){
  if(!this.model)return;this.editor=[];const d=this.model.display,scale=this.view.scale;let out=`<defs><marker id="${this.paintId('arrow-ink')}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8L2,4Z" fill="#171717"/></marker><marker id="${this.paintId('arrow-accent')}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8L2,4Z" fill="#4280a5"/></marker></defs><rect width="100%" height="100%" fill="white"/>`;
  if(d.grid){const lo=this.world([0,this.height]),hi=this.world([this.width,0]);let step=this.model.snap?.step||1;while(step*scale<18)step*=5;for(let x=Math.ceil(lo[0]/step)*step;x<hi[0];x+=step)out+=this.line([x,lo[1]],[x,hi[1]],{color:'#edf0f2',width:.7});for(let y=Math.ceil(lo[1]/step)*step;y<hi[1];y+=step)out+=this.line([lo[0],y],[hi[0],y],{color:'#edf0f2',width:.7});}
  const objects=this.model.objects.filter(o=>o.visible&&!o._error&&o.kind!=='parameter');out+=this.fields().render(this);for(const o of objects.filter(isField))out+=this.field(o);
  if(d.axes){const lo=this.world([15,this.height-15]),hi=this.world([this.width-20,20]);out+=this.line([lo[0],0],[hi[0],0],{width:1.25,extra:`marker-end="url(#${this.paintId('arrow-ink')})" data-geometry-axis="axisX"`})+this.line([0,lo[1]],[0,hi[1]],{width:1.25,extra:`marker-end="url(#${this.paintId('arrow-ink')})" data-geometry-axis="axisY"`})+this.label('x',[hi[0],0],-5,19)+this.label('y',[0,hi[1]],-18,10)+this.label('O',[0,0],-14,18);}
  for(const t of this.traces){
   const owner=objects.find(o=>o.id===t.particle.objectId);if(!owner)continue;const style=this.styleFor(owner);
   const path=(i,from,to,opacity,mode)=>`<path d="${this.trajectoryPath(t.segments[i],from,to)}" fill="none" stroke="${style.color??(d.ink?'#171717':['#356979','#817153','#76688a'][t.particle.index%3||0])}" stroke-width="${(style.strokeWidth??1.6)+(t.particle.traceId===this.ui.trace?.7:0)}" stroke-dasharray="${style.dashArray??''}" opacity="${opacity*(style.opacity??1)}" stroke-linecap="round" data-trace="${t.particle.traceId}" data-segment="${i}" data-track-mode="${mode}" class="trajectory"/>`;
   if(d.tracks)for(let i=0;i<t.segments.length;i++){const seg=t.segments[i],past=this.model.teaching?.enabled&&this.model.teaching.pastOnly,to=past?Math.max(0,Math.min(1,(this.time-t.particle.birth-seg.t)/seg.dt)):1;if(to>0)out+=path(i,0,to,this.model.trail.enabled?.22:1,'full');}
   for(const w of trailWindows(t,this.time,this.model))out+=path(w.index,w.from,w.to,w.opacity,'trail');
  }
  out+=this.aids();
  // Filled regions are pickable in their interior; points remain above them so
  // a newly closed polygon cannot cover its own draggable input vertices.
  for(const o of objects.filter(o=>['circle','polygon'].includes(o.kind)))out+=this.annotation(o);
  const foreground=[...objects.filter(o=>o.kind!=='point'),...objects.filter(o=>o.kind==='point')];
  for(const o of foreground){if(o.kind==='source')out+=this.source(o);if(['ruler','angle','label','point','line'].includes(o.kind))out+=this.annotation(o);if(o.kind==='particle'){
    const p=[o.x,o.y];out+=this.dot(p,11,`fill="transparent" data-object="${o.id}"`);if(!o.enabled)out+=this.dot(p,4,`fill="#aaa" data-object="${o.id}"`)+(o.labelVisible===false?'':this.objectLabel(o,p,-14,-17,'#999'));if(this.ui.selected===o.id&&!this.ui.present)out+=this.handle(p,'move',o.id)+(this.model.teaching?.enabled?'':this.velocityHandle(o));
   }}
  for(const t of this.traces){const owner=objects.find(o=>o.id===t.particle.objectId);if(!owner)continue;const style=this.styleFor(owner);const reading=readMotionState(t,this.time,{side:this.ui.readingSide}),state=reading.state;if(!reading.available)continue;const p=mul(state.p,100),selected=t.particle.traceId===this.ui.trace,color=style.color??(d.ink?'#111':'#356979');let glyph=this.dot(p,(style.pointSize??3.5)+(selected?1:0),`fill="${color}" data-trace="${t.particle.traceId}" data-object="${t.particle.objectId}"`);
   if(d.labels&&objects.find(o=>o.id===t.particle.objectId)?.labelVisible!==false&&(t.particle.kind==='particle'&&t.particle.index===undefined||selected))glyph+=this.objectLabel(objects.find(o=>o.id===t.particle.objectId),p,17,-21,'#171717',t.particle.label,t.particle.traceId);
   if(d.velocity&&!(selected&&this.model.teaching?.enabled&&this.model.teaching.components)&&(t.particle.index===undefined||selected))glyph+=this.arrow(p,state.v,{label:this.time?'\\vec v':'\\vec v_0'});
   if((selected||t.particle.index===undefined)&&reading.dynamicsAvailable!==false){
    const forces=forcesAt(state.segment,state.v,state.local),max=Math.max(norm(forces.electric),norm(forces.magnetic),norm(forces.total)),groups=[];
    for(const [show,key,color,label] of [[d.electricForce,'electric','#b3833d','\\vec F_E'],[d.magneticForce,'magnetic','#537ea8','\\vec F_B'],[d.force,'total','#8a658f','\\vec F']])if(show&&max&&norm(forces[key])>max*1e-12){const same=groups.find(g=>norm(sub(g.v,forces[key]))<max*1e-12);if(same)same.labels.push(label);else groups.push({v:forces[key],color:d.ink?'#333':color,labels:[label]});}
    for(const g of groups)glyph+=this.arrow(p,g.v,{length:64*norm(g.v)/max,color:g.color,label:g.labels.join('=')});
   }
   out+=this.objectOpacity(owner,glyph,style);
  }
  out+=teachingOverlay(this);
  if(this.fieldProbePoint&&!this.ui.present){const [x,y]=this.screen(this.fieldProbePoint);this.editor.push(`<g data-editor="true" class="field-probe-marker" pointer-events="none"><circle cx="${f(x)}" cy="${f(y)}" r="6" fill="white" fill-opacity=".9" stroke="#237e75" stroke-width="1.7"/><path d="M${f(x-11)},${f(y)}h5m12,0h5M${f(x)},${f(y-11)}v5m0,12v5" fill="none" stroke="#237e75" stroke-width="1.4"/></g>`);}
  if(this.constructionDraft&&!this.ui.present){
   const {tool,points=[],cursor,closed}=this.constructionDraft,all=[...points,...(cursor?[cursor]:[])],extra='data-editor="true" pointer-events="none"';
   if(tool?.startsWith('circle')&&points[0]&&cursor)out+=this.circle(points[0],norm(sub(cursor,points[0])),`fill="#397f8a08" stroke="#397f8a" stroke-dasharray="5 4" ${extra}`);
   else if(all.length>1)out+=this.poly(closed&&all.length>2?[...all,all[0]]:all,`fill="${closed?'#397f8a0b':'none'}" stroke="#397f8a" stroke-width="1.5" stroke-dasharray="5 4" ${extra}`);
   points.forEach((point,i)=>{out+=this.dot(point,7,`fill="#e4f3ec" stroke="#3b8d77" stroke-width="1.5" ${extra}`);const at=this.screen(point);out+=`<text x="${at[0]+10}" y="${at[1]-10}" fill="#438575" font-size="11" ${extra}>${i+1}</text>`;});
  }
  if(this.preview){const {kind,a,b}=this.preview;if(kind==='annulus')out+=this.annulus(a,norm(sub(b,a)),norm(sub(b,a))/2,`fill="#4280a509" stroke="#4280a5" stroke-dasharray="5 4"`);else if(kind==='circle')out+=this.circle(a,norm(sub(b,a)),`fill="none" stroke="#4280a5" stroke-dasharray="5 4"`);else if(kind==='line'||kind==='ruler')out+=this.line(a,b,{color:'#4280a5',dash:'5 4'});else out+=this.poly([a,[b[0],a[1]],b,[a[0],b[1]],a],`fill="#4280a509" stroke="#4280a5" stroke-dasharray="5 4"`);}
  if(this.snapPreview&&!this.ui.present){const {p,name}=this.snapPreview,at=this.screen(p);this.editor.push(this.dot(p,9,`fill="#e5f2f6" fill-opacity=".5" stroke="#4086a0" stroke-width="1.5" data-editor="true" pointer-events="none"`)+`<text x="${at[0]+15}" y="${at[1]-16}" font-size="12" fill="#39788f" stroke="white" stroke-width="4" paint-order="stroke" data-editor="true" pointer-events="none">${escape(name)}</text>`);}
  // Time-interval endpoints stay above coincident initial-velocity handles.
  const arcHandles=this.editor.filter(s=>s.includes('data-object="arc"')),otherHandles=this.editor.filter(s=>!s.includes('data-object="arc"'));
  this.svg.setAttribute('viewBox',`0 0 ${this.width} ${this.height}`);this.svg.innerHTML=out+otherHandles.join('')+arcHandles.join('');
  if(this.dependencyHighlights?.length){const ids=new Set(this.dependencyHighlights);for(const element of this.svg.querySelectorAll('[data-object]'))if(ids.has(element.dataset.object))element.classList.add('dependency-highlight');}
 }
 exportSVG(){const clone=this.svg.cloneNode(true);clone.querySelectorAll('[data-editor]').forEach(n=>n.remove());for(const label of clone.querySelectorAll('[data-label-owner]')){label.removeAttribute('data-label-owner');label.removeAttribute('title');label.style.pointerEvents='none';label.style.removeProperty('cursor');}clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width',this.width);clone.setAttribute('height',this.height);const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=document.getElementById('math-style').textContent;clone.prepend(style);return new XMLSerializer().serializeToString(clone);}
}
