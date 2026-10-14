import {emptyScene,createObject,validate} from '../../src/planar-model.mjs';
import {resolveScene} from '../../src/planar-relations.mjs';
import {E as elementaryCharge,U as atomicMass,TAU,solveScene} from '../../src/planar-physics.mjs';

const ref=o=>o.id+'.value';
const palette=['#b76537','#267f99','#8868ad','#53906c','#ae5673','#627bc0'];
const stamp=new Date().toISOString();

// These builders create the same objects and continuous definitions that the
// website's native editor saves. They do not provide a second trajectory engine.
class NativeScene {
 constructor(paper,question,key,title){this.paper=paper;this.question=question;this.key=key;this.title=title;this.scene=emptyScene();this.expectations=[];this.geometryExpectations=[];this.guidance=[];this.assumptions=[];this.particles=[];Object.assign(this.scene.display,{ink:false,grid:false,axes:true,magneticForce:true,electricForce:true});Object.assign(this.scene.aids,{center:false,radius:false,circle:false});Object.assign(this.scene.teaching,{enabled:true,components:false,pauseAtBoundary:false,boundaries:false,pastOnly:false});}
 add(kind,label,values={},defs={}){const o=createObject(kind,'o'+this.scene.nextId++,[0,0],values.shape||values.sourceType||values.lineType);Object.assign(o,values,{label,defs});this.scene.objects.push(o);return o;}
 param(label,value,unit='',slider){return this.add('parameter',label,{value,unit,visible:false,...(slider?{slider}: {})});}
 derived(label,unit,expression){const o=this.param(label,1,unit);o.defs.value=expression;return o;}
 point(label,x,y,defs={},offset={x:0,y:0}){return this.add('point',label,{x,y,labelOffset:offset,style:{color:'#456973',pointSize:3.5}},defs);}
 line(label,points,defs={},style={}){return this.add('line',label,{lineType:'segment',points,labelVisible:!!label,style:{color:'#a2b4b6',dash:'dashed',strokeWidth:1.2,...style}},defs);}
 field(label,shape,values={},defs={}){return this.add('field',label,{shape,B:-100,style:{color:'#658ca3',strokeWidth:1.3},...values},defs);}
 electric(label,shape,values={},defs={}){return this.add('electric',label,{shape,E0:1,fieldAngle:0,style:{color:'#c59d5f',strokeWidth:1.3},...values},defs);}
 particle(label,values={},defs={}){const o=this.add('particle',label,{mass:1,charge:1,speed:1,heading:0,style:{color:palette[this.particles.length%palette.length],strokeWidth:2.2,pointSize:4.3},...values},defs);this.particles.push(o.id);return o;}
 resolve(){const result=resolveScene(this.scene);if(result.issues.length)throw Error(this.title+': '+JSON.stringify(result.issues));validate(this.scene);return this;}
 expect(particle,timeS,values,tolerance=2e-7){this.expectations.push({traceId:particle.id,timeUs:timeS*1e6,values,tolerance});}
 done(seconds,{selected=this.particles[0],part='',axes=false}={}){
  this.scene.duration=seconds*1e6;this.scene.display.axes=axes;
  if(!this.particles.length)this.scene.teaching.enabled=false;
  if(this.particles.length>1){
   Object.assign(this.scene.display,{velocity:false,magneticForce:false,electricForce:false});
   Object.assign(this.scene.teaching,{components:true,componentFirst:false,componentSecond:false});
   const labelled=this.scene.objects.filter(o=>o.kind==='particle'&&o.labelVisible!==false);
   if(labelled.length>1)labelled.forEach((o,i)=>{o.labelOffset??=[{x:-25,y:12},{x:26,y:-18},{x:35,y:20},{x:-35,y:-20}][i%4];});
  }
  this.resolve();if(axes)for(const o of this.scene.objects)if(o.kind==='point'&&o.label==='O'&&o.x===0&&o.y===0)o.labelVisible=false;
  const fitObjectsOnly=this.focusObjectsOnly===true||this.paper===2&&this.question===7||this.paper===3&&this.question===9||this.paper===6&&this.question===8||this.paper===5&&this.question===11;
  const snapshot={scene:this.scene,context:{timeUs:0,playing:false,selected:selected||null,trace:this.particles.length?selected:null,segment:0,sidebar:false,panel:'objects',rate:1,readingSide:'after',fitObjectsOnly}};
  return {paper:this.paper,question:this.question,key:this.key,guidance:this.guidance,assumptions:this.assumptions,expectations:this.expectations,geometryExpectations:this.geometryExpectations,record:{id:`holiday-${this.paper}-${this.question}-${this.key}`,title:this.title,kind:'planar',snapshot,baseline:structuredClone(snapshot),status:'ready',part,createdAt:stamp,updatedAt:stamp}};
 }
}
function basic(g,{m=1,q=1,B=100}={}){return {m:g.param('m',m,'u'),q:g.param('q',q,'e'),B:g.param('B',B,'mT',{min:B*.6,max:B*1.5,step:B*.1})};}
function circleTime(m,q,B){return TAU*m*atomicMass/(Math.abs(q)*elementaryCharge*Math.abs(B)*.001);}
function pointFrom(g,label,xExpr,yExpr,offset){return g.point(label,0,0,{x:xExpr,y:yExpr},offset);}

function massSpectrometer(){
 const g=new NativeScene(2,6,'spectrometer','加速 → 速度选择 → 半圆分离'),{m,q,B}=basic(g),U=g.param('U_1',500,'V',{min:250,max:1000,step:50}),B2=g.param('B_2',150,'mT'),d=g.param('d',3,'cm'),gap=g.param('加速间距',2,'cm');
 const v=g.derived('v','m/s',`sqrt(2 * ${ref(q)} * ${ref(U)} / ${ref(m)})`),r=g.derived('r','cm',`${ref(m)} * ${ref(v)} / (${ref(q)} * ${ref(B2)})`);
 const U2=g.derived('U_2','V',`${ref(B)} * ${ref(d)} * ${ref(v)}`);
 g.electric('E_a','rectangle',{x:0,y:7,width:3,height:2,fieldAngle:270,labelOffset:{x:-65,y:-10}},{E0:`${ref(U)} / ${ref(gap)}`,height:ref(gap),width:ref(d),y:`6 cm + ${ref(gap)}/2`});
 g.field('B_1','rectangle',{x:0,y:3,width:3,height:6},{B:`-${ref(B)}`,width:ref(d)});
 g.electric('E_b','rectangle',{x:0,y:3,width:3,height:6,fieldAngle:180,labelOffset:{x:65,y:35}},{E0:`${ref(U2)} / ${ref(d)}`,width:ref(d)});
 g.field('B_2','half',{x:0,y:0,angle:270,labelOffset:{x:155,y:90}},{B:`-${ref(B2)}`});
 const p=g.particle('P',{x:0,y:8,speed:0,heading:270},{mass:ref(m),charge:ref(q),y:`6 cm + ${ref(gap)}`});
 pointFrom(g,'S','0 cm',`6 cm + ${ref(gap)}`,{x:-18,y:0});pointFrom(g,'O','0 cm','0 cm',{x:-18,y:12});pointFrom(g,'接收点',`2 * ${ref(r)}`,'0 cm',{x:18,y:-12});
 g.line('',[[-1.5,0],[6,0]],{point0x:`-${ref(d)}/2`,point1x:`2 * ${ref(r)} + 1 cm`});
 g.resolve();const speed=v.value,ta=2*gap.value*.01/speed,tb=.06/speed,tc=Math.PI*m.value*atomicMass/(q.value*elementaryCharge*B2.value*.001),arrival=ta+tb+tc;
 g.expect(p,ta,{xCm:0,yCm:6,speedMs:speed});g.expect(p,ta+tb,{xCm:0,yCm:0,speedMs:speed});g.expect(p,arrival,{xCm:2*r.value,yCm:0,speedMs:speed});
 g.guidance=['从静止开始播放，依次观察加速、两力平衡的直线段和匀速圆周段。','改变 U₁ 后，v、选择器电压 U₂ 和分离半径 r 随定义重算；磁场段动能不变。'];
 g.assumptions=['演示赋值 m=1u、q=e、U₁=500V、B₁=100mT、B₂=150mT；d、加速间距及选择器长度仅用于清楚排布，原题的符号关系均保留。'];
 return g.done(arrival,{});
}

