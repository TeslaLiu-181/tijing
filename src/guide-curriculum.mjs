// Paragraph numbers refer to the unmodified DOCX extraction in guide-source.json.
// Correct-path explanations are authored separately so distractor analyses are not replayed.
const s=(title,text,tex='')=>({title,text,tex});
const q=(title,refs,steps,extra={})=>({title,refs,steps,...extra});
export const topics=[
 {id:'guide-balance',label:'探究 1',section:'平衡与加速',title:'斜向磁场中的平衡',kind:'rail',figures:['rId10'],stem:[4],symbolic:true,
  defaults:{alpha:0,theta:45,B:1,I:4,L:1,m:1,G:10,mu:.5},controls:['theta','B','I','L','G'],current:1,battery:'left-back',
  parts:['导体棒中点'],questions:[
   q('（1）平面受力图',[6],[s('从电流判断安培力','电源长线端为正极。电流沿棒由 a 到 b，安培力斜向左上。',String.raw`\vec F_{\mathrm{安}}=I\vec L\times\vec B`),s('画出其余力','重力竖直向下，支持力向上；静摩擦力水平向右，平衡安培力的水平分量。')]),
   q('（2）支持力与摩擦力',[7],[s('分解安培力','题图的角度是磁场与水平导轨平面的夹角。',String.raw`F_{\mathrm{安},x}=-BIL\sin\theta,\quad F_{\mathrm{安},y}=BIL\cos\theta`),s('分别列平衡方程','横向和竖直方向均平衡。',String.raw`f=BIL\sin\theta,\qquad N=G-BIL\cos\theta`),s('检验接触','若计算得到负支持力，已知静止且保持接触的条件不再成立。',String.raw`N\ge0`)])]},
 {id:'example-1',label:'例 1',section:'平衡与加速',title:'磁场转向与滑轮挂物',kind:'pulley',figures:['rId16'],stem:[15],symbolic:false,
  defaults:{alpha:0,theta:0,B:1,E:15,r:1,R:2,L:1,m:.5,M:.75,mu:.5},controls:['theta','E','R','B','m','M','mu'],current:1,battery:'left-back',parts:['导体棒','悬挂物'],questions:[
   q('（1）求悬挂物质量',[17],[s('先求电流','导轨与细绳、滑轮连接关系保持原图。',String.raw`I=\frac{E}{R+r}=5\,\mathrm A`),s('临界平衡','棒刚好不向右滑，安培力与最大静摩擦力都向左。',String.raw`Mg=BIL+\mu mg`),s('得到质量','悬挂物静止时，绳张力等于其重力。',String.raw`M=0.75\,\mathrm{kg}`)],{pose:{theta:0}}),
   q('（2）转过 53° 后的瞬时加速度',[18],[s('锁定后转动磁场','从题图正面观察，磁场顺时针转过指定角度，再解锁；安培力的向上分量增加。',String.raw`\sin53^\circ=0.8,\quad\cos53^\circ=0.6`),s('先算支持力','安培力向上分量抵消部分重力。',String.raw`N=mg-BIL\sin53^\circ=1\,\mathrm N`),s('系统的瞬时加速度','棒与重物加速度大小相同，方向分别向右、向下。',String.raw`a=\frac{Mg-BIL\cos53^\circ-\mu N}{m+M}=3.2\,\mathrm{m\,s^{-2}}`)],{pose:{theta:53},instant:true})]},
 {id:'example-2',label:'例 2',section:'平衡与加速',title:'斜面导轨的临界平衡',kind:'rail',figures:['rId17'],stem:[30],symbolic:false,
  defaults:{alpha:37,theta:0,B:2,E:50,r:1,R:22/3,L:1,m:2,mu:.5},controls:['R','alpha','B','m','mu'],current:1,battery:'right-back',fieldMode:'down-normal',parts:['导体棒中点'],questions:[
   q('（1）摩擦力为零',[32],[s('确定安培力','磁场垂直轨面向下，棒中电流 a→b，左手定则给出沿坡向上的安培力。'),s('无摩擦的平衡','采用题给近似值。',String.raw`BId=mg\sin37^\circ=12\,\mathrm N`),s('由电流求电阻','与电源内阻共同决定电流。',String.raw`I=6\,\mathrm A,\qquad R=\frac E I-r=\frac{22}{3}\,\Omega`)],{pose:{R:22/3}}),
   q('（2）安培力最小',[33],[s('判断临界趋势','安培力减小时棒有向下滑的趋势，静摩擦力沿斜面向上达到最大。',String.raw`N=mg\cos37^\circ=16\,\mathrm N`),s('最小安培力','重力下坡分量由安培力和最大静摩擦力共同平衡。',String.raw`BId=mg\sin37^\circ-\mu mg\cos37^\circ=4\,\mathrm N`),s('求变阻器阻值','电流越小，对应总电阻越大。',String.raw`I=2\,\mathrm A,\qquad R=24\,\Omega`)],{pose:{R:24}})]},
 {id:'horseshoe',label:'探究 2',section:'运动方向判断',title:'电流元法与特殊位置',kind:'horseshoe',figures:['rId18'],stem:[39],symbolic:true,
  defaults:{I:1,B:1,angle:0,height:.78},controls:['I','B','angle','height'],parts:['OA 段代表元','OB 段代表元'],questions:[
   q('（1）磁感线方向',[41],[s('辨认磁极','外部磁感线从 N 极出发、进入 S 极。导线左右两段所处磁场方向不同。'),s('查看局部场','分别选择 OA 和 OB，查看该处的磁场切线。手势只针对选中的代表电流元。')]),
   q('（2）两段导线受力',[42],[s('OA 段','电流向右，N 极上方的局部磁场具有向上分量，OA 段受力指向纸外。'),s('OB 段','S 极上方磁场具有向下分量，OB 段受力指向纸内。',String.raw`\mathrm d\vec F=I\,\mathrm d\vec\ell\times\vec B`)]),
   q('（3）从上向下看转向',[43],[s('把分段力合起来','两侧力构成使导线转动的力矩，不能把其中一侧受力当作整体合力。'),s('回到题设观察方向','从上向下观察，导线逆时针转动。')],{view:'top'}),
   q('（4）转过 90° 后',[44],[s('进入特殊位置','导线转过直角后，电流指向纸内，局部磁场从左向右穿过导线区域。',String.raw`\varphi=90^\circ`),s('合力与绳张力','安培力向下。竖直平衡时，绳张力大于重力。',String.raw`T=mg+F_{\mathrm{安}}`) ],{pose:{angle:90}})]},
 {id:'equivalent',label:'探究 3',section:'运动方向判断',title:'环形电流的等效磁针',kind:'magnet-loop',figures:['rId21'],stem:[],symbolic:true,
  defaults:{I:1,B:1,gap:1.3,angle:0},controls:['I','B','gap','angle'],parts:['线圈前侧代表元','线圈后侧代表元'],questions:[
   q('（1）标出等效磁极',[51],[s('右手握住环形电流','四指弯曲方向与线圈电流一致，拇指指向等效 N 极。'),s('等效磁针','等效磁针 N 极向右、S 极向左；可切换磁矩显示。',String.raw`\vec m=IS\vec n`)]),
   q('（2）相互作用与受力方向',[53,54],[s('比较相对磁极','磁体右端 N 极与线圈左端等效 S 极相对，因此相互吸引。'),s('判断线圈合力','线圈所处磁场并不均匀，靠近磁体一侧作用更强；线圈整体受力向左。')])]},
 {id:'crossed',label:'探究 4',section:'运动方向判断',title:'两根直线电流的相互作用',kind:'crossed',figures:['rId23','rId24'],stem:[59,60],symbolic:true,
  defaults:{I:1,J:1,gap:.38,angle:0},controls:['I','J','gap','angle'],parts:['左／下半段','右／上半段'],questions:[
   q('（1）平行电流结论',[59],[s('同向平行','用右手判断源导线磁场，再用左手判断另一根导线受力。同向电流相互吸引。'),s('方向反转的对照','在自由探究中反转一根导线电流，可观察相互作用方向变化。')],{arrangement:'parallel'}),
   q('（2）① 局部磁场与受力',[62],[s('AB 产生的磁场','源电流沿 AB 向上；AB 左侧磁场向外，右侧向里。'),s('CD 分段受力','电流 C→D：左半段向下、右半段向上，形成转动力矩。')]),
   q('（2）② 转向与靠近',[63],[s('从纸外向纸内观察','CD 逆时针转动，趋向与 AB 同向平行。'),s('转过小角后','电流方向开始具有与 AB 同向的分量，CD 同时靠近 AB。')],{pose:{angle:15}}),
   q('（2）③ 丁图的转动',[64],[s('核对另一放置方式','固定 AB 在下方水平向右，CD 在上方、绕 O 转动。'),s('比较力矩','下段更接近 AB，磁场更强；合力矩使 CD 逆时针转动。')],{arrangement:'separate'})]},
 {id:'reaction',label:'探究 5',section:'运动方向判断',title:'转换研究对象',kind:'reaction',figures:['rId26'],stem:[71],symbolic:true,
  defaults:{I:1,B:1,wireX:-1.82,height:.28},controls:['I','B','wireX','height'],parts:['导线电流元','磁体整体'],notice:'磁场按原解析的局部方向示意，磁体图示尺寸不用于计算场强。',questions:[
   q('（1）导线处的磁场与受力',[73],[s('沿场线看局部方向','按原解析，导线处的局部磁场斜向右上，电流指向纸外。'),s('先判断导线受力','左手定则给出导线受力斜向左上。',String.raw`\vec F_{\mathrm{导线}}=I\vec L\times\vec B`)]),
   q('（2）磁体、摩擦与压力',[74],[s('切换研究对象','磁体受到的作用力与导线所受磁力相反，斜向右下。',String.raw`\vec F_{\mathrm{磁体}}=-\vec F_{\mathrm{导线}}`),s('地面接触力','地面摩擦力向左，压力大于磁体重力。',String.raw`N=mg+|F_y|>mg`) ],{part:1})]},
 {id:'example-3',label:'例 3',section:'运动方向判断',title:'相互垂直的双线圈',kind:'dual-loop',figures:['rId29'],stem:[78,80,81],symbolic:true,
  defaults:{I:1,J:1,angle:0},controls:['I','J','angle'],parts:['上半圈代表元','下半圈代表元'],questions:[q('从左向右看 L₁ 的转向',[],[
   s('电流元法','源线圈 L₂ 产生局部磁场。L₁ 上半圈受力向纸外，下半圈受力向纸内。'),
   s('等效法','L₁ 的等效磁矩初始指向纸内，趋向与源线圈的向上轴向场对齐。',String.raw`\vec\tau=\vec m\times\vec B`),
   s('结论','从左向右观察，L₁ 顺时针转动，选 B。')],{view:'left'})]},
 {id:'example-4',label:'例 4',section:'运动方向判断',title:'螺线管与可转动圆盘',kind:'solenoid',figures:['rId30'],stem:[86,88,89],symbolic:true,
  defaults:{I:1,J:1,angle:0,height:1.5},controls:['I','J','angle','height'],parts:['线圈 A 右半段','线圈 A 左半段'],questions:[q('闭合开关瞬间圆盘怎样转',[],[
   s('螺线管的内外场','右手握法确定内部场向右；上方线圈 A 所在外部区域的场向左。'),
   s('先看固定线圈','A 的右半段受力向外，左半段向内。若 A 可动，其俯视转向为顺时针。'),
   s('再看圆盘','A 实际固定。螺线管连同圆盘受到相反作用力矩，俯视逆时针转动，选 C。')],{view:'top'})]},
 {id:'exercise-1',label:'强化练 1',section:'专题强化练',title:'摩擦力一定不为零',kind:'rail-side',figures:['rId32','rId33'],stem:[95],symbolic:true,
  defaults:{alpha:30,B:1,I:2,L:1,m:1,mu:1,theta:0},controls:['alpha','B','I','m'],current:-1,fieldMode:'down-slope',parts:['导体棒中点'],questions:[q('摩擦力何时一定不为零',[],[
   s('还原 B 图','磁场沿斜面向下，电流指向纸内，安培力垂直斜面向外。'),
   s('沿斜面分析','安培力和支持力都没有沿坡分量，重力的下坡分量只能由静摩擦力平衡。',String.raw`f=mg\sin\theta\ne0`),
   s('结论','选 B。原题中的其余图保留供对照，不展开错误选项的独立场景。')])]},
 {id:'exercise-2',label:'强化练 2',section:'专题强化练',title:'光滑斜轨中的平衡',kind:'rail',figures:['rId36'],stem:[104,106,107,108,109],symbolic:true,
  defaults:{alpha:30,theta:0,B:1,I:5,L:1,m:1,mu:0},controls:['alpha','B','I','m'],current:-1,battery:'right-front',fieldMode:'up-normal',parts:['导体棒中点'],questions:[q('确定磁场方向',[],[
   s('由平衡确定力','光滑轨道无摩擦，安培力必须沿坡向上，平衡重力下坡分量。',String.raw`F_{\mathrm{安}}=mg\sin\theta`),
   s('由电流和力反推磁场','左手定则给出磁场垂直导轨平面向上，选 A。',String.raw`B=\frac{mg\sin\theta}{IL}`),
   s('支持力','支持力平衡重力法向分量。',String.raw`N=mg\cos\theta`)])]},
 {id:'exercise-3',label:'强化练 3',section:'专题强化练',title:'由运动趋势判断场源',kind:'bar-turn',figures:['rId37','rId38'],stem:[112],symbolic:true,
  defaults:{I:-1,B:1,angle:0,height:1.4},controls:['I','B','angle','height'],parts:['左半段代表元','右半段代表元'],questions:[q('由转动与下移判断场源',[],[
   s('原图中的电流','导线电流由 b 到 a，即从右向左。场源为左 N、右 S 的条形磁体。'),
   s('先看起始转动','左半段受力向里、右半段向外；从上往下看顺时针转动。'),
   s('转过小角后','各段受力产生向下合力，导线边转动边下移，符合题干，选 A。')],{view:'top'})]},
 {id:'exercise-4',label:'强化练 4',section:'专题强化练',title:'磁体与台秤的读数',kind:'scale',figures:['rId40'],stem:[119,121,122],symbolic:true,
  defaults:{I:-1,B:1,wireX:-.8,height:1.5,gap:0},controls:['I','B','wireX','height'],parts:['固定导线','磁体整体'],notice:'局部磁场按原解析示意；台秤与弹簧只演示增减趋势，不虚构仪器标定。',questions:[q('电流接通后读数怎样变',[],[
   s('先判断导线','磁场斜向右上，电流指入纸面，导线受力斜向右下。'),
   s('看磁体的反作用力','磁体受力斜向左上，向左压缩弹簧，向上分量减小台秤压力。'),
   s('结论','弹簧缩短，台秤读数减小，选 D。',String.raw`F_2<F_1`)])]},
 {id:'exercise-5',label:'强化练 5',section:'专题强化练',title:'电磁炮的启动瞬间',kind:'cannon',figures:['rId42'],stem:[126,128,129,130,131],symbolic:true,
  defaults:{alpha:0,theta:0,B:1,E:12,r:1,R:2,L:1,m:1,mu:0},controls:['B','E','R','m','L'],current:-1,battery:'left-front',fieldMode:'vertical-up',parts:['导电炮弹'],questions:[q('闭合开关瞬间的加速度',[],[
   s('电流与场向','电源长线为正极；回路电流使炮弹受力向右，磁场竖直向上。'),
   s('闭合瞬间','此时速度为零，按闭合电路欧姆定律计算初始电流。',String.raw`I_0=\frac E{R+r},\quad F_0=BI_0L`),
   s('牛顿第二定律','选 B。这里只计算启动瞬间，后续运动需考虑感应电动势。',String.raw`a_0=\frac{BEL}{m(R+r)}`)],{instant:true})]},
 {id:'exercise-6',label:'强化练 6',section:'专题强化练',title:'径向磁场中的悬线',kind:'radial',figures:['rId43'],stem:[134,136,137,138,139],symbolic:true,
  defaults:{I:4,B:1,L:1,m:1,length:2.4},controls:['I','B','m','L'],parts:['导体棒中点'],questions:[q('平衡角与电流的关系',[],[
   s('位置变化，磁场也转向','磁场始终指向轴 OO′，安培力沿圆周切向；原图右侧平衡时电流 M→N。'),
   s('沿切线列平衡','绳张力没有切向分量。',String.raw`BIL=mg\sin\theta,\quad\sin\theta=\frac{BIL}{mg}`),
   s('沿半径看张力','总绳张力随夹角增大而减小，选 D。两根绳对称时每根承担一半。',String.raw`T_{\mathrm{合}}=mg\cos\theta`)])]},
 {id:'exercise-7',label:'强化练 7',section:'专题强化练',title:'悬挂线框与下方电流',kind:'frame',figures:['rId46'],stem:[145,147,148,149,150],symbolic:true,
  defaults:{I:1,J:1,angle:0,gap:.5},controls:['I','J','angle','gap'],parts:['线框前侧','线框后侧','线框下边','线框上边'],questions:[q('转动趋势与绳张力',[],[
   s('先看两条竖直边','PQ 的电流水平向左。用右手求线框各处磁场，再用左手判两侧导线受力。俯视线框逆时针转动。'),
   s('转过一个小角度','下边电流出现向左分量，上边出现向右分量；下边离 PQ 更近，磁场更强。'),
   s('比较上下边受力','下边向下的力大于上边向上的力，线框整体受力向下，绳张力大于重力，选 C。',String.raw`T>mg`)])]},
 {id:'exercise-8',label:'强化练 8',section:'专题强化练',title:'平衡所需的最小磁场',kind:'rail',figures:['rId47'],stem:[153,155,156,157,158],symbolic:true,
  defaults:{alpha:30,theta:0,B:1,I:5,L:1,m:1,mu:0},controls:['alpha','theta','I','m'],current:-1,battery:'right-front',fieldMode:'optimum',parts:['导体棒中点'],questions:[q('磁场最小值与方向',[],[
   s('先固定所需的沿坡分量','无摩擦平衡要求沿坡安培力等于重力下坡分量。',String.raw`F_{\parallel}=mg\sin\alpha`),
   s('让安培力全部用于沿坡平衡','安培力沿轨面向上时，所需磁场最小。',String.raw`B_{\min}=\frac{mg\sin\alpha}{Il}`),
   s('确定方向','按图中电流，磁场垂直导轨平面向上，选 C。')])]},
 {id:'exercise-9',label:'强化练 9',section:'专题强化练',title:'随时间增大的电流',kind:'vertical',figures:['rId49'],stem:[163],symbolic:true,
  defaults:{B:1,k:2,L:1,m:1,mu:.5,tau:0},controls:['B','k','L','m','mu','tau'],parts:['导体棒中点'],questions:[
   q('（1）速度最大时刻',[165],[s('法向接触力的来源','电流 M→N 向右，磁场竖直向下，安培力把棒压向导轨。',String.raw`N=BIL=BkLt`),s('加速度为零','下滑时摩擦向上，速度最大时重力恰等于滑动摩擦。',String.raw`t_0=\frac{mg}{\mu kBL}`)],{pose:{tau:1}}),
   q('（2）最大速度',[166],[s('先得到加速度随时间变化','从静止释放，沿竖直向下为正。',String.raw`a=g-\frac{\mu kBL}{m}t`),s('用面积求速度','从零到最大速度时刻的 a-t 图面积是三角形。',String.raw`v_{\max}=\frac12gt_0=\frac{mg^2}{2\mu kBL}`)],{pose:{tau:1}}),
   q('（3）最大摩擦力',[167],[s('继续下滑，逐渐减速','最大速度之后摩擦大于重力，棒继续下滑并减速。',String.raw`t_{\mathrm{停}}=2t_0`),s('停止前与停止后要区分','停止前滑动摩擦趋近最大值；停止后静摩擦只需平衡重力。',String.raw`f_{\mathrm{滑},\max}=2mg,\qquad f_{\mathrm{静}}=mg`)],{pose:{tau:2}})]},
 {id:'exercise-10',label:'强化练 10',section:'专题强化练',title:'匀速运动的最小电流',kind:'rail',figures:['rId52'],stem:[187,189],symbolic:true,
  defaults:{alpha:0,theta:30,B:1,I:5,L:1,m:1,mu:Math.sqrt(3)/3},controls:['theta','B','L','m','mu'],current:1,battery:'left-back-rheostat',fieldMode:'minimum-current',parts:['导体棒中点'],questions:[q('磁场怎样转，电流最小',[],[
   s('耦合支持力与摩擦力','安培力向右上，向上分量减小支持力和滑动摩擦。用 β 表示磁场与竖直线的锐角。',String.raw`N=mg-BIL\sin\beta,\quad BIL\cos\beta=\mu N`),
   s('求电流表达式','给定其他条件后，让分母最大。',String.raw`I=\frac{\mu mg}{BL(\cos\beta+\mu\sin\beta)}`),
   s('得到最优方向','题给动摩擦因数对应最优夹角，选 A。',String.raw`\tan\beta=\mu=\frac{\sqrt3}{3}\quad\Rightarrow\quad\beta=30^\circ`)])]},
];

