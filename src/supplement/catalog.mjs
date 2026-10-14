// These are trusted, versioned teaching models, never executable code from an
// uploaded resource. Numeric choices remain separate from the original question.
const c=(label,min,max,step=0.1,unit='')=>({label,min,max,step,unit});
const basic={B:c('磁感应强度 B',0.1,3,.1,'T'),I:c('电流 I',.2,8,.1,'A'),m:c('质量 m',.1,2,.1,'kg'),L:c('长度 L',.2,2,.1,'m'),theta:c('夹角 θ',5,80,1,'°'),mu:c('摩擦因数 μ',.05,.6,.01),g:c('重力加速度 g',5,15,.1,'m/s²')};
const entries=[];
function lesson(id,title,family,defaults,controls,variants,formula,guide,extra={}){
 entries.push({id,title,family,defaults,controls:Object.fromEntries(controls.map(key=>[key,basic[key]])),variants,formula,guide,
  notice:'题目未指定的数值均为演示赋值。参数变化用于比较规律，原题条件与答案见左侧。',...extra});
}
const v=(id,label)=>({id,label});
lesson('h2-1','四种电磁实验','experiments',{I:2,B:1},['I','B'],[v('wire','甲 · 奥斯特实验'),v('motor','乙 · 通电棒受力'),v('coil','丙 · 电磁铁'),v('induction','丁 · 电磁感应')],String.raw`F=BIL,\qquad\mathcal E=-\frac{d\Phi}{dt}`,
 ['切换实验，区分电流产生磁场、磁场作用于电流、电磁感应。','丁图比较切割磁感线与沿磁场方向运动；产生电流还需要闭合回路。'],{controls:{...{I:basic.I,B:basic.B},parallel:c('丁图：运动沿磁场（0否 / 1是）',0,1,1),closed:c('丁图：闭合回路（0否 / 1是）',0,1,1)},defaults:{I:2,B:1,parallel:0,closed:1}});
lesson('h2-2','磁通量与变化率','flux',{B:1,S:1,rate:1,N:1},['B'],[v('uniform','转动平面与有向磁通量')],String.raw`\Phi=BS\cos\alpha,\qquad\mathcal E=-N\frac{d\Phi}{dt}`,
 ['法线和磁场夹角决定磁通量的正负。','在最大磁通量处，变化率可以为零；匝数影响磁通链 NΦ，不改变单匝磁通量。'],{controls:{B:basic.B,S:c('面积 S',.2,2,.1,'m²'),rate:c('角速度 ω',0,3,.1,'rad/s'),N:c('匝数 N',1,20,1)}});
lesson('h2-3','通电弹簧的两个形变方向','spring-current',{I:2},['I'],[v('conducting','水银接通'),v('insulating','理想绝缘液体')],String.raw`I_1I_2>0:\ \text{平行同向电流相吸}`,
 ['俯视电流顺时针，弹簧内部磁场向下。','相邻匝吸引使轴向缩短；同一匝具有沿半径扩张的趋势。'],{notice:'形变幅度为方向示意，未给定弹簧刚度、线径和自感，不能据动画读取实际振幅。纯净水在本题理想化模型中视为绝缘。'});
lesson('h2-4','固定导线与磁体的反作用力','magnet-scale',{I:2,B:1},['I','B'],[v('on','通电'),v('off','断电')],String.raw`\vec F_{\text{磁体}}=-\vec F_{\text{导线}},\quad N_2=N_1+|F_y|`,
 ['固定导线电流向纸外，局部磁场斜向右上，导线受力斜向左上。','磁体受反作用力斜向右下：弹簧伸长，台秤读数增大，选 C。'],{notice:'局部场向按原图；弹簧位移与台秤增量只作趋势示意，不虚构仪器标定。'});
lesson('h2-5','磁场转动与静摩擦力','rail',{theta:35,B:1,I:3,m:1,L:1},['theta','B','I'],[v('down','安培力斜向右下')],String.raw`F=BIL,\quad N=mg+F\cos\theta,\quad f=F\sin\theta`,
 ['拖动过程到 θ=90°，安培力大小不变而方向改变。','支持力减小，静摩擦力增大；保持静止是本题已给条件。']);