function circleBoundary(key,ratio,title){
 const g=new NativeScene(2,7,key,title),{m,q,B}=basic(g),R=g.param('R',3,'cm',{min:2,max:4,step:.25}),rho=g.derived('r','cm',`${ratio} * ${ref(R)}`);
 const field=g.field('B','circle',{x:0,y:0,radius:3,labelOffset:{x:90,y:-95}},{radius:ref(R),B:`-${ref(B)}`});
 const T=g.derived('T','us',`2*pi*${ref(m)}/(${ref(q)}*${ref(B)})`);
 const angles=key==='near-period'?[-88,-60,-25,20,65]:[-80,-60,-40,-20,0,20,40,60,80];
 const exactAngle=key==='large-radius'?-30:key==='accessible-arc'?-60:-88;
 if(!angles.includes(exactAngle))angles.unshift(exactAngle);
 let selected;
 for(const angle of angles){const p=g.particle(`\\theta=${angle}^{\\circ}`,{x:-3,y:0,heading:angle,labelVisible:angle===exactAngle},{x:`-${ref(R)}`,mass:ref(m),charge:ref(q),speed:`orbitSpeed(${ref(m)},${ref(q)},${field.id}.B,${ref(rho)})`});if(angle===exactAngle)selected=p;}
 pointFrom(g,'A',`-${ref(R)}`,'0 cm',{x:-36,y:40});pointFrom(g,'O','0 cm','0 cm',{x:0,y:13});
 g.resolve();const period=T.value*1e-6;
 if(key==='large-radius'){pointFrom(g,'D',ref(R),'0 cm',{x:15,y:0});g.expect(selected,period/6,{xCm:R.value,yCm:0});g.guidance=['先看高亮的最长弧：轨迹圆心角 60°，在场时间 T/6。','再比较不同入射角的出射点；图中只取有限条代表轨迹，整圆可达由弦长关系证明。'];}
 else if(key==='accessible-arc'){pointFrom(g,'Q',`${ref(R)}/2`,`sqrt(3)*${ref(R)}/2`,{x:12,y:-15});g.expect(selected,period/2,{xCm:R.value/2,yCm:Math.sqrt(3)*R.value/2});g.guidance=['高亮粒子的半圆弦长达到 2r=√3R。','对应场域圆心角为120°，出射点覆盖圆周的三分之一；其余颜色显示不同入射角。'];}
 else g.guidance=['比较接近切向入射的轨迹与普通入射轨迹；接近内切情形时，在场时间可接近一个周期。','不要把不同弧长的在场时间误认成统一的四分之一周期。'];
 g.assumptions=['原题 m、q、B、R 未指定数值；演示取 m=1u、q=e、B=100mT、R=3cm。场域与轨迹半径保持当前 r/R 关系，速度由回旋关系持续计算。'];
 return g.done(period*(key==='large-radius'?.23:1.03),{selected:selected.id,});
}

function quadrantTransition(){
 const g=new NativeScene(2,11,'quadrants','第四象限圆弧 → 第一象限减速偏转'),{m,q,B}=basic(g),r=g.param('r',3,'cm',{min:2,max:4,step:.2});
 const v=g.derived('v_0','m/s',`${ref(q)}*${ref(B)}*${ref(r)}/${ref(m)}`),e=g.derived('E','kV/m',`sqrt(3)*${ref(B)}*${ref(v)}/2`);
 g.field('B','quadrant',{x:0,y:0,angle:270,labelOffset:{x:150,y:125}},{B:ref(B)});
 g.electric('E','quadrant',{x:0,y:0,fieldAngle:90,labelOffset:{x:120,y:0}},{E0:ref(e)});
 const p=g.particle('-q',{x:0,y:-5,speed:1,heading:0},{mass:ref(m),charge:`-${ref(q)}`,speed:ref(v),y:`-(1+sqrt(3)/2)*${ref(r)}`});
 pointFrom(g,'P','0 cm',`-(1+sqrt(3)/2)*${ref(r)}`,{x:-20,y:10});pointFrom(g,'M',`${ref(r)}/2`,'0 cm',{x:15,y:18});pointFrom(g,'N','0 cm',`${ref(r)}/(4*sqrt(3))`,{x:-18,y:-15});
 g.resolve();const w=q.value*elementaryCharge*B.value*.001/(m.value*atomicMass),tm=5*Math.PI/(6*w),te=r.value*.01/(Math.sqrt(3)*v.value),total=tm+te;
 g.expect(p,tm,{xCm:r.value/2,yCm:0,vxMs:-Math.sqrt(3)*v.value/2,vyMs:v.value/2});g.expect(p,total,{xCm:0,yCm:r.value/(4*Math.sqrt(3)),vxMs:-Math.sqrt(3)*v.value/2,vyMs:0});
 g.guidance=['播放到 M 暂停，观察速度向左上，与 −x 方向成30°。','进入电场后 vx 保持不变，vy 逐渐减小；抵达 N 时 vy=0，速度沿 −x。'];g.assumptions=['演示选择 r=3cm、m=1u、q=e、B=100mT，据原题关系持续确定 v₀、E、P、M、N；实际粒子电荷为 −q。'];
 return g.done(total,{axes:true});
}

function twoCircleParticles(){
 const g=new NativeScene(3,9,'two-signs','同质量异号粒子的半径与周期'),{m,q,B}=basic(g),R=g.param('R',3,'cm'),ra=g.param('r_a',2.4,'cm'),rb=g.param('r_b',4.2,'cm');
 g.field('B','circle',{radius:3,x:0,y:0,labelOffset:{x:130,y:-100}},{B:`-${ref(B)}`,radius:ref(R)});
 const a=g.particle('a^-',{x:-3,y:0,heading:0},{x:`-${ref(R)}`,mass:ref(m),charge:`-${ref(q)}`,speed:`${ref(q)}*${ref(B)}*${ref(ra)}/${ref(m)}`});
 const b=g.particle('b^+',{x:-3,y:0,heading:0},{x:`-${ref(R)}`,mass:ref(m),charge:ref(q),speed:`${ref(q)}*${ref(B)}*${ref(rb)}/${ref(m)}`});
 pointFrom(g,'A',`-${ref(R)}`,'0 cm',{x:-18,y:0});pointFrom(g,'O','0 cm','0 cm',{x:0,y:18});
 const T=g.derived('T','us',`2*pi*${ref(m)}/(${ref(q)}*${ref(B)})`);g.resolve();
 const w=TAU/(T.value*1e-6);for(const [p,r,sign]of [[a,ra,-1],[b,rb,1]]){const phi=2*Math.atan(R.value/r.value),t=phi/w;g.expect(p,t,{xCm:-R.value+r.value*Math.sin(phi),yCm:sign*r.value*(1-Math.cos(phi)),speedMs:p.speed*1e5});}
 g.guidance=['a 向下、b 向上偏转，由此识别电性。','图示保持 r_b>r_a；两粒子周期相同，不表示它们在有限圆场内停留时间相同。'];g.assumptions=['原图没有给出速度比。r_a=0.8R、r_b=1.4R 是演示选择，只表达 r_b>r_a，不作为题设数值。'];
 return g.done(.52*T.value*1e-6,{});
}

function selectorSquare(){
 const g=new NativeScene(3,10,'selector-square','加速与筛选后恰到正方形 P 点'),{m,q}=basic(g),U=g.param('U',300,'V'),d=g.param('d',4,'cm'),e=g.param('E',15,'kV/m');
 const v=g.derived('v','m/s',`sqrt(4*${ref(q)}*${ref(U)}/${ref(m)})`),B1=g.derived('B_1','mT',`${ref(e)}/${ref(v)}`),B2=g.derived('B_2','mT',`${ref(m)}*${ref(v)}/(${ref(q)}*${ref(d)})`);
 g.electric('E_a','rectangle',{x:-7,y:0,width:2,height:2,fieldAngle:0},{E0:`${ref(U)}/(2 cm)`});
 g.field('B_1','rectangle',{x:-3,y:0,width:6,height:4,labelOffset:{x:0,y:-90}},{B:`-${ref(B1)}`,height:ref(d)});
 g.electric('E','rectangle',{x:-3,y:0,width:6,height:4,fieldAngle:270,labelOffset:{x:0,y:60}},{E0:ref(e),height:ref(d)});
 g.field('B_2','rectangle',{x:1,y:-1,width:2,height:2,labelOffset:{x:36,y:30}},{x:`${ref(d)}/4`,y:`-${ref(d)}/4`,width:`${ref(d)}/2`,height:`${ref(d)}/2`,B:ref(B2)});
 const p=g.particle('+2q',{x:-8,y:0,speed:0,heading:0},{mass:ref(m),charge:`2*${ref(q)}`});
 for(const [label,x,y,off]of [['M','0 cm','0 cm',{x:-10,y:-14}],['N',`${ref(d)}/2`,'0 cm',{x:12,y:-16}],['P',`${ref(d)}/2`,`-${ref(d)}/2`,{x:14,y:14}],['Q','0 cm',`-${ref(d)}/2`,{x:-14,y:14}]])pointFrom(g,label,x,y,off);
 g.resolve();const ta=.04/v.value,ts=.06/v.value,tm=(Math.PI/2)*(d.value*.005)/v.value,total=ta+ts+tm;
 g.expect(p,ta+ts,{xCm:0,yCm:0,speedMs:v.value});g.expect(p,total,{xCm:d.value/2,yCm:-d.value/2,vxMs:0,vyMs:-v.value});
 g.guidance=['先看选择器中两个力反向且等大，再观察 M→P 的四分之一圆弧。','改变 U、d 或 E，B₁、B₂按题设关系重算，仍满足 r=d/2 和 B₁/B₂=Ed/(4U)。'];g.assumptions=['演示取 m=1u、q=e、U=300V、d=4cm、E=15kV/m，实际粒子电荷为+2q；加速区及选择器长度是排布参数。'];
 return g.done(total,{});
}

