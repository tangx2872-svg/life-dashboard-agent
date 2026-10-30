// Same-origin only. AI secrets and upstream addresses never enter the frontend.
// One shared ceiling for Life AI turns: Node AI_BACKEND_TIMEOUT_S and nginx both allow 180s.
const LIFE_REQUEST_TIMEOUT_MS=180000;
const productAPI={
  async request(path,options={}){
    const response=await fetch(path,{cache:'no-store',...options,headers:{'Content-Type':'application/json','X-Dashboard-Token':window.dashboardBoot?.csrf||'',...options.headers},signal:options.signal||AbortSignal.timeout(40000)});
    let value;try{value=await response.json()}catch{throw Error('服务返回了无法读取的内容，请稍后重试。')}
    if(!response.ok){const error=new Error(typeof value.error==='string'?value.error:value.error?.message||'服务暂时不可用');error.code=value.error?.code;throw error}return value;
  },
  transcribe(audio){return this.request('/api/ai/audio/transcribe',{method:'POST',headers:{'Content-Type':audio.type.split(';')[0]},body:audio})},
  capture(text){return this.request('/api/ai/capture/text',{method:'POST',body:JSON.stringify({text,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Shanghai',locale:'zh-CN',current_datetime:new Date().toISOString()})})}
};
