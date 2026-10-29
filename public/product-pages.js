function productProjectTile(p){
  const ts=data.tasks.filter(t=>t.projectId===p.id),done=ts.filter(t=>t.done).length;
  const nxt=nextTask(p);
  const ms=data.events.filter(e=>e.projectId===p.id&&!e.done&&e.date>=today()).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const pill=p.status==='已完成'?'is-done':p.status==='暂停'||p.status==='未开始'?'is-pause':'is-live';
  return `<article class="product-panel project-tile">
    <div class="tile-top"><small>${esc(p.category)}</small><span class="pill ${pill}">${esc(p.status)}</span></div>
    <h3><button class="link" onclick="openProject('${p.id}')">${esc(p.title)}</button></h3>
    <p class="product-hint">${esc(nxt?.title||'选择一个小行动开始')}</p>
    <div class="progress"><div style="width:${projectProgress(p)}%"></div></div>
    <div class="tile-meta"><span>${done} / ${ts.length} 个任务</span><span>${projectProgress(p)}%</span></div>
    ${ms?`<div class="tile-foot">下一里程碑 · ${esc(ms.title)} · ${esc(ms.date)}</div>`:''}
    ${p.target?`<div class="tile-foot">目标日期 · ${esc(p.target)}</div>`:''}
  </article>`;
}
function productHome(){
  const focus=productFocused(),primary=focus.find(t=>!t.done),others=focus.filter(t=>t.id!==primary?.id);
  const active=data.projects.filter(p=>p.status==='进行中').slice(0,4);
  const late=productTaskSort(data.tasks.filter(taskLate)).slice(0,4);
  const suggest=productTaskSort(data.tasks.filter(t=>!t.done&&!focus.some(f=>f.id===t.id))).slice(0,3);
  const recent=[...data.history].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  const todayText=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
  const primaryPanel=primary
    ?`<section class="product-panel product-primary"><div class="product-kicker">Today’s Focus · 今日专注</div><h2>${esc(primary.title)}</h2><p>${esc(primary.description||'从一个具体的小行动开始。')}</p>${productTaskMeta(primary)}<div class="row-actions" style="margin-top:20px"><button class="primary" onclick="productToggleTask('${primary.id}',true)">✓ 标记完成</button><button onclick="productTaskForm('${primary.id}')">查看详情</button><button onclick="productUnfocus('${primary.id}')">移出今日</button></div></section>`
    :`<section class="product-panel product-primary"><div class="product-kicker">Today’s Focus · 今日专注</div><h2>给今天留一点清晰的方向</h2><p>最多挑选四项，第一项未完成的会成为今天的主要行动。</p>${suggest.length?`<div class="ui-chips">${suggest.map(t=>`<button class="ui-chip" onclick="productFocus('${t.id}')">＋ ${esc(t.title)}</button>`).join('')}</div>`:''}<div class="row-actions" style="margin-top:20px"><button class="primary" onclick="productFocusPicker()">挑选今天的任务</button><button onclick="nav('tasks')">浏览全部任务</button></div></section>`;
  return heading('今天，向前一步',todayText,'<button onclick="productAsk()">✧ 整理一个想法</button>')
    +`<div class="product-grid"><div>
      ${primaryPanel}
      <section class="product-panel"><div class="ui-head"><h2>其他安排<span class="ui-count">${others.length} / 3</span></h2><button onclick="productFocusPicker()">调整</button></div>
        ${others.map(t=>`<div class="product-row ${t.done?'done':''}"><input aria-label="完成 ${esc(t.title)}" type="checkbox" ${t.done?'checked':''} onchange="productToggleTask('${t.id}',this.checked)"><div class="grow"><button class="link" onclick="productTaskForm('${t.id}')"><strong>${esc(t.title)}</strong></button>${productTaskMeta(t)}</div><button class="focus-toggle is-on" onclick="productUnfocus('${t.id}')" aria-label="移出今日 ${esc(t.title)}" title="移出今日">★</button></div>`).join('')||'<p class="product-hint">还没有其他安排。今天可以只做一件重要的事。</p>'}
      </section>
      ${late.length?`<section class="product-panel"><div class="ui-head"><h2>需要重新安排<span class="ui-count">${late.length}</span></h2><button onclick="nav('tasks')">全部任务</button></div><p class="product-hint">这些任务已经过了计划日期。改个日期，或者现在先做一小步。</p>${late.map(t=>`<div class="product-row"><div class="grow"><button class="link" onclick="productTaskForm('${t.id}')"><strong>${esc(t.title)}</strong></button>${productTaskMeta(t)}</div><button onclick="productTaskForm('${t.id}')">改日期</button></div>`).join('')}</section>`:''}
    </div><div>
      <section class="product-panel"><div class="ui-head"><h2>最近完成</h2><button onclick="nav('review')">本周回顾 →</button></div>
        ${recent.map(h=>`<div class="product-row"><span class="hist-mark">✓</span><div class="grow"><strong>${esc(h.title)}</strong><small>${esc(h.date)} · ${esc(historyProject(h))}</small></div></div>`).join('')||'<p class="product-hint">完成的每一步都会记录在这里。</p>'}
      </section>
      <section class="product-panel"><div class="ui-head"><h2>随手记</h2><span class="ui-count">${data.inbox.length} 条待整理</span></div><label>先记下来，不用急着分类<textarea id="home-capture" rows="3" aria-label="快速记录内容" placeholder="突然想到什么？"></textarea></label><div class="row-actions"><button class="primary" onclick="captureHome()">＋ 放进收件箱</button><button onclick="nav('inbox')">去整理</button></div></section>
    </div></div>
    <div class="section-title"><h2>正在推进<small>${active.length} 件进行中</small></h2><button onclick="nav('projects')">全部事项 →</button></div><div class="product-projects">${active.map(productProjectTile).join('')||'<p class="product-hint">从一个长期事项开始。</p>'}</div>`;
}
let productProjectFilter='active',productProjectCategory='全部';
function productProjects(){
  const byStatus=p=>productProjectFilter==='all'?true:productProjectFilter==='active'?p.status==='进行中':productProjectFilter==='paused'?p.status==='暂停'||p.status==='未开始':p.status==='已完成';
  const counts={active:data.projects.filter(p=>p.status==='进行中').length,paused:data.projects.filter(p=>p.status==='暂停'||p.status==='未开始').length,done:data.projects.filter(p=>p.status==='已完成').length,all:data.projects.length};
  const rows=data.projects.filter(p=>byStatus(p)&&(productProjectCategory==='全部'||p.category===productProjectCategory));
  return heading('我的事项','为长远的目标，留一个清晰的位置。','<button class="primary" onclick="projectForm()">＋ 新建事项</button>')
    +`<div class="product-tabs">${[['active','进行中'],['paused','未开始 / 暂停'],['done','已完成'],['all','全部']].map(([v,n])=>`<button class="${productProjectFilter===v?'active':''}" onclick="productProjectFilter='${v}';render()">${n} ${counts[v]}</button>`).join('')}</div>`
    +`<div class="ui-chips" style="margin-bottom:20px">${['全部',...data.categories].map(c=>`<button class="ui-chip ${productProjectCategory===c?'is-on':''}" onclick="productProjectCategory='${esc(c)}';render()">${esc(c)}</button>`).join('')}</div>`
    +`<div class="product-projects">${rows.map(productProjectTile).join('')||`<div class="ui-empty"><strong>这里还没有事项</strong><p>把一件想长期做的事放进来，再拆成小步骤。</p><div class="row-actions"><button class="primary" onclick="projectForm()">＋ 新建事项</button><button onclick="categoryForm()">＋ 新增分类</button></div></div>`}</div>`
    +`<div class="row-actions" style="margin-top:20px"><button onclick="categoryForm()">＋ 新增分类</button></div>`;
}
function productDetail(){
  const p=project(selectedProject);if(!p)return empty('事项不存在或已删除。');
  const tasks=data.tasks.filter(t=>t.projectId===p.id),next=tasks.find(t=>!t.done),open=tasks.filter(t=>!t.done).length;
  return `<button onclick="nav('projects')">← 所有事项</button>`
    +heading(esc(p.title),`${esc(p.category)} · ${esc(p.status)}${p.target?' · 目标 '+esc(p.target):''}`,`<button onclick="projectForm('${p.id}')">编辑事项</button>`)
    +`<p class="product-hint">${esc(p.description)}</p>`
    +`<section class="product-panel product-primary"><div class="product-kicker">下一步 · ${esc(phase(p)?.title||'自主推进')}</div><h2>${esc(next?.title||'为这个事项添加下一步')}</h2><div class="row-actions">${next?`<button class="primary" onclick="productTaskForm('${next.id}')">开始行动</button><button onclick="productFocus('${next.id}')">加入今日</button>`:`<button onclick="productTaskForm('','${p.id}')">添加行动</button>`}<button onclick="productAsk('${p.id}')">✧ AI 整理行动</button><button onclick="openAssistant('project:${p.id}')">✧ 让助手读取 / 调整</button></div></section>`
    +`<section class="product-panel"><div class="section-title"><h2>任务<small>${tasks.filter(t=>t.done).length}/${tasks.length} 完成 · ${open} 项待推进</small></h2><button onclick="productTaskForm('','${p.id}')">＋ 添加任务</button></div>${tasks.length?`<div class="progress"><div style="width:${projectProgress(p)}%"></div></div><small class="product-hint">按任务 / 子任务计算 ${projectProgress(p)}%</small>${productTaskRows(tasks)}`:'<p class="product-hint">还没有任务。先加一个小到可以立刻开始的行动。</p>'}</section>`
    +`<section class="product-panel"><div class="section-title"><h2>阶段</h2><button onclick="phaseForm('${p.id}')">＋ 新增阶段</button></div>${p.phases.map((s,i)=>`<div class="product-row"><div class="grow"><strong>${i+1}. ${esc(s.title)}</strong><small>${esc(stageDisplayStatus(p,s))} · ${stageProgress(p,s)}%</small></div>${s.id===phase(p)?.id?'<span class="pill is-live">当前阶段</span>':''}<button onclick="phaseForm('${p.id}','${s.id}')">编辑</button><button class="danger" onclick="productDelete('projectStage','${s.id}','${p.id}')">删除</button></div>`).join('')||'<p class="product-hint">阶段可以按需要添加，不必一次计划完。</p>'}</section>`
    +`<section class="product-panel"><div class="section-title"><h2>里程碑</h2><button onclick="eventForm(null,'${p.id}')">＋ 添加</button></div>${data.events.filter(e=>e.projectId===p.id).map(eventRow).join('')||'<p class="product-hint">尚无里程碑。</p>'}</section>`
    +`<section class="product-panel product-notes"><h2>记录与想法</h2><label>记录今天的进展<textarea id="note-input" rows="3" placeholder="学到了什么？还有什么问题？"></textarea></label><button onclick="addNote('${p.id}')">添加记录</button>${[...p.notes].reverse().map(n=>`<article><small>${esc(n.date)}</small><p>${esc(n.text)}</p></article>`).join('')}</section>`
    +`<div class="row-actions">${p.status!=='已完成'?`<button onclick="completeProject('${p.id}')">标记事项完成</button>`:''}<button class="danger" onclick="productDelete('project','${p.id}')">删除事项</button></div>`;
}
function productReview(){
  const d=new Date();d.setDate(d.getDate()-(d.getDay()+6)%7);d.setHours(0,0,0,0);
  const start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const rows=data.history.filter(h=>h.date.slice(0,10)>=start&&h.date.slice(0,10)<=today());
  const overdue=data.tasks.filter(t=>!t.done&&taskDate(t)&&taskDate(t)<today());
  return heading('本周回顾',start+' 至 '+today())
    +`<section class="product-panel"><div class="product-stat"><div><b>${rows.length}</b><small>完成记录</small></div><div><b>${new Set(rows.map(h=>h.date.slice(0,10))).size}</b><small>有完成记录的天数</small></div><div><b>${data.todayFocus?.date===today()?data.todayFocus.taskIds.length:0}</b><small>今天的安排</small></div><div><b>${overdue.length}</b><small>需要重新安排</small></div></div><p class="product-hint">统计来自真实完成记录，不推测工作时长。</p></section>`
    +`<section class="product-panel"><div class="ui-head"><h2>这周走过的路<span class="ui-count">${rows.length}</span></h2></div>${rows.map(h=>`<div class="product-row"><span class="hist-mark">✓</span><div class="grow"><strong>${esc(h.title)}</strong><small>${esc(h.date)} · ${esc(h.projectTitle||'日常')}</small></div></div>`).join('')||'<div class="ui-empty"><strong>这一周还没有完成记录</strong><p>一个小行动也算进展，完成它就会出现在这里。</p></div>'}</section>`
    +`<section class="product-panel"><div class="ui-head"><h2>重新安排，而不是堆积<span class="ui-count">${overdue.length}</span></h2></div>${overdue.length?productTaskRows(productTaskSort(overdue),{grouped:false}):'<p class="product-hint">没有积压的任务，节奏很好。</p>'}</section>`;
}