function ionImplant(paper,question,mode){
 const title=mode==='overlay'?'相同轨道上的甲乙离子对照':`${mode==='a'?'甲':'乙'}离子从静止加速到叶片`;
 const g=new NativeScene(paper,question,'implant-'+mode,title),{m,q,B}=basic(g),U1=g.param('U_1',400,'V'),ratio=g.param('U_1/U_2',2,'',{min:1.2,max:3,step:.2}),U2=g.derived('U_2','V',`${ref(U1)}/${ref(ratio)}`),m2=g.derived('m_乙','u',`${ref(m)}*${ref(ratio)}`);
 const v1=g.derived('v_甲','m/s',`sqrt(2*${ref(q)}*${ref(U1)}/${ref(m)})`),v2=g.derived('v_乙','m/s',`sqrt(2*${ref(q)}*${ref(U2)}/${ref(m2)})`),r=g.derived('r','cm',`${ref(m)}*${ref(v1)}/(${ref(q)}*${ref(B)})`);
 g.field('B','half',{x:0,y:0,angle:270,labelOffset:{x:135,y:80}},{B:`-${ref(B)}`});
 g.line('叶片材料',[[1,0],[7,0]],{point0x:`1.5*${ref(r)}`,point1x:`2*${ref(r)}+1 cm`},{color:'#707d82',dash:'solid',strokeWidth:3});
 const ps=[];
 if(mode!=='overlay')g.electric('加速电场','rectangle',{x:0,y:1,width:1.4,height:2,fieldAngle:270},{E0:`${ref(mode==='a'?U1:U2)}/(2 cm)`});
 for(const which of mode==='overlay'?['a','b']:[mode]){const mass=which==='a'?m:m2,speed=which==='a'?v1:v2;ps.push({which,p:g.particle(which==='a'?'甲':'乙',{x:0,y:mode==='overlay'?0:2,speed:0,heading:270},{mass:ref(mass),charge:ref(q),...(mode==='overlay'?{speed:ref(speed)}:{})}),mass,speed});}
 pointFrom(g,'O','0 cm','0 cm',{x:-16,y:12});pointFrom(g,'落点',`2*${ref(r)}`,'0 cm',{x:20,y:-18});
 if(mode==='overlay'){g.focusObjectsOnly=true;const bottom=pointFrom(g,'',ref(r),`-${ref(r)}`);bottom.labelVisible=false;}
 g.resolve();let total=0;
 for(const {p,mass,speed}of ps){const ta=mode==='overlay'?0:.04/speed.value,tm=Math.PI*mass.value*atomicMass/(q.value*elementaryCharge*B.value*.001);g.expect(p,ta+tm,{xCm:2*r.value,yCm:0,speedMs:speed.value});total=Math.max(total,ta+tm);}
 g.guidance=['甲、乙的电荷量相等，U₁>U₂；相同轨道要求 m甲U₁=m乙U₂。','半圆偏转角都为180°，但速度、动能和飞行时间不同；对照场景从入磁场时刻同步开始。'];g.assumptions=['演示选 U₁/U₂=2，不把这一比值当成题设。m乙由同轨条件持续计算；两个加速过程分别展示，避免在同一区域同时施加两个不同电压。'];
 return g.done(total,{});
}

function acceleratingStrip(balanced){
 const g=new NativeScene(4,11,balanced?'balanced':'strip',balanced?'增加横向电场后沿直线通过':'加速后在条形磁场中偏转60°'),{m,q}=basic(g),U=g.param('U',350,'V'),d=g.param('d',3,'cm',{min:2,max:4,step:.25});
 const v=g.derived('v','m/s',`sqrt(2*${ref(q)}*${ref(U)}/${ref(m)})`),B=g.derived('B','mT',`sqrt(6*${ref(U)}*${ref(m)}/${ref(q)})/(2*${ref(d)})`),r=g.derived('r','cm',`2*${ref(d)}/sqrt(3)`);
 g.electric('加速电场','rectangle',{x:0,y:1,width:1.5,height:2,fieldAngle:90},{E0:`${ref(U)}/(2 cm)`});
 g.field('B','strip',{x:0,y:-1.5,width:3,angle:90,labelOffset:{x:-170,y:0}},{B:`-${ref(B)}`,y:`-${ref(d)}/2`,width:ref(d)});
 if(balanced)g.electric('E','strip',{x:0,y:-1.5,width:3,angle:90,fieldAngle:180,labelOffset:{x:160,y:0}},{E0:`sqrt(3)*${ref(U)}/${ref(d)}`,y:`-${ref(d)}/2`,width:ref(d)});
 const p=g.particle('-q',{x:0,y:2,speed:0,heading:270},{mass:ref(m),charge:`-${ref(q)}`});
 pointFrom(g,'M','0 cm','0 cm',{x:16,y:-13});pointFrom(g,'N',balanced?'0 cm':`-${ref(r)}/2`,`-${ref(d)}`,{x:-15,y:15});g.resolve();
 const ta=.04/v.value,tm=balanced?d.value*.01/v.value:(Math.PI/3)*r.value*.01/v.value,total=ta+tm;
 g.expect(p,ta,{xCm:0,yCm:0,speedMs:v.value});g.expect(p,total,{xCm:balanced?0:-r.value/2,yCm:-d.value,vyMs:balanced?-v.value:-v.value/2,vxMs:balanced?0:-Math.sqrt(3)*v.value/2});
 g.guidance=balanced?['加入向左的电场，负粒子的电场力向右，抵消向左的磁场力。','电场大小持续保持 E=vB=√3U/d，因而改动 U、d 后仍能直线通过。']:['按题图向左偏转，演示粒子取负电荷；q 表示电荷量绝对值。','在 N 处读取速度方向，偏转角60°，半径2d/√3。'];g.assumptions=['原题未在文字中明确电性，负电荷由题图中“向下入射、磁场向里、向左偏转”确定。演示取 m=1u、q=e、U=350V、d=3cm。'];
 return g.done(total,{});
}

function doubleCapacitor(){
 const g=new NativeScene(4,12,'double-capacitor','两次电场加速 → 第一象限圆弧'),{m,q}=basic(g),U=g.param('U',250,'V'),d=g.param('d',2,'cm',{min:1.5,max:3,step:.25}),gap=g.derived('C_1间距','cm',`${ref(d)}/2`);
 const vn=g.derived('v_N','m/s',`sqrt(2*${ref(q)}*${ref(U)}/${ref(m)})`),B=g.derived('B','mT',`sqrt(2*${ref(m)}*${ref(U)}/${ref(q)})/${ref(d)}`);
 g.electric('C_1','rectangle',{x:-4.5,y:0,width:1,height:2,fieldAngle:0},{x:`-2*${ref(d)}-${ref(gap)}/2`,width:ref(gap),height:ref(d),E0:`${ref(U)}/${ref(gap)}`});
 g.electric('C_2','rectangle',{x:-2,y:1,width:4,height:2,fieldAngle:90},{x:`-${ref(d)}`,y:`${ref(d)}/2`,width:`2*${ref(d)}`,height:ref(d),E0:`${ref(U)}/${ref(d)}`});
 g.field('B','quadrant',{x:0,y:0,labelOffset:{x:130,y:-90}},{B:ref(B)});
 const p=g.particle('+q',{x:-5,y:0,speed:0,heading:0},{x:`-2*${ref(d)}-${ref(gap)}`,mass:ref(m),charge:ref(q)});
 for(const [name,x,y,off]of [['M',`-2*${ref(d)}-${ref(gap)}`,'0 cm',{x:-10,y:17}],['N',`-2*${ref(d)}`,'0 cm',{x:10,y:17}],['O','0 cm','0 cm',{x:0,y:16}],['P','0 cm',ref(d),{x:-13,y:-15}],['出射点',`(1+sqrt(2))*${ref(d)}`,'0 cm',{x:20,y:15}]])pointFrom(g,name,x,y,off);
 g.resolve();const ta=2*gap.value*.01/vn.value,te=2*d.value*.01/vn.value,omega=q.value*elementaryCharge*B.value*.001/(m.value*atomicMass),tm=3*Math.PI/(4*omega),total=ta+te+tm;
 g.expect(p,ta+te,{xCm:0,yCm:d.value,vxMs:vn.value,vyMs:vn.value});g.expect(p,total,{xCm:(1+Math.sqrt(2))*d.value,yCm:0,vxMs:0,vyMs:-Math.sqrt(2)*vn.value});
 g.guidance=['N 点水平速度来自 C₁；C₂ 提供相同电压，使 P 点的竖直速度与水平速度相等。','进入磁场时与 +y 成45°；圆心位于(d,0)，半径√2d，最终垂直 x 轴出射。'];g.assumptions=['m=1u、q=e、U=250V、d=2cm 为演示赋值；C₁ 间距选 d/2，C₂ 长度由原题到达 P 的条件确定为2d。'];
 return g.done(total,{axes:true});
}

