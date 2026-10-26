import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildProposal,createAssistant } from '../server/assistant.mjs';
import { emptyData } from '../server/schema.mjs';
import { fixture } from './helpers.mjs';
const create=()=>structuredClone(buildProposal(emptyData(),'new',[{op:'add',kind:'experiment',title:'光照实验',goal:'对比光照'},{op:'add',kind:'experiment_step',experiment:'光照实验',title:'基线',content:'固定参数',result:'原始结果',supplement:'保留记录'}]).candidate);
const update=d=>({op:'update',kind:'experiment_step',id:d.experiments[0].steps[0].id,expectedTitle:'基线',content:'固定参数并记录照度'});
test('Assistant scoped drafts preserve data and reject wrong targets',()=>{
 const d=create(),before=structuredClone(d),plan=buildProposal(d,d.experiments[0].id,[update(d)]);
 assert.deepEqual(d,before);assert.equal(plan.candidate.experiments[0].steps[0].result,'原始结果');assert.equal(plan.cards[0].fields[0].before,'固定参数');
 assert.throws(()=>buildProposal(d,d.experiments[0].id,[{...update(d),id:'other'}]));
 assert.throws(()=>buildProposal(d,d.experiments[0].id,[{...update(d),expectedTitle:'旧名称'}]));
 assert.throws(()=>buildProposal(d,d.experiments[0].id,[{op:'add',kind:'experiment',title:'越界'}]));
 assert.throws(()=>buildProposal(d,d.experiments[0].id,[{op:'add',kind:'experiment_step',experiment:d.experiments[0].id,title:'基线'}]));
 const del=buildProposal(d,d.experiments[0].id,[{op:'delete',kind:'experiment',id:d.experiments[0].id,expectedTitle:'光照实验'}]);assert.equal(del.candidate.experiments.length,0);assert.equal(del.cards[0].stepCount,1);
});
test('Assistant confirmation, cancellation, stale draft and HTTP safeguards with real MySQL',async()=>{
 let reply;const f=await fixture({assistantOptions:{ready:()=>true,model:async()=>reply}});
 try{
  const d=create();await f.store.commit({data:d,revision:0,requestId:randomUUID(),reason:'test seed'});
  const api=createAssistant(f.store,{ready:()=>true,model:async()=>reply}),scope=d.experiments[0].id;
  reply={type:'answer',message:'已有一个步骤',operations:[]};let r=await api.turn({scope,message:'查询'});assert.equal(r.proposal,null);assert.equal((await f.store.read()).revision,1);
  reply={type:'proposal',message:'请确认',operations:[update(d)]};r=await api.turn({scope,sessionId:r.sessionId,message:'修改'});assert.deepEqual((await f.store.read()).data,d);
  api.cancel({sessionId:r.sessionId});await assert.rejects(api.commit({sessionId:r.sessionId,proposalId:r.proposal.id,confirmed:true}));
  r=await api.turn({scope,sessionId:r.sessionId,message:'重新修改'});const old=r.proposal.id;
  r=await api.turn({scope,sessionId:r.sessionId,message:'继续调整'});await assert.rejects(api.commit({sessionId:r.sessionId,proposalId:old,confirmed:true}));
  await api.commit({sessionId:r.sessionId,proposalId:r.proposal.id,confirmed:true});assert.equal((await f.store.read()).data.experiments[0].steps[0].content,'固定参数并记录照度');assert.ok((await f.store.snapshots()).length>=2);
  await assert.rejects(api.commit({sessionId:r.sessionId,proposalId:r.proposal.id,confirmed:true}));
  reply.operations=[{...update(d),content:'另一个草案'}];r=await api.turn({scope,sessionId:r.sessionId,message:'再修改'});
  const state=await f.store.read();state.data.experiments[0].goal='其他页面修改';await f.store.commit({data:state.data,revision:state.revision,requestId:randomUUID(),reason:'concurrent test'});
  await assert.rejects(api.commit({sessionId:r.sessionId,proposalId:r.proposal.id,confirmed:true}));assert.equal((await f.store.read()).data.experiments[0].goal,'其他页面修改');
  const off=createAssistant(f.store,{ready:()=>false});await assert.rejects(off.turn({scope,message:'测试'}),e=>e.status===503);
  const denied=await fetch(f.url+'/api/assistant/turn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,message:'测试'})});assert.equal(denied.status,403);
  const boot=await(await fetch(f.url+'/api/state')).json();const ok=await fetch(f.url+'/api/assistant/turn',{method:'POST',headers:{'Content-Type':'application/json','X-Dashboard-Token':boot.csrf},body:JSON.stringify({scope,message:'测试'})});assert.equal(ok.status,200);
 }finally{await f.close()}
});
