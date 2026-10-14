import test from 'node:test';
import assert from 'node:assert/strict';
import {example,emptyScene,createObject} from '../src/planar-model.mjs';
import {addConstruction,fillRegion} from '../src/planar-constructions.mjs';
import {inspectSceneControls} from '../src/planar-scene-inspector.mjs';
import {renderAIActivity} from '../src/exam/web-ai-activity.mjs';
const job=output=>({id:'synthetic-inspection',status:'completed',createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:01Z',activity:[{id:'tool-1',type:'tool',name:'inspect_scene',title:'读取场景对象与依赖',status:'completed',startedAt:'2026-10-04T00:00:00Z',completedAt:'2026-10-04T00:00:01Z',output}]});
const card=html=>html.split('<details class="ai-tool-detail"')[0];

test('the inspector UI displays native control semantics and count scope without internal parameter keys',()=>{
 const scene=example('geometry-regular-field'),output=inspectSceneControls(scene,{objectIds:['o2','o4','o6','o7'],header:{durationUs:.8}}),j=job(output);j.result={sourcePreview:{snapshot:{scene}}};const html=renderAIActivity(j),structured=card(html);
 assert.match(html,/详细读取 4 \/ 11 个对象/);assert.match(structured,/直接上游/);assert.match(structured,/直接下游/);assert.match(structured,/区域控制/);assert.match(structured,/构造控制/);assert.match(structured,/依赖定义/);assert.match(structured,/可直接改数值/);assert.match(structured,/原生依赖解析/);
 assert.match(structured,/外|自由参数/);for(const key of ['byConstruction','byRegion','definitionEditable','E0','point0x'])assert(!structured.includes(key));assert.match(html,/原始工具输入与 JSON/);assert.match(html,/&quot;currentValue&quot;/);
});

test('undefined native outputs cannot fall back to old radius caches and independent strengths stay editable',()=>{
 const scene=emptyScene();scene.objects=[[0,0],[2,0],[0,2]].map((p,i)=>createObject('point','o'+(i+1),p));scene.nextId=4;const circle=addConstruction(scene,{tool:'circle-three',inputs:['o1','o2','o3']}).primaryId,field=fillRegion(scene,circle);scene.objects[2].y=0;
 const output=inspectSceneControls(scene,{objectIds:[circle,field.id]}),html=renderAIActivity(job(output)),structured=card(html);
 assert.match(structured,/当前未定义/);assert.match(structured,/共线/);assert.match(structured,/可直接改数值/);assert(!structured.includes('>1.41421<'));assert.match(structured,/当前未定义时不使用存档缓存/);
});

test('limited, legacy, escaping, and very long issue content preserve truthful complete tool records',()=>{
 const output={objectCount:500,returnedCount:1,limited:true,remainingIds:['o2','o3'],objects:[{id:'o1',label:'<img src=x onerror="alert(1)">'}],inspections:[{id:'o1',label:'<img src=x onerror="alert(1)">',kind:'point',defined:false,issues:[{message:'<script>attack</script>'+('长说明'.repeat(1000))}],dependencies:{directUpstream:['o999'],directDownstream:[]},parameters:[{key:'x',name:'横坐标',unit:'cm',currentValue:null,defined:false,editable:false}]}]};const html=renderAIActivity(job(output));
 assert.match(html,/详细读取 1 \/ 500 个对象 · 返回范围受限/);assert.match(html,/还有 2 个对象未返回/);assert.match(html,/1 个对象的名称未返回/);assert.match(html,/&lt;img src=x/);assert.match(html,/&lt;script&gt;attack&lt;\/script&gt;/);assert(!html.includes('<img '));assert(!html.includes('<script>'));assert(html.includes('长说明'.repeat(1000)));assert.match(html,/原始工具输入与 JSON/);
 const legacy=renderAIActivity(job({objects:[{id:'o1'}]}));assert.match(legacy,/场景总数未记录/);assert(!legacy.includes('ai-inspection-card'));
});