function nuclearComparison(){
 const g=new NativeScene(6,1,'nuclear-radii','同速质子 氚核 α粒子的偏转'),B=g.param('B',100,'mT',{min:70,max:150,step:10}),speed=g.param('v',1.5,'speed');
 g.field('B','infinite',{x:-3,y:3,labelOffset:{x:-90,y:-90}},{B:`-${ref(B)}`});const particles=[];
 for(const [label,m,q]of [['p',1,1],['{}^3_1H',3,1],['\\alpha',4,2]])particles.push(g.particle(label,{x:0,y:0,mass:m,charge:q,heading:90},{speed:ref(speed)}));
 g.point('O',0,0,{}, {x:12,y:16});g.resolve();const maxT=Math.max(...particles.map(p=>circleTime(p.mass,p.charge,B.value)));
 for(const p of particles){const t=circleTime(p.mass,p.charge,B.value)/4,r=p.mass*atomicMass*p.speed*1e5/(p.charge*elementaryCharge*B.value*.001)*100;g.expect(p,t,{xCm:-r,yCm:r});}
 g.guidance=['三种粒子同速向上进入向里的磁场，均向左偏转。','按核质量数近似，轨迹半径 r_p:r_氚:r_α=1:3:2；最大半径属于氚核。'];g.assumptions=['核质量按高中题常用的质量数近似为1u、3u、4u；B=100mT、v=1.5×10⁵m/s为演示值。'];
 return g.done(maxT,{});
}

function negativeMassComparison(){
 const g=new NativeScene(6,4,'mass-period','同电荷同速度的负粒子比较'),{m,q,B}=basic(g),ratio=g.param('m_b/m_a',1.7,'',{min:1.2,max:2.5,step:.1}),speed=g.param('v',1.5,'speed');
 g.field('B','infinite',{x:3,y:2,labelOffset:{x:90,y:-100}},{B:`-${ref(B)}`});
 const a=g.particle('a^-',{x:0,y:0,heading:90},{mass:ref(m),charge:`-${ref(q)}`,speed:ref(speed)}),b=g.particle('b^-',{x:0,y:0,heading:90},{mass:`${ref(m)}*${ref(ratio)}`,charge:`-${ref(q)}`,speed:ref(speed)});g.point('O',0,0,{}, {x:-15,y:16});g.resolve();
 for(const p of [a,b]){const t=circleTime(p.mass,p.charge,B.value)/4,r=p.mass*atomicMass*p.speed*1e5/(Math.abs(p.charge)*elementaryCharge*B.value*.001)*100;g.expect(p,t,{xCm:r,yCm:r});}
 g.guidance=['同向初速度却向右偏转，说明 a、b 均带负电。','保持相同速度和电荷量，m_b>m_a 时 r_b>r_a、T_b>T_a，而 a_b<a_a。'];g.assumptions=['质量比1.7只用于符合题图的大小比较；原题没有给出具体比值。'];
 return g.done(circleTime(b.mass,b.charge,B.value),{});
}

function squareExits(mode){
 const title={choice:'选项C 对应轨迹从 ab 边出射',families:'不同速率与四条出射边',time:'两种小速率的在场时间对照'}[mode];
 const g=new NativeScene(6,8,'square-'+mode,title),{m,q,B}=basic(g),a=g.param('a',3,'cm',{min:2,max:4,step:.25});
 g.field('B','rectangle',{x:3,y:0,width:6,height:6,labelOffset:{x:80,y:-100}},{x:ref(a),width:`2*${ref(a)}`,height:`2*${ref(a)}`,B:`-${ref(B)}`});
 const ratios=mode==='choice'?[['4/3','\\frac{4}{3}',4/3]]:mode==='time'?[['1/6','\\frac{1}{6}',1/6],['1/3','\\frac{1}{3}',1/3]]:[['3/10','0.3',.3],['4/5','0.8',.8],['4/3','\\frac{4}{3}',4/3],['11/5','2.2',2.2]],ps=[];
 for(const [i,[expression,label,rho]]of ratios.entries())ps.push({rho,p:g.particle(mode==='families'?`P_${i+1}`:mode==='choice'?'P':`r=${label}a`,{x:0,y:0,heading:-60},{mass:ref(m),charge:ref(q),speed:`orbitSpeed(${ref(m)},${ref(q)},${ref(B)},(${expression})*${ref(a)})`})});
 if(mode==='families')g.add('label','\\begin{gathered}P_1:\\ r=0.3a\\\\P_2:\\ r=0.8a\\\\P_3:\\ r=\\frac{4}{3}a\\\\P_4:\\ r=2.2a\\end{gathered}',{x:8,y:1,fontSize:15,labelWidth:210,labelHeight:145,style:{color:'#52727a'}});
 if(mode==='choice')g.add('label','r=\\frac{4}{3}a', {x:8,y:1,fontSize:17,labelWidth:190,labelHeight:65,style:{color:'#52727a'}});
 for(const [name,x,y,off]of [['P','0 cm','0 cm',{x:-18,y:0}],['a',`2*${ref(a)}`,`-${ref(a)}`,{x:15,y:15}],['b',`2*${ref(a)}`,ref(a),{x:15,y:-15}],['c','0 cm',ref(a),{x:-15,y:-15}],['d','0 cm',`-${ref(a)}`,{x:-15,y:15}]])pointFrom(g,name,x,y,off);
 g.resolve();const period=circleTime(m.value,q.value,B.value);
 if(mode==='time')for(const {p,rho}of ps)g.expect(p,period*5/6,{xCm:0,yCm:rho*a.value});
 else if(mode==='choice'){const r=4*a.value/3,cx=Math.sqrt(3)*r/2,cy=r/2,phi0=-5*Math.PI/6,phi=Math.acos((2*a.value-cx)/r),turn=(-phi-phi0+TAU)%TAU,t=turn/TAU*period;g.expect(ps[0].p,t,{xCm:2*a.value,yCm:cy-r*Math.sin(phi)});}
 g.guidance=mode==='time'?['两条轨迹都从 cd 返回，均转过300°，在场时间同为5T/6。','半径和路径长度不同，不代表在同一磁场中转过相同角度需要不同时间。']:mode==='choice'?['初速度与竖直向下方向成30°；本场景 r=4a/3，出射边为右侧 ab。','用时间轴停在出场事件，核对位置 x=2a。']:['四条轨迹分别展示低速返回 cd、中速从 bc、较大速度从 ab、更大速度从 ad。','临界半径对应相切；仅触及边界不等同于穿过边界。'];
 g.assumptions=['演示 m=1u、q=e、B=100mT、a=3cm；每条轨迹保持给定 r/a，速度随 m、q、B、a 自动计算。'];
 return g.done(period*.9,{});
}

function returnBetweenFields(){
 const g=new NativeScene(6,11,'return-fields','磁场 → 电场往返 → 再入磁场'),m=g.param('m',1.6e-27,'kg'),q=g.param('q',1.6e-19,'C'),B=g.param('B',.20,'T'),v=g.param('v',2e6,'m/s'),e=g.param('E_演示',1000,'kV/m',{min:500,max:1500,step:100});
 g.field('B','half',{x:0,y:25,labelOffset:{x:175,y:-70}},{B:`-${ref(B)}`});
 g.electric('E','half',{x:0,y:22,angle:180,fieldAngle:30,labelOffset:{x:-135,y:30}},{E0:ref(e)});
 const p=g.particle('P^+',{x:10,y:0,heading:30},{mass:ref(m),charge:ref(q),speed:ref(v)});g.point('A',10,0,{}, {x:14,y:18});g.point('O',0,0,{}, {x:-15,y:18});g.point('C',0,10*Math.sqrt(3),{}, {x:-15,y:10});g.point('D',0,20*Math.sqrt(3),{}, {x:-15,y:-15});
 g.resolve();const omega=q.value*B.value/m.value,tm1=Math.PI/omega,te=2*v.value/(q.value*e.value*1000/m.value),tm2=2*Math.PI/(3*omega),total=tm1+te+tm2;
 g.expect(p,tm1,{xCm:0,yCm:10*Math.sqrt(3),vxMs:-Math.sqrt(3)*v.value/2,vyMs:-v.value/2});g.expect(p,tm1+te,{xCm:0,yCm:10*Math.sqrt(3),vxMs:Math.sqrt(3)*v.value/2,vyMs:v.value/2});g.expect(p,total,{xCm:0,yCm:20*Math.sqrt(3)});
 g.guidance=['第一次到 C 时速度与电场反向，电场中先减速到零，再原路加速回 C。','第一次磁场段转180°，第二次转120°；只累计两段磁场时间得2.6×10⁻⁷s。','改变演示 E 只改变电场往返深度和用时，不改变磁场累计时间。'];g.assumptions=['m、q、B、v、A坐标直接采用题设。题目没有给出 E 的大小，演示选1.0×10⁶V/m并提供滑杆，不把电场往返时间当成题目所问的磁场时间。'];
 return g.done(total,{axes:true});
}

