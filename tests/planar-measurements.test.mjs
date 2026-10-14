import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject,prepareScene} from '../src/planar-model.mjs';
import {resolveScene,setDefinition} from '../src/planar-relations.mjs';
import {addMeasurementParameter,readMeasurements,measurementOptions} from '../src/planar-measurements.mjs';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);
test('circle measurements keep typed definitions, update from the free radius, and survive serialization',()=>{
 const scene=emptyScene(),radius=Object.assign(createObject('parameter','o1'),{unit:'cm',value:2}),circle=createObject('circle','o2');
 scene.objects.push(radius,circle);scene.nextId=3;setDefinition(scene,circle.id,'radius','o1.value');resolveScene(scene);
 const area=addMeasurementParameter(scene,circle.id,'area'),perimeter=addMeasurementParameter(scene,circle.id,'perimeter');
 close(scene.objects.find(o=>o.id===area.id).value,4*Math.PI);close(scene.objects.find(o=>o.id===perimeter.id).value,4*Math.PI);
 radius.value=3;resolveScene(scene);close(scene.objects.find(o=>o.id===area.id).value,9*Math.PI);close(scene.objects.find(o=>o.id===perimeter.id).value,6*Math.PI);
 const restored=prepareScene(JSON.parse(JSON.stringify(scene)));resolveScene(restored);assert.equal(restored.objects.find(o=>o.id===area.id).unit,'cm2');
 const before=JSON.stringify(restored);assert.equal(addMeasurementParameter(restored,circle.id,'area').id,area.id);assert.equal(JSON.stringify(restored),before);
});

test('endpoint-based length and principal angle follow geometry and recover from coincident inputs',()=>{
 const scene=emptyScene(),segment=Object.assign(createObject('line','o1',[0,0],'segment'),{points:[[0,0],[3,4]]}),angle=Object.assign(createObject('angle','o2'),{points:[[1,0],[0,0],[0,1]]});
 scene.objects.push(segment,angle);scene.nextId=3;
 const length=addMeasurementParameter(scene,segment.id,'length'),theta=addMeasurementParameter(scene,angle.id,'angle');
 close(scene.objects.find(o=>o.id===length.id).value,5);close(scene.objects.find(o=>o.id===theta.id).value,90);
 angle.points[2]=[1,1];segment.points[1]=[0,8];resolveScene(scene);close(scene.objects.find(o=>o.id===length.id).value,8);close(scene.objects.find(o=>o.id===theta.id).value,45);
 angle.points[0]=[0,0];resolveScene(scene);assert.equal(readMeasurements(scene,angle.id)[0].defined,false);assert.ok(scene.objects.find(o=>o.id===theta.id)._error);
 angle.points[0]=[-1,0];resolveScene(scene);close(scene.objects.find(o=>o.id===theta.id).value,135);assert.equal(scene.objects.find(o=>o.id===theta.id)._error,'');
 assert.equal(addMeasurementParameter(scene,angle.id,'angle').id,theta.id);
});

test('bounded rectangle measurements are actual boundaries; rays and sectors are not mislabeled as finite segments or disks',()=>{
 const scene=emptyScene(),field=Object.assign(createObject('electric','o1',[0,0],'rectangle'),{width:3,height:2});scene.objects.push(field);scene.nextId=2;
 const values=readMeasurements(scene,field.id);close(values.find(x=>x.key==='area').value,6);close(values.find(x=>x.key==='perimeter').value,10);
 assert.deepEqual(measurementOptions(createObject('line','o2',[0,0],'ray')),[]);assert.deepEqual(measurementOptions(createObject('field','o3',[0,0],'sector')),[]);
 const before=JSON.stringify(scene);assert.throws(()=>addMeasurementParameter(scene,field.id,'length'));assert.equal(JSON.stringify(scene),before);
});
