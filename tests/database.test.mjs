import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers.mjs';
import { createStore } from '../server/store.mjs';
test('MySQL: full data, backup, revision conflict, idempotency, restart and invalid input',async()=>{
  const f=await fixture();try{
    const state=await (await fetch(f.url+'/api/state')).json();assert.equal(state.revision,0);
    const d=state.data;
    d.projects.push({id:'p',title:'虚构测试项目',phases:[{id:'s',title:'第一阶段',status:'进行中'}],notes:[{id:'n',text:'保留笔记',date:'2026-10-26'}]});
    d.tasks.push({id:'t',title:'测试任务',projectId:'p',phaseId:'s',done:false,subtasks:[{title:'第一项',done:true},{title:'第二项',done:false}],date:'2026-11-01'});
    d.experiments.push({id:'e',title:'测试实验',goal:'测试',result:'',supplement:'保留补充',createdAt:'2026-10-26',updatedAt:'2026-10-26',steps:[{id:'es',title:'步骤',content:'内容',result:'观察',supplement:''}]});
    d.homeOrder=['p-p'];d.customFutureField={keep:true};
    const packet={data:d,revision:0,requestId:randomUUID()};
    const write=p=>fetch(f.url+'/api/state',{method:'PUT',headers:{'content-type':'application/json','x-dashboard-token':state.csrf},body:JSON.stringify(p)});
    assert.equal((await write(packet)).status,200);
    assert.equal((await (await write(packet)).json()).replayed,true);
    assert.equal((await write({...packet,requestId:randomUUID()})).status,409);
    const backup=await (await fetch(f.url+'/api/backup')).json();assert.deepEqual(backup.data,d);
    const second=await createStore(f.options);assert.deepEqual((await second.read()).data,d);await second.close();
    const bad={...d,tasks:[{id:'bad',title:'bad',done:'yes'}]};assert.equal((await write({data:bad,revision:1,requestId:randomUUID()})).status,400);
    assert.deepEqual((await f.store.read()).data,d);
    const changed=structuredClone(d);changed.projects=[];changed.tasks=[];
    assert.equal((await write({data:changed,revision:1,requestId:randomUUID()})).status,200);
    const before=await (await fetch(f.url+'/api/snapshots/1')).json();assert.deepEqual(before.data,d);
    assert.equal((await write({data:before.data,revision:2,requestId:randomUUID()})).status,200);
    assert.deepEqual((await f.store.read()).data,d);
    const races=await Promise.all([write({data:d,revision:3,requestId:randomUUID()}),write({data:d,revision:3,requestId:randomUUID()})]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
    const denied=await fetch(f.url+'/api/state',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(packet)});assert.equal(denied.status,403);
    assert.equal((await fetch(f.url+'/api/state',{headers:{Origin:'https://example.com'}})).status,403);
    assert.equal((await fetch(f.url+'/.env')).status,404);
    assert.equal((await fetch(f.url+'/api/experiments/e')).status,200);
  }finally{await f.close()}
});