function collisionComparison(after){
 const g=new NativeScene(5,7,after?'collision-after':'collision-before',after?'碰撞后同半径 不同速率':'碰撞前 A 到 D 的运动'),{m,q,B}=basic(g),R=g.param('R',3,'cm'),ratio=g.param('中性粒子质量/m',1,'',{min:.25,max:2,step:.25}),angle=g.param('A到D转角',60,'deg',{min:30,max:75,step:5});
 const v=g.derived('v','m/s',`${ref(q)}*${ref(B)}*${ref(R)}/${ref(m)}`);
 g.field('B','circle',{x:0,y:0,radius:3,labelOffset:{x:-115,y:-80}},{B:`-${ref(B)}`,radius:ref(R)});
 pointFrom(g,'A','0 cm',`-${ref(R)}`,{x:-13,y:18});pointFrom(g,'O','0 cm','0 cm',{x:-18,y:-15});pointFrom(g,'C',ref(R),'0 cm',{x:18,y:0});
 const D=pointFrom(g,'D',`${ref(R)}*(1-cos(${ref(angle)}))`,`${ref(R)}*(sin(${ref(angle)})-1)`,{x:0,y:-23});
 const a=g.particle(after?'未碰撞对照':'入射粒子',{x:0,y:-3,heading:90},{mass:ref(m),charge:`-${ref(q)}`,speed:ref(v),...(after?{position:`pos(${D.id})`,heading:`90 deg-${ref(angle)}`}:{y:`-${ref(R)}`})});
 let b;if(after)b=g.particle('结合后粒子',{x:0,y:0,heading:30},{mass:`${ref(m)}*(1+${ref(ratio)})`,charge:`-${ref(q)}`,speed:`${ref(v)}/(1+${ref(ratio)})`,position:`pos(${D.id})`,heading:`90 deg-${ref(angle)}`});
 let neutral;if(!after)neutral=g.particle('q=0',{x:0,y:0,charge:0,speed:0,heading:0,labelOffset:{x:30,y:18}},{mass:`${ref(m)}*${ref(ratio)}`,position:`pos(${D.id})`});
 g.resolve();const omega=q.value*elementaryCharge*B.value*.001/(m.value*atomicMass),phi=angle.value*Math.PI/180,time=after?(Math.PI/2-phi)/omega*(1+ratio.value):phi/omega;
 if(after){g.expect(a,(Math.PI/2-phi)/omega,{xCm:R.value,yCm:0});g.expect(b,time,{xCm:R.value,yCm:0,speedMs:v.value/(1+ratio.value)});}else g.expect(a,time,{xCm:D.x,yCm:D.y,vxMs:v.value*Math.sin(phi),vyMs:v.value*Math.cos(phi)});
 if(neutral)g.expect(neutral,time,{xCm:D.x,yCm:D.y,speedMs:0});
 g.guidance=after?['将中性粒子并入后，质量增大，动量 mv 保持不变，电荷量也不变。','两条原生轨迹重合，结合后粒子走得更慢；r=p/(qB) 不变，仍到 C。']:['先播放到 D；之后切换“碰撞后”场景，从同一位置和切向速度方向继续比较。','原生求解器计算碰撞前后的自由运动；碰撞瞬间按动量守恒给出初态，不把它标成沙盒已实现的碰撞检测。'];
 g.assumptions=['D 的具体位置与中性粒子质量未给定。演示取轨道半径R、A到D转角60°、中性粒子质量m；可改后两项检验结论。由题图向右偏转推得入射粒子带负电。'];
 return g.done(time,{selected:after?b.id:a.id,});
}

function parabolicFocusing(detail=false){
 const g=new NativeScene(5,11,detail?'parabola-electric':'parabola-full',detail?'电场段 不同发射点同时指向 O':'原题数值 三条轨迹在 y=-10m 再相遇');
 const m=g.param('m',1.67e-17,'kg'),q=g.param('q',1.6e-15,'C'),e=g.param('E',5.01e3,'N/C'),B=g.param('B',.835,'T'),extent=g.param('最大发射x',.9,'m',{min:.6,max:1.2,step:.1});
 const v0=g.derived('v_0','m/s',`sqrt(${ref(q)}*${ref(e)}/(${ref(m)}*(3/(1 m))))`);
 const count=18,points=Array.from({length:count+1},(_,i)=>[150*i/count,150*1.5*(i/count)**2]);points.push([0,337.5]);
 const boundaryDefs={};for(let i=0;i<=count;i++){boundaryDefs['point'+i+'x']=`${ref(extent)}*${i}/${count}`;boundaryDefs['point'+i+'y']=`(1.5/(1 m))*(${ref(extent)}*${i}/${count})^2`;}
 boundaryDefs['point'+(count+1)+'x']='0 m';boundaryDefs['point'+(count+1)+'y']=`(1.5/(1 m))*${ref(extent)}^2`;
 g.electric('E','polygon',{points,fieldAngle:270,labelOffset:{x:35,y:-35}},{...boundaryDefs,E0:ref(e)});
 if(!detail)g.field('B','quadrant',{x:0,y:0,angle:180,labelOffset:{x:-120,y:170}},{B:`-${ref(B)}`});
 g.point('O',0,0,{}, {x:-17,y:-15});if(!detail)g.point('(0,-10\\,m)',0,-1000,{}, {x:75,y:20});
 const ps=[];
 for(const fraction of [1/9,1/3,1])ps.push({fraction,p:g.particle(`x_0=${fraction===1?'a':fraction===1/3?'a/3':'a/9'}`,{x:0,y:0,heading:180,labelVisible:detail},{mass:ref(m),charge:ref(q),speed:ref(v0),x:`${ref(extent)}*${fraction}`,y:`(1.5/(1 m))*(${ref(extent)}*${fraction})^2`})});
 if(!detail)g.add('label','\\begin{gathered}\\text{橙：}x_0=a/9\\\\\\text{蓝：}x_0=a/3\\\\\\text{紫：}x_0=a\\\\\\text{a 为最大发射横坐标}\\end{gathered}',{x:420,y:-220,fontSize:14,labelWidth:250,labelHeight:130,style:{color:'#52727a'}});
 g.resolve();const acc=q.value*e.value/m.value,omega=q.value*B.value/m.value;let total=0;
 for(const {fraction,p}of ps){const x=extent.value*fraction,te=x/v0.value,vy=-acc*te,tb=2*Math.atan(v0.value/Math.abs(vy))/omega;g.expect(p,te,{xCm:0,yCm:0,vxMs:-v0.value,vyMs:vy});if(!detail)g.expect(p,te+tb,{xCm:0,yCm:-2*v0.value/omega*100});total=Math.max(total,detail?te:te+tb);}
 g.guidance=['题设数据直接输入原生求解器，v₀=400m/s；坐标轴仍以沙盒的cm显示，100cm=1m。','第二次过y轴位于原点下方，实际坐标为(0,-10m)。原解析将距离10m误写成正坐标，已在文字解析中校勘。','曲线边界以18段原生多边形边显示，每个发射点是精确边界结点。本题规定的水平发射轨迹完全位于真实场域及多边形内，在O离场，因而这些轨迹的受场过程相同；不能把这幅折线场域用于任意新方向的越界问题。'];
 g.assumptions=['m、q、E、B均采用原题数值，没有按演示尺度更改。示例发射位置选x₀=0.1m、0.3m、0.9m；这些是题目允许的可移动发射器位置，a表示自由参数“最大发射x”。'];
 return g.done(total,{axes:true});
}

