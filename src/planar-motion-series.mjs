import {segmentState,forcesAt,norm,E,TAU} from './planar-physics.mjs';
const US=1e6;
const channels={
 velocity:[{key:'vx',label:'vₓ',unit:'10^5 m/s'},{key:'vy',label:'vᵧ',unit:'10^5 m/s'},{key:'speed',label:'速率',unit:'10^5 m/s'}],
 energy:[{key:'K',label:'动能 K',unit:'eV'},{key:'WE',label:'累计电场功 W_E',unit:'eV'}],
 position:[{key:'x',label:'x',unit:'cm'},{key:'y',label:'y',unit:'cm'}],
 force:[{key:'Fx',label:'合力 x',unit:'N'},{key:'Fy',label:'合力 y',unit:'N'},{key:'magnitude',label:'合力大小',unit:'N'}]
};
const kinetic=(segment,velocity)=>segment.m*norm(velocity)**2/(2*E);
function frequency(segment,group){
 const driven=(segment.sines||[]).filter(s=>norm(s.a)>0),electric=norm(segment.a||[0,0])>0||driven.length>0;
 if(group==='energy'&&!electric)return 0; // Pure magnetic energy is constant.
 if(norm(segment.v)===0&&!electric)return 0;
 const angular=Math.abs(segment.w||0),sine=Math.max(0,...driven.map(s=>Math.abs(s.frequency)));
 // Squared speed and force magnitude can contain twice the native frequency.
 return (group==='energy'||group==='force'?2:1)*(angular+sine);
}
function density(segment,span,group){
 const omega=frequency(segment,group),oscillatory=omega>0;
 const nonlinear=!oscillatory&&norm(segment.a||[0,0])>0&&group!=='force';
 const minimumSteps=Math.max(nonlinear?2:1,oscillatory?Math.ceil(span*omega/TAU*16):0);
 const desiredSteps=Math.max(minimumSteps,oscillatory?Math.ceil(span*omega/TAU*32):nonlinear?32:1);
 return {minimumSteps,desiredSteps};
}
function valuesAt(segment,local,group,Kbirth){
 const state=segmentState(segment,local);
 if(group==='velocity')return {vx:state.v[0]/1e5,vy:state.v[1]/1e5,speed:norm(state.v)/1e5};
 if(group==='position')return {x:state.p[0]*100,y:state.p[1]*100};
 if(group==='energy'){const K=kinetic(segment,state.v);return {K,WE:K-Kbirth};}
 const force=forcesAt(segment,state.v,local).total;return {Fx:force[0],Fy:force[1],magnitude:norm(force)};
}

