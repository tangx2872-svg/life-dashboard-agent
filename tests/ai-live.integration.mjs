// Explicitly opt in: one real provider call may incur cost. All database writes use a disposable test schema.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './helpers.mjs';
import {createAIBackendClient,aiBackendConfig} from '../server/ai-backend-client.mjs';

test('LIVE: browser → Dashboard proxy → configured AI Backend → GPT → preview → test database',{
 skip:process.env.RUN_LIVE_AI!=='1',timeout:90000
},async()=>{
 assert.ok(process.env.BROWSER_MODULE,'Set BROWSER_MODULE to Playwright');
 const config=aiBackendConfig();const ai=createAIBackendClient(config);assert.deepEqual(await ai.check_health(),{status:'ok'});
 const f=await fixture({aiClient:ai});let browser;
 try{
  const {chromium}=await import(pathToFileURL(process.env.BROWSER_MODULE));browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(f.url+'/#/aiCapture');await page.waitForFunction(()=>window.dashboardReady);
  const input='明天下午三点开会，晚上八点修改论文';await page.locator('#product-capture-text').fill(input);const started=performance.now();
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/ai/capture/text'));
  await page.getByRole('button',{name:'整理为行动',exact:true}).click();const response=await responsePromise;const payload=await response.json();assert.equal(response.status(),200,JSON.stringify(payload));
  await page.waitForFunction(()=>!captureUI.busy&&!!captureUI.preview);const elapsedMs=Math.round(performance.now()-started);assert.ok(payload.capture.items.length>0);assert.equal((await f.store.read()).revision,0);
  await mkdir(new URL('../.local/screenshots/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../.local/screenshots/merged-ai-live-preview.png',import.meta.url)),fullPage:true});
  // Confirm one generated record only; no writes to the user's configured database.
  await page.evaluate(()=>{captureUI.preview.items.forEach((x,i)=>{x.selected=i===0});captureUI.preview.items[0].kind='task';render()});
  await page.getByRole('button',{name:'确认保存所选内容',exact:true}).click();await page.waitForFunction(()=>page==='tasks'&&!storageState.writing);
  const state=await f.store.read();assert.equal(state.data.tasks.length,1);assert.equal(state.data.tasks[0].title,payload.capture.items[0].title);await page.reload();await page.waitForFunction(()=>window.dashboardReady);assert.match(await page.locator('#app').innerText(),new RegExp(state.data.tasks[0].title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  const report={status:'passed',createdAt:new Date().toISOString(),input,elapsedMs,items:payload.capture.items,timings:payload.timings,previewWrites:0,confirmedTestTasks:1,productionDatabaseModified:false};
  await writeFile(new URL('../.local/ai-live-result.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(browser)await browser.close();await f.close()}
});
