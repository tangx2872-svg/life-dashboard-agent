// Server-backed state: this Map is only a temporary in-memory compatibility adapter.
const dashboardMemory={values:new Map([['life-dashboard-v1',JSON.stringify(window.dashboardBoot.data)]]),getItem(k){return this.values.get(k)??null},setItem(k,v){this.values.set(k,String(v))}};
const storageState={base:JSON.stringify(window.dashboardBoot.data),revision:window.dashboardBoot.revision,lastBackup:window.dashboardBoot.savedAt,local:'● 已从 MySQL 读取',disk:'数据库自动保存操作前快照',handle:null,hadLocal:true,ready:true,blocked:false,writing:false,command:false};
function storageShape(d){try{assertDashboardData(d);return true}catch{return false}}
function persistData(value){try{if(!storageState.command||storageState.blocked)throw Error('保存入口未就绪，请刷新');assertDashboardData(value);const json=JSON.stringify(value);dashboardMemory.setItem('life-dashboard-v1',json);storageState.base=json;storageState.staged=true;return true}catch(e){storageState.failure=e;throw e}}
function paintStorage(){const box=document.getElementById('save-status');if(box)box.innerHTML='<strong>'+esc(storageState.local)+'</strong><small>最近数据库保存：'+esc(storageState.lastBackup?new Date(storageState.lastBackup).toLocaleString('zh-CN'):'尚未保存')+'</small><small>版本：'+storageState.revision+'</small>';}
function downloadValue(value,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function restoreBackupFile(){throw Error('数据管理模块尚未加载')}
