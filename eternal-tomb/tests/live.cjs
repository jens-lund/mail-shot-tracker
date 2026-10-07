const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('../core.js');
const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/project.json'),'utf8'));

function client(){
  let now=100000,shared=C.validate(seed),revision=1,reads=0,jsonReads=0,hook=null,failure=null;
  const elements=new Map(),storage=new Map([['eternal-tomb-github-token','test-only-token']]),events=new Map(),intervals=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{id,open:false,scrollTop:0,textContent:'',innerHTML:'',classList:{toggle(){}},addEventListener(){},querySelectorAll(){return [];}});return elements.get(id);};
  const forms=new Set(['taskFeedbackForm','taskUploadForm','feedbackForm','uploadForm']);
  class Clock extends Date{static now(){return now;}}
  const context=vm.createContext({Date:Clock,window:{TrackerCore:C,TrackerMedia:{async get(){return null;}},ETERNAL_TOMB_SEED:seed,scrollY:150,scrollTo(p){context.scrollPosition=p.top;},addEventListener(n,fn){events.set('window:'+n,fn);}},document:{hidden:false,activeElement:null,getElementById:id=>forms.has(id)?elements.get(id)||null:element(id),querySelector:s=>s==='dialog[open]'&&element('detailDialog').open?element('detailDialog'):null,querySelectorAll(){return [];},addEventListener(n,fn){events.set('document:'+n,fn);}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location:{hash:'',hostname:'localhost'},TextEncoder,TextDecoder,URL,Blob,Uint8Array,btoa,atob,console,crypto:require('node:crypto').webcrypto,setInterval(fn,ms){intervals.push({fn,ms});return 1;},setTimeout(){return 1;},clearTimeout(){},renderCount:0,openCount:0,scrollPosition:0,fetch:async(url,init)=>{
    if(init?.method==='PUT'){shared=JSON.parse(Buffer.from(JSON.parse(init.body).content,'base64'));revision++;return {ok:true,status:200};}
    reads++;if(hook){const fn=hook;hook=null;fn(context);}
    if(failure)return failure;
    const etag='"v'+revision+'"';
    if(init?.headers?.['If-None-Match']===etag)return {ok:false,status:304,json(){throw new Error('A 304 has no body');}};
    return {ok:true,status:200,headers:{get:name=>name==='etag'?etag:null},json:async()=>{jsonReads++;return url.includes('api.github.com')?{sha:'sha-'+revision,content:Buffer.from(JSON.stringify(shared)).toString('base64')}:C.clone(shared);}};
  }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../workflow.js'),'utf8'),context);
  let app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace('navigate();localSave();refresh();M.hydrate().then(()=>render());','');
  vm.runInContext(app,context);
  vm.runInContext('render=()=>{renderCount++;};openDetail=()=>{openCount++;document.getElementById("detailDialog").scrollTop=0;};',context);
  return {context,elements,events,intervals,run:s=>vm.runInContext(s,context),advance:ms=>now+=ms,change:fn=>{fn(shared);revision++;},onRead:fn=>hook=fn,fail:r=>failure=r,get reads(){return reads;},get jsonReads(){return jsonReads;}};
}

(async()=>{
  const a=client();
  assert.equal(a.intervals[0].ms,1000);
  await a.run('refresh()');const renders=a.context.renderCount,jsonReads=a.jsonReads;
  await a.run('liveRefresh()');
  assert.equal(a.context.renderCount,renders,'Unchanged remote data does not redraw');
  assert.equal(a.jsonReads,jsonReads,'Conditional 304 skips parsing');
  const before=a.reads;a.advance(2999);await a.run('liveRefresh()');assert.equal(a.reads,before);
  a.change(d=>d.assets[0].tasks[1].status='review');a.advance(1);await a.run('liveRefresh()');
  assert.equal(a.run('data.assets[0].tasks[1].status'),'review');assert.equal(a.context.renderCount,renders+1);
  assert.equal(a.context.scrollPosition,150,'Live rendering retains page scroll');

  const dialog=a.elements.get('detailDialog'),notes={open:false};dialog.open=true;dialog.scrollTop=77;
  dialog.querySelectorAll=()=>[{closest:()=>({id:'task-model'})}];
  a.elements.set('task-model',{querySelector:()=>notes});
  a.run("detail={group:'assets',id:'knight'}");a.change(d=>d.assets[0].tasks[1].label='New teammate task label');
  a.advance(3000);await a.run('liveRefresh()');
  assert.equal(a.context.openCount,1,'Open task dialog updates');assert.equal(dialog.scrollTop,77);assert.equal(notes.open,true);
  dialog.open=false;a.run('detail=null');

  a.change(d=>d.assets[0].notes='Remote edit while typing starts');const etag=a.run('remoteETag');
  a.onRead(c=>c.document.activeElement={matches:()=>true});a.advance(3000);await a.run('liveRefresh()');
  assert.equal(a.run('remoteETag'),etag,'Deferred response does not consume its ETag');
  assert.notEqual(a.run('data.assets[0].notes'),'Remote edit while typing starts');
  a.context.document.activeElement=null;a.advance(3000);await a.run('liveRefresh()');
  assert.equal(a.run('data.assets[0].notes'),'Remote edit while typing starts','Deferred change applies when editing ends');

  a.change(d=>d.shots[0].notes='Teammate change');
  a.onRead(()=>a.run("commit({kind:'field',group:'assets',id:'knight',field:'notes',value:'Local edit during refresh'})"));
  a.advance(3000);await a.run('liveRefresh()');
  assert.equal(a.run('data.assets[0].notes'),'Local edit during refresh');assert.equal(a.run('pending.length'),1);
  await new Promise(setImmediate);await a.run('sync()');assert.equal(a.run('pending.length'),0);assert.equal(a.run('data.shots[0].notes'),'Teammate change');
  assert.equal(a.run('remoteETag'),'','Successful writes invalidate the old ETag');

  a.onRead(()=>a.run("commit({kind:'field',group:'assets',id:'knight',field:'notes',value:'Local edit during empty sync'})"));
  await a.run('sync()');assert.equal(a.run('pending.length'),1);assert.equal(a.run('data.assets[0].notes'),'Local edit during empty sync');
  await a.run('sync()');

  a.fail({ok:false,status:429,headers:{get:n=>n==='retry-after'?'120':null}});
  a.advance(3000);await a.run('liveRefresh()');const rateReads=a.reads;
  a.advance(119999);await a.run('liveRefresh()');assert.equal(a.reads,rateReads,'Honor GitHub retry-after');
  a.fail(null);a.advance(3001);await a.run('liveRefresh()');assert.equal(a.reads,rateReads+1);
  assert.equal(a.run('syncFailed'),false);
  const hiddenReads=a.reads;a.context.document.hidden=true;a.advance(3000);await a.run('liveRefresh()');
  assert.equal(a.reads,hiddenReads);a.context.document.hidden=false;
  a.change(d=>d.assets[1].owner='Kevin');await a.events.get('window:focus')();
  await new Promise(setImmediate);
  assert.equal(a.run('data.assets[1].owner'),'Kevin','Returning to a tab checks immediately');

  const b=client();await b.run('refresh()');const bDialog=b.elements.get('detailDialog');bDialog.open=true;bDialog.scrollTop=88;
  b.context.document.activeElement={matches:()=>true};b.run("detail={group:'assets',id:'knight'};commit({kind:'task',group:'assets',id:'knight',task:'model',value:'doing'})");
  b.change(d=>d.assets[0].tasks[2].label='Teammate label merged during save');await b.run('sync()');
  assert.equal(b.context.openCount,0,'Saving does not replace an active task editor');assert.equal(b.run('sharedViewPending'),true);
  b.context.document.activeElement=null;await b.run('liveRefresh()');
  assert.equal(b.context.openCount,1,'Merged changes display after editing ends, even when the next read is unchanged');assert.equal(bDialog.scrollTop,88);

  const publicClient=client();publicClient.run("token=''");await publicClient.run('refresh()');await publicClient.run('liveRefresh()');
  const publicReads=publicClient.reads;publicClient.advance(14999);await publicClient.run('liveRefresh()');assert.equal(publicClient.reads,publicReads);
  publicClient.advance(1);await publicClient.run('liveRefresh()');assert.equal(publicClient.reads,publicReads+1);
  console.log('Passed: live teammate updates, conditional requests, three-second checks, dialog/scroll retention, in-flight draft and queue protection, rate-limit backoff, tab return and public polling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
