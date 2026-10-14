import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject} from '../src/planar-model.mjs';
import {addConstruction,fillRegion} from '../src/planar-constructions.mjs';
import {resolveScene,setDefinition} from '../src/planar-relations.mjs';
import {inspectSceneControls} from '../src/planar-scene-inspector.mjs';
import {runAgentTool,agentTools} from '../server/exam/ai-agent-tools.mjs';
const scope=scene=>({mode:'tutor',record:{kind:'planar',title:'合成控制检查',snapshot:{scene}}});
const object=(result,id)=>result.inspections.find(o=>o.id===id);
const parameter=(result,id,key)=>object(result,id).parameters.find(p=>p.key===key);
const bytes=result=>Buffer.byteLength(JSON.stringify(result),'utf8');
function triangle(){const scene=emptyScene();scene.objects=[[0,0],[2,0],[0,2]].map((p,i)=>createObject('point','o'+(i+1),p));scene.nextId=4;return scene;}

test('native construction and bound region controls distinguish editable strengths from controlled geometry',async()=>{
 const scene=triangle(),circle=addConstruction(scene,{tool:'circle-three',inputs:['o1','o2','o3']}).primaryId,field=fillRegion(scene,circle),electric=fillRegion(scene,circle,'electric');
 const free=createObject('parameter','o'+scene.nextId++);free.unit='mT';free.value=80;scene.objects.push(free);setDefinition(scene,field.id,'B',free.id+'.value');
 const result=await runAgentTool('inspect_scene',{objectIds:[circle,field.id,electric.id]},scope(scene));
 assert.equal(result.objectCount,7);assert.equal(result.returnedCount,3);assert.equal(result.limited,false);
 assert.deepEqual(object(result,circle).construction.inputs,['o1','o2','o3']);assert.equal(parameter(result,circle,'radius').byConstruction,true);assert.equal(parameter(result,circle,'radius').editable,false);assert.equal(parameter(result,circle,'radius').definitionEditable,false);
 assert.equal(parameter(result,field.id,'radius').byRegion,true);assert.equal(parameter(result,field.id,'radius').editable,false);assert.equal(parameter(result,field.id,'radius').definitionEditable,false);
 assert.equal(parameter(result,field.id,'B').byDefinition,'B');assert.equal(parameter(result,field.id,'B').editable,false);assert.equal(parameter(result,field.id,'B').definitionEditable,true);assert.equal(parameter(result,field.id,'B').currentValue,80);
 assert.equal(parameter(result,electric.id,'E0').editable,true);assert.equal(parameter(result,electric.id,'fieldAngle').editable,true);
 assert(object(result,circle).dependencies.directDownstream.includes(field.id));assert(object(result,field.id).dependencies.upstream.includes('o1'));assert(object(result,field.id).dependencies.directUpstream.includes(free.id));
 assert.equal(result.method,'native-source-geometry-inspection');assert.match(result.limitations[0],/未计算物理轨迹/);assert.ok(bytes(result)<=65536);
});

test('undefined geometry returns null actual values and recovers the same IDs without overwriting raw caches',async()=>{
 const scene=triangle(),circle=addConstruction(scene,{tool:'circle-three',inputs:['o1','o2','o3']}).primaryId,field=fillRegion(scene,circle);resolveScene(scene);
 const originalRadius=scene.objects.find(o=>o.id===circle).radius;scene.objects[2].y=0;const before=JSON.stringify(scene);
 const result=await runAgentTool('inspect_scene',{objectIds:[circle,field.id]},scope(scene));
 assert.equal(object(result,circle).defined,false);assert.equal(parameter(result,circle,'radius').defined,false);assert.equal(parameter(result,circle,'radius').currentValue,null);assert.match(parameter(result,circle,'radius').error,/共线|重合/);
 assert.equal(result.objects.find(o=>o.id===circle).radius,originalRadius);assert.equal(parameter(result,field.id,'radius').currentValue,null);assert.equal(parameter(result,field.id,'B').defined,true);assert.equal(parameter(result,field.id,'B').editable,true);assert.ok(object(result,field.id).issues.length);
 assert.equal(JSON.stringify(scene),before);scene.objects[2].y=2;
 const recovered=await runAgentTool('inspect_scene',{objectIds:[circle,field.id]},scope(scene));assert.deepEqual(recovered.objects.map(o=>o.id),[circle,field.id]);assert.equal(object(recovered,circle).defined,true);assert.equal(parameter(recovered,circle,'radius').currentValue,originalRadius);assert.equal(parameter(recovered,field.id,'radius').defined,true);
});

