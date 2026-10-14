import {extname,posix} from 'node:path';
import {DOMParser} from '@xmldom/xmldom';
import {unzipSync,strFromU8} from 'fflate';

const local=node=>node?.localName||node?.nodeName?.split(':').at(-1);
const children=node=>Array.from(node?.childNodes||[]).filter(n=>n.nodeType===1);
const child=(node,name)=>children(node).find(n=>local(n)===name);
const attr=(node,name)=>node?.getAttribute('m:'+name)||node?.getAttribute('w:'+name)||node?.getAttribute(name)||'';
const latexText=text=>String(text||'').replace(/×/g,'\\times ').replace(/÷/g,'\\div ').replace(/−/g,'-').replace(/≤/g,'\\le ').replace(/≥/g,'\\ge ').replace(/π/g,'\\pi ').replace(/α/g,'\\alpha ').replace(/θ/g,'\\theta ').replace(/φ/g,'\\phi ').replace(/ω/g,'\\omega ').replace(/μ/g,'\\mu ').replace(/∞/g,'\\infty ').replace(/°/g,'^{\\circ}');
// OMML distinguishes an omitted property from an explicitly empty character.
// Keep that distinction for open piecewise braces, separators and accents.
const mathChar=(props,name,fallback)=>{const node=child(props,name);return node?attr(node,'val'):fallback;};
const mathOn=(props,name)=>{const node=child(props,name);return !!node&&!/^(0|false|off)$/i.test(attr(node,'val'));};
export function ommlToLatex(node) {
  if(!node)return '';
  const name=local(node),m=ommlToLatex,e=()=>m(child(node,'e'));
  if(name==='t')return latexText(node.textContent);
  if(name.endsWith('Pr'))return '';
  if(name==='f')return `\\frac{${m(child(node,'num'))}}{${m(child(node,'den'))}}`;
  if(name==='rad'){
    const degree=mathOn(child(node,'radPr'),'degHide')?'':m(child(node,'deg'));
    return `\\sqrt${degree?'['+degree+']':''}{${e()}}`;
  }
  if(name==='sSub')return `{${e()}}_{${m(child(node,'sub'))}}`;
  if(name==='sSup')return `{${e()}}^{${m(child(node,'sup'))}}`;
  if(name==='sSubSup')return `{${e()}}_{${m(child(node,'sub'))}}^{${m(child(node,'sup'))}}`;
  if(name==='sPre')return `{}_{${m(child(node,'sub'))}}^{${m(child(node,'sup'))}}{${e()}}`;
  if(name==='acc'){
    const mark=mathChar(child(node,'accPr'),'chr','\u0302');
    if(!mark)return e();
    const command={'\u0302':'hat','^':'hat','\u0307':'dot','.':'dot','\u0308':'ddot','\u0303':'tilde','~':'tilde',
      '\u20d7':'vec','→':'vec','\u0304':'bar','\u0301':'acute','\u0300':'grave','\u0306':'breve','\u030c':'check'}[mark];
    return command?`\\${command}{${e()}}`:`\\overset{${latexText(mark)}}{${e()}}`;
  }
  if(name==='bar')return `\\${attr(child(child(node,'barPr'),'pos'),'val')==='bot'?'underline':'overline'}{${e()}}`;
  if(name==='d') {
    const props=child(node,'dPr'),begin=mathChar(props,'begChr','('),end=mathChar(props,'endChr',')'),separator=mathChar(props,'sepChr','|');
    const bracket=value=>({'':'.','{':'\\{','}':'\\}','⟨':'\\langle ','⟩':'\\rangle ','‖':'\\Vert ','│':'|'}[value]??value);
    return `\\left${bracket(begin)}${children(node).filter(n=>local(n)==='e').map(m).join(separator==='│'?'|':latexText(separator))}\\right${bracket(end)}`;
  }
  if(name==='m')return `\\begin{matrix}${children(node).filter(n=>local(n)==='mr').map(row=>children(row).filter(n=>local(n)==='e').map(m).join('&')).join('\\\\')}\\end{matrix}`;
  if(name==='func')return `\\operatorname{${m(child(node,'fName'))}} ${e()}`;
  if(name==='limLow')return `{${e()}}_{${m(child(node,'lim'))}}`;
  if(name==='limUpp')return `{${e()}}^{${m(child(node,'lim'))}}`;
  if(name==='eqArr')return `\\begin{aligned}${children(node).filter(n=>local(n)==='e').map(m).join('\\\\')}\\end{aligned}`;
  if(name==='nary') {
    const props=child(node,'naryPr'),mark=mathChar(props,'chr','∫'),operator={'∫':'\\int','∬':'\\iint','∭':'\\iiint','∮':'\\oint','∑':'\\sum','∏':'\\prod','⋃':'\\bigcup','⋂':'\\bigcap'}[mark]??latexText(mark);
    const sub=mathOn(props,'subHide')?'':m(child(node,'sub')),sup=mathOn(props,'supHide')?'':m(child(node,'sup'));
    return `${operator}${sub?'_{'+sub+'}':''}${sup?'^{'+sup+'}':''} ${e()}`;
  }
  return children(node).map(m).join('');
}
function parseXml(text) {
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('文档包含不支持的 XML 实体定义');
  return new DOMParser({onError:(level,message)=>{if(level==='fatalError')throw new Error(message);}}).parseFromString(text,'application/xml');
}

