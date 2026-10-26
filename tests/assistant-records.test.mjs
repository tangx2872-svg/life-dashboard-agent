import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProposal,createAssistant } from '../server/assistant.mjs';
import { emptyData } from '../server/schema.mjs';
import { buildDemo } from '../scripts/demo-data.mjs';
import { scopeContext } from '../server/assistant-records.mjs';
test('Project and roadmap scopes: create, read, update, preserve progress, delete children',()=>{
 const base=buildDemo(emptyData()).candidate,p=base.projects[0],scope='project:'+p.id,t=base.tasks.find(t=>t.projectId===p.id),unchanged=structuredClone(base);
 const plan=buildProposal(base,scope,[{op:'update',kind:'project',id:p.id,expectedTitle:p.title,description:'新的明确目标'},{op:'update',kind:'task',id:t.id,expectedTitle:t.title,title:'修订阅读任务'},{op:'add',kind:'note',project:p.id,text:'用户要求新增的记录'},{op:'add',kind:'task',project:p.id,stage:p.phases[1].id,title:'追加验证',subtasks:['检查输入','记录输出']}]);
 assert.deepEqual(base,unchanged);assert.equal(plan.candidate.tasks.find(x=>x.id===t.id).done,t.done);assert.deepEqual(plan.candidate.tasks.find(x=>x.id===t.id).subtasks,t.subtasks);assert.deepEqual(plan.candidate.projects[0].notes.slice(0,-1),p.notes);assert.deepEqual(plan.candidate.projects.slice(1),base.projects.slice(1));
 const context=scopeContext(base,scope);assert.equal(context.record.id,p.id);assert.ok(context.tasks.every(t=>t.projectId===p.id));assert.ok(!JSON.stringify(context).includes(base.projects[1].id));
 const other=base.tasks.find(t=>t.projectId===base.projects[1].id);assert.throws(()=>buildProposal(base,scope,[{op:'update',kind:'task',id:other.id,expectedTitle:other.title,title:'越界'}]));
 assert.throws(()=>buildProposal(base,scope,[{op:'add',kind:'task',project:p.id,stage:base.projects[1].phases[0].id,title:'越界阶段'}]));
 assert.throws(()=>buildProposal(base,scope,[{op:'update',kind:'task',id:t.id,expectedTitle:t.title,done:false}]));
 const sub=buildProposal(base,scope,[{op:'update',kind:'subtask',id:t.id,index:0,expectedTitle:t.subtasks[0].title,title:'更新子任务名称'}]);assert.equal(sub.candidate.tasks.find(x=>x.id===t.id).subtasks[0].done,true);
 const stage=p.phases[0],deleted=buildProposal(base,scope,[{op:'delete',kind:'project_stage',id:stage.id,expectedTitle:stage.title}]);assert.ok(!deleted.candidate.tasks.some(t=>t.phaseId===stage.id));assert.equal(deleted.candidate.projects[0].phases.length,p.phases.length-1);
 const removed=buildProposal(base,scope,[{op:'delete',kind:'project',id:p.id,expectedTitle:p.title}]);assert.ok(!removed.candidate.tasks.some(t=>t.projectId===p.id));assert.ok(!removed.candidate.events.some(e=>e.projectId===p.id));assert.ok(!removed.candidate.history.some(h=>h.projectId===p.id));
 const fresh=buildProposal(base,'new-project',[{op:'add',kind:'project',title:'新事项'},{op:'add',kind:'project_stage',project:'新事项',title:'起步'},{op:'add',kind:'task',project:'新事项',stage:'起步',title:'第一步'}]);assert.equal(fresh.candidate.projects.at(-1).phases.length,1);
 const route=buildProposal(base,'new-roadmap',[{op:'add',kind:'roadmap',title:'新路线',goal:'从基础开始'},{op:'add',kind:'roadmap_stage',roadmap:'新路线',title:'入门'},{op:'add',kind:'learning_task',roadmap:'新路线',stage:'入门',title:'练习',criteria:['完成练习'],milestone:true}]);assert.equal(route.candidate.roadmaps.at(-1).phases[0].tasks[0].milestone,true);
 const r=base.roadmaps[0],lt=r.phases[0].tasks[0];const editRoute=buildProposal(base,'roadmap:'+r.id,[{op:'update',kind:'learning_task',id:lt.id,expectedTitle:lt.title,goal:'新的目标',criteria:['复述要点']}]);assert.equal(editRoute.candidate.roadmaps[0].phases[0].tasks[0].done,true);assert.deepEqual(editRoute.candidate.roadmaps[0].phases[0].tasks[0].notes,lt.notes);
});
test('Fictional seed is additive, labeled, idempotent and preserves existing ordering',()=>{
 const base=buildProposal(emptyData(),'new-project',[{op:'add',kind:'project',title:'真实项目'}]).candidate;base.homeFocus=['p-'+base.projects[0].id];base.homeOrder=[];
 const original=structuredClone(base),seed=buildDemo(base);assert.deepEqual(base,original);assert.deepEqual(seed.candidate.projects[0],base.projects[0]);assert.deepEqual(seed.candidate.homeFocus,base.homeFocus);assert.equal(seed.candidate.projects.length,5);assert.ok(seed.candidate.projects.slice(1).every(p=>p.title.startsWith('【示例】')));assert.equal(buildDemo(seed.candidate).added,false);assert.deepEqual(buildDemo(seed.candidate).candidate,seed.candidate);
});
test('Assistant reads selected project including notes without writing on query',async()=>{
 const data=buildDemo(emptyData()).candidate,p=data.projects[0];let received;
 const api=createAssistant({read:async()=>({data,revision:1}),commit:()=>{throw Error('query must not write')}},{ready:()=>true,model:async ctx=>{received=ctx;return {type:'answer',message:'已有任务与记录',operations:[]}}});
 const result=await api.turn({scope:'project:'+p.id,message:'读取我的任务和笔记'});assert.equal(result.proposal,null);assert.equal(received.selected.record.notes.length,1);assert.ok(received.selected.tasks.length>0);assert.equal(received.experiment,null);
});
