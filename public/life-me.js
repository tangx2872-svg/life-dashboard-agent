// Settings, plus the advanced and developer areas that ordinary use never needs.
let lifeDevMode=false,lifeApiStatus='还没有检查';
const lifeAdvanced=[['tasks','任务（按时间分组）'],['projects','事项'],['timeline','时间轴'],['inbox','收件箱'],['ideas','想法'],['archive','历史记录'],['reminders','行动提醒'],['roadmaps','学习路线'],['records','记录']];
const lifeDeveloper=[['gptImport','JSON 导入'],['dataManagement','数据与备份'],['assistant','旧智能助手'],['experiments','实验']];
function lifeMePage(){
  const rest=(data.plannerProfile?.restDays||[]);
  const habits=[...(rest.length?[`${rest.join('、')}尽量不安排`]:[]),...(data.plannerProfile?.dailyMinutes?[`一天大约 ${data.plannerProfile.dailyMinutes} 分钟`]:[])];
  return heading('我','设置、备份，以及很少用到的功能。')
    +`<section class="me-block"><h3>我记下的习惯</h3>${habits.length?`<div class="ui-chips" style="margin:0">${habits.map(h=>`<span class="ui-chip">${esc(h)}</span>`).join('')}</div>`:'<p class="quiet">还没有。你多说几次「周六想休息」这类话，我会自己记下来。</p>'}</section>`
    +`<section class="me-block"><h3>数据</h3><p class="quiet">内容已经保存好了，关掉页面也不会丢。</p><div class="row-actions"><button onclick="backup()">导出备份</button></div></section>`
    +`<details class="me-details"><summary>高级功能</summary><p class="quiet">平时用不到，但都还在。</p><div class="row-actions">${lifeAdvanced.map(([p,n])=>`<button onclick="nav('${p}')">${esc(n)}</button>`).join('')}</div></details>`
    +`<details class="me-details" ${lifeDevMode?'open':''}><summary>开发者</summary><label class="dev-toggle"><input type="checkbox" ${lifeDevMode?'checked':''} onchange="lifeDevMode=this.checked;render()"> 打开开发者模式（会显示 JSON、数据库与调试入口）</label>`
    +(lifeDevMode?`<div class="row-actions">${lifeDeveloper.map(([p,n])=>`<button onclick="nav('${p}')">${esc(n)}</button>`).join('')}</div><div class="row-actions"><button onclick="lifeCheckAPI()">检查 AI 服务</button></div><p class="quiet" role="status">${esc(lifeApiStatus)}</p><div id="dev-storage"></div>`:'')
    +`</details>`;
}
async function lifeCheckAPI(){
  lifeApiStatus='正在检查…';render();
  try{const value=await productAPI.request('/api/ai/health');lifeApiStatus=value.status==='ok'?'AI 服务已连接':'AI 服务返回了异常状态'}
  catch(e){lifeApiStatus='AI 服务暂时不可用：'+e.message}
  if(page==='me')render();
}