export function extractDocx(data, {maxBytes = 256 * 1024 * 1024,maxXmlBytes = Infinity} = {}) {
  let size=0;const files=unzipSync(new Uint8Array(data),{filter:entry=>{
    if(!/^word\/(document\.xml|_rels\/document\.xml\.rels|media\/)/.test(entry.name))return false;
    size+=entry.originalSize;
    if(size>maxBytes)throw Object.assign(new Error('文档展开内容过大，请按试卷或章节拆分'),{code:'docx_expanded_limit'});
    // AI bounds XML independently of media before decompression and DOM allocation.
    // Ordinary import keeps its existing limit when maxXmlBytes is omitted.
    if(entry.name.endsWith('.xml')||entry.name.endsWith('.rels')) {
      if(entry.originalSize>maxXmlBytes)throw Object.assign(new Error('Word 正文或关系 XML 过大，请按试卷或章节拆分'),{code:'docx_xml_limit'});
    }
    return true;
  }});
  if(!files['word/document.xml'])throw new Error('DOCX 缺少正文');
  const relations=new Map();
  if(files['word/_rels/document.xml.rels'])for(const relation of Array.from(parseXml(strFromU8(files['word/_rels/document.xml.rels'])).getElementsByTagName('Relationship'))){
    if(relation.getAttribute('TargetMode')==='External')continue;
    const target=posix.normalize(posix.join('word',relation.getAttribute('Target'))).replace(/^\//,'');
    if(target.startsWith('word/media/'))relations.set(relation.getAttribute('Id'),target);
  }
  const document=parseXml(strFromU8(files['word/document.xml'])),paragraphs=[];
  const body=Array.from(document.getElementsByTagName('*')).find(n=>local(n)==='body');
  function paragraph(node) {
    const images=[];
    function walk(element) {
      const name=local(element);
      if(name==='oMath')return '$'+ommlToLatex(element)+'$';
      if(name==='pPr'||name==='rPr')return '';
      if(name==='t')return element.textContent||'';
      if(name==='tab')return ' ';
      if(name==='br')return '\n';
      if(name==='blip'||name==='imagedata') {
        const id=element.getAttribute('r:embed')||element.getAttribute('r:id');
        if(id&&relations.has(id)&&!images.includes(id)){images.push(id);return `【图 ${id}】`;}
      }
      if(name==='r') {
        const text=children(element).filter(c=>local(c)!=='rPr').map(walk).join('');
        const vertical=attr(child(child(element,'rPr'),'vertAlign'),'val');
        return vertical==='superscript'?`$^{${latexText(text)}}$`:vertical==='subscript'?`$_{${latexText(text)}}$`:text;
      }
      return children(element).map(walk).join('');
    }
    paragraphs.push({index:paragraphs.length,text:walk(node).trim(),images,style:attr(child(child(node,'pPr'),'pStyle'),'val')});
  }
  function blocks(node) {for(const element of children(node)){if(local(element)==='p')paragraph(element);else if(['tbl','tr','tc','sdt','sdtContent'].includes(local(element)))blocks(element);}}
  blocks(body);
  const media=new Map();for(const [id,path] of relations)if(files[path])media.set(id,{id,path,data:files[path],extension:extname(path).toLowerCase()});
  return {paragraphs,media};
}
