import http from 'node:http';
import {createAIBackendClient,aiBackendConfig,validateCaptureInput,AIBackendError} from './ai-backend-client.mjs';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createStore, HttpError } from './store.mjs';
import { envelope } from './schema.mjs';
import { createAssistant } from './assistant.mjs';
const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
export function createApp(store,options={}) {
  const ai=options.aiClient||createAIBackendClient(aiBackendConfig());
  const csrf=randomBytes(32).toString('hex');
  const assistant=createAssistant(store,options.assistantOptions);
  const server=http.createServer(async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try{
      // Local single-user app. Reject DNS rebinding and foreign website writes; do not expose on 0.0.0.0.
      const port=server.address().port,hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
      if(!hosts.has(req.headers.host))throw new HttpError(403,'只允许从本机地址访问');
      if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw new HttpError(403,'不允许跨站请求');
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&url.pathname==='/api/ai/health')return send(200,await ai.check_health());
      if(req.method==='POST'&&url.pathname==='/api/ai/capture/text'){
        if(req.headers['x-dashboard-token']!==csrf)throw new HttpError(403,'请刷新页面后再操作');
        if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'需要 JSON');
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>32000)throw new HttpError(413,'文本过长');chunks.push(chunk)}
        let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new HttpError(400,'请求格式错误')}
        const input=validateCaptureInput(body);return send(200,await ai.parse_text_capture(input.text,input.timezone,input.locale,input.current_datetime));
      }
      if(req.method==='GET'&&url.pathname==='/api/assistant/status')return send(200,assistant.status());
      if(req.method==='POST'&&['/api/assistant/turn','/api/assistant/commit','/api/assistant/cancel'].includes(url.pathname)){
        if(req.headers['x-dashboard-token']!==csrf)throw new HttpError(403,'请刷新页面后再操作');
        if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'需要 JSON');
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>200000)throw new HttpError(413,'要求过长，请分批处理');chunks.push(chunk);}
        let packet;try{packet=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new HttpError(400,'请求格式错误');}
        if(!packet||typeof packet!=='object'||Array.isArray(packet))throw new HttpError(400,'请求格式错误');
        const action=url.pathname.split('/').at(-1);return send(200,await assistant[action](packet));
      }
      if(req.method==='GET'&&url.pathname==='/api/state')return send(200,{...await store.read(),csrf});
      if(req.method==='PUT'&&url.pathname==='/api/state'){
        if(req.headers['x-dashboard-token']!==csrf)throw new HttpError(403,'请刷新页面后再保存');
        if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'需要 JSON');
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>20_000_000)throw new HttpError(413,'数据超过 20 MB');chunks.push(chunk);}
        let packet;try{packet=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new HttpError(400,'JSON 格式错误');}
        if(!packet||typeof packet!=='object'||Array.isArray(packet))throw new HttpError(400,'请求格式错误');
        return send(200,await store.commit(packet));
      }
      if(req.method==='GET'&&url.pathname==='/api/backup'){res.setHeader('Content-Disposition','attachment; filename="Life-Dashboard-full.json"');return send(200,envelope((await store.read()).data));}
      if(req.method==='GET'&&url.pathname==='/api/snapshots')return send(200,await store.snapshots());
      if(req.method==='GET'&&/^\/api\/snapshots\/\d+$/.test(url.pathname))return send(200,await store.snapshot(Number(url.pathname.split('/').at(-1))));
      // Read-only selected context is ready for a future Agent. No API keys or fake AI replies.
      if(req.method==='GET'&&url.pathname==='/api/experiments')return send(200,((await store.read()).data.experiments||[]).map(({id,title})=>({id,title})));
      if(req.method==='GET'&&url.pathname.startsWith('/api/experiments/')){const {data,revision}=await store.read(),experiment=(data.experiments||[]).find(e=>e.id===decodeURIComponent(url.pathname.slice(17)));if(!experiment)throw new HttpError(404,'实验不存在');return send(200,{experiment,revision});}
      if(url.pathname.startsWith('/api/'))throw new HttpError(404,'接口不存在');
      if(req.method!=='GET')throw new HttpError(405,'不支持此请求');
      const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
      if(!/^[\w.-]+$/.test(relative)||relative.startsWith('.'))throw new HttpError(404,'文件不存在');
      let content;try{content=await readFile(path.join(publicDir,relative))}catch{throw new HttpError(404,'文件不存在')}
      res.writeHead(200,{'Content-Type':mime[path.extname(relative)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
    }catch(e){if(e instanceof AIBackendError)return send(e.status,{status:'error',error:{code:e.code,message:e.message}});const status=e.status||503;send(status,{error:e.status?e.message:'数据库暂时无法访问。请保留页面，检查后端与 MySQL 后刷新重试。'});}
  });return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const store=await createStore(),server=createApp(store);server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Life Dashboard: http://127.0.0.1:${server.address().port} (MySQL)`));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await store.close();process.exit(0)}));}
  catch(e){console.error('启动失败：请检查 .env、MySQL 服务和数据库权限。',e.code||e.message);process.exitCode=1;}
}
