const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('examNative',{
 call:(method,args)=>ipcRenderer.invoke('exam:call',{method,args}),
 onClose:callback=>{ipcRenderer.on('exam:close',()=>callback());},
 onProgress:callback=>{ipcRenderer.on('exam:progress',(_event,data)=>callback(data));},
 onPDF:callback=>{ipcRenderer.on('exam:pdf',(_event,data)=>callback(data));},
 replyPDF:(id,result,error)=>ipcRenderer.send('exam:pdf-reply',{id,result,error})
});