lesson('h2-9','撤去磁场后的复合运动','balanced-flight',{m:1,q:1,v:4,g:10},['m','g'],[v('release','M→N 匀速，N 点撤去磁场')],String.raw`qE=mg,\quad B=\frac{\sqrt2mg}{qv},\quad h_{\max}=\frac{v^2}{4g},\quad v_P=\sqrt5v`,
 ['N 点之前三个力平衡，沿 45°方向匀速。','到 N 点撤去磁场；水平和竖直加速度分别为 g、−g。'],{controls:{v:c('初速度 v',2,6,.1,'m/s'),m:basic.m,q:c('电量 q',.5,2,.1,'C'),g:basic.g}});
lesson('h2-10','霍尔元件中的电荷分离','hall',{I:2,B:1,carrier:-1},['I','B'],[v('hall','电子导电 · 电流向右')],String.raw`U_H=Bvd=\frac{BI}{neh},\quad n=\frac{BI}{U_Heh}`,
 ['电流向右，电子向左漂移；磁场向下，电子偏向后表面。','后表面聚集负电荷，前表面电势高；稳定时洛伦兹力与电场力平衡，答案 C。'],{notice:'分离进度表示电场逐渐建立的概念过程，不代表微观碰撞弛豫时间。电压读数按演示载流子浓度与尺寸计算。'});
lesson('h2-12','斜轨静止的磁场范围','rail',{B:.8,I:3,m:.2,L:.25,theta:30,mu:Math.sqrt(3)/6},['B'],[v('friction-range','原题数值 · 改变 B')],String.raw`I=3\,\mathrm A,\quad |mg\sin30^\circ-BIL|\le\mu mg\cos30^\circ`,
 ['B=0.8 T 时安培力 0.6 N，静摩擦力 0.4 N，均沿坡向上。','B 经过 4/3 T 时静摩擦力换向；静止范围为 2/3 T≤B≤2 T。'],{notice:'采用原题数值：E=12 V，R+r=4 Ω，m=0.2 kg，L=0.25 m，μ=√3/6，g=10 m/s²。范围外只标示不能静止，不额外假设滑动时电路保持原电流。'});
lesson('h3-1','磁通量改变还需闭合回路','induction',{B:1,rate:1},['B'],[v('open','A · 开口线环'),v('area','B · 两杆分离'),v('cancel','C · 正反通量抵消'),v('translate','D · 匀强场中平移')],String.raw`\mathcal E=-\frac{d\Phi}{dt},\qquad I=\frac{\mathcal E}{R}\ (\text{闭合回路})`,
 ['四种实验分别检查回路是否闭合、磁通量是否改变。','只有 B 中面积增大、磁通量改变且回路闭合，因此产生感应电流。']);
lesson('h3-2','三角线圈在有界磁场中转动','flux',{B:1,R:1,N:5},['B'],[v('triangle','绕 ab 转过 90°')],String.raw`r=\frac{R}{\sqrt3},\quad |\Delta\Phi|=\frac{\pi BR^2}{3}`,
 ['磁场只覆盖初始内切圆；单匝初始磁通量为 BπR²/3。','转过 90°后磁通量为零；答案不乘匝数 N。'],{controls:{B:basic.B,R:c('半边长 R',.5,2,.1,'m'),N:c('匝数 N',1,20,1)},notice:'为展示中间转角，演示把题图磁场延拓为沿磁场方向的圆柱区域，用投影重叠面积计算通量。原题答案只用初、末状态，不依赖这一延拓。'});
lesson('h3-3','手机转轴与地磁通量','flux',{S:.01,rate:1},[],[v('phone-x','绕 x 轴旋转'),v('phone-z','绕 z 轴旋转')],String.raw`|\vec B|=\sqrt{20^2+46^2}\,\mu\mathrm T\approx50.2\,\mu\mathrm T,\quad\Phi=\vec B\cdot\vec S`,
 ['固定地磁场分量为 (0,20,−46) μT，手机法线初始沿 z 轴。','绕 z 轴转动不改变法线，磁通量不变；绕 x 轴转动会改变磁通量。'],{controls:{S:c('手机边框面积 S',.005,.02,.001,'m²')}});
