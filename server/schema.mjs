// Reuse the original backup validation on the server, without evaluating input as code.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../public/data-schema.js', import.meta.url), 'utf8'), context);
export function validate(data) { context.assertDashboardData(data); return data; }
export const envelope = data => ({ format: 'life-dashboard.backup', version: 1, createdAt: new Date().toISOString(), data });
export const emptyData = () => ({version:1,categories:['科研','学习','职业','健康','生活','其他'],projects:[],tasks:[],events:[],inbox:[],ideas:[],history:[],roadmaps:[],experiments:[]});
