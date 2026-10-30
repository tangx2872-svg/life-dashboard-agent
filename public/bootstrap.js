// Load the server's committed state BEFORE any existing page scripts run.
(async()=>{
  const app=document.getElementById('app');app.textContent='正在读取 MySQL 中的数据…';
  try{
    if(window.lifeAuthStart&&!await lifeAuthStart())return;
    const response=await fetch('/api/state',{cache:'no-store'});
    if(!response.ok)throw Error('无法读取数据库，请检查后端与 MySQL');
    window.dashboardBoot=await response.json();
    for(const src of ['data-schema.js','storage.js','app.js','roadmap.js','capture-edits.js','gpt-import.js','home-order.js','data-management.js','experiments.js','gpt-export.js','server-storage.js','assistant.js','reminders.js','simple-model.js','product-api.js','product-tasks.js','product-ai.js','product-pages.js','simple-workflows.js','simple-pages.js','life-planner.js','life-home.js','life-plans.js','life-me.js','product-shell.js','voice-dashboard.js','ui-polish.js','agent-ui.js','demo-ui.js']){
      await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('无法加载 '+src));document.body.append(script);});
    }
    await initSaving();await loadAssistantStatus();window.dashboardReady=true;
  }catch(e){app.replaceChildren();const title=document.createElement('h2');title.textContent='暂时无法打开控制台';const note=document.createElement('p');note.textContent=e.message+'。没有创建或覆盖任何数据。';const retry=document.createElement('button');retry.textContent='重新连接';retry.onclick=()=>location.reload();app.append(title,note,retry);}
})();