lesson('h3-4','磁流体发电机与路端电压','hall',{B:1,v:2,R:4,r:1},['B'],[v('mhd-up','P 正、Q 负：a→R→b')],String.raw`\mathcal E=Bdv,\quad I=\frac{\mathcal E}{R+r},\quad U=\mathcal E\frac R{R+r}<\mathcal E`,
 ['正负离子受相反的洛伦兹力，P 板电势高。','接入负载后存在内电压降；电阻两端电压小于发电机电动势。'],{controls:{B:basic.B,v:c('流速 v',.5,4,.1,'m/s'),R:c('负载电阻 R',1,10,.5,'Ω'),r:c('内阻 r',.2,3,.1,'Ω')}});
lesson('h3-5','斜向上安培力的分解','rail',{theta:40,B:1,I:3,m:1,L:1},['theta','B','I'],[v('up','安培力斜向左上')],String.raw`F=BIl,\quad f=F\sin\theta,\quad N=mg-F\cos\theta`,
 ['导体棒与磁场始终垂直，安培力大小为 BIl。','水平分量由向右的静摩擦力平衡；竖直分量减小支持力。']);
lesson('h3-7','题设环形电流假说','earth',{charge:1,omega:1},[],[v('earth','负电荷随地球自转')],String.raw`I=\frac{|Q|\omega}{2\pi},\qquad B\propto|Q|\omega`,
 ['依题设假说，地表为负电荷，等效电流与自转方向相反。','增大电量或角速度，等效电流和磁场增强；按实际选项答案为 B。'],{controls:{charge:c('电量大小 / 初值',.2,2,.1),omega:c('角速度 / 初值',.2,2,.1)},notice:'仅检验题目假设的环形电流模型，不把它当成真实地磁成因。'});
lesson('h3-8','竖直磁场中的带电球摆','pendulum',{L:1,m:1,q:1,B:6,theta:35,g:10},['L','B','theta'],[v('pendulum','正电小球 · 竖直向下磁场')],String.raw`m\ddot{\vec r}=m\vec g+q\dot{\vec r}\times\vec B+\vec T,\qquad |\vec r|=L`,
 ['从静止释放，洛伦兹力使运动偏离原来的竖直平面。','切换俯视，观察不会穿过 O，也不会沿同一条曲线往返。'],{controls:{L:basic.L,B:c('磁感应强度 B',1,10,.2,'T'),theta:c('释放角 θ',10,55,1,'°')},notice:'演示采用 m=1 kg、q=1 C、g=10 m/s²。细线保持不可伸长；张力与洛伦兹力都不做功，机械能守恒。'});
lesson('h3-11','恒流导体棒匀加速下滑','rail-motion',{m:1,B:1,L:1,theta:30,a:2,s:2,g:10},['theta','B'],[v('constant-current','松开到达底端')],String.raw`v=\sqrt{2as},\quad I=\frac{m(g\sin\theta-a)}{Bd},\quad Q=I\sqrt{\frac{2s}{a}}`,
 ['外接电源使电流始终恒定；按题给加速度建立动力学关系。','播放完整下滑，观察通过电荷量 Q=It 与末速度。'],{controls:{B:basic.B,s:c('下滑距离 s',.5,3,.1,'m'),a:c('加速度 a',.5,4.5,.1,'m/s²')},notice:'演示 m=1 kg、d=1 m、θ=30°、g=10 m/s²；电流随 a 的选择按题设关系计算，未假设无电源的感应电流。'});
