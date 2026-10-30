// Home is one question, one answer, and only what matters today.
function lifeAddDays(s,n){const [y,m,d]=String(s).split('-').map(Number),x=new Date(y,m-1,d+n);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function lifeWeekday(s){const [y,m,d]=String(s).split('-').map(Number);return ['周日','周一','周二','周三','周四','周五','周六'][new Date(y,m-1,d).getDay()]}
function lifeDayLabel(s){
  if(!s)return '还没定时间';
  const now=today();
  if(s===now)return '今天';
  if(s===lifeAddDays(now,1))return '明天';
  if(s===lifeAddDays(now,2))return '后天';
  const diff=Math.round((new Date(s)-new Date(now))/86400000);
  if(diff<0)return `已过 ${Math.abs(diff)} 天`;
  if(diff<7)return lifeWeekday(s);
  return `${lifeWeekday(s)} ${s.slice(5)}`;
}
function lifeGreeting(){const h=new Date().getHours();return h<6?'还没睡？':h<11?'早上好':h<14?'中午好':h<18?'下午好':h<23?'晚上好':'夜深了'}
function lifeHome(){
  return lifeComposer()+lifeResult()+lifeTodayBlock()+lifePlansBlock()+lifeAdviceBlock();
}
function lifeResizeInput(input){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,240)+'px';const send=input.closest('.composer')?.querySelector('[data-life-submit]');if(send)send.disabled=!input.value.trim()||['thinking','transcribing','listening'].includes(life.phase)}
function lifeDraftInput(input){life.text=input.value;lifeResizeInput(input)}
function submitLifeInput(button){const composer=button?.closest('.composer')||document.getElementById('life-input')?.closest('.composer'),input=composer?.querySelector('textarea'),text=String(input?.value||'').trim();if(!text||['thinking','transcribing','listening'].includes(life.phase))return;life.text=input.value;return lifeTurn(text)}
function lifeComposer(){
 const busy=life.phase==='thinking'||life.phase==='transcribing',recording=life.phase==='listening';
 return `<section class="hero"><p class="hi">${lifeGreeting()}</p><h1>有什么想安排的吗？</h1><div class="composer ${recording?'is-recording':''}"><textarea id="life-input" rows="3" maxlength="4000" aria-label="想做的事" placeholder="跟我说说最近要做什么……比如：这周把论文改完，周六想休息" ${busy?'disabled':''} oninput="lifeDraftInput(this)" onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.isComposing){event.preventDefault();submitLifeInput(this.closest('.composer').querySelector('[data-life-submit]'))}"></textarea><div class="life-composer-actions"><button type="button" class="mic ${recording?'is-recording':''}" id="life-mic" onclick="lifeVoice()" aria-label="${recording?'结束录音':'语音输入'}" ${busy?'disabled':''}>${recording?'■':'🎙'}</button><button type="button" data-life-submit class="primary" aria-label="让 Life 帮我安排" onclick="submitLifeInput(this)" ${busy||recording||!life.text?.trim()?'disabled':''}>${life.phase==='thinking'?'正在整理…':'帮我安排'}</button></div></div><p class="phase ${life.phase==='error'?'is-error':''}" role="status">${esc(lifePhaseText())}${recording?' <span id="life-mic-time">00:00</span>':''}</p><small class="life-input-hint">Ctrl / ⌘ + Enter 提交，Enter 换行</small></section>`;
}

