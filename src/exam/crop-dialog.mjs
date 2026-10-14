export function createCropDialog(dialog,onSave){
 const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d');let source,rect=null,start=null,image;
 const point=e=>{const box=canvas.getBoundingClientRect();return [Math.max(0,Math.min(canvas.width,(e.clientX-box.left)*canvas.width/box.width)),Math.max(0,Math.min(canvas.height,(e.clientY-box.top)*canvas.height/box.height))];};
 function draw(){if(!image)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);if(rect){ctx.fillStyle='rgba(26,132,145,.16)';ctx.fillRect(...rect);ctx.strokeStyle='#168391';ctx.lineWidth=Math.max(2,canvas.width/400);ctx.setLineDash([10,6]);ctx.strokeRect(...rect);ctx.setLineDash([]);}dialog.querySelector('.crop-size').textContent=rect?Math.round(rect[2])+' × '+Math.round(rect[3])+' 像素':'拖动框选要保留的题目区域';}
 canvas.addEventListener('pointerdown',e=>{start=point(e);canvas.setPointerCapture(e.pointerId);rect=[...start,0,0];draw();});
 canvas.addEventListener('pointermove',e=>{if(!start)return;const p=point(e);rect=[Math.min(start[0],p[0]),Math.min(start[1],p[1]),Math.abs(p[0]-start[0]),Math.abs(p[1]-start[1])];draw();});
 canvas.addEventListener('pointerup',()=>{start=null;});canvas.addEventListener('pointercancel',()=>{start=null;});
 dialog.querySelector('[data-crop-action="save"]').addEventListener('click',async()=>{
  if(!rect||rect[2]<8||rect[3]<8){dialog.querySelector('.crop-size').textContent='请先框选题目区域';return;}
  const output=document.createElement('canvas');output.width=Math.round(rect[2]);output.height=Math.round(rect[3]);output.getContext('2d').drawImage(image,...rect,0,0,output.width,output.height);
  const payload={source,url:output.toDataURL('image/png'),rect:rect.map(Math.round),mode:dialog.querySelector('input[name="crop-mode"]:checked').value,title:dialog.querySelector('#crop-title').value,text:dialog.querySelector('#crop-text').value};
  try{await onSave(payload);dialog.close();}catch(error){dialog.querySelector('.crop-size').textContent=error.message;}
 });
 return {async open(asset,defaultTitle){source=asset;rect=null;image=new Image();image.src=asset.url;await image.decode();canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;dialog.querySelector('#crop-title').value=defaultTitle||'新题目';dialog.querySelector('#crop-text').value='';draw();dialog.showModal();}};
}
