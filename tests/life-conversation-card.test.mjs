import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/life-conversation.js', import.meta.url), 'utf8');
const task = (title, extra = {}) => ({action: 'create_task', title, projectId: null, clientRef: null, targetId: null, date: '2026-10-31', minutes: 600, ...extra});
const project = title => ({action: 'create_project', title, clientRef: 'c1', projectId: null, targetId: null, date: null, minutes: null});

function harness() {
  const noop = () => {};
  const context = {
    life: {phase: 'idle', result: null, text: '', error: ''},
    window: {lifeAccount: {user: {id: 'u1'}}},
    esc: value => String(value ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])),
    render: noop, lifeRefresh: noop, toast: noop, lifeTurn: noop,
    lifeComposer: () => '', lifeResult: () => '', lifePhaseText: () => '', lifeDraftInput: noop,
    lifeAudio: {blob: null}, lifeResizeInput: noop, submitLifeInput: noop,
    interactionPlanCard: () => '', agentInteraction: {dirty: false},
    lifeApply: async () => {}, lifeCoreBatch: null,
    productAPI: {request: async () => ({})}, LIFE_REQUEST_TIMEOUT_MS: 1000,
    AbortController, AbortSignal, setTimeout,
    document: {getElementById: () => null, querySelector: () => null, querySelectorAll: () => []},
    lifeCoreContext: () => ({}), runDatabaseCommand: noop, simpleNewRecord: noop, save: noop,
    performance: {now: () => 0}, console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return {context, get: key => vm.runInContext(key, context)};
}

test('Conversation: a revision replaces the plan card instead of appending one', () => {
  const {context, get} = harness();
  const first = {intent: 'plan', summary: '嘉兴两天游', understanding: '周末去嘉兴玩两天', message: '', operations: [project('嘉兴两天游'), task('嘉兴游玩')], warnings: [], questions: [], adjustments: [], proposalId: 'p1', proposalVersion: 1};
  get('lifeConvAccept')(first);
  assert.equal(get('lifeConvState.turns.length'), 0, 'proposals are not transcript turns');
  assert.equal(get('lifeConvState.current.proposalId'), 'p1');

  vm.runInContext('lifeConvState.pendingAdjust = "改为单日往返"', context);
  const second = {...first, summary: '嘉兴单日游', proposalId: 'p2', proposalVersion: 2};
  get('lifeConvAccept')(second);

  assert.equal(get("lifeConvState.turns.filter(t => t.type === 'proposal').length"), 0);
  assert.equal(get('lifeConvState.current.reply.summary'), '嘉兴单日游');
  assert.equal(get('lifeConvState.current.proposalId'), 'p2');
  assert.equal(get('lifeConvState.current.adjusted'), '改为单日往返');
  assert.equal(get('lifeConvState.current.history.length'), 1, 'previous version stays internal');
  assert.equal(get('lifeConvState.current.history[0].version'), 1);
  assert.equal(get('life.result.proposalId'), 'p2');
});

test('Conversation: clarification stays in the transcript and keeps the current plan', () => {
  const {context, get} = harness();
  get('lifeConvAccept')({intent: 'plan', summary: '嘉兴单日游', understanding: '', message: '', operations: [project('嘉兴单日游'), task('嘉兴游玩')], warnings: [], questions: [], adjustments: [], proposalId: 'p1', proposalVersion: 1});
  get('lifeConvAccept')({intent: 'clarify', summary: '', understanding: '还要几天？', message: '确认一下', operations: [], warnings: [], adjustments: [], questions: [{id: 'days', question: '玩几天？', options: [{label: '1 天', value: '1'}], allowCustom: true}], proposalId: 'p1', proposalVersion: 1});
  assert.equal(get('lifeConvState.turns.length'), 1);
  assert.equal(get('lifeConvState.turns[0].type'), 'clarification');
  assert.equal(get('lifeConvState.current.proposalId'), 'p1');
  assert.equal(get('lifeConvState.current.reply.summary'), '嘉兴单日游');
});

test('Conversation: confirm acts on the current card only', async () => {
  const {context, get} = harness();
  let applied = null;
  context.lifeApply = async operations => {
    applied = operations;
    context.life.phase = 'done';
  };
  get('lifeConvAccept')({intent: 'plan', summary: '嘉兴单日游', understanding: '', message: '', operations: [task('嘉兴游玩')], warnings: [], questions: [], adjustments: [], proposalId: 'p1', proposalVersion: 1});
  await get('lifeConvConfirm')();
  assert.equal(applied.length, 1);
  assert.equal(get('lifeConvState.current.confirmed'), true);
  assert.equal(get("lifeConvState.turns.filter(t => t.type === 'answer').length"), 1);
});
