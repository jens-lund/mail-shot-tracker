'use strict';
const C = window.TrackerCore;
const M = window.TrackerMedia;
const KEY = 'eternal-tomb-project-v1';
const TOKEN_KEY = 'eternal-tomb-github-token';
const API = 'https://api.github.com/repos/jens-lund/mail-shot-tracker/contents/eternal-tomb/data/project.json';
const LABELS = {todo:'Not started', doing:'In progress', active:'In progress', review:'Review', done:'Done', blocked:'Blocked'};
const $ = id => document.getElementById(id);
const esc = (v = '') => String(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
let data = C.validate(window.ETERNAL_TOMB_SEED), pending = [], tab = 'overview', filter = '', ownerFilter = '', search = '', detail = null;
let versionAsset='troll', versionId='', identity='', comparison=false, uploading=false;
let imageEdit=null, imagePreviewURL='';
let saveTimer, saving = false, loading = false, storageOK = true, token = '', syncFailed = false;
let remoteETag = '', nextLiveCheck = 0, retryAt = 0, sharedViewPending = false;
try { token = localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem('mail-tracker-github-token') ?? ''; const cached = JSON.parse(localStorage.getItem(KEY) || 'null'); if(cached) { data = C.validate(cached.data); pending = Array.isArray(cached.pending) ? cached.pending : []; } } catch { storageOK = false; }
try {identity=localStorage.getItem('eternal-tomb-feedback-name')||'';}catch{}

function setMessage(message, warning = false) { $('saveStatus').textContent = message; $('saveDot').classList.toggle('warning', warning); }
function localSave() {
  try { localStorage.setItem(KEY, JSON.stringify({data, pending})); storageOK = true; } catch { storageOK = false; }
  if (!storageOK) setMessage('Browser storage unavailable · export a backup before leaving', true);
  else if (!canEditProject()) setMessage(pending.length ? 'Local changes waiting · connect GitHub to share' : 'Viewing shared project · connect GitHub to edit');
  else if (syncFailed) setMessage('Saved in this browser · team sync needs attention', true);
  else setMessage(pending.length ? 'Saved locally · syncing to team…' : 'Team sync up to date · live updates on');
}
function commit(op) {
  if(!canEditProject()){setMessage('Connect GitHub with repository write access to edit.',true);return;}
  captureReviewDraft();
  if(typeof C.recorded==='function'){const meta=operationDescription(op);op=C.recorded(op,editorAccess.login,identity||editorAccess.login,meta.label,meta.href,meta.targets);}
  try{const next=C.validate(C.apply(C.clone(data),op));if(JSON.stringify(next)===JSON.stringify(data))return true;data=next;}catch(error){setMessage(error.message,true);return false;}
  data.updatedAt=new Date().toISOString();pending.push(op);localSave();
  const change=op.kind==='record'?op.op:op;
  if(['field','taskField','versionField','taskImageField','versionImageField','milestoneField','checkField'].includes(change.kind)){
    sharedViewPending=true;updateLiveNotice();applyEditorAccess();
  }else render();
  clearTimeout(saveTimer); if(token) saveTimer = setTimeout(sync, 1200);return true;
}
const badge = item => `<span class="badge ${scopedStatus(item)}">${LABELS[scopedStatus(item)]}</span>`;
const progressBar = (p, green = false) => `<div class="progress ${green ? 'green' : ''}" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="Completed tasks"><span style="width:${p}%"></span></div>`;
const average = items => { const tasks = items.flatMap(x => x.tasks); return tasks.length ? Math.round(tasks.filter(t => t.status === 'done').length / tasks.length * 100) : 0; };
const teamOptions = selected => option('', 'Unassigned', selected) + (selected && !data.team.includes(selected) ? option(selected, selected, selected) : '') + data.team.map(x => option(x,x,selected)).join('');
const dateText = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '';
const pencil = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>';
function editableImage(content, target, label) {
  const [kind,id]=target.split(':'),custom=kind==='cover'&&data.assets.find(a=>a.id===id)?.cover;
  return `<div class="editable-image">${content}<button type="button" class="image-edit" data-edit-image="${esc(target)}" aria-label="Change ${esc(label)}" title="Change ${esc(label)} · or drop an image here" ${uploading?'disabled':''}>${pencil}</button>${custom?smallX(`data-reset-image="${esc(target)}"`,'Remove custom thumbnail'):''}</div>`;
}
function versionImageTarget(asset, version, image) {return `version:${asset.id}:${version.id}:${image.id}`;}
function assetCard(item) {
  const tasks=orderedTasks(item), p = scopedProgress(item), next = tasks.find(t => t.status !== 'done');
  return `<article class="asset-card" data-id="${esc(item.id)}">${editableImage(`<img class="card-image" src="${esc(M.src(item.cover || `images/${item.image}.webp`))}" alt="Current reference for ${esc(item.name)}" loading="lazy">`, `cover:${item.id}`, `${item.name} thumbnail`)}<div class="card-body"><div class="card-top"><span class="card-category">${esc(item.category)} · ${PRIORITY_LABELS[item.priority]}</span>${badge(item)}</div><h3>${esc(item.name)}</h3><p class="card-description">${esc(item.description)}</p><div class="card-progress"><div class="progress-label"><span>${tasks.filter(t=>t.status==='done').length} / ${tasks.length} tasks complete</span><strong>${p}%</strong></div>${progressBar(p)}</div><div class="stage-list">${tasks.slice(0,8).map(t=>`<a class="stage-chip status-${t.status}" href="${taskLink('assets',item,t)}" title="${esc(LABELS[t.status])} · ${esc(t.label)}"><span class="status-dot"></span>${esc(t.label)}</a>`).join('')}</div><div class="card-bottom"><span class="task-team">${sectionAssignment(item,'assets')}${item.due ? '<span class="team-due">'+esc(dateText(item.due))+'</span>' : ''}</span><button class="open-card" data-open="assets:${esc(item.id)}">Open tasks ↗</button></div>${next ? `<div class="next-task"><span>Next</span>${esc(next.label)}</div>` : `<div class="next-task"><span>✓</span>Ready for the cinematic</div>`}</div></article>`;
}
function render(force = false) {
  captureReviewDraft();
  $('brandTitle').textContent = data.title; $('projectTitle').textContent = data.title; document.title = `${data.title} · Production tracker`;
  const hero=document.querySelector('.project-hero');
  if(data.hero)hero.style.backgroundImage=`linear-gradient(90deg,#161419e8 0%,#16141994 48%,#16141912 100%),url("${M.src(data.hero)}")`;
  else hero.style.removeProperty('background-image');
  document.querySelector('.concept-label').textContent=data.hero?'PROJECT REFERENCE':'CONCEPT REFERENCE · AI GENERATED';
  document.querySelector('[data-edit-image="hero"]').disabled=uploading;
  const current = C.activeMilestones(data).find(m=>C.activeChecks(m).some(c=>!c.done));
  $('phaseLabel').textContent = current ? `Phase ${String(C.activeMilestones(data).indexOf(current)+1).padStart(2,'0')} · ${current.name}` : 'Production complete · All milestones approved';
  $('deadlineLabel').textContent = data.deadline ? `Delivery · ${dateText(data.deadline)}` : 'Set a delivery date in Settings';
  document.querySelectorAll('[data-tab]').forEach(a=>{a.classList.toggle('active', a.dataset.tab === tab); if(a.dataset.tab===tab) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); const count = a.querySelector('span'); if(count) count.textContent = a.dataset.tab==='assets' ? C.activeAssets(data).length : C.activeShots(data).length;});
  document.body.dataset.section=tab;
  renderWorkflowMetrics();
  if(!force && ((typeof hasWorkDrafts==='function'&&hasWorkDrafts()) || $('taskUploadForm')?.elements.images.files.length || $('uploadForm')?.elements.images.files.length || $('feedbackForm')?.elements.body.value.trim())){sharedViewPending=true;updateLiveNotice();return;}
  if(tab==='overview') renderOverview(current);
  if(tab==='assets') renderAssets();
  if(tab==='cinematic') renderCinematic();
  if(tab==='milestones') renderMilestones();
  if(tab==='versions') renderVersions();
  if(tab==='tasks') renderTaskList();
  if(tab==='calendar') renderCalendar();
  if(tab==='review') renderReview();
  if(tab==='activity')renderActivity();
  applyEditorAccess();
}
function renderOverview(current) {
  const checks=current&&C.activeChecks(current).filter(c=>!c.done).slice(0,3)||[];
  $('view').innerHTML=`<div class="focus-row"><section class="panel"><span class="eyebrow">NEXT MILESTONE</span><h3>${esc(current?.name||'Final delivery approved')}</h3><p>${esc(current?.description||'Your production checklist is complete.')}</p><div class="priority-list">${checks.map((c,i)=>`<div class="priority-row"><span class="priority-number">${i+1}</span><strong>${esc(c.label)}</strong></div>`).join('')}</div><a class="button subtle" href="#milestones" style="margin-top:17px">View milestones →</a></section>${dueReminder()}</div><div class="section-heading"><div><span class="eyebrow">THE PRODUCTION</span><h2>Build the world. Finish the film.</h2><p>Click a colored task to update its status, effort or deadline.</p></div><a class="text-button" href="#tasks">All tasks →</a></div><div class="asset-grid">${data.assets.filter(visibleItem).map(assetCard).join('')}</div>`;
}
function toolbar() { return `<div class="toolbar"><input id="search" aria-label="Search sections" type="search" placeholder="Search sections…" value="${esc(search)}"><select id="statusFilter" aria-label="Filter by status">${option('','All statuses',filter)}${['todo','active','review','done'].map(s=>option(s,LABELS[s],filter)).join('')}</select><select id="ownerFilter" aria-label="Filter by owner">${option('','Everyone',ownerFilter)}${option('unassigned','Unassigned',ownerFilter)}${data.team.map(x=>option(x,x,ownerFilter)).join('')}</select></div>`; }
const matches = x => !x.archived && visibleItem(x) && (!filter || scopedStatus(x)===filter) && (!ownerFilter || visibleTasks(x).some(t=>ownerFilter==='unassigned' ? !t.owner : t.owner===ownerFilter)) && `${x.name} ${x.description} ${x.notes} ${visibleTasks(x).map(t=>t.label).join(" ")}`.toLowerCase().includes(search.toLowerCase());
function renderAssets() { $('view').innerHTML=`<div class="section-heading"><div><h2>Build the world</h2><p>Characters, environment, props and effects · click tasks to update progress</p></div><button class="button primary" id="newAssetButton">+ Add asset</button></div>${toolbar()}<div class="asset-grid" id="filteredCards">${assetCards()}</div>`; }
function assetCards() { return data.assets.filter(matches).map(assetCard).join('') || '<div class="empty">No sections match these filters.</div>'; }
function shotCards() {
  return C.activeShots(data).filter(matches).map(s=>`<article class="shot-card"><div class="shot-number">${String(C.activeShots(data).indexOf(s)+1).padStart(2,'0')}</div><div><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p><div class="shot-specs">${s.duration?`<span>${s.duration}s</span>`:''}${s.camera?`<span>${esc(s.camera)}</span>`:''}</div><div class="dependencies">${s.dependencies.map(id=>{const a=data.assets.find(x=>x.id===id);return `<button class="dependency ${C.status(a)==='done' ? 'ready' : ''}" data-open="assets:${id}" title="Open asset tasks" ${a.archived?'disabled data-fixed-disabled':''}>${a.archived?'Removed · ':C.status(a)==='done' ? '✓ ' : '○ '}${esc(a.name)}</button>`;}).join('')}</div></div><div class="shot-end"><div class="card-top">${badge(s)}<span>${scopedProgress(s)}%</span></div>${progressBar(scopedProgress(s),true)}${shotControls(s)}<div class="card-bottom"><span class="task-team">${sectionAssignment(s,'shots')}</span><button class="open-card" data-open="shots:${esc(s.id)}">Open shot ↗</button></div></div></article>`).join('') || '<div class="empty">No shots match these filters.</div>';
}
function renderCinematic() { $('view').innerHTML=`<div class="section-heading"><div><h2>Tell the story</h2><p>${C.activeShots(data).length} shots · ${C.activeShots(data).reduce((sum,s)=>sum+s.duration,0)} seconds planned · add, edit or reorder your story</p></div><div class="section-actions"><button class="button subtle" id="cinematicPreview">▷ Previs</button><button class="button primary" id="newShotButton">+ Add shot</button></div></div>${toolbar()}<div class="shots" id="filteredCards">${shotCards()}</div>${deletedShots()}<p class="tip">Dependencies show final asset readiness. Start layout and timing with placeholders; approve final assets before the last render.</p>`; }
function renderMilestones(){renderEditableMilestones();}
function openDetail(group,id,taskId='') {
  detail={group,id};const item=data[group]?.find(x=>x.id===id);if(!item)return;
  const link=C.safeUrl(item.file),tasks=orderedTasks(item);
  $('detailContent').innerHTML=`${group==='assets'?editableImage(`<img class="detail-cover" src="${esc(M.src(item.cover||`images/${item.image}.webp`))}" alt="${esc(item.name)} reference">`,`cover:${item.id}`,`${item.name} thumbnail`):''}<div class="dialog-content"><div class="dialog-head"><div><span class="eyebrow">${group==='assets'?esc(item.category):'CINEMATIC'}</span><h2>${esc(item.name)}</h2></div><button class="close-button" data-close="detailDialog" aria-label="Close tasks">×</button></div><div class="section-fields"><div><label>Section / shot name<input data-field="name" value="${esc(item.name)}" maxlength="150" required></label>${group==='assets'?`<label>Category<input data-field="category" value="${esc(item.category)}" maxlength="150"></label>`:''}<label>Description<textarea data-field="description" maxlength="2000">${esc(item.description)}</textarea></label></div><div class="section-pickers"><label>Section due date<input data-field="due" type="date" value="${esc(item.due)}"></label><label>Importance<select data-field="priority">${priorityOptions(item.priority)}</select></label><label>Show tasks<select id="detailScopeFilter">${option('all','All work',scopeFilter)}${option('must','Must have only',scopeFilter)}${option('nice','Nice to have only',scopeFilter)}</select></label></div></div>${group==='shots'?shotFields(item):''}<div class="subtasks-heading"><div><h3>Subtasks</h3><p>Assign the whole section or adjust each step.</p></div>${sectionAssignment(item,group)}</div><div class="progress-label"><span id="detailProgressLabel">${tasks.filter(t=>t.status==='done').length} / ${tasks.length} visible tasks complete</span><strong id="detailPercent">${scopedProgress(item)}%</strong></div><div id="detailProgress">${progressBar(scopedProgress(item))}</div><div class="task-list">${tasks.map((t,i)=>taskEditor(item,t,group,i)).join('')||'<p class="help">No tasks in this scope. Choose All work to see every task.</p>'}</div>${removedTaskMarkup(item,group)}<form id="addTaskForm" class="add-task"><input name="task" aria-label="New task" placeholder="Add a specific task…" maxlength="150" required><button class="button" type="submit">Add</button></form><label>Notes / next action<textarea data-field="notes" maxlength="10000">${esc(item.notes)}</textarea></label><label>Working file / reference URL<input type="url" data-field="file" value="${esc(item.file)}" placeholder="https://…" maxlength="2000"></label><div class="detail-actions">${group==='assets'?`<a class="text-button" href="#versions/${esc(item.id)}" data-version-link>Version history ↗</a>`:''}<span class="detail-meta">Changes save automatically · undo in Activity</span>${group==='assets'?smallX(`data-remove-asset="${item.id}"`,'Remove asset'):''}${link?`<a class="text-button" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open working file ↗</a>`:''}<button class="button primary" data-close="detailDialog">Close</button></div></div>`;
  if(!$('detailDialog').open)$('detailDialog').showModal();
  if(taskId){const row=$('task-'+taskId);if(row){row.classList.add('task-highlight');row.scrollIntoView({block:'center'});row.querySelector('.task-name').focus({preventScroll:true});}}
}
function updateDetailTaskDisplay(id) {
  if(!detail)return;const item=data[detail.group].find(x=>x.id===detail.id),task=item.tasks.find(t=>t.id===id);if(!task)return;
  const row=$('task-'+id),check=row?.querySelector('[data-task-check]'),select=row?.querySelector('[data-task-status]');
  if(check)check.checked=task.status==='done';if(select){select.value=task.status;select.className='status-picker status-'+task.status;}row?.classList.toggle('completed',task.status==='done');
  $('detailProgressLabel').textContent=`${visibleTasks(item).filter(t=>t.status==='done').length} / ${visibleTasks(item).length} visible tasks complete`;$('detailPercent').textContent=`${scopedProgress(item)}%`;$('detailProgress').innerHTML=progressBar(scopedProgress(item));
}
function updateDetailTask(id,value) {commit({kind:'task',...detail,task:id,value});updateDetailTaskDisplay(id);}

