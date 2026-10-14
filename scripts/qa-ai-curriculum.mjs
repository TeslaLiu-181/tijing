import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {ModelProvider,loadModelConfiguration} from '../server/exam/model-provider.mjs';
import {systemPrompt,contextText} from '../server/exam/ai-prompts.mjs';
import {parseAIResult} from '../server/exam/ai-harness.mjs';
const config=await loadModelConfiguration(),all=JSON.parse(await readFile('tests/fixtures/ai-curriculum.json','utf8')),selected=process.env.AI_CASES?.split(',').filter(Boolean);
const cases=selected?all.filter(c=>selected.includes(c.id)):all,model=process.env.AI_MODEL||'deepseek-flash',out=resolve(process.env.AI_EVIDENCE||'.qa/overnight-20261003/curriculum-'+model);
await mkdir(out,{recursive:true,mode:0o700});
const provider=new ModelProvider({...config,model,maxTokens:2500}),report={model,syntheticOnly:true,startedAt:new Date().toISOString(),scope:'Text tutoring, analytical references; require human review, no blanket correctness claim',cases:[],usage:{inputTokens:0,outputTokens:0,totalTokens:0}};
for(const c of cases){
 const started=Date.now();
 try{
  const response=await provider.complete([{role:'system',content:systemPrompt('tutor')},{role:'user',content:contextText({mode:'tutor',prompt:'请给出结论与关键推导，并说明适用条件。',question:{title:c.title,sourceText:c.text,parts:[],review:'confirmed'},documents:{documents:[],images:[]}})}]);
  const result=parseAIResult(response.content),entry={id:c.id,status:result.status,expected:c.expected,result,usage:response.usage,seconds:(Date.now()-started)/1000,reviewRequired:true};
  if(c.needsConfirmation)entry.conditionGate=result.status==='needs_confirmation'&&result.missing.length>0;
  await writeFile(join(out,c.id+'.json'),JSON.stringify(entry,null,2),{mode:0o600});
  report.cases.push({id:c.id,status:result.status,conditionGate:entry.conditionGate,seconds:entry.seconds,reviewRequired:true});
  for(const key of Object.keys(report.usage))report.usage[key]+=response.usage[key]||0;
  console.log(JSON.stringify({id:c.id,status:result.status,conditionGate:entry.conditionGate,tokens:response.usage.totalTokens}));
 }catch(error){report.cases.push({id:c.id,error:error.message,reviewRequired:true});console.log(JSON.stringify({id:c.id,error:error.message}));}
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
}
report.finishedAt=new Date().toISOString();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({finished:true,model,cases:report.cases.length,usage:report.usage}));
