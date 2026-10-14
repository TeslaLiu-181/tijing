import {Worker} from 'node:worker_threads';
import {sceneSchema, auditScene} from './ai-harness.mjs';
import {HTTPError, requireCondition} from './errors.mjs';

const tool = (name, description, properties, required = []) => ({type:'function', function:{name, description, parameters:{type:'object', properties, required, additionalProperties:false}}});
export const agentTools = [
  tool('inspect_scene', '原生解析本轮保存场景，读取对象实际定义状态、控制来源、可改参数和依赖链。raw含最后缓存，currentValue只在defined时有效。默认最多30对象/64KiB，limited时按remainingIds筛选继续。不能读取其他资源。', {objectIds:{type:'array',items:{type:'string',pattern:'^o[0-9]+$'},minItems:1,maxItems:20,uniqueItems:true,description:'可选本轮场景内稳定对象ID；右键问当前对象时只发它的ID。'}}),
  tool('query_motion', '用真实原生求解器读取指定粒子在若干时刻的坐标、速度分量、受力、动能。时间单位微秒。边界/换向默认读后侧，side可选前侧；终点仅有已计算端点时位置/速度/动能仍可读；dynamicsAvailable=false时不返回后侧受力或场归属，没有后段时不能推测后侧。尚未发射或未计算的时刻返回说明，不能当作零。', {
    traceId:{type:'string',description:'粒子ID或粒子源实例ID，例如 o3、o3:1；留空使用首个粒子'},
    side:{type:'string',enum:['before','after'],default:'after',description:'原生边界或换向时刻的单侧读数；默认after，before使用前一实际运动段。'},
    timesUs:{type:'array',items:{type:'number',minimum:0},minItems:1,maxItems:24,description:'要查询的物理时刻，单位 μs'}
  }, ['timesUs']),
  tool('query_events', '读取与多轨时间轴相同的真实进出场、场换向和 vx/vy=0 事件，以及各速度分量持续为零的区间。可限定时间范围。', {
    traceId:{type:'string',description:'可选粒子实例ID'},
    velocityComponents:{type:'array',items:{type:'string',enum:['x','y']},minItems:1,maxItems:2,uniqueItems:true,default:['x','y'],description:'要定位的速度分量，默认两轴；可只传x或y。'},
    startUs:{type:'number',minimum:0},endUs:{type:'number',minimum:0}
  }),
  tool('evaluate_relation', '按原生数学表达式与量纲系统计算关系。引用场景对象 ID，例如 distance(pos(o1), pos(o2))。不执行程序代码。', {
    expression:{type:'string',maxLength:1000}
  }, ['expression']),
  tool('search_selected_sources', '在本轮已选择的题干和附件提取文本中查找词语，返回附近原文及来源。不能读取未选资料或其他用户文档。', {
    query:{type:'string',minLength:1,maxLength:120}
  }, ['query']),
  tool('scene_schema', '读取当前沙盒支持的对象、字段单位和依赖构造表达式。需要搭建场景时可查询。', {}),
  tool('test_scene', '在临时副本中运行一个原生场景提案，读取真实轨迹与依赖诊断。不会应用、保存、发布场景。题设不足时先问清，不凭空补值。', {
    scene:{type:'object',description:'按scene_schema构造的原生场景提案，含duration和objects'},
    checks:{type:'array',items:{type:'object'},maxItems:30,description:'可选数值核对项，按scene_schema的checks格式'}
  }, ['scene'])
];

export const toolTitles = {inspect_scene:'读取场景对象与依赖',query_motion:'查询原生运动数据',query_events:'查询时间轴关键节点',evaluate_relation:'计算公式与量纲',search_selected_sources:'查找本轮资料',scene_schema:'读取场景工具说明',test_scene:'试运行场景提案'};

