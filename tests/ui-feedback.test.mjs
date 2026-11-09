import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const files=['life-planner.js','ui-icons.js','life-home.js','simple-model.js','voice-dashboard.js','ui-polish.js','life-core.js','agent-interaction.js','life-conversation.js'];
const sources=new Map(await Promise.all(files.map(async file=>[file,await readFile(new URL('../public/'+file,import.meta.url),'utf8')])));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const emptyData=()=>({projects:[],tasks:[],events:[],history:[],records:[],roadmaps:[],experiments:[]});

// Run the shipped classic scripts in their real order with an in-memory store.
// DOM doubles are limited to the controls touched by a test; no model or database is called.
function harness(){
 const noop=()=>{},elements=new Map(),intervals=new Map();let intervalId=0;
 const context={
  data:emptyData(),today:()=> '2026-11-09',esc,project:id=>context.data.projects.find(p=>p.id===id),
  page:'home',lifePlanId:null,selectedProject:null,storageState:{writing:false,command:false},
  dashboardBoot:{supportsLifeProposals:true},dashboardMemory:{setItem:noop},KEY:'test',paintStorage:noop,
  window:{lifeAccount:{user:{id:'test'}},addEventListener:noop},
  document:{getElementById:id=>elements.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[],
   createElement:()=>({}),addEventListener:noop,head:{append:noop},body:{append:noop}},
  HTMLDialogElement:class{showModal(){}},history:{state:null,pushState:noop},
  render:noop,productPages:{home:noop,plan:noop,plans:noop},productReview:noop,simpleRecordRow:noop,lifeMePage:noop,
  productTaskForm:noop,productToggleTask:noop,agentMemoryCenter:noop,agentSimulation:noop,
  productAPI:{request:async()=>({})},runDatabaseCommand:action=>action(),save:noop,toast:noop,
  heading:(title,subtitle)=>`<h1>${title}</h1><p>${subtitle}</p>`,taskDate:t=>t.dueDate||t.date||'',
  renderMarkdown:text=>esc(text),AbortController,AbortSignal,setTimeout,clearTimeout,
  setInterval:fn=>{intervals.set(++intervalId,fn);return intervalId},clearInterval:id=>intervals.delete(id),
  performance:{now:()=>0},console
 };
 vm.createContext(context);
 for(const file of files)vm.runInContext(sources.get(file),context,{filename:file});
 return {context,elements,intervals,get:expression=>vm.runInContext(expression,context)};
}
const proposal=()=>({intent:'plan',summary:'论文摘要',operations:[{action:'create_task',title:'改论文摘要',date:'2026-11-09',minutes:25}],proposalId:'p1',proposalVersion:1});

test('Today: completed focus leaves pending list, stays checked in completed section, and can be restored',()=>{
 const {context:c,get}=harness();
 c.data.tasks=[{id:'t1',title:'改论文摘要',done:false,date:'2026-11-09'}];
 c.data.todayFocus={date:'2026-11-09',taskIds:['t1']};
 assert.equal(get('lifeTodayTasks().length'),1);
 c.data.tasks[0].done=true;c.data.tasks[0].completedAt='2026-11-09';
 assert.equal(get('lifeTodayTasks().length'),0);
 const html=get('lifeTodayBlock()');
 assert.match(html,/今天已完成 1 件/);
 assert.match(html,/<input[^>]*\schecked(?:\s|>)/);
 assert.match(html,/productTaskForm\('t1'\)/);
 c.data.tasks[0].done=false;
 assert.equal(get('lifeTodayTasks().length'),1);
 assert.doesNotMatch(get('lifeTodayBlock()'),/<input[^>]*\schecked(?:\s|>)/);
});

test('Today: long daily lists keep all tasks available behind expand',()=>{
 const {context:c,get}=harness();
 c.data.tasks=Array.from({length:10},(_,i)=>({id:'t'+i,title:'任务'+i,date:c.today(),done:false}));
 assert.equal((get('lifeTodayBlock()').match(/type="checkbox"/g)||[]).length,4);
 get('lifeTodayExpanded=true');
 assert.equal((get('lifeTodayBlock()').match(/type="checkbox"/g)||[]).length,10);
});

