'use strict';
// File drops use the same inputs, preview and save queue as choosing a file.
function uploadFileError(files, kind = 'image', multiple = false) {
  if (!files.length) return 'Drop a file from your computer.';
  if (!multiple && files.length !== 1) return 'Choose one file at a time for this image or video.';
  for (const file of files) {
    if (kind === 'video') {
      const extension = file.name.toLowerCase().match(/\.(mp4|webm)$/)?.[1];
      if (!extension || (file.type && file.type !== 'video/'+extension)) return 'Choose an MP4 or WebM video.';
      if (!file.size || file.size > C.maxVideoBytes) return 'Use a previs video smaller than 25 MB.';
    } else {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type)) return 'Choose a PNG, JPEG or WebP image.';
      if (!file.size || file.size > 15*1024*1024) return 'Use an image smaller than 15 MB.';
    }
  }
  return '';
}
function decorateUploadTargets() {
  document.querySelectorAll('input[type="file"]').forEach(input => {
    if (!/image|video/.test(input.accept)) return;
    const label = input.closest('label');
    if (!label) return;
    label.classList.add('file-drop-zone');
    if (!label.querySelector('.file-drop-hint')) {
      const hint = document.createElement('span');
      hint.className = 'file-drop-hint'; hint.setAttribute('role','status');
      hint.textContent = /video/.test(input.accept) ? 'Drop a video here or choose a file' : 'Drop images here or choose a file';
      label.append(hint);
    }
  });
}
function resetUploadHints(form) {
  form.querySelectorAll('.file-drop-zone').forEach(label=>{
    const input=label.querySelector('input[type="file"]'),hint=label.querySelector('.file-drop-hint');
    if(hint){hint.textContent=input?.accept.includes('video')?'Drop a video here or choose a file':'Drop images here or choose a file';hint.classList.remove('drop-error');}
  });
}
function fileDropTarget(node) {
  if (!node?.closest) return null;
  const pencil = node.closest('[data-edit-image]') || node.closest('.editable-image')?.querySelector('[data-edit-image]');
  if (pencil) return {element:pencil, pencil};
  const label = node.closest('.file-drop-zone');
  const input = label?.querySelector('input[type="file"]');
  return input ? {element:label,input} : null;
}
function setUploadFiles(input, files) {
  const transfer = new DataTransfer();
  files.forEach(file => transfer.items.add(file));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));
}
function fileDropMessage(target, message, error = false) {
  if (target.pencil) {
    setMessage(message,error);
  } else {
    const hint=target.element.querySelector('.file-drop-hint');
    if (hint) {hint.textContent=message;hint.classList.toggle('drop-error',error);}
  }
}
function clearFileDropHighlights() {
  document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
}
document.addEventListener('dragover',event=>{
  if (!Array.from(event.dataTransfer?.types||[]).includes('Files')) return;
  event.preventDefault();
  const target=fileDropTarget(event.target);
  const allowed=target && canEditProject() && !uploading && !(target.input||target.pencil).disabled;
  event.dataTransfer.dropEffect=allowed?'copy':'none';
  clearFileDropHighlights();
  if (allowed) target.element.classList.add('drag-over');
});
document.addEventListener('dragleave',event=>{
  const target=fileDropTarget(event.target);
  if (target && !target.element.contains(event.relatedTarget)) target.element.classList.remove('drag-over');
});
document.addEventListener('drop',event=>{
  const files=Array.from(event.dataTransfer?.files||[]);
  if (!files.length) return;
  event.preventDefault();clearFileDropHighlights();
  const target=fileDropTarget(event.target);
  if (!target) return;
  if (!canEditProject() || uploading || (target.input||target.pencil).disabled) {
    fileDropMessage(target,'Connect GitHub with repository write access to upload files.',true);return;
  }
  const error=uploadFileError(files,target.input?.accept.includes('video')?'video':'image',target.input?.multiple||false);
  if (error) {fileDropMessage(target,error,true);return;}
  if (target.pencil) {
    openImageEditor(target.pencil.dataset.editImage);
    if ($('thumbnailDialog').open) setUploadFiles($('thumbnailFile'),files);
  } else setUploadFiles(target.input,files);
});
document.addEventListener('change',event=>{
  if (event.target.type!=='file') return;
  const target=fileDropTarget(event.target);
  if (!target || target.pencil) return;
  const files=Array.from(event.target.files||[]);
  if (!files.length) {fileDropMessage(target,'Drop files here or choose a file');return;}
  const error=uploadFileError(files,event.target.accept.includes('video')?'video':'image',event.target.multiple);
  fileDropMessage(target,error || (files.length===1?files[0].name:`${files.length} images selected · ready to upload`),!!error);
});

