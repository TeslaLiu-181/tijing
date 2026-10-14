import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {tex} from './lorentz-math.mjs';
import {add,sub,mul,unit,norm,cross,dot,rad,TAU,atTime,sampleSegment,geometry,handBasis,fieldVector,regions} from './lorentz-physics.mjs';
export const colors={ink:'#344951',velocity:'#b87511',field:'#347fc4',force:'#dd6154',cross:'#8868bc',trajectory:'#147c70',geometry:'#a480b4',muted:'#a4b3b9'};
const V=a=>new THREE.Vector3(...a),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1),cm=a=>mul(a,100);
const mat=(color,opacity=1)=>new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.04,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity>=1});
function clear(group){const gs=new Set(),ms=new Set();group.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());group.clear();}

export class LorentzScene{
 constructor(container,labelLayer,onView){
  this.container=container;this.labelLayer=labelLayer;this.labels=[];this.onView=onView;this.projection='ortho';this.view='plane';this.dragMode='pan';this.extent=7;this.target=new THREE.Vector3();
  this.scene=new THREE.Scene();this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;container.prepend(this.renderer.domElement);
  this.scene.add(new THREE.HemisphereLight('#ffffff','#ccd9d7',2.2));const light=new THREE.DirectionalLight('#fff5df',2.3);light.position.set(3,5,8);this.scene.add(light);
  this.static=new THREE.Group();this.helpers=new THREE.Group();this.dynamic=new THREE.Group();this.scene.add(this.static,this.helpers,this.dynamic);
  this.makeCamera(false);new ResizeObserver(()=>this.resize()).observe(container);
  this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();container.dispatchEvent(new CustomEvent('sceneerror',{detail:'图形显示中断，请重新打开文件。'}));});
 }
 mesh(geometry,p,color,opacity=1,parent=this.static){const o=new THREE.Mesh(geometry,mat(color,opacity));o.position.copy(V(p));parent.add(o);return o;}
 rod(a,b,color=colors.ink,r=.016,parent=this.static,opacity=1){const d=sub(b,a);if(norm(d)<1e-9)return;const o=this.mesh(new THREE.CylinderGeometry(r,r,norm(d),10),mul(add(a,b),.5),color,opacity,parent);o.quaternion.setFromUnitVectors(Y,V(unit(d)));return o;}
 line(points,color=colors.geometry,dashed=false,parent=this.static,opacity=1){const g=new THREE.BufferGeometry().setFromPoints(points.map(V));const m=dashed?new THREE.LineDashedMaterial({color,dashSize:.10,gapSize:.07,transparent:opacity<1,opacity}):new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity});const o=new THREE.Line(g,m);if(dashed)o.computeLineDistances();parent.add(o);return o;}
 tube(points,color=colors.trajectory,r=.025,parent=this.static){
  if(points.length<2||norm(sub(points.at(-1),points[0]))<1e-10&&points.every(p=>norm(sub(p,points[0]))<1e-10))return;
  const curve=new THREE.CatmullRomCurve3(points.map(V));return this.mesh(new THREE.TubeGeometry(curve,Math.min(1800,Math.max(20,points.length*2)),r,6,false),[0,0,0],color,1,parent);
 }
 label(code,p,color=colors.ink,parent='static'){
  const el=document.createElement('div');el.className='scene-label';el.innerHTML=tex(code);el.style.color=color;this.labelLayer.append(el);const label={el,p,code,parent};this.labels.push(label);return label;
 }
 arrow(p,d,color=colors.ink,length=.9,parent=this.static,code){
  const group=new THREE.Group();parent.add(group);group.position.copy(V(p));
  const shaft=this.mesh(new THREE.CylinderGeometry(.019,.019,.8,10),[0,.4,0],color,1,group);this.mesh(new THREE.ConeGeometry(.072,.2,12),[0,.9,0],color,1,group);
  group.userData.label=code?this.label(code,add(p,mul(unit(d),length+.17)),color,parent===this.dynamic?'dynamic':'static'):null;
  this.positionArrow(group,p,d,length);return group;
 }
 positionArrow(group,p,d,length){const valid=norm(d)>1e-28&&length>0;group.visible=valid;group.position.copy(V(p));if(valid){group.quaternion.setFromUnitVectors(Y,V(unit(d)));group.scale.set(1,length,1);}const l=group.userData.label;if(l){l.hidden=!valid;l.p=add(p,mul(unit(d),length+.17));l.vector=unit(d);l.origin=p;}}
 makeCamera(preserve=true){
  const old=this.camera,position=old?.position.clone(),target=this.controls?.target.clone()||this.target,up=old?.up.clone();
  const height=old?(old.isOrthographicCamera?this.extent/old.zoom:2*old.position.distanceTo(target)*Math.tan(rad(18))):this.extent;
  this.controls?.dispose();this.camera=this.projection==='ortho'?new THREE.OrthographicCamera(-5,5,5,-5,.01,2000):new THREE.PerspectiveCamera(36,1,.01,2000);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=false;this.controls.minDistance=.3;this.controls.maxDistance=1000;this.controls.minZoom=.03;this.controls.maxZoom=30;
  this.controls.addEventListener('start',()=>{this.gestureDirection=this.camera.position.clone().sub(this.controls.target).normalize();});
  this.controls.addEventListener('change',()=>{
   if(this.gestureDirection&&this.gestureDirection.distanceToSquared(this.camera.position.clone().sub(this.controls.target).normalize())>1e-10){this.gestureDirection=null;this.view='free';this.onView?.('free');}
  });
  this.controls.addEventListener('end',()=>{this.gestureDirection=null;});this.controls.target.copy(target);
  if(preserve&&old){this.camera.position.copy(position);this.camera.up.copy(up);if(this.camera.isOrthographicCamera)this.camera.zoom=this.extent/height;else this.camera.position.copy(target).add(position.sub(target).normalize().multiplyScalar(height/(2*Math.tan(rad(18)))));}
  else this.resetView(this.view);
  this.setDragMode(this.dragMode);this.resize();this.controls.update();
 }
 setDragMode(mode){
  this.dragMode=mode;this.controls.enableRotate=mode==='rotate';this.controls.screenSpacePanning=true;
  this.controls.mouseButtons.LEFT=mode==='pan'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
  this.controls.touches.ONE=mode==='pan'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
  this.controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  this.renderer.domElement.style.cursor=mode==='pan'?'move':'grab';
 }
 visibleHeight(){return this.camera.isOrthographicCamera?this.extent/this.camera.zoom:2*this.camera.position.distanceTo(this.controls.target)*Math.tan(rad(this.camera.fov/2))/this.camera.zoom;}
 panView(dx,dy){
  // Move the picture in screen coordinates, regardless of the current world axes.
  this.camera.updateMatrixWorld();const shift=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0).multiplyScalar(-dx);
  shift.addScaledVector(new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1),-dy).multiplyScalar(this.visibleHeight()*.10);
  this.camera.position.add(shift);this.controls.target.add(shift);this.controls.update();
 }
 zoomView(factor){
  if(this.camera.isOrthographicCamera)this.camera.zoom=THREE.MathUtils.clamp(this.camera.zoom*factor,this.controls.minZoom,this.controls.maxZoom);
  else{const offset=this.camera.position.clone().sub(this.controls.target),distance=THREE.MathUtils.clamp(offset.length()/factor,this.controls.minDistance,this.controls.maxDistance);this.camera.position.copy(this.controls.target).add(offset.setLength(distance));}
  this.camera.updateProjectionMatrix();this.controls.update();
 }
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);if(this.camera.isOrthographicCamera){this.camera.left=-this.extent*w/h/2;this.camera.right=this.extent*w/h/2;this.camera.top=this.extent/2;this.camera.bottom=-this.extent/2;}else this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 setProjection(value){if(value===this.projection)return;this.projection=value;this.makeCamera();}
 resetView(view=this.view,fit=true){
  this.view=view;const target=this.target.clone(),field=this.config?fieldVector(this.config):[0,0,1],spaceModule=this.config?.module==='space'&&['space','free'].includes(view),direction=view==='field'&&norm(field)?unit(field):view==='space'||view==='free'?(spaceModule?[6,-8,4]:[5,3,8]):view==='xz'?[0,-10,0]:view==='yz'?[10,0,0]:[0,0,10];
  this.camera.up.set(...(spaceModule||view==='xz'||view==='yz'&&this.config?.module!=='beam'||view==='field'&&Math.abs(unit(direction)[1])>.95?[0,0,1]:[0,1,0]));this.controls.target.copy(target);
  this.camera.position.copy(target).add(V(direction).normalize().multiplyScalar(this.extent/(2*Math.tan(rad(18)))));this.camera.zoom=1;this.setDragMode(['space','free'].includes(view)?'rotate':'pan');this.camera.updateProjectionMatrix();this.controls.update();
 }
 fitAll(){const mode=this.dragMode;this.fit();this.resetView(this.view);this.setDragMode(mode);this.resize();}
 fit(){
  const box=new THREE.Box3();const points=this.result.segments.flatMap(s=>sampleSegment(s,80)).map(cm);points.forEach(p=>box.expandByPoint(V(p)));
  if(this.config.module==='direction'){box.setFromCenterAndSize(new THREE.Vector3(),new THREE.Vector3(4.5,4.5,4.5));}
  if(this.config.module==='beam'){box.expandByPoint(new THREE.Vector3(-3.3,-2,-2));box.expandByPoint(new THREE.Vector3(this.config.screen,2,2));}
  if(this.config.module==='sandbox'){box.expandByPoint(V([this.config.cx-1.8,this.config.cy-1.8,0]));box.expandByPoint(V([this.config.cx+1.8,this.config.cy+1.8,0]));}
  box.getCenter(this.target);const size=box.getSize(new THREE.Vector3()),aspect=this.container.clientWidth/this.container.clientHeight;
  this.extent=Math.max(4.5,size.y*1.45,size.z*1.5,size.x*1.25/aspect);if(this.config.module==='space')this.extent=Math.max(this.extent,size.z*1.3+size.y*.7);
 }
 update(config,result,ui,pinned,fit=true){
  this.config=config;this.result=result;this.ui=ui;clear(this.static);clear(this.helpers);clear(this.dynamic);this.labelLayer.replaceChildren();this.labels=[];this.hand=null;this.handAudit=null;
  if(fit)this.fit();this.drawGrid();this.drawField();
  if(pinned)this.line(pinned.map(cm),'#a7adb2',true,this.static,.65);
  this.trajectory=new THREE.Group();this.static.add(this.trajectory);
  if(config.module!=='direction')for(const s of result.segments){const n=Math.min(900,Math.max(36,Math.ceil(Math.abs(s.w*s.dt)*35)));this.tube(sampleSegment(s,n).map(cm),s.id?colors.trajectory:'#719596',.022,this.trajectory);}
  this.trajectory.visible=ui.trajectory;
  if(config.module==='space')this.drawSpace();
  if(config.module==='beam')this.drawBeam();
  this.drawHelpers();
  this.particle=this.mesh(new THREE.SphereGeometry(.09,20,14),[0,0,0],colors.trajectory,1,this.dynamic);
  this.vectorPlane=this.mesh(new THREE.PlaneGeometry(2.2,2.2),[0,0,0],colors.cross,.09,this.dynamic);this.vectorPlane.add(new THREE.LineSegments(new THREE.EdgesGeometry(this.vectorPlane.geometry),new THREE.LineBasicMaterial({color:colors.cross,transparent:true,opacity:.35})));
  this.particleLabel=this.label(result.initial.q<0?'q<0':result.initial.q>0?'q>0':'q=0',[0,0,0],colors.trajectory,'dynamic');
  this.arrows={v:this.arrow([0,0,0],[1,0,0],colors.velocity,1,this.dynamic,'\\vec v'),B:this.arrow([0,0,0],[0,0,1],colors.field,1,this.dynamic,'\\vec B'),F:this.arrow([0,0,0],[0,-1,0],colors.force,1,this.dynamic,'\\vec F_B'),K:this.arrow([0,0,0],[0,-1,0],colors.cross,1,this.dynamic,'\\vec v\\times\\vec B')};
  this.vparallel=this.arrow([0,0,0],[0,0,1],colors.velocity,.7,this.dynamic,'\\vec v_\\parallel');this.vperp=this.arrow([0,0,0],[1,0,0],colors.velocity,.7,this.dynamic,'\\vec v_\\perp');
  this.makeHand();if(fit)this.resetView(ui.view);this.resize();this.updateTime(0);
 }
 drawGrid(){
  if(!this.ui.grid)return;const span=Math.min(18,Math.max(4,Math.ceil(this.extent))),center=this.config.module==='sandbox'?[this.config.cx,this.config.cy,0]:[0,0,0];
  for(let i=-span;i<=span;i++){this.line([[center[0]-span,center[1]+i,-.035],[center[0]+span,center[1]+i,-.035]],'#b9c7ca',false,this.static,.25);this.line([[center[0]+i,center[1]-span,-.035],[center[0]+i,center[1]+span,-.035]],'#b9c7ca',false,this.static,.25);}
  this.arrow([0,0,0],[1,0,0],colors.muted,.9,this.static,'x');this.arrow([0,0,0],[0,1,0],colors.muted,.9,this.static,'y');
  if(this.config.module!=='sandbox')this.arrow([0,0,0],[0,0,1],colors.muted,.9,this.static,'z');
 }
 polygon(points,color,opacity=.065){const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],p[1])));const o=this.mesh(new THREE.ShapeGeometry(shape),[0,0,-.025],color,opacity);this.line([...points,points[0]],color,false,this.static,.6);return o;}
 drawField(){
  const c=this.config;if(c.module==='sandbox'){
   const r=regions(c),extent=Math.min(16,Math.max(4,this.extent)),world=p=>{const a=rad(c.angle);return [c.cx+p[0]*Math.cos(a)-p[1]*Math.sin(a),c.cy+p[0]*Math.sin(a)+p[1]*Math.cos(a),0];};
   const rectangle=(x1,x2,y1,y2,color)=>this.polygon([[x1,y1],[x2,y1],[x2,y2],[x1,y2]].map(world),color);
   if(c.shape==='unbounded')rectangle(-extent,extent,-extent,extent,colors.field);
   if(c.shape==='half')rectangle(0,extent,-extent,extent,colors.field);
   if(c.shape==='strip')rectangle(-c.width/2,c.width/2,-extent,extent,colors.field);
   if(c.shape==='rectangle')rectangle(-c.width/2,c.width/2,-c.height/2,c.height/2,colors.field);
   if(c.shape==='circle'){this.polygon(Array.from({length:120},(_,i)=>world([c.radius*Math.cos(i/120*TAU),c.radius*Math.sin(i/120*TAU)])),colors.field);this.label('O_B',[c.cx+.12,c.cy+.14,0],colors.field);this.mesh(new THREE.SphereGeometry(.035,10,8),[c.cx,c.cy,0],colors.field);}
   if(c.shape==='quadrant')rectangle(0,extent,0,extent,colors.field);
   if(c.shape==='double'){rectangle(-extent,0,-extent,extent,colors.field);rectangle(0,extent,-extent,extent,'#827dc2');}
   if(this.ui.field){
    const spacing=Math.max(.65,extent/5);
    for(let x=-extent;x<=extent;x+=spacing)for(let y=-extent;y<=extent;y+=spacing){const p=[c.cx+x,c.cy+y,.015],id=r.at(mul(p,.01)),B=id===1?c.B:id===2?c.B2:0;if(!B)continue;this.fieldSymbol(p,B,id===2?'#827dc2':colors.field);}
   }
  }else if(c.module!=='beam'&&this.ui.field){
   const B=fieldVector(c);if(!norm(B))return;const b=unit(B),u=unit(cross(b,Math.abs(b[2])<.9?[0,0,1]:[0,1,0])),v=cross(b,u);
   const along=this.result.segments.flatMap(seg=>[dot(cm(seg.p),b),dot(cm(seg.end.p),b)]),lo=c.module==='space'?Math.min(...along)-.8:-2,hi=c.module==='space'?Math.max(...along)+.8:3;
   for(const i of [-1,0,1])for(const j of [-1,0,1]){const p=add(mul(u,i*1.5),mul(v,j*1.5));this.line([add(p,mul(b,lo)),add(p,mul(b,hi))],colors.field,true,this.static,.23);this.arrow(add(p,mul(b,hi-.6)),b,colors.field,.35);}
  }
 }
 fieldSymbol(p,B,color){
  const ring=this.mesh(new THREE.TorusGeometry(.074,.006,6,24),p,color,.48);
  if(B>0)this.mesh(new THREE.SphereGeometry(.018,8,6),p,color,.75);
  else{this.rod(add(p,[-.038,-.038,0]),add(p,[.038,.038,0]),color,.008,this.static,.6);this.rod(add(p,[-.038,.038,0]),add(p,[.038,-.038,0]),color,.008,this.static,.6);}
 }
 drawSpace(){
  const s=this.result.segments[0];if(!s.curved)return;const points=sampleSegment(s,Math.min(700,Math.max(80,Math.ceil(Math.abs(s.w*s.dt)*35))));
  if(this.ui.components){
   const projected=points.map(p=>sub(p,mul(s.axis,dot(sub(p,s.p),s.axis))));this.line(projected.map(cm),colors.cross,true,this.static,.6);
   this.line([s.center,add(s.center,mul(s.parallel,s.dt))].map(cm),colors.geometry,true);this.label('\\text{螺旋轴}',cm(add(s.center,mul(s.parallel,s.dt*.65))),colors.geometry);
   const end=s.end.p,foot=projected.at(-1);this.line([end,foot].map(cm),colors.muted,true);
   if(s.T&&norm(s.parallel)>1e-9){const a=cm(s.center),b=cm(add(s.center,mul(s.parallel,Math.min(s.T,s.dt))));this.line([a,b],colors.geometry);this.label(s.dt>=s.T?'h':'v_\\parallel t',mul(add(a,b),.5),colors.geometry);}
  }
 }
 drawBeam(){
  const c=this.config,gun=this.mesh(new THREE.CylinderGeometry(.24,.28,.65,20),[-3.25,0,0],'#7f9399');gun.quaternion.setFromUnitVectors(Y,new THREE.Vector3(1,0,0));
  this.mesh(new THREE.TorusGeometry(.18,.035,8,24),[-2.92,0,0],colors.ink).rotation.y=Math.PI/2;this.label('\\text{电子枪}',[-3.25,-.5,0]);
  const volume=this.mesh(new THREE.BoxGeometry(c.width,3,3),[c.cx,0,0],colors.field,.07);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(volume.geometry),new THREE.LineBasicMaterial({color:colors.field,transparent:true,opacity:.45}));volume.add(edges);
  this.label('\\text{磁偏转区}',[c.cx,-1.7,0],colors.field);
  if(this.ui.field&&c.B)for(const x of [c.cx-c.width*.3,c.cx+c.width*.3])for(const y of [-.85,.85])this.arrow([x,y,-.5],fieldVector(c),colors.field,.8);
  const screen=this.mesh(new THREE.PlaneGeometry(c.screenSize,c.screenSize),[c.screen,0,0],'#5d8f79',.15);screen.rotation.y=Math.PI/2;screen.add(new THREE.LineSegments(new THREE.EdgesGeometry(screen.geometry),new THREE.LineBasicMaterial({color:'#5d8f79'})));
  this.label('\\text{荧光屏}',[c.screen,-c.screenSize/2-.35,0],'#487a66');
  if(this.result.hit?.inside)this.mesh(new THREE.SphereGeometry(.075,16,10),cm(this.result.hit.p),'#7cbb43');
 }
 drawHelpers(){
  this.labels.filter(l=>l.parent==='helper').forEach(l=>l.el.remove());this.labels=this.labels.filter(l=>l.parent!=='helper');clear(this.helpers);
  if(this.config.module!=='sandbox')return;const curved=this.result.segments.filter(s=>s.curved),s=curved[Math.min(this.ui.segment,curved.length-1)];if(!s)return;
  const u=this.ui,a=cm(s.p),b=cm(s.end.p),C=cm(s.center),r=s.r*100,g=geometry(s);
  const label=(code,p)=>this.label(code,p,colors.geometry,'helper');
  if(u.center){this.mesh(new THREE.SphereGeometry(.042,12,8),C,colors.geometry,1,this.helpers);label('C',add(C,[.15,.12,0]));}
  if(u.radius){this.line([a,C,b],colors.geometry,true,this.helpers);label('r',mul(add(C,a),.5));}
  if(u.reference)this.line(Array.from({length:129},(_,i)=>add(C,[r*Math.cos(TAU*i/128),r*Math.sin(TAU*i/128),0])),colors.geometry,true,this.helpers,.45);
  if(u.chord&&g.chord>1e-10){this.line([a,b],colors.geometry,false,this.helpers);label('\\ell',mul(add(a,b),.5));}
  if(u.arc){this.tube(sampleSegment(s,Math.max(80,Math.min(700,Math.ceil(g.phi*40)))).map(cm),colors.cross,.036,this.helpers);label('\\widehat{PQ}',cm(sampleSegment(s,2)[1]));}
  if(u.tangent){for(const [p,v] of [[a,s.v],[b,s.end.v]])this.line([add(p,mul(unit(v),-.75)),add(p,mul(unit(v),.9))],colors.velocity,true,this.helpers);}
  if(u.angles){
   const start=Math.atan2(a[1]-C[1],a[0]-C[0]),signed=-Math.sign(s.w*s.B[2]),sweep=Math.min(g.phi,TAU-.001),ar=Math.min(.32,r*.25);
   this.line(Array.from({length:80},(_,i)=>add(C,[ar*Math.cos(start+signed*sweep*i/79),ar*Math.sin(start+signed*sweep*i/79),0])),colors.geometry,false,this.helpers);label('\\varphi',add(C,[-.26,-.18,0]));
   if(g.chordAngle!==null){const va=Math.atan2(s.v[1],s.v[0]),ca=Math.atan2(b[1]-a[1],b[0]-a[0]);let delta=(ca-va+Math.PI*3)%TAU-Math.PI;this.line(Array.from({length:32},(_,i)=>add(a,[ar*Math.cos(va+delta*i/31),ar*Math.sin(va+delta*i/31),0])),colors.cross,false,this.helpers);label('\\alpha',add(a,[.25,.27,0]));}
  }
  if(u.radius||u.chord||u.arc||u.tangent||u.angles){label('P',add(a,[-.13,.16,0]));label(s.ends==='boundary'?'Q':'Q_t',add(b,[.13,.16,0]));}
 }
 makeHand(){
  if(!this.ui.hand)return;const skin='#d5ae8d',type=this.ui.hand,step=this.ui.handStep,group=new THREE.Group();this.dynamic.add(group);this.hand=group;
  const hot=i=>step===i?(i===0?colors.field:i===1?colors.velocity:type==='right'?colors.cross:colors.force):skin;
  if(type==='left'){
   const palm=this.mesh(new THREE.SphereGeometry(1,14,10),[0,-.20,.07],hot(0),.70,group);palm.scale.set(.35,.42,.105);
   this.rod([0,-.82,.07],[0,-.5,.07],skin,.16,group,.6);
   for(let i=0;i<4;i++){const x=-.23+i*.15,length=[.63,.8,.74,.57][i];this.rod([x,.02,.07],[x,.16+length,.07],hot(1),.055,group,.78);for(const f of [.35,.67,1])this.mesh(new THREE.SphereGeometry(.057,10,8),[x,.1+length*f,.07],hot(1),.78,group);}
   this.rod([-.27,-.22,.07],[-.55,-.02,.07],hot(2),.085,group,.8);this.rod([-.55,-.02,.07],[-1.0,-.02,.07],hot(2),.066,group,.8);this.mesh(new THREE.SphereGeometry(.066,10,8),[-1,-.02,.07],hot(2),.8,group);
  }else{
   // Right palm normal +y, fingers curl in the xy plane toward +y; thumb +z.
   const palm=this.mesh(new THREE.SphereGeometry(1,14,10),[.16,-.15,-.10],hot(0),.68,group);palm.scale.set(.40,.12,.32);
   this.rod([-.53,-.15,-.1],[-.15,-.15,-.1],skin,.15,group,.65);
   for(let i=0;i<4;i++){const z=-.34+i*.15,points=[[.23,-.15,z],[.62,-.10,z],[.76,.12,z],[.66,.33,z],[.45,.42,z]];for(let j=1;j<points.length;j++)this.rod(points[j-1],points[j],hot(1),.058,group,.78);for(const p of points.slice(1))this.mesh(new THREE.SphereGeometry(.061,10,8),p,hot(1),.78,group);}
   this.rod([.02,-.15,.13],[.02,-.08,.42],hot(2),.085,group,.8);this.rod([.02,-.08,.42],[.02,-.03,.85],hot(2),.07,group,.8);
   const initial=atTime(this.result,0),angle=handBasis(initial.v,fieldVector(this.config),initial.q,'right')?.angle||Math.PI/2;
   const points=Array.from({length:55},(_,i)=>[.95*Math.cos(i/54*angle),.95*Math.sin(i/54*angle),0]);this.line(points,colors.cross,false,group);this.arrow(points.at(-1),[-Math.sin(angle),Math.cos(angle),0],colors.cross,.20,group);
  }
 }
 updateTime(t){
  const state=atTime(this.result,t),p=cm(state.p),u=this.ui,c=this.config,scale=c.module==='direction'?1.45:Math.max(.6,Math.min(1.15,this.extent*.10));this.current=state;this.particle.position.copy(V(p));this.particleLabel.p=add(p,[-.18,-.20,.08]);
  const forceValid=norm(cross(unit(state.v),unit(state.B)))>1e-10&&state.q!==0;
  const normal=unit(cross(state.v,state.B));this.vectorPlane.visible=c.module==='direction'&&u.vectorPlane&&norm(normal)>0;
  if(this.vectorPlane.visible){const x=unit(state.v),y=cross(normal,x);this.vectorPlane.position.copy(V(add(p,add(mul(x,.5),mul(y,.5)))));this.vectorPlane.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(x),V(y),V(normal)));}
  this.positionArrow(this.arrows.v,p,u.velocity?state.v:[0,0,0],scale);
  this.positionArrow(this.arrows.B,p,u.field?state.B:[0,0,0],scale*1.1);
  this.positionArrow(this.arrows.F,p,u.force&&forceValid?state.force:[0,0,0],scale*.9);
  this.positionArrow(this.arrows.K,p,u.hand==='right'&&forceValid?cross(state.v,state.B):[0,0,0],scale*1.18);
  this.positionArrow(this.vparallel,p,c.module==='space'&&u.components?state.parallel:[0,0,0],norm(state.parallel)/Math.max(norm(state.v),1)*scale);
  this.positionArrow(this.vperp,p,c.module==='space'&&u.components?state.perp:[0,0,0],norm(state.perp)/Math.max(norm(state.v),1)*scale);
  if(this.hand){const basis=handBasis(state.v,state.B,state.q,u.hand);this.hand.visible=!!basis;this.handAudit=basis;if(basis){this.hand.position.copy(V(p));this.hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(basis.x),V(basis.y),V(basis.z)));this.hand.scale.setScalar(c.module==='direction'?1.15:.8);}}
 }
 focusHand(){const p=cm(this.current.p),height=4.4;this.controls.target.copy(V(p));this.camera.position.copy(V(p)).add(new THREE.Vector3(2,1.4,4).normalize().multiplyScalar(height/(2*Math.tan(rad(18)))));this.camera.zoom=this.camera.isOrthographicCamera?this.extent/height:1;this.camera.updateProjectionMatrix();this.setDragMode('rotate');this.controls.update();this.view='free';this.onView?.('free');}
 focusSegment(){
  const segments=this.result.segments.filter(s=>s.curved),seg=segments[Math.min(this.ui.segment,segments.length-1)];if(!seg)return;
  const center=V(cm(seg.center)),height=Math.max(2.8,seg.r*100*3.1),direction=this.camera.position.clone().sub(this.controls.target).normalize();
  this.controls.target.copy(center);this.camera.position.copy(center).add(direction.multiplyScalar(height/(2*Math.tan(rad(18)))));this.camera.zoom=this.camera.isOrthographicCamera?this.extent/height:1;this.camera.updateProjectionMatrix();this.controls.update();
 }
 render(){
  this.renderer.render(this.scene,this.camera);const w=this.container.clientWidth,h=this.container.clientHeight,occupied=[],leaders=[];
  const priority=l=>l.parent==='dynamic'&&l.vector?0:l.parent==='dynamic'?1:l.parent==='helper'?2:3;
  for(const l of [...this.labels].sort((a,b)=>priority(a)-priority(b))){const p=V(l.p).project(this.camera),visible=!l.hidden&&p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1;l.el.hidden=!visible;if(!visible)continue;
   let code=l.code;if(l.vector){const along=dot(l.vector,unit(sub(this.camera.position.toArray(),l.origin)));if(Math.abs(along)>.965)code+=along>0?'\\,\\odot':'\\,\\otimes';}if(code!==l.last){l.el.innerHTML=tex(code);l.last=code;}
   const x0=(p.x*.5+.5)*w,y0=(-p.y*.5+.5)*h;let x=x0,y=y0;const width=l.el.offsetWidth||30,height=l.el.offsetHeight||24;
   for(let i=0;i<6;i++){if(!occupied.some(o=>Math.abs(o.x-x)<(o.w+width)/2+4&&Math.abs(o.y-y)<(o.h+height)/2+3))break;x+=i%2===0?18:-12;y+=17;}
   x=Math.min(w-width/2-8,Math.max(width/2+8,x));y=Math.min(h-height/2-25,Math.max(85+height/2,y));l.el.style.left=x+'px';l.el.style.top=y+'px';occupied.push({x,y,w:width,h:height});
   if(Math.hypot(x-x0,y-y0)>14)leaders.push(`<line x1="${x0}" y1="${y0}" x2="${x}" y2="${y}" stroke="${l.el.style.color}" opacity=".4"/>`);
  }
  let svg=this.labelLayer.querySelector('svg');if(!svg){svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';this.labelLayer.prepend(svg);}svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.innerHTML=leaders.join('');
 }
 snapshot(){return {view:this.view,projection:this.projection,dragMode:this.dragMode,position:this.camera.position.toArray(),up:this.camera.up.toArray(),target:this.controls.target.toArray(),zoom:this.camera.zoom,extent:this.extent};}
 restore(v){this.projection=v.projection;this.view=v.view;this.extent=v.extent;this.makeCamera(false);this.camera.position.fromArray(v.position);this.camera.up.fromArray(v.up);this.controls.target.fromArray(v.target);this.camera.zoom=v.zoom;this.camera.updateProjectionMatrix();this.setDragMode(['pan','rotate'].includes(v.dragMode)?v.dragMode:['free','space'].includes(this.view)?'rotate':'pan');this.controls.update();this.resize();}
}
