import {constructionCycle} from './planar-dependencies.mjs';
import {createObject,validate} from './planar-model.mjs';
import {createResolver,resolveScene,setDefinition,inheritResolverState} from './planar-relations.mjs';
import {curveParameter,curveIntersections,constructionSpecs,constructionOwns,constructionOutputs,tangentContacts,geometryObjectKind,matchesGeometryInput} from './planar-geometry.mjs';

const tools=[
 {id:'point',label:'自由点',category:'point',inputKinds:[],min:0,max:0,steps:['点击画布放置点'],position:true,outputs:['point']},
 {id:'point-on',label:'路径上的点',category:'point',inputKinds:['path'],min:1,max:1,steps:['选择路径','点击约束位置'],position:true,outputs:['point']},
 {id:'midpoint',label:'中点',category:'point',inputKinds:['point','point'],min:2,max:2,steps:['选择第一点','选择第二点'],outputs:['point']},
 {id:'ratio-point',label:'定比分点',category:'point',inputKinds:['point','point'],min:2,max:2,steps:['选择起点 A','选择终点 B','设置有向比例 λ，允许外分'],parameters:[{key:'factor',label:'有向分点参数 λ',unit:'',default:.5,expressionKey:'factorExpr'}],outputs:['point']},
 {id:'polar-point',label:'极坐标点',category:'point',inputKinds:['point'],min:1,max:1,steps:['选择极坐标原点 O','设置距离及相对全局 +x 的逆时针方向'],parameters:[{key:'length',label:'极径 r',unit:'cm',default:1,min:0,expressionKey:'lengthExpr'},{key:'angle',label:'全局方向 θ',unit:'deg',default:0,expressionKey:'angleExpr'}],outputs:['point']},
 {id:'fixed-segment',label:'定长线段',category:'line',inputKinds:['point','point'],min:2,max:2,steps:['选择线段起点 A','选择方向点 B','设置线段长度 L'],parameters:[{key:'length',label:'线段长度 L',unit:'cm',default:2,min:0,exclusiveMin:true,expressionKey:'lengthExpr'}],outputs:['line']},
 {id:'fixed-angle-ray',label:'定角射线',category:'line',inputKinds:['point','point'],min:2,max:2,steps:['选择射线起点 A','选择参考方向点 B','设置相对 AB 逆时针的有向角 θ'],parameters:[{key:'angle',label:'相对 AB 的有向角 θ',unit:'deg',default:45,expressionKey:'angleExpr'}],outputs:['line']},
 {id:'compass-circle',label:'圆规圆（迁移两点距离）',category:'circle',inputKinds:['point','point','point'],min:3,max:3,steps:['选择圆心 C','选择半径起点 A','选择半径终点 B'],outputs:['circle']},
 {id:'foot',label:'垂足',category:'point',inputKinds:['point','line'],min:2,max:2,steps:['选择点','选择直线、线段或射线'],outputs:['point']},
 {id:'intersection',label:'交点',category:'point',inputKinds:['curve','curve'],min:2,max:2,steps:['选择第一条线或圆','选择第二条线或圆'],outputs:['point','point']},
 {id:'center',label:'圆心',category:'point',inputKinds:['circle'],min:1,max:1,steps:['选择圆'],outputs:['point']},
 ...['line','segment','ray'].map((id,i)=>({id,label:['两点直线','线段','射线'][i],category:'line',inputKinds:['point','point'],min:2,max:2,steps:['选择第一点','选择第二点'],outputs:['line']})),
 {id:'parallel',label:'平行线',category:'line',inputKinds:['line','point'],min:2,max:2,steps:['选择原直线','选择经过点'],outputs:['line']},
 {id:'perpendicular',label:'垂线',category:'line',inputKinds:['line','point'],min:2,max:2,steps:['选择原直线','选择经过点'],outputs:['line']},
 {id:'perp-bisector',label:'垂直平分线',category:'line',inputKinds:['point','point'],min:2,max:2,steps:['选择第一端点','选择第二端点'],outputs:['line']},
 {id:'circle-radius',label:'圆心与半径',category:'circle',inputKinds:['point'],min:1,max:1,steps:['选择圆心','设置半径'],parameters:[{key:'radius',label:'半径',unit:'cm',default:2,min:0,exclusiveMin:true,expressionKey:'radiusExpr'}],outputs:['circle']},
 {id:'circle-point',label:'圆心与圆上点',category:'circle',inputKinds:['point','point'],min:2,max:2,steps:['选择圆心','选择圆上点'],outputs:['circle']},
 {id:'circle-three',label:'过三点的圆',category:'circle',inputKinds:['point','point','point'],min:3,max:3,steps:['选择第一点','选择第二点','选择第三点'],outputs:['circle']},
 {id:'angle-bisector',label:'角平分线',category:'line',inputKinds:['point','point','point'],min:3,max:3,steps:['选择第一边上的点','选择角顶点','选择第二边上的点'],outputs:['line']},
 {id:'rotate',label:'绕点旋转图形',category:'transform',inputKinds:['geometry','point'],min:2,max:2,steps:['选择要旋转的点、线、圆或多边形','选择旋转中心','设置旋转角'],parameters:[{key:'angle',label:'旋转角',unit:'deg',default:90,expressionKey:'angleExpr'}],outputs:['point']},
 {id:'translate',label:'按向量平移图形',category:'transform',inputKinds:['geometry','vector'],min:2,max:2,steps:['选择要平移的图形','选择有向线段','设置平移倍数'],parameters:[{key:'factor',label:'位移倍数',unit:'',default:1,expressionKey:'factorExpr'}],outputs:['point']},
 {id:'reflect-line',label:'关于直线对称',category:'transform',inputKinds:['geometry','line'],min:2,max:2,steps:['选择要对称的图形','选择对称轴'],outputs:['point']},
 {id:'reflect-point',label:'中心对称',category:'transform',inputKinds:['geometry','point'],min:2,max:2,steps:['选择要对称的图形','选择对称中心'],outputs:['point']},
 {id:'dilate',label:'中心缩放',category:'transform',inputKinds:['geometry','point'],min:2,max:2,steps:['选择要缩放的图形','选择缩放中心','设置缩放倍数'],parameters:[{key:'factor',label:'缩放倍数',unit:'',default:2,expressionKey:'factorExpr'}],outputs:['point']},
 {id:'regular-polygon',label:'正多边形',category:'polygon',inputKinds:['point','point'],min:2,max:2,steps:['选择第一顶点','选择第二顶点','设置边数'],parameters:[{key:'count',label:'边数',unit:'',default:5,min:3,max:64,integer:true,expressionKey:'countExpr'}],outputs:['polygon']},
 {id:'vertex-point',label:'多边形顶点',category:'point',inputKinds:['region'],min:1,max:1,steps:['选择多边形','选择顶点序号'],parameters:[{key:'index',label:'顶点序号',unit:'',default:1,integer:true,min:1,expressionKey:'indexExpr'}],outputs:['point']},
 {id:'edge-line',label:'多边形边',category:'line',inputKinds:['region'],min:1,max:1,steps:['选择多边形','选择边序号'],parameters:[{key:'index',label:'边序号',unit:'',default:1,integer:true,min:1,expressionKey:'indexExpr'}],outputs:['line']},
 {id:'rectangle',label:'三点矩形（高度投影）',category:'polygon',inputKinds:['point','point','point'],min:3,max:3,steps:['选择第一边起点','选择第一边终点','选择高度点（投影到第一边垂线）'],outputs:['polygon']},
 {id:'parallelogram',label:'三点平行四边形',category:'polygon',inputKinds:['point','point','point'],min:3,max:3,steps:['选择第一顶点','选择相邻第二顶点','选择第三顶点'],outputs:['polygon']},
 {id:'tangent',label:'点到圆的切线',category:'line',inputKinds:['point','circle'],min:2,max:2,steps:['选择点','选择圆'],outputs:['line','line']},
 {id:'polygon',label:'多边形',category:'polygon',inputKinds:['point'],min:3,max:64,steps:['依次选择顶点','点击首点或完成闭合'],close:true,outputs:['polygon']}
];
for(const tool of tools.filter(t=>constructionSpecs[t.id]?.outputKind==='input0'))Object.assign(tool,{outputs:['source-kind'],outputKind:'input0',outputKinds:['point','line','circle','polygon']});
export function geometryToolSchema(){return structuredClone(tools);}
export function geometryInputKind(scene,id){return geometryObjectKind(scene.objects.find(o=>o.id===id),id);}
export function acceptsGeometryInput(scene,tool,index,id){
 const schema=tools.find(t=>t.id===tool);if(!schema)return false;return matchesGeometryInput(schema.inputKinds[Math.min(index,schema.inputKinds.length-1)],scene.objects.find(o=>o.id===id),id);
}
function nextObject(scene,kind,position=[0,0],type){scene.nextId=Math.max(Number.isInteger(scene.nextId)?scene.nextId:1,...scene.objects.map(o=>Number(o.id.slice(1))+1));const o=createObject(kind,'o'+scene.nextId++,position,type);scene.objects.push(o);return o;}
const reference=(r,id)=>r.evaluate(id);
export function addConstruction(scene,{tool,inputs=[],position=[0,0],radius=2,radiusExpr,parameter,branch,label,angle,angleExpr,length,lengthExpr,factor,factorExpr,count=5,countExpr,orientation=1,index=1,indexExpr}={}){
 const schema=tools.find(t=>t.id===tool);if(!schema)throw Error('未知几何构造工具。');inputs=[...inputs];if(tool==='polygon'&&inputs[0]===inputs.at(-1)&&inputs.length>3)inputs.pop();
 if(inputs.length<schema.min||inputs.length>schema.max||inputs.some((id,i)=>!acceptsGeometryInput(scene,tool,i,id)))throw Error('请选择工具所需的正确几何输入。');
 if(position.length!==2||position.some(n=>!Number.isFinite(n)))throw Error('构造位置须为有限二维坐标。');
 const before=structuredClone(scene),created=[];let primary;scene.nextId=Math.max(Number.isInteger(scene.nextId)?scene.nextId:1,...scene.objects.map(o=>Number(o.id.slice(1))+1));
 try{
  const r=createResolver(scene);
  if(tool==='point'){primary=nextObject(scene,'point',position);created.push(primary);}
  else if(tool==='tangent'){
   const P=r.point(reference(r,inputs[0])),C=r.geometry(reference(r,inputs[1])),contacts=tangentContacts(P,C),group='g'+scene.nextId;
   for(let i=0;i<2;i++){const o=nextObject(scene,'line');o.label='t_'+o.id.slice(1);o.construction={type:tool,inputs:[...inputs],group,branch:i+1};if(contacts[i]&&Math.hypot(P[0]-contacts[i][0],P[1]-contacts[i][1])>1e-14)o.points=[P.map(v=>v*100),contacts[i].map(v=>v*100)];created.push(o);}primary=created[(branch||1)-1]||created[0];
  }else if(tool==='intersection'){
   const a=r.geometry(reference(r,inputs[0])),b=r.geometry(reference(r,inputs[1])),points=curveIntersections(a,b),count=a.kind==='line'&&b.kind==='line'?1:2,group='g'+scene.nextId;
   for(let i=0;i<count;i++){const p=points[i]?.map(x=>x*100)||position,o=nextObject(scene,'point',p);o.label='I_'+o.id.slice(1);o.construction={type:tool,inputs:[...inputs],group,branch:i+1};created.push(o);}
   primary=created[(branch||1)-1]||created[0];
  }else{
   const spec=constructionSpecs[tool],kind=spec.outputKind==='input0'?scene.objects.find(o=>o.id===inputs[0]).kind:spec.kind;primary=nextObject(scene,kind,position);primary.construction={type:tool,inputs:[...inputs]};created.push(primary);
   if(['line','segment','ray'].includes(tool))primary.lineType=tool;
   if(tool==='point-on'){const curve=r.geometry(reference(r,inputs[0]));primary.pathT=parameter??curveParameter(curve,position.map(v=>v*.01));primary.construction.pathUnit=curve.kind==='circle'?'deg':'';}
   if(tool==='vertex-point'||tool==='edge-line'){primary.index=index;if(indexExpr)setDefinition(scene,primary.id,'index',indexExpr);if(tool==='edge-line')primary.lineType='segment';}
   if(['rotate','polar-point','fixed-angle-ray'].includes(tool)){primary.angle=angle??(tool==='rotate'?90:tool==='fixed-angle-ray'?45:0);if(tool==='fixed-angle-ray')primary.lineType='ray';if(angleExpr)setDefinition(scene,primary.id,'angle',angleExpr);}
   if(['translate','dilate','ratio-point'].includes(tool)){primary.factor=factor??(tool==='dilate'?2:tool==='ratio-point'?.5:1);if(factorExpr)setDefinition(scene,primary.id,'factor',factorExpr);}
   if(['polar-point','fixed-segment'].includes(tool)){primary.length=length??(tool==='polar-point'?1:2);if(tool==='fixed-segment')primary.lineType='segment';if(lengthExpr)setDefinition(scene,primary.id,'length',lengthExpr);}
   if(tool==='regular-polygon'){primary.count=count;primary.construction.orientation=orientation;if(countExpr)setDefinition(scene,primary.id,'count',countExpr);}
   if(tool==='circle-radius'){if(!Number.isFinite(radius)||radius<=0)throw Error('圆半径须为正。');primary.radius=radius;if(radiusExpr)setDefinition(scene,primary.id,'radius',radiusExpr);}
   if(tool==='polygon')primary.points=inputs.map(id=>r.point(reference(r,id)).map(x=>x*100));
  }
  if(label)primary.label=String(label).slice(0,60);
  resolveScene(scene);validate(scene);return {createdIds:created.map(o=>o.id),primaryId:primary.id,objects:created};
 }catch(error){Object.assign(scene,before);throw error;}
}
export function moveConstructionPoint(scene,id,position){
 const o=scene.objects.find(o=>o.id===id);if(!o||o.kind!=='point')return {moved:false,reason:'请选择几何点。'};
 if(position.length!==2||position.some(n=>!Number.isFinite(n)))throw Error('拖动位置须为有限二维坐标。');
 if(o.construction?.type==='point-on'){
  const r=createResolver(scene),curve=r.geometry(reference(r,o.construction.inputs[0]));if(o.defs?.pathT)return {moved:false,reason:'路径参数由定义控制。'};
  o.pathT=curveParameter(curve,position.map(x=>x*.01),o.pathT);resolveScene(scene,{changedIds:[id]});return {moved:true,parameter:o.pathT};
 }
 if(o.construction||o.defs?.position||o.defs?.x||o.defs?.y)return {moved:false,reason:'这个点由构造约束，请拖动它的自由输入点。'};
 [o.x,o.y]=position;resolveScene(scene,{changedIds:[id]});return {moved:true};
}
export function fillRegion(scene,regionId,kind='field',options={}){
 const region=scene.objects.find(o=>o.id===regionId);if(!region||!['circle','polygon'].includes(region.kind)||!['field','electric'].includes(kind))throw Error('请选择圆或多边形区域，并选择电场或磁场。');
 const before=structuredClone(scene);
 try{
  const r=createResolver(scene),geometry=r.geometry(reference(r,regionId)),o=nextObject(scene,kind,[region.x,region.y],region.kind==='circle'?'circle':'polygon');
  o.regionSource=region.id;for(const key of ['B','E0','fieldAngle','waveform','period','phase'])if(options[key]!==undefined)o[key]=options[key];
  if(region.kind==='polygon')o.points=geometry.points.map(p=>p.map(x=>x*100));else o.radius=geometry.r*100;
  resolveScene(scene);validate(scene);return o;
 }catch(error){Object.assign(scene,before);throw error;}
}
export function constructionInfo(scene,id){const o=scene.objects.find(o=>o.id===id);if(!o)return null;return {id:o.id,kind:o.kind,type:o.construction?.type||'free',inputs:[...(o.construction?.inputs||[]),...(o.regionSource?[o.regionSource]:[])],defined:!o._error,message:o._error||'',draggable:o.kind==='point'&&(!o.construction&&!o.defs?.position&&!o.defs?.x&&!o.defs?.y||o.construction?.type==='point-on'&&!o.defs?.pathT),controlledKeys:[...constructionOutputs(o)],regionSource:o.regionSource||null};}
export {constructionOwns,constructionOutputs,tangentContacts,geometryObjectKind,matchesGeometryInput};

