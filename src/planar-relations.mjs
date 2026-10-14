import {add,sub,mul,dot,norm,unit,cross,rotate,circleLine,circleCircle} from './planar-physics.mjs';
import {geometryDependencies,downstreamObjects,dependencySnapshot} from './planar-dependencies.mjs';
import {constructionOwns,lineGeometry,circleGeometry,polygonGeometry,curveIntersections,circumcircle,curvePoint,curveParameter,continuousPair,onDomain,tangentContacts,constructionSpecs,matchesGeometryInput} from './planar-geometry.mjs';
import {parseExpression,printExpression,transformReferences,evaluate,expressionTex,isConstant,units,scalar,vector,fromNative,toNative,finite,sameDim,D0,DL,DA} from './planar-expressions.mjs';

const info={x:['横坐标','x','cm'],y:['纵坐标','y','cm'],mass:['质量','m','u'],charge:['电荷量','q','e'],speed:['初速率','v_0','speed'],heading:['速度方向','\\theta_0','deg'],B:['磁感应强度','B_z','mT'],radius:['半径','R','cm'],width:['宽度 / 直角边','W','cm'],height:['高度 / 直角边','H','cm'],angle:['转角','\\eta','deg'],length:['长度','L','cm'],count:['粒子数','N',''],spread:['方向张角','\\Delta\\theta','deg'],speedSpan:['速率范围','\\Delta v','speed'],interval:['发射间隔','\\Delta t','us'],pathT:['路径参数','t_p','']};
export function properties(o){
 const result={};for(const [key,[name,tex,unit]] of Object.entries(info))if(typeof o[key]==='number')result[key]={name,tex,unit};
 if(o.kind==='field'){result.period={name:'磁场周期',tex:'T_B',unit:'us'};result.phase={name:'初相位',tex:'\\phi_B',unit:'deg'};}
 if(o.kind==='electric'){result.E0={name:'电场强度 / 峰值',tex:'E_0',unit:'kV/m'};result.fieldAngle={name:'电场方向',tex:'\\varphi_E',unit:'deg'};result.period={name:'交变周期',tex:'T_E',unit:'us'};result.phase={name:'初相位',tex:'\\phi_E',unit:'deg'};}
 if(['field','electric'].includes(o.kind)&&o.shape==='annulus'){result.innerRadius={name:'内半径',tex:'r',unit:'cm'};result.radius={name:'外半径',tex:'R',unit:'cm'};}
 if(typeof o.sectorAngle==='number')result.sectorAngle={name:'扇形张角',tex:'\\alpha',unit:'deg'};
 if(o.kind==='parameter')result.value={name:'自由参数',tex:o.label,unit:o.unit||''};
 for(const key of Object.keys(o).filter(k=>/^pathT\d+$/.test(k)))result[key]={name:'端点 '+(Number(key.slice(5))+1)+' 路径参数',tex:'t_{p'+key.slice(5)+'}',unit:''};
 if(o.kind==='point'&&o.construction?.type==='point-on'&&o.construction.pathUnit==='deg'&&result.pathT)result.pathT.unit='deg';
 if(['point','line','circle','polygon'].includes(o.kind)&&!['rotate','polar-point','fixed-angle-ray'].includes(o.construction?.type))delete result.angle;
 if(['vertex-point','edge-line'].includes(o.construction?.type))result.index={name:o.construction.type==='vertex-point'?'顶点序号':'边序号',tex:'i',unit:''};
 if(['translate','dilate','ratio-point'].includes(o.construction?.type))result.factor={name:o.construction.type==='ratio-point'?'有向分点比例':o.construction.type==='dilate'?'缩放倍数':'平移倍数',tex:o.construction.type==='ratio-point'?'\\lambda':'k',unit:''};
 if(['point','line'].includes(o.kind)&&!['polar-point','fixed-segment'].includes(o.construction?.type))delete result.length;
 if(o.construction?.type==='polar-point'){result.length={name:'极径',tex:'r',unit:'cm'};result.angle={name:'全局极角',tex:'\\theta',unit:'deg'};}
 if(o.construction?.type==='regular-polygon')result.count={name:'边数',tex:'n',unit:''};
 if(o.kind==='polygon'){if(o.construction?.type!=='regular-polygon')delete result.count;result.area={name:'面积',tex:'S',unit:'cm2',readOnly:true};result.perimeter={name:'周长',tex:'L',unit:'cm',readOnly:true};}
 o.points?.forEach((p,i)=>{for(const [j,axis] of ['x','y'].entries())result[`point${i}${axis}`]={name:`端点 ${i+1} ${axis}`,tex:`${axis}_{${i+1}}`,unit:'cm'};});return result;
}
export function targets(o){return {...Object.fromEntries(Object.entries(properties(o)).filter(([,spec])=>!spec.readOnly)),...(o.kind==='parameter'?{}:{position:{name:'位置（点 / 向量）',tex:'\\boldsymbol P',unit:'cm'}}),...Object.fromEntries((o.points||[]).map((_,i)=>['point'+i,{name:'端点 '+(i+1)+' 的位置',tex:'P_'+(i+1),unit:'cm'}]))};}
export function bindingKey(o,key){if(['x','y'].includes(key)&&o.defs?.position)return 'position';const p=key.match(/^(point\d+)[xy]$/);return p&&o.defs?.[p[1]]?p[1]:o.defs?.[key]?key:null;}
const isPointKey=key=>key==='position'||/^point\d+$/.test(key);
const objectName=(scene,id)=>scene.objects.find(o=>o.id===id)?.label||id;
function lookup(scene,name){const direct=scene.objects.find(o=>o.id===name);if(direct)return direct;const matches=scene.objects.filter(o=>o.label===name);if(matches.length!==1)throw Error(matches.length?'对象名称重复，请用引用选择器插入。':'找不到引用对象 '+name);return matches[0];}
const astCache=new Map();function parsed(text){if(!astCache.has(text)){if(astCache.size>600)astCache.clear();astCache.set(text,parseExpression(text));}return astCache.get(text);}
export function canonicalExpression(scene,text){return printExpression(transformReferences(parsed(text),ref=>isConstant(ref.name)&&!ref.key?ref:{...ref,name:lookup(scene,ref.name).id}));}
export function displayExpression(scene,text){try{return printExpression(parsed(text),(name,key)=>{const o=scene.objects.find(o=>o.id===name),alias=o&&/^[A-Za-z_][A-Za-z_0-9]*$/.test(o.label)&&!isConstant(o.label)&&scene.objects.filter(x=>x.label===o.label).length===1?o.label:name;return alias+(key?'.'+key:'');});}catch{return text;}}
export function definitionTex(scene,text){return expressionTex(parsed(text),(name,key)=>{
 if(name==='axisX'||name==='axisY')return name==='axisX'?'x\\text{轴}':'y\\text{轴}';
 const o=scene.objects.find(o=>o.id===name)||scene.objects.find(o=>o.label===name),label=o?.label||'\\text{已删除对象}';
 if(!key)return label;const p=o&&(properties(o)[key]||targets(o)[key]);return key==='value'?label:`{${p?.tex||'\\mathrm{'+key+'}'}}_{\\left[${label}\\right]}`;
});}
const line=lineGeometry,circle=circleGeometry;
const inDomain=onDomain;
export function intersections(a,b,options){if(a.kind==='annulus'||b.kind==='annulus')throw Error('环域不是单条曲线，请选circle(pos(id), id.radius)或circle(pos(id), id.innerRadius)。');return curveIntersections(a,b,options);}
function nativeValue(o,key){if(key==='position')return [o.x,o.y];const p=key.match(/^point(\d+)([xy])?$/);if(p)return p[2]?o.points?.[+p[1]]?.[p[2]==='x'?0:1]:o.points?.[+p[1]];return o[key];}
export function assignValue(o,key,value){if(o.kind==='polygon'&&['area','perimeter'].includes(key))throw Error('面积与周长是派生量，不能直接写入。');if(key==='position'){[o.x,o.y]=value;return;}const p=key.match(/^point(\d+)([xy])?$/);if(p){if(p[2])o.points[+p[1]][p[2]==='x'?0:1]=value;else o.points[+p[1]]=value;return;}o[key]=value;}
function checkValue(o,key,n){
 if(isPointKey(key)){if(!Array.isArray(n)||n.length!==2||n.some(v=>!Number.isFinite(v)))throw Error('位置须为有限的二维点。');return;}
 finite(n);if(key==='innerRadius'&&n<0)throw Error('内半径须为非负数。');if(['mass','radius','width','height','length','period'].includes(key)&&n<=0&&!(key==='length'&&o.construction?.type==='polar-point'&&n===0))throw Error('质量、几何尺寸和周期须为正。');
 if(key==='sectorAngle'&&(n<=0||n>180))throw Error('扇形张角须在 0–180° 之间且非零。');
 if(['speed','speedSpan','interval','spread','E0'].includes(key)&&n<0)throw Error('速率、间隔、张角和电场强度不能为负。');
 if(key==='count'&&o.construction?.type!=='regular-polygon'&&(!Number.isInteger(n)||n<1||n>100))throw Error('发射数量须为 1–100 的整数。');
}

