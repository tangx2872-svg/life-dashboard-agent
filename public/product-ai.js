const captureUI={text:'',busy:false,error:'',preview:null,projectId:'',recording:false,transcribing:false};
function productAIPage(){const p=captureUI.preview;return heading('快速记录','想到什么就记下来，整理后再确认。')+`<section class="product-panel"><div class="product-steps"><span class="${p?'':'is-on'}">01 输入想法</span><span class="${p?'is-on':''}">02 检查计划</span><span>03 确认保存</span></div><label>想记录什么？<textarea id="product-capture-text" rows="4" maxlength="4000" placeholder="例如：明天下午三点开会，晚上八点修改论文" oninput="captureUI.text=this.value" ${captureUI.busy||captureUI.recording||captureUI.transcribing?'disabled':''}>${esc(captureUI.text)}</textarea></label><details><summary>项目归属（可选）</summary><label>项目<select onchange="captureUI.projectId=this.value" ${captureUI.busy?'disabled':''}><option value="">日常任务</option>${simpleProjects().map(p=>`<option value="${p.key}" ${captureUI.projectId===p.key?'selected':''}>${esc(p.title)}</option>`).join('')}</select></label></details><div class="row-actions ai-actions"><button class="primary" onclick="productParse()" ${captureUI.busy||captureUI.recording||captureUI.transcribing?'disabled':''}>${captureUI.busy?'正在整理…':'整理一下'}</button><button class="product-voice ${captureUI.recording?'is-recording':''}" onclick="productVoice()" ${captureUI.busy||captureUI.transcribing?'disabled':''} aria-pressed="${captureUI.recording}">${captureUI.transcribing?'正在识别录音…':captureUI.recording?'■ 结束录音':'● 开始语音输入'}</button>${productAudio.blob&&!captureUI.transcribing?'<button onclick="productTranscribe()">重试语音识别</button>':''}${captureUI.text?'<button onclick="captureUI.text=\'\';render()" '+(captureUI.busy||captureUI.recording?'disabled':'')+'>清空</button>':''}</div><p class="product-hint" role="status">${captureUI.recording?'正在录音 <span id="voice-duration">00:00</span>，讲完后点击结束。':captureUI.transcribing?'正在把录音转成文字，请稍候。':'录音结束后由 AI 转写，也可以直接打字。内容会发送给已配置的 AI 服务，只有你确认后才写入 MySQL。'}</p>${captureUI.error?`<p class="product-error" role="alert">${esc(captureUI.error)}。可以保留文字后重试。</p>`:''}</section>${p?`<section class="product-panel"><h2>检查这 ${p.items.length} 项内容</h2><p class="product-hint">标题、类型、日期、补充内容均可修改。不需要的项取消勾选。</p><div class="product-preview">${p.items.map((x,i)=>`<article><label><input type="checkbox" style="display:inline;width:auto" ${x.selected?'checked':''} onchange="captureUI.preview.items[${i}].selected=this.checked"> 保存这项</label><details><summary>${esc(x.title)} · ${x.kind==='task'?'任务':x.kind==='project'?'项目':'记录'} · ${esc(simpleProject(x.projectKey)?.title||'暂不归类')}</summary><label>标题<input aria-label="预览标题 ${i+1}" maxlength="500" value="${esc(x.title)}" oninput="captureUI.preview.items[${i}].title=this.value"></label><label>项目<select onchange="captureUI.preview.items[${i}].projectKey=this.value">${simpleProjectOptions().map(([v,n])=>`<option value="${v}" ${v===x.projectKey?'selected':''}>${esc(n)}</option>`).join('')}</select></label><label>类型<select onchange="captureUI.preview.items[${i}].kind=this.value">${[['task','任务'],['project','项目'],['record','记录']].map(([v,n])=>`<option value="${v}" ${x.kind===v?'selected':''}>${n}</option>`).join('')}</select></label><label>日期<input type="date" value="${esc(x.date)}" onchange="captureUI.preview.items[${i}].date=this.value"></label><label>时间（可选）<input type="time" value="${esc(x.time||'')}" onchange="captureUI.preview.items[${i}].time=this.value"></label><label>补充<textarea rows="3" oninput="captureUI.preview.items[${i}].note=this.value">${esc(x.note)}</textarea></label><label><input type="checkbox" style="display:inline;width:auto" ${x.today?'checked':''} onchange="captureUI.preview.items[${i}].today=this.checked"> 同时加入今日专注（仅任务）</label>${x.start?`<small>识别时间：${esc(x.start)}${x.end?' — '+esc(x.end):''}</small>`:''}</details></article>`).join('')}</div><div class="product-toolbar"><button class="primary" onclick="productCommitCapture()">确认保存所选内容</button><button onclick="captureUI.preview=null;render()">放弃预览</button></div></section>`:''}`}
async function productParse(){
  if(captureUI.busy||captureUI.recording||captureUI.transcribing)return;if(!captureUI.text.trim())return toast('先写下你的想法。');
  captureUI.busy=true;captureUI.error='';captureUI.preview=null;render();
  try{
    const result=await productAPI.capture(captureUI.text.trim()),c=result.capture;
    if(result.status!=='ok'||!c||!Array.isArray(c.items)||!c.batchId)throw Error('AI 返回格式不完整');
    if((data.captureBatches||[]).some(b=>b.id===c.batchId))throw Error('该批内容已经保存，请勿重复导入');
    captureUI.preview={batchId:c.batchId,base:storageState.revision,projectId:captureUI.projectId,items:c.items.map(x=>({selected:true,title:x.title||'',projectKey:captureUI.projectId||simpleRecommendProject((x.title||'')+' '+(x.note||'')),kind:({task:'task',event:'task',inbox:'record',idea:'record',record:'record',project:'project'})[x.type]||'record',date:(x.start_datetime||'').slice(0,10),time:(x.start_datetime||'').slice(11,16),start:x.start_datetime||'',end:x.end_datetime||'',note:x.note||''}))};
  }catch(e){captureUI.error=e.name==='TimeoutError'?'AI 服务响应超时':e.message||'AI 服务暂时不可用'}
  finally{captureUI.busy=false;render()}
}
async function productCommitCapture(){
  const p=captureUI.preview;if(!p||storageState.writing)return;
  if(p.base!==storageState.revision)return toast('预览期间数据已变化，请重新整理，避免写入过期计划。');
  if((data.captureBatches||[]).some(b=>b.id===p.batchId))return toast('这批内容已保存，不能重复导入。');
  const items=p.items.filter(x=>x.selected);
  if(!items.length)return toast('至少选择一项。');
  if(items.some(x=>!x.title.trim()||!['task','record','project'].includes(x.kind)||x.kind==='event'&&!/^\d{4}-\d{2}-\d{2}$/.test(x.date)))return toast('请填写标题、选择类型，并为日程填写日期。');
  if(p.projectId&&!simpleProject(p.projectId))return toast('关联事项已不存在，请重新整理。');
  if(items.some(x=>x.kind==='project'&&simpleProjects().some(p=>normalizedName(p.title)===normalizedName(x.title))))return toast('已有同名项目，请修改标题或直接在现有项目下添加任务。');
  if(items.some(x=>x.projectKey&&!simpleProject(x.projectKey)))return toast('所选项目已不存在，请重新选择。');
  const focusIds=data.todayFocus?.date===today()?[...data.todayFocus.taskIds]:[];
  if(focusIds.length+items.filter(x=>x.kind==='task'&&x.today).length>4)return toast('今日专注最多四项，请减少勾选或先调整今日安排。');
  if(captureUI.origin&&JSON.stringify(data[captureUI.origin.source]?.find(x=>x.id===captureUI.origin.id))!==captureUI.origin.snapshot)return toast('原记录已变化，请重新整理。');
  const result=await runDatabaseCommand(()=>{
    const saved=[];const now=new Date().toISOString();for(const x of items){
      const destination=x.projectKey||p.projectId;const common={id:uid(),title:x.title.trim(),source:'ai-capture',aiGenerated:true,createdAt:now,updatedAt:now,description:x.note,time:x.time||''};
      // Preserve original parsed timestamps separately: editing the schedule date must not leave an active conflicting time.
      if(x.kind==='task')data.tasks.push({...common,projectId:simpleProject(destination)?.kind==='project'?destination:'',projectKey:destination,phaseId:'',done:false,status:'todo',priority:'normal',date:x.date,dueDate:x.date,subtasks:[],parsedStart:x.start,parsedEnd:x.end});
      else if(x.kind==='event')data.events.push({...common,projectId:p.projectId,date:x.date,done:false,parsedStart:x.start,parsedEnd:x.end});
      else if(x.kind==='project'){const created=simpleNewProject(common.title,x.note);common.id=created.id}else{const created=simpleNewRecord(common.title,x.note,destination);common.id=created.id}
      if(captureUI.origin){const entry=x.kind==='task'?data.tasks.find(t=>t.id===common.id):x.kind==='project'?data.projects.find(t=>t.id===common.id):data.records.find(t=>t.id===common.id);entry.sourceSnapshot=JSON.parse(captureUI.origin.snapshot);}
      saved.push({kind:x.kind,key:common.id,title:common.title,label:x.kind==='task'?'任务':x.kind==='project'?'项目':'记录',destination:simpleProject(destination)?.title||(x.kind==='project'?'项目':x.kind==='task'?'任务 · 无项目':'记录')});
      if(x.kind==='task'&&x.today)data.tasks.find(t=>t.id===common.id).scheduledDate=today();
    }
    if(captureUI.origin){const {source,id}=captureUI.origin;data[source]=data[source].filter(x=>x.id!==id);}
    (data.captureBatches??=[]).push({id:p.batchId,date:now,count:items.length,content:JSON.stringify(items)});save();simpleAnnounce(saved);toast(`已保存 ${items.length} 项内容`);
  });
  if(result?.ok){captureUI.preview=null;captureUI.origin=null;captureUI.text='';simpleCloseCapture();nav(items.every(x=>x.kind==='record')?'records':items.every(x=>x.kind==='project')?'projects':'tasks')}
}
const productAudio={recorder:null,stream:null,chunks:[],blob:null,base:'',timer:null,starting:false,cancelled:false};
function productVoiceRender(){if(document.getElementById('capture-dialog')?.open)simpleRenderCapture();else if(page==='aiCapture')render()}
async function productVoice(){
 if(captureUI.busy||captureUI.transcribing)return;
 if(productAudio.starting){productAudio.cancelled=true;return}
 if(productAudio.recorder?.state==='recording'){productAudio.recorder.stop();return}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return toast('当前浏览器不支持录音，请使用新版 Chrome、Edge 或 Safari，或直接输入文字。');
 productAudio.starting=true;productAudio.cancelled=false;captureUI.recording=true;captureUI.error='';productVoiceRender();
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(productAudio.cancelled){stream.getTracks().forEach(t=>t.stop());captureUI.recording=false;return}
  productAudio.stream=stream;
  const type=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!type)throw Error('当前浏览器没有支持的录音格式，请换用 Chrome 或 Edge。');
  const recorder=new MediaRecorder(stream,{mimeType:type});productAudio.recorder=recorder;productAudio.chunks=[];productAudio.blob=null;productAudio.base=captureUI.text;
  let bytes=0,failed=false;
  recorder.ondataavailable=e=>{if(e.data.size){bytes+=e.data.size;if(bytes>20*1024*1024){failed=true;captureUI.error='录音超过20MB，请分段录音';if(recorder.state==='recording')recorder.stop()}else productAudio.chunks.push(e.data)}};
  recorder.onerror=()=>{failed=true;captureUI.error='录音失败，请检查麦克风后重试';if(recorder.state==='recording')recorder.stop()};
  recorder.onstop=async()=>{
   clearTimeout(productAudio.timer);clearInterval(productAudio.clock);stream.getTracks().forEach(t=>t.stop());productAudio.recorder=null;productAudio.stream=null;captureUI.recording=false;
   if(productAudio.cancelled){productVoiceRender();return}
   if(failed){productVoiceRender();return}
   productAudio.blob=new Blob(productAudio.chunks,{type});productAudio.chunks=[];
   if(!productAudio.blob.size){captureUI.error='录音为空，请重新录音';productVoiceRender();return}
   await productTranscribe();
  };
  recorder.start(1000);productAudio.startedAt=Date.now();productAudio.clock=setInterval(()=>{const el=document.getElementById('voice-duration');const seconds=Math.floor((Date.now()-productAudio.startedAt)/1000);if(el)el.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')},1000);productAudio.timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},120000);
 }catch(e){captureUI.recording=false;productAudio.stream?.getTracks().forEach(t=>t.stop());productAudio.stream=null;captureUI.error=e.name==='NotAllowedError'?'麦克风权限未开启，请允许访问后重试':e.message||'无法启动录音';}
 finally{productAudio.starting=false;productVoiceRender()}
}
async function productTranscribe(){
 if(!productAudio.blob||captureUI.transcribing||captureUI.recording)return;
 productAudio.base=captureUI.text;captureUI.transcribing=true;captureUI.error='';productVoiceRender();
 try{const result=await productAPI.transcribe(productAudio.blob);const combined=productAudio.base+(productAudio.base?'\n':'')+result.transcript;if(combined.length>4000)throw Error('文字超过4000字，请缩短原文后重试');captureUI.text=combined;productAudio.blob=null;toast('录音已转成文字，请检查后再整理为行动。')}
 catch(e){captureUI.error=e.message||'语音识别失败，可以重试或直接输入文字'}
 finally{captureUI.transcribing=false;productVoiceRender()}
}
function productAsk(pid=''){captureUI.projectId=pid;productQuick()}
