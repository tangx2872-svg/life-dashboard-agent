import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { fixture } from './helpers.mjs';
test('Assistant B UI: preview, revise, cancel, confirm, voice text and mobile', {skip:!process.env.BROWSER_MODULE},async()=>{
 const {chromium}=await import(pathToFileURL(process.env.BROWSER_MODULE).href);
 let calls=0;
 const f=await fixture({assistantOptions:{ready:()=>true,model:async ctx=>{calls++;return {type:'proposal',reminders:[{title:'演示提醒',at:new Date(Date.now()+86400000).toISOString(),note:'先做第一步',basis:'测试用户明确要求明天提醒'}],message:'已整理，请检查右侧。<script>不应执行</script>',operations:ctx.scope==='new'?[{op:'add',kind:'experiment',title:'照度对比实验',goal:ctx.message},{op:'add',kind:'experiment_step',experiment:'照度对比实验',title:'固定拍摄条件',content:'固定相机参数，记录照度'}]:[{op:'update',kind:'experiment',id:ctx.experiment.id,expectedTitle:ctx.experiment.title,goal:ctx.message}]}}}});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(f.url);await page.waitForFunction(()=>window.dashboardReady);await page.locator('#nav button').filter({hasText:'AI Capture'}).click();await page.getByRole('button',{name:'对话助手',exact:true}).click();
  await page.getByLabel('选择操作范围').selectOption('new');
  const send=async text=>{await page.getByLabel('告诉助手你的想法').fill(text);await page.getByRole('button',{name:'发送 →',exact:true}).click();await page.waitForFunction(()=>!assistantState.busy&&assistantState.proposal)};
  await send('观察光照对检测的影响');assert.equal((await f.store.read()).data.experiments.length,0);assert.equal(await page.locator('.assistant-change').count(),2);
  await page.getByRole('button',{name:'取消',exact:true}).click();await page.waitForFunction(()=>!assistantState.busy&&!assistantState.proposal);assert.equal((await f.store.read()).revision,0);
  await send('比较两种光照');await send('比较三种光照');assert.equal((await f.store.read()).revision,0);
  await mkdir(new URL('../.local/screenshots/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../.local/screenshots/assistant-desktop.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1'),fullPage:true});
  await page.getByRole('button',{name:'确认修改',exact:true}).click();await page.waitForFunction(()=>!assistantState.busy&&assistantState.success);assert.equal((await f.store.read()).data.experiments[0].goal,'比较三种光照');assert.equal((await f.store.read()).data.reminders.length,1);
  await send('保持相机固定并比较三个照度');assert.match(await page.locator('.assistant-before').innerText(),/比较三种光照/);assert.equal((await f.store.read()).data.experiments[0].goal,'比较三种光照');
  await page.getByRole('button',{name:'确认修改',exact:true}).click();await page.waitForFunction(()=>!assistantState.busy&&assistantState.success);
  const count=calls;await page.evaluate(()=>{window.SpeechRecognition=class{start(){setTimeout(()=>{this.onresult({results:[[{transcript:'语音测试文字'}]]});this.onend()},30)}stop(){this.onend()}};toggleAssistantVoice()});await page.waitForFunction(()=>!assistantState.recording);assert.match(await page.getByLabel('告诉助手你的想法').inputValue(),/语音测试文字/);assert.equal(calls,count);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:new URL('../.local/screenshots/assistant-mobile.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1'),fullPage:true});
  await page.evaluate(()=>nav('dataManagement'));assert.equal(await page.getByText('高级工具',{exact:false}).count()>0,true);
  await page.evaluate(()=>nav('gptImport'));assert.equal(await page.locator('#capture-json').count(),1);assert.deepEqual(errors,[]);
 }finally{await browser.close();await f.close()}
});
