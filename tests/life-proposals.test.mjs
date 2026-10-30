import test from 'node:test';import assert from 'node:assert/strict';import {emptyData} from '../server/schema.mjs';import {applyLifeActions,createLifeProposalService,buildLifeContext,shouldForcePlan,chooseTier} from '../server/life-proposals.mjs';
const operation=(action,extra={})=>({action,targetId:null,projectId:null,clientRef:null,title:null,date:null,minutes:null,priority:null,description:null,status:null,...extra});
function fixture(){let state={data:emptyData(),revision:0};state.data.projects.push({id:'paper',title:'工业视觉论文',phases:[],notes:[],status:'进行中'});state.data.tasks.push({id:'task1',title:'原任务',projectId:'paper',done:false,subtasks:[]});return {store:{read:async()=>structuredClone(state),commit:async p=>{if(p.revision!==state.revision)throw Error('conflict');state={data:p.data,revision:state.revision+1};return {revision:state.revision}}},get:()=>state}}
test('Life Actions: create/update/project/date and reject illegal or foreign IDs',()=>{const {get}=fixture(),base=get().data;let d=applyLifeActions(base,[operation('create_task',{title:'摘要',projectId:'paper',date:'2026-11-02',minutes:45})]);assert.equal(d.tasks.length,2);assert.equal(base.tasks.length,1);d=applyLifeActions(d,[operation('update_task',{targetId:'task1',title:'修改后的任务'}),operation('reschedule_task',{targetId:'task1',date:'2026-11-03'}),operation('update_project',{targetId:'paper',priority:'high'})]);assert.equal(d.tasks[0].scheduledDate,'2026-11-03');assert.equal(d.projects[0].priority,'high');d=applyLifeActions(d,[operation('create_project',{title:'新项目',clientRef:'new:1'}),operation('create_task',{title:'第一步',projectId:'new:1'})]);assert.equal(d.tasks.at(-1).projectId,d.projects.at(-1).id);for(const o of [{action:'delete_task',targetId:'task1'},operation('update_task',{targetId:'foreign'}),operation('create_task',{title:'x',projectId:'foreign'}),operation('reschedule_task',{targetId:'task1',date:'2026-02-30'}),{...operation('update_task',{targetId:'task1'}),sql:'DROP'}])assert.throws(()=>applyLifeActions(base,[o]));assert.equal(base.tasks[0].title,'原任务')});
test('Proposals: no writes before confirm, full revision, batch Undo and account/session isolation',async()=>{const f=fixture();let previousSeen,contextSeen;const ai={propose_life:async(text,context,previous)=>{previousSeen=previous;contextSeen=context;return {proposal:{summary:'安排摘要',intent:'plan',message:'看看这样行不行',warnings:[],operations:[operation('create_task',{title:'论文摘要',projectId:'paper',date:previous?'2026-11-05':'2026-11-04',minutes:45})]},timings:{}}}};const service=createLifeProposalService({store:f.store,ai,memory:{read:async()=>[]},userId:'A'});const first=await service.turn({message:'明天改摘要',currentProjectId:'paper'});assert.equal(f.get().revision,0);assert.equal(contextSeen.currentProject.id,'paper');const revised=await service.turn({message:'周三不要安排',proposalId:first.proposalId});assert.ok(previousSeen);await assert.rejects(service.confirm({proposalId:first.proposalId,proposalVersion:first.proposalVersion,confirm:true}),e=>e.status===409);assert.equal(revised.proposalId,first.proposalId);await assert.rejects(service.confirm({proposalId:first.proposalId}),e=>e.status===422);const other=createLifeProposalService({store:f.store,ai,memory:{read:async()=>[]},userId:'B'});await assert.rejects(other.confirm({proposalId:first.proposalId,confirm:true}),e=>e.status===404);const saved=await service.confirm({proposalId:revised.proposalId,proposalVersion:revised.proposalVersion,confirm:true});assert.equal(saved.data.tasks.length,2);assert.equal(saved.data.tasks.at(-1).scheduledDate,'2026-11-05');const undone=await service.undo({changeBatchId:saved.changeBatchId});assert.equal(undone.data.tasks.length,1);const pending=await service.turn({message:'安排'});await f.store.commit({data:f.get().data,revision:f.get().revision});await assert.rejects(service.confirm({proposalId:pending.proposalId,proposalVersion:pending.proposalVersion,confirm:true}),e=>e.status===409)});
test('Provider failure or interrupted stream writes nothing; invalid model operations rejected',async()=>{const f=fixture();for(const ai of [{propose_life:async()=>{throw Error('stream interrupted')}},{propose_life:async()=>({proposal:{intent:'plan',message:'x',operations:[{action:'unknown'}]}})}]){const service=createLifeProposalService({store:f.store,ai,memory:{read:async()=>[]},userId:'A'});await assert.rejects(service.turn({message:'安排'}));assert.equal(f.get().revision,0)}});
test('Snapshots cache unchanged source and expose relevant context without all history',async()=>{const f=fixture();let calls=0;const service=createLifeProposalService({store:f.store,ai:{answer_with_context:async()=>{calls++;return '有来源的观察'}},memory:{read:async()=>[]},userId:'A'});await service.snapshot('understanding');const cached=await service.snapshot('understanding');assert.equal(calls,1);assert.equal(cached.cached,true);assert.equal(buildLifeContext(f.get(),'这个任务',{currentTaskId:'task1'}).currentProject.id,'paper')});

