import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import vm from 'node:vm';

const apiSource = await readFile(new URL('../public/product-api.js', import.meta.url), 'utf8');
const agentSource = await readFile(new URL('../public/agent-interaction.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../public/life-core.js', import.meta.url), 'utf8');
const plannerSource = await readFile(new URL('../public/life-planner.js', import.meta.url), 'utf8');

function apiHarness({fetchImpl, signalImpl} = {}) {
  const timeouts = [];
  const requests = [];
  const context = {
    window: {dashboardBoot: {csrf: 'token'}},
    AbortSignal: signalImpl || {timeout(ms) { timeouts.push(ms); return {fake: true, ms}; }},
    fetch: fetchImpl || (async (path, options) => { requests.push({path, options}); return {ok: true, json: async () => ({ok: true})}; })
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(apiSource, context);
  const api=vm.runInContext('productAPI', context);
  return {context, api, timeouts, requests};
}

test('Timeout: Life AI turns share one 180s ceiling', () => {
  assert.match(apiSource, /LIFE_REQUEST_TIMEOUT_MS\s*=\s*180000/);
  assert.doesNotMatch(agentSource, /90000/);
  assert.doesNotMatch(coreSource, /90000/);
  for (const source of [agentSource, coreSource, plannerSource]) assert.match(source, /LIFE_REQUEST_TIMEOUT_MS/);
});

test('Timeout: productAPI keeps its 40s default and forwards explicit signals', async () => {
  const {api, timeouts, requests} = apiHarness();
  await api.request('/api/ai/health');
  assert.deepEqual(timeouts, [40000]);
  const signal = {custom: true};
  await api.request('/api/planner/turn', {method: 'POST', signal, body: '{}'});
  assert.deepEqual(timeouts, [40000]);
  assert.equal(requests[1].options.signal, signal);
});

test('Timeout: a slow but valid planner response still resolves', async () => {
  const server = createServer((req, res) => {
    setTimeout(() => {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({intent: 'plan', operations: [], questions: []}));
    }, 1200);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const {api} = apiHarness({fetchImpl: fetch, signalImpl: AbortSignal});
    const started = Date.now();
    const value = await api.request('http://127.0.0.1:' + server.address().port + '/api/planner/turn', {method: 'POST', body: '{}', signal: AbortSignal.timeout(180000)});
    assert.deepEqual(value, {intent: 'plan', operations: [], questions: []});
    assert.ok(Date.now() - started >= 1100);
  } finally {
    server.close();
  }
});

test('Timeout: resubmitting aborts the previous planner request', async () => {
  const timeouts = [];
  const controllers = [];
  class RecordingController extends AbortController {
    constructor() { super(); controllers.push(this); }
  }
  const context = {
    life: {phase: 'idle', result: null, text: '', error: ''},
    data: {tasks: [], projects: []},
    esc: value => String(value ?? ''),
    lifeWeekday: () => '周一',
    lifeDismiss() {}, lifeRefresh() {}, render() {}, toast() {}, lifeTurn() {},
    lifeDraftInput() {}, lifeComposer: () => '', lifePhaseText: () => '', lifeResult: () => '',
    lifeApply() {}, submitLifeInput() {}, lifeCoreContext: () => ({}),
    dashboardBoot: {supportsLifeProposals: true},
    LIFE_REQUEST_TIMEOUT_MS: 180000,
    AbortController: RecordingController,
    AbortSignal: {
      timeout(ms) { timeouts.push(ms); return new AbortController().signal; },
      any(signals) { return signals[0]; }
    },
    productAPI: {request: async () => ({intent: 'plan', operations: [], questions: []})}
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(agentSource, context);
  await context.lifeTurn('明天下午三点修改论文摘要，45分钟');
  await context.lifeTurn('明天下午三点修改论文摘要，60分钟');
  assert.deepEqual(timeouts, [180000, 180000]);
  assert.equal(controllers.length, 2);
  assert.equal(controllers[0].signal.aborted, true, 'the earlier request is aborted on resubmit');
  assert.equal(controllers[1].signal.aborted, false);
});
