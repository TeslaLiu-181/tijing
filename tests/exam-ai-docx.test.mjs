import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {zipSync,strToU8} from 'fflate';
import {extractAIDocx,AI_DOCX_LIMITS} from '../server/exam/ai-docx.mjs';
import {readAIDocuments} from '../server/exam/ai-documents.mjs';
const paragraph='<w:p><w:pPr><w:pStyle w:val="Normal"/><w:keepNext/><w:spacing w:before="0" w:after="160" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="SimSun" w:cs="Times New Roman"/><w:b/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN" w:bidi="ar-SA"/></w:rPr><w:t>m=1kg.</w:t></w:r></w:p>';
function synthetic(bytes){
 const prefix='<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',suffix='</w:body></w:document>';
 const count=Math.max(1,Math.floor((bytes-prefix.length-suffix.length)/paragraph.length));
 const zip=zipSync({'word/document.xml':strToU8(prefix+paragraph.repeat(count)+suffix)},{level:0});
 return {count,zip,input:{filename:'synthetic.docx',data:Buffer.from(zip).toString('base64')}};
}
test('AI DOCX worker preserves the accepted 2MB source while HTTP timers remain responsive',async()=>{
 const sample=synthetic(2*1024*1024),expected=Array(sample.count).fill('m=1kg.').join('\n\n');
 assert.equal(expected.length,40518);
 let ticks=0;const timer=setInterval(()=>ticks++,10);
 try{const result=await readAIDocuments([sample.input]);assert.equal(result.documents[0].text,expected);assert.equal(result.images.length,0);assert(ticks>=5,'synchronous DOM parsing must not occupy HTTP event loop');}
 finally{clearInterval(timer);}
});
test('AI DOCX cancellation interrupts an in-flight parse and settles promptly after worker termination',async()=>{
 const sample=synthetic(4*1024*1024),controller=new AbortController(),start=performance.now();
 const timer=setTimeout(()=>controller.abort(),150);
 try{await assert.rejects(()=>extractAIDocx(sample.zip,{signal:controller.signal}),error=>error.code==='ai_cancelled');
  assert(performance.now()-start<2000,'cancellation must not wait for the multi-second full parse');}
 finally{clearTimeout(timer);}
 const stopped=new AbortController();stopped.abort();await assert.rejects(()=>extractAIDocx(sample.zip,{signal:stopped.signal}),error=>error.code==='ai_cancelled');
});
test('AI DOCX XML complexity cap and timeout return controlled errors without parsing unrestricted DOMs',async()=>{
 const large=synthetic(AI_DOCX_LIMITS.xmlBytes+1024*1024);
 await assert.rejects(()=>extractAIDocx(large.zip),error=>error.status===413&&error.code==='ai_docx_complexity');
 const sample=synthetic(2*1024*1024);
 await assert.rejects(()=>extractAIDocx(sample.zip,{timeoutMs:1}),error=>error.code==='ai_docx_timeout');
 const invalid=zipSync({'word/document.xml':strToU8('<!DOCTYPE SECRET-DOCUMENT-CONTENT><w:document/>')});
 await assert.rejects(()=>extractAIDocx(invalid),error=>error.code==='ai_document_invalid'&&!error.message.includes('SECRET-DOCUMENT-CONTENT'));
});
