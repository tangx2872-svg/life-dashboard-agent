// Unified operations write back to each legacy source. Opening a page never migrates data.
const simpleOldDelete=productDelete;
function simpleTaskLocation(key){
 const t=simpleTask(key);if(!t)return null;
 if(t.kind==='task')return {t,list:data.tasks,index:data.tasks.findIndex(x=>x.id===t.id)};
 if(t.kind==='event')return {t,list:data.events,index:data.events.findIndex(x=>x.id===t.id)};
 if(t.kind==='learning')return {t,list:t.stage.tasks,index:t.stage.tasks.findIndex(x=>x.id===t.id)};
 return {t,list:t.parent.steps,index:t.parent.steps.findIndex(x=>x.id===t.id)};
}
productToggleTask=function(key,done){return runDatabaseCommand(()=>{
 const t=simpleTask(key);if(!t||!!t.done===done)return;
 const beforeIds=new Set(data.history.map(h=>h.id));
 if(t.kind==='task'){if(done)completeTask(t.id);else productRestoreTask(t.ref)}
 else if(t.kind==='learning')toggleLearning(t.parent.id,t.id,done);
 else if(t.kind==='event'){if(done)finishEvent(t.id);else{t.ref.done=false;delete t.ref.completedAt}}
 else{t.ref.done=done;if(done){t.ref.completedAt=today();data.history.unshift({id:uid(),title:t.title,date:today(),type:'任务',projectTitle:t.parent.title,projectKey:t.projectKey,unifiedTaskKey:key})}else delete t.ref.completedAt;}
 t.ref.status=done?'done':'todo';t.ref.updatedAt=new Date().toISOString();
 if(done){for(const h of data.history)if(!beforeIds.has(h.id)){h.unifiedTaskKey=key;h.projectKey=t.projectKey;h.projectTitle=simpleProject(t.projectKey)?.title||'无项目'}}
 else data.history=data.history.filter(h=>h.unifiedTaskKey!==key);
 save();toast(done?'已完成，记录已留在「记录」':'已恢复到待办');
})};
productFocusIds=function(){return simpleTasks().filter(t=>simpleScheduled(t)===today()).map(t=>t.key)};
productFocused=function(){return simpleTasks().filter(t=>simpleScheduled(t)===today())};
productFocus=function(key){return runDatabaseCommand(()=>{const t=simpleTask(key);if(!t)return;t.ref.scheduledDate=today();save();toast('已安排到今天');simpleAnnounce([{kind:'task',key,title:t.title,label:'任务',destination:'今日'}])})};
productUnfocus=function(key){return runDatabaseCommand(()=>{const t=simpleTask(key);if(!t)return;const previous=simpleScheduled(t);t.ref.scheduledDate='';save();toast('已移出今天，任务仍保留');simpleSetUndo('移出今天',()=>{const current=simpleTask(key);if(!current)throw Error('任务已不存在');if(simpleScheduled(current))throw Error('任务已重新安排，未覆盖新安排');current.ref.scheduledDate=previous})})};
productFocusPicker=function(){const rows=productTaskSort(simpleTasks().filter(t=>!t.done));modal('安排今天',`<p>选择今天准备做的任务。首页只突出前四项。</p><div class="focus-picker">${rows.map(t=>`<label><input type="checkbox" data-task="${t.key}" ${simpleScheduled(t)===today()?'checked':''}><span>${esc(t.title)}<small>${esc(simpleProject(t.projectKey)?.title||'无项目')}</small></span></label>`).join('')}</div>`,()=>{const picked=new Set([...document.querySelectorAll('#fields input[data-task]:checked')].map(x=>x.dataset.task));for(const t of simpleTasks().filter(t=>!t.done)){if(picked.has(t.key))t.ref.scheduledDate=today();else if(simpleScheduled(t)===today())t.ref.scheduledDate=''}save();toast(`已安排 ${picked.size} 项到今天`)})};
productTaskMeta=function(t){return `<div class="ui-meta"><span>${esc(simpleProject(t.projectKey||t.projectId)?.title||'无项目')}</span>${taskDate(t)?`<span class="${taskLate(t)?'is-overdue':''}">${esc(taskLate(t)?'逾期 '+taskDate(t):simpleDateLabel(taskDate(t)))}</span>`:''}${t.time?`<span>${esc(t.time)}</span>`:''}${simpleScheduled(t)===today()?'<span>已安排今天</span>':''}${t.subtasks?.length?`<span>子任务 ${t.subtasks.filter(s=>s.done).length}/${t.subtasks.length}</span>`:''}</div>`};
productTaskRow=function(t){const key=t.key||t.id,on=simpleScheduled(t)===today();return `<div class="product-row task-row ${t.done?'done':''}" data-task-key="${key}"><input type="checkbox" aria-label="完成 ${esc(t.title)}" ${t.done?'checked':''} onchange="productToggleTask('${key}',this.checked)"><div class="grow"><button class="link" onclick="productTaskForm('${key}')"><strong>${esc(t.title)}</strong></button>${productTaskMeta(t)}</div>${t.priority==='high'?'<span class="rank high">高</span>':''}${!t.done?`<button class="focus-toggle ${on?'is-on':''}" aria-label="${on?'移出今日':'加入今日'} ${esc(t.title)}" onclick="${on?'productUnfocus':'productFocus'}('${key}')">${on?'★':'☆'}</button>`:''}</div>`};
productTasksPage=function(){const all=simpleTasks(),rows=all.filter(t=>productTaskFilter==='all'||productTaskFilter==='today'&&simpleScheduled(t)===today()||taskState(t)===productTaskFilter);return heading('任务','下一步要做的事情。','<button onclick="productTaskForm()">＋ 添加任务</button>')+`<div class="product-tabs">${[['today','今天'],['todo','待办'],['doing','进行中'],['done','已完成'],['all','全部']].map(([v,n])=>`<button class="${v===productTaskFilter?'active':''}" onclick="productTaskFilter='${v}';render()">${n} ${all.filter(t=>v==='all'||v==='today'&&simpleScheduled(t)===today()||taskState(t)===v).length}</button>`).join('')}</div><section class="simple-list">${rows.length?productTaskRows(productTaskSort(rows),{grouped:productTaskFilter!=='done'}):productTaskEmpty('这里还没有任务','直接写下一件要做的事，或用快速记录说出来。')}</section>`};
productTaskForm=function(key='',pid=''){
 const task=key?simpleTask(key):null;if(key&&!task)return toast('任务不存在');const t=task?.ref||{},view=task||{},old=t.subtasks||[],projectKey=view.projectKey||pid;
 modal(key?'任务详情':'添加任务',field('title','任务名称',t.title||'','text',true)+`<details ${key?'open':''}><summary>更多选项</summary>`+area('description','备注',view.description||t.description||'')+select('projectKey','项目',simpleProjectOptions(),projectKey)+`<p class="product-hint">${['learning','step'].includes(view.kind)?'原有任务保留在原项目中，项目归属只读。':''}</p>`+field('scheduledDate','安排日期',task?simpleScheduled(task):'','date')+field('dueDate','截止 / 日程日期',taskDate(view),'date')+field('time','时间',t.time||'','time')+select('status','状态',[['todo','待办'],['doing','进行中'],['done','已完成']],taskState(view))+select('priority','优先级',[['normal','普通'],['high','高'],['low','低']],t.priority||'normal')+field('estimatedTime','预计时间',t.estimatedTime||view.estimatedTime||'')+field('tags','标签',t.tags||'')+area('subtasks','子任务（每行一项）',old.map(s=>s.title).join('\n'))+(old.length?old.map((s,i)=>`<label><input type="checkbox" name="subdone_${i}" style="display:inline;width:auto" ${s.done?'checked':''}> ${esc(s.title)}</label>`).join(''):'')+'</details>'+(key?`<button type="button" class="danger" onclick="productDelete('task','${key}')">删除任务</button>`:''),f=>{
  if(f.projectKey&&!simpleProject(f.projectKey))throw Error('项目已不存在，请重新选择');
  if(task&&['learning','step'].includes(task.kind)&&f.projectKey!==projectKey)throw Error('原有任务需保留在原项目中');
  let current=key?simpleTask(key):null;
  if(!current){const created=simpleNewTask(f.title.trim(),f.projectKey);current=simpleTask(created.id)}
  const r=current.ref,wasDone=!!r.done;r.title=f.title.trim();
  if(current.kind==='learning')r.goal=f.description;else if(current.kind==='step')r.content=f.description;else r.description=f.description;
  r.scheduledDate=f.scheduledDate;r.dueDate=f.dueDate;r.date=f.dueDate;r.time=f.time;r.priority=f.priority;r.estimatedTime=f.estimatedTime;r.tags=f.tags;r.updatedAt=new Date().toISOString();
  if(['task','event'].includes(current.kind))simpleAssign(current,f.projectKey);
  if(current.kind==='task'){const used=new Set();r.subtasks=f.subtasks.split('\n').map(s=>s.trim()).filter(Boolean).map(title=>{const i=old.findIndex((s,j)=>s.title===title&&!used.has(j));if(i>=0){used.add(i);return {...old[i],done:f['subdone_'+i]==='on'}}return {title,done:false}})}
  if(page==='tasks')productTaskFilter=f.status;
  if(wasDone!==(f.status==='done'))productToggleTask(current.key,f.status==='done');r.status=f.status;
  save();simpleAnnounce([{kind:'task',key:current.key,title:r.title,label:'任务',destination:simpleProject(f.projectKey)?.title||'任务 · 无项目'}]);toast('已保存任务，可在保存结果中查看');
 });if(task&&['learning','step'].includes(task.kind)){document.querySelector('#form [name=projectKey]').disabled=true;document.getElementById('fields').insertAdjacentHTML('beforeend',`<input type="hidden" name="projectKey" value="${esc(projectKey)}">`);}document.getElementById('modal').classList.add('product-drawer');
};
function simpleProjectForm(key=''){
 const p=key?simpleProject(key):null;modal(key?'编辑项目':'新建项目',field('title','项目名称',p?.title||'','text',true)+area('goal','一句话目标',p?.description||'')+`<details><summary>更多选项</summary>`+select('status','状态',statuses,p?.status||'进行中')+field('target','目标日期',p?.target||'','date')+'</details>',f=>{
  const title=f.title.trim();let current=p;
  if(!current&&simpleProjects().some(x=>normalizedName(x.title)===normalizedName(title)))throw Error('已有同名项目，请先查看现有项目，避免重复');
  if(!current){const created=simpleNewProject(title,f.goal);current=simpleProject(created.id)}
  current.ref.title=title;current.ref[current.kind==='project'?'description':'goal']=f.goal;current.ref.status=f.status;current.ref.target=f.target;
  if(p)simpleNewRecord('更新项目：'+title,'项目内容已更新',current.key,{type:'project'});
  save();simpleAnnounce([{kind:'project',key:current.key,title,label:'项目',destination:'项目'}]);toast('项目已保存');
 });
}
function simpleDateLabel(date){if(!date)return '';const days=Math.round((new Date(date+'T12:00:00')-new Date(today()+'T12:00:00'))/86400000);return days===0?'今天':days===1?'明天':days===-1?'昨天':days>1&&days<8?days+'天后':date}
function simpleRecordForm(projectKey=''){modal('添加记录',area('content','值得留下的事情','')+select('projectKey','项目',simpleProjectOptions(),projectKey),f=>{if(!f.content.trim())throw Error('请写下内容');const r=simpleNewRecord(f.content.trim(),'',f.projectKey);save();simpleAnnounce([{kind:'record',key:r.id,title:r.title,label:'记录',destination:simpleProject(f.projectKey)?simpleProject(f.projectKey).title+' · 记录':'记录'}]);toast('已添加记录')})}
async function simpleDeleteTask(key){
 const location=simpleTaskLocation(key);if(!location)return;const snapshot=JSON.parse(JSON.stringify(location.t.ref)),index=location.index,parentKey=location.t.projectKey,kind=location.t.kind;
 const result=await runDatabaseCommand(()=>{
  const fresh=simpleTaskLocation(key);if(!fresh)return;fresh.list.splice(fresh.index,1);
  const affected=data.history.filter(h=>h.taskId===snapshot.id||h.learningTaskId===snapshot.id||h.unifiedTaskKey===key).map(h=>({...h}));
  for(const h of data.history)if(affected.some(x=>x.id===h.id)){h.taskId='';h.learningTaskId='';h.unifiedTaskKey='';h.sourceDeleted=true}
  save();toast('已删除任务');
  simpleSetUndo('删除任务',()=>{
   if(simpleTask(key))throw Error('该任务已存在，未重复恢复');if(parentKey&&!simpleProject(parentKey))throw Error('原项目已删除，不能恢复到已不存在的项目');
   let list;if(kind==='task')list=data.tasks;else if(kind==='event')list=data.events;else if(kind==='step')list=simpleProject(parentKey).ref.steps;else{const stage=simpleProject(parentKey).ref.phases.find(s=>s.id===location.t.stage.id);if(!stage)throw Error('原阶段已删除');list=stage.tasks}
   if(kind==='task'&&snapshot.phaseId&&!project(snapshot.projectId)?.phases.some(s=>s.id===snapshot.phaseId))snapshot.phaseId='';
   list.splice(Math.min(index,list.length),0,snapshot);
   for(const old of affected){const h=data.history.find(x=>x.id===old.id);if(h?.sourceDeleted){for(const field of ['taskId','learningTaskId','unifiedTaskKey','sourceDeleted']){if(Object.hasOwn(old,field))h[field]=old[field];else delete h[field]}}}
  });
 });if(result?.ok)closeModal();return result;
}
productDelete=function(kind,key,parent=''){if(kind==='task')return simpleDeleteTask(key);if(kind==='project'&&simpleProject(key)?.kind!=='project')return simpleDeleteLegacyProject(key);return simpleOldDelete(kind,key,parent)};
function simpleDeleteLegacyProject(key){const p=simpleProject(key);if(!p)return;const tasks=simpleTasks().filter(t=>t.projectKey===key);productConfirm('删除项目「'+p.title+'」',`包含 ${tasks.length} 个任务及其原有步骤和记录。删除前会自动保留快照。`,()=>runDatabaseCommand(()=>{if(p.kind==='roadmap')data.roadmaps=data.roadmaps.filter(r=>r.id!==p.id);else data.experiments=data.experiments.filter(e=>e.id!==p.id);data.tasks=data.tasks.filter(t=>t.projectKey!==key);for(const h of data.history)if(h.projectKey===key||h.roadmapId===p.id){h.projectKey='';h.roadmapId='';h.sourceDeleted=true}for(const r of data.records||[])if(r.projectKey===key){r.projectTitle=p.title;r.projectKey=''}save();page='projects';toast('已删除项目；操作前状态可在设置下载')}) )}
