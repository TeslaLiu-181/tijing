import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import katex from 'katex';
const root=resolve('.qa/holiday-20261006'),sources=JSON.parse(await readFile(join(root,'sources.json'),'utf8'));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const all=[];
for(const source of sources){
 const parsed=JSON.parse(await readFile(join(source.dir,'paragraphs.json'),'utf8'));
 const numbering=JSON.parse(await readFile(join(source.dir,'numbering.json'),'utf8'));
 for(const [index,prefix] of Object.entries(numbering))parsed[Number(index)].text=prefix+parsed[Number(index)].text;
 const sizes=JSON.parse(await readFile(join(source.dir,'image-sizes.json'),'utf8'));
 const candidates=JSON.parse(await readFile(join(source.dir,'candidates.json'),'utf8'));
 if(candidates.length!==24)throw Error('Expected twelve stems and twelve answer sections');
 const questions=[];
 for(let i=0;i<12;i++){
  let stem=candidates[i].paragraphIndices.map(index=>parsed[index]).filter(p=>p.text);
  const cutoff=stem.findIndex((p,i)=>i>0&&(/^(题号|二、|三、)/.test(p.text)||/(?:参考答案|答案解析|答案与解析)/.test(p.text)));
  if(cutoff>=0)stem=stem.slice(0,cutoff);
  const reference=candidates[i+12].paragraphIndices.map(index=>parsed[index]).filter(p=>p.text);
  const text=stem.map(p=>p.text).join('\n\n'),referenceText=reference.map(p=>p.text).join('\n\n');
  const imageIds=[...new Set([...stem,...reference].flatMap(p=>p.images))],images={};
  for(const id of imageIds){const bytes=await readFile(join(source.dir,'media',id+'.png'));const info=await sharp(bytes).metadata();images[id]={width:info.width,height:info.height,display:sizes[id],url:'data:image/png;base64,'+bytes.toString('base64')};}
  const q={paper:source.number,number:i+1,title:candidates[i].title,text,referenceText,sourceParagraphs:stem.map(p=>p.index),referenceParagraphs:reference.map(p=>p.index),images};
  questions.push(q);all.push(q);
 }
 await writeFile(join(source.dir,'paired.json'),JSON.stringify(questions,null,2));
 await writeFile(join(source.dir,'paired.txt'),questions.map(q=>`=== 作业${q.paper} 第${q.number}题 ===\n${q.text}\n\n【原参考解析】\n${q.referenceText}\n`).join('\n'));
}
function format(text,q){
 let body=esc(text).replace(/\$([^$\n]+)\$/g,(_,formula)=>katex.renderToString(formula.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&').replaceAll('&#39;',String.fromCharCode(39)).replaceAll('&quot;',String.fromCharCode(34)),{throwOnError:false}));
 body=body.replace(/【图 ([a-zA-Z0-9_-]+)】/g,(_,id)=>{const a=q.images[id];if(!a)return _;const inline=a.display?.formula??false;return `<img class="${inline?'formula':'figure'}" src="${a.url}" title="${id} ${a.width}×${a.height}" style="max-width:100%;${inline?'height:'+Math.round(a.display.height*1.35)+'px':'width:'+Math.round((a.display?.width||a.width)*1.5)+'px'}" alt="${id}">`;});
 return body.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
}
const css=await readFile('node_modules/katex/dist/katex.min.css','utf8');
await mkdir(join(root,'review'),{recursive:true});
for(const q of all){const name=`p${q.paper}-q${q.number}.html`;await writeFile(join(root,'review',name),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>作业${q.paper} 第${q.number}题 原文核对</title><style>${css}\nbody{font:20px/1.65 'Microsoft YaHei',sans-serif;color:#183c40;background:#eef5f4;margin:0;padding:28px}header{font-size:24px;margin-bottom:18px}main{display:grid;grid-template-columns:1fr 1fr;gap:24px}article{background:#fff;border-radius:14px;padding:24px;min-width:0}h2{font-size:20px}p{margin:12px 0}img.formula{vertical-align:middle;display:inline-block}img.figure{display:block;margin:12px auto;max-height:390px}.katex{font-size:1.07em}a{color:#07655e}</style><header>假期作业${q.paper} · 第${q.number}题　<a href="index.html">全部题目</a></header><main><article><h2>原题</h2><p>${format(q.text,q)}</p></article><article><h2>原参考解析</h2><p>${format(q.referenceText,q)}</p></article></main></html>`);}
await writeFile(join(root,'review','index.html'),`<!doctype html><meta charset="utf-8"><title>假期作业原文核对</title><style>body{font:22px/2.4 'Microsoft YaHei';padding:40px}section{margin:20px}a{display:inline-block;margin:8px}</style>${sources.map(s=>`<section><b>作业${s.number}</b> ${all.filter(q=>q.paper===s.number).map(q=>`<a href="p${q.paper}-q${q.number}.html">${q.number}</a>`).join('')}</section>`).join('')}`);
console.log(JSON.stringify({papers:sources.length,questions:all.length,output:join(root,'review')},null,2));
