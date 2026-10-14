import katex from 'katex';
export function tex(code,display=false){return katex.renderToString(String(code),{displayMode:display,throwOnError:true,strict:'ignore',trust:false});}
export function num(value,digits=3){
 if(value===null||!Number.isFinite(value))return '\\text{—}';
 if(value===0)return '0';
 const v=Number(value.toPrecision(digits));
 if(Math.abs(v)>=1e4||Math.abs(v)<.001){const [a,b]=v.toExponential(digits-1).split('e');return `${Number(a)}\\times10^{${Number(b)}}`;}
 return String(v);
}
export const quantity=(v,unit,digits=3)=>v===null?num(v):`${num(v,digits)}${unit?.startsWith('10^5')?'\\times10^5\\,\\mathrm{m\\,s^{-1}}':unit?'\\,\\mathrm{'+unit+'}':''}`;