const resolverFrames=new WeakMap();
export function inheritResolverState(source,target){const frame=resolverFrames.get(source);if(!frame)return false;resolverFrames.set(target,{structure:frame.structure,memo:new Map(frame.memo),constructed:new Map(frame.constructed),regions:new Map(frame.regions)});return true;}
export function createResolver(scene,{changedIds}={}){
 const graph=geometryDependencies(scene),previous=resolverFrames.get(scene),incremental=Array.isArray(changedIds)&&previous?.structure===graph.structure;
 const dirty=incremental?downstreamObjects(scene,graph,changedIds):new Set(scene.objects.map(o=>o.id));
 const keep=map=>new Map([...(incremental?map||[]:[])].filter(([key])=>!dirty.has(String(key).split('.')[0])));
 const memo=keep(previous?.memo),active=[],constructed=keep(previous?.constructed),building=[],intersectionGroups=new Map(),regions=keep(previous?.regions),evaluated=new Set();
 const obj=id=>{const o=scene.objects.find(o=>o.id===id);if(!o)throw Error('引用对象已删除：'+id);return o;};
 // Strict geometric and arithmetic inputs are all dependencies, even if one
 // is undefined. Prefer a true cycle over an earlier missing-value diagnostic.
 const readAll=reads=>{const values=[],errors=[];for(const read of reads)try{values.push(read());}catch(error){values.push(null);errors.push(error);}if(errors.length)throw errors.find(e=>e.cycle)||errors[0];return values;};
 // Read the same object data consumed by native geometry functions, before
 // another missing argument can stop their strict evaluation. Do not warm all
 // object properties (for example a circle's B is not needed for its center).
 function definitionReads(ast,pointResult=false){
  const reads=[],pointArgs={pos:[0],center:[0],line:[0,1],segment:[0,1],ray:[0,1],circle:[0],mid:[0,1],distance:[0,1],vector:[0,1],bearing:[0,1],unit:[0],circumcenter:[0,1,2],circleThrough:[0,1,2],parallel:[1],perp:[1],foot:[0]},geometryArgs={intersect:[0,1],on:[0],foot:[1],parallel:[0],perp:[0],end:[0],area:[0],perimeter:[0],length:[0]};
  const consume=(node,kind)=>()=>{const value=evaluate(node,context);return value?.type==='object'?(kind==='geometry'?geometry(value):point(value)):value;};
  function visit(node){
   if(node.type==='ref'){
    if(node.key)reads.push(()=>get(lookup(scene,node.name).id,node.key));
    else if(!isConstant(node.name)&&scene.objects.find(o=>o.id===node.name||o.label===node.name)?.kind==='parameter')reads.push(()=>context.reference(node.name));
   }else if(node.type==='call'){
    node.args.forEach(visit);for(const index of pointArgs[node.name]||[])if(node.args[index])reads.push(consume(node.args[index],'point'));
    for(const index of geometryArgs[node.name]||[])if(node.args[index])reads.push(consume(node.args[index],'geometry'));
   }else if(node.type==='binary'){visit(node.a);visit(node.b);}else if(node.type==='unary')visit(node.arg);
  }
  visit(ast);if(pointResult&&ast.type==='ref'&&!ast.key)reads.push(consume(ast,'point'));return reads;
 }
 function construct(o){
  if(!o.construction)return null;if(constructed.has(o.id)){const value=constructed.get(o.id);if(value instanceof Error)throw value;return value;}
  if(building.includes(o.id)){const error=Error('循环几何构造：'+[...building,o.id].map(id=>objectName(scene,id)).join(' → '));error.cycle=true;throw error;}
  building.push(o.id);evaluated.add(o.id);const c=o.construction,inputValues=[],input=i=>{const id=c.inputs[i];if(/^o\d+$/.test(id))obj(id);return context.reference(id);},p=i=>inputValues[i]||point(input(i)),g=i=>inputValues[i]||geometry(input(i));
  try{
   const spec=constructionSpecs[c.type];if(!spec)throw Error('未知几何构造。');
   for(const [i,id] of c.inputs.entries()){const source=/^o\d+$/.test(id)?obj(id):null,expected=spec.inputKinds[Math.min(i,spec.inputKinds.length-1)];if(!matchesGeometryInput(expected,source,id))throw Error('构造输入类型不匹配：'+objectName(scene,id)+'。');}
   if(spec.outputKind==='input0'&&obj(c.inputs[0]).kind!==o.kind)throw Error('变换输出类型须与源图形一致。');
   inputValues.push(...readAll(c.inputs.map((_,i)=>()=>spec.inputKinds[Math.min(i,spec.inputKinds.length-1)]==='point'||spec.inputKinds[Math.min(i,spec.inputKinds.length-1)]==='geometry'&&obj(c.inputs[i]).kind==='point'?point(input(i)):geometry(input(i)))));
   let value;
   if(c.type==='ratio-point'){const A=p(0),B=p(1);value={position:add(A,mul(sub(B,A),toNative(get(o.id,'factor'),'')))};}
   else if(c.type==='polar-point'){const origin=p(0),radius=get(o.id,'length').n,theta=toNative(get(o.id,'angle'),'deg')*Math.PI/180;value={position:add(origin,rotate([radius,0],theta))};}
   else if(c.type==='fixed-segment'){const A=p(0),B=p(1);line(A,B);value={points:[A,add(A,mul(unit(sub(B,A)),get(o.id,'length').n))],lineType:'segment'};}
   else if(c.type==='fixed-angle-ray'){const A=p(0),B=p(1);line(A,B);const theta=toNative(get(o.id,'angle'),'deg')*Math.PI/180,d=rotate(sub(B,A),theta);value={points:[A,add(A,d)],lineType:'ray'};}
   else if(c.type==='compass-circle'){const center=p(0),radius=norm(sub(p(2),p(1)));circle(center,radius);value={position:center,radius};}
   else if(c.type==='midpoint')value={position:mul(add(p(0),p(1)),.5)};
   else if(c.type==='center')value={position:g(0).center};
   else if(c.type==='point-on'){
    const curve=g(0),unit=curve.kind==='circle'?'deg':'';if((c.pathUnit||'')!==unit)throw Error('路径点参数单位与路径类型不一致。');
    value={position:curvePoint(curve,toNative(get(o.id,'pathT'),unit))};
   }else if(c.type==='foot'){
    const P=p(0),L=g(1);if(L.kind!=='line')throw Error('垂足需要直线、线段或射线。');const foot=sub(P,mul(L.n,dot(L.n,sub(P,L.a))));if(!inDomain(L,foot))throw Error('垂足在所选线段或射线范围外。');value={position:foot};
   }else if(c.type==='intersection'){
    const group=c.inputs.join('|')+'::'+(c.group||o.id);let pair=intersectionGroups.get(group);
    if(!pair){
     const members=scene.objects.filter(x=>x.construction?.type==='intersection'&&x.construction.inputs.join('|')+'::'+(x.construction.group||x.id)===group),A=g(0),B=g(1),raw=curveIntersections(A,B,{details:true});
     const first=members.find(m=>m.construction.branch===1),second=members.find(m=>m.construction.branch===2),memory=c.memory||[first?[first.x,first.y]:null,second?[second.x,second.y]:null];
     const anchors=memory.map(p=>p&&mul(p,.01)),selection=raw.points.length===1?{points:[raw.points[0],null],permutation:[0,1]}:continuousPair(raw.points,anchors,c.permutation||[0,1]);
     pair={points:selection.points,defined:selection.permutation.map(index=>raw.defined[index]||false)};intersectionGroups.set(group,pair);
     // A tangent must not erase the last distinct anchors. Undefined limited
     // paths retain mathematical coordinates for branch continuity on recovery.
     const distinct=selection.points.every(Boolean)&&norm(sub(selection.points[0],selection.points[1]))>64*Number.EPSILON*Math.max(A.r||norm(sub(A.b,A.a)),B.r||norm(sub(B.b,B.a)),1e-300);
     for(const member of members){member.construction.permutation=selection.permutation;if(distinct)member.construction.memory=selection.points.map(p=>mul(p,100));}
    }
    if(!pair.defined[c.branch-1]||!pair.points[c.branch-1])throw Error('所选交点当前不存在或在有限路径范围外。');value={position:pair.points[c.branch-1]};
   }else if(['line','segment','ray'].includes(c.type)){const a=p(0),b=p(1);line(a,b,c.type);value={points:[a,b]};}
   else if(['parallel','perpendicular'].includes(c.type)){const L=g(0),P=p(1);if(L.kind!=='line')throw Error('平行线或垂线需要原直线。');const v=sub(L.b,L.a),d=c.type==='parallel'?v:[-v[1],v[0]];value={points:[P,add(P,d)]};}
   else if(c.type==='perp-bisector'){const a=p(0),b=p(1),v=sub(b,a),P=mul(add(a,b),.5);line(a,b);value={points:[P,add(P,[-v[1],v[0]])]};}
   else if(c.type==='angle-bisector'){
    const vertex=p(1),u=unit(sub(p(0),vertex)),v=unit(sub(p(2),vertex));if(!norm(sub(p(0),vertex))||!norm(sub(p(2),vertex)))throw Error('角的边不能与顶点重合。');let d=add(u,v);if(norm(d)<1e-12)d=[-u[1],u[0]];value={points:[vertex,add(vertex,d)]};
   }else if(['rotate','translate','reflect-line','reflect-point','dilate'].includes(c.type)){
    const source=inputValues[0];let map,scale=1;
    if(c.type==='rotate'){const center=p(1),theta=toNative(get(o.id,'angle'),'deg')*Math.PI/180;map=P=>add(center,rotate(sub(P,center),theta));}
    else if(c.type==='translate'){const L=g(1);if(L.kind!=='line'||L.domain!=='segment')throw Error('平移请引用有向线段。');const delta=mul(sub(L.b,L.a),toNative(get(o.id,'factor'),''));map=P=>add(P,delta);}
    else if(c.type==='reflect-line'){const L=g(1);if(L.kind!=='line')throw Error('轴对称需要直线。');map=P=>sub(P,mul(L.n,2*dot(L.n,sub(P,L.a))));}
    else{const center=p(1);scale=c.type==='dilate'?toNative(get(o.id,'factor'),''):-1;map=P=>add(center,mul(sub(P,center),scale));}
    if(o.kind==='point')value={position:map(source)};
    else if(o.kind==='line'){const a=map(source.a),b=map(source.b);line(a,b,source.domain);value={points:[a,b],lineType:source.domain};}
    else if(o.kind==='circle'){const center=map(source.center),radius=Math.abs(scale)*source.r;circle(center,radius);value={position:center,radius};}
    else{const P=polygonGeometry(source.points.map(map));value={points:P.points,position:P.center,area:P.area,perimeter:P.perimeter};}
   }
   else if(c.type==='regular-polygon'){
    const a=p(0),b=p(1),count=toNative(get(o.id,'count'),''),turn=(c.orientation??1)*2*Math.PI/count;if(!Number.isInteger(count)||count<3||count>64)throw Error('正多边形边数须为3–64的整数。');line(a,b);const points=[a,b];let side=sub(b,a);for(let i=2;i<count;i++){side=rotate(side,turn);points.push(add(points.at(-1),side));}const P=polygonGeometry(points);value={points:P.points,position:P.center,area:P.area,perimeter:P.perimeter};
   }else if(c.type==='vertex-point'||c.type==='edge-line'){
    const P=g(0),index=toNative(get(o.id,'index'),'');if(P.kind!=='polygon'||!Number.isInteger(index)||index<1||index>P.points.length)throw Error('多边形顶点或边序号当前不存在。');const a=P.points[index-1],b=P.points[index%P.points.length];value=c.type==='vertex-point'?{position:a}:{points:[a,b]};
   }else if(c.type==='rectangle'||c.type==='parallelogram'){
    const a=p(0),b=p(1),cPoint=p(2);let points;
    if(c.type==='parallelogram')points=[a,b,cPoint,add(a,sub(cPoint,b))];
    else{const direction=unit(sub(b,a));line(a,b);const normal=[-direction[1],direction[0]],height=dot(sub(cPoint,a),normal),delta=mul(normal,height);points=[a,b,add(b,delta),add(a,delta)];}
    const P=polygonGeometry(points);value={points:P.points,position:P.center,area:P.area,perimeter:P.perimeter};
   }else if(c.type==='tangent'){
    const P=p(0),C=g(1);if(C.kind!=='circle')throw Error('切线需要圆。');const group='tangent:'+c.inputs.join('|')+'::'+(c.group||o.id);let pair=intersectionGroups.get(group);
    if(!pair){const members=scene.objects.filter(x=>x.construction?.type==='tangent'&&x.construction.inputs.join('|')+'::'+(x.construction.group||x.id)===c.inputs.join('|')+'::'+(c.group||o.id)),contacts=tangentContacts(P,C),memory=c.memory||[null,null],selected=continuousPair(contacts,memory.map(p=>p&&mul(p,.01)),c.permutation||[0,1]);pair=selected;intersectionGroups.set(group,pair);
     const distinct=selected.points.every(Boolean)&&norm(sub(selected.points[0],selected.points[1]))>64*Number.EPSILON*C.r;for(const member of members){member.construction.permutation=selected.permutation;if(distinct)member.construction.memory=selected.points.map(p=>mul(p,100));}}
    const contact=pair.points[c.branch-1];if(!contact)throw Error('圆内点没有实切线。');const radial=sub(P,C.center),length=norm(sub(contact,P));value={points:length>64*Number.EPSILON*C.r?[P,contact]:[P,add(P,mul(unit([-radial[1],radial[0]]),C.r))]};
   }else if(c.type==='circle-radius')value={position:p(0)};
   else if(c.type==='circle-point'){const center=p(0),radius=norm(sub(p(1),center));circle(center,radius);value={position:center,radius};}
   else if(c.type==='circle-three'){const C=circumcircle(p(0),p(1),p(2));value={position:C.center,radius:C.r};}
   else if(c.type==='polygon'){const P=polygonGeometry(c.inputs.map((_,i)=>p(i)));value={points:P.points,position:P.center,area:P.area,perimeter:P.perimeter};}
   else throw Error('未知几何构造。');
   if(value.points){o.points=value.points.map(p=>mul(p,100));value.position??=mul(add(value.points[0],value.points[1]),.5);}
   if(value.position)[o.x,o.y]=mul(value.position,100);if(value.radius!==undefined)o.radius=value.radius*100;if(value.lineType)o.lineType=value.lineType;
   if(value.area!==undefined)o.area=value.area*10000;if(value.perimeter!==undefined)o.perimeter=value.perimeter*100;
   constructed.set(o.id,value);return value;
  }catch(error){constructed.set(o.id,error);throw error;}finally{building.pop();}
 }
 function region(o){
  if(!o.regionSource)return null;if(regions.has(o.id)){const value=regions.get(o.id);if(value instanceof Error)throw value;return value;}
  try{
   evaluated.add(o.id);const source=obj(o.regionSource);if(!['polygon','circle'].includes(source.kind))throw Error('场区域须引用圆或多边形。');
   const value=geometry({type:'object',id:source.id});if(o.shape!==(value.kind==='circle'?'circle':'polygon'))throw Error('场形状与绑定区域类型不一致。');
   [o.x,o.y]=mul(value.center,100);
   if(value.kind==='circle'){o.radius=value.r*100;o.width=o.height=o.radius*2;}
   else{const xs=value.points.map(p=>p[0]),ys=value.points.map(p=>p[1]);o.points=value.points.map(p=>mul(p,100));o.width=(Math.max(...xs)-Math.min(...xs))*100;o.height=(Math.max(...ys)-Math.min(...ys))*100;}
   regions.set(o.id,value);return value;
  }catch(error){regions.set(o.id,error);throw error;}
 }
 function get(id,key){
  const token=id+'.'+key;if(memo.has(token)){const v=memo.get(token);if(v instanceof Error)throw v;return v;}
  if(active.includes(token)){const e=Error('循环依赖：'+[...active.slice(active.indexOf(token)),token].map(x=>objectName(scene,x.split('.')[0])+'.'+x.split('.')[1]).join(' → '));e.cycle=true;throw e;}
  active.push(token);
  try{
   const o=obj(id);if(constructionOwns(o,key)||o.kind==='polygon'&&['area','perimeter'].includes(key))construct(o);if(o.regionSource&&(['position','x','y','radius','width','height'].includes(key)||/^point\d+(?:[xy])?$/.test(key)))region(o);const spec=properties(o)[key]||targets(o)[key];if(!spec)throw Error('对象没有可引用属性 '+key);let result;
   const bound=bindingKey(o,key);
   if(o.points&&['x','y'].includes(key)){if(o.defs?.[key])throw Error('线和测量工具请定义端点，中心坐标随端点确定。');const p=get(id,'position');result=scalar(p.p[key==='x'?0:1],DL,.01);o[key]=result.n/.01;}
   else if(bound&&bound!==key){const p=get(id,bound);result=scalar(p.p[key==='x'||key.endsWith('x')?0:1],DL,.01);}
   else if(o.defs?.[key]){
    const ast=parsed(o.defs[key]);readAll(definitionReads(ast,isPointKey(key)));
    const value=evaluate(ast,context);let native;
    if(isPointKey(key)){const p=point(value);native=p.map(v=>v/.01);result=vector(p);}
    else{native=toNative(value,spec.unit);result=fromNative(native,spec.unit);}
    checkValue(o,key,native);assignValue(o,key,native);
   }else if(o.kind==='polygon'&&['area','perimeter'].includes(key)){const P=polygonGeometry(readAll(o.points.map((_,i)=>()=>get(id,'point'+i).p)));o.area=P.area*10000;o.perimeter=P.perimeter*100;result=fromNative(o[key],spec.unit);}
   else if(isPointKey(key)&&key==='position'&&(o.kind==='polygon'||o.shape==='polygon')){const P=o.regionSource?region(o):polygonGeometry(readAll(o.points.map((_,i)=>()=>get(id,'point'+i).p)));[o.x,o.y]=mul(P.center,100);if(o.kind==='polygon'){o.area=P.area*10000;o.perimeter=P.perimeter*100;}result=vector(P.center);}
   else if(isPointKey(key)){
    result=key==='position'?(o.points?vector(o.kind==='angle'?get(id,'point1').p:mul(readAll([()=>get(id,'point0').p,()=>get(id,'point1').p]).reduce(add),.5)):vector(readAll([()=>get(id,'x').n,()=>get(id,'y').n]))):vector([get(id,key+'x').n,get(id,key+'y').n]);
   }else{const n=nativeValue(o,key);checkValue(o,key,n);result=fromNative(n,spec.unit);}
   memo.set(token,result);return result;
  }catch(error){memo.set(token,error);throw error;}finally{active.pop();}
 }
 function point(value){
  if(value?.type==='object')return get(value.id,'position').p;
  if(value?.type!=='vector'||!sameDim(value.d,DL))throw Error('这里需要一个位置点或长度向量。');return value.p;
 }
 const handle=v=>{if(v?.type!=='object')throw Error('请选择一个场景对象。');return obj(v.id);};
 const number=q=>toNative(q,''),length=q=>toNative(q,'cm')*.01,angle=q=>toNative(q,'deg')*Math.PI/180;
 function geometry(value){
  if(value?.type==='curve'||value?.type==='region')return value;const o=handle(value),p=get(o.id,'position').p;
  if(['field','electric'].includes(o.kind)&&o.shape==='annulus'){const [R,r]=readAll([()=>get(o.id,'radius').n,()=>get(o.id,'innerRadius').n]);if(!(R>0&&r>=0&&r<R))throw Error('环形场须满足0≤内半径<外半径。');return {type:'region',kind:'annulus',center:p,r:R,innerRadius:r,area:Math.PI*(R-r)*(R+r),perimeter:2*Math.PI*(R+r)};}
  if(o.kind==='polygon'||o.shape==='polygon')return o.regionSource?region(o):polygonGeometry(o.points.map((_,i)=>get(o.id,'point'+i).p));
  if(['rectangle','triangle'].includes(o.shape))return polygonGeometry(Array.from({length:o.shape==='triangle'?3:4},(_,i)=>vertex(o,i+1)));
  if(o.kind==='circle'||o.shape==='circle'||o.sourceType==='circle')return circle(p,get(o.id,'radius').n);
  if(o.kind==='line'||o.kind==='ruler')return line(get(o.id,'point0').p,get(o.id,'point1').p,o.kind==='ruler'?'segment':o.lineType||'line');
  throw Error('请选择圆、直线、线段或明确的一条场域边。');
 }
 function vertex(o,index){
  if(o.shape==='annulus')throw Error('环域没有多边形顶点，请选择内圆或外圆上的点。');
  if(o.kind==='polygon'||o.shape==='polygon'){if(!Number.isInteger(index)||index<1||index>o.points.length)throw Error('顶点序号超出范围。');return get(o.id,'point'+(index-1)).p;}
  if(['semicircle','sector'].includes(o.shape)){const sweep=o.shape==='semicircle'?Math.PI:get(o.id,'sectorAngle').n,R=get(o.id,'radius').n,theta=get(o.id,'angle').n;if(![1,2,3].includes(index))throw Error('顶点序号为 1、2（弧端点）或 3（圆心）。');return add(get(o.id,'position').p,index===3?[0,0]:rotate([R,0],theta+(index===2?sweep:0)));}
  const w=get(o.id,'width').n/2,h=get(o.id,'height').n/2,local=o.shape==='triangle'?[[-w,-h],[w,-h],[-w,h]]:[[-w,-h],[w,-h],[w,h],[-w,h]];
  if(!Number.isInteger(index)||!local[index-1])throw Error('顶点序号超出范围。');return add(get(o.id,'position').p,rotate(local[index-1],get(o.id,'angle').n));
 }
 function edge(o,index){
  if(o.shape==='annulus')throw Error('环域边界是内外圆，请用circle(pos(id), id.radius)或circle(pos(id), id.innerRadius)。');
  if(o.kind==='polygon'||o.shape==='polygon')return line(vertex(o,index),vertex(o,index%o.points.length+1),'segment');
  if(o.shape==='semicircle'&&index===1)return line(vertex(o,1),vertex(o,2),'segment');
  if(o.shape==='sector'&&[1,2].includes(index))return line(vertex(o,3),vertex(o,index),'segment');
  if(['rectangle','triangle'].includes(o.shape)){const count=o.shape==='triangle'?3:4;return line(vertex(o,index),vertex(o,index%count+1),'segment');}
  const p=get(o.id,'position').p,theta=get(o.id,'angle').n,axes=[rotate([1,0],theta),rotate([0,1],theta)];
  if(o.shape==='half'&&index===1)return line(p,add(p,axes[1]));
  if(o.shape==='strip'&&[1,2].includes(index)){const a=add(p,mul(axes[0],get(o.id,'width').n/2*(index===1?-1:1)));return line(a,add(a,axes[1]));}
  if(o.shape==='quadrant'&&[1,2].includes(index))return line(p,add(p,axes[index-1]),'ray');
  throw Error('该对象没有所选边。');
 }
 const context={reference(name,key){
  if(!key&&(name==='axisX'||name==='axisY'))return line([0,0],name==='axisX'?[.01,0]:[0,.01]);
  const o=lookup(scene,name);return key?get(o.id,key):o.kind==='parameter'?get(o.id,'value'):{type:'object',id:o.id};
 },call(name,args){
  const [a,b,c]=args;
  if(name==='orbitSpeed'||name==='orbitRadius'){
   if(args.length!==4)throw Error(name+' 需要四个参数。');const m=toNative(a,'u')*units.u.scale,q=toNative(b,'e')*units.e.scale,B=toNative(name==='orbitSpeed'?c:args[3],'mT')*.001;
   if(m<=0||q===0||B===0)throw Error('质量须为正，电荷与场强非零，才能定义有限圆轨道。');
   if(name==='orbitSpeed'){const R=length(args[3]);if(R<=0)throw Error('轨道半径须为正。');return scalar(Math.abs(q*B)*R/m,units.speed.d,units.speed.scale);}
   const v=toNative(c,'speed')*1e5;if(v<=0)throw Error('静止粒子没有圆轨道半径。');return scalar(m*v/Math.abs(q*B),DL,.01);
  }
  if(name==='point'){if(args.length!==2)throw Error('point 需要横、纵坐标。');return vector([length(a),length(b)]);}
  if(name==='pos'||name==='center')return vector(point(a));
  if(name==='vertex')return vector(vertex(handle(a),number(b)));
  if(name==='edge')return edge(handle(a),number(b));
  if(name==='end'){const g=geometry(a),i=number(b);if(g.kind!=='line'||![1,2].includes(i))throw Error('end 需要直线和端点序号 1 或 2。');return vector(i===1?g.a:g.b);}
  if(name==='line'||name==='segment'||name==='ray')return line(point(a),point(b),name);
  if(name==='circle')return circle(point(a),length(b));
  if(name==='mid')return vector(mul(add(point(a),point(b)),.5));
  if(name==='area'||name==='perimeter'){const g=geometry(a);if(g.kind==='polygon'||g.kind==='annulus')return name==='area'?scalar(g.area,[0,2,0,0,0],.0001):scalar(g.perimeter,DL,.01);if(g.kind==='circle')return name==='area'?scalar(Math.PI*g.r*g.r,[0,2,0,0,0],.0001):scalar(2*Math.PI*g.r,DL,.01);throw Error('面积与周长需要圆、环域或多边形。');}
  if(name==='circumcenter'||name==='circleThrough'){const C=circumcircle(point(a),point(b),point(c));return name==='circumcenter'?vector(C.center):C;}
  if(name==='distance')return scalar(norm(sub(point(a),point(b))),DL,.01);
  if(name==='vector')return vector(sub(point(b),point(a)));
  if(name==='length'){
   // A line's d is its signed offset; only vectors store dimensions in d.
   if(a.type==='vector')return scalar(norm(a.p),a.d,sameDim(a.d,DL)?.01:1);
   const g=geometry(a);if(g.kind!=='line')throw Error('length 需要向量或由两点定义的线。');
   return scalar(norm(sub(g.b,g.a)),DL,.01);
  }
  if(name==='unit'){const p=a.type==='vector'?a.p:point(a);if(norm(p)<1e-14)throw Error('零向量没有方向。');return vector(unit(p),D0);}
  if(name==='dot'){if(a.type!=='vector'||b.type!=='vector')throw Error('dot 需要两个向量。');return scalar(dot(a.p,b.p),a.d.map((d,i)=>d+b.d[i]));}
  if(name==='rotate'){if(a.type!=='vector')throw Error('rotate 需要向量和角度。');return vector(rotate(a.p,angle(b)),a.d);}
  if(name==='polar')return vector(mul([Math.cos(angle(b)),Math.sin(angle(b))],length(a)));
  if(name==='bearing'){const v=sub(point(b),point(a));if(norm(v)<1e-14)throw Error('两点重合，指向未定义。');return scalar(Math.atan2(v[1],v[0]),DA,Math.PI/180);}
  if(name==='parallel'||name==='perp'){const g=geometry(a);if(g.kind!=='line')throw Error('请选择直线。');const v=sub(g.b,g.a),p=point(b);return line(p,add(p,name==='parallel'?v:[-v[1],v[0]]));}
  if(name==='foot'){const p=point(a),g=geometry(b);if(g.kind!=='line')throw Error('垂足需要一条直线。');const foot=sub(p,mul(g.n,dot(g.n,p)-g.d));if(!inDomain(g,foot))throw Error('垂足在所选线段或射线范围外。');return vector(foot);}
  if(name==='on'){
   const g=geometry(a);if(g.kind==='annulus')throw Error('环域不是单条路径，请选circle(pos(id), id.radius)或circle(pos(id), id.innerRadius)。');if(g.kind==='polygon')return vector(curvePoint(g,number(b)));
   if(g.kind==='circle'){const theta=angle(b);return vector(add(g.center,mul([Math.cos(theta),Math.sin(theta)],g.r)));}
   const p=add(g.a,mul(sub(g.b,g.a),number(b)));if(!inDomain(g,p))throw Error('路径参数超出了线段或射线范围。');return vector(p);
  }
  if(name==='intersect'){
   const branch=c?number(c):1;if(!Number.isInteger(branch)||branch<1||branch>2)throw Error('交点分支为 1 或 2。');
   const p=intersections(geometry(a),geometry(b))[branch-1];if(!p)throw Error('所选交点暂不存在。');return vector(p);
  }
  throw Error('未知函数 '+name+'；可在函数说明中查看支持的构造。');
 }};
 return {get,geometry,point,construct,region,graph,dirty,evaluated,commit(){resolverFrames.set(scene,{structure:geometryDependencies(scene).structure,memo,constructed,regions});},evaluate:text=>evaluate(parsed(text),context)};
}