lesson('h3-12','辐向电场使不同比荷离子聚焦','radial-electric',{U:1,r:1,m:1,q:1},[],[v('radial','半径相同 · 速度不同')],String.raw`qU_2=\tfrac12mv^2,\quad qE=\frac{mv^2}{r},\quad E(r)=\frac{2U_2}{r}`,
 ['比较质量 m/2、m、2m 的正离子；均从同一电压加速。','辐向电场在圆轨道上提供正确向心力，三者都通过 S，但到达时刻不同。'],{controls:{U:c('加速电压 U₂',.5,3,.1,'V'),r:c('设计半径 r',.5,2,.1,'m')},notice:'取演示 q=1 C、基准质量 m=1 kg。为定义轨道外的场，采用 E(ρ)=2U₂/ρ 的径向场；题目只要求设计圆周 ρ=r 上的场。'});
lesson('h4-1','磁通量是否随运动变化','induction',{B:1,rate:1},['B'],[v('rotate','甲 · 线框转动'),v('gradient','乙 · 向强场移动'),v('magnet','丙 · 磁铁穿环'),v('wire-translate','丁 · 平行直导线移动')],String.raw`\Phi=\int_S\vec B\cdot d\vec S,\qquad\mathcal E=-\frac{d\Phi}{dt}`,
 ['观察移动或转动时穿过线圈的磁通量曲线。','丁图中到长直导线的距离不变，通量恒定，所以不产生感应电流。']);
lesson('h4-2','初末磁通量相同的转动','flux',{B:1,S:1},['B'],[v('tilted','围绕 cd 从 0°转到 90°')],String.raw`\Phi(\theta)=BS\cos(\theta-45^\circ),\quad\Phi(0)=\Phi(90^\circ)`,
 ['初末通量均为 BS/√2，所以变化量为零。','中间的通量先增后减；总变化量为零不代表整个过程中没有感应电流。'],{controls:{B:basic.B,S:c('面积 S',.2,2,.1,'m²')}});
lesson('h4-4','电流方向、磁针与地磁极','field-direction',{I:2},['I'],[v('wire','甲 · 直导线电流向下'),v('loop','乙 · 逆时针圆电流'),v('solenoid','丙 · 螺线管内部磁场向左'),v('earth','丁 · 地理与地磁两极')],String.raw`\vec B\ \text{由右手螺旋定则判断}`,
 ['切换四幅图，从磁针 N 极方向判断局部磁场方向。','逆时针圆电流内部磁场向纸外；地理北极附近是地磁 S 极。']);
lesson('h4-5','圆环的有效长度与绳张力','partial-ring',{B:1,I:1,m:1,R:1},['B','I'],[v('A','A · 向里 / 半圆'),v('B','B · 向里 / 大弧'),v('C','C · 向外 / 半圆'),v('D','D · 向外 / 大弧')],String.raw`\vec F=I(\vec r_2-\vec r_1)\times\vec B,\quad T=mg-F_y`,
 ['匀强磁场中弯曲导线的合力等效于弧段两端连线所受力。','C、D 中安培力向上；C 的有效长度更大，所以张力最小。'],{notice:'为比较题图，偏心边界示意取 y=R/2；原题未给出其数值。半圆的有效长度 2R 大于任何偏心弦长，此结论不依赖这项赋值。'});
lesson('h4-7','带电圆环沿绝缘棒下滑','contact-motion',{m:1,q:1,B:2,theta:40,mu:.3,g:10},['B','theta','mu'],[v('ring','接触面改变：摩擦先减后增')],String.raw`N=|mg\cos\theta-qBv|,\quad ma=mg\sin\theta-\mu N`,
 ['在 qBv=mg cosθ 时法向力过零，接触面改变，加速度最大。','之后摩擦逐渐增强，速度趋近终端值；选择 A。'],{notice:'演示 m=1 kg、q=1 C。正方向沿杆向下；只有 tanθ>μ 时能按题设由静止下滑。终端速度是极限值，连续模型不会在有限时刻精确达到。'});
lesson('h4-8','磁流体发电与金属霍尔元件','hall',{B:1,v:2,I:2,R:4,r:1},['B'],[v('mhd-down','乙 · B 板为正极'),v('hall-CD','丁 · C 负、D 正')],String.raw`U_H=Bdv,\qquad q\vec E+q\vec v\times\vec B=0`,
 ['磁流体中正离子偏向下方 B 板。','金属的载流子是电子；电子聚集于 C，D 电势较高。']);
