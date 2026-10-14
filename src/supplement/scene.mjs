import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {colors} from './models.mjs';

const V=a=>new THREE.Vector3(...a),color=role=>colors[role]||colors.wire;
export class SupplementScene{
 constructor(stage,labels){
  this.stage=stage;this.labels=labels;this.labelItems=[];this.scene=new THREE.Scene();this.root=new THREE.Group();this.scene.add(this.root);this.dirty=true;
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0xffffff,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;stage.prepend(this.renderer.domElement);
  this.scene.add(new THREE.HemisphereLight(0xffffff,0xaebdbb,2.7));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(4,6,8);this.scene.add(light);
  this.camera=new THREE.OrthographicCamera(-4,4,4,-4,.01,1000);this.camera.position.set(6,4,7);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=false;this.controls.minZoom=.15;this.controls.maxZoom=8;this.controls.addEventListener('change',()=>this.dirty=true);
  this.extent=4;this.center=new THREE.Vector3();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(stage);
  this.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();stage.dispatchEvent(new CustomEvent('sceneerror',{detail:'三维显示中断，请重新载入场景。'}));});
 }
 resize(){const {width,height}=this.stage.getBoundingClientRect();this.width=Math.max(1,width);this.height=Math.max(1,height);this.renderer.setSize(this.width,this.height,false);const aspect=this.width/this.height;if(this.fitWidth)this.extent=Math.max(this.fitHeight/2,this.fitWidth/(2*aspect),.7)*1.25;this.camera.left=-this.extent*aspect;this.camera.right=this.extent*aspect;this.camera.top=this.extent;this.camera.bottom=-this.extent;this.camera.updateProjectionMatrix();this.dirty=true;}
 clear(){const gs=new Set(),ms=new Set();this.root.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])ms.add(m);});for(const g of gs)g.dispose();for(const m of ms)m.dispose();this.root.clear();this.labels.replaceChildren();this.labelItems=[];}
 label(label,at,role,from=null){const el=document.createElement('span');el.className='scene-label';el.textContent=label;el.style.color=color(role);this.labels.append(el);this.labelItems.push({el,at:V(at),from:from?V(from):null});}
 draw(model,{showForces=true,showField=true}={}){
  this.clear();
  for(const item of model.items){
   if(!showField&&item.role==='field')continue;
   if(!showForces&&item.kind==='arrow'&&(item.category==='force'||item.label==='F合'||item.label==='磁体反作用力'))continue;
   const col=color(item.role);
   if(item.kind==='label'){this.label(item.label,item.at,item.role);continue;}
   if(item.kind==='arrow'){
    const vec=V(item.vector),len=vec.length()*(item.scale||1);if(len<1e-8)continue;vec.normalize();const a=new THREE.ArrowHelper(vec,V(item.at),len,col,Math.min(.16,len*.28),Math.min(.085,len*.15));this.root.add(a);if(item.label)this.label(item.label,V(item.at).addScaledVector(vec,len+.06).toArray(),item.role,item.at);continue;
   }
   if(item.kind==='ball'||item.kind==='sphere'){
    const geo=new THREE.SphereGeometry(item.radius||.08,20,14),mat=new THREE.MeshStandardMaterial({color:col,transparent:!!item.opacity,opacity:item.opacity??1,roughness:.6,depthWrite:item.opacity===undefined}),obj=new THREE.Mesh(geo,mat);obj.position.copy(V(item.at));this.root.add(obj);continue;
   }
   if(item.kind==='surface'){
    if(item.points.length<3)continue;const points=item.points,vertices=[];for(let i=1;i<points.length-1;i++)vertices.push(...points[0],...points[i],...points[i+1]);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();this.root.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:item.opacity||.1,side:THREE.DoubleSide,depthWrite:false})));continue;
   }
   if(item.kind==='path'){
    if(item.points.length<2)continue;
    const points=item.points.map(V),geo=new THREE.BufferGeometry().setFromPoints(points),mat=item.dashed?new THREE.LineDashedMaterial({color:col,dashSize:.08,gapSize:.06,transparent:true,opacity:.65}):new THREE.LineBasicMaterial({color:col});const obj=new THREE.Line(geo,mat);if(item.dashed)obj.computeLineDistances();this.root.add(obj);
    const width=item.width??((['particle','second','third'].includes(item.role)&&!item.dashed) ? .02 : 0);if(width){const curve=new THREE.CurvePath();for(let i=1;i<points.length;i++)if(points[i].distanceToSquared(points[i-1])>1e-16)curve.add(new THREE.LineCurve3(points[i-1],points[i]));if(curve.curves.length){const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.min(700,Math.max(10,points.length)),width/2,6,false),new THREE.MeshStandardMaterial({color:col,roughness:.8}));this.root.add(mesh);}}
   }
  }
  this.dirty=true;
 }
 fit(models,view='spatial'){
  const box=new THREE.Box3();
  for(const model of models)for(const item of model.items){for(const p of item.points||[])box.expandByPoint(V(p));if(item.at)box.expandByPoint(V(item.at));if(item.kind==='arrow')box.expandByPoint(V(item.at).addScaledVector(V(item.vector),item.scale||1));if(item.radius){const p=V(item.at),r=item.radius;box.expandByPoint(p.clone().addScalar(r));box.expandByPoint(p.clone().addScalar(-r));}}
  if(box.isEmpty())box.setFromCenterAndSize(new THREE.Vector3(),new THREE.Vector3(4,4,4));this.bounds=box;box.getCenter(this.center);const size=box.getSize(new THREE.Vector3());this.radius=Math.max(1,size.length()/2);this.extent=this.radius*1.05;this.camera.zoom=1;this.controls.target.copy(this.center);this.setView(view);this.resize();
 }
 setView(view){const directions={front:[0,0,1],spatial:[1,.75,1.3],top:[0,1,0],side:[1,0,0]},dir=V(directions[view]||directions.spatial).normalize();this.camera.up.set(...(view==='top'?[0,0,-1]:[0,1,0]));this.camera.position.copy(this.controls.target).addScaledVector(dir,(this.radius||3)*4+5);this.camera.lookAt(this.controls.target);this.controls.update();if(this.bounds){const right=this.camera.up.clone().cross(dir).normalize(),up=dir.clone().cross(right),xs=[],ys=[];for(const x of [this.bounds.min.x,this.bounds.max.x])for(const y of [this.bounds.min.y,this.bounds.max.y])for(const z of [this.bounds.min.z,this.bounds.max.z]){const p=new THREE.Vector3(x,y,z).sub(this.center);xs.push(p.dot(right));ys.push(p.dot(up));}this.fitWidth=Math.max(...xs)-Math.min(...xs);this.fitHeight=Math.max(...ys)-Math.min(...ys);this.resize();}this.dirty=true;}
 snapshot(){return {position:this.camera.position.toArray(),target:this.controls.target.toArray(),up:this.camera.up.toArray(),zoom:this.camera.zoom,extent:this.extent};}
 restore(value){if(!value)return;this.camera.position.fromArray(value.position);this.controls.target.fromArray(value.target);this.camera.up.fromArray(value.up);this.camera.zoom=value.zoom;this.extent=value.extent;this.fitWidth=null;this.fitHeight=null;this.resize();this.controls.update();this.dirty=true;}
 render(){
  if(!this.dirty)return;this.dirty=false;this.renderer.render(this.scene,this.camera);const placed=[];
  for(const {el,at,from} of this.labelItems){
   const p=at.clone().project(this.camera);if(p.z< -1||p.z>1){el.hidden=true;continue;}el.hidden=false;const x=(p.x+1)*this.width/2,y=(1-p.y)*this.height/2,w=el.offsetWidth,h=el.offsetHeight;
   const f=from?.clone().project(this.camera),preferred=f?[p.x<f.x-.001?-w-6:6,p.y<f.y-.001?6:-h-3]:[6,-h-3],candidates=[preferred,[6,-h-3],[6,6],[-w-6,-h-3],[-w-6,6],[6,-h*2-9],[-w-6,h+10],[6,h+10],[-w-6,-h*2-9]];
   let chosen=null;for(const [dx,dy]of candidates){const r={x:Math.max(3,Math.min(this.width-w-3,x+dx)),y:Math.max(3,Math.min(this.height-h-3,y+dy)),w,h};if(!placed.some(a=>r.x<a.x+a.w+3&&r.x+r.w+3>a.x&&r.y<a.y+a.h+2&&r.y+r.h+2>a.y)){chosen=r;break;}}
   chosen??={x:Math.max(3,Math.min(this.width-w-3,x+6)),y:Math.max(3,Math.min(this.height-h-3,y-h-3)),w,h};placed.push(chosen);el.style.transform=`translate(${chosen.x}px,${chosen.y}px)`;
  }
 }
}