function openSettings() {
  const f=$('settingsForm'); for(const field of ['title','deadline','preview']) f.elements[field].value=data[field];populateCustomSettings(f); f.elements.team.value=data.team.join(', '); f.elements.token.value=token; f.elements.identity.innerHTML=teamOptions(identity); $('settingsDialog').showModal();
}
function openPreview() {
  renderPreviewContent();
  $('previewDialog').showModal();
  applyEditorAccess();
}
function encode(value) { const bytes=new TextEncoder().encode(value); let binary=''; for(const b of bytes)binary+=String.fromCharCode(b); return btoa(binary); }
function decode(value) { return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),x=>x.charCodeAt(0))); }
function headers() { return {Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'}; }
function remoteError(response, message) {
  const wait = Number(response.headers?.get('retry-after')) || 0;
  const reset = response.headers?.get('x-ratelimit-remaining') === '0' ? Number(response.headers.get('x-ratelimit-reset')) * 1000 : 0;
  if([401,403,429].includes(response.status))retryAt=Math.max(Date.now()+60000,Date.now()+wait*1000,reset);
  return new Error(response.status===429 || reset || wait ? 'GitHub is busy · live updates will retry automatically.' : message);
}
async function readRemote(etag = '') {
  const requestHeaders={...headers(),Accept:'application/vnd.github.object+json'};if(etag)requestHeaders['If-None-Match']=etag;
  const response=await fetch(`${API}?ref=main`,{headers:requestHeaders,cache:'no-store'});
  if(response.status===304)return {unchanged:true};
  if(!response.ok) throw remoteError(response,response.status===401 || response.status===403 ? 'Check your token and repository access in Settings.' : `Team file could not be read (${response.status}).`);
  const file=await response.json();let text;
  if(file.encoding==='base64'||file.content)text=decode(file.content);
  else{const raw=await fetch(API+'?ref=main',{headers:{...headers(),Accept:'application/vnd.github.raw+json'},cache:'no-store'});if(!raw.ok)throw remoteError(raw,'Could not read the shared project.');text=await raw.text();}
  return {sha:file.sha,etag:response.headers?.get('etag')||'',data:C.validate(JSON.parse(text))};
}
async function publishMedia(paths) {
  for(const path of paths) {
    const entry=await M.get(path);if(!entry || entry.uploaded)continue;
    setMessage(C.videoPath(path)?'Sharing the previs video with the team…':'Sharing progress images with the team…');
    const endpoint='https://api.github.com/repos/jens-lund/mail-shot-tracker/contents/eternal-tomb/'+path;
    const exists=await fetch(endpoint+'?ref=main',{headers:{...headers(),Accept:'application/vnd.github.object+json'},cache:'no-store'});
    if(exists.ok){await M.markUploaded(path);continue;}
    if(exists.status!==404)throw remoteError(exists,'Media sharing needs a token with repository write access.');
    const response=await fetch(endpoint,{method:'PUT',headers:headers(),body:JSON.stringify({message:C.videoPath(path)?'Add Eternal Tomb previs video':'Add Eternal Tomb progress image',branch:'main',content:await M.base64(entry.blob)})});
    if(!response.ok)throw remoteError(response,'File upload failed. Your files are saved locally; use Refresh to retry.');
    await M.markUploaded(path);
  }
}
function imagePaths(project){const paths=new Set();function walk(value){if(typeof value==='string'&&value.startsWith('uploads/')&&(C.imagePath(value)||C.videoPath(value)))paths.add(value);else if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')Object.values(value).forEach(walk);}walk(project);return paths;}
async function sync() {
  if(saving || loading || !canEditProject() || Date.now()<retryAt)return; saving=true; syncFailed=false;
  setMessage('Saving changes to the team…');let latestRemote=null;
  try {
    const batch=pending.slice();
    await publishMedia(imagePaths(C.clone(data)));
    for(let attempt=0;attempt<3;attempt++) {
      const remote=await readRemote();latestRemote=remote.data; const merged=C.replay(remote.data,batch); merged.updatedAt=new Date().toISOString(); C.validate(merged);
      if(!batch.length){data=C.replay(merged,pending);remoteETag='';localSave();renderAfterSync();return;}
      const response=await fetch(API,{method:'PUT',headers:headers(),body:JSON.stringify({message:'Update Eternal Tomb production tracker',content:encode(JSON.stringify(merged,null,2)+'\n'),sha:remote.sha,branch:'main'})});
      if(response.status===409 && attempt<2)continue;
      if(!response.ok)throw remoteError(response,response.status===401 || response.status===403 ? 'Check your token and repository access in Settings.' : 'Team save failed. Live updates will retry.');
      pending.splice(0,batch.length); data=C.replay(merged,pending);remoteETag='';localSave();renderAfterSync();return;
    }
  } catch(error) {
    if(error.code==='UNDO_CONFLICT'&&latestRemote){pending=pending.filter(op=>op.id!==error.changeId);data=C.validate(C.replay(latestRemote,pending));remoteETag='';syncFailed=false;localSave();renderSharedUpdate();requestUndo(error.event);setMessage('A teammate edited this work before the undo saved. Review the newer values to continue.',true);}
    else{syncFailed=true;localSave();setMessage(`Saved locally · ${error.message}`,true);}
  }
  finally {saving=false;if(pending.length && !syncFailed){clearTimeout(saveTimer);saveTimer=setTimeout(sync,800);}}
}
function renderAfterSync() {
  if(autoRefreshAllowed())renderSharedUpdate();else{sharedViewPending=true;updateLiveNotice();}
}
function renderSharedUpdate() {
  const editorFocus=rememberEditorFocus();
  const pageScroll=window.scrollY||0,dialog=$('detailDialog'),opened=detail&&dialog.open;
  const target=opened?{...detail}:null,dialogScroll=dialog.scrollTop;
  const expanded=opened?[...dialog.querySelectorAll('.task-editor details[open]')].map(el=>el.closest('.task-editor').id):[];
  render();
  if(target){
    if(data[target.group].some(item=>item.id===target.id&&!item.archived)){
      openDetail(target.group,target.id);
      expanded.forEach(id=>{const notes=$(id)?.querySelector('details');if(notes)notes.open=true;});
      dialog.scrollTop=dialogScroll;
    }else dialog.close();
  }
  window.scrollTo?.({top:pageScroll});
  restoreEditorFocus(editorFocus);
  sharedViewPending=false;
  updateLiveNotice();applyEditorAccess();
}
async function refresh({silent = false} = {}) {
  if(saving||loading||Date.now()<retryAt)return;
  if(canEditProject() && pending.length){await sync();return;}
  loading=true;if(!silent)setMessage('Refreshing project…');
  try {
    const remote=editorAccess.verified ? await readRemote(silent?remoteETag:'') : await (async()=>{const source=location.hostname?.endsWith('.github.io') ? 'https://raw.githubusercontent.com/jens-lund/mail-shot-tracker/main/eternal-tomb/data/project.json' : 'data/project.json';const r=await fetch(source+'?live='+Math.floor(Date.now()/15000),{cache:'no-store'});if(!r.ok)throw new Error('Shared refresh unavailable');return {data:C.validate(await r.json())};})();
    if(remote.unchanged){syncFailed=false;localSave();if(sharedViewPending&&autoRefreshAllowed())renderSharedUpdate();return;}
    const canPaint=autoRefreshAllowed();
    const updated=C.validate(C.replay(remote.data,pending)),changed=JSON.stringify(updated)!==JSON.stringify(data);
    data=updated;remoteETag=remote.etag||'';syncFailed=false;localSave();if(changed||!silent||sharedViewPending){if(canPaint)renderSharedUpdate();else{sharedViewPending=true;updateLiveNotice();}}
  } catch(error) {syncFailed=!!token;nextLiveCheck=Math.max(nextLiveCheck,Date.now()+30000);setMessage(storageOK ? `Saved locally · ${error.message||'shared refresh unavailable'}` : 'Storage unavailable · export a backup',true);}
  finally {loading=false;if(canEditProject() && pending.length && !syncFailed)sync();}
}
function liveRefresh() {
  if(document.hidden)return;
  if(sharedViewPending&&autoRefreshAllowed())renderSharedUpdate();
  if(Date.now()<nextLiveCheck)return;
  nextLiveCheck=Date.now()+(token?3000:15000);return refresh({silent:true});
}
async function exportBackup() {
  try {
    const backup=C.clone(data); const paths=imagePaths(data);backup.localImages=[];backup.localMedia=[];
    for(const entry of (paths.size ? await M.all() : []))if(paths.has(entry.path)){
      const value={path:entry.path,base64:await M.base64(entry.blob)};
      if(C.videoPath(entry.path)){value.type=entry.path.endsWith('.mp4')?'video/mp4':'video/webm';backup.localMedia.push(value);}else backup.localImages.push(value);
    }
    const blob=new Blob([JSON.stringify(backup,null,2)+'\n'],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`eternal-tomb-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch {setMessage('Could not create a complete backup. Check browser storage.',true);}
}
const ROLES={sheet:'Main character sheet',front:'Front',back:'Back',left:'Left',right:'Right',clothing:'Clothing reference','clothing-progress':'Current clothing',detail:'Detail',progress:'Progress render',reference:'Mood / scene reference'};
const VERSION_LABELS={reference:'Concept reference',wip:'Work in progress',review:'Needs feedback',approved:'Approved'};
const newId=prefix=>prefix+'_'+crypto.randomUUID().replaceAll('-','');
function currentVersion() {
  const asset=C.activeAssets(data).find(a=>a.id===versionAsset)||C.activeAssets(data)[0];if(!asset)return {asset:null,version:null};versionAsset=asset.id;
  const versions=C.activeVersions(asset),version=versions.find(v=>v.id===versionId)||versions.at(-1);versionId=version?.id||'';
  return {asset,version};
}
function displayedVersion(editing=false) {
  const panel=document.querySelector('.version-main');
  const asset=data.assets.find(a=>a.id===panel?.dataset.asset);
  let version=asset?.versions.find(v=>v.id===panel?.dataset.version);
  if(editing&&version?.deletedAt){setMessage('This version was deleted by a teammate. Your draft is still here; copy it before choosing another version.',true);version=null;}
  return {asset,version};
}
function imageTile(image,asset,version) {
  return `<article class="review-image">${editableImage(`<button class="image-open" data-image="${image.id}" aria-label="Open ${esc(image.caption||ROLES[image.role])}"><img src="${esc(M.src(image.path))}" alt="${esc(image.caption||ROLES[image.role])}" loading="lazy"></button>`,versionImageTarget(asset,version,image),`${ROLES[image.role]} image`)}<div class="image-info"><span class="eyebrow">${esc(ROLES[image.role])}</span><p>${esc(image.caption)}</p><button class="text-button" data-cover="${image.id}">${asset.cover===image.path?'✓ Main asset image':'Use as main asset image'}</button></div></article>`;
}
function renderVersions(){renderVersionWorkbench();applyEditorAccess();}
function openNewVersion(){const {asset}=currentVersion();const f=$('newVersionForm');f.elements.title.value=`v${String(asset.versions.length+1).padStart(3,'0')} · `;f.elements.summary.value='';f.elements.owner.innerHTML=teamOptions(identity||asset.owner);$('newVersionDialog').showModal();}
async function uploadImages(form) {
  if(uploading)return;const {asset,version}=displayedVersion(true);if(!version)return;
  const files=[...form.elements.images.files],role=form.elements.role.value,caption=form.elements.caption.value.trim();
  if(version.images.length+files.length>64){setMessage('A version can contain up to 64 images.',true);return;}
  uploading=true;renderVersions();
  try {
    for(const file of files){setMessage(`Saving ${file.name}…`);const blob=await M.prepare(file);const id=newId('image');const path=`uploads/${id}.webp`;await M.store(path,blob);commit({kind:'addImage',group:'assets',id:asset.id,version:version.id,value:{id,path,role,caption:caption||file.name}});}
    if(!token)setMessage('Progress images saved in this browser · connect team sync to share');
  }catch(error){setMessage(error.message,true);}finally{uploading=false;renderVersions();}
}
function openImageEditor(target) {
  if(uploading)return;
  const [kind,assetId,versionKey,imageId]=target.split(':');
  const asset=data.assets.find(a=>a.id===assetId);
  const version=asset?.versions.find(v=>v.id===versionKey);
  const image=version?.images.find(i=>i.id===imageId);
  if(kind!=='hero'&&(!asset||(kind==='version'&&!image)))return;
  imageEdit={kind,assetId,versionKey,imageId};
  const form=$('thumbnailForm');form.reset();resetUploadHints(form);$('thumbnailError').textContent='';
  $('thumbnailCurrent').src=M.src(kind==='hero'?(data.hero||'images/reveal.webp'):kind==='cover'?(asset.cover||`images/${asset.image}.webp`):image.path);
  $('thumbnailTitle').textContent=kind==='hero'?'Change project banner':kind==='cover'?`Change ${asset.name} thumbnail`:`Change ${ROLES[image.role].toLowerCase()}`;
  $('thumbnailCaptionLabel').hidden=kind!=='version';form.elements.caption.value=image?.caption||'';
  $('thumbnailHelp').textContent='PNG, JPEG or WebP · up to 15 MB. '+(kind==='version'?'Keeps linked comments. Other versions stay unchanged.':'Changes this thumbnail only.')+(token?' Shared with the team automatically.':' Saved in this browser; connect team sync to share.');
  $('thumbnailFile').disabled=false;$('replaceImageButton').disabled=false;$('replaceImageButton').textContent='Replace image';
  $('thumbnailDialog').showModal();
}
async function replaceThumbnail(form) {
  if(uploading||!imageEdit)return;
  const file=form.elements.image.files[0];if(!file)return;
  const target={...imageEdit},caption=form.elements.caption.value.trim();
  uploading=true;$('thumbnailFile').disabled=true;$('replaceImageButton').disabled=true;$('replaceImageButton').textContent='Saving image…';$('thumbnailError').textContent='';
  try {
    const blob=await M.prepare(file),path=`uploads/${newId('image')}.webp`;await M.store(path,blob);
    if(target.kind==='hero')commit({kind:'project',field:'hero',value:path});
    else if(target.kind==='task'){const ctx=workContext(target.context);if(!ctx.active)throw new Error('Restore this task before replacing its image.');commit({kind:'batch',context:ctx.key,label:'Replaced progress image',ops:[workOp(ctx,'taskImageField',{image:target.imageId,field:'path',value:path}),workOp(ctx,'taskImageField',{image:target.imageId,field:'caption',value:caption})]});refreshWorkDetail();}
    else if(target.kind==='cover')commit({kind:'field',group:'assets',id:target.assetId,field:'cover',value:path});
    else commit({kind:'replaceImage',group:'assets',id:target.assetId,version:target.versionKey,image:target.imageId,value:{path,caption}});
    if(target.kind!=='task'&&detail?.group==='assets'&&detail.id===target.assetId){const asset=data.assets.find(a=>a.id===detail.id);$('detailDialog').querySelector('.detail-cover').src=M.src(asset.cover||`images/${asset.image}.webp`);}
    $('thumbnailDialog').close();
    if(!token)setMessage('Image saved in this browser · connect team sync to share');
  }catch(error){$('thumbnailError').textContent=error.message||'Could not replace this image. Please try again.';}
  finally{uploading=false;$('thumbnailFile').disabled=false;$('replaceImageButton').disabled=false;$('replaceImageButton').textContent='Replace image';render();}
}
$('thumbnailFile').addEventListener('change',e=>{
  if(imagePreviewURL){URL.revokeObjectURL(imagePreviewURL);imagePreviewURL='';}
  const file=e.target.files[0];$('thumbnailError').textContent='';
  if(file&&['image/png','image/jpeg','image/webp'].includes(file.type)){imagePreviewURL=URL.createObjectURL(file);$('thumbnailCurrent').src=imagePreviewURL;}
});
$('thumbnailDialog').addEventListener('close',()=>{imageEdit=null;if(imagePreviewURL){URL.revokeObjectURL(imagePreviewURL);imagePreviewURL='';}});
$('thumbnailDialog').addEventListener('cancel',e=>{if(uploading)e.preventDefault();});
document.addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-image]');if(edit){openImageEditor(edit.dataset.editImage);return;}
  const close=e.target.closest('[data-close]');if(close){if(close.dataset.close==='thumbnailDialog'&&uploading)return;$(close.dataset.close).close();return;}
  const open=e.target.closest('[data-open]');if(open){openDetail(...open.dataset.open.split(':'));return;}
  if(e.target.closest('#settingsButton'))openSettings();
  if(e.target.closest('#previewButton,#cinematicPreview'))openPreview();
  if(e.target.closest('#addPreview')){$('previewDialog').close();openSettings();$('settingsForm').elements.preview.focus();}
  if(e.target.closest('#refreshButton')){retryAt=0;nextLiveCheck=0;refresh();}
  if(e.target.closest('#exportButton'))exportBackup();
  if(e.target.closest('#importButton'))$('importFile').click();
  if(e.target.closest('[data-version-link]'))$('detailDialog').close();
  if(e.target.closest('#newVersionButton,#firstVersionButton'))openNewVersion();
  const pick=e.target.closest('[data-select-version]');if(pick){versionId=pick.dataset.selectVersion;comparison=false;location.hash=`versions/${versionAsset}/${versionId}`;renderVersions();}
  if(e.target.closest('#compareButton')){comparison=!comparison;renderVersions();}
  const image=e.target.closest('[data-image]');if(image){const {version}=displayedVersion();const selected=version?.images.find(i=>i.id===image.dataset.image);if(selected){$('largeImage').src=M.src(selected.path);$('largeImage').alt=selected.caption||ROLES[selected.role];$('imageTitle').textContent=selected.caption||ROLES[selected.role];$('imageDialog').showModal();}}
  const cover=e.target.closest('[data-cover]');if(cover){const {asset,version}=displayedVersion(true),image=version?.images.find(i=>i.id===cover.dataset.cover);if(image)commit({kind:'field',group:'assets',id:asset.id,field:'cover',value:image.path});}
  const angle=e.target.closest('[data-upload-angle]');if(angle){$('uploadForm').elements.role.value=angle.dataset.uploadAngle;$('uploadForm').scrollIntoView({block:'center'});$('progressFiles').click();}
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='statusFilter'||el.id==='ownerFilter'){filter=$('statusFilter').value;ownerFilter=$('ownerFilter').value;$('filteredCards').innerHTML=tab==='assets'?assetCards():shotCards();return;}
  if(el.id==='versionAsset'){versionAsset=el.value;versionId='';comparison=false;location.hash=`versions/${versionAsset}`;renderVersions();return;}
  if(el.id==='feedbackIdentity'){identity=el.value;try{localStorage.setItem('eternal-tomb-feedback-name',identity);}catch{}return;}
  if(el.dataset.vfield){const {asset,version}=displayedVersion(true);if(!version)return;const value=el.value.trim();if(el.dataset.vfield==='title'&&!value){el.reportValidity();return;}commit({kind:'versionField',group:'assets',id:asset.id,version:version.id,field:el.dataset.vfield,value});return;}
  if(el.dataset.commentResolve){const {asset,version}=displayedVersion(true);if(version)commit({kind:'commentResolved',group:'assets',id:asset.id,version:version.id,comment:el.dataset.commentResolve,value:el.checked});return;}
  if(el.dataset.milestone){const [id,check]=el.dataset.milestone.split(':');commit({kind:'milestone',id,check,value:el.checked});return;}
  if(el.id==='detailScopeFilter'&&detail){scopeFilter=el.value;render();openDetail(detail.group,detail.id);return;}
  if(el.dataset.taskCheck){updateDetailTask(el.dataset.taskCheck,el.checked?'done':'todo');return;}
  if(el.dataset.task){updateDetailTask(el.dataset.task,el.value);return;}
  if(el.dataset.field && detail){const field=el.dataset.field;let value=field==='duration'?Number(el.value):field==='blocked'?el.checked:el.value.trim();if(field==='duration'&&(!Number.isFinite(value)||value<0||value>600)){el.reportValidity();return;}if(field==='file'&&value&&!C.safeUrl(value)){el.setCustomValidity('Use an http or https link.');el.reportValidity();return;}if(field==='name'&&!value){el.reportValidity();return;}el.setCustomValidity('');commit({kind:'field',...detail,field,value});if(field==='priority'){if(!detailUploadDraft())renderSharedUpdate();else sharedViewPending=true;}}
});
document.addEventListener('input',e=>{
  if(e.target.id==='search'){search=e.target.value;$('filteredCards').innerHTML=tab==='assets'?assetCards():shotCards();}
  if(e.target.dataset.field==='file')e.target.setCustomValidity('');
});
document.addEventListener('submit',e=>{
  if(e.target.id==='thumbnailForm'){e.preventDefault();replaceThumbnail(e.target);return;}
  if(e.target.id==='addTaskForm'){e.preventDefault();const label=e.target.elements.task.value.trim();if(!label)return;if(data[detail.group].find(x=>x.id===detail.id).tasks.length>=200){setMessage('This section has reached its 200-task limit.',true);return;}commit({kind:'addTask',...detail,value:{id:'task_'+crypto.randomUUID().replaceAll('-',''),label,description:'',status:'todo',priority:scopeFilter==='nice'?'nice':'must',effort:'medium',due:'',images:[],comments:[]}});openDetail(detail.group,detail.id);}
  if(e.target.id==='newVersionForm'){e.preventDefault();const {asset}=currentVersion();if(asset.versions.length>=100){setMessage('This asset has reached its 100-version limit.',true);return;}const title=e.target.elements.title.value.trim();if(!title)return;const version={id:newId('version'),title,summary:e.target.elements.summary.value.trim(),owner:e.target.elements.owner.value,status:'wip',createdAt:new Date().toISOString(),images:[],comments:[]};versionId=version.id;commit({kind:'addVersion',group:'assets',id:asset.id,value:version});$('newVersionDialog').close();location.hash=`versions/${asset.id}/${version.id}`;}
  if(e.target.id==='uploadForm'){e.preventDefault();uploadImages(e.target);}
  if(e.target.id==='feedbackForm'){e.preventDefault();if(!identity){setMessage('Choose your name under Posting as before leaving feedback.',true);$('feedbackIdentity').focus();return;}const {asset,version}=displayedVersion(true);if(!version)return;const body=e.target.elements.body.value.trim();if(!body)return;if(version.comments.length>=500){setMessage('This version has reached its 500-comment limit.',true);return;}e.target.elements.body.value='';commit({kind:'addComment',group:'assets',id:asset.id,version:version.id,value:{id:newId('comment'),author:identity,target:e.target.elements.target.value,image:e.target.elements.image.value,body,createdAt:new Date().toISOString(),resolved:false}});}
});
$('settingsForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.target;const team=[...new Set(f.elements.team.value.split(',').map(s=>s.trim()).filter(Boolean))];if(!team.length){f.elements.team.setCustomValidity('Enter at least one team member.');f.elements.team.reportValidity();return;}f.elements.team.setCustomValidity('');
  const preview=f.elements.preview.value.trim();if(preview&&!C.safeUrl(preview)){f.elements.preview.setCustomValidity('Use an http or https link.');f.elements.preview.reportValidity();return;}f.elements.preview.setCustomValidity('');
  const title=f.elements.title.value.trim();if(!title){f.elements.title.reportValidity();return;}
  token=f.elements.token.value.trim();remoteETag='';retryAt=0;nextLiveCheck=0;try{localStorage.setItem(TOKEN_KEY,token);}catch{storageOK=false;}
  const allowed=await verifyEditorAccess();
  identity=f.elements.identity.value||identity;try{localStorage.setItem('eternal-tomb-feedback-name',identity);}catch{}
  if(allowed)for(const [field,value] of Object.entries({title,deadline:f.elements.deadline.value,team,preview,...customSettingsValues(f)}))if(JSON.stringify(data[field])!==JSON.stringify(value))commit({kind:'project',field,value});
  if(token&&!allowed){setMessage(editorAccess.message,true);return;}
  $('settingsDialog').close();syncFailed=false;localSave();render();await refresh();
});
$('settingsForm').addEventListener('input',e=>e.target.setCustomValidity?.(''));
$('importFile').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try {if(file.size>100000000)throw new Error('Backup is too large.');const raw=JSON.parse(await file.text());const imported=C.validate(raw);const media=backupMediaEntries(raw);if(!confirm('Replace the project with this backup? The current project will remain recoverable through Undo in Activity.'))return;for(const i of media)await M.store(i.path,new Blob([Uint8Array.from(atob(i.base64),x=>x.charCodeAt(0))],{type:i.type}));commit({kind:'replace',data:imported});}
  catch(error){setMessage(error.message||'Could not import this backup.',true);}finally{e.target.value='';}
});
for(const dialog of document.querySelectorAll('dialog'))installSafeDialogDismissal(dialog);
if(typeof installAnnotationControls==='function')installAnnotationControls();
$('previewDialog').addEventListener('close',()=>{$('previewContent').querySelector('video')?.pause();});
$('detailDialog').addEventListener('close',()=>{if(!$('detailDialog').open)detail=null;});
function navigate(){
  captureReviewDraft();const parts=location.hash.slice(1).split('/'),[candidate,asset,version]=parts;
  if($('detailDialog').open)$('detailDialog').close();
  tab=['overview','assets','cinematic','milestones','versions','tasks','calendar','review','activity'].includes(candidate)?candidate:candidate==='task'?(asset==='shots'?'cinematic':'assets'):'overview';
  if(candidate==='versions'&&asset){versionAsset=asset;versionId=version||'';comparison=false;}
  if(candidate==='calendar'&&/^\d{4}-\d{2}(?:-\d{2})?$/.test(asset||'')&&C.validDate(asset.slice(0,7)+'-01')){calendarMonth=asset.slice(0,7);calendarDay=asset.length===10&&C.validDate(asset)?asset:'';}
  if(candidate==='tasks')taskStatusFilter=C.statuses.includes(asset)?asset:'';
  if(candidate==='review'&&parts.length===4){reviewKey=parts.slice(1).join('/');reviewImage='';annotationPoint=null;}
  filter='';ownerFilter='';search='';render(true);
  if(candidate==='task'&&['assets','shots'].includes(asset)){const item=data[asset].find(i=>i.id===version),task=item?.tasks.find(t=>t.id===parts[3]);if(item&&!item.archived){if(!visibleItem(item)||(task&&!visibleTasks(item).includes(task))){scopeFilter='all';render();}openDetail(asset,version,parts[3]);}else setMessage('This task or section is no longer available.',true);}
}

window.addEventListener('hashchange',navigate);
window.addEventListener('online',()=>{retryAt=0;nextLiveCheck=0;token?sync():liveRefresh();});
window.addEventListener('focus',()=>{nextLiveCheck=0;liveRefresh();});
document.addEventListener('visibilitychange',()=>{nextLiveCheck=0;liveRefresh();});
document.addEventListener('focusout',()=>setTimeout(liveRefresh,250));
setInterval(liveRefresh,1000);
initializeTracker();

