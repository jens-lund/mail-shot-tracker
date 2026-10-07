const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../core.js'),seed=C.validate(require('./fixture.cjs')());
const target={group:'assets',id:'troll'},troll=seed.assets.find(a=>a.id==='troll');
troll.tasks[0].status='done';troll.tasks[1].description='Keep the cloth notes';
troll.tasks[1].owner='Kevin';troll.tasks[2].priority='nice';
const assigned=C.validate(C.replay(seed,[{kind:'assignSection',...target,value:'Nicolai'}]));
const result=assigned.assets.find(a=>a.id==='troll');
assert(result.tasks.every(t=>t.owner==='Nicolai'),'Whole assignment includes optional and completed subtasks');
assert.equal(result.owner,'Nicolai');assert.equal(result.tasks[0].status,'done');assert.equal(result.tasks[1].description,'Keep the cloth notes');
assert.deepEqual(result.versions,troll.versions,'Whole assignment preserves versions and feedback');
const newTask={id:'new_step',label:'New cloth pass',description:'',status:'todo'};
const next=C.validate(C.replay(assigned,[{kind:'addTask',...target,value:newTask},{kind:'taskField',...target,task:result.tasks[1].id,field:'owner',value:'Kevin'}]));
assert.equal(next.assets[1].tasks.at(-1).owner,'Nicolai','Future tasks inherit section ownership');
assert.equal(next.assets[1].tasks[1].owner,'Kevin','Individual overrides remain available');
const teammate=C.clone(seed);teammate.shots[0].camera='Teammate camera';teammate.assets[1].tasks[0].description='New lighting feedback';
const merged=C.validate(C.replay(teammate,[{kind:'assignSection',...target,value:'Nicolai'}]));
assert.equal(merged.shots[0].camera,'Teammate camera');assert.equal(merged.assets[1].tasks[0].description,'New lighting feedback');
assert(C.replay(assigned,[{kind:'assignSection',...target,value:'Unknown'}]).assets[1].tasks.every(t=>t.owner==='Nicolai'));
const cleared=C.validate(C.replay(assigned,[{kind:'assignSection',...target,value:''}]));assert(cleared.assets[1].tasks.every(t=>t.owner===''));
const shot=C.validate(C.replay(seed,[{kind:'assignSection',group:'shots',id:seed.shots[0].id,value:'Kevin'}]));assert(shot.shots[0].tasks.every(t=>t.owner==='Kevin'));

const media={path:'uploads/previs_test.mp4',name:'Animatic v002.mp4',size:12,type:'video/mp4'};
const videoProject=C.validate(C.replay(seed,[{kind:'project',field:'previewMedia',value:media}]));
assert.deepEqual(videoProject.previewMedia,media);assert(!C.imagePath(media.path));assert(C.videoPath(media.path));
for(const invalid of [{...media,path:'uploads/../bad.mp4'},{...media,path:'https://example.com/movie.mp4'},{...media,size:0},{...media,size:C.maxVideoBytes+1},{...media,type:'text/html'},{...media,path:'uploads/video.webm'}])assert.throws(()=>C.validate({...seed,previewMedia:invalid}));
assert.equal(C.validate(seed).previewMedia,null,'Earlier projects still open');
assert(!('localMedia' in C.validate({...videoProject,localMedia:[{secret:'local only'}]})));

