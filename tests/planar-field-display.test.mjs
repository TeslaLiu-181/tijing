import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,example} from '../src/planar-model.mjs';
import {compileField,fieldsAt,solveScene} from '../src/planar-physics.mjs';
import {resolveScene} from '../src/planar-relations.mjs';
import {FieldDisplay,fieldMarkDensity} from '../src/planar-field-display.mjs';
import {fieldProbeHTML} from '../src/planar-field-probe.mjs';
import {PaperView} from '../src/planar-view.mjs';
import {checkSnapshot} from '../src/exam/model.mjs';
import {readJSONResource} from '../src/exam/resources.mjs';
const near=(a,b,epsilon=1e-10)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const field=(id,B,extra={})=>Object.assign(createObject('field',id,[0,0],'circle'),{B,radius:4,labelVisible:false},extra);
const electric=(id,E0,fieldAngle,extra={})=>Object.assign(createObject('electric',id,[0,0],'infinite'),{E0,fieldAngle,labelVisible:false},extra);
function viewFor(objects,{width=800,height=600,scale=60}={}){const scene=emptyScene();scene.objects=objects;scene.display.labels=false;scene.display.axes=false;scene.display.grid=false;const v=Object.create(PaperView.prototype);Object.assign(v,{model:scene,traces:[],width,height,view:{x:0,y:0,scale},time:0,touch:false,editor:[],ui:{present:true,selected:null,readingSide:'after'},svg:{setAttribute(){},querySelectorAll:()=>[]}});return v;}