export function ensureGeometryFeature(scene,ownerId,feature,index){
 const owner=scene.objects.find(o=>o.id===ownerId);if(owner?.regionSource)ownerId=owner.regionSource;
 const tool=feature==='vertex'?'vertex-point':feature==='edge'?'edge-line':null;if(!tool||!Number.isInteger(index)||index<1)throw Error('请选择有效顶点或边序号。');
 const existing=scene.objects.find(o=>o.construction?.type===tool&&o.construction.inputs[0]===ownerId&&o.index===index&&!o.defs?.index);if(existing)return existing.id;
 return addConstruction(scene,{tool,inputs:[ownerId],index}).primaryId;
}


export function redefineConstruction(scene,id,{inputs}={}){
 const target=scene.objects.find(o=>o.id===id),type=target?.construction?.type,schema=tools.find(t=>t.id===type);
 if(!target||!schema)throw Error('请选择已由几何工具构造的对象。');
 if(!Array.isArray(inputs)||inputs.length<schema.min||inputs.length>schema.max||inputs.some((input,i)=>typeof input!=='string'||!acceptsGeometryInput(scene,type,i,input)))throw Error('请选择工具所需的正确几何输入。');
 if(constructionSpecs[type].outputKind==='input0'&&scene.objects.find(o=>o.id===inputs[0]).kind!==target.kind)throw Error('重选变换输入须保留原图形类型；其他类型请另建变换。');
 if(type==='polygon'&&inputs.length!==target.construction.inputs.length)throw Error('本次重选需保留多边形顶点数量；请依次重选原有顶点。');
 if(type==='point-on'){
  const unit=geometryInputKind(scene,inputs[0])==='circle'?'deg':'';
  if((target.construction.pathUnit||'')!==unit)throw Error('新路径的参数单位不同；请保留同类路径，或另建路径点并设置新参数。');
 }
 const old=target.construction,group=old.group;
 const members=['intersection','tangent'].includes(type)&&group?scene.objects.filter(o=>o.construction?.type===type&&o.construction.group===group&&o.construction.inputs.join('|')===old.inputs.join('|')):[target];
 const changedIds=members.map(o=>o.id),candidate=structuredClone(scene);
 for(const member of candidate.objects.filter(o=>changedIds.includes(o.id)))member.construction.inputs=[...inputs];
 return finishGeometryEdit(scene,candidate,id,changedIds);
}