function lifeResult(){
  const r=life.result;if(!r)return '';
  if(life.phase==='idle')return '';
  const stages=r.plan?.stages||[];
  const preview=stages.length?`<ol class="plan-preview">${stages.map(s=>`<li><b>${esc(lifeDayLabel(s.date))}</b><span>${esc(s.title)}</span>${s.minutes?`<small>${s.minutes} 分钟</small>`:''}</li>`).join('')}</ol>`:'';
  const changes=(r.changes||[]).length?`<ul class="change-list">${r.changes.map(c=>`<li>${esc(c.title||'')} <span>${c.op==='move'?`${esc(lifeDayLabel(c.from))} → ${esc(lifeDayLabel(c.to))}`:c.op==='delete'?'去掉':c.op==='add'?'加上':'改一下'}</span></li>`).join('')}</ul>`:'';
  const actions=life.phase==='review'
    ?`<button class="primary" onclick="lifeApply(life.result.operations)">就这样</button><button onclick="lifeDismiss()">先不用</button>`
    :life.phase==='done'
    ?`<button class="primary" onclick="lifeDismiss()">好的</button><button onclick="nav('plans')">查看计划</button>`
    :`<button class="primary" onclick="lifeDismiss()">知道了</button>`;
  return `<section class="result-panel" role="status"><div class="result-msg markdown-body">${renderMarkdown(r.message)}</div>${preview}${changes}<div class="row-actions">${actions}</div></section>`;
}
function lifeTodayBlock(){
  const rows=lifeTodayTasks();
  return `<section class="today product-primary">
    <div class="ui-head"><h2>今天<span class="ui-count">${rows.length?rows.length+' 件':'没有安排'}</span></h2><button class="link" onclick="nav('plans')">全部计划 →</button></div>
    ${rows.length?`<ul class="today-list">${rows.map(t=>`<li><input type="checkbox" aria-label="完成 ${esc(t.title)}" onchange="productToggleTask('${t.id}',this.checked)"><div class="grow"><strong>${esc(t.title)}</strong><small>${t.time?esc(t.time)+' · ':''}${t.estimatedMinutes?esc(t.estimatedMinutes)+' 分钟':'今天'}${t.projectId?' · '+esc(project(t.projectId)?.title||''):''}</small></div></li>`).join('')}</ul>`
    :'<p class="quiet">今天还是空的。想做点什么，直接跟我说。</p>'}
  </section>`;
}
function lifePlansBlock(){
  const rows=(data.projects||[]).filter(p=>p.status!=='已完成').slice(0,5);
  return `<section class="recent">
    <div class="ui-head"><h2>最近</h2><button class="link" onclick="nav('plans')">全部 →</button></div>
    ${rows.length?`<ul class="plan-list">${rows.map(p=>{
      const all=(data.tasks||[]).filter(t=>t.projectId===p.id),open=all.filter(t=>!t.done),next=open[0];
      const note=p.target?`${lifeDayLabel(p.target)}截止`:open.length?`还有 ${open.length} 步`:all.length?'已经完成':'还没有步骤';
      return `<li><button class="link" onclick="openPlan('${p.id}')"><strong>${esc(p.title)}</strong></button><span class="bar"><i style="width:${projectProgress(p)}%"></i></span><small>${next?esc(next.title):esc(note)}</small></li>`}).join('')}</ul>`
    :'<p class="quiet">还没有在推进的事。说一句，我帮你拆开。</p>'}
  </section>`;
}
function lifeAdviceBlock(){
  if(life.adviceHidden)return '';
  const days=[...Array(7)].map((_,i)=>lifeAddDays(today(),i));
  const counts=new Map(days.map(d=>[d,0]));
  for(const t of data.tasks||[])if(!t.done){const d=t.scheduledDate||t.dueDate||t.date;if(counts.has(d))counts.set(d,counts.get(d)+1)}
  const busy=[...counts.entries()].filter(([,n])=>n>3).sort((a,b)=>b[1]-a[1])[0];
  if(!busy)return '';
  const [day,count]=busy;
  const move=count-3;
  return `<section class="advice" role="status">
    <p>${lifeWeekday(day)}排了 ${count} 件事，挪 ${move} 件到后面会不会轻松点？</p>
    <div class="row-actions"><button class="primary" onclick="lifeTurn('${lifeWeekday(day)}太满了，帮我调整一下')">帮我调整</button><button onclick="life.adviceHidden=true;render()">先不用</button></div>
  </section>`;
}
