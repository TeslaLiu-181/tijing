import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const result=await build({entryPoints:['src/example4/app.mjs'],bundle:true,write:false,format:'iife',target:'es2020',minify:true,legalComments:'inline'});
let mathCSS=readFileSync('node_modules/katex/dist/katex.min.css','utf8');
mathCSS=mathCSS.replace(/src:[^;}]+/g,rule=>{const font=rule.match(/url\(([^)]+\.woff2)\)/);return font?`src:url(data:font/woff2;base64,${readFileSync(resolve('node_modules/katex/dist',font[1])).toString('base64')}) format("woff2")`:rule;});
const licenses=['three','katex'].map(p=>readFileSync(`node_modules/${p}/LICENSE`,'utf8')).join('\n\n');
const html=readFileSync('src/example4/template.html','utf8').replace('/* MATH_STYLE */',()=>mathCSS).replace('/* STYLE */',()=>readFileSync('src/example4/style.css','utf8')).replace('/* APP */',()=>result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')).replace('LIBRARY_LICENSES',()=>licenses);
writeFileSync('例4空间组合场演示.html',html);
console.log(`Built 例4空间组合场演示.html (${Buffer.byteLength(html)} bytes; offline)`);
