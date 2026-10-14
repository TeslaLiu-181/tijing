import {app,BrowserWindow,ipcMain,dialog,shell} from 'electron';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ExamBackend} from './backend.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dataArg=process.argv.find(s=>s.startsWith('--data-dir='));
app.setName('题景试卷工作台');if(dataArg)app.setPath('userData',resolve(dataArg.slice(11)));
let window,backend,allowClose=false;const pending=new Map();let sequence=0;
async function start(){
await app.whenReady();
backend=new ExamBackend({dataDir:dataArg?app.getPath('userData'):join(app.getPath('documents'),'题景试卷'),resourceDir:join(root,'dist/exam'),onProgress:progress=>window?.webContents.send('exam:progress',progress),renderPDF:data=>new Promise((resolve,reject)=>{
 const id='pdf-'+(++sequence),timer=setTimeout(()=>{pending.delete(id);reject(Error('PDF 读取超时，请先拆分较长的文档'));},180000);pending.set(id,{resolve,reject,timer});window.webContents.send('exam:pdf',{id,data});
})});
window=new BrowserWindow({width:1500,height:980,minWidth:980,minHeight:680,title:'题景 · 试卷可视化工作台',show:false,backgroundColor:'#f5f8f9',webPreferences:{preload:join(root,'desktop/exam/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
ipcMain.on('exam:pdf-reply',(event,message)=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return;const waiting=pending.get(message.id);if(!waiting)return;clearTimeout(waiting.timer);pending.delete(message.id);if(message.error)waiting.reject(Error(message.error));else waiting.resolve(message.result);});
ipcMain.handle('exam:call',async(event,{method,args={}})=>{
 if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('只接受工作台主窗口的操作');
 switch(method){
  case 'init':return backend.init();case 'open':return backend.open(args.id);case 'create':return backend.create(args.title);case 'save':return backend.save(args.paper);
  case 'documents':{const picked=await dialog.showOpenDialog(window,{title:'导入试卷文档',properties:['openFile','multiSelections'],filters:[{name:'试卷与原页',extensions:['pdf','docx','png','jpg','jpeg','webp','tif','tiff']}]});return picked.canceled?null:backend.previewDocuments(args.paper,picked.filePaths);}
    case 'commitDocuments':return backend.commitDocuments(args.paper,args);case 'discardDocuments':return backend.discardDocuments(args.id);
  case 'import':{const picked=await dialog.showOpenDialog(window,{title:'导入试卷资源或单场景',properties:['openFile'],filters:[{name:'可视化资源',extensions:['tijingexam','zip','html','json']}]});return picked.canceled?null:backend.importFile(picked.filePaths[0]);}
    case 'export':{const extension=args.kind==='html'?'html':args.kind==='json'?'json':'tijingexam',picked=await dialog.showSaveDialog(window,{title:'导出试卷资源',defaultPath:args.paper.title+'.'+extension,filters:[{name:'试卷资源',extensions:[extension]}]});return picked.canceled?null:backend.export(args.paper,{...args,path:picked.filePath});}
    case 'sample':return backend.importFile(join(root,'dist/exam/sample.tijingexam'));
  case 'finishClose':await backend.close();allowClose=true;window.destroy();return true;
  case 'portable':return backend.store.portable(args.paper,args);case 'image':return backend.addImage(args.paper,args);
  case 'directory':await shell.openPath(backend.store.root);return true;
  default:throw Error('未知工作台操作');
 }
});
window.on('close',event=>{if(!allowClose){event.preventDefault();window.webContents.send('exam:close');}});
window.once('ready-to-show',()=>{if(!process.argv.includes('--hidden'))window.show();});
await window.loadFile(join(root,'dist/exam/index.html'));
}
if(!app.requestSingleInstanceLock())app.quit();
else start().catch(error=>{console.error(error.stack||error);app.exit(1);});
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>{for(const waiting of pending.values()){clearTimeout(waiting.timer);waiting.reject(Error('工作台已关闭'));}pending.clear();});
