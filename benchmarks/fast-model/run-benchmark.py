#!/usr/bin/env python3
"""FAST model benchmark for Life proposals.

Every model gets the exact same instructions, strict LifeProposal schema, FAST context
(max_output_tokens=2500), endpoint, retries=0 and a 180s timeout; calls run serially and
models are interleaved so provider drift cannot favour one of them.

Usage:
    python3 run-benchmark.py --out results/2026-10-30            # probe + 120 main calls
    python3 run-benchmark.py --out results/2026-10-30 --phase probe
Requires AUTODL_LLM_BASE_URL / AUTODL_LLM_API_KEY (ai-backend/.env is loaded on import).
"""
import argparse, asyncio, json, os, re, sys, time
from pathlib import Path

BASE = Path(__file__).resolve().parent
REPO = BASE.parent.parent
sys.path.insert(0, str(REPO / 'ai-backend'))
from openai import AsyncOpenAI, APIStatusError  # noqa: E402
from api.life_proposal_routes import FAST_INSTRUCTIONS, LifeProposal  # noqa: E402

MODELS = ['GLM-5.3-Flash', 'DeepSeek-V4.1-Flash', 'MiniMax-M3.1-Flash', 'gpt-5.6-luna']
PROBE_MODELS = MODELS[:3]
LOW_RISK = re.compile(r'(归哪个项目|哪个项目|项目归属|这个任务是哪|哪个任务|哪一项任务)')
OUT = BASE / 'out'


def files():
    return {
        'contexts': OUT / 'contexts.json',
        'results': OUT / 'results.jsonl',
        'probe': OUT / 'probe.json',
    }


def percentile(values, ratio):
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round((len(ordered) - 1) * ratio)))
    return round(ordered[index], 1)


def client():
    return AsyncOpenAI(api_key=os.environ['AUTODL_LLM_API_KEY'], base_url=os.environ['AUTODL_LLM_BASE_URL'], max_retries=0, timeout=180)


async def call(client, model, reasoning_mode, row):
    payload = {'text': row['message'], 'context': row['context'], 'previous': None}
    kwargs = dict(
        model=model,
        instructions=FAST_INSTRUCTIONS,
        input=json.dumps(payload, ensure_ascii=False),
        text={'format': {'type': 'json_schema', 'name': 'life_proposal', 'schema': LifeProposal.model_json_schema(), 'strict': True}},
        max_output_tokens=2500,
        stream=True,
    )
    if reasoning_mode == 'low':
        kwargs['reasoning'] = {'effort': 'low'}
    started = time.perf_counter()
    first, chunks, completed, usage = None, [], False, {}
    record = {'success': False, 'http_status': 200, 'error': ''}
    try:
        stream = await client.responses.create(**kwargs)
        async for event in stream:
            if event.type == 'response.output_text.delta':
                if first is None:
                    first = (time.perf_counter() - started) * 1000
                chunks.append(event.delta)
            elif event.type == 'response.completed':
                completed = True
                raw = getattr(getattr(event, 'response', None), 'usage', None)
                if raw is not None:
                    usage = {'input_tokens': getattr(raw, 'input_tokens', None), 'output_tokens': getattr(raw, 'output_tokens', None)}
            elif event.type in ('response.failed', 'response.incomplete', 'error'):
                raise ValueError('incomplete response: ' + str(event.type))
    except APIStatusError as error:
        record['http_status'] = error.status_code
        record['error'] = f'{type(error).__name__}: {str(error)[:180]}'
    except Exception as error:  # noqa: BLE001 - never abort the whole run for one call
        record['error'] = f'{type(error).__name__}: {str(error)[:180]}'
    total = (time.perf_counter() - started) * 1000
    text = ''.join(chunks)
    record.update({
        'ttft_ms': round(first, 1) if first is not None else None,
        'total_ms': round(total, 1),
        'generation_ms': round(total - first, 1) if first is not None else None,
        'output_chars': len(text),
        'output_present': bool(text.strip()),
        'completed': completed,
        'usage': usage,
        'output_head': text[:400],
    })
    if not record['error'] and not completed:
        record['error'] = 'stream ended without completion'
    record['success'] = bool(completed and text.strip() and not record['error'])
    if text.strip():
        # Layer 1: strict response must be an object carrying every required property.
        required = set(LifeProposal.model_fields.keys())
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = None
        record['structured_output_valid'] = bool(
            isinstance(parsed, dict) and required.issubset(parsed.keys())
            and isinstance(parsed.get('operations'), list) and isinstance(parsed.get('questions'), list)
        )
        if isinstance(parsed, dict):
            record['schema_missing'] = sorted(required - set(parsed.keys()))
        try:
            proposal = LifeProposal.model_validate_json(text)
            record['pydantic_valid'] = True
            record['proposal'] = proposal.model_dump()
        except Exception as error:
            record['pydantic_valid'] = False
            record['pydantic_error'] = str(error)[:200]
    else:
        record['structured_output_valid'] = False
        record['pydantic_valid'] = False
    return record


