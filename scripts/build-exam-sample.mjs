import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createGettingStartedPaper} from '../examples/getting-started.mjs';
import {exportResource} from '../src/exam/resources.mjs';

const out=resolve('dist/exam'),paper=createGettingStartedPaper();
await mkdir(out,{recursive:true});
await writeFile(join(out,'sample.tijingexam'),exportResource(paper,{includeOriginals:false}));
await writeFile(join(out,'sample.json'),JSON.stringify(paper,null,2)+'\n');
console.log('Built public getting-started sample: 3 questions / 3 scenes / no attachments');
