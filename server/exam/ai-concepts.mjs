import {emptyScene,createObject} from '../../src/planar-model.mjs';
import {resolveScene} from '../../src/planar-relations.mjs';
import {solveScene,segmentState,E,U,TAU,norm} from '../../src/planar-physics.mjs';
import {auditScene} from './ai-harness.mjs';
const near=(a,b,tolerance=1e-7)=>Math.abs(a-b)<=tolerance*Math.max(Math.abs(a),Math.abs(b),1);
function buildProbe(spec){
 const scene=emptyScene(),R=createObject('parameter','o1');Object.assign(R,{value:1,unit:'cm',label:'R'});
 const B=createObject('field','o2',[spec.kind==='strip-r-equals-half-width'?1:0,0],spec.kind==='strip-r-equals-half-width'?'strip':'half');
 Object.assign(B,{B:spec.B*100,width:2,label:'B'});if(spec.kind==='strip-r-equals-half-width')B.defs={width:'2 * o1.value',x:'o1.value'};
 const particle=createObject('particle','o3',[0,0]);Object.assign(particle,{mass:1,charge:spec.charge,speed:1,heading:0,label:'P',defs:{speed:'orbitSpeed(o3.mass, o3.charge, o2.B, o1.value)'}});
 scene.objects=[R,B,particle];scene.nextId=4;resolveScene(scene);
 const period=TAU*particle.mass*U/(Math.abs(particle.charge)*E*Math.abs(B.B)*.001);
 scene.duration=period*1e6*.62;return {scene,period};
}
function resultForEntry(spec,native,period,hintsOnly){
 const trace=solveScene(native.snapshot.scene)[0],returnSegment=trace.segments.find(s=>s.end==='boundary');
 if(!returnSegment)return null;
 const first=trace.segments[0],quarter=segmentState(first,period/4),returned=segmentState(returnSegment,returnSegment.dt),R=.01;
 const readback={firstReturnTimeOverPeriod:(returnSegment.t+returnSegment.dt)/period,firstReturnXOverR:returned.p[0]/R,
  firstReturnYOverR:returned.p[1]/R,maxXOverR:quarter.p[0]/R,maxXVelocityOverInitial:quarter.v.map(x=>x/norm(first.v)),
  maxDistanceFromStartInFieldOverR:norm(returned.p)/R,farBoundaryReached:spec.kind==='strip-r-equals-half-width'?quarter.p[0]>=2*R-1e-12:null,
  boundaryEvents:trace.segments.filter(s=>s.end==='boundary').map(s=>({timeOverPeriod:(s.t+s.dt)/period,xOverR:s.p1[0]/R,yOverR:s.p1[1]/R}))};
 const valid=native.harness.passed&&near(readback.firstReturnTimeOverPeriod,.5)&&near(readback.firstReturnXOverR,0)&&
  near(readback.firstReturnYOverR,2*spec.turn)&&near(readback.maxXOverR,1)&&near(readback.maxXVelocityOverInitial[0],0)&&near(readback.maxXVelocityOverInitial[1],spec.turn);
 if(!valid)return null;
 const dir=spec.turn>0?'+y':'-y',givenQ=spec.charge>0?'正电':'负电',givenB=spec.B<0?'向里':'向外';
 let answer;
 if(hintsOnly)answer=spec.kind==='half-plane-return'?
  '先依据电荷符号与磁场方向判断洛伦兹力，从而确定圆心在哪一侧。再想：从原点出发第一次返回入射边界，需要转过多少圆心角？先写出角度与周期的关系。':
  '先根据最初的洛伦兹力确定圆心，再画出轨迹的最右点。在该点，速度应沿圆的切线；它与入射时的速度是否同向？请用圆的几何关系判断能否碰到另一侧边界。';
 else if(spec.kind==='half-plane-return')answer=String.raw`设 $R=\dfrac{mv}{|q|B}$（这里 $B$ 为磁感应强度大小）。
${givenQ}粒子向右入射、磁场${givenB}，初始磁场力指向 $${dir}$，圆心在 $(0,${spec.turn>0?'R':'-R'})$。
首次返回 $x=0$ 时经过半圆，因此
$$t=\frac{T}{2}=\frac{\pi m}{|q|B},\qquad (x,y)=(0,${spec.turn>0?'2R':'-2R'}).$$
在最大横坐标处 $x=R$，速度沿 $${dir}$；返回边界时速度才沿 $-x$。
以上结论按仅受洛伦兹力的高中经典模型成立；原生求解器实际边界事件与方向读回已核对。`;
 else answer=String.raw`由已知 $R=d/2$，最远离入射边界的横坐标为
$$x_{\max}=R=\frac d2<d.$$
所以**不能从 $x=d$ 穿出**。${givenQ}粒子向右入射、磁场${givenB}，圆心在 $(0,${spec.turn>0?'R':'-R'})$；最大 $x$ 处的速度沿 $${dir}$，不是沿 $-x$。
粒子转过半周后从 $x=0$ 返回，位置为 $(0,${spec.turn>0?'d':'-d'})$，此时速度沿 $-x$。
“离入射边界最远距离”是横向距离；不要擅自把它换成离起点的直线距离。不要把离入射边界的横向距离与离起点的直线距离混为一谈。
原生轨迹核对了最大横坐标、该点切向速度与实际出场边界；相切不能误记为穿出。`;
 const tool={version:'standard-entry-native/1',case:spec.kind,sourceConditions:{charge:givenQ,field:givenB,incoming:'+x',force:'Lorentz only'},
  proof:'symbolic-circle-geometry-with-native-readback',passed:true,limitations:['仅识别明确的此类标准条件，不覆盖任意几何题或相对论运动。',
   '1 cm、1 u、100 mT 是独立规范化核验探针，未作为原题条件。']};
 if(!hintsOnly){tool.readback=readback;tool.normalization={radiusCm:1,massU:1,chargeE:spec.charge,BmT:spec.B*100};tool.nativeHarness=native.harness;}
 return {status:'answer',answer,givens:[givenQ+'粒子沿 +x 入射','磁场垂直纸面'+givenB,'仅受洛伦兹力',
  spec.kind==='half-plane-return'?'磁场区域 x>0，原点入射':'磁场区域 0<x<d，R=d/2，原点入射'],
  assumptions:[],missing:[],followUps:hintsOnly?['写出你的下一步推导，我帮你检查。']:['改变电荷符号或磁场方向，返回点会怎样改变？'],
  verification:'native_tutor_checked',trustedTool:tool,formatWarnings:[]};
}
export async function trustedTutoring(_source,_options={}) {
 // Free-form text is never sufficient to mark question semantics verified.
 // Keep this compatibility entry read-only and refuse the automatic shortcut.
 return null;
}
export async function probeConfirmedEntry(spec,{signal,hintsOnly=false}={}) {
 if(!spec||spec.confirmed!==true||spec.classical!==true||!['half-plane-return','strip-r-equals-half-width'].includes(spec.kind)||
  ![-1,1].includes(spec.charge)||![-1,1].includes(spec.B)||spec.incoming!=='+x'||!Array.isArray(spec.start)||spec.start.length!==2||spec.start.some(n=>n!==0))return null;
 if(spec.kind==='strip-r-equals-half-width'&&spec.radiusOverWidth!==.5)return null;
 const input={kind:spec.kind,charge:spec.charge,B:spec.B,turn:-spec.charge*spec.B},probe=buildProbe(input),native=await auditScene(probe.scene,[],{signal});
 const result=resultForEntry(input,native,probe.period,hintsOnly);if(!result)return null;
 result.verification='explicit_model_probe';result.trustedTool.sourceVerified=false;
 result.trustedTool.limitations.unshift('只证实调用者明确给定的模型条件下的计算，不自动证明任意原题文字、图示或追问都满足这些条件。');
 return result;
}