test('active shape controls hide unused dimensions and preserve vector definition targets',()=>{
 const scene=emptyScene(),rectangle=createObject('field','o1',[0,0],'rectangle'),strip=createObject('electric','o2',[0,0],'strip'),point=createObject('point','o3');scene.objects=[rectangle,strip,point];scene.nextId=4;
 setDefinition(scene,'o3','position','point(1, 2)');const result=inspectSceneControls(scene);
 const keys=id=>object(result,id).parameters.map(p=>p.key);
 assert(keys('o1').includes('width'));assert(keys('o1').includes('height'));assert(keys('o1').includes('angle'));for(const key of ['radius','sectorAngle','period','phase','fontSize','labelOffset'])assert(!keys('o1').includes(key));
 assert(keys('o2').includes('width'));assert(!keys('o2').includes('height'));assert(!keys('o2').includes('radius'));
 assert(!keys('o3').includes('length'));assert(!keys('o3').includes('angle'));assert(!keys('o3').includes('factor'));
 const x=parameter(result,'o3','x');assert.equal(x.editable,false);assert.equal(x.definitionEditable,true);assert.equal(x.byDefinition,'position');assert.equal(x.definitionTarget,'position');assert.equal(x.definitionTargetValueType,'vector');assert.equal(x.currentValue,1);
 rectangle.waveform='square';const square=inspectSceneControls(scene);assert(parameter(square,'o1','period'));assert(parameter(square,'o1','phase'));
});

test('filtered inspection accepts an authorized 500-object source and rejects foreign or invalid IDs',async()=>{
 const scene=emptyScene();scene.objects=Array.from({length:500},(_,i)=>createObject('point','o'+(i+1),[i,0]));scene.nextId=501;const before=JSON.stringify(scene);
 const result=await runAgentTool('inspect_scene',{objectIds:['o500','o1']},scope(scene));assert.equal(result.objectCount,500);assert.equal(result.returnedCount,2);assert.deepEqual(result.objects.map(o=>o.id),['o500','o1']);assert.equal(parameter(result,'o500','x').currentValue,499);assert.equal(JSON.stringify(scene),before);
 const other=emptyScene();other.objects=[createObject('point','o999')];const selected={...scope(scene),otherResource:{record:{kind:'planar',snapshot:{scene:other}}}};
 for(const objectIds of [[],['o1','o1'],['o999'],['bad'],Array.from({length:21},(_,i)=>'o'+(i+1))])await assert.rejects(()=>runAgentTool('inspect_scene',{objectIds},selected),e=>e.status===400&&e.code==='ai_tool_input');
 await assert.rejects(()=>runAgentTool('inspect_scene',{}, {mode:'tutor',otherResource:selected.otherResource}),/没有选中平面场景/);
 const schema=agentTools.find(t=>t.function.name==='inspect_scene').function.parameters.properties.objectIds;assert.equal(schema.maxItems,20);
});

test('default and filtered payloads keep complete entries, include the entire envelope in their byte budget',()=>{
 const scene=emptyScene();scene.objects=Array.from({length:100},(_,i)=>createObject('point','o'+(i+1),[i,0]));scene.nextId=101;
 const result=inspectSceneControls(scene,{header:{title:'合成控制检查',units:{length:'cm',mass:'u'}}});assert.equal(result.limited,true);assert.ok(result.returnedCount>0&&result.returnedCount<=30);assert.equal(result.remainingIds.length+result.returnedCount,100);assert.equal(result.inspections.length,result.objects.length);assert.ok(bytes(result)<=65536);assert.match(result.note,/remainingIds/);
 const small=inspectSceneControls(scene,{maxBytes:5000,header:{title:'物理'.repeat(80)}});assert.ok(bytes(small)<=5000);assert.equal(small.inspections.length,small.objects.length);
 const large=emptyScene();large.objects=Array.from({length:5},(_,i)=>{const o=createObject('polygon','o'+(i+1));o.points=Array.from({length:64},(_,k)=>[Math.cos(k*2*Math.PI/64),Math.sin(k*2*Math.PI/64)]);return o;});large.nextId=6;
 assert.throws(()=>inspectSceneControls(large,{objectIds:['o1','o2','o3','o4','o5']}),/超过64KiB.*不会截断/);
 const partial=inspectSceneControls(large);assert.ok(bytes(partial)<=65536);assert.equal(partial.inspections.length,partial.objects.length);assert.equal(partial.remainingIds.length+partial.returnedCount,5);
});
