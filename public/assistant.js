const assistantState={scope:'',sessionId:null,messages:[],draft:'',proposal:null,busy:false,error:'',success:null,ready:false,statusLoaded:false,recording:false};
const assistantFieldNames={title:'名称',goal:'实验目的',content:'流程 / 方法',result:'结果 / 观察',supplement:'补充说明'};
let assistantRecognition=null;
async function loadAssistantStatus(){try{const response=await fetch('/api/assistant/status');if(!response.ok)throw Error();assistantState.ready=(await response.json()).ready;assistantState.statusLoaded=true;}catch{assistantState.statusLoaded=true;assistantState.ready=false;}if(page==='assistant')render();}
function assistantPage(){
  const s=assistantState,selected=(data.experiments||[]).find(e=>e.id===s.scope),disabled=s.busy||storageState.blocked;
  return heading('智能助手','把想法说出来，一起整理成可以执行的安排。',`<span class="assistant-status ${s.ready?'':'off'}">${s.ready?'● 助手已配置':'○ 助手尚未连接'}</span>`)+
    `<div class="assistant-scope"><label>操作范围<select aria-label="选择操作范围" ${s.busy?'disabled':''} onchange="changeAssistantScope(this.value)"><option value="">请选择一个实验</option><option value="new" ${s.scope==='new'?'selected':''}>＋ 新建实验</option>${(data.experiments||[]).map(e=>`<option value="${esc(e.id)}" ${s.scope===e.id?'selected':''}>${esc(e.title)}</option>`).join('')}</select></label><button onclick="resetAssistant()" ${s.busy?'disabled':''}>新对话</button><small>第一版 · 实验助手</small></div>`+
    (!s.ready?`<details class="assistant-connect"><summary>助手尚未连接 · 展开配置说明</summary><p>在项目本地的 <code>.env</code> 文件中填写 <code>OPENAI_API_KEY</code>，可设置 <code>OPENAI_MODEL</code>，保存后重启服务。密钥不要填写在聊天框里，也不要上传仓库。</p><button onclick="loadAssistantStatus()">重新检查连接</button></details>`:'')+
    `<div class="assistant-layout"><section class="card assistant-chat"><div class="assistant-panel-head"><h2>一起整理</h2><small>${selected?'仅处理所选实验':s.scope==='new'?'从一个新想法开始':'先选择操作范围'}</small></div><div class="assistant-messages" aria-live="polite">`+
    (s.messages.length?s.messages.map(m=>`<div class="assistant-message ${m.role==='user'?'user':'assistant'}"><small>${m.role==='user'?'你':'助手'}</small><div>${esc(m.text)}</div></div>`).join(''):
    `<div class="assistant-welcome"><span class="tag">想法 → 安排 → 行动</span><h3>今天想推进什么？</h3><p>可以问问当前进展，也可以调整实验步骤。<br>所有修改都会先放到右侧，等你确认。</p><div class="assistant-suggestions"><button onclick="assistantExample(0)">介绍一下这个实验已有的流程和结果 ↗</button><button onclick="assistantExample(1)">帮我补充一个实验步骤 ↗</button><button onclick="assistantExample(2)">我有一个新实验想法，帮我整理 ↗</button></div></div>`)+
    (s.busy?'<div class="assistant-message"><small>助手</small><div>正在处理，请稍候…</div></div>':'')+
    `</div>${s.error?`<div class="assistant-error" role="alert">${esc(s.error)}</div>`:''}<form class="assistant-compose" onsubmit="event.preventDefault();sendAssistant()"><textarea id="assistant-input" aria-label="告诉助手你的想法" placeholder="例如：增加一个光照对比步骤，保留现有实验结果……" maxlength="6000" ${disabled?'disabled':''} oninput="assistantState.draft=this.value">${esc(s.draft)}</textarea><div class="row-actions"><button type="button" class="${s.recording?'assistant-recording':''}" onclick="toggleAssistantVoice()" ${disabled?'disabled':''}>${s.recording?'■ 停止录音':'♩ 语音输入'}</button><button class="primary" type="submit" ${disabled||s.recording||!s.scope||!s.ready?'disabled':''}>发送 →</button></div><small>${s.recording?'正在聆听，停止后请检查识别文字。':'语音先转成文字，检查后再发送。修改前会请你确认。'}</small></form></section><section class="card assistant-preview"><div class="assistant-panel-head"><h2>待确认的修改</h2><small>${s.proposal?'尚未保存':'确认后才会保存'}</small></div>${assistantPreviewHtml()}</section></div><p class="assistant-footer">只使用你选中的实验内容。当前对话与未确认草案刷新后不保留，已确认的记录保存在数据库。</p>`;
}
function assistantPreviewHtml(){const s=assistantState,p=s.proposal;
  if(s.success)return `<div class="assistant-success"><strong>✓ 修改已保存</strong><p>新增 ${s.success.counts.add} 项 · 修改 ${s.success.counts.update} 项 · 删除 ${s.success.counts.delete} 项</p>${s.success.targetId&&(data.experiments||[]).some(e=>e.id===s.success.targetId)?`<button onclick="openExperiment('${s.success.targetId}')">查看实验 ↗</button>`:`<button onclick="nav('experiments')">查看实验列表 ↗</button>`}</div>`;
  if(!p)return '<div class="assistant-preview-empty"><span class="preview-symbol">◇</span><h3>每一步修改，都由你决定</h3><p>在左侧说说想查询或调整什么。<br>助手整理出的修改会显示在这里，<br>你可以继续讨论，也可以取消。</p></div>';
  const names={add:'＋ 新增',update:'✎ 修改',delete:'− 删除'};
  return `<div class="assistant-summary">${['add','update','delete'].map(op=>`<span>${names[op]} ${p.cards.filter(c=>c.op===op).length} 项</span>`).join('')}</div>`+p.cards.map(c=>`<article class="assistant-change ${c.op}"><span class="op">${names[c.op]} · ${c.kind==='experiment'?'实验':'实验步骤'}</span><h3>${esc(c.title)}</h3>${c.op==='delete'?`<p class="assistant-footer">${c.kind==='experiment'?`将删除这个实验及全部 ${c.stepCount} 个步骤、结果和补充说明。`:'将删除这一步及其结果、补充说明。'}</p>`:''}${c.fields.filter(f=>f.field!=='title'&&(f.before||f.after)).map(f=>`<div class="assistant-diff"><b>${assistantFieldNames[f.field]||esc(f.field)}</b>${c.op!=='add'?`<div class="assistant-before">原内容：${esc(f.before||'未填写')}</div>`:''}${c.op!=='delete'?`<div class="assistant-after">${c.op==='update'?'修改后：':''}${esc(f.after||'清空此项')}</div>`:''}</div>`).join('')}${c.op==='update'&&c.fields.some(f=>f.field==='title')?`<div class="assistant-diff"><b>名称</b><div class="assistant-before">${esc(c.fields.find(f=>f.field==='title').before)}</div><div class="assistant-after">${esc(c.fields.find(f=>f.field==='title').after)}</div></div>`:''}</article>`).join('')+
    `<div class="assistant-confirm"><p>还想调整？继续在左侧告诉助手。确认前不会改动记录，保存前会自动保留快照。</p><div class="row-actions"><button class="primary" onclick="confirmAssistantProposal()" ${s.busy||storageState.blocked?'disabled':''}>确认修改</button><button onclick="cancelAssistantProposal()" ${s.busy?'disabled':''}>取消</button></div></div>`;
}
async function assistantRequest(action,body){const response=await fetch('/api/assistant/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Dashboard-Token':dashboardBoot.csrf},body:JSON.stringify(body),signal:AbortSignal.timeout(action==='turn'?70000:20000)});let result;try{result=await response.json()}catch{throw Error('服务返回异常，请检查连接后重试。')}if(!response.ok)throw Error(result.error||'操作未完成');return result;}
function openAssistant(id){if(id&&id!==assistantState.scope){if(assistantState.busy)return toast('请等待当前请求完成');if(assistantState.proposal&&!confirm('切换实验会放弃当前未确认草案，继续吗？'))return;resetAssistantState(id);}nav('assistant');}
function resetAssistantState(scope=assistantState.scope){if(assistantRecognition){assistantRecognition.stop();assistantRecognition=null;}if(assistantState.sessionId)assistantRequest('cancel',{sessionId:assistantState.sessionId}).catch(()=>{});Object.assign(assistantState,{scope,sessionId:null,messages:[],draft:'',proposal:null,error:'',success:null,recording:false});}
function resetAssistant(){if(assistantState.busy)return;if((assistantState.messages.length||assistantState.proposal||assistantState.draft)&&!confirm('开始新对话？未确认的草案和对话会清除，已保存记录不受影响。'))return;resetAssistantState();render();}
function changeAssistantScope(scope){if(assistantState.busy)return;if((assistantState.messages.length||assistantState.proposal||assistantState.draft)&&!confirm('切换范围会开始新对话，当前未确认草案不会执行。继续吗？')){render();return;}resetAssistantState(scope);render();}
function assistantExample(index){const examples=['介绍一下这个实验已有的流程和结果，没有记录的部分请明确说明。','帮我补充一个实验步骤：','我想新建一个实验，目标是：'];assistantState.draft=examples[index];if(index===2&&!assistantState.messages.length)assistantState.scope='new';render();document.getElementById('assistant-input')?.focus();}
async function sendAssistant(){const s=assistantState;if(s.busy||s.recording||storageState.blocked)return;const message=s.draft.trim();if(!message)return;if(!s.ready){s.error='助手尚未连接，请先完成本地配置。';render();return;}if(!s.scope){s.error='请先选择一个实验，或选择新建实验。';render();return;}
  s.busy=true;s.error='';s.success=null;s.proposal=null;s.messages.push({role:'user',text:message});s.draft='';render();
  try{const result=await assistantRequest('turn',{scope:s.scope,sessionId:s.sessionId,message});s.sessionId=result.sessionId;s.messages.push({role:'assistant',text:result.message});s.proposal=result.proposal;}catch(e){s.error=e.name==='TimeoutError'?'助手等待超时。没有执行修改，请稍后重试。':e.message;s.draft=message;}finally{s.busy=false;render();scrollAssistantMessages();}}
