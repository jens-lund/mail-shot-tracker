(function (root) {
  'use strict';
  const statuses = ['todo', 'doing', 'review', 'done'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const priorities = ['must', 'nice'];
  const efforts = ['small', 'medium', 'large'];
  const effectivePriority = (item, task) => item.priority === 'nice' || task?.priority === 'nice' ? 'nice' : 'must';
  const scopedTasks = (item, scope = 'all') => item.tasks.filter(task => scope === 'all' || effectivePriority(item, task) === scope);
  const activeShots = data => data.shots.filter(item => !item.archived);
  const activeAssets = data => data.assets.filter(item => !item.archived);
  const activeImages = holder => holder.images.filter(image => !image.deletedAt);
  const activeComments = holder => holder.comments.filter(comment => !comment.deletedAt);
  const activeChecks = milestone => milestone.checks.filter(check => !check.deletedAt);
  const activeMilestones = data => data.milestones.filter(milestone => !milestone.deletedAt);
  const activeVersions = item => item.versions.filter(version => !version.deletedAt);
  const taskEntries = (data, scope = 'all') => ['assets','shots'].flatMap(group => data[group].filter(item => !item.archived).flatMap(item => scopedTasks(item, scope).map(task => ({group,item,task}))));
  function scopedStatus(item, scope = 'all') {
    const tasks = scopedTasks(item, scope);
    if (tasks.length && tasks.every(t => t.status === 'done')) return 'done';
    if (tasks.some(t => t.status === 'review')) return 'review';
    if (tasks.some(t => t.status !== 'todo')) return 'doing';
    return 'todo';
  }
  function dateKey(date = new Date()) {
    return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function validDate(value) {
    if (value === '') return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value+'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value;
  }
  function dayDifference(due, today = new Date()) {
    const current = typeof today === 'string' ? today : dateKey(today);
    if (!due || !current || !validDate(due) || !validDate(current)) return NaN;
    // Compare calendar days at UTC midnight, independent of DST or the browser's offset.
    return (Date.parse(due+'T00:00:00Z') - Date.parse(current+'T00:00:00Z')) / 86400000;
  }
  function deadlineEntries(data, scope = 'all') {
    return ['assets','shots'].flatMap(group => data[group].filter(item => !item.archived).flatMap(item => {
      const entries = [];
      const priority = effectivePriority(item);
      if (item.due && (scope === 'all' || priority === scope)) entries.push({group,item,task:null,due:item.due,status:scopedStatus(item, scope),priority});
      for (const task of scopedTasks(item, scope)) if (task.due) entries.push({group,item,task,due:task.due,status:task.status,priority:effectivePriority(item,task)});
      return entries;
    })).sort((a,b) => a.due.localeCompare(b.due) || a.item.name.localeCompare(b.item.name) || (a.task?.label || '').localeCompare(b.task?.label || ''));
  }
  const dueSoon = (data, today = new Date()) => deadlineEntries(data,'must').filter(entry => entry.status !== 'done' && dayDifference(entry.due,today) <= 3);
  const normalizeTask = task => ({...task,due:task.due ?? '',effort:task.effort ?? 'medium',priority:task.priority ?? 'must',owner:task.owner ?? '',images:task.images ?? [],comments:task.comments ?? []});
  const progress = item => item.tasks.length ? Math.round(item.tasks.filter(t => t.status === 'done').length / item.tasks.length * 100) : 0;
  function status(item) {
    if (item.blocked) return 'blocked';
    if (item.tasks.length && item.tasks.every(t => t.status === 'done')) return 'done';
    if (item.tasks.some(t => t.status === 'review')) return 'review';
    if (item.tasks.some(t => t.status !== 'todo')) return 'active';
    return 'todo';
  }
  function safeUrl(value) {
    try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
  }
  const imagePath = value => typeof value === 'string' && /^(images|uploads)\/[a-zA-Z0-9_-]+\.webp$/.test(value);
  const videoPath = value => typeof value === 'string' && /^uploads\/[a-zA-Z0-9_-]+\.(mp4|webm)$/.test(value);
  const maxVideoBytes = 25 * 1024 * 1024;
  function validate(data) {
    const fail = () => { throw new Error('This is not a valid Eternal Tomb project backup.'); };
    const str = (value, max = 10000) => typeof value === 'string' && value.length <= max;
    const id = value => str(value, 80) && /^[a-zA-Z0-9_-]+$/.test(value);
    const unique = items => new Set(items.map(x => x.id)).size === items.length;
    const date = validDate;
    if (!data || data.schemaVersion !== 1 || !str(data.title, 80) || !data.title.trim() || !date(data.deadline) || !str(data.preview, 2000) || (data.preview && !safeUrl(data.preview))) fail();
    data = clone(data);
    delete data.localImages;
    delete data.localMedia;
    if (data.previewMedia === undefined) data.previewMedia = null;
    if (data.previewMedia !== null) {
      const media = data.previewMedia;
      if (!media || !videoPath(media.path) || !str(media.name,200) || !media.name.trim() || !Number.isInteger(media.size) || media.size < 1 || media.size > maxVideoBytes || media.type !== (media.path.endsWith('.mp4') ? 'video/mp4' : 'video/webm')) fail();
    }
    data.hero ??= '';
    data.activity ??= [];
    data.memberColors ??= {};
    data.pageCopy ??= {};
    const timestamp=value=>value===undefined||value===''||(str(value,40)&&!Number.isNaN(Date.parse(value)));
    for(const field of ['tagline','genre','brandLabel','footer'])if(data[field]!==undefined&&!str(data[field],2000))fail();
    if(!data.memberColors||Array.isArray(data.memberColors)||Object.keys(data.memberColors).length>100||Object.entries(data.memberColors).some(([name,color])=>!str(name,80)||!/^#[0-9a-fA-F]{6}$/.test(color)))fail();
    if(!data.pageCopy||Array.isArray(data.pageCopy)||Object.entries(data.pageCopy).some(([key,value])=>!['overview','assets','cinematic','tasks','calendar','review','versions','milestones','activity'].includes(key)||!value||!str(value.title,150)||!str(value.description,2000)))fail();
    if(!Array.isArray(data.activity)||data.activity.length>50000||!unique(data.activity))fail();
    const historyRoots=['title','deadline','preview','previewMedia','team','memberColors','pageCopy','hero','tagline','genre','brandLabel','footer','assets','shots','milestones'];
    for(const event of data.activity){
      if(!id(event.id)||!str(event.actor,80)||!str(event.author,80)||!str(event.label,300)||!str(event.kind,80)||!str(event.href,300)||!/^#[a-zA-Z0-9_/-]*$/.test(event.href)||!timestamp(event.createdAt)||!event.createdAt||!timestamp(event.undoneAt)||!timestamp(event.deletedAt)||!Array.isArray(event.targets)||event.targets.length>31||event.targets.some(v=>!str(v,80))||!Array.isArray(event.patches)||event.patches.length>50000)fail();
      for(const patch of event.patches)if(!Array.isArray(patch.path)||!patch.path.length||patch.path.length>16||!historyRoots.includes(patch.path[0])||patch.path.some(p=>typeof p!=='string'||p.length>100||['__proto__','constructor','prototype'].includes(p))||typeof patch.beforeExists!=='boolean'||typeof patch.afterExists!=='boolean')fail();
    }
    if (!str(data.hero, 200) || (data.hero && !imagePath(data.hero))) fail();
    if (!Array.isArray(data.team) || !data.team.length || data.team.length > 30 || data.team.some(x => !str(x, 80) || !x.trim()) || new Set(data.team).size !== data.team.length) fail();
    for (const group of ['assets', 'shots']) {
      if (!Array.isArray(data[group]) || !data[group].length || data[group].length > 50 || !unique(data[group])) fail();
      for (const item of data[group]) {
        if(item.archived!==undefined&&typeof item.archived!=='boolean')fail();
        item.priority ??= 'must'; item.removedTaskIds ??= [];
        item.deletedTasks ??= [];
        if(!Array.isArray(item.deletedTasks)||item.deletedTasks.length>1000||item.deletedTasks.some(entry=>!entry.task||!Number.isInteger(entry.position)||entry.position<0||!timestamp(entry.deletedAt)))fail();
        if (!priorities.includes(item.priority) || !Array.isArray(item.removedTaskIds) || item.removedTaskIds.length > 10000 || item.removedTaskIds.some(x => !id(x)) || new Set(item.removedTaskIds).size !== item.removedTaskIds.length) fail();
        if (!id(item.id) || !str(item.name, 150) || !str(item.description, 2000) || !str(item.owner, 80) || !date(item.due) || typeof item.blocked !== 'boolean' || !str(item.blocker, 2000) || !str(item.notes) || !str(item.file, 2000) || (item.file && !safeUrl(item.file))) fail();
        if (!Array.isArray(item.tasks) || item.tasks.length > 200 || !unique(item.tasks) || item.tasks.some(t => !id(t.id) || !str(t.label, 150) || !str(t.description, 2000) || !statuses.includes(t.status))) fail();
        item.tasks = item.tasks.map(normalizeTask);
        item.deletedTasks.forEach(entry=>{entry.task=normalizeTask(entry.task);});
        if(!unique([...item.tasks,...item.deletedTasks.map(entry=>entry.task)]))fail();
        // A removed teammate stops receiving assignments; historical comments remain intact.
        if (!data.team.includes(item.owner)) item.owner = '';
        for (const t of [...item.tasks,...item.deletedTasks.map(entry=>entry.task)]) {
          if (!id(t.id)||!str(t.label,150)||!str(t.description,2000)||!statuses.includes(t.status)||(item.tasks.includes(t)&&item.removedTaskIds.includes(t.id)) || !date(t.due) || !efforts.includes(t.effort) || !priorities.includes(t.priority) || !str(t.owner,80)) fail();
          for(const field of ['workSummary','feedbackRequest','reviewTarget','requestedBy'])if(t[field]!==undefined&&!str(t[field],field==='workSummary'||field==='feedbackRequest'?4000:80))fail();
          if(!timestamp(t.requestedAt))fail();
          if (!data.team.includes(t.owner)) t.owner = '';
          if (!Array.isArray(t.images) || t.images.length > 64 || !unique(t.images) || t.images.some(i => !id(i.id) || !imagePath(i.path) || i.role !== 'progress' || !str(i.caption,300))) fail();
          if(t.images.some(i=>!timestamp(i.deletedAt)))fail();
          if (!Array.isArray(t.comments) || t.comments.length > 500 || !unique(t.comments)) fail();
          for (const c of t.comments) {
            if (!id(c.id) || !str(c.author,80) || !str(c.body,6000) || !str(c.image,80) || (c.image && !t.images.some(i => i.id === c.image)) || typeof c.resolved !== 'boolean' || !str(c.createdAt,40) || Number.isNaN(Date.parse(c.createdAt))) fail();
            if (c.point !== null && (!c.image || typeof c.point !== 'object' || !c.point || !Number.isFinite(c.point.x) || !Number.isFinite(c.point.y) || c.point.x < 0 || c.point.x > 1 || c.point.y < 0 || c.point.y > 1)) fail();
            if(!timestamp(c.deletedAt)||(c.target!==undefined&&!str(c.target,80)))fail();
            if(c.annotation&&(!imagePath(c.annotation.path)||!imagePath(c.annotation.source)||!Number.isInteger(c.annotation.width)||!Number.isInteger(c.annotation.height)||c.annotation.width<1||c.annotation.height<1||c.annotation.width>2000||c.annotation.height>2000))fail();
          }
        }
        if (group === 'assets') {
          if (!['knight', 'troll', 'reveal'].includes(item.image) || !str(item.category, 150)) fail();
          item.versions ??= []; item.cover ??= '';
          if (item.cover && !imagePath(item.cover)) fail();
          if (!Array.isArray(item.versions) || item.versions.length > 100 || !unique(item.versions)) fail();
          for (const v of item.versions) {
            if(v.deletedAt === undefined)v.deletedAt='';
            if (!str(v.deletedAt,40) || (v.deletedAt && Number.isNaN(Date.parse(v.deletedAt)))) fail();
            if (!id(v.id) || !str(v.title, 150) || !str(v.summary, 4000) || !str(v.owner, 80) || !['wip','review','approved','reference'].includes(v.status) || !str(v.createdAt, 40) || Number.isNaN(Date.parse(v.createdAt))) fail();
            for(const field of ['feedbackRequest','reviewTarget','requestedBy'])if(v[field]!==undefined&&!str(v[field],field==='feedbackRequest'?4000:80))fail();
            if(!timestamp(v.requestedAt))fail();
            if (!data.team.includes(v.owner)) v.owner = '';
            if (!Array.isArray(v.images) || v.images.length > 64 || !unique(v.images) || v.images.some(i => !id(i.id) || !imagePath(i.path) || !['sheet','front','back','left','right','clothing','clothing-progress','detail','progress','reference'].includes(i.role) || !str(i.caption, 300))) fail();
            if(v.images.some(i=>!timestamp(i.deletedAt)))fail();
            if (!Array.isArray(v.comments) || v.comments.length > 500 || !unique(v.comments) || v.comments.some(c => !id(c.id) || !str(c.author, 80) || !str(c.target, 80) || !str(c.body, 6000) || (c.image && !v.images.some(i=>i.id===c.image)) || typeof c.resolved !== 'boolean' || !str(c.createdAt,40) || Number.isNaN(Date.parse(c.createdAt)))) fail();
            for(const c of v.comments)if(!timestamp(c.deletedAt)||(c.annotation&&(!imagePath(c.annotation.path)||!imagePath(c.annotation.source)||!Number.isInteger(c.annotation.width)||!Number.isInteger(c.annotation.height)||c.annotation.width<1||c.annotation.height<1||c.annotation.width>2000||c.annotation.height>2000)))fail();
          }
        }
        if (group === 'shots') {
          if(item.archived === undefined)item.archived=false;
          if(item.duration === undefined)item.duration=0;
          if(item.camera === undefined)item.camera='';
          if (typeof item.archived !== 'boolean' || !Number.isFinite(item.duration) || item.duration < 0 || item.duration > 600 || !str(item.camera,1000) || !Array.isArray(item.dependencies) || new Set(item.dependencies).size !== item.dependencies.length || item.dependencies.some(x => !data.assets.some(a => a.id === x))) fail();
        }
      }
    }
    if (!Array.isArray(data.milestones) || !data.milestones.length || data.milestones.length > 20 || !unique(data.milestones)) fail();
    for (const m of data.milestones) if (!id(m.id) || !str(m.name, 150) || !str(m.description, 2000) || !timestamp(m.deletedAt)|| !Array.isArray(m.checks) || m.checks.length > 100 || !unique(m.checks) || m.checks.some(c => !id(c.id) || !str(c.label, 500) || typeof c.done !== 'boolean'||!timestamp(c.deletedAt))) fail();
    return clone(data);
  }
  // Replay only changed fields on the newest shared file, preserving teammates' unrelated edits.
  function apply(data, op) {
    if(op.kind==='record'){
      data.activity??=[];
      if(data.activity.some(event=>event.id===op.id))return data;
      const before=clone(data),oldActivity=clone(data.activity);
      let result;
      try{result=validate(apply(data,{...op.op,at:op.createdAt,actor:op.actor}));}catch(error){error.changeId=op.id;throw error;}
      if(op.op.kind==='replace')result.activity=oldActivity;
      const patches=api.differences(before,result);
      if(patches.length||op.op.kind==='undoHistory')result.activity.push({id:op.id,actor:op.actor,author:op.author,createdAt:op.createdAt,label:op.label,href:op.href,targets:op.targets,kind:op.op.kind,patches,undoneAt:'',deletedAt:'',reverts:op.op.kind==='undoHistory'?op.op.event:''});
      return result;
    }
    if(op.kind==='batch')return op.ops.reduce((d,part)=>apply(d,part),data);
    if(op.kind==='undoHistory'){
      const event=data.activity?.find(event=>event.id===op.event);if(!event||event.undoneAt)return data;
      if((!op.force&&api.undoConflicts(data,event).length)||(op.force&&op.expected&&JSON.stringify(api.undoSnapshot(data,event))!==JSON.stringify(op.expected))){const error=new Error('Newer edits affect this change. Review the conflicting fields before undoing it.');error.code='UNDO_CONFLICT';error.event=event.id;throw error;}
      event.patches.filter(p=>p.path.at(-1)!=='$order').forEach(p=>{if(!api.recoverableCreation(data,p,op.at||new Date().toISOString()))api.writePath(data,p.path,p.before,p.beforeExists);});
      event.patches.filter(p=>p.path.at(-1)==='$order').forEach(p=>api.writePath(data,p.path,p.before,true));
      event.undoneAt=op.at||new Date().toISOString();event.undoneBy=op.actor||'';
      if(event.reverts){const original=data.activity.find(e=>e.id===event.reverts);if(original)original.undoneAt='';}
      return data;
    }
    if (op.kind === 'replace') return validate(op.data);
    if (op.kind === 'addShot') {
      if (!data.shots.some(s => s.id === op.value.id)) data.shots.push(clone(op.value));
      return data;
    }
    if(op.kind==='addAsset'){if(!data.assets.some(item=>item.id===op.value.id))data.assets.push(clone(op.value));return data;}
    if(op.kind==='archiveAsset'){const asset=data.assets.find(item=>item.id===op.id);if(asset)asset.archived=!!op.value;return data;}
    if (op.kind === 'archiveShot') { const shot=data.shots.find(s=>s.id===op.id); if(shot)shot.archived=!!op.value; return data; }
    if (op.kind === 'moveShot') {
      const shot=data.shots.find(s=>s.id===op.id), anchor=data.shots.find(s=>s.id===op.anchor);
      if(shot && anchor && shot!==anchor && !shot.archived && !anchor.archived) { data.shots=data.shots.filter(s=>s!==shot);data.shots.splice(data.shots.indexOf(anchor)+(op.after?1:0),0,shot); }
      return data;
    }
    if (op.kind === 'project' && ['title','deadline','preview','previewMedia','team','memberColors','pageCopy','hero','tagline','genre','brandLabel','footer'].includes(op.field)) data[op.field] = clone(op.value);
    else if(op.kind==='pageText'&&['overview','assets','cinematic','tasks','calendar','review','versions','milestones'].includes(op.page))data.pageCopy[op.page]=clone(op.value);
    else if (['assets','shots'].includes(op.group)) {
      const item = data[op.group].find(x => x.id === op.id); if (!item || item.archived) return data;
      const task = item.tasks.find(t => t.id === op.task);
      if(op.kind==='restoreTask'){
        const removed=item.deletedTasks?.find(entry=>entry.task.id===op.task);
        if(removed&&!task){item.tasks.splice(Math.min(removed.position,item.tasks.length),0,removed.task);item.deletedTasks=item.deletedTasks.filter(entry=>entry!==removed);item.removedTaskIds=item.removedTaskIds.filter(id=>id!==op.task);}
      }
      if (op.kind === 'assignSection' && (op.value === '' || data.team.includes(op.value))) {
        item.owner = op.value;
        item.tasks.forEach(t => { t.owner = op.value; });
      }
      if (op.kind === 'task' && task && statuses.includes(op.value)) task.status = op.value;
      if (op.kind === 'taskField' && task && ['label','description','due','effort','priority','owner','workSummary','feedbackRequest','reviewTarget','requestedBy','requestedAt'].includes(op.field)) task[op.field] = clone(op.value);
      if (op.kind === 'field' && ['name','description','category','priority','owner','due','blocked','blocker','notes','file','cover'].includes(op.field)) item[op.field] = clone(op.value);
      if (op.kind === 'field' && op.group === 'shots' && ['duration','camera','dependencies'].includes(op.field)) item[op.field] = clone(op.value);
      if (op.kind === 'removeTask') {
        if(task){item.deletedTasks??=[];item.deletedTasks.push({task:clone(task),position:item.tasks.indexOf(task),deletedAt:op.at||new Date().toISOString()});}
        item.removedTaskIds ??= [];
        if (!item.removedTaskIds.includes(op.task)) item.removedTaskIds.push(op.task);
        item.tasks = item.tasks.filter(t => t.id !== op.task);
      }
      if (op.kind === 'addTask' && !(item.removedTaskIds || []).includes(op.value.id) && !item.tasks.some(t => t.id === op.value.id)) item.tasks.push(normalizeTask({...clone(op.value),owner:op.value.owner ?? item.owner}));
      if (task) {
        task.images ??= []; task.comments ??= [];
        if (op.kind === 'addTaskImage' && !task.images.some(i => i.id === op.value.id)) task.images.push(clone(op.value));
        if (op.kind === 'addTaskComment' && !task.comments.some(c => c.id === op.value.id)) task.comments.push(clone(op.value));
        if (op.kind === 'taskCommentResolved') {const comment=task.comments.find(c=>c.id===op.comment);if(comment)comment.resolved=!!op.value;}
        if(op.kind==='taskImageField'){const image=task.images.find(image=>image.id===op.image);if(image&&!image.deletedAt&&['path','caption'].includes(op.field))image[op.field]=clone(op.value);}
        if(op.kind==='taskImageDeleted'){const image=task.images.find(image=>image.id===op.image);if(image)image.deletedAt=op.value;}
        if(op.kind==='taskCommentDeleted'){const comment=task.comments.find(comment=>comment.id===op.comment);if(comment)comment.deletedAt=op.value;}
      }
      if (op.kind === 'addVersion') { item.versions ??= []; if (!item.versions.some(v=>v.id===op.value.id)) item.versions.push(clone(op.value)); }
      const version = item.versions?.find(v=>v.id===op.version);
      if (version && op.kind === 'deleteVersion') version.deletedAt=op.value;
      if (version && op.kind === 'restoreVersion') version.deletedAt='';
      if (version && !version.deletedAt) {
        if (op.kind === 'versionField' && ['title','summary','owner','status','feedbackRequest','reviewTarget','requestedBy','requestedAt'].includes(op.field)) version[op.field]=clone(op.value);
        if (op.kind === 'addImage' && !version.images.some(i=>i.id===op.value.id)) version.images.push(clone(op.value));
        if (op.kind === 'replaceImage' && imagePath(op.value.path)) {
          const image = version.images.find(i=>i.id===op.image);
          if (image) {
            if (item.cover === image.path) item.cover = op.value.path;
            image.path = op.value.path;
            image.caption = op.value.caption;
          }
        }
        if (op.kind === 'addComment' && !version.comments.some(c=>c.id===op.value.id)) version.comments.push(clone(op.value));
        if (op.kind === 'commentResolved') {const comment=version.comments.find(c=>c.id===op.comment);if(comment)comment.resolved=!!op.value;}
        if(op.kind==='versionImageField'){const image=version.images.find(image=>image.id===op.image);if(image&&!image.deletedAt&&['caption','role'].includes(op.field))image[op.field]=clone(op.value);}
        if(op.kind==='versionImageDeleted'){const image=version.images.find(image=>image.id===op.image);if(image)image.deletedAt=op.value;}
        if(op.kind==='versionCommentDeleted'){const comment=version.comments.find(comment=>comment.id===op.comment);if(comment)comment.deletedAt=op.value;}
      }
    } else if (op.kind === 'milestone') {
      const m = data.milestones.find(x => x.id === op.id); const check = m?.checks.find(x => x.id === op.check); if (check) check.done = !!op.value;
    } else if(op.kind==='addMilestone'){
      if(!data.milestones.some(m=>m.id===op.value.id))data.milestones.push(clone(op.value));
    } else if(['milestoneField','milestoneDeleted','checkField','checkDeleted','addCheck'].includes(op.kind)){
      const m=data.milestones.find(m=>m.id===op.id);if(!m)return data;
      if(op.kind==='milestoneDeleted')m.deletedAt=op.value;
      if(!m.deletedAt){
        if(op.kind==='milestoneField'&&['name','description'].includes(op.field))m[op.field]=op.value;
        if(op.kind==='addCheck'&&!m.checks.some(c=>c.id===op.value.id))m.checks.push(clone(op.value));
        const check=m.checks.find(c=>c.id===op.check);
        if(check&&op.kind==='checkDeleted')check.deletedAt=op.value;
        if(check&&!check.deletedAt&&op.kind==='checkField'&&op.field==='label')check.label=op.value;
      }
    }
    return data;
  }
  function replay(data, ops) { return ops.reduce((d, op) => apply(d, op), clone(data)); }
  const api = { clone, progress, status, safeUrl, imagePath, videoPath, maxVideoBytes, validate, apply, replay, statuses, priorities, efforts, effectivePriority, scopedTasks, taskEntries, scopedStatus, dateKey, validDate, dayDifference, deadlineEntries, dueSoon, activeShots, activeAssets, activeImages, activeComments, activeChecks, activeMilestones, activeVersions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrackerCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

