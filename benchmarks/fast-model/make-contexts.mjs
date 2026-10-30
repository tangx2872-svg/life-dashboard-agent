// Builds the fixed FAST contexts with the production buildLifeContext(tier='FAST').
// usage: node make-contexts.mjs [outDir]
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildLifeContext} from '../../server/life-proposals.mjs';
import {emptyData} from '../../server/schema.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] || path.join(here, 'out'));
mkdirSync(outDir, {recursive: true});

const now = new Date();
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = iso(now);
const tomorrow = iso(addDays(now, 1));
const weekday = now.getDay();
const nextSat = iso(addDays(now, (6 - weekday + 7) % 7 || 7));
const sunday = iso(addDays(now, (7 - weekday) % 7 || 7));
const monday = iso(addDays(now, ((1 - weekday) + 7) % 7 || 7));
const wednesday = iso(addDays(now, ((3 - weekday) + 7) % 7 || 7));
const nextFriday = iso(addDays(now, ((5 - weekday) + 7) % 7 || 7));
const stamp = now.toISOString();

const data = emptyData();
data.projects = [
  {id: 'p1', title: '工业视觉论文', description: '毕业论文第三章与实验', status: '进行中', priority: 'high', category: '科研', phases: [], notes: [], createdAt: stamp, updatedAt: stamp},
  {id: 'p2', title: '六级备考', description: '词汇、听力与真题', status: '进行中', priority: 'normal', category: '学习', phases: [], notes: [], createdAt: stamp, updatedAt: stamp},
  {id: 'p3', title: '课程实验', description: '机器学习课程实验与报告', status: '进行中', priority: 'normal', category: '学习', phases: [], notes: [], createdAt: stamp, updatedAt: stamp},
];
data.tasks = [
  {id: 't1', title: '修改论文摘要', projectId: 'p1', phaseId: '', done: false, status: 'todo', priority: 'high', date: today, time: '14:00', estimatedMinutes: 45, subtasks: [], createdAt: stamp},
  {id: 't2', title: '完善实验报告', projectId: 'p3', phaseId: '', done: false, status: 'todo', priority: 'normal', date: iso(addDays(now, -1)), time: '', estimatedMinutes: 90, subtasks: [], createdAt: stamp},
  {id: 't3', title: '健身', projectId: '', phaseId: '', done: false, status: 'todo', priority: 'normal', date: tomorrow, time: '19:00', estimatedMinutes: 60, subtasks: [], createdAt: stamp},
  {id: 't4', title: '背六级词汇', projectId: 'p2', phaseId: '', done: false, status: 'todo', priority: 'normal', date: tomorrow, time: '', estimatedMinutes: 40, subtasks: [], createdAt: stamp},
  {id: 't5', title: '机器学习作业', projectId: 'p3', phaseId: '', done: false, status: 'todo', priority: 'normal', date: nextSat, time: '', estimatedMinutes: 120, subtasks: [], createdAt: stamp},
];
const state = {data};
const cases = [
  {id: 1, message: '明天下午三点修改论文摘要，45分钟', task: '', expect: {ops: 1, dates: [tomorrow], time: '15:00', minutes: 45, currentTask: false}},
  {id: 2, message: '今晚七点健身一个小时', task: '', expect: {ops: 1, dates: [today], time: '19:00', minutes: 60, currentTask: false}},
  {id: 3, message: '周六上午完成机器学习作业', task: '', expect: {ops: 1, dates: [nextSat], time: null, minutes: null, currentTask: false}},
  {id: 4, message: '把这个任务延期到周五上午十点，60分钟', task: 't2', expect: {ops: 1, dates: [nextFriday, today], time: '10:00', minutes: 60, currentTask: true}},
  {id: 5, message: '明天下午三点修改论文摘要45分钟，晚上七点健身一个小时', task: '', expect: {ops: 2, pairs: [{dates: [tomorrow], time: '15:00', minutes: 45}, {dates: [tomorrow], time: '19:00', minutes: 60}], currentTask: false}},
  {id: 6, message: '下周一提醒我提交课程作业', task: '', expect: {ops: 1, dates: [monday], time: null, minutes: null, currentTask: false}},
  {id: 7, message: '把论文修改安排到周日下午', task: '', expect: {ops: 1, dates: [sunday], time: null, minutes: null, currentTask: false}},
  {id: 8, message: '明天晚上学习六级一小时', task: '', expect: {ops: 1, dates: [tomorrow], time: null, minutes: 60, currentTask: false}},
  {id: 9, message: '周三完成实验报告初稿', task: '', expect: {ops: 1, dates: [wednesday], time: null, minutes: null, currentTask: false}},
  {id: 10, message: '把今天没做完的这个任务延期到明天', task: 't2', expect: {ops: 1, dates: [tomorrow], time: null, minutes: null, currentTask: true}},
];
const rows = cases.map(item => ({
  ...item,
  context: buildLifeContext(state, item.message, {tier: 'FAST', scope: 'home', currentProjectId: '', currentTaskId: item.task, memories: [], history: []}),
}));
const file = path.join(outDir, 'contexts.json');
writeFileSync(file, JSON.stringify({generatedAt: stamp, today, rows, state}, null, 2));
console.log(JSON.stringify({file, rows: rows.length, today, nextSat, monday, wednesday, nextFriday}));