function nativeQuery(action, scene, args, signal, inspectionHeader) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new HTTPError(499,'此次 AI 请求已停止','ai_cancelled')); return; }
    const worker = new Worker(new URL('./ai-agent-worker.mjs',import.meta.url), {workerData:{action,scene,args,inspectionHeader},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:96}});
    let done = false;
    const finish = (error, value) => {
      if (done) return; done = true;
      clearTimeout(timer); signal?.removeEventListener('abort',abort); worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(new HTTPError(499,'此次 AI 请求已停止','ai_cancelled'));
    const timer = setTimeout(()=>finish(new HTTPError(422,'当前场景的工具计算超过时限，请缩短仿真时段','ai_tool_timeout')),12000);
    signal?.addEventListener('abort',abort,{once:true});
    worker.on('message',message=>message.ok?finish(null,message.result):finish(new HTTPError(422,message.error,'ai_tool_input')));
    worker.on('error',()=>finish(new HTTPError(422,'原生工具无法完成这次计算','ai_tool_failed')));
    worker.on('exit',code=>{if(!done)finish(new HTTPError(422,'原生工具已停止，未产生完整结果','ai_tool_failed'));});
  });
}

export async function runAgentTool(name, args, scope, {signal} = {}) {
  requireCondition(args && typeof args==='object' && !Array.isArray(args),400,'工具参数必须是对象','ai_tool_input');
  requireCondition(Object.hasOwn(toolTitles,name),400,'不支持这个工具','ai_tool_input');
  if (name==='scene_schema') return sceneSchema();
  if (name==='search_selected_sources') {
    requireCondition(typeof args.query==='string'&&args.query.trim().length>0&&args.query.length<=120,400,'请输入要查找的词语','ai_tool_input');
    const needle=args.query.trim().toLocaleLowerCase();
    const sources=[...(scope.question?[{name:scope.question.title||'本轮题干',text:scope.question.sourceText||''}]:[]),...(scope.documents?.documents||[])];
    const matches=[];
    for(const source of sources){let start=0;const text=String(source.text||''),lower=text.toLocaleLowerCase();while(matches.length<12){const at=lower.indexOf(needle,start);if(at<0)break;matches.push({source:source.name,offset:at,excerpt:text.slice(Math.max(0,at-160),Math.min(text.length,at+needle.length+360))});start=at+needle.length;}if(matches.length>=12)break;}
    return {query:args.query,matches,sourceCount:sources.length,note:matches.length?'仅包含本轮已选文本的真实片段。':'本轮可检索文本中未找到；这不代表原图不存在该内容。'};
  }
  if (name==='test_scene') {
    requireCondition(scope.mode==='scene',403,'当前模式只能读取和分析已有场景；搭建提案请使用场景模式','ai_tool_mode');
    requireCondition(args.scene&&Array.isArray(args.scene.objects),400,'缺少场景提案','ai_tool_input');
    const checked=await auditScene(args.scene,args.checks||[],{signal});
    return {harness:checked.harness,scene:checked.scene,applied:false};
  }
  const record=scope.record;
  requireCondition(record?.kind==='planar'&&record.snapshot?.scene,400,record?.kind==='example4'?'此原生工具只支持平面场景；当前是三维场景。':'本轮没有选中平面场景。','ai_tool_no_scene');
  const scene=record.snapshot.scene;
  if(name==='inspect_scene'){
    requireCondition(args.objectIds===undefined||Array.isArray(args.objectIds)&&args.objectIds.length>0&&args.objectIds.length<=20&&new Set(args.objectIds).size===args.objectIds.length&&args.objectIds.every(id=>typeof id==='string'&&/^o\d+$/.test(id)&&scene.objects.some(o=>o.id===id)),400,'对象筛选须为本轮场景内1–20个有效、不重复的对象ID','ai_tool_input');
    return nativeQuery(name,scene,{objectIds:args.objectIds},signal,{title:record.title,durationUs:scene.duration,units:sceneSchema().units,note:'本轮授权保存场景的原生解析；raw对象数值可能是最后有限缓存，不代表未定义几何的当前值。'});
  }

  if(name==='query_motion') {
    requireCondition(args.side===undefined||['before','after'].includes(args.side),400,'读取侧须为before或after','ai_tool_input');
    requireCondition(Array.isArray(args.timesUs)&&args.timesUs.length>0&&args.timesUs.length<=24&&args.timesUs.every(t=>Number.isFinite(t)&&t>=0&&t<=scene.duration),400,'查询时刻须在当前观察时段内，最多24个','ai_tool_input');
    requireCondition(args.traceId==null||typeof args.traceId==='string'&&/^o\d+(?::\d+)?$/.test(args.traceId),400,'粒子实例编号不正确','ai_tool_input');
  }
  if(name==='query_events'){
    requireCondition(args.velocityComponents===undefined||Array.isArray(args.velocityComponents)&&args.velocityComponents.length>0&&args.velocityComponents.length<=2&&new Set(args.velocityComponents).size===args.velocityComponents.length&&args.velocityComponents.every(c=>['x','y'].includes(c)),400,'速度分量须为x/y的非空不重复数组','ai_tool_input');
    requireCondition(args.traceId==null||typeof args.traceId==='string'&&/^o\d+(?::\d+)?$/.test(args.traceId),400,'粒子实例编号不正确','ai_tool_input');
    const start=args.startUs??0,end=args.endUs??scene.duration;
    requireCondition(Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start&&end<=scene.duration,400,'事件范围须在观察时段内','ai_tool_input');
  }
  if(name==='evaluate_relation')requireCondition(typeof args.expression==='string'&&args.expression.trim()&&args.expression.length<=1000,400,'表达式须为1–1000字','ai_tool_input');
  return nativeQuery(name,scene,args,signal);
}

