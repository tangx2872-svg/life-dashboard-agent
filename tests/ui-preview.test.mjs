import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createUIPreviewServer} from '../scripts/preview-ui.mjs';

async function preview(t){
 const server=createUIPreviewServer({now:()=>new Date('2026-11-09T12:00:00+08:00'),replyDelay:0});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
 const url='http://127.0.0.1:'+server.address().port;
 const request=(path,options)=>fetch(url+path,options);
 const state=await (await request('/api/state')).json();
 const write=(path,body,method='POST')=>request(path,{method,headers:{'Content-Type':'application/json','X-Dashboard-Token':state.csrf},body:JSON.stringify(body)});
 return {request,write,state};
}

test('UI preview: boots the real frontend and serves every bootstrap asset without account setup',async t=>{
 const {request,state}=await preview(t);
 const html=await (await request('/')).text();
 assert.ok(html.indexOf('src="ui-preview.js"')<html.indexOf('src="bootstrap.js"'));
 const production=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(production,/src="ui-preview.js"/,'normal startup does not load the preview adapter');
 const bootstrap=await (await request('/bootstrap.js')).text();
 for(const file of new Set([...bootstrap.matchAll(/'([\w.-]+\.js)'/g)].map(m=>m[1])))assert.equal((await request('/'+file)).status,200,file);
 const auth=await (await request('/api/auth/me')).json();
 assert.equal(auth.preview,true);assert.equal(auth.user.guest,true);
 assert.equal(state.preview,true);assert.ok(state.data.projects.length>0);assert.ok(state.data.tasks.length>20);
 assert.equal((await (await request('/api/assistant/status')).json()).ready,false);
});

test('UI preview: edits live in the memory store, honor versions and reset to seeded data',async t=>{
 const {request,write,state}=await preview(t),originalTitle=state.data.tasks[0].title;
 state.data.tasks[0].title='本地预览修改';
 const response=await write('/api/state',{data:state.data,revision:0},'PUT');
 assert.equal(response.status,200);
 assert.equal((await (await request('/api/state')).json()).data.tasks[0].title,'本地预览修改');
 assert.equal((await write('/api/state',{data:state.data,revision:0},'PUT')).status,409);
 assert.equal((await write('/api/preview/reset',{})).status,200);
 const reset=await (await request('/api/state')).json();
 assert.equal(reset.revision,0);assert.equal(reset.data.tasks[0].title,originalTitle);
});

test('UI preview: clearly marked fixed proposals only change tasks on confirm and support undo',async t=>{
 const {request,write,state}=await preview(t),before=state.data.tasks.length;
 const proposal=await (await write('/api/planner/turn',{message:'看看方案卡的样式'})).json();
 assert.equal(proposal.preview,true);assert.equal(proposal.needsConfirmation,true);
 assert.match(proposal.warnings[0],/固定示例/);
 assert.equal((await (await request('/api/state')).json()).data.tasks.length,before);
 assert.equal((await write('/api/life/confirm',{proposalId:proposal.proposalId,proposalVersion:0})).status,409);
 const applied=await (await write('/api/life/confirm',{proposalId:proposal.proposalId,proposalVersion:proposal.proposalVersion})).json();
 assert.equal(applied.data.tasks.length,before+2);assert.ok(applied.changeBatchId);
 const undone=await (await write('/api/life/undo',{changeBatchId:applied.changeBatchId})).json();
 assert.equal(undone.data.tasks.length,before);
});

test('UI preview: private files and cross-origin writes are unavailable',async t=>{
 const {request,write,state}=await preview(t);
 assert.equal((await request('/.env')).status,404);
 assert.equal((await request('/server/accounts.mjs')).status,404);
 assert.equal((await request('/api/preview/reset',{method:'POST'})).status,403);
 assert.equal((await request('/api/preview/reset',{method:'POST',headers:{Origin:'https://example.invalid','X-Dashboard-Token':state.csrf}})).status,403);
 const unavailable=await write('/api/ai/audio/transcribe',{});
 assert.equal(unavailable.status,503);assert.match((await unavailable.json()).error,/完整后端/);
});
