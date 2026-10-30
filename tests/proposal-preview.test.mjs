import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/agent-interaction.js', import.meta.url), 'utf8');
const operation = (action, extra = {}) => ({action, targetId: null, projectId: null, clientRef: null, title: null, date: null, minutes: null, priority: null, description: null, status: null, ...extra});
const escape = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

function harness(result, phase = 'review') {
  const noop = () => {};
  const context = {
    life: {phase, result, text: '', error: ''},
    data: {
      tasks: [{id: 't1', title: '旧任务标题', projectId: 'p1', scheduledDate: '2026-11-03', estimatedMinutes: 30}],
      projects: [{id: 'p1', title: '工业视觉论文'}]
    },
    esc: escape,
    lifeWeekday: date => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(date + 'T00:00:00Z').getUTCDay()],
    lifeDismiss: noop, lifeRefresh: noop, render: noop, toast: noop, lifeTurn: noop,
    lifeDraftInput: noop, lifeComposer: () => '', lifePhaseText: () => '', lifeResult: () => '',
    lifeApply: noop, submitLifeInput: noop, dashboardBoot: {supportsLifeProposals: true},
    productAPI: {request: async () => ({})}, lifeCoreContext: () => ({})
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test('Preview: operations drive the plan card, not plan.stages', () => {
  const html = harness({
    intent: 'plan', summary: '论文摘要安排好了', understanding: '你想在明天下午改论文摘要',
    message: '看看这样安排', adjustments: ['提前到上午', '减少到30分钟'], warnings: [], questions: [],
    plan: {stages: [{title: '旧协议阶段', date: '2026-11-09', minutes: 999}]},
    operations: [
      operation('create_task', {title: '修改论文摘要', projectId: 'p1', date: '2026-11-02', minutes: 45}),
      operation('reschedule_task', {targetId: 't1', date: '2026-11-04', minutes: 60})
    ]
  }).lifeResult();
  assert.match(html, /我准备这样安排/);
  assert.match(html, /11 月 2 日 · 周一/);
  assert.match(html, /修改论文摘要/);
  assert.match(html, /约 45 分钟/);
  assert.match(html, /约 60 分钟/);
  assert.match(html, /旧任务标题/);
  assert.match(html, /工业视觉论文/);
  assert.match(html, /新增任务/);
  assert.match(html, /调整时间/);
  assert.match(html, /提前到上午/);
  assert.doesNotMatch(html, /旧协议阶段/);
  assert.doesNotMatch(html, /create_task|reschedule_task|clientRef|projectId/);
  assert.doesNotMatch(html, /<button class="primary"[^>]*disabled/);
});

test('Preview: empty operations show no confirmable plan', () => {
  const html = harness({
    intent: 'plan', summary: '没有操作', understanding: '只是聊了聊', message: '嗯',
    adjustments: [], warnings: [], questions: [], plan: {stages: [{title: '旧协议阶段', date: '2026-11-09', minutes: 45}]}, operations: []
  }).lifeResult();
  assert.match(html, /没有需要改动的安排/);
  assert.doesNotMatch(html, /旧协议阶段/);
  assert.match(html, /<button class="primary"[^>]*disabled/);
});
