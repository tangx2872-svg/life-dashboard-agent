// Structural navigation is independent of the user's browser Back stack.
function lifeNavigate(hash='#/today'){
 const go=()=>{if(location.hash!==hash)history.pushState(null,'',hash);productReadRoute();render();window.scrollTo(0,0)};
 const panels=[...document.querySelectorAll('dialog[open]')],steps=panels.filter(d=>d.dataset.polishToken).length;
 if(panels.length){polishReturning=true;panels.forEach(d=>d.close());polishReturning=false;if(steps&&history.state?.polishPanel){window.addEventListener('popstate',()=>setTimeout(go,0),{once:true});history.go(-steps);return}}
 go();
}
function lifeGoHome(){lifeNavigate()}
function lifeBreadcrumbItems(dialog=null){
 const home={title:'Life',hash:'#/today'},names={plans:'计划',projects:'项目',tasks:'任务',review:'回顾',timeline:'近期安排',records:'记录',archive:'历史',me:'设置',settings:'设置',aiCapture:'AI',assistant:'AI',dataManagement:'数据与隐私',inbox:'收件箱',ideas:'想法',roadmaps:'学习',experiments:'实验',reminders:'提醒'};
 const rows=[home];
 if(['plan','detail'].includes(page)){const p=simpleProject(page==='plan'?lifePlanId:selectedProject);rows.push({title:page==='plan'?'计划':'项目',hash:page==='plan'?'#/plans':'#/projects'},{title:p?.title||'详情',hash:productHash()})}
 else if(page!=='home')rows.push({title:names[page]||'详情',hash:productHash()});
 if(dialog){const taskTitle=dialog.id==='modal'&&document.getElementById('modal-title')?.textContent==='任务详情'?dialog.querySelector('[name=title]')?.value:null;
 if(taskTitle){const key=dialog.querySelector('[name=projectKey]')?.value,p=simpleProject(key);rows.splice(1);rows.push({title:'项目',hash:'#/projects'});if(p)rows.push({title:p.title,hash:'#/projects/'+encodeURIComponent(p.key)});rows.push({title:taskTitle})}
 else {const titles={'agent-memories':'记忆','agent-memory-edit':'修正记忆','conversation-history':'AI 对话','insight-detail':'历史详情','assistant-command':'AI 助理','agent-simulation':'未来模拟','agent-proposal':'调整建议','capture-dialog':'快速记录'};const title=titles[dialog.id];if(title)rows.push({title})}
 }
 return rows.slice(0,4);
}
function lifeBreadcrumbHTML(dialog=null){const items=lifeBreadcrumbItems(dialog);return items.map((item,i)=>{const last=i===items.length-1,content=last&&i>0?`<span aria-current="page" title="${esc(item.title)}">${esc(item.title)}</span>`:`<button type="button" data-life-route="${esc(item.hash||'#/today')}" ${i===0?'aria-label="返回首页"':''} title="${esc(item.title)}">${esc(item.title)}</button>`;return `<span class="life-crumb-item ${last?'is-current':''} ${i===0?'is-root':''}">${i?'<span class="life-crumb-separator" aria-hidden="true">/</span>':''}${content}</span>`}).join('')}
function lifePaintNavigation(){
 const brand=document.querySelector('aside>.brand');if(brand&&!brand.dataset.lifeHome){brand.dataset.lifeHome='true';brand.setAttribute('role','button');brand.tabIndex=0;brand.setAttribute('aria-label','返回首页');brand.onclick=lifeGoHome;brand.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();lifeGoHome()}}}
 let crumb=document.getElementById('life-breadcrumb');if(!crumb){const title=document.querySelector('header .brand-mini');if(title){crumb=document.createElement('nav');crumb.id='life-breadcrumb';crumb.className='life-breadcrumb';crumb.setAttribute('aria-label','当前位置');title.replaceWith(crumb)}}
 if(crumb)crumb.innerHTML=lifeBreadcrumbHTML();
 document.querySelectorAll('dialog[open]').forEach(d=>{if(d.classList.contains('product-confirm')||d.id==='agent-memory-edit')return;let el=d.querySelector(':scope>.life-panel-breadcrumb');if(!el){el=document.createElement('nav');el.className='life-breadcrumb life-panel-breadcrumb';el.setAttribute('aria-label','详情位置');d.prepend(el)}el.innerHTML=lifeBreadcrumbHTML(d)});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-life-route]');if(b){e.preventDefault();lifeNavigate(b.dataset.lifeRoute)}});
const lifeNavigationRender=render;render=function(){lifeNavigationRender();lifePaintNavigation()};
const lifeNavigationShow=HTMLDialogElement.prototype.showModal;HTMLDialogElement.prototype.showModal=function(){lifeNavigationShow.call(this);lifePaintNavigation()};
const lifeNavigationObserver=new MutationObserver(records=>{if(records.some(r=>r.target instanceof HTMLElement&&r.target.closest('dialog')&&!r.target.closest('.life-breadcrumb')))lifePaintNavigation()});lifeNavigationObserver.observe(document.body,{childList:true,subtree:true});
const lifeNavigationCss=document.createElement('link');lifeNavigationCss.rel='stylesheet';lifeNavigationCss.href='navigation.css';document.head.append(lifeNavigationCss);lifePaintNavigation();
