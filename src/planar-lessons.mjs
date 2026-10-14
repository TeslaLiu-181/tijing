import {createObject,emptyScene} from './planar-model.mjs';
import {resolveScene} from './planar-relations.mjs';

export const lessons=[
 {id:'ex1',title:'例1 · 同电压、不同电荷',focus:'比较加速度、入磁场速率、半径与出射角。',condition:'同质量的 P⁺、P³⁺从静止经同一电压 U 加速；P⁺偏转 30°出场。',formula:String.raw`r_1=2d,\quad B=\frac{\sqrt{2mqU}}{2qd}`,note:'加速区长度 d 为演示设置；电压和磁场宽度保持题设关系。',question:'电荷变为 3 倍，哪些量也变为 3 倍？',result:String.raw`a_3/a_1=3,\ v_3/v_1=\sqrt3,\ r_1/r_3=\sqrt3,\ \theta_3=60^\circ`},
 {id:'ex2',title:'例2 · 类平抛接圆周',focus:'先看分速度，再看中点关系，最后在 O 点衔接圆弧。',condition:'A(−2√3L,L)，初速 v₀向右；第二象限电场向下；矩形磁场宽 L、高 2L、向外，恰从 M(0,−2L)射出。',formula:String.raw`E=\frac{mv_0^2}{6qL},\quad B=\frac{mv_0}{qL}`,question:'为什么入磁场时的偏角为 30°？',result:String.raw`t_E=\frac{2\sqrt3L}{v_0},\quad t_B=\frac{2\pi L}{3v_0}`,preset:true},
 {id:'ex3',title:'例3 · 先磁后电',focus:'比较磁场段等速转向与电场段水平减速。',condition:'从 P₁(0,√3L)以与 +y 夹角 60°入磁场；从 P₂(0,−√3L)进入第三象限向右电场，最后垂直 x 轴出场。',formula:String.raw`B=\frac{mv}{2qL},\quad E=\frac{mv^2}{4qL}`,question:'电场中哪一分速度不变？另一分速度怎样减到零？',result:String.raw`t_B=\frac{8\pi L}{3v},\quad P_3=(-3L/2,0)`},
 {id:'ex4',title:'例4 · 临界相切（平面展开）',focus:'用出电场的速度三角形连接磁场临界轨迹。',condition:'三界面相距 L；P(0,L/2)水平入射，在 O₁(L,0)进入磁场，刚好不从 x=2L 右边界飞出。',formula:String.raw`E=\frac{mv_0^2}{qL},\quad |B|=\frac{(\sqrt2+1)mv_0}{qL}`,note:'按教参图乙展开；二维图为保持原轨迹形状将磁场画作入纸面，勿与原立体图的 +z 标记直接对照。',question:'相切能否当作一次“出场”？',result:String.raw`R+R\cos45^\circ=L,\quad v=\sqrt2v_0`},
 {id:'p1',title:'练1 · CT 电子束与落点',focus:'分别调 U 与 B，观察出场切线和靶线交点。',condition:'电子从静止经向左的电场加速，再穿过向纸内的偏转磁场。',formula:String.raw`v=\sqrt{2eU/m_e},\quad r=\frac{m_ev}{e|B|}`,note:'题目未给尺寸，场区和靶位置为演示几何；靶是测量参考线，不模拟碰撞或 X 射线产生。',question:'增大 B 与增大 U，靶上交点分别向哪边移动？',result:String.raw`U\uparrow\Rightarrow r\uparrow;\quad |B|\uparrow\Rightarrow r\downarrow`},
 {id:'p2',title:'练2 · 加速—偏转—磁场',focus:'只改 U₂，观察偏转变化而同一磁场边界上两交点间距不变。',condition:'从静止经 U₁加速，水平射入电压 U₂的平行板，最后进入竖直边界磁场。',formula:String.raw`v_x=\sqrt{2qU_1/m},\quad d=\frac{2mv_x}{q|B|}`,note:'板长、板距与间隙均为演示设置。板线仅示意，未计算撞板；调参后若提前侧向出场，应重新核对适用条件。',question:'出电场的总速率变了，为什么 d 仍可能不变？',result:String.raw`d=\frac2{|B|}\sqrt{\frac{2mU_1}{q}}`,preset:true},
 {id:'p3',title:'练3 · 圆形磁场质谱仪',focus:'连接加速电压、轨迹半径和出场后的直线。',condition:'从静止经 U 加速，自圆形磁场顶点 G 垂直射入；场半径 R、向外，回到切线 MN 时 GF=√3R。',formula:String.raw`\frac qm=\frac{6U}{R^2B^2}`,note:'加速区长度为演示设置；MN 为接收参考线，不当作反弹边界。',question:'轨迹半径与场域半径相同吗？',result:String.raw`r=R/\sqrt3,\quad GF=\sqrt3R`},
 {id:'p4',title:'练4 · 斜边界反复进出',focus:'用边界暂停逐段观察：直线加速、3/4 圆周、类平抛。',condition:'MN 与竖直电场夹角 45°；上方电场向下、下方磁场向外；正粒子在竖直高 d 处由静止释放。',formula:String.raw`v=\sqrt{2qEd/m},\quad T_B=\frac{2\pi m}{qB}`,question:'首次磁场段为何是 3/4 个周期？',result:String.raw`t_B=\frac{3\pi m}{2qB},\quad t_{E,2}=\sqrt{\frac{8md}{qE}}`},
 {id:'p5',title:'练5 · 多次过轴与相切',focus:'逐次标出过轴点；比较每个电场段和磁场段用时。',condition:'负粒子从 P(0,L)水平进入第一象限向上电场，经 Q(2L,0)进入第四象限向内磁场，磁场轨迹与 y 轴相切。',formula:String.raw`E=\frac{mv_0^2}{2|q|L},\quad |B|=\frac{(\sqrt2+1)mv_0}{2|q|L}`,question:'第4次、第6次过 x 轴时，累计了哪些运动段？',result:String.raw`x_4=2(7-4\sqrt2)L,\quad t_6=\frac{[10+9(\sqrt2-1)\pi]L}{v_0}`,preset:true},
 {id:'p6a',title:'练6(1) · 加速器与选择器',focus:'先看电场做功，再看速度选择器内两力平衡。',condition:'正粒子从静止经过加速器，沿直线通过向内磁场 B₁与向下电场 E 组成的速度选择器。',formula:String.raw`v_0=E/B_1,\quad U_0=\frac{mE^2}{2qB_1^2}`,note:'本入口仅复现第(1)问；后两问有各自的方波磁场入口。加速器与选择器尺寸为演示设置。',question:'为什么离开加速区后动能保持不变？',result:String.raw`qE=qv_0B_1`},
 {id:'p6b',title:'练6(2) · 题设时刻核对',focus:'区分题目的磁场正方向和沙盒的 Bz 正方向。',condition:'t=0 从 O 水平进入 0≤x≤d；T₀=2πdB₁/(7E)，首半周期向内，并从 P(d,d/2)出场。',formula:String.raw`B_0=\frac{4mE}{5qdB_1},\quad T_0=\frac{2\pi dB_1}{7E}`,note:'条件冲突：题给 T₀/2=πd/(7v₀)<d/v₀，粒子不可能在首半周期走完宽度 d。此处使用题给周期与教参 B₀，真实轨迹不会通过目标 P；不据此宣称复现了冲突条件。忽略感生电场。',question:'到达右边界前是否已经发生磁场换向？',result:String.raw`R=5d/4,\quad P=(d,d/2)`},
 {id:'p6c',title:'练6(3) · 换向后的拼接圆弧',focus:'每次换向只改变加速度，速度连续；暂停比较相邻圆弧。',condition:'B₀=7mE/(2qdB₁)，在原题 t=T₀/2 从 O 射入。',formula:String.raw`R=2d/7,\quad T_B=2T_0`,note:'本入口时钟 t′=t−T₀/2，0 对应原题 T₀/2；初始 B 向外。理想突变磁场忽略感生电场。',question:'换向时刻，速度箭头会突然折转吗？',result:String.raw`(x,y)=\left(d,-\frac{6+\sqrt3}{7}d\right)`},
 {id:'s1',title:'选练1 · 反向磁场的平面投影',focus:'保持 z 不变，在 xy 截面看曲率的反向。',condition:'立方体由竖直对角面分成等大反向、平行 z 的磁场；质子由左侧沿 +x 射入。',formula:String.raw`v_z=0,\quad z=z_0`,note:'原题未给入射点和速率；截面入射 y=L/4、r=L 为演示选择。保留真实正方形和对角边界，不将场域扩展为无限平面。',question:'为什么 xz 投影不能向上或向下弯曲？',result:String.raw`F_z=0\Rightarrow z\text{ 不变}`}
];

