import test from 'node:test';import assert from 'node:assert/strict';
import {formulaPrompt,parseFormulaResult,recognizeHandwrittenFormula} from '../server/exam/ai-formula.mjs';
const answer=()=>({status:'answer',latex:'r=\\frac{m v}{|q|B}',variables:[{symbol:'r',meaning:'左侧变量'},{symbol:'m',meaning:'图中变量m'}],ambiguities:[],warnings:['仅转录，未验证物理正确性']});
test('handwritten result preserves formula/variables, never claims physical proof and uses real markdown lines',()=>{
 const value=parseFormulaResult(JSON.stringify({...answer(),confidence:1,verified:true}));
 assert.equal(value.formula.latex,answer().latex);assert.equal(value.verification,'handwriting-transcription-only');assert(value.formula.requiresConfirmation);
 assert(!Object.hasOwn(value,'confidence'));assert(!Object.hasOwn(value,'verified'));assert(value.answer.includes('\n$$\n'));assert(formulaPrompt().includes('\n'));assert(!formulaPrompt().includes('\\n'));
});
test('ambiguity cannot be promoted to clear answer; missing formula stays awaiting confirmation',()=>{
 const value=parseFormulaResult({...answer(),ambiguities:[{description:'可能是l或1',alternatives:['l','1']}]});assert.equal(value.status,'needs_confirmation');assert.equal(value.formula.ambiguities[0].id,'ambiguity-0');
 const missing=parseFormulaResult({...answer(),status:'needs_confirmation',latex:''});assert.equal(missing.status,'needs_confirmation');
});
test('malformed structures, unsafe latex and excessive fields are rejected rather than silently repaired',()=>{
 for(const value of ['not JSON',{...answer(),latex:'\\href{https://evil.invalid}{x}'},{...answer(),variables:[{symbol:'x',meaning:'ok'}].concat(Array(51).fill({symbol:'y',meaning:''}))},{...answer(),status:'done'},{...answer(),ambiguities:[{description:'?',alternatives:'bad'}]}])assert.throws(()=>parseFormulaResult(value),e=>e.status===502);
});
test('existing provider receives only explicitly supplied PNG, and parse failure retains known usage',async()=>{
 const calls=[],provider={complete:async(messages,options)=>{calls.push({messages,options});return {content:JSON.stringify(answer()),model:'synthetic-vision',usage:{totalTokens:12},usageKnown:true};}};
 const output=await recognizeHandwrittenFormula(provider,{image:{url:'data:image/png;base64,c3ludGhldGlj'}});assert.equal(output.result.formula.latex,answer().latex);assert.equal(calls.length,1);assert(calls[0].options.images);assert.equal(calls[0].options.task,'formula');assert.equal(calls[0].messages[1].content.length,2);assert.equal(calls[0].messages[1].content[1].image_url.url,'data:image/png;base64,c3ludGhldGlj');
 await assert.rejects(recognizeHandwrittenFormula({complete:async()=>({content:'invalid',model:'synthetic-vision',usage:{totalTokens:13},usageKnown:true})},{image:{url:'data:image/png;base64,c3ludGhldGlj'}}),e=>e.usage.totalTokens===13&&e.usageKnown===true&&e.model==='synthetic-vision');
});