/** Tools are an explicit model loop; only selected data and native solvers exist. */
export async function completeWithTools(provider, messages, scope, {signal, onEvent, onResponse, reserve, maxRounds=5, completeOptions={}} = {}) {
  const calls=[],activities=[],conversation=[...messages];
  const tools=agentTools.filter(t=>scope.mode==='scene'||t.function.name!=='test_scene');
  for(let round=0;round<maxRounds;round++) {
    if(signal?.aborted)throw new HTTPError(499,'此次 AI 请求已停止','ai_cancelled');
    await reserve?.(conversation,calls);
    const startedAt=new Date().toISOString(),modelEvent={id:'model-'+round,type:'model',name:'model',title:round?'模型继续分析':'模型生成',status:'running',startedAt};
    onEvent?.(modelEvent);
    const response=await provider.complete(conversation,{...completeOptions,signal,tools,toolChoice:round===maxRounds-1?'none':'auto',onProgress:progress=>onEvent?.({...modelEvent,output:progress})});
    calls.push(response);onResponse?.(response);
    onEvent?.({...modelEvent,status:'completed',completedAt:new Date().toISOString(),output:{textCharacters:response.content?.length||0,toolRequests:response.toolCalls?.length||0,model:response.model}});
    if(!response.toolCalls?.length)return {response,calls,activities};
    // Reasoning needed by the provider stays inside this server-side turn and
    // is never used as a user-visible explanation or saved in activity logs.
    conversation.push(response.assistantMessage);
    requireCondition(response.toolCalls.length<=6,502,'单轮工具请求过多，请缩小问题范围','ai_tool_limit');
    for(const call of response.toolCalls) {
      const name=call.function?.name,id=call.id,title=toolTitles[name]||'未知工具';
      const startedAt=new Date().toISOString();let args,result,status='completed';
      onEvent?.({id,type:'tool',name,title,status:'running',startedAt});
      try{args=JSON.parse(call.function.arguments||'{}');result=await runAgentTool(name,args,scope,{signal});}
      catch(error){if(signal?.aborted)throw error;status='failed';result={error:error.message,code:error.code||'ai_tool_input'};}
      const activity={id,type:'tool',name,title,status,startedAt,completedAt:new Date().toISOString(),input:args,output:result};
      activities.push(activity);onEvent?.(activity);
      conversation.push({role:'tool',tool_call_id:id,content:JSON.stringify(result)});
    }
    if(round===maxRounds-2)conversation.push({role:'user',content:'工具调用已到本轮上限。请依据已获得的数据给出最终JSON；数据不足处明确标注，不能补造结果。'});
  }
  throw new HTTPError(502,'模型本轮未形成完整答复','ai_response_incomplete');
}