const clarification=(question)=>({summary:'还需要确认',intent:'needs_clarification',message:'想确认一下',warnings:[],understanding:'明天下午改摘要',adjustments:[],questions:[{id:'when',question,type:'single_choice',options:[{label:'下午三点',value:'15:00'}],allowCustom:true}],operations:[]});
const planReply=(count=1)=>({summary:'安排好了',intent:'plan',message:'看看这样',warnings:[],understanding:'明天下午改摘要',adjustments:['提前到上午'],questions:[],operations:Array.from({length:count},(_,i)=>operation('create_task',{title:'修改论文摘要'+(i||''),date:'2026-11-02',minutes:45}))});
test('Clarification guard: explicit when+what only blocks low-impact questions',()=>{
  assert.equal(shouldForcePlan('明天下午三点修改论文摘要，45分钟',clarification('几点开始？')),true);
  assert.equal(shouldForcePlan('这个延期到周五上午十点，改成60分钟',clarification('改到哪个时间？')),true);
  assert.equal(shouldForcePlan('明天下午三点修改论文摘要',clarification('摘要要改哪一部分？')),false);
  assert.equal(shouldForcePlan('春节去四川玩，帮我规划一下',clarification('玩几天？')),false);
  assert.equal(shouldForcePlan('帮我重新安排下周论文、六级和健身，每天别太满',clarification('先保论文还是六级？')),false);
  assert.equal(shouldForcePlan('明天下午三点修改论文摘要',planReply()),false);
});
test('Clarification guard: one forced retry turns clarification into a plan',async()=>{
  const f=fixture(),calls=[];
  const ai={propose_life:async(text,context,previous,extra={})=>{calls.push(extra);return {proposal:calls.length===1?clarification('几点开始？'):planReply(1),timings:{},provider:'mock'}}};
  const service=createLifeProposalService({store:f.store,ai,memory:{read:async()=>[]},userId:'A'});
  const reply=await service.turn({message:'明天下午三点修改论文摘要，45分钟'});
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1],{tier:'FAST',forcePlan:true});
  assert.equal(reply.intent,'plan');
  assert.equal(reply.operations.length,1);
  assert.equal(f.get().revision,0);
});
test('Clarification guard: retry happens at most once',async()=>{
  const f=fixture();
  const ai={propose_life:async()=>({proposal:clarification('几点开始？'),timings:{},provider:'mock'})};
  const service=createLifeProposalService({store:f.store,ai,memory:{read:async()=>[]},userId:'A'});
  const reply=await service.turn({message:'明天下午三点修改论文摘要'});
  assert.equal(reply.intent,'clarify');
  assert.equal(reply.operations.length,0);
});