lesson('h4-9','磁场通过摩擦改变末速度','contact-motion',{m:1,q:1,B:2,theta:35,mu:.25,g:10,s:3},['B','mu'],[v('slope','同一斜面：无磁场与有磁场')],String.raw`N=mg\cos\theta+qBv,\quad ma=mg\sin\theta-\mu N`,
 ['磁场本身不做功，但使负电物体压得更紧、摩擦力增大。','比较同一底端：有磁场时耗散更多，末速度更小。'],{notice:'按原图选取下坡方向，负电荷与向纸外磁场的洛伦兹力压向斜面。演示 m=1 kg、|q|=1 C、θ=35°、斜面长 3 m。'});
lesson('h4-10','转动导体棒：电阻与有效长度','rotating-rod',{B:1,U:4,L:1,rho:2},['B'],[v('rod','从垂直导轨转过 60°')],String.raw`\ell=\frac L{\cos\varphi},\quad I=\frac{U\cos\varphi}{\rho_\ell L},\quad F=BIL`,
 ['导轨间有效长度增大使接入电阻增大，电流减小。','转过 60°后安培力为初始的一半，两次受力方向相同。'],{controls:{B:basic.B,U:c('恒定电压 U',1,8,.5,'V'),rho:c('单位长度电阻',1,4,.2,'Ω/m')}});
lesson('h5-2','通电棒的启动与反向','rail',{m:1,B:1,I:3,L:1,mu:.2,U:6,R:2},['B'],[v('start','原方向'),v('both-reverse','B 与电源同时反向')],String.raw`I_0=\frac UR,\quad a_0=\frac{BLI_0-\mu mg}{m}`,['检查安培力能否超过最大静摩擦力。','增大电压使启动瞬间加速度增大；B 与 I 同时反向时安培力不变。'],{controls:{B:basic.B,U:c('电源电压 U',1,12,.2,'V')},notice:'只演示闭合瞬间的受力与初始加速度；采用最大静摩擦力等于滑动摩擦力的演示设定。后续电流可能受动生电动势影响，未当作恒流运动。'});
lesson('h5-3','立方体中 L 形导线的合力','cube-wire',{B:1,I:2,L:1},['B','I','L'],[v('cube','E′→E→C 的电流与等效弦')],String.raw`\vec F=I\overrightarrow{E'C}\times\vec B,\quad |E'C|=\sqrt3L,\quad F=\sqrt3BIL`,
 ['拖动空间视角，观察 E′E 与 EC 两段分别受力。','合力等于空间对角线 E′C 的安培力；该线垂直磁场。']);
lesson('h5-4','重力电场平衡后的三维运动','oil-drop',{B:2,m:1,q:-1,g:10,v:2},['B'],[v('parallel','初速度平行磁场'),v('circle','初速度垂直磁场'),v('helix','初速度斜交磁场'),v('no-electric','撤去电场')],String.raw`qE+mg=0,\qquad\vec F_B=q\vec v\times\vec B`,
 ['油滴带负电，重力与向上的电场力平衡。','平行磁场可做匀速直线运动；垂直磁场时顺时针转动；斜交时为螺旋线。'],{notice:'演示 m=1 kg、q=−1 C、g=10 m/s²，E=10 N/C 向下，磁场向纸里；赋值只用于显示三维方向和力的关系。'});
lesson('h5-6','电磁流量计的电压与流量','hall',{B:.05,U:.016,R:.2},[],[v('flowmeter','原题数值 · 污水向左')],String.raw`E=\frac U{2R}=0.04\,\mathrm{V/m},\quad v=\frac U{2BR}=0.8\,\mathrm{m/s},\quad Q_V=\pi R^2v`,
 ['向左运动的正离子受力向上，a 电势高，b 电势低。','原题 1 s 流过体积为 0.032π m³。'],{controls:{B:c('B',.025,.1,.005,'T'),U:c('电压 U',.008,.032,.001,'V')},notice:'默认采用原题 B=0.05 T、U=16 mV、R=0.2 m。改变参数时流速按 U=2BRv 连续更新；电荷分离为概念示意。'});