let assignmentTarget=null;
function sectionAssignment(item,group) {
  return `<button class="section-assignment" type="button" data-assign-section="${group}:${esc(item.id)}" aria-label="Assign all tasks in ${esc(item.name)}" title="Assign this whole section">${taskTeamSummary(item)}<span class="assignment-chevron" aria-hidden="true">⌄</span></button>`;
}
function openSectionAssignment(group,id) {
  const item=data[group]?.find(item=>item.id===id&&!item.archived);
  if (!item || !canEditProject()) return;
  assignmentTarget={group,id};
  $('assignmentTitle').textContent=`Assign ${item.name}`;
  $('assignmentHelp').textContent=`Choose one person for all ${item.tasks.length} subtasks, including tasks hidden by filters. New subtasks inherit that person. You can still change individual assignments later.`;
  const current=item.tasks.length?(item.tasks.every(t=>t.owner===item.tasks[0].owner)?item.tasks[0].owner:null):item.owner;
  $('assignmentPeople').innerHTML=['',...data.team].map(name=>`<button class="assignee-button member-${memberColor(name)}" type="button" data-assign-section-person="${esc(name)}" aria-label="Assign whole section to ${esc(name||'Unassigned')}" aria-pressed="${current===name}"><span class="member-avatar">${esc(name.charAt(0)||'–')}</span>${esc(name||'Unassigned')}</button>`).join('');
  $('assignmentDialog').showModal();applyEditorAccess();
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-assign-section]');
  if (button) openSectionAssignment(...button.dataset.assignSection.split(':'));
  const person=event.target.closest('[data-assign-section-person]');
  if (person && assignmentTarget && canEditProject() && !uploading) {
    const target={...assignmentTarget};
    commit({kind:'assignSection',...target,value:person.dataset.assignSectionPerson});
    $('assignmentDialog').close();
    if (detail?.group===target.group && detail.id===target.id) {
      saveUnfinishedFields($('detailDialog'));openDetail(target.group,target.id);
    }
  }
});

function renderPreviewContent() {
  const media=data.previewMedia;
  const url=media?M.src(media.path):C.safeUrl(data.preview);
  const video=media || /\.(mp4|webm|ogg)(\?|$)/i.test(url);
  $('previewContent').innerHTML=url ? video ? `<video src="${esc(url)}" ${media?`type="${media.type}"`:''} controls playsinline preload="metadata"></video><p class="help previs-name">${esc(media?.name||'Latest project previs')}${media?` · ${(media.size/1024/1024).toFixed(1)} MB`:''}</p><p id="previsPlaybackError" class="image-error" role="status"></p>` : `<p class="help">Your latest animatic is on a shared video page.</p><a class="button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open latest previs ↗</a>` : '<div class="empty"><h3>Give the film a first pass</h3><p>Upload a rough edit, animatic or previs below.</p></div>';
  $('previewContent').querySelector('video')?.addEventListener('error',()=>{
    $('previsPlaybackError').textContent='This video could not play yet. If it was just shared, reopen Previs shortly. For best compatibility, export an H.264 MP4 review copy.';
  });
  $('previsUploadForm').reset();
  resetUploadHints($('previsUploadForm'));
  $('previsUploadButton').textContent=media?'Replace previs ↑':'Upload previs ↑';
  $('previsUploadError').textContent='';
}
async function uploadPrevis(form) {
  if (!canEditProject() || uploading) return;
  const file=form.elements.video.files[0];if(!file)return;
  uploading=true;applyEditorAccess();$('previsUploadError').textContent='';
  try {
    const prepared=M.prepareVideo(file),path=`uploads/${newId('previs')}.${prepared.extension}`;
    await M.store(path,prepared.blob);
    commit({kind:'project',field:'previewMedia',value:{path,name:file.name.slice(0,200),size:file.size,type:prepared.type}});
    renderPreviewContent();
  } catch(error) {$('previsUploadError').textContent=error.message||'Could not save this video.';}
  finally {uploading=false;applyEditorAccess();}
}
document.addEventListener('submit',event=>{
  if (event.target.id==='previsUploadForm') {event.preventDefault();uploadPrevis(event.target);}
});
document.addEventListener('click',event=>{
  if (event.target.closest('#uploadPrevisSettings')) {$('settingsDialog').close();openPreview();}
});
function backupMediaEntries(raw) {
  const images=raw.localImages||[],videos=raw.localMedia||[];
  if (!Array.isArray(images)||!Array.isArray(videos)||images.length+videos.length>500) throw new Error('Backup contains invalid media data.');
  const paths=imagePaths(C.validate(raw));
  const entries=[...images.map(i=>({...i,type:'image/webp'})),...videos];
  const seen=new Set();
  for (const entry of entries) {
    const isVideo=C.videoPath(entry.path);
    const validPath=entry.type==='image/webp'?C.imagePath(entry.path):isVideo && entry.type===(entry.path.endsWith('.mp4')?'video/mp4':'video/webm');
    const limit=isVideo?Math.ceil(C.maxVideoBytes/3)*4:7000000;
    if (!validPath || !paths.has(entry.path) || seen.has(entry.path) || typeof entry.base64!=='string' || !entry.base64.length || entry.base64.length>limit || entry.base64.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.base64)) throw new Error('Backup contains invalid media data.');
    seen.add(entry.path);
  }
  return entries;
}
