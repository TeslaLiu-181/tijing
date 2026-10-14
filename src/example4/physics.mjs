import {createObject,emptyScene} from '../planar-model.mjs';
import {solveScene,segmentState,norm,E,U} from '../planar-physics.mjs';

export const defaults={length:2,speed:1,mass:1,charge:1,beta:1};

export function solveExample4(config){
 const {length,speed,mass,charge,beta}=config;
 if(![length,speed,mass,charge,beta].every(n=>Number.isFinite(n)&&n>0))throw Error('L、v₀、m、q 和磁场比例均须为正数。');
 const L=length*.01,v0=speed*1e5,m=mass*U,q=charge*E;
 const electric=m*v0*v0/(q*L),critical=(Math.SQRT2+1)*m*v0/(q*L),B=beta*critical;
 const tE=L/v0,omega=q*B/m,r=Math.SQRT2*v0/omega;
 const model=emptyScene();model.duration=(tE+2*Math.PI/omega+.01*tE)*1e6;
 // The source's spatial sketch labels depth as +z. Its flattened view has B
 // into the page, so the solver and Three.js right-handed world use B_world.z=-B.
 model.objects=[
  Object.assign(createObject('particle','o1',[0,length/2]),{mass,charge,speed,heading:0}),
  Object.assign(createObject('electric','o2',[length/2,0],'strip'),{width:length,E0:electric/1000,fieldAngle:270}),
  Object.assign(createObject('field','o3',[1.5*length,0],'strip'),{width:length,B:-B*1000})
 ];
 const full=solveScene(model)[0],entry=full.segments[0],arc=full.segments[1];
 if(!arc?.C||arc.end!=='boundary'||full.truncated)throw Error('未求得完整磁场段，请恢复正常演示参数。');
 const total=arc.t+arc.dt,tTurn=tE+3*Math.PI/(4*omega),reachesTurn=tTurn<=total+1e-15;
 const status=Math.abs(beta-1)<1e-9?'critical':beta<1?'escape':'return';
 return {config:{...config},L,v0,m,q,electric,critical,B,r,tE,total,tTurn,reachesTurn,status,segments:[entry,arc],center:arc.C.map(x=>x/L),entry:[1,0,0],turn:[(arc.C[0]+r)/L,arc.C[1]/L,0],exit:[arc.p1[0]/L,arc.p1[1]/L,0],maxX:1+1/beta,omega};
}

export function stateAt(result,time){
 const t=Math.max(0,Math.min(result.total,time));
 const seg=t<result.tE?result.segments[0]:result.segments[1],local=Math.max(0,Math.min(seg.dt,t-seg.t)),state=segmentState(seg,local);
 const acc=seg.w?[seg.w*state.v[1],-seg.w*state.v[0]]:seg.a;
 return {time:t,phase:t<result.tE-1e-18?'electric':'magnetic',p:[state.p[0]/result.L,state.p[1]/result.L,0],v:[...state.v.map(x=>Math.abs(x/result.v0)<1e-10?0:x/result.v0),0],acc:[acc[0]*result.L/(result.v0**2),acc[1]*result.L/(result.v0**2),0],speed:norm(state.v),energy:result.m*norm(state.v)**2/(2*E)};
}

export function milestones(result){
 return [{id:'start',label:'从 P 出发',time:0},{id:'entry',label:'到达 O₁',time:result.tE},...(result.reachesTurn?[{id:'turn',label:result.status==='critical'?'与界面Ⅲ相切':'到达最右点',time:result.tTurn}]:[]),{id:'exit',label:result.status==='escape'?'穿出界面Ⅲ':'返回界面Ⅱ',time:result.total}];
}

export function samplePath(result,count=480){return Array.from({length:count+1},(_,i)=>stateAt(result,result.total*i/count).p);}