test('Review: note-only days, completed days and calendar share a 30-day range',()=>{
 const {context:c,get}=harness();
 c.data.records=[{id:'note',title:'笔记',date:'2026-11-09',type:'record'},
  {id:'old',title:'旧笔记',date:'2026-10-10',type:'record'},
  {id:'future',title:'未来记录',date:'2026-11-10',type:'record'}];
 c.data.history=[{id:'h1',title:'完成任务',date:'2026-11-08',type:'任务'}];
 assert.equal(get('dashboardRows().activities.length'),2);
 const values=[...get('dashboardMetrics()').matchAll(/<b>(\d+)<\/b>/g)].map(m=>Number(m[1]));
 assert.deepEqual(values,[1,2,0]);
 const html=get("polishCalendar('2026-11-09')");
 assert.equal((html.match(/onclick="dashboardDetail/g)||[]).length,30);
 assert.match(html,/2026\.10\.11 — 2026\.11\.09/);
 assert.equal((html.match(/class="calendar-spacer"/g)||[]).length,6,'Sunday aligns after Monday through Saturday');
 assert.match(html,/aria-label="2026-11-09，1 条活动" aria-pressed="true"/);
});

test('Agent: focus, custom answers, inline input and voice draft target the open dialog',()=>{
 const {context:c,elements,get}=harness();
 let focused='';
 const main={value:'后台草稿',focus(){focused='home'},scrollIntoView(){}};
 const modal={value:'弹窗草稿',focus(){focused='dialog'},scrollIntoView(){}};
 const custom={id:'command-life-custom-t1-q1',value:'自定义'};
 const inline={id:'command-plan-inline-input',value:'缩短到二十五分钟'};
 const dialog={open:true,querySelector:()=>modal,querySelectorAll:()=>[custom,inline]};
 elements.set('life-input',main);elements.set('assistant-command',dialog);
 assert.equal(get('lifeConvDraft()'),'弹窗草稿');
 get('lifeConvFocus()');assert.equal(focused,'dialog');
 assert.equal(get("lifeConvElement('life-custom-t1-q1')"),custom);
 assert.equal(get("lifeConvElement('plan-inline-input')"),inline);
 dialog.open=false;
 assert.equal(get('lifeConvDraft()'),'后台草稿');
 get('lifeConvFocus()');assert.equal(focused,'home');
 elements.delete('life-input');get('lifeConvFocus()'); // no unbounded retry timer
});

test('Agent: rendering the dialog namespaces editable controls independently of the home',()=>{
 const {elements,get}=harness();
 get("lifeConvAccept({intent:'clarify',proposalId:'p1',questions:[{id:'q1',question:'哪一天？',options:[],allowCustom:true}]})");
 const dialog={open:false,dataset:{context:'全局'},innerHTML:''};elements.set('assistant-command',dialog);
 get('dashboardRenderCommand()');
 const home=get('lifeComposer()');
 const ids=html=>[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 const mainIds=new Set(ids(home));
 assert.ok(ids(dialog.innerHTML).includes('command-input'));
 assert.ok(ids(dialog.innerHTML).some(id=>id.startsWith('command-life-custom-')));
 assert.ok(ids(dialog.innerHTML).every(id=>!mainIds.has(id)));
});

test('Agent: confirm then undo updates store, card and receipt, and cannot reconfirm the old proposal',async()=>{
 const {context:c,get}=harness();let confirms=0;
 c.productAPI.request=async path=>{
  if(path==='/api/life/confirm'){confirms++;return {changeBatchId:'b1',data:{...emptyData(),tasks:[{id:'new'}]},revision:1}}
  if(path==='/api/life/undo')return {data:emptyData(),revision:2};
  throw Error('Unexpected request: '+path);
 };
 c.lifeConvAccept(proposal());await c.lifeConvConfirm();
 assert.equal(c.data.tasks.length,1);
 assert.match(get('lifeConvCurrentHtml()'),/已保存/);
 await c.lifeCoreUndo();
 assert.equal(c.data.tasks.length,0);
 const html=get('lifeConvCurrentHtml()');
 assert.match(html,/已撤销/);assert.doesNotMatch(html,/已保存|确认安排|撤销这次安排/);
 assert.equal(get('lifeConvState.turns.at(-1).reply.message'),'这次安排已撤销。');
 await c.lifeConvConfirm();assert.equal(confirms,1);
});

test('Agent: failed undo keeps saved feedback and prevents duplicate in-flight undo requests',async()=>{
 const {context:c,get}=harness();let undoCalls=0,rejectUndo;
 c.productAPI.request=async path=>{
  if(path==='/api/life/confirm')return {changeBatchId:'b1',data:emptyData(),revision:1};
  undoCalls++;return new Promise((resolve,reject)=>{rejectUndo=reject});
 };
 c.lifeConvAccept(proposal());await c.lifeConvConfirm();
 const pending=c.lifeCoreUndo();await c.lifeCoreUndo();assert.equal(undoCalls,1);
 rejectUndo(Error('网络断开'));await pending;
 assert.equal(get('lifeCoreBatch'),'b1');assert.equal(c.storageState.writing,false);
 assert.match(get('lifeConvCurrentHtml()'),/已保存/);
 assert.doesNotMatch(get('lifeConvCurrentHtml()'),/已撤销/);
});

test('Agent: undoing an earlier saved batch does not invalidate a newer draft',async()=>{
 const {context:c,get}=harness();
 c.productAPI.request=async path=>path.endsWith('/confirm')?{changeBatchId:'b1',data:emptyData(),revision:1}:{data:emptyData(),revision:2};
 c.lifeConvAccept(proposal());await c.lifeConvConfirm();
 c.lifeConvAccept({...proposal(),proposalId:'p2',proposalVersion:2});
 await c.lifeCoreUndo();
 assert.equal(get('lifeConvState.current.reply.proposalId'),'p2');
 assert.equal(get('lifeConvState.current.undone'),undefined);
});

test('Agent: readers keep scroll position while users at the end follow new content',()=>{
 const {context:c,get}=harness();
 const old={scrollTop:70,scrollHeight:1000,clientHeight:300,closest:()=>null,querySelector:()=>null};
 let region=old;c.document.querySelectorAll=()=>[region];
 get('lifeConvKeepScroll')(()=>{region={scrollTop:0,scrollHeight:1200,clientHeight:300,closest:()=>null,querySelector:()=>null}});
 assert.equal(region.scrollTop,70);
 region.scrollTop=900;
 get('lifeConvKeepScroll')(()=>{region={scrollTop:0,scrollHeight:1500,clientHeight:300,closest:()=>null,querySelector:()=>null}});
 assert.equal(region.scrollTop,1500,'browser clamps this to the bottom of the new region');
});

test('Agent waiting: elapsed notice updates without rebuilding the conversation, and cancel ignores a late reply',async()=>{
 const {context:c,get,intervals}=harness();let now=100000,finish,signal,renders=0;
 c.Date=class extends Date{static now(){return now}};
 c.lifeRefresh=()=>{renders++};
 const fields=new Map(['title','detail','elapsed'].map(key=>['[data-life-wait-'+key+']',{textContent:''}]));
 c.document.querySelectorAll=selector=>fields.has(selector)?[fields.get(selector)]:[];
 c.productAPI.request=async(path,options)=>{assert.equal(path,'/api/planner/turn');signal=options.signal;return new Promise(resolve=>{finish=resolve})};
 const pending=c.lifeConvSubmit('明天改论文');
 assert.equal(intervals.size,1);
 assert.match(c.lifeConvStatusHtml(),/取消等待/);
 const before=renders;now+=16000;for(const tick of intervals.values())tick();
 assert.equal(fields.get('[data-life-wait-title]').textContent,'仍在等待回复');
 assert.equal(fields.get('[data-life-wait-elapsed]').textContent,'已等待 16 秒');
 assert.equal(renders,before,'clock updates do not replace the focused input or scroll area');
 now+=30000;for(const tick of intervals.values())tick();
 assert.equal(fields.get('[data-life-wait-title]').textContent,'等待时间较长');
 c.lifeConvCancel();
 assert.equal(signal.aborted,true);assert.equal(intervals.size,0);
 assert.equal(get('lifeConvState.turns[0].text'),'明天改论文');
 assert.equal(get('lifeConvState.state'),'cancelled');
 finish(proposal());await pending;
 assert.equal(get('lifeConvState.current'),null);
 assert.equal(get('lifeConvState.state'),'cancelled');
});

test('Agent waiting: a cancelled response cannot overwrite a newer request or stop its clock',async()=>{
 const {context:c,get,intervals}=harness(),calls=[];
 c.productAPI.request=async(path,options)=>new Promise(resolve=>calls.push({resolve,signal:options.signal}));
 const old=c.lifeConvSubmit('旧要求');c.lifeConvCancel();
 const current=c.lifeConvSubmit('新的要求');
 calls[0].resolve({...proposal(),summary:'旧回复'});await old;
 assert.equal(get('life.phase'),'thinking');assert.equal(intervals.size,1);
 calls[1].resolve({...proposal(),summary:'新回复'});await current;
 assert.equal(get('lifeConvState.current.reply.summary'),'新回复');
 assert.equal(intervals.size,0);assert.equal(get('lifeConvState.controller'),null);
});

test('Agent waiting: automatic recovery keeps total elapsed time and clears the timer on success or error',async()=>{
 const {context:c,get,intervals}=harness();let now=100000,calls=0,startedAt;
 c.Date=class extends Date{static now(){return now}};
 c.setTimeout=fn=>{fn();return 0};
 c.productAPI.request=async()=>{
  if(++calls===1){now+=20000;const error=Error('service unavailable');error.code='AI_BACKEND_UNAVAILABLE';throw error}
  startedAt=get('lifeConvState.waitStartedAt');return proposal();
 };
 await c.lifeConvSubmit('安排任务');
 assert.equal(calls,2);assert.equal(startedAt,100000);assert.equal(intervals.size,0);
 c.productAPI.request=async()=>{throw Error('offline')};
 await c.lifeConvSubmit('换一个要求');
 assert.equal(get('lifeConvState.state'),'error');assert.equal(intervals.size,0);
});

test('Agent waiting: previous proposals cannot be confirmed while an adjustment is pending',async()=>{
 const {context:c,get,intervals}=harness();let finish,requests=0;
 c.lifeConvAccept(proposal());
 c.productAPI.request=async path=>{requests++;assert.equal(path,'/api/planner/turn');return new Promise(resolve=>{finish=resolve})};
 const pending=c.lifeConvSubmit('改到明天下午');
 await c.lifeConvConfirm();assert.equal(requests,1);
 const html=c.lifeConvCurrentHtml();
 assert.match(html,/上一版方案 · 正在等待更新/);
 assert.match(html,/onclick="lifeConvConfirm\(\)" disabled/);
 const waiting=c.lifeThreadHtml();
 assert.ok(waiting.indexOf('取消等待')>waiting.indexOf('</section>'),'cancel stays outside the scrollable transcript');
 c.lifeConvEdit(get('lifeConvState.turns[0].id'));
 assert.equal(intervals.size,0);assert.equal(get('life.phase'),'idle');
 finish(proposal());await pending;assert.equal(get('lifeConvState.current'),null);
});

test('Agent reading: jump-to-latest follows the current plan only when explicitly requested',()=>{
 const {context:c}=harness(),latest={hidden:true};
 const region={scrollTop:20,scrollHeight:1000,clientHeight:300,querySelector:()=>latest};
 c.lifeConvScrolled(region);assert.equal(latest.hidden,false);
 c.lifeConvLatest({closest:()=>region});
 assert.equal(region.scrollTop,1000);assert.equal(latest.hidden,true);
});
