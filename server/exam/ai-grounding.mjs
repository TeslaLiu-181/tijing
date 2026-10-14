import {E,U} from '../../src/planar-physics.mjs';
import {particleTypes} from '../../src/lorentz-presets.mjs';

// This is deliberately a small, transparent rule set. A physically consistent
// scene is not evidence that every sentence of the source question was modeled.
export function nativeSceneFacts(scene) {
 return scene.objects.filter(o=>o.enabled).map(o=>{
  const base={id:o.id,label:o.label,kind:o.kind,xCm:o.x,yCm:o.y,definitions:{...(o.defs||{})}};
  if(['particle','source'].includes(o.kind))return {...base,massU:o.mass,massKg:o.mass*U,chargeE:o.charge,chargeC:o.charge*E,
   chargeSign:Math.sign(o.charge),speedMS:o.speed*1e5,headingDeg:o.heading};
  if(o.kind==='field')return {...base,shape:o.shape,BmT:o.B,BT:o.B*.001,magneticDirection:o.B>0?'out':o.B<0?'in':'zero'};
  if(o.kind==='electric')return {...base,shape:o.shape,E0kVm:o.E0,E0Vm:o.E0*1000,fieldAngleDeg:o.fieldAngle};
  if(o.kind==='parameter')return {...base,value:o.value,unit:o.unit};
  return base;
 });
}
function chargeSign(text,{includeSpecies=true}={}) {
 const positive=/(?:带正电|正电荷|正电粒子|电荷(?:量)?\s*为\s*[+＋])/u.test(text)||(includeSpecies&&/质子/u.test(text));
 const negative=/(?:带负电|负电荷|负电粒子|电荷(?:量)?\s*为\s*[-−])/u.test(text)||(includeSpecies&&/电子/u.test(text));
 if(/(?:不是|非|不带|不一定是|可能是).{0,5}(?:正电|负电|质子|电子)/u.test(text))return null;
 return positive!==negative?(positive?1:-1):null;
}
function singleParticleSpecies(text) {
 const normalized=String(text).replace(/\s+/g,'');
 const names=['电子','质子'].filter(name=>normalized.includes(name));if(names.length!==1)return null;
 // A matching word is insufficient: only an affirmative singular declaration
 // can supply species constants. Hypotheses and multi-particle prose remain
 // outside this limited check and require the teacher's source comparison.
 if(/(?:两|二|双|多|[2-9]\d*)(?:个|颗|种|束)?(?:粒子|电子|质子)|粒子[甲乙]|(?:电子|质子)[甲乙]|甲[^。；]{0,40}乙|粒子束|一束(?:电子|质子)|一群|若干/.test(normalized))return null;
 if(/(?:原题|题目|题设)[^。；]{0,30}(?:未给|没有给|没给|未说明|未知|不明)[^。；]{0,20}(?:种类|类型|身份|粒子)/.test(normalized))return null;
 const name=names[0];
 const uncertainBefore=new RegExp('(?:不是|并非|非|不一定|不确定|可能|未知|待确认|看不清|未确认|假设|猜测|猜成|猜想|假如|如果|倘若|若|示例|演示)[^。；]{0,35}'+name);
 const uncertainAfter=new RegExp(name+'[^。；]{0,20}(?:待确认|未确认|不确定|仅为假设|只是猜测|只是演示)');
 if(uncertainBefore.test(normalized)||uncertainAfter.test(normalized))return null;
 const declaration=new RegExp('(?:^|[，。；：:])(?:一个|一颗|一枚|一|单个|单颗|唯一一个|唯一一颗|某个|某)'+name+'(?:以|从|在|沿|射|进|运动|带|的|其|，|。|[（(])|^(?:'+name+')(?:以|从|在|沿|射|进|运动|质量|电荷)|(?:已知|明确|确定)(?:该|这个)?粒子(?:是|为)'+name+'|粒子(?:种类|类型|身份)(?:是|为)'+name);
 if(!declaration.test(normalized))return null;
 const type=name==='电子'?'electron':'proton';return {type,...particleTypes[type]};
}
function magneticDirection(text) {
 if(/(?:不是|非|不一定|不确定|未确定|看不清)[^。；\n]{0,12}(?:向里|向内|向外|进入纸面|出纸面)/u.test(text))return null;
 const inward=/(?:磁場|磁场|场方向|B\s*方向|磁感应强度)[^。；\n]{0,60}(?:向里|向内|进入纸面)/u.test(text);
 const outward=/(?:磁場|磁场|场方向|B\s*方向|磁感应强度)[^。；\n]{0,60}(?:向外|出纸面)/u.test(text);
 return inward!==outward?(inward?-1:1):null;
}
function explicitNumbers(text,pattern,units) {
 const normalized=String(text).replace(/\\(?:mathrm|text)\{([^{}]*)\}/g,'$1').replace(/\\[,;!]|\\quad|\$/g,' ');
 const numeral='[+\\-−]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+\\-]?\\d+|\\s*(?:×|\\\\times|\\*)\\s*10\\s*\\^\\s*(?:\\{|\\()?[+\\-]?\\d+(?:\\}|\\))?)?';
 const regex=new RegExp('(?:'+pattern+')\\s*('+numeral+')\\s*('+Object.keys(units).sort((a,b)=>b.length-a.length).join('|')+')(?![A-Za-z/])','g');
 const values=[];
 for(const match of normalized.matchAll(regex)) {
  let number=match[1].replace(/[\s{}()]/g,'').replace(/−/g,'-').replace(/(?:×|\\times|\*)10\^/,'e');
  const value=Number(number)*units[match[2]];if(Number.isFinite(value))values.push(value);
 }
 if(!values.length)return null;
 const first=values[0],scale=Math.max(Math.abs(first),1e-40);
 return values.every(n=>Math.abs(n-first)<=scale*1e-10)?first:null;
}
function numericCheck(checked,contradictions,metric,source,expected,actual,id,relativeTolerance=0.005,label='原文明确数值与提案不一致') {
 if(expected===null)return;
 const scale=Math.max(Math.abs(expected),Math.abs(actual),1e-40),pass=Math.abs(expected-actual)<=scale*relativeTolerance;
 checked.push({kind:'numeric-'+metric,source,expected,actual,objects:[id],relativeTolerance,pass});
 if(!pass)contradictions.push(label+'：'+metric);
}
const compare=(checked,contradictions,kind,source,expected,actual,objects)=>{
 const pass=expected===actual;checked.push({kind,source,expected,actual,objects,pass});
 if(!pass)contradictions.push(kind==='chargeSign'?'原文明确电荷正负号与提案不一致':'原文明确磁场方向与提案不一致');
};
export function checkSourceGrounding(scene,{sourceText='',givens=[],assumptions=[]}={}) {
 const particles=scene.objects.filter(o=>o.enabled&&['particle','source'].includes(o.kind)),fields=scene.objects.filter(o=>o.enabled&&o.kind==='field');
 const checked=[],contradictions=[],sources=[{kind:'source',text:String(sourceText)},{kind:'reportedGivens',text:givens.join('\n')}];
 const limitations=['规则只比对明确单粒子/单磁场的正负与方向、带明确单位的质量/电荷/速率/场强，以及肯定单粒子声明中的电子/质子预设质量与有符号电荷；复杂图文边界与其他粒子种类仍须人工对照原稿。',
  '电子/质子常量规则不处理否定、猜测、待确认、演示假设或多粒子语境，不把模型reportedGivens的物种猜测升级为原稿条件。',
  'passed只表示适用的有限规则未发现矛盾；checked为空表示没有适用规则，绝不表示题意或全部物理条件已核对。',
  '图片 OCR 题设来自模型识别，规则不能独立证实图片里的文字与图示。'];
 for(const source of sources) {
  if(particles.length===1) {
   const species=source.kind==='source'&&particles[0].kind==='particle'?singleParticleSpecies(source.text):null;
   const sign=chargeSign(source.text,{includeSpecies:!!species});
   if(sign!==null)compare(checked,contradictions,'chargeSign',source.kind,sign,Math.sign(particles[0].charge),[particles[0].id]);
   const p=particles[0];
   if(species){
    numericCheck(checked,contradictions,'species-massU',source.kind,species.mass,p.mass,p.id,.005,'原文明确'+species.name+'的质量与提案不一致');
    numericCheck(checked,contradictions,'species-chargeE',source.kind,species.charge,p.charge,p.id,.005,'原文明确'+species.name+'的电荷量与提案不一致');
   }
   numericCheck(checked,contradictions,'massKg',source.kind,explicitNumbers(source.text,'\\bm\\s*[=＝]|质量(?:\\s*m\\s*[=＝])?(?:为|是|[=＝])?',{kg:1,u:U}),p.mass*U,p.id);
   numericCheck(checked,contradictions,'chargeC',source.kind,explicitNumbers(source.text,'\\bq\\s*[=＝]|电荷(?:量)?(?:\\s*q\\s*[=＝])?(?:为|是|[=＝])?',{C:1,e:E}),p.charge*E,p.id);
   numericCheck(checked,contradictions,'speedMS',source.kind,explicitNumbers(source.text,'\\bv(?:_0)?\\s*[=＝]|(?:初|初始)?(?:速度|速率|初速)(?:大小)?(?:为|是|[=＝])?',{'m/s':1}),p.speed*1e5,p.id);
  }
  if(fields.length===1) {
   const sign=magneticDirection(source.text);
   if(sign!==null)compare(checked,contradictions,'magneticDirection',source.kind,sign,Math.sign(fields[0].B),[fields[0].id]);
   const f=fields[0],expected=explicitNumbers(source.text,'\\bB(?:_z)?\\s*[=＝]|磁感应强度(?:大小)?(?:为|是|[=＝])?',{mT:.001,T:1});
   numericCheck(checked,contradictions,'magneticMagnitudeT',source.kind,expected===null?null:Math.abs(expected),Math.abs(f.B)*.001,f.id);
  }
  const electric=scene.objects.filter(o=>o.enabled&&o.kind==='electric');
  if(electric.length===1) {
   const f=electric[0],expected=explicitNumbers(source.text,'\\bE(?:_0)?\\s*[=＝]|电场(?:强度)?(?:为|是|[=＝])?',{'kV/m':1000,'V/m':1,'N/C':1});
   numericCheck(checked,contradictions,'electricMagnitudeVm',source.kind,expected===null?null:Math.abs(expected),f.E0*1000,f.id);
  }
 }
 return {version:'explicit-source-rules/3',checked,contradictions:[...new Set(contradictions)],passed:!contradictions.length,
  scope:checked.length?'explicit-source-consistency':'no-applicable-rule',coverage:checked.length?'partial':'none',sourceSemanticsVerified:false,facts:nativeSceneFacts(scene),limitations};
}
export function attachGrounding(candidate,context={}) {
 if(!candidate.snapshot?.scene)return candidate;
 const grounding=checkSourceGrounding(candidate.snapshot.scene,context);candidate.harness.grounding=grounding;
 if(!grounding.passed) {
  candidate.harness.passed=false;
  candidate.harness.violations=[...(candidate.harness.violations||[]),...grounding.contradictions];
 }
 return candidate;
}
