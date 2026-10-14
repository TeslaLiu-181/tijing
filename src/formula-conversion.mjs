import {convertLatexToAsciiMath,validateLatex} from 'mathlive/ssr';
import {parseExpression,printExpression,expressionTex,isConstant,units} from './planar-expressions.mjs';

/** Only notation conversion. Physics, dimensions and cycles remain native checks. */
const FUNCTIONS=new Set(['sqrt','abs','sin','cos','tan','asin','acos','atan','exp','ln','log','floor','ceil','round','atan2','min','max','pow','point','polar','pos','center','vertex','edge','end','mid','line','segment','ray','circle','circumcenter','circleThrough','intersect','on','foot','bearing','distance','length','dot','parallel','perp','vector','unit','rotate','orbitSpeed','orbitRadius','area','perimeter']);
const unsafe=/\\(?:href|url|html\w*|class|style|includegraphics|input|include|write|openout|def|gdef|edef|newcommand|renewcommand|require|cssId|unicode)\b/i;
const escapeRE=s=>s.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
const children=node=>node.type==='binary'?[node.a,node.b]:node.type==='unary'?[node.arg]:node.type==='call'?node.args:[];
function visit(node,fn){fn(node);for(const child of children(node))visit(child,fn);}
export function validateFormulaLatex(value,{maxLength=8000}={}){
 if(typeof value!=='string'||!value.trim()||value.length>maxLength)throw Error('请输入完整公式（最多'+maxLength+'字符）。');
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||unsafe.test(value))throw Error('公式含有不能使用的控制命令。');
 const errors=validateLatex(value);if(errors.length)throw Error('公式结构待检查：'+(errors[0].code||errors[0].message||'括号或命令不完整'));
 return value.trim();
}
function protectedReplace(text,needle,replacement){
 if(!needle)return text;
 const pattern=escapeRE(needle).replace(/\\ /g,'\\s*').replace(/ /g,'\\s*');
 const functionCall=FUNCTIONS.has(needle.replace(/\s/g,''))?'(?!\\s*\\()':'';
 return text.replace(new RegExp('(?<![A-Za-z_])'+pattern+'(?![A-Za-z_0-9])'+functionCall,'g'),replacement);
}
function normalizeFunctions(ascii){
 // Join ASCIIMath's letter-by-letter operator names before binding variables:
 // a parameter n must not consume the n in min, unit or circumcenter.
 for(const name of [...FUNCTIONS].sort((a,b)=>b.length-a.length)){
  const letters=[...name].map(escapeRE).join('\\s*');
  ascii=ascii.replace(new RegExp('(?<![A-Za-z_0-9])'+letters+'(?=\\s*\\()','g'),name);
 }
 return ascii;
}
function groups(text,start){
 if(text[start]!=='(')throw Error('根式或函数的括号不完整。');let depth=1,end=start+1;
 for(;end<text.length&&depth;end++){if(text[end]==='(')depth++;if(text[end]===')')depth--;}
 if(depth)throw Error('公式括号不完整。');return {inside:text.slice(start+1,end-1),end};
}
function normalizeASCII(text){
 // MathLive preserves a root's degree, rather than reducing it to a decimal.
 let out='',i=0;
 while(i<text.length){
  if(text.startsWith('root(',i)){const degree=groups(text,i+4),base=groups(text,degree.end);out+='pow(('+normalizeASCII(base.inside)+'), (1 / ('+normalizeASCII(degree.inside)+')))';i=base.end;continue;}
  out+=text[i++];
 }
 const stack=[];let result='';
 for(let n=0;n<out.length;n++){
  if(out[n]!=='|'){result+=out[n];continue;}
  const previous=out.slice(0,n).trimEnd().at(-1),opening=!previous||/[+\-*/^(=,]/.test(previous);
  if(opening||!stack.length){stack.push(n);result+='abs(';}else{stack.pop();result+=')';}
 }
 if(stack.length)throw Error('绝对值竖线尚未配对。');
 return result.replace(/([A-Za-z][A-Za-z0-9]*)_\((\d+|[A-Za-z][A-Za-z0-9]*)\)/g,'$1_$2').replace(/\bln\b/g,'ln');
}
function mapAST(node,fn){
 if(node.type==='binary')return fn({...node,a:mapAST(node.a,fn),b:mapAST(node.b,fn)});
 if(node.type==='unary')return fn({...node,arg:mapAST(node.arg,fn)});
 if(node.type==='call')return fn({...node,args:node.args.map(child=>mapAST(child,fn))});
 return fn({...node});
}
function symbolLatex(name){const greek={theta:'\\theta',alpha:'\\alpha',beta:'\\beta',gamma:'\\gamma',phi:'\\phi',varphi:'\\varphi',lambda:'\\lambda',mu:'\\mu',omega:'\\omega',Delta:'\\Delta'};return greek[name]||name.replace(/_([A-Za-z0-9]+)$/,'_{$1}');}
export function expressionToFormula(source,{references=[]}={}){
 const ast=parseExpression(source),byCanonical=new Map(references.map(ref=>[ref.canonical,ref])),used=[];
 const latex=expressionTex(ast,(name,key)=>{
  const canonical=name+(key?'.'+key:''),reference=byCanonical.get(canonical);
  if(reference){used.push(reference);return reference.latex;}
  if(!key){const ref={canonical:name,latex:symbolLatex(name),label:name};used.push(ref);return ref.latex;}
  // A stable explicit fallback is intentionally less pretty than a guessed binding.
  if(key){const ref={canonical,latex:'\\operatorname{ref}\\left('+name+',\\mathrm{'+key+'}\\right)',label:canonical};used.push(ref);return ref.latex;}
  return name;
 });
 return {latex,ast,expression:printExpression(ast),references:[...new Map(used.map(ref=>[ref.canonical,ref])).values()]};
}
export function formulaSymbols(latex){
 const ascii=convertLatexToAsciiMath(validateFormulaLatex(latex)),found=new Set();
 for(const match of ascii.matchAll(/[A-Za-z][A-Za-z0-9]*(?:_(?:[A-Za-z0-9]+|\([A-Za-z0-9]+\)))?/g)){
  const symbol=match[0].replace(/_\(([^)]+)\)/,'_$1');
  if(!FUNCTIONS.has(symbol)&&symbol!=='pi')found.add(symbol);
 }
 return [...found];
}

