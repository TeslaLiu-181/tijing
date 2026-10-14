import {marked} from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import {imageMime} from './model.mjs';

export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function markdown(text){
 const pieces=[];let source=String(text||'').replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\((.+?)\\\)|\$([^$\n]+)\$/g,(_whole,a,b,c,d)=>{const key='EXAMMATHTOKEN'+pieces.length+'END';pieces.push({key,html:katex.renderToString(a||b||c||d,{throwOnError:false,trust:false,displayMode:!!(a||b)})});return key;});
 let html=DOMPurify.sanitize(marked.parse(source,{gfm:true,breaks:true}),{FORBID_TAGS:['script','style','iframe','object','embed','img','form','button','input'],FORBID_ATTR:['style','srcdoc'],ALLOWED_URI_REGEXP:/^(?:(?:https?):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i});
 // KaTeX needs its generated positioning styles. Sanitize author markup first,
 // then insert math rendered with trust=false.
 for(const piece of pieces)html=html.replaceAll(piece.key,()=>piece.html);return html;
}
export function sourceView(paper,question){
 if(!question)return '<div class="empty-source">先导入试卷或新增题目。</div>';
 const images=question.attachments.map(a=>({...paper.assets[a.id],...a,url:paper.assets[a.id]?.url||paper.assets[a.id]?.displayURL})).filter(a=>imageMime.test(a.mime));
 const referenced=new Set(),answerImages=new Set();
 const withImages=(value,used)=>markdown(value).replace(/【图 ([a-zA-Z0-9_:-]+)】/g,(marker,sourceRef)=>{const asset=images.find(a=>a.sourceRef===sourceRef);if(!asset?.url)return marker;used.add(asset.id);return inlineImage(asset)||image(asset);});
 const text=withImages(question.sourceText||'尚未填写题干。',referenced),answer=withImages(question.referenceText||'',answerImages);
 const sourceIds=new Set((question.sourceAnchors||[]).map(a=>a.sourceId));if(question.sourceId)sourceIds.add(question.sourceId);
 const provenance=paper.sources.filter(s=>sourceIds.has(s.id)).map(s=>esc(s.title)).join('、');
 // Formula pictures in a reference answer belong inside its collapsed panel.
 // They must not leak into the stem as formerly "unreferenced" attachments.
 const extra=images.filter(a=>!referenced.has(a.id)&&!answerImages.has(a.id));
 return '<div class="source-heading"><span>原题与条件</span><button id="edit-question" title="编辑题目">编辑</button></div>'+(provenance?'<p class="provenance">'+provenance+'</p>':'')+'<div class="source-text">'+text+'</div>'+extra.filter(a=>a.role!=='reference').map(image).join('')+
  (question.parts.length?'<details class="source-parts"><summary>小问目录</summary>'+question.parts.map(p=>'<div>'+markdown(p)+'</div>').join('')+'</details>':'')+
  question.notes.map(n=>'<div class="source-note source-note-markdown">'+markdown(n.text)+'</div>').join('')+
  (question.referenceText?'<details class="answer-reference"><summary>参考解析 · 与题设分开保存</summary>'+answer+extra.filter(a=>a.role==='reference').map(image).join('')+'</details>':'')+
  '<label class="review-check"><input id="question-reviewed" type="checkbox" '+(question.review==='confirmed'?'checked':'')+'> 已对照原题校对题干、公式和题图</label>';
}
function displayDimension(value,max){return Number.isFinite(value)&&value>=1&&value<=max?Math.round(value*10)/10:null;}
function inlineImage(asset){
 const height=displayDimension(asset.displayHeight,120),width=displayDimension(asset.displayWidth,1600);
 if(asset.inline===true&&height&&width)return '<img class="source-inline-image" src="'+asset.url+'" style="height:'+height+'px;width:auto;max-width:100%;vertical-align:middle" alt="'+esc(asset.name)+'">';
 return asset.width<=80&&asset.height<=80?'<img class="source-symbol" src="'+asset.url+'" alt="原文图形符号">':'';
}
function image(asset){if(!asset.url)return '<p class="source-note">题图暂未加载：'+esc(asset.name)+'</p>';const width=displayDimension(asset.displayWidth,1600);return '<figure class="source-image"><img src="'+asset.url+'"'+(width?' width="'+width+'"':'')+' alt="'+esc(asset.name)+'"><figcaption>'+esc(asset.name)+(asset.page?' · 第'+asset.page+'页':'')+'</figcaption><div class="image-actions"><button data-crop="'+asset.id+'">裁题 / 裁图</button><button data-remove-image="'+asset.id+'">移除本题配图</button></div></figure>';}
