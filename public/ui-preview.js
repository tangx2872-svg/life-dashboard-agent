// Loaded only by scripts/preview-ui.mjs; the normal index.html never includes it.
window.lifePreview=true;
const uiPreviewDevice=new Map();
window.lifeDevice={async get(key){return uiPreviewDevice.get(key)},async put(key,value){uiPreviewDevice.set(key,value)},async remove(key){uiPreviewDevice.delete(key)}};
window.lifeAuthStart=async function(){const response=await fetch('/api/auth/me');if(!response.ok)throw Error('无法加载本地预览');window.lifeAccount=await response.json();return true};
window.addEventListener('load',()=>{
 const timer=setInterval(()=>{
  if(!window.dashboardReady)return;clearInterval(timer);
  const label=document.querySelector('.life-account-label');if(label){label.textContent='UI 预览 · 示例数据 · 内存保存';label.title='交互变化仅保存在本次预览服务的内存中';label.onclick=()=>toast('当前是本地 UI 预览，无需登录。')}
  const reset=document.querySelector('.life-account-join');if(reset){reset.textContent='重置示例';reset.onclick=async()=>{reset.disabled=true;try{const response=await fetch('/api/preview/reset',{method:'POST',headers:{'X-Dashboard-Token':dashboardBoot.csrf}});if(!response.ok)throw Error('重置失败，请刷新重试');location.reload()}catch(error){reset.disabled=false;toast(error.message)}}}
  const privacy=document.querySelector('.life-privacy-entry');if(privacy){privacy.textContent='预览说明';privacy.onclick=()=>polishPanel('ui-preview-info','本地 UI 预览','<p>使用现有虚构示例，展示首页、Today、计划、Review 和 Agent 对话界面。</p><p>勾选、编辑与确认方案的变化仅保存在预览服务内存中，点击“重置示例”或重启服务即可恢复。</p><p>Agent 返回固定的示例方案，未调用真实模型。语音转写等功能需要完整后端。</p>')}
  const originalBusy=busyUI;busyUI=function(on){originalBusy(on);const box=document.getElementById('database-busy');if(box&&on)box.textContent='正在更新预览示例…'};
  const originalPaint=paintStorage;paintStorage=function(){if(!storageState.blocked)storageState.local=storageState.writing?'正在更新内存示例':'● 本地 UI 预览 · 内存保存';originalPaint()};paintStorage();
  backup=async function(){try{const response=await fetch('/api/backup');if(!response.ok)throw Error('示例导出失败');downloadValue(await response.json(),'Life-UI-preview.json');toast('已导出当前示例数据。')}catch(error){toast(error.message)}};
 },100);
});
