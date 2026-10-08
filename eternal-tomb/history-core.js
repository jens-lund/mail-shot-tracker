(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./core.js'):root.TrackerCore;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const keyed=value=>Array.isArray(value)&&value.every(v=>v&&typeof v==='object'&&typeof v.id==='string');
  function differences(before,after,path=[],out=[]){
    if(same(before,after))return out;
    if(keyed(before)&&keyed(after)){
      const old=new Map(before.map(v=>[v.id,v])),next=new Map(after.map(v=>[v.id,v]));
      for(const id of new Set([...old.keys(),...next.keys()]))differences(old.get(id),next.get(id),[...path,'@'+id],out);
      const oldIds=before.map(v=>v.id),newIds=after.map(v=>v.id);
      if(!same(oldIds,newIds))out.push({path:[...path,'$order'],before:oldIds,after:newIds,beforeExists:true,afterExists:true});
    }else if(before&&after&&!Array.isArray(before)&&!Array.isArray(after)&&typeof before==='object'&&typeof after==='object'){
      for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(!['activity','updatedAt'].includes(key)||path.length)differences(before[key],after[key],[...path,key],out);
    }else out.push({path,before:before===undefined?null:C.clone(before),after:after===undefined?null:C.clone(after),beforeExists:before!==undefined,afterExists:after!==undefined});
    return out;
  }
  function readPath(data,path){
    let value=data;
    for(const key of path){
      if(key==='$order')return Array.isArray(value)?value.map(v=>v.id):undefined;
      value=key.startsWith('@')?(Array.isArray(value)?value.find(v=>v.id===key.slice(1)):undefined):value?.[key];
    }
    return value;
  }
  function writePath(data,path,value,exists){
    const parent=readPath(data,path.slice(0,-1)),key=path.at(-1);
    if(parent===undefined)return;
    if(key==='$order'){
      if(!Array.isArray(parent))return;
      const ranks=new Map(value.map((id,i)=>[id,i]));parent.sort((a,b)=>(ranks.get(a.id)??value.length)-(ranks.get(b.id)??value.length));
    }else if(key.startsWith('@')&&Array.isArray(parent)){
      const i=parent.findIndex(v=>v.id===key.slice(1));
      if(!exists){if(i>=0)parent.splice(i,1);}else if(i>=0)parent[i]=C.clone(value);else parent.push(C.clone(value));
    }else if(exists)parent[key]=C.clone(value);else delete parent[key];
  }
  function undoConflicts(data,event){
    return event.patches.filter(p=>{
      const current=readPath(data,p.path);
      // Reordering can retain unrelated entries added by a teammate.
      if(p.path.at(-1)==='$order'&&Array.isArray(current))return !same(current.filter(id=>p.after.includes(id)),p.after.filter(id=>current.includes(id)));
      return p.afterExists? !same(current,p.after):current!==undefined;
    });
  }
  function recorded(op,actor,author,label,href,targets=[]){return {kind:'record',id:'change_'+crypto.randomUUID().replaceAll('-',''),actor,author,createdAt:new Date().toISOString(),label,href,targets,op};}
  function undoSnapshot(data,event){return event.patches.map(p=>{const value=readPath(data,p.path);return {path:p.path,exists:value!==undefined,value:value===undefined?null:C.clone(value)};});}
  function recoverableCreation(data,patch,at){
    if(patch.beforeExists||!patch.afterExists||!patch.path.at(-1).startsWith('@'))return false;
    const path=patch.path,entry=readPath(data,path);if(!entry)return false;
    if(path.length===2&&['assets','shots'].includes(path[0])){entry.archived=true;return true;}
    if(path.length===4&&path[2]==='tasks'){C.apply(data,{kind:'removeTask',group:path[0],id:path[1].slice(1),task:path[3].slice(1),at});return true;}
    if(['versions','images','comments','milestones','checks'].includes(path.at(-2))){entry.deletedAt=at;return true;}
    return false;
  }
  Object.assign(C,{differences,readPath,writePath,undoConflicts,undoSnapshot,recorded,recoverableCreation});
  if(typeof module!=='undefined'&&module.exports)module.exports=C;
})(typeof window!=='undefined'?window:globalThis);