export const parameterDefinitions={
 alpha:{tex:String.raw`\alpha`,name:'导轨倾角',min:0,max:60,step:1,unit:String.raw`{}^\circ`},
 theta:{tex:String.raw`\theta`,name:'磁场转角',min:0,max:85,step:1,unit:String.raw`{}^\circ`},
 B:{tex:'B',name:'磁场强度',min:0,max:3,step:.05,unit:String.raw`\mathrm T`},
 I:{tex:'I',name:'电流',min:-10,max:10,step:.1,unit:String.raw`\mathrm A`},
 J:{tex:String.raw`I_{\mathrm{源}}`,name:'源电流',min:-3,max:3,step:.1,unit:String.raw`\mathrm A`},
 L:{tex:'L',name:'棒长／轨距',min:.5,max:1.8,step:.05,unit:String.raw`\mathrm m`},
 m:{tex:'m',name:'质量',min:.2,max:3,step:.1,unit:String.raw`\mathrm{kg}`},
 G:{tex:'G',name:'重力',min:2,max:30,step:.1,unit:String.raw`\mathrm N`},
 M:{tex:'M',name:'悬挂物质量',min:.1,max:2,step:.05,unit:String.raw`\mathrm{kg}`},
 mu:{tex:String.raw`\mu`,name:'摩擦因数',min:0,max:1,step:.01,unit:''},
 E:{tex:'E',name:'电动势',min:0,max:60,step:.5,unit:String.raw`\mathrm V`},
 R:{tex:'R',name:'电阻',min:.1,max:50,step:.1,unit:String.raw`\Omega`},
 angle:{tex:String.raw`\varphi`,name:'转过的角度',min:-90,max:90,step:1,unit:String.raw`{}^\circ`},
 height:{tex:'h',name:'导线／线圈高度',min:.15,max:2.4,step:.05,unit:String.raw`\text{示意单位}`},
 gap:{tex:'d',name:'间距',min:.2,max:1.8,step:.05,unit:String.raw`\text{示意单位}`},
 wireX:{tex:'x',name:'导线水平位置',min:-2.1,max:-.3,step:.05,unit:String.raw`\text{示意单位}`},
 k:{tex:'k',name:'电流增长率',min:.2,max:4,step:.1,unit:String.raw`\mathrm{A\,s^{-1}}`},
 tau:{tex:'t/t_0',name:'时刻',min:0,max:2.5,step:.01,unit:''},
};

