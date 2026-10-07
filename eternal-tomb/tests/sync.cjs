const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('../core.js');
const seed = require('./fixture.cjs')();
const elements=new Map();const storage=new Map([['eternal-tomb-github-token','test-only-token']]);
const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',classList:{toggle(){}},addEventListener(){}});return elements.get(id);};
const dynamicForms=['taskFeedbackForm','taskUploadForm','feedbackForm','uploadForm'];
let shared=C.clone(seed),putCount=0,conflict=true,appendDuringSave=true;
const context=vm.createContext({window:{TrackerCore:C,TrackerMedia:{async get(){return null;},async all(){return [];}},ETERNAL_TOMB_SEED:seed,addEventListener(){}},document:{getElementById:element,querySelectorAll(){return [];},addEventListener(){},hidden:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location:{hash:''},TextEncoder,TextDecoder,URL,Blob,Uint8Array,btoa,atob,console,crypto:require('node:crypto').webcrypto,setInterval(){return 1;},setTimeout(){return 1;},clearTimeout(){},fetch:async(url,init)=>{
  if(init?.method==='PUT'){
    putCount++;
    if(conflict){conflict=false;shared.assets[1].owner='Kevin';shared.shots[1].notes=`Teammate updated during conflict ${putCount}`;return {ok:false,status:409};}
    shared=JSON.parse(Buffer.from(JSON.parse(init.body).content,'base64').toString('utf8'));
    if(appendDuringSave){appendDuringSave=false;vm.runInContext("commit({kind:'field',group:'assets',id:'knight',field:'notes',value:'A note made while saving.'})",context);}
    return {ok:true,status:200};
  }
  return {ok:true,status:200,json:async()=>({sha:'test-sha-'+putCount,content:Buffer.from(JSON.stringify(shared)).toString('base64')})};
}});
context.document.querySelector=()=>null;
context.document.getElementById=id=>dynamicForms.includes(id)?elements.get(id)||null:element(id);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../collaboration.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../workflow.js'),'utf8'),context);
let code=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');code=code.replace('initializeTracker();','');vm.runInContext(code,context);vm.runInContext("editorAccess={verified:true,canEdit:true,login:'test-editor',message:''};verifiedToken=token;",context);vm.runInContext('render=()=>{};',context);
(async()=>{
  const mediaPaths=vm.runInContext("imagePaths({...data,hero:'uploads/banner.webp',assets:data.assets.map(a=>({...a,cover:'uploads/cover.webp',tasks:a.tasks.map(t=>({...t,images:[{path:'uploads/asset_review.webp'}]}))})),shots:data.shots.map(s=>({...s,tasks:s.tasks.map(t=>({...t,images:[{path:'uploads/shot_review.webp'}]}))}))})",context);
  assert(mediaPaths.has('uploads/banner.webp'));assert(mediaPaths.has('uploads/cover.webp'));assert(mediaPaths.has('uploads/asset_review.webp'));assert(mediaPaths.has('uploads/shot_review.webp'));assert.equal(mediaPaths.size,4);
  const mediaFetch=context.fetch, published=[];
  context.window.TrackerMedia.get=async path=>({path,blob:new Blob(['test']),uploaded:false});
  context.window.TrackerMedia.base64=async()=>btoa('test');
  context.window.TrackerMedia.markUploaded=async path=>published.push(path);
  context.fetch=async(url,init)=>({ok:init?.method==='PUT',status:init?.method==='PUT'?200:404});
  await vm.runInContext("publishMedia(new Set(['uploads/banner.webp','uploads/cover.webp','uploads/asset_review.webp','uploads/shot_review.webp']))",context);
  assert.deepEqual(published,['uploads/banner.webp','uploads/cover.webp','uploads/asset_review.webp','uploads/shot_review.webp']);
  context.fetch=mediaFetch;context.window.TrackerMedia.get=async()=>null;
  vm.runInContext("commit({kind:'task',group:'assets',id:'knight',task:'design',value:'done'})",context);
  await vm.runInContext('sync()',context);
  assert.equal(shared.assets[0].tasks[0].status,'done');assert.equal(shared.assets[1].owner,'Kevin');assert.equal(putCount,2);
  assert.equal(vm.runInContext('pending.length',context),1);assert.equal(vm.runInContext('data.assets[0].notes',context),'A note made while saving.');
  await vm.runInContext('sync()',context);assert.equal(shared.assets[0].notes,'A note made while saving.');assert.equal(vm.runInContext('pending.length',context),0);
  vm.runInContext("commit({kind:'task',group:'assets',id:'knight',task:'model',value:'doing'})",context);context.fetch=async()=>({ok:false,status:401});await vm.runInContext('sync()',context);
  assert.equal(vm.runInContext('pending.length',context),1);assert.equal(vm.runInContext('data.assets[0].tasks[1].status',context),'doing');assert(element('saveStatus').textContent.includes('Saved locally'));
  assert(!JSON.stringify(JSON.parse(storage.get('eternal-tomb-project-v1'))).includes('test-only-token'));
  context.fetch=mediaFetch;vm.runInContext('retryAt=0',context);await vm.runInContext('sync()',context);
  assert.equal(vm.runInContext('pending.length',context),0,'The offline queue retries successfully');

  const assetTarget={group:'assets',id:shared.assets[0].id,task:shared.assets[0].tasks[0].id};
  const shotTarget={group:'shots',id:shared.shots[0].id,task:shared.shots[0].tasks[0].id};
  const assetImage={id:'asset_review',path:'uploads/asset_review.webp',role:'progress',caption:'Shoulder study'};
  const shotImage={id:'shot_review',path:'uploads/shot_review.webp',role:'progress',caption:'Camera composition'};
  const comment={id:'asset_annotation',author:'Jens',body:'Raise this shoulder a little.',image:assetImage.id,point:{x:.27,y:.61},resolved:false,createdAt:'2026-10-07T12:00:00Z'};
  const shotComment={...comment,id:'shot_annotation',body:'Camera should move closer here.',image:shotImage.id,point:{x:.5,y:.4}};
  const reviewOps=[{kind:'task',...assetTarget,value:'review'},{kind:'addTaskImage',...assetTarget,value:assetImage},{kind:'addTaskComment',...assetTarget,value:comment},{kind:'task',...shotTarget,value:'review'},{kind:'addTaskImage',...shotTarget,value:shotImage},{kind:'addTaskComment',...shotTarget,value:shotComment}];
  for(const op of reviewOps)vm.runInContext(`commit(${JSON.stringify(op)})`,context);
  await vm.runInContext('sync()',context);
  C.validate(shared);
  assert.deepEqual(shared.assets[0].tasks[0].comments[0],comment);
  assert.deepEqual(shared.shots[0].tasks[0].comments[0],shotComment);
  assert.equal(shared.assets[0].tasks[0].images[0].path,assetImage.path);
  assert.equal(shared.shots[0].tasks[0].images[0].path,shotImage.path);
  const resolve={kind:'taskCommentResolved',...assetTarget,comment:comment.id,value:true};
  vm.runInContext(`commit(${JSON.stringify(resolve)})`,context);await vm.runInContext('sync()',context);
  assert(shared.assets[0].tasks[0].comments[0].resolved);
  shared.shots[0].tasks[1].description='A new note from another team member';
  await vm.runInContext('refresh()',context);
  assert.equal(vm.runInContext('data.shots[0].tasks[1].description',context),'A new note from another team member');
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(data.assets[0].tasks[0].comments[0].point)',context)),comment.point,'Refresh retains normalized annotation coordinates');

  conflict=true;appendDuringSave=true;
  const beforeDeletePuts=putCount;
  vm.runInContext(`commit(${JSON.stringify({kind:'removeTask',...assetTarget})})`,context);
  await vm.runInContext('sync()',context);
  assert.equal(putCount-beforeDeletePuts,2,'Deletion retries a conflicting shared write');
  assert(!shared.assets[0].tasks.some(t=>t.id===assetTarget.task));
  assert(shared.assets[0].removedTaskIds.includes(assetTarget.task));
  assert.equal(shared.shots[1].notes,`Teammate updated during conflict ${beforeDeletePuts+1}`);
  assert.equal(shared.shots[0].tasks[1].description,'A new note from another team member');
  assert.equal(vm.runInContext('pending.length',context),1,'Edits arriving during the deletion save stay queued');
  await vm.runInContext('sync()',context);
  assert.equal(vm.runInContext('pending.length',context),0);
  vm.runInContext(`commit(${JSON.stringify({kind:'taskField',...assetTarget,field:'label',value:'Stale task edit'})})`,context);
  await vm.runInContext('sync()',context);
  assert(!shared.assets[0].tasks.some(t=>t.id===assetTarget.task),'Stale shared updates cannot resurrect removed tasks');
  C.validate(shared);

  const allowed=()=>vm.runInContext('autoRefreshAllowed()',context);
  assert.equal(allowed(),true);
  context.document.hidden=true;assert.equal(allowed(),false);context.document.hidden=false;
  context.document.querySelector=selector=>selector==='dialog[open]'?{}:null;assert.equal(allowed(),false);context.document.querySelector=()=>null;
  context.document.querySelector=selector=>selector==='dialog[open]'?{id:'detailDialog'}:null;assert.equal(allowed(),true,'Read-only task dialogs allow live updates');context.document.querySelector=()=>null;
  context.document.querySelector=selector=>selector==='.remove-confirmation'?{}:null;assert.equal(allowed(),false,'Keep task-removal confirmation intact');context.document.querySelector=()=>null;
  context.document.activeElement={matches:()=>true};assert.equal(allowed(),true,'Focus after a saved edit no longer blocks updates');context.document.activeElement={matches:()=>false};
  vm.runInContext('uploading=true',context);assert.equal(allowed(),false);vm.runInContext('uploading=false',context);
  const feedbackForm={dataset:{reviewKey:'assets/knight/model'},elements:{body:{value:'A pending review comment'},author:{value:'Jens'}}};
  elements.set('taskFeedbackForm',feedbackForm);assert.equal(allowed(),false);feedbackForm.elements.body.value='';assert.equal(allowed(),true);
  elements.set('feedbackForm',{elements:{body:{value:'Legacy version draft'}}});assert.equal(allowed(),false);elements.delete('feedbackForm');
  const uploadForm={elements:{images:{files:[{}]},caption:{value:'A pending upload'}}};
  elements.set('taskUploadForm',uploadForm);assert.equal(allowed(),false);uploadForm.elements.images.files=[];assert.equal(allowed(),true);
  elements.set('uploadForm',{elements:{images:{files:[{}]}}});assert.equal(allowed(),false);elements.delete('uploadForm');
  feedbackForm.elements.body.value='Draft stays with the displayed task';
  vm.runInContext("reviewKey='shots/other/task';captureReviewDraft()",context);
  assert.equal(vm.runInContext("reviewDrafts.get('assets/knight/model').body",context),feedbackForm.elements.body.value,'Draft is keyed to its actual form, not a changing navigation key');
  elements.delete('taskFeedbackForm');elements.delete('taskUploadForm');
  assert.equal(allowed(),true);
  console.log('Passed: GitHub SHA conflict retry, task review/annotation sync, asset and shot media, concurrent deletion, queue preservation, refresh draft guards, offline retries and token-free backups.');
})().catch(e=>{console.error(e);process.exitCode=1;});

