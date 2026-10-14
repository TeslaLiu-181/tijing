import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const result=await build({entryPoints:['src/supplement/app.mjs'],bundle:true,write:false,format:'iife',target:'chrome120',minify:true,legalComments:'inline'});
let math=await readFile('node_modules/katex/dist/katex.min.css','utf8');
for(const font of [...math.matchAll(/url\(([^)]+\.woff2)\)/g)])math=math.replaceAll(font[0],'url(data:font/woff2;base64,'+(await readFile(resolve('node_modules/katex/dist',font[1]))).toString('base64')+')');
const readStyle=await readFile('src/supplement/style.css','utf8');
const html=(await readFile('src/supplement/template.html','utf8')).replace('/* MATH_STYLE */',()=>math).replace('/* STYLE */',()=>readStyle).replace('/* APP */',()=>result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
await mkdir('dist/exam',{recursive:true});await writeFile('dist/exam/supplement.html',html);console.log('Built trusted physics supplement runtime');
