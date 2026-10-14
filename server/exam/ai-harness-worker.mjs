import {parentPort,workerData} from 'node:worker_threads';
import {auditSceneSync} from './ai-harness.mjs';
try{parentPort.postMessage({ok:true,result:auditSceneSync(workerData.input,workerData.checks,workerData.options)});}
catch(error){parentPort.postMessage({ok:false,error:error.message});}
