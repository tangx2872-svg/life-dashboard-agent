let productTaskFilter='todo';
const taskState=t=>t.done?'done':t.status==='doing'?'doing':'todo';
const taskDate=t=>t.dueDate||t.date||'';
let productFocusIds=()=>data.todayFocus?.date===today()?[...data.todayFocus.taskIds]:[];
const taskLate=t=>!t.done&&taskDate(t)&&taskDate(t)<today();
const priorityRank=t=>({high:0,normal:1,low:2})[t.priority]??1;

function productTaskSort(rows){
  return [...rows].sort((a,b)=>{
    const da=taskDate(a),db=taskDate(b);
    if(da&&db&&da!==db)return da.localeCompare(db);
    if(da&&!db)return -1;
    if(!da&&db)return 1;
    return priorityRank(a)-priorityRank(b);
  });
}
function productTaskGroup(t){
  if(t.done)return 'done';
  const d=taskDate(t);
  if(!d)return 'nodate';
  if(d<today())return 'overdue';
  if(d===today())return 'today';
  const end=new Date();end.setDate(end.getDate()+7);
  const edge=`${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
  return d<=edge?'week':'later';
}
const productGroupOrder=['overdue','today','week','later','nodate','done'];
const productGroupLabel={overdue:'已逾期',today:'今天',week:'接下来 7 天',later:'之后',nodate:'未安排日期',done:'已完成'};

function productTaskMeta(t){
  const p=project(t.projectId),d=taskDate(t),late=taskLate(t),subs=t.subtasks||[];
  const parts=[{text:p?.title||'日常任务'}];
  if(d)parts.push({text:late?`逾期 ${d}`:d===today()?'今天':d,cls:late?'is-overdue':''});
  if(t.time)parts.push({text:t.time});
  if(subs.length)parts.push({text:`子任务 ${subs.filter(s=>s.done).length}/${subs.length}`});
  if(!t.done&&t.status==='doing')parts.push({text:'进行中',cls:'is-doing'});
  if(t.estimatedTime)parts.push({text:t.estimatedTime});
  return `<div class="ui-meta">${parts.map(x=>`<span class="${x.cls||''}">${esc(x.text)}</span>`).join('')}</div>`;
}
function productTaskRow(t){
  const on=productFocusIds().includes(t.id),late=taskLate(t);
  return `<div class="product-row task-row ${t.done?'done':''}">
    <input type="checkbox" aria-label="完成 ${esc(t.title)}" ${t.done?'checked':''} onchange="productToggleTask('${t.id}',this.checked)">
    <div class="grow"><button class="link" onclick="productTaskForm('${t.id}')"><strong>${esc(t.title)}</strong></button>${productTaskMeta(t)}</div>
    ${t.priority==='high'&&!t.done?'<span class="rank high">高</span>':t.priority==='low'&&!t.done?'<span class="rank low">低</span>':''}
    ${t.done?`<span class="pill is-done">${t.completedAt?'完成 '+esc(t.completedAt.slice(5)):'已完成'}</span>`:`<button class="focus-toggle ${on?'is-on':''}" onclick="${on?`productUnfocus('${t.id}')`:`productFocus('${t.id}')`}" aria-label="${on?'移出今日':'加入今日'} ${esc(t.title)}" title="${on?'已加入今日，点击移出':'加入今日专注'}">${on?'★':'☆'}</button>`}
  </div>`;
}
function productTaskRows(rows,{grouped=false}={}){
  if(!rows.length)return '';
  if(!grouped)return rows.map(productTaskRow).join('');
  const buckets=new Map();
  for(const t of rows){const key=productTaskGroup(t);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(t)}
  return productGroupOrder.filter(k=>buckets.has(k)).map(k=>`<div class="group-head ${k==='overdue'?'overdue':''}">${productGroupLabel[k]}<span class="n">${buckets.get(k).length}</span></div>`+buckets.get(k).map(productTaskRow).join('')).join('');
}
function productTaskEmpty(title,note,withAction=true){
  return `<div class="ui-empty"><strong>${esc(title)}</strong><p>${esc(note)}</p>${withAction?'<div class="row-actions"><button class="primary" onclick="productTaskForm()">添加第一个任务</button><button onclick="productAsk()">✧ AI 整理</button></div>':''}</div>`;
}

function productToggleTask(id,done){return runDatabaseCommand(()=>{const t=data.tasks.find(t=>t.id===id);if(!t)return;if(done){if(t.done)return;completeTask(id);t.status='done'}else{if(!t.done)return;productRestoreTask(t);t.status='todo';save()}t.updatedAt=new Date().toISOString();if(done)save()})}
function productTaskForm(id='',pid=''){
  const t=data.tasks.find(t=>t.id===id)||{},old=t.subtasks||[];
  modal(id?'任务详情':'添加任务',field('title','任务名称',t.title||'','text',true)+area('description','描述',t.description||'')+`<div class="form-grid">`+select('status','状态',[['todo','待办'],['doing','进行中'],['done','已完成']],taskState(t))+select('priority','优先级',[['normal','普通'],['high','高'],['low','低']],t.priority||'normal')+field('dueDate','计划日期',taskDate(t),'date')+field('time','时间（可选）',t.time||'','time')+select('projectId','所属事项',[['','日常任务'],...data.projects.map(p=>[p.id,p.title])],t.projectId||pid)+select('phaseId','所属阶段',[['','未分配'],...data.projects.flatMap(p=>p.phases.map(s=>[s.id,p.title+' / '+s.title]))],t.phaseId||'')+field('estimatedTime','预计时间',t.estimatedTime||'')+field('tags','标签',t.tags||'')+'</div>'+area('subtasks','子任务（每行一项；保留原有勾选）',old.map(s=>s.title).join('\n'))+(old.length?'<fieldset><legend>子任务完成情况</legend>'+old.map((s,i)=>`<label><input type="checkbox" name="subdone_${i}" style="display:inline;width:auto" ${s.done?'checked':''}> ${esc(s.title)}</label>`).join('')+'</fieldset>':'')+`<p class="product-hint">来源：${esc(t.source||'手动记录')}${t.createdAt?' · 创建于 '+esc(t.createdAt.slice(0,10)):''}</p>`+(id&&t.projectId?`<div class="row-actions"><button type="button" onclick="moveProjectTask('${t.projectId}','${id}',-1)">← 提前一步</button><button type="button" onclick="moveProjectTask('${t.projectId}','${id}',1)">延后一步 →</button></div>`:'')+(id?`<button type="button" class="danger" onclick="productDelete('task','${id}')">删除任务</button>`:''),f=>{
    const wasDone=!!t.done;
    Object.assign(t,{title:f.title.trim(),description:f.description,status:f.status,priority:f.priority,dueDate:f.dueDate,date:f.dueDate,time:f.time,projectId:f.projectId,estimatedTime:f.estimatedTime,tags:f.tags,updatedAt:new Date().toISOString()});
    t.phaseId=project(f.projectId)?.phases.some(s=>s.id===f.phaseId)?f.phaseId:'';
    const used=new Set();t.subtasks=f.subtasks.split('\n').map(s=>s.trim()).filter(Boolean).map(title=>{const i=old.findIndex((s,j)=>s.title===title&&!used.has(j));if(i>=0){used.add(i);return {...old[i],done:f['subdone_'+i]==='on'}}return {title,done:false}});
    if(!id){t.id=uid();t.done=false;t.createdAt=t.updatedAt;t.source='manual';data.tasks.push(t)}
    if(f.status==='done'&&!wasDone)completeTask(t.id);else if(f.status!=='done'&&wasDone){productRestoreTask(t);t.status=f.status}
    save();toast('任务已保存');
  });document.getElementById('modal').classList.add('product-drawer');
}
function productFocus(id){return runDatabaseCommand(()=>{if(!data.todayFocus||data.todayFocus.date!==today())data.todayFocus={date:today(),taskIds:[]};const ids=data.todayFocus.taskIds;if(ids.includes(id)){toast('已在今日专注中');return}if(ids.length>=4){toast('今天最多安排 4 件事，请先移除一项。');return}ids.push(id);save();toast('已加入今日专注')})}
function productUnfocus(id){return runDatabaseCommand(()=>{if(data.todayFocus?.date===today()){data.todayFocus.taskIds=data.todayFocus.taskIds.filter(x=>x!==id);save()}})}
function productFocused(){return productFocusIds().map(id=>data.tasks.find(t=>t.id===id)).filter(Boolean)}
function productFocusPicker(){
  const ids=productFocusIds(),rows=productTaskSort(data.tasks.filter(t=>!t.done));
  modal('安排今天的专注任务',`<p class="product-hint">最多四项。第一项未完成的会作为今天的主要行动。未勾选的会从今日专注移除。</p><div class="focus-picker">${rows.map(t=>`<label><input type="checkbox" data-task="${t.id}" ${ids.includes(t.id)?'checked':''}><span>${esc(t.title)}<small>${esc(project(t.projectId)?.title||'日常任务')}${taskDate(t)?' · '+esc(taskDate(t)):''}</small></span></label>`).join('')||'<p class="product-hint">还没有待办任务。先添加一个任务吧。</p>'}</div>`,()=>{
    const picked=[...document.querySelectorAll('#fields input[data-task]:checked')].map(x=>x.dataset.task);
    if(picked.length>4)throw Error('今日专注最多四项，请先取消一些');
    data.todayFocus={date:today(),taskIds:picked};save();toast(picked.length?`今天安排了 ${picked.length} 项`:'已清空今天的安排');
  });
}
function productTasksPage(){
  const counts={todo:0,doing:0,done:0,all:data.tasks.length};
  for(const t of data.tasks){const s=taskState(t);if(s in counts)counts[s]++}
  const rows=data.tasks.filter(t=>productTaskFilter==='all'||taskState(t)===productTaskFilter);
  const late=rows.filter(taskLate).length;
  return heading('任务','把下一步写清楚，然后一件件完成。','<button class="primary" onclick="productTaskForm()">＋ 添加任务</button>')
    +`<div class="product-tabs">${[['todo','待办'],['doing','进行中'],['done','已完成'],['all','全部']].map(([v,n])=>`<button class="${productTaskFilter===v?'active':''}" onclick="productTaskFilter='${v}';render()">${n} ${counts[v]}</button>`).join('')}</div>`
    +(late?`<p class="product-hint">有 ${late} 项已过期。可以重新安排日期，或先挑一件现在就能开始的。</p>`:'')
    +`<section class="product-panel">${rows.length?productTaskRows(productTaskSort(rows),{grouped:productTaskFilter!=='done'}):productTaskEmpty(productTaskFilter==='done'?'还没有完成的任务':'这个分类暂时是空的',productTaskFilter==='done'?'完成一件小事，这里就会留下记录。':'可以先添加一个十到二十分钟就能完成的小任务。',productTaskFilter!=='done')}</section>`;
}
function productConfirm(title,message,action){document.querySelectorAll('.product-confirm:not([open])').forEach(x=>x.remove());if(document.querySelector('.product-confirm[open]'))return;const d=document.createElement('dialog');d.className='product-confirm';d.innerHTML=`<h2>${esc(title)}</h2><p>${esc(message)}</p><div class="row-actions"><button data-cancel>取消</button><button class="primary" data-confirm>确认</button></div>`;document.body.append(d);d.querySelector('[data-cancel]').onclick=()=>{d.close();d.remove()};d.addEventListener('close',()=>d.remove());d.querySelector('[data-confirm]').onclick=async()=>{d.querySelector('[data-confirm]').disabled=true;try{await action();d.close()}catch(e){toast(e.message);d.querySelector('[data-confirm]').disabled=false}};d.showModal()}
function productDelete(kind,id,parent=''){
  let plan;try{plan=prepareDeletion(data,kind,id,parent)}catch(e){return toast(e.message)}
  productConfirm('删除 '+plan.title,`包含 ${plan.stageCount} 个阶段、${plan.taskCount} 个任务。关联内容一并删除，完成历史保留；操作前状态自动保存为快照。`,async()=>{
    const result=await runDatabaseCommand(()=>{const current=prepareDeletion(data,kind,id,parent);safetyCheckpoint('删除前自动备份');data=current.value;persistData(data);if(kind==='project')page='projects';toast('已删除。数据管理中可下载操作前快照。')});if(result?.ok)closeModal();
  });
}
// Reset drawer style for all legacy forms as well.
const productBaseModal=modal;modal=function(...args){document.getElementById('modal').classList.remove('product-drawer');return productBaseModal(...args)};

function productRestoreTask(t){t.done=false;t.status='todo';delete t.completedAt;(t.subtasks||[]).forEach((s,i)=>s.done=t.beforeCompletion?.[i]?.title===s.title?!!t.beforeCompletion[i].done:false);delete t.beforeCompletion;data.history=data.history.filter(h=>h.taskId!==t.id);}
