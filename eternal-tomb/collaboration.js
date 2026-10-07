'use strict';
// GitHub remains the authority for shared writes. No shared credentials are shipped.
let editorAccess = {verified:false,canEdit:false,login:'',message:'Connect GitHub to edit the shared project.'};
let verifiedToken = '', verifyingAccess = false;
const unfinishedFields = new Set();
const MUTATIONS = '[data-assign-section],[data-assign-section-person],#previsUploadForm input,#previsUploadForm button,[data-edit-image],[data-field],[data-shot-dependency],[data-task-field],[data-task-id],[data-task-status],[data-task-check],[data-task],[data-assign-task],[data-remove-task],[data-confirm-remove-task],[data-review-decision],[data-comment-resolve],[data-task-comment-resolve],[data-milestone],[data-vfield],[data-cover],[data-upload-angle],[data-delete-version],[data-restore-version],[data-move-shot],[data-archive-shot],[data-restore-shot],#newShotButton,#newVersionButton,#firstVersionButton,#importButton,#newShotForm input,#newShotForm textarea,#newShotForm button[type="submit"],#newVersionForm input,#newVersionForm textarea,#newVersionForm select,#newVersionForm button[type="submit"],#deleteEntryForm button[type="submit"],#thumbnailForm input,#thumbnailForm button[type="submit"],#addTaskForm input,#addTaskForm button,#uploadForm input,#uploadForm select,#uploadForm button,#feedbackForm textarea,#feedbackForm button,#taskFeedbackForm textarea,#taskFeedbackForm button,#taskUploadForm input,#taskUploadForm button,[data-detail-upload] input,[data-detail-upload] button';
function canEditProject(){return editorAccess.canEdit && verifiedToken === token;}
function applyEditorAccess(){
  const allowed=canEditProject();
  if(typeof decorateUploadTargets==='function')decorateUploadTargets();
  document.querySelectorAll(MUTATIONS).forEach(el=>{el.disabled=!allowed || uploading || el.hasAttribute('data-fixed-disabled'); if(!allowed)el.title='Connect a GitHub account with repository write access to edit.';else if(el.title==='Connect a GitHub account with repository write access to edit.')el.removeAttribute('title');});
  const status=$('accessStatus');if(status&&status.textContent!==editorAccess.message)status.textContent=editorAccess.message;
  const button=$('connectButton'),label=allowed?`@${editorAccess.login}`:'Connect GitHub';if(button&&button.textContent!==label)button.textContent=label;
  const form=$('settingsForm');if(form?.elements)for(const key of ['title','deadline','team','preview'])form.elements[key].disabled=!allowed;
}
async function verifyEditorAccess(candidate=token){
  if(verifyingAccess)return false;
  if(!candidate){verifiedToken='';editorAccess={verified:false,canEdit:false,login:'',message:'Viewing the shared project · connect GitHub to edit.'};applyEditorAccess();return false;}
  verifyingAccess=true;editorAccess.message='Checking GitHub account and repository access…';applyEditorAccess();
  try{
    const request={headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${candidate}`,'X-GitHub-Api-Version':'2022-11-28'},cache:'no-store'};
    const userResponse=await fetch('https://api.github.com/user',request);
    if(!userResponse.ok)throw new Error(userResponse.status===401?'This token has expired or is invalid.':'GitHub account verification is unavailable.');
    const user=await userResponse.json();
    const repoResponse=await fetch('https://api.github.com/repos/jens-lund/mail-shot-tracker',request);
    if(!repoResponse.ok)throw new Error('This token cannot access the tracker repository.');
    const repo=await repoResponse.json(), allowed=repo.permissions?.push === true;
    if(candidate!==token)return false;
    verifiedToken=candidate;editorAccess={verified:true,canEdit:allowed,login:user.login,message:allowed?`@${user.login} · repository editor · live updates on`:`@${user.login} · read only · ask Jens for repository write access.`};
    if(!identity)identity=data.team.find(name=>user.login.toLowerCase().startsWith(name.toLowerCase()) || user.name?.toLowerCase().startsWith(name.toLowerCase()))||user.login;
    return allowed;
  }catch(error){
    // An already verified editor can keep their offline queue during a connection failure.
    if(candidate!==verifiedToken || !(error instanceof TypeError))editorAccess={verified:false,canEdit:false,login:'',message:error.message};
    else editorAccess.message=`@${editorAccess.login} · offline · edits will retry when connected`;
    return canEditProject();
  }finally{verifyingAccess=false;applyEditorAccess();}
}
function hasUnfinishedFields(){for(const el of unfinishedFields)if(el.isConnected && (!el.closest?.('dialog') || el.closest('dialog').open))return true;return false;}
function saveUnfinishedFields(container){for(const el of [...unfinishedFields])if(el.isConnected&&container.contains(el)){el.dispatchEvent(new Event('change',{bubbles:true}));unfinishedFields.delete(el);}}
function rememberEditorFocus(){
  const el=document.activeElement;if(!el?.matches?.('input,textarea,select'))return null;
  const attributes=['data-field','data-task-field','data-task-id','data-task-status','data-vfield'];
  const selector=el.id?`#${el.id}`:attributes.filter(a=>el.hasAttribute(a)).map(a=>`[${a}="${el.getAttribute(a)}"]`).join('');
  return selector?{selector,start:el.selectionStart,end:el.selectionEnd}:null;
}
function restoreEditorFocus(saved){if(!saved)return;const el=document.querySelector(saved.selector);if(el){el.focus({preventScroll:true});if(saved.start!==null&&saved.start!==undefined)el.setSelectionRange?.(saved.start,saved.end);}}
function updateLiveNotice(){const notice=$('liveNotice');if(notice){notice.hidden=!sharedViewPending;notice.textContent='Team updates received · finish your edit to show the latest changes.';}}
function shotControls(shot){
  const shots=C.activeShots(data),i=shots.indexOf(shot);
  return `<div class="shot-controls"><button class="button subtle" data-open="shots:${shot.id}" aria-label="Edit ${esc(shot.name)}">${pencil} Edit shot</button><button class="button subtle" data-move-shot="${shot.id}:-1" aria-label="Move ${esc(shot.name)} earlier" ${i===0?'disabled data-fixed-disabled':''}>↑</button><button class="button subtle" data-move-shot="${shot.id}:1" aria-label="Move ${esc(shot.name)} later" ${i===shots.length-1?'disabled data-fixed-disabled':''}>↓</button><button class="text-button danger" data-archive-shot="${shot.id}" aria-label="Delete ${esc(shot.name)}">Delete</button></div>`;
}
function shotFields(shot){return `<div class="shot-production-fields"><div class="field-grid"><label>Duration in seconds<input type="number" data-field="duration" value="${shot.duration||''}" min="0" max="600" step="0.1" placeholder="Not set"></label><label>Camera / lens / movement<input data-field="camera" value="${esc(shot.camera)}" maxlength="1000" placeholder="e.g. 35 mm · high cliff · slow push in"></label></div><fieldset class="shot-dependencies"><legend>Assets needed in this shot</legend>${data.assets.map(asset=>`<label><input type="checkbox" data-shot-dependency="${asset.id}" ${shot.dependencies.includes(asset.id)?'checked':''}>${esc(asset.name)}</label>`).join('')}</fieldset></div>`;}
function deletedShots(){const shots=data.shots.filter(s=>s.archived);return shots.length?`<details class="trash-list"><summary>Deleted shots (${shots.length})</summary><p class="help">Tasks, images and feedback are kept for recovery.</p>${shots.map(s=>`<div class="trash-row"><strong>${esc(s.name)}</strong><button class="button subtle" data-restore-shot="${s.id}">Restore shot</button></div>`).join('')}</details>`:'';}
function versionHistory(asset,version){return C.activeVersions(asset).slice().reverse().map(v=>`<div class="version-history-row"><button class="version-select ${v.id===version?.id?'selected':''}" data-select-version="${v.id}"><strong>${esc(v.title)}</strong><span>${esc(VERSION_LABELS[v.status])} · ${v.images.length} images</span><small>${esc(v.owner||'Unassigned')} · ${dateText(v.createdAt.slice(0,10))}</small><small>${v.comments.filter(c=>!c.resolved).length} open comments</small></button><button class="version-delete" data-delete-version="${v.id}" aria-label="Delete ${esc(v.title)}" title="Delete version">${trashIcon()}</button></div>`).join('')||'<p class="help">No versions yet.<br>Create your first working version.</p>';}
function trashIcon(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';}
function deletedVersions(asset){const versions=asset.versions.filter(v=>v.deletedAt);return versions.length?`<details class="trash-list"><summary>Deleted versions (${versions.length})</summary>${versions.map(v=>`<div class="trash-row"><span>${esc(v.title)}</span><button class="text-button" data-restore-version="${v.id}">Restore</button></div>`).join('')}</details>`:'';}
function openNewShot(){if(!canEditProject())return;const form=$('newShotForm');form.reset();$('newShotDialog').showModal();}
function requestRemoval(kind,id,title){
  if(!canEditProject())return;
  const form=$('deleteEntryForm');form.dataset.kind=kind;form.dataset.entry=id;form.dataset.asset=versionAsset;
  $('deleteEntryTitle').textContent=`Delete ${title}?`;
  $('deleteEntryHelp').textContent=kind==='version'?'This version leaves the active history. Its images and comments are kept under Deleted versions, where you can restore it.':'This shot leaves the cinematic, task lists and progress counts. Restore it from Deleted shots to recover all its work.';
  $('deleteEntryDialog').showModal();
}
async function initializeTracker(){
  navigate();localSave();
  await verifyEditorAccess();await refresh();
  M.hydrate().then(()=>render());
}
document.addEventListener('input',e=>{if(e.target.matches?.('[data-field],[data-task-field],[data-vfield]'))unfinishedFields.add(e.target);},true);
document.addEventListener('change',e=>unfinishedFields.delete(e.target),true);
document.addEventListener('click',e=>{
  const close=e.target.closest('[data-close="detailDialog"]');if(close)saveUnfinishedFields($('detailDialog'));
  if(e.target.closest('#connectButton')){openSettings();return;}
  const mutation=e.target.closest(MUTATIONS+', [data-shot-dependency]');
  if(mutation&&!canEditProject()){e.preventDefault();e.stopImmediatePropagation();setMessage('Connect GitHub with repository write access to edit.',true);return;}
  if(e.target.closest('#newShotButton')){openNewShot();return;}
  const move=e.target.closest('[data-move-shot]');if(move){const [id,offset]=move.dataset.moveShot.split(':'),shots=C.activeShots(data),index=shots.findIndex(s=>s.id===id),anchor=shots[index+Number(offset)];if(anchor)commit({kind:'moveShot',id,anchor:anchor.id,after:Number(offset)>0});return;}
  const removeShot=e.target.closest('[data-archive-shot]');if(removeShot){const shot=data.shots.find(s=>s.id===removeShot.dataset.archiveShot);requestRemoval('shot',shot.id,shot.name);return;}
  const restoreShot=e.target.closest('[data-restore-shot]');if(restoreShot){commit({kind:'archiveShot',id:restoreShot.dataset.restoreShot,value:false});return;}
  const removeVersion=e.target.closest('[data-delete-version]');if(removeVersion){const {asset}=currentVersion(),version=asset.versions.find(v=>v.id===removeVersion.dataset.deleteVersion);requestRemoval('version',version.id,version.title);return;}
  const restoreVersion=e.target.closest('[data-restore-version]');if(restoreVersion){const {asset}=currentVersion();commit({kind:'restoreVersion',group:'assets',id:asset.id,version:restoreVersion.dataset.restoreVersion});return;}
},true);
document.addEventListener('change',e=>{
  if(e.target.dataset.shotDependency&&detail?.group==='shots'&&canEditProject()){const item=data.shots.find(s=>s.id===detail.id),values=new Set(item.dependencies);e.target.checked?values.add(e.target.dataset.shotDependency):values.delete(e.target.dataset.shotDependency);commit({kind:'field',...detail,field:'dependencies',value:[...values]});}
});
document.addEventListener('submit',e=>{
  if(!['newShotForm','deleteEntryForm'].includes(e.target.id))return;e.preventDefault();if(!canEditProject())return;
  if(e.target.id==='deleteEntryForm'){
    const {kind,entry,asset}=e.target.dataset;
    if(kind==='version'){versionId='';comparison=false;commit({kind:'deleteVersion',group:'assets',id:asset,version:entry,value:new Date().toISOString()});}
    else commit({kind:'archiveShot',id:entry,value:true});
    $('deleteEntryDialog').close();if(tab==='versions')location.hash=`versions/${asset}/${versionId}`;
    return;
  }
  if(data.shots.length>=50){setMessage('This project can hold up to 50 shots, including deleted shots.',true);return;}
  const form=e.target,name=form.elements.name.value.trim();if(!name)return;
  const shot={id:newId('shot'),name,description:form.elements.description.value.trim(),duration:Number(form.elements.duration.value)||0,camera:form.elements.camera.value.trim(),dependencies:[],owner:'',due:'',blocked:false,blocker:'',notes:'',file:'',priority:'must',archived:false,removedTaskIds:[],tasks:['Layout','Animation','FX','Lighting','Render','Composite','Approved'].map(label=>({id:newId('task'),label,description:'',status:'todo',effort:'medium',priority:'must',due:'',owner:'',images:[],comments:[]}))};
  commit({kind:'addShot',value:shot});$('newShotDialog').close();openDetail('shots',shot.id);
});
window.addEventListener('storage',e=>{if(e.key===KEY){nextLiveCheck=0;liveRefresh();}});
// Direct view renderers also replace controls (filters, review selection, version changes).
if(typeof MutationObserver!=='undefined')new MutationObserver(applyEditorAccess).observe(document.body,{childList:true,subtree:true});
document.getElementById?.('detailDialog')?.addEventListener?.('close',()=>{saveUnfinishedFields($('detailDialog'));});
