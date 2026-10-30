import {createLifeProposalService} from './life-proposals.mjs';
import {ensureDemoSeeded,stripDemoData} from './guest-demo.mjs';
import {createMemoryService,retrieveRelevantMemories,consolidate,sensitive} from './agent-memory.mjs';
import {createAgentEngine} from './agent-engine.mjs';
import {randomBytes} from 'node:crypto';
import {emptyData,validate,envelope} from './schema.mjs';
import {HttpError} from './store.mjs';
import {createAssistant} from './assistant.mjs';
import {createPlanner} from './planner.mjs';
export function accountGateway(accounts,options={}){
 const sessions=new Map(),limits=new Map(),guests=new Map(),memory=createMemoryService(accounts.pool);const production=process.env.NODE_ENV==='production';
 const origin=process.env.PUBLIC_ORIGIN;
 if(production&&(!origin||!origin.startsWith('https://')))throw Error('Production requires HTTPS PUBLIC_ORIGIN');
 async function json(req){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>20_000_000)throw new HttpError(413,'内容过大');chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks))}catch{throw new HttpError(422,'请求格式不正确')}}
 function cookie(res,token){res.setHeader('Set-Cookie',`life_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token?604800:0}${production?'; Secure':''}`)}
 return async(req,res,url,send)=>{
  if(!url.pathname.startsWith('/api/'))return {};
  const expected=origin||`http://${req.headers.host}`;
  if(req.headers.origin&&req.headers.origin!==expected)throw new HttpError(403,'不允许跨站请求');
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('life_session='))?.slice(13);
  let auth=await accounts.authenticate(token);const guest=guests.get(token);if(guest&&guest.expires>Date.now())auth=guest.auth;
  if(url.pathname.startsWith('/api/auth/')){
   const action=url.pathname.split('/').at(-1);
   if(action==='me'&&req.method==='GET'){send(200,{user:auth?.user||null,csrf:auth?.csrf||null});return {handled:true}}
   if(req.method!=='POST')throw new HttpError(405,'不支持的请求');
   if(action==='guest'){
 if(req.headers.origin!==expected)throw new HttpError(403,'请从本站进入');
 if(guests.size>=128)for(const [key,value]of guests)if(value.expires<Date.now())guests.delete(key);
 if(guests.size>=128)throw new HttpError(429,'访客较多，请稍后重试');
 const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');const auth={user:{id:'guest-'+token.slice(0,12),displayName:'访客',guest:true},csrf,tokenHash:token};let state={data:ensureDemoSeeded(emptyData(),new Date(),auth.user.id),revision:0,savedAt:new Date().toISOString()};const store={read:async()=>structuredClone(state),commit:async packet=>{validate(packet.data);if(packet.revision!==state.revision)throw new HttpError(409,'访客数据已更新');state={data:ensureDemoSeeded(packet.data,new Date(),auth.user.id),revision:state.revision+1,savedAt:new Date().toISOString()};return {revision:state.revision,savedAt:state.savedAt}},snapshots:async()=>[],snapshot:async()=>{throw new HttpError(404,'访客暂无快照')}};guests.set(token,{auth,store,expires:Date.now()+86400000});cookie(res,token);send(200,{user:auth.user,csrf});return {handled:true};
 }
 if(['register','login'].includes(action)){
    if(req.headers.origin!==expected)throw new HttpError(403,'请从本站登录');
    const ip=req.socket.remoteAddress,key=ip+':'+action,now=Date.now();if(limits.size>10000)for(const [k,v]of limits)if(v.until<now)limits.delete(k);const rate=limits.get(key)||{count:0,until:now+60000};if(rate.until<now){rate.count=0;rate.until=now+60000}if(++rate.count>10)throw new HttpError(429,'操作频繁，请稍后重试');limits.set(key,rate);
    const result=await accounts[action](await json(req));if(auth)await accounts.logout(auth);cookie(res,result.token);send(200,{user:result.user,csrf:result.csrf});return {handled:true};
   }
   if(!auth)throw new HttpError(401,'请先登录');
   if(req.headers['x-dashboard-token']!==auth.csrf)throw new HttpError(403,'请刷新后重试');
   if(action==='logout'){if(auth.user.guest)guests.delete(token);else await accounts.logout(auth);sessions.delete(auth.tokenHash);cookie(res,'');send(200,{ok:true});return {handled:true}}
   if(action==='refresh'){cookie(res,token);if(!auth.user.guest)await accounts.pool.execute('UPDATE user_sessions SET expires_at=? WHERE token_hash=?',[Date.now()+7*86400000,auth.tokenHash]);send(200,{user:auth.user,csrf:auth.csrf});return {handled:true}}
   throw new HttpError(404,'接口不存在');
  }
  if(!auth)throw new HttpError(401,'请登录后访问你的空间');
  const store=auth.user.guest?guest.store:accounts.scoped(auth.user.id);
  if(url.pathname==='/api/dev/reset-demo'){
 if(process.env.NODE_ENV==='production')throw new HttpError(404,'接口不存在');if(!auth.user.guest)throw new HttpError(403,'只能重置体验空间');if(req.method!=='POST')throw new HttpError(405,'不支持的请求');if(req.headers['x-dashboard-token']!==auth.csrf)throw new HttpError(403,'请刷新后重试');const current=await store.read();send(200,await store.commit({data:ensureDemoSeeded(emptyData(),new Date(),auth.user.id),revision:current.revision}));return {handled:true}}
 if(url.pathname.startsWith('/api/memories')){
 const rows=auth.user.guest?(await store.read()).data.userMemories||[]:await memory.read(auth.user.id);const id=decodeURIComponent(url.pathname.split('/')[3]||'');
 if(req.method==='GET'){send(200,{memories:rows.filter(m=>m.status!=='deleted')});return {handled:true}}
 if(req.headers['x-dashboard-token']!==auth.csrf)throw new HttpError(403,'请刷新后重试');const packet=req.method==='DELETE'?{}:await json(req);
 if(id==='search'&&req.method==='POST'){send(200,{memories:retrieveRelevantMemories(rows,String(packet.message||''))});return {handled:true}}
 if(auth.user.guest)throw new HttpError(403,'登录后可管理自己的长期记忆');
 if(req.method==='POST'&&!id){if(typeof packet.content!=='string'||packet.content.length>500||sensitive(packet.content))throw new HttpError(422,'记忆内容无效');await memory.mutate(auth.user.id,old=>consolidate(old,[{content:packet.content,category:'preference',confidence:1,importance:.8,action:'create'}],auth.user.id));send(200,{ok:true});return {handled:true}}
 if(!rows.some(m=>m.id===id&&m.status!=='deleted'))throw new HttpError(404,'记忆不存在');
 if(req.method==='PATCH'||req.method==='DELETE'){if(packet.content!==undefined&&(typeof packet.content!=='string'||!packet.content.trim()||packet.content.length>500||sensitive(packet.content)))throw new HttpError(422,'记忆内容无效');if(packet.status!==undefined&&!['active','paused'].includes(packet.status))throw new HttpError(422,'状态无效');await memory.mutate(auth.user.id,old=>old.map(m=>m.id===id?{...m,...(packet.content?{content:packet.content,summary:packet.content}:{}),status:req.method==='DELETE'?'deleted':packet.status||m.status,updatedAt:new Date().toISOString()}:m));send(200,{ok:true});return {handled:true}}
 throw new HttpError(405,'不支持的请求');
 }
 if(url.pathname==='/api/account/import'&&req.method==='POST'){
 if(req.headers['x-dashboard-token']!==auth.csrf)throw new HttpError(403,'请刷新后重试');const packet=await json(req);try{validate(packet.data);packet.data=stripDemoData(packet.data)}catch{throw new HttpError(422,'备份数据格式不正确')}const current=await store.read();if(current.revision!==packet.revision)throw new HttpError(409,'其他设备已有更新，请刷新');const merged=structuredClone(current.data);for(const [key,value]of Object.entries(packet.data)){if(['__proto__','constructor','prototype'].includes(key))continue;if(Array.isArray(value)){const existing=Array.isArray(merged[key])?merged[key]:[];const ids=new Set(existing.map(v=>typeof v==='object'?v.id:JSON.stringify(v)));merged[key]=[...existing,...value.filter(v=>!ids.has(typeof v==='object'?v.id:JSON.stringify(v)))]}else if(merged[key]===undefined)merged[key]=value}const saved=await store.commit({data:merged,revision:current.revision,requestId:packet.requestId,reason:'合并备份'});if(!auth.user.guest&&Array.isArray(packet.data.userMemories)&&packet.data.userMemories.length)await memory.mutate(auth.user.id,rows=>consolidate(rows,packet.data.userMemories.filter(m=>typeof m.content==='string'&&m.content.length<=500&&!sensitive(m.content)).map(m=>({content:m.content,category:m.category||'other',importance:.8,confidence:1,action:'merge'})),auth.user.id));send(200,saved);return {handled:true};
 }
 if(['/api/account/export','/api/backup'].includes(url.pathname)&&req.method==='GET'){const state=await store.read();send(200,{...envelope({...state.data,...(!auth.user.guest?{userMemories:await memory.read(auth.user.id).catch(()=>state.data.userMemories||[])}:{})}),profile:auth.user});return {handled:true}}
 if(['/api/account/preferences','/api/account/memories'].includes(url.pathname)){
 const field=url.pathname.endsWith('memories')?'userMemories':'userPreferences';const state=await store.read();
 if(field==='userMemories'&&!auth.user.guest){if(req.method==='GET'){send(200,{value:await memory.read(auth.user.id),revision:state.revision});return {handled:true}}if(req.method!=='PUT')throw new HttpError(405,'不支持的请求');if(req.headers['x-dashboard-token']!==auth.csrf)throw new HttpError(403,'请刷新后重试');const packet=await json(req);if(!Array.isArray(packet.value)||packet.value.length>300||packet.value.some(m=>typeof m.content!=='string'||m.content.length>500||sensitive(m.content)))throw new HttpError(422,'记忆格式不正确');await memory.mutate(auth.user.id,()=>consolidate([],packet.value.map(m=>({content:m.content,category:m.category||'other',importance:.8,confidence:1,action:'create'})),auth.user.id));send(200,{revision:state.revision});return {handled:true}}

 if(req.method==='GET'){send(200,{value:state.data[field]||(field==='userMemories'?[]:{}),revision:state.revision});return {handled:true}}
 if(req.method!=='PUT')throw new HttpError(405,'不支持的请求');if(req.headers['x-dashboard-token']!==auth.csrf)throw new HttpError(403,'请刷新后重试');const packet=await json(req);if((JSON.stringify(packet.value)||'').length>50000)throw new HttpError(422,'内容过长');if(field==='userMemories'&&!Array.isArray(packet.value)||field==='userPreferences'&&(!packet.value||typeof packet.value!=='object'||Array.isArray(packet.value)))throw new HttpError(422,'内容格式不正确');state.data[field]=packet.value;send(200,await store.commit({data:state.data,revision:packet.revision,requestId:packet.requestId,reason:'账户资料更新'}));return {handled:true};
 }
 let engines=sessions.get(auth.tokenHash);if(!engines){if(sessions.size>256)sessions.delete(sessions.keys().next().value);const contextualAI={...options.aiClient,parse_text_capture:async(text,tz,locale,now)=>{let rows=[];try{rows=auth.user.guest?(await store.read()).data.userMemories||[]:await memory.read(auth.user.id)}catch{}const relevant=retrieveRelevantMemories(rows,text);return options.aiClient.parse_text_capture(text,tz,locale,now,relevant.length?{relevantLongTermMemory:relevant.map(m=>({content:m.content,category:m.category})),instruction:'仅作为背景，当前用户要求优先；不要把记忆本身当作新增任务。'}:null)}};
 engines={ai:contextualAI,assistant:createAssistant(store,options.assistantOptions),planner:createPlanner(store,{ai:contextualAI,now:options.now})};engines.agent=createAgentEngine({store,memory:auth.user.guest?{read:async()=>(await store.read()).data.userMemories||[],extract:async()=>({stored:0})}:memory,userId:auth.user.id,ai:options.aiClient,planner:engines.planner});if(options.aiClient?.propose_life)engines.lifeProposals=createLifeProposalService({store,ai:options.aiClient,memory:auth.user.guest?{read:async()=>(await store.read()).data.userMemories||[]}:memory,userId:auth.user.id,snapshotStore:auth.user.guest?null:{read:async kind=>{const [rows]=await accounts.pool.execute('SELECT body FROM ai_snapshot_cache WHERE user_id=? AND kind=?',[auth.user.id,kind]);return rows.length?JSON.parse(rows[0].body):null},write:async(kind,value)=>{await accounts.pool.execute('INSERT INTO ai_snapshot_cache VALUES (?,?,?) ON DUPLICATE KEY UPDATE body=VALUES(body)',[auth.user.id,kind,JSON.stringify(value)])}}});sessions.set(auth.tokenHash,engines)}
  if(url.pathname.startsWith('/api/life/')){if(!engines.lifeProposals)throw new HttpError(503,'规划服务暂时不可用');if(req.headers['x-dashboard-token']!==auth.csrf)throw new HttpError(403,'请刷新后重试');if(req.method!=='POST')throw new HttpError(405,'不支持的请求');const packet=await json(req);const action=url.pathname.split('/').at(-1);if(!['confirm','undo','snapshot'].includes(action))throw new HttpError(404,'接口不存在');send(200,await (action==='snapshot'?engines.lifeProposals.snapshot(packet.kind):engines.lifeProposals[action](packet)));return {handled:true}}
 if(url.pathname.startsWith('/api/agent/')){if(req.method!=='GET'&&req.headers['x-dashboard-token']!==auth.csrf)throw new HttpError(403,'请刷新后重试');const packet=req.method==='GET'?{}:await json(req);send(200,await engines.agent.handle(url.pathname,req.method,packet));return {handled:true}}
 return {store,csrf:auth.csrf,...engines,postprocess:auth.user.guest?null:engines.agent.postprocess,planner:{...engines.planner,turn:async packet=>{const reply=await (engines.lifeProposals?engines.lifeProposals.turn(packet):engines.agent.turn(packet));if(!auth.user.guest&&!reply.memoryProcessed)res.once('finish',()=>{engines.agent.postprocess(packet.message).then(result=>{console.info(JSON.stringify({event:'memory_postprocess',ok:!result?.error,ms:Math.round(result?.ms||0)}))}).catch(()=>{})});return reply}},user:auth.user};
 };
}