function repeatedAcceleration(n){
 const g=new NativeScene(5,12,'repeat-'+n,`经过${n}次加速后到达 K`),{m,q,B}=basic(g),L=g.param('L',3,'cm'),e=g.param('E',8,'kV/m');
 const N=g.derived('n','',String(n)),vn=g.derived('v_n','m/s',`sqrt(2*${ref(N)}*${ref(q)}*${ref(e)}*${ref(L)}/${ref(m)})`),rn=g.derived('r_n','cm',`${ref(m)}*${ref(vn)}/(${ref(q)}*${ref(B)})`);
 g.field('B_I','half',{x:0,y:0,angle:180,labelOffset:{x:-170,y:-140}},{B:`-${ref(B)}`});
 g.field('B_{II}','half',{x:3,y:0,angle:0,labelOffset:{x:170,y:-140}},{x:ref(L),B:`-${ref(B)}`});
 g.electric('E','rectangle',{x:1.5,y:0,width:3,height:.06,fieldAngle:0,labelOffset:{x:0,y:35}},{x:`${ref(L)}/2`,width:ref(L),E0:ref(e)});
 const p=g.particle('P^+',{x:0,y:0,speed:0,heading:0},{mass:ref(m),charge:ref(q)});g.point('P',0,0,{}, {x:-20,y:16});pointFrom(g,'Q',ref(L),'0 cm',{x:15,y:16});pointFrom(g,'K','0 cm',`2*${ref(rn)}`,{x:-18,y:-18});
 g.resolve();const a=q.value*elementaryCharge*e.value*1000/(m.value*atomicMass),half=Math.PI*m.value*atomicMass/(q.value*elementaryCharge*B.value*.001);let elapsed=0,vPrevious=0;
 for(let k=1;k<=n;k++){const vk=Math.sqrt(2*k*a*L.value*.01),rk=vk*half/Math.PI;elapsed+=(vk-vPrevious)/a;g.expect(p,elapsed,{xCm:L.value,yCm:0,speedMs:vk});elapsed+=half+L.value*.01/vk;g.expect(p,elapsed,{xCm:0,yCm:2*rk*100,speedMs:vk});if(k<n)elapsed+=half;vPrevious=vk;}
 g.guidance=['P→Q 的电场每次做功 qEL；两侧磁场只改变方向。每轮返回 P 后再次加速，半径逐次增大。',`此场景在第${n}次到达K时结束观察，K外的引出装置没有被补造。`,'n=1时总时间由加速段、半圆段和无场直线段组成；切换n=3场景观察多轮积累。'];g.assumptions=['演示选m=1u、q=e、B=100mT、L=3cm、E=8kV/m。窄加速区高度只作可视化处理；实际轨迹始终沿其中心线。两场景分别固定n=1和n=3。'];
 return g.done(elapsed,{});
}

function cyclotron(paper,question,key,{mass=1,charge=1,referenceMass=mass,referenceCharge=charge,U=10,correct=true,label='P'}={}){
 const g=new NativeScene(paper,question,key,correct?`${label} 共振加速的完整过程`:`${label} 保持原频率后的比较`),m=g.param('m',mass,'u'),q=g.param('q',charge,'e'),B=g.param('B',180,'mT'),R=g.param('R',4,'cm'),gap=g.param('狭缝宽',.006,'cm'),voltage=g.param('U',U,'V');
 const sourceMass=g.param('设定频率的质量',referenceMass,'u'),sourceCharge=g.param('设定频率的电荷',referenceCharge,'e');
 const period=g.derived('T_交流','us',`2*pi*${ref(sourceMass)}/(${ref(sourceCharge)}*${ref(B)})`);
 g.field('D_1','semicircle',{x:0,y:.003,radius:4,angle:0},{y:`${ref(gap)}/2`,radius:ref(R),B:`-${ref(B)}`});
 g.field('D_2','semicircle',{x:0,y:-.003,radius:4,angle:180},{y:`-${ref(gap)}/2`,radius:ref(R),B:`-${ref(B)}`});
 g.electric('E_交流','rectangle',{x:0,y:0,width:8,height:.006,fieldAngle:90,waveform:'square',phase:90,labelOffset:{x:170,y:40}},{width:`2*${ref(R)}`,height:ref(gap),E0:`${ref(voltage)}/${ref(gap)}`,period:ref(period)});
 const p=g.particle(label,{x:0,y:-.003,speed:0,heading:90},{y:`-${ref(gap)}/2`,mass:ref(m),charge:ref(q)});
 g.resolve();const T=circleTime(mass,charge,B.value),idealEnergyJ=(charge*elementaryCharge*B.value*.001*R.value*.01)**2/(2*mass*atomicMass),crossings=idealEnergyJ/(charge*elementaryCharge*U);let duration=correct?(Math.ceil(crossings)/2+12)*T:9*T;
 // Find the first actual exit through the outer boundary so the saved native
 // observation includes the complete acceleration without a long free tail.
 g.scene.duration=duration*1e6;const trace=solveScene(g.scene)[0],outer=trace.segments.find(s=>s.fieldIds.length===0&&Math.hypot(...s.p)>(R.value*.01)*.99);
 if(correct&&outer)duration=outer.t;
 const gapSegments=trace.segments.filter(s=>s.fieldIds.some(id=>g.scene.objects.find(o=>o.id===id)?.kind==='electric'));
 if(correct&&gapSegments.length){const first=gapSegments[0];g.expect(p,first.t+first.dt,{kineticEV:charge*U},3e-6);}
 g.guidance=['从静止开始，电场只在狭缝内加速，D形盒内仅由磁场改变方向；时间轴可逐次定位过缝。','此页按原生工具计算有限狭缝和真实D形区域中的轨迹；题目中的“穿缝时间忽略、最大轨道半径取R”理想结论在“临界轨道”场景单独核对。',correct?'磁场回旋周期与交流周期按设定比荷匹配。':'此比较保持原交流周期，改变粒子的比荷；观察过缝时电场方向与速度不再持续匹配。'];
 g.assumptions=[`演示取m=${mass}u、q=${charge}e、B=180mT、R=4cm、U=${U}V，狭缝宽0.006cm；有限狭缝模型的轨道并非严格同心，实际首次出边能量不等同于题目假定r=R的理想最大动能，请用独立的临界轨道页核对该公式。`];
 g.scene.display.tracks=false;Object.assign(g.scene.trail,{enabled:true,auto:true,duration:T*1e6});
 g.guidance.push('默认显示最近一个回旋周期的拖尾，便于看清逐圈外扩；可将轨迹切换为“全程”，或展开轨道、放大时间轴逐次检查。');
 const result=g.done(duration,{axes:false});result.record.snapshot.context.timelineView={version:1,startUs:0,endUs:duration*1e6,filter:'all',folded:[p.id]};result.record.baseline=structuredClone(result.record.snapshot);return result;
}

function cyclotronLimit(paper,question,mass,charge){
 const g=new NativeScene(paper,question,'cyclotron-limit','理想最大轨道与电压无关'),{m,q,B}=basic(g,{m:mass,q:charge,B:180}),R=g.param('R',4,'cm',{min:2.5,max:5,step:.25}),voltage=g.param('U',20,'V',{min:10,max:50,step:5});
 const v=g.derived('v_max','m/s',`${ref(q)}*${ref(B)}*${ref(R)}/${ref(m)}`);
 g.derived('K_max','eV',`${ref(m)}*${ref(v)}^2/2`);g.derived('K_max/(qU)','',`${ref(m)}*${ref(v)}^2/(2*${ref(q)}*${ref(voltage)})`);
 g.field('B','circle',{x:0,y:0,radius:4,labelOffset:{x:170,y:-130}},{radius:ref(R),B:`-${ref(B)}`});
 const p=g.particle('P',{x:0,y:-4,heading:0},{y:`-${ref(R)}`,mass:ref(m),charge:ref(q),speed:ref(v)});g.point('O',0,0,{}, {x:0,y:-15});g.resolve();const T=circleTime(m.value,q.value,B.value);g.expect(p,T/4,{xCm:R.value,yCm:0,speedMs:v.value});g.expect(p,T,{xCm:0,yCm:-R.value,speedMs:v.value});
 g.guidance=['这里直接检验题目所用理想临界条件 r=R，速度恒为qBR/m。','改变U不会改变这个最大轨道或最大速度，只改变到达这一级能量所需的加速次数估计 Kmax/(qU)。','第一、二次完整过缝后的轨道半径满足r₁:r₂=1:√2，磁场力不做功。'];g.assumptions=['此页是最大圆轨道的独立原生核验，不重复模拟狭缝；它与“共振加速过程”页共同对应题目。'];
 return g.done(T,{axes:false});
}

