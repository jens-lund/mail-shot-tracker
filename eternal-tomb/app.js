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
try { token = localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem('mail-tracker-github-token') ?? ''; const cached = JSON.parse(localStorage.getItem(KEY) || 'null'); if(cached) { data = C.validate(cached.data); pending = Array.isArray(cached.pending) ? cached.pending : []; } } catch { storageOK = false; }
try {identity=localStorage.getItem('eternal-tomb-feedback-name')||'';}catch{}

function setMessage(message, warning = false) { $('saveStatus').textContent = message; $('saveDot').classList.toggle('warning', warning); }
function localSave() {
  try { localStorage.setItem(KEY, JSON.stringify({data, pending})); storageOK = true; } catch { storageOK = false; }
  if (!storageOK) setMessage('Browser storage unavailable · export a backup before leaving', true);
  else if (!token) setMessage('Saved in this browser · connect team sync in Settings');
  else if (syncFailed) setMessage('Saved in this browser · team sync needs attention', true);
  else setMessage(pending.length ? 'Saved locally · syncing to team…' : 'Team sync up to date');
}
function commit(op) {
  captureReviewDraft(); data = C.validate(C.apply(data, op)); data.updatedAt = new Date().toISOString(); pending.push(op); localSave(); render();
  clearTimeout(saveTimer); if(token) saveTimer = setTimeout(sync, 1200);
}
const badge = item => `<span class="badge ${scopedStatus(item)}">${LABELS[scopedStatus(item)]}</span>`;
const progressBar = (p, green = false) => `<div class="progress ${green ? 'green' : ''}" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="Completed tasks"><span style="width:${p}%"></span></div>`;
const average = items => { const tasks = items.flatMap(x => x.tasks); return tasks.length ? Math.round(tasks.filter(t => t.status === 'done').length / tasks.length * 100) : 0; };
const teamOptions = selected => option('', 'Unassigned', selected) + (selected && !data.team.includes(selected) ? option(selected, selected, selected) : '') + data.team.map(x => option(x,x,selected)).join('');
const dateText = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '';
const pencil = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>';
function editableImage(content, target, label) {
  return `<div class="editable-image">${content}<button type="button" class="image-edit" data-edit-image="${esc(target)}" aria-label="Change ${esc(label)}" title="Change ${esc(label)}" ${uploading?'disabled':''}>${pencil}</button></div>`;
}
function versionImageTarget(asset, version, image) {return `version:${asset.id}:${version.id}:${image.id}`;}
function assetCard(item) {
  const tasks=orderedTasks(item), p = scopedProgress(item), next = tasks.find(t => t.status !== 'done');
  return `<article class="asset-card" data-id="${esc(item.id)}">${editableImage(`<img class="card-image" src="${esc(M.src(item.cover || `images/${item.image}.webp`))}" alt="Current reference for ${esc(item.name)}" loading="lazy">`, `cover:${item.id}`, `${item.name} thumbnail`)}<div class="card-body"><div class="card-top"><span class="card-category">${esc(item.category)} · ${PRIORITY_LABELS[item.priority]}</span>${badge(item)}</div><h3>${esc(item.name)}</h3><p class="card-description">${esc(item.description)}</p><div class="card-progress"><div class="progress-label"><span>${tasks.filter(t=>t.status==='done').length} / ${tasks.length} tasks complete</span><strong>${p}%</strong></div>${progressBar(p)}</div><div class="stage-list">${tasks.slice(0,8).map(t=>`<a class="stage-chip status-${t.status}" href="${taskLink('assets',item,t)}" title="${esc(LABELS[t.status])} · ${esc(t.label)}"><span class="status-dot"></span>${esc(t.label)}</a>`).join('')}</div><div class="card-bottom"><span class="owner"><span class="avatar">${esc(item.owner?.charAt(0)||'–')}</span>${esc(item.owner||'Unassigned')}${item.due ? ' · '+esc(dateText(item.due)) : ''}</span><button class="open-card" data-open="assets:${esc(item.id)}">Open tasks ↗</button></div>${next ? `<div class="next-task"><span>Next</span>${esc(next.label)}</div>` : `<div class="next-task"><span>✓</span>Ready for the cinematic</div>`}</div></article>`;
}
function render(force = false) {
  captureReviewDraft();
  $('brandTitle').textContent = data.title; $('projectTitle').textContent = data.title; document.title = `${data.title} · Production tracker`;
  const hero=document.querySelector('.project-hero');
  if(data.hero)hero.style.backgroundImage=`linear-gradient(90deg,#161419e8 0%,#16141994 48%,#16141912 100%),url("${M.src(data.hero)}")`;
  else hero.style.removeProperty('background-image');
  document.querySelector('.concept-label').textContent=data.hero?'PROJECT REFERENCE':'CONCEPT REFERENCE · AI GENERATED';
  document.querySelector('[data-edit-image="hero"]').disabled=uploading;
  const current = data.milestones.find(m=>m.checks.some(c=>!c.done));
  $('phaseLabel').textContent = current ? `Phase ${String(data.milestones.indexOf(current)+1).padStart(2,'0')} · ${current.name}` : 'Production complete · All milestones approved';
  $('deadlineLabel').textContent = data.deadline ? `Delivery · ${dateText(data.deadline)}` : 'Set a delivery date in Settings';
  document.querySelectorAll('[data-tab]').forEach(a=>{a.classList.toggle('active', a.dataset.tab === tab); if(a.dataset.tab===tab) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); const count = a.querySelector('span'); if(count) count.textContent = a.dataset.tab==='assets' ? data.assets.length : data.shots.length;});
  renderWorkflowMetrics();
  if(!force && ($('taskUploadForm')?.elements.images.files.length || $('uploadForm')?.elements.images.files.length || $('feedbackForm')?.elements.body.value.trim()))return;
  if(tab==='overview') renderOverview(current);
  if(tab==='assets') renderAssets();
  if(tab==='cinematic') renderCinematic();
  if(tab==='milestones') renderMilestones();
  if(tab==='versions') renderVersions();
  if(tab==='tasks') renderTaskList();
  if(tab==='calendar') renderCalendar();
  if(tab==='review') renderReview();
}
function renderOverview(current) {
  const checks=current?.checks.filter(c=>!c.done).slice(0,3)||[];
  $('view').innerHTML=`<div class="focus-row"><section class="panel"><span class="eyebrow">NEXT MILESTONE</span><h3>${esc(current?.name||'Final delivery approved')}</h3><p>${esc(current?.description||'Your production checklist is complete.')}</p><div class="priority-list">${checks.map((c,i)=>`<div class="priority-row"><span class="priority-number">${i+1}</span><strong>${esc(c.label)}</strong></div>`).join('')}</div><a class="button subtle" href="#milestones" style="margin-top:17px">View milestones →</a></section>${dueReminder()}</div><div class="section-heading"><div><span class="eyebrow">THE PRODUCTION</span><h2>Build the world. Finish the film.</h2><p>Click a colored task to update its status, effort or deadline.</p></div><a class="text-button" href="#tasks">All tasks →</a></div><div class="asset-grid">${data.assets.filter(visibleItem).map(assetCard).join('')}</div>`;
}
function toolbar() { return `<div class="toolbar"><input id="search" aria-label="Search sections" type="search" placeholder="Search sections…" value="${esc(search)}"><select id="statusFilter" aria-label="Filter by status">${option('','All statuses',filter)}${['todo','active','review','done'].map(s=>option(s,LABELS[s],filter)).join('')}</select><select id="ownerFilter" aria-label="Filter by owner">${option('','Everyone',ownerFilter)}${option('unassigned','Unassigned',ownerFilter)}${data.team.map(x=>option(x,x,ownerFilter)).join('')}</select></div>`; }
const matches = x => visibleItem(x) && (!filter || scopedStatus(x)===filter) && (!ownerFilter || (ownerFilter==='unassigned' ? !x.owner : x.owner===ownerFilter)) && `${x.name} ${x.description} ${x.notes} ${visibleTasks(x).map(t=>t.label).join(" ")}`.toLowerCase().includes(search.toLowerCase());
function renderAssets() { $('view').innerHTML=`<div class="section-heading"><div><h2>Build the world</h2><p>Characters, environment, props and effects · click tasks to update progress</p></div></div>${toolbar()}<div class="asset-grid" id="filteredCards">${assetCards()}</div>`; }
function assetCards() { return data.assets.filter(matches).map(assetCard).join('') || '<div class="empty">No sections match these filters.</div>'; }
function shotCards() {
  return data.shots.filter(matches).map(s=>`<article class="shot-card"><div class="shot-number">${String(data.shots.indexOf(s)+1).padStart(2,'0')}</div><div><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p><div class="dependencies">${s.dependencies.map(id=>{const a=data.assets.find(x=>x.id===id);return `<button class="dependency ${C.status(a)==='done' ? 'ready' : ''}" data-open="assets:${id}" title="Open asset tasks">${C.status(a)==='done' ? '✓ ' : '○ '}${esc(a.name)}</button>`;}).join('')}</div></div><div class="shot-end"><div class="card-top">${badge(s)}<span>${scopedProgress(s)}%</span></div>${progressBar(scopedProgress(s),true)}<div class="card-bottom"><span class="owner">${esc(s.owner||'Unassigned')}</span><button class="open-card" data-open="shots:${esc(s.id)}">Open shot ↗</button></div></div></article>`).join('') || '<div class="empty">No shots match these filters.</div>';
}
function renderCinematic() { $('view').innerHTML=`<div class="section-heading"><div><h2>Tell the story</h2><p>Five provisional shots · layout can start with placeholder assets</p></div><button class="button subtle" id="cinematicPreview">▷ Previs</button></div>${toolbar()}<div class="shots" id="filteredCards">${shotCards()}</div><p class="tip">Dependencies show final asset readiness. Start layout and timing with placeholders; approve final assets before the last render.</p>`; }
function renderMilestones() {
  const first = data.milestones.find(m=>m.checks.some(c=>!c.done));
  $('view').innerHTML=`<div class="section-heading"><div><h2>From first idea to final film</h2><p>Approval gates · check each deliverable after reviewing it</p></div></div><div class="milestones">${data.milestones.map((m,i)=>`<article class="milestone ${m===first ? 'current' : ''}"><div class="milestone-number">${m.checks.every(c=>c.done) ? '✓' : String(i+1).padStart(2,'0')}</div><div><div class="card-top"><h3>${esc(m.name)}</h3><span class="badge ${m.checks.every(c=>c.done) ? 'done' : m===first ? 'active' : ''}">${m.checks.every(c=>c.done) ? 'Approved' : m===first ? 'Current milestone' : 'Upcoming'}</span></div><p>${esc(m.description)}</p><div class="task-list">${m.checks.map(c=>`<label class="task-row ${c.done ? 'checked' : ''}"><input type="checkbox" data-milestone="${m.id}:${c.id}" ${c.done ? 'checked' : ''}><span class="task-text">${esc(c.label)}</span></label>`).join('')}</div></div></article>`).join('')}</div>`;
}
function openDetail(group,id,taskId='') {
  detail={group,id};const item=data[group]?.find(x=>x.id===id);if(!item)return;
  const link=C.safeUrl(item.file),tasks=orderedTasks(item);
  $('detailContent').innerHTML=`${group==='assets'?editableImage(`<img class="detail-cover" src="${esc(M.src(item.cover||`images/${item.image}.webp`))}" alt="${esc(item.name)} reference">`,`cover:${item.id}`,`${item.name} thumbnail`):''}<div class="dialog-content"><div class="dialog-head"><div><span class="eyebrow">${group==='assets'?esc(item.category):'CINEMATIC'}</span><h2>${esc(item.name)}</h2></div><button class="close-button" data-close="detailDialog" aria-label="Close tasks">×</button></div><label>Section / shot name<input data-field="name" value="${esc(item.name)}" maxlength="150" required></label><label>Description<textarea data-field="description" maxlength="2000">${esc(item.description)}</textarea></label><div class="field-grid"><label>Owner<select data-field="owner">${teamOptions(item.owner)}</select></label><label>Section due date<input data-field="due" type="date" value="${esc(item.due)}"></label><label>Importance<select data-field="priority">${priorityOptions(item.priority)}</select></label><label>Show tasks<select id="detailScopeFilter">${option('all','All work',scopeFilter)}${option('must','Must have only',scopeFilter)}${option('nice','Nice to have only',scopeFilter)}</select></label></div><div class="progress-label"><span id="detailProgressLabel">${tasks.filter(t=>t.status==='done').length} / ${tasks.length} visible tasks complete</span><strong id="detailPercent">${scopedProgress(item)}%</strong></div><div id="detailProgress">${progressBar(scopedProgress(item))}</div><div class="task-list">${tasks.map(t=>taskEditor(item,t,group)).join('')||'<p class="help">No tasks in this scope. Choose All work to see every task.</p>'}</div><form id="addTaskForm" class="add-task"><input name="task" aria-label="New task" placeholder="Add a specific task…" maxlength="150" required><button class="button" type="submit">Add</button></form><label>Notes / next action<textarea data-field="notes" maxlength="10000">${esc(item.notes)}</textarea></label><label>Working file / reference URL<input type="url" data-field="file" value="${esc(item.file)}" placeholder="https://…" maxlength="2000"></label><div class="detail-actions">${group==='assets'?`<a class="text-button" href="#versions/${esc(item.id)}" data-version-link>Version history ↗</a>`:''}<span class="detail-meta">Changes save automatically</span>${link?`<a class="text-button" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open working file ↗</a>`:''}<button class="button primary" data-close="detailDialog">Close</button></div></div>`;
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
  const f=$('settingsForm'); for(const field of ['title','deadline','preview']) f.elements[field].value=data[field]; f.elements.team.value=data.team.join(', '); f.elements.token.value=token; f.elements.identity.innerHTML=teamOptions(identity); $('settingsDialog').showModal();
}
function openPreview() {
  const url=C.safeUrl(data.preview);
  $('previewContent').innerHTML=url ? /\.(mp4|webm|ogg)(\?|$)/i.test(url) ? `<video src="${esc(url)}" controls playsinline preload="metadata"></video><p class="help" style="margin-top:12px">Latest project previs</p>` : `<p class="help">Your latest animatic is on a shared video page.</p><a class="button primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open latest previs ↗</a>` : `<div class="empty"><h3>Give the film a first pass</h3><p style="margin:10px 0 18px">Add your latest animatic or previs link in Settings.<br>A rough placeholder edit is enough to begin.</p><button class="button primary" id="addPreview">Add previs link</button></div>`;
  $('previewDialog').showModal();
}
function encode(value) { const bytes=new TextEncoder().encode(value); let binary=''; for(const b of bytes)binary+=String.fromCharCode(b); return btoa(binary); }
function decode(value) { return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),x=>x.charCodeAt(0))); }
function headers() { return {Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'}; }
async function readRemote() {
  const response=await fetch(`${API}?ref=main`,{headers:headers(),cache:'no-store'});
  if(!response.ok) throw new Error(response.status===401 || response.status===403 ? 'Check your token and repository access in Settings.' : `Team file could not be read (${response.status}).`);
  const file=await response.json(); return {sha:file.sha,data:C.validate(JSON.parse(decode(file.content)))};
}
async function publishMedia(paths) {
  for(const path of paths) {
    const entry=await M.get(path);if(!entry || entry.uploaded)continue;
    setMessage('Sharing progress images with the team…');
    const endpoint='https://api.github.com/repos/jens-lund/mail-shot-tracker/contents/eternal-tomb/'+path;
    const exists=await fetch(endpoint+'?ref=main',{headers:headers(),cache:'no-store'});
    if(exists.ok){await M.markUploaded(path);continue;}
    if(exists.status!==404)throw new Error('Image sharing needs a token with repository write access.');
    const response=await fetch(endpoint,{method:'PUT',headers:headers(),body:JSON.stringify({message:'Add Eternal Tomb progress image',branch:'main',content:await M.base64(entry.blob)})});
    if(!response.ok)throw new Error('Image upload failed. Your images are saved locally; use Refresh to retry.');
    await M.markUploaded(path);
  }
}
function imagePaths(project) {return new Set([...[...project.assets,...project.shots].flatMap(a=>a.tasks.flatMap(t=>(t.images||[]).map(i=>i.path))),project.hero,...project.assets.flatMap(a=>[a.cover,...(a.versions||[]).flatMap(v=>v.images.map(i=>i.path))])].filter(p=>typeof p==='string'&&p.startsWith('uploads/')));}
async function sync() {
  if(saving || loading || !token)return; saving=true; syncFailed=false;
  setMessage('Saving changes to the team…');
  try {
    const batch=pending.slice();
    await publishMedia(imagePaths(C.clone(data)));
    for(let attempt=0;attempt<3;attempt++) {
      const remote=await readRemote(); const merged=C.replay(remote.data,batch); merged.updatedAt=new Date().toISOString(); C.validate(merged);
      if(!batch.length){data=merged;localSave();render();return;}
      const response=await fetch(API,{method:'PUT',headers:headers(),body:JSON.stringify({message:'Update Eternal Tomb production tracker',content:encode(JSON.stringify(merged,null,2)+'\n'),sha:remote.sha,branch:'main'})});
      if(response.status===409 && attempt<2)continue;
      if(!response.ok)throw new Error(response.status===401 || response.status===403 ? 'Check your token and repository access in Settings.' : 'Team save failed. Use Refresh to retry.');
      pending.splice(0,batch.length); data=C.replay(merged,pending);localSave();render();return;
    }
  } catch(error) {syncFailed=true;localSave();setMessage(`Saved locally · ${error.message}`,true);}
  finally {saving=false;if(pending.length && !syncFailed){clearTimeout(saveTimer);saveTimer=setTimeout(sync,800);}}
}
async function refresh() {
  if(saving||loading)return;
  if(token && pending.length){await sync();return;}
  loading=true;setMessage('Refreshing project…');
  try {
    const remote=token ? (await readRemote()).data : await (async()=>{const source=location.hostname?.endsWith('.github.io') ? 'https://raw.githubusercontent.com/jens-lund/mail-shot-tracker/main/eternal-tomb/data/project.json' : 'data/project.json';const r=await fetch(source,{cache:'no-store'});if(!r.ok)throw new Error();return C.validate(await r.json());})();
    data=C.replay(remote,pending);syncFailed=false;localSave();render();
  } catch {setMessage(storageOK ? 'Local project ready · shared refresh unavailable' : 'Storage unavailable · export a backup',true);}
  finally {loading=false;if(token && pending.length && !syncFailed)sync();}
}
async function exportBackup() {
  try {
    const backup=C.clone(data); const paths=imagePaths(data);backup.localImages=[];
    for(const entry of (paths.size ? await M.all() : []))if(paths.has(entry.path))backup.localImages.push({path:entry.path,base64:await M.base64(entry.blob)});
    const blob=new Blob([JSON.stringify(backup,null,2)+'\n'],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`eternal-tomb-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch {setMessage('Could not create a complete backup. Check browser storage.',true);}
}
const ROLES={sheet:'Main character sheet',front:'Front',back:'Back',left:'Left',right:'Right',clothing:'Clothing reference','clothing-progress':'Current clothing',detail:'Detail',progress:'Progress render',reference:'Mood / scene reference'};
const VERSION_LABELS={reference:'Concept reference',wip:'Work in progress',review:'Needs feedback',approved:'Approved'};
const newId=prefix=>prefix+'_'+crypto.randomUUID().replaceAll('-','');
function currentVersion() {
  const asset=data.assets.find(a=>a.id===versionAsset)||data.assets[0];versionAsset=asset.id;
  const version=asset.versions.find(v=>v.id===versionId)||asset.versions[asset.versions.length-1];if(version)versionId=version.id;
  return {asset,version};
}
function imageTile(image,asset,version) {
  return `<article class="review-image">${editableImage(`<button class="image-open" data-image="${image.id}" aria-label="Open ${esc(image.caption||ROLES[image.role])}"><img src="${esc(M.src(image.path))}" alt="${esc(image.caption||ROLES[image.role])}" loading="lazy"></button>`,versionImageTarget(asset,version,image),`${ROLES[image.role]} image`)}<div class="image-info"><span class="eyebrow">${esc(ROLES[image.role])}</span><p>${esc(image.caption)}</p><button class="text-button" data-cover="${image.id}">${asset.cover===image.path?'✓ Main asset image':'Use as main asset image'}</button></div></article>`;
}
function renderVersions() {
  const {asset,version}=currentVersion();const previous=version&&asset.versions[asset.versions.indexOf(version)-1];
  const sheet=version&&(version.images.filter(i=>i.role==='sheet').at(-1)||version.images.find(i=>i.role==='reference')||version.images[0]);
  $('view').innerHTML=`<div class="section-heading"><div><h2>Versions & feedback</h2><p>Keep the history. Show the progress. Improve it together.</p></div><button class="button primary" id="newVersionButton" ${uploading?'disabled':''}>+ New version</button></div><div class="review-toolbar"><label>Asset<select id="versionAsset">${data.assets.map(a=>option(a.id,a.name,asset.id)).join('')}</select></label><label>Posting as<select id="feedbackIdentity">${option('','Choose your name',identity)}${data.team.map(x=>option(x,x,identity)).join('')}</select></label><span class="help">Each version keeps its own images and feedback.</span></div><div class="version-layout"><aside class="version-sidebar"><span class="eyebrow">VERSION HISTORY</span>${[...asset.versions].reverse().map(v=>`<button class="version-select ${v.id===version?.id?'selected':''}" data-select-version="${v.id}"><strong>${esc(v.title)}</strong><span>${esc(VERSION_LABELS[v.status])} · ${v.images.length} images</span><small>${esc(v.owner||'Unassigned')} · ${dateText(v.createdAt.slice(0,10))}</small><small>${v.comments.filter(c=>!c.resolved).length} open comments</small></button>`).join('')||'<p class="help">No versions yet.<br>Create your first working version.</p>'}</aside><section class="version-main">${version ? `<div class="panel"><div class="version-title-row"><div><span class="eyebrow">${esc(asset.name)}</span><h3>${esc(version.title)}</h3></div>${previous?`<button class="button subtle" id="compareButton">${comparison?'Hide comparison':'Compare previous'}</button>`:''}</div><div class="version-fields"><label>Version name<input data-vfield="title" value="${esc(version.title)}" maxlength="150" required></label><label>Owner<select data-vfield="owner">${teamOptions(version.owner)}</select></label><label>Review status<select data-vfield="status">${Object.entries(VERSION_LABELS).map(([id,text])=>option(id,text,version.status)).join('')}</select></label></div><label>Changes / review focus<textarea data-vfield="summary" maxlength="4000">${esc(version.summary)}</textarea></label>${comparison&&previous?`<div class="compare-grid"><div><span class="eyebrow">PREVIOUS · ${esc(previous.title)}</span>${previous.images.length?`<img src="${esc(M.src((previous.images.find(i=>i.role==='sheet')||previous.images[0]).path))}" alt="Previous version reference">`:'<div class="empty">No previous image</div>'}</div><div><span class="eyebrow">CURRENT · ${esc(version.title)}</span>${sheet?`<img src="${esc(M.src(sheet.path))}" alt="Current version reference">`:'<div class="empty">No current image</div>'}</div></div>`:''}<div class="sheet-heading"><h3>Main character sheet / current reference</h3><span class="muted">Click an image to inspect it</span></div>${sheet?`${editableImage(`<button class="main-sheet image-open" data-image="${sheet.id}" aria-label="Open main character sheet"><img src="${esc(M.src(sheet.path))}" alt="${esc(sheet.caption||'Main character sheet')}"></button>`,versionImageTarget(asset,version,sheet),'main character sheet')}<p class="image-caption">${esc(sheet.caption)}</p>`:'<div class="empty">Upload a character sheet or your current main reference.</div>'}<div class="angle-grid">${['front','back','left','right'].map(role=>{const img=version.images.filter(i=>i.role===role).at(-1);return img?`${editableImage(`<button class="angle-image image-open" data-image="${img.id}"><img src="${esc(M.src(img.path))}" alt="${ROLES[role]} view"><span>${ROLES[role]}</span></button>`,versionImageTarget(asset,version,img),`${ROLES[role]} view`)}`:`<button class="angle-placeholder" data-upload-angle="${role}"><span>+</span>${ROLES[role]} view<small>Upload an angle</small></button>`;}).join('')}</div><div class="sheet-heading"><h3>Clothing, details & progress</h3><span class="muted">${version.images.length} images in this version</span></div><div class="review-gallery">${version.images.filter(i=>(i.id!==sheet?.id||['clothing','clothing-progress','detail','progress'].includes(i.role))&&!['front','back','left','right'].includes(i.role)).map(i=>imageTile(i,asset,version)).join('')||'<div class="empty">Add clothing references, current clothing and detail renders below.</div>'}</div><form id="uploadForm" class="upload-panel"><h3>Upload progress images</h3><div class="field-grid"><label>Image type<select name="role">${Object.entries(ROLES).map(([id,text])=>option(id,text,'progress')).join('')}</select></label><label>Caption / what changed<input name="caption" maxlength="300" placeholder="e.g. v002 · shoulder cloth test"></label></div><label>Images<input type="file" name="images" id="progressFiles" accept="image/png,image/jpeg,image/webp" multiple required ${uploading?'disabled':''}></label><div class="upload-bottom"><span class="help">PNG, JPEG or WebP · up to 15 MB each<br>Images save here first, then share through team sync.</span><button class="button primary" type="submit" ${uploading?'disabled':''}>${uploading?'Saving images…':'Upload images ↑'}</button></div></form></div><div class="panel feedback-panel"><div class="section-heading"><div><span class="eyebrow">REVIEW THIS VERSION</span><h3>Feedback & comments</h3></div><span class="badge">${version.comments.filter(c=>!c.resolved).length} open</span></div><div class="comments">${version.comments.map(c=>`<article class="comment ${c.resolved?'resolved':''}"><div class="comment-meta"><strong>${esc(c.author)}</strong><span>${c.target?'→ '+esc(c.target):'→ Everyone'}${c.image?' · '+esc(version.images.find(i=>i.id===c.image)?.caption||ROLES[version.images.find(i=>i.id===c.image)?.role]||'Image'):''}</span><time>${new Date(c.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</time></div><p>${esc(c.body)}</p><label class="comment-resolve"><input type="checkbox" data-comment-resolve="${c.id}" ${c.resolved?'checked':''}>${c.resolved?'Resolved':'Mark resolved'}</label></article>`).join('')||'<div class="feedback-empty">No feedback yet. Ask for a specific improvement to make the next version easier.</div>'}</div><form id="feedbackForm"><div class="field-grid"><label>Feedback for<select name="target">${option('','Everyone','')}${data.team.map(x=>option(x,x,'')).join('')}</select></label><label>About<select name="image">${option('','This version','')}${version.images.map(i=>option(i.id,ROLES[i.role]+' · '+(i.caption||i.id),'')).join('')}</select></label></div><label>Your feedback<textarea name="body" required maxlength="6000" placeholder="What works? What needs improving? Suggest a concrete next step."></textarea></label><div class="dialog-actions"><button class="button primary" type="submit">Post feedback →</button></div></form></div>` : `<div class="panel"><div class="empty"><h3>A place for the next iteration</h3><p>Create a version, upload your current work and invite feedback.</p><button class="button primary" id="firstVersionButton">+ Create first version</button></div></div>`}</section></div>`;
}
function openNewVersion(){const {asset}=currentVersion();const f=$('newVersionForm');f.elements.title.value=`v${String(asset.versions.length+1).padStart(3,'0')} · `;f.elements.summary.value='';f.elements.owner.innerHTML=teamOptions(identity||asset.owner);$('newVersionDialog').showModal();}
async function uploadImages(form) {
  if(uploading)return;const {asset,version}=currentVersion();if(!version)return;
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
  const form=$('thumbnailForm');form.reset();$('thumbnailError').textContent='';
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
    else if(target.kind==='cover')commit({kind:'field',group:'assets',id:target.assetId,field:'cover',value:path});
    else commit({kind:'replaceImage',group:'assets',id:target.assetId,version:target.versionKey,image:target.imageId,value:{path,caption}});
    if(detail?.group==='assets'&&detail.id===target.assetId){const asset=data.assets.find(a=>a.id===detail.id);$('detailDialog').querySelector('.detail-cover').src=M.src(asset.cover||`images/${asset.image}.webp`);}
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
  if(e.target.closest('#refreshButton'))refresh();
  if(e.target.closest('#exportButton'))exportBackup();
  if(e.target.closest('#importButton'))$('importFile').click();
  if(e.target.closest('[data-version-link]'))$('detailDialog').close();
  if(e.target.closest('#newVersionButton,#firstVersionButton'))openNewVersion();
  const pick=e.target.closest('[data-select-version]');if(pick){versionId=pick.dataset.selectVersion;comparison=false;location.hash=`versions/${versionAsset}/${versionId}`;renderVersions();}
  if(e.target.closest('#compareButton')){comparison=!comparison;renderVersions();}
  const image=e.target.closest('[data-image]');if(image){const {version}=currentVersion();const selected=version.images.find(i=>i.id===image.dataset.image);$('largeImage').src=M.src(selected.path);$('largeImage').alt=selected.caption||ROLES[selected.role];$('imageTitle').textContent=selected.caption||ROLES[selected.role];$('imageDialog').showModal();}
  const cover=e.target.closest('[data-cover]');if(cover){const {asset,version}=currentVersion();commit({kind:'field',group:'assets',id:asset.id,field:'cover',value:version.images.find(i=>i.id===cover.dataset.cover).path});}
  const angle=e.target.closest('[data-upload-angle]');if(angle){$('uploadForm').elements.role.value=angle.dataset.uploadAngle;$('uploadForm').scrollIntoView({block:'center'});$('progressFiles').click();}
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='statusFilter'||el.id==='ownerFilter'){filter=$('statusFilter').value;ownerFilter=$('ownerFilter').value;$('filteredCards').innerHTML=tab==='assets'?assetCards():shotCards();return;}
  if(el.id==='versionAsset'){versionAsset=el.value;versionId='';comparison=false;location.hash=`versions/${versionAsset}`;renderVersions();return;}
  if(el.id==='feedbackIdentity'){identity=el.value;try{localStorage.setItem('eternal-tomb-feedback-name',identity);}catch{}return;}
  if(el.dataset.vfield){const {asset,version}=currentVersion();const value=el.value.trim();if(el.dataset.vfield==='title'&&!value){el.reportValidity();return;}commit({kind:'versionField',group:'assets',id:asset.id,version:version.id,field:el.dataset.vfield,value});return;}
  if(el.dataset.commentResolve){const {asset,version}=currentVersion();commit({kind:'commentResolved',group:'assets',id:asset.id,version:version.id,comment:el.dataset.commentResolve,value:el.checked});return;}
  if(el.dataset.milestone){const [id,check]=el.dataset.milestone.split(':');commit({kind:'milestone',id,check,value:el.checked});return;}
  if(el.id==='detailScopeFilter'&&detail){scopeFilter=el.value;render();openDetail(detail.group,detail.id);return;}
  if(el.dataset.taskCheck){updateDetailTask(el.dataset.taskCheck,el.checked?'done':'todo');return;}
  if(el.dataset.task){updateDetailTask(el.dataset.task,el.value);return;}
  if(el.dataset.field && detail){const field=el.dataset.field;let value=field==='blocked'?el.checked:el.value.trim();if(field==='file'&&value&&!C.safeUrl(value)){el.setCustomValidity('Use an http or https link.');el.reportValidity();return;}if(field==='name'&&!value){el.reportValidity();return;}el.setCustomValidity('');commit({kind:'field',...detail,field,value});if(field==='priority'){const scroll=detailDialog.scrollTop;openDetail(detail.group,detail.id);detailDialog.scrollTop=scroll;}}
});
document.addEventListener('input',e=>{
  if(e.target.id==='search'){search=e.target.value;$('filteredCards').innerHTML=tab==='assets'?assetCards():shotCards();}
  if(e.target.dataset.field==='file')e.target.setCustomValidity('');
});
document.addEventListener('submit',e=>{
  if(e.target.id==='thumbnailForm'){e.preventDefault();replaceThumbnail(e.target);return;}
  if(e.target.id==='addTaskForm'){e.preventDefault();const label=e.target.elements.task.value.trim();if(!label)return;if(data[detail.group].find(x=>x.id===detail.id).tasks.length>=200){setMessage('This section has reached its 200-task limit.',true);return;}commit({kind:'addTask',...detail,value:{id:'task_'+crypto.randomUUID().replaceAll('-',''),label,description:'',status:'todo',priority:scopeFilter==='nice'?'nice':'must',effort:'medium',due:'',owner:'',images:[],comments:[]}});openDetail(detail.group,detail.id);}
  if(e.target.id==='newVersionForm'){e.preventDefault();const {asset}=currentVersion();if(asset.versions.length>=100){setMessage('This asset has reached its 100-version limit.',true);return;}const title=e.target.elements.title.value.trim();if(!title)return;const version={id:newId('version'),title,summary:e.target.elements.summary.value.trim(),owner:e.target.elements.owner.value,status:'wip',createdAt:new Date().toISOString(),images:[],comments:[]};versionId=version.id;commit({kind:'addVersion',group:'assets',id:asset.id,value:version});$('newVersionDialog').close();location.hash=`versions/${asset.id}/${version.id}`;}
  if(e.target.id==='uploadForm'){e.preventDefault();uploadImages(e.target);}
  if(e.target.id==='feedbackForm'){e.preventDefault();if(!identity){setMessage('Choose your name under Posting as before leaving feedback.',true);$('feedbackIdentity').focus();return;}const {asset,version}=currentVersion();const body=e.target.elements.body.value.trim();if(!body)return;if(version.comments.length>=500){setMessage('This version has reached its 500-comment limit.',true);return;}e.target.elements.body.value='';commit({kind:'addComment',group:'assets',id:asset.id,version:version.id,value:{id:newId('comment'),author:identity,target:e.target.elements.target.value,image:e.target.elements.image.value,body,createdAt:new Date().toISOString(),resolved:false}});}
});
$('settingsForm').addEventListener('submit',e=>{
  e.preventDefault();const f=e.target;const team=[...new Set(f.elements.team.value.split(',').map(s=>s.trim()).filter(Boolean))];if(!team.length){f.elements.team.setCustomValidity('Enter at least one team member.');f.elements.team.reportValidity();return;}f.elements.team.setCustomValidity('');
  const preview=f.elements.preview.value.trim();if(preview&&!C.safeUrl(preview)){f.elements.preview.setCustomValidity('Use an http or https link.');f.elements.preview.reportValidity();return;}f.elements.preview.setCustomValidity('');
  const title=f.elements.title.value.trim();if(!title){f.elements.title.reportValidity();return;}
  token=f.elements.token.value.trim();try{localStorage.setItem(TOKEN_KEY,token);}catch{storageOK=false;}
  identity=f.elements.identity.value;try{localStorage.setItem('eternal-tomb-feedback-name',identity);}catch{}
  for(const [field,value] of Object.entries({title,deadline:f.elements.deadline.value,team,preview}))if(JSON.stringify(data[field])!==JSON.stringify(value))commit({kind:'project',field,value});
  $('settingsDialog').close();syncFailed=false;localSave();render();if(token)sync();
});
$('settingsForm').addEventListener('input',e=>e.target.setCustomValidity?.(''));
$('importFile').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try {if(file.size>100000000)throw new Error('Backup is too large.');const raw=JSON.parse(await file.text());const imported=C.validate(raw);const media=raw.localImages||[];if(!Array.isArray(media)||media.length>500||media.some(i=>!C.imagePath(i.path)||!i.path.startsWith('uploads/')||typeof i.base64!=='string'||i.base64.length>7000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(i.base64)))throw new Error('Backup contains invalid image data.');if(!confirm('Replace this project with the selected backup? Export your current project first if you need to keep it.'))return;for(const i of media)await M.store(i.path,new Blob([Uint8Array.from(atob(i.base64),x=>x.charCodeAt(0))],{type:'image/webp'}));commit({kind:'replace',data:imported});}
  catch(error){setMessage(error.message||'Could not import this backup.',true);}finally{e.target.value='';}
});
for(const dialog of document.querySelectorAll('dialog')){
  dialog.addEventListener('click',e=>{if(e.target===dialog){if(dialog.id==='thumbnailDialog'&&uploading)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
}
$('previewDialog').addEventListener('close',()=>{$('previewContent').querySelector('video')?.pause();});
$('detailDialog').addEventListener('close',()=>{if(!$('detailDialog').open)detail=null;});
function navigate(){
  captureReviewDraft();const parts=location.hash.slice(1).split('/'),[candidate,asset,version]=parts;
  if($('detailDialog').open)$('detailDialog').close();
  tab=['overview','assets','cinematic','milestones','versions','tasks','calendar','review'].includes(candidate)?candidate:candidate==='task'?(asset==='shots'?'cinematic':'assets'):'overview';
  if(candidate==='versions'&&asset){versionAsset=asset;versionId=version||'';comparison=false;}
  if(candidate==='calendar'&&/^\d{4}-\d{2}(?:-\d{2})?$/.test(asset||'')&&C.validDate(asset.slice(0,7)+'-01')){calendarMonth=asset.slice(0,7);calendarDay=asset.length===10&&C.validDate(asset)?asset:'';}
  if(candidate==='tasks')taskStatusFilter=C.statuses.includes(asset)?asset:'';
  if(candidate==='review'&&parts.length===4){reviewKey=parts.slice(1).join('/');reviewImage='';annotationPoint=null;}
  filter='';ownerFilter='';search='';render(true);
  if(candidate==='task'&&['assets','shots'].includes(asset)){const item=data[asset].find(i=>i.id===version),task=item?.tasks.find(t=>t.id===parts[3]);if(item){if(!visibleItem(item)||(task&&!visibleTasks(item).includes(task))){scopeFilter='all';render();}openDetail(asset,version,parts[3]);}else setMessage('This task or section is no longer available.',true);}
}

window.addEventListener('hashchange',navigate);
window.addEventListener('online',()=>token?sync():refresh());
document.addEventListener('visibilitychange',()=>{if(autoRefreshAllowed())refresh();});
setInterval(()=>{if(autoRefreshAllowed())refresh();},30000);
navigate();localSave();refresh();M.hydrate().then(()=>render());

