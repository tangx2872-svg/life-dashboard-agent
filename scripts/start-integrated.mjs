// Run the existing Node and Python services together, without moving model secrets into Node.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import net from 'node:net';

const root=fileURLToPath(new URL('../',import.meta.url));
const mode=process.argv.find(a=>a.startsWith('--ai='))?.slice(5)||'external';
if(!['external','local','mock'].includes(mode))throw Error('Use --ai=external, --ai=local or --ai=mock');
const children=new Set();let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();process.exitCode=code;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
function launch(command,args,options={}){
 const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true,...options});children.add(child);
 child.on('error',e=>{console.error('Service launch failed:',e.code||e.message);stop(1)});
 child.on('exit',code=>{children.delete(child);if(!stopping)stop(code||0)});return child;
}
async function available(port){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(Error(`Port ${port} is occupied; existing services have not been stopped.`)));server.listen(port,'127.0.0.1',()=>server.close(resolve));})}
try{
 const nodeEnv={...process.env};
 if(mode!=='external'){
  const python=process.env.AI_PYTHON||fileURLToPath(new URL(process.platform==='win32'?'../.local/ai-venv/Scripts/python.exe':'../.local/ai-venv/bin/python',import.meta.url));
  if(!existsSync(python))throw Error('Create .local/ai-venv and install ai-backend/requirements.txt first, or set AI_PYTHON to an absolute Python path.');
  if(mode==='local'&&!existsSync(new URL('../ai-backend/.env',import.meta.url))&&!process.env.LLM_PROVIDER)throw Error('Configure ai-backend/.env first. Use --ai=mock only for explicitly simulated tests.');
  const port=Number(process.env.AI_LOCAL_PORT||6016);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid AI_LOCAL_PORT');await available(port);
  const aiEnv={...process.env,PYTHONUTF8:'1'};
  if(mode==='mock')Object.assign(aiEnv,{ASR_PROVIDER:'mock',LLM_PROVIDER:'mock',AUTODL_LLM_API_KEY:'',OPENAI_API_KEY:'',UPLOAD_DIR:fileURLToPath(new URL('../.local/ai-uploads/',import.meta.url))});
  const child=launch(python,['-m','uvicorn','app:app','--host','127.0.0.1','--port',String(port)],{cwd:fileURLToPath(new URL('../ai-backend/',import.meta.url)),env:aiEnv});
  nodeEnv.AI_BACKEND_BASE_URL=`http://127.0.0.1:${port}`;
  let ready=false;for(let i=0;i<100&&!stopping;i++){try{const r=await fetch(nodeEnv.AI_BACKEND_BASE_URL+'/health',{signal:AbortSignal.timeout(500)});if(r.ok&&(await r.json()).status==='ok'){ready=true;break}}catch{}await delay(200)}
  if(!ready||child.exitCode!==null)throw Error('Local AI did not become ready. Check the Python service output.');
  console.log(mode==='mock'?'MOCK AI: simulated output, no GPT calls.':'Local AI ready; provider credentials are read by Python only.');
 }
 if(!stopping)launch(process.execPath,['--env-file-if-exists=.env','server/index.mjs'],{env:nodeEnv});
}catch(e){console.error(e.message);stop(1)}