/**
 * Known reference notation and chosen variable bindings are replaced before the
 * native parser runs. No variable is assigned from its current numeric value.
 */
export function formulaToExpression(latex,{references=[],bindings={},target,acceptEquation=false,matrixAsPoint=false}={}){
 validateFormulaLatex(latex);
 if(/\\(?:sum|prod|int|oint|lim|infty|partial|nabla|pm|mp)\b/.test(latex))throw Error('此结构可以作为排版公式保存，当前依赖引擎尚不支持直接执行。');
 if(/\\begin\{(?:[pbBvV]?matrix|array|cases|aligned|gathered)\}/.test(latex)){
  if(!matrixAsPoint)throw Error('矩阵或多行公式可以排版；作为依赖前请明确选择二维位置转换，其他矩阵暂不执行。');
 }
 const wholeSymbols=new Map(),substitutions=new Map(),originalASCII=convertLatexToAsciiMath(latex).replace(/_\((\d+)\)/g,'_$1');let sequence=0;
 function token(ast){let name;do{name='Q_'+(5000+sequence++);}while(originalASCII.includes(name));substitutions.set(name,ast);return name;}
 // Mark explicit upright units so handwritten italic m/T/e remain variables.
 const force=new Set(Object.entries(bindings).filter(([,value])=>typeof value==='string'&&value.trim()).map(([symbol])=>symbol));
 let input=latex.replace(/\\mathrm\s*(?:\{([^{}]+)\}|([A-Za-z]+))/g,(all,braced,bare)=>{
  const name=braced||bare;if(!units[name]||force.has(name))return all;
  return symbolLatex(token(parseExpression(name)));
 });
 let ascii=normalizeFunctions(convertLatexToAsciiMath(input));
 const entries=references.map(ref=>({ref,ascii:convertLatexToAsciiMath(ref.latex)})).sort((a,b)=>b.ascii.length-a.ascii.length),groupsByAlias=new Map();
 for(const entry of entries){const key=entry.ascii.replace(/\s/g,'');if(!groupsByAlias.has(key))groupsByAlias.set(key,[]);groupsByAlias.get(key).push(entry);}
 for(const group of groupsByAlias.values()){
  const entry=group[0],marker=token(parseExpression(entry.ref.canonical)),replaced=protectedReplace(ascii,entry.ascii,marker);
  if(replaced===ascii)continue;
  const canonicals=[...new Set(group.map(item=>item.ref.canonical))],symbol=/^[A-Za-z][A-Za-z_0-9]*$/.test(entry.ascii)?entry.ascii:entry.ref.latex,chosen=typeof bindings[symbol]==='string'?bindings[symbol].trim():'';
  // A user's explicit choice wins even when the automatic alias is unique:
  // B may name a whole field, while the handwriting means its numeric B value.
  if(chosen){ascii=protectedReplace(ascii,entry.ascii,token(parseExpression(chosen)));if(!chosen.includes('.'))wholeSymbols.set(chosen,symbol);}
  else if(canonicals.length>1)throw Object.assign(Error('符号 '+symbol+' 对应多个对象，请明确选择实际引用。'),{symbols:[symbol],ambiguous:true});
  else{ascii=replaced;if(!entry.ref.canonical.includes('.'))wholeSymbols.set(entry.ref.canonical,symbol);}
 }
 // Explicit ref(oN, property) is our round-trip fallback, not a native function.
 ascii=ascii.replace(/r\s*e\s*f\s*\(\s*([A-Za-z_][A-Za-z_0-9]*)\s*,\s*([A-Za-z\s_0-9]+)\s*\)/g,(_,id,key)=>token(parseExpression(id+'.'+key.replace(/\s/g,''))));
 for(const [symbol,canonical] of Object.entries(bindings)){
  if(typeof canonical!=='string'||!canonical.trim())continue;
  const replaced=protectedReplace(ascii,convertLatexToAsciiMath(symbolLatex(symbol)),token(parseExpression(canonical)));if(replaced!==ascii&&!canonical.includes('.'))wholeSymbols.set(canonical,symbol);ascii=replaced;
 }
 if(/[<>!]|(?:<=|>=|!=)|\\/.test(ascii))throw Error('比较式或未支持的命令不能直接作为依赖；请保留排版并选择可执行表达式。');
 const equal=ascii.indexOf('=');
 let lhs=null;
 if(equal>=0){
  if(ascii.indexOf('=',equal+1)>=0)throw Error('一条依赖只能含一个等号。');
  if(!acceptEquation||!target)throw Error('请确认等号左侧与所选目标对应，再只应用右侧表达式。');
  lhs=normalizeASCII(ascii.slice(0,equal));ascii=ascii.slice(equal+1);
 }
 if(matrixAsPoint&&ascii.startsWith('[[')&&ascii.endsWith(']]')){
  const rows=ascii.slice(2,-2).split('],[');
  if(rows.length!==2||rows.some(row=>row.includes(',')))throw Error('只有2行1列的矩阵可明确转换为二维位置。');
  ascii='point('+rows.join(',')+')';
 }
 const parsed=parseExpression(normalizeASCII(ascii)),ast=mapAST(parsed,node=>node.type==='ref'&&substitutions.has(node.name)&&!node.key?substitutions.get(node.name):node);
 // Whole objects are geometry arguments, never implicit numeric scalars.
 // Leave type/dimension evaluation to the native resolver after this clear map.
 const geometryArguments={pos:[0],center:[0],vertex:[0],edge:[0],end:[0],mid:[0,1],line:[0,1],segment:[0,1],ray:[0,1],circle:[0],circumcenter:[0,1,2],circleThrough:[0,1,2],intersect:[0,1],on:[0],foot:[0,1],bearing:[0,1],distance:[0,1],length:[0],parallel:[0,1],perp:[0,1],vector:[0,1],unit:[0],area:[0],perimeter:[0]},scalarObjects=new Set();
 function inspectWhole(node,parent=null,index=-1){
  if(node.type==='ref'&&!node.key&&/^(?:o\d+|axisX|axisY)$/.test(node.name)&&!(parent?.type==='call'&&geometryArguments[parent.name]?.includes(index)))scalarObjects.add(wholeSymbols.get(node.name)||node.name);
  children(node).forEach((child,i)=>inspectWhole(child,node,i));
 }
 inspectWhole(ast);if(scalarObjects.size)throw Object.assign(Error('符号 '+[...scalarObjects].join('、')+' 当前指向整个几何对象，请选择具体数值属性（例如磁感应强度）。整个对象可用于 pos、area 等几何函数。'),{symbols:[...scalarObjects]});
 const unresolved=new Set(),explicitRefs=new Set();
 for(const tagged of substitutions.values())visit(tagged,node=>{if(node.type==='ref')explicitRefs.add(node.name+(node.key?'.'+node.key:''));});
 visit(ast,node=>{
  if(node.type==='call'&&!FUNCTIONS.has(node.name))throw Error('函数 '+node.name+' 尚不支持依赖执行。');
  if(node.type==='ref'&&!node.key&&!substitutions.has(node.name)&&node.name!=='pi'&&node.name!=='π'&&!['axisX','axisY'].includes(node.name)){
   // Only explicit protected units or explicit user bindings can become a unit.
   const originallyTagged=explicitRefs.has(node.name+(node.key?'.'+node.key:''));
   if(!originallyTagged)unresolved.add(node.name);
  }
 });
 if(unresolved.size)throw Object.assign(Error('请先绑定变量：'+[...unresolved].join('、')),{symbols:[...unresolved]});
 if(lhs!==null){
  const left=mapAST(parseExpression(lhs),node=>node.type==='ref'&&substitutions.has(node.name)?substitutions.get(node.name):node),expected=parseExpression(target);
  if(JSON.stringify(left)!==JSON.stringify(expected)){const symbols=[];visit(left,node=>{if(node.type==='ref'&&!node.key&&!explicitRefs.has(node.name))symbols.push(node.name);});throw Object.assign(Error('等号左侧尚未映射到当前目标，请在变量映射中指定后再应用。'),{symbols});}
 }
 return {expression:printExpression(ast),ast,latex,lhsApplied:lhs!==null,matrixAsPoint:!!matrixAsPoint};
}