def op_matches(op, expect):
    if op.get('date') not in expect['dates']:
        return False
    if expect.get('time') is not None and op.get('time') != expect['time']:
        return False
    if expect.get('time') is None and op.get('time'):
        return False
    if expect.get('minutes') is not None and op.get('minutes') != expect['minutes']:
        return False
    return True


def evaluate(record, row):
    expect = row['expect']
    proposal = record.get('proposal') or {}
    ops = proposal.get('operations') or []
    questions = proposal.get('questions') or []
    intent = proposal.get('intent')
    record.update({'intent': intent, 'clarification_count': len(questions), 'operations_count': len(ops),
                   'actions': [op.get('action') for op in ops]})
    checks = {'date_correct': None, 'time_correct': None, 'minutes_correct': None, 'current_task_correct': None}
    if 'pairs' in expect:
        remaining, matched = list(ops), 0
        for pair in expect['pairs']:
            for op in remaining:
                if op_matches(op, pair):
                    remaining.remove(op)
                    matched += 1
                    break
        checks['date_correct'] = checks['time_correct'] = checks['minutes_correct'] = matched == len(expect['pairs'])
        record['matched_pairs'] = matched
    else:
        checks['date_correct'] = any(op.get('date') in expect['dates'] for op in ops)
        if expect.get('time') is not None:
            checks['time_correct'] = any(op.get('time') == expect['time'] for op in ops)
        if expect.get('minutes') is not None:
            checks['minutes_correct'] = any(op.get('minutes') == expect['minutes'] for op in ops)
    if expect.get('currentTask'):
        checks['current_task_correct'] = any(op.get('targetId') == row.get('task') and op.get('action') == 'reschedule_task' for op in ops)
    low_value = bool(questions) and all(LOW_RISK.search(str(q.get('question', ''))) for q in questions)
    record['unnecessary_clarification'] = intent == 'needs_clarification' and (
        low_value or (not questions and bool(LOW_RISK.search(str(proposal.get('message', '')))))
    )
    record['expected_match'] = bool(
        intent in ('plan', 'modify')
        and len(ops) == expect['ops']
        and all(op.get('action') in ('create_task', 'update_task', 'reschedule_task') for op in ops)
        and checks['date_correct'] is True
        and checks['time_correct'] is not False
        and checks['minutes_correct'] is not False
        and checks['current_task_correct'] is not False
    )
    record.update(checks)
    record['expected'] = expect
    return record