function oneWaySelector(){
 const g=new NativeScene(4,8,'selector-direction','速度选择器 顺向平衡 反向偏转'),{m,q,B}=basic(g),e=g.param('E',15,'kV/m'),v=g.derived('v','m/s',`${ref(e)}/${ref(B)}`);
 g.field('B','rectangle',{x:0,y:0,width:6,height:4,labelOffset:{x:0,y:-120}},{B:`-${ref(B)}`});g.electric('E','rectangle',{x:0,y:0,width:6,height:4,fieldAngle:270,labelOffset:{x:0,y:120}},{E0:ref(e)});
 const forward=g.particle('顺向+q',{x:-3,y:0,heading:0},{mass:ref(m),charge:ref(q),speed:ref(v)});
 const reversePositive=g.particle('反向+q',{x:3,y:0,heading:180},{mass:ref(m),charge:ref(q),speed:ref(v)}),reverseNegative=g.particle('反向-q',{x:3,y:0,heading:180},{mass:ref(m),charge:`-${ref(q)}`,speed:ref(v)});
 g.point('A',-3,0,{}, {x:-20,y:-12});g.point('B',3,0,{}, {x:20,y:-12});g.resolve();
 const omega=q.value*elementaryCharge*B.value*.001/(m.value*atomicMass),angle=Math.acos(1-.02*omega/(2*v.value)),t=angle/omega,x=3+(v.value*t-2*v.value*Math.sin(angle)/omega)*100;
 g.expect(forward,t,{xCm:-3+v.value*t*100,yCm:0,vxMs:v.value,vyMs:0});g.expect(reversePositive,t,{xCm:x,yCm:-2});g.expect(reverseNegative,t,{xCm:x,yCm:2});
 g.guidance=['从A向B且v=E/B时，两力可抵消，顺向粒子在同一观察时段内保持直线。','从B向A反向进入时，正粒子的两力均向下，负粒子的两力均向上；不能只记速度大小条件。','本场景在反向粒子首次接触极板时结束，不让自由粒子模型继续穿过金属板。'];g.assumptions=['演示取m=1u、|q|=e、B=100mT、E=15kV/m，示意极板间距4cm；观察到首次接触极板，撞板及之后的运动不在本场景内。'];
 return g.done(t,{});
}

function instrumentElectron(){
 const g=new NativeScene(3,4,'electron-radius','甲 洛伦兹力演示仪的半径变化'),m=g.param('m_e',9.11e-31,'kg'),q=g.param('e',1.6e-19,'C'),B=g.param('B',1,'mT',{min:.5,max:2,step:.1}),v=g.param('v',2e6,'m/s');
 g.field('B','infinite',{x:0,y:0,labelOffset:{x:130,y:-100}},{B:ref(B)});const p=g.particle('e^-',{x:0,y:0,heading:0},{mass:ref(m),charge:`-${ref(q)}`,speed:ref(v)});g.resolve();const T=TAU*m.value/(q.value*B.value*.001),r=m.value*v.value/(q.value*B.value*.001);g.expect(p,T/2,{xCm:0,yCm:2*r*100});
 g.guidance=['电子速度保持不变，增大B使半径减小；减小B使半径增大。','磁场改变速度方向而不改变速率，不能从“场强更小”推出“半径更小”。'];g.assumptions=['电子质量和电荷取常用近似值，v=2×10⁶m/s、B=1mT为演示赋值。'];
 return g.done(T,{});
}

function identicalSpecificCharge(){
 const base=massSpectrometer(),scene=base.record.snapshot.scene,first=scene.objects.find(o=>o.kind==='particle'),second=structuredClone(first);second.id='o'+scene.nextId++;second.label='2m,2q';second.defs.mass='2*o1.value';second.defs.charge='2*o2.value';second.labelVisible=false;second.style.color=palette[1];scene.objects.push(second);first.label='m,q';resolveScene(scene);
 base.paper=3;base.question=4;base.key='same-specific-charge';base.record.id='holiday-3-4-same-specific-charge';base.record.title='乙 不同离子可以有相同比荷';base.record.baseline=structuredClone(base.record.snapshot);base.expectations.push(...base.expectations.filter(e=>e.traceId===first.id).map(e=>({...structuredClone(e),traceId:second.id})));
 base.guidance=['质量与电荷量同时加倍的两种离子，q/m相同，同电压加速后速度相同。','两条原生轨迹完全重合并击中同一位置；同一落点只能判定相同比荷，不能据此断定是同一种粒子。'];base.assumptions.push('第二种演示离子取质量2m、电荷2q，表示相同比荷的反例，不表示具体同位素身份。');return base;
}

function twoStageSpectrometer(daughters){
 const g=new NativeScene(3,12,daughters?'daughter-magnetic':'parent',daughters?'子离子 匀强磁场不能实现同半径':'母离子 一级质谱的加速与筛选'),{m,q,B}=basic(g),R=g.param('目标半径',3,'cm'),U=g.derived(daughters?'U_2':'U_1','V',`${ref(q)}*${ref(B)}^2*${ref(R)}^2/(2*${ref(m)})`);
 g.electric('加速电场','rectangle',{x:0,y:daughters?-1:1,width:1.2,height:2,fieldAngle:daughters?90:270},{E0:`${ref(U)}/(2 cm)`});
 g.field('B','half',{x:0,y:0,angle:daughters?90:270,labelOffset:{x:150,y:daughters?-140:140}},{B:daughters?ref(B):`-${ref(B)}`});
 const particles=[];for(const factor of daughters?[.5,1,2]:[1])particles.push({factor,p:g.particle(daughters?`m'=${factor}m`:'母离子',{x:0,y:daughters?-2:2,speed:0,heading:daughters?90:270,labelVisible:!daughters},{mass:`${factor}*${ref(m)}`,charge:ref(q)})});
 pointFrom(g,daughters?'目标S':'C',`2*${ref(R)}`,'0 cm',{x:15,y:18});
 if(daughters){g.focusObjectsOnly=true;for(const factor of [.5,1,2]){const radius=`sqrt(2*${factor}*${ref(m)}*${ref(U)}/${ref(q)})/${ref(B)}`;const top=pointFrom(g,'',radius,radius);top.labelVisible=false;if(factor!==1)pointFrom(g,factor===.5?'m/2':'2m',`2*(${radius})`,'0 cm',{x:12,y:22});}}
 g.resolve();let total=0;
 for(const {factor,p}of particles){const speed=Math.sqrt(2*q.value*elementaryCharge*U.value/(factor*m.value*atomicMass)),r=factor*m.value*atomicMass*speed/(q.value*elementaryCharge*B.value*.001)*100,ta=.04/speed,tm=Math.PI*factor*m.value*atomicMass/(q.value*elementaryCharge*B.value*.001);g.expect(p,ta+tm,{xCm:2*r,yCm:0,speedMs:speed});total=Math.max(total,ta+tm);}
 g.guidance=daughters?['不同质量且同电荷的子离子从静止经同一U₂加速，在同一个匀强磁场中的半径不同。','只有中间的参考比荷恰到目标S，说明固定匀强磁场无法让任意比荷的子离子共用指定圆轨道。','仅电场方案需要径向辐向电场，原生工具当前不支持这类空间变方向电场，将在补充解析中另行演示。']:['从静止经U₁加速，再用半径R的半圆进入C区。','速度由qU₁=mv²/2，圆周由qvB=mv²/R，联立得U₁=qB²R²/(2m)。'];
 g.assumptions=['示例取m=1u、q=e、B=100mT、目标R=3cm。子离子质量示例取0.5m、m、2m，统一U₂；这些只用于展示不同比荷的分离。'];
 return g.done(total,{part:daughters?'(2)a':'(1)'});
}

function thomson(balanced){
 const g=new NativeScene(5,1,balanced?'thomson-balanced':'thomson-electric',balanced?'加入向外磁场 荧光斑回到中心':'电子加速后受电场向下偏转');
 const m=g.param('m_e',9.11e-31,'kg'),q=g.param('e',1.6e-19,'C'),v=g.param('v',2e7,'m/s'),e=g.param('E',10,'kV/m'),U=g.derived('U_加速','V',`${ref(m)}*${ref(v)}^2/(2*${ref(q)})`);
 g.electric('加速电场','rectangle',{x:-3.5,y:0,width:1,height:1.5,fieldAngle:180},{E0:`${ref(U)}/(1 cm)`});
 g.electric('E','rectangle',{x:0,y:0,width:4,height:2,fieldAngle:90,labelOffset:{x:0,y:-75}},{E0:ref(e)});
 if(balanced)g.field('B_向外','rectangle',{x:0,y:0,width:4,height:2,labelOffset:{x:65,y:70}},{B:`${ref(e)}/${ref(v)}`});
 const p=g.particle('e^-',{x:-4,y:0,speed:0,heading:0},{mass:ref(m),charge:`-${ref(q)}`});g.line('荧光屏',[[5,-1.7],[5,1.7]],{}, {color:'#687e85',dash:'solid',strokeWidth:3});g.point('P_1',5,0,{}, {x:22,y:-14});g.point('K',-4,0,{}, {x:-12,y:-17});g.point('A',-3,0,{}, {x:5,y:-17});
 g.resolve();const ta=.02/v.value,total=ta+.08/v.value,acc=q.value*e.value*1000/m.value,y=-acc*(.04*.04/2+.04*.03)/(v.value*v.value)*100;
 g.expect(p,total,{xCm:5,yCm:balanced?0:y,vxMs:v.value,vyMs:balanced?0:-acc*.04/v.value});
 if(!balanced)g.point('P_2',5,y,{}, {x:22,y:10});
 g.guidance=balanced?['电场向上，电子的电场力向下；向外的磁场给向右运动的电子一个向上的磁场力。','磁场大小取B=E/v时两力平衡，荧光斑回到原图中的中心P₁。题目只问方向，大小关系用于演示回中条件。']:['阴极电子经高电压加速后进入极板区，向下偏转并沿出场切线射向光屏的P₂。','切换到“加入向外磁场”，比较有无磁场时的荧光斑位置。'];g.assumptions=['题目没有给数值。演示取v=2×10⁷m/s、E=10kV/m、极板长4cm；电子从静止起步及1cm加速间距也是演示选择，加速电压由电子动能关系确定。场内轨迹未接触极板。'];
 return g.done(total,{});
}

