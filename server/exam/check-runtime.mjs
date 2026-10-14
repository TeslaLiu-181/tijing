import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {constants as fsConstants} from 'node:fs';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const exec=promisify(execFile);
async function readable(relative){try{await access(fileURLToPath(new URL(relative,import.meta.url)),fsConstants.R_OK);return true;}catch{return false;}}
async function command(name,args){
 try{await exec(name,args,{timeout:5000,maxBuffer:65536});return true;}
 catch(error){return name==='antiword'&&error.code===1&&/antiword/i.test(String(error.stderr)+String(error.stdout));}
}
const [pdfinfo,pdftotext,pdftoppm,antiword]=await Promise.all([
 command('pdfinfo',['-v']),command('pdftotext',['-v']),command('pdftoppm',['-v']),command('antiword',['-h'])]);
let image=false;try{const bytes=await sharp({create:{width:1,height:1,channels:3,background:'#ffffff'}}).png().toBuffer();image=bytes.length>0;}catch{}
const publicFiles=['../../dist/exam/web.html','../../dist/exam/web-host.js','../../dist/exam/app.js','../../dist/exam/planar.html','../../dist/exam/example4.html','../../dist/exam/supplement.html','../../dist/exam/web.css','../../dist/exam/style.css','../../dist/exam/math.css'];
const unreadable=[];for(const path of publicFiles)if(!await readable(path))unreadable.push(path);
const report={node:process.versions.node,nodeSupported:/^24\./.test(process.versions.node),
 physicsWorker:await readable('./ai-harness-worker.mjs'),agentWorker:await readable('./ai-agent-worker.mjs'),docxWorker:await readable('./ai-docx-worker.mjs'),staticAssets:{ready:unreadable.length===0,unreadable},image,
 pdf:{ready:pdfinfo&&pdftotext&&pdftoppm,pdfinfo,pdftotext,pdftoppm},legacyDoc:{ready:antiword,antiword}};
console.log(JSON.stringify(report,null,2));
if(!report.nodeSupported||!report.physicsWorker||!report.agentWorker||!report.docxWorker||!report.staticAssets.ready||!image||!report.pdf.ready||!antiword){
 console.error('运行依赖或文件读取权限未就绪，请用实际服务账号检查。仅公开程序和静态资源应可读，私有配置保持受限。Ubuntu/Debian可安装：poppler-utils antiword；然后重新执行 npm run check:runtime。');process.exitCode=1;
}
