import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {extractDocx,splitQuestions} from '../../src/exam/documents.mjs';
const sourceArg=process.argv.find(value=>value.startsWith('--source-dir='));
if(!sourceArg)throw Error('请传入 --source-dir=你的已授权DOCX目录；使用流程见 teaching/README.md');
const source=resolve(sourceArg.slice('--source-dir='.length));
const root=resolve('.qa/holiday-20261006');
const inventory=[];
for(const name of (await readdir(source)).filter(n=>n.endsWith('.docx'))){
 const number=Number(name.match(/作业\s*(\d+)/)?.[1]);
 const dir=join(root,'source-'+number);await mkdir(join(dir,'media'),{recursive:true});
 const bytes=await readFile(join(source,name)),parsed=extractDocx(bytes);
 const media=[];
 for(const [id,item] of parsed.media){await writeFile(join(dir,'media',id+item.extension),item.data);media.push({id,path:item.path,extension:item.extension,bytes:item.data.length});}
 await writeFile(join(dir,'paragraphs.json'),JSON.stringify(parsed.paragraphs,null,2));
 await writeFile(join(dir,'source.txt'),parsed.paragraphs.map(p=>`[${p.index}] ${p.text}`).join('\n\n'));
 const candidates=splitQuestions(parsed.paragraphs,{fallbackTitle:name});
 await writeFile(join(dir,'candidates.json'),JSON.stringify(candidates,null,2));
 inventory.push({number,name,sha256:createHash('sha256').update(bytes).digest('hex'),paragraphs:parsed.paragraphs.length,media:media.length,mediaTypes:[...new Set(media.map(m=>m.extension))],candidates:candidates.map(c=>({title:c.title,paragraphs:c.paragraphIndices.length,referenceLength:c.referenceText.length})),dir});
}
inventory.sort((a,b)=>a.number-b.number);
await writeFile(join(root,'sources.json'),JSON.stringify(inventory,null,2));
console.log(JSON.stringify(inventory.map(({number,name,paragraphs,media,candidates})=>({number,name,paragraphs,media,sections:candidates.length})),null,2));
