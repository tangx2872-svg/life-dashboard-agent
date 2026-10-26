const exportModules={projects:'长期事项',roadmaps:'学习路线',experiments:'实验',tasks:'独立日常任务'};
function exportRows(module){return module==='tasks'?data.tasks.filter(t=>!t.projectId):(data[module]||[])}
function selectedGPTContent(module,ids,brief=false){
 const rows=exportRows(module).filter(x=>ids.includes(x.id)),name=x=>({id:x.id,title:x.title});
 const task=t=>brief?{...name(t),stageId:t.phaseId,done:t.done,subtasks:(t.subtasks||[]).map((s,index)=>({index,title:s.title,done:s.done}))}:captureTaskDirectory(t);
 const output=rows.map(x=>{
  if(module==='projects')return {...name(x),...(!brief?{description:x.description,category:x.category,icon:x.icon,start:x.start,target:x.target}:{}),stages:x.phases.map(name),tasks:data.tasks.filter(t=>t.projectId===x.id).map(task)};
  if(module==='roadmaps')return {...name(x),...(!brief?{goal:x.goal,category:x.category,icon:x.icon}:{}),stages:x.phases.map(s=>({...name(s),tasks:s.tasks.map(t=>brief?{...name(t),done:t.done}:{...name(t),done:t.done,goal:t.goal,estimate:t.estimate,criteria:t.criteria,milestone:t.milestone})}))};
  if(module==='experiments')return brief?{...name(x),steps:x.steps.map(name)}:JSON.parse(JSON.stringify(x));
  return task(x);
 });return {[module]:output};
}
function gptExportText(module,ids,brief,withFormat){return (withFormat?GPT_FORMAT+'\n\n':'')+'以下仅为所选范围，不是全量数据或完整备份。未列出的内容不代表不存在，请勿删除或重建未提供的内容。'+(brief?'当前为精简目录，省略目标和长文；修改长文前请索取详细内容。':'')+'\n模块：'+exportModules[module]+'\n'+JSON.stringify(selectedGPTContent(module,ids,brief),null,2)}
function openGPTExport(module='projects',id){
 modal('选择复制给 GPT 的内容',`<label>模块<select id="gpt-export-module" onchange="refreshGPTExportRows()">${Object.entries(exportModules).map(([k,v])=>`<option value="${k}" ${k===module?'selected':''}>${v}</option>`).join('')}</select></label><div class="row-actions"><button type="button" onclick="selectGPTExportRows(true)">全选本模块</button><button type="button" onclick="selectGPTExportRows(false)">清空选择</button></div><div id="gpt-export-rows" style="max-height:240px;overflow:auto;margin:12px 0"></div><label>内容范围<select id="gpt-export-mode" onchange="refreshGPTExportSize()"><option value="full">详细内容（讨论与修改）</option><option value="brief">精简目录（名称、ID、任务状态）</option></select></label><label><input id="gpt-export-format" type="checkbox" checked style="width:auto" onchange="refreshGPTExportSize()"> 附带导入规范（同一对话已发过可取消）</label><p id="gpt-export-size" aria-live="polite"></p><p class="muted">建议一次选择 1 个事项或实验。内容较多时可下载文本文件发给 GPT；不会截断内容。</p><div class="row-actions"><button type="button" onclick="copySelectedGPTExport()">复制所选内容</button><button type="button" onclick="downloadSelectedGPTExport()">下载所选内容 .txt</button></div><textarea id="gpt-export-fallback" hidden readonly aria-label="手动复制导出内容"></textarea>`,()=>{});
 document.querySelector('#modal .modal-actions').style.display='none';
 document.getElementById('modal').addEventListener('close',()=>{document.querySelector('#modal .modal-actions').style.display=''},{once:true});
 refreshGPTExportRows(id);
}
function refreshGPTExportRows(id){const module=document.getElementById('gpt-export-module').value;document.getElementById('gpt-export-rows').innerHTML=exportRows(module).map(x=>`<label><input class="gpt-export-check" style="width:auto" type="checkbox" value="${x.id}" ${x.id===id?'checked':''} onchange="refreshGPTExportSize()"> ${esc(x.title)} <small>${esc(x.id.slice(0,8))}</small></label>`).join('')||'<p class="muted">此模块暂无内容。</p>';refreshGPTExportSize()}
function selectGPTExportRows(checked){document.querySelectorAll('.gpt-export-check').forEach(el=>el.checked=checked);refreshGPTExportSize()}
function currentGPTExport(){const module=document.getElementById('gpt-export-module').value,ids=[...document.querySelectorAll('.gpt-export-check:checked')].map(x=>x.value);return {ids,text:gptExportText(module,ids,document.getElementById('gpt-export-mode').value==='brief',document.getElementById('gpt-export-format').checked)}}
function refreshGPTExportSize(){const {ids,text}=currentGPTExport();document.getElementById('gpt-export-size').textContent=`已选 ${ids.length} 项 · 约 ${text.length.toLocaleString()} 字符 · ${(new Blob([text]).size/1024).toFixed(1)} KB`+(text.length>20000?'。内容较长，建议减少选择或下载文件。':'');const fallback=document.getElementById('gpt-export-fallback');fallback.hidden=true;fallback.value=''}
async function copySelectedGPTExport(){const {ids,text}=currentGPTExport();if(!ids.length)return toast('请先选择要复制的事项。');try{await navigator.clipboard.writeText(text);toast('已复制所选内容。')}catch{const el=document.getElementById('gpt-export-fallback');el.hidden=false;el.value=text;el.focus();el.select();toast('请在文本框中手动复制。')}}
function downloadSelectedGPTExport(){const {ids,text}=currentGPTExport();if(!ids.length)return toast('请先选择要导出的事项。');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Life-Dashboard-GPT-'+today()+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const copyCaptureGuideBeforeSelection=copyCaptureGuide;copyCaptureGuide=function(includeDirectory){return includeDirectory?openGPTExport():copyCaptureGuideBeforeSelection(false)};
copyExperiments=function(id){openGPTExport('experiments',id)};

