import {randomUUID} from 'node:crypto';
import {HttpError} from './store.mjs';
export function reminderSuggestions(rows,scope,now=Date.now()){
 if(!Array.isArray(rows)||rows.length>3)throw new HttpError(422,'一次最多建议3条提醒');
 return rows.map(r=>{if(!r||typeof r.title!=='string'||!r.title.trim()||r.title.length>300||typeof r.note!=='string'||r.note.length>2000||typeof r.basis!=='string'||!r.basis.trim()||r.basis.length>2000||typeof r.at!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(r.at)||!Number.isFinite(Date.parse(r.at))||Date.parse(r.at)<=now)throw new HttpError(422,'提醒需要明确的未来时间和安排依据，请继续确认时间');return {id:randomUUID(),title:r.title.trim(),at:new Date(r.at).toISOString(),note:r.note,basis:r.basis,scope,done:false}})
}
export function applyReminderChoices(candidate,suggestions,choices){
 if(choices!==undefined&&(!Array.isArray(choices)||choices.length!==suggestions.length))throw new HttpError(422,'提醒选择已变化，请重新检查');
 const result=structuredClone(candidate),seen=new Set();
 const rows=suggestions.flatMap((r,i)=>{const c=choices?.[i]||{id:r.id,enabled:true,at:r.at};if(c.id!==r.id||typeof c.enabled!=='boolean'||Object.keys(c).some(k=>!['id','enabled','at'].includes(k)))throw new HttpError(422,'提醒选择无效');if(!c.enabled)return [];if(typeof c.at!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(c.at)||!Number.isFinite(Date.parse(c.at))||Date.parse(c.at)<=Date.now())throw new HttpError(422,'提醒时间已过期或无效，请修改');const at=new Date(c.at).toISOString(),key=r.scope+'|'+r.title+'|'+at;if(seen.has(key)||(result.reminders||[]).some(x=>!x.done&&x.scope===r.scope&&x.title===r.title&&x.at===at))throw new HttpError(422,'存在同名同时间提醒，请取消重复项');seen.add(key);return [{...r,at}]});
 if(rows.length)result.reminders=[...(result.reminders||[]),...rows];return result;
}
