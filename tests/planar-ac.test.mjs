import test from 'node:test';
import assert from 'node:assert/strict';
import {createObject,emptyScene,example,prepareScene,validate} from '../src/planar-model.mjs';
import {resolveScene,setDefinition} from '../src/planar-relations.mjs';
import {solveScene,atTime,compileField,electricAt,segmentElectric,segmentState,forcesAt,norm,sub,E,U,TAU,waveFactor,rotate} from '../src/planar-physics.mjs';
import {trailSeconds,trailWindows} from '../src/planar-trails.mjs';
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(Math.abs(a),Math.abs(b),1e-25),`${a} != ${b}`);
const vec=(a,b,tol=1e-8)=>assert.ok(norm(sub(a,b))<=tol*Math.max(norm(a),norm(b),1e-5),`${a} != ${b}`);
const object=(kind,id,extra={},shape='infinite')=>Object.assign(createObject(kind,id,[0,0],shape),extra);
const scene=(objects,duration=1)=>({...emptyScene(),objects,duration});

test('rotated semicircles and sectors use the actual circular and straight boundaries',()=>{
 for(const kind of ['electric','field'])for(const angle of [0,37,180]){
  const o=object(kind,'o1',{radius:2,angle,sectorAngle:60},'semicircle'),f=compileField(o),rot=p=>rotate(p,angle*Math.PI/180);
  assert.ok(f.contains(rot([0,.01])));assert.ok(!f.contains(rot([0,-.01])));assert.ok(!f.contains(rot([0,.03])));
  o.shape='sector';const sector=compileField(o);assert.ok(sector.contains(rot([.01,.005])));assert.ok(!sector.contains(rot([-.005,.01])));
  const p=object('particle','o2',{x:-3,speed:1,heading:angle,charge:0});const start=rot([-.03,.005]);p.x=start[0]*100;p.y=start[1]*100;
  const t=solveScene(scene([o,p],.7))[0];assert.equal(t.truncated,false);assert.ok(t.segments.some(s=>s.fieldIds.includes('o1')));
  for(const s of t.segments){assert.equal(sector.contains(segmentState(s,s.dt/2).p),s.fieldIds.includes('o1'));}
 }
});

