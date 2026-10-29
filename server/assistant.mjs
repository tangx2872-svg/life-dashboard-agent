import {reminderSuggestions,applyReminderChoices} from './assistant-reminders.mjs';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { validate } from './schema.mjs';
import { HttpError } from './store.mjs';
import { buildRecordProposal, scopeContext, recordScope, compileItems } from './assistant-records.mjs';

const experimentSource=readFileSync(new URL('../public/experiments.js',import.meta.url),'utf8').split('function openExperiment(')[0];
const rules=vm.createContext({uid:randomUUID,assertDashboardData:validate,normalizedName:v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()});
vm.runInContext(experimentSource,rules); // Trusted local business code only; never evaluate model output.
const nullable={type:['string','null']};
const fields=['id','expectedTitle','experiment','title','goal','content','result','supplement','project','roadmap','stage','description','category','icon','start','target','estimate','text','date','criteria','subtasks','milestone','index'];
export const responseSchema={type:'object',additionalProperties:false,required:['type','message','operations','reason','facts','hypotheses','nextSteps','reminders'],properties:{
  type:{type:'string',enum:['answer','clarify','proposal']},message:{type:'string'},reason:{type:'string'},facts:{type:'array',items:{type:'string'}},hypotheses:{type:'array',items:{type:'string'}},nextSteps:{type:'array',items:{type:'string'}},
  reminders:{type:'array',items:{type:'object',additionalProperties:false,required:['title','at','note','basis'],properties:Object.fromEntries(['title','at','note','basis'].map(k=>[k,{type:'string'}]))}},
  operations:{type:'array',items:{type:'object',additionalProperties:false,required:['op','kind',...fields],properties:{op:{type:'string',enum:['add','update','delete']},kind:{type:'string',enum:['experiment','experiment_step','project','roadmap','project_stage','roadmap_stage','task','subtask','learning_task','note','event','inbox']},...Object.fromEntries(fields.map(k=>[k,['criteria','subtasks'].includes(k)?{type:['array','null'],items:{type:'string'}}:k==='milestone'?{type:['boolean','null']}:k==='index'?{type:['integer','null']}:nullable]))}}}
}};
export async function callModel(){throw new HttpError(503,'旧助手直连已停用。请使用 AI 文本解析接口；本轮不自动导入。')}
export function buildProposal(base,scope,operations){
  if(scope==='idea'){if(!Array.isArray(operations)||!operations.length||operations.length>12||operations.some(x=>x.op!=='add'))throw new HttpError(422,'想法入口仅支持新增草案');const roots=operations.filter(x=>['project','roadmap','inbox'].includes(x.kind));if(roots.length!==1||operations[0]!==roots[0])throw new HttpError(422,'请一次整理一个目标');const root=roots[0];if(root.kind==='inbox'){if(operations.length!==1||Object.entries(root).some(([k,v])=>v!=null&&!['kind','op','title'].includes(k)))throw new HttpError(422,'只记录想法时无需其他字段');const plan=compileItems(base,[{kind:'inbox',title:root.title}]);return {candidate:plan.candidate,cards:[{kind:'inbox',op:'add',title:root.title,fields:[]}],targetKind:'inbox',targetId:null}}return buildRecordProposal(base,'new-'+root.kind,operations);}

  if(!Array.isArray(operations)||!operations.length||operations.length>12)throw new HttpError(422,'每次修改需包含 1～12 项，请分批说明。');
  if(recordScope(base,scope))return buildRecordProposal(base,scope,operations);
  const candidate=structuredClone(base),cards=[];let target=scope==='new'?null:candidate.experiments?.find(e=>e.id===scope);
  if(scope!=='new'&&!target)throw new HttpError(409,'所选实验已不存在，请重新选择。');
  for(const operation of operations){
    if(!operation||typeof operation!=='object'||Array.isArray(operation)||Object.keys(operation).some(k=>!['op','kind',...fields].includes(k)))throw new HttpError(422,'助手生成了不支持的操作。');
    const {op,kind}=operation;
    if(!['add','update','delete'].includes(op)||!['experiment','experiment_step'].includes(kind))throw new HttpError(422,'本版助手只支持实验与实验步骤。');
    const step=kind==='experiment_step',allowed=step?['title','content','result','supplement']:['title','goal','result','supplement'];
    const values={};for(const key of fields){const value=operation[key];if(value!=null&&typeof value!=='string')throw new HttpError(422,'修改字段格式不正确');if(allowed.includes(key)&&value!=null)values[key]=value;}
    if(step&&operation.goal!=null||!step&&operation.content!=null)throw new HttpError(422,'助手使用了不支持的字段');
    let item={op,kind},before=null;
    if(op==='add'){
      if(!step){if(scope!=='new'||target)throw new HttpError(422,'当前范围不能创建另一个实验');item={...item,...values};}
      else{if(!target||![target.id,target.title].includes(operation.experiment))throw new HttpError(422,'新增步骤不属于当前实验');item={...item,experiment:target.id,...values};}
    }else{
      if(scope==='new')throw new HttpError(422,'新建范围不能修改已有记录');
      const record=step?target?.steps.find(s=>s.id===operation.id):target?.id===operation.id?target:null;
      if(!record||record.title!==operation.expectedTitle)throw new HttpError(422,'目标不属于当前实验或名称已经变化');
      before=structuredClone(record);item={...item,id:record.id,expectedTitle:record.title};if(op==='update')item.changes=values;
    }
    try{rules.experimentCapture(candidate,item)}catch(e){throw new HttpError(422,'修改草案未通过检查：'+e.message)}
    if(!step&&op==='add')target=candidate.experiments.at(-1);
    const after=op==='delete'?null:step?(op==='add'?target.steps.at(-1):target.steps.find(s=>s.id===operation.id)):target;
    const diffs=allowed.filter(k=>op!=='update'||before[k]!==after[k]).map(k=>({field:k,before:before?.[k]||'',after:after?.[k]||''}));
    if(op==='update'&&!diffs.length)continue;
    cards.push({op,kind,title:after?.title||before.title,fields:diffs,stepCount:!step&&op==='delete'?before.steps.length:0});
    if(!step&&op==='delete')target=null;
  }
  if(!cards.length)throw new HttpError(422,'这份建议没有实际修改，可以直接继续讨论。');
  validate(candidate);return {candidate,cards,targetId:target?.id||null,targetKind:'experiment'};
}
export function createAssistant(store,{model=callModel,ready=()=>false}={}){
  const sessions=new Map(),ttl=30*60*1000;
  const get=id=>{const s=sessions.get(id);if(!s||Date.now()-s.touched>ttl)throw new HttpError(410,'这段会话已过期，请开始新对话。');s.touched=Date.now();return s;};
  return {
    status:()=>({ready:ready(),scope:'projects-roadmaps-experiments'}),
    async turn({sessionId,scope,message,depth='light',useProfile=false}){
      if(!['capture','light','long'].includes(depth)||typeof useProfile!=='boolean')throw new HttpError(400,'规划选项无效');
      if(!ready())throw new HttpError(503,'助手尚未连接。文本解析已迁移到 AI Backend，本轮尚未接入旧助手工作流。');
      if(typeof message!=='string'||!message.trim()||message.length>6000)throw new HttpError(400,'请输入 1～6000 字的要求。');
      if(typeof scope!=='string'||scope.length>100)throw new HttpError(400,'请先选择实验或新建内容。');
      for(const [id,s] of sessions)if(Date.now()-s.touched>ttl&&!s.busy)sessions.delete(id);
      let s;
      if(sessionId){s=get(sessionId);if(s.scope!==scope)throw new HttpError(400,'操作范围已变化，请开始新对话。');}
      else{if(sessions.size>=32)throw new HttpError(429,'当前会话过多，请稍后再试。');sessionId=randomUUID();s={scope,history:[],touched:Date.now(),draft:null,busy:false};sessions.set(sessionId,s);}
      if(s.busy)throw new HttpError(409,'助手正在处理上一条请求，请稍候。');s.busy=true;
      const previous=s.draft;s.draft=null; // A follow-up invalidates the old confirmation button.
      try{
        const state=await store.read(),selected=scopeContext(state.data,scope),experiment=selected||scope==='new'?null:state.data.experiments?.find(e=>e.id===scope);
        if(!selected&&scope!=='new'&&scope!=='idea'&&!experiment)throw new HttpError(404,'所选内容不存在');
        const context={scope,depth,now:new Date().toISOString(),timezone:'Asia/Shanghai',depth,existingReminders:(state.data.reminders||[]).filter(r=>r.scope===scope&&!r.done),profile:useProfile?(state.data.personalProfile||null):null,selected,experiment,decisions:(state.data.decisions||[]).filter(d=>d.scope===scope).slice(-10),conversation:s.history.slice(-12),pendingDraft:previous?.revision===state.revision?previous.operations:null,message};
        if(JSON.stringify(context).length>100000)throw new HttpError(413,'所选内容较长，请先精简或使用高级工具分批处理。');
        const answer=await model(context);
        if(!answer||!['answer','clarify','proposal'].includes(answer.type)||typeof answer.message!=='string'||answer.message.length>12000||!Array.isArray(answer.operations))throw new HttpError(502,'助手返回内容不完整，请重试。');
        if((await store.read()).revision!==state.revision)throw new HttpError(409,'讨论期间数据已变化，请刷新后重新生成建议。');
        if(answer.type==='proposal'){
          if(scope==='idea'&&depth==='capture'&&answer.operations.some(x=>x.kind!=='inbox'))throw new HttpError(422,'只记下来模式不能创建计划');
          const plan=answer.operations.length?buildProposal(state.data,scope,answer.operations):{candidate:structuredClone(state.data),cards:[],targetId:selected?.record?.id||experiment?.id||null,targetKind:selected?.type||'experiment'};
          if(!answer.operations.length&&['idea','new','new-project','new-roadmap'].includes(scope))throw new HttpError(422,'请先形成目标方案');
          if(depth==='capture'&&(answer.reminders||[]).length)throw new HttpError(422,'只记录模式不创建提醒');
          plan.reminders=reminderSuggestions(answer.reminders||[],plan.targetId?(plan.targetKind==='experiment'?plan.targetId:plan.targetKind+':'+plan.targetId):scope);
          if(!plan.cards.length&&!plan.reminders.length)throw new HttpError(422,'没有待确认修改');
          const reasoning={reason:typeof answer.reason==='string'?answer.reason:answer.message,facts:Array.isArray(answer.facts)?answer.facts:[],hypotheses:Array.isArray(answer.hypotheses)?answer.hypotheses:[],nextSteps:Array.isArray(answer.nextSteps)?answer.nextSteps:[]};
          if(JSON.stringify(reasoning).length>20000||Object.values(reasoning).some(v=>Array.isArray(v)&&v.some(x=>typeof x!=='string')))throw new HttpError(422,'建议说明格式错误');
          plan.candidate.decisions=[...(state.data.decisions||[]),{id:randomUUID(),scope:scope==='idea'||scope.startsWith('new')?(plan.targetKind==='experiment'?plan.targetId:plan.targetKind+':'+plan.targetId):scope,createdAt:new Date().toISOString(),request:message,...reasoning,changes:plan.cards.map(c=>({op:c.op,kind:c.kind,title:c.title}))}];
          plan.reasoning=reasoning;
          s.draft={...plan,operations:answer.operations,revision:state.revision,id:randomUUID(),requestId:randomUUID(),expiresAt:Date.now()+ttl};
        }else if(answer.operations.length||(answer.reminders||[]).length)throw new HttpError(502,'回答中出现了未确认的操作，已阻止。');
        s.history.push({role:'user',text:message},{role:'assistant',text:answer.message});s.history=s.history.slice(-12);
        return {sessionId,type:answer.type,message:answer.message,proposal:s.draft?{id:s.draft.id,cards:s.draft.cards,reasoning:s.draft.reasoning,reminders:s.draft.reminders,revision:s.draft.revision,expiresAt:s.draft.expiresAt}:null};
      }finally{s.busy=false;s.touched=Date.now();}
    },
    async commit({sessionId,proposalId,confirmed,reminders}){
      const s=get(sessionId),p=s.draft;
      if(s.busy)throw new HttpError(409,'助手正在处理，请稍候。');
      if(confirmed!==true||!p||p.id!==proposalId||p.expiresAt<Date.now())throw new HttpError(409,'草案已失效或尚未确认，请重新生成。');
      s.busy=true;try{
        const saved=await store.commit({data:applyReminderChoices(p.candidate,p.reminders||[],reminders),revision:p.revision,requestId:p.requestId,reason:'智能助手：用户确认修改'});
        s.draft=null;s.history.push({role:'assistant',text:'用户已确认，以上草案已保存。'});
        return {...saved,targetId:p.targetId,targetKind:p.targetKind,counts:Object.fromEntries(['add','update','delete'].map(op=>[op,p.cards.filter(c=>c.op===op).length]))};
      }finally{s.busy=false;}
    },
    cancel({sessionId}){const s=get(sessionId);if(s.busy)throw new HttpError(409,'请等待助手完成');s.draft=null;s.history.push({role:'user',text:'取消上一份草案，不执行。'});return {cancelled:true};}
  };
}