function finishGeometryEdit(scene,candidate,id,changedIds){
 validate(candidate);const cycle=constructionCycle(candidate);
 if(cycle)throw Error('循环几何构造：'+cycle.map(id=>candidate.objects.find(o=>o.id===id)?.label||id).join(' → '));
 const resolution=resolveScene(candidate);
 if(resolution.cycleIds.length)throw Error(resolution.issues.find(i=>resolution.cycleIds.includes(i.id))?.message||'循环依赖不能作为新的构造输入。');
 validate(candidate);
 // Commit only a fully checked clone. Existing IDs, parameters and bindings
 // survive; failure cannot leave half of a paired intersection on new inputs.
 Object.assign(scene,candidate);inheritResolverState(candidate,scene);
 const states=changedIds.map(id=>{const o=scene.objects.find(o=>o.id===id);return {id,defined:o._defined!==false,message:o._error||''};});
 return {primaryId:id,changedIds,defined:states.find(s=>s.id===id)?.defined!==false,states,issues:resolution.issues,fieldUnavailable:resolution.fieldUnavailable,resolution};
}


export function editPolygonVertices(scene,id,{inputs,points}={}){
 const polygon=scene.objects.find(o=>o.id===id);
 if(polygon?.kind!=='polygon'||polygon.construction&&polygon.construction.type!=='polygon')throw Error('顶点列表编辑只适用于手工多边形；派生多边形请调整参数或重选构造输入。');
 const candidate=structuredClone(scene),target=candidate.objects.find(o=>o.id===id);
 if(polygon.construction){
  if(points!==undefined||!Array.isArray(inputs))throw Error('手工构造多边形请提交顶点输入ID，不要复制静态坐标。');
  const vertices=[...inputs];if(vertices.length>3&&vertices[0]===vertices.at(-1))vertices.pop();
  if(vertices.length<3||vertices.length>64||vertices.some(input=>typeof input!=='string'||!acceptsGeometryInput(scene,'polygon',0,input)))throw Error('多边形需3–64个有效点对象。');
  target.construction.inputs=vertices;
 }else{
  if(inputs!==undefined||!Array.isArray(points)||points.length<3||points.length>64||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('自由多边形需3–64个有限二维坐标；不能混用输入ID。');
  for(const key of Object.keys(target.defs||{})){const match=key.match(/^point(\d+)(?:[xy])?$/);if(match&&Number(match[1])>=points.length)throw Error('删减后的顶点定义目标不存在，请先解除第'+(Number(match[1])+1)+'顶点的定义。');}
  target.points=points.map(p=>[...p]);
 }
 return finishGeometryEdit(scene,candidate,id,[id]);
}