export function lessonScene(id){
 const meta=lessons.find(l=>l.id===id);if(!meta)throw Error('未知课题');
 const s=emptyScene();s.lesson=id;Object.assign(s.teaching,{enabled:true,components:true,midpoint:['ex2','ex4','p2','p5'].includes(id),pauseAtBoundary:true});Object.assign(s.display,{ink:false,grid:false});s.aids.center=false;
 const put=(kind,props={},shape)=>{const o=Object.assign(createObject(kind,'o'+s.nextId++,[0,0],shape),props);s.objects.push(o);return o.id;};
 const param=(label,value,unit)=>put('parameter',{label,value,unit});
 const f=(ref,key='value')=>`${ref}.${key}`;
 const L=param(id==='p3'?'R':id==='p4'||id.startsWith('p6')?'d':'L',1.5,'cm');
 const length=f(L),v=param('v_0',1,'speed'),speed=f(v);
 const p=put('particle',{mass:1,charge:id==='p5'?-1:1,label:'P',speed:1});
 const P=s.objects.find(o=>o.id===p),m=f(p,'mass'),q=`abs(${f(p,'charge')})`;
 const electric=(shape,label,defs,extra={})=>put('electric',{label,defs,...extra},shape);
 const magnetic=(shape,label,defs,extra={})=>put('field',{label,defs,...extra},shape);
 const point=(label,x,y)=>put('point',{label,defs:{x,y}});
 const line=(label,x1,y1,x2,y2)=>put('line',{label,lineType:'segment',defs:{point0:`point(${x1},${y1})`,point1:`point(${x2},${y2})`}},'segment');
 let duration=1;
 if(id==='ex2'){
  P.defs={x:`-2*sqrt(3)*${length}`,y:length,speed};
  electric('quadrant','E',{E0:`${m}*${speed}^2/(6*${q}*${length})`},{angle:90,fieldAngle:270});
  magnetic('rectangle','B',{x:`${length}/2`,y:`-${length}`,width:length,height:`2*${length}`,B:`${m}*${speed}/(${q}*${length})`},{B:1});
  point('M','0',`-2*${length}`);duration=(2*Math.sqrt(3)+2*Math.PI/3)*.15+.03;
 }else if(id==='ex3'){
  P.heading=30;P.defs={y:`sqrt(3)*${length}`,speed};
  magnetic('half','B',{B:`${m}*${speed}/(2*${q}*${length})`});
  electric('quadrant','E',{E0:`${m}*${speed}^2/(4*${q}*${length})`},{angle:180,fieldAngle:0});
  point('P_2','0',`-sqrt(3)*${length}`);duration=(8*Math.PI/3+2*Math.sqrt(3))*.15+.04;
 }else if(id==='ex4'){
  P.defs={y:`${length}/2`,speed};
  electric('strip','E',{x:`${length}/2`,width:length,E0:`${m}*${speed}^2/(${q}*${length})`},{fieldAngle:270});
  magnetic('strip','B',{x:`1.5*${length}`,width:length,B:`-(sqrt(2)+1)*${m}*${speed}/(${q}*${length})`});
  point('O_1',length,'0');point('O_2',`2*${length}`,'0');duration=.46;
 }else if(id==='ex1'){
  const voltage=param('U',160,'V');P.mass=31;P.speed=0;P.label='P^{+}';P.defs={x:`-${length}`};
  put('particle',{mass:31,charge:3,speed:0,label:'P^{3+}',defs:{x:`-${length}`,mass:m,charge:`3*${q}`}});
  electric('strip','E',{x:`-${length}/2`,width:length,E0:`${f(voltage)}/${length}`},{fieldAngle:0});
  magnetic('strip','B',{x:`${length}/2`,width:length,B:`-sqrt(2*${m}*${q}*${f(voltage)})/(2*${q}*${length})`});duration=1.5;
 }else if(id==='p1'){
  const voltage=param('U',150,'V'),B=param('|B|',2,'mT');P.mass=.000548579909;P.charge=-1;P.speed=0;P.defs={x:`-2*${length}`};
  electric('strip','E',{x:`-1.5*${length}`,width:length,E0:`${f(voltage)}/${length}`},{fieldAngle:180});
  magnetic('rectangle','B',{width:length,height:`3*${length}`,B:`-${f(B)}`});
  line('\\text{靶线}',`-${length}`,`-2*${length}`,`5*${length}`,`-2*${length}`);duration=.024;
 }else if(id==='p2'){
  const U1=param('U_1',160,'V'),U2=param('U_2',100,'V'),B=param('|B|',70,'mT');P.speed=0;P.defs={x:`-3*${length}`};
  electric('rectangle','E_1',{x:`-2.5*${length}`,width:length,height:`2*${length}`,E0:`${f(U1)}/${length}`},{fieldAngle:0});
  electric('rectangle','E_2',{x:`-${length}/2`,width:length,height:`2*${length}`,E0:`${f(U2)}/(2*${length})`},{fieldAngle:270});
  magnetic('half','B',{x:`${length}/2`,B:`-${f(B)}`});duration=1.15;
 }else if(id==='p3'){
  const voltage=param('U',160,'V');P.speed=0;P.heading=270;P.defs={y:`2*${length}`};
  electric('rectangle','E',{y:`1.5*${length}`,width:length,height:length,E0:`${f(voltage)}/${length}`},{fieldAngle:270});
  magnetic('circle','B',{y:`-${length}`,radius:length,B:`sqrt(6*${m}*${f(voltage)}/${q})/${length}`});
  line('MN',`-3*${length}`,'0',`2*${length}`,'0');point('F',`-sqrt(3)*${length}`,'0');duration=.46;
 }else if(id==='p4'){
  const el=param('E',8,'kV/m'),B=param('B',90,'mT');P.speed=0;P.defs={y:length};
  electric('half','E',{E0:f(el)},{angle:45,fieldAngle:270});
  magnetic('half','B',{B:f(B)},{angle:225});duration=1.65;
 }else if(id==='p5'){
  P.defs={y:length,speed};
  electric('quadrant','E',{E0:`${m}*${speed}^2/(2*${q}*${length})`},{fieldAngle:90});
  magnetic('quadrant','B',{B:`-(sqrt(2)+1)*${m}*${speed}/(2*${q}*${length})`},{angle:270});
  point('Q',`2*${length}`,'0');duration=(10+9*(Math.sqrt(2)-1)*Math.PI)*.15+.005;
 }else if(id.startsWith('p6')){
  const el=param('E',10,'kV/m'),B1=param('B_1',100,'mT');
  s.objects.find(o=>o.id===v).defs={value:`${f(el)}/${f(B1)}`};
  if(id==='p6a'){
   P.speed=0;P.defs={x:`-3*${length}`};
   electric('strip','E_0',{x:`-2.5*${length}`,width:length,E0:`${m}*${speed}^2/(2*${q}*${length})`},{fieldAngle:0});
   electric('rectangle','E',{x:`-${length}/2`,width:length,height:`2*${length}`,E0:f(el)},{fieldAngle:270});
   magnetic('rectangle','B_1',{x:`-${length}/2`,width:length,height:`2*${length}`,B:`-${f(B1)}`});duration=.7;s.display.electricForce=true;s.display.magneticForce=true;
  }else{
   P.defs={speed};
   magnetic('strip','B(t)',{x:`${length}/2`,width:length,B:`${id==='p6b'?'-4/5':'7/2'}*${m}*${speed}/(${q}*${length})`,period:`2*pi*${length}/(7*${speed})`},{waveform:'square',phase:0});duration=id==='p6b'?.18:.26;if(id==='p6b')point('P',length,`${length}/2`);
  }
 }else if(id==='s1'){
  P.defs={y:`${length}/4`,speed};
  magnetic('triangle','-B',{x:`${length}/2`,y:`${length}/2`,width:length,height:length,B:`-${m}*${speed}/(${q}*${length})`});
  magnetic('triangle','+B',{x:`${length}/2`,y:`${length}/2`,width:length,height:length,B:`${m}*${speed}/(${q}*${length})`},{angle:180});duration=.26;
 }
 // Only meaningful independent values appear as lesson controls.
 if(!['ex2','ex3','ex4','p5','p6a','p6b','p6c','s1'].includes(id))s.objects=s.objects.filter(o=>o.id!==v);
 s.duration=duration;resolveScene(s);
 return s;
}

// A fresh duration estimate preserves complete teaching stages when L or v changes.
export function lessonDuration(scene){
 if(!scene.lesson)return scene.duration;
 const base=lessonScene(scene.lesson),a=base.objects.find(o=>o.kind==='parameter'),b=scene.objects.find(o=>o.id===a.id),p0=base.objects.find(o=>o.kind==='particle'),p=scene.objects.find(o=>o.id===p0.id);
 if(p?.speed>0&&p0.speed>0)return base.duration*(b.value/a.value)*(p0.speed/p.speed);
 return scene.duration;
}