/** Sample native local states; never interpolate over an omitted motion segment. */
export function sampleMotionSeries(trace,{rangeUs,group='velocity',maxPoints=1200}={}){
 if(!Object.hasOwn(channels,group))throw Error('曲线组须为velocity、energy、position或force。');
 if(!Number.isSafeInteger(maxPoints)||maxPoints<2||maxPoints>20000)throw Error('曲线点数预算须为2–20000的整数。');
 const segments=trace?.segments||[],birth=trace?.particle?.birth||0,last=segments.at(-1),computedEnd=birth+(last?last.t+last.dt:0),birthUs=birth*US,computedEndUs=computedEnd*US;
 const requested=rangeUs?{start:rangeUs.start,end:rangeUs.end}:{start:0,end:computedEndUs};
 if(rangeUs&&(!Number.isFinite(requested.start)||!Number.isFinite(requested.end)||requested.start<0||requested.end<=requested.start))throw Error('曲线范围须为非负、递增的有限微秒时刻。');
 const result={group,channels:channels[group].map(c=>({...c})),rangeUs:requested,availableRangeUs:null,birthUs,computedEndUs,truncated:!!trace?.truncated,sampled:true,method:'native-piecewise-state',...(group==='energy'?{workMethod:'work-energy-theorem',workDefinition:'K(t)-K(birth)'}:{}),chunks:[],pointCount:0,minimumRequiredPoints:0,limited:false,limitations:['曲线为原生状态采样；折线不代表任意两点之间的精确解析函数。',...(group==='energy'?['累计电场功按本模型的功能关系由动能变化求得，并非独立数值积分验证。']:[]),...(trace?.truncated?['轨迹已截断；未计算区间不外推。']:[])]};
 if(!segments.length||requested.end<birthUs||requested.start>computedEndUs){result.reason='当前窗口没有已计算的运动轨迹；不外推发射前或计算范围外的数据。';return result;}
 const startUs=Math.max(requested.start,birthUs),endUs=Math.min(requested.end,computedEndUs);result.availableRangeUs={start:startUs,end:endUs};
 const fragments=[];
 for(const [segmentIndex,segment] of segments.entries()){
  const start=birth+segment.t,end=birth+(segment.t+segment.dt),startTimeUs=start*US,endTimeUs=end*US;
  if(endTimeUs<startUs||startTimeUs>endUs)continue;
  // Choose local 0/dt directly when clipping at a native endpoint. Subtracting
  // large global clocks can otherwise lose the exact one-sided end state.
  const lo=startUs<=startTimeUs?0:Math.max(0,Math.min(segment.dt,startUs/US-start)),hi=endUs>=endTimeUs?segment.dt:Math.max(0,Math.min(segment.dt,endUs/US-start));
  if(hi<lo)continue;
  const span=hi-lo,requirements=span>0?density(segment,span,group):{minimumSteps:0,desiredSteps:0};
  fragments.push({segment,segmentIndex,lo,hi,...requirements,steps:requirements.minimumSteps});
 }
 const minimum=fragments.reduce((n,f)=>n+f.minimumSteps+1,0);result.minimumRequiredPoints=Math.min(Number.MAX_SAFE_INTEGER,minimum);
 if(!Number.isFinite(minimum)||minimum>maxPoints){result.limited=true;result.reason='当前窗口的分段接缝或振荡过密，至少需要'+result.minimumRequiredPoints+'个点；请缩小时间范围或提高点数预算。';return result;}
 const demand=fragments.reduce((n,f)=>n+f.desiredSteps-f.minimumSteps,0),remaining=Math.min(maxPoints-minimum,demand);
 // Weighted apportionment stays inside the hard budget, retaining every native
 // endpoint and at least 16 samples per oscillation before using spare density.
 if(remaining&&demand){const allocations=fragments.map(f=>{const exact=remaining*(f.desiredSteps-f.minimumSteps)/demand,extra=Math.floor(exact);f.steps+=extra;return {f,exact:exact-extra};});let left=remaining-allocations.reduce((n,a)=>n+(a.f.steps-a.f.minimumSteps),0);allocations.sort((a,b)=>b.exact-a.exact);for(const a of allocations){if(!left)break;if(a.f.steps<a.f.desiredSteps){a.f.steps++;left--;}}}
 const first=segments[0],Kbirth=kinetic(first,first.v);
 for(const fragment of fragments){
  const {segment,segmentIndex,lo,hi,steps}=fragment,points=[];
  for(let i=0;i<=steps;i++){
   const local=i===0?lo:i===steps?hi:lo+(hi-lo)*i/steps,values=valuesAt(segment,local,group,Kbirth);
   if(Object.values(values).some(v=>!Number.isFinite(v))){result.chunks=[];result.pointCount=0;result.reason='已计算轨迹含非有限曲线值，当前不能绘制。';return result;}
   const time=local===0?birth+segment.t:local===segment.dt?birth+(segment.t+segment.dt):birth+segment.t+local;
   points.push({timeUs:time*US,side:local===0?'after':local===segment.dt?'before':'interior',values});
  }
  result.chunks.push({segmentIndex,startUs:points[0].timeUs,endUs:points.at(-1).timeUs,fieldIds:[...(segment.fieldIds||[])],points});result.pointCount+=points.length;
 }
 return result;
}
