'use strict';
let annotationSession=null;
function annotationDirty(){const f=document.getElementById('annotationForm');return !!annotationSession&&(annotationSession.strokes.length>0||!!f?.elements.body.value.trim());}
function closeAnnotation(){if(uploading)return;if(annotationDirty()&&!confirm('Discard this unfinished drawing and comment?'))return;document.getElementById('annotationDialog').close();}
function paintAnnotation(){
  const s=annotationSession,c=document.getElementById('drawingCanvas');if(!s?.bitmap)return;
  const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(s.bitmap,0,0,c.width,c.height);
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const stroke of s.strokes){ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.width*c.width;ctx.beginPath();stroke.points.forEach((p,i)=>i?ctx.lineTo(p.x*c.width,p.y*c.height):ctx.moveTo(p.x*c.width,p.y*c.height));if(stroke.points.length===1){const p=stroke.points[0];ctx.arc(p.x*c.width,p.y*c.height,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
  document.getElementById('drawUndo').disabled=!canEditProject()||!s.strokes.length;document.getElementById('drawClear').disabled=!canEditProject()||!s.strokes.length;
}
async function openAnnotationViewer(key,imageId){
  const ctx=workContext(key),image=ctx.holder?.images.find(i=>i.id===imageId);if(!image)return;
  const dialog=$('annotationDialog'),canvas=$('drawingCanvas'),form=$('annotationForm');
  if(dialog.open&&annotationDirty()&&!confirm('Discard the unfinished drawing before opening another image?'))return;
  annotationSession?.bitmap?.close();annotationSession={key,imageId,source:image.path,strokes:[],bitmap:null,drawing:false,pointer:null};
  const session=annotationSession;form.reset();form.elements.author.innerHTML=option('','Choose your name',identity)+data.team.map(n=>option(n,n,identity)).join('');form.elements.target.innerHTML=option('','Everyone','')+data.team.map(n=>option(n,n,'')).join('');
  $('annotationTitle').textContent=image.caption||'Review image';$('annotationError').textContent='Loading image…';$('drawToggle').setAttribute('aria-pressed','false');canvas.classList.remove('drawing');canvas.width=1;canvas.height=1;$('drawSubmit').disabled=true;if(!dialog.open)dialog.showModal();applyEditorAccess();
  try{const response=await fetch(M.src(image.path));if(!response.ok)throw new Error('Could not load the image. Try Refresh.');const blob=await response.blob(),bitmap=await createImageBitmap(blob);if(annotationSession!==session){bitmap.close();return;}const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);session.bitmap=bitmap;paintAnnotation();$('annotationError').textContent=image.deletedAt?'This original was removed; feedback can still reference it.':'';$('drawSubmit').disabled=!canEditProject();}
  catch(error){if(annotationSession===session)$('annotationError').textContent=error.message;}
}
function annotationPointAt(e){const c=$('drawingCanvas'),r=c.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
function installAnnotationControls(){
  const c=$('drawingCanvas'),dialog=$('annotationDialog');
  c.addEventListener('pointerdown',e=>{const s=annotationSession;if(!s?.drawing||!s.bitmap||!canEditProject()||uploading||s.pointer!==null||e.button!==0)return;e.preventDefault();s.pointer=e.pointerId;c.setPointerCapture(e.pointerId);s.strokes.push({color:$('drawColor').value,width:Number($('drawWidth').value)/1000,points:[annotationPointAt(e)]});paintAnnotation();});
  c.addEventListener('pointermove',e=>{const s=annotationSession;if(s?.pointer!==e.pointerId)return;s.strokes.at(-1).points.push(annotationPointAt(e));paintAnnotation();});
  const end=e=>{if(annotationSession?.pointer!==e.pointerId)return;annotationSession.pointer=null;if(c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId);};c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
  $('drawToggle').addEventListener('click',()=>{if(!canEditProject())return;annotationSession.drawing=!annotationSession.drawing;$('drawToggle').setAttribute('aria-pressed',String(annotationSession.drawing));c.classList.toggle('drawing',annotationSession.drawing);});
  $('drawUndo').addEventListener('click',()=>{annotationSession?.strokes.pop();paintAnnotation();});$('drawClear').addEventListener('click',()=>{if(annotationSession)annotationSession.strokes=[];paintAnnotation();});
  $('annotationClose').addEventListener('click',closeAnnotation);dialog.addEventListener('cancel',e=>{e.preventDefault();closeAnnotation();});dialog.addEventListener('close',()=>{annotationSession?.bitmap?.close();annotationSession=null;});
  $('annotationForm').addEventListener('submit',async e=>{
    e.preventDefault();if(uploading||!canEditProject()||!annotationSession?.bitmap)return;
    const s=annotationSession,f=e.target,body=f.elements.body.value.trim(),author=f.elements.author.value,target=f.elements.target.value;if(!body||!author)return;
    uploading=true;applyEditorAccess();$('annotationError').textContent='Saving feedback…';
    try{let annotation;if(s.strokes.length){const blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',.92));if(!blob)throw new Error('Could not save the drawing.');const path=`uploads/${newId('annotation')}.webp`;await M.store(path,blob);annotation={path,source:s.source,width:c.width,height:c.height};}if(!postWorkComment(s.key,body,author,target,s.imageId,annotation))throw new Error('Feedback could not be saved.');f.reset();s.strokes=[];dialog.close();}
    catch(error){$('annotationError').textContent=error.message;}finally{uploading=false;applyEditorAccess();if(!dialog.open)renderSharedUpdate();}
  });
}
function installSafeDialogDismissal(dialog){
  let start=null;const outside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
  dialog.addEventListener('pointerdown',e=>{start=e.button===0&&outside(e)?{x:e.clientX,y:e.clientY,id:e.pointerId}:null;});
  dialog.addEventListener('pointerup',e=>{const deliberate=start&&start.id===e.pointerId&&outside(e)&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<6;start=null;if(!deliberate||uploading)return;if(dialog.id==='annotationDialog')closeAnnotation();else dialog.close();});
  dialog.addEventListener('pointercancel',()=>{start=null;});
}
