// Unit-agnostic Euclidean kernels. The resolver supplies SI; editor caches use cm.
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],mul=(a,k)=>[a[0]*k,a[1]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],cross=(a,b)=>a[0]*b[1]-a[1]*b[0],norm=p=>Math.hypot(p[0],p[1]);
const finitePoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const scaleOf=points=>Math.max(...points.map(p=>norm(sub(p,points[0]))),1e-300);
const eps=scale=>64*Number.EPSILON*Math.max(scale,1e-300);
export const constructionSpecs={
 'point-on':{kind:'point',min:1,max:1,outputs:['position'],path:true},
 midpoint:{kind:'point',min:2,max:2,outputs:['position']},foot:{kind:'point',min:2,max:2,outputs:['position']},
 intersection:{kind:'point',min:2,max:2,outputs:['position']},center:{kind:'point',min:1,max:1,outputs:['position']},
 line:{kind:'line',min:2,max:2,outputs:['points']},segment:{kind:'line',min:2,max:2,outputs:['points']},ray:{kind:'line',min:2,max:2,outputs:['points']},
 parallel:{kind:'line',min:2,max:2,outputs:['points']},perpendicular:{kind:'line',min:2,max:2,outputs:['points']},'perp-bisector':{kind:'line',min:2,max:2,outputs:['points']},
 'circle-radius':{kind:'circle',min:1,max:1,outputs:['position']},'circle-point':{kind:'circle',min:2,max:2,outputs:['position','radius']},'circle-three':{kind:'circle',min:3,max:3,outputs:['position','radius']},
 polygon:{kind:'polygon',min:3,max:64,outputs:['points']},
 'angle-bisector':{kind:'line',min:3,max:3,outputs:['points']},
 rotate:{kind:'point',min:2,max:2,outputs:['position']},translate:{kind:'point',min:2,max:2,outputs:['position']},
 'reflect-line':{kind:'point',min:2,max:2,outputs:['position']},'reflect-point':{kind:'point',min:2,max:2,outputs:['position']},
 'regular-polygon':{kind:'polygon',min:2,max:2,outputs:['points']},
 'vertex-point':{kind:'point',min:1,max:1,outputs:['position']},'edge-line':{kind:'line',min:1,max:1,outputs:['points']},
 rectangle:{kind:'polygon',min:3,max:3,outputs:['points']},parallelogram:{kind:'polygon',min:3,max:3,outputs:['points']},tangent:{kind:'line',min:2,max:2,outputs:['points']}
};
const inputKinds={
 'point-on':['path'],midpoint:['point','point'],foot:['point','line'],intersection:['curve','curve'],center:['circle'],
 line:['point','point'],segment:['point','point'],ray:['point','point'],parallel:['line','point'],perpendicular:['line','point'],'perp-bisector':['point','point'],
 'circle-radius':['point'],'circle-point':['point','point'],'circle-three':['point','point','point'],polygon:['point'],'angle-bisector':['point','point','point'],
 rotate:['point','point'],translate:['point','vector'],'reflect-line':['point','line'],'reflect-point':['point','point'],'regular-polygon':['point','point'],
 'vertex-point':['region'],'edge-line':['region'],rectangle:['point','point','point'],parallelogram:['point','point','point'],tangent:['point','circle']
};
constructionSpecs['ratio-point']={kind:'point',min:2,max:2,outputs:['position']};inputKinds['ratio-point']=['point','point'];
constructionSpecs['polar-point']={kind:'point',min:1,max:1,outputs:['position']};inputKinds['polar-point']=['point'];
constructionSpecs['fixed-segment']={kind:'line',min:2,max:2,outputs:['points','lineType']};inputKinds['fixed-segment']=['point','point'];
constructionSpecs['fixed-angle-ray']={kind:'line',min:2,max:2,outputs:['points','lineType']};inputKinds['fixed-angle-ray']=['point','point'];
constructionSpecs['compass-circle']={kind:'circle',min:3,max:3,outputs:['position','radius']};inputKinds['compass-circle']=['point','point','point'];
constructionSpecs.dilate={kind:'point',min:2,max:2,outputs:['position']};inputKinds.dilate=['geometry','point'];
for(const type of ['rotate','translate','reflect-line','reflect-point','dilate']){
 const spec=constructionSpecs[type];spec.kinds=['point','line','circle','polygon'];spec.outputKind='input0';spec.outputsByKind={point:['position'],line:['points','lineType'],circle:['position','radius'],polygon:['points']};inputKinds[type][0]='geometry';
}
for(const [type,kinds] of Object.entries(inputKinds))constructionSpecs[type].inputKinds=kinds;
export function geometryObjectKind(o,id=o?.id){
 if(id==='axisX'||id==='axisY')return 'line';if(!o)return null;
 if(['point','line','circle','polygon'].includes(o.kind))return o.kind;if(o.kind==='ruler')return 'line';
 if(['field','electric'].includes(o.kind)&&o.shape==='circle')return 'circle';
 if(['field','electric'].includes(o.kind)&&['polygon','rectangle','triangle'].includes(o.shape))return 'polygon';return null;
}
export function matchesGeometryInput(expected,o,id=o?.id){
 const kind=geometryObjectKind(o,id);return expected==='geometry'?!!o&&['point','line','circle','polygon'].includes(o.kind):expected==='curve'?['line','circle'].includes(kind):expected==='path'?['line','circle','polygon'].includes(kind):expected==='region'?kind==='polygon':expected==='vector'?kind==='line'&&(o?.lineType==='segment'||o?.kind==='ruler'):kind===expected;
}
export function constructionOutputs(o){const spec=constructionSpecs[o.construction?.type];return spec?.outputsByKind?.[o.kind]||spec?.outputs||[];}
export function constructionOwns(o,key){
 const spec=constructionSpecs[o.construction?.type];if(!spec)return false;const outputs=constructionOutputs(o);
 if(outputs.includes('position')&&['position','x','y'].includes(key))return true;
 if(outputs.includes('points')&&(['position','x','y'].includes(key)||/^point\d+(?:[xy])?$/.test(key)))return true;
 return outputs.includes(key);
}
export function validateConstruction(o){
 if(o.construction==null)return;const c=o.construction,s=constructionSpecs[c.type];
 if(!s||!(s.kinds?s.kinds.includes(o.kind):s.kind===o.kind)||!Array.isArray(c.inputs)||c.inputs.length<s.min||c.inputs.length>s.max||c.inputs.some(id=>typeof id!=='string'||! /^(?:o\d+|axisX|axisY)$/.test(id)))throw Error('几何构造类型或输入对象不正确。');
 if(['vertex-point','edge-line'].includes(c.type)&&!Number.isFinite(o.index))throw Error('顶点或边序号须为有限数值。');
 if(c.type==='regular-polygon'&&(!Number.isFinite(o.count)||![1,-1].includes(c.orientation??1)))throw Error('正多边形边数须为3–64，方向须为±1。');
 if(c.type==='ratio-point'&&!Number.isFinite(o.factor))throw Error('分点比例须为有限数值。');
 if(c.type==='polar-point'&&(!Number.isFinite(o.length)||o.length<0||!Number.isFinite(o.angle)))throw Error('极坐标距离须非负，方向须为有限角度。');
 if(c.type==='fixed-segment'&&(!Number.isFinite(o.length)||o.length<=0))throw Error('定长线段长度须为正。');
 if(c.type==='rotate'&&!Number.isFinite(o.angle))throw Error('旋转角须为有限角度。');
 if(c.type==='fixed-angle-ray'&&!Number.isFinite(o.angle))throw Error('射线有向角须为有限角度。');
 if(['translate','dilate'].includes(c.type)&&!Number.isFinite(o.factor))throw Error('变换倍数须为有限数值。');
 if(c.type==='point-on'&&(!Number.isFinite(o.pathT)||!['','deg'].includes(c.pathUnit||'')))throw Error('路径点参数或单位不正确。');
 if(['intersection','tangent'].includes(c.type)&&(!Number.isInteger(c.branch)||c.branch<1||c.branch>2||c.group!==undefined&&(typeof c.group!=='string'||c.group.length>100)))throw Error('交点分支或构造组不正确。');
 if(c.permutation!==undefined&&(!Array.isArray(c.permutation)||c.permutation.length!==2||new Set(c.permutation).size!==2||c.permutation.some(n=>![0,1].includes(n))))throw Error('交点连续性排列不正确。');
 if(c.memory!==undefined&&(!Array.isArray(c.memory)||c.memory.length>2||c.memory.some(p=>p!==null&&!finitePoint(p))))throw Error('交点连续性坐标不正确。');
 if(Object.keys(o.defs||{}).some(key=>constructionOwns(o,key)))throw Error('同一几何输出不能同时由构造与参数定义控制。');
}
export function lineGeometry(a,b,domain='line'){
 if(!finitePoint(a)||!finitePoint(b))throw Error('直线需要两个有限位置。');const d=sub(b,a),length=norm(d);
 if(!length)throw Error('两点重合，直线方向未定义。');const n=[-d[1]/length,d[0]/length];
 return {type:'curve',kind:'line',a:[...a],b:[...b],n,d:dot(n,a),domain};
}
export function circleGeometry(center,r){if(!finitePoint(center)||!Number.isFinite(r)||r<=0)throw Error('圆心和正半径未定义。');return {type:'curve',kind:'circle',center:[...center],r};}
export function onDomain(g,p,tolerance=1e-10){
 if(g.kind!=='line'||g.domain==='line')return true;const v=sub(g.b,g.a),t=dot(sub(p,g.a),v)/dot(v,v);
 return t>=-tolerance&&(g.domain==='ray'||t<=1+tolerance);
}
export function curveIntersections(a,b,{details=false}={}){
 let points=[];
 if(a.kind==='line'&&b.kind==='line'){
  const u=sub(a.b,a.a),v=sub(b.b,b.a),d=cross(u,v);if(Math.abs(d)<=eps(norm(u)*norm(v)))return details?{points:[],defined:[]}:[];
  points=[add(a.a,mul(u,cross(sub(b.a,a.a),v)/d))];
 }else if(a.kind==='circle'&&b.kind==='circle'){
  const delta=sub(b.center,a.center),d=norm(delta),tol=eps(Math.max(d,a.r,b.r));
  if(d<=tol||d>a.r+b.r+tol||d<Math.abs(a.r-b.r)-tol)return details?{points:[],defined:[]}:[];
  const u=mul(delta,1/d),x=(a.r*a.r-b.r*b.r+d*d)/(2*d),h=Math.sqrt(Math.max(0,a.r*a.r-x*x)),foot=add(a.center,mul(u,x)),side=[-u[1],u[0]];
  points=[add(foot,mul(side,h)),add(foot,mul(side,-h))];
 }else{
  const c=a.kind==='circle'?a:b,l=a.kind==='line'?a:b;if(c.kind!=='circle'||l.kind!=='line')throw Error('当前交点工具支持直线、射线、线段与圆。');
  // Relative coordinates avoid cancellation far from the origin.
  const distance=-dot(l.n,sub(c.center,l.a)),tol=eps(Math.max(c.r,Math.abs(distance)));
  if(Math.abs(distance)>c.r+tol)return details?{points:[],defined:[]}:[];const foot=add(c.center,mul(l.n,distance)),h=Math.sqrt(Math.max(0,c.r*c.r-distance*distance)),side=[-l.n[1],l.n[0]];
  points=[add(foot,mul(side,h)),add(foot,mul(side,-h))].sort((p,q)=>dot(sub(p,q),sub(l.b,l.a)));
 }
 // Two slots remain at tangency. A domain exclusion is undefined, not deletion.
 const defined=points.map(p=>onDomain(a,p)&&onDomain(b,p));return details?{points,defined}:points.map((p,i)=>defined[i]?p:null);
}
export function circumcircle(a,b,c){
 const u=sub(b,a),v=sub(c,a),d=2*cross(u,v);if(Math.abs(d)<=eps(norm(u)*norm(v)))throw Error('三点共线，过三点的圆未定义。');
 const U=dot(u,u),V=dot(v,v),center=add(a,[(U*v[1]-V*u[1])/d,(u[0]*V-v[0]*U)/d]);return circleGeometry(center,norm(sub(center,a)));
}
export function distanceToEdge(p,a,b){const v=sub(b,a),d=dot(v,v),t=d?Math.max(0,Math.min(1,dot(sub(p,a),v)/d)):0;return norm(sub(p,add(a,mul(v,t))));}
function crossingSegments(a,b,c,d,tol){
 const u=sub(b,a),v=sub(d,c),delta=sub(c,a),det=cross(u,v);
 if(Math.abs(det)>eps(norm(u)*norm(v))){const t=cross(delta,v)/det,s=cross(delta,u)/det;return t>=-tol&&t<=1+tol&&s>=-tol&&s<=1+tol;}
 if(Math.abs(cross(delta,u))>eps(norm(delta)*norm(u)))return false;
 const denominator=dot(u,u),s=dot(delta,u)/denominator,t=dot(sub(d,a),u)/denominator;return Math.max(Math.min(s,t),0)<=Math.min(Math.max(s,t),1)+tol;
}
export function polygonGeometry(input){
 if(!Array.isArray(input)||input.length<3||input.length>64||input.some(p=>!finitePoint(p)))throw Error('多边形需要 3–64 个有限顶点。');
 const points=input.map(p=>[...p]),scale=scaleOf(points),tol=eps(scale);
 if(norm(sub(points[0],points.at(-1)))<=tol)points.pop();if(points.length<3)throw Error('多边形顶点不足。');
 for(let i=0;i<points.length;i++)if(norm(sub(points[i],points[(i+1)%points.length]))<=tol)throw Error('多边形相邻顶点重合，区域未定义。');
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
  if(j===i+1||i===0&&j===points.length-1)continue;
  if(crossingSegments(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length],1e-12))throw Error('多边形自交，场区域未定义。');
 }
 // Translate to a vertex before computing area/centroid for numerical stability.
 const origin=points[0],local=points.map(p=>sub(p,origin));let twiceArea=0,centroid=[0,0],perimeter=0;
 for(let i=0;i<local.length;i++){const a=local[i],b=local[(i+1)%local.length],weight=cross(a,b);twiceArea+=weight;centroid=add(centroid,mul(add(a,b),weight));perimeter+=norm(sub(b,a));}
 if(Math.abs(twiceArea)<=eps(scale*scale))throw Error('多边形面积为零，场区域未定义。');
 const orientation=Math.sign(twiceArea),center=add(origin,mul(centroid,1/(3*twiceArea)));
 const edges=points.map((a,i)=>{const b=points[(i+1)%points.length],v=sub(b,a),length=norm(v),n=mul([v[1]/length,-v[0]/length],orientation);return {kind:'line',a,b,n,d:dot(n,a),length,index:i};});
 return {type:'region',kind:'polygon',points,vertices:points,center,edges,area:Math.abs(twiceArea)/2,signedArea:twiceArea/2,perimeter,scale};
}
export function polygonContains(g,p,margin=0){
 let winding=false,minDistance=Infinity;
 for(const edge of g.edges){minDistance=Math.min(minDistance,distanceToEdge(p,edge.a,edge.b));const a=sub(edge.a,p),b=sub(edge.b,p);if((a[1]>0)!==(b[1]>0)&&a[0]+(b[0]-a[0])*(-a[1])/(b[1]-a[1])>0)winding=!winding;}
 const tolerance=eps(g.scale);if(minDistance<=tolerance)return margin<=0;
 return winding&&(margin<=0||minDistance>=margin-tolerance);
}
export function polygonInsideLimit(g,p,limit){
 const v=limit.v,acc=limit.acc||[0,0],jerk=limit.jerk||[0,0],vSize=norm(v),aSize=norm(acc),jSize=norm(jerk),gap=Math.max(eps(g.scale)*4,vSize*limit.tol*4);
 const near=g.edges.filter(e=>distanceToEdge(p,e.a,e.b)<=gap);
 if(!near.length)return polygonContains(g,p);
 function sense(edge){const rate=dot(edge.n,v),curvature=dot(edge.n,acc),third=dot(edge.n,jerk);
  if(Math.abs(rate)>Math.sqrt(2*gap*Math.abs(curvature))+vSize*1e-12)return Math.sign(rate);
  if(Math.abs(curvature)>aSize*1e-12)return Math.sign(curvature);
  if(Math.abs(third)>jSize*1e-12)return Math.sign(third);return 0;
 }
 // At a smooth edge, infinitesimal curvature decides grazing. Sampling with a
 // velocity-sized step can round the quadratic normal displacement to zero.
 if(near.length===1){const sign=sense(near[0]);return sign?sign<0:polygonContains(g,p);}
 // At a concave vertex, test the local outgoing cone of the whole polygon,
 // rather than intersecting supporting half-planes (which is only convex).
 if(!vSize&&!aSize&&!jSize)return polygonContains(g,p);
 const separation=Math.min(...g.edges.filter(e=>!near.includes(e)).map(e=>distanceToEdge(p,e.a,e.b)),Infinity),target=Math.min(Math.max(eps(g.scale)*16,g.scale*1e-10),separation/16);
 let step=vSize?target/vSize:aSize?Math.sqrt(2*target/aSize):Math.cbrt(6*target/jSize);
 for(const edge of near){const rate=dot(edge.n,v),curvature=dot(edge.n,acc),third=dot(edge.n,jerk);
  if(Math.abs(rate)<=vSize*1e-12&&Math.abs(curvature)>aSize*1e-12)step=Math.max(step,Math.sqrt(2*target/Math.abs(curvature)));
  else if(Math.abs(rate)<=vSize*1e-12&&Math.abs(curvature)<=aSize*1e-12&&Math.abs(third)>jSize*1e-12)step=Math.max(step,Math.cbrt(6*target/Math.abs(third)));
 }
 if(Number.isFinite(separation)&&vSize)step=Math.min(step,separation/(16*vSize));
 const delta=add(mul(v,step),add(mul(acc,step*step/2),mul(jerk,step*step*step/6)));
 return polygonContains(g,add(p,delta));
}
export function curvePoint(g,t){
 if(g.kind==='annulus')throw Error('环域不是单条路径，请明确选择内圆或外圆。');
 if(!Number.isFinite(t))throw Error('路径参数须为有限数值。');
 if(g.kind==='circle'){const a=t*Math.PI/180;return add(g.center,mul([Math.cos(a),Math.sin(a)],g.r));}
 if(g.kind==='polygon'){const wrapped=((t%g.points.length)+g.points.length)%g.points.length,i=Math.floor(wrapped);return add(g.points[i],mul(sub(g.points[(i+1)%g.points.length],g.points[i]),wrapped-i));}
 const p=add(g.a,mul(sub(g.b,g.a),t));if(!onDomain(g,p))throw Error('路径参数超出线段或射线范围。');return p;
}
export function curveParameter(g,p,previous=0){
 if(g.kind==='annulus')throw Error('环域不是单条路径，请明确选择内圆或外圆。');
 if(g.kind==='circle'){let angle=Math.atan2(p[1]-g.center[1],p[0]-g.center[0])*180/Math.PI;return angle+360*Math.round((previous-angle)/360);}
 if(g.kind==='polygon'){
  const candidates=g.edges.map(e=>{const v=sub(e.b,e.a),t=Math.max(0,Math.min(1,dot(sub(p,e.a),v)/dot(v,v))),point=add(e.a,mul(v,t));return {t:e.index+t,distance:norm(sub(point,p))};});
  candidates.sort((a,b)=>a.distance-b.distance||Math.abs(a.t-previous)-Math.abs(b.t-previous));return candidates[0].t;
 }
 const v=sub(g.b,g.a),t=dot(sub(p,g.a),v)/dot(v,v);return g.domain==='segment'?Math.max(0,Math.min(1,t)):g.domain==='ray'?Math.max(0,t):t;
}
export function continuousPair(candidates,anchors,permutation=[0,1]){
 const points=[candidates[0]||null,candidates[1]||null],distance=(a,b)=>a&&b?dot(sub(a,b),sub(a,b)):0;
 const direct=distance(points[0],anchors?.[0])+distance(points[1],anchors?.[1]),swapped=distance(points[1],anchors?.[0])+distance(points[0],anchors?.[1]);
 const scale=Math.max(direct,swapped,1e-300),order=direct+eps(scale)<swapped?[0,1]:swapped+eps(scale)<direct?[1,0]:permutation;
 return {points:order.map(i=>points[i]),permutation:order};
}

export function tangentContacts(P,C){
 const v=sub(P,C.center),d=norm(v),tol=eps(Math.max(d,C.r));if(d<C.r-tol)return [];
 if(Math.abs(d-C.r)<=tol)return [[...P],[...P]];
 const q=C.r*C.r/(d*d),h=C.r*Math.sqrt(Math.max(0,d*d-C.r*C.r))/(d*d),base=add(C.center,mul(v,q)),side=[-v[1],v[0]];
 return [add(base,mul(side,h)),add(base,mul(side,-h))];
}
