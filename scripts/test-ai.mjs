import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const python=process.env.AI_PYTHON||fileURLToPath(new URL(process.platform==='win32'?'../.local/ai-venv/Scripts/python.exe':'../.local/ai-venv/bin/python',import.meta.url));
if(!existsSync(python))throw Error('Create .local/ai-venv and install ai-backend/requirements.txt first.');
const result=spawnSync(python,['-m','pytest','-q'],{cwd:fileURLToPath(new URL('../ai-backend/',import.meta.url)),windowsHide:true,stdio:'inherit',env:{...process.env,PYTHONUTF8:'1',ASR_PROVIDER:'mock',LLM_PROVIDER:'mock',AUTODL_LLM_API_KEY:'',OPENAI_API_KEY:''}});
if(result.error)throw result.error;process.exitCode=result.status??1;
