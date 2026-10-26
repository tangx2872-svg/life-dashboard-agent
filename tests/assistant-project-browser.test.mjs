import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { buildDemo } from '../scripts/demo-data.mjs';
import { emptyData } from '../server/schema.mjs';
import { fixture } from './helpers.mjs';
test('Browser: populated project assistant reads and updates via confirmation', {skip:!process.env.BROWSER_MODULE},async()=>{
 const {chromium}=await import(pathToFileURL(process.env.BROWSER_MODULE).href);let received;
 const f=await fixture({assistantOptions:{ready:()=>true,model:async ctx=>{received=ctx;return ctx.message==='读取进展'?{type:'answer',message:'已有任务、部分完成和一条示例笔记。',operations:[]}:{type:'proposal',message:'请确认事项说明修改。',operations:[{op:'update',kind:'project',id:ctx.selected.record.id,expectedTitle:ctx.selected.record.title,description:ctx.message},{op:'add',kind:'task',project:ctx.selected.record.id,title:'整理下一轮问题',subtasks:['核对已完成内容','写出下一步']} ]}}}});
 const seed=buildDemo(emptyData()).candidate;await f.store.commit({data:seed,revision:0,requestId:randomUUID(),reason:'fictional fixture'});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(f.url);await page.waitForFunction(()=>window.dashboardReady);
 await mkdir(new URL('../.local/screenshots/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../.local/screenshots/demo-dashboard.png',import.meta.url)),fullPage:true});
 await page.evaluate(id=>openProject(id),seed.projects[0].id);await page.getByRole('button',{name:'✧ 让助手读取 / 调整',exact:true}).click();assert.equal(await page.getByLabel('选择操作范围').inputValue(),'project:'+seed.projects[0].id);
 const send=async text=>{await page.getByLabel('告诉助手你的想法').fill(text);await page.getByRole('button',{name:'发送 →',exact:true}).click();await page.waitForFunction(()=>!assistantState.busy)};
 await send('读取进展');assert.equal(received.selected.record.notes.length,1);assert.equal((await f.store.read()).revision,1);
 await send('【示例】聚焦一个可验证的问题，保留已有任务与记录。');assert.equal(await page.locator('.assistant-change').count(),2);assert.match(await page.locator('.assistant-change').last().innerText(),/核对已完成内容/);assert.equal((await f.store.read()).revision,1);
 await page.screenshot({path:fileURLToPath(new URL('../.local/screenshots/assistant-project.png',import.meta.url)),fullPage:true});await page.getByRole('button',{name:'确认修改',exact:true}).click();await page.waitForFunction(()=>!assistantState.busy&&assistantState.success);
 const saved=(await f.store.read()).data;assert.deepEqual(saved.tasks.slice(0,seed.tasks.length),seed.tasks);assert.deepEqual(saved.projects[0].notes,seed.projects[0].notes);assert.equal(saved.tasks.at(-1).title,'整理下一轮问题');
 await page.getByRole('button',{name:'查看保存内容 ↗',exact:true}).click();assert.equal(await page.evaluate(()=>page),'detail');await page.getByRole('button',{name:'✧ 让助手读取 / 调整',exact:true}).click();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 }finally{await browser.close();await f.close()}
});
