import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixture} from './helpers.mjs';
import {buildDemo} from '../scripts/demo-data.mjs';
import {emptyData} from '../server/schema.mjs';

const SENTENCE='这周我要把论文改完，周六想休息。';

test('Life: one sentence becomes a plan, then Undo puts everything back',{skip:!process.env.BROWSER_MODULE},async()=>{
 const {chromium}=await import(pathToFileURL(process.env.BROWSER_MODULE));
 // No AI backend: the planner must still produce a sensible plan from its own rules.
 const f=await fixture({aiClient:null});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const seed=buildDemo(emptyData()).candidate;await f.store.commit({data:seed,revision:0,requestId:randomUUID(),reason:'life QA'});
  const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push('[console] '+m.text())});
  await p.goto(f.url);await p.waitForFunction(()=>window.dashboardReady);

  // The first thing on the page is a question, not a table.
  assert.equal(await p.locator('#life-input').count(),1);
  assert.match(await p.locator('.hero h1').innerText(),/想安排/);

  await p.locator('#life-input').fill(SENTENCE);
  await p.locator('#life-input').press('Enter');
  await p.waitForSelector('.result-panel',{timeout:20000});
  const message=await p.locator('.result-msg').innerText();
  assert.match(message,/整理好了/);
  const steps=await p.locator('.plan-preview li').count();
  assert.ok(steps>=4,`应拆成多步，实际 ${steps}`);
  const preview=await p.locator('.plan-preview').innerText();
  assert.ok(!preview.includes('周六'),'周六被留空');

  // Nothing is written before the user accepts.
  const before=(await f.store.read()).data;
  assert.equal(before.projects.filter(x=>x.source==='planner').length,0);

  await p.getByRole('button',{name:'就这样',exact:true}).click();
  await p.waitForSelector('.undo-bar',{timeout:20000});
  const after=(await f.store.read()).data;
  const created=after.projects.filter(x=>x.source==='planner');
  assert.equal(created.length,1);
  const tasks=after.tasks.filter(t=>t.projectId===created[0].id);
  assert.ok(tasks.length>=4,'计划里的步骤都写进了数据库');
  assert.ok(tasks.every(t=>/^\d{4}-\d{2}-\d{2}$/.test(t.scheduledDate)),'每一步都有日期');
  assert.ok(tasks.every(t=>!['周六'].includes(['周日','周一','周二','周三','周四','周五','周六'][new Date(t.scheduledDate).getDay()])),'周六没有排任务');

  // Today's list picks up whatever lands today, without the user choosing anything.
  await p.evaluate(()=>nav('home'));
  assert.ok(await p.locator('.today-list li').count()>=1,'今天有安排');
  assert.match(await p.locator('.product-primary').innerText(),/今天/);

  // Undo instead of another confirmation dialog.
  await p.locator('.undo-bar').getByRole('button',{name:'撤销',exact:true}).click();
  await p.waitForFunction(()=>!storageState.writing&&!document.querySelector('.undo-bar'),{timeout:20000});
  const undone=(await f.store.read()).data;
  assert.equal(undone.projects.filter(x=>x.source==='planner').length,0,'撤销后计划被撤回');
 }finally{await browser.close();await f.close()}
});

test('Life: plans, review and me stay two levels deep and hide developer tools',{skip:!process.env.BROWSER_MODULE},async()=>{
 const {chromium}=await import(pathToFileURL(process.env.BROWSER_MODULE));
 const f=await fixture({aiClient:null});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const seed=buildDemo(emptyData()).candidate;await f.store.commit({data:seed,revision:0,requestId:randomUUID(),reason:'life IA QA'});
  const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push('[console] '+m.text())});
  await p.goto(f.url);await p.waitForFunction(()=>window.dashboardReady);

  assert.deepEqual((await p.locator('#nav button').allInnerTexts()).map(t=>t.replace(/\s+/g,'')),['⌂首页','▦计划','◴回顾','◍我']);

  await p.evaluate(()=>nav('plans'));
  const groups=await p.locator('.plan-group h3').count();
  assert.ok(groups>=1,'计划按分类聚合');
  await p.locator('.polish-project').first().click();
  await p.waitForFunction(()=>page==='plan');
  assert.ok(await p.locator('.plan-timeline').count()>=1);
  assert.match(await p.locator('main').innerText(),/与 AI 调整/);

  // Developer tools are not reachable from ordinary navigation.
  await p.evaluate(()=>nav('me'));
  assert.equal(await p.locator('#nav button').filter({hasText:'JSON'}).count(),0);
  assert.equal(await p.getByRole('button',{name:'JSON 导入'}).count(),0);
  await p.locator('summary',{hasText:'开发者'}).click();
  await p.getByLabel(/开发者模式/).check();
  await p.waitForFunction(()=>!!document.getElementById('dev-storage'));
  assert.equal(await p.getByRole('button',{name:'JSON 导入'}).count(),1,'开发者模式才出现');
  assert.ok(await p.locator('#storage-panel').isVisible(),'数据库状态只在开发者里');

  await mkdir(new URL('../.local/screenshots/',import.meta.url),{recursive:true});
  for(const [w,h] of [[1280,720],[390,844]]){
   await p.setViewportSize({width:w,height:h});
   for(const section of ['home','plans','me','review']){
    await p.evaluate(s=>nav(s),section);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${section} overflow at ${w}`);
   }
   await p.evaluate(()=>nav('home'));await p.screenshot({path:fileURLToPath(new URL(`../.local/screenshots/life-${w}.png`,import.meta.url)),fullPage:true});
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await f.close()}
});
