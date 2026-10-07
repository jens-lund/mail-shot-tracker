'use strict';
// Production controls share the existing field-level GitHub save queue.
let scopeFilter = 'all', taskStatusFilter = '', effortFilter = '', taskSort = 'priority';
let calendarMonth = '', calendarDay = '', reviewKey = '', reviewImage = '', annotationPoint = null;
const reviewDrafts = new Map();
const EFFORT_LABELS = {small:'Small', medium:'Medium', large:'Large'};
const PRIORITY_LABELS = {must:'Must have', nice:'Nice to have'};
function visibleTasks(item) { return C.scopedTasks(item, scopeFilter); }
function scopedProgress(item) { return C.progress({...item, tasks:visibleTasks(item)}); }
function scopedStatus(item) {
  const tasks = visibleTasks(item);
  if(tasks.length && tasks.every(t=>t.status==='done')) return 'done';
  if(tasks.some(t=>t.status==='review')) return 'review';
  if(tasks.some(t=>t.status==='doing' || t.status==='done')) return 'active';
  return 'todo';
}
function visibleItem(item) { return scopeFilter==='all' || (scopeFilter==='must' ? item.priority!=='nice' : item.priority==='nice' || visibleTasks(item).length>0); }
function orderedTasks(item) {
  return visibleTasks(item).slice().sort((a,b)=>Number(C.effectivePriority(item,a)==='nice')-Number(C.effectivePriority(item,b)==='nice') || (a.due||'9999').localeCompare(b.due||'9999') || ['small','medium','large'].indexOf(a.effort)-['small','medium','large'].indexOf(b.effort));
}
function taskLink(group,item,task) { return `#task/${group}/${item.id}${task?'/'+task.id:''}`; }
function priorityOptions(selected) { return Object.entries(PRIORITY_LABELS).map(([v,l])=>option(v,l,selected)).join(''); }
function taskControls(item,task,group) {
  const key=`${group}:${item.id}:${task.id}`;
  return `<select class="status-picker status-${task.status}" data-task-status="${key}" aria-label="${esc(task.label)} status">${C.statuses.map(s=>option(s,LABELS[s],task.status)).join('')}</select>`;
}
function scopeToolbar() {
  return `<label>Scope<select id="scopeFilter" aria-label="Task scope">${option('all','All work',scopeFilter)}${option('must','Must have only',scopeFilter)}${option('nice','Nice to have only',scopeFilter)}</select></label><p>Must have sets importance. Effort estimates the work.<br>Nice to have work stays out of deadline reminders.</p>`;
}
function renderWorkflowMetrics() {
  const entries=C.taskEntries(data,scopeFilter), soon=C.dueSoon(data);
  const percentage=group=>{const tasks=entries.filter(e=>e.group===group);return tasks.length?Math.round(tasks.filter(e=>e.task.status==='done').length/tasks.length*100):0;};
  $('metrics').innerHTML=`<a class="metric" href="#assets"><span>Asset readiness</span><strong>${percentage('assets')}% <small>of visible tasks done</small></strong>${progressBar(percentage('assets'))}</a><a class="metric" href="#cinematic"><span>Cinematic completion</span><strong>${percentage('shots')}% <small>of visible tasks done</small></strong>${progressBar(percentage('shots'),true)}</a><a class="metric" href="#review"><span>Ready for review</span><strong>${entries.filter(e=>e.task.status==='review').length}<small>tasks · open queue →</small></strong></a><a class="metric" href="#calendar"><span>Due soon / overdue</span><strong>${soon.length}<small>Must have · next 3 days</small></strong></a>`;
  $('scopeControls').innerHTML=scopeToolbar();
  $('statusSummary').innerHTML=C.statuses.map(s=>`<a class="status-summary status-${s}" href="#tasks/${s}"><span class="status-dot"></span>${LABELS[s]} <strong>${entries.filter(e=>e.task.status===s).length}</strong><span aria-hidden="true">↗</span></a>`).join('');
}
function memberColor(name) {return name.toLowerCase()==='jens'?'jens':name.toLowerCase()==='kevin'?'kevin':'neutral';}
function memberBadge(name) {return `<span class="member-badge member-${memberColor(name)}"><span class="member-avatar">${esc(name.charAt(0)||'–')}</span>${esc(name||'Unassigned')}</span>`;}
function taskAssignee(t,group,id) {
  return `<div class="assignee-buttons" role="group" aria-label="Assign ${esc(t.label)}">${['',...data.team].map(name=>`<button type="button" class="assignee-button member-${memberColor(name)}" data-assign-task="${group}:${id}:${t.id}" data-assignee="${esc(name)}" aria-pressed="${t.owner===name}" aria-label="Assign ${esc(t.label)} to ${esc(name||'Unassigned')}"><span class="member-avatar">${esc(name.charAt(0)||'–')}</span>${esc(name||'Unassigned')}<span class="assignee-check" aria-hidden="true">${t.owner===name?'✓':''}</span></button>`).join('')}</div>`;
}
function taskTeamSummary(item) {const names=[...new Set(visibleTasks(item).map(t=>t.owner).filter(Boolean))];return names.length?names.map(memberBadge).join(''):'<span class="muted">No tasks assigned</span>';}
function detailUploadDraft() {return [...document.querySelectorAll('[data-detail-upload]')].some(f=>f.elements.images.files.length||f.elements.caption.value.trim());}
function taskProgressMarkup(t,group,id) {
  const images=[...t.images].reverse();
  return `<section class="task-progress-images" aria-label="${esc(t.label)} progress images"><div class="task-notes-heading"><h4>Current work</h4><span>${images.length} image${images.length===1?'':'s'}</span></div><div class="task-image-gallery ${images.length?'':'is-empty'}">${images.map((image,i)=>`<figure class="task-image ${i===0?'current':''}"><button type="button" class="image-open" data-task-image="${group}:${id}:${t.id}:${image.id}" aria-label="Open ${esc(image.caption||'progress image')}"><img src="${esc(M.src(image.path))}" alt="${esc(image.caption||'Task progress')}" loading="lazy"></button><figcaption>${i===0?'<span class="current-image-label">Latest</span>':''}${esc(image.caption||'Progress image')}</figcaption></figure>`).join('')||'<p>Add a screenshot or render to show your progress.</p>'}</div><form data-detail-upload="${group}:${id}:${t.id}" class="task-image-upload"><label>Add images<input name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple required ${uploading?'disabled':''}></label><label>Caption / what changed<input name="caption" maxlength="300" placeholder="e.g. Blockout v002 · armour shape" ${uploading?'disabled':''}></label><div class="upload-bottom"><span class="help">Shared automatically with team sync.</span><button type="submit" class="button" ${uploading?'disabled':''}>${uploading?'Saving…':'Add images ↑'}</button></div><p class="task-upload-result" role="status"></p></form></section>`;
}
function taskEditor(item,t,group,index=0) {
  return `<article class="task-editor ${t.status==='done'?'completed':''}" id="task-${t.id}" data-task-row="${t.id}"><div class="task-editor-head"><span class="task-step" aria-label="Step ${index+1}">${String(index+1).padStart(2,'0')}</span><input type="checkbox" data-task-check="${t.id}" aria-label="Complete ${esc(t.label)}" ${t.status==='done'?'checked':''}><input class="task-name" data-task-field="label" data-task-id="${t.id}" aria-label="${esc(t.label)} task name" value="${esc(t.label)}" maxlength="150" required>${taskControls(item,t,group)}</div><div class="task-controls-row"><div class="task-assignment"><span class="field-caption">Assigned to</span>${taskAssignee(t,group,item.id)}</div><div class="task-pickers"><label>Due date<input type="date" data-task-field="due" data-task-id="${t.id}" value="${esc(t.due)}"></label><label>Effort<select data-task-field="effort" data-task-id="${t.id}">${Object.entries(EFFORT_LABELS).map(([v,l])=>option(v,l,t.effort)).join('')}</select></label><label>Importance<select data-task-field="priority" data-task-id="${t.id}">${priorityOptions(t.priority)}</select></label></div></div>${item.priority==='nice'?'<p class="help">This section is Nice to have, so its subtasks are optional too.</p>':''}<details><summary>Notes & progress images <span class="task-notes-count">${t.images.length?`${t.images.length} image${t.images.length===1?'':'s'} · `:''}${t.comments.filter(c=>!c.resolved).length} open comments</span></summary><div class="task-notes-grid"><label>Task description / next steps<textarea data-task-field="description" data-task-id="${t.id}" maxlength="2000" placeholder="What needs to be done? What changed?">${esc(t.description)}</textarea></label>${taskProgressMarkup(t,group,item.id)}</div><div class="task-actions"><a class="text-button" href="#review/${group}/${item.id}/${t.id}" data-workflow-link>${t.status==='review'?'Review & comments →':'Send to review →'}</a><a class="text-button task-calendar-link" href="#calendar/${t.due}" data-workflow-link ${t.due?'':'hidden'}>View in calendar →</a><button class="text-button danger" type="button" data-remove-task="${t.id}">Remove task</button></div></details></article>`;
}
function renderTaskList() {
  let entries=C.taskEntries(data,scopeFilter).filter(e=>(!taskStatusFilter||e.task.status===taskStatusFilter)&&(!effortFilter||e.task.effort===effortFilter)&&(!ownerFilter||(ownerFilter==='unassigned'?!e.task.owner:e.task.owner===ownerFilter))&&`${e.item.name} ${e.task.label} ${e.task.description}`.toLowerCase().includes(search.toLowerCase()));
  entries.sort((a,b)=>taskSort==='effort'?['small','medium','large'].indexOf(a.task.effort)-['small','medium','large'].indexOf(b.task.effort):Number(C.effectivePriority(a.item,a.task)==='nice')-Number(C.effectivePriority(b.item,b.task)==='nice') || (a.task.due||'9999').localeCompare(b.task.due||'9999'));
  $('view').innerHTML=`<div class="section-heading"><div><h2>Tasks</h2><p>Choose what matters, estimate the work, and keep it moving.</p></div><span class="badge">${entries.length} tasks</span></div><div class="toolbar"><input type="search" id="taskSearch" aria-label="Search tasks" placeholder="Search tasks or sections…" value="${esc(search)}"><select id="taskStatusFilter" aria-label="Task status filter">${option('','All statuses',taskStatusFilter)}${C.statuses.map(s=>option(s,LABELS[s],taskStatusFilter)).join('')}</select><select id="effortFilter" aria-label="Effort filter">${option('','All effort levels',effortFilter)}${Object.entries(EFFORT_LABELS).map(([v,l])=>option(v,l,effortFilter)).join('')}</select><select id="taskSort" aria-label="Sort tasks">${option('priority','Importance, then due date',taskSort)}${option('effort','Effort: smallest first',taskSort)}</select></div><div class="task-table">${entries.map(({group,item,task})=>`<article class="task-table-row"><div><a href="${taskLink(group,item,task)}"><strong>${esc(task.label)}</strong><small>${esc(item.name)}</small>${memberBadge(task.owner)}</a></div><span class="importance ${C.effectivePriority(item,task)}">${PRIORITY_LABELS[C.effectivePriority(item,task)]}</span><span class="effort">${EFFORT_LABELS[task.effort]} effort</span>${task.due?`<a class="due-link" href="#calendar/${task.due}">${dateText(task.due)}</a>`:'<span class="muted">No date</span>'}${taskControls(item,task,group)}<a class="text-button" href="${taskLink(group,item,task)}">Edit →</a></article>`).join('')||'<div class="empty">No tasks match your filters.</div>'}</div>`;
}
function dueReminder() {
  const entries=C.dueSoon(data);
  return `<section class="panel deadline-panel"><span class="eyebrow">DUE SOON / OVERDUE</span><h3>Keep the essentials on track</h3><p>Unfinished Must have work due within 3 days, including overdue work.</p><div class="reminder-list">${entries.map(e=>{const days=C.dayDifference(e.due);return `<article class="reminder-row"><div><strong>${esc(e.task?.label||e.item.name)}</strong><small>${e.task?esc(e.item.name)+' · ':''}${days<0?`${-days} days overdue`:days===0?'Due today':`Due in ${days} day${days===1?'':'s'}`} · ${dateText(e.due)}</small></div><div><a href="${taskLink(e.group,e.item,e.task)}">Jump to task →</a><a href="#calendar/${e.due}">View in calendar →</a></div></article>`;}).join('')||'<div class="feedback-empty">No essential deadlines in the next 3 days. Add dates to tasks to see reminders here.</div>'}</div><a class="button subtle" href="#calendar">Open calendar →</a></section>`;
}
function calendarEntry(e) {
  return `<a class="calendar-event status-${e.status==='active'?'doing':e.status}" href="${taskLink(e.group,e.item,e.task)}" title="${esc(e.item.name+' · '+(e.task?.label||'Section deadline'))}"><span class="status-dot"></span><span>${esc(e.task?.label||e.item.name)}<small>${e.task?esc(e.item.name):'Section deadline'}</small></span>${e.priority==='nice'?'<span class="optional-mark">Nice</span>':''}</a>`;
}
function renderCalendar() {
  if(!calendarMonth) calendarMonth=C.dateKey().slice(0,7);
  const first=new Date(`${calendarMonth}-01T12:00:00`), start=new Date(first);
  start.setDate(1-((first.getDay()+6)%7));
  const entries=C.deadlineEntries(data,scopeFilter).sort((a,b)=>a.due.localeCompare(b.due));
  const today=C.dateKey(), monthLabel=first.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const agenda=entries.filter(e=>calendarDay?e.due===calendarDay:e.due.slice(0,7)===calendarMonth);
  $('view').innerHTML=`<div class="section-heading"><div><h2>Calendar</h2><p>Asset, shot and subtask deadlines. Click any entry to edit the work.</p></div></div><div class="calendar-toolbar"><button class="button" data-calendar-shift="-1" aria-label="Previous month">←</button><h3>${monthLabel}</h3><button class="button" data-calendar-shift="1" aria-label="Next month">→</button><button class="button subtle" id="calendarToday">Today</button><label>Go to month<input type="month" id="calendarMonthPicker" value="${calendarMonth}"></label></div><div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="calendar-weekday">${d}</div>`).join('')}${Array.from({length:42},(_,i)=>{const day=new Date(start);day.setDate(start.getDate()+i);const key=C.dateKey(day);return `<div class="calendar-cell ${key.slice(0,7)!==calendarMonth?'outside':''} ${key===today?'today':''} ${key===calendarDay?'selected':''}"><button class="calendar-date" data-calendar-day="${key}" aria-label="Show tasks due ${key}" ${key===today?'aria-current="date"':''}>${day.getDate()}</button>${entries.filter(e=>e.due===key).map(calendarEntry).join('')}</div>`;}).join('')}</div><section class="panel calendar-agenda"><div class="section-heading"><h3>${calendarDay?'Due '+dateText(calendarDay):'Deadlines this month'}</h3>${calendarDay?'<button class="text-button" id="calendarAllDays">Show whole month</button>':''}</div>${agenda.map(e=>`<div class="agenda-row"><time datetime="${e.due}">${dateText(e.due)}</time>${calendarEntry(e)}</div>`).join('')||'<div class="empty">No deadlines here. Open an asset or task to choose a due date.</div>'}</section>`;
}
function reviewEntry() {return C.taskEntries(data).find(e=>`${e.group}/${e.item.id}/${e.task.id}`===reviewKey);}
function captureReviewDraft() {
  const form=$('taskFeedbackForm');
  if(form?.elements?.body)reviewDrafts.set(form.dataset.reviewKey,{body:form.elements.body.value,author:form.elements.author.value,caption:$('taskUploadForm')?.elements.caption.value||''});
}
function reviewImageMarkup(entry,image) {
  const comments=entry.task.comments.filter(c=>c.image===image.id && c.point);
  return `<div class="annotation-surface" tabindex="0" role="button" aria-label="Annotate ${esc(image.caption||'review image')}. Click a point, or press Enter to mark the centre." data-annotate-image="${image.id}"><img src="${esc(M.src(image.path))}" alt="${esc(image.caption||'Current task image')}">${comments.map((c,i)=>`<span class="annotation-pin ${c.resolved?'resolved':''}" style="left:${c.point.x*100}%;top:${c.point.y*100}%" aria-hidden="true">${i+1}</span>`).join('')}${annotationPoint?`<span class="annotation-pin pending" style="left:${annotationPoint.x*100}%;top:${annotationPoint.y*100}%">+</span>`:''}</div><p class="help">${esc(image.caption)} · Click the image to place a comment marker. Keyboard: Enter marks the centre.</p>`;
}
function renderReview() {
  const queue=C.taskEntries(data,scopeFilter).filter(e=>e.task.status==='review');
  let selected=reviewEntry();
  if(!selected || selected.task.status!=='review' || !visibleTasks(selected.item).some(t=>t.id===selected.task.id)) {
    selected=queue[0];reviewKey=selected?`${selected.group}/${selected.item.id}/${selected.task.id}`:'';reviewImage='';annotationPoint=null;
  }
  const draft=reviewDrafts.get(reviewKey)||{}, image=selected&&(selected.task.images.find(i=>i.id===reviewImage)||selected.task.images.at(-1));
  if(image)reviewImage=image.id;
  $('view').innerHTML=`<div class="section-heading"><div><h2>Review</h2><p>Only tasks ready for feedback. Comment, mark an image, then decide the next step.</p></div><span class="badge review">${queue.length} to review</span></div>${queue.length?`<div class="review-workspace"><aside class="review-queue">${queue.map(e=>`<a class="review-queue-item ${e.task===selected?.task?'selected':''}" href="#review/${e.group}/${e.item.id}/${e.task.id}"><strong>${esc(e.task.label)}</strong><small>${esc(e.item.name)}</small><span>${e.task.comments.filter(c=>!c.resolved).length} open comments · ${e.task.due?dateText(e.task.due):'No due date'}</span></a>`).join('')}</aside><section class="panel task-review"><div class="section-heading"><div><span class="eyebrow">${esc(selected.item.name)}</span><h3>${esc(selected.task.label)}</h3></div><a class="text-button" href="${taskLink(selected.group,selected.item,selected.task)}">Edit task →</a></div><p class="review-description">${esc(selected.task.description||'Add a description in Edit task to tell the team what needs feedback.')}</p><div class="review-decision">${taskControls(selected.item,selected.task,selected.group)}<button class="button" data-review-decision="doing">Request changes</button><button class="button approve" data-review-decision="done">Approve · Done ✓</button></div>${image?`<label>Review image<select id="reviewImagePicker">${selected.task.images.map(i=>option(i.id,i.caption||i.id,image.id)).join('')}</select></label><div id="annotationCanvas">${reviewImageMarkup(selected,image)}</div>`:'<div class="empty">Upload a render or screenshot for this task.</div>'}<form id="taskUploadForm" class="upload-panel"><div class="field-grid"><label>Images<input name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple required ${uploading?'disabled':''}></label><label>Caption<input name="caption" maxlength="300" value="${esc(draft.caption||'')}" placeholder="What changed?"></label></div><div class="upload-bottom"><span class="help">Images and comments share through team sync.</span><button class="button" type="submit" ${uploading?'disabled':''}>${uploading?'Uploading…':'Upload images ↑'}</button></div></form><div class="sheet-heading"><h3>Comments & annotations</h3><span class="muted">${selected.task.comments.filter(c=>!c.resolved).length} open</span></div><div class="comments">${selected.task.comments.map(c=>{const ci=selected.task.images.find(i=>i.id===c.image);const pin=ci&&selected.task.comments.filter(x=>x.image===ci.id&&x.point).findIndex(x=>x.id===c.id)+1;return `<article class="comment ${c.resolved?'resolved':''}"><div class="comment-meta"><strong>${esc(c.author)}</strong><time>${dateText(c.createdAt.slice(0,10))}</time></div>${ci?`<button class="text-button" data-review-image="${ci.id}">${c.point?`Marker ${pin} · ${Math.round(c.point.x*100)}%, ${Math.round(c.point.y*100)}% · `:''}${esc(ci.caption||'Image')}</button>`:''}<p>${esc(c.body)}</p><label class="comment-resolve"><input type="checkbox" data-task-comment-resolve="${c.id}" ${c.resolved?'checked':''}>${c.resolved?'Resolved':'Mark resolved'}</label></article>`;}).join('')||'<p class="feedback-empty">No feedback yet. Add a concrete suggestion below.</p>'}</div><form id="taskFeedbackForm" data-review-key="${esc(reviewKey)}"><label>Posting as<select name="author" required>${option('','Choose your name',draft.author||identity)}${data.team.map(n=>option(n,n,draft.author||identity)).join('')}</select></label><label>Your comment<textarea name="body" required maxlength="6000" placeholder="What works? What should change?">${esc(draft.body||'')}</textarea></label><div class="comment-target"><span id="annotationHint">${annotationPoint?'Comment will include the marked image point.':'Comment on the task, or click the image to annotate.'}</span><button type="button" class="text-button" id="clearAnnotation">Clear marker</button></div><div class="dialog-actions"><button class="button primary" type="submit">Post comment →</button></div></form>${selected.group==='assets'?`<a href="#versions/${selected.item.id}" class="text-button">Open version history & comparisons →</a>`:''}</section></div>`:'<div class="empty"><h3>Nothing waiting for review</h3><p>Set a task to the blue Review status when it is ready for the team.</p><a class="button subtle" href="#tasks">Open tasks →</a></div>'}`;
}
function setReviewAnnotation(point) {
  annotationPoint=point;const entry=reviewEntry(), image=entry?.task.images.find(i=>i.id===reviewImage);
  if(image)$('annotationCanvas').innerHTML=reviewImageMarkup(entry,image);
  $('annotationHint').textContent=point?'Comment will include the marked image point.':'Comment on the task, or click the image to annotate.';
  $('taskFeedbackForm')?.elements.body.focus();
}
async function uploadTaskImages(form,entry=reviewEntry()) {
  if(uploading||!entry)return;
  const files=[...form.elements.images.files],caption=form.elements.caption.value.trim();
  if(!files.length)return;
  if(entry.task.images.length+files.length>64){setMessage('A task can contain up to 64 images.',true);return;}
  const inline=!!form.dataset.detailUpload,result=form.querySelector('.task-upload-result');
  let added=0,errorMessage='';
  captureReviewDraft();uploading=true;
  if(inline){form.querySelectorAll('input,button').forEach(el=>el.disabled=true);if(result)result.textContent='Saving images…';}else renderReview();
  try {
    for(const file of files){
      const blob=await M.prepare(file),id=newId('image'),path=`uploads/${id}.webp`;await M.store(path,blob);
      // A teammate may remove the task while image preparation is in flight.
      if(!data[entry.group].find(i=>i.id===entry.item.id)?.tasks.some(t=>t.id===entry.task.id))throw new Error('This task was removed. The image remains in your browser backup storage.');
      commit({kind:'addTaskImage',group:entry.group,id:entry.item.id,task:entry.task.id,value:{id,path,role:'progress',caption:caption||file.name}});if(!inline)reviewImage=id;added++;
    }
  }catch(error){errorMessage=error.message;setMessage(errorMessage,true);}
  finally{
    uploading=false;
    if(inline){
      form.querySelectorAll('input,button').forEach(el=>el.disabled=false);
      if(!errorMessage){form.elements.images.value='';form.elements.caption.value='';}
      const task=data[entry.group].find(i=>i.id===entry.item.id)?.tasks.find(t=>t.id===entry.task.id),row=$('task-'+entry.task.id);
      if(task&&row?.querySelector('[data-detail-upload]')?.dataset.detailUpload===form.dataset.detailUpload){
        const gallery=row.querySelector('.task-image-gallery'),holder=document.createElement('div');holder.innerHTML=taskProgressMarkup(task,entry.group,entry.item.id);
        gallery.replaceWith(holder.querySelector('.task-image-gallery'));
        row.querySelector('.task-notes-heading>span').textContent=`${task.images.length} image${task.images.length===1?'':'s'}`;
        row.querySelector('.task-notes-count').textContent=`${task.images.length} images · ${task.comments.filter(c=>!c.resolved).length} open comments`;
      }
      if(result)result.textContent=errorMessage||`${added} image${added===1?'':'s'} added${token?' · sharing with the team…':' · saved in this browser'}`;
      if(!token&&!errorMessage)setMessage('Progress images saved in this browser · connect team sync to share');
    }else renderReview();
    if(token&&pending.length){clearTimeout(saveTimer);saveTimer=setTimeout(sync,1200);}
  }
}
function autoRefreshAllowed() {
  const dialog=document.querySelector('dialog[open]');
  return !document.hidden && !uploading && (!dialog||dialog.id==='detailDialog') && !document.querySelector('.remove-confirmation') && !hasUnfinishedFields() && !detailUploadDraft() && !($('taskFeedbackForm')?.elements.body.value.trim()) && !($('feedbackForm')?.elements.body.value.trim()) && !($('taskUploadForm')?.elements.images.files.length) && !($('uploadForm')?.elements.images.files.length);
}
document.addEventListener('click',e=>{
  const assign=e.target.closest('[data-assign-task]');if(assign){const [group,id,task]=assign.dataset.assignTask.split(':');commit({kind:'taskField',group,id,task,field:'owner',value:assign.dataset.assignee});const current=data[group].find(i=>i.id===id)?.tasks.find(t=>t.id===task);if(current){assign.closest('.task-assignment').querySelector('.assignee-buttons').outerHTML=taskAssignee(current,group,id);}return;}
  const progress=e.target.closest('[data-task-image]');if(progress){const [group,id,task,image]=progress.dataset.taskImage.split(':'),selected=data[group].find(i=>i.id===id)?.tasks.find(t=>t.id===task)?.images.find(i=>i.id===image);if(selected){$('largeImage').src=M.src(selected.path);$('largeImage').alt=selected.caption||'Task progress';$('imageTitle').textContent=selected.caption||'Task progress';$('imageDialog').showModal();}return;}
  const taskJump=e.target.closest('a[href^="#task/"]');if(taskJump&&taskJump.getAttribute('href')===location.hash){e.preventDefault();navigate();return;}
  const shift=e.target.closest('[data-calendar-shift]');if(shift){const month=new Date(`${calendarMonth}-01T12:00:00`);month.setMonth(month.getMonth()+Number(shift.dataset.calendarShift));calendarMonth=C.dateKey(month).slice(0,7);calendarDay='';location.hash=`calendar/${calendarMonth}`;return;}
  const day=e.target.closest('[data-calendar-day]');if(day){location.hash=`calendar/${day.dataset.calendarDay}`;return;}
  if(e.target.closest('#calendarToday')){location.hash=`calendar/${C.dateKey()}`;calendarMonth=C.dateKey().slice(0,7);calendarDay=C.dateKey();renderCalendar();return;}
  if(e.target.closest('#calendarAllDays')){calendarDay='';location.hash=`calendar/${calendarMonth}`;renderCalendar();return;}
  if(e.target.closest('[data-workflow-link]')){const link=e.target.closest('[data-workflow-link]');const key=link.getAttribute('href').split('/').slice(1).join('/');if(key.startsWith('assets/')||key.startsWith('shots/')){const [group,id,task]=key.split('/');const current=data[group].find(i=>i.id===id)?.tasks.find(t=>t.id===task);if(current&&current.status!=='review')commit({kind:'task',group,id,task,value:'review'});}$('detailDialog').close();}
  const remove=e.target.closest('[data-remove-task]');if(remove&&detail){const row=remove.closest('.task-editor');if(!row.querySelector('.remove-confirmation'))row.insertAdjacentHTML('beforeend',`<div class="remove-confirmation" role="alert"><p>Remove this task and its feedback? Export a backup first to keep a copy.</p><button type="button" class="button danger" data-confirm-remove-task="${esc(remove.dataset.removeTask)}">Confirm removal</button><button type="button" class="button" data-cancel-remove-task>Keep task</button></div>`);return;}
  if(e.target.closest('[data-cancel-remove-task]')){e.target.closest('.remove-confirmation').remove();return;}
  const confirmed=e.target.closest('[data-confirm-remove-task]');if(confirmed&&detail){commit({kind:'removeTask',...detail,task:confirmed.dataset.confirmRemoveTask});openDetail(detail.group,detail.id);return;}
  const decision=e.target.closest('[data-review-decision]');if(decision){const entry=reviewEntry();if(entry){if($('taskFeedbackForm')?.elements.body.value.trim()){setMessage('Post your draft comment before changing review status.',true);return;}commit({kind:'task',group:entry.group,id:entry.item.id,task:entry.task.id,value:decision.dataset.reviewDecision});}return;}
  const pick=e.target.closest('[data-review-image]');if(pick){reviewImage=pick.dataset.reviewImage;annotationPoint=null;captureReviewDraft();renderReview();return;}
  if(e.target.closest('#clearAnnotation')){setReviewAnnotation(null);return;}
  const surface=e.target.closest('[data-annotate-image]');if(surface){const image=surface.querySelector('img'),r=image.getBoundingClientRect();if(r.width&&r.height)setReviewAnnotation({x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))});}
});
document.addEventListener('keydown',e=>{if(e.target.matches('[data-annotate-image]')&&['Enter',' '].includes(e.key)){e.preventDefault();setReviewAnnotation({x:.5,y:.5});}});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='scopeFilter'){captureReviewDraft();scopeFilter=el.value;render();return;}
  if(['taskStatusFilter','effortFilter','taskSort'].includes(el.id)){taskStatusFilter=$('taskStatusFilter').value;effortFilter=$('effortFilter').value;taskSort=$('taskSort').value;renderTaskList();return;}
  if(el.id==='calendarMonthPicker'&&/^\d{4}-\d{2}$/.test(el.value)){calendarMonth=el.value;calendarDay='';location.hash=`calendar/${calendarMonth}`;renderCalendar();return;}
  if(el.id==='reviewImagePicker'){reviewImage=el.value;annotationPoint=null;captureReviewDraft();renderReview();return;}
  if(el.dataset.taskStatus){const [group,id,task]=el.dataset.taskStatus.split(':');if(tab==='review'&&$('taskFeedbackForm')?.elements.body.value.trim()){el.value=reviewEntry().task.status;setMessage('Post your draft comment before changing review status.',true);return;}commit({kind:'task',group,id,task,value:el.value});if(detail&&detail.group===group&&detail.id===id)updateDetailTaskDisplay(task);return;}
  if(el.dataset.taskField&&detail){const value=el.value.trim();if(!el.checkValidity()||(el.dataset.taskField==='label'&&!value)){el.reportValidity();return;}commit({kind:'taskField',...detail,task:el.dataset.taskId,field:el.dataset.taskField,value});const task=data[detail.group].find(i=>i.id===detail.id)?.tasks.find(t=>t.id===el.dataset.taskId),link=el.closest('.task-editor').querySelector('.task-calendar-link');if(task&&link){link.hidden=!task.due;link.href='#calendar/'+task.due;}updateDetailTaskDisplay(el.dataset.taskId);return;}
  if(el.dataset.taskCommentResolve){const entry=reviewEntry();if(entry)commit({kind:'taskCommentResolved',group:entry.group,id:entry.item.id,task:entry.task.id,comment:el.dataset.taskCommentResolve,value:el.checked});}
});
document.addEventListener('input',e=>{
  if(e.target.id==='taskSearch'){search=e.target.value;const start=e.target.selectionStart;renderTaskList();$('taskSearch').focus();$('taskSearch').setSelectionRange(start,start);}
  if(e.target.closest('#taskFeedbackForm,#taskUploadForm'))captureReviewDraft();
});
document.addEventListener('submit',e=>{
  if(e.target.dataset.detailUpload){e.preventDefault();const [group,id,task]=e.target.dataset.detailUpload.split(':'),item=data[group].find(i=>i.id===id),current=item?.tasks.find(t=>t.id===task);if(current)uploadTaskImages(e.target,{group,item,task:current});return;}
  if(e.target.id==='taskUploadForm'){e.preventDefault();uploadTaskImages(e.target);return;}
  if(e.target.id==='taskFeedbackForm'){
    e.preventDefault();const entry=reviewEntry(),form=e.target,body=form.elements.body.value.trim(),author=form.elements.author.value;
    if(!entry||!body||!author)return;if(entry.task.comments.length>=500){setMessage('This task has reached its 500-comment limit.',true);return;}
    identity=author;try{localStorage.setItem('eternal-tomb-feedback-name',author);}catch{}
    const point=annotationPoint?{...annotationPoint}:null,image=point?reviewImage:'';form.elements.body.value='';reviewDrafts.delete(reviewKey);annotationPoint=null;
    commit({kind:'addTaskComment',group:entry.group,id:entry.item.id,task:entry.task.id,value:{id:newId('comment'),author,body,image,point,resolved:false,createdAt:new Date().toISOString()}});
  }
});
