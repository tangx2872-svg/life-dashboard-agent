const captureUI={text:'',busy:false,error:'',preview:null,projectId:'',recording:false};
function productAIPage(){const p=captureUI.preview;return heading('AI Capture','说清想法，检查计划，再决定保存什么。')+`<section class="product-panel"><div class="product-kicker">01 输入 → 02 编辑预览 → 03 确认保存</div><label>想记录什么？<textarea id="product-capture-text" rows="4" maxlength="4000" placeholder="例如：明天下午三点开会，晚上八点修改论文" oninput="captureUI.text=this.value" ${captureUI.busy||captureUI.recording?'disabled':''}>${esc(captureUI.text)}</textarea></label><label>保存到事项（可选）<select onchange="captureUI.projectId=this.value" ${captureUI.busy?'disabled':''}><option value="">日常任务</option>${data.projects.map(p=>`<option value="${p.id}" ${captureUI.projectId===p.id?'selected':''}>${esc(p.title)}</option>`).join('')}</select></label><div class="row-actions"><button class="primary" onclick="productParse()" ${captureUI.busy||captureUI.recording?'disabled':''}>${captureUI.busy?'正在整理…':'整理为行动'}</button><button class="product-voice ${captureUI.recording?'is-recording':''}" onclick="productVoice()" ${captureUI.busy?'disabled':''} aria-pressed="${captureUI.recording}">${captureUI.recording?'■ 结束录音':'● 开始语音输入'}</button><span role="status">${captureUI.recording?'正在聆听，讲完后点击结束录音':'支持直接打字，也可以录音后编辑文字'}</span><button onclick="nav('gptImport')">高级 JSON 导入</button></div><p class="product-hint">内容会发送给已配置的 AI 服务。只有你确认后才写入 MySQL；不会自动修改现有事项。</p>${captureUI.error?`<p class="product-error" role="alert">${esc(captureUI.error)}。可以保留文字后重试。</p>`:''}</section>${p?`<section class="product-panel"><h2>检查这 ${p.items.length} 项内容</h2><p class="product-hint">标题、类型、日期、补充内容均可修改。不需要的项取消勾选。</p><div class="product-preview">${p.items.map((x,i)=>`<article><label><input type="checkbox" style="display:inline;width:auto" ${x.selected?'checked':''} onchange="captureUI.preview.items[${i}].selected=this.checked"> 保存这项</label><label>标题<input aria-label="预览标题 ${i+1}" maxlength="500" value="${esc(x.title)}" oninput="captureUI.preview.items[${i}].title=this.value"></label><label>类型<select onchange="captureUI.preview.items[${i}].kind=this.value">${[['','请选择类型'],['task','任务'],['event','日程'],['inbox','待整理想法']].map(([v,n])=>`<option value="${v}" ${x.kind===v?'selected':''}>${n}</option>`).join('')}</select></label><label>日期<input type="date" value="${esc(x.date)}" onchange="captureUI.preview.items[${i}].date=this.value"></label><label>时间（可选）<input type="time" value="${esc(x.time||'')}" onchange="captureUI.preview.items[${i}].time=this.value"></label><label>补充<textarea rows="3" oninput="captureUI.preview.items[${i}].note=this.value">${esc(x.note)}</textarea></label><label><input type="checkbox" style="display:inline;width:auto" ${x.today?'checked':''} onchange="captureUI.preview.items[${i}].today=this.checked"> 同时加入今日专注（仅任务）</label>${x.start?`<small>识别时间：${esc(x.start)}${x.end?' — '+esc(x.end):''}</small>`:''}</article>`).join('')}</div><div class="product-toolbar"><button class="primary" onclick="productCommitCapture()">确认保存所选内容</button><button onclick="captureUI.preview=null;render()">放弃预览</button></div></section>`:''}`}
async function productParse(){
  if(captureUI.busy||captureUI.recording)return;if(!captureUI.text.trim())return toast('先写下你的想法。');
  captureUI.busy=true;captureUI.error='';captureUI.preview=null;render();
  try{
    const result=await productAPI.capture(captureUI.text.trim()),c=result.capture;
    if(result.status!=='ok'||!c||!Array.isArray(c.items)||!c.batchId)throw Error('AI 返回格式不完整');
    if((data.captureBatches||[]).some(b=>b.id===c.batchId))throw Error('该批内容已经保存，请勿重复导入');
    captureUI.preview={batchId:c.batchId,base:storageState.revision,projectId:captureUI.projectId,items:c.items.map(x=>({selected:true,title:x.title||'',kind:({task:'task',event:'event',inbox:'inbox',idea:'inbox'})[x.type]||'',date:(x.start_datetime||'').slice(0,10),time:(x.start_datetime||'').slice(11,16),start:x.start_datetime||'',end:x.end_datetime||'',note:x.note||''}))};
  }catch(e){captureUI.error=e.name==='TimeoutError'?'AI 服务响应超时':e.message||'AI 服务暂时不可用'}
  finally{captureUI.busy=false;if(page==='aiCapture')render()}
}
async function productCommitCapture(){
  const p=captureUI.preview;if(!p||storageState.writing)return;
  if(p.base!==storageState.revision)return toast('预览期间数据已变化，请重新整理，避免写入过期计划。');
  if((data.captureBatches||[]).some(b=>b.id===p.batchId))return toast('这批内容已保存，不能重复导入。');
  const items=p.items.filter(x=>x.selected);
  if(!items.length)return toast('至少选择一项。');
  if(items.some(x=>!x.title.trim()||!['task','event','inbox'].includes(x.kind)||x.kind==='event'&&!/^\d{4}-\d{2}-\d{2}$/.test(x.date)))return toast('请填写标题、选择类型，并为日程填写日期。');
  if(p.projectId&&!project(p.projectId))return toast('关联事项已不存在，请重新整理。');
  const focusIds=data.todayFocus?.date===today()?[...data.todayFocus.taskIds]:[];
  if(focusIds.length+items.filter(x=>x.kind==='task'&&x.today).length>4)return toast('今日专注最多四项，请减少勾选或先调整今日安排。');
  const result=await runDatabaseCommand(()=>{
    const now=new Date().toISOString();for(const x of items){
      const common={id:uid(),title:x.title.trim(),source:'ai-capture',aiGenerated:true,createdAt:now,updatedAt:now,description:x.note,time:x.time||''};
      // Preserve original parsed timestamps separately: editing the schedule date must not leave an active conflicting time.
      if(x.kind==='task')data.tasks.push({...common,projectId:p.projectId,phaseId:'',done:false,status:'todo',priority:'normal',date:x.date,dueDate:x.date,subtasks:[],parsedStart:x.start,parsedEnd:x.end});
      else if(x.kind==='event')data.events.push({...common,projectId:p.projectId,date:x.date,done:false,parsedStart:x.start,parsedEnd:x.end});
      else data.inbox.push({...common,date:today()});
      if(x.kind==='task'&&x.today)focusIds.push(common.id);
    }
    if(items.some(x=>x.kind==='task'&&x.today))data.todayFocus={date:today(),taskIds:focusIds};
    (data.captureBatches??=[]).push({id:p.batchId,date:now,count:items.length,content:JSON.stringify(items)});save();toast(`已保存 ${items.length} 项内容`);
  });
  if(result?.ok){captureUI.preview=null;captureUI.text='';nav('tasks')}
}
let productRecognition=null;
function productVoice(){
 if(captureUI.busy)return;
 if(productRecognition){productRecognition.stop();return}
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition)return toast('当前浏览器不支持语音输入，请使用系统听写或直接输入文字。');
 const recognition=new Recognition(),base=captureUI.text;
 productRecognition=recognition;captureUI.recording=true;
 recognition.lang='zh-CN';recognition.continuous=true;recognition.interimResults=true;
 const update=()=>{if(page==='aiCapture')render()};
 recognition.onresult=e=>{
  if(productRecognition!==recognition)return;
  // Results are the current session's cumulative list. Rebuild rather than append each interim revision.
  const parts=Array.from(e.results,r=>r[0]?.transcript||'');
  captureUI.text=(base+(base&&parts.length?'\n':'')+parts.join('')).slice(0,4000);
  const input=document.getElementById('product-capture-text');if(input)input.value=captureUI.text;
 };
 recognition.onerror=e=>toast(e.error==='not-allowed'?'麦克风权限未开启，请允许访问或直接输入文字。':'语音输入已中断，可以检查文字后继续。');
 recognition.onend=()=>{if(productRecognition!==recognition)return;productRecognition=null;captureUI.recording=false;update()};
 try{recognition.start();update()}catch{productRecognition=null;captureUI.recording=false;update();toast('无法启动录音，请检查麦克风权限。')}
}
function productAsk(pid=''){captureUI.projectId=pid;nav('aiCapture')}
