// A small mathematical grammar, not JavaScript: definitions can be saved and
// renamed without executing text from a scene file. Quantities use SI internally.
export const D0=[0,0,0,0,0], DL=[0,1,0,0,0], DA=[0,0,0,0,1];
export const units={
 '':{scale:1,d:D0,tex:''},cm:{scale:.01,d:DL,tex:'\\mathrm{cm}'},m:{scale:1,d:DL,tex:'\\mathrm m'},
 u:{scale:1.66053906660e-27,d:[1,0,0,0,0],tex:'\\mathrm u'},kg:{scale:1,d:[1,0,0,0,0],tex:'\\mathrm{kg}'},
 e:{scale:1.602176634e-19,d:[0,0,0,1,0],tex:'e'},C:{scale:1,d:[0,0,0,1,0],tex:'\\mathrm C'},
 mT:{scale:.001,d:[1,0,-1,-1,0],tex:'\\mathrm{mT}'},T:{scale:1,d:[1,0,-1,-1,0],tex:'\\mathrm T'},
 speed:{scale:1e5,d:[0,1,-1,0,0],tex:'10^5\\,\\mathrm{m/s}'},'m/s':{scale:1,d:[0,1,-1,0,0],tex:'\\mathrm{m/s}'},
 deg:{scale:Math.PI/180,d:DA,tex:'{}^\\circ'},rad:{scale:1,d:DA,tex:'\\mathrm{rad}'},
 us:{scale:1e-6,d:[0,0,1,0,0],tex:'\\mu\\mathrm s'},s:{scale:1,d:[0,0,1,0,0],tex:'\\mathrm s'},
 cm2:{scale:.0001,d:[0,2,0,0,0],tex:'\\mathrm{cm}^{2}'},m2:{scale:1,d:[0,2,0,0,0],tex:'\\mathrm{m}^{2}'},
 'V/m':{scale:1,d:[1,1,-2,-1,0],tex:'\\mathrm{V/m}'},'kV/m':{scale:1000,d:[1,1,-2,-1,0],tex:'\\mathrm{kV/m}'},'N/C':{scale:1,d:[1,1,-2,-1,0],tex:'\\mathrm{N/C}'},
 V:{scale:1,d:[1,2,-2,-1,0],tex:'\\mathrm V'},kV:{scale:1000,d:[1,2,-2,-1,0],tex:'\\mathrm{kV}'},N:{scale:1,d:[1,1,-2,0,0],tex:'\\mathrm N'},J:{scale:1,d:[1,2,-2,0,0],tex:'\\mathrm J'},eV:{scale:1.602176634e-19,d:[1,2,-2,0,0],tex:'\\mathrm{eV}'}
};
export const sameDim=(a,b)=>a.every((x,i)=>Math.abs(x-b[i])<1e-10);
export const scalar=(n,d=D0,scale=1)=>({type:'number',n,d,scale});
export const vector=(p,d=DL)=>({type:'vector',p,d});
export const fromNative=(n,unit='')=>{const u=units[unit];return scalar(n*u.scale,u.d,u.scale);};
export function toNative(q,unit=''){
 if(q?.type!=='number')throw Error('这里需要数值，请选择相应的坐标或参数。');
 const u=units[unit];if(sameDim(q.d,D0))return finite(q.n);
 if(!sameDim(q.d,u.d))throw Error('量纲不匹配，请检查引用的参数或单位。');
 return finite(q.n/u.scale);
}
export function finite(n){if(!Number.isFinite(n))throw Error('当前定义无有限数值（请检查除数、根号和函数范围）。');return n;}
const dimensionless=q=>{if(q?.type!=='number'||!sameDim(q.d,D0))throw Error('这里需要无量纲数值。');return q.n;};
function compatible(a,b){
 if(sameDim(a.d,b.d))return [a,b];
 // A bare additive constant follows the displayed unit: height + 2 means 2 cm.
 if(sameDim(a.d,D0))return [scalar(a.n*b.scale,b.d,b.scale),b];
 if(sameDim(b.d,D0))return [a,scalar(b.n*a.scale,a.d,a.scale)];
 throw Error('相加或比较的量须具有相同量纲。');
}
export function binary(op,a,b){
 if(a.type==='vector'||b.type==='vector'){
  if(['+','-'].includes(op)&&a.type===b.type&&sameDim(a.d,b.d))return vector(a.p.map((v,i)=>v+(op==='+'?1:-1)*b.p[i]),a.d);
  if(op==='*'&&a.type==='number'&&b.type==='vector')return binary('*',b,a);
  if(['*','/'].includes(op)&&a.type==='vector'&&b.type==='number')return vector(a.p.map(v=>finite(op==='*'?v*b.n:v/b.n)),a.d.map((d,i)=>d+(op==='*'?1:-1)*b.d[i]));
  throw Error('向量支持同量纲相加减，以及与数值相乘除。');
 }
 if(a.type!=='number'||b.type!=='number')throw Error('请先选择对象的参数、位置或几何测量值。');
 if(op==='+'||op==='-'){[a,b]=compatible(a,b);return scalar(finite(a.n+(op==='+'?b.n:-b.n)),a.d,a.scale);}
 if(op==='^'){const e=dimensionless(b);return scalar(finite(a.n**e),a.d.map(d=>d*e),a.scale**e);}
 const k=op==='*'?1:-1;return scalar(finite(op==='*'?a.n*b.n:a.n/b.n),a.d.map((d,i)=>d+k*b.d[i]),op==='*'?a.scale*b.scale:a.scale/b.scale);
}
const angle=q=>q.type==='number'&&sameDim(q.d,DA)?q.n:dimensionless(q)*Math.PI/180;
export function mathCall(name,args){
 const unary=['sqrt','abs','sin','cos','tan','asin','acos','atan','exp','ln','log','floor','ceil','round'];
 if(unary.includes(name)){
  if(args.length!==1||args[0].type!=='number')throw Error(name+' 需要一个数值参数。');const q=args[0];
  if(name==='sqrt')return binary('^',q,scalar(.5));if(name==='abs')return {...q,n:Math.abs(q.n)};
  if(['sin','cos','tan'].includes(name))return scalar(finite(Math[name](angle(q))));
  if(['asin','acos','atan'].includes(name))return scalar(finite(Math[name](dimensionless(q))),DA,Math.PI/180);
  if(['floor','ceil','round'].includes(name))return {...q,n:Math[name](q.n/q.scale)*q.scale};
  return scalar(finite((name==='ln'||name==='log'?Math.log:Math.exp)(dimensionless(q))));
 }
 if(name==='atan2'){if(args.length!==2)throw Error('atan2 需要两个参数。');const [a,b]=compatible(...args);if(!a.n&&!b.n)throw Error('零向量没有方向。');return scalar(Math.atan2(a.n,b.n),DA,Math.PI/180);}
 if(name==='min'||name==='max'){
  if(!args.length)throw Error(name+' 需要数值参数。');return args.reduce((a,b)=>{[a,b]=compatible(a,b);return {...a,n:Math[name](a.n,b.n)};});
 }
 if(name==='pow'){if(args.length!==2)throw Error('pow 需要两个参数。');return binary('^',...args);}
 return null;
}
const builtins=new Set(['pi','π',...Object.keys(units).filter(n=>/^[a-zA-Z][a-zA-Z0-9]*$/.test(n))]);
export function parseExpression(source){
 if(typeof source!=='string'||!source.trim()||source.length>1500)throw Error('请输入数学表达式（不超过 1500 字符）。');
 const text=source.replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/[−－]/g,'-').replace(/（/g,'(').replace(/）/g,')').replace(/，/g,',');
 const tokens=[];let offset=0;
 while(offset<text.length){const match=/^(\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|π|[+\-*/^(),.√])/.exec(text.slice(offset));if(!match)throw Error('无法识别「'+text[offset]+'」，可用 sqrt(2)、分数及对象引用。');if(!/^\s+$/.test(match[0]))tokens.push(match[0]);offset+=match[0].length;}
 let i=0,depth=0;const peek=()=>tokens[i],take=()=>tokens[i++],expect=t=>{if(take()!==t)throw Error('表达式缺少「'+t+'」。');};
 function atom(){
  if(++depth>70)throw Error('表达式嵌套过深。');let node;const token=take();
  if(token==='('){node=sum();expect(')');}
  else if(token&&/^(\d|\.)/.test(token))node={type:'literal',value:Number(token)};
  else if(token&&/^[A-Za-z_π]/.test(token)){
   if(peek()==='('){take();const args=[];if(peek()!==')'){do{args.push(sum());if(peek()!==',')break;take();}while(true);}expect(')');node={type:'call',name:token,args};}
   else{let key=null;if(peek()==='.'){take();key=take();if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(key||''))throw Error('请选择对象的有效属性。');}node={type:'ref',name:token,key};}
  }else throw Error('表达式尚未完整。');depth--;return node;
 }
 function power(){let a=atom();if(peek()==='^'){take();a={type:'binary',op:'^',a,b:unary()};}return a;}
 function unary(){if(['+','-','√'].includes(peek())){const op=take(),arg=unary();return op==='√'?{type:'call',name:'sqrt',args:[arg]}:{type:'unary',op,arg};}return power();}
 function product(){let a=unary();while(peek()==='*'||peek()==='/'||peek()==='('||/^(?:[A-Za-z_π√]|\d)/.test(peek()||'')){const op=peek()==='*'||peek()==='/'?take():'*';a={type:'binary',op,a,b:unary()};}return a;}
 function sum(){let a=product();while(peek()==='+'||peek()==='-'){const op=take();a={type:'binary',op,a,b:product()};}return a;}
 const ast=sum();if(i!==tokens.length)throw Error('表达式中有多余的「'+peek()+'」。');return ast;
}
export function transformReferences(ast,fn){
 if(ast.type==='ref')return fn(ast);
 if(ast.type==='call')return {...ast,args:ast.args.map(a=>transformReferences(a,fn))};
 if(ast.type==='binary')return {...ast,a:transformReferences(ast.a,fn),b:transformReferences(ast.b,fn)};
 if(ast.type==='unary')return {...ast,arg:transformReferences(ast.arg,fn)};return ast;
}
export function evaluate(ast,context){
 if(ast.type==='literal')return scalar(ast.value);
 if(ast.type==='ref'){
  if(!ast.key&&(ast.name==='pi'||ast.name==='π'))return scalar(Math.PI);
  if(!ast.key&&units[ast.name])return fromNative(1,ast.name);
  return context.reference(ast.name,ast.key);
 }
 if(ast.type==='unary'){const a=evaluate(ast.arg,context);return ast.op==='+'?a:binary('*',scalar(-1),a);}
 if(ast.type==='binary')return binary(ast.op,evaluate(ast.a,context),evaluate(ast.b,context));
 const args=ast.args.map(a=>evaluate(a,context));return mathCall(ast.name,args)??context.call(ast.name,args);
}
export const isConstant=name=>builtins.has(name)||name==='axisX'||name==='axisY';
export function printExpression(ast,reference=(name,key)=>name+(key?'.'+key:'')){
 if(ast.type==='literal')return String(ast.value);if(ast.type==='ref')return reference(ast.name,ast.key);
 if(ast.type==='unary')return ast.op+'('+printExpression(ast.arg,reference)+')';
 if(ast.type==='call')return ast.name+'('+ast.args.map(a=>printExpression(a,reference)).join(', ')+')';
 return '('+printExpression(ast.a,reference)+' '+ast.op+' '+printExpression(ast.b,reference)+')';
}
export function expressionTex(ast,reference=(name,key)=>`\\mathrm{${name.replace(/_/g,'\\_')}}${key?'_{\\mathrm{'+key+'}}':''}`){
 const t=a=>expressionTex(a,reference);
 if(ast.type==='literal')return String(ast.value).replace(/e([+-]?\d+)/i,'\\times10^{$1}');
 if(ast.type==='ref'){if(ast.name==='pi'||ast.name==='π')return '\\pi';if(!ast.key&&units[ast.name])return units[ast.name].tex;return reference(ast.name,ast.key);}
 if(ast.type==='unary')return ast.op+'\\left('+t(ast.arg)+'\\right)';
 if(ast.type==='call'){if(ast.name==='sqrt')return '\\sqrt{'+t(ast.args[0])+'}';if(ast.name==='abs')return '\\left|'+t(ast.args[0])+'\\right|';return '\\operatorname{'+ast.name+'}\\left('+ast.args.map(t).join(',\\,')+'\\right)';}
 if(ast.op==='/')return '\\frac{'+t(ast.a)+'}{'+t(ast.b)+'}';if(ast.op==='^')return '{\\left('+t(ast.a)+'\\right)}^{'+t(ast.b)+'}';
 return '\\left('+t(ast.a)+(ast.op==='*'?'\\,':ast.op)+t(ast.b)+'\\right)';
}