test('equal opposite circles leave the cancelled hole empty while retaining both editable boundaries',()=>{
 const view=viewFor([field('o1',-100,{radius:5}),field('o2',100,{radius:2})]);view.render();const display=view.fields(),r=display.sample([0,0]);assert.equal(r.B,0);assert.equal(r.contributions.length,2);near(display.sample([3,0]).B,-.1);
 const plans=display.glyphPlan(view);assert.equal(plans.length,1);assert.deepEqual(plans[0].ids,['o1']);for(const s of plans[0].samples)assert.ok(Math.hypot(...s.pointCm)>2);
 assert.match(view.svg.innerHTML,/<mask[^>]+net-field-exclude/);assert.match(view.svg.innerHTML,/r="120" fill="black"/);assert.match(view.svg.innerHTML,/data-object="o1"/);assert.match(view.svg.innerHTML,/data-object="o2"/);assert.doesNotMatch(view.svg.innerHTML,/<pattern|url\(#dots\)|url\(#crosses\)/);
 assert.match(fieldProbeHTML(r),/各场相消/);
});

test('one shared scale makes twice the uniform field twice as dense and remains fixed during parameter edits',()=>{
 const object=field('o1',100,{shape:'infinite'}),view=viewFor([object],{width:352,height:352,scale:60});view.render();const display=view.fields(),before=display.glyphPlan(view)[0].samples.length,ref=display.snapshotReferences();assert.equal(before,64);
 object.B=200;display.setScene(view.model);const after=display.glyphPlan(view)[0].samples.length;assert.equal(after,before*2);assert.deepEqual(display.snapshotReferences(),ref);
 object.B=0;display.setScene(view.model);assert.deepEqual(display.glyphPlan(view),[]);assert.equal(fieldMarkDensity(0,ref.magnetic).fraction,0);
});

test('magnetic strengthening and arbitrary electric vector addition are separate visual layers',()=>{
 const view=viewFor([field('b1',100,{shape:'infinite'}),field('b2',50,{shape:'infinite'}),electric('e1',3,0),electric('e2',4,90)]);view.render();const result=view.inspectField([1,2]);near(result.B,.15);assert.deepEqual(result.electric,[3000,4000]);
 const plans=view.fields().glyphPlan(view);assert.equal(plans.length,2);const E=plans.find(p=>p.kind==='electric');near(E.magnitude,5000);assert.match(view.svg.innerHTML,/data-net-ex="3000" data-net-ey="4000"/);
 const html=fieldProbeHTML(result);assert.match(html,/合磁场/);assert.match(html,/合电场/);assert.match(html,/53\.13/);assert.match(html,/data-probe-contribution="e1"/);assert.match(html,/data-probe-contribution="e2"/);
});

test('the picture and probe honor the exact square-wave side and sine cancellation without normalizing away time dependence',()=>{
 const view=viewFor([field('a',100,{shape:'infinite'}),field('b',100,{shape:'infinite',waveform:'square',period:.4,phase:0})]);view.time=.2e-6;view.ui.readingSide='before';view.render();near(view.inspectField([0,0]).B,.2);assert.ok(view.fields().glyphPlan(view)[0].samples.length);
 view.ui.readingSide='after';view.render();assert.equal(view.inspectField([0,0]).B,0);assert.equal(view.fields().glyphPlan(view).length,0);
 const Eview=viewFor([electric('a',10,0,{waveform:'sine',period:1,phase:0}),electric('b',10,0,{waveform:'sine',period:1,phase:180})]);
 for(const t of [0,.13e-6,.25e-6,.7e-6]){Eview.time=t;Eview.render();assert.deepEqual(Eview.inspectField([0,0]).electric,[0,0]);assert.equal(Eview.fields().glyphPlan(Eview).length,0);}
});

test('hidden enabled fields contribute to visible resultant regions, disabled fields do not',()=>{
 const outer=field('a',-100,{radius:5}),inner=field('b',100,{radius:2,visible:false}),view=viewFor([outer,inner]);view.render();const reading=view.inspectField([0,0]);assert.equal(reading.B,0);assert.equal(reading.contributions.find(r=>r.id==='b').visible,false);assert.match(fieldProbeHTML(reading),/外观已隐藏，仍参与合成/);
 inner.enabled=false;view.set(view.model,[],view.ui);near(view.inspectField([0,0]).B,-.1);assert.deepEqual(view.inspectField([0,0]).contributions.map(r=>r.id),['a']);
 outer.visible=false;view.set(view.model,[],view.ui);assert.equal(view.fields().glyphPlan(view).length,0);near(view.inspectField([0,0]).B,-.1);
});

test('native annulus holes, partial overlap boundaries, and weak residuals remain geometrically meaningful',()=>{
 const annulus=field('a',100,{shape:'annulus',radius:4,innerRadius:2}),view=viewFor([annulus]);view.render();assert.equal(view.inspectField([0,0]).B,0);near(view.inspectField([3,0]).B,.1);assert.match(view.svg.innerHTML,/clip-rule="evenodd"/);
 const weak=viewFor([field('a',100),field('b',-99.999)]);weak.render();const reading=weak.inspectField([0,0]);assert.ok(reading.B>0);near(reading.B,1e-6);assert.ok(weak.fields().glyphPlan(weak).length);assert.doesNotMatch(fieldProbeHTML(reading),/各场相消/);
 const partial=viewFor([field('a',100,{x:-1.5,radius:2}),field('b',-100,{x:1.5,radius:2})]);partial.render();assert.equal(partial.inspectField([0,0]).B,0);near(partial.inspectField([-2,0]).B,.1);near(partial.inspectField([2,0]).B,-.1);assert.equal(partial.inspectField([.5,0]).onBoundary,true);
});

test('probe and rendering do not mutate scene relationships or change any trajectory',()=>{
 const scene=example('double');resolveScene(scene);const before=structuredClone(scene),trajectories=solveScene(scene),view=viewFor([]);view.set(scene,trajectories,view.ui);view.fieldProbePoint=[0,0];
 for(const time of [0,.1e-6,.3e-6]){view.time=time;view.render();const r=view.inspectField([1,1]);const exact=fieldsAt(scene.objects.filter(o=>['field','electric'].includes(o.kind)&&o.enabled).map(o=>compileField(o)),[.01,.01],null,time);near(r.B,exact.B);assert.deepEqual(r.electric,exact.electric);fieldProbeHTML(r);}
 assert.deepEqual(scene,before);assert.deepEqual(solveScene(scene),trajectories);
});

test('all native field shapes retain their exact region while overlapping fields cancel',()=>{
 for(const shape of ['circle','annulus','semicircle','sector','rectangle','triangle','polygon','half','strip','quadrant','infinite']){
  const object=field('a',100,{shape,angle:25,sectorAngle:120,innerRadius:2,width:5,height:4,...(shape==='polygon'?{points:[[-3,-2],[3,-2],[2,2],[-2,3]]}:{})}),view=viewFor([object]);view.render();
  assert.ok(view.fields().glyphPlan(view).length,shape+' must display a nonzero field');assert.ok(view.fieldRegion(object).length,shape+' must have a clipping region');
  for(const plan of view.fields().glyphPlan(view))for(const marker of plan.samples){const reading=view.inspectField(marker.pointCm);near(reading.B,.1);}
  const opposite=structuredClone(object);opposite.id='b';opposite.B=-100;view.model.objects.push(opposite);view.set(view.model,[],view.ui);assert.equal(view.fields().glyphPlan(view).length,0,shape+' must cancel throughout the same region');
 }
});

test('display calibration round-trips as optional view state and rejects invalid references',()=>{
 const scene=emptyScene(),context={fieldDensity:{magnetic:.1,electric:10000}};assert.deepEqual(checkSnapshot('planar',{scene,context}).context.fieldDensity,context.fieldDensity);
 const result=readJSONResource(JSON.stringify({format:'planar-particle-sandbox/5',scene,fieldDensity:context.fieldDensity}));assert.deepEqual(result.snapshot.context.fieldDensity,context.fieldDensity);
 assert.throws(()=>checkSnapshot('planar',{scene,context:{fieldDensity:{magnetic:0}}}),/正数/);assert.throws(()=>checkSnapshot('planar',{scene,context:{fieldDensity:[]}}),/格式/);
 const display=new FieldDisplay();display.resetReferences(context.fieldDensity);display.setScene(scene);assert.deepEqual(display.snapshotReferences(),context.fieldDensity);
});
