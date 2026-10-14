import {parentPort,workerData} from 'node:worker_threads';
import {extractDocx} from '../../src/exam/docx-parser.mjs';

try {
  const result=extractDocx(workerData.data,workerData.limits);
  const buffers=[...new Set([...result.media.values()].map(item=>item.data.buffer))];
  parentPort.postMessage({ok:true,result},buffers);
} catch(error) {
  const limited=['docx_expanded_limit','docx_xml_limit'].includes(error.code);
  // Parser diagnostics can contain document text. Return only controlled messages.
  parentPort.postMessage({ok:false,code:limited?error.code:'docx_invalid',
    message:limited?error.message:'Word 正文或结构无法读取，请检查文件或重新导出 DOCX。'});
}