export function resolveScene(scene,options={}){
 const r=createResolver(scene,options),issues=[],cycleIds=new Set();
 for(const id of r.graph.order){const o=scene.objects.find(o=>o.id===id);
  const errors={};Object.defineProperty(o,'_issues',{value:errors,writable:true,configurable:true,enumerable:false});
  const error=(key,e)=>{errors[key]=e.message;if(e.cycle)cycleIds.add(o.id);};
  if(o.construction)try{r.construct(o);}catch(e){error('construction',e);}
  if(o.regionSource)try{r.region(o);}catch(e){error('regionSource',e);}
  for(const key of Object.keys(o.defs||{}))try{r.get(o.id,key);}catch(e){error(key,e);}
  if(['field','electric'].includes(o.kind)&&o.shape==='annulus')try{r.geometry({type:'object',id:o.id});}catch(e){error('annulus',e);}
  if(o.points)try{o.x=r.get(o.id,'x').n/.01;o.y=r.get(o.id,'y').n/.01;}catch(e){error('position',e);}
  if(o.kind==='source'&&o.speedSpan>2*o.speed)errors.speedSpan='速率范围超过中心速率的两倍。';
  const message=[...new Set(Object.values(errors).map(x=>x.replace(/。$/,'')))].join('；');Object.defineProperty(o,'_error',{value:message,writable:true,configurable:true,enumerable:false});Object.defineProperty(o,'_defined',{value:!message,writable:true,configurable:true,enumerable:false});if(message)issues.push({id:o.id,label:o.label,message});
 }
 // The field is an input to every trajectory. An undefined enabled field cannot
 // be silently omitted while drawing otherwise plausible free-flight paths.
 const fieldUnavailable=scene.objects.some(o=>['field','electric'].includes(o.kind)&&o.enabled&&o._error);
 r.commit();return {issues,cycleIds:[...cycleIds],fieldUnavailable,dependencyGraph:{...dependencySnapshot(scene,r.graph),dirty:[...r.dirty],evaluated:[...r.evaluated],physicsDirty:scene.objects.some(o=>r.dirty.has(o.id)&&['field','electric','particle','source'].includes(o.kind))},scene:{...scene,objects:scene.objects.filter(o=>!o._error&&(!fieldUnavailable||!['particle','source'].includes(o.kind)))}};
}
export function buildDependencyGraph(scene){return dependencySnapshot(scene);}
export function setDefinition(scene,id,key,text,locked=true){
 const o=scene.objects.find(o=>o.id===id);if(o&&properties(o)[key]?.readOnly)throw Error('面积与周长是派生量，请定义它们的输入或引用测量值。');if(!o||!targets(o)[key])throw Error('请选择要定义的位置或参数。');
 if(constructionOwns(o,key)||o.regionSource&&(['position','x','y','radius','width','height'].includes(key)||/^point\d+(?:[xy])?$/.test(key)))throw Error('这个几何输出由构造或区域绑定控制，请修改它的输入。');
 if(o.points&&['position','x','y'].includes(key))throw Error('线和测量工具请分别定义端点位置。');
 const source=canonicalExpression(scene,text),before={...(o.defs||{})};o.defs={...before,[key]:source};
 if(key==='position'){delete o.defs.x;delete o.defs.y;}if(/^point\d+$/.test(key)){delete o.defs[key+'x'];delete o.defs[key+'y'];}
 try{createResolver(scene).get(id,key);}catch(e){if(e.cycle||!locked){o.defs=before;throw e;}}
 if(!locked)delete o.defs[key];return source;
}
export function cloneDefinitions(o,oldId){if(!o.defs)return;for(const [key,text] of Object.entries(o.defs))o.defs[key]=printExpression(transformReferences(parsed(text),r=>r.name===oldId?{...r,name:o.id}:r));}
export const pathKeyFor=key=>key==='position'?'pathT':'pathT'+key.slice(5);
export function pathDefinition(o,key='position'){
 try{const ast=parsed(o.defs?.[key]);if(ast.type==='call'&&ast.name==='on'&&ast.args[1]?.type==='ref'&&ast.args[1].name===o.id&&ast.args[1].key===pathKeyFor(key))return printExpression(ast.args[0]);}catch{}return null;
}
export function pathParameter(scene,curve,p){const r=createResolver(scene),g=r.geometry(r.evaluate(curve)),t=curveParameter(g,mul(p,.01));return g.kind==='circle'?(t%360+360)%360:t;}

