import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,createObject} from '../src/planar-model.mjs';
import {E,U} from '../src/planar-physics.mjs';
import {runAgentTool,completeWithTools,agentTools} from '../server/exam/ai-agent-tools.mjs';
import {ModelProvider} from '../server/exam/model-provider.mjs';
import {phaseActivity,toolActivity,publicActivity} from '../server/exam/ai-run-events.mjs';
import {sceneChanges} from '../server/exam/ai-scene-changes.mjs';

function electricScope(){
  const scene=emptyScene();scene.duration=.1;
  scene.objects=[Object.assign(createObject('particle','o1'),{mass:1,charge:1,speed:1,heading:0}),Object.assign(createObject('electric','o2',[0,0],'infinite'),{E0:1,fieldAngle:90})];scene.nextId=3;
  return {mode:'tutor',record:{kind:'planar',title:'合成匀强电场',snapshot:{scene}}};
}
test('agent motion query returns real component acceleration and preserves the scene',async()=>{
  const scope=electricScope(),before=JSON.stringify(scope);
  const result=await runAgentTool('query_motion',{traceId:'o1',timesUs:[0,.01]},scope);
  assert.equal(result.method,'native-piecewise-electromagnetic-solver');
  assert.equal(result.readings[0].vyMs,0);
  assert.ok(Math.abs(result.readings[1].vyMs-E*1000/U*1e-8)<1e-8);
  assert.ok(Math.abs(result.readings[1].vxMs-100000)<1e-8);
  assert.equal(JSON.stringify(scope),before);
  await assert.rejects(()=>runAgentTool('query_motion',{timesUs:[1]},scope),/观察时段/);
});
test('agent only searches selected sources and cannot run arbitrary tool names',async()=>{
  const scope={question:{title:'题干',sourceText:'粒子以速度v进入磁场。'},documents:{documents:[{name:'笔记',text:'电荷量q为正值。'}]}};
  const found=await runAgentTool('search_selected_sources',{query:'磁场'},scope);
  assert.equal(found.matches.length,1);assert.equal(found.matches[0].source,'题干');
  await assert.rejects(()=>runAgentTool('read_file',{path:'secrets'},scope),/不支持/);
  await assert.rejects(()=>runAgentTool('test_scene',{scene:electricScope().record.snapshot.scene},{...electricScope(),mode:'tutor'}),/场景模式/);
});
test('real tool results round-trip to the model and activity retains failed tools',async()=>{
  let count=0;const messagesSeen=[],events=[],responses=[];
  const provider={complete:async messages=>{
    messagesSeen.push(structuredClone(messages));count++;
    if(count===1){const toolCalls=[{id:'a',type:'function',function:{name:'query_motion',arguments:JSON.stringify({traceId:'o1',timesUs:[.01]})}},{id:'b',type:'function',function:{name:'unknown',arguments:'{}'}}];return {content:'',toolCalls,assistantMessage:{role:'assistant',content:null,reasoning_content:'private provider continuation',tool_calls:toolCalls},usage:{totalTokens:12}};}
    return {content:'{"status":"answer"}',usage:{totalTokens:20}};
  }};
  const run=await completeWithTools(provider,[{role:'user',content:'请查询纵向速度'}],electricScope(),{onEvent:e=>events.push(e),onResponse:r=>responses.push(r)});
  assert.equal(count,2);assert.equal(responses.length,2);assert.equal(run.activities.length,2);
  assert.equal(run.activities[0].status,'completed');assert.equal(run.activities[1].status,'failed');
  const outputs=messagesSeen[1].filter(m=>m.role==='tool').map(m=>JSON.parse(m.content));
  assert.ok(outputs[0].readings[0].vyMs>0);assert.match(outputs[1].error,/不支持/);
  assert.equal(events.some(e=>'reasoning_content' in e),false);
});
test('provider tool calls preserve required continuation without exposing it as answer text',async()=>{
  let body;
  const config={apiKey:'fixture-only',baseURL:'https://api.deepseek.com/v1',model:'fixture',maxTokens:3000,timeoutMs:1000};
  const provider=new ModelProvider(config,{fetchImpl:async(_url,options)=>{
    body=JSON.parse(options.body);return new Response(JSON.stringify({model:'fixture',choices:[{finish_reason:'tool_calls',message:{content:null,reasoning_content:'private continuation',tool_calls:[{id:'call1',type:'function',function:{name:'scene_schema',arguments:'{}'}}]}}],usage:{prompt_tokens:10,completion_tokens:15,total_tokens:25}}));
  }});
  const result=await provider.complete([{role:'user',content:'场景说明'}],{tools:agentTools});
  assert.equal(body.tool_choice,'auto');assert.equal(result.content,'');assert.equal(result.usage.totalTokens,25);
  assert.equal(result.assistantMessage.reasoning_content,'private continuation');assert.equal(result.toolCalls[0].function.name,'scene_schema');
});
test('activity phases keep duration and interrupted tools no longer appear active',()=>{
  let events=phaseActivity([],{phase:'读取资料',status:'running',stamp:'2026-10-03T01:00:00Z'});
  events=phaseActivity(events,{phase:'模型分析',status:'running',stamp:'2026-10-03T01:00:02Z'});
  events=toolActivity(events,{id:'t1',type:'tool',name:'inspect_scene',title:'读取场景',status:'running',startedAt:'2026-10-03T01:00:03Z'});
  assert.equal(events[0].completedAt,'2026-10-03T01:00:02Z');
  const shown=publicActivity({events_json:JSON.stringify(events),status:'interrupted',updated_at:'2026-10-03T01:00:04Z'});
  assert.equal(shown[1].status,'cancelled');assert.equal(shown[2].status,'cancelled');
});

test('scene review reports symbolic definitions and physical edits without counting display caches',()=>{
  const before=electricScope().record.snapshot.scene,after=structuredClone(before);after.objects[1].E0=2;after.objects[1].defs={E0:'2 * 1 kV/m'};after.duration=.2;after.display.grid=!after.display.grid;
  const diff=sceneChanges(before,after);assert.equal(diff.changed.length,1);assert.equal(diff.changed[0].id,'o2');assert.equal(diff.changed[0].fields[0].key,'defs.E0');assert.equal(diff.changed[0].fields[1].after,2);assert.equal(diff.duration.after,.2);assert.equal(diff.added.length,0);
  const fresh=sceneChanges(null,after);assert.equal(fresh.hasBaseline,false);assert.equal(fresh.added.length,2);assert.equal(fresh.added[1].fields.find(f=>f.key==='E0').after,2);assert.equal(fresh.added[1].definitions.E0,'2 * 1 kV/m');
});
