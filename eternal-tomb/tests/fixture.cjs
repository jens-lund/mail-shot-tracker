const fs=require('node:fs');
const path=require('node:path');
// Shared production JSON changes through the website. Tests start from a neutral
// copy and never rewrite the team's actual tasks, images or feedback.
module.exports=()=>{
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/project.json'),'utf8'));
  for(const group of ['assets','shots'])for(const item of data[group]){
    item.tasks=item.tasks.filter(task=>!task.id.startsWith('task_'));
    delete item.priority;delete item.removedTaskIds;delete item.archived;delete item.duration;delete item.camera;
    item.due='';item.owner='';item.blocked=false;
    for(const task of item.tasks){task.status='todo';for(const key of ['due','effort','priority','owner','images','comments'])delete task[key];}
    for(const version of item.versions||[])delete version.deletedAt;
  }
  return data;
};
