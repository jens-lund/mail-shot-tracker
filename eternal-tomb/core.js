(function (root) {
  'use strict';
  const statuses = ['todo', 'doing', 'review', 'done'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const priorities = ['must', 'nice'];
  const efforts = ['small', 'medium', 'large'];
  const effectivePriority = (item, task) => item.priority === 'nice' || task?.priority === 'nice' ? 'nice' : 'must';
  const scopedTasks = (item, scope = 'all') => item.tasks.filter(task => scope === 'all' || effectivePriority(item, task) === scope);
  const activeShots = data => data.shots.filter(item => !item.archived);
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
  function validate(data) {
    const fail = () => { throw new Error('This is not a valid Eternal Tomb project backup.'); };
    const str = (value, max = 10000) => typeof value === 'string' && value.length <= max;
    const id = value => str(value, 80) && /^[a-zA-Z0-9_-]+$/.test(value);
    const unique = items => new Set(items.map(x => x.id)).size === items.length;
    const date = validDate;
    if (!data || data.schemaVersion !== 1 || !str(data.title, 80) || !data.title.trim() || !date(data.deadline) || !str(data.preview, 2000) || (data.preview && !safeUrl(data.preview))) fail();
    data = clone(data);
    delete data.localImages;
    data.hero ??= '';
    if (!str(data.hero, 200) || (data.hero && !imagePath(data.hero))) fail();
    if (!Array.isArray(data.team) || !data.team.length || data.team.length > 30 || data.team.some(x => !str(x, 80) || !x.trim()) || new Set(data.team).size !== data.team.length) fail();
    for (const group of ['assets', 'shots']) {
      if (!Array.isArray(data[group]) || !data[group].length || data[group].length > 50 || !unique(data[group])) fail();
      for (const item of data[group]) {
        item.priority ??= 'must'; item.removedTaskIds ??= [];
        if (!priorities.includes(item.priority) || !Array.isArray(item.removedTaskIds) || item.removedTaskIds.length > 10000 || item.removedTaskIds.some(x => !id(x)) || new Set(item.removedTaskIds).size !== item.removedTaskIds.length) fail();
        if (!id(item.id) || !str(item.name, 150) || !str(item.description, 2000) || !str(item.owner, 80) || !date(item.due) || typeof item.blocked !== 'boolean' || !str(item.blocker, 2000) || !str(item.notes) || !str(item.file, 2000) || (item.file && !safeUrl(item.file))) fail();
        if (!Array.isArray(item.tasks) || item.tasks.length > 200 || !unique(item.tasks) || item.tasks.some(t => !id(t.id) || !str(t.label, 150) || !str(t.description, 2000) || !statuses.includes(t.status))) fail();
        item.tasks = item.tasks.map(normalizeTask);
        // A removed teammate stops receiving assignments; historical comments remain intact.
        if (!data.team.includes(item.owner)) item.owner = '';
        for (const t of item.tasks) {
          if (item.removedTaskIds.includes(t.id) || !date(t.due) || !efforts.includes(t.effort) || !priorities.includes(t.priority) || !str(t.owner,80)) fail();
          if (!data.team.includes(t.owner)) t.owner = '';
          if (!Array.isArray(t.images) || t.images.length > 64 || !unique(t.images) || t.images.some(i => !id(i.id) || !imagePath(i.path) || i.role !== 'progress' || !str(i.caption,300))) fail();
          if (!Array.isArray(t.comments) || t.comments.length > 500 || !unique(t.comments)) fail();
          for (const c of t.comments) {
            if (!id(c.id) || !str(c.author,80) || !str(c.body,6000) || !str(c.image,80) || (c.image && !t.images.some(i => i.id === c.image)) || typeof c.resolved !== 'boolean' || !str(c.createdAt,40) || Number.isNaN(Date.parse(c.createdAt))) fail();
            if (c.point !== null && (!c.image || typeof c.point !== 'object' || !c.point || !Number.isFinite(c.point.x) || !Number.isFinite(c.point.y) || c.point.x < 0 || c.point.x > 1 || c.point.y < 0 || c.point.y > 1)) fail();
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
            if (!data.team.includes(v.owner)) v.owner = '';
            if (!Array.isArray(v.images) || v.images.length > 64 || !unique(v.images) || v.images.some(i => !id(i.id) || !imagePath(i.path) || !['sheet','front','back','left','right','clothing','clothing-progress','detail','progress','reference'].includes(i.role) || !str(i.caption, 300))) fail();
            if (!Array.isArray(v.comments) || v.comments.length > 500 || !unique(v.comments) || v.comments.some(c => !id(c.id) || !str(c.author, 80) || !str(c.target, 80) || !str(c.body, 6000) || (c.image && !v.images.some(i=>i.id===c.image)) || typeof c.resolved !== 'boolean' || !str(c.createdAt,40) || Number.isNaN(Date.parse(c.createdAt)))) fail();
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
    for (const m of data.milestones) if (!id(m.id) || !str(m.name, 150) || !str(m.description, 2000) || !Array.isArray(m.checks) || !m.checks.length || m.checks.length > 30 || !unique(m.checks) || m.checks.some(c => !id(c.id) || !str(c.label, 500) || typeof c.done !== 'boolean')) fail();
    return clone(data);
  }
  // Replay only changed fields on the newest shared file, preserving teammates' unrelated edits.
  function apply(data, op) {
    if (op.kind === 'replace') return validate(op.data);
    if (op.kind === 'addShot') {
      if (!data.shots.some(s => s.id === op.value.id)) data.shots.push(clone(op.value));
      return data;
    }
    if (op.kind === 'archiveShot') { const shot=data.shots.find(s=>s.id===op.id); if(shot)shot.archived=!!op.value; return data; }
    if (op.kind === 'moveShot') {
      const shot=data.shots.find(s=>s.id===op.id), anchor=data.shots.find(s=>s.id===op.anchor);
      if(shot && anchor && shot!==anchor && !shot.archived && !anchor.archived) { data.shots=data.shots.filter(s=>s!==shot);data.shots.splice(data.shots.indexOf(anchor)+(op.after?1:0),0,shot); }
      return data;
    }
    if (op.kind === 'project' && ['title','deadline','preview','team','hero'].includes(op.field)) data[op.field] = clone(op.value);
    else if (['assets','shots'].includes(op.group)) {
      const item = data[op.group].find(x => x.id === op.id); if (!item || item.archived) return data;
      const task = item.tasks.find(t => t.id === op.task);
      if (op.kind === 'task' && task && statuses.includes(op.value)) task.status = op.value;
      if (op.kind === 'taskField' && task && ['label','description','due','effort','priority','owner'].includes(op.field)) task[op.field] = clone(op.value);
      if (op.kind === 'field' && ['name','description','priority','owner','due','blocked','blocker','notes','file','cover'].includes(op.field)) item[op.field] = clone(op.value);
      if (op.kind === 'field' && op.group === 'shots' && ['duration','camera','dependencies'].includes(op.field)) item[op.field] = clone(op.value);
      if (op.kind === 'removeTask') {
        item.removedTaskIds ??= [];
        if (!item.removedTaskIds.includes(op.task)) item.removedTaskIds.push(op.task);
        item.tasks = item.tasks.filter(t => t.id !== op.task);
      }
      if (op.kind === 'addTask' && !(item.removedTaskIds || []).includes(op.value.id) && !item.tasks.some(t => t.id === op.value.id)) item.tasks.push(normalizeTask(clone(op.value)));
      if (task) {
        task.images ??= []; task.comments ??= [];
        if (op.kind === 'addTaskImage' && !task.images.some(i => i.id === op.value.id)) task.images.push(clone(op.value));
        if (op.kind === 'addTaskComment' && !task.comments.some(c => c.id === op.value.id)) task.comments.push(clone(op.value));
        if (op.kind === 'taskCommentResolved') {const comment=task.comments.find(c=>c.id===op.comment);if(comment)comment.resolved=!!op.value;}
      }
      if (op.kind === 'addVersion') { item.versions ??= []; if (!item.versions.some(v=>v.id===op.value.id)) item.versions.push(clone(op.value)); }
      const version = item.versions?.find(v=>v.id===op.version);
      if (version && op.kind === 'deleteVersion') version.deletedAt=op.value;
      if (version && op.kind === 'restoreVersion') version.deletedAt='';
      if (version && !version.deletedAt) {
        if (op.kind === 'versionField' && ['title','summary','owner','status'].includes(op.field)) version[op.field]=clone(op.value);
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
      }
    } else if (op.kind === 'milestone') {
      const m = data.milestones.find(x => x.id === op.id); const check = m?.checks.find(x => x.id === op.check); if (check) check.done = !!op.value;
    }
    return data;
  }
  function replay(data, ops) { return ops.reduce((d, op) => apply(d, op), clone(data)); }
  const api = { clone, progress, status, safeUrl, imagePath, validate, apply, replay, statuses, priorities, efforts, effectivePriority, scopedTasks, taskEntries, scopedStatus, dateKey, validDate, dayDifference, deadlineEntries, dueSoon, activeShots, activeVersions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrackerCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

