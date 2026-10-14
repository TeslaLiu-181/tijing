import {createHash} from 'node:crypto';
import {paperContentKey} from '../../src/exam/paper-content.mjs';

export function paperContentFingerprint(paper){
 return {version:'paper-content/1',sha256:createHash('sha256').update(paperContentKey(paper)).digest('hex')};
}