const events=new Map(),elements=new Map(),messages=[],puts=[],storage=new Map([['eternal-tomb-github-token','test-token']]);
const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',open:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);};
const context=vm.createContext({window:{TrackerCore:C,ETERNAL_TOMB_SEED:seed,addEventListener(){}},document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn);}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location:{hash:''},TextEncoder,TextDecoder,URL,Blob,Uint8Array,btoa,atob,console,crypto:require('node:crypto').webcrypto,setInterval(){},setTimeout(){},clearTimeout(){},fetch:async(url,options)=>{
  if(url.includes('/uploads/')){if(options.method==='PUT'){puts.push('media');return {ok:true,status:201};}return {ok:false,status:404};}
  if(options.method==='PUT'){puts.push('project');return {ok:true,status:200};}
  return {ok:true,status:200,json:async()=>({sha:'test-sha',content:Buffer.from(JSON.stringify(seed)).toString('base64')})};
},DataTransfer:class{constructor(){this.files=[];this.items={add:file=>this.files.push(file)};}},Event:class{constructor(type){this.type=type;}}});
for(const file of ['media','workflow','collaboration','production'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../'+file+'.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace('initializeTracker();',''),context);
const run=code=>vm.runInContext(code,context);
run("editorAccess={verified:true,canEdit:true,login:'test-editor',message:''};verifiedToken=token;render=()=>{};setMessage=(message)=>messages.push(message);");context.messages=messages;
assert.equal(run("memberColor('Nicolai')"),'nico');assert.equal(run("memberColor('Nico')"),'nico');
context.files=[{name:'image.png',type:'image/png',size:100}];
assert.equal(run('uploadFileError(files)'), '');assert(run('uploadFileError([...files,...files])').includes('one file'));
assert.equal(run('uploadFileError([...files,...files],"image",true)'), '');
assert(run('uploadFileError([{name:"bad.html",type:"text/html",size:10}])').includes('PNG'));
assert(run('uploadFileError([{name:"large.png",type:"image/png",size:16000000}])').includes('15 MB'));
assert.equal(run('uploadFileError([{name:"movie.mp4",type:"video/mp4",size:100}],"video")'),'');
assert(run('uploadFileError([{name:"movie.mp4",type:"video/mp4",size:30000000}],"video")').includes('25 MB'));
context.file={name:'animatic.mp4',type:'video/mp4',size:12,slice:(a,b,type)=>new Blob(['video sample'],{type})};
assert.equal(run('window.TrackerMedia.prepareVideo(file).type'),'video/mp4');
context.file.size=C.maxVideoBytes+1;assert.throws(()=>run('window.TrackerMedia.prepareVideo(file)'));context.file.size=12;

const input={disabled:false,multiple:true,accept:'image/png,image/jpeg,image/webp',dispatchEvent(event){this.changed=event.type;},closest:()=>label};
const hint={textContent:'',classList:{toggle(){}}},label={classList:{remove(){}},querySelector:s=>s.startsWith('input')?input:hint};
const domTarget={closest:s=>s==='.file-drop-zone'?label:null};
const drop={target:domTarget,dataTransfer:{files:context.files},preventDefault(){this.prevented=true;}};
const dropHandler=events.get('drop')[0];dropHandler(drop);
assert(drop.prevented);assert.equal(input.files[0].name,'image.png');assert.equal(input.changed,'change','Drops update the real file input through its change event');
const pencil={disabled:false,dataset:{editImage:'cover:troll'}};
const pencilTarget={closest:s=>s==='[data-edit-image]'?pencil:null};
run('openImageEditor=target=>{lastImageTarget=target;document.getElementById("thumbnailDialog").open=true;}');element('thumbnailFile').dispatchEvent=function(event){this.changed=event.type;};
dropHandler({...drop,target:pencilTarget});assert.equal(run('lastImageTarget'),'cover:troll');assert.equal(element('thumbnailFile').files[0].name,'image.png');
run('editorAccess.canEdit=false');input.files=[];dropHandler(drop);assert.equal(input.files.length,0,'Read-only drops cannot change files');assert(hint.textContent.includes('Connect GitHub'));run('editorAccess.canEdit=true');

context.raw={...videoProject,hero:'uploads/image_test.webp',localImages:[{path:'uploads/image_test.webp',base64:'dGVzdA=='}],localMedia:[{path:media.path,type:'video/mp4',base64:'dmlkZW8gc2FtcGxl'}]};
assert.equal(run('backupMediaEntries(raw).length'),2,'Backups accept both image and video files');
context.raw.localMedia[0].path='uploads/unreferenced.mp4';assert.throws(()=>run('backupMediaEntries(raw)'));context.raw.localMedia[0].path=media.path;
context.raw.localMedia[0].type='text/html';assert.throws(()=>run('backupMediaEntries(raw)'));context.raw.localMedia[0].type='video/mp4';
assert(run('imagePaths(raw).has(raw.previewMedia.path)'));

(async()=>{
  const store=new Map([[media.path,{path:media.path,blob:new Blob(['video sample']),uploaded:false}]]);
  context.window.TrackerMedia.get=async path=>store.get(path);context.window.TrackerMedia.markUploaded=async path=>{store.get(path).uploaded=true;};
  context.media=media;run('commit({kind:"project",field:"previewMedia",value:media})');await run('sync()');
  assert.deepEqual(puts,['media','project'],'A video is uploaded before its shared project record');assert(store.get(media.path).uploaded);assert.equal(run('pending.length'),0);
  assert(!storage.get('eternal-tomb-project-v1').includes('test-token'));
  console.log('Passed: whole-section ownership, inheritance, individual overrides, merge preservation, Nico color, video validation, drop routing and access, media backups, and video-before-record sync.');
})().catch(error=>{console.error(error);process.exitCode=1;});