lesson('h5-8','电流反向与弹簧伸长量','rail-spring',{B:1,I:2,L:1,m:1,k:20,theta:40},['B','I'],[v('up','第一次：安培力沿坡向上'),v('down','反接电源：安培力沿坡向下')],String.raw`kx_1=mg\sin\theta-BIL,\quad kx_2=mg\sin\theta+BIL,\quad B=\frac{k(x_2-x_1)}{2IL}`,
 ['比较同一套装置两个静止平衡位置。','两式相减消去重力分量，得到 B=k(x₂−x₁)/(2IL)。'],{notice:'展示两个平衡位置，不虚构阻尼或达到平衡的时间。若改变参数使 x₁≤0，提示已超出题给两次均伸长的条件。'});
lesson('h5-10','粗糙斜面上的负电物体','contact-motion',{m:1,q:1,B:2,theta:35,mu:.25,g:10,s:3},['B','mu'],[v('slope','同一高度、同一底端的比较')],String.raw`\Delta E_k=W_g-W_f,\qquad N_B=mg\cos\theta+qBv`,
 ['洛伦兹力不做功，仍可能通过增加摩擦改变动能。','比较末速度而不是相同时间的速度，选 A。'],{notice:'演示 m=1 kg、|q|=1 C、θ=35°、斜面长 3 m；磁场压向斜面的方向按原图。'});
lesson('h6-2','四个场向与静摩擦力','rail',{B:1,I:5,m:1,L:1,theta:30},['B','I'],[v('a','a · B 向上'),v('b','b · B 向左'),v('c','c · B 向右'),v('d','d · B 向下')],String.raw`F=BIL,\quad f=mg\sin\theta-F_\parallel,\quad N=mg\cos\theta-F_\perp`,
 ['四种安培力大小相等，方向分别向右、向上、向下、向左。','c、d 的安培力都有沿坡向下分量，静摩擦不可能为零。'],{notice:'静摩擦力由题设静止条件反求，不额外指定摩擦系数；若支持力为负则该参数不符合接触静止。'});
lesson('h6-3','水平恒力下的终端速度','contact-motion',{m:1,q:1,B:2,F:6,mu:.3,g:10},['B','mu'],[v('horizontal','磁场向外 · 正电物体向右')],String.raw`a=\frac Fm-\mu g-\frac{\mu qB}{m}v,\quad v_\infty=\frac{F-\mu mg}{\mu qB}`,
 ['初始加速度最大；随速度增大，压力与摩擦增大，加速度减小。','用功与动能核对 Wf=Fx−mv²/2>μmgx。'],{controls:{B:basic.B,mu:basic.mu,F:c('水平恒力 F',4,9,.1,'N')},notice:'演示 m=1 kg、q=1 C、g=10 m/s²。题干“位移 x 时恰好达到最大速度”为理想化说法；连续模型只在无限时间趋近终端速度，图中不伪造有限时刻到达。'});