function scrollAssistantMessages(){const messages=document.querySelector('.assistant-messages');if(messages)messages.scrollTop=messages.scrollHeight;}
async function cancelAssistantProposal(){const s=assistantState;if(s.busy||!s.proposal)return;s.busy=true;render();try{await assistantRequest('cancel',{sessionId:s.sessionId});s.proposal=null;s.messages.push({role:'assistant',text:'已取消这份草案，原有记录没有修改。'});s.error='';}catch(e){s.error=e.message;s.proposal=null;}finally{s.busy=false;render();}}
async function confirmAssistantProposal(){const s=assistantState;if(s.busy||!s.proposal||storageState.writing||storageState.blocked)return;
  if(s.proposal.cards.some(c=>c.op==='delete')&&!confirm('这份草案包含删除，请确认已核对右侧删除范围。确定执行吗？'))return;
  s.busy=true;s.error='';storageState.writing=true;busyUI(true);render();
  try{
    const result=await assistantRequest('commit',{sessionId:s.sessionId,proposalId:s.proposal.id,confirmed:true});
    s.proposal=null;
    const response=await fetch('/api/state',{cache:'no-store'});if(!response.ok)throw Error('修改已保存，但页面刷新失败。请刷新读取最新记录。');
    const latest=await response.json();assertDashboardData(latest.data);data=latest.data;dashboardBoot.csrf=latest.csrf;storageState.base=JSON.stringify(data);dashboardMemory.setItem(KEY,storageState.base);storageState.revision=latest.revision;storageState.lastBackup=latest.savedAt;storageState.local='● 已保存到 MySQL';
    s.success=result;s.messages.push({role:'assistant',text:'修改已确认保存，可以打开实验查看。'});
    // New experiments become selectable for the next round without reusing the create-only session.
    if(s.scope==='new'&&result.targetId){s.scope=result.targetId;s.sessionId=null;}
  }catch(e){s.error=e.message+' 请刷新读取数据库状态，再重新生成建议。';s.proposal=null;storageState.blocked=true;storageState.local='请刷新核对数据库状态';}
  finally{s.busy=false;storageState.writing=false;busyUI(false);render();paintStorage();}
}
function toggleAssistantVoice(){
  if(assistantState.recording){assistantRecognition?.stop();return;}
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){assistantState.error='当前浏览器不支持语音识别，请直接输入文字，或使用支持语音识别的浏览器。';render();return;}
  const recognition=new Speech();assistantRecognition=recognition;recognition.lang='zh-CN';recognition.interimResults=false;recognition.continuous=false;
  recognition.onresult=event=>{const text=event.results[0][0].transcript;assistantState.draft+=(assistantState.draft?'\n':'')+text;const input=document.getElementById('assistant-input');if(input)input.value=assistantState.draft;};
  recognition.onerror=event=>{assistantState.error=event.error==='not-allowed'?'未获得麦克风权限，请允许访问或直接输入文字。':'语音识别暂不可用，请重试或输入文字。';};
  recognition.onend=()=>{assistantState.recording=false;assistantRecognition=null;if(page==='assistant')render();};
  try{recognition.start();assistantState.recording=true;assistantState.error='';render();}catch{assistantState.error='无法启动语音识别，请直接输入文字。';assistantState.recording=false;render();}
}
// Keep manual JSON as a backup tool; normal navigation uses the assistant.
importPage=function(){return heading('手动 JSON 导入','高级工具 · 用于已有格式的内容迁移和调试。',`<button onclick="openAssistant()">返回智能助手 ↗</button>`)+`<label for="capture-json">粘贴变更 JSON</label><textarea id="capture-json" class="capture-code" spellcheck="false" oninput="changeCapture(this.value)">${esc(importDraft)}</textarea><div class="row-actions" style="margin:12px 0 24px"><button class="primary" onclick="previewCapture()">检查并预览</button><button onclick="document.getElementById('capture-file').click()">选择 JSON 文件</button><input id="capture-file" hidden type="file" accept=".json,application/json" onchange="readCaptureFile(this)"><button onclick="copyCaptureGuide(true)">导出指定内容与 ID</button></div><div id="capture-preview">${previewCaptureHtml()}</div><details><summary>格式说明</summary><pre class="capture-spec">${esc(GPT_FORMAT)}</pre></details>`;};
const beforeAssistantRender=render;
render=function(){beforeAssistantRender();
  const button=document.querySelector('#nav button[onclick="nav(\'gptImport\')"]');if(button){button.setAttribute('onclick','openAssistant()');button.innerHTML='<i>✧</i>智能助手';button.classList.toggle('active',page==='assistant');}
  if(page==='assistant'&&!document.getElementById('search').value.trim()){document.getElementById('app').innerHTML=assistantPage();document.getElementById('crumb').textContent='智能助手';}
  if(page==='gptImport')document.getElementById('crumb').textContent='高级工具 / 手动导入';
};
window.addEventListener('beforeunload',event=>{if(assistantState.busy||assistantState.proposal){event.preventDefault();event.returnValue='';}});
render();
