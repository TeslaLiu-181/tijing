import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {nativeScenes} from './native-scenes.mjs';
import {runAgentTool} from '../../server/exam/ai-agent-tools.mjs';
import {auditSceneSync} from '../../server/exam/ai-harness.mjs';
import {solveScene,atTime,norm,E} from '../../src/planar-physics.mjs';
import {resolveScene,createResolver} from '../../src/planar-relations.mjs';
import {toNative} from '../../src/planar-expressions.mjs';
import katex from 'katex';
import {answerOverrides} from './answers.mjs';

const out=resolve('.qa/holiday-20261006/native');await mkdir(out,{recursive:true});
const schema=await runAgentTool('scene_schema',{},{});await writeFile(out+'/schema.json',JSON.stringify(schema,null,2));
let formulaCount=0;
for(const [key,text] of Object.entries(answerOverrides)){
 if(/[\u0000-\u0008\u000b-\u001f]/.test(text))throw Error('Unexpected text control character in '+key);
 for(const match of text.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g)){
  const formula=match[1]||match[2];if(/(?<!\\)(?:dfrac|sqrt|mathrm|qquad|omega|theta|circ)/.test(formula))throw Error('Lost TeX escape in '+key);
  katex.renderToString(formula,{throwOnError:true,strict:false});formulaCount++;
 }
}
const scenes=nativeScenes(),reports=[];
for(const item of scenes){
 const scene=item.record.snapshot.scene,resolved=resolveScene(scene),traces=solveScene(resolved.scene);
 const audit=auditSceneSync(scene,[],{source:true});
 const segmentChecks={segments:0,maxEnergyRelativeResidual:0,passed:true};
 for(const trace of traces)for(const segment of trace.segments){
  const initial=segment.m*norm(segment.v)**2/2,final=segment.m*norm(segment.v1)**2/2;
  const work=segment.q*((segment.electric?.[0]||0)*(segment.p1[0]-segment.p[0])+(segment.electric?.[1]||0)*(segment.p1[1]-segment.p[1]));
  const residual=Math.abs(final-initial-work)/Math.max(initial,final,Math.abs(work),1e-30);
  segmentChecks.segments++;segmentChecks.maxEnergyRelativeResidual=Math.max(segmentChecks.maxEnergyRelativeResidual,residual);
  if(![...segment.p,...segment.p1,...segment.v,...segment.v1,segment.dt,residual].every(Number.isFinite)||residual>2e-7)segmentChecks.passed=false;
 }
 const checks=item.expectations.map(expect=>{const trace=traces.find(t=>t.particle.traceId===expect.traceId),s=trace&&atTime(trace,expect.timeUs*1e-6);const actual=s?{xCm:s.p[0]*100,yCm:s.p[1]*100,vxMs:s.v[0],vyMs:s.v[1],speedMs:norm(s.v),kineticEV:s.segment.m*norm(s.v)**2/(2*E)}:{};const differences=Object.entries(expect.values).map(([key,target])=>{const scale=target===0&&['vxMs','vyMs'].includes(key)?Math.max(1,actual.speedMs):Math.max(1,Math.abs(target));return {key,target,actual:actual[key],error:Math.abs(actual[key]-target),scale,pass:Number.isFinite(actual[key])&&Math.abs(actual[key]-target)<=expect.tolerance*scale};});return {...expect,pass:differences.every(d=>d.pass),differences};});
 const motions=[];
 for(const trace of traces){
  const wanted=item.expectations.filter(e=>e.traceId===trace.particle.traceId).map(e=>e.timeUs),times=[0,...wanted,scene.duration/2,scene.duration].filter((t,i,a)=>a.findIndex(x=>Math.abs(x-t)<1e-12)===i).sort((a,b)=>a-b).slice(0,24);
  motions.push(await runAgentTool('query_motion',{traceId:trace.particle.traceId,timesUs:times,side:'after'},{record:item.record,mode:'scene'}));
 }
 const geometryChecks=[];for(const check of item.geometryExpectations||[]){const actual=toNative(createResolver(scene).evaluate(check.expression),check.unit),native=await runAgentTool('evaluate_relation',{expression:check.expression},{record:item.record,mode:'scene'});geometryChecks.push({...check,actual,native,pass:Math.abs(actual-check.expected)<=1e-9*Math.max(1,Math.abs(check.expected))});}
 const events=traces.length?await runAgentTool('query_events',{startUs:0,endUs:scene.duration},{record:item.record,mode:'scene'}):null;
 const report={paper:item.paper,question:item.question,key:item.key,title:item.record.title,objects:scene.objects.length,traceCount:traces.length,durationUs:scene.duration,checks,geometryChecks,segmentChecks,motions,events,harness:audit.harness,passed:audit.harness.passed&&segmentChecks.passed&&checks.every(c=>c.pass)&&geometryChecks.every(c=>c.pass)&&motions.every(m=>!m.truncated&&m.readings.every(r=>r.available))};
 reports.push(report);
 console.log(JSON.stringify({paper:item.paper,q:item.question,key:item.key,traces:traces.length,passed:report.passed,warnings:audit.harness.warnings,failures:checks.filter(c=>!c.pass)}));
 await writeFile(out+'/'+item.record.id+'.json',JSON.stringify(report,null,2));
}
await writeFile(out+'/scenes.json',JSON.stringify(scenes,null,2));
await writeFile(out+'/report.json',JSON.stringify({createdAt:new Date().toISOString(),scenes:reports.length,traces:reports.reduce((n,r)=>n+r.traceCount,0),passed:reports.every(r=>r.passed),reports:reports.map(({motions,events,harness,...r})=>({...r,warnings:harness.warnings,violations:harness.violations}))},null,2));
console.log('SUMMARY '+JSON.stringify({scenes:reports.length,traces:reports.reduce((n,r)=>n+r.traceCount,0),segments:reports.reduce((n,r)=>n+r.segmentChecks.segments,0),formulaCount,passed:reports.filter(r=>r.passed).length}));
if(reports.some(r=>!r.passed))process.exitCode=1;