lesson('h6-5','光滑斜面上所需的最小磁场','minimum-force',{m:1,M:3,I:2,L:1,theta:30,k:1},['theta','I'],[v('slope','改变支持力，寻找最小安培力')],String.raw`B_{\min}=\frac{mg\sin\theta}{IL}`,['光滑接触的支持力必须沿斜面法线。','安培力与支持力垂直时，安培力最小；地面反力随场向变化，不能一概认为摩擦为零。'],{controls:{theta:basic.theta,I:basic.I,k:c('N / mg',0,1.6,.02)},notice:'演示 m=1 kg、M=3 kg、L=1 m、g=10 m/s²；给出维持整体静止所需的地面支持力与摩擦，不虚构地面摩擦系数。'});
lesson('h6-7','悬线偏转时的最小磁场','minimum-force',{m:1,I:2,L:1,theta:30,k:1},['theta','I'],[v('string','改变绳张力，寻找最小安培力')],String.raw`B_{\min}=\frac{mg\sin\theta}{Il},\quad\vec B\parallel\text{悬线向上}`,['取侧视图，重力固定，张力沿绳方向。','将张力调到 mg cosθ，安培力垂直绳，所需磁感应强度最小。'],{controls:{theta:basic.theta,I:basic.I,k:c('总张力 T / mg',0,1.6,.02)}});
lesson('h6-9','带负电小球的三力平衡','balanced-flight',{m:1,q:-1,v:4,g:10,theta:60},[],[v('balanced','原题：沿 60°匀速直线'),v('turn-electric','E 转为竖直向下')],String.raw`|q|E=mg\tan60^\circ,\quad B=\frac{mg}{|q|v\cos60^\circ}`,['电场向左，负电小球受电场力向右；洛伦兹力斜向左上，所以磁场向纸外。','E 改为向下后电场力向上，但大小 √3mg，不能抵消重力，不形成匀速圆周。'],{controls:{v:c('初速度 v',2,6,.1,'m/s')},notice:'保持原题 θ=60°；演示 m=1 kg、q=−1 C、g=10 m/s²，E、B 随 v 按三力平衡关系计算。'});
lesson('h6-10','两种场中的光滑半圆轨道','half-track',{m:1,q:1,g:10,R:1,B:1,E:3},['B'],[v('compare','同时从右端释放到最低点')],String.raw`K_M=mgR,\quad K_N=mgR-qER,\quad N_M=3mg+qB\sqrt{2gR}`,['甲中磁场不做功；乙中电场做负功，所以乙的机械能减小。','最低点甲球向左且 B 向里，洛伦兹力向下；甲的压力大于乙。原答案 B 不变。'],{controls:{B:basic.B,E:c('电场强度 E',1,8,.2,'N/C')},notice:'采用演示 m=q=R=1、g=10。原解析误把甲在最低点的洛伦兹力画向上，此处已校正；沿轨道运动到首次最低点即停止。'});
lesson('h6-12','圆弧、粗糙水平面与复合场','track-field',{R:.8,L:2,m:2e-6,q:1e-6,E:20,B:1,g:10,mu:.1},[],[v('full','原题数值 · 从释放到落地')],String.raw`v_D=2\sqrt3\,\mathrm{m/s},\quad r=4\sqrt3\,\mathrm m,\quad h=2\sqrt3\,\mathrm m`,['圆弧上重力做功；CD 上摩擦损失机械能。','进入复合场后 qE=mg，速度大小不变；按 PN=√3h 确定圆弧 60°处落地。'],{notice:'完全采用原题数值。机械能指动能与重力势能之和，其减少量为摩擦耗散加电势能增加；只有前者转化为内能。'});

export const supplementalLessons=Object.freeze(entries);
export const lessonById=id=>supplementalLessons.find(entry=>entry.id===id);
export function supplementSnapshot(id){const item=lessonById(id);if(!item)throw Error('未知补充模型');return {scene:{format:'physics-supplement/1',lesson:id,variant:item.variants[0].id,params:{...item.defaults}},context:{progress:0,view:['flux','cube-wire','pendulum','oil-drop','hall','field-direction','earth','spring-current','experiments','induction','rotating-rod'].includes(item.family)?'spatial':'front',showForces:true,showField:true}};}
export function validateSupplement(input){
 if(input?.format!=='physics-supplement/1')throw Error('补充模型格式不正确');const item=lessonById(input.lesson);if(!item)throw Error('未知补充模型');
 if(!item.variants.some(variant=>variant.id===input.variant))throw Error('补充模型的比较状态不正确');
 if(!input.params||typeof input.params!=='object'||Array.isArray(input.params))throw Error('补充模型参数不正确');
 const params={...item.defaults};
 for(const [key,value] of Object.entries(input.params)){
  if(!Object.hasOwn(params,key)||typeof value!=='number'||!Number.isFinite(value))throw Error('补充模型包含无效参数');
  const def=item.controls[key];if(def){if(value<def.min-1e-10||value>def.max+1e-10)throw Error(def.label+'超出可探究范围');params[key]=value;}
  else if(value!==params[key])throw Error('此数值是固定题设或演示常量：'+key);
 }
 return {format:'physics-supplement/1',lesson:item.id,variant:input.variant,params};
}
