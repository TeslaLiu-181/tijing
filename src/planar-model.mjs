import {add,E,U,TAU} from './planar-physics.mjs';
import {teachingDefaults} from './planar-teaching.mjs';
import {validateConstruction} from './planar-geometry.mjs';
import {validateObjectStyle} from './planar-object-style.mjs';
import {validateParameterSlider} from './planar-parameter-slider.mjs';
export const fieldNames={infinite:'无限磁场',circle:'圆形磁场',annulus:'环形磁场',semicircle:'半圆形磁场',sector:'扇形磁场',rectangle:'矩形磁场',triangle:'三角形磁场',half:'半平面',strip:'条形磁场',quadrant:'第一象限',polygon:'多边形场域'};
export const waveNames={dc:'恒定电场',sine:'正弦交变',square:'方波交变'};
export const sourceNames={point:'点粒子源',line:'线粒子源',circle:'圆形区域源',rectangle:'矩形区域源'};
export const kinds={particle:'粒子',source:'粒子源',field:'磁场',electric:'电场',ruler:'直尺',angle:'量角器',label:'标注',point:'辅助点',line:'辅助线',circle:'辅助圆',polygon:'多边形',parameter:'自由参数'};
export const isField=o=>['field','electric'].includes(o?.kind);
export function createObject(kind,id,p=[0,0],type){
 const base={id,kind,label:(kind==='particle'?'P':kind==='source'?'S':kind==='field'?'B':'A')+'_'+id.replace(/\D/g,''),x:p[0],y:p[1],enabled:true,visible:true,labelVisible:true};
 if(kind==='particle'||kind==='source')Object.assign(base,{mass:1.0072764666,charge:1,speed:1.5,heading:0});
 if(kind==='source')Object.assign(base,{sourceType:type||'point',count:7,spread:30,speedSpan:0,interval:0,length:2,radius:1,width:2,height:1,angle:0});
 if(['point','line','circle','polygon'].includes(kind))Object.assign(base,{construction:null,angle:90,factor:1});
 if(kind==='field')Object.assign(base,{shape:type||'circle',regionSource:'',B:-100,waveform:'dc',period:.65,phase:0,radius:2,width:3,height:2.5,angle:0,sectorAngle:90});
 if(kind==='electric')Object.assign(base,{shape:type||'rectangle',regionSource:'',E0:10,fieldAngle:90,radius:2,width:3,height:2.5,angle:0,sectorAngle:90,waveform:'dc',period:.65,phase:90,label:'E_'+id.slice(1)});
 if(['field','electric'].includes(kind)&&type==='annulus')base.innerRadius=1;
 if(kind==='ruler')base.points=[p,add(p,[2,0])];
 if(kind==='angle')base.points=[add(p,[2,0]),p,add(p,[1,1.73])];
 if(kind==='line')Object.assign(base,{points:[p,add(p,[2,0])],lineType:type||'line',index:1,length:2,label:'l_'+id.slice(1)});
 if(kind==='circle')Object.assign(base,{radius:1.5,label:'c_'+id.slice(1)});
 if(kind==='polygon'||['field','electric'].includes(kind)&&type==='polygon')base.points=[p,add(p,[2,0]),add(p,[1,1.5])];
 if(kind==='polygon')Object.assign(base,{label:'P_'+id.slice(1),count:5,area:1.5,perimeter:2+2*Math.hypot(1,1.5)});
 if(kind==='point')Object.assign(base,{label:'A_'+id.slice(1),index:1,angle:90,factor:1,length:1});
 if(kind==='parameter')Object.assign(base,{value:1,unit:'',label:'a_'+id.slice(1)});
 base.defs={};
 if(kind==='label')Object.assign(base,{label:'A',fontSize:20,labelWidth:320,labelHeight:100});return base;
}
export const snapDefaults={grid:true,geometry:true,lock:false,step:.5,angle:15};
export const trailDefaults={enabled:false,auto:true,duration:.65};
export function prepareScene(scene){
 if(![1,2,3,4,5].includes(scene?.version))throw Error('不支持的场景版本。');
 if(scene.version<3){scene.display={electricForce:false,magneticForce:!!scene.display.force,...scene.display,force:false};}
 scene.snap={...snapDefaults,grid:scene.display?.grid??true,...scene.snap};scene.trail={...trailDefaults,...scene.trail};scene.version=4;scene.teaching={...teachingDefaults,...scene.teaching};
 for(const o of scene.objects){o.defs??={};if(o.kind==='label'){o.fontSize??=20;o.labelWidth??=320;o.labelHeight??=100;}o.labelVisible??=true;if(['point','line','circle','polygon'].includes(o.kind)){o.construction??=null;if(o.construction?.type==='rotate')o.angle??=90;if(o.construction?.type==='polar-point'){o.length??=1;o.angle??=0;}if(o.construction?.type==='fixed-segment'){o.length??=2;o.lineType='segment';}if(o.construction?.type==='ratio-point')o.factor??=.5;if(['translate','dilate'].includes(o.construction?.type))o.factor??=1;}if(isField(o))o.regionSource??='';if(o.kind==='line')o.lineType??='line';if(isField(o))o.sectorAngle??=90;if(o.kind==='field'){o.waveform??='dc';o.period??=.65;o.phase??=0;}if(o.kind==='electric'){o.waveform??='dc';o.period??=.65;o.phase??=90;}}return scene;
}
export function emptyScene(){return {version:4,nextId:1,duration:.8,objects:[],teaching:{...teachingDefaults},snap:{...snapDefaults},trail:{...trailDefaults},display:{axes:true,grid:true,marks:true,labels:true,velocity:true,force:false,electricForce:false,magneticForce:false,tracks:true,ink:true},aids:{center:true,radius:false,circle:false,chord:false,arc:false,tangent:false,angles:false,start:0,end:1}};}
export function example(name='circle'){
 const s=emptyScene(),field=(shape,x,y,extra={})=>s.objects.push(Object.assign(createObject('field','o'+s.nextId++,[x,y],shape),extra)),particle=(x,y,extra={})=>s.objects.push(Object.assign(createObject('particle','o'+s.nextId++,[x,y]),extra));
 if(name==='empty')return s;
 if(name==='cyclotron'){
  const gap=.06,R=4,B=-180;
  field('semicircle',0,gap/2,{radius:R,B,label:'D_1',angle:0});
  field('semicircle',0,-gap/2,{radius:R,B,label:'D_2',angle:180,defs:{radius:'o1.radius',B:'o1.B',x:'o1.x',y:'-o1.y'}});
  s.objects.push(Object.assign(createObject('electric','o'+s.nextId++,[0,0],'rectangle'),{width:2*R,height:gap,E0:180,fieldAngle:90,waveform:'sine',phase:90,period:TAU*1.0072764666*U/(E*Math.abs(B)*.001)*1e6,label:'E',defs:{width:'2 * o1.radius',height:'2 * o1.y',x:'o1.x',period:'2 * pi * o4.mass / abs(o4.charge * o1.B)'}}));
  particle(0,0,{speed:.1,heading:90,label:'P'});
  const T=TAU*1.0072764666*U/(E*Math.abs(B)*.001)*1e6;s.duration=8*T;
  s.display.tracks=false;s.display.ink=false;s.display.axes=false;s.display.grid=false;s.display.electricForce=true;s.trail.enabled=true;s.aids.center=false;return s;
 }
 if(name==='electric-deflection'){
  s.objects.push(Object.assign(createObject('electric','o'+s.nextId++,[0,0],'rectangle'),{width:4,height:4,E0:8,fieldAngle:90}));
  particle(-3,0,{speed:2,charge:1});s.duration=.36;Object.assign(s.display,{electricForce:true,force:true});Object.assign(s.aids,{chord:true,arc:true});return s;
 }
 if(name==='velocity-selector'){
  field('rectangle',0,0,{width:5,height:5,B:100});
  s.objects.push(Object.assign(createObject('electric','o'+s.nextId++,[0,0],'rectangle'),{width:5,height:5,E0:15,fieldAngle:90}));
  s.objects.push(Object.assign(createObject('source','o'+s.nextId++,[-3.5,0],'point'),{count:3,spread:0,speed:1.5,speedSpan:.6,label:'S'}));
  s.duration=.5;Object.assign(s.display,{electricForce:true,magneticForce:true,force:true,ink:false});return s;
 }
 if(name==='crossed-drift'){
  field('infinite',0,0,{B:80});s.objects.push(Object.assign(createObject('electric','o'+s.nextId++,[0,0],'infinite'),{E0:10,fieldAngle:90}));
  particle(0,0,{speed:0});s.duration=1.6;Object.assign(s.display,{electricForce:true,magneticForce:true,force:true});s.aids.arc=true;return s;
 }
 if(name==='field-cancellation'){
  field('rectangle',0,0,{width:4,height:4,B:80});field('rectangle',1.5,0,{width:4,height:4,B:-80});
  s.objects.push(Object.assign(createObject('electric','o'+s.nextId++,[.75,0],'rectangle'),{width:2.5,height:4,E0:5,fieldAngle:90}));
  particle(-2.5,0,{speed:2.5});s.duration=.36;s.display.force=true;return s;
 }
 if(name==='dependency-circle'){
  field('circle',0,0,{radius:2,B:-70});
  s.objects.push(Object.assign(createObject('line','o'+s.nextId++,[-3,.6]),{points:[[-3,.6],[3,.6]],label:'l'}));
  particle(-2,0,{label:'P',defs:{position:'intersect(o1, o2, 1)',heading:'bearing(pos(o3), pos(o1))',speed:'orbitSpeed(o3.mass, o3.charge, o1.B, o1.radius)'}});
  s.duration=.35;Object.assign(s.aids,{radius:true,circle:true,chord:true});return s;
 }
 if(name==='dependency-triangle'){
  s.objects.push(Object.assign(createObject('parameter','o'+s.nextId++),{value:2,unit:'cm',label:'a'}));
  field('triangle',0,0,{B:-60,label:'B',defs:{width:'sqrt(2) * o1.value',height:'o1.value'}});
  particle(-2,0,{label:'P',defs:{position:'mid(vertex(o2, 1), vertex(o2, 3))',heading:'bearing(pos(o3), vertex(o2, 2))'}});
  s.duration=.4;return s;
 }
 if(name==='geometry-l-region'){
  const parameter=createObject('parameter','o'+s.nextId++);parameter.value=1;parameter.unit='cm';parameter.label='d';s.objects.push(parameter);
  const coordinates=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]],ids=[];
  for(let i=0;i<coordinates.length;i++){const p=createObject('point','o'+s.nextId++,coordinates[i]);p.label='ABCDEF'[i];if(i===3||i===4)p.defs.x=parameter.id+'.value';s.objects.push(p);ids.push(p.id);}
  const polygon=createObject('polygon','o'+s.nextId++);polygon.points=coordinates.map(p=>[...p]);polygon.construction={type:'polygon',inputs:ids};polygon.label='凹区域';s.objects.push(polygon);
  const electric=createObject('electric','o'+s.nextId++,[1,1],'polygon');electric.points=coordinates.map(p=>[...p]);electric.regionSource=polygon.id;electric.E0=1;electric.fieldAngle=0;s.objects.push(electric);
  particle(-1,2,{speed:1,label:'P'});s.duration=.5;s.display.electricForce=true;s.display.force=true;s.aids.center=false;return s;
 }
 if(name==='geometry-intersections'){
  const h=createObject('parameter','o'+s.nextId++);h.value=1;h.unit='cm';h.label='h';s.objects.push(h);
  const O=createObject('point','o'+s.nextId++,[0,0]);O.label='O';s.objects.push(O);
  const A=createObject('point','o'+s.nextId++,[-3,1]),B=createObject('point','o'+s.nextId++,[3,1]);A.label='A';B.label='B';A.defs.y=h.id+'.value';B.defs.y=h.id+'.value';s.objects.push(A,B);
  const c=createObject('circle','o'+s.nextId++);c.radius=2;c.construction={type:'circle-radius',inputs:[O.id]};s.objects.push(c);
  const l=createObject('line','o'+s.nextId++);l.points=[[-3,1],[3,1]];l.construction={type:'line',inputs:[A.id,B.id]};s.objects.push(l);
  const I=createObject('point','o'+s.nextId++,[-Math.sqrt(3),1]),J=createObject('point','o'+s.nextId++,[Math.sqrt(3),1]);I.label='I_1';J.label='I_2';I.construction={type:'intersection',inputs:[l.id,c.id],group:'g1',branch:1};J.construction={type:'intersection',inputs:[l.id,c.id],group:'g1',branch:2};s.objects.push(I,J);
  const polygon=createObject('polygon','o'+s.nextId++);polygon.points=[[0,0],[-Math.sqrt(3),1],[Math.sqrt(3),1]];polygon.construction={type:'polygon',inputs:[O.id,I.id,J.id]};polygon.label='交点区域';s.objects.push(polygon);
  const magnetic=createObject('field','o'+s.nextId++,[0,.5],'polygon');magnetic.points=polygon.points.map(p=>[...p]);magnetic.regionSource=polygon.id;magnetic.B=-100;s.objects.push(magnetic);
  particle(0,0,{speed:1,heading:60,label:'P'});s.duration=.3;s.display.magneticForce=true;s.aids.center=false;return s;
 }
 if(name==='annular-electric'){
  const R=createObject('parameter','o1');Object.assign(R,{label:'R',unit:'cm',value:2,slider:{min:2,max:3,step:.2}});
  const r=createObject('parameter','o2');Object.assign(r,{label:'r',unit:'cm',value:1,slider:{min:0,max:1.8,step:.2}});
  const O=createObject('point','o3');O.label='O';O.labelOffset={x:-13,y:18};s.objects.push(R,r,O);
  const electric=createObject('electric','o4',[0,0],'annulus');Object.assign(electric,{label:'E',radius:2,innerRadius:1,E0:2,fieldAngle:0,defs:{radius:'o1.value',innerRadius:'o2.value',position:'pos(o3)'},style:{color:'#bb873d',strokeWidth:1.6},labelOffset:{x:0,y:-30}});s.objects.push(electric);
  const P=createObject('particle','o5',[-3,0]);Object.assign(P,{label:'P',mass:1,charge:1,speed:1,heading:0,style:{color:'#3c79a1',strokeWidth:2,pointSize:4.2}});s.objects.push(P);
  const note=createObject('label','o6',[-2.5,2.8]);Object.assign(note,{label:'\\text{演示赋值：}m=1\\,u,\\quad q=+e',fontSize:15,labelWidth:390,labelHeight:50,style:{color:'#587082'}});s.objects.push(note);
  s.nextId=7;s.duration=.6;Object.assign(s.display,{ink:false,electricForce:true});s.aids.center=false;return s;
 }
 if(name==='geometry-regular-field'){
  const n=createObject('parameter','o1');Object.assign(n,{label:'n',value:6,slider:{min:3,max:12,step:1}});
  const R=createObject('parameter','o2');Object.assign(R,{label:'R',unit:'cm',value:2,slider:{min:.5,max:3,step:.1}});s.objects.push(n,R);
  const O=createObject('point','o3');O.label='O';O.labelOffset={x:-12,y:16};
  const A=createObject('point','o4',[2,0]);Object.assign(A,{label:'A',length:2,angle:0,construction:{type:'polar-point',inputs:['o3']},defs:{length:'o2.value'},labelOffset:{x:12,y:8}});
  const B=createObject('point','o5',[1,Math.sqrt(3)]);Object.assign(B,{label:'B',length:2,angle:60,construction:{type:'polar-point',inputs:['o3']},defs:{length:'o2.value',angle:'360 deg / o1.value'},labelOffset:{x:10,y:-10}});s.objects.push(O,A,B);
  // Adjacent vertices lie on the same R-circle, so changing n keeps the
  // circumradius fixed instead of holding an old side length fixed.
  const polygon=createObject('polygon','o6');Object.assign(polygon,{label:'\\mathcal P_n',count:6,construction:{type:'regular-polygon',inputs:['o4','o5'],orientation:1},defs:{count:'o1.value'},style:{color:'#3f8d85',strokeWidth:1.8},labelOffset:{x:0,y:-42}});s.objects.push(polygon);
  const electric=createObject('electric','o7',[0,0],'polygon');Object.assign(electric,{label:'E',E0:1,fieldAngle:0,regionSource:'o6',style:{color:'#ca8b37',strokeWidth:1.3},labelOffset:{x:0,y:22}});s.objects.push(electric);
  const P=createObject('particle','o8',[-3,.5]);Object.assign(P,{label:'P',mass:1,charge:1,speed:1,heading:0,style:{color:'#3276af',strokeWidth:2.1,pointSize:4.3}});s.objects.push(P);
  const area=createObject('parameter','o9');Object.assign(area,{label:'S',unit:'cm2',value:6*Math.sqrt(3),defs:{value:'area(o6)'}});
  const perimeter=createObject('parameter','o10');Object.assign(perimeter,{label:'\\ell',unit:'cm',value:12,defs:{value:'perimeter(o6)'}});s.objects.push(area,perimeter);
  const note=createObject('label','o11',[-2.8,2.8]);Object.assign(note,{label:'\\text{演示赋值：}m=1\\,u,\\quad q=+e',fontSize:15,labelWidth:390,labelHeight:50,style:{color:'#587082'}});s.objects.push(note);
  s.nextId=12;s.duration=.8;Object.assign(s.display,{ink:false,electricForce:true});s.aids.center=false;return s;
 }
 if(name==='geometry-wedge-field'){
  const L=createObject('parameter','o1');Object.assign(L,{label:'L',unit:'cm',value:3,slider:{min:3,max:5,step:.25}});
  const alpha=createObject('parameter','o2');Object.assign(alpha,{label:'\\alpha',unit:'deg',value:60,slider:{min:30,max:120,step:5}});
  const r=createObject('parameter','o3');Object.assign(r,{label:'r',unit:'cm',value:1.2,slider:{min:.5,max:1.5,step:.1}});s.objects.push(L,alpha,r);
  const O=createObject('point','o4');O.label='O';O.labelOffset={x:-12,y:17};
  const A=createObject('point','o5',[3*Math.sqrt(3)/2,-1.5]);Object.assign(A,{label:'A',length:3,angle:-30,construction:{type:'polar-point',inputs:['o4']},defs:{length:'o1.value',angle:'-o2.value / 2'},labelOffset:{x:10,y:12}});
  const B=createObject('point','o6',[3*Math.sqrt(3)/2,1.5]);Object.assign(B,{label:'B',length:3,angle:30,construction:{type:'polar-point',inputs:['o4']},defs:{length:'o1.value',angle:'o2.value / 2'},labelOffset:{x:10,y:-12}});s.objects.push(O,A,B);
  const triangle=createObject('polygon','o7');Object.assign(triangle,{label:'\\triangle OAB',construction:{type:'polygon',inputs:['o4','o5','o6']},style:{color:'#7b65ad',strokeWidth:1.8},labelOffset:{x:0,y:-42}});s.objects.push(triangle);
  const magnetic=createObject('field','o8',[0,0],'polygon');Object.assign(magnetic,{label:'B_z',B:80,regionSource:'o7',style:{color:'#6584b7',strokeWidth:1.3},labelOffset:{x:0,y:24}});s.objects.push(magnetic);
  const P=createObject('particle','o9',[-1,0]);Object.assign(P,{label:'P',mass:1,charge:1,speed:E*.080*.012/U/1e5,heading:0,defs:{speed:'orbitSpeed(o9.mass, o9.charge, o8.B, o3.value)'},style:{color:'#c37335',strokeWidth:2.2,pointSize:4.3}});s.objects.push(P);
  const note=createObject('label','o10',[-1,2.8]);Object.assign(note,{label:'\\begin{gathered}\\text{演示赋值：}m=1\\,u,\\ q=+e\\\\L>2r\\sin(\\alpha/2)\\end{gathered}',fontSize:15,labelWidth:380,labelHeight:85,style:{color:'#587082'}});s.objects.push(note);
  // In these slider ranges the orbit meets OA before the far edge, turning
  // clockwise by alpha for q>0, B>0. Values typed outside remain un-clipped.
  s.nextId=11;s.duration=.8;Object.assign(s.display,{ink:false,magneticForce:true});s.aids.center=false;return s;
 }
 if(name==='geometry-transform-fields'){
  const alpha=createObject('parameter','o1');Object.assign(alpha,{label:'\\alpha',unit:'deg',value:0});s.objects.push(alpha);
  const points=[[0,0],[-1,-.5],[1,-.5],[1,.5],[-1,.5]].map((p,i)=>createObject('point','o'+(i+2),p));points[0].label='O';s.objects.push(...points);
  const region=createObject('polygon','o7');region.label='A';region.construction={type:'polygon',inputs:['o3','o4','o5','o6']};s.objects.push(region);
  const rotated=createObject('polygon','o8');rotated.label='A′';rotated.angle=0;rotated.construction={type:'rotate',inputs:['o7','o2']};rotated.defs.angle='o1.value';s.objects.push(rotated);
  const electric=createObject('electric','o9',[0,0],'polygon');Object.assign(electric,{E0:.5,fieldAngle:0,regionSource:'o8'});s.objects.push(electric);
  const p=createObject('particle','o10',[-3,0]);Object.assign(p,{speed:1,heading:0,label:'P'});s.objects.push(p);s.nextId=11;s.duration=.7;s.display.electricForce=true;s.display.force=true;s.aids.center=false;return s;
 }
 if(name==='circle'){field('circle',0,0);particle(2,0,{heading:180,charge:-1,speed:2,label:'A'});s.duration=.22;Object.assign(s.aids,{radius:true,chord:true});}
 if(name==='rectangle'){field('rectangle',0,0,{width:2.5,height:3,B:80});particle(-2.5,.6,{speed:1.5});s.duration=.6;}
 if(name==='source'){field('rectangle',1,0,{width:3,height:5,B:-65});s.objects.push(Object.assign(createObject('source','o'+s.nextId++,[-2.2,0],'point'),{count:7,spread:50,charge:-1,speed:2}));s.duration=.42;}
 if(name==='double'){field('rectangle',-1.5,0,{width:3,height:5,B:90});field('rectangle',1.5,0,{width:3,height:5,B:140});particle(-1.8,0,{heading:25,speed:2});s.duration=.7;}
 if(name==='quadrant'){field('quadrant',0,0,{B:-100});particle(.738197,0,{heading:45,speed:1});s.duration=.45;}
 return s;
}
export function validate(scene){
 if(scene?.version!==4||!Array.isArray(scene.objects)||!Number.isFinite(scene.duration)||scene.duration<=0)throw new Error('场景格式或观察时长不正确');
 if(!scene.trail||typeof scene.trail.enabled!=='boolean'||typeof scene.trail.auto!=='boolean'||!Number.isFinite(scene.trail.duration)||scene.trail.duration<=0)throw Error('拖尾时长须为正数。');
 if(scene.snap&&(!Number.isFinite(scene.snap.step)||scene.snap.step<=0||!Number.isFinite(scene.snap.angle)||scene.snap.angle<0||scene.snap.angle>180))throw Error('网格间距须为正，方向步长为 0–180°。');
 if(scene.teaching&&(!['xy','field'].includes(scene.teaching.frame)||Object.keys(teachingDefaults).filter(k=>k!=='frame').some(k=>typeof scene.teaching[k]!=='boolean')))throw Error('教学辅助设置不正确。');
 const defaults=emptyScene();if(Object.keys(defaults.display).some(k=>typeof scene.display?.[k]!=='boolean')||Object.keys(defaults.aids).filter(k=>!['start','end'].includes(k)).some(k=>typeof scene.aids?.[k]!=='boolean')||!Number.isFinite(scene.aids?.start)||!Number.isFinite(scene.aids?.end)||scene.aids.start<0||scene.aids.end>1||scene.aids.start>=scene.aids.end)throw new Error('显示或几何辅助设置不正确');
 const ids=new Set();for(const o of scene.objects){
  if(!kinds[o.kind]||!/^o\d+$/.test(o.id)||ids.has(o.id))throw new Error('场景对象类型或编号不正确');ids.add(o.id);
  if(typeof o.enabled!=='boolean'||typeof o.visible!=='boolean'||o.labelVisible!==undefined&&typeof o.labelVisible!=='boolean')throw new Error('对象的启用和显示状态不正确');
  for(const key of ['x','y'])if(!Number.isFinite(o[key]))throw new Error('位置必须是有效数值');
  if(typeof o.label!=='string'||o.label.length>(o.kind==='label'?4000:60))throw new Error('标注文字过长或格式不正确');
  if(o.labelOffset!==undefined&&(!o.labelOffset||typeof o.labelOffset!=='object'||Array.isArray(o.labelOffset)||!['x','y'].every(key=>Number.isFinite(o.labelOffset[key])&&Math.abs(o.labelOffset[key])<=2000)||Object.keys(o.labelOffset).some(key=>!['x','y'].includes(key))))throw Error('标注偏移须为有限的x/y像素值，且各在±2000px内。');
  if(o.kind==='label'&&(['fontSize','labelWidth','labelHeight'].some(key=>o[key]!==undefined&&!Number.isFinite(o[key]))||o.fontSize!==undefined&&(o.fontSize<10||o.fontSize>72)||o.labelWidth!==undefined&&(o.labelWidth<80||o.labelWidth>1200)||o.labelHeight!==undefined&&(o.labelHeight<40||o.labelHeight>600)))throw Error('公式标注字号须为10–72px，标注框须为80–1200 × 40–600px。');
  if(isField(o)&&!fieldNames[o.shape]||o.kind==='source'&&!sourceNames[o.sourceType])throw new Error('未知区域类型');
  if(o.defs&&(typeof o.defs!=='object'||Array.isArray(o.defs)||Object.values(o.defs).some(v=>typeof v!=='string')))throw Error('依赖定义须为数学表达式。');
  if(o.kind==='parameter'&&(!Number.isFinite(o.value)||!['','cm','m','cm2','m2','u','kg','e','C','mT','T','speed','m/s','deg','rad','us','s','V','kV','N','J','eV','V/m','kV/m','N/C'].includes(o.unit)))throw Error('自由参数的数值或单位不正确。');
  if(o.slider!==undefined){if(o.kind!=='parameter')throw Error('仅自由参数可配置滑杆。');validateParameterSlider(o.slider);}
  validateObjectStyle(o,o.style);
  validateConstruction(o);
  if(o.kind==='polygon'&&['area','perimeter'].some(key=>Object.hasOwn(o.defs||{},key)))throw Error('多边形面积与周长是只读派生量。');
  if(isField(o)&&o.regionSource!==undefined&&(typeof o.regionSource!=='string'||o.regionSource!==''&&!/^o\d+$/.test(o.regionSource)))throw Error('场区域引用须为稳定对象编号。');
  if(isField(o)&&o.shape==='annulus'&&(!Number.isFinite(o.innerRadius)||o.innerRadius<0))throw Error('环形场内半径须为有限非负数。');
  if(isField(o)&&o.shape==='annulus'&&o.regionSource)throw Error('环形场不能用单一圆或多边形区域绑定，请持续定义内外半径。');
  if(isField(o)&&o.regionSource&&Object.keys(o.defs||{}).some(k=>['position','x','y','radius','width','height'].includes(k)||/^point\d+(?:[xy])?$/.test(k)))throw Error('绑定区域的几何参数不能另外定义，请修改区域源。');
  if((o.kind==='polygon'||isField(o)&&o.shape==='polygon')&&(!Array.isArray(o.points)||o.points.length<3||o.points.length>64||o.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)))))throw Error('多边形需要 3–64 个有限顶点。');
  if(o.kind==='circle'&&(!Number.isFinite(o.radius)||o.radius<=0))throw Error('辅助圆半径须为正。');
  if(o.kind==='line'&&!['line','segment','ray'].includes(o.lineType))throw Error('辅助线类型不正确。');
  const numberKeys=o.kind==='electric'?['E0','fieldAngle','radius','width','height','angle','sectorAngle','period','phase']:o.kind==='field'?['B','radius','width','height','angle','sectorAngle']:o.kind==='particle'?['mass','charge','speed','heading']:o.kind==='source'?['mass','charge','speed','heading','count','spread','speedSpan','interval','length','radius','width','height','angle']:[];
  if(numberKeys.some(k=>!Number.isFinite(o[k])))throw new Error('物理或几何参数必须是有限数值');
  if(['particle','source'].includes(o.kind)&&(o.mass<=0||o.speed<0))throw new Error('质量须为正，速率不能为负');
  if(['field','electric','source'].includes(o.kind)&&[o.width,o.height,o.radius].some(n=>n<=0))throw new Error('场域或粒子源尺寸须为正');
  if(o.kind==='electric'&&o.E0<0)throw Error('电场强度不能为负，请用方向控件改变指向。');
  if(isField(o)&&(o.sectorAngle<=0||o.sectorAngle>180))throw Error('扇形张角须大于零且不超过 180°。');
  if(o.kind==='field'&&(!['dc','square'].includes(o.waveform??'dc')||o.waveform==='square'&&(!Number.isFinite(o.period)||o.period<=0||!Number.isFinite(o.phase))))throw Error('磁场支持恒定或方波，周期须为正数。');
  if(o.kind==='electric'&&(!waveNames[o.waveform]||o.period<=0))throw Error('请选择有效波形，交变周期须为正数。');
  if(o.kind==='source'&&(!Number.isInteger(o.count)||o.count<1||o.count>100||o.interval<0||o.length<=0||o.speedSpan<0))throw new Error('发射数量须为 1–100 的整数，间隔和速率范围不能为负');
  if(o.kind==='source'&&o.speedSpan>2*o.speed)throw new Error('速率范围不能超过初速率的两倍，以保证每个粒子的速率非负。');
  if(['ruler','angle','line'].includes(o.kind)&&(!Array.isArray(o.points)||o.points.length!==(o.kind==='angle'?3:2)||o.points.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)))))throw new Error('几何端点不正确');
 }
}
