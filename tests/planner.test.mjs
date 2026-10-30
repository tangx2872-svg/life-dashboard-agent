import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './helpers.mjs';

const dateOf=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const weekday=s=>['周日','周一','周二','周三','周四','周五','周六'][new Date(s).getDay()];

async function plannerOnly(){
  const {createPlanner}=await import('../server/planner.mjs');
  const f=await fixture();
  return {f,planner:createPlanner(f.store)};
}
async function seed(f,projects,tasks){
  const state=await f.store.read();
  state.data.projects=projects;state.data.tasks=tasks;
  await f.store.commit({data:state.data,revision:state.revision,requestId:randomUUID(),reason:'planner seed'});
}

test('Planner: one sentence becomes a decomposed, scheduled plan',async()=>{
  const {f,planner}=await plannerOnly();
  try{
    const reply=await planner.turn({message:'这周我要把论文改完，周六想休息。'});
    assert.equal(reply.intent,'create');
    assert.match(reply.message,/整理好了/);
    assert.equal(reply.operations.length,1);
    const op=reply.operations[0];
    assert.equal(op.op,'create_plan');
    assert.equal(op.category,'科研');
    assert.ok(op.stages.length>=4,'论文应被拆成多步');
    assert.ok(op.stages.every(s=>/^\d{4}-\d{2}-\d{2}$/.test(s.date)),'每一步都有日期');
    assert.ok(op.stages.every(s=>weekday(s.date)!=='周六'),'周六被留空');
    assert.ok(op.stages[0].date>=dateOf(0),'排期从今天开始');
    assert.equal(reply.needsConfirmation,true);
  }finally{await f.close()}
});

test('Planner: understands 「论文那个」 without asking which one',async()=>{
  const {f,planner}=await plannerOnly();
  try{
    await seed(f,[{id:'p1',title:'论文修改',description:'',status:'进行中',category:'科研',phases:[],notes:[],target:''}],
      [{id:'t1',title:'检查实验',projectId:'p1',done:false,date:dateOf(1),subtasks:[]},{id:'t2',title:'六级听力',projectId:'',done:false,date:dateOf(1),subtasks:[]}]);
    const first=await planner.turn({message:'把论文那个往后放。'});
    assert.equal(first.intent,'modify');
    assert.equal(first.operations[0].op,'move_task');
    assert.equal(first.operations[0].id,'t1');
    assert.ok(first.operations[0].to>dateOf(1));
    // Session continuity: the second sentence keeps talking about the same thing.
    const second=await planner.turn({sessionId:first.sessionId,message:'再往后一天。'});
    assert.equal(second.intent,'modify');
    assert.equal(second.operations[0].id,'t1');
  }finally{await f.close()}
});

test('Planner: builds a daily habit from 「每天半小时」',async()=>{
  const {f,planner}=await plannerOnly();
  try{
    const reply=await planner.turn({message:'六级最近有点落下，每天帮我安排半小时听力。'});
    assert.equal(reply.intent,'modify');
    const created=reply.operations.filter(o=>o.op==='create_task');
    assert.equal(created.length,7,'接下来 7 天每天一项');
    assert.match(created[0].title,/听力/);
    assert.equal(created[0].minutes,30);
  }finally{await f.close()}
});

test('Planner: clears a day when the user says they do not want to study',async()=>{
  const {f,planner}=await plannerOnly();
  try{
    await seed(f,[],[{id:'t1',title:'写报告',projectId:'',done:false,date:dateOf(1),subtasks:[]}]);
    const reply=await planner.turn({message:'明天不想学习了。'});
    assert.equal(reply.intent,'modify');
    assert.equal(reply.operations[0].op,'move_task');
    assert.notEqual(reply.operations[0].to,dateOf(1));
  }finally{await f.close()}
});

test('Planner: answers questions without changing data',async()=>{
  const {f,planner}=await plannerOnly();
  try{
    await seed(f,[{id:'p1',title:'论文修改',description:'',status:'进行中',category:'科研',phases:[],notes:[],target:''}],
      [{id:'t1',title:'改摘要',projectId:'p1',done:false,date:dateOf(1),subtasks:[]},{id:'t2',title:'改引言',projectId:'p1',done:false,date:dateOf(2),subtasks:[]}]);
    const before=(await f.store.read()).revision;
    const reply=await planner.turn({message:'论文还剩多少？'});
    assert.equal(reply.intent,'answer');
    assert.equal(reply.operations.length,0);
    assert.match(reply.message,/论文修改/);
    assert.equal((await f.store.read()).revision,before,'查询不写库');
  }finally{await f.close()}
});

test('Planner: reduces an overloaded day instead of regenerating everything',async()=>{
  const {f,planner}=await plannerOnly();
  try{
    const day=dateOf(2);
    await seed(f,[],Array.from({length:6},(_,i)=>({id:'t'+i,title:'任务 '+i,projectId:'',done:false,date:day,subtasks:[]})));
    const reply=await planner.turn({message:'那天事情太多了，顺一顺。'});
    assert.equal(reply.intent,'modify');
    const moved=reply.operations.filter(o=>o.op==='move_task');
    assert.ok(moved.length>0);
    assert.ok(moved.every(o=>o.to!==day));
    assert.ok(moved.length<6,'只动多出来的部分');
  }finally{await f.close()}
});

test('Planner: rejects empty input and keeps sessions separate',async()=>{
  const {f,planner}=await plannerOnly();
  try{
    await assert.rejects(()=>planner.turn({message:'   '}),/说一句/);
    await assert.rejects(()=>planner.turn({message:'x'.repeat(4001)}),/4000/);
    const a=await planner.turn({message:'准备六级。'}),b=await planner.turn({message:'准备六级。'});
    assert.notEqual(a.sessionId,b.sessionId);
  }finally{await f.close()}
});
