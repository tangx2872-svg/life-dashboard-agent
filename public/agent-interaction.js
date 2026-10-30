// One interaction state adapter retains existing voice/apply compatibility.
const AgentInteractionState=Object.freeze({idle:'idle',listening:'listening',transcribing:'transcribing',understanding:'thinking',planning:'thinking',clarifying:'clarifying',proposal_ready:'review',applying:'applying',done:'done',error:'error'});
const agentInteraction={request:0,controller:null,dirty:false,answers:{},editing:false,get state(){return Object.keys(AgentInteractionState).find(k=>AgentInteractionState[k]===life.phase)||'idle'},set(state){if(!Object.hasOwn(AgentInteractionState,state))throw Error('Invalid interaction state');life.phase=AgentInteractionState[state]}};
const interactionDraft=lifeDraftInput;lifeDraftInput=function(input){interactionDraft(input);if(life.result||life.phase==='thinking'){agentInteraction.dirty=true;const hint=input.closest('.hero')?.querySelector('.phase');if(hint)hint.textContent='内容已修改，点“重新整理”使用新文字。';const button=input.closest('.composer').querySelector('[data-life-submit]');button.textContent='重新整理';button.disabled=!input.value.trim()}};
submitLifeInput=function(button){const input=(button?.closest('.composer')||document.querySelector('.composer'))?.querySelector('textarea');if(!input?.value.trim()||['listening','transcribing','applying'].includes(life.phase)||life.phase==='thinking'&&!agentInteraction.dirty)return;return lifeTurn(input.value.trim())};
const interactionLegacyTurn=lifeTurn;lifeTurn=async function(text){if(!dashboardBoot.supportsLifeProposals){agentInteraction.dirty=false;return interactionLegacyTurn(text)}const message=String(text||'').trim();if(!message)return;const previous=life.result,followUp=!!previous?.proposalId&&['clarifying','review'].includes(life.phase),id=++agentInteraction.request;agentInteraction.controller?.abort();const controller=new AbortController();agentInteraction.controller=controller;agentInteraction.dirty=false;agentInteraction.answers={};life.text=message;life.error='';agentInteraction.set('understanding');lifeRefresh();try{const reply=await productAPI.request('/api/planner/turn',{method:'POST',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(LIFE_REQUEST_TIMEOUT_MS)]),body:JSON.stringify({message,...lifeCoreContext(),...(followUp?{proposalId:previous.proposalId}:{})})});if(id!==agentInteraction.request||agentInteraction.dirty)return;life.result=reply;agentInteraction.set(reply.intent==='clarify'?'clarifying':reply.operations?.length?'proposal_ready':'done');lifeRefresh()}catch(e){if(id!==agentInteraction.request||controller.signal.aborted)return;if(followUp&&/失效/.test(e.message||'')){life.result=null;life.phase='idle';return lifeTurn(message)}life.error=e.message;agentInteraction.set('error');lifeRefresh()}};
function interactionEdit(){agentInteraction.editing=true;agentInteraction.dirty=true;life.text='';lifeRefresh();const el=document.querySelector('#assistant-command[open] textarea')||document.getElementById('life-input');el?.focus();if(el)el.placeholder='哪里想调整？可以打字，也可以说话。'}
function interactionReset(){agentInteraction.controller?.abort();agentInteraction.request++;agentInteraction.dirty=false;agentInteraction.answers={};lifeDismiss()}
function interactionPick(button){const question=(life.result.questions||[]).find(q=>q.id===button.dataset.question);if(!question)return;agentInteraction.answers[question.id]=button.dataset.answer;button.parentElement.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));const next=button.closest('.clarification-card').querySelector('[data-continue]');if(next)next.disabled=(life.result.questions||[]).some(q=>!agentInteraction.answers[q.id])}
function interactionCustom(input){agentInteraction.answers[input.dataset.question]=input.value;const next=input.closest('.clarification-card').querySelector('[data-continue]');next.disabled=(life.result.questions||[]).some(q=>!agentInteraction.answers[q.id])}
function interactionContinue(){const questions=life.result.questions||[];if(questions.some(q=>!agentInteraction.answers[q.id]))return;const text=questions.map(q=>q.question+'：'+agentInteraction.answers[q.id]).join('；');return lifeTurn(text)}
const interactionTasks=()=>typeof data!=='undefined'&&Array.isArray(data&&data.tasks)?data.tasks:[];
const interactionProjects=()=>typeof data!=='undefined'&&Array.isArray(data&&data.projects)?data.projects:[];
function interactionWhen(date,time){if(!date)return '';const parts=String(date).split('-');if(parts.length<3)return String(date);const head=`${Number(parts[1])} 月 ${Number(parts[2])} 日`;return time?`${head} · ${time}`:`${head} · ${lifeWeekday(date)}`}
function interactionMinutes(op){const value=op?.minutes??op?.estimatedMinutes??op?.durationMinutes;return Number.isFinite(value)&&value>0?Math.round(value):null}
function interactionDuration(minutes){return minutes>=600?'全天':`约 ${minutes} 分钟`}
// operations are the only source of truth for the plan preview.
function interactionPlanRows(r){
  const created=new Map(),rows=[];
  for(const op of r.operations||[]){
    if(!op||typeof op.action!=='string')continue;
    if(op.action==='create_project'||op.action==='update_project'){
      const known=op.action==='update_project'?interactionProjects().find(p=>p.id===op.targetId):null;
      const title=op.title||known?.title||'项目';
      if(op.clientRef)created.set(op.clientRef,title);
      rows.push({kind:'project',title,when:op.date?interactionWhen(op.date):'',minutes:null,project:''});
      continue
    }
    const task=interactionTasks().find(t=>t.id===op.targetId);
    const projectId=op.projectId||task?.projectId||'';
    const project=created.get(projectId)||interactionProjects().find(p=>p.id===projectId)?.title||'';
    const date=op.date||(op.action==='create_task'?'':task?.scheduledDate||task?.dueDate||task?.date||'');
    const time=op.time||(op.action==='create_task'?'':task?.time||'');
    rows.push({kind:'task',title:op.title||task?.title||'任务',when:interactionWhen(date,time),date:date||'',time:time||'',minutes:interactionMinutes(op),project});
  }
  return rows
}
const PLAN_BRIEF_MAX=42;
function interactionClip(text,max){const value=String(text||'').replace(/\s+/g,' ').trim();return value.length>max?value.slice(0,max-1)+'…':value}
function interactionBrief(reply){return interactionClip(reply.summary||reply.understanding||reply.message||'',PLAN_BRIEF_MAX)}
function interactionShortWarning(warning){
  return String(warning||'')
    .replace(/^\s*\d{1,2}\s*月\s*\d{1,2}\s*日已有/,'当天已有')
    .replace(/任务[，,]/,'，')
    .replace(/[，,]?\s*可能与[^，。]*冲突。?$/,'，可能冲突')
    .replace(/[。.]$/,'')
    .trim()
}
// Suggestions must describe what the user can still do, never the change just applied.
function interactionAdjustments(reply,adjusted){
  const norm=value=>String(value||'').replace(/[\s，。、；：""''（）()!?！？]/g,'');
  const applied=norm(adjusted),rows=[];
  for(const item of reply.adjustments||[]){
    const text=String(item||'').trim();if(!text)continue;
    const key=norm(text);
    if(applied&&(key.includes(applied)||applied.includes(key)))continue;
    if(/^(保留原|保持原|沿用原)/.test(text))continue;
    if(/^(取消|删除|移除)/.test(text)&&/\d{1,2}\s*月|\d{1,2}\s*日|周[一二三四五六日天]/.test(text))continue;
    if(rows.includes(text))continue;
    rows.push(text);
    if(rows.length===3)break;
  }
  return rows
}
// Single card, current version only: title, one-line brief, rows, one warning, <=3 chips.
function interactionPlanCard(reply,options={}){
  const r=reply||{},opts=options||{},rows=interactionPlanRows(r),count=(r.operations||[]).length;
  const tasks=rows.filter(row=>row.kind==='task'),projectRow=rows.find(row=>row.kind==='project');
  const uniqueProjects=[...new Set(tasks.map(row=>row.project).filter(Boolean))];
  const brief=interactionBrief(r);
  const title=projectRow?.title||(tasks.length===1?tasks[0].title:'')||brief||'这次安排';
  const adjusted=opts.adjusted?`<p class="plan-adjusted">已调整：${esc(interactionClip(opts.adjusted,30))}</p>`:'';
  const briefLine=brief&&brief!==title?`<p class="plan-brief">${esc(brief)}</p>`:'';
  const projectLine=uniqueProjects.length===1&&uniqueProjects[0]!==title?`<p class="plan-project">${esc(uniqueProjects[0])}</p>`:'';
  let list='';
  if(!count)list='<p class="quiet">这次没有需要改动的安排。</p>';
  else if(tasks.length>1){
    // Same-day tasks share one date heading instead of repeating the date on every row.
    const groups=new Map();
    for(const row of tasks){const key=row.date||row.when||'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
    list=`<ul class="plan-rows">${[...groups].map(([key,items])=>{
      const first=items[0],heading=first.date?interactionWhen(first.date):(first.when||'');
      const rows=items.map(row=>`<li>${row.time?`<span class="plan-time">${esc(row.time)}</span>`:''}<strong>${esc(row.title)}</strong>${row.minutes?`<small class="plan-duration">${interactionDuration(row.minutes)}</small>`:''}${uniqueProjects.length>1&&row.project&&row.project!==title?`<span class="plan-note">${esc(row.project)}</span>`:''}</li>`).join('');
      return `<li class="plan-group">${heading?`<span class="plan-group-date">${esc(heading)}</span>`:''}<ul class="plan-group-items">${rows}</ul></li>`
    }).join('')}</ul>`
  }
  else if(tasks.length===1){const row=tasks[0],whenDate=String(row.when||'').split(' · ')[0],showWhen=row.when&&!(brief&&whenDate&&brief.includes(whenDate));list=`<div class="plan-single">${row.title!==title?`<strong>${esc(row.title)}</strong>`:''}${showWhen?`<span class="plan-when">${esc(row.when)}</span>`:''}${row.minutes?`<small class="plan-duration">${interactionDuration(row.minutes)}</small>`:''}</div>`}
  else if(projectRow?.when)list=`<p class="plan-single"><span class="plan-when">${esc(projectRow.when)}</span></p>`;
  const warning=(r.warnings||[]).filter(Boolean)[0];
  const warningLine=warning?`<p class="plan-warning">⚠ ${esc(interactionShortWarning(warning))}</p>`:'';
  const chips=interactionAdjustments(r,opts.adjusted);
  const chipLine=chips.length?`<div class="plan-adjust"><span>还可以</span><div class="clarification-options">${chips.map(item=>`<button type="button" class="chip" onclick="${opts.mode==='conv'?'lifeConvAsk':'lifeTurn'}(this.textContent)">${esc(item)}</button>`).join('')}</div></div>`:'';
  const confirm=opts.mode==='conv'?'onclick="lifeConvConfirm()"':'onclick="lifeApply(life.result.operations)"';
  const adjust=opts.mode==='conv'?'onclick="lifeConvAdjust()"':'onclick="interactionEdit()"';
  const disabled=!count||opts.confirmed||opts.busy;
  const actions=opts.confirmed
    ?`<p class="plan-saved">✓ 已保存${opts.undo||''}</p>`
    :`<div class="row-actions plan-actions"><button class="primary" ${confirm} ${disabled?'disabled':''}>确认安排</button><button ${adjust}>继续调整</button></div>`;
  const inline=opts.inline?`<div class="plan-inline"><textarea id="plan-inline-input" rows="2" maxlength="2000" placeholder="还有哪里想改？" aria-label="继续调整方案" onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.isComposing){event.preventDefault();lifeConvInlineSend()}"></textarea><div class="row-actions"><button class="primary" onclick="lifeConvInlineSend()">更新方案</button><button class="link" onclick="lifeVoice()">用语音说</button><button class="link" onclick="lifeConvInlineCancel()">取消</button></div></div>`:'';
  const history=(opts.history||[]).filter(Boolean);
  const historyLine=history.length?`<details class="plan-history"><summary>查看修改历史</summary><ol>${history.map(item=>`<li><span>${item.version?`v${esc(item.version)}`:'上一版'}</span>${esc(interactionClip(item.summary||'上一版方案',40))}</li>`).join('')}</ol></details>`:'';
  return `<section class="plan-card" aria-label="当前方案"><p class="plan-heading">我准备这样安排</p>${adjusted}<h2 class="plan-title">${esc(title)}</h2>${projectLine}${briefLine}${list}${warningLine}${chipLine}${actions}${inline}${historyLine}</section>`
}
const interactionResult=lifeResult;lifeResult=function(){const r=life.result;if(!r||['idle','thinking','listening','transcribing'].includes(life.phase))return '';if(life.phase==='clarifying'){const questions=(r.questions||[]).slice(0,3);return `<section class="clarification-card"><h2>Life 想确认一下</h2><p>${esc(r.understanding||r.message)}</p>${questions.map(q=>`<div class="clarification-question"><h3>${esc(q.question)}</h3><div class="clarification-options">${q.options.map(o=>`<button type="button" data-question="${esc(q.id)}" data-answer="${esc(o.label)}" aria-pressed="false" onclick="interactionPick(this)">${esc(o.label)}</button>`).join('')}</div>${q.allowCustom?`<label class="clarification-custom">也可以自己说<input aria-label="${esc(q.question)} 自定义回答" data-question="${esc(q.id)}" oninput="interactionCustom(this)"></label>`:''}</div>`).join('')}${questions.length?'<button type="button" class="primary" data-continue disabled onclick="interactionContinue()">继续安排</button>':'<button type="button" onclick="interactionEdit()">补充一下</button>'}</section>`}if(life.phase==='review')return interactionPlanCard(r,{busy:agentInteraction.dirty});return ''};
const interactionComposer=lifeComposer;lifeComposer=function(){return interactionComposer().replace(/disabled oninput="lifeDraftInput/g,'oninput="lifeDraftInput')};
const interactionPhase=lifePhaseText;lifePhaseText=function(){if(life.phase==='idle')return '';if(agentInteraction.dirty)return '内容已修改，重新整理后再确认。';if(life.phase==='thinking')return '我在整理你的想法…';if(life.phase==='clarifying'||life.phase==='review')return '';return interactionPhase()};
render();

const interactionApply=lifeApply;lifeApply=async function(...args){if(agentInteraction.dirty)return toast('内容已修改，请先重新整理。');agentInteraction.set('applying');lifeRefresh();return interactionApply(...args)};
const interactionFinalResult=lifeResult;lifeResult=function(){return life.phase==='applying'?'<p role="status" class="quiet">正在保存你的安排…</p>':interactionFinalResult()};
