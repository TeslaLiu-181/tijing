import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const result=await build({entryPoints:['src/guide-app.mjs'],bundle:true,write:false,format:'iife',target:'es2020',minify:true,legalComments:'inline'});
const template=readFileSync('src/guide-template.html','utf8');
const license=readFileSync('node_modules/three/LICENSE','utf8')+'\n\n'+readFileSync('node_modules/katex/LICENSE','utf8');
let mathCSS=readFileSync('node_modules/katex/dist/katex.min.css','utf8');
// Keep the modern WOFF2 face once; embedding all three font formats would triple
// the payload without helping the WebGL 2 browsers used by this application.
mathCSS=mathCSS.replace(/src:[^;}]+/g,declaration=>{
 const match=declaration.match(/url\(([^)]+\.woff2)\)/);if(!match)return declaration;
 const path=resolve('node_modules/katex/dist',match[1]);return `src:url(data:font/woff2;base64,${readFileSync(path).toString('base64')}) format("woff2")`;
});
const html=template.replace('/* INLINE_STYLE */',()=>readFileSync('src/guide-style.css','utf8'))
 .replace('/* MATH_STYLE */',()=>mathCSS)
 .replace('/* INLINE_APP */',()=>result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'))
 .replace('LIBRARY_LICENSES',()=>license);
writeFileSync('安培力三维实验室.html',html);
console.log(`Built standalone HTML: ${Buffer.byteLength(html).toLocaleString()} bytes (Three.js, KaTeX fonts and original figures embedded)`);
