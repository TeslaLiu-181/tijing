import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {tex} from '../lorentz-math.mjs';
import {samplePath,stateAt} from './physics.mjs';

const V=p=>new THREE.Vector3(...p),palette={electric:0xb8863e,magnetic:0x638c9d,track:0x197e88,axes:0x80959f,critical:0xc77b45,vx:0x247fba,vy:0xbd8140};
export class SpatialScene{
 constructor(container,onViewChange){
  this.container=container;this.onViewChange=onViewChange;this.world=new THREE.Scene();this.world.background=new THREE.Color('#f7fafb');
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;container.append(this.renderer.domElement);
  this.renderer.domElement.setAttribute('aria-label','例4空间场域与粒子轨迹，可拖动旋转、滚轮缩放');
  this.layer=document.createElement('div');this.layer.className='label-layer';container.append(this.layer);this.labels=[];
  this.world.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(3,6,8);this.world.add(light);
  this.group=new THREE.Group();this.world.add(this.group);this.focus=new THREE.Vector3(1,.22,0);this.extent=3.7;this.projection='ortho';this.mode='spatial';this.viewOptions={fields:true,planes:true,velocity:true,components:false,geometry:false,force:false,motionPlane:false,future:true};
  this.makeCamera(false);new ResizeObserver(()=>{this.resize();if(!window.__EXAM_HOST__||!this.externalCameraLoaded)this.fit();}).observe(container);
 }
 makeCamera(preserve=true){
  const old=this.camera,target=this.controls?.target.clone()||this.focus.clone(),up=old?.up.clone()||new THREE.Vector3(0,1,0);
  const height=old?(old.isOrthographicCamera?this.extent/old.zoom:2*old.position.distanceTo(target)*Math.tan(THREE.MathUtils.degToRad(old.fov/2))/old.zoom):this.extent;
  const direction=old?old.position.clone().sub(target).normalize():new THREE.Vector3(5,3,7).normalize();
  this.controls?.dispose();this.extent=height;
  this.camera=this.projection==='ortho'?new THREE.OrthographicCamera(-2,2,2,-2,.01,100):new THREE.PerspectiveCamera(38,1,.01,100);
  const distance=this.projection==='ortho'?7:height/(2*Math.tan(THREE.MathUtils.degToRad(19)));
  this.camera.position.copy(target).addScaledVector(direction,distance);this.camera.up.copy(up);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.copy(target);this.controls.enableDamping=false;this.controls.minDistance=1.2;this.controls.maxDistance=25;this.controls.minZoom=.4;this.controls.maxZoom=5;this.controls.screenSpacePanning=true;
  this.controls.addEventListener('start',()=>{this.gestureDirection=this.camera.position.clone().sub(this.controls.target).normalize();});
  this.controls.addEventListener('change',()=>{if(this.gestureDirection&&this.gestureDirection.distanceToSquared(this.camera.position.clone().sub(this.controls.target).normalize())>1e-8){this.mode='free';this.onViewChange?.('free');this.gestureDirection=null;}});
  this.controls.addEventListener('end',()=>{this.gestureDirection=null;});this.controls.update();this.resize();if(!preserve)this.setView('spatial');
 }
 // Keep CSS dimensions in logical pixels; the backing buffer already applies
 // devicePixelRatio. Otherwise Windows scaling separates the plot and labels.
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);if(this.camera.isOrthographicCamera){this.camera.left=-this.extent*w/h/2;this.camera.right=this.extent*w/h/2;this.camera.top=this.extent/2;this.camera.bottom=-this.extent/2;}else this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 fit(){if(!this.camera)return;const aspect=this.container.clientWidth/Math.max(this.container.clientHeight,1),height=Math.max(4.05,4.7/aspect),dir=this.camera.position.clone().sub(this.controls.target).normalize();this.controls.target.copy(this.focus);this.extent=height;this.camera.zoom=1;this.camera.position.copy(this.focus).addScaledVector(dir,this.camera.isOrthographicCamera?7:height/(2*Math.tan(THREE.MathUtils.degToRad(19))));this.resize();this.controls.update();}
 setView(name){this.mode=name;const directions={spatial:[5,3,7],front:[0,0,1],top:[0,1,0],side:[1,0,0]};this.camera.up.set(...(name==='top'?[0,0,-1]:[0,1,0]));this.camera.position.copy(this.focus).add(V(directions[name]||directions.spatial));this.controls.target.copy(this.focus);this.controls.update();this.fit();this.onViewChange?.(name);}
 setProjection(value){if(this.projection===value)return;this.projection=value;this.makeCamera();}
 zoom(factor){if(this.camera.isOrthographicCamera)this.camera.zoom=THREE.MathUtils.clamp(this.camera.zoom*factor,.4,5);else this.camera.position.copy(this.controls.target).add(this.camera.position.clone().sub(this.controls.target).multiplyScalar(1/factor));this.camera.updateProjectionMatrix();this.controls.update();}
 clear(){this.group.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});this.group.clear();this.layer.replaceChildren();this.labels=[];}
 subgroup(){const g=new THREE.Group();this.group.add(g);return g;}
 line(points,color,group=this.group,dashed=false,opacity=1){const geometry=new THREE.BufferGeometry().setFromPoints(points.map(V)),material=dashed?new THREE.LineDashedMaterial({color,dashSize:.065,gapSize:.045,transparent:true,opacity}):new THREE.LineBasicMaterial({color,transparent:true,opacity});const line=new THREE.Line(geometry,material);if(dashed)line.computeLineDistances();group.add(line);return line;}
 dot(p,color,r=.027,group=this.group){const dot=new THREE.Mesh(new THREE.SphereGeometry(r,18,12),new THREE.MeshStandardMaterial({color,roughness:.38}));dot.position.copy(V(p));group.add(dot);return dot;}
 arrow(p,d,color,length,group=this.group){const arrow=new THREE.ArrowHelper(V(d).normalize(),V(p),length,color,.09,.045);group.add(arrow);return arrow;}
 label(code,p,{color='#42616e',kind='static',dx=0,dy=0,math=true}={}){const el=document.createElement('span');el.className='scene-label '+kind;el.innerHTML=math?tex(code):code;el.style.color=color;this.layer.append(el);const data={el,p:[...p],dx,dy,kind,code,visible:true};this.labels.push(data);return data;}
 rebuild(result){
  this.result=result;this.clear();this.fields=this.subgroup();this.magneticArrows=new THREE.Group();this.fields.add(this.magneticArrows);this.planes=this.subgroup();this.helpers=this.subgroup();this.motionPlane=this.subgroup();
  for(const [x,name] of [[0,'Ⅰ'],[1,'Ⅱ'],[2,'Ⅲ']]){
   const color=x===2?palette.critical:palette.axes,plane=new THREE.Mesh(new THREE.PlaneGeometry(1.9,2.45),new THREE.MeshBasicMaterial({color,transparent:true,opacity:x===2?.065:.045,side:THREE.DoubleSide,depthWrite:false}));plane.rotation.y=Math.PI/2;plane.position.set(x,.25,0);this.planes.add(plane);
   this.line([[x,-.975,-.95],[x,1.475,-.95],[x,1.475,.95],[x,-.975,.95],[x,-.975,-.95]],color,this.planes,false,.48);
   this.line([[x,-.975,0],[x,1.475,0]],color,this.planes,true,.6);
   this.label('界面 '+name,[x,1.55,-.6],{math:false,color:x===2?'#a66a35':'#647f8c',kind:'plane'});
  }
  for(const x of [.28,.72])for(const z of [-.55,.55])for(const y of [.95,.03])this.arrow([x,y,z],[0,-1,0],palette.electric,.39,this.fields);
  for(const x of [1.27,1.73])for(const y of [-.55,.65]){this.arrow([x,y,.65],[0,0,-1],palette.magnetic,1.18,this.magneticArrows);this.label(String.raw`\otimes`,[x,y,0],{kind:'fieldMark',color:'#638c9d'});}
  this.label('E',[.52,1.22,.58],{color:'#9e733b',kind:'field'});this.label('B',[1.5,1.18,.58],{color:'#477989',kind:'field'});
  this.arrow([0,0,0],[1,0,0],palette.axes,2.6);this.arrow([0,0,0],[0,1,0],palette.axes,1.35);this.arrow([0,0,0],[0,0,-1],palette.axes,1.22);
  this.label('x',[2.72,0,0]);this.label('y',[0,1.4,0],{dx:-12});this.label('+z',[0,0,-1.35],{dx:8});
  for(const [name,pos] of [['O',[0,0,0]],['O_1',[1,0,0]],['O_2',[2,0,0]],['P',[0,.5,0]]]){this.dot(pos,0x587984,.018);this.label(name,pos,{dx:name==='P'?-16:0,dy:18});}
  for(const x of [0,1]){this.line([[x,-.7,.92],[x+1,-.7,.92]],palette.axes);this.line([[x,-.65,.92],[x,-.75,.92]],palette.axes);this.line([[x+1,-.65,.92],[x+1,-.75,.92]],palette.axes);this.label('L',[x+.5,-.73,.92],{dy:10});}
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(2.65,1.95),new THREE.MeshBasicMaterial({color:0x4fa0a4,transparent:true,opacity:.055,side:THREE.DoubleSide,depthWrite:false}));plane.position.set(1.18,.27,-.002);this.motionPlane.add(plane);
  this.line([[-.145,-.705,0],[2.505,-.705,0],[2.505,1.245,0],[-.145,1.245,0],[-.145,-.705,0]],0x66a2aa,this.motionPlane,true,.45);
  this.points=samplePath(result);this.reference=this.line(this.points,0x739f9f,this.group,true,.5);this.progress=this.line(this.points,palette.track);this.progress.geometry.setDrawRange(0,0);
  this.particle=this.dot([0,.5,0],palette.track,.047);this.particleLabel=this.label('+q',[0,.5,0],{color:'#186975',dx:-23,dy:-21});
  const C=[...result.center,0],Q=result.turn;
  this.dot(C,0x957253,.022,this.helpers);this.line([C,[1,0,0]],0xb79069,this.helpers,true);this.label('C',C,{color:'#956c44',kind:'geometry',dx:-15,dy:14});
  this.label('R',C.map((v,i)=>(v+[1,0,0][i])/2),{kind:'geometry',color:'#956c44',dx:-13,dy:3});
  if(result.reachesTurn){this.line([C,Q],0xb79069,this.helpers,true);this.dot(Q,palette.critical,.024,this.helpers);this.label(result.status==='critical'?'Q':'S',Q,{kind:'geometry',color:'#a26434',dx:25,dy:18});this.line([[1,-.45,0],[Q[0],-.45,0]],0xb79069,this.helpers,true);this.label(String.raw`R+R/\sqrt2`,[(1+Q[0])/2,-.45,0],{kind:'geometry',color:'#956c44',dy:15});}
  this.velocity=this.arrow([0,0,0],[1,0,0],0x234d63,.5);this.vLabel=this.label('\\vec v',[0,0,0],{kind:'velocity',color:'#234d63',dx:10,dy:-7});
  this.vx=this.arrow([0,0,0],[1,0,0],palette.vx,.4);this.vy=this.arrow([0,0,0],[0,-1,0],palette.vy,.4);
  this.vxLabel=this.label('v_x',[0,0,0],{kind:'components',color:'#247fba',dy:-18});this.vyLabel=this.label('v_y',[0,0,0],{kind:'components',color:'#b67b3d',dx:-22});
  this.force=this.arrow([0,0,0],[0,-1,0],0xba6d48,.35);this.forceLabel=this.label('F',[0,0,0],{kind:'force',color:'#a66442',dx:36,dy:-19});
  this.setOptions(this.viewOptions);this.updateTime(0);
 }
 setOptions(options){Object.assign(this.viewOptions,options);const o=this.viewOptions;if(!this.fields)return;this.fields.visible=o.fields;this.planes.visible=o.planes;this.motionPlane.visible=o.motionPlane;this.reference.visible=o.future;this.helpers.visible=o.geometry;}
 positionArrow(arrow,label,p,vector,length,visible){const n=Math.hypot(...vector);arrow.visible=visible&&n>1e-10;label.visible=arrow.visible;if(!arrow.visible)return;arrow.position.copy(V(p));arrow.setDirection(V(vector).normalize());arrow.setLength(length,Math.min(.09,length*.3),Math.min(.045,length*.15));label.p=p.map((v,i)=>v+vector[i]/n*(length+.065));}
 updateTime(time){if(!this.result)return;const a=stateAt(this.result,time),o=this.viewOptions;this.state=a;this.particle.position.copy(V(a.p));this.particleLabel.p=a.p;this.progress.geometry.setDrawRange(0,Math.max(0,Math.floor(a.time/this.result.total*(this.points.length-1))+1));
  const speed=Math.hypot(...a.v),length=.56;this.positionArrow(this.velocity,this.vLabel,a.p,a.v,length,o.velocity);
  this.positionArrow(this.vx,this.vxLabel,a.p,[a.v[0],0,0],length*Math.abs(a.v[0])/speed,o.components);this.positionArrow(this.vy,this.vyLabel,a.p,[0,a.v[1],0],length*Math.abs(a.v[1])/speed,o.components);
  this.positionArrow(this.force,this.forceLabel,a.p,a.acc,.32,o.force);this.forceLabel.el.innerHTML=tex(a.phase==='electric'?'\\vec F_E':'\\vec F_B');
 }
 render(){this.controls.update();if(this.magneticArrows)this.magneticArrows.visible=this.mode!=='front';if(this.helpers)this.helpers.visible=this.viewOptions.geometry&&!['top','side'].includes(this.mode);this.renderer.render(this.world,this.camera);const w=this.container.clientWidth,h=this.container.clientHeight,o=this.viewOptions;this.camera.updateMatrixWorld();
  for(const label of this.labels){const p=V(label.p).project(this.camera),visible=label.visible&&p.z>=-1&&p.z<=1&&Math.abs(p.x)<1.05&&Math.abs(p.y)<1.05&&(label.kind!=='field'||o.fields)&&(label.kind!=='plane'||o.planes)&&(label.kind!=='geometry'||o.geometry&&!['top','side'].includes(this.mode))&&(label.kind!=='fieldMark'||o.fields&&this.mode==='front')&&!(this.mode==='front'&&label.code==='+z')&&!(this.mode==='top'&&['y','P'].includes(label.code))&&!(this.mode==='side'&&(['O','O_1','x'].includes(label.code)||label.kind==='plane'&&label.p[0]!==2));label.el.hidden=!visible;if(visible)label.el.style.transform=`translate(${(p.x+1)*w/2+label.dx}px,${(1-p.y)*h/2+label.dy}px) translate(-50%,-50%)`;}
 }
}
