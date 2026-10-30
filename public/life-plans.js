// One page for everything the user is working on. No Project / Task / Milestone split.
let lifePlanId=null,lifePlanShowDone=false;
function openPlan(id){lifePlanId=id;nav('plan')}
function planSteps(p){return (data.tasks||[]).filter(t=>t.projectId===p.id).sort((a,b)=>String(a.scheduledDate||a.dueDate||a.date||'9999').localeCompare(String(b.scheduledDate||b.dueDate||b.date||'9999')))}
function planLine(p){
  const steps=planSteps(p),open=steps.filter(t=>!t.done),next=open[0];
  if(!steps.length)return '还没有步骤';
  if(!open.length)return '已经完成';
  const date=next?.scheduledDate||next?.dueDate||next?.date||'';
  if(p.target)return `${lifeDayLabel(p.target)}截止`;
  if(date)return `${lifeDayLabel(date)}：${next.title}`;
  return `还有 ${open.length} 步`;
}
function lifePlansPage(){
  const groups=new Map();
  for(const p of data.projects||[]){if(p.status==='已完成'&&!lifePlanShowDone)continue;const c=p.category||'其他';if(!groups.has(c))groups.set(c,[]);groups.get(c).push(p)}
  const loose=(data.tasks||[]).filter(t=>!t.done&&!t.projectId);
  const done=(data.projects||[]).filter(p=>p.status==='已完成');
  return heading('计划','你正在推进的事，都在这里。')
    +`<div class="product-tabs"><button class="${!lifePlanShowDone?'active':''}" onclick="lifePlanShowDone=false;render()">进行中 ${(data.projects||[]).filter(p=>p.status!=='已完成').length}</button><button class="${lifePlanShowDone?'active':''}" onclick="lifePlanShowDone=true;render()">已完成 ${done.length}</button></div>`
    +(groups.size?[...groups].map(([category,rows])=>`<section class="plan-group"><h3>${esc(category)}</h3><ul class="plan-list">${rows.map(p=>`<li><button class="link" onclick="openPlan('${p.id}')"><strong>${esc(p.title)}</strong></button><span class="bar"><i style="width:${projectProgress(p)}%"></i></span><small>${esc(planLine(p))}</small></li>`).join('')}</ul></section>`).join('')
      :'<p class="quiet">还没有在推进的事。回到首页跟我说一句，我帮你拆开。</p>')
    +(loose.length?`<section class="plan-group"><h3>零散的事</h3><ul class="today-list">${loose.map(t=>`<li><input type="checkbox" aria-label="完成 ${esc(t.title)}" onchange="productToggleTask('${t.id}',this.checked)"><div class="grow"><strong>${esc(t.title)}</strong><small>${esc(lifeDayLabel(t.scheduledDate||t.dueDate||t.date))}</small></div></li>`).join('')}</ul></section>`:'')
    +`<div class="row-actions"><button class="primary" onclick="lifeFocusComposer()">＋ 告诉 AI 一件新的事</button></div>`;
}
function lifePlanPage(){
  const p=project(lifePlanId);
  if(!p)return `<p class="quiet">这个计划已经不在了。<button class="link" onclick="nav('plans')">回到计划</button></p>`;
  const steps=planSteps(p),open=steps.filter(s=>!s.done);
  const groups=new Map();
  for(const s of steps){const key=s.scheduledDate||s.dueDate||s.date||'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s)}
  return `<button class="link" onclick="nav('plans')">← 计划</button>`
    +heading(esc(p.title),esc(p.goal||p.description||''))
    +`<section class="plan-detail">
      <div class="progress"><div style="width:${projectProgress(p)}%"></div></div>
      <p class="quiet">${steps.length?`${steps.filter(s=>s.done).length} / ${steps.length} 完成`:'还没有步骤'}${p.target?' · '+esc(lifeDayLabel(p.target))+'截止':''}</p>
      ${groups.size?[...groups].map(([date,rows])=>`<div class="step-group"><h4>${esc(lifeDayLabel(date))}</h4><ul class="today-list">${rows.map(t=>`<li><input type="checkbox" aria-label="完成 ${esc(t.title)}" ${t.done?'checked':''} onchange="productToggleTask('${t.id}',this.checked)"><div class="grow"><strong>${esc(t.title)}</strong>${t.estimatedMinutes?`<small>${esc(t.estimatedMinutes)} 分钟</small>`:''}</div></li>`).join('')}</ul></div>`).join('')
      :'<p class="quiet">还没有安排步骤。</p>'}
      <div class="row-actions"><button class="primary" onclick="lifeAskAbout('${esc(p.title)}','${p.id}')">💬 和 AI 调整</button><button onclick="openProject('${p.id}')">更多细节</button></div>
    </section>`
    +(open.length?'':'<p class="quiet">这个计划的步骤都完成了，要不要在回顾里看一下？</p>');
}
