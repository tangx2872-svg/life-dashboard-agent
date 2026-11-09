// Standalone UI preview: Node built-ins + existing fictional seed data only.
// No .env, mysql2, account service, Python or model providers are loaded here.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {ensureDemoSeeded} from '../server/guest-demo.mjs';
import {emptyData,validate,envelope} from '../server/schema.mjs';

const publicDir=new URL('../public/',import.meta.url);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const fail=(status,message)=>Object.assign(Error(message),{status});

export function createUIPreviewServer({now=()=>new Date(),replyDelay=500}={}){
 const csrf=randomUUID(),proposals=new Map(),batches=new Map();
 let data,revision,savedAt;
 function reset(){data=ensureDemoSeeded(emptyData(),now(),'ui-preview');revision=0;savedAt=now().toISOString();proposals.clear();batches.clear()}
 reset();
 const packet=()=>({preview:true,data,revision,savedAt,csrf,supportsLifeProposals:true});
 const save=next=>{validate(next);data=structuredClone(next);revision++;savedAt=now().toISOString();return packet()};
 return http.createServer(async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))};
  try{
   if(!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host||''))throw fail(403,'请使用本机预览地址');
   const url=new URL(req.url,'http://'+req.headers.host),route=url.pathname;
   if(route.startsWith('/api/')){
    if(!['GET','POST','PUT'].includes(req.method))throw fail(405,'不支持此请求');
    if(req.method!=='GET'){
     if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)throw fail(403,'请从本机预览页面操作');
     if(req.headers['x-dashboard-token']!==csrf)throw fail(403,'预览已重启，请刷新页面');
    }
    async function json(){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2_000_000)throw fail(413,'预览请求过大');chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw fail(422,'请求格式错误')}}
    if(route==='/api/auth/me'&&req.method==='GET')return send(200,{preview:true,user:{id:'ui-preview',displayName:'UI 预览',guest:true},csrf});
    if(route==='/api/state'&&req.method==='GET')return send(200,packet());
    if(route==='/api/state'&&req.method==='PUT'){
     const body=await json();if(body.revision!==revision)throw fail(409,'示例数据已有更新，请刷新页面');
     return send(200,save(body.data));
    }
    if(route==='/api/assistant/status'&&req.method==='GET')return send(200,{ready:false,preview:true});
    if(route==='/api/memories'&&req.method==='GET')return send(200,{memories:data.userMemories||[]});
    if(route==='/api/snapshots'&&req.method==='GET')return send(200,[]);
    if(['/api/backup','/api/account/export'].includes(route)&&req.method==='GET')return send(200,envelope(data));
    if(route==='/api/preview/reset'&&req.method==='POST'){reset();return send(200,packet())}
    if(route==='/api/planner/turn'&&req.method==='POST'){
     const body=await json();if(typeof body.message!=='string'||!body.message.trim()||body.message.length>4000)throw fail(422,'请先输入一句话');
     const previous=proposals.get(body.proposalId),id=previous?.proposalId||randomUUID();
     const date=now().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
     const projectId=data.projects.some(p=>p.id===body.currentProjectId)?body.currentProjectId:null;
     const reply={preview:true,intent:'plan',needsConfirmation:true,proposalId:id,proposalVersion:(previous?.proposalVersion||0)+1,
      summary:'界面预览方案',message:'以下是固定示例，用于查看方案卡与确认流程。',
      warnings:['UI 预览：固定示例交互，未调用 AI。'],questions:[],adjustments:[],
      operations:['整理今天的重点','完成一个小步骤'].map((title,i)=>({action:'create_task',title:'【预览示例】'+title,date,time:i?'16:00':'10:00',minutes:25,projectId}))};
     proposals.set(id,reply);if(proposals.size>100)proposals.delete(proposals.keys().next().value);
     await new Promise(resolve=>setTimeout(resolve,replyDelay));
     return send(200,reply);
    }
    if(route==='/api/life/confirm'&&req.method==='POST'){
     const body=await json(),proposal=proposals.get(body.proposalId);
     if(!proposal||body.proposalVersion!==proposal.proposalVersion)throw fail(409,'示例方案已失效，请重新整理');
     const before=structuredClone(data),next=structuredClone(data),stamp=now().toISOString();
     for(const op of proposal.operations)next.tasks.push({id:randomUUID(),title:op.title,projectId:op.projectId||'',phaseId:'',date:op.date,dueDate:op.date,scheduledDate:op.date,time:op.time,estimatedMinutes:op.minutes,done:false,status:'todo',priority:'normal',subtasks:[],source:'ui-preview',createdAt:stamp,updatedAt:stamp});
     const result=save(next),batch=randomUUID();batches.set(batch,{data:before,revision});
     if(batches.size>30)batches.delete(batches.keys().next().value);
     proposals.delete(proposal.proposalId);return send(200,{...result,changeBatchId:batch});
    }
    if(route==='/api/life/undo'&&req.method==='POST'){
     const body=await json(),batch=batches.get(body.changeBatchId);
     if(!batch||batch.revision!==revision)throw fail(409,'示例已有后续修改，请重置示例再体验撤销');
     const result=save(batch.data);batches.delete(body.changeBatchId);return send(200,result);
    }
    if(route==='/api/life/snapshot'&&req.method==='POST'){
     await json();return send(200,{content:`**UI 预览示例**\n\n当前有 ${data.projects.length} 个示例项目、${data.tasks.length} 个示例任务。这里用于检查抽屉与文字排版，未调用 AI。`,generatedAt:now().toISOString(),stale:false});
    }
    throw fail(503,'此入口需要完整后端；本地 UI 预览仅提供示例数据和固定方案交互。');
   }
   if(req.method!=='GET'&&req.method!=='HEAD')throw fail(405,'不支持此请求');
   const file=route==='/'?'index.html':route.slice(1);
   if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(html|js|css|svg)$/.test(file))throw fail(404,'文件不存在');
   let content;try{content=await readFile(new URL(file,publicDir))}catch{throw fail(404,'文件不存在')}
   if(file==='index.html')content=content.toString('utf8').replace('<script src="bootstrap.js"></script>','<script src="ui-preview.js"></script><script src="bootstrap.js"></script>');
   res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);
  }catch(error){send(error.status||422,{error:error.status?error.message:'示例数据格式不正确，请重置示例后重试。'})}
 });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const port=Number(process.argv.find(arg=>arg.startsWith('--port='))?.slice(7)||4173);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('请使用 1024～65535 之间的端口');
 const server=createUIPreviewServer();
 server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`预览端口 ${port} 已被占用，可追加 --port=4174。`:error.message);process.exitCode=1});
 server.listen(port,'127.0.0.1',()=>console.log(`UI preview: http://127.0.0.1:${port}/#/today\n示例数据仅保存在内存；无需 MySQL、.env、依赖安装或 AI 服务。\nAgent 为固定示例交互。按 Ctrl+C 停止预览。`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
