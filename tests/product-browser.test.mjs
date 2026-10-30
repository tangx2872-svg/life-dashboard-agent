import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixture} from './helpers.mjs';
import {buildDemo} from '../scripts/demo-data.mjs';
import {emptyData} from '../server/schema.mjs';

test('Product workflow: routing, tasks, focus, search, AI preview and responsive QA',{skip:!process.env.BROWSER_MODULE},async()=>{
 const {chromium}=await import(pathToFileURL(process.env.BROWSER_MODULE));let calls=0;
 const f=await fixture({aiClient:{check_health:async()=>({status:'ok'}),parse_text_capture:async()=>{calls++;return {status:'ok',capture:{format:'life-dashboard.capture',version:2,batchId:'product-mock-batch',items:[{type:'task',title:'修改论文',note:'核对引用',start_datetime:'2026-11-10T20:00:00+08:00'},{type:'event',title:'组会',start_datetime:'2026-11-11T15:00:00+08:00'}]},transcript:null,timings:{total_ms:1}}}}});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const seed=buildDemo(emptyData()).candidate;await f.store.commit({data:seed,revision:0,requestId:randomUUID(),reason:'fictional product QA'});
  const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(f.url);await p.waitForFunction(()=>window.dashboardReady);assert.equal(await p.locator('#nav button').count(),4);
  await p.evaluate(()=>nav('tasks'));
  await p.getByRole('button',{name:'＋ 添加任务',exact:true}).click();await p.locator('#form [name=title]').fill('QA 下一步');await p.locator('#form details').evaluate(e=>e.open=true);await p.locator('#form [name=description]').fill('保留描述和状态');await p.locator('#form [name=subtasks]').fill('读取资料\n写下结论');await p.locator('#form [name=status]').selectOption('doing');await p.locator('#form button[type=submit]').click();await p.waitForFunction(()=>!storageState.writing&&!document.getElementById('modal').open);
  let state=(await f.store.read()).data;const t=state.tasks.find(t=>t.title==='QA 下一步');assert.equal(t.status,'doing');assert.equal(t.subtasks.length,2);
  await p.evaluate(id=>productFocus(id),t.id);await p.evaluate(()=>nav('home'));assert.match(await p.locator('.product-primary').innerText(),/QA 下一步/);
  await p.evaluate(id=>productToggleTask(id,true),t.id);assert.equal((await f.store.read()).data.tasks.find(x=>x.id===t.id).done,true);
  await p.evaluate(id=>productToggleTask(id,false),t.id);assert.equal((await f.store.read()).data.tasks.find(x=>x.id===t.id).done,false);assert.equal((await f.store.read()).data.tasks.find(x=>x.id===t.id).subtasks.filter(x=>x.done).length,0);
  await p.evaluate(()=>nav('tasks'));await p.reload();await p.waitForFunction(()=>window.dashboardReady);assert.equal(await p.evaluate(()=>page),'tasks');await p.evaluate(()=>nav('review'));await p.goBack();assert.equal(await p.evaluate(()=>page),'tasks');await p.goForward();assert.equal(await p.evaluate(()=>page),'review');
  await p.keyboard.press('Control+k');await p.waitForFunction(()=>document.activeElement?.id==='life-input');assert.equal(await p.evaluate(()=>page),'home');
  await p.evaluate(()=>nav('aiCapture'));const before=(await f.store.read()).revision;await p.locator('#product-capture-text').fill('明天下午三点开会，晚上八点修改论文');await p.getByRole('button',{name:'整理一下',exact:true}).click();await p.waitForFunction(()=>captureUI.preview&&!captureUI.busy);assert.equal((await f.store.read()).revision,before);
  await p.locator('.product-preview details').evaluateAll(els=>els.forEach(e=>e.open=true));await p.getByLabel('预览标题 1').fill('修改论文摘要');await p.getByLabel('同时加入今日专注（仅任务）').first().check();await p.getByRole('button',{name:'确认保存所选内容',exact:true}).click();await p.waitForFunction(()=>!storageState.writing&&page==='tasks');state=(await f.store.read()).data;assert.equal(state.tasks.filter(t=>t.title==='修改论文摘要').length,1);assert.equal(state.tasks.filter(e=>e.title==='组会').length,1);assert.equal(state.tasks.find(e=>e.title==='组会').time,'15:00');assert.equal(state.tasks.find(t=>t.title==='修改论文摘要').scheduledDate,await p.evaluate(()=>today()));
  await p.evaluate(()=>nav('aiCapture'));await p.locator('#product-capture-text').fill('同一个批次');await p.getByRole('button',{name:'整理一下',exact:true}).click();await p.waitForFunction(()=>!captureUI.busy&&!!captureUI.error);assert.match(await p.locator('.product-error').innerText(),/已经保存/);assert.equal(calls,2);
  await p.route('**/api/ai/capture/text',r=>r.abort());await p.getByRole('button',{name:'整理一下',exact:true}).click();await p.waitForFunction(()=>!captureUI.busy&&!!captureUI.error);assert.equal(await p.locator('#product-capture-text').inputValue(),'同一个批次');await p.unroute('**/api/ai/capture/text');
  await mkdir(new URL('../.local/screenshots/',import.meta.url),{recursive:true});
  for(const [w,h] of [[1280,720],[1440,900],[1920,1080],[390,844]]){
   await p.setViewportSize({width:w,height:h});for(const section of ['home','plans','me','review','tasks','projects','aiCapture','timeline','roadmaps','inbox','dataManagement']){await p.evaluate(s=>nav(s),section);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${section} overflow at ${w}`)}
   await p.evaluate(()=>nav('home'));await p.screenshot({path:fileURLToPath(new URL(`../.local/screenshots/product-${w}.png`,import.meta.url)),fullPage:true});
  }
  await p.getByRole('button',{name:'打开导航',exact:true}).click();assert.equal(await p.locator('body').evaluate(e=>e.classList.contains('product-menu-open')),true);await p.locator('#nav button').filter({hasText:'计划'}).click();assert.equal(await p.locator('body').evaluate(e=>e.classList.contains('product-menu-open')),false);
  await p.evaluate(id=>productDelete('task',id),t.id);assert.ok(!(await f.store.read()).data.tasks.some(x=>x.id===t.id));await p.evaluate(()=>simpleDoUndo());assert.ok((await f.store.read()).data.tasks.some(x=>x.id===t.id));
  // Large/long records remain searchable and preserve the task route on reload.
  await p.evaluate(()=>runDatabaseCommand(()=>{for(let i=0;i<250;i++)data.tasks.push({id:uid(),title:'长任务 '+i+' '+('需要认真整理的内容'.repeat(10)),projectId:'',phaseId:'',done:false,subtasks:[]});save()}));
  await p.evaluate(()=>nav('tasks'));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.ok(await p.locator('.product-row').count()>=250);
  await p.reload();await p.waitForFunction(()=>window.dashboardReady);assert.equal(await p.evaluate(()=>page),'tasks');
  await p.evaluate(()=>productQuick());assert.equal(await p.locator('#capture-dialog').evaluate(e=>e.open),true);await p.evaluate(()=>simpleCloseCapture());
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await f.close()}
});
