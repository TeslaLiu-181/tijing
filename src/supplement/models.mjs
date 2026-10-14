import {lessonById,validateSupplement} from './catalog.mjs';
import {add,sub,mul,dot,cross,norm,unit,rotate,radians,clamp,uniformMotion,slidingState,timeAtDistance,linearDrag,pendulumPath,sampleSeries,trackPath,trackFieldPath,triangleFlux} from './physics.mjs';
export const colors={wire:'#34464c',field:'#598ba4',electric:'#bb8745',magnetic:'#ca6659',normal:'#338a7f',gravity:'#778490',friction:'#8b70a8',tension:'#818e51',particle:'#d1714f',second:'#397f9b',third:'#8866a3',guide:'#b2c0c4'};
const zero=[0,0,0],cache=new Map();
function cached(key,compute){if(!cache.has(key)){if(cache.size>8)cache.delete(cache.keys().next().value);cache.set(key,compute());}return cache.get(key);}
function drawing(){return {items:[],metrics:[],warnings:[],status:'',progressLabel:'过程进度',physicalTime:null,playSeconds:8};}
const metric=(d,label,value,unit='')=>d.metrics.push({label,value,unit});
const text=(d,label,at,role='wire')=>d.items.push({kind:'label',label,at,role});
const path=(d,points,role='wire',extra={})=>d.items.push({kind:'path',points,role,...extra});
const line=(d,a,b,role='wire',extra={})=>path(d,[a,b],role,extra);
const ball=(d,at,role='particle',radius=.08)=>d.items.push({kind:'ball',at,role,radius});
const surface=(d,points,role='field',opacity=.08)=>d.items.push({kind:'surface',points,role,opacity});
const arrow=(d,at,vector,label='',role='magnetic',scale=1,category=role==='magnetic'?'force':'')=>d.items.push({kind:'arrow',at,vector,label,role,scale,category});
const circle=(center,r,u=[1,0,0],v=[0,1,0],count=100)=>Array.from({length:count+1},(_,i)=>add(center,add(mul(u,r*Math.cos(i*2*Math.PI/count)),mul(v,r*Math.sin(i*2*Math.PI/count)))));
const curve=(count,fn)=>Array.from({length:count+1},(_,i)=>fn(i/count));
const plane=(d,y=0)=>surface(d,[[-3,y,-1.2],[3,y,-1.2],[3,y,1.2],[-3,y,1.2]],'normal',.07);
function field(d,B,center=[0,0,0],span=1.9){
 if(norm(B)<1e-12)return;const direction=unit(B),u=unit(cross(direction,Math.abs(direction[2])<.8?[0,0,1]:[0,1,0])),v=cross(direction,u);
 for(const a of [-1,0,1])for(const b of [-1,1]){const at=add(center,add(mul(u,a*span*.65),mul(v,b*span*.42)));arrow(d,add(at,mul(direction,-.65)),direction,'','field',1.3);if(Math.abs(direction[2])>.999)text(d,direction[2]>0?'⊙':'⊗',at,'field');}
 arrow(d,add(center,[span,span*.72,0]),direction,Math.abs(direction[2])>.999?(direction[2]>0?'B ⊙':'B ⊗'):'B','field',.7);
}
function wireArrow(d,a,b,label='I'){line(d,a,b,'wire',{width:.04});arrow(d,add(a,mul(sub(b,a),.3)),unit(sub(b,a)),label,'electric',.65);}
function support(d,alpha,position=zero){
 const t=[Math.cos(alpha),Math.sin(alpha),0],n=[-Math.sin(alpha),Math.cos(alpha),0];
 const railLength=Math.max(2.7,norm(position)+.6);for(const z of [-1,1])line(d,add(mul(t,-railLength),[0,0,z]),add(mul(t,railLength),[0,0,z]),'wire',{width:.028});
 const rod=add(position,mul(n,.06));line(d,add(rod,[0,0,-1.18]),add(rod,[0,0,1.18]),'wire',{width:.065});ball(d,rod,'wire',.075);
 return {t,n,rod};
}
function force(d,at,vector,name,role,mg=10){arrow(d,at,vector,name,role,1.45/Math.max(mg,1e-10),'force');}
function graph(d,xlabel,ylabel,series,cursor){d.chart={xlabel,ylabel,series,cursor};}
function fluxModel(d,item,p,variant,u){
 const triangle=variant==='triangle',phone=variant.startsWith('phone'),tilted=variant==='tilted',max=triangle||tilted?90:180,a=radians(max*u),B=phone?[0,20e-6,-46e-6]:tilted?[p.B/Math.sqrt(2),0,p.B/Math.sqrt(2)]:[0,0,triangle?-p.B:p.B],S=p.S||1;
 let loop,normal,phi,area,angle=max*u;
 const calc=f=>{
  const t=radians(max*f);if(triangle)return triangleFlux(p.B,p.R,t).flux;
  const n=variant==='phone-z'?[0,0,1]:phone?rotate([0,0,1],[1,0,0],-t):tilted?rotate([0,0,1],[0,1,0],t):rotate([0,0,1],[1,0,0],t);
  return dot(B,n)*S;
 };
 if(triangle){const data=triangleFlux(p.B,p.R,a);loop=[...data.points,data.points[0]];normal=rotate([0,0,1],unit([Math.sqrt(3),-1,0]),a);phi=data.flux;area=Math.PI*data.radius**2;
  path(d,circle(zero,data.radius),'field',{dashed:true});if(data.overlap.length)surface(d,data.overlap.map(p=>[p[0],p[1],.005]),'field',.17);
  const axis=unit([Math.sqrt(3),-1,0]);line(d,mul(axis,-2.1*p.R),mul(axis,2.1*p.R),'guide',{dashed:true});text(d,'a',mul(axis,-2.2*p.R));text(d,'b',mul(axis,2.2*p.R));
 }else{const axis=phone?[variant==='phone-z'?0:1,0,variant==='phone-z'?1:0]:tilted?[0,1,0]:[1,0,0],sgn=phone&&variant==='phone-x'?-1:1;
  loop=[[-1.4,-.85,0],[1.4,-.85,0],[1.4,.85,0],[-1.4,.85,0],[-1.4,-.85,0]].map(q=>rotate(q,axis,sgn*a));normal=rotate([0,0,1],axis,sgn*a);phi=calc(u);area=S;
  line(d,mul(axis,-2),mul(axis,2),'guide',{dashed:true});text(d,phone?variant==='phone-x'?'x 轴':'z 轴':tilted?'cd 转轴':'转轴',mul(axis,2.15));
 }
 surface(d,loop.slice(0,-1),'normal',.14);path(d,loop,'wire',{width:.04});arrow(d,zero,normal,'n','normal',1.1);field(d,B);
 const derivative=(calc(clamp(u+.0001,0,1))-calc(clamp(u-.0001,0,1)))/(radians(max)*(clamp(u+.0001,0,1)-clamp(u-.0001,0,1)));
 metric(d,'转角',angle,'°');metric(d,'单匝磁通量 Φ',phi,phone?'Wb':'Wb');metric(d,'初末变化量',calc(1)-calc(0),'Wb');
 if(p.N){metric(d,'匝数 N',p.N);metric(d,'磁通链 NΦ',p.N*phi,'Wb');}
 if(phone)metric(d,'|B|',Math.hypot(20,46),'μT');else if(!triangle)metric(d,'感应电动势（ω=当前值）',-(p.N||1)*derivative*(p.rate??1),'V');
 d.status=triangle?'着色部分为投影与磁场区域的重叠面积':tilted?'初末通量相同，中间仍发生变化':variant==='phone-z'?'绕法线旋转，磁通量恒定':'磁通量由磁场与有向面积的点积决定';
 d.progressLabel='转角';graph(d,'转角 / °','Φ / '+(phone?'μWb':'Wb'),[{name:'磁通量',role:'field',points:curve(90,f=>[max*f,calc(f)*(phone?1e6:1)])}],angle);
 return d;
}
function railModel(d,item,p,variant,u){
 const g=10,mg=p.m*g,alpha=['h2-12','h6-2'].includes(item.id)?radians(p.theta):0;
 let theta=radians(p.theta||0),B=[p.B*Math.cos(theta),p.B*Math.sin(theta),0],Iz=-p.I,F,I=p.I;
 if(item.id==='h2-5')theta=radians(p.theta+(90-p.theta)*u),B=[p.B*Math.cos(theta),p.B*Math.sin(theta),0];
 if(variant==='up')Iz=p.I;
 if(variant==='friction-range'){B=[-p.B*Math.sin(alpha),p.B*Math.cos(alpha),0];}
 if(item.id==='h6-2')B=mul(({a:[0,1,0],b:[-1,0,0],c:[1,0,0],d:[0,-1,0]})[variant],p.B);
 if(item.id==='h5-2'){I=p.U/p.R;const sign=variant==='both-reverse'?-1:1;Iz=-I*sign;B=[0,p.B*sign,0];}
 F=mul(cross([0,0,Iz],B),p.L);const {t,n,rod}=support(d,alpha),ft=dot(F,t),fn=dot(F,n),N=mg*Math.cos(alpha)-fn,required=mg*Math.sin(alpha)-ft;
 wireArrow(d,add(rod,[0,0,Iz>0?-1.1:1.1]),add(rod,[0,0,Iz>0?1.1:-1.1]));field(d,B);
 let friction=required,status='静止平衡',a=0;
 if(item.id==='h2-12'&&Math.abs(required)>p.mu*N+1e-9){status='超出静摩擦范围，不能静止';d.warnings.push(status);friction=Math.sign(required)*p.mu*N;}
 if(item.id==='h5-2'){const max=p.mu*mg;if(Math.abs(ft)>max){friction=-Math.sign(ft)*max;a=(ft+friction)/p.m;status='超过最大静摩擦力，开始运动';}else status='静摩擦足以平衡，不能启动';}
 if(N< -1e-9)d.warnings.push('此参数需要负支持力，已超出接触静止条件。');
 force(d,rod,[0,-mg,0],'mg','gravity',mg);force(d,rod,F,'F安','magnetic',mg);force(d,rod,mul(n,Math.max(0,N)),'N','normal',mg);force(d,rod,mul(t,friction),'f','friction',mg);
 metric(d,'安培力 |F|',norm(F),'N');metric(d,'支持力 N',N,'N');metric(d,'静摩擦（沿坡向上为正）',friction,'N');metric(d,'电流 I',I,'A');
 if(item.id==='h5-2'){metric(d,'初始加速度 a₀',a,'m/s²');d.progressLabel='初始受力';}
 else metric(d,'θ',theta*180/Math.PI,'°');
 if(item.id==='h2-12'){metric(d,'静摩擦上限',p.mu*N,'N');metric(d,'B 最小值',2/3,'T');metric(d,'B 最大值',2,'T');}
 d.status=status;return d;
}
function contactModel(d,item,p,variant,u){
 const a=radians(p.theta||0),m=p.m,g=p.g,up=[Math.cos(a),Math.sin(a),0],down=variant==='horizontal'?[1,0,0]:variant==='ring'?[Math.cos(a),-Math.sin(a),0]:mul(up,-1),n=[(variant==='ring'?1:-1)*Math.sin(a),Math.cos(a),0],mg=m*g;
 const a0=variant==='horizontal'?p.F/m-p.mu*g:g*(Math.sin(a)-p.mu*Math.cos(a)),beta=p.mu*p.q*p.B/m;
 let duration,finishNoB,finishB;
 if(variant==='slope'){finishNoB=timeAtDistance(a0,0,p.s);finishB=timeAtDistance(a0,beta,p.s);duration=finishB||1;}
 else if(variant==='ring'){const initial=slidingState(p,variant,0);duration=initial.criticalTime===null?1:initial.criticalTime+6/beta;}
 else duration=6/beta;
 if(a0<=0)d.warnings.push('当前参数不能由静止沿指定方向启动。');
 const t=u*duration,state=slidingState(p,variant,t),end=slidingState(p,variant,duration),extent=variant==='slope'?p.s:Math.max(1,end.x),scale=4.8/extent,origin=mul(down,-2.4),at=add(origin,mul(down,state.x*scale)),forceBase=Math.max(mg,end.N,p.q*p.B*end.v,p.F||0);
 line(d,add(origin,mul(down,-.3)),add(origin,mul(down,5.4)),'wire',{width:.05});if(variant==='ring')path(d,circle(at,.16,n,[0,0,1]),'particle',{width:.05});else ball(d,at,'particle',.13);text(d,variant==='ring'?'+q 圆环':variant==='slope'?'−q 物体':'+q 物体',add(at,[.18,.25,0]));
 const normal=variant==='horizontal'?[0,1,0]:n,Bsign=variant==='ring'?-1:1;field(d,[0,0,Bsign*p.B],zero,2);
 const Fb=mul(normal,(variant==='ring'?1:-1)*p.q*p.B*state.v);
 force(d,at,[0,-mg,0],'mg','gravity',forceBase);force(d,at,Fb,'F洛','magnetic',forceBase);force(d,at,mul(normal,state.normalSign*state.N),'N','normal',forceBase);force(d,at,mul(down,-state.f),'f','friction',forceBase);
 if(variant==='horizontal')force(d,at,mul(down,p.F),'F','electric',forceBase);
 const workDrive=variant==='horizontal'?p.F*state.x:mg*Math.sin(a)*state.x,Wf=workDrive-.5*m*state.v**2;
 metric(d,'时间 t',t,'s');metric(d,'位移 s',state.x,'m');metric(d,'速度 v',state.v,'m/s');metric(d,'加速度 a',state.a,'m/s²');metric(d,'法向力 |N|',state.N,'N');metric(d,'摩擦耗散 Wf',Wf,'J');
 const series=[{name:'有磁场 v',role:'particle',points:curve(160,f=>{const x=duration*f;return [x,slidingState(p,variant,x).v];})}];
 if(variant==='slope'&&finishNoB!==null){const ref=linearDrag(a0,0,Math.min(t,finishNoB));const offset=[0,0,.35],r=add(add(origin,mul(down,ref.x*scale)),offset);ball(d,r,'second',.1);text(d,'无磁场',add(r,[.15,-.3,0]),'second');metric(d,'无磁场末速度',linearDrag(a0,0,finishNoB).v,'m/s');metric(d,'有磁场末速度',slidingState(p,variant,finishB).v,'m/s');series.push({name:'无磁场（到底端截止）',role:'second',points:curve(100,f=>[f*finishNoB,linearDrag(a0,0,f*finishNoB).v])});}
 else metric(d,'终端速度 v∞',state.terminal,'m/s');
 if(variant==='ring'){metric(d,'接触面改变时刻',state.criticalTime,'s');d.status=state.normalSign>0?'洛伦兹力减小压力与摩擦':'接触面已改变，法向力反向';}
 else d.status=variant==='slope'?'比较同一底端的末速度与摩擦耗散':'加速度逐渐趋近零，速度渐近终端值';
 graph(d,'t / s','v / (m/s)',series,t);d.physicalTime=t;d.playSeconds=10;return d;
}
function pendulumModel(d,item,p,u){
 const data=cached('pendulum'+JSON.stringify(p),()=>pendulumPath(p)),t=u*data.duration,s=sampleSeries(data.samples,t),Fmag=mul(cross(s.v,[0,-p.B,0]),p.q),Fg=[0,-p.m*p.g,0],external=add(Fmag,Fg),T=-(dot(s.r,external)+p.m*dot(s.v,s.v))/(p.L*p.L),Ft=mul(s.r,T),scale=2/p.L;
 const r=mul(s.r,scale);ball(d,zero,'wire',.06);line(d,zero,r,'tension',{width:.018});ball(d,r,'particle',.11);path(d,data.samples.filter(x=>x.t<=t).map(x=>mul(x.r,scale)),'particle');path(d,circle([0,-2,0],2*Math.sin(radians(p.theta)),[1,0,0],[0,0,1]),'guide',{dashed:true});text(d,'O（最低平衡位置）',[.12,-2.1,0]);
 field(d,[0,-p.B,0],[0,-.8,0]);force(d,r,Fg,'mg','gravity',p.m*p.g);force(d,r,Fmag,'F洛','magnetic',p.m*p.g);force(d,r,Ft,'T','tension',p.m*p.g);
 metric(d,'时间',t,'s');metric(d,'速率',norm(s.v),'m/s');metric(d,'水平偏离 O',Math.hypot(s.r[0],s.r[2]),'m');metric(d,'动能 K',.5*p.m*dot(s.v,s.v),'J');metric(d,'机械能（支点为零势面）',s.energy,'J');metric(d,'线长',norm(s.r),'m');
 graph(d,'t / s','水平半径 / m',[{name:'偏离 O 的距离',role:'particle',points:data.samples.filter((_,i)=>i%8===0).map(x=>[x.t,Math.hypot(x.r[0],x.r[2])])}],t);
 d.physicalTime=t;d.playSeconds=12;d.status='球面约束下的实际数值轨迹；俯视可见平面偏转';return d;
}
function flightModel(d,item,p,variant,u){
 const isRelease=item.id==='h2-9',m=p.m,q=p.q,g=p.g,v=p.v,theta=radians(isRelease?45:p.theta),E=m*g*Math.tan(theta)/Math.abs(q),B=m*g/(Math.abs(q)*v*Math.cos(theta)),v0=[v*Math.cos(theta),v*Math.sin(theta),0],omega=(isRelease?-1:1)*q*B/m;
 const before=1,duration=isRelease?before+2*v0[1]/g:2.5;
 function at(t){if(isRelease&&t<before)return {r:mul(v0,t-before),v:v0,a:zero};if(isRelease)return uniformMotion({v0,a0:[g,-g,0]},t-before);return uniformMotion({v0,a0:variant==='balanced'?[Math.abs(q)*E/m,-g,0]:[0,Math.abs(q)*E/m-g,0],omega},t);}
 const t=u*duration,s=at(t),samples=curve(180,f=>at(duration*f).r),all=samples.flat(),span=Math.max(...all)-Math.min(...all),scale=6/Math.max(span,1),points=samples.map(r=>mul(r,scale)),atDraw=mul(s.r,scale);
 path(d,points,'guide',{dashed:true});path(d,curve(140,f=>mul(at(t*f).r,scale)),'particle');ball(d,atDraw,'particle',.1);
 if(isRelease){text(d,'M',mul(v0.map(x=>-x),scale));text(d,'N',[0,-.22,0]);text(d,'P',add(mul(at(duration).r,scale),[0,-.25,0]));line(d,zero,mul(at(duration).r,scale),'guide',{dashed:true});}
 const activeB=isRelease&&t>=before?0:(isRelease?-B:B),electric=isRelease||variant==='balanced'?[m*g*Math.tan(theta),0,0]:[0,Math.abs(q)*E,0],fb=mul(cross(s.v,[0,0,activeB]),q);
 force(d,atDraw,[0,-m*g,0],'mg','gravity',m*g);force(d,atDraw,electric,'qE','electric',m*g);force(d,atDraw,fb,'F洛','magnetic',m*g);field(d,[0,0,activeB]);
 metric(d,'时间',t,'s');metric(d,'速率',norm(s.v),'m/s');metric(d,'电场 E',E,'N/C');metric(d,'磁场 |B|',B,'T');metric(d,'磁力功率',dot(fb,s.v),'W');
 if(isRelease){metric(d,'最大高度',v*v/(4*g),'m');metric(d,'P 点速率',Math.sqrt(5)*v,'m/s');d.status=t<before?'M→N：三力平衡':'N 点磁场已撤去：水平加速、竖直先上升后下降';}
 else d.status=variant==='balanced'?'qE 与 mg 的合力由洛伦兹力平衡':'改向后电场力大于重力，不能做匀速圆周运动';
 graph(d,'t / s','速率 / (m/s)',[{name:'速率',role:'particle',points:curve(100,f=>[f*duration,norm(at(f*duration).v)])}],t);d.physicalTime=t;return d;
}
function oilModel(d,item,p,variant,u){
 const B=-p.B,omega=p.q*B/p.m,v0=variant==='parallel'?[0,0,-p.v]:variant==='helix'?[p.v*.8,0,-p.v*.6]:[p.v,0,0],a0=variant==='no-electric'?[0,-p.g,0]:zero,duration=2*Math.PI/Math.abs(omega),t=u*duration,at=x=>uniformMotion({v0,a0,omega},x),s=at(t);
 path(d,curve(180,f=>at(duration*f).r),'guide',{dashed:true});path(d,curve(160,f=>at(t*f).r),'particle');ball(d,s.r,'particle');field(d,[0,0,B]);
 force(d,s.r,[0,-p.m*p.g,0],'mg','gravity',p.m*p.g);if(variant!=='no-electric')force(d,s.r,[0,p.m*p.g,0],'qE','electric',p.m*p.g);force(d,s.r,mul(cross(s.v,[0,0,B]),p.q),'F洛','magnetic',p.m*p.g);
 metric(d,'时间',t,'s');metric(d,'速率',norm(s.v),'m/s');metric(d,'电荷 q',p.q,'C');metric(d,'电场（向下）',variant==='no-electric'?0:p.m*p.g/Math.abs(p.q),'N/C');d.status=variant==='parallel'?'沿磁场匀速直线':variant==='circle'?'从纸外看顺时针匀速圆周':variant==='helix'?'沿场匀速与垂场圆周的叠加':'重力未被抵消，速率通常改变';d.physicalTime=t;return d;
}
function railMotion(d,item,p,u){
 const alpha=radians(p.theta),duration=Math.sqrt(2*p.s/p.a),t=u*duration,x=.5*p.a*t*t,v=p.a*t,I=p.m*(p.g*Math.sin(alpha)-p.a)/(p.B*p.L),up=[Math.cos(alpha),Math.sin(alpha),0],at=mul(up,2-4*x/p.s),{rod,n}=support(d,alpha,at),mg=p.m*p.g;
 field(d,mul(n,p.B));force(d,rod,[0,-mg,0],'mg','gravity',mg);force(d,rod,mul(up,I*p.B*p.L),'F安','magnetic',mg);force(d,rod,mul(n,mg*Math.cos(alpha)),'N','normal',mg);
 metric(d,'t',t,'s');metric(d,'下滑距离',x,'m');metric(d,'v',v,'m/s');metric(d,'恒定电流 I',I,'A');metric(d,'通过电荷 Q',I*t,'C');metric(d,'末速度',Math.sqrt(2*p.a*p.s),'m/s');d.physicalTime=t;d.status='外接恒流条件下的完整匀加速过程';graph(d,'t / s','Q / C',[{name:'通过电荷',role:'electric',points:[[0,0],[duration,I*duration]]}],t);return d;
}
function radialModel(d,item,p,u){
 const r=p.r,m=p.m,q=p.q,U=p.U,factors=[.5,1,2],vslow=Math.sqrt(2*q*U/(2*m)),duration=Math.PI*r/vslow,t=u*duration,center=[r,0,0];
 const arc=curve(150,f=>[r-r*Math.cos(f*Math.PI),r*Math.sin(f*Math.PI),0]);surface(d,[zero,...arc,[2*r,0,0]],'electric',.06);path(d,arc,'guide',{dashed:true});text(d,'O',add(center,[0,-.17,0]));text(d,'S',[2*r,-.18,0]);
 for(const a of [.2,.6,1,1.4,1.8,2.2,2.6,3]){const pt=add(center,[r*Math.cos(a),r*Math.sin(a),0]);arrow(d,pt,sub(center,pt),'','electric',.38/r);}
 factors.forEach((factor,i)=>{const v=Math.sqrt(2*q*U/(factor*m)),exit=Math.PI*r/v,theta=Math.min(t*v/r,Math.PI),pos=[r-r*Math.cos(theta),r*Math.sin(theta),0],role=['second','particle','third'][i];path(d,curve(80,f=>[r-r*Math.cos(f*theta),r*Math.sin(f*theta),.015*i]),role);if(t<=exit+1e-8){ball(d,add(pos,[0,0,.015*i]),role);text(d,factor+'m',add(pos,[.08,.15+i*.04,0]),role);}metric(d,`${factor}m 到 S 时间`,exit,'s');});
 metric(d,'轨道半径 r',r,'m');metric(d,'圆周上电场强度',2*U/r,'N/C');metric(d,'当前时间',t,'s');d.physicalTime=t;d.status='三种离子同轨道；到 S 后移出观察区，时间不同';return d;
}
function halfTrack(d,item,p,u){
 const A=cached('trackA'+p.R+':'+p.g,()=>trackPath(p)),B=cached('trackB'+JSON.stringify(p),()=>trackPath({...p,electricAcceleration:p.q*p.E/p.m})),duration=Math.max(A.duration,B.duration),t=u*duration,forceBase=3*p.m*p.g+p.q*p.B*Math.sqrt(2*p.g*p.R);
 for(const [i,data] of [A,B].entries()){
  const cx=i?2:-2,s=sampleSeries(data.samples,Math.min(t,data.duration)),phi=s.angle,r=[cx+p.R*Math.cos(phi),-p.R*Math.sin(phi),0],speed=p.R*s.w,vel=[-speed*Math.sin(phi),-speed*Math.cos(phi),0],inward=[-Math.cos(phi),Math.sin(phi),0],Fext=i?[p.q*p.E,-p.m*p.g,0]:add([0,-p.m*p.g,0],mul(cross(vel,[0,0,-p.B]),p.q)),N=p.m*speed**2/p.R-dot(Fext,inward);
  path(d,curve(110,f=>[cx+p.R*Math.cos(Math.PI*f),-p.R*Math.sin(Math.PI*f),0]),'wire',{width:.035});ball(d,r,i?'second':'particle');text(d,i?'乙 · 电场':'甲 · 磁场',[cx,-p.R-.55,0]);force(d,r,[0,-p.m*p.g,0],'mg','gravity',forceBase);force(d,r,mul(inward,N),'N','normal',forceBase);force(d,r,i?[p.q*p.E,0,0]:mul(cross(vel,[0,0,-p.B]),p.q),i?'qE':'F洛',i?'electric':'magnetic',forceBase);
  metric(d,i?'乙速率':'甲速率',speed,'m/s');metric(d,i?'乙支持力':'甲支持力',N,'N');
 }
 text(d,'B ⊗',[-2,.65,0],'field');arrow(d,[1.2,.65,0],[1,0,0],'E','electric',1.3);metric(d,'甲最低点动能',p.m*p.g*p.R,'J');metric(d,'乙最低点动能',(p.m*p.g-p.q*p.E)*p.R,'J');metric(d,'甲最低点压力',3*p.m*p.g+p.q*p.B*Math.sqrt(2*p.g*p.R),'N');metric(d,'乙最低点压力',3*p.m*p.g-2*p.q*p.E,'N');d.physicalTime=t;d.status='先到最低点的轨迹停在该事件；甲的最低点洛伦兹力向下';return d;
}
function trackField(d,item,p,u){
 const data=cached('trackfield',()=>trackFieldPath(p)),t=u*data.duration,s=data.at(t),scale=.62,conv=x=>mul(x,scale),r=conv(s.r);
 path(d,curve(100,f=>conv([-p.L-p.R*Math.cos(Math.PI*f/2),p.R*(1-Math.sin(Math.PI*f/2)),0])),'wire',{width:.045});line(d,conv([-p.L,0,0]),zero,'wire',{width:.045});line(d,conv([-.1,-data.h,0]),conv([data.radius,-data.h,0]),'wire');surface(d,[zero,conv([data.radius,0,0]),conv([data.radius,-data.h,0]),conv([0,-data.h,0])],'field',.06);
 path(d,curve(200,f=>conv(data.at(f*data.duration).r)),'guide',{dashed:true});path(d,curve(150,f=>conv(data.at(f*t).r)),'particle');ball(d,r,'particle');text(d,'C',conv([-p.L,-.25,0]));text(d,'D',[-.05,.2,0]);text(d,'N',conv([-.2,-data.h,0]));text(d,'P',add(conv(data.at(data.duration).r),[.15,-.2,0]));
 for(const x of [.7,1.5,2.3,3.1])arrow(d,[x,-.95,0],[0,1,0],x===.7?'E ↑':'','electric',.5);text(d,'B ⊙（纸外）',[2.45,-1.45,0],'field');
 const mg=p.m*p.g;force(d,r,[0,-mg,0],'mg','gravity',mg);
 if(s.phase===2){force(d,r,[0,p.q*p.E,0],'qE','electric',mg);force(d,r,mul(cross(s.v,[0,0,p.B]),p.q),'F洛','magnetic',mg);}
 if(s.phase===1){force(d,r,[-p.mu*mg,0,0],'f','friction',mg);force(d,r,[0,mg,0],'N','normal',mg);}
 if(s.phase===0){const direction=unit(sub([-p.L,p.R,0],s.r)),N=p.m*dot(s.v,s.v)/p.R+mg*direction[1];force(d,r,mul(direction,N),'N','normal',mg);}
 metric(d,'时间',t,'s');metric(d,'速率',norm(s.v),'m/s');metric(d,'D 点速度',data.vD,'m/s');metric(d,'平台高度 h',data.h,'m');metric(d,'摩擦耗散',s.frictionWork,'J');metric(d,'电势能增加',-s.electricWork,'J');metric(d,'全程机械能减少',data.loss,'J');d.status=['光滑圆弧：重力做功','粗糙 CD：摩擦耗散','复合场：qE=mg，匀速圆周'][s.phase];d.physicalTime=t;d.playSeconds=10;
 graph(d,'t / s','速率 / (m/s)',[{name:'速率',role:'particle',points:curve(160,f=>[f*data.duration,norm(data.at(f*data.duration).v)])}],t);return d;
}
function minimumModel(d,item,p,variant){
 const a=radians(p.theta),mg=p.m*10,s=Math.sin(a),c=Math.cos(a),constraint=variant==='string'?[-s,c,0]:[-s,c,0],T=p.k*mg,F=sub([0,mg,0],mul(constraint,T)),B=[-F[1]/(p.I*p.L),F[0]/(p.I*p.L),0],point=[0,0,0];
 if(variant==='slope')support(d,a);else{const anchor=mul(constraint,2.5);line(d,point,anchor,'tension',{width:.022});text(d,'O',add(anchor,[0,.15,0]));line(d,[0,0,-1],[0,0,1],'wire',{width:.055});}
 force(d,point,[0,-mg,0],'mg','gravity',mg);force(d,point,mul(constraint,T),variant==='string'?'T':'N','normal',mg);force(d,point,F,'F安','magnetic',mg);arrow(d,[1.8,.6,0],unit(B),'B','field',.8);
 metric(d,variant==='string'?'总张力 T':'支持力 N',T,'N');metric(d,'所需 B',norm(B),'T');metric(d,'最小 B',mg*s/(p.I*p.L),'T');metric(d,'最优约束力 / mg',c);metric(d,'安培力与约束力点积',dot(F,mul(constraint,T)),'N²');
 if(variant==='slope'){metric(d,'地面对斜面的支持力',(p.M||3)*10+T*c,'N');metric(d,'地面摩擦（向右为正）',-T*s,'N');}
 graph(d,'约束力 / mg','B / T',[{name:'所需磁场',role:'field',points:curve(100,f=>{const k=f*1.6,force=sub([0,mg,0],mul(constraint,k*mg));return [k,norm(force)/(p.I*p.L)];})}],p.k);d.status=Math.abs(p.k-c)<.015?'已接近最小磁场：安培力垂直约束力':'拖动约束力，观察 B 的最小值';d.progressLabel='静态平衡';return d;
}
function springRail(d,item,p,variant){
 const alpha=radians(p.theta),up=[Math.cos(alpha),Math.sin(alpha),0],mg=p.m*10,F=p.B*p.I*p.L,x1=(mg*Math.sin(alpha)-F)/p.k,x2=(mg*Math.sin(alpha)+F)/p.k,x=variant==='up'?x1:x2,at=mul(up,-3*x),{rod,n}=support(d,alpha,at),anchor=mul(up,2.7);
 const delta=sub(rod,anchor),coil=curve(150,f=>add(add(anchor,mul(delta,f)),add(mul(n,.08*Math.cos(f*Math.PI*24)),[0,0,.08*Math.sin(f*Math.PI*24)])));path(d,[anchor,...coil,rod],'tension',{width:.025});ball(d,anchor,'wire',.06);text(d,variant==='up'?'I ⊗':'I ⊙',add(rod,[.18,-.13,0]),'electric');arrow(d,[1.3,-.4,0],n,'B','field',.75);
 force(d,rod,[0,-mg,0],'mg','gravity',mg);force(d,rod,mul(up,variant==='up'?F:-F),'F安','magnetic',mg);force(d,rod,mul(up,p.k*x),'kx','tension',mg);force(d,rod,mul(n,mg*Math.cos(alpha)),'N','normal',mg);
 metric(d,'x₁',x1,'m');metric(d,'x₂',x2,'m');metric(d,'差值 x₂−x₁',x2-x1,'m');metric(d,'由差值反求 B',p.k*(x2-x1)/(2*p.I*p.L),'T');if(x1<=0)d.warnings.push('当前 x₁≤0，不符合题目第一次弹簧伸长的条件。');d.status='两种电流方向的静止平衡位置';d.progressLabel='平衡位置比较';return d;
}
function rodModel(d,item,p,u){
 const phi=radians(60*u),length=p.L/Math.cos(phi),I=p.U/(p.rho*length),F=p.B*I*p.L,a=[-1.2,0,1],b=[-1.2+2*Math.tan(phi),0,-1];
 plane(d);for(const z of [-1,1])line(d,[-2,0,z],[3,0,z],'wire');wireArrow(d,a,b);field(d,[p.B,0,0]);arrow(d,mul(add(a,b),.5),[0,-1,0],'F安','magnetic',.3+F*.35);
 metric(d,'转角 φ',60*u,'°');metric(d,'接入棒长',length,'m');metric(d,'接入电阻',p.rho*length,'Ω');metric(d,'电流',I,'A');metric(d,'安培力',F,'N');metric(d,'F / F₁',Math.cos(phi));d.status='磁场与导轨平行，力始终垂直导轨平面';d.progressLabel='转角';return d;
}
function ringModel(d,item,p,variant){
 const h=['B','D'].includes(variant)?.5:0,Bz=['A','B'].includes(variant)?-p.B:p.B,chord=2*p.R*Math.sqrt(1-h*h),F=Bz*p.I*chord,T=p.m*10-F;
 path(d,circle(zero,1.25),'wire',{width:.032});line(d,[0,1.25,0],[0,2,0],'tension');line(d,[-.55,2,0],[.55,2,0],'wire');line(d,[-2,1.25*h,0],[2,1.25*h,0],'guide',{dashed:true});surface(d,[[-2,-1.8,0],[2,-1.8,0],[2,1.25*h,0],[-2,1.25*h,0]],'field',.06);
 field(d,[0,0,Bz],[0,-.55,0],1.3);arrow(d,[-.2,1.25,0],[1,0,0],'I','electric',.55);const xc=1.25*Math.sqrt(1-h*h);wireArrow(d,[xc,1.25*h,.02],[-xc,1.25*h,.02],'Iℓ有效');force(d,zero,[0,-p.m*10,0],'mg','gravity',p.m*10);force(d,zero,[0,F,0],'F安','magnetic',p.m*10);force(d,zero,[0,T,0],'T','tension',p.m*10);
 metric(d,'有效弦长',chord,'m');metric(d,'安培力（向上为正）',F,'N');metric(d,'张力',T,'N');if(T<=0)d.warnings.push('此参数下细线不能保持拉紧，超出题设。');d.status='受力积分只取磁场内弧段，等效为边界弦';d.progressLabel='选项比较';return d;
}
function cubeModel(d,item,p){
 const L=p.L,E=[-L,0,L],C=[L,0,-L],D=[-L,0,-L],F=[L,0,L],Ep=add(E,[0,2*L,0]),Bvec=mul(unit(sub(F,D)),p.B),wire=[Ep,E,C],v1=sub(E,Ep).map(x=>x/2),v2=sub(C,E).map(x=>x/2),forces=[mul(cross(v1,Bvec),p.I),mul(cross(v2,Bvec),p.I)],total=add(...forces);
 const corners=[E,F,C,D];for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];line(d,a,b,'guide');line(d,add(a,[0,2*L,0]),add(b,[0,2*L,0]),'guide');line(d,a,add(a,[0,2*L,0]),'guide');}
 wireArrow(d,Ep,E);wireArrow(d,E,C);line(d,Ep,C,'tension',{dashed:true});text(d,'E′',add(Ep,[-.2,.15,0]));text(d,'E',add(E,[-.2,-.2,0]));text(d,'C',add(C,[.15,-.15,0]));text(d,'D',add(D,[-.2,0,0]));text(d,'F',add(F,[.2,0,0]));field(d,Bvec,[0,L,0]);force(d,mul(add(Ep,E),.5),forces[0],'F₁','magnetic',p.B*p.I*p.L);force(d,mul(add(E,C),.5),forces[1],'F₂','second',p.B*p.I*p.L);arrow(d,[0,1.2*L,0],unit(total),'F合','tension',1.3);
 metric(d,'|F₁|',norm(forces[0]),'N');metric(d,'|F₂|',norm(forces[1]),'N');metric(d,'|F合|',norm(total),'N');metric(d,'√3 BIL',Math.sqrt(3)*p.B*p.I*p.L,'N');d.status='导线与立方体按比例放大显示；数值使用题设边长 L';d.progressLabel='空间结构';return d;
}
function hallModel(d,item,p,variant,u){
 const electron=variant==='hall'||variant==='hall-CD',flow=variant==='flowmeter',down=variant==='mhd-down',fraction=u;
 let Bvec,vvec,positive,negative,distance,velocity,voltage,E,outputI=0;
 if(electron){const e=1.602176634e-19,n=5e28,h=1e-4;distance=.01;velocity=p.I/(n*e*h*distance);voltage=p.B*velocity*distance;E=voltage/distance;Bvec=[0,-p.B,0];vvec=[-velocity,0,0];positive=[0,0,1];negative=[0,0,-1];metric(d,'载流子浓度 n',n,'m⁻³');metric(d,'厚度 h',h,'m');metric(d,'霍尔电压 UH',voltage*1e6,'μV');}
 else{distance=flow?2*p.R:1;velocity=flow?p.U/(p.B*distance):p.v;Bvec=[0,0,p.B];vvec=[down?velocity:-velocity,0,0];positive=[0,down?-1:1,0];negative=mul(positive,-1);voltage=p.B*velocity*distance;E=voltage/distance;if(!flow){outputI=voltage/(p.R+p.r);E=outputI*p.R/distance;metric(d,'电动势 ℰ',voltage,'V');metric(d,'负载电压 U',outputI*p.R,'V');metric(d,'负载电流 I',outputI,'A');}else metric(d,'电压 U',voltage*1e3,'mV');}
 const plate=(at)=>{const axis=electron?[0,0,1]:[0,1,0],uAxis=[1,0,0],vAxis=electron?[0,1,0]:[0,0,1];surface(d,[add(at,add(mul(uAxis,-2),mul(vAxis,-.35))),add(at,add(mul(uAxis,2),mul(vAxis,-.35))),add(at,add(mul(uAxis,2),mul(vAxis,.35))),add(at,add(mul(uAxis,-2),mul(vAxis,.35)))],'wire',.16);};
 plate(positive);plate(negative);field(d,Bvec);
 const posLabel=electron?variant==='hall-CD'?'D · 电势高':'前表面 · 电势高':flow?'a · 电势高':down?'B · 正极':'P（a）· 正极',negLabel=electron?variant==='hall-CD'?'C · 电势低':'后表面 · 电势低':flow?'b · 电势低':down?'A · 负极':'Q（b）· 负极';
 text(d,posLabel,add(positive,[0,.22,0]),'particle');text(d,negLabel,add(negative,[0,-.23,0]),'second');
 for(let i=0;i<6;i++){
  const x=-1.5+i*.6,along=electron?[x,0,0]:[x,0,0],pos=add(along,mul(electron?negative:positive,.85*fraction)),neg=add(along,mul(negative,.85*fraction));ball(d,pos,electron?'second':'particle',.06);if(!electron)ball(d,neg,'second',.06);
  if(fraction>.2){text(d,'+',add(positive,[x,0,0]),'particle');text(d,'−',add(negative,[x,0,0]),'second');}
 }
 const electricRatio=electron||flow?1:p.R/(p.R+p.r);
 arrow(d,[-1.6,.4,.3],unit(vvec),electron?'电子 v':'流体 v','wire',1);const qsign=electron?-1:1,fb=mul(cross(unit(vvec),unit(Bvec)),qsign),fe=mul(unit(sub(negative,positive)),qsign*fraction*electricRatio);
 arrow(d,[0,0,0],fb,'F洛','magnetic',.8,'force');arrow(d,[0,0,0],fe,'F电','electric',.8,'force');arrow(d,[1.3,0,.2],mul(unit(sub(negative,positive)),fraction),'E','electric',.7);
 metric(d,'流速 / 漂移速度',velocity,'m/s');metric(d,'稳定电场强度',E,'V/m');metric(d,'分离进度',fraction*100,'%');if(flow)metric(d,'1 s 流过体积',Math.PI*p.R*p.R*velocity,'m³');
 if(!electron&&!flow){path(d,[[1.7,positive[1],0],[2.6,positive[1],0],[2.6,negative[1],0],[1.7,negative[1],0]],'wire');text(d,'负载 R',[2.8,0,0]);arrow(d,[2.6,positive[1]*.55,0],unit(sub(negative,positive)),'I','electric',.7);}
 d.status=u>=.999?(electron||flow?'电场建立：横向合力为零':'带负载：U<ℰ，横向驱动力维持内部电流'):'正负电荷分离，横向电场逐渐建立（过程示意）';d.progressLabel='电荷分离进度';return d;
}

