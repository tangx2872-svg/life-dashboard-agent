// Non-destructive projections. Virtual keys are view identifiers, never replacement database IDs.
function simpleProjects(){
 return [
  ...data.projects.map(p=>({...p,key:p.id,kind:'project',ref:p})),
  ...(data.roadmaps||[]).map(r=>({key:'route:'+r.id,id:r.id,kind:'roadmap',title:r.title,description:r.goal,status:r.status||'进行中',category:r.category||'',target:r.target||'',ref:r})),
  ...(data.experiments||[]).map(e=>({key:'experiment:'+e.id,id:e.id,kind:'experiment',title:e.title,description:e.goal,status:e.status||'进行中',category:'',target:'',ref:e}))
 ];
}
const simpleProject=key=>simpleProjects().find(p=>p.key===key);
function simpleTasks(){
 const rows=data.tasks.map(t=>({...t,key:t.id,kind:'task',projectKey:t.projectKey||t.projectId||'',ref:t}));
 for(const r of data.roadmaps||[])for(const s of r.phases)for(const t of s.tasks)rows.push({...t,key:'learn:'+t.id,kind:'learning',projectKey:'route:'+r.id,description:t.goal,estimatedTime:t.estimate,ref:t,stage:s,parent:r});
 for(const e of data.experiments||[])for(const s of e.steps)rows.push({...s,key:'step:'+s.id,kind:'step',projectKey:'experiment:'+e.id,done:!!s.done,description:s.content,ref:s,parent:e});
 for(const e of data.events)rows.push({...e,key:'event:'+e.id,kind:'event',projectKey:e.projectId||'',done:!!e.done,ref:e});
 return rows;
}
const simpleTask=key=>simpleTasks().find(t=>t.key===key);
function simpleScheduled(t){
 const ref=t.ref||t;if(Object.hasOwn(ref,'scheduledDate'))return ref.scheduledDate;
 return data.todayFocus?.date===today()&&data.todayFocus.taskIds.includes(t.key||t.id)?today():'';
}
function simpleAssign(t,key){
 if(t.kind==='task'){
  t.ref.projectId=simpleProject(key)?.kind==='project'?key:'';
  if(key&&simpleProject(key)?.kind!=='project')t.ref.projectKey=key;else delete t.ref.projectKey;
  if(!project(t.ref.projectId)?.phases.some(s=>s.id===t.ref.phaseId))t.ref.phaseId='';
 }else if(t.kind==='event')t.ref.projectId=key;
 // Nested legacy tasks stay in their original parent; moving them needs an explicit structural migration.
}
function simpleNewTask(title,projectKey='',extra={}){
 const now=new Date().toISOString(),t={id:uid(),title,projectId:simpleProject(projectKey)?.kind==='project'?projectKey:'',phaseId:'',done:false,subtasks:[],status:'todo',priority:'normal',createdAt:now,updatedAt:now,...extra};
 if(projectKey&&simpleProject(projectKey)?.kind!=='project')t.projectKey=projectKey;
 data.tasks.push(t);return t;
}
function simpleNewProject(title,goal=''){
 const p={id:uid(),title,description:goal,status:'进行中',category:'其他',icon:'🌱',mode:'auto',manual:0,start:today(),target:'',phases:[],notes:[],createdAt:new Date().toISOString()};data.projects.push(p);return p;
}
function simpleNewRecord(title,content='',projectKey='',extra={}){
 const r={id:uid(),title,content,date:today(),createdAt:new Date().toISOString(),projectKey,type:'record',...extra};(data.records??=[]).push(r);return r;
}
function simpleRecords(){
 const rows=(data.records||[]).map(r=>({...r,key:r.id,recordType:r.type||'record',projectKey:r.projectKey||r.projectId||''}));
 for(const h of data.history)rows.push({...h,key:'history:'+h.id,recordType:h.type==='项目变化'?'project':'complete',content:h.content||'',projectKey:h.projectKey||(h.roadmapId?'route:'+h.roadmapId:h.projectId||''),projectTitle:h.projectTitle||''});
 for(const p of data.projects)for(const [i,n] of p.notes.entries())rows.push({key:'note:'+p.id+':'+(n.id||i),title:n.text,content:'',date:n.date,projectKey:p.id,recordType:'record'});
 for(const r of data.roadmaps||[])for(const s of r.phases)for(const t of s.tasks)for(const [i,n] of (t.notes||[]).entries())rows.push({key:'learning-note:'+t.id+':'+(n.id||i),title:n.text,content:t.title,date:n.date,projectKey:'route:'+r.id,recordType:'record'});
 for(const e of data.experiments||[]){
  for(const field of ['result','supplement'])if(e[field])rows.push({key:e.id+':'+field,title:e.title+(field==='result'?' · 结果':' · 补充'),content:e[field],date:e.updatedAt||e.createdAt,projectKey:'experiment:'+e.id,recordType:'record'});
  for(const s of e.steps)for(const field of ['result','supplement'])if(s[field])rows.push({key:s.id+':'+field,title:s.title+(field==='result'?' · 结果':' · 补充'),content:s[field],date:e.updatedAt||e.createdAt,projectKey:'experiment:'+e.id,recordType:'record'});
 }
 return rows.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}
function simpleProjectOptions(){return [['','暂不归类'],...simpleProjects().map(p=>[p.key,p.title])];}
function simpleRecommendProject(text){
 const normalized=String(text).toLowerCase();
 const groups=[['论文','摘要','baseline','beta','doll','实验'],['六级','cet-6','cet6','英语'],['fastapi'],['健身','减脂','运动']];
 const scores=simpleProjects().map(p=>{
  const title=p.title.toLowerCase();let score=normalized.includes(title)&&title.length>1?10:0;
  for(const words of groups)if(words.some(w=>normalized.includes(w))&&words.some(w=>title.includes(w)))score+=3;
  for(const token of title.match(/[a-z][a-z0-9-]{2,}/g)||[])if(normalized.includes(token))score+=5;
  return {p,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 return scores.length&&(scores.length===1||scores[0].score>scores[1].score)?scores[0].p.key:'';
}
let simpleReceipt=null,simpleUndo=null;
function simpleAnnounce(items){storageState.pendingReceipt=items;}
function simpleReceiptHTML(){if(!simpleReceipt?.length)return '';return `<section class="save-receipt" role="status"><div><strong>✓ 已保存 ${simpleReceipt.length} 项</strong><button class="link" onclick="simpleReceipt=null;render()" aria-label="关闭保存结果">✕</button></div>${simpleReceipt.map((x,i)=>`<div><span>${esc(x.label)}：${esc(x.title)}<small>已添加到「${esc(x.destination)}」</small></span><button onclick="simpleOpenReceipt(${i})">查看</button></div>`).join('')}</section>`;}
function simpleOpenReceipt(i){const x=simpleReceipt?.[i];if(!x)return;if(x.kind==='task'){nav('tasks');productTaskFilter='all';productTaskForm(x.key)}else if(x.kind==='project')openProject(x.key);else{simpleRecordQuery=x.title;simpleRecordFilter='all';simpleRecordProject='';nav('records')}}
function simpleSetUndo(label,action){if(storageState.command)storageState.pendingUndo={label,action};else simpleUndo={label,action};}
async function simpleDoUndo(){const entry=simpleUndo;if(!entry)return;const result=await runDatabaseCommand(()=>{entry.action();save();toast('已撤销'+entry.label)});if(result?.ok&&simpleUndo===entry){simpleUndo=null;render()}}
