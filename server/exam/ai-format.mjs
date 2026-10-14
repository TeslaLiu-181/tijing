// Repair only recognizable JSON escape damage inside an explicit math span.
// This restores notation, never inserts an unrecognized formula or condition.
const commands=[
 [String.fromCharCode(12)+'rac','\\frac'],[String.fromCharCode(8)+'egin','\\begin'],[String.fromCharCode(8)+'eta','\\beta'],
 [String.fromCharCode(8)+'ar','\\bar'],[String.fromCharCode(9)+'heta','\\theta'],[String.fromCharCode(9)+'imes','\\times'],
 [String.fromCharCode(9)+'ext','\\text'],[String.fromCharCode(9)+'an','\\tan'],[String.fromCharCode(13)+'ight','\\right'],
 [String.fromCharCode(13)+'ho','\\rho'],[String.fromCharCode(10)+'u','\\nu']
];
export function repairMathEscapes(text){
 const warnings=[];let repaired=0;
 const output=String(text).replace(/\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)[^$]*?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g,span=>{
  for(const [broken,correct] of commands) {
   // Ensure the damaged command ends where a LaTeX command could end.
   let index=span.indexOf(broken);
   while(index>=0) {
    const next=span[index+broken.length];
    if(!next||!/[A-Za-z]/.test(next)){span=span.slice(0,index)+correct+span.slice(index+broken.length);repaired++;index=span.indexOf(broken,index+correct.length);}
    else index=span.indexOf(broken,index+broken.length);
   }
  }
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(span))warnings.push('数学区块仍包含无法安全修复的控制字符，请对照原稿或重新生成。');
  return span;
 });
 if(repaired)warnings.unshift('已修复 '+repaired+' 处数学区块中的 JSON 转义损坏；仅恢复明确的 LaTeX 命令。');
 return {text:output,warnings,repaired};
}
export function repairResultMath(result){
 const warnings=[];
 for(const key of ['answer','nextStep','question'])if(typeof result[key]==='string'){const fixed=repairMathEscapes(result[key]);result[key]=fixed.text;warnings.push(...fixed.warnings);}
 for(const key of ['givens','assumptions','missing','followUps'])if(Array.isArray(result[key]))result[key]=result[key].map(text=>{const fixed=repairMathEscapes(text);warnings.push(...fixed.warnings);return fixed.text;});
 for(const question of result.questions||[]){const fixed=repairMathEscapes(question.sourceText);question.sourceText=fixed.text;warnings.push(...fixed.warnings);}
 result.formatWarnings=[...new Set(warnings)];return result;
}
