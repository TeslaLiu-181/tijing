import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,extname,basename} from 'node:path';
import {PaperStore} from './store.mjs';
import {importSource} from '../../src/exam/documents.mjs';
import {validatePaper,clone,uid,limitText,newPaper} from '../../src/exam/model.mjs';
import {htmlPaper,readJSONResource,importResource,exportResource,scriptJSON} from '../../src/exam/resources.mjs';

export async function offlineHTML(paper,resourceDir){
 const [template,script,css,math,planar,spatial]=await Promise.all(['index.html','app.js','style.css','math.css','planar.html','example4.html'].map(n=>readFile(join(resourceDir,n),'utf8')));
 let html=template.replace('<script src="pdf-host.js"></script>','').replace('<link rel="stylesheet" href="math.css">',()=>'<style>'+math+'</style>').replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+css+'</style>');
 html=html.replace('<script src="app.js"></script>',()=>'<script>'+script.replace(/<\/script/gi,'<\\/script')+'</script>');
 const engines={planar,example4:spatial};if(paper.questions.some(q=>q.scenes.some(s=>s.kind==='supplement')))engines.supplement=await readFile(join(resourceDir,'supplement.html'),'utf8');
 const data='<script id="paper-data" type="application/json">'+scriptJSON(validatePaper(paper,{portable:true}))+'</script><script id="engine-data" type="application/json">'+scriptJSON(engines)+'</script>';
 return html.replace('</head>',()=>data+'</head>');
}
export class ExamBackend{
 constructor({dataDir,resourceDir,renderPDF,onProgress=()=>{}}){this.dataDir=dataDir;this.resourceDir=resourceDir;this.store=new PaperStore(join(dataDir,'papers'));this.renderPDF=renderPDF;this.onProgress=onProgress;this.imports=new Map();}
 async init(){await this.store.init();const list=await this.store.list();const paper=list.find(p=>!p.error)?await this.store.open(list.find(p=>!p.error).id):await this.store.create('我的试卷');return this.state(paper);}
 async state(paper){return {papers:await this.store.list(),paper:await this.store.forUI(paper),directory:this.store.root};}
 async open(id){return this.state(await this.store.open(id));}
 async create(title){return this.state(await this.store.create(limitText(title)));}
 async save(paper){return this.store.save(paper);}
 async previewDocuments(input,paths){
  const current=validatePaper(input),staging={...clone(current),questions:[],sources:[]},errors=[];
  // Assets are saved independently, but candidates do not replace the active
  // paper until the teacher chooses what to import.
  const adapter={newQuestion:(...args)=>this.store.newQuestion(...args),addAsset:(...args)=>this.store.addAsset(...args),writeAsset:(...args)=>this.store.writeAsset(...args),save:async()=>{}};
  for(const path of paths)try{this.onProgress({message:'正在读取 '+basename(path)});await importSource(adapter,staging,path,{renderPdf:this.renderPDF,onProgress:p=>this.onProgress({message:'保存原页 '+p.completed+' / '+p.total})});}catch(error){errors.push(basename(path)+'：'+error.message);}
  if(!staging.questions.length)throw Error(errors.join('\n')||'没有可导入的内容');
  const id=uid();this.imports.set(id,{paperId:current.id,staging});const ui=await this.store.forUI(staging);
  return {id,candidates:ui.questions,sources:ui.sources,assets:ui.assets,errors};
 }
 async commitDocuments(input,{id,questions}){
  const pending=this.imports.get(id);if(!pending||pending.paperId!==input.id)throw Error('导入候选已过期，请重新读取文档');
  if(!Array.isArray(questions)||!questions.length)throw Error('至少选择一道题或待整理原页');
  const paper=validatePaper(input);Object.assign(paper.assets,pending.staging.assets);paper.sources.push(...pending.staging.sources);paper.questions.push(...clone(questions));
  paper.activeQuestionId=questions[0].id;paper.revision++;await this.store.save(paper);this.imports.delete(id);return this.state(paper);
 }
 discardDocuments(id){this.imports.delete(id);return true;}
 async importFile(path){
  const extension=extname(path).toLowerCase(),bytes=await readFile(path);if(bytes.length>200*1024*1024)throw Error('资源文件超过200 MB');
  if(extension==='.html'){const paper=await this.store.importPortable(htmlPaper(bytes.toString('utf8')));return {type:'paper',...await this.state(paper)};}
  if(extension==='.json'){const data=readJSONResource(bytes.toString('utf8'));if(data.type==='scene')return data;const paper=await this.store.importPortable(data.paper);return {type:'paper',...await this.state(paper)};}
  const paper=await this.store.importPortable(importResource(new Uint8Array(bytes)));return {type:'paper',...await this.state(paper)};
 }
 async export(input,{path,kind,includeOriginals=true}){
  const paper=await this.store.portable(input,{includeOriginals});
  const content=kind==='html'?await offlineHTML(paper,this.resourceDir):kind==='json'?JSON.stringify(paper,null,2):exportResource(paper,{includeOriginals});
  await writeFile(path,content);return {path,kind};
 }
 async addImage(input,args){return this.store.addDataImage(input,args);}
 async close(){await this.store.flush();}
}