function inductionModel(d,item,p,variant,u){
 const B=p.B||1,rate=p.rate||1;let flux,emf,calc,closed=variant!=='open',normal=[0,0,1],points;
 if(['open','magnet'].includes(variant)){
  const x=-2.5+5*u,radius=1;path(d,circle(zero,radius,[0,1,0],[0,0,1]).filter((_,i)=>variant!=='open'||i<94),'wire',{width:.03});
  surface(d,[[x-.6,-.23,-.25],[x+.6,-.23,-.25],[x+.6,.23,-.25],[x-.6,.23,-.25]],'magnetic',.6);line(d,[x-.6,0,0],[x+.6,0,0],'magnetic',{width:.16});text(d,'N',[x+.48,.33,0],'magnetic');text(d,'S',[x-.5,.33,0],'field');arrow(d,[x,-.6,0],[1,0,0],'v','wire',.6);
  calc=f=>B*Math.PI/(1+(-2.5+5*f)**2)**1.5;flux=calc(u);emf=15*B*Math.PI*x/(1+x*x)**2.5;
  d.status=variant==='open'?'磁通量变化，但回路开口，没有感应电流':'磁铁穿过线环，感应电流先后反向';
 }else if(variant==='cancel'){
  path(d,circle(zero,1.3),'wire');wireArrow(d,[-2,0,0],[2,0,0]);for(const y of [-.65,.65])field(d,[0,0,y>0?B:-B],[0,y,0],.65);calc=()=>0;flux=emf=0;d.status='关于直导线对称的正、负磁通量相互抵消';text(d,'+Φ 与 −Φ 抵消',[0,-1.7,0]);
 }else if(variant==='wire-translate'){
  const y=-1+2*u;wireArrow(d,[0,-2.4,0],[0,2.4,0]);points=[[.7,y-.6,0],[1.9,y-.6,0],[1.9,y+.6,0],[.7,y+.6,0],[.7,y-.6,0]];path(d,points,'wire');surface(d,points.slice(0,4),'field',.1);field(d,[0,0,-B],[1.3,y,0],.65);arrow(d,[2.2,y,0],[0,1,0],'v','wire',.6);calc=()=>-1.2*B*Math.log(1.9/.7);flux=calc();emf=0;d.status='与无限长直导线平行平移，各点距导线不变';
 }else if(variant==='rotate'){
  const angle=Math.PI*u,base=[[-1.3,-1,0],[1.3,-1,0],[1.3,1,0],[-1.3,1,0],[-1.3,-1,0]];points=base.map(x=>rotate(x,[0,1,0],angle));normal=rotate(normal,[0,1,0],angle);path(d,points,'wire');surface(d,points.slice(0,4),'normal',.15);field(d,[0,0,B]);arrow(d,zero,normal,'n','normal',.8);calc=f=>B*Math.cos(Math.PI*f);flux=calc(u);emf=B*Math.PI*Math.sin(Math.PI*u);d.status='转轴与磁场垂直，通量改变';
 }else{
  const width=variant==='area'?1+2*u:1.3,x=variant==='area'?0:-1.6+3.2*u;points=[[x-width/2,-.8,0],[x+width/2,-.8,0],[x+width/2,.8,0],[x-width/2,.8,0],[x-width/2,-.8,0]];path(d,points,'wire',{width:.03});surface(d,points.slice(0,4),'normal',.09);
  if(variant==='area'){
   for(const y of [-.8,.8])line(d,[-2,y,0],[2,y,0],'wire');arrow(d,[-width/2,0,0],[-1,0,0],'v₂','wire',.5);arrow(d,[width/2,0,0],[1,0,0],'v₁','wire',.5);calc=f=>B*1.6*(1+2*f);emf=-3.2*B;
  }else if(variant==='gradient'){calc=f=>B*1.3*1.6*(1+.2*(-1.6+3.2*f));emf=-B*1.3*1.6*.2*3.2;text(d,'磁场沿运动方向逐渐增强',[-.3,-1.2,0]);}
  else {calc=()=>-B*1.3*1.6;emf=0;}
  flux=calc(u);field(d,[0,0,variant==='translate'?-B:B]);if(variant!=='area')arrow(d,[x,.2,0],[1,0,0],'v','wire',.65);d.status=variant==='area'?'回路面积增大，磁通量改变':variant==='gradient'?'线圈移向更强的磁场，通量改变':'匀强场中整框平移，磁通量不变';
 }
 metric(d,'磁通量 Φ',flux,'Wb');metric(d,'感应电动势 ℰ',emf*rate,'V');metric(d,'回路电流（演示 R=1 Ω）',closed?emf*rate:0,'A');metric(d,'回路闭合',closed?'是':'否');
 graph(d,'过程进度','Φ / Wb',[{name:'磁通量',role:'field',points:curve(100,f=>[f,calc(f)])}],u);d.progressLabel='实验过程';return d;
}
function directionModel(d,item,p,variant,u){
 const I=p.I??2;
 if(variant==='earth')return earthModel(d,item,{charge:1,omega:1},u);
 if(variant==='wire'){
  wireArrow(d,[0,1.8,0],[0,-1.8,0]);for(const y of [-.6,.6]){path(d,circle([0,y,0],1.1,[1,0,0],[0,0,1]),'field');for(const phi of [0,Math.PI]){const r=[1.1*Math.cos(phi),y,1.1*Math.sin(phi)],t=[-Math.sin(phi),0,Math.cos(phi)];arrow(d,r,t,'','field',.45);}}
  arrow(d,[1.1,0,0],[0,0,1],'磁针 N','magnetic',.65,'compass');d.status='电流向下；从上方看磁场沿顺时针方向';
 }else if(variant==='loop'){
  path(d,circle(zero,1.25),'wire',{width:.035});arrow(d,[1.25,0,0],[0,1,0],'I','electric',.65);field(d,[0,0,I]);arrow(d,zero,[0,0,1],'磁针 N','magnetic',1,'compass');d.status='从纸外看逆时针电流，圆内磁场向纸外';
 }else{
  const coil=curve(500,f=>[-1.8+3.6*f,.52*Math.cos(16*Math.PI*f),.52*Math.sin(16*Math.PI*f)]);path(d,coil,'wire',{width:.025});field(d,[-I,0,0],zero,1.5);arrow(d,[-2.2,0,0],[-1,0,0],'N','magnetic',.6,'compass');arrow(d,[.22,.52,0],[0,0,-1],'I','electric',.45);text(d,'电源右侧为 +',[0,-1.1,0]);d.status='按原题绕法，右侧正极使螺线管内部 B 向左';
 }
 metric(d,'演示电流',I,'A');d.progressLabel='方向观察';return d;
}
function earthModel(d,item,p,u){
 const ratio=p.charge*p.omega,phase=2*Math.PI*u,latitude=.55;d.items.push({kind:'sphere',at:zero,radius:1.05,role:'field',opacity:.12});path(d,circle(zero,1.06,[1,0,0],[0,0,1]),'guide');line(d,[0,-1.7,0],[0,1.7,0],'guide',{dashed:true});text(d,'地理北 · 地磁 S',[0,1.45,0],'field');text(d,'地理南 · 地磁 N',[0,-1.45,0],'magnetic');
 for(let i=0;i<8;i++){const a=-phase+i*2*Math.PI/8,r=[Math.cos(a)*1.06,0,Math.sin(a)*1.06];ball(d,r,'second',.065);text(d,'−',add(r,[0,.13,0]),'second');}
 arrow(d,[1.05,0,0],[0,0,-1],'负电荷自转','second',.8);arrow(d,[1.23,.2,0],[0,0,1],'等效 I','electric',.8);
 for(const phi of [0,Math.PI/2,Math.PI,3*Math.PI/2]){const pts=curve(80,f=>{const theta=Math.PI-.16-f*(Math.PI-.32),r=2.2*Math.sin(theta)**2;return [r*Math.sin(theta)*Math.cos(phi),r*Math.cos(theta),r*Math.sin(theta)*Math.sin(phi)];});path(d,pts,'field');const a=pts[37],b=pts[40];arrow(d,a,unit(sub(b,a)),'','field',.3);}
 metric(d,'电量倍数',p.charge);metric(d,'角速度倍数',p.omega);metric(d,'等效电流 / 初值',ratio);metric(d,'磁场强度 / 初值',ratio);d.status='题设假说：负电荷自转方向与等效电流相反';d.progressLabel='自转角';return d;
}
function springCurrent(d,item,p,variant,u){
 const on=variant==='conducting',factor=on?u*Math.min(p.I*p.I/16,1):0,height=2.8-.7*factor,radius=.7+.22*factor,top=1.5;
 const helix=curve(520,f=>[radius*Math.cos(18*Math.PI*f),top-height*f,radius*Math.sin(18*Math.PI*f)]);path(d,helix,'wire',{width:.026});line(d,[-.8,top+.2,0],[.8,top+.2,0],'wire');line(d,helix[0],[.7,top+.2,0],'wire');surface(d,[[-1.2,top-height-.1,-1],[1.2,top-height-.1,-1],[1.2,top-height-.1,1],[-1.2,top-height-.1,1]],'field',.15);text(d,on?'水银接通':'理想绝缘液体',[0,top-height-.35,0]);
 if(on){arrow(d,[radius,.65,0],[0,0,1],'I（俯视顺时针）','electric',.5);arrow(d,[0,1,0],[0,-1,0],'B','field',1);arrow(d,[radius,0,0],[1,0,0],'径向扩张','magnetic',.7);arrow(d,[-radius,0,0],[-1,0,0],'','magnetic',.7);arrow(d,[-radius-.3,.8,0],[0,-1,0],'相邻匝吸引','magnetic',.4);arrow(d,[-radius-.3,-.5,0],[0,1,0],'','magnetic',.4);}
 metric(d,'电路电流',on?p.I:0,'A');d.status=on?'轴向缩短、径向扩张；形变幅度仅作示意':'电路未接通，无磁力引起的形变';d.progressLabel='形变趋势示意';return d;
}
function scaleModel(d,item,p,variant,u){
 const on=variant==='on',ratio=on*p.I*p.B,wirePos=[-.6,1.25,0],wireF=[-ratio*.6,ratio*.8,0],magnetF=mul(wireF,-1),shift=on?.18*u:0;
 plane(d,-.3);line(d,[-1+shift,0,0],[1+shift,0,0],'wire',{width:.16});text(d,'N',[-.7+shift,.23,0],'magnetic');text(d,'S',[.7+shift,.23,0],'field');text(d,'台秤',[0,-.7,0]);wireArrow(d,add(wirePos,[0,0,-.7]),add(wirePos,[0,0,.7]),'I 向纸外');arrow(d,wirePos,[.8,.6,0],'局部 B','field',.7);
 path(d,curve(90,f=>[-2+f*(1+shift),.1*Math.sin(f*Math.PI*14),0]),'tension');if(on){arrow(d,wirePos,wireF,'导线受力','magnetic',.5);arrow(d,[shift,0,0],magnetF,'磁体反作用力','third',.5);}
 metric(d,'弹簧变化',on?'伸长':'原长');metric(d,'台秤变化',on?'增大':'不变');d.status=on?'固定导线受力斜向左上，磁体受力斜向右下':'断电，比较基准状态';d.progressLabel='形变趋势示意';return d;
}
function experimentsModel(d,item,p,variant,u){
 if(variant==='wire'){
  directionModel(d,item,{...p,I:p.I*u},'wire',u);const compass=[1.1,0,0],result=[.6,0,p.I*u];d.items=d.items.filter(x=>x.label!=='磁针 N'&&(u>0||x.role!=='field'&&x.label!=='I'));arrow(d,compass,unit(result),'磁针 N','magnetic',.8,'compass');arrow(d,compass,[1,0,0],'参考场','guide',.5);metric(d,'磁针偏转角',Math.atan2(p.I*u,.6)*180/Math.PI,'°');d.status='参考磁场固定；通电后 N 极沿合磁场方向偏转';d.progressLabel='电流接通过程';return d;
 }
 if(variant==='coil'){
  directionModel(d,item,{...p,I:p.I*u},'solenoid',u);if(u===0)d.items=d.items.filter(x=>x.category!=='compass'&&x.label!=='I');metric(d,'磁性相对强度',p.I*u/2);d.status='相同匝数下，电流增大使磁性增强；数值为线性演示，未标定吸针个数';d.progressLabel='电流接通过程';return d;
 }
 if(variant==='motor'){
  support(d,0,[u*1.4-.7,0,0]);field(d,[0,p.B,0]);arrow(d,[u*1.4-.7,0,0],[1,0,0],'F安','magnetic',.8);metric(d,'BIL（示意 L=1 m）',p.B*p.I,'N');d.status='通电导体受磁场力，电能转化为机械能；位移仅作方向示意';return d;
 }
 const result=inductionModel(d,item,{B:p.B},'area',u);if(p.parallel){d.items=[];const z=-1+2*u,points=[[-1,-.8,z],[1,-.8,z],[1,.8,z],[-1,.8,z],[-1,-.8,z]];path(d,points,'wire');surface(d,points.slice(0,4),'normal',.1);field(d,[0,0,p.B]);arrow(d,[1.2,0,z],[0,0,1],'v∥B','wire',.8);d.metrics=[{label:'磁通量 Φ',value:3.2*p.B,unit:'Wb'},{label:'感应电动势',value:0,unit:'V'},{label:'回路电流',value:0,unit:'A'}];d.status='沿磁场方向整框平移：闭合且运动，也没有感应电流';d.chart=null;}
 if(!p.closed){d.metrics=d.metrics.map(x=>x.label.startsWith('回路电流')?{...x,value:0}:x);d.warnings.push('开路：即使有感应电动势，也没有回路电流。');}
 return result;
}

