// Planner Agent: understands a natural-language request and returns a proposed change set.
// It never writes. Writes stay in the existing store.commit path (revision + requestId + snapshot).
import {randomUUID} from 'node:crypto';
const pad=n=>String(n).padStart(2,'0');
const dateStr=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const toDate=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,(m||1)-1,d||1)};
const addDays=(s,n)=>{const d=toDate(s);d.setDate(d.getDate()+n);return dateStr(d)};
const weekday=s=>['周日','周一','周二','周三','周四','周五','周六'][toDate(s).getDay()];
const WEEKDAY_INDEX={周一:1,周二:2,周三:3,周四:4,周五:5,周六:6,周日:0,星期一:1,星期二:2,星期三:3,星期四:4,星期五:5,星期六:6,星期天:0,今天:-1,明天:-2,后天:-3};
const taskDate=t=>t.scheduledDate||t.date||t.dueDate||'';
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const LIMIT=200;

function capacityOf(profile){
  // One real task plus a couple of small ones is a full day for most people.
  return {core:1,small:2,maxMinutes:Number(profile?.dailyMinutes||240),restDays:Array.isArray(profile?.restDays)?profile.restDays:[]};
}
// --- 1. understand -------------------------------------------------------
function extractDates(text,today){
  const out=[];
  for(const [name,index] of Object.entries(WEEKDAY_INDEX)){
    if(!text.includes(name))continue;
    if(index>=0)out.push(addDays(today,(index-toDate(today).getDay()+7)%7||7));
    else if(index===-1)out.push(today);
    else if(index===-2)out.push(addDays(today,1));
    else if(index===-3)out.push(addDays(today,2));
  }
  for(const m of text.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g))out.push(`${toDate(today).getFullYear()}-${pad(+m[1])}-${pad(+m[2])}`);
  return {dates:[...new Set(out)].sort()};
}
function extractDuration(text){
  const hour=text.match(/(\d+(?:\.\d+)?)\s*(个)?\s*小时/),min=text.match(/(\d+)\s*分钟/),half=text.match(/半小时/);
  if(half)return 30;if(min)return Math.min(480,Number(min[1]));if(hour)return Math.min(480,Math.round(Number(hour[1])*60));return 0;
}
function extractDeadline(text,today){
  const rel=text.match(/(\d+)\s*天(内|后|之内)/);if(rel)return addDays(today,Number(rel[1]));
  const dates=extractDates(text,today).dates.filter(d=>d>=today);
  // "周六想休息" is a constraint, not a deadline. Only explicit wording sets one.
  if(/(之前|以前|截止|前完成|前交|前提交|前改完|deadline)/.test(text)&&dates.length)return dates[0];
  if(/下周|下个?星期/.test(text)&&dates.length)return dates[0];
  if(/这周|本周|这个?星期/.test(text)){const dow=toDate(today).getDay();return addDays(today,(7-dow)%7||7)}
  return '';
}
// --- 2. classify ---------------------------------------------------------
const TEMPLATES=[
  {test:/论文|thesis|paper|投稿|改稿|摘要|引言/,category:'科研',goal:'完成论文修改并按时提交',stages:['确定修改范围','修改摘要与引言','检查实验与结果','统一图表与格式','核对参考文献','全文通读并定稿']},
  {test:/六级|四级|cet|考研|雅思|托福|备考|单词|词汇/,category:'考试',goal:'稳步提升并通过考试',stages:['词汇','听力','阅读','翻译','写作','真题模拟']},
  {test:/作业|homework|报告|实验报告|课程|大作业/,category:'课程',goal:'按时完成并提交作业',stages:['理清要求','收集资料','完成主体','检查与提交']},
  {test:/旅行|旅游|去玩|杭州|出行|订票|酒店|行程/,category:'出行',goal:'顺利成行',stages:['确定时间','买票','订住宿','安排行程','出发准备']},
  {test:/健身|减脂|运动|跑步|锻炼|身体/,category:'健康',goal:'养成稳定的运动习惯',stages:['制定计划','开始训练','逐步加量','记录与复盘']},
  {test:/面试|实习|简历|工作|项目汇报|周报/,category:'工作',goal:'推进并交付工作事项',stages:['明确目标','准备材料','执行推进','检查交付']}
];
function classify(text){
  for(const t of TEMPLATES)if(t.test.test(text))return t;
  return {category:'生活',goal:'把这件事推进到完成',stages:['明确目标','迈出第一步','持续推进','检查收尾','复盘收尾']};
}
function simpleTaskTopics(text){
  const topics=[];
  for(const sentence of text.split(/[，。；,;!！?？\n]/)){
    const s=clean(sentence);
    if(!s||s.length>40)continue;
    if(/^(买|取|寄|拿|打|还|交|预约|报名|下载|打印|回复|联系)/.test(s))topics.push(s);
  }
  if(!topics.length){
    for(const t of TEMPLATES)if(t.test.test(text)){topics.push(...t.stages.slice(0,3));break}
  }
  return topics.slice(0,8);
}
// --- 3. schedule ---------------------------------------------------------
function loadByDate(state,days){
  const map=new Map(days.map(d=>[d,0]));
  for(const t of state.tasks||[])if(!t.done){const d=taskDate(t);if(map.has(d))map.set(d,map.get(d)+1)}
  return map;
}
function schedule(items,{start,days,capacity,existing,deadline}){
  const slots=days.length?days:Array.from({length:14},(_,i)=>addDays(start,i));
  const rest=new Set(capacity.restDays);
  const perDay=capacity.core+capacity.small;
  const usable=slots.filter(d=>!rest.has(weekday(d)));
  if(!usable.length)return items.map(item=>({...item,date:start,minutes:item.minutes||45}));
  let cursor=0;
  return items.map(item=>{
    let date='';
    for(let guard=0;guard<usable.length;guard++){
      const day=usable[(cursor+guard)%usable.length];
      if((existing.get(day)||0)<perDay){date=day;existing.set(day,(existing.get(day)||0)+1);cursor=(cursor+guard+1)%usable.length;break}
    }
    if(!date)date=usable[cursor%usable.length];
    if(deadline&&date>deadline)date=deadline;
    return {...item,date,minutes:item.minutes||45};
  });
}
// --- 4. reconcile --------------------------------------------------------
function findOverloaded(state,days,capacity){
  const counts=new Map();
  for(const t of state.tasks||[])if(!t.done){const d=taskDate(t);if(d>=days[0]&&d<=days[days.length-1])counts.set(d,(counts.get(d)||0)+1)}
  const limit=capacity.core+capacity.small;
  return [...counts.entries()].filter(([,n])=>n>limit).sort((a,b)=>b[1]-a[1]);
}
// --- 5. anaphora ---------------------------------------------------------
function resolveReference(state,session,text){
  const projects=[...(state.projects||[])];
  const tasks=[...(state.tasks||[])];
  const byWord=word=>projects.find(p=>p.title.includes(word));
  // "这个" / "刚才那个" inside a plan page means the plan the user is looking at.
  if(session?.focus?.title){
    const focused=projects.find(p=>p.title.includes(session.focus.title)||session.focus.title.includes(p.title));
    if(focused&&(session.focus.projectId||/这个|那个|它|接下来|继续/.test(text)))return {kind:'project',project:focused,tasks:tasks.filter(t=>t.projectId===focused.id&&!t.done)};
  }
  for(const word of ['论文','六级','作业','杭州','健身','实验','考试'])
    if(text.includes(word)){const p=byWord(word);if(p)return {kind:'project',project:p,tasks:tasks.filter(t=>t.projectId===p.id&&!t.done)}}
  if(session.focus){const p=projects.find(p=>p.id===session.focus.projectId);if(p)return {kind:'project',project:p,tasks:tasks.filter(t=>t.projectId===p.id&&!t.done)}}
  const ordinal=text.match(/第\s*([一二三四五六七八九十1-9])\s*个/);
  if(ordinal&&session.recent.taskIds.length){
    const map={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
    const index=(map[ordinal[1]]||Number(ordinal[1]||1))-1;
    const id=session.recent.taskIds[index];const t=tasks.find(x=>x.id===id);
    if(t)return {kind:'task',tasks:[t]};
  }
  if(session.recent.taskIds.length){const t=tasks.find(x=>x.id===session.recent.taskIds.at(-1));if(t)return {kind:'task',tasks:[t]}}
  return {kind:'none',tasks:[]};
}
// --- 6. intent -----------------------------------------------------------
const CREATE_HINT=/我要|我想|我想要|帮我|请帮我|准备|打算|计划|需要|最近要|这周要|本周要|下周要|开始做|去做|要做|搞一下|弄一下|做一个|写一下/;
const MODIFY_HINT=/不要|别|取消|去掉|删除|不用了|不安排|不想|不学习|休息|空出来|挪|推迟|延后|往后|提前|改到|放到|太(多|满|紧|重)|减|每天|每周|顺一顺|松一点/;
function detectIntent(text){
  if(/^(我?)?(这周|本周|最近)?(还有|还剩|有什么|最重要|哪个|哪天|怎么样|进度|多少|几个)/.test(text))return 'query';
  if(/[？?]$/.test(text)&&/什么|多少|哪|谁|吗|怎样/.test(text))return 'query';
  // A sentence that both states a goal and mentions a constraint is still a new plan.
  if(CREATE_HINT.test(text)&&!/挪|推迟|延后|往后|改到|不要|取消|删除|去掉|太(多|满|紧)|每天|每周/.test(text))return 'create';
  if(MODIFY_HINT.test(text))return 'modify';
  return 'create';
}
// --- 7. handlers ---------------------------------------------------------
function buildCreate(state,session,text,today){
  const tpl=classify(text);
  const deadline=extractDeadline(text,today);
  const rest=extractRestDays(text,today);
  const capacity=capacityOf({...(state.plannerProfile||{}),restDays:[...new Set([...(state.plannerProfile?.restDays||[]),...(session?.restDays||[]),...rest])]});
  // Spread the work across the whole window instead of piling it onto the last day.
  const windowDays=(deadline?Array.from({length:14},(_,i)=>addDays(today,i)).filter(d=>d<=deadline):[]);
  const days=windowDays.length?windowDays:Array.from({length:14},(_,i)=>addDays(today,i));
  const existing=loadByDate(state,days);
  const title=deriveTitle(text,tpl);
  const items=tpl.stages.map(name=>({title:name,minutes:extractDuration(text)||45}));
  const scheduled=schedule(items,{start:today,days,capacity,existing,deadline});
  const plan={title,category:tpl.category,goal:tpl.goal,deadline:deadline||'',restDays:[...new Set(rest)],stages:scheduled.map(s=>({title:s.title,date:s.date,minutes:s.minutes}))};
  const note=rest.length?`，${rest.join('和')}给你留空`:'';
  const message=deadline?`整理好了。「${title}」拆成 ${items.length} 步，排到了 ${deadline} 之前${note}。`:`整理好了。「${title}」拆成 ${items.length} 步，每天一两件，不堆在一起${note}。`;
  return {intent:'create',message,plan,operations:[{op:'create_plan',...plan}],needsConfirmation:true};
}
function extractRestDays(text,today){
  const days=[];
  if(/周六|周末/.test(text))days.push(weekday(addDays(today,(6-toDate(today).getDay()+7)%7||7)));
  if(/周日|星期天/.test(text))days.push(weekday(addDays(today,(0-toDate(today).getDay()+7)%7||7)));
  return days;
}
function deriveTitle(text,tpl){
  let s=clean(text);
  const prefixes=/^(我|帮我|请帮我|请|你|想|要|需要|打算|准备|最近|这周|本周|下周|这星期)/;
  for(let i=0;i<6&&prefixes.test(s);i++)s=s.replace(prefixes,'');
  s=s.replace(/(帮我|安排一下|安排|整理一下|规划一下|一下)$/g,'');
  const short=s.split(/[，。；,;]/)[0].slice(0,18);
  return short||tpl.category+'计划';
}
function extractMoveTarget(text,today){
  const m=text.match(/(改到|放到|挪到|移到|安排到|顺延到)\s*(周[一二三四五六日天]|明天|后天|今天|\d{1,2}\s*月\s*\d{1,2}\s*[日号])/);
  return m?extractDates(m[2],today).dates[0]||'':'';
}
function buildModify(state,session,text,today){
  const ref=resolveReference(state,session,text);
  const profile=state.plannerProfile||{},capacity=capacityOf(profile);
  // Rest days mentioned earlier in the same conversation still apply.
  capacity.restDays=[...new Set([...capacity.restDays,...(session.restDays||[])])];
  const days=Array.from({length:14},(_,i)=>addDays(today,i));
  const dates=extractDates(text,today).dates;
  const operations=[],changes=[];
  if(/取消|删除|去掉|不用了|不做了/.test(text)){
    if(!ref.tasks.length)return {intent:'clarify',message:'你说的是哪一项？告诉我名字我就去掉。',operations:[],needsConfirmation:false};
    for(const t of ref.tasks.slice(0,5)){operations.push({op:'delete_task',id:t.id});changes.push({op:'delete',title:t.title})}
    return {intent:'modify',message:`好，去掉 ${operations.length} 项。`,plan:null,operations,changes,needsConfirmation:operations.length>1};
  }
  if(/不要安排|别安排|不安排|休息|空出来|不学习|不想学习/.test(text)){
    const target=dates[0]||today;
    const blocked=(state.tasks||[]).filter(t=>!t.done&&taskDate(t)===target);
    const counts=loadByDate(state,days);
    const free=days.find(d=>d>target&&!capacity.restDays.includes(weekday(d))&&(counts.get(d)||0)<capacity.core+capacity.small)||addDays(target,1);
    for(const t of blocked){operations.push({op:'move_task',id:t.id,to:free});changes.push({op:'move',title:t.title,from:target,to:free})}
    // Remember it, so the next plan does not fill that day again.
    operations.push({op:'rest_day',day:weekday(target)});
    const message=blocked.length?`好，${weekday(target)}给你留空，${blocked.length} 项挪到了${weekday(free)}。`:`${weekday(target)}本来就是空的，我记下了：以后这天不排事。`;
    return {intent:'modify',message,plan:null,operations,changes,needsConfirmation:false,restDay:target};
  }
  if(/挪|推迟|延后|顺延|往后|提前|改到|放到|调整|移/.test(text)){
    if(!ref.tasks.length)return {intent:'clarify',message:'要把哪一项挪？说一下名字我就改。',operations:[],needsConfirmation:false};
    const back=/往后|推迟|延后|顺延/.test(text),forward=/提前/.test(text);
    const base=taskDate(ref.tasks[0])||today;
    const explicit=extractMoveTarget(text,today);
    let target=explicit||(back?addDays(base,1):forward?addDays(base,-1):addDays(today,1));
    if(!explicit&&(back||forward)){const step=back?1:-1;for(let guard=0;guard<7&&capacity.restDays.includes(weekday(target));guard++)target=addDays(target,step)}
    for(const t of ref.tasks.slice(0,4)){operations.push({op:'move_task',id:t.id,to:target});changes.push({op:'move',title:t.title,from:taskDate(t),to:target})}
    const message=ref.tasks.length>1?`好，把「${ref.project?.title||ref.tasks[0].title}」里待办的 ${Math.min(ref.tasks.length,4)} 项挪到了${weekday(target)}。`:`好，「${ref.tasks[0].title}」挪到${weekday(target)}（${target}）。`;
    return {intent:'modify',message,plan:null,operations,changes,needsConfirmation:false};
  }
  if(/太(多|满|紧|重)|减|顺一顺|松一点/.test(text)){
    const overloaded=findOverloaded(state,days,capacity);
    const mentioned=dates[0];
    const pick=overloaded.find(([d])=>d===mentioned)||overloaded[0];
    if(!pick)return {intent:'answer',message:'这几天都不算满，我先不动。',operations:[],needsConfirmation:false};
    const [day,count]=pick;
    const moving=(state.tasks||[]).filter(t=>!t.done&&taskDate(t)===day).slice(-Math.max(1,count-(capacity.core+capacity.small)));
    const free=days.find(d=>d>day&&(loadByDate(state,days).get(d)||0)<capacity.core+capacity.small)||addDays(day,1);
    for(const t of moving){operations.push({op:'move_task',id:t.id,to:free});changes.push({op:'move',title:t.title,from:day,to:free})}
    return {intent:'modify',message:`${weekday(day)}排了 ${count} 项，我挪了 ${moving.length} 项到${weekday(free)}。`,plan:null,operations,changes,needsConfirmation:true};
  }
  if(/每天|每周/.test(text)){
    const minutes=extractDuration(text)||30;
    const title=/听力/.test(text)?'听力练习':/单词|词汇|背/.test(text)?'背单词':/六级|四级|cet|考研|雅思|托福/i.test(text)?'备考练习':ref.project?ref.project.title:'每日推进';
    const planId=ref.project?.id||'';
    for(const d of days.slice(0,7))operations.push({op:'create_task',title,date:d,minutes,planId});
    return {intent:'modify',message:`好，接下来 7 天每天安排 ${minutes} 分钟：${title}。`,plan:null,operations,changes:[{op:'add',title,to:weekday(days[0])}],needsConfirmation:true};
  }
  return {intent:'clarify',message:'你想怎么改？比如说「周三太多了」「论文挪到周五」「周六不安排」。',operations:[],needsConfirmation:false};
}
function buildQuery(state,text,today,session){
  const days=Array.from({length:7},(_,i)=>addDays(today,i));
  const open=(state.tasks||[]).filter(t=>!t.done);
  if(session?.focus?.title){
    const ref=resolveReference(state,session,text);
    if(ref.project){
      const next=ref.tasks.slice(0,3).map(t=>`${t.title}（${weekday(taskDate(t)||today)}）`).join('、');
      return {intent:'answer',message:ref.tasks.length?`「${ref.project.title}」还有 ${ref.tasks.length} 步：${next}。想怎么改？可以说「往后一天」或者「周四太多」。`:`「${ref.project.title}」的步骤都完成了。`,operations:[],needsConfirmation:false};
    }
  }
  if(/最重要|最急|先做/.test(text)){
    const ranked=[...open].sort((a,b)=>{
      const da=taskDate(a)||'9999-12-31',db=taskDate(b)||'9999-12-31';
      if(da!==db)return da<db?-1:1;
      return (b.priority==='high'?1:0)-(a.priority==='high'?1:0);
    });
    if(!ranked.length)return {intent:'answer',message:'现在没有待办，很干净。',operations:[],needsConfirmation:false};
    const top=ranked.slice(0,3).map(t=>t.title).join('、');
    return {intent:'answer',message:`最急的是：${top}。`,operations:[],needsConfirmation:false};
  }
  if(/还剩|论文|进度|多少/.test(text)){
    const word=text.match(/论文|六级|作业|健身|考试|杭州/)?.[0];
    const project=(state.projects||[]).find(p=>!word||p.title.includes(word));
    if(project){
      const tasks=open.filter(t=>t.projectId===project.id);
      return {intent:'answer',message:`「${project.title}」还有 ${tasks.length} 步没完成${tasks[0]?`，下一步是：${tasks[0].title}`:''}。`,operations:[],needsConfirmation:false};
    }
  }
  if(/哪天(空|有空)|空/.test(text)){
    const counts=loadByDate(state,days);
    const free=days.find(d=>(counts.get(d)||0)===0);
    return {intent:'answer',message:free?`${weekday(free)}（${free}）目前是空的。`:'这 7 天都排了事，我可以帮你挪一挪。',operations:[],needsConfirmation:false};
  }
  const week=open.filter(t=>{const d=taskDate(t);return d&&d>=days[0]&&d<=days[6]});
  const overdue=open.filter(t=>{const d=taskDate(t);return d&&d<today});
  return {intent:'answer',message:`这周还有 ${week.length} 项待办${overdue.length?`，其中 ${overdue.length} 项已经过了原定日期，要不要我重新排一下`:'。'}`,operations:[],needsConfirmation:false};
}
// --- 8. session + entry --------------------------------------------------
export function createPlanner(store,{ai=null,ttl=30*60*1000,now=()=>new Date()}={}){
  const sessions=new Map();
  const touch=s=>{s.touched=Date.now();return s};
  const get=id=>{const s=sessions.get(id);if(!s||Date.now()-s.touched>ttl)throw Object.assign(Error('这段对话已经结束了，我们重新开始吧。'),{status:410});return touch(s)};
  return {
    status:()=>({ready:true,ai:!!ai}),
    async turn({sessionId,message,timezone='Asia/Shanghai',focus=null}={}){
      if(typeof message!=='string'||!message.trim()||message.length>4000)throw Object.assign(Error('说一句 1～4000 字的话就行。'),{status:400});
      for(const [id,s] of sessions)if(Date.now()-s.touched>ttl)sessions.delete(id);
      let s;
      if(sessionId)s=get(sessionId);
      else{if(sessions.size>=64)throw Object.assign(Error('同时进行的对话太多了，请稍后再试。'),{status:429});s={id:randomUUID(),history:[],focus:null,recent:{taskIds:[]},touched:Date.now()};sessions.set(s.id,s)}
      const state=await store.read();
      const today=dateStr(now());
      const text=clean(message);
      let extracted=null;
      if(ai?.parse_text_capture){
        try{
          const result=await ai.parse_text_capture(text,timezone,'zh-CN',now().toISOString());
          if(result?.status==='ok'&&Array.isArray(result.capture?.items))extracted=result.capture.items;
        }catch{extracted=null}
      }
      if(focus?.title)s.focus={projectId:focus.id||null,title:focus.title};
      let intent=detectIntent(text);
      // Opening a plan and asking "接下来怎么安排" is a question, not a new plan.
      if(s.focus?.title&&/怎么|接下来|看看|现在/.test(text)&&!/改|挪|删|取消|每天|往后|提前|加/.test(text))intent='query';
      let out;
      if(intent==='query')out=buildQuery(state.data,text,today,s);
      else if(intent==='modify')out=buildModify(state.data,s,text,today);
      else if(extracted?.length){
        const titles=extracted.map(x=>clean(x.title)).filter(Boolean).slice(0,8);
        const tpl=classify(text);
        const deadline=extractDeadline(text,today);
        const capacity=capacityOf(state.data.plannerProfile||{});
        const windowDays=(deadline?Array.from({length:14},(_,i)=>addDays(today,i)).filter(d=>d<=deadline):[]);
        const days=windowDays.length?windowDays:Array.from({length:14},(_,i)=>addDays(today,i));
        const scheduled=schedule(titles.map(title=>({title,minutes:extractDuration(text)||45})),{start:today,days,capacity,existing:loadByDate(state.data,days),deadline});
        const title=titles.length===1?titles[0]:deriveTitle(text,tpl);
        out={intent:'create',message:`整理好了。我拆成了 ${scheduled.length} 步。`,plan:{title,category:tpl.category,goal:tpl.goal,stages:scheduled.map(x=>({title:x.title,date:x.date,minutes:x.minutes}))},operations:[{op:'create_plan',title,category:tpl.category,goal:tpl.goal,deadline:deadline||'',stages:scheduled.map(x=>({title:x.title,date:x.date,minutes:x.minutes}))}],needsConfirmation:true};
      }
      else out=buildCreate(state.data,s,text,today);
      if(out.intent==='create'&&!out.operations.length)out={intent:'clarify',message:'我没太听明白，换个说法试试？比如「这周把论文改完」。',operations:[],needsConfirmation:false};
      if(out.plan?.restDays?.length)s.restDays=[...new Set([...(s.restDays||[]),...out.plan.restDays])];
      if(out.operations.some(o=>o.op==='rest_day'))s.restDays=[...new Set([...(s.restDays||[]),...out.operations.filter(o=>o.op==='rest_day').map(o=>o.day)])];
      const ids=out.operations.filter(o=>o.op==='create_task'||o.op==='move_task').map(o=>o.id).filter(Boolean);
      s.recent.taskIds=[...new Set([...ids,...s.recent.taskIds])].slice(0,12);
      const created=out.operations.find(o=>o.op==='create_plan');
      if(created)s.focus={projectId:null,title:created.title};
      s.history.push({role:'user',text:message},{role:'assistant',text:out.message});
      s.history=s.history.slice(-20);
      touch(s);
      return {sessionId:s.id,intent:out.intent,message:out.message,plan:out.plan||null,changes:out.changes||[],operations:out.operations.slice(0,LIMIT),needsConfirmation:!!out.needsConfirmation,revision:state.revision,extracted:!!extracted};
    },
    async apply({sessionId,operations}={}){
      if(!Array.isArray(operations)||!operations.length)throw Object.assign(Error('没有需要保存的修改。'),{status:400});
      if(sessionId)get(sessionId);
      return {ok:true,count:operations.length};
    },
    cancel({sessionId}){const s=get(sessionId);s.history.push({role:'user',text:'先不用'});return {cancelled:true}}
  };
}
export const plannerHelpers={dateStr,addDays,weekday,taskDate,classify,extractDates,extractDuration,extractDeadline,schedule,findOverloaded,resolveReference,detectIntent,simpleTaskTopics};
