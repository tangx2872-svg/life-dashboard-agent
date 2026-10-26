// Explicit, additive sample data. Never called automatically during app startup.
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { compileItems } from '../server/assistant-records.mjs';
import { validate } from '../server/schema.mjs';
import { createStore } from '../server/store.mjs';
const receipt='fictional-demo-v1';
const prefix='【示例】';
export function buildDemo(base,now=new Date()){
 if(base.captureBatches?.some(b=>b.id===receipt))return {candidate:base,added:false};
 const day=offset=>{const d=new Date(now);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
 const projects=[
  {title:'工业视觉论文探索',category:'科研',icon:'🔬',description:'虚构演示事项：从文献阅读到一个小实验，验证研究问题。所有进度和记录仅用于界面测试。',stages:[{title:'方向调研',tasks:[{title:'阅读两篇入门论文',subtasks:['整理研究问题','记录方法与限制']},{title:'建立文献对照表'}]},{title:'小实验验证',tasks:[{title:'复现一个基线',subtasks:['准备示例数据','运行基线','记录配置']},{title:'分析失败案例'},{title:'整理下次讨论提纲'}]}]},
  {title:'Agent 作品演示准备',category:'科研',icon:'🤖',description:'虚构演示事项：展示口述需求、变更预览和确认保存的完整过程。',stages:[{title:'场景设计',tasks:[{title:'确定三段演示场景'},{title:'编写演示讲稿',subtasks:['背景与问题','核心流程','总结']}]},{title:'录制与整理',tasks:[{title:'录制三分钟演示'},{title:'检查项目说明文档'}]}]},
  {title:'每周运动计划',category:'健康',icon:'🏃',description:'虚构演示事项：安排适量活动、记录体验，不代表个性化健康建议。',stages:[{title:'建立习惯',tasks:[{title:'安排本周活动时间'},{title:'记录一次散步体验'},{title:'周末回顾执行情况'}]}]},
  {title:'日常安排',category:'生活',icon:'🗓️',description:'虚构演示事项：展示近期节点和待办，不是真实日程。',stages:[{title:'本周安排',tasks:[{title:'整理资料文件夹'},{title:'准备读书分享'},{title:'列出周末采购清单'}]}]}
 ];
 const items=projects.map(p=>({kind:'project',...p,title:prefix+p.title}));
 items.push({kind:'roadmap',title:prefix+'英语表达练习',category:'学习',goal:'虚构路线：听读输入 → 复述 → 小演讲',stages:[{title:'听读热身',tasks:[{title:'精听一段短材料',goal:'复述主要信息',criteria:['写出三个要点'],estimate:'30 分钟'},{title:'整理主题词汇',estimate:'20 分钟'}]},{title:'表达实践',tasks:[{title:'录制一分钟复述',estimate:'30 分钟'},{title:'完成一次主题分享',milestone:true,goal:'形成一份可回顾的表达作品'}]}]});
 items.push({kind:'roadmap',title:prefix+'图学习入门',category:'学习',goal:'虚构路线：图概念 → NetworkX → 链接预测',stages:[{title:'基础与工具',tasks:[{title:'理解节点与边',estimate:'30 分钟'},{title:'绘制一个简单网络',estimate:'1 小时',criteria:['创建图','添加节点与边','保存可视化']} ]},{title:'小项目',tasks:[{title:'尝试一种链接预测方法',goal:'理解训练与评估的区别'},{title:'整理网络分析 Demo',milestone:true}]}]});
 for(const [i,p] of projects.entries()){
  items.push({kind:'note',project:prefix+p.title,text:'【虚构演示记录】已经明确这一阶段的目标，下一步先完成最小行动，再回顾是否需要调整。'});
  items.push({kind:'event',project:prefix+p.title,title:prefix+['论文讨论','演示彩排','每周回顾','读书分享'][i],date:day(i+2)});
 }
 items.push({kind:'experiment',title:prefix+'光照对比实验',goal:'虚构演示：展示控制变量和结果记录的界面。',result:'【虚构演示】尚未开展真实实验，不作为研究结论。',supplement:'仅用于测试编辑和预览。',steps:[{title:'准备拍摄条件',content:'固定相机位置，记录光源设置。',result:'【虚构记录】示例配置已整理。'},{title:'对比两组照度',content:'在相同物体上采集两组示例图片。'},{title:'回顾差异',content:'整理观察，提出下一轮验证问题。'}]});
 items.push({kind:'experiment',title:prefix+'学习方法对比',goal:'虚构演示：展示小规模观察流程。',steps:[{title:'确定观察内容',content:'选两段难度相近的示例材料。'},{title:'记录复述情况',content:'分别阅读并复述，只记录实际观察。'}]});
 items.push({kind:'inbox',title:prefix+'以后整理一份论文阅读模板'},{kind:'inbox',title:prefix+'尝试给每周回顾留十分钟'},{kind:'idea',title:prefix+'把学习成果做成小作品集',description:'虚构想法：保留每个项目的目标、截图和复盘。',tags:['示例','成长']});
 const candidate=compileItems(base,items).candidate,newProjects=candidate.projects.slice(base.projects.length),newRoutes=candidate.roadmaps.slice((base.roadmaps||[]).length);
 const demoTasks=candidate.tasks.filter(t=>newProjects.some(p=>p.id===t.projectId));
 demoTasks.forEach((t,i)=>{if(i%4===0){t.done=true;t.completedAt=day(-3);if(t.subtasks)t.subtasks.forEach(s=>s.done=true);const h={id:randomUUID(),title:prefix+'完成 '+t.title,date:day(-3),projectId:t.projectId,taskId:t.id,detail:'虚构演示完成记录'};candidate.history.push(h);t.historyId=h.id;}else if(t.subtasks?.length)t.subtasks[0].done=true});
 newRoutes.forEach(r=>{const t=r.phases[0].tasks[0];t.done=true;t.completedAt=day(-1);r.lastLearned=now.toISOString();t.notes.push({id:randomUUID(),date:day(-1),text:'【虚构演示笔记】记录概念、练习过程与待解决问题。'});const h={id:randomUUID(),title:prefix+'完成 '+t.title,date:day(-1),roadmapId:r.id,learningTaskId:t.id,detail:'虚构演示学习记录'};candidate.history.push(h);t.historyId=h.id});
 // Only choose initial focus for an otherwise empty account; preserve an existing user's ordering.
 if(!base.projects.length&&!(base.roadmaps||[]).length&&!base.homeFocus)candidate.homeFocus=['p-'+newProjects[0].id,'r-'+newRoutes[0].id];
 candidate.captureBatches=[...(candidate.captureBatches||[]),{id:receipt,date:day(0),count:items.length,content:'Explicit fictional samples; no real achievements or deadlines.'}];
 validate(candidate);return {candidate,added:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(!process.argv.includes('--apply'))throw Error('Use --apply to explicitly append labeled fictional samples.');
 const store=await createStore();try{const current=await store.read(),plan=buildDemo(current.data);if(plan.added){await store.commit({data:plan.candidate,revision:current.revision,requestId:randomUUID(),reason:'用户授权添加明确标注的虚构演示数据'});console.log('Added fictional samples: 4 projects, 2 roadmaps, 2 experiments, notes, events and sample progress. Previous state snapshotted.')}else console.log('Samples already added; no changes.')}finally{await store.close()}
}
