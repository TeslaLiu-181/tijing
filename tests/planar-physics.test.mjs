import test from 'node:test';
import assert from 'node:assert/strict';
import {advance,orbit,overlapping,compileField,solveScene,traceParticle,emittedParticles,arcGeometry,atTime,norm,sub,rotate,rad,E,U,TAU} from '../src/planar-physics.mjs';
import {createObject,example,emptyScene,validate} from '../src/planar-model.mjs';
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol*Math.max(Math.abs(a),Math.abs(b),1e-12),`${a} != ${b}`);
const vec=(a,b)=>assert.ok(norm(sub(a,b))<1e-9*Math.max(norm(a),norm(b),1e-8),`${a} != ${b}`);
test('analytic circle, opposite signs, neutral particle and zero field',()=>{
 const p=[0,0],v=[1e5,0],w=E*.1/U,o=orbit(p,v,w),a=advance(p,v,w,o.T/4),b=advance(p,v,-w,o.T/4);
 vec(a.p,[o.r,-o.r]);vec(b.p,[o.r,o.r]);close(norm(a.v),1e5);assert.ok(norm(advance(p,v,w,o.T).p)<1e-14);
 vec(advance(p,v,0,1e-6).p,[.1,0]);assert.equal(orbit(p,[0,0],w).C,null);
 const field=compileField({...createObject('field','o1'),shape:'infinite'}),particle={...createObject('particle','o2'),charge:0,birth:0};
 const trace=traceParticle(particle,[field],.6);assert.ok(trace.segments[0].w===0);assert.equal(trace.segments[0].C,null);
});
test('independently placed circle, rectangle, triangle and adjacent fields preserve boundary continuity',()=>{
 for(const name of ['circle','rectangle','source','double','quadrant']){
  const model=example(name);validate(model);const fields=model.objects.filter(o=>o.kind==='field').map(o=>compileField(o));
  for(const trace of solveScene(model)){
   assert.ok(trace.segments.length);assert.equal(trace.truncated,false);
   for(const [i,s] of trace.segments.entries()){
    close(norm(s.v),norm(s.v1));const mid=advance(s.p,s.v,s.w,s.dt*.5).p,field=fields.find(f=>f.contains(mid));assert.equal(field?.id||null,s.fieldId);
    if(i){vec(s.p,trace.segments[i-1].p1);vec(s.v,trace.segments[i-1].v1);}
   }
  }
 }
 const m=emptyScene(),f=Object.assign(createObject('field','o1'),{shape:'triangle',width:4,height:4,angle:25}),p=Object.assign(createObject('particle','o2',[-3,-.5]),{heading:15});m.objects=[f,p];validate(m);assert.ok(solveScene(m)[0].segments.length>=2);
 const thin=Object.assign(createObject('field','o1'),{shape:'strip',width:.00001,B:100});const t=traceParticle({...createObject('particle','o2',[-1,0]),birth:0},[compileField(thin)],.4);assert.ok(t.segments.some(s=>s.fieldId==='o1'));
});
test('overlap geometry distinguishes touching from shared area; scenes now permit superposition',()=>{
 const circle=(id,x)=>Object.assign(createObject('field',id,[x,0]),{shape:'circle',radius:1});
 assert.equal(overlapping(circle('o1',0),circle('o2',1.99)),true);assert.equal(overlapping(circle('o1',0),circle('o2',2)),false);assert.equal(overlapping(circle('o1',0),circle('o2',0)),true);
 const a=Object.assign(createObject('field','o1'),{shape:'rectangle',width:2,height:2}),b={...a,id:'o2',x:2};assert.equal(overlapping(a,b),false);assert.equal(overlapping(a,{...b,angle:45}),true);assert.equal(overlapping(a,{...b,x:3,angle:45}),false);
 const half={...a,shape:'half'},other={...half,id:'o2',angle:180};assert.equal(overlapping(half,other),false);assert.equal(overlapping(half,{...other,x:1}),true);
 assert.equal(overlapping({...a,shape:'infinite'},circle('o2',100)),true);
 const scene=emptyScene();scene.objects=[a,{...b,x:1}];assert.doesNotThrow(()=>validate(scene));scene.objects[1].enabled=false;assert.doesNotThrow(()=>validate(scene));
});
test('point, line and area sources create deterministic physical initial states and timed emission',()=>{
 const source=Object.assign(createObject('source','o1',[2,3],'point'),{count:5,heading:40,spread:60,speedSpan:1,interval:.1});let p=emittedParticles(source);assert.deepEqual(p.map(p=>p.heading),[10,25,40,55,70]);close(p[4].birth,.4e-6);assert.equal(p[0].speed,source.speed-.5);
 p=emittedParticles({...source,sourceType:'line',angle:90,length:4});close(p[0].x,4);close(p[4].x,0);p.forEach(p=>close(p.y,3));
 for(const type of ['circle','rectangle'])for(const particle of emittedParticles({...source,sourceType:type,angle:33,count:19})){const d=rotate([particle.x-source.x,particle.y-source.y],-rad(33));if(type==='circle')assert.ok(norm(d)<=source.radius);else assert.ok(Math.abs(d[0])<=source.width/2&&Math.abs(d[1])<=source.height/2);}
 const scene=emptyScene();scene.duration=.25;scene.objects=[source];const traces=solveScene(scene);assert.equal(atTime(traces[4],.25e-6),null);assert.ok(atTime(traces[0],0));assert.equal(traces[4].segments.length,0);
});
test('selected subarc distinguishes 270 degree travel from 90 degree velocity angle',()=>{
 const field=compileField(Object.assign(createObject('field','o1'),{shape:'half',B:100})),p={...createObject('particle','o2',[0,0]),heading:45,birth:0};
 const trace=traceParticle(p,[field],1),s=trace.segments.find(s=>s.C),g=arcGeometry(s);close(g.phi,3*Math.PI/2);close(g.delta,Math.PI/2);close(g.alpha,3*Math.PI/4);close(g.dt/s.T,.75);
 const half=arcGeometry(s,.25,.75);close(half.dt,g.dt*.5);close(half.phi,g.phi*.5);close(half.chord,2*s.r*Math.sin(half.phi/2));
});
test('scene JSON round trip retains source, field and geometry definitions',()=>{
 const original=example('source');original.aids={...original.aids,arc:true,start:.1,end:.8};const copy=JSON.parse(JSON.stringify(original));validate(copy);assert.deepEqual(solveScene(copy),solveScene(original));
 assert.throws(()=>validate({...copy,objects:[{...copy.objects[0],id:'bad"id'}]}),/编号/);
});
