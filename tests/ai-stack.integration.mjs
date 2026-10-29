// Explicit integration suite: real Python HTTP process + Node proxy + isolated MySQL + browser.
// LLM/ASR are forced to mock. This suite never calls a real model or uses the user's database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import net from 'node:net';
import {once} from 'node:events';
import {fixture} from './helpers.mjs';
import {createAIBackendClient} from '../server/ai-backend-client.mjs';

test('Integrated Python → Node → browser preview → confirmed MySQL → offline isolation',{timeout:60000},async()=>{
 const python=process.env.AI_PYTHON||fileURLToPath(new URL(process.platform==='win32'?'../.local/ai-venv/Scripts/python.exe':'../.local/ai-venv/bin/python',import.meta.url));
 assert.ok(existsSync(python),'Install the isolated AI Python environment first');
 assert.ok(process.env.BROWSER_MODULE,'Set BROWSER_MODULE to Playwright for the full integration test');
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const pythonProcess=spawn(python,['-m','uvicorn','app:app','--host','127.0.0.1','--port',String(port)],{cwd:fileURLToPath(new URL('../ai-backend/',import.meta.url)),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1',ASR_PROVIDER:'mock',LLM_PROVIDER:'mock',AUTODL_LLM_API_KEY:'',OPENAI_API_KEY:'',UPLOAD_DIR:fileURLToPath(new URL('../.local/integration-uploads/',import.meta.url)),LOG_LEVEL:'WARNING',APP_ENV:'test'}});
 let logs='',processError;pythonProcess.on('error',e=>processError=e);pythonProcess.stderr.on('data',d=>logs=(logs+d).slice(-5000));pythonProcess.stdout.on('data',()=>{});
 let f,browser;const baseUrl=`http://127.0.0.1:${port}`;
 try{
  let health;for(let i=0;i<100;i++){if(processError)throw processError;if(pythonProcess.exitCode!==null)throw Error(logs);try{const r=await fetch(baseUrl+'/health');if(r.ok){health=await r.json();break}}catch{}await delay(100)}
  assert.equal(health?.status,'ok',logs);assert.equal(health.providers.llm,'mock');
  const ai=createAIBackendClient({baseUrl,timeoutS:5});assert.deepEqual(await ai.check_health(),{status:'ok'});
  const parsed=await ai.parse_text_capture('整合测试：检查论文引用');assert.equal(parsed.capture.items[0].title,'整合测试：检查论文引用');assert.equal(typeof parsed.timings.validation_ms,'number');
  f=await fixture({aiClient:ai});assert.equal((await fetch(f.url+'/api/ai/health')).status,200);
  const boot=await(await fetch(f.url+'/api/state')).json();
  const voice=await fetch(f.url+'/api/ai/audio/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav','X-Dashboard-Token':boot.csrf},body:Buffer.from('RIFF____WAVEfmt test audio')});assert.equal(voice.status,200);assert.ok((await voice.json()).transcript);assert.equal((await f.store.read()).revision,0);
  assert.equal((await fetch(f.url+'/api/ai/audio/transcribe',{method:'POST'})).status,403);
  assert.equal((await fetch(f.url+'/api/ai/audio/transcribe',{method:'POST',headers:{'Content-Type':'text/plain','X-Dashboard-Token':boot.csrf},body:'not audio'})).status,415);
  const {chromium}=await import(pathToFileURL(process.env.BROWSER_MODULE));browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(f.url+'/#/aiCapture');await page.waitForFunction(()=>window.dashboardReady);
  const before=await f.store.read();await page.locator('#product-capture-text').fill('整合测试：检查论文引用');await page.getByRole('button',{name:'整理为行动',exact:true}).click();await page.waitForFunction(()=>captureUI.preview&&!captureUI.busy);assert.equal((await f.store.read()).revision,before.revision);
  await page.getByLabel('预览标题 1').fill('已确认的论文检查');await page.getByRole('button',{name:'确认保存所选内容',exact:true}).click();await page.waitForFunction(()=>page==='tasks'&&!storageState.writing);assert.equal((await f.store.read()).data.tasks.filter(t=>t.title==='已确认的论文检查').length,1);
  await page.reload();await page.waitForFunction(()=>window.dashboardReady);assert.match(await page.locator('#app').innerText(),/已确认的论文检查/);
  const exited=once(pythonProcess,'exit');pythonProcess.kill();await exited;
  const offline=await fetch(f.url+'/api/ai/health');assert.equal(offline.status,503);assert.equal((await offline.json()).error.code,'AI_BACKEND_UNAVAILABLE');
  await page.evaluate(()=>nav('aiCapture'));await page.locator('#product-capture-text').fill('服务离线时保留的文字');await page.getByRole('button',{name:'整理为行动',exact:true}).click();await page.waitForFunction(()=>!captureUI.busy&&!!captureUI.error);assert.match(await page.locator('.product-error').innerText(),/暂时不可用/);
  assert.equal((await fetch(f.url+'/api/state')).status,200);assert.equal((await f.store.read()).data.tasks.length,1);assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(f)await f.close();if(pythonProcess.exitCode===null&&!pythonProcess.killed){const exited=once(pythonProcess,'exit');pythonProcess.kill();await exited}}
});
