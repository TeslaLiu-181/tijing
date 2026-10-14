import test from 'node:test';
import assert from 'node:assert/strict';
import {example} from '../src/planar-model.mjs';
import {resolveScene} from '../src/planar-relations.mjs';
import {readMeasurements,addMeasurementParameter} from '../src/planar-measurements.mjs';
import {inspectSceneControls} from '../src/planar-scene-inspector.mjs';
import {PaperView} from '../src/planar-view.mjs';
import {sceneChanges} from '../server/exam/ai-scene-changes.mjs';

const close=(a,b)=>assert(Math.abs(a-b)<1e-10*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('annular measurement references and inspector expose both actual radii, including an invalid interval',()=>{
 const scene=example('annular-electric');resolveScene(scene);
 const values=readMeasurements(scene,'o4');close(values.find(v=>v.key==='area').value,3*Math.PI);close(values.find(v=>v.key==='perimeter').value,6*Math.PI);
 const added=addMeasurementParameter(scene,'o4','area'),area=scene.objects.find(o=>o.id===added.id);
 assert.equal(area.unit,'cm2');assert.equal(area.defs.value,'area(o4)');
 const before=structuredClone(scene);scene.objects.find(o=>o.id==='o2').value=0;resolveScene(scene);close(area.value,4*Math.PI);close(readMeasurements(scene,'o4').find(v=>v.key==='perimeter').value,4*Math.PI);
 assert(sceneChanges(before,scene).changed.find(o=>o.id==='o4').fields.some(field=>field.key==='innerRadius'));
 scene.objects.find(o=>o.id==='o2').value=3;assert(resolveScene(scene).fieldUnavailable);assert(area._error);assert(readMeasurements(scene,'o4').every(value=>!value.defined));
 const inspected=inspectSceneControls(scene,{objectIds:['o4']}).inspections[0],parameters=new Map(inspected.parameters.map(p=>[p.key,p]));
 assert.equal(inspected.defined,false);assert.equal(parameters.get('radius').currentValue,2);assert.equal(parameters.get('innerRadius').currentValue,3);assert.equal(parameters.get('innerRadius').name,'内半径');assert.equal(parameters.get('E0').editable,true);assert.equal(parameters.has('angle'),false);
 scene.objects.find(o=>o.id==='o2').value=1;assert.equal(resolveScene(scene).fieldUnavailable,false);close(area.value,3*Math.PI);assert.equal(area._error,'');
});

test('annular SVG keeps a real even-odd hole and clips changing-field glyphs to the same region',()=>{
 const scene=example('annular-electric');resolveScene(scene);scene.display.labels=false;
 const field=scene.objects.find(o=>o.id==='o4'),view=Object.create(PaperView.prototype);Object.assign(view,{model:scene,width:800,height:600,view:{x:0,y:0,scale:80},time:0,idPrefix:'preview-',editor:[],ui:{present:true,selected:null,readingSide:'after'}});
 const before=JSON.stringify(scene),dc=view.field(field);assert.match(dc,/fill-rule="evenodd"/);const path=dc.match(/<path d="([^"]+)" fill-rule="evenodd"[^>]*class="field-body"/)[1];assert.equal((path.match(/M/g)||[]).length,2);assert.equal(JSON.stringify(scene),before);
 field.waveform='square';field.period=.4;field.phase=0;view.time=.2e-6;
 const ac=view.fields().render(view);assert.match(ac,/<clipPath id="preview-net-field-region-\d+">/);assert.match(ac,/clip-rule="evenodd"/);assert.match(ac,/clip-path="url\(#preview-net-field-region-\d+\)"/);assert.equal(view.inspectField([0,0]).electric.every(x=>x===0),true);
 field.innerRadius=0;const disk=view.field(field),bodyPath=disk.match(/<path d="([^"]+)" fill-rule="evenodd"[^>]*class="field-body"/)[1];assert.equal((bodyPath.match(/M/g)||[]).length,1);
});
