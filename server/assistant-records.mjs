// Reuse trusted, existing capture rules. Only application code enters this VM.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { validate } from './schema.mjs';
import { HttpError } from './store.mjs';
const source=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const rules=vm.createContext({uid:randomUUID,today:()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),assertDashboardData:validate,validData:d=>{validate(d);return true},normalizedName:v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()});
vm.runInContext(source('data-management.js').split('function prepareDeletion(')[1].split('function deleteManaged(')[0].replace(/^/,'function prepareDeletion('),rules);
vm.runInContext(source('capture-edits.js'),rules);
vm.runInContext(source('experiments.js').split('function openExperiment(')[0],rules);
vm.runInContext(source('gpt-import.js').split('function sortedJson(')[1].split('const captureLabels=')[0].replace(/^/,'function sortedJson('),rules);
export function compileItems(base,items){
 const result=rules.compileCapture({format:'life-dashboard.capture',version:2,batchId:randomUUID(),items},base);
 if(result.duplicates.length)throw new HttpError(422,'同类型已有同名内容，请选择已有内容或更换名称。');
 // Assistant requests have their own idempotency key; do not accumulate import batches per operation.
 if(base.captureBatches===undefined)delete result.candidate.captureBatches;else result.candidate.captureBatches=structuredClone(base.captureBatches);
 return structuredClone(result);
}
export const recordFields={project:['title','description','category','icon','start','target'],roadmap:['title','goal','category','icon'],project_stage:['title'],roadmap_stage:['title'],task:['title'],subtask:['title'],learning_task:['title','goal','estimate','criteria','milestone'],note:['text'],event:['title','date']};
export function recordScope(data,scope){
 const match=/^(project|roadmap):([a-zA-Z0-9_-]+)$/.exec(scope),type=match?.[1]||(scope==='new-project'?'project':scope==='new-roadmap'?'roadmap':null);
 if(!type)return null;
 const isNew=scope==='new-'+type,record=isNew?null:(data[type==='project'?'projects':'roadmaps']||[]).find(x=>x.id===match[2]);
 if(!isNew&&!record)throw new HttpError(404,'所选事项或路线已不存在，请重新选择。');
 return {type,isNew,record};
}
export function scopeContext(data,scope){
 const selected=recordScope(data,scope);if(!selected)return null;
 const {type,record}=selected;
 return {...selected,tasks:type==='project'&&record?data.tasks.filter(t=>t.projectId===record.id):[],events:type==='project'&&record?data.events.filter(e=>e.projectId===record.id):[]};
}
function locate(d,parent,kind,id,index){
 if(!parent)return null;
 if(kind==='project'||kind==='roadmap')return parent.id===id?parent:null;
 if(kind.endsWith('_stage'))return parent.phases.find(s=>s.id===id);
 if(kind==='learning_task')return parent.phases.flatMap(s=>s.tasks).find(t=>t.id===id);
 const task=d.tasks.find(t=>t.id===id&&t.projectId===parent.id);
 return kind==='subtask'?task?.subtasks?.[index]:kind==='task'?task:null;
}
const text=v=>v===undefined?'':Array.isArray(v)?v.join('\n'):String(v);
export function buildRecordProposal(base,scope,operations){
 const selected=recordScope(base,scope);if(!selected)throw new HttpError(400,'请选择操作范围');
 let candidate=structuredClone(base),parentId=selected.record?.id;const cards=[],type=selected.type,list=()=>candidate[type==='project'?'projects':'roadmaps'],parent=()=>list().find(p=>p.id===parentId);
 const kinds=type==='project'?['project','project_stage','task','subtask','note','event']:['roadmap','roadmap_stage','learning_task'];
 for(const raw of operations){
  if(!raw||!kinds.includes(raw.kind)||!['add','update','delete'].includes(raw.op))throw new HttpError(422,'操作不属于所选事项或路线');
  const {kind,op}=raw,allowed=recordFields[kind],extra=op==='add'?({project:[],roadmap:[],project_stage:['project'],roadmap_stage:['roadmap'],task:['project','stage','subtasks'],learning_task:['roadmap','stage'],note:['project'],event:['project']}[kind]||[]):['id','expectedTitle',...(kind==='subtask'?['index']:[])];
  for(const [k,v] of Object.entries(raw))if(v!=null&&!['kind','op',...allowed,...extra].includes(k))throw new HttpError(422,'当前操作不支持字段 '+k);
  const values=Object.fromEntries(allowed.filter(k=>raw[k]!=null).map(k=>[k,raw[k]]));
  let item={op,kind},before=null;
  if(op==='add'){
   if(kind===type){if(!selected.isNew||parentId)throw new HttpError(422,'不能在当前范围新建另一个事项或路线');}
   else{
    if(!parent())throw new HttpError(422,'请先新建父事项或路线');
    const ownerKey=type==='project'?'project':'roadmap';if(![parentId,parent().title].includes(raw[ownerKey]))throw new HttpError(422,'追加内容不属于所选事项');
    item[ownerKey]=parentId;
    if(raw.stage){const stage=parent().phases.find(s=>s.id===raw.stage||s.title===raw.stage);if(!stage)throw new HttpError(422,'阶段不属于所选事项');item.stage=stage.id;}
    if(raw.subtasks!=null)item.subtasks=raw.subtasks;
   }
   if(kind==='subtask')throw new HttpError(422,'新增子任务请在任务编辑中操作');
   Object.assign(item,values);
  }else{
   if(selected.isNew)throw new HttpError(422,'新建范围不能修改已有内容');
   if(kind==='subtask'&&(!Number.isInteger(raw.index)||raw.index<0))throw new HttpError(422,'子任务序号无效');
   const found=locate(candidate,parent(),kind,raw.id,raw.index);if(!found||found.title!==raw.expectedTitle)throw new HttpError(422,'目标不属于当前事项，或名称已经变化');
   before=structuredClone(found);Object.assign(item,{id:raw.id,expectedTitle:raw.expectedTitle});if(kind==='subtask')item.index=raw.index;if(op==='update')item.changes=values;
  }
  let result;try{result=compileItems(candidate,[item])}catch(e){throw new HttpError(422,'草案未通过检查：'+e.message)}
  candidate=result.candidate;
  if(kind===type&&op==='add')parentId=list().at(-1).id;
  const after=op==='delete'?null:op==='update'?locate(candidate,parent(),kind,raw.id,raw.index):values;
  const diffs=allowed.filter(k=>op!=='update'||JSON.stringify(before[k])!==JSON.stringify(after[k])).map(k=>({field:k,before:text(before?.[k]),after:text(after?.[k])}));
  if(op==='update'&&!diffs.length)continue;
  cards.push({op,kind,title:after?.title||before?.title||result.preview[0].title,fields:diffs,detail:result.preview[0].detail,children:result.preview[0].children});
 }
 if(!cards.length)throw new HttpError(422,'没有实际变更，请继续说明。');
 validate(candidate);return {candidate,cards,targetId:parent()?.id||null,targetKind:type};
}