export function questionOf(topic,index){return topic.questions[Math.max(0,Math.min(index,topic.questions.length-1))];}
export function initialParameters(topic,index=0){return {...topic.defaults,...questionOf(topic,index).pose,polarity:1,parallelField:0};}
export function parameterOf(topic,key){
 const d={...parameterDefinitions[key]};
 if(topic.id==='example-3'&&key==='I')d.tex='I_1';
 if(topic.id==='example-3'&&key==='J')d.tex='I_2';
 if(topic.kind==='horseshoe'&&key==='height'){d.min=.6;d.max=1.65;}
 if(topic.kind==='solenoid'&&key==='height')d.min=1.15;
 if(key==='alpha'&&['example-2','exercise-1','exercise-2'].includes(topic.id))d.tex=String.raw`\theta`;
 if(key==='theta'&&topic.id==='exercise-10'){d.tex=String.raw`\beta`;d.name='磁场与竖直夹角';}
 if(key==='theta'&&topic.id==='example-1'){d.tex=String.raw`\varphi`;d.name='从竖直转过角度';}
 if(key==='theta'&&topic.id==='exercise-8'){d.tex=String.raw`\beta`;d.name='偏离轨面法线';}
 if(key==='B'&&!['rail','rail-side','pulley','cannon','vertical','radial'].includes(topic.kind)){d.tex=String.raw`B/B_{\mathrm{ref}}`;d.name='磁场强弱';d.unit=String.raw`\text{示意倍数}`;}
 return d;
}
