import katex from 'katex';
import source from './guide-source.json' with {type:'json'};

const greek={α:'alpha',β:'beta',γ:'gamma',θ:'theta',φ:'varphi',μ:'mu',τ:'tau',π:'pi',ω:'omega',Ω:'Omega',Δ:'Delta'};
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function normalizeTex(value){
 let t=String(value).replace(/[αβγθφμτπωΩΔ]/g,c=>'\\'+greek[c]+' ').replace(/°/g,String.raw`^{\circ}`).replace(/·/g,String.raw`\cdot `).replace(/＝/g,'=');
 // OMML text runs sometimes contain literal function names and Chinese force indices.
 t=t.replace(/(?<![A-Za-z\\])(sin|cos|tan)(?=[^A-Za-z]|$)/g,'\\$1 ').replace(/(?<=[A-Za-z])(sin|cos|tan)/g,'\\$1 ');
 t=t.replace(/([\u4e00-\u9fff]+)/g,(m,_,offset)=>{
  const prefix=t.slice(0,offset);return /\\(?:mathrm|text)\{[^}]*$/.test(prefix)?m:String.raw`\text{${m}}`;
 });
 return t.replace(/，/g,',\\;').trim();
}
export const mathErrors=[];
export function tex(value,display=false){
 const normalized=normalizeTex(value);
 try{return katex.renderToString(normalized,{displayMode:display,throwOnError:true,strict:'ignore',trust:false,output:'htmlAndMathml'});}
 catch(e){mathErrors.push({value,message:e.message});return `<span class="math-error" title="公式渲染失败">${esc(value)}</span>`;}
}
export function numberTex(value,digits=3){
 if(!Number.isFinite(value))return String.raw`\text{无有限值}`;
 const n=Math.abs(value)<1e-9?0:value;
 return Number(n.toPrecision(digits)).toString();
}
// Convert inline symbols from the original Word text without discarding its prose.
// Full OMML fractions and roots are handled structurally by extract-guide.py.
export function prose(text){
 if(!text)return '';
 const normalized=String(text).replace(/₀/g,'_0').replace(/₁/g,'_1').replace(/₂/g,'_2').replace(/′/g,"'").replace(/F安/g,'F_{安}');
 const pattern=/[A-Za-zαβγθφμτπωΩΔ0-9](?:[A-Za-zαβγθφμτπωΩΔ0-9_'′^=+\-<>×/().\s°·]|\{[A-Za-zαβγθφμτπωΩΔ0-9+\-\u4e00-\u9fff]+\})*/g;
 let result='',last=0;
 for(const match of normalized.matchAll(pattern)){
  const start=match.index,raw=match[0];
  // Periods in Chinese multiple-choice labels stay prose; variables and units are math.
  if(/^[ABCD]\.$/.test(raw.trim())){result+=esc(normalized.slice(last,start)+raw);last=start+raw.length;continue;}
  let content=raw.trimEnd();
  let tail='';while(/[.,]$/.test(content)){tail=content.slice(-1)+tail;content=content.slice(0,-1);}
  content=content.replace(/m\/s(?:2|\^\{2\}|\^2)/g,String.raw`\mathrm{m\,s^{-2}}`).replace(/m\/s/g,String.raw`\mathrm{m\,s^{-1}}`)
   .replace(/\bkg\b/g,String.raw`\mathrm{kg}`).replace(/(?<=\d)\s*(T|A|V|N|m|s)\b/g,(_,u)=>String.raw`\,\mathrm{${u}}`)
   .replace(/([A-Za-z])([0-9])(?![0-9.])/g,'$1_$2');
  if(!content){result+=esc(normalized.slice(last,start)+raw);last=start+raw.length;continue;}
  result+=esc(normalized.slice(last,start))+tex(content)+esc(tail+raw.slice(raw.trimEnd().length));last=start+raw.length;
 }
 return result+esc(normalized.slice(last));
}
export function sourceParagraph(index){
 const p=source.paragraphs.find(p=>p.index===index);if(!p)return '';
 let result='',plain='';
 const flush=()=>{result+=prose(plain);plain='';};
 for(const segment of p.segments){
  if(segment.math!==undefined){flush();result+=tex(segment.math);}
  else if(segment.align){plain+=(segment.align==='superscript'?'^':'_')+'{'+segment.text+'}';}
  else plain+=segment.text;
 }
 flush();return result;
}
export const sourceFigure=id=>source.images[id];
export const sourceInfo={name:source.source,sha256:source.sha256};
