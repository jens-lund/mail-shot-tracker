const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('../core.js');
const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/project.json'),'utf8'));
function client(){
  const data=C.validate(seed),saved=[],messages=[],events=new Map();let hook=null;
  const controls=[{disabled:false},{disabled:false}],result={textContent:''};
  const form={dataset:{detailUpload:'assets:knight:design'},elements:{images:{files:[{name:'progress.png'}],value:'progress.png'},caption:{value:'Current blockout'}},querySelectorAll:()=>controls,querySelector:()=>result};
  const context=vm.createContext({C,data,document:{hidden:false,activeElement:null,querySelector:()=>null,querySelectorAll:()=>[form],addEventListener:(n,fn)=>events.set(n,fn)},$:()=>null,uploading:false,token:'',pending:[],saveTimer:null,setTimeout(){},clearTimeout(){},renderReview(){throw new Error('An inline upload must not switch to Review');},reviewEntry(){throw new Error('No review task should be required');},newId:(()=>{let n=0;return ()=>`image_${++n}`;})(),M:{prepare:async f=>{if(hook)hook();return f;},store:async(p,b)=>saved.push(p)},commit:op=>{C.apply(data,op);context.pending.push(op);},setMessage:m=>messages.push(m),sync(){},console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../workflow.js'),'utf8'),context);
  return {context,form,controls,result,saved,messages,run:code=>vm.runInContext(code,context),setHook:fn=>hook=fn};
}
(async()=>{
  const a=client();a.run('captureReviewDraft=()=>{}');a.context.target={group:'assets',item:a.context.data.assets[0],task:a.context.data.assets[0].tasks[0]};a.context.form=a.form;
  assert.equal(a.run('autoRefreshAllowed()'),false,'Selected inline files and captions protect drafts');
  await a.run('uploadTaskImages(form,target)');
  const task=a.context.data.assets[0].tasks[0];assert.equal(task.status,'todo','Uploads work before Review');assert.equal(task.images.length,1);assert.equal(task.images[0].caption,'Current blockout');assert.equal(a.context.data.assets[0].tasks[1].images.length,0,'Only the selected task receives the image');assert.equal(a.saved[0],task.images[0].path);assert.equal(a.form.elements.images.value,'');assert.equal(a.form.elements.caption.value,'');assert(a.controls.every(c=>!c.disabled));
  a.form.elements.images.files=[];assert.equal(a.run('autoRefreshAllowed()'),true);
  a.form.elements.caption.value='Unsubmitted caption';assert.equal(a.run('autoRefreshAllowed()'),false,'A caption remains protected after focus leaves the form');
  const b=client();b.run('captureReviewDraft=()=>{}');b.context.form=b.form;b.context.target={group:'assets',item:b.context.data.assets[0],task:b.context.data.assets[0].tasks[0]};b.setHook(()=>C.apply(b.context.data,{kind:'removeTask',group:'assets',id:'knight',task:'design'}));
  await b.run('uploadTaskImages(form,target)');assert.equal(b.context.pending.length,0,'No stale image operation recreates a removed task');assert(b.messages.some(m=>m.includes('removed')));assert.equal(b.form.elements.caption.value,'Current blockout','Failures preserve the caption for retry');
  console.log('Passed: progress upload outside Review, correct-task image metadata, draft protection, removal during upload and recoverable failure.');
})().catch(e=>{console.error(e);process.exitCode=1;});