function vectorArrow(g,label,origin,dx,dy,color){
 const end=g.add('point','',{visible:false,x:0,y:0},{x:`${origin.id}.x+(${dx})`,y:`${origin.id}.y+(${dy})`});
 const length=`max(distance(pos(${origin.id}),pos(${end.id})),.001 cm)`;
 g.line(label,[[0,0],[1,1]],{point0:`pos(${origin.id})`,point1:`pos(${end.id})`},{color,dash:'solid',strokeWidth:2.2});
 for(const sign of [-1,1])g.line('',[[0,0],[1,1]],{point0:`pos(${end.id})`,point1x:`${end.id}.x-.17 cm*(${dx})/(${length})+${sign}*.07 cm*(${dy})/(${length})`,point1y:`${end.id}.y-.17 cm*(${dy})/(${length})-${sign}*.07 cm*(${dx})/(${length})`},{color,dash:'solid',strokeWidth:2.2});
 return end;
}

function compassMinimum(){
 const g=new NativeScene(4,3,'vector-minimum','磁矿场最小时与合磁场垂直'),B=g.param('B',.04,'mT'),ratio=g.param('合场/B',.5,'',{min:.1,max:1.5,step:.05}),theta=g.param('偏转角',60,'deg'),length=g.param('矢量标尺',4,'cm');
 const O=g.point('O',0,0,{}, {x:-15,y:17}),A=vectorArrow(g,'\\vec B',O,ref(length),'0 cm','#8b9da3');
 const C=vectorArrow(g,'\\vec B_{合}',O,`${ref(length)}*${ref(ratio)}*cos(${ref(theta)})`,`${ref(length)}*${ref(ratio)}*sin(${ref(theta)})`,'#398a86');
 vectorArrow(g,'\\vec B_{矿}',A,`${C.id}.x-${A.id}.x`,`${C.id}.y-${A.id}.y`,'#ad7344');
 g.line('',[[0,0],[3,5]],{point1x:`1.5*${ref(length)}*cos(${ref(theta)})`,point1y:`1.5*${ref(length)}*sin(${ref(theta)})`});
 const mineral=g.derived('B_矿','mT',`${ref(B)}*distance(pos(${A.id}),pos(${C.id}))/${ref(length)}`),minimum=g.derived('B_矿最小','mT',`${ref(B)}*sin(${ref(theta)})`);
 g.resolve();g.geometryExpectations.push({expression:ref(mineral),unit:'mT',expected:Math.sqrt(3)/2*B.value},{expression:ref(minimum),unit:'mT',expected:Math.sqrt(3)/2*B.value});
 g.guidance=['原图把北方画在右侧。灰色地磁矢量固定，绿色合场始终与它成60°。','拖动“合场/B”，棕色磁矿矢量的终点沿虚线移动；最短时它与合场垂直。','本题为原生几何探究，使用参数滑杆观察，不需要粒子播放。'];g.assumptions=['B=0.04mT仅是矢量大小示例；画布长度用于画矢量，不表示磁矿或指南针的实际距离。'];
 return g.done(1e-6,{selected:ratio.id,axes:false});
}

function wireSuperposition(){
 const g=new NativeScene(3,6,'wire-vector-sum','四点磁场的矢量叠加'),B=g.param('B_0',.06,'mT'),wire=g.param('B_导线',.04,'mT',{min:.01,max:.1,step:.01});
 g.add('circle','等距圆',{x:0,y:0,radius:3,labelVisible:false,style:{color:'#a4b5b7',dash:'dashed',strokeWidth:1.2}});g.point('I\\otimes',0,0,{}, {x:0,y:10});
 const values=[];
 for(const [name,x,y,wx,wy]of [['a',-3,0,0,1],['b',3,0,0,-1],['c',0,-3,-1,0],['d',0,3,1,0]]){
  const origin=g.point(name,x,y,{}, {x:name==='a'?-17:name==='b'?17:0,y:name==='c'?18:-17});
  vectorArrow(g,'',origin,'0 cm','1.5 cm','#a4b2b7');
  vectorArrow(g,'',origin,`${wx}*1.5 cm*${ref(wire)}/${ref(B)}`,`${wy}*1.5 cm*${ref(wire)}/${ref(B)}`,'#c58c54');
  vectorArrow(g,`\\vec B_${name}`,origin,`${wx}*1.5 cm*${ref(wire)}/${ref(B)}`,`1.5 cm*(1+${wy}*${ref(wire)}/${ref(B)})`,'#397f9b');
  const magnitude=g.derived('B_'+name,'mT',`sqrt((${wx}*${ref(wire)})^2+(${ref(B)}+${wy}*${ref(wire)})^2)`);values.push({name,magnitude});
 }
 g.resolve();for(const {name,magnitude}of values)g.geometryExpectations.push({expression:ref(magnitude),unit:'mT',expected:name==='a'?B.value+wire.value:name==='b'?Math.abs(B.value-wire.value):Math.hypot(B.value,wire.value)});
 g.guidance=['灰箭头是向上的匀强磁场，橙箭头是向里电流产生的顺时针磁场，蓝箭头是合场。','改变B导线跨过B₀，b点的合场可向上、为零或向下；c和d大小相等但方向不同。','始终有 B_a>B_c=B_d>B_b。本题为静态矢量探究，请使用自由参数滑杆。'];g.assumptions=['B₀=0.06mT、导线场0.04mT是可修改的演示值；四点与导线等距，导线场大小相同。绘图比例不代替真实空间中的场线密度。'];
 return g.done(1e-6,{selected:wire.id,axes:false});
}

export function nativeScenes(){
 return [massSpectrometer(),circleBoundary('large-radius','2','r=2R 最长弧与出射范围'),circleBoundary('near-period','1/2','r=R/2 接近整周的在场过程'),circleBoundary('accessible-arc','sqrt(3)/2','r=√3R/2 可达圆弧'),quadrantTransition(),twoCircleParticles(),selectorSquare(),
 ...[4,5].flatMap(p=>['a','b','overlay'].map(mode=>ionImplant(p,p===4?6:5,mode))),acceleratingStrip(false),acceleratingStrip(true),doubleCapacitor(),nuclearComparison(),negativeMassComparison(),squareExits('choice'),squareExits('families'),squareExits('time'),returnBetweenFields(),
 collisionComparison(false),collisionComparison(true),parabolicFocusing(false),parabolicFocusing(true),repeatedAcceleration(1),repeatedAcceleration(3),
 cyclotron(2,8,'triton',{mass:3,charge:1,label:'氚核'}),cyclotron(2,8,'alpha-mismatch',{mass:4,charge:2,referenceMass:3,referenceCharge:1,correct:false,label:'氦核'}),cyclotronLimit(2,8,3,1),
 cyclotron(5,9,'alpha',{mass:4,charge:2,label:'氦核'}),cyclotron(5,9,'deuteron',{mass:2,charge:1,referenceMass:4,referenceCharge:2,label:'氘核'}),cyclotronLimit(5,9,4,2),
 cyclotron(6,6,'voltage-u',{U:10,label:'粒子'}),cyclotron(6,6,'voltage-2u',{U:20,label:'两倍电压'}),cyclotronLimit(6,6,1,1),
 instrumentElectron(),identicalSpecificCharge(),cyclotronLimit(3,4,1,1),oneWaySelector(),cyclotron(4,8,'proton',{label:'质子'}),cyclotron(4,8,'alpha-mismatch',{mass:4,charge:2,referenceMass:1,referenceCharge:1,correct:false,label:'α粒子'}),twoStageSpectrometer(false),twoStageSpectrometer(true),thomson(false),thomson(true),compassMinimum(),wireSuperposition()];
}
