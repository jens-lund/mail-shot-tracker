const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('../core.js');
const seed=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../data/project.json'),'utf8'));
const elements=new Map();const storage=new Map([['eternal-tomb-github-token','test-only-token']]);
const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',classList:{toggle(){}},addEventListener(){}});return elements.get(id);};
let shared=C.clone(seed),putCount=0,conflict=true,appendDuringSave=true;
const context=vm.createContext({window:{TrackerCore:C,TrackerMedia:{async get(){return null;},async all(){return [];}},ETERNAL_TOMB_SEED:seed,addEventListener(){}},document:{getElementById:element,querySelectorAll(){return [];},addEventListener(){},hidden:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location:{hash:''},TextEncoder,TextDecoder,URL,Blob,Uint8Array,btoa,atob,console,crypto:require('node:crypto').webcrypto,setTimeout(){return 1;},clearTimeout(){},fetch:async(url,init)=>{
  if(init?.method==='PUT'){
    putCount++;
    if(conflict){conflict=false;shared.assets[1].owner='Kevin';return {ok:false,status:409};}
    shared=JSON.parse(Buffer.from(JSON.parse(init.body).content,'base64').toString('utf8'));
    if(appendDuringSave){appendDuringSave=false;vm.runInContext("commit({kind:'field',group:'assets',id:'knight',field:'notes',value:'A note made while saving.'})",context);}
    return {ok:true,status:200};
  }
  return {ok:true,status:200,json:async()=>({sha:'test-sha-'+putCount,content:Buffer.from(JSON.stringify(shared)).toString('base64')})};
}});
let code=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');code=code.replace('navigate();localSave();refresh();M.hydrate().then(()=>render());','');vm.runInContext(code,context);vm.runInContext('render=()=>{};',context);
(async()=>{
  vm.runInContext("commit({kind:'task',group:'assets',id:'knight',task:'design',value:'done'})",context);
  await vm.runInContext('sync()',context);
  assert.equal(shared.assets[0].tasks[0].status,'done');assert.equal(shared.assets[1].owner,'Kevin');assert.equal(putCount,2);
  assert.equal(vm.runInContext('pending.length',context),1);assert.equal(vm.runInContext('data.assets[0].notes',context),'A note made while saving.');
  await vm.runInContext('sync()',context);assert.equal(shared.assets[0].notes,'A note made while saving.');assert.equal(vm.runInContext('pending.length',context),0);
  vm.runInContext("commit({kind:'task',group:'assets',id:'knight',task:'model',value:'doing'})",context);context.fetch=async()=>({ok:false,status:401});await vm.runInContext('sync()',context);
  assert.equal(vm.runInContext('pending.length',context),1);assert.equal(vm.runInContext('data.assets[0].tasks[1].status',context),'doing');assert(element('saveStatus').textContent.includes('Saved locally'));
  assert(!JSON.stringify(JSON.parse(storage.get('eternal-tomb-project-v1'))).includes('test-only-token'));
  console.log('Passed: GitHub SHA conflict retry, preserved teammate changes, edits made during saving, offline queue retention and token-free project backups.');
})().catch(e=>{console.error(e);process.exitCode=1;});
