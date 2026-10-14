import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {ModelProvider,loadModelConfiguration} from '../server/exam/model-provider.mjs';
import {secureProviderFetch} from '../server/exam/model-network.mjs';
import {systemPrompt,contextText} from '../server/exam/ai-prompts.mjs';
import {parseAIResult} from '../server/exam/ai-harness.mjs';
const cfg=await loadModelConfiguration(),fixture=JSON.parse(await readFile('tests/fixtures/ai-curriculum.json','utf8')).find(c=>c.id==='strip-penetration');
const out='.qa/overnight-20261003/thinking-comparison';await mkdir(out,{recursive:true,mode:0o700});
for(const model of ['deepseek-flash','deepseek-v4-pro']){
 const provider=new ModelProvider({...cfg,model,maxTokens:8192},{fetchImpl:(url,options)=>{const b=JSON.parse(options.body);b.thinking={type:'enabled'};b.reasoning_effort='high';delete b.temperature;return secureProviderFetch(url,{...options,body:JSON.stringify(b)});}});
 const start=Date.now();try{
  const response=await provider.complete([{role:'system',content:systemPrompt('tutor')},{role:'user',content:contextText({mode:'tutor',prompt:'请给出结论与关键推导，并说明适用条件。',question:{title:fixture.title,sourceText:fixture.text,parts:[],review:'confirmed'},documents:{documents:[],images:[]}})}]);
  const result=parseAIResult(response.content);const report={model,thinking:'enabled',effort:'high',seconds:(Date.now()-start)/1000,usage:response.usage,result,expected:fixture.expected,requiresReview:true};
  await writeFile(out+'/'+model+'.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({model,seconds:report.seconds,usage:report.usage,status:result.status}));
 }catch(error){await writeFile(out+'/'+model+'.json',JSON.stringify({model,error:error.message}));console.log(JSON.stringify({model,error:error.message}));}
}
