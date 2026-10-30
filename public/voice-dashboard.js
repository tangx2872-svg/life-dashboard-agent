// Progressive enhancement: reuse the existing planner and persistence boundaries.
function dashboardRows(){
 const end=today(),start=lifeAddDays(end,-29);
 return {history:(data.history||[]).filter(h=>h.date.slice(0,10)>=start&&h.date.slice(0,10)<=end),late:(data.tasks||[]).filter(t=>!t.done&&taskDate(t)&&taskDate(t)<end)};
}
function dashboardMetrics(){const {history,late}=dashboardRows();return `<section class="assistant-metrics" aria-label="最近30天"><button onclick="dashboardDetail('done')"><b>${history.filter(h=>h.type!=='项目变化').length}</b><span>近30天完成 →</span></button><button onclick="dashboardDetail('days')"><b>${new Set(history.map(h=>h.date.slice(0,10))).size}</b><span>有进展的天数 →</span></button><button onclick="dashboardDetail('late')"><b>${late.length}</b><span>需要重新安排 →</span></button></section>`}
function dashboardDetail(kind,date=''){
 let d=document.getElementById('insight-detail');if(!d){d=document.createElement('dialog');d.id='insight-detail';d.className='insight-drawer';document.body.append(d)}
 const {history,late}=dashboardRows(),rows=date?history.filter(h=>h.date.slice(0,10)===date):history;
 const calendar=kind==='days'?`<div class="progress-calendar">${Array.from({length:30},(_,i)=>{const day=lifeAddDays(today(),i-29),n=history.filter(h=>h.date.slice(0,10)===day).length;return `<button class="${n?'has-progress':''}" title="${day}：完成 ${n} 项" aria-label="${day}，完成 ${n} 项" onclick="dashboardDetail('days','${day}')">${day.slice(8)}</button>`}).join('')}</div>`:'';
 d.innerHTML=`<button class="capture-close" onclick="document.getElementById('insight-detail').close()" aria-label="关闭详情">✕</button><h2>${kind==='late'?'需要重新安排':kind==='days'?'最近30天进展':'最近30天完成'}</h2>${calendar}${date?`<h3>${esc(date)}</h3>`:''}${kind==='late'?late.map(t=>`<article><button class="link" onclick="document.getElementById('insight-detail').close();productTaskForm('${t.id}')">${esc(t.title)}</button><small>原计划 ${esc(taskDate(t))}</small></article>`).join('')||'<p>没有逾期任务。</p>':rows.map(h=>`<article><strong>${esc(h.title)}</strong><small>${esc(h.date)} · ${esc(historyProject(h))}</small></article>`).join('')||'<p>这段时间还没有完成记录。</p>'}${kind==='late'&&late.length?'<button class="primary" onclick="document.getElementById(\'insight-detail\').close();dashboardCommand()">🎙 告诉 AI 怎么调整</button>':''}`;
 if(!d.open)d.showModal();
}
const dashboardOriginalHome=lifeHome;
lifeHome=function(){return dashboardOriginalHome()+`<section class="dashboard-insights"><h2>最近的节奏</h2>${dashboardMetrics()}<p class="quiet">点击数字查看来源，按自己的节奏向前。</p></section>`};
productPages.home=lifeHome;
const dashboardOriginalReview=productReview;
productPages.review=function(){const html=dashboardOriginalReview(),start=html.indexOf('<section class="stat-row">'),end=html.indexOf('</section>',start);return start<0?html:html.slice(0,start)+dashboardMetrics()+html.slice(end+10)};
function dashboardCommand(){
 const pid=page==='plan'?lifePlanId:page==='detail'?selectedProject:'';
 const p=pid?project(pid):null;
 if(p)life.focus={id:p.id,title:p.title};else if(!document.getElementById('assistant-command')?.open){life.focus=null;life.sessionId=''}
 let d=document.getElementById('assistant-command');if(!d){d=document.createElement('dialog');d.id='assistant-command';document.body.append(d);d.addEventListener('close',()=>{if(life.phase==='listening'){lifeAudio.cancelled=true;lifeAudio.recorder?.stop()}})}
 d.dataset.context=p?.title||'全局助理';dashboardRenderCommand();if(!d.open)d.showModal();d.querySelector('textarea')?.focus();
}
function dashboardRenderCommand(){const d=document.getElementById('assistant-command');if(!d?.open&& !d)return;d.innerHTML=`<button class="capture-close" onclick="document.getElementById('assistant-command').close()" aria-label="关闭助理">✕</button><p class="quiet">${esc(d.dataset.context||'全局助理')}</p>${lifeComposer().replace('id="life-input"','id="command-input"').replace('id="life-mic"','id="command-mic"')} ${lifeResult()}<button onclick="document.getElementById('assistant-command').close();productAsk(life.focus?.id||'')">记录笔记 / 快速采集 →</button>`}
const dashboardRefresh=lifeRefresh;
lifeRefresh=function(){if(document.getElementById('assistant-command')?.open)dashboardRenderCommand();else dashboardRefresh()};
lifeFocusComposer=dashboardCommand;
productCommand=dashboardCommand;
const dashboardFloating=document.querySelector('.floating');if(dashboardFloating){dashboardFloating.hidden=false;dashboardFloating.textContent='🎙';dashboardFloating.setAttribute('aria-label','打开 AI 助理');dashboardFloating.onclick=dashboardCommand}
const dashboardStyle=document.createElement('link');dashboardStyle.rel='stylesheet';dashboardStyle.href='voice-dashboard.css';document.head.append(dashboardStyle);
render();