export function evaluateSupplement(input,progress=0){
 const scene=validateSupplement(input),item=lessonById(scene.lesson),p=scene.params,u=clamp(progress,0,1),variant=scene.variant,d=drawing();
 const fn={flux:()=>fluxModel(d,item,p,variant,u),rail:()=>railModel(d,item,p,variant,u),'contact-motion':()=>contactModel(d,item,p,variant,u),pendulum:()=>pendulumModel(d,item,p,u),'balanced-flight':()=>flightModel(d,item,p,variant,u),'oil-drop':()=>oilModel(d,item,p,variant,u),'rail-motion':()=>railMotion(d,item,p,u),'radial-electric':()=>radialModel(d,item,p,u),'half-track':()=>halfTrack(d,item,p,u),'track-field':()=>trackField(d,item,p,u),'minimum-force':()=>minimumModel(d,item,p,variant),'rail-spring':()=>springRail(d,item,p,variant),'rotating-rod':()=>rodModel(d,item,p,u),'partial-ring':()=>ringModel(d,item,p,variant),'cube-wire':()=>cubeModel(d,item,p),hall:()=>hallModel(d,item,p,variant,u),induction:()=>inductionModel(d,item,p,variant,u),'field-direction':()=>directionModel(d,item,p,variant,u),earth:()=>earthModel(d,item,p,u),'spring-current':()=>springCurrent(d,item,p,variant,u),'magnet-scale':()=>scaleModel(d,item,p,variant,u),experiments:()=>experimentsModel(d,item,p,variant,u)}[item.family];
 if(!fn)throw Error('补充模型尚未实现：'+item.family);fn();return {...d,title:item.title,lesson:item.id,variant,progress:u};
}
