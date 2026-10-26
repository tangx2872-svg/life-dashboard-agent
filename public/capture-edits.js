// Version 2 changes are compiled on a copy; nothing is saved during preview.
function captureEdit(d,item){
  const fail=message=>{throw Error(message)},keys=item.op==='update'?['op','kind','id','expectedTitle','changes','index']:['op','kind','id','expectedTitle','index'];
  for(const k of Object.keys(item))if(!keys.includes(k))fail('修改 / 删除不支持字段：'+k);
  if(typeof item.id!=='string'||!item.id||typeof item.expectedTitle!=='string'||!item.expectedTitle)fail('修改 / 删除必须提供准确 id 和 expectedTitle，请重新复制目录给 GPT。');
  let record,parent='',siblings=[],deletionKind=item.kind;
  if(item.kind==='project'||item.kind==='roadmap'){siblings=item.kind==='project'?d.projects:d.roadmaps;record=siblings.find(x=>x.id===item.id)}
  else if(item.kind==='project_stage'||item.kind==='roadmap_stage'){
    const road=item.kind==='roadmap_stage',owner=(road?d.roadmaps:d.projects).find(p=>p.phases.some(s=>s.id===item.id));
    parent=owner?.id;siblings=owner?.phases||[];record=siblings.find(s=>s.id===item.id);deletionKind=road?'roadmapStage':'projectStage';
  }else if(item.kind==='task'||item.kind==='subtask'){
    const task=d.tasks.find(t=>t.id===item.id);record=task;
    if(item.kind==='subtask'){if(!Number.isInteger(item.index)||item.index<0)fail('子任务 index 必须是目录中的整数序号。');siblings=task?.subtasks||[];record=siblings[item.index]}
    else siblings=d.tasks.filter(t=>t.projectId===task?.projectId&&t.phaseId===task?.phaseId);
  }else if(item.kind==='learning_task'){
    const owner=d.roadmaps.find(r=>r.phases.some(s=>s.tasks.some(t=>t.id===item.id)));parent=owner?.id;
    siblings=owner?.phases.find(s=>s.tasks.some(t=>t.id===item.id))?.tasks||[];record=siblings.find(t=>t.id===item.id);deletionKind='learningTask';
  }else fail('修改 / 删除仅支持事项、路线、阶段、任务和子任务。');
  if(!record)fail('找不到目标 ID：'+item.id+'，请使用最新目录。');
  if(record.title!==item.expectedTitle)fail('目标名称已变化：'+item.expectedTitle+'，当前为 '+record.title+'。请重新复制目录。');
  if(item.kind!=='subtask'&&item.index!==undefined)fail('index 仅用于子任务。');
  const title=record.title,context='ID：'+item.id+(parent?'\n所属 ID：'+parent:'');
  if(item.op==='delete'){
    if(item.kind==='subtask'){siblings.splice(item.index,1);return {value:d,title,detail:context+'\n删除子任务：'+title+'（'+(record.done?'已完成':'未完成')+'）。父任务完成状态和历史记录保留。'}}
    const plan=prepareDeletion(d,deletionKind,item.id,parent);
    return {value:plan.value,title,detail:context+'\n删除 '+plan.stageCount+' 个阶段、'+plan.taskCount+' 个任务，包含其子任务和笔记；关联计划节点一并移除。已完成历史保留。'};
  }
  const allowed={project:['title','description','category','icon','start','target'],roadmap:['title','goal','category','icon'],project_stage:['title'],roadmap_stage:['title'],task:['title'],subtask:['title'],learning_task:['title','goal','estimate','criteria','milestone']}[item.kind];
  const changes=item.changes;if(!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length)fail('changes 必须包含需要修改的字段。');
  const differences=[];
  for(const [key,value] of Object.entries(changes)){
    if(!allowed.includes(key))fail('不允许修改字段：'+key+'。完成状态、笔记和 ID 会自动保留。');
    if(key==='milestone'){if(typeof value!=='boolean')fail('milestone 必须为布尔值。')}
    else if(key==='criteria'){if(!Array.isArray(value)||value.length>30||value.some(x=>typeof x!=='string'||!x.trim()||x.length>2000))fail('criteria 必须是最多 30 条文字条件。')}
    else {if(typeof value!=='string'||value.length>(key==='title'?300:20000))fail(key+' 文字格式或长度错误。');if(['title','category'].includes(key)&&!value.trim())fail(key+' 不能为空。');}
    if(['start','target'].includes(key)&&value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value))fail('日期必须是有效 YYYY-MM-DD。');
    const next=typeof value==='string'?value.trim():value;
    if(key==='title'&&siblings.some(x=>x!==record&&normalizedName(x.title)===normalizedName(next)))fail('修改后存在同级同名内容，请核对名称。');
    differences.push(key+'：'+JSON.stringify(record[key]??'')+' → '+JSON.stringify(next));record[key]=next;
    if(key==='category'&&!d.categories.includes(next))d.categories.push(next);
  }
  if(item.kind==='project'&&record.start&&record.target&&record.target<record.start)fail('目标日期不能早于开始日期。');
  return {value:d,title,detail:context+'\n'+differences.join('\n')+'\n未指定字段、完成状态、学习记录和排列顺序保留。'};
}