test('Tier: simple single requests stay FAST, global re-planning goes PLANNER',()=>{
  assert.equal(chooseTier({message:'明天下午三点修改论文摘要，45分钟'}),'FAST');
  assert.equal(chooseTier({message:'明天下午三点修改论文摘要45分钟，晚上七点健身一个小时'}),'FAST');
  assert.equal(chooseTier({message:'这个延期到周五上午十点，改成60分钟',currentTaskId:'task1'}),'FAST');
  assert.equal(chooseTier({message:'重新把这个任务延期到周五'}),'FAST');
  assert.equal(chooseTier({message:'帮我重新安排下周论文、六级和健身，每天别太满'}),'PLANNER');
  assert.equal(chooseTier({message:'看看今天安排',scope:'global'}),'PLANNER');
});
test('Context: FAST sends a smaller slice than PLANNER',()=>{
  const state={data:emptyData(),revision:0};
  for(let i=0;i<12;i++)state.data.projects.push({id:'p'+i,title:'项目'+i,status:'进行中',phases:[{id:'x',title:'阶段',status:'未开始'}],description:'d'});
  for(let i=0;i<40;i++)state.data.tasks.push({id:'t'+i,title:'任务'+i,projectId:'p'+(i%12),done:false,scheduledDate:'2026-11-'+String((i%28)+1).padStart(2,'0'),estimatedMinutes:45});
  state.data.history=Array.from({length:10},(_,i)=>({title:'记录'+i,date:'2026-10-2'+i,projectId:'p0'}));
  state.data.events=[{id:'e1',projectId:'p0',title:'里程碑',date:'2026-12-01'}];
  state.data.plannerProfile={dailyMinutes:180,restDays:['周六'],customNote:'x'.repeat(50)};
  const fast=buildLifeContext(state,'明天下午三点修改论文摘要，45分钟',{currentProjectId:'p0',tier:'FAST'});
  const planner=buildLifeContext(state,'重新安排下周所有任务',{scope:'global',tier:'PLANNER'});
  assert.equal(fast.tier,'FAST');
  assert.ok(fast.projects.length<=5);
  assert.ok(fast.tasks.length<=8);
  assert.equal(fast.recentActivity,undefined);
  assert.deepEqual(Object.keys(fast.preferences).sort(),['dailyMinutes','restDays']);
  assert.ok(planner.projects.length<=16);
  assert.ok(planner.tasks.length<=45);
  assert.ok(Array.isArray(planner.recentActivity));
  assert.equal(planner.preferences.customNote.length,50);
  assert.ok(fast.relevantConversation.length<=2);
});

test('Clarification: answering a question forces a plan instead of asking again',async()=>{
  const f=fixture();let calls=0;
  const ai={propose_life:async(text,context,previous,extra={})=>{calls++;return {proposal:calls===1?clarification('准备玩几天？'):calls===2?clarification('想要什么路线？'):planReply(3),timings:{},provider:'mock'}}};
  const service=createLifeProposalService({store:f.store,ai,memory:{read:async()=>[]},userId:'A'});
  const first=await service.turn({message:'春节去四川玩，帮我规划一下'});
  assert.equal(first.intent,'clarify');
  assert.ok(first.proposalId);
  const second=await service.turn({message:'准备玩 5 天，预算中等',proposalId:first.proposalId});
  assert.equal(second.intent,'plan');
  assert.equal(second.operations.length,3);
  assert.equal(calls,3);
  assert.deepEqual(second.proposalId,first.proposalId,'revision keeps the same proposal id');
  assert.equal(second.proposalVersion,2);
});
