import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const result=await build({entryPoints:['src/lorentz-app.mjs'],bundle:true,write:false,format:'iife',target:'es2020',minify:true,legalComments:'inline'});
let mathCSS=readFileSync('node_modules/katex/dist/katex.min.css','utf8');
mathCSS=mathCSS.replace(/src:[^;}]+/g,d=>{const m=d.match(/url\(([^)]+\.woff2)\)/);return m?`src:url(data:font/woff2;base64,${readFileSync(resolve('node_modules/katex/dist',m[1])).toString('base64')}) format("woff2")`:d;});
const licenses=['three','katex'].map(p=>readFileSync(`node_modules/${p}/LICENSE`,'utf8')).join('\n\n');
const html=readFileSync('src/lorentz-template.html','utf8').replace('/* MATH_STYLE */',()=>mathCSS).replace('/* INLINE_STYLE */',()=>readFileSync('src/lorentz-style.css','utf8')).replace('/* INLINE_APP */',()=>result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')).replace('LIBRARY_LICENSES',()=>licenses);
writeFileSync('洛伦兹力实验室.html',html);console.log(`Built 洛伦兹力实验室.html (${Buffer.byteLength(html).toLocaleString()} bytes; offline Three.js and KaTeX fonts)`);
