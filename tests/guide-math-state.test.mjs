import {test} from 'node:test';
import assert from 'node:assert/strict';
import {topics,initialParameters,parameterOf} from '../src/guide-curriculum.mjs';
import {tex,sourceParagraph,mathErrors} from '../src/guide-math.mjs';
import {encodeState,decodeState} from '../src/guide-state.mjs';

test('every original paragraph and authored formula renders, including source superscripts',()=>{
 for(let i=1;i<=195;i++)sourceParagraph(i);
 for(const topic of topics){for(const q of topic.questions)for(const step of q.steps)if(step.tex)tex(step.tex);for(const key of topic.controls){const d=parameterOf(topic,key);tex(d.tex);if(d.unit)tex(d.unit);}}
 assert.deepEqual(mathErrors,[]);
 const example1=sourceParagraph(15);assert.ok(example1.includes('s^{-2}'));assert.ok(!example1.includes('s^{-1}'));
 assert.ok(sourceParagraph(187).includes('\\sqrt'));
});
const camera={projection:'ortho',view:'source',position:[3,4,8],target:[0,0,0],up:[0,1,0],zoom:1,focused:false};
test('all topic/question states round trip with whitelisted parameters',()=>{
 for(const topic of topics)for(let question=0;question<topic.questions.length;question++){
  const state={topic,question,mode:'explore',params:initialParameters(topic,question),part:0};
  const result=decodeState(JSON.parse(JSON.stringify(encodeState(state,camera))));
  assert.equal(result.topic.id,topic.id);assert.equal(result.question,question);assert.deepEqual(result.params,state.params);assert.deepEqual(result.camera,camera);
 }
});
test('invalid imports fail without mutating an existing state',()=>{
 const state={topic:topics[0],question:0,mode:'explore',params:initialParameters(topics[0]),part:0};
 const encoded=encodeState(state,camera),before=JSON.stringify(state.params);
 for(const change of [x=>x.version=99,x=>x.topic='missing',x=>x.params.B=Infinity,x=>x.params.G=-10,x=>x.camera.zoom=0,x=>x.camera.up=[0,0,0],x=>x.part=500]){
  const bad=structuredClone(encoded);change(bad);assert.throws(()=>decodeState(bad));
 }
 assert.equal(JSON.stringify(state.params),before);
});
test('lesson reload uses the original key state rather than an exploratory answer mismatch',()=>{
 const topic=topics.find(t=>t.id==='example-1'),state={topic,question:1,mode:'lesson',params:{...initialParameters(topic,1),B:1.4},part:0};
 const result=decodeState(encodeState(state,camera));assert.equal(result.params.B,1);assert.equal(result.params.theta,53);
});
