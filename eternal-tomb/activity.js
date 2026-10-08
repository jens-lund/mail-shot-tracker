'use strict';
let activitySeen=Date.now(),activityKnown=new Set(),activityReady=false,activityToastTimer,undoCandidate=null,undoCandidateState='',configureTarget=null,activityLimit=100;
try{activitySeen=Number(localStorage.getItem('eternal-tomb-activity-seen'))||Date.now();}catch{}
function operationDescription(op){
  const part=op.kind==='batch'?op.ops.find(p=>p.id)||op.ops[0]:op,ctx=op.context?workContext(op.context):null;
  const item=ctx?.item||data[part.group]?.find(i=>i.id===part.id),holder=ctx?.holder||(part.version?item?.versions.find(v=>v.id===part.version):part.task?item?.tasks.find(t=>t.id===part.task):null);
  const object=holder?.title||holder?.label||item?.name||data.milestones.find(m=>m.id===part.id)?.name||part.value?.name||'project';
  const names={addComment:'Commented on',addTaskComment:'Commented on',addImage:'Added an image to',addTaskImage:'Added an image to',replaceImage:'Replaced an image in',taskImageField:'Edited an image in',versionImageField:'Edited an image in',taskImageDeleted:part.value?'Removed an image from':'Restored an image in',versionImageDeleted:part.value?'Removed an image from':'Restored an image in',taskCommentDeleted:part.value?'Removed feedback from':'Restored feedback in',versionCommentDeleted:part.value?'Removed feedback from':'Restored feedback in',deleteVersion:'Removed version',restoreVersion:'Restored version',removeTask:'Removed task',restoreTask:'Restored task',addTask:'Added a task to',addVersion:'Added a version to',archiveAsset:part.value?'Removed asset':'Restored asset',archiveShot:part.value?'Removed shot':'Restored shot',addAsset:'Added asset',addShot:'Added shot',moveShot:'Reordered shot',assignSection:'Assigned',undoHistory:'Undid a change in',replace:'Imported a backup into'};
  const label=op.label?`${op.label} · ${object}`:part.kind==='undoHistory'?'Undid: '+(data.activity.find(e=>e.id===part.event)?.label||'change'):part.kind==='project'?`Edited project ${({previewMedia:'previs video',memberColors:'team colors',hero:'banner',brandLabel:'header label',pageCopy:'page text',preview:'previs link'})[part.field]||part.field}`:(names[part.kind]||'Edited')+' '+object+(part.field?' · '+part.field:'');
  const href=part.kind==='undoHistory'?'#activity':holder&&part.version?`#versions/${item.id}/${holder.id}`:item?taskLink(part.group,item,part.task?holder:null):part.kind.toLowerCase().includes('milestone')||part.check?'#milestones':'#overview';
  const reviewRequested=(part.kind==='versionField'&&part.field==='status'&&part.value==='review')||(part.kind==='task'&&part.value==='review')||(op.label||'').startsWith('Requested feedback');
  const targets=[...new Set([part.value?.target,holder?.owner,holder?.reviewTarget,item?.owner,...(reviewRequested?['*']:[])].filter(x=>typeof x==='string'&&x))];
  return {label,href,targets};
}
function updateActivityAlerts(){
  const events=data.activity||[],login=editorAccess.login;
  const relevant=e=>e.actor!==login&&e.author!==identity&&(e.targets.includes('*')||e.targets.includes(identity));
  const unseen=events.filter(e=>Date.parse(e.createdAt)>activitySeen&&relevant(e)&&!e.undoneAt);
  const badge=$('activityCount');if(badge){const text=unseen.length?String(unseen.length):'';if(badge.textContent!==text)badge.textContent=text;badge.hidden=!unseen.length;}
  if(activityReady){const incoming=events.filter(e=>!activityKnown.has(e.id)&&Date.parse(e.createdAt)>activitySeen&&relevant(e)&&!e.undoneAt);if(incoming.length){$('activityToastText').textContent=incoming.length===1?`${incoming[0].author||incoming[0].actor}: ${incoming[0].label}`:`${incoming.length} team updates · open Activity to see what changed`;$('activityToast').hidden=false;clearTimeout(activityToastTimer);activityToastTimer=setTimeout(()=>{$('activityToast').hidden=true;},6500);}}
  activityKnown=new Set(events.map(e=>e.id));activityReady=true;
}
function markActivityRead(){activitySeen=Date.now();try{localStorage.setItem('eternal-tomb-activity-seen',String(activitySeen));}catch{}updateActivityAlerts();}
function recoveryRows(){
  const rows=[],add=(title,op,category)=>rows.push(`<div class="trash-row"><span><small>${esc(category)}</small>${esc(title)}</span><button class="text-button" data-recover-op="${esc(JSON.stringify(op))}">Restore</button></div>`);
  for(const group of ['assets','shots'])for(const item of data[group]){
    if(item.archived){add(item.name,{kind:group==='assets'?'archiveAsset':'archiveShot',id:item.id,value:false},group==='assets'?'Asset':'Shot');continue;}
    for(const entry of item.deletedTasks||[])add(entry.task.label,{kind:'restoreTask',group,id:item.id,task:entry.task.id},item.name+' · Task');
    for(const [kind,holders] of [['task',item.tasks],['version',item.versions||[]]])for(const holder of holders){
      const ctx=workContext(workKey(group,item.id,kind,holder.id));
      if(holder.deletedAt){add(holder.title,workOp(ctx,'restoreVersion'),item.name+' · Version');continue;}
      for(const image of holder.images)if(image.deletedAt)add(image.caption||'Image',workOp(ctx,(kind==='version'?'version':'task')+'ImageDeleted',{image:image.id,value:''}),item.name+' · Image');
      for(const comment of holder.comments)if(comment.deletedAt)add(comment.author+': '+comment.body.slice(0,100),workOp(ctx,(kind==='version'?'version':'task')+'CommentDeleted',{comment:comment.id,value:''}),item.name+' · Feedback');
    }
  }
  for(const m of data.milestones){if(m.deletedAt)add(m.name,{kind:'milestoneDeleted',id:m.id,value:''},'Milestone');else for(const c of m.checks)if(c.deletedAt)add(c.label,{kind:'checkDeleted',id:m.id,check:c.id,value:''},m.name+' · Deliverable');}
  return rows.join('')||'<p class="feedback-empty">Nothing removed. Deleted work stays here until you restore it.</p>';
}
function historyChanges(event){
  const labels={title:'Title',name:'Name',description:'Description',label:'Task / deliverable',owner:'Owner',status:'Status',due:'Due date',deadline:'Delivery',workSummary:'Creator update',summary:'Creator update',feedbackRequest:'Feedback request',reviewTarget:'Feedback for',requestedAt:'Review requested',requestedBy:'Requested by',caption:'Caption',role:'Image type',path:'Image',cover:'Thumbnail',hero:'Banner',deletedAt:'Removed',archived:'Removed',notes:'Notes',camera:'Camera',duration:'Shot length',priority:'Importance',effort:'Effort',team:'Team',previewMedia:'Previs video',memberColors:'Team colors',pageCopy:'Page text',images:'Image',comments:'Feedback',tasks:'Task',versions:'Version',milestones:'Milestone',checks:'Deliverable',assets:'Asset',shots:'Shot',$order:'Order',removedTaskIds:'Removed tasks',deletedTasks:'Recovered work'};
  function value(v,exists,patch){
    if(!exists)return '—';if(patch.path.at(-1)==='deletedAt')return v?'Removed':'Available';
    if(Array.isArray(v)){const list=C.readPath(data,patch.path.slice(0,-1));return v.map(x=>typeof x==='string'&&Array.isArray(list)?list.find(i=>i.id===x)?.name||list.find(i=>i.id===x)?.label||list.find(i=>i.id===x)?.title||x:typeof x==='object'?x.name||x.label||x.title||x.caption||x.task?.label||'Entry':x).join(', ').slice(0,400);}
    if(v&&typeof v==='object')return String(v.title||v.name||v.caption||v.body||v.label||v.task?.label||Object.keys(v).join(', ')).slice(0,400);
    if(typeof v==='boolean')return v?'Yes':'No';if(C.imagePath(v))return 'Image';if(C.videoPath(v))return 'Video';return String(LABELS[v]||VERSION_LABELS[v]||v||'—').slice(0,400);
  }
  const changes=event.patches.filter(p=>!p.path.includes('removedTaskIds')&&!p.path.includes('deletedTasks')&&(p.path.at(-1)!=='$order'||event.kind==='moveShot'));
  return changes.length?`<details class="change-details"><summary>View changes</summary>${changes.map(p=>`<div><strong>${esc(labels[p.path.at(-1)]||labels[p.path.at(-2)]||p.path.at(-1))}</strong><span>${esc(value(p.before,p.beforeExists,p))}</span><span aria-hidden="true">→</span><span>${esc(value(p.after,p.afterExists,p))}</span></div>`).join('')}</details>`:'';
}
function renderActivity(){
  const events=(data.activity||[]).slice(-activityLimit).reverse(),groups=[];
  for(const event of events){const last=groups.at(-1);if(last&&last[0].actor===event.actor&&last[0].href===event.href&&Date.parse(last.at(-1).createdAt)-Date.parse(event.createdAt)<30000&&!event.reverts&&!last[0].reverts)last.push(event);else groups.push([event]);}
  const row=e=>`<article class="activity-entry ${e.undoneAt?'is-undone':''}"><div><strong>${esc(e.author||e.actor)}</strong> <small>@${esc(e.actor)}</small><p><a href="${esc(e.href)}">${esc(e.label)}</a></p><time>${new Date(e.createdAt).toLocaleString()}</time>${historyChanges(e)}${e.undoneAt?'<small> · Undone</small>':''}</div>${!e.undoneAt?smallX(`data-undo-change="${e.id}"`,'Undo this change'):'<span class="muted">✓</span>'}</article>`;
  $('view').innerHTML=`<div class="section-heading"><div><h2>Activity & recovery</h2><p>See who changed what. Undo edits or restore removed work.</p></div><button class="button subtle" id="markActivityRead">Mark read</button></div><section class="panel"><h3>Recently deleted</h3><p class="help">Removed content is kept for recovery. Restoring a section also restores its tasks and versions. Every recorded edit can be undone below.</p>${recoveryRows()}</section><section class="panel"><h3>Changes</h3>${groups.map(g=>g.length===1?row(g[0]):`<details class="activity-group"><summary>${esc(g[0].author||g[0].actor)} · ${g.length} updates · ${esc(g[0].label)}<small>${new Date(g[0].createdAt).toLocaleString()}</small></summary>${g.map(row).join('')}</details>`).join('')||'<p class="feedback-empty">New edits will appear here with the editor and time.</p>'}${data.activity.length>activityLimit?'<button class="button subtle" id="loadOlderChanges">Show older changes</button>':''}</section>`;
}
function requestUndo(id){
  const event=data.activity.find(e=>e.id===id&&!e.undoneAt);if(!event)return;
  const conflicts=C.undoConflicts(data,event);undoCandidate=id;undoCandidateState=JSON.stringify(C.undoSnapshot(data,event));$('undoTitle').textContent='Undo: '+event.label;
  $('undoHelp').textContent=conflicts.length?'Some affected fields changed again after this edit. Undoing will replace those newer values. Unrelated work is kept.':'This restores the affected fields to their previous values. Unrelated work is kept.';
  $('undoConflicts').innerHTML=conflicts.length?`<ul>${conflicts.map(p=>`<li>${esc(p.path.join(' / '))}</li>`).join('')}</ul>`:'';
  $('undoConfirmLabel').hidden=!conflicts.length;$('undoConfirm').checked=false;$('undoForm').dataset.conflicts=String(conflicts.length);$('undoDialog').showModal();
}
function autoGrowTextareas(root=document){root.querySelectorAll('textarea').forEach(el=>{if(el.offsetParent===null&&!el.closest('dialog[open]'))return;const old=el.style.height;el.style.height='auto';const height=Math.max(48,el.scrollHeight+2)+'px';el.style.height=height;if(old===height)return;});}
let growScheduled=false;
function scheduleAutoGrow(){if(growScheduled)return;growScheduled=true;requestAnimationFrame(()=>{growScheduled=false;autoGrowTextareas();});}
function applyWorkbenchDecorations(){
  scheduleAutoGrow();updateActivityAlerts();
  const heading=$('view')?.querySelector('.section-heading>div');
  if(heading&&tab!=='activity'&&!heading.querySelector('[data-edit-page]')){
    const title=heading.querySelector('h2'),description=heading.querySelector('p'),copy=data.pageCopy[tab];if(copy&&title){title.textContent=copy.title;if(description)description.textContent=copy.description;}
    if(title){const edit=document.createElement('button');edit.type='button';edit.className='copy-edit';edit.dataset.editPage=tab;edit.innerHTML=pencil;edit.title='Edit page heading and description';edit.setAttribute('aria-label','Edit '+tab+' heading');heading.append(edit);}
  }
  const brand=document.querySelector('.brand small'),tagline=document.querySelector('.hero-copy p'),genre=document.querySelector('.hero-copy .eyebrow'),footer=document.querySelector('footer>span');
  for(const [el,value] of [[brand,data.brandLabel],[tagline,data.tagline],[genre,data.genre],[footer,data.footer]])if(el&&typeof value==='string'&&el.textContent!==value)el.textContent=value;
  const mark=document.querySelector('.brand-mark');if(mark&&mark.textContent!==data.title.slice(0,1))mark.textContent=data.title.slice(0,1);
  const hero=document.querySelector('.project-hero');if(data.hero&&!hero.querySelector('[data-reset-image]'))hero.insertAdjacentHTML('beforeend',smallX('data-reset-image="hero"','Remove custom banner'));else if(!data.hero)hero.querySelector('[data-reset-image]')?.remove();
  document.querySelectorAll('[data-member-name]').forEach(el=>{const color=data.memberColors[el.dataset.memberName];if(color)el.style.setProperty('--person-color',color);});
}
function openPageEditor(page){
  const heading=$('view').querySelector('.section-heading>div'),f=$('pageCopyForm');configureTarget=page;f.elements.title.value=data.pageCopy[page]?.title??heading.querySelector('h2').textContent;f.elements.description.value=data.pageCopy[page]?.description??heading.querySelector('p')?.textContent??'';$('pageCopyDialog').showModal();applyEditorAccess();
}
function customSettingsValues(form){return {tagline:form.elements.tagline.value.trim(),genre:form.elements.genre.value.trim(),brandLabel:form.elements.brandLabel.value.trim(),footer:form.elements.footer.value.trim(),memberColors:Object.fromEntries([...form.querySelectorAll('[data-member-color]')].map(el=>[el.dataset.memberColor,el.value]))};}
function populateCustomSettings(form){
  const defaults={tagline:'A wounded knight. A hidden cavern. A home, a prison, a terrible ritual.',genre:'DARK FANTASY / SHORT FILM',brandLabel:'3D PRODUCTION TRACKER',footer:'BUILD THE WORLD. FINISH THE FILM.'};
  for(const field of Object.keys(defaults))form.elements[field].value=data[field]??defaults[field];
  $('teamColors').innerHTML=data.team.map((name,i)=>`<label>${esc(name)}<input type="color" data-member-color="${esc(name)}" value="${data.memberColors[name]||(['#79c8f5','#b39ade','#ed92bd'][i%3])}" aria-label="${esc(name)} color"></label>`).join('');
}
function removedTaskMarkup(item,group){return item.deletedTasks?.length?`<details class="trash-list"><summary>Removed tasks (${item.deletedTasks.length})</summary>${item.deletedTasks.map(e=>`<div class="trash-row"><span>${esc(e.task.label)}</span><button class="text-button" data-recover-op="${esc(JSON.stringify({kind:'restoreTask',group,id:item.id,task:e.task.id}))}">Restore</button></div>`).join('')}</details>`:'';}
function renderEditableMilestones(){
  const milestones=C.activeMilestones(data),first=milestones.find(m=>C.activeChecks(m).some(c=>!c.done));
  $('view').innerHTML=`<div class="section-heading"><div><h2>From first idea to final film</h2><p>Approval gates · edit deliverables and check them after review.</p></div><button class="button primary" id="addMilestoneButton">+ Milestone</button></div><div class="milestones">${milestones.map((m,i)=>`<article class="milestone ${m===first?'current':''}"><div class="milestone-number">${String(i+1).padStart(2,'0')}</div><div><div class="card-top"><label class="grow"><span class="field-caption">Milestone name</span><input data-milestone-field="name" data-id="${m.id}" maxlength="150" value="${esc(m.name)}" required></label>${smallX(`data-remove-milestone="${m.id}"`,'Remove milestone')}</div><label>Description<textarea data-milestone-field="description" data-id="${m.id}" maxlength="2000">${esc(m.description)}</textarea></label><div class="task-list">${C.activeChecks(m).map(c=>`<div class="editable-check"><input type="checkbox" data-milestone="${m.id}:${c.id}" ${c.done?'checked':''} aria-label="Complete ${esc(c.label)}"><input data-check-field="${m.id}:${c.id}" maxlength="300" value="${esc(c.label)}" aria-label="Deliverable name" required>${smallX(`data-remove-check="${m.id}:${c.id}"`,'Remove deliverable')}</div>`).join('')}</div><form data-add-check="${m.id}" class="add-task"><input name="label" maxlength="300" placeholder="Add a deliverable…" required><button class="button" type="submit">Add</button></form></div></article>`).join('')||'<div class="empty">Add a milestone or restore one in Activity & recovery.</div>'}</div>`;
}
function openNewAsset(){const f=$('newAssetForm');f.reset();$('newAssetDialog').showModal();applyEditorAccess();}
document.addEventListener('input',e=>{if(e.target.tagName==='TEXTAREA')scheduleAutoGrow();if(e.target.matches?.('[data-milestone-field],[data-check-field]'))unfinishedFields.add(e.target);});
document.addEventListener('toggle',scheduleAutoGrow,true);
document.addEventListener('change',e=>{
  const el=e.target;if(el.dataset.milestoneField&&!el.checkValidity()){el.reportValidity();return;}if(el.dataset.checkField&&!el.checkValidity()){el.reportValidity();return;}if(el.dataset.milestoneField)commit({kind:'milestoneField',id:el.dataset.id,field:el.dataset.milestoneField,value:el.value.trim()});
  if(el.dataset.checkField){const [id,check]=el.dataset.checkField.split(':');commit({kind:'checkField',id,check,field:'label',value:el.value.trim()});}
});
document.addEventListener('click',e=>{
  if(e.target.closest('#activityButton')){markActivityRead();location.hash='activity';}
  if(e.target.closest('#markActivityRead'))markActivityRead();if(e.target.closest('#loadOlderChanges')){activityLimit+=100;renderActivity();applyEditorAccess();}
  if(e.target.closest('#activityToastClose'))$('activityToast').hidden=true;
  if(e.target.closest('[data-remove-previs]')){if(commit({kind:'project',field:'previewMedia',value:null}))renderPreviewContent();return;}
  const reset=e.target.closest('[data-reset-image]');if(reset){const [kind,id]=reset.dataset.resetImage.split(':');commit(kind==='hero'?{kind:'project',field:'hero',value:''}:{kind:'field',group:'assets',id,field:'cover',value:''});if(detail)refreshWorkDetail();return;}
  const recover=e.target.closest('[data-recover-op]');if(recover){commit(JSON.parse(recover.dataset.recoverOp));refreshWorkDetail();return;}
  const undo=e.target.closest('[data-undo-change]');if(undo){requestUndo(undo.dataset.undoChange);return;}
  const edit=e.target.closest('[data-edit-page]');if(edit){openPageEditor(edit.dataset.editPage);return;}
  if(e.target.closest('#editProjectButton'))openSettings();
  if(e.target.closest('#newAssetButton'))openNewAsset();
  const remove=e.target.closest('[data-remove-asset]');if(remove){const asset=data.assets.find(a=>a.id===remove.dataset.removeAsset);const f=$('removeContentForm');f.dataset.kind='asset';f.dataset.id=asset.id;$('removeContentTitle').textContent='Remove '+asset.name+'?';$('removeContentHelp').textContent='This asset and its tasks and versions will leave the active project. Shot dependencies are kept so you can restore everything later.';f.elements.confirm.checked=false;$('removeContentDialog').showModal();return;}
  const milestone=e.target.closest('[data-remove-milestone]');if(milestone){const f=$('removeContentForm');f.dataset.kind='milestone';f.dataset.id=milestone.dataset.removeMilestone;$('removeContentTitle').textContent='Remove this milestone?';$('removeContentHelp').textContent='Its deliverables are kept in Activity & recovery.';f.elements.confirm.checked=false;$('removeContentDialog').showModal();return;}
  const check=e.target.closest('[data-remove-check]');if(check){const [id,c]=check.dataset.removeCheck.split(':');commit({kind:'checkDeleted',id,check:c,value:new Date().toISOString()});return;}
  if(e.target.closest('#addMilestoneButton')){const name=prompt('Milestone name');if(name?.trim())commit({kind:'addMilestone',value:{id:newId('milestone'),name:name.trim(),description:'',checks:[]}});}
});
document.addEventListener('submit',e=>{
  const f=e.target;
  if(f.id==='undoForm'){e.preventDefault();if(!canEditProject())return;const event=data.activity.find(a=>a.id===undoCandidate);if(!event||event.undoneAt){$('undoDialog').close();return;}const conflicts=C.undoConflicts(data,event);if(conflicts.length&&(JSON.stringify(C.undoSnapshot(data,event))!==undoCandidateState||!Number(f.dataset.conflicts)||!$('undoConfirm').checked)){requestUndo(event.id);return;}try{if(commit({kind:'undoHistory',event:event.id,force:!!conflicts.length,expected:C.undoSnapshot(data,event)})){$('undoDialog').close();renderSharedUpdate();}}catch(error){setMessage(error.message,true);}return;}
  if(f.id==='pageCopyForm'){e.preventDefault();const value={title:f.elements.title.value.trim(),description:f.elements.description.value.trim()};if(commit({kind:'pageText',page:configureTarget,value}))$('pageCopyDialog').close();return;}
  if(f.id==='removeContentForm'){e.preventDefault();if(!f.elements.confirm.checked)return;commit(f.dataset.kind==='asset'?{kind:'archiveAsset',id:f.dataset.id,value:true}:{kind:'milestoneDeleted',id:f.dataset.id,value:new Date().toISOString()});$('removeContentDialog').close();if($('detailDialog').open)$('detailDialog').close();return;}
  if(f.dataset.addCheck){e.preventDefault();const label=f.elements.label.value.trim();if(label){f.elements.label.value='';if(!commit({kind:'addCheck',id:f.dataset.addCheck,value:{id:newId('check'),label,done:false}}))f.elements.label.value=label;}return;}
  if(f.id==='newAssetForm'){e.preventDefault();if(data.assets.length>=50){setMessage('Up to 50 assets, including recoverable assets.',true);return;}const asset={id:newId('asset'),name:f.elements.name.value.trim(),category:f.elements.category.value.trim(),description:f.elements.description.value.trim(),image:'reveal',owner:'',priority:'must',due:'',blocked:false,blocker:'',notes:'',file:'',versions:[],tasks:['Design','Model','Materials','Rig','Motion test','Scene ready'].map(label=>({id:newId('task'),label,description:'',status:'todo',effort:'medium',priority:'must',owner:'',due:'',images:[],comments:[]}))};commit({kind:'addAsset',value:asset});$('newAssetDialog').close();openDetail('assets',asset.id);return;}
});
