import {renderPdf} from './pdf.mjs';
window.examNative?.onPDF(async({id,data})=>{try{const pages=await renderPdf(data);window.examNative.replyPDF(id,pages);}catch(error){window.examNative.replyPDF(id,null,error.message||String(error));}});
