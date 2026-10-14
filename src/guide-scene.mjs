import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {tex} from './guide-math.mjs';
import {add,sub,mul,norm,unit,cross,dot,rotate,radians,circle,line,leftHandBasis} from './guide-physics.mjs';

export const palette={wire:'#263d42',fill:'#f1f3ee',current:'#bd801b',field:'#4285a4',magnetic:'#d35b48',normal:'#318979',gravity:'#7a8690',friction:'#8463ad',tension:'#738c55',reaction:'#ac4f79'};
const V=a=>new THREE.Vector3(...a);
const Y=new THREE.Vector3(0,1,0);
const material=(color,opacity=1)=>new THREE.MeshStandardMaterial({color,roughness:.75,metalness:0,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity>=1});

export class GuideScene{
 constructor(container,labels,onSelect){
  this.container=container;this.labelLayer=labels;this.onSelect=onSelect;this.labels=[];this.flows=[];this.pickables=[];
  this.projection='ortho';this.view='source';this.hand=null;this.handStep=0;this.focused=false;this.dirty=true;
  this.scene=new THREE.Scene();
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0xffffff,0);
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;container.prepend(this.renderer.domElement);
  this.scene.add(new THREE.HemisphereLight(0xffffff,0xa0ada6,2.6));
  const light=new THREE.DirectionalLight(0xfff6e8,2.6);light.position.set(-3,7,8);this.scene.add(light);
  const fill=new THREE.DirectionalLight(0xd9e8f2,1.4);fill.position.set(5,1,-5);this.scene.add(fill);
  this.root=new THREE.Group();this.scene.add(this.root);
  this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();container.dispatchEvent(new CustomEvent('sceneerror',{detail:'图形上下文中断，请重新打开文件。'}));});
  this.renderer.domElement.addEventListener('pointerdown',e=>this.pointerStart=[e.clientX,e.clientY]);
  this.renderer.domElement.addEventListener('pointerup',e=>{
   if(!this.pointerStart||Math.hypot(e.clientX-this.pointerStart[0],e.clientY-this.pointerStart[1])>5)return;
   const r=this.renderer.domElement.getBoundingClientRect();const ndc=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
   const ray=new THREE.Raycaster();ray.setFromCamera(ndc,this.camera);const hit=ray.intersectObjects(this.pickables,false)[0];if(hit)this.onSelect(hit.object.userData.part);
  });
  this.makeCamera(false);new ResizeObserver(()=>this.resize()).observe(container);
 }
 disposeGroup(){
  const geometries=new Set(),materials=new Set();
  this.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.root.clear();
  this.labelLayer.innerHTML='';this.labels=[];this.flows=[];this.pickables=[];
 }
 addLabel(value,position,role='wire',extra={}){
  const el=document.createElement('div');el.className='scene-math-label'+(extra.plain?' plain':'');el.style.color=palette[role]||role;
  el.innerHTML=tex(value);this.labelLayer.append(el);this.labels.push({el,pos:position,value,...extra});return el;
 }
 mesh(geometry,pos,color=palette.fill,opacity=1,parent=this.root){const mesh=new THREE.Mesh(geometry,material(color,opacity));mesh.position.copy(V(pos));parent.add(mesh);return mesh;}
 box(size,pos,color=palette.fill,edges=true,parent=this.root){
  const m=this.mesh(new THREE.BoxGeometry(...size),pos,color,1,parent);
  if(edges){const e=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:palette.wire}));m.add(e);}return m;
 }
 segment(a,b,r=.022,color=palette.wire,parent=this.root,opacity=1){
  const d=sub(b,a),len=norm(d);if(len<1e-8)return null;
  const m=this.mesh(new THREE.CylinderGeometry(r,r,len,12),mul(add(a,b),.5),color,opacity,parent);m.quaternion.setFromUnitVectors(Y,V(unit(d)));return m;
 }
 polyline(points,color=palette.wire,width=.02,parent=this.root){
  const curve=new THREE.CurvePath();for(let i=1;i<points.length;i++)curve.add(new THREE.LineCurve3(V(points[i-1]),V(points[i])));
  const m=this.mesh(new THREE.TubeGeometry(curve,Math.max(12,points.length*2),width,8,false),[0,0,0],color,1,parent);return {curve,mesh:m};
 }
 dashed(points,color='#aebbb1',parent=this.root){
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(V)),new THREE.LineDashedMaterial({color,dashSize:.11,gapSize:.08}));line.computeLineDistances();parent.add(line);return line;
 }
 flow(points,current,closed=false,parent=this.root){
  const {curve}=this.polyline(points,palette.wire,.024,parent);
  if(!current)return;
  const count=Math.max(3,Math.min(14,Math.ceil(curve.getLength()*1.25))),particles=[];
  const geometry=new THREE.ConeGeometry(.043,.15,10),mat=new THREE.MeshBasicMaterial({color:palette.current});
  for(let i=0;i<count;i++){const cone=new THREE.Mesh(geometry,mat);parent.add(cone);particles.push(cone);}
  this.flows.push({curve,particles,current,closed});
 }
 arrow(pos,value,role='magnetic',length=1,parent=this.root,label=null){
  if(norm(value)<1e-8||length<.03)return;
  const color=palette[role]||role,n=unit(value),tip=Math.min(.19,length*.3),end=add(pos,mul(n,length));
  this.segment(pos,add(pos,mul(n,length-tip)),role==='field'?.013:.033,color,parent);
  const head=this.mesh(new THREE.ConeGeometry(role==='field'?.058:.096,tip,16),add(pos,mul(n,length-tip/2)),color,1,parent);
  head.quaternion.setFromUnitVectors(Y,V(n));
  if(label)this.addLabel(label,add(end,mul(n,.13)),role,{vector:value,origin:pos});
 }
 battery(center,direction,positiveSide=1,parent=this.root,planeNormal=[0,1,0]){
  // A cell is always two unequal parallel line segments, including in 3D.
  const d=unit(direction),across=unit(cross(d,planeNormal));
  for(const side of [-1,1]){const half=side===positiveSide?.32:.17,c=add(center,mul(d,side*.09));this.segment(add(c,mul(across,-half)),add(c,mul(across,half)),.027,palette.wire,parent);}
  this.addLabel(String.raw`E,\,r`,add(center,mul(across,.5)),'wire',{plain:true});
  this.audit.batteries.push({long:.64,short:.34,positiveSide,center});
 }
 resistor(center,direction,parent=this.root,label='R',slider=true,planeNormal=[0,1,0]){
  const group=new THREE.Group();parent.add(group);group.position.copy(V(center));
  const x=unit(direction),y=unit(cross(planeNormal,x)),z=unit(cross(x,y));group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(x),V(y),V(z)));
  this.box([.66,.20,.10],[0,0,0],palette.fill,true,group);
  if(slider){this.polyline([[-.65,0,0],[-.65,.45,0],[.08,.45,0],[.08,.2,0]],palette.wire,.019,group);this.arrow([.08,.42,0],[0,-1,0],'wire',.22,group);}
  this.addLabel(label,add(center,[0,.5,0]),'wire',{plain:true});
 }
 switchSymbol(a,b,parent=this.root){
  const mid=mul(add(a,b),.5),d=unit(sub(b,a));this.segment(a,add(mid,mul(d,-.14)),.018,palette.wire,parent);this.segment(add(mid,mul(d,-.1)),add(mid,mul(d,.3)),.025,palette.wire,parent);this.segment(add(mid,mul(d,.3)),b,.018,palette.wire,parent);
  const ring=this.mesh(new THREE.TorusGeometry(.055,.015,8,20),add(mid,mul(d,-.14)),palette.wire,1,parent);ring.rotation.y=0;
  this.addLabel('S',add(mid,[0,.45,0]),'wire',{plain:true});
 }
 supportLine(a,b,parent=this.root){this.segment(a,b,.012,'#596e74',parent);}
 ceiling(y,width=2.1){
  this.segment([-width/2,y,0],[width/2,y,0],.018);
  for(let x=-width/2;x<width/2;x+=.16)this.segment([x,y,0],[x+.14,y+.14,0],.01);
 }
 barMagnet(north,south){
  const center=mul(add(north,south),.5),axis=unit(sub(north,south)),length=norm(sub(north,south));
  const group=new THREE.Group();group.position.copy(V(center));group.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),V(axis));this.root.add(group);
  this.box([length/2,.5,.55],[length/4,0,0],axis[0]<0?'#dfe4df':'#f7f7f1',true,group);this.box([length/2,.5,.55],[-length/4,0,0],axis[0]>0?'#dfe4df':'#f7f7f1',true,group);
  this.addLabel('N',add(add(center,mul(axis,length*.32)),[0,.13,.31]),'wire',{plain:true});this.addLabel('S',add(add(center,mul(axis,-length*.32)),[0,.13,.31]),'wire',{plain:true});
 }
 horseshoe(){
  // Extruded U, with the original open gap and north/south leg proportions.
  const shape=new THREE.Shape();shape.moveTo(-1.5,.55);shape.lineTo(-1,.55);shape.lineTo(-1,-.92);shape.quadraticCurveTo(-1,-1.1,-.82,-1.1);shape.lineTo(.82,-1.1);shape.quadraticCurveTo(1,-1.1,1,-.92);shape.lineTo(1,.55);shape.lineTo(1.5,.55);shape.lineTo(1.5,-1.38);shape.quadraticCurveTo(1.5,-1.6,1.28,-1.6);shape.lineTo(-1.28,-1.6);shape.quadraticCurveTo(-1.5,-1.6,-1.5,-1.38);shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.40,bevelEnabled:false});geo.translate(0,0,-.2);
  const positions=geo.getAttribute('position'),colors=[];for(let i=0;i<positions.count;i++){const c=new THREE.Color(positions.getX(i)>0?'#cdd5cf':'#f3f4ee');colors.push(c.r,c.g,c.b);}geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const m=this.mesh(geo,[0,0,0],'#ffffff');m.material.vertexColors=true;m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:palette.wire})));
  this.addLabel('N',[-1.25,.22,.24],'wire',{plain:true});this.addLabel('S',[1.25,.22,.24],'wire',{plain:true});
 }
 curveField(points){
  if(points.length<3)return;
  const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(V)),new THREE.LineBasicMaterial({color:palette.field,transparent:true,opacity:.52}));this.root.add(m);
  const i=Math.floor(points.length*.57),j=Math.min(points.length-1,i+2);this.arrow(points[i],sub(points[j],points[i]),'field',.16);
 }
 fieldTraces(model,topic){
  const field=model.field,kind=topic.kind;
  if(['rail','rail-side','pulley','cannon','vertical'].includes(kind)){
   const center=model.samples[0]?.pos||[0,0,0],B=field(center);if(norm(B)<1e-8)return;
   const d=unit(B),u=unit(cross(d,Math.abs(d[2])<.8?[0,0,1]:[0,1,0])),v=unit(cross(d,u));
   for(let i=-2;i<=2;i++)for(let j=-1;j<=1;j++){
    const start=add(add(center,mul(u,i*.92)),add(mul(v,j*.78),mul(d,-1.4)));this.curveField(line(start,add(start,mul(d,2.8)),8));
   }
   return;
  }
  if(kind==='radial'){
   for(const z of [-1,0,1])for(const theta of [-48,-24,0,24,48]){
    const r=radians(theta),start=[2.55*Math.sin(r),1.35-2.55*Math.cos(r),z],end=[1.1*Math.sin(r),1.35-1.1*Math.cos(r),z];this.curveField(line(start,end,10));
   }return;
  }
  if(kind==='reaction'||kind==='scale'){
   const c=mul(add(model.magnet.north,model.magnet.south),.5);
   for(const height of [.85,1.3,1.85]){
    const points=[];for(let i=0;i<=60;i++){const a=Math.PI-Math.PI*i/60;points.push([c[0]+(1.7+.25*height)*Math.cos(a),c[1]+height*Math.sin(a),0]);}this.curveField(points);
   }return;
  }
  if(kind==='crossed'||kind==='frame'){
   const right=model.right;if(!right?.value)return;const axis=right.axis,u=unit(cross(axis,[0,0,1])),v=unit(cross(axis,u));
   for(const offset of [-1,0,1])for(const radius of [.55,1,1.55])this.curveField(circle(add(right.anchor,mul(axis,offset)),u,v,radius,48));return;
  }
  const seeds=[];
  if(model.magnet){const n=model.magnet.north,along=unit(sub(model.magnet.south,n));
   for(const angle of [20,38,56,74]){const a=radians(angle);seeds.push(add(n,add(mul(along,.16*Math.cos(a)),[0,.16*Math.sin(a),0])));}
   seeds.push(add(n,[.09,.14,.08]),add(n,[.09,.14,-.08]));
  }else if(kind==='dual-loop'){
   for(const x of [-1.15,-.7,0,.7,1.15])seeds.push([x,.06,0]);
  }else if(kind==='solenoid'){
   for(const z of [-.22,0,.22])for(const y of [-.2,.2])seeds.push(rotate([-1.2,y,z],[0,1,0],radians(this.params.angle||0)));
  }
  // Fixed arc-length integration traces geometry only, never animation time.
  for(const seed of seeds){
   const trace=sign=>{const path=[seed];let pos=seed;for(let i=0;i<180;i++){
    const b=field(pos);if(norm(b)<1e-8)break;const midpoint=add(pos,mul(unit(b),.045*sign));const next=add(pos,mul(unit(field(midpoint)),.09*sign));
    if(norm(next)>5||kind==='horseshoe'&&(Math.abs(next[0])>2.8||next[1]>2.9)||model.magnet&&(norm(sub(next,model.magnet.south))<.13||norm(sub(next,model.magnet.north))<.08))break;
    if(i>25&&norm(sub(next,seed))<.08)break;path.push(next);pos=next;
   }return path;};
   const front=trace(1),back=trace(-1).reverse();this.curveField([...back.slice(0,-1),...front]);
  }
 }
 railObjects(topic,p,model){
  const alpha=radians(p.alpha||0),map=(x,y,z)=>rotate([x,y,z],[0,0,1],alpha),L=(p.L||1)*(topic.id==='guide-balance'?4.2:topic.kind==='cannon'?3.6:3);
  const railEnd=2.5,batteryX=topic.battery?.startsWith('right')?railEnd:-railEnd,sgn=model.direction*Math.sign(model.I||1);
  const back=-L/2,front=L/2;
  if(topic.kind==='rail-side'){
   this.polyline([map(-2.7,-.06,0),map(2.7,-.06,0)],'#91a69b',.045);
   this.dashed([[-2.3*Math.cos(alpha),-2.3*Math.sin(alpha),0],[-2.3*Math.cos(alpha)+1.2,-2.3*Math.sin(alpha),0]]);
  }else{
   for(const z of [back,front])this.polyline([map(-railEnd,0,z),map(railEnd,0,z)],palette.wire,.025);
   const hasEndResistor=['example-2','exercise-8'].includes(topic.id);
   const b1=map(batteryX,0,back),b2=map(batteryX,0,front),mid=map(batteryX,0,hasEndResistor?L*.23:0),axis=unit(sub(b2,b1));
   this.segment(b1,add(mid,mul(axis,-.12)));this.segment(add(mid,mul(axis,.12)),b2);
   this.battery(mid,axis,(topic.battery?.includes('front')?1:-1)*Math.sign(model.I||p.polarity||1),this.root,model.n);
   if(hasEndResistor)this.resistor(map(railEnd,0,-L*.20),[0,0,1],this.root,'R',true,model.n);
   if(topic.battery?.includes('rheostat'))this.resistor(map(-1.45,0,back),[1,0,0]);
   if(topic.id==='exercise-2'||topic.kind==='cannon')this.switchSymbol(map(batteryX,0,front*.82),map(batteryX,0,front*.38));
   const path=sgn>0?[map(batteryX,0,back),map(0,0,back),map(0,0,front),map(batteryX,0,front)]:[map(batteryX,0,front),map(0,0,front),map(0,0,back),map(batteryX,0,back)];
   this.flow(path,Math.abs(model.I));
  }
  const overhang=topic.id==='guide-balance'?1.15:.38;
  const rod=this.box([.16,.07,L+overhang],map(0,.075,0),palette.fill);rod.rotation.z=alpha;
  if(model.I)this.flow([map(0,.13,-L/2),map(0,.13,L/2)],model.direction*model.I);
  const aFront=topic.id==='exercise-2';
  if(topic.kind!=='rail-side'){this.addLabel('a',map(0,.12,aFront?front+overhang/2+.13:back-overhang/2-.13),'wire',{plain:true});this.addLabel('b',map(0,.12,aFront?back-overhang/2-.13:front+overhang/2+.13),'wire',{plain:true});}
  if(topic.id==='exercise-2')for(const [letter,x,z] of [['P',-2.7,back],['Q',2.65,back],['M',-2.7,front],['N',2.7,front]])this.addLabel(letter,map(x,.04,z),'wire',{plain:true});
  this.addLabel('I',map(.27,.18,0),'current');
  if(p.alpha){const foot=map(-2.4,-.02,front+.15);this.dashed([foot,add(foot,[1.1,0,0])]);this.addLabel(['example-2','exercise-1','exercise-2'].includes(topic.id)?String.raw`\theta`:String.raw`\alpha`,add(foot,[.62,.14,0]),'wire',{plain:true});}
  if(topic.id==='guide-balance'){
   const origin=[-1.1,.02,L*.34],points=[];this.dashed([origin,add(origin,[.9,0,0])]);for(let i=0;i<=20;i++){const a=radians(p.theta)*i/20;points.push(add(origin,[.5*Math.cos(a),.5*Math.sin(a),0]));}this.polyline(points,'#8ca28e',.009);this.addLabel(String.raw`\theta`,add(origin,[.69,.18,0]),'wire',{plain:true});
  }
  if(topic.kind==='pulley'){
   const board=this.box([6,.07,L+1.2],[0,-.18,0],'#f4f5ee');
   const wheel=this.mesh(new THREE.TorusGeometry(.19,.026,12,32),[3,.10,0],palette.wire);wheel.rotation.x=0;
   this.supportLine([0,.14,0],[3,.14,0]);this.supportLine([3.18,.10,0],[3.18,-1.55,0]);
   this.box([.4,.55,.4],[3.18,-1.78,0]);this.addLabel('M',[3.6,-1.76,0],'wire',{plain:true});
  }
  if(topic.kind==='cannon'){
   this.segment([-.68,.37,0],[.75,.37,0],.32,'#e4e9e5');const nose=this.mesh(new THREE.ConeGeometry(.32,.45,28),[.97,.37,0],'#e4e9e5');nose.quaternion.setFromUnitVectors(Y,new THREE.Vector3(1,0,0));
  }
  this.audit.rail={gap:L,rodLength:L+overhang,currentDirection:sgn};
 }
 directionObjects(topic,p,model){
  const kind=topic.kind;
  const unknownSource=kind==='bar-turn'&&this.ui.mode==='lesson'&&!this.ui.reveal&&!this.ui.forces&&!this.ui.field&&!this.ui.hand;
  if(kind==='horseshoe')this.horseshoe();else if(model.magnet&&!unknownSource)this.barMagnet(add(model.magnet.north,[this.visualShift,0,0]),add(model.magnet.south,[this.visualShift,0,0]));
  if(unknownSource){this.dashed([[-2.2,-.9,0],[-2.2,.7,0],[2.2,.7,0],[2.2,-.9,0],[-2.2,-.9,0]]);this.addLabel(String.raw`\text{场源待判断}`,[0,-.2,0],'wire');}
  for(const wire of model.wires||[])this.flow(wire.points,wire.current,wire.closed);
  if(kind==='horseshoe'||kind==='bar-turn'){
   if(kind==='horseshoe'){const ceilingY=topic.defaults.height+1.1;this.ceiling(ceilingY,2.6);this.supportLine([0,p.height,0],[0,ceilingY,0]);this.addLabel('O',[0,p.height+.22,0],'wire',{plain:true});}
   const path=model.wires[0].points;this.addLabel(kind==='horseshoe'?'A':'a',add(path[0],[-.2,0,0]),'wire',{plain:true});this.addLabel(kind==='horseshoe'?'B':'b',add(path.at(-1),[.2,0,0]),'wire',{plain:true});
  }
  if(kind==='magnet-loop'){
   this.ceiling(2.1,6);this.supportLine(add(model.pivot,[0,.95,0]),[model.pivot[0],2.1,0]);this.dashed([[-3.1,0,0],[model.pivot[0]+1.1,0,0]]);
  }
  if(kind==='crossed'){
   const source=model.wires[0].points,target=model.wires[1].points;
   for(const [label,pos] of [['A',source[0]],['B',source.at(-1)],['C',target[0]],['D',target.at(-1)]])this.addLabel(label,add(pos,[.15,.12,0]),'wire',{plain:true});
   if(model.transform.separate){this.mesh(new THREE.SphereGeometry(.055,12,8),model.pivot,palette.wire);this.addLabel('O',add(model.pivot,[-.3,0,0]),'wire',{plain:true});}
  }
  if(kind==='dual-loop'){this.addLabel('L_1',[1.65,1.3,0],'wire',{plain:true});this.addLabel('L_2',[1.5,0,1.5],'wire',{plain:true});this.addLabel('I_1',[.5,1.4,0],'current',{plain:true});this.addLabel('I_2',[.3,.13,1.55],'current',{plain:true});}
  if(kind==='solenoid'){
   const path=[];for(let i=0;i<=480;i++){const t=i/480,phi=t*Math.PI*18;path.push(add(mul(model.transform.axis,-1.65+t*3.3),add(mul(model.transform.u,.36*Math.cos(phi)),mul(model.transform.v,.36*Math.sin(phi)))));}
   this.flow(path,p.J);const core=this.box([3.55,.52,.56],[0,0,0],'#f1f3ed');core.rotation.y=radians(p.angle||0);
   const disk=this.mesh(new THREE.CylinderGeometry(2.15,2.15,.08,64),[0,-1.3,0],'#f7f7f1');disk.add(new THREE.LineSegments(new THREE.EdgesGeometry(disk.geometry,40),new THREE.LineBasicMaterial({color:palette.wire})));
   const rot=pt=>rotate(pt,[0,1,0],radians(p.angle||0));
   this.segment([0,-1.3,0],[0,-2.05,0],.04);for(const x of [-1.8,1.8])this.supportLine(rot([x,0,0]),rot([x,-1.3,0]));
   this.polyline([[-1.8,0,0],[-2.1,0,0],[-2.1,-.72,0],[-.45,-.72,0]].map(rot));this.polyline([[-.23,-.72,0],[1.7,-.72,0],[1.7,0,0]].map(rot));
   this.battery(rot([-.34,-.72,0]),rot([1,0,0]),-Math.sign(p.J||1),this.root,rot([0,0,1]));this.switchSymbol(rot([.3,-.72,0]),rot([1.05,-.72,0]));this.addLabel('A',add(model.pivot,[1,.1,0]),'wire',{plain:true});
  }
  if(kind==='reaction'){
   this.segment([-2.2,-1.1,.0],[2.2,-1.1,0],.023);for(let x=-2.1;x<2.1;x+=.17)this.segment([x,-1.1,0],[x-.12,-1.26,0],.01);
  }
  if(kind==='scale'){
   const platform=this.box([5.8,.13,.9],[-.7,.2,0]);this.box([.06,.7,.65],[-3.35,.6,0]);
   const springEnd=model.magnet.north[0]+this.visualShift,spring=[];for(let i=0;i<=220;i++){const t=i/220,a=t*22*Math.PI;spring.push([-3.25+t*(springEnd+3.25),.55+.18*Math.cos(a),.18*Math.sin(a)]);}this.polyline(spring,palette.wire,.015);
   const dial=this.mesh(new THREE.CylinderGeometry(1.15,1.15,.25,64),[0,-1.14,0],palette.fill);dial.rotation.x=Math.PI/2;
   for(const radius of [1.15,.83])this.polyline(circle([0,-1.14,.15],[1,0,0],[0,1,0],radius,72),palette.wire,.018);
   const needleAngle=42+((this.ui.reveal>=2||this.ui.mode==='explore')?Math.sign(-model.netForce[1])*35:0);this.arrow([0,-1.14,.20],[Math.cos(radians(needleAngle)),Math.sin(radians(needleAngle)),0],'wire',.76);
   if(this.ui.reveal>=2||this.ui.mode==='explore')this.addLabel(model.netForce[1]<0?'F_2<F_1':model.netForce[1]>0?'F_2>F_1':'F_2=F_1',[0,-1.64,.2],'wire');
   this.supportLine([-.4,-2.12,0],[-1.4,-2.8,0]);this.supportLine([.4,-2.12,0],[1.4,-2.8,0]);this.box([5.8,.11,.85],[0,-2.9,0]);
  }
  if(kind==='frame'){
   this.ceiling(2.75,2);this.supportLine([0,2.15,0],[0,2.75,0]);this.addLabel('P',[-3.1,-1.35,0],'wire',{plain:true});this.addLabel('Q',[3.1,-1.35,0],'wire',{plain:true});
  }
 }
 verticalObjects(p,model){
  for(const x of [-1.45,1.45])this.polyline([[x,-2.15,0],[x,2.15,0]],palette.wire,.024);
  this.box([3.5,.12,.12],[0,model.barY,.08]);this.flow([[-1.7,model.barY,.16],[1.7,model.barY,.16]],model.I||0);
  for(const [text,pos] of [['C',[-1.65,2.35,0]],['D',[-1.65,-2.3,0]],['E',[1.65,2.35,0]],['F',[1.65,-2.3,0]],['M',[-1.9,model.barY,.12]],['N',[1.9,model.barY,.12]]])this.addLabel(text,pos,'wire',{plain:true});
 }
 radialObjects(p,model){
  const axis=model.axis,pos=model.pos;
  this.segment(add(axis,[0,0,-1.6]),add(axis,[0,0,1.6]),.09,'#d5ded8');
  this.segment(add(pos,[0,0,-1.65]),add(pos,[0,0,1.65]),.048,'#e1e7df');
  for(const z of [-1.3,1.3])this.supportLine(add(axis,[0,0,z]),add(pos,[0,0,z]));
  this.flow([add(pos,[0,.06,1.65]),add(pos,[0,.06,-1.65])],p.I);
  const ghost=[-pos[0],pos[1],0];
  if(Math.abs(pos[0])>.2){for(const z of [-1.3,1.3])this.dashed([add(axis,[0,0,z]),add(ghost,[0,0,z])]);this.dashed([add(ghost,[0,0,-1.65]),add(ghost,[0,0,1.65])]);}
  this.dashed([axis,add(axis,[0,-2.6,0])]);
  for(const [text,point] of [['O',add(axis,[0,.2,1.65])],["O'",add(axis,[0,.2,-1.65])],['M',add(pos,[0,-.25,1.65])],['N',add(pos,[0,-.25,-1.65])]])this.addLabel(text,point,'wire',{plain:true});
  const arc=[];for(let i=0;i<=30;i++){const a=model.theta*i/30;arc.push(add(axis,[.6*Math.sin(a),-.6*Math.cos(a),0]));}this.polyline(arc,'#8fa394',.012);this.addLabel('\\theta',add(axis,[.32,-.8,0]),'wire',{plain:true});
 }
 drawVectors(model,ui){
  const selected=model.samples[Math.min(ui.part,model.samples.length-1)];if(!selected)return;
  if(!selected.isReaction&&norm(selected.tangent)>0&&!['rail','rail-side','pulley','cannon'].includes(model.kind))this.addLabel('I',add(selected.pos,[.18,.18,0]),'current',{vector:selected.tangent,origin:selected.pos});
  if(ui.field&&norm(selected.B)>1e-8)this.arrow(selected.handAt||selected.pos,selected.B,'field',1.1,this.root,'\\vec B');
  if(ui.forces){
   const max=Math.max(.01,...model.forces.map(f=>norm(f.vector)));
   for(const f of model.forces){const shift=model.kind==='scale'&&f.role!=='magnetic'?this.visualShift:0;this.arrow(add(f.at,[shift,0,f.role==='friction'?.13:0]),f.vector,f.role,1.4*norm(f.vector)/max,this.root,f.name);}
   if(model.netForce&&norm(model.netForce)>1e-4&&ui.resultants&&!['reaction','scale'].includes(model.kind))this.arrow(model.pivot,model.netForce,'magnetic',1.35,this.root,'\\sum\\vec F');
   if(model.torque&&norm(model.torque)>1e-5&&ui.resultants){
    const axis=unit(model.torque),u=unit(cross(axis,Math.abs(axis[2])<.8?[0,0,1]:[0,1,0])),v=cross(axis,u),center=model.kind==='solenoid'?[0,-1.25,0]:model.pivot;
    const points=[];for(let i=0;i<=36;i++){const a=.1+i*1.4/36;points.push(add(center,add(mul(u,1.28*Math.cos(a)),mul(v,1.28*Math.sin(a)))));}
    this.polyline(points,palette.magnetic,.023);this.arrow(points.at(-2),sub(points.at(-1),points.at(-2)),'magnetic',.18);this.addLabel('\\vec\\tau',add(points[16],mul(axis,.18)),'magnetic');
   }
  }
  if(ui.moment&&model.moment)this.arrow(model.pivot,model.moment,'normal',1.5,this.root,'\\vec m');
  model.samples.forEach((sample,index)=>{
   const marker=this.mesh(new THREE.SphereGeometry(index===ui.part?.075:.042,16,10),sample.pos,index===ui.part?palette.current:'#b9c8be');
   const hit=this.mesh(new THREE.SphereGeometry(.22,10,8),sample.pos,palette.current,0);hit.userData.part=index;this.pickables.push(hit);
   if(index===ui.part)this.addLabel(sample.isNonCurrent?'M':sample.isReaction?'\\text{磁体}':'P',add(sample.pos,[.17,.13,0]),'current',{plain:true});
  });
 }
 makeHand(model,ui){
  if(!ui.hand)return;
  const selected=model.samples[Math.min(ui.part,model.samples.length-1)];
  let group=new THREE.Group(),basis,anchor,caption,scale=1;
  const step=ui.handStep||0,skin='#d8b093',hot=part=>part==='palm'&&step===0?palette.field:part==='fingers'&&step===1?palette.current:part==='thumb'&&step===2?palette.magnetic:skin;
  if(ui.hand==='left'){
   basis=leftHandBasis(selected.tangent,selected.B);if(!basis)return;
   anchor=selected.handAt||selected.pos;caption=String.raw`\text{左手掌心}`;
   const palm=this.mesh(new THREE.SphereGeometry(1,24,16),[0,-.22,0],hot('palm'),.72,group);palm.scale.set(.38,.46,.105);
   this.segment([0,-.88,0],[0,-.52,0],.18,skin,group,.66);
   const lengths=[.68,.84,.78,.60];
   for(let i=0;i<4;i++){
    const x=-.25+i*.165,start=[x,.05,0],end=[x,.25+lengths[i],0];
    this.segment(start,end,.064,hot('fingers'),group,.78);
    for(let j=1;j<=2;j++)this.mesh(new THREE.SphereGeometry(.069,12,8),[x,.10+lengths[i]*j/3,.005],hot('fingers'),.78,group);
    this.mesh(new THREE.SphereGeometry(.064,12,8),end,hot('fingers'),.78,group);
   }
   this.segment([-.28,-.24,0],[-.58,-.02,0],.10,hot('thumb'),group,.78);this.segment([-.58,-.02,0],[-1.10,-.02,0],.078,hot('thumb'),group,.78);this.mesh(new THREE.SphereGeometry(.08,12,8),[-1.1,-.02,0],hot('thumb'),.78,group);
   this.audit.hand={type:'left',basis,anchor};
  }else{
   const right=model.right;if(!right||!right.value)return;
   anchor=right.anchor;const y=unit(right.axis),radial=sub(selected.pos,anchor),x=unit(sub(radial,mul(y,dot(radial,y))));
   const actualX=norm(x)>.1?x:unit(cross(y,Math.abs(y[2])<.8?[0,0,1]:[0,1,0])),z=unit(cross(actualX,y));basis={x:actualX,y,z};caption=String.raw`\text{右手握法}`;
   const radius=right.style==='straight'?.31:.58;
   if(right.style==='loop')scale=right.radius/.58;
   const palm=this.mesh(new THREE.SphereGeometry(1,24,16),[radius+.09,-.10,0],step===0?palette.current:skin,.72,group);palm.scale.set(.14,.51,.27);
   this.segment([radius+.06,-.88,0],[radius+.06,-.43,0],.17,skin,group,.7);
   for(let i=0;i<4;i++){
    const points=[];for(let j=0;j<=26;j++){const a=-.22+j*1.57*Math.PI/26;points.push([radius*Math.cos(a),-.33+i*.20,-radius*Math.sin(a)]);}
    for(let j=1;j<points.length;j++)this.segment(points[j-1],points[j],.067,step===1?palette.field:skin,group,.76);
    this.mesh(new THREE.SphereGeometry(.07,12,8),points.at(-1),skin,.78,group);
   }
   this.segment([radius+.07,.24,.05],[radius+.08,1.03,.05],.10,step===2?palette.current:skin,group,.78);this.mesh(new THREE.SphereGeometry(.10,12,8),[radius+.08,1.03,.05],skin,.78,group);
   this.audit.hand={type:'right',basis,anchor,style:right.style};
  }
  const matrix=new THREE.Matrix4().makeBasis(V(basis.x),V(basis.y),V(basis.z));group.quaternion.setFromRotationMatrix(matrix);group.position.copy(V(anchor));group.scale.setScalar(scale);this.root.add(group);
  this.handAnchor=anchor;this.handBasis=basis;this.handScale=scale;
  this.addLabel(caption,add(anchor,mul(basis.y,-1.08)),ui.hand==='left'?'field':'current');
  if(ui.hand==='left'){
   if(step===0)this.arrow(add(anchor,mul(basis.z,1.2)),mul(basis.z,-1),'field',.92,this.root,String.raw`\vec B`);
   if(step===1)this.arrow(add(anchor,mul(basis.x,.48)),basis.y,'current',1.1,this.root,'I');
   if(step===2)this.arrow(add(anchor,mul(basis.y,-.10)),mul(basis.x,-1),'magnetic',1.15,this.root,String.raw`\vec F_{\mathrm{安}}`);
  }else{
   const r=model.right,label=r.style==='straight'?'I':String.raw`\vec B_{\mathrm{轴}}`;
   if(step!==1)this.arrow(add(anchor,mul(basis.x,.63)),basis.y,r.style==='straight'?'current':'field',1.25,this.root,label);
  }
 }
 update(topic,p,index,model,ui){
  this.topic=topic;this.params=p;this.index=index;this.model=model;this.ui=ui;this.audit={batteries:[],hand:null};this.disposeGroup();
  this.visualShift=topic.kind==='scale'&&(ui.reveal>=2||ui.mode==='explore')?-model.netForce[0]/(1+norm(model.netForce))*.4:0;this.audit.scaleShift=this.visualShift;
  if(['rail','rail-side','pulley','cannon'].includes(topic.kind))this.railObjects(topic,p,model);
  else if(topic.kind==='vertical')this.verticalObjects(p,model);
  else if(topic.kind==='radial')this.radialObjects(p,model);
  else this.directionObjects(topic,p,model);
  if(ui.field)this.fieldTraces(model,topic);
  this.drawVectors(model,ui);
  const handStart=this.root.children.length,labelStart=this.labels.length;
  this.makeHand(model,ui);
  this.root.children.slice(handStart).forEach(o=>o.userData.handElement=true);this.labels.slice(labelStart).forEach(l=>l.handElement=true);
  if(this.focused&&ui.hand)this.isolateHand();
  this.animateFlow(0);this.dirty=true;
 }
 target(){
  if(!this.topic)return new THREE.Vector3();
  const map={scale:[-.45,-.9,0],horseshoe:[0,.55,0],pulley:[.4,-.25,0],solenoid:[0,.25,0],frame:[0,.55,0],reaction:[-.4,.1,0]};
  return V(map[this.topic.kind]||this.model.center||[0,0,0]);
 }
 makeCamera(preserve=true){
  const old=this.camera,oldTarget=this.controls?.target.clone()||this.target(),oldPos=old?.position.clone(),oldUp=old?.up.clone();
  const h=this.container.clientHeight||500,w=this.container.clientWidth||700,aspect=w/h;
  const visible=old?(old.isOrthographicCamera?8/old.zoom:2*old.position.distanceTo(oldTarget)*Math.tan(radians(18))):8;
  this.controls?.dispose();
  this.camera=this.projection==='ortho'?new THREE.OrthographicCamera(-4*aspect,4*aspect,4,-4,.1,100):new THREE.PerspectiveCamera(36,aspect,.1,100);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=false;this.controls.minZoom=.35;this.controls.maxZoom=5;this.controls.minDistance=2;this.controls.maxDistance=45;
  this.controls.addEventListener('change',()=>this.dirty=true);this.controls.target.copy(oldTarget);
  this.controls.enableRotate=['source','free'].includes(this.view);
  if(preserve&&old){
   this.camera.position.copy(oldPos);this.camera.up.copy(oldUp);if(this.camera.isOrthographicCamera)this.camera.zoom=8/visible;else this.camera.position.copy(oldTarget).add(oldPos.clone().sub(oldTarget).normalize().multiplyScalar(visible/(2*Math.tan(radians(18)))));
  }else this.resetView();
  this.camera.userData.fit=this.fitHeight();this.camera.updateProjectionMatrix();this.controls.update();this.resize();
 }
 fitHeight(){const aspect=(this.container.clientWidth||700)/(this.container.clientHeight||500);return Math.max(this.topic?.kind==='scale'?7.4:6.6,8.2/aspect);}
 resetView(){
  if(!this.controls)return;
  this.focused=false;const target=this.target();this.controls.target.copy(target);this.camera.up.set(0,1,0);
  const kind=this.topic?.kind;
  let direction=['rail','pulley','cannon'].includes(kind)?[(this.params?.alpha||0)>0?-4:4,5,9]:kind==='magnet-loop'?[5,1.5,10]:kind==='dual-loop'?[0,3,10]:kind==='frame'?[6,3,9]:kind==='radial'?[4,2.2,10]:[0,.3,10];
  if(this.view==='free')direction=[6,5,9];
  if(this.view==='plane')direction=[0,0,10];
  if(this.view==='top'){direction=[0,10,0];this.camera.up.set(0,0,-1);}
  if(this.view==='left')direction=[-10,0,0];
  const fit=this.fitHeight(),distance=fit/(2*Math.tan(radians(18)));
  this.camera.position.copy(target).add(V(direction).normalize().multiplyScalar(distance));
  if(this.view==='source'&&['rail','pulley','cannon'].includes(kind)){
   const back=V(direction).normalize(),right=new THREE.Vector3(1,0,0).addScaledVector(back,-back.x).normalize();this.camera.up.crossVectors(back,right).normalize();
  }
  this.root.children.forEach(o=>o.visible=!o.userData.focusOnly);this.labels.forEach(l=>l.focusHidden=!!l.focusOnly);
  if(this.camera.isOrthographicCamera)this.camera.zoom=8/fit;
  this.camera.userData.fit=fit;this.controls.enableRotate=['source','free'].includes(this.view);this.camera.updateProjectionMatrix();this.controls.update();this.dirty=true;
 }
 setView(view){this.view=view;this.resetView();}
 setProjection(projection){if(projection===this.projection)return;this.projection=projection;this.makeCamera();}
 focusHand(){
  if(!this.handAnchor||!this.handBasis)return;
  this.focused=true;this.controls.target.copy(V(this.handAnchor));
  const normal=this.ui.hand==='left'?this.handBasis.z:this.handBasis.x;
  const dir=add(normal,mul(this.handBasis.y,.13));this.camera.up.copy(V(this.handBasis.y));this.camera.position.copy(V(this.handAnchor)).add(V(dir).normalize().multiplyScalar(4.8*Math.max(1,this.handScale*.9)));if(this.camera.isOrthographicCamera)this.camera.zoom=2.3/Math.max(1,this.handScale*.9);
  this.isolateHand();
  this.camera.updateProjectionMatrix();this.controls.enableRotate=true;this.controls.update();this.dirty=true;
 }
 isolateHand(){
  const stale=this.root.children.filter(o=>o.userData.focusOnly);
  this.flows=this.flows.filter(f=>!f.particles[0]?.parent?.userData.focusOnly);
  for(const group of stale){const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.root.remove(group);}
  this.root.children.forEach(o=>o.visible=!!o.userData.handElement);this.labels.forEach(l=>l.focusHidden=!l.handElement);
  const group=new THREE.Group();group.userData.focusOnly=true;this.root.add(group);
  const sample=this.model.samples[Math.min(this.ui.part,this.model.samples.length-1)];
  if(this.ui.hand==='left'){
   const at=sample.handAt||sample.pos;this.flow([add(at,mul(sample.tangent,-.85)),add(at,mul(sample.tangent,.85))],Math.abs(sample.current),false,group);
  }else{
   const r=this.model.right;
   if(r.style==='straight')this.flow([add(r.anchor,mul(r.axis,-1.2)),add(r.anchor,mul(r.axis,1.2))],Math.abs(r.value),false,group);
   else{const u=this.handBasis.x,v=mul(this.handBasis.z,-1);this.flow(circle(r.anchor,u,v,r.style==='loop'?r.radius:.45,72),Math.abs(r.value),true,group);}
  }
 }
 resize(){
  if(!this.camera)return;const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;
  const fit=this.fitHeight(),old=this.camera.userData.fit||fit;
  this.renderer.setSize(w,h,false);
  if(this.camera.isPerspectiveCamera){this.camera.aspect=w/h;if(!this.focused)this.camera.position.sub(this.controls.target).multiplyScalar(fit/old).add(this.controls.target);}
  else{this.camera.left=-4*w/h;this.camera.right=4*w/h;if(!this.focused)this.camera.zoom*=old/fit;}
  this.camera.userData.fit=fit;this.camera.updateProjectionMatrix();this.controls.update();this.dirty=true;
 }
 animateFlow(time){
  for(const flow of this.flows){const direction=Math.sign(flow.current),phase=time*.10*direction;
   flow.particles.forEach((particle,i)=>{const t=((i/flow.particles.length+phase)%1+1)%1,a=flow.curve.getPointAt(t),b=flow.curve.getPointAt(Math.min(.99999,t+.002));particle.position.copy(a);const d=b.sub(a).normalize().multiplyScalar(direction);particle.quaternion.setFromUnitVectors(Y,d);});
  }
 }
 render(time){
  this.animateFlow(time);this.renderer.render(this.scene,this.camera);
  const w=this.container.clientWidth,h=this.container.clientHeight,occupied=[],leaders=[];
  const ordered=[...this.labels].sort((a,b)=>Number(b.plain)-Number(a.plain));
  for(const label of ordered){
   const point=V(label.pos).project(this.camera),visible=!label.focusHidden&&point.z>-1&&point.z<1&&Math.abs(point.x)<1.1&&Math.abs(point.y)<1.1;label.el.hidden=!visible;if(!visible)continue;
   const x0=(point.x*.5+.5)*w,y0=(-point.y*.5+.5)*h;let x=x0,y=y0;
   let code=label.value;
   if(label.vector){const viewDir=this.camera.position.clone().sub(V(label.origin)).normalize(),along=dot(unit(label.vector),viewDir.toArray());if(Math.abs(along)>.96)code+=along>0?String.raw`\,\odot`:String.raw`\,\otimes`;}
   if(label.lastCode!==code){label.el.innerHTML=tex(code);label.lastCode=code;}
   const width=Math.min(label.el.offsetWidth,140),height=label.el.offsetHeight||25;
   for(let i=0;i<10;i++){if(!occupied.some(r=>Math.abs(r.x-x)<(r.w+width)/2+4&&Math.abs(r.y-y)<(r.h+height)/2+3))break;x+=(i%2===0?22:-12);y+=18;}
   x=Math.max(width/2+7,Math.min(w-width/2-7,x));y=Math.max(70+height/2,Math.min(h-51-height/2,y));occupied.push({x,y,w:width,h:height});label.el.style.left=x+'px';label.el.style.top=y+'px';
   if(Math.hypot(x-x0,y-y0)>14)leaders.push(`<line x1="${x0}" y1="${y0}" x2="${x}" y2="${y}" stroke="${label.el.style.color}" stroke-width=".8" opacity=".5"/>`);
  }
  let svg=this.labelLayer.querySelector('svg.label-lines');if(!svg){svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('label-lines');this.labelLayer.prepend(svg);}svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.innerHTML=leaders.join('');
 }
 snapshot(){return {projection:this.projection,view:this.view,position:this.camera.position.toArray(),up:this.camera.up.toArray(),target:this.controls.target.toArray(),zoom:this.camera.zoom,focused:this.focused};}
 restore(value){this.projection=value.projection;this.view=value.view;this.makeCamera(false);this.camera.position.fromArray(value.position);this.camera.up.fromArray(value.up);this.controls.target.fromArray(value.target);this.camera.zoom=value.zoom;this.camera.updateProjectionMatrix();this.controls.update();this.focused=!!value.focused;this.dirty=true;}
}
