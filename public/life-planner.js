// The user talks; the planner thinks; this module only applies what the user accepts.
const life={sessionId:'',phase:'idle',result:null,error:'',text:'',focus:null,undoLabel:''};
const lifeAudio={recorder:null,stream:null,chunks:[],blob:null,type:'',timer:null,clock:null,starting:false,cancelled:false,startedAt:0};
const LIFE_PHASE={idle:'直接说就行，我来整理。',listening:'正在听…',transcribing:'正在把录音变成文字…',thinking:'正在整理…',review:'',answered:'',done:'已经安排好了。',error:''};

function lifeRefresh(){if(page==='home'||page==='plans'||page==='plan')render()}
function lifePhaseText(){
  if(life.phase==='error')return life.error;
  if(life.phase==='listening')return '正在听… 说完点一下麦克风。';
  if(life.phase==='transcribing')return '正在把录音变成文字…';
  if(life.phase==='thinking')return '正在整理…';
  if(life.phase==='review')return '看这样行不行？';
  if(life.phase==='answered')return '就这些。';
  if(life.phase==='done')return '已经安排好了，不想要可以撤销。';
  return LIFE_PHASE.idle;
}
async function lifeTurn(text){
  const message=String(text||'').trim();
  if(!message){life.error='先说点什么，或者点麦克风。';life.phase='error';lifeRefresh();return}
  if(life.phase==='thinking'||life.phase==='transcribing')return;
  life.phase='thinking';life.error='';life.result=null;life.text=message;lifeRefresh();
  try{
    const reply=await productAPI.request('/api/planner/turn',{method:'POST',body:JSON.stringify({sessionId:life.sessionId||undefined,message,...(life.focus?{focus:life.focus}:{})})});
    life.sessionId=reply.sessionId;life.result=reply;life.error='';
    if(reply.intent==='clarify'||reply.intent==='answer'||!reply.operations?.length){life.phase='answered'}
    else if(reply.needsConfirmation){life.phase='review'}
    else{await lifeApply(reply.operations,reply.message)}
  }catch(e){
    life.error=e.code==='AI_BACKEND_TIMEOUT'?'整理得有点久，再说一次试试。':e.message||'现在连不上服务，稍后再说一次。';life.phase='error';
  }finally{lifeRefresh()}
}
async function lifeApply(operations,message=''){
  if(!operations?.length)return;
  if(storageState.writing)return toast('正在保存上一条，稍等一下。');
  const snapshot=JSON.stringify(data);
  const result=await runDatabaseCommand(()=>{
    lifeApplyOperations(operations);
    lifeFocusToday();
    simpleSetUndo('安排',()=>{data=JSON.parse(snapshot)});
    save();
  });
  if(!result?.ok){life.phase='error';life.error='没能保存，数据没有改动。';return}
  life.phase='done';life.undoLabel='安排';if(message)life.result={...life.result,message};
}
function lifeApplyOperations(operations){
  const now=new Date().toISOString();
  for(const op of operations||[]){
    if(op.op==='create_plan'){
      const category=op.category||'生活';
      if(!(data.categories||[]).includes(category))(data.categories??=[]).push(category);
      // Remember habits the user mentioned, so later planning respects them without asking again.
      if(op.restDays?.length){
        const profile=data.plannerProfile??={};
        profile.restDays=[...new Set([...(profile.restDays||[]),...op.restDays])];
      }
      const project={id:uid(),title:op.title,description:op.goal||'',status:'进行中',category,icon:'🌱',mode:'auto',manual:0,start:today(),target:op.deadline||'',phases:[],notes:[],createdAt:now,source:'planner',aiGenerated:true};
      data.projects.push(project);
      for(const stage of op.stages||[]){
        const phase={id:uid(),title:stage.title,status:'未开始',progress:0};
        project.phases.push(phase);
        data.tasks.push({id:uid(),title:stage.title,projectId:project.id,phaseId:phase.id,date:stage.date||'',dueDate:stage.date||'',scheduledDate:stage.date||'',estimatedMinutes:stage.minutes||45,time:stage.time||'',done:false,status:'todo',priority:stage.priority||'normal',subtasks:[],source:'planner',aiGenerated:true,createdAt:now,updatedAt:now});
      }
    }else if(op.op==='create_task'){
      data.tasks.push({id:uid(),title:op.title,projectId:op.planId||'',phaseId:'',date:op.date||'',dueDate:op.date||'',scheduledDate:op.date||'',estimatedMinutes:op.minutes||30,done:false,status:'todo',priority:'normal',subtasks:[],source:'planner',aiGenerated:true,createdAt:now,updatedAt:now});
    }else if(op.op==='move_task'){
      const t=data.tasks.find(x=>x.id===op.id);if(!t)continue;
      t.date=op.to;t.dueDate=op.to;t.scheduledDate=op.to;t.updatedAt=now;
    }else if(op.op==='delete_task'){
      const index=data.tasks.findIndex(x=>x.id===op.id);if(index>=0)data.tasks.splice(index,1);
    }else if(op.op==='rest_day'){
      const profile=data.plannerProfile??={};
      profile.restDays=[...new Set([...(profile.restDays||[]),op.day])];
    }
  }
}
// Today's list should show what was just arranged, without asking the user to pick again.
function lifeFocusToday(){
  const todayIds=data.tasks.filter(t=>!t.done&&(t.scheduledDate===today()||t.dueDate===today())).map(t=>t.id);
  const ids=data.todayFocus?.date===today()?[...new Set([...data.todayFocus.taskIds,...todayIds])]:todayIds;
  const valid=ids.filter(id=>data.tasks.some(t=>t.id===id&&!t.done));
  data.todayFocus={date:today(),taskIds:valid.slice(0,4)};
}
function lifeTodayTasks(){
  const ids=new Set();
  if(data.todayFocus?.date===today())for(const id of data.todayFocus.taskIds)ids.add(id);
  for(const t of data.tasks)if(!t.done&&(t.scheduledDate===today()||t.dueDate===today()||t.date===today()))ids.add(t.id);
  return [...ids].map(id=>data.tasks.find(t=>t.id===id)).filter(Boolean)
    .sort((a,b)=>String(a.time||'99:99').localeCompare(String(b.time||'99:99')));
}
function lifeDismiss(){life.result=null;life.phase='idle';life.text='';life.error='';lifeRefresh()}
async function lifeVoice(){
  if(life.phase==='thinking'||life.phase==='transcribing')return;
  if(lifeAudio.starting){lifeAudio.cancelled=true;return}
  if(lifeAudio.recorder?.state==='recording'){lifeAudio.recorder.stop();return}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){life.error='这个浏览器不支持录音，直接打字也可以。';life.phase='error';lifeRefresh();return}
  lifeAudio.starting=true;lifeAudio.cancelled=false;life.phase='listening';life.error='';lifeRefresh();
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(lifeAudio.cancelled){stream.getTracks().forEach(t=>t.stop());life.phase='idle';return}
    lifeAudio.stream=stream;
    const type=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!type)throw Error('这个浏览器没有可用的录音格式，换 Chrome 或 Edge 试试。');
    const recorder=new MediaRecorder(stream,{mimeType:type});lifeAudio.recorder=recorder;lifeAudio.chunks=[];lifeAudio.blob=null;lifeAudio.type=type;
    let failed=false;
    recorder.ondataavailable=e=>{if(e.data.size)lifeAudio.chunks.push(e.data)};
    recorder.onerror=()=>{failed=true};
    recorder.onstop=async()=>{
      clearTimeout(lifeAudio.timer);clearInterval(lifeAudio.clock);stream.getTracks().forEach(t=>t.stop());
      lifeAudio.recorder=null;lifeAudio.stream=null;
      if(lifeAudio.cancelled){life.phase='idle';lifeRefresh();return}
      lifeAudio.blob=new Blob(lifeAudio.chunks,{type});lifeAudio.chunks=[];
      if(failed||!lifeAudio.blob.size){life.error='没听到声音，再试一次。';life.phase='error';lifeRefresh();return}
      await lifeTranscribe();
    };
    recorder.start(1000);lifeAudio.startedAt=Date.now();
    lifeAudio.clock=setInterval(()=>{const el=document.getElementById('life-mic-time');if(!el)return;const seconds=Math.floor((Date.now()-lifeAudio.startedAt)/1000);el.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`},1000);
    lifeAudio.timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},120000);
  }catch(e){
    life.phase='error';life.error=e.name==='NotAllowedError'?'麦克风没开，允许一下就好。':e.message||'没发启动录音';
  }finally{lifeAudio.starting=false;lifeRefresh()}
}
async function lifeTranscribe(){
  if(!lifeAudio.blob)return;
  life.phase='transcribing';life.error='';lifeRefresh();
  try{
    const originalDraft=life.text||'';const voiceStarted=performance.now();const result=await productAPI.transcribe(lifeAudio.blob);life.voiceTimings={asr_ms:performance.now()-voiceStarted,...result.timings};
    const transcript=(result.transcript||'').trim();
    if(!transcript)throw Error('没听清，再说一次。');lifeAudio.blob=null;
    life.text=originalDraft.trim()?originalDraft.replace(/\s+$/,'')+( /[。！？.!?]$/.test(originalDraft.trim())?'':'。')+'\n'+transcript:transcript;life.phase='idle';lifeRefresh();await lifeTurn(life.text);
  }catch(e){life.error='刚才没听清，可以再说一次，或重试转写。';life.phase='error';lifeRefresh()}
}
function lifeFocusComposer(){nav('home');setTimeout(()=>{const input=document.getElementById('life-input');if(input){input.focus();input.scrollIntoView({block:'center'})}},60)}
function lifeAskAbout(title,id=''){life.focus=id?{id,title}:{title};nav('home');setTimeout(()=>lifeTurn('这个接下来怎么安排？'),0)}