// Independent fixed-step RK4 integrates the ODE, without using segmentState.
function reference(objects,particle,end,steps=16000){
 const q=particle.charge*E,m=particle.mass*U,B=objects.filter(o=>o.kind==='field').reduce((sum,o)=>sum+o.B*.001,0),dt=end/steps;
 let y=[particle.x*.01,particle.y*.01,particle.speed*1e5*Math.cos(particle.heading*Math.PI/180),particle.speed*1e5*Math.sin(particle.heading*Math.PI/180)];
 const derivative=(t,y)=>{const e=objects.filter(o=>o.kind==='electric').map(o=>electricAt(o,t)).reduce((a,b)=>[a[0]+b[0],a[1]+b[1]],[0,0]);return [y[2],y[3],q/m*(e[0]+y[3]*B),q/m*(e[1]-y[2]*B)];};
 for(let i=0;i<steps;i++){const t=i*dt,k1=derivative(t,y),k2=derivative(t+dt/2,y.map((v,j)=>v+dt*k1[j]/2)),k3=derivative(t+dt/2,y.map((v,j)=>v+dt*k2[j]/2)),k4=derivative(t+dt,y.map((v,j)=>v+dt*k3[j]));y=y.map((v,j)=>v+dt*(k1[j]+2*k2[j]+2*k3[j]+k4[j])/6);}
 return {p:y.slice(0,2),v:y.slice(2)};
}
test('sinusoidal E+B matches independent RK4 at resonance, near resonance, zero B and both charges',()=>{
 for(const B of [0,100,100.000001,-100])for(const charge of [1,-1]){
  const p=object('particle','o3',{charge,mass:1,speed:.7,heading:31}),period=TAU*U/(E*.1)*1e6;
  const objects=[object('field','o1',{B}),object('electric','o2',{waveform:'sine',period,phase:63,E0:4,fieldAngle:16}),p,object('electric','o4',{waveform:'sine',period:period*.71,phase:-20,E0:1,fieldAngle:112})];
  const end=period*2.7e-6,t=solveScene(scene(objects,end*1e6))[0];assert.equal(t.truncated,false);
  const expected=reference(objects,p,end),actual=atTime(t,end);vec(actual.p,expected.p,2e-9);vec(actual.v,expected.v,2e-9);
  const s=t.segments[4],local=s.dt*.37,e=objects.filter(o=>o.kind==='electric').map(o=>electricAt(o,s.globalTime+local)).reduce((a,b)=>[a[0]+b[0],a[1]+b[1]],[0,0]);vec(segmentElectric(s,local),e,1e-10);
 }
});
test('square-wave switches split exactly, including neutral particles and delayed emission',()=>{
 const field=object('electric','o1',{waveform:'square',period:1,phase:0,E0:1,fieldAngle:0}),source=object('source','o2',{sourceType:'point',count:2,interval:.5,spread:0,speed:0,mass:1}),m=scene([field,source],.75);
 const [a,b]=solveScene(m),acc=E*1000/U;close(a.segments[0].dt,.5e-6);assert.equal(a.segments[0].end,'switch');
 close(atTime(a,.25e-6).v[0],acc*.25e-6);close(atTime(b,.75e-6).v[0],-acc*.25e-6);
 assert.equal(waveFactor(field,.5e-6),-1);assert.equal(waveFactor(field,1e-6),1);
 source.charge=0;const neutral=solveScene(m)[0];vec(atTime(neutral,.75e-6).v,[0,0]);assert.ok(segmentElectric(atTime(neutral,.75e-6).segment)[0]<0);
});
test('sine phase follows global time across spatial entry and exits a thin strip',()=>{
 const field=object('electric','o1',{waveform:'sine',period:.7,phase:17,E0:3,fieldAngle:90,width:.001,height:5},'strip'),p=object('particle','o2',{x:-1,speed:2});
 const t=solveScene(scene([field,p],.11))[0];assert.equal(t.truncated,false);
 const s=t.segments.find(s=>s.fieldIds.includes('o1'));assert.ok(s);close(s.globalTime,.05e-6-.000005/(2e5),1e-8);
 vec(segmentElectric(s,s.dt/2),electricAt(field,s.globalTime+s.dt/2));
 for(let i=1;i<t.segments.length;i++){vec(t.segments[i].p,t.segments[i-1].p1);vec(t.segments[i].v,t.segments[i-1].v1);}
});
test('zero-phase release on a boundary resolves inward/outward motion and AC cancellation',()=>{
 const f=object('electric','o1',{waveform:'sine',period:1,phase:0,E0:1,fieldAngle:0,width:2},'rectangle'),p=object('particle','o2',{x:-1,speed:0});
 let t=solveScene(scene([f,p],.1))[0];assert.equal(t.truncated,false);assert.ok(t.segments.at(-1).p1[0]>-.01);
 f.fieldAngle=180;t=solveScene(scene([f,p],.1))[0];assert.equal(t.truncated,false);vec(t.segments.at(-1).v1,[0,0]);
 f.fieldAngle=0;const inverse={...f,id:'o3',phase:180};t=solveScene(scene([f,inverse,p],.1))[0];assert.equal(t.truncated,false);vec(t.segments.at(-1).p1,[-.01,0]);vec(t.segments.at(-1).v1,[0,0]);
 p.charge=0;t=solveScene(scene([f,p],.1))[0];assert.equal(t.truncated,false);vec(t.segments.at(-1).v1,[0,0]);
});
test('cyclotron gains energy at every gap crossing and radius grows, with linked resonance',()=>{
 const m=example('cyclotron');assert.deepEqual(resolveScene(m).issues,[]);validate(m);
 for(const waveform of ['sine','square']){
  m.objects[2].waveform=waveform;const t=solveScene(m)[0],arcs=t.segments.filter(s=>s.C);assert.equal(t.truncated,false);assert.equal(arcs.length,16);
  for(let i=1;i<arcs.length;i++){assert.ok(arcs[i].r>arcs[i-1].r);if(arcs[i].end==='boundary')close(arcs[i].dt,arcs[i].T/2,1e-8);if(waveform==='square')close((.5*arcs[i].m*(norm(arcs[i].v)**2-norm(arcs[i-1].v)**2))/E,108,2e-7);}
  for(const s of arcs)close(norm(s.v1),norm(s.v));
 }
 const T=m.objects[2].period;m.objects[0].B*=2;resolveScene(m);close(m.objects[2].period,T/2);close(m.objects[1].B,m.objects[0].B);
 setDefinition(m,'o3','period','1 / 0');assert.equal(resolveScene(m).fieldUnavailable,true);
});
test('trails show only past motion, survive backwards seeks, and cross field boundaries',()=>{
 const m=example('cyclotron');resolveScene(m);const t=solveScene(m)[0],time=1.1e-6;
 assert.deepEqual(trailWindows(t,0,m),[]);close(trailSeconds(t,time,m),m.objects[2].period*1e-6);
 const windows=trailWindows(t,time,m);assert.ok(windows.length>12);for(const w of windows){const s=t.segments[w.index];assert.ok(s.t+w.to*s.dt<=time+1e-20);assert.ok(s.t+w.from*s.dt>=time-trailSeconds(t,time,m)-1e-20);}
 trailWindows(t,2e-6,m);assert.deepEqual(trailWindows(t,time,m),windows);
 m.trail.auto=false;m.trail.duration=.12;close(trailSeconds(t,time,m),.12e-6);assert.ok(trailWindows(t,time,m).length>0);
 t.particle.birth=3e-6;assert.deepEqual(trailWindows(t,time,m),[]);
 m.trail.enabled=false;assert.deepEqual(trailWindows(t,4e-6,m),[]);
});
test('v3 scenes migrate to constant fields; v4 retains waveform, dependencies and display modes',()=>{
 const m=example('velocity-selector');m.version=3;delete m.trail;for(const o of m.objects){delete o.waveform;delete o.period;delete o.phase;delete o.sectorAngle;}
 prepareScene(m);validate(m);assert.equal(m.objects[1].waveform,'dc');assert.equal(m.trail.enabled,false);assert.equal(m.display.tracks,true);
 const next=example('cyclotron');next.trail.auto=false;next.trail.duration=.22;next.display.tracks=true;
 const loaded=prepareScene(JSON.parse(JSON.stringify(next)));assert.deepEqual(resolveScene(loaded).issues,[]);validate(loaded);assert.equal(loaded.objects[2].waveform,'sine');assert.equal(loaded.trail.duration,.22);assert.ok(loaded.objects[2].defs.period);
});
