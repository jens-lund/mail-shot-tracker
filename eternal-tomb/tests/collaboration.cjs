const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('../core.js');
const seed=C.validate(require('./fixture.cjs')());
const troll=seed.assets.find(a=>a.id==='troll'),version=troll.versions[0];
const deletion={kind:'deleteVersion',group:'assets',id:troll.id,version:version.id,value:'2026-10-07T12:00:00Z'};
const deleted=C.validate(C.replay(seed,[deletion,deletion,{kind:'versionField',group:'assets',id:troll.id,version:version.id,field:'title',value:'Stale title'},{kind:'addVersion',group:'assets',id:troll.id,value:version}]));
assert.equal(C.activeVersions(deleted.assets[1]).length,0);
assert.deepEqual(deleted.assets[1].versions[0].images,version.images,'Recoverable deletion retains images');
assert.deepEqual(deleted.assets[1].versions[0].comments,version.comments,'Recoverable deletion retains comments');
assert.equal(deleted.assets[1].versions[0].title,version.title,'Stale queued edits do not modify deleted versions');
const restored=C.validate(C.replay(deleted,[{kind:'restoreVersion',group:'assets',id:troll.id,version:version.id}]));
assert.deepEqual(C.activeVersions(restored.assets[1])[0],version);
const shot=seed.shots[0],originalTotal=C.taskEntries(seed).length;
const archived=C.validate(C.replay(seed,[{kind:'archiveShot',id:shot.id,value:true},{kind:'task',group:'shots',id:shot.id,task:shot.tasks[0].id,value:'done'}]));
assert.equal(C.activeShots(archived).length,4);
assert.equal(C.taskEntries(archived).length,originalTotal-shot.tasks.length);
assert.equal(archived.shots[0].tasks[0].status,'todo');
assert.deepEqual(C.replay(archived,[{kind:'archiveShot',id:shot.id,value:false}]).shots[0],shot);
const moved=C.validate(C.replay(seed,[{kind:'moveShot',id:shot.id,anchor:seed.shots[2].id,after:true},{kind:'field',group:'shots',id:shot.id,field:'duration',value:8.5},{kind:'field',group:'shots',id:shot.id,field:'camera',value:'35 mm · high cliff'},{kind:'field',group:'shots',id:shot.id,field:'dependencies',value:['knight','troll']}]));
assert.equal(moved.shots[2].id,shot.id);assert.equal(moved.shots[2].duration,8.5);assert.equal(moved.shots[2].camera,'35 mm · high cliff');
const addition={kind:'addShot',value:{...C.clone(shot),id:'custom_shot',name:'New story beat'}};
assert.equal(C.validate(C.replay(moved,[addition,addition])).shots.length,6,'Replayed shot creation is idempotent');
for(const value of [-1,601,NaN,'8'])assert.throws(()=>C.validate(C.replay(seed,[{kind:'field',group:'shots',id:shot.id,field:'duration',value}])));

function authClient({push=true,status=200}={}){
  const calls=[],elements=new Map(),C= require('../core.js');
  const element=id=>{if(!elements.has(id))elements.set(id,{textContent:''});return elements.get(id);};
  const context=vm.createContext({C,data:seed,token:'test-token',identity:'',document:{querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},$:element,fetch:async(url,init)=>{calls.push({url,init});return {ok:status===200,status,json:async()=>url.endsWith('/user')?{login:'jens-lund',name:'Jens Lund'}:{permissions:{push}}};},console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../collaboration.js'),'utf8'),context);
  return {context,calls,run:code=>vm.runInContext(code,context)};
}
(async()=>{
  const editor=authClient();assert.equal(editor.run('canEditProject()'),false,'Access starts read only');assert.equal(await editor.run('verifyEditorAccess()'),true);assert.equal(editor.run('canEditProject()'),true);assert.equal(editor.run('editorAccess.login'),'jens-lund');assert(editor.calls.every(c=>c.init.headers.Authorization==='Bearer test-token'));
  editor.run("token='different-token'");assert.equal(editor.run('canEditProject()'),false,'Verified identity cannot be reused with another token');
  const reader=authClient({push:false});assert.equal(await reader.run('verifyEditorAccess()'),false);assert(reader.run('editorAccess.verified'));assert.equal(reader.run('canEditProject()'),false);
  const expired=authClient({status:401});assert.equal(await expired.run('verifyEditorAccess()'),false);assert.equal(expired.calls.length,1);assert.equal(expired.run('canEditProject()'),false);
  const guest=authClient();guest.run("token=''");assert.equal(await guest.run('verifyEditorAccess()'),false);assert.equal(guest.calls.length,0);
  console.log('Passed: recoverable version and shot deletion, stale replay protection, shot order/specs/creation, token identity, repository write access, invalid tokens and public viewing.');
})().catch(error=>{console.error(error);process.exitCode=1;});
