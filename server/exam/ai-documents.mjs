import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join,basename,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {extractAIDocx} from './ai-docx.mjs';
import {HTTPError,requireCondition} from './errors.mjs';

const exec=promisify(execFile), MAX_FILE=12*1024*1024;
export const AI_DOCUMENT_LIMITS={files:4,fileBytes:MAX_FILE,pages:12,images:16,textChars:80000};
async function image(data,name,source,number) {
  const normalized=await sharp(data,{limitInputPixels:20_000_000,animated:false}).rotate()
    .resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  return {name,source,...(number?{page:number}:{}),url:'data:image/png;base64,'+normalized.toString('base64')};
}
const base64 = data => {
  requireCondition(typeof data==='string' && data.length<=MAX_FILE*1.4 && /^[a-zA-Z0-9+/=\r\n]+$/.test(data),400,'文件内容不正确');
  const bytes=Buffer.from(data,'base64');requireCondition(bytes.length>0 && bytes.length<=MAX_FILE,413,'单个 AI 文件须小于 12 MB');
  return bytes;
};

// Server parses the actual bytes. Browser-supplied PDF OCR/text is never trusted
// as evidence about what was in the uploaded PDF.
export async function readAIDocuments(inputs=[], {signal,root=tmpdir()}={}) {
  requireCondition(Array.isArray(inputs)&&inputs.length<=AI_DOCUMENT_LIMITS.files,400,'每次最多选择 4 个文件');
  const result={documents:[],images:[],warnings:[]},names=new Set();
  for(const input of inputs) {
    if(signal?.aborted)throw new HTTPError(499,'已取消识别','ai_cancelled');
    const name=basename(String(input.filename||'').replaceAll('\\','/')).replace(/[\x00-\x1f]/g,'').slice(-160);
    requireCondition(!names.has(name.toLocaleLowerCase()),400,'上传材料存在同名文件，请先重命名以保留可靠页码出处');names.add(name.toLocaleLowerCase());
    const extension=extname(name).toLowerCase(),bytes=base64(input.data);
    requireCondition(['.pdf','.doc','.docx','.png','.jpg','.jpeg','.webp','.gif','.tif','.tiff'].includes(extension),400,
      '请选择图片、PDF、DOC 或 DOCX 文件');
    const record={name,type:extension.slice(1),text:'',pages:[],warnings:[]};
    let folder;
    try {
      if(extension==='.doc') {
        requireCondition(bytes.subarray(0,8).toString('hex')==='d0cf11e0a1b11ae1',400,'旧版 Word 文件头不正确');
        folder=await mkdtemp(join(root,'tijing-ai-'));const file=join(folder,'input.doc');
        await writeFile(file,bytes,{mode:0o600});
        let extracted;try{extracted=await exec('antiword',['-m','UTF-8.txt','-w','0',file],{timeout:15000,maxBuffer:500000,signal});}
        catch(error){throw new HTTPError(400,error.code==='ENOENT'?'服务器尚未安装旧版 Word 读取器':'旧版 Word 无法读取，请另存为 DOCX','ai_document_invalid');}
        record.text=extracted.stdout;
        requireCondition(record.text.trim(),400,'旧版 Word 未读取到正文，请另存为 DOCX');
        record.warnings.push('旧版 DOC 已读取正文和表格；嵌入公式、题图、浮动绘图及复杂版式未被可靠读取，须另存 DOCX 或补传题图。');
        record.requiresConfirmation=true;
      } else if(extension==='.docx') {
        const parsed=await extractAIDocx(bytes,{signal});
        if(signal?.aborted)throw new HTTPError(499,'已取消 Word 文件读取','ai_cancelled');
        record.text=parsed.paragraphs.map(p=>p.text).join('\n\n');
        for(const item of parsed.media.values()) {
          if(result.images.length>=AI_DOCUMENT_LIMITS.images){record.warnings.push('嵌入图片超过 16 张，未完整识别全部题图，请拆分材料后再识别。');record.requiresConfirmation=true;break;}
          try{result.images.push(await image(item.data,name+' · '+item.id,name));}
          catch{record.warnings.push('一张 Word 嵌入题图未能解码，须对照原文件确认。');record.requiresConfirmation=true;}
        }
        record.warnings.push('Word 正文、表格和 OMML 公式已提取；浮动形状、批注和复杂版式仍需对照原文件。');
      } else if(extension==='.pdf') {
        requireCondition(bytes.subarray(0,5).toString()==='%PDF-',400,'PDF 文件头不正确');
        folder=await mkdtemp(join(root,'tijing-ai-'));
        const file=join(folder,'input.pdf');await writeFile(file,bytes,{mode:0o600});
        let info;
        try{info=await exec('pdfinfo',[file],{timeout:15000,maxBuffer:128*1024,signal});}
        catch(error){throw new HTTPError(400,error.code==='ENOENT'?'服务器尚未安装 PDF 读取器':'PDF 无法读取，可能加密或损坏','ai_document_invalid');}
        const count=Number(info.stdout.match(/^Pages:\s*(\d+)/m)?.[1]);
        requireCondition(Number.isInteger(count)&&count>0&&count<=AI_DOCUMENT_LIMITS.pages,413,'AI 每次最多读取 12 页 PDF，请先拆分或裁选所需页面');
        requireCondition(!/^Encrypted:\s*yes/m.test(info.stdout),400,'请解密 PDF 后再上传');
        await exec('pdftotext',['-layout','-enc','UTF-8',file,join(folder,'text.txt')],{timeout:20000,maxBuffer:256*1024,signal});
        record.text=(await readFile(join(folder,'text.txt'),'utf8')).replace(/\x00/g,'');
        // Keep page images even when a PDF has a text layer: equations and diagrams
        // must be checked against actual page pixels by the vision model.
        await exec('pdftoppm',['-f','1','-l',String(count),'-scale-to','1500','-png',file,join(folder,'page')],{timeout:45000,maxBuffer:256*1024,signal});
        const pages=(await readdir(folder)).filter(n=>/^page-\d+\.png$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
        requireCondition(pages.length===count,400,'PDF 原页读取不完整，请重新导出 PDF');
        for(const page of pages) {
          requireCondition(result.images.length<AI_DOCUMENT_LIMITS.images,413,'上传材料总页图超过 16 张，请拆分后读取');
          const number=Number(page.match(/\d+/)[0]);record.pages.push(number);
          result.images.push(await image(await readFile(join(folder,page)),name+' · 第 '+number+' 页',name,number));
        }
        record.warnings.push('PDF 原页与文字层共同读取；扫描文字和公式仍需人工确认。');
      } else {
        requireCondition(result.images.length<AI_DOCUMENT_LIMITS.images,413,'上传材料总题图超过 16 张，请拆分后读取');
        result.images.push(await image(bytes,name,name));record.warnings.push('题图由视觉模型识别，看不清的条件会标为待确认。');
      }
      requireCondition(record.text.length<=AI_DOCUMENT_LIMITS.textChars,413,'文件正文过长，请缩小资料范围');
      record.text=record.text.trim();result.documents.push(record);
    } catch(error) {
      if(error instanceof HTTPError)throw error;
      throw new HTTPError(400,signal?.aborted?'已取消文件读取':'文件读取失败，请检查图片或文档是否损坏','ai_document_invalid');
    } finally {if(folder)await rm(folder,{recursive:true,force:true});}
  }
  requireCondition(result.documents.reduce((n,d)=>n+d.text.length,0)<=AI_DOCUMENT_LIMITS.textChars,413,'资料文字总量过大，请拆分');
  result.warnings=result.documents.flatMap(d=>d.warnings);
  return result;
}
