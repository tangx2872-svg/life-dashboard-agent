// Loaded before app.js: all mutation paths use the same local commit and disk queue.
const storageState={base:null,local:'正在读取',disk:'未连接备份文件',lastBackup:'',handle:null,expected:null,ready:false,dirty:false,writing:null,timer:null,blocked:false,db:null,remembered:true};
try{storageState.base=localStorage.getItem('life-dashboard-v1')}catch{storageState.blocked=true}
storageState.hadLocal=!!storageState.base?.trim();
function storageShape(d){try{assertDashboardData(d);return true}catch{return false}}
async function requestPersistentStorage(){try{const granted=await navigator.storage?.persist?.();toast(granted?'浏览器已启用持久保留。手动清除网站数据仍会删除本地副本。':'浏览器暂未授予持久保留。普通本地保存仍可用，请保留硬盘备份。')}catch{toast('无法申请持久保留，普通本地保存仍可用。')}}
function paintStorage(){const box=document.getElementById('save-status');if(!box)return;box.innerHTML=`<strong>${esc(storageState.local)}</strong><span>${esc(storageState.disk)}</span><small>最后硬盘备份：${storageState.lastBackup?esc(new Date(storageState.lastBackup).toLocaleString('zh-CN')):'尚未完成'}</small>${storageState.handle?'<small>'+esc(storageState.handle.name)+'</small>':''}${!storageState.remembered?'<small>文件连接无法记住；重启后请重新选择。</small>':''}`;const b=document.getElementById('connect-backup');if(b){b.textContent=storageState.handle?'重新连接 / 立即备份':'选择自动备份文件';b.disabled=!!storageState.writing}}
function persistData(value){
  try{
    if(storageState.blocked||(typeof storageFailed!=='undefined'&&storageFailed))throw Error('本地数据读取异常，已暂停覆盖。请下载原始数据或合并恢复备份。');
    const current=localStorage.getItem(KEY);if(current!==storageState.base)throw Error('其他页面已修改数据，请先下载当前内容，刷新后合并恢复。');
    const json=JSON.stringify(value);localStorage.setItem(KEY,json);storageState.base=json;storageState.local='● 已保存到浏览器';storageState.dirty=true;
    if(storageState.ready)queueDiskBackup();paintStorage();return true;
  }catch(e){storageState.local='本地保存失败：'+e.message;paintStorage();throw e}
}
function storageDB(){if(storageState.db)return storageState.db;storageState.db=new Promise((resolve,reject)=>{if(!window.indexedDB){reject(Error('浏览器无法记住文件连接'));return}const r=indexedDB.open('life-dashboard-backups',1);r.onupgradeneeded=()=>r.result.createObjectStore('settings');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('请关闭其他旧版本页面后重试'))});return storageState.db}
async function setting(mode,value){const db=await storageDB();return new Promise((resolve,reject)=>{const tx=db.transaction('settings',mode),s=tx.objectStore('settings'),r=mode==='readonly'?s.get('disk'):s.put(value,'disk');let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('文件连接未保存'))})}
async function rememberBackup(){try{await setting('readwrite',{handle:storageState.handle,lastBackup:storageState.lastBackup,expected:storageState.expected});storageState.remembered=true}catch{storageState.remembered=false}paintStorage()}
async function digest(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('')}
function canonicalBackup(value){return JSON.stringify(value,function(k,v){if(k==='_restoreKey'||k==='restoreReceipts')return undefined;return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v})}
function checkBackup(value){if(!validData(value))throw Error('这不是有效的 Life Dashboard 完整备份。');const seen=new Set();const walk=v=>{if(!v||typeof v!=='object')return;if(v.id!==undefined){if(typeof v.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(v.id))throw Error('备份包含无效记录编号。');/* Receipt IDs occupy their own namespace. */}for(const [k,x] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('备份字段不安全。');if(x&&typeof x==='object')walk(x)}};walk(value);for(const list of ['projects','tasks','events','inbox','ideas','history','roadmaps'])for(const record of value[list]||[]){if(seen.has(record.id))throw Error('备份存在重复记录编号。');seen.add(record.id)}if(value.captureBatches!==undefined&&!Array.isArray(value.captureBatches))throw Error('导入批次记录损坏。');if(value.restoreReceipts!==undefined&&(!Array.isArray(value.restoreReceipts)||!value.restoreReceipts.every(x=>typeof x==='string')))throw Error('恢复记录损坏。');return value}
// A conflicting record is retained as a separate, linked recovery copy, never overwriting the current record.
async function mergeBackup(current,incoming){
  checkBackup(incoming);const receipt=await digest(canonicalBackup(incoming)),out=JSON.parse(JSON.stringify(current));
  if((out.restoreReceipts||[]).includes(receipt))return {value:out,added:0,conflicts:0,duplicate:true};
  const maps=new Map(),created=[];let added=0,conflicts=0;
  function indexNested(old,next){if(old.id)maps.set(old.id,next.id);for(const key of ['phases','tasks','notes'])if(Array.isArray(old[key]))old[key].forEach((item,i)=>indexNested(item,next[key][i]))}
  function newNestedIds(obj){if(obj.id)obj.id=uid();for(const key of ['phases','tasks','notes'])if(Array.isArray(obj[key]))obj[key].forEach(newNestedIds)}
  for(const kind of ['projects','roadmaps','tasks','events','inbox','ideas','history']){
    out[kind]||=[];
    for(const original of incoming[kind]||[]){
      const signature=await digest(kind+canonicalBackup(original));const prior=out[kind].find(x=>x._restoreKey===signature);if(prior){indexNested(original,prior);continue}
      const translated=JSON.parse(JSON.stringify(original));for(const key of ['projectId','phaseId','roadmapId','learningTaskId'])if(maps.has(translated[key]))translated[key]=maps.get(translated[key]);
      const existing=out[kind].find(x=>x.id===original.id);
      if(existing&&canonicalBackup(existing)===canonicalBackup(translated)){indexNested(original,existing);continue}
      const copy=translated;copy._restoreKey=signature;if(existing){newNestedIds(copy);conflicts++;if(['projects','roadmaps','tasks','events','inbox','ideas'].includes(kind))copy.title+='（恢复副本）'}
      indexNested(original,copy);out[kind].push(copy);created.push(copy);added++;
    }
  }
  const rebind=o=>{for(const key of ['projectId','phaseId','roadmapId','learningTaskId','historyId'])if(maps.has(o[key]))o[key]=maps.get(o[key]);for(const k of ['phases','tasks','notes'])if(Array.isArray(o[k]))o[k].forEach(rebind)};created.forEach(rebind);
  added+=incoming.categories.filter(c=>!out.categories.includes(c)).length;out.categories=[...new Set([...out.categories,...incoming.categories])];out.captureBatches||=[];for(const b of incoming.captureBatches||[]){const same=out.captureBatches.find(x=>x.id===b.id);if(!same)out.captureBatches.push(b);else if(same.content!==b.content&&!out.captureBatches.some(x=>x.content===b.content))out.captureBatches.push({...b,id:uid()})}
  out.restoreReceipts=[...new Set([...(out.restoreReceipts||[]),...(incoming.restoreReceipts||[]),receipt])];checkBackup(out);return {value:out,added,conflicts,duplicate:false};
}
function downloadValue(value,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function downloadRawLocal(){try{const raw=localStorage.getItem(KEY);if(raw)downloadValue(raw,'life-dashboard-original-local.json');else toast('没有可下载的原始本地数据。')}catch{toast('浏览器暂时不允许读取本地数据。')}}
async function restoreBackupFile(){throw Error('数据管理模块尚未加载，请刷新后再从备份恢复。')}
async function recoverLocalSaving(){if(!confirm('先下载一份原始本地数据，再用当前页面内容恢复浏览器保存？请保留下载文件，以便找回未能读取的内容。'))return;try{const original=localStorage.getItem(KEY);if(original)localStorage.setItem(KEY+'-recovery-'+Date.now(),original);downloadRawLocal();storageState.base=original;storageState.blocked=false;storageFailed=false;persistData(data);toast('本地保存已恢复。可以继续合并导入有效备份。')}catch(e){toast(e.message)}}
function queueDiskBackup(){if(!storageState.handle)return;clearTimeout(storageState.timer);if(!storageState.writing){storageState.disk='等待备份…';storageState.timer=setTimeout(()=>flushDiskBackup(),500)}paintStorage()}
async function flushDiskBackup(){
  if(storageState.writing)return storageState.writing;if(!storageState.handle||!storageState.dirty)return;
  const work=async()=>{
    while(storageState.dirty){
      if(await storageState.handle.queryPermission({mode:'readwrite'})!=='granted'){storageState.disk='需要重新连接：文件权限已失效';break}
      if(storageState.blocked||storageFailed){storageState.disk='本地数据异常，硬盘备份已暂停';break}
      const local=localStorage.getItem(KEY);if(local!==storageState.base){storageState.disk='其他页面已更新内容，请刷新后备份';break}
      const file=await storageState.handle.getFile(),content=await file.text();if(await digest(content)!==storageState.expected){storageState.disk='备份文件已被其他程序修改，请重新连接并合并';break}
      const snapshot=storageState.base;if(!snapshot)break;const diskSnapshot=JSON.stringify(fullBackupEnvelope(JSON.parse(snapshot),{fileName:storageState.handle.name,lastBackup:storageState.lastBackup}));storageState.disk='正在写入硬盘…';paintStorage();let writer;
      try{writer=await storageState.handle.createWritable();await writer.write(diskSnapshot);await writer.close()}catch(e){try{await writer?.abort()}catch{}throw e}
      storageState.expected=await digest(diskSnapshot);storageState.lastBackup=new Date().toISOString();storageState.dirty=storageState.base!==snapshot;storageState.disk=storageState.dirty?'等待写入最新更改…':'● 已备份到硬盘';await rememberBackup();
    }
  };
  storageState.writing=(navigator.locks?navigator.locks.request('life-dashboard-disk-backup',work):work()).catch(e=>{storageState.disk=(e.name==='NotAllowedError'?'需要重新连接：文件权限已失效':'硬盘备份失败，请重新连接重试：'+e.message)}).finally(()=>{storageState.writing=null;paintStorage()});paintStorage();return storageState.writing;
}
async function connectDiskBackup(){
  if(storageState.writing)return;if(!window.showSaveFilePicker){toast('当前浏览器不支持直接写入备份文件，请使用下载备份。');return}
  let handle;try{
    // Permission requests stay on the user gesture; startup never requests permission.
    handle=storageState.handle;const reconnect=!!handle;if(handle){if(await handle.requestPermission({mode:'readwrite'})!=='granted')throw Error('请允许写入文件，或选择新的备份文件。')}else handle=await window.showSaveFilePicker({suggestedName:'Life-Dashboard-auto-backup.json',types:[{description:'Life Dashboard JSON 备份',accept:{'application/json':['.json']}}]});
    if(storageState.blocked||storageFailed)throw Error('本地数据异常，暂不覆盖备份文件。请先恢复本地保存。');
    const file=await handle.getFile();if(file.size>20000000)throw Error('所选文件超过 20 MB，请改用新的备份文件。');const content=await file.text(),hash=await digest(content);
    if(content.trim()&&hash!==storageState.expected){let incoming;try{incoming=decodeFullBackup(content).data}catch{throw Error('文件已有其他内容或格式损坏，未覆盖。请新建一个 JSON 备份文件。')}if(sortedJson(incoming)!==sortedJson(data)){throw Error('此文件含有不同的备份状态，未覆盖。请在数据管理中从备份恢复，或选择新文件。')}}
    storageState.handle=handle;if(!reconnect)storageState.lastBackup='';storageState.expected=hash;storageState.dirty=true;await rememberBackup();await flushDiskBackup();
    if(navigator.storage?.persist)try{await navigator.storage.persist()}catch{}
  }catch(e){if(e.name!=='AbortError'){storageState.disk=e.message;toast(e.message)}paintStorage()}
}
async function changeDiskBackup(){if(storageState.writing)return;const old=storageState.handle,expected=storageState.expected;storageState.handle=null;storageState.expected=null;await connectDiskBackup();if(!storageState.handle){storageState.handle=old;storageState.expected=expected}paintStorage()}
async function initSaving(){
  const box=document.createElement('section');box.className='storage-panel';box.innerHTML='<h3>保存与备份</h3><div id="save-status" role="status" aria-live="polite"></div><button id="connect-backup" onclick="connectDiskBackup()">选择自动备份文件</button><button onclick="changeDiskBackup()">更换备份文件</button><button onclick="backup()">导出完整备份</button><button onclick="document.getElementById(\'import\').click()">从备份恢复</button><details><summary>保存设置与帮助</summary><button onclick="requestPersistentStorage()">申请浏览器持久保留</button><button onclick="downloadRawLocal()">下载原始本地数据</button><button onclick="recoverLocalSaving()">恢复本地保存</button><small>文件写入完成前请保持页面打开。浏览器不支持自动备份时，可下载备份保存到硬盘。</small></details>';
  document.querySelector('.sidebar-bottom').prepend(box);document.querySelectorAll('.sidebar-bottom > button,.sidebar-bottom > .saved').forEach(x=>x.hidden=true);
  document.getElementById('import').onchange=async e=>{try{await restoreBackupFile(e.target.files[0])}catch(err){toast('未恢复：'+err.message)}finally{e.target.value=''}};
  storageState.ready=true;storageState.local=storageFailed?'本地读取异常，已暂停覆盖':storageState.base?'● 已保存到浏览器':'尚未保存';
  if(!window.showSaveFilePicker)storageState.disk='浏览器不支持硬盘自动备份，可下载备份';
  try{const saved=await setting('readonly');if(saved?.handle){Object.assign(storageState,{handle:saved.handle,lastBackup:saved.lastBackup||'',expected:saved.expected||null});if(!storageState.hadLocal){storageState.expected=null;storageState.disk='本地原数据缺失，请重新连接并从硬盘合并恢复'}else if(await saved.handle.queryPermission({mode:'readwrite'})==='granted'){storageState.dirty=true;await flushDiskBackup()}else storageState.disk='需要重新连接：点击下方按钮授权'}}catch{storageState.remembered=false}
  paintStorage();window.addEventListener('beforeunload',e=>{if(storageState.writing||(storageState.handle&&storageState.dirty)){e.preventDefault();e.returnValue=''}});
  window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue!==storageState.base){storageState.local='其他页面已更新数据，请刷新后继续';storageState.disk='自动备份已暂停，避免覆盖其他页面';clearTimeout(storageState.timer);paintStorage()}});
}
