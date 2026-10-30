// Primary navigation has one owner. Legacy URLs remain as compatibility tools.
const productNav=[['home','⌂','首页'],['plans','▦','计划'],['review','◴','回顾'],['me','◍','我']];
const productPages={home:lifeHome,tasks:productTasksPage,projects:productProjects,detail:productDetail,plans:lifePlansPage,plan:lifePlanPage,me:lifeMePage,records:simpleRecordsPage,settings:simpleSettingsPage,review:productReview,timeline,inbox:inboxPage,ideas:ideasPage,archive:archivePage,roadmaps:routesPage,roadmap:roadmapPage,learningTask:learningTaskPage,experiments:experimentsPage,experimentDetail,dataManagement:managementPage,gptImport:importPage,assistant:assistantPage,reminders:reminderPage,aiCapture:productAIPage};
let productRouteReady=false;
function productHash(){if(page==='home')return '#/today';if(page==='plan')return '#/plans/'+encodeURIComponent(lifePlanId||'');if(page==='detail')return '#/projects/'+encodeURIComponent(selectedProject||'');let parts=[page];if(['roadmap','learningTask'].includes(page))parts.push(selectedRoadmap);if(page==='learningTask')parts.push(selectedLearningTask);if(page==='experimentDetail')parts.push(selectedExperiment);return '#/'+parts.filter(Boolean).map(encodeURIComponent).join('/')}
function productReadRoute(){let parts;try{parts=location.hash.replace(/^#\/?/,'').split('/').map(decodeURIComponent)}catch{parts=['today']}page=parts[0]==='today'?'home':Object.hasOwn(productPages,parts[0])?parts[0]:'home';if(parts[0]==='plans'&&parts[1]){page='plan';lifePlanId=parts[1]}if(parts[0]==='projects'&&parts[1]){page='detail';selectedProject=parts[1]}if(page==='detail')selectedProject=parts[1];if(['roadmap','learningTask'].includes(page))selectedRoadmap=parts[1];if(page==='learningTask')selectedLearningTask=parts[2];if(page==='experimentDetail')selectedExperiment=parts[1]}
nav=function(p){page=Object.hasOwn(productPages,p)?p:p==='today'?'home':'home';filter='全部';document.getElementById('search')?.value&&(document.getElementById('search').value='');document.body.classList.remove('product-menu-open');if(page!=='home'){life.phase='idle';life.result=null}render();window.scrollTo(0,0)};
openProject=function(key){selectedProject=key;nav('detail')};
function productSubnav(){return ''}
function productQuick(){
 let d=document.getElementById('capture-dialog');if(!d){d=document.createElement('dialog');d.id='capture-dialog';d.innerHTML='<button class="capture-close" aria-label="关闭快速记录">✕</button><div id="capture-dialog-content"></div>';document.body.append(d);d.querySelector('button').onclick=()=>d.close();d.addEventListener('close',()=>{if(captureUI.recording){productAudio.cancelled=true;productAudio.recorder?.stop()}})}
 if(document.getElementById('modal').open)closeModal();simpleRenderCapture();if(!d.open)d.showModal();
}
function simpleRenderCapture(){const el=document.getElementById('capture-dialog-content');if(el)el.innerHTML=productAIPage()}
function simpleCloseCapture(){document.getElementById('capture-dialog')?.close()}
render=function(){
 if(storageState.command)return;
 document.getElementById('nav').innerHTML=productNav.map(([p,i,n])=>`<button onclick="nav('${p}')" class="${page===p||(['plan','detail'].includes(page)&&['plans','projects'].includes(p))?'active':''}"><i>${i}</i>${n}</button>`).join('');
 const crumb=document.getElementById('crumb');if(crumb)crumb.textContent=page==='plan'?project(lifePlanId)?.title||'计划':productNav.find(([p])=>p===page)?.[2]||'更多';
 document.getElementById('app').innerHTML=simpleReceiptHTML()+(simpleUndo?`<div class="undo-bar" role="status">${esc(simpleUndo.label)}已改好<button onclick="simpleDoUndo()">撤销</button><button class="link" aria-label="关闭撤销提示" onclick="simpleUndo=null;render()">✕</button></div>`:'')+(productPages[page]||lifeHome)();
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render()});
 const slot=document.getElementById('dev-storage'),panel=document.getElementById('storage-panel');
 if(panel){if(slot)slot.append(panel);panel.hidden=!slot}
 const dock=document.getElementById('simple-mobile-dock');if(dock)dock.innerHTML=productNav.slice(0,2).map(([p,i,n])=>`<button onclick="nav('${p}')" class="${page===p?'active':''}">${i}<small>${n}</small></button>`).join('')+`<button class="dock-add" aria-label="语音输入" onclick="lifeFocusComposer()">🎙</button>`+productNav.slice(2).map(([p,i,n])=>`<button onclick="nav('${p}')" class="${page===p||p==='plans'&&page==='plan'?'active':''}">${i}<small>${n}</small></button>`).join('');
 if(document.getElementById('capture-dialog')?.open)simpleRenderCapture();
 if(productRouteReady&&location.hash!==productHash())history.pushState(null,'',productHash());checkReminders();
};
function productCommand(){lifeFocusComposer()}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!document.querySelector('dialog[open]'))lifeFocusComposer()}if(e.key==='Escape')document.body.classList.remove('product-menu-open')});
document.addEventListener('click',e=>{if(document.body.classList.contains('product-menu-open')&&!e.target.closest('aside,.product-mobile-menu'))document.body.classList.remove('product-menu-open')});
window.addEventListener('popstate',()=>{productReadRoute();render()});window.addEventListener('hashchange',()=>{productReadRoute();render()});
const productHeader=document.querySelector('header');productHeader.innerHTML='<button class="product-mobile-menu" aria-label="打开导航" onclick="document.body.classList.toggle(\'product-menu-open\')">☰</button><div class="brand-mini">Life</div><span class="visually-hidden" id="crumb" aria-live="polite"></span><button class="avatar" aria-label="我" onclick="nav(\'me\')">我</button>';
const mobileDock=document.createElement('nav');mobileDock.id='simple-mobile-dock';mobileDock.setAttribute('aria-label','主要导航');document.body.append(mobileDock);
productReadRoute();productRouteReady=true;history.replaceState(null,'',productHash());render();
