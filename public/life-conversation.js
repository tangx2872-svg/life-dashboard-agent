// One continuous planning conversation: utterances and questions stay visible,
// while the plan itself is a single card that is replaced in place on every revision.
const lifeConvState={turns:[],draft:'',editing:null,custom:'',request:0,controller:null,state:'idle',error:'',errorKind:'',tech:'',proposalId:null,version:0,current:null,inline:false,pendingAdjust:''};
const LIFE_CONV_PLACEHOLDER='继续说，或者直接讲下一步…';
function lifeConvId(){return 't'+Math.random().toString(36).slice(2,9)}
function lifeConvDraft(){const input=document.getElementById('life-input');return input?input.value:(lifeConvState.draft||'')}
function lifeConvLastUser(){const rows=lifeConvState.turns.filter(t=>t.role==='user');return rows[rows.length-1]||null}
function lifeConvPending(){const rows=lifeConvState.turns.filter(t=>t.type==='clarification');const last=rows[rows.length-1];if(!last)return null;const open=(last.questions||[]).filter(q=>!q.answer);return open.length?last:(last.questions||[]).length?null:last}
function lifeConvErrorText(e){
  const message=String(e?.message||'');
  if(e?.name==='TimeoutError'||e?.code==='AI_BACKEND_TIMEOUT'||/超时|过长/.test(message))return '这次响应有点慢，你的内容都还在。';
  if(/失效|过期/.test(message))return '刚才的方案过期了，你说的内容没有丢。';
  return '刚才整理时出了点问题，你说的内容还在。';
}
function lifeConvRetryable(e){
  if(e?.name==='TimeoutError')return false;
  return ['AI_BACKEND_UNAVAILABLE','AI_BACKEND_INVALID_RESPONSE','AI_CAPTURE_FAILED'].includes(String(e?.code||''))||/格式|不完整|解析|不可用/.test(String(e?.message||''));
}
function lifeConvPush(turn){lifeConvState.turns.push({id:lifeConvId(),...turn});return lifeConvState.turns[lifeConvState.turns.length-1]}
// --- rendering -----------------------------------------------------------
function lifeConvQuestionHtml(turn,q){
  const key=turn.id+':'+q.id,open=lifeConvState.custom===key,inputId=`life-custom-${turn.id}-${q.id}`;
  if(q.answer)return `<div class="turn-question"><p class="turn-ask">${esc(q.question)}</p><p class="turn-answer">✓ ${esc(q.answer)}</p></div>`;
  const custom=q.allowCustom!==false;
  return `<div class="turn-question"><p class="turn-ask">${esc(q.question)}</p><div class="clarification-options">${(q.options||[]).map(o=>`<button type="button" class="chip" onclick="lifeConvPick('${turn.id}','${esc(q.id)}','${esc(o.label)}')">${esc(o.label)}</button>`).join('')}${custom?`<button type="button" class="chip chip-quiet" onclick="lifeConvCustom('${turn.id}','${esc(q.id)}','open')">自己填写</button>`:''}</div>${custom?`<div class="turn-custom" ${open?'':'hidden'}><input id="${inputId}" placeholder="用自己的话说" aria-label="${esc(q.question)}" onkeydown="if(event.key==='Enter'&&!event.isComposing){event.preventDefault();lifeConvCustom('${turn.id}','${esc(q.id)}','send',this.value)}"><button type="button" onclick="lifeConvCustom('${turn.id}','${esc(q.id)}','send',document.getElementById('${inputId}').value)">就这个</button></div>`:''}</div>`;
}
function lifeConvCurrentHtml(){
  const cur=lifeConvState.current;if(!cur)return '';
  const undo=typeof lifeCoreBatch!=='undefined'&&lifeCoreBatch?'：<button class="link" onclick="lifeCoreUndo()">撤销这次安排</button>':'';
  return `<div class="thread-plan">${interactionPlanCard(cur.reply,{mode:'conv',confirmed:cur.confirmed,adjusted:cur.adjusted,history:cur.history,inline:lifeConvState.inline,busy:life.phase==='applying',undo})}</div>`
}
function lifeConvTurnHtml(turn){
  if(turn.role==='user')return `<li class="turn turn-user" data-turn="${turn.id}"><div class="turn-body"><p class="turn-text">${esc(turn.text)}</p><small class="turn-meta">${turn.source==='voice'?'语音':'打字'}</small></div>${turn.editable===false?'':`<button type="button" class="turn-edit" onclick="lifeConvEdit('${turn.id}')" aria-label="修改这句话">改一下</button>`}</li>`;
  if(turn.type==='clarification')return `<li class="turn turn-assistant" data-turn="${turn.id}"><div class="turn-body">${turn.understanding?`<p class="turn-understanding">${esc(turn.understanding)}</p>`:''}${(turn.questions||[]).length?turn.questions.map(q=>lifeConvQuestionHtml(turn,q)).join(''):`<p class="turn-ask">${esc(turn.prompt||'可以再补充一句更具体的信息。')}</p>`}</div></li>`;
  return `<li class="turn turn-assistant" data-turn="${turn.id}"><div class="turn-body markdown-body">${renderMarkdown(turn.reply?.message||turn.text||'')}</div></li>`;
}
function lifeConvStatusHtml(){
  if(life.phase==='listening')return '<p class="thread-status" role="status">正在听… 说完点一下麦克风。</p>';
  if(life.phase==='transcribing')return '<p class="thread-status" role="status">正在识别…</p>';
  if(life.phase==='applying')return '<p class="thread-status" role="status">正在保存你的安排…</p>';
  if(lifeConvState.state==='recovering')return '<p class="thread-status" role="status">正在换一种方式重新整理…</p>';
  if(life.phase==='thinking')return '<p class="thread-status" role="status">正在整理…</p>';
  if(lifeConvState.state==='error'){
    const asr=lifeConvState.errorKind==='asr';
    const actions=asr
      ?`${lifeAudio.blob?'<button class="primary" onclick="lifeTranscribe()">重试转写</button>':''}<button onclick="lifeVoice()">重新录音</button><button class="link" onclick="lifeConvFocus()">直接打字</button>`
      :`<button class="primary" onclick="lifeConvRetry()">重新整理</button><button onclick="lifeConvSaveRaw()">先保存原话</button><button class="link" onclick="lifeConvFocus()">继续补充</button>`;
    const message=asr?(lifeConvState.error||'刚才没听清，可以再说一次，或重试转写。'):'这次整理没成功，但你的内容已经保留。';
    return `<div class="thread-recovery" role="alert"><p>${esc(message)}</p><div class="row-actions">${actions}</div><details><summary>详情</summary><p>${esc(lifeConvState.tech||lifeConvState.error)}</p></details></div>`;
  }
  return '';
}
function lifeThreadHtml(){
  const status=lifeConvStatusHtml(),plan=lifeConvCurrentHtml();
  if(!lifeConvState.turns.length&&!status&&!plan)return '';
  const head=`<div class="thread-head"><span>这次安排</span><button type="button" class="link" onclick="lifeConvReset()">新对话</button></div>`;
  const turns=lifeConvState.turns.length?`<ol class="thread-turns">${lifeConvState.turns.map(lifeConvTurnHtml).join('')}</ol>`:'';
  return `<section class="life-thread" aria-label="这次安排的对话记录">${head}${turns}${plan}${status}</section>`;
}
// --- flow ---------------------------------------------------------------
function lifeConvFocus(){const input=document.getElementById('life-input');if(!input)return setTimeout(lifeConvFocus,80);input.focus();input.scrollIntoView({block:'center',behavior:'smooth'})}
function lifeConvAccept(reply){
  life.result=reply;
  const asksBack=reply.intent==='answer'&&/[？?]\s*$/.test(String(reply.message||''))&&!(reply.operations||[]).length;
  if(reply.intent==='clarify'||asksBack){
    const questions=(reply.questions||[]).map(q=>({id:String(q.id||lifeConvId()),question:q.question,options:Array.isArray(q.options)?q.options:[],allowCustom:q.allowCustom!==false,answer:''}));
    lifeConvPush({role:'assistant',type:'clarification',reply,proposalId:reply.proposalId||lifeConvState.proposalId,understanding:questions.length?(reply.understanding||reply.message):'',prompt:questions.length?'':reply.message,questions});
    lifeConvState.proposalId=reply.proposalId||lifeConvState.proposalId;
    lifeConvState.state='clarifying';life.phase='clarifying';lifeConvState.inline=false;
  }else if((reply.operations||[]).length){
    // Replace the single visible plan instead of appending another full card.
    const previous=lifeConvState.current;
    lifeConvState.current={
      reply,
      proposalId:reply.proposalId||lifeConvState.proposalId,
      confirmed:false,
      adjusted:previous?(lifeConvState.pendingAdjust||''):'',
      history:previous?[...(previous.history||[]),{version:previous.reply?.proposalVersion||lifeConvState.version,summary:previous.reply?.summary||previous.reply?.understanding||''}]:[]
    };
    lifeConvState.pendingAdjust='';
    lifeConvState.proposalId=reply.proposalId||lifeConvState.proposalId;lifeConvState.version=reply.proposalVersion||0;
    lifeConvState.state='proposal_ready';life.phase='review';lifeConvState.inline=false;
  }else{
    lifeConvPush({role:'assistant',type:'answer',reply,text:reply.message});
    lifeConvState.state='done';life.phase='answered';lifeConvState.inline=false;
  }
  lifeConvState.error='';lifeConvState.errorKind='';
}
async function lifeConvSend({text,proposalId,mode='first'}){
  const request=++lifeConvState.request;
  lifeConvState.controller?.abort();
  const controller=new AbortController();lifeConvState.controller=controller;
  lifeConvState.state=mode==='retry'?'recovering':'planning';life.phase='thinking';lifeConvState.error='';lifeRefresh();
  const payload={message:text,...(typeof lifeCoreContext==='function'?lifeCoreContext():{}),...(proposalId?{proposalId}:{})};
  const timeout=typeof LIFE_REQUEST_TIMEOUT_MS==='number'?LIFE_REQUEST_TIMEOUT_MS:180000;
  try{
    const reply=await productAPI.request('/api/planner/turn',{method:'POST',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(timeout)]),body:JSON.stringify(payload)});
    if(request!==lifeConvState.request)return;
    lifeConvAccept(reply);
  }catch(e){
    if(request!==lifeConvState.request||controller.signal.aborted)return;
    // A stale/expired proposal (or server-side data change) must not block the retry: drop it and plan again.
    if(proposalId&&/失效|过期|已有更新|重新生成|新版本/.test(String(e.message||'')))return lifeConvSend({text,mode:'retry'});
    if(mode!=='retry'&&lifeConvRetryable(e)){
      lifeConvState.state='recovering';lifeConvState.tech=e.message||'';lifeRefresh();
      await new Promise(resolve=>setTimeout(resolve,400));
      if(request!==lifeConvState.request)return;
      return lifeConvSend({text,proposalId,mode:'retry'});
    }
    lifeConvState.state='error';life.phase='error';lifeConvState.errorKind='plan';lifeConvState.tech=e.message||'';lifeConvState.error=lifeConvErrorText(e);
  }finally{if(request===lifeConvState.request)lifeRefresh()}
}
function lifeConvSubmit(text,source='text'){
  const message=String(text||'').trim();if(!message)return;
  if(['thinking','transcribing','applying'].includes(life.phase))return;
  if(lifeConvState.current)lifeConvState.pendingAdjust=message;
  const pending=lifeConvPending();
  if(lifeConvState.editing){
    lifeConvState.editing=null;lifeConvState.proposalId=null;lifeConvState.current=null;lifeConvState.inline=false;
    lifeConvPush({role:'user',type:'utterance',text:message,source});
    lifeConvState.draft='';
    return lifeConvSend({text:message});
  }
  if(pending){
    const questions=pending.questions||[];
    if(questions.length&&questions.some(q=>!q.answer))pending.questions=questions.map(q=>({...q,answer:q.answer||message}));
    else pending.freeText=message;
    lifeConvPush({role:'user',type:'clarification_answer',text:message,source,editable:false});
    lifeConvState.draft='';
    const combined=questions.length?questions.map(q=>`${q.question}：${q.answer||message}`).join('；'):message;
    return lifeConvSend({text:combined,proposalId:pending.proposalId||lifeConvState.proposalId});
  }
  lifeConvPush({role:'user',type:'utterance',text:message,source});
  lifeConvState.draft='';
  return lifeConvSend({text:message,proposalId:lifeConvState.proposalId});
}
function lifeConvPick(turnId,qid,label){
  const turn=lifeConvState.turns.find(t=>t.id===turnId);if(!turn)return;
  const question=(turn.questions||[]).find(q=>String(q.id)===String(qid));if(!question)return;
  question.answer=label;lifeConvState.custom='';lifeRefresh();
  if((turn.questions||[]).every(q=>q.answer))lifeConvAnswer(turn);
}
function lifeConvCustom(turnId,qid,action,value){
  const key=turnId+':'+qid;
  if(action==='open'){lifeConvState.custom=lifeConvState.custom===key?'':key;lifeRefresh();document.getElementById(`life-custom-${turnId}-${qid}`)?.focus();return}
  const text=String(value||document.getElementById(`life-custom-${turnId}-${qid}`)?.value||'').trim();
  if(!text)return;lifeConvPick(turnId,qid,text);
}
function lifeConvAnswer(turn){
  const questions=turn.questions||[];
  if(questions.some(q=>!q.answer)||turn.sent)return;
  turn.sent=true;
  // The checked answers already live inside the question rows, so no duplicate user turn is added.
  lifeConvState.draft='';
  return lifeConvSend({text:questions.map(q=>`${q.question}：${q.answer}`).join('；'),proposalId:turn.proposalId||lifeConvState.proposalId});
}
function lifeConvAsk(text){lifeConvSubmit(text,'text')}
function lifeConvAdjust(){
  if(life.phase==='applying')return;
  lifeConvState.inline=!lifeConvState.inline;
  lifeRefresh();
  if(lifeConvState.inline)setTimeout(()=>document.getElementById('plan-inline-input')?.focus(),60);
}
function lifeConvInlineCancel(){lifeConvState.inline=false;lifeRefresh()}
function lifeConvInlineSend(){
  const input=document.getElementById('plan-inline-input');
  const text=String(input?.value||'').trim();
  if(!text)return input?.focus();
  lifeConvState.inline=false;
  return lifeConvSubmit(text,'text');
}
function lifeConvRetry(){
  const last=lifeConvLastUser();if(!last)return lifeConvFocus();
  // Retry the same words without adding a second copy to the transcript.
  lifeConvState.state='planning';lifeConvState.error='';lifeConvState.tech='';
  lifeConvState.controller?.abort();
  return lifeConvSend({text:last.text,proposalId:lifeConvState.proposalId,mode:'retry'});
}
function lifeConvSaveRaw(){
  const said=lifeConvState.turns.filter(t=>t.role==='user').map(t=>t.text);
  const text=(said.length?said.join('\n'):lifeConvDraft()).trim();if(!text)return;
  if(!window.lifeAccount?.user)return toast('登录后可以把原话保存到记录。');
  runDatabaseCommand(()=>{simpleNewRecord(text.split('\n')[0].slice(0,60),text,'',{type:'record',source:'life-conversation'});save();toast('原话已保存到记录，之后可以接着整理。')});
  lifeConvState.state='done';lifeRefresh();
}
function lifeConvEdit(turnId){
  const index=lifeConvState.turns.findIndex(t=>t.id===turnId&&t.role==='user');if(index<0)return;
  const turn=lifeConvState.turns[index];
  lifeConvState.controller?.abort();lifeConvState.request++;
  lifeConvState.turns.splice(index);lifeConvState.proposalId=null;lifeConvState.version=0;
  lifeConvState.current=null;lifeConvState.inline=false;lifeConvState.pendingAdjust='';
  lifeConvState.draft=turn.text;lifeConvState.state='idle';life.phase='idle';life.result=null;life.error='';
  lifeRefresh();setTimeout(()=>{const input=document.getElementById('life-input');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length)}},40);
}
async function lifeConvConfirm(){
  const cur=lifeConvState.current;
  if(!cur||cur.confirmed||life.phase==='applying')return;
  if(!cur.reply?.proposalId)return toast('这个方案已经失效，重新整理一次吧。');
  agentInteraction.dirty=false;
  life.result=cur.reply;lifeConvState.state='applying';lifeRefresh();
  try{
    await lifeApply(cur.reply.operations);
    if(life.phase==='done'){cur.confirmed=true;lifeConvState.state='done';lifeConvPush({role:'assistant',type:'answer',reply:{message:'已经按这个方案安排好了。'}})}
  }catch(e){lifeConvState.state='error';lifeConvState.error='没能保存，数据没有改动。';lifeConvState.tech=e?.message||''}
  lifeRefresh();
}
function lifeConvReset(){
  lifeConvState.controller?.abort();lifeConvState.request++;
  Object.assign(lifeConvState,{turns:[],draft:'',editing:null,custom:'',state:'idle',error:'',errorKind:'',tech:'',proposalId:null,version:0,current:null,inline:false,pendingAdjust:''});
  life.result=null;life.phase='idle';life.error='';life.text='';lifeRefresh();
  setTimeout(lifeConvFocus,60);
}
// --- wiring -------------------------------------------------------------
if(typeof lifeTurn==='function'){
  const lifeConvBaseTurn=lifeTurn,lifeConvBaseComposer=lifeComposer,lifeConvBaseResult=lifeResult,lifeConvBasePhase=lifePhaseText,lifeConvBaseDraft=lifeDraftInput;
  lifeTurn=async function(text){if(!window.lifeAccount?.user)return lifeConvBaseTurn(text);return lifeConvSubmit(text,'text')};
  lifeDraftInput=function(input){lifeConvState.draft=input.value;lifeConvBaseDraft(input)};
  lifeComposer=function(){
    const keep=life.text;life.text=lifeConvState.draft||'';
    let html;
    try{html=lifeConvBaseComposer()}finally{life.text=keep}
    if(lifeConvState.turns.length||lifeConvState.current)html=html.replace('跟我说说最近要做什么……比如：这周把论文改完，周六想休息',LIFE_CONV_PLACEHOLDER);
    const thread=lifeThreadHtml();
    return thread?html.replace('<div class="composer',thread+'<div class="composer'):html;
  };
  lifeResult=function(){
    if(!window.lifeAccount?.user)return lifeConvBaseResult();
    // The transcript owns clarification, proposal and recovery UI; no second panel is needed.
    return '';
  };
  lifePhaseText=function(){
    if(!window.lifeAccount?.user)return lifeConvBasePhase();
    if(lifeConvState.state==='error')return '';
    if(life.phase==='idle')return lifeConvState.turns.length?'':'直接说就行，我来整理。';
    if(life.phase==='transcribing')return '正在识别…';
    if(lifeConvState.state==='recovering')return '正在换一种方式重新整理…';
    if(life.phase==='thinking')return '';
    return lifeConvBasePhase();
  };
  lifeTranscribe=async function(){
    if(!lifeAudio.blob)return;
    life.phase='transcribing';lifeConvState.state='transcribing';life.error='';lifeRefresh();
    try{
      const started=performance.now(),result=await productAPI.transcribe(lifeAudio.blob);
      life.voiceTimings={asr_ms:performance.now()-started,...result.timings};
      const transcript=String(result.transcript||'').trim();
      if(!transcript)throw Error('没听清');
      // The recording is released only after text came back; a failed ASR keeps the blob for retry.
      lifeAudio.blob=null;
      const draft=lifeConvDraft().trim();
      if(draft){lifeConvState.draft=draft+'\n'+transcript;lifeConvState.state='idle';life.phase='idle';lifeRefresh();return}
      // Leave the transcribing state before submitting, otherwise the guard drops the turn.
      life.phase='idle';lifeConvState.state='idle';
      await lifeConvSubmit(transcript,'voice');
    }catch(e){
      lifeConvState.state='error';life.phase='error';lifeConvState.errorKind='asr';lifeConvState.tech=e?.message||'';
      lifeConvState.error='刚才没听清，可以再说一次，或重试转写。';lifeRefresh();
    }
  };
  submitLifeInput=function(button){
    const composer=button?.closest('.composer')||document.querySelector('.composer');
    const input=composer?.querySelector('textarea'),text=String(input?.value||'').trim();
    if(!text||['thinking','transcribing','applying','listening'].includes(life.phase))return;
    lifeConvState.draft='';input.value='';lifeResizeInput(input);
    return lifeConvSubmit(text,'text');
  };
  render();
}
