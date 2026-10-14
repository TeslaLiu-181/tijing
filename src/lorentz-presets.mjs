import {E,U,TAU} from './lorentz-physics.mjs';
export const modules={direction:{name:'方向与手势',tag:'从手势到矢量',intro:'先判断，再打开磁力。注意：右手得到叉乘方向，负电荷的实际磁力反向。'},space:{name:'空间运动',tag:'圆周 × 匀速直线',intro:'沿磁场方向的分速度不变；垂直磁场的分速度不断转向。切换投影观察同一条轨迹。'},sandbox:{name:'平面沙盒',tag:'让几何关系看得见',intro:'选一种场域，调整初态，再观察进出场。区域外沿切线飞行，边界不会使粒子反弹。'},beam:{name:'电子束偏转',tag:'从空间偏转到屏幕落点',intro:'电子从左向右发射。磁场先改变运动方向，电子出场后沿切线飞向荧光屏。'}};
export const particleTypes={proton:{name:'质子',mass:1.0072764666,charge:1,speed:1,B:100},electron:{name:'电子',mass:0.000548579909,charge:-1,speed:20,B:2},alpha:{name:'α 粒子',mass:4.001506179,charge:2,speed:1,B:100},custom:{name:'自定义'}};
export const shapes={unbounded:'无界匀强场',half:'半平面',strip:'条形磁场',rectangle:'矩形磁场',circle:'圆形磁场',quadrant:'第一象限',double:'相邻双区域'};
export function base(module='sandbox'){
 return {module,type:'proton',mass:1.0072764666,charge:1,speed:1,az:0,el:0,x:-2.5,y:.6,B:100,B2:-65,baz:0,bel:90,
  shape:'strip',cx:0,cy:0,angle:0,width:.85,height:3,radius:1.5,duration:1.0,voltage:200,beamAngle:0,screen:3.5,screenSize:4};
}
export function experiment(module,preset){
 const c=base(module);
 if(module==='direction')Object.assign(c,{x:0,y:0,duration:.7,az:0,el:0});
 if(module==='space')Object.assign(c,{x:-.6,y:0,el:25,duration:1.5});
 if(module==='beam')Object.assign(c,{B:.8,cx:-.75,width:1.5,duration:.016});
 if(module==='sandbox'){
  c.shape=preset||'strip';
  if(c.shape==='unbounded')Object.assign(c,{x:0,y:1,duration:1.4});
  if(c.shape==='half')Object.assign(c,{cx:-1,x:-2.5,y:.8,duration:1});
  if(c.shape==='circle')Object.assign(c,{x:-2.5,y:.6,duration:1});
  if(c.shape==='rectangle')Object.assign(c,{width:2.5,height:2.8,x:-2.5,y:1,duration:1});
  if(c.shape==='quadrant'){
   Object.assign(c,{y:0,az:45,B:-100,duration:.45});
   // Place the orbit center on the vertical boundary: 45° entry, 135° arc.
   c.x=c.mass*U*c.speed*1e5/(Math.abs(c.charge*E*c.B*.001))*100/Math.SQRT2;
  }
  if(c.shape==='double')Object.assign(c,{x:-1.2,y:.5,az:0,B:80,B2:140,duration:1.4});
 }
 return c;
}
export const periodFor=c=>c.charge&&c.B?TAU*c.mass*U/(Math.abs(c.charge*E*c.B*.001)):null;
export function particlePreset(c,type){
 const p=particleTypes[type];Object.assign(c,p,{type});delete c.name;
 if(type!=='custom')c.duration=Number(((periodFor(c)||1e-6)*2e6).toPrecision(4));
}
export const defaultUI=()=>({panel:true,touchTools:true,view:'plane',projection:'ortho',force:true,field:true,velocity:true,trajectory:true,grid:true,vectorPlane:false,hand:null,handStep:0,
 center:true,radius:false,chord:false,arc:false,tangent:false,angles:false,components:true,reference:false,segment:0,rate:1,screen:true});
