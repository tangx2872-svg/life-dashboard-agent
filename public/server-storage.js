// Synchronous business rules are retained. A command stages their result in memory,
// waits for the database transaction, then exposes success. No browser persistence.
const databaseRender=render,databaseToast=toast;
render=function(){if(!storageState.command)databaseRender();};
toast=function(message){if(storageState.command)storageState.messages.push(message);else databaseToast(message);};
function busyUI(on){
  document.querySelector('.shell').inert=on;
  document.querySelector('aside').inert=on;
  document.getElementById('form').inert=on;
  const floating=document.querySelector('.floating');if(floating)floating.disabled=on;
  let overlay=document.getElementById('database-busy');
  if(!overlay){overlay=document.createElement('div');overlay.id='database-busy';overlay.setAttribute('role','status');overlay.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#264e40;color:white;padding:14px 24px;border-radius:12px;z-index:99999';document.body.append(overlay);}
  overlay.textContent='正在保存到 MySQL，请稍候…';overlay.hidden=!on;
}
function runDatabaseCommand(action){
  // Nested existing functions execute within the same staging transaction.
  if(storageState.command)return action();
  if(storageState.writing||storageState.blocked){databaseToast('请等待保存完成；如连接失败，请先刷新重新连接。');return Promise.resolve(false);}
  return (async()=>{
    const before=JSON.parse(storageState.base),memoryBefore=new Map(dashboardMemory.values);
    storageState.pendingReceipt=null;storageState.pendingUndo=null;storageState.messages=[];storageState.command=true;storageState.staged=false;storageState.reason='保存更改';storageState.failure=null;
    let result,writeAttempted=false;
    try{
      result=action();
      if(result&&typeof result.then==='function')throw Error('保存回调必须同步计算修改内容');
      if(storageState.failure)throw storageState.failure;
      const json=JSON.stringify(data);
      if(json!==storageState.base&&!storageState.staged)throw Error('修改没有经过统一保存入口');
      storageState.command=false;
      if(storageState.staged&&json!==JSON.stringify(before)){
        storageState.writing=true;storageState.local='正在保存到 MySQL';busyUI(true);paintStorage();
        writeAttempted=true;
        const response=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Dashboard-Token':dashboardBoot.csrf},body:JSON.stringify({data,revision:storageState.revision,requestId:crypto.randomUUID(),reason:storageState.reason}),signal:AbortSignal.timeout(20000)});
        const reply=await response.json();if(!response.ok)throw Error(reply.error||'数据库保存失败');
        storageState.revision=reply.revision;storageState.lastBackup=reply.savedAt;
        storageState.base=json;dashboardMemory.setItem(KEY,json);storageState.local='● 已保存到 MySQL';
      }
      storageState.writing=false;busyUI(false);if(storageState.pendingUndo){simpleUndo=storageState.pendingUndo;storageState.pendingUndo=null;}if(storageState.pendingReceipt){simpleReceipt=storageState.pendingReceipt;storageState.pendingReceipt=null;}render();paintStorage();
      if(storageState.messages.length)databaseToast(storageState.messages.at(-1));
      return {ok:true,value:result};
    }catch(e){
      storageState.pendingReceipt=null;storageState.pendingUndo=null;data=before;dashboardMemory.values=memoryBefore;storageState.base=JSON.stringify(before);
      storageState.command=false;storageState.writing=false;storageState.blocked=writeAttempted;
      storageState.local=writeAttempted?'保存未确认：请刷新重新连接':'● 数据未修改';busyUI(false);render();paintStorage();
      databaseToast(writeAttempted?'未确认保存：'+e.message+'。请刷新读取数据库最新状态后再操作。':'未保存：'+e.message);return {ok:false};
    }finally{storageState.command=false;}
  })();
}
// Wrap public mutation entrypoints, preserving calls among old business functions.
for(const name of ['save','completeTask','completeProject','finishPhase','removePhase','toggleSub','addNote','finishEvent','archiveIdea','removeItem','capture','captureHome','addInbox','toggleLearning','saveLearningNote','moveLearning','moveStage','deleteLearning','setHomeFocus','shiftHome','moveProjectTask','deleteManaged','deleteHistoryRecord','deleteCardItem','saveExperimentItem','deleteExperimentItem','commitCapture','applyFullRestore']){
  const fn=window[name];if(typeof fn==='function')window[name]=function(...args){return runDatabaseCommand(()=>fn.apply(this,args));};
}
// The original form callback computes synchronously; close only after durable success.
modal=function(title,fields,submit){
  document.getElementById('modal-title').textContent=title;document.getElementById('fields').innerHTML=fields;
  document.getElementById('form').onsubmit=async event=>{
    event.preventDefault();if(storageState.writing)return;
    const f=Object.fromEntries(new FormData(event.target));
    if(Object.values(f).some(v=>typeof v==='string'&&v.length>20000)){toast('内容过长，请分段记录。');return;}
    if('title'in f&&!f.title.trim()){toast('请填写内容。');return;}
    const result=await runDatabaseCommand(()=>submit(f));if(result?.ok)closeModal();
  };
  document.getElementById('modal').showModal();
};
safetyCheckpoint=function(label){storageState.reason=label;return fullBackupEnvelope(JSON.parse(storageState.base));};
downloadCheckpoint=async function(){try{const rows=await (await fetch('/api/snapshots')).json();if(!rows.length)return toast('尚无操作前快照。');const response=await fetch('/api/snapshots/'+rows[0].revision);if(!response.ok)throw Error('快照读取失败');downloadValue(await response.json(),'Life-Dashboard-before-change.json');}catch(e){toast(e.message)}};
backup=async function(){try{const response=await fetch('/api/backup');if(!response.ok)throw Error('无法读取数据库备份');downloadValue(await response.json(),'Life-Dashboard-full-'+today()+'.json');toast('已从 MySQL 导出完整备份。');}catch(e){toast('备份未下载：'+e.message)}};
async function initSaving(){
  const box=document.createElement('section');box.className='storage-panel';box.innerHTML='<h3>数据库保存</h3><div id="save-status" role="status" aria-live="polite"></div><button onclick="location.reload()">重新连接 / 刷新</button><button onclick="backup()">导出完整备份</button><button onclick="document.getElementById(\'import\').click()">从旧站备份恢复</button><button onclick="downloadCheckpoint()">下载操作前快照</button><small>内容保存在 MySQL，关闭浏览器不会删除。每次修改自动保留操作前状态（最近 30 次）。</small>';
  document.querySelector('.sidebar-bottom').prepend(box);document.querySelectorAll('.sidebar-bottom > button,.sidebar-bottom > .saved').forEach(x=>x.hidden=true);
  document.getElementById('import').onchange=async event=>{try{await restoreBackupFile(event.target.files[0])}catch(e){toast('未恢复：'+e.message)}finally{event.target.value=''}};
  window.addEventListener('beforeunload',event=>{if(storageState.writing){event.preventDefault();event.returnValue='';}});
  paintStorage();
}