export function geometryFeatures(scene,exclude=null){
 const points=[{expr:'point(0, 0)',name:'原点',p:[0,0]}],curves=[],r=createResolver(scene);
 const point=(expr,name)=>{try{points.push({expr,name,p:mul(r.point(r.evaluate(expr)),100)});}catch{}};
 const curve=(expr,name)=>{try{curves.push({expr,name,g:r.geometry(r.evaluate(expr))});}catch{}};
 curve('axisX','x 轴');curve('axisY','y 轴');
 for(const o of scene.objects){if(o.id===exclude||o._error||o.kind==='parameter'||!o.visible)continue;point(`pos(${o.id})`,o.label+' · 位置 / 圆心');
  if(o.points){o.points.forEach((p,i)=>point(`${o.id}.point${i}`,o.label+' · 端点 '+(i+1)));if(o.points.length===2){point(`mid(${o.id}.point0, ${o.id}.point1)`,o.label+' · 中点');curve(o.id,o.label+(o.lineType==='line'?' · 直线':' · 线段'));}}
  if(['field','electric'].includes(o.kind)&&o.shape==='annulus'){
   try{const g=r.geometry({type:'object',id:o.id});for(const [key,name] of [['radius','外圆'],...(g.innerRadius>0?[['innerRadius','内圆']]:[])]){const expr=`circle(pos(${o.id}), ${o.id}.${key})`;curve(expr,o.label+' · '+name);for(const a of [0,90,180,270])point(`on(${expr}, ${a})`,o.label+' · '+name+' '+a+'°');}}catch{}
  }
  if(o.kind==='circle'||o.shape==='circle'||o.sourceType==='circle'){curve(o.id,o.label+' · 圆');for(const a of [0,90,180,270])point(`on(${o.id}, ${a})`,o.label+' · '+a+'°');}
  if(o.kind==='polygon'||o.shape==='polygon'){for(let i=1;i<=o.points.length;i++){point(`vertex(${o.id}, ${i})`,o.label+' · 顶点 '+i);curve(`edge(${o.id}, ${i})`,o.label+' · 第 '+i+' 边');}}
  if(['semicircle','sector'].includes(o.shape)){
   for(const i of [1,2,3])point(`vertex(${o.id}, ${i})`,o.label+(i===3?' · 圆心':' · 弧端点 '+i));
   for(let i=1;i<=(o.shape==='semicircle'?1:2);i++)curve(`edge(${o.id}, ${i})`,o.label+' · 直边 '+i);
  }
  if(['field','electric'].includes(o.kind)&&['rectangle','triangle','half','strip','quadrant'].includes(o.shape)){
   const n=o.shape==='rectangle'?4:o.shape==='triangle'?3:o.shape==='half'?1:2;
   for(let i=1;i<=n;i++){curve(`edge(${o.id}, ${i})`,o.label+' · 第 '+i+' 边');if(['rectangle','triangle'].includes(o.shape)){point(`vertex(${o.id}, ${i})`,o.label+' · 顶点 '+i);point(`mid(vertex(${o.id}, ${i}), vertex(${o.id}, ${i%n+1}))`,o.label+' · 边中点 '+i);}}
  }
 }
 return {points,curves};
}
export function snapPoint(scene,p,{exclude=null,scale=100,geometry=true,grid=true,tolerance=15}={}){
 const settings=scene.snap||{step:.25},features=geometry?geometryFeatures(scene,exclude):{points:[],curves:[]},near=[];
 const offer=(candidate,priority=0)=>{const distance=norm(sub(candidate.p,p))*scale;if(distance<=tolerance)near.push({...candidate,distance,priority});};
 features.points.forEach(c=>offer(c,1));
 for(let i=0;i<features.curves.length;i++){
  const a=features.curves[i];for(const b of features.curves.slice(i+1))intersections(a.g,b.g).forEach((point,index)=>{if(point)offer({p:mul(point,100),expr:`intersect(${a.expr}, ${b.expr}, ${index+1})`,name:a.name+' ∩ '+b.name+' · '+(index+1)},0);});
  const world=mul(p,.01),g=a.g;let t,point;
  if(g.kind==='circle'){const v=sub(world,g.center);if(norm(v)<1e-14)continue;t=Math.atan2(v[1],v[0])*180/Math.PI;point=add(g.center,mul(unit(v),g.r));}
  else{t=dot(sub(world,g.a),sub(g.b,g.a))/dot(sub(g.b,g.a),sub(g.b,g.a));point=add(g.a,mul(sub(g.b,g.a),t));if(!inDomain(g,point))continue;}
  // Combine compatible constraints: snapping to an axis should not lose the
  // grid coordinate along that axis because of subpixel pointer rounding.
  if(grid){const step=settings.step||.25,q=p.map(v=>Math.round(v/step)*step*.01),onCurve=g.kind==='circle'?Math.abs(norm(sub(q,g.center))-g.r)<1e-10:Math.abs(dot(g.n,q)-g.d)<1e-10;
   if(onCurve&&inDomain(g,q)){point=q;t=g.kind==='circle'?Math.atan2(q[1]-g.center[1],q[0]-g.center[0])*180/Math.PI:dot(sub(q,g.a),sub(g.b,g.a))/dot(sub(g.b,g.a),sub(g.b,g.a));}
  }
  offer({p:mul(point,100),expr:`on(${a.expr}, ${t})`,name:a.name+' · 路径',path:{curve:a.expr,t,kind:g.kind}},2);
 }
 near.sort((a,b)=>(a.distance+a.priority*2)-(b.distance+b.priority*2));if(near[0])return near[0];
 if(grid){const step=settings.step||.25,q=p.map(v=>Math.round(v/step)*step);return {p:q,expr:`point(${q[0]}, ${q[1]})`,name:'网格',grid:true};}return {p,expr:null,name:''};
}
export function snapHeading(scene,o,p,scale=100){
 const raw=Math.atan2(p[1]-o.y,p[0]-o.x)*180/Math.PI,delta=(a,b)=>Math.abs((a-b+540)%360-180),candidates=[];
 if(scene.snap?.geometry){const features=geometryFeatures(scene,o.id);for(const target of features.points){const v=sub(target.p,[o.x,o.y]);if(norm(v)*scale<8)continue;const angle=Math.atan2(v[1],v[0])*180/Math.PI;if(delta(angle,raw)<4)candidates.push({value:angle,expr:`bearing(pos(${o.id}), ${target.expr})`,name:'指向 '+target.name});}
  for(const target of features.curves.filter(c=>c.g.kind==='line')){const g=target.g,base=Math.atan2(g.b[1]-g.a[1],g.b[0]-g.a[0])*180/Math.PI;for(const offset of [0,90,180,270])if(delta(base+offset,raw)<4)candidates.push({value:base+offset,expr:`bearing(end(${target.expr}, 1), end(${target.expr}, 2)) + ${offset}`,name:target.name+(offset%180===0?' · 平行':' · 垂直')});}}
 if(candidates.length)return candidates.sort((a,b)=>delta(a.value,raw)-delta(b.value,raw))[0];
 const step=scene.snap?.angle||0;if(scene.snap?.grid&&step)return {value:Math.round(raw/step)*step,name:step+'° 角度网格'};return {value:raw,name:''};
}