class Runner:
    def __init__(self, out_dir):
        self.out = Path(out_dir)
        self.out.mkdir(parents=True, exist_ok=True)
        self.contexts = json.load(open(self.out / 'contexts.json', encoding='utf-8'))
        self.rows = self.contexts['rows']
        self.index = 0

    def write(self, record):
        with open(self.out / 'results.jsonl', 'a', encoding='utf-8') as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + '\n')

    async def probe(self, cli):
        for rep in range(3):
            for row in (self.rows[0], self.rows[4]):
                for model in PROBE_MODELS:
                    for mode in ('low', 'none'):
                        record = await call(cli, model, mode, row)
                        record.update({'phase': 'probe', 'model': model, 'reasoning_mode': mode, 'case_id': row['id'],
                                       'round': rep + 1, 'request_index': self.index, 'tier': 'FAST'})
                        self.index += 1
                        self.write(evaluate(record, row))
                        print('probe', model, mode, 'case', row['id'], 'ok' if record['success'] else 'FAIL',
                              record.get('ttft_ms'), record.get('total_ms'), record.get('pydantic_valid'), flush=True)

    @staticmethod
    def decide(model, records):
        low = [r for r in records if r['model'] == model and r['reasoning_mode'] == 'low']
        none = [r for r in records if r['model'] == model and r['reasoning_mode'] == 'none']

        def rate(rows, key):
            return sum(1 for r in rows if r.get(key)) / len(rows) if rows else 0

        if not low or all(r.get('http_status') in (400, 404, 422, 500) and not r.get('structured_output_valid') for r in low):
            return {'mode': 'none', 'supports_reasoning': False, 'reason': 'reasoning.effort rejected or unusable'}
        low_ok, none_ok = rate(low, 'pydantic_valid'), rate(none, 'pydantic_valid')
        low_p50 = percentile([r['total_ms'] for r in low if r['success']], 0.5)
        none_p50 = percentile([r['total_ms'] for r in none if r['success']], 0.5)
        if low_p50 is None:
            return {'mode': 'none', 'supports_reasoning': True, 'reason': 'low had no successful call'}
        if none_p50 is None or (low_ok >= none_ok and low_p50 <= none_p50 * 1.05):
            return {'mode': 'low', 'supports_reasoning': True, 'reason': f'low p50={low_p50} none p50={none_p50}',
                    'low_p50': low_p50, 'none_p50': none_p50, 'low_valid': low_ok, 'none_valid': none_ok}
        return {'mode': 'none', 'supports_reasoning': True, 'reason': f'none faster: low={low_p50} none={none_p50}',
                'low_p50': low_p50, 'none_p50': none_p50, 'low_valid': low_ok, 'none_valid': none_ok}

    async def main_round(self, cli, chosen):
        for round_index in (1, 2, 3):
            for row in self.rows:
                for model in MODELS:
                    record = await call(cli, model, chosen[model]['mode'], row)
                    record.update({'phase': 'main', 'model': model, 'reasoning_mode': chosen[model]['mode'],
                                   'case_id': row['id'], 'round': round_index, 'request_index': self.index, 'tier': 'FAST'})
                    self.index += 1
                    self.write(evaluate(record, row))
                    print('main', round_index, row['id'], model, 'ok' if record['success'] else 'FAIL',
                          record.get('ttft_ms'), record.get('total_ms'), 'match', record.get('expected_match'), flush=True)


async def run(out_dir, phase):
    runner = Runner(out_dir)
    cli = client()
    if phase in ('all', 'probe'):
        await runner.probe(cli)
    if phase in ('all', 'main'):
        records = [json.loads(line) for line in open(runner.out / 'results.jsonl', encoding='utf-8') if line.strip()]
        chosen = {model: Runner.decide(model, records) for model in MODELS}
        chosen['gpt-5.6-luna'] = {'mode': 'low', 'supports_reasoning': True, 'reason': 'baseline configuration'}
        json.dump(chosen, open(runner.out / 'probe.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print('chosen', json.dumps(chosen, ensure_ascii=False), flush=True)
        await runner.main_round(cli, chosen)
    print('done', runner.index, 'calls', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default=str(BASE / 'out'))
    parser.add_argument('--phase', default='all', choices=['all', 'probe', 'main'])
    args = parser.parse_args()
    asyncio.run(run(args.out, args.phase))
