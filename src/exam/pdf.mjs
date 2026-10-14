import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
GlobalWorkerOptions.workerSrc=new URL('./pdf.worker.mjs',location.href).href;

export async function renderPdf(data,onProgress=()=>{}) {
  const loadingTask=getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:true,
    cMapUrl:new URL('./pdf/cmaps/',location.href).href,cMapPacked:true,
    standardFontDataUrl:new URL('./pdf/standard_fonts/',location.href).href,
    wasmUrl:new URL('./pdf/wasm/',location.href).href});
  const pages=[];
  try{
    const pdf=await loadingTask.promise;
    if(pdf.numPages>80)throw new Error('一次最多导入 80 页 PDF，请先选择所需章节');
    for(let number=1;number<=pdf.numPages;number++) {
      const page=await pdf.getPage(number),plain=await page.getTextContent(),lines=[];let line='',lastY=null;
      for(const item of plain.items) {
        if(!('str' in item))continue;
        const y=item.transform[5];
        if(lastY!==null&&Math.abs(y-lastY)>3&&line.trim()){lines.push(line.trim());line='';}
        line+=item.str+(item.hasEOL?'':' ');lastY=y;
        if(item.hasEOL&&line.trim()){lines.push(line.trim());line='';lastY=null;}
      }
      if(line.trim())lines.push(line.trim());
      const unscaled=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2.3,1500/unscaled.width)});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      pages.push({number,lines,pngBase64:canvas.toDataURL('image/png').split(',')[1]});
      canvas.width=1;canvas.height=1;page.cleanup();onProgress({completed:number,total:pdf.numPages});
    }
    return pages;
  }finally{await loadingTask.destroy();}
}
