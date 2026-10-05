(function (root) {
  'use strict';
  const statuses = ['todo', 'doing', 'review', 'done'];
  const clone = value => JSON.parse(JSON.stringify(value));
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
    const date = value => value === '' || (str(value, 10) && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)));
    if (!data || data.schemaVersion !== 1 || !str(data.title, 80) || !data.title.trim() || !date(data.deadline) || !str(data.preview, 2000) || (data.preview && !safeUrl(data.preview))) fail();
    data = clone(data);
    delete data.localImages;
    data.hero ??= '';
    if (!str(data.hero, 200) || (data.hero && !imagePath(data.hero))) fail();
    if (!Array.isArray(data.team) || !data.team.length || data.team.length > 30 || data.team.some(x => !str(x, 80) || !x.trim()) || new Set(data.team).size !== data.team.length) fail();
    for (const group of ['assets', 'shots']) {
      if (!Array.isArray(data[group]) || !data[group].length || data[group].length > 50 || !unique(data[group])) fail();
      for (const item of data[group]) {
        if (!id(item.id) || !str(item.name, 150) || !str(item.description, 2000) || !str(item.owner, 80) || !date(item.due) || typeof item.blocked !== 'boolean' || !str(item.blocker, 2000) || !str(item.notes) || !str(item.file, 2000) || (item.file && !safeUrl(item.file))) fail();
        if (!Array.isArray(item.tasks) || item.tasks.length > 200 || !unique(item.tasks) || item.tasks.some(t => !id(t.id) || !str(t.label, 150) || !str(t.description, 2000) || !statuses.includes(t.status))) fail();
        if (group === 'assets') {
          if (!['knight', 'troll', 'reveal'].includes(item.image) || !str(item.category, 150)) fail();
          item.versions ??= []; item.cover ??= '';
          if (item.cover && !imagePath(item.cover)) fail();
          if (!Array.isArray(item.versions) || item.versions.length > 100 || !unique(item.versions)) fail();
          for (const v of item.versions) {
            if (!id(v.id) || !str(v.title, 150) || !str(v.summary, 4000) || !str(v.owner, 80) || !['wip','review','approved','reference'].includes(v.status) || !str(v.createdAt, 40) || Number.isNaN(Date.parse(v.createdAt))) fail();
            if (!Array.isArray(v.images) || v.images.length > 64 || !unique(v.images) || v.images.some(i => !id(i.id) || !imagePath(i.path) || !['sheet','front','back','left','right','clothing','clothing-progress','detail','progress','reference'].includes(i.role) || !str(i.caption, 300))) fail();
            if (!Array.isArray(v.comments) || v.comments.length > 500 || !unique(v.comments) || v.comments.some(c => !id(c.id) || !str(c.author, 80) || !str(c.target, 80) || !str(c.body, 6000) || (c.image && !v.images.some(i=>i.id===c.image)) || typeof c.resolved !== 'boolean' || !str(c.createdAt,40) || Number.isNaN(Date.parse(c.createdAt)))) fail();
          }
        }
        if (group === 'shots' && (!Array.isArray(item.dependencies) || item.dependencies.some(x => !data.assets.some(a => a.id === x)))) fail();
      }
    }
    if (!Array.isArray(data.milestones) || !data.milestones.length || data.milestones.length > 20 || !unique(data.milestones)) fail();
    for (const m of data.milestones) if (!id(m.id) || !str(m.name, 150) || !str(m.description, 2000) || !Array.isArray(m.checks) || !m.checks.length || m.checks.length > 30 || !unique(m.checks) || m.checks.some(c => !id(c.id) || !str(c.label, 500) || typeof c.done !== 'boolean')) fail();
    return clone(data);
  }
  // Replay only changed fields on the newest shared file, preserving teammates' unrelated edits.
  function apply(data, op) {
    if (op.kind === 'replace') return validate(op.data);
    if (op.kind === 'project' && ['title','deadline','preview','team','hero'].includes(op.field)) data[op.field] = clone(op.value);
    else if (['assets','shots'].includes(op.group)) {
      const item = data[op.group].find(x => x.id === op.id); if (!item) return data;
      if (op.kind === 'task') { const task = item.tasks.find(t => t.id === op.task); if (task && statuses.includes(op.value)) task.status = op.value; }
      if (op.kind === 'field' && ['name','owner','due','blocked','blocker','notes','file','cover'].includes(op.field)) item[op.field] = clone(op.value);
      if (op.kind === 'addTask' && !item.tasks.some(t => t.id === op.value.id)) item.tasks.push(clone(op.value));
      if (op.kind === 'addVersion') { item.versions ??= []; if (!item.versions.some(v=>v.id===op.value.id)) item.versions.push(clone(op.value)); }
      const version = item.versions?.find(v=>v.id===op.version);
      if (version) {
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
  const api = { clone, progress, status, safeUrl, imagePath, validate, apply, replay, statuses };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrackerCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
