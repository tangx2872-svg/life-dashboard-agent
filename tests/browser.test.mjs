import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { fixture } from './helpers.mjs';
test('Browser: original UI operations persist to MySQL without localStorage', {skip:!process.env.BROWSER_MODULE},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.BROWSER_MODULE).href);
  const f=await fixture(),browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    // Browsing data unavailable: real app must still load and save.
    await context.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('localStorage deliberately disabled')}})});
    await page.goto(f.url);try{await page.waitForFunction(()=>window.dashboardReady,{},{timeout:10000})}catch(e){console.log('Startup errors:',errors,await page.locator('#app').innerText());throw e}
    const result=await page.evaluate(async()=>{
      const checks=[],ok=(n,v)=>{if(!v)throw Error(n);checks.push(n)};
      nav('gptImport');
      const packet={format:'life-dashboard.capture',version:2,batchId:'standalone-browser-test',items:[{kind:'project',title:'浏览器测试项目',stages:[{title:'准备',tasks:[{title:'任务一',subtasks:['子任务一','子任务二']},{title:'任务二'}]}]},{kind:'experiment',title:'浏览器测试实验',goal:'验证保存',steps:[{title:'步骤一',content:'原内容'}]}]};
      document.getElementById('capture-json').value=JSON.stringify(packet);previewCapture();ok('导入预览不修改',data.projects.length===0);await commitCapture();ok('导入保存',data.projects.length===1);
      const p=data.projects[0],t=data.tasks[0];await toggleSub(t.id,0,true);ok('部分子任务保留',data.tasks[0].subtasks[0].done&&!data.tasks[0].done);
      openProject(p.id);document.getElementById('note-input').value='持久笔记';await addNote(p.id);
      const experiment=data.experiments[0];experimentStepForm(experiment.id);const form=document.getElementById('form');form.elements.namedItem('title').value='步骤二';form.elements.namedItem('content').value='从表单添加';await form.onsubmit({preventDefault(){},target:form});ok('表单保存后关闭',!document.getElementById('modal').open&&data.experiments[0].steps.length===2);
      const before=JSON.stringify(data);await moveProjectTask(p.id,t.id,1);ok('排序保存',data.tasks[1].id===t.id);
      nav('gptImport');document.getElementById('capture-json').value=JSON.stringify(packet);previewCapture();ok('重复批次拒绝',!!importError);
      const backup=await (await fetch('/api/backup')).json();await deleteManaged('project',p.id);ok('删除关联任务',data.tasks.length===0);
      restorePreview={...decodeFullBackup(backup),base:JSON.stringify(data)};await applyFullRestore();ok('备份恢复任务笔记与顺序',data.projects[0].notes[0].text==='持久笔记'&&data.tasks[1].id===t.id&&data.tasks[1].subtasks[0].done);
      return {checks,data:JSON.parse(JSON.stringify(data))};
    });
    assert.deepEqual((await f.store.read()).data,result.data);
    await context.close();const fresh=await browser.newContext();const again=await fresh.newPage();await again.goto(f.url);await again.waitForFunction(()=>window.dashboardReady);assert.deepEqual(await again.evaluate(()=>data),result.data);
    // Other tab updates: stale save must not overwrite the newer state.
    const other=await fresh.newPage();await other.goto(f.url);await other.waitForFunction(()=>window.dashboardReady);await again.evaluate(()=>capture('第一个页面'));await other.evaluate(()=>capture('不应覆盖'));
    assert.equal((await f.store.read()).data.inbox[0].title,'第一个页面');assert.equal(await other.evaluate(()=>storageState.blocked),true);
    await again.reload();await again.waitForFunction(()=>window.dashboardReady);
    await again.route('**/api/state',route=>route.request().method()==='PUT'?route.abort():route.continue());
    const beforeFailure=(await f.store.read()).data;await again.evaluate(()=>capture('网络失败不得保存'));assert.deepEqual((await f.store.read()).data,beforeFailure);assert.equal(await again.evaluate(()=>storageState.blocked),true);
    await again.unroute('**/api/state');await again.reload();await again.waitForFunction(()=>window.dashboardReady);await again.setViewportSize({width:390,height:844});assert.equal(await again.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);console.log('Browser checks:',result.checks.join(', '),'; clean browser reload; concurrency; network failure; mobile layout');
  }finally{await browser.close();await f.close()}
});
