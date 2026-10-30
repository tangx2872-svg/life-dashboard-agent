#!/usr/bin/env python3
"""Merges the apply layer and prints the FAST benchmark table.

usage: python3 summarize.py [outDir]
"""
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

PRICES = {
    'GLM-5.3-Flash': {'in': 0.56, 'out': 1.96, 'note': 'AutoDL 页面价格（用户提供）'},
    'DeepSeek-V4.1-Flash': {'in': 0.50, 'out': 2.00, 'peak_in': 1.00, 'peak_out': 4.00, 'note': '空闲价；高峰 1.00/4.00'},
    'MiniMax-M3.1-Flash': {'in': 1.00, 'out': 4.00, 'note': 'AutoDL 页面价格（用户提供）'},
    'gpt-5.6-luna': {'in': None, 'out': None, 'note': '接口未提供价格，暂无可靠成本数据'},
}


def pct(values, ratio):
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round((len(ordered) - 1) * ratio)))
    return round(ordered[index], 1)


def stats(rows):
    n = len(rows)
    ok = [r for r in rows if r.get('success')]
    ttfts = [r['ttft_ms'] for r in ok if r.get('ttft_ms') is not None]
    totals = [r['total_ms'] for r in ok if r.get('total_ms') is not None]

    def rate(key):
        return round(sum(1 for r in rows if r.get(key)) / n, 3) if n else None

    tokens_in = [r['usage'].get('input_tokens') for r in ok if r.get('usage', {}).get('input_tokens')]
    tokens_out = [r['usage'].get('output_tokens') for r in ok if r.get('usage', {}).get('output_tokens')]
    avg_in = round(sum(tokens_in) / len(tokens_in)) if tokens_in else None
    avg_out = round(sum(tokens_out) / len(tokens_out)) if tokens_out else None
    price = PRICES.get(rows[0]['model'] if rows else '', {})
    cost = round((avg_in * price['in'] + avg_out * price['out']) / 1e6 * 1000, 4) if avg_in and avg_out and price.get('in') is not None else None
    peak = round((avg_in * price['peak_in'] + avg_out * price['peak_out']) / 1e6 * 1000, 4) if avg_in and avg_out and price.get('peak_in') is not None else None
    per_case = defaultdict(lambda: {'runs': 0, 'match': 0})
    for r in rows:
        cell = per_case[r['case_id']]
        cell['runs'] += 1
        cell['match'] += 1 if r.get('expected_match') else 0
    return {
        'calls': n, 'success': len(ok), 'failures': n - len(ok),
        'strict_json_rate': rate('structured_output_valid'),
        'pydantic_rate': rate('pydantic_valid'),
        'apply_rate': rate('apply_actions_valid'),
        'expected_match_rate': rate('expected_match'),
        'unnecessary_clarification_rate': rate('unnecessary_clarification'),
        'ttft_min': min(ttfts) if ttfts else None, 'ttft_p50': pct(ttfts, 0.5), 'ttft_p90': pct(ttfts, 0.9), 'ttft_max': max(ttfts) if ttfts else None,
        'total_min': min(totals) if totals else None, 'total_p50': pct(totals, 0.5), 'total_p90': pct(totals, 0.9), 'total_max': max(totals) if totals else None,
        'avg_input_tokens': avg_in, 'avg_output_tokens': avg_out,
        'cost_cny_per_1k': cost, 'cost_cny_per_1k_peak': peak, 'cost_note': price.get('note'),
        'intents': dict(Counter(r.get('intent') or 'none' for r in rows)),
        'cases': {str(k): per_case[k] for k in sorted(per_case)},
    }


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / 'out'
    rows = [json.loads(line) for line in open(out / 'results.jsonl', encoding='utf-8') if line.strip()]
    apply_map = {}
    apply_path = out / 'apply.jsonl'
    if apply_path.exists():
        for line in open(apply_path, encoding='utf-8'):
            if line.strip():
                cell = json.loads(line)
                apply_map[cell['request_index']] = cell
    for row in rows:
        cell = apply_map.get(row['request_index'], {})
        row['apply_actions_valid'] = bool(cell.get('apply_actions_valid'))
        row['apply_error'] = cell.get('apply_error', 'not validated')
    with open(out / 'validated.jsonl', 'w', encoding='utf-8') as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + '\n')
    main_rows = [r for r in rows if r['phase'] == 'main']
    probe_rows = [r for r in rows if r['phase'] == 'probe']
    per_model = {m: stats([r for r in main_rows if r['model'] == m]) for m in sorted({r['model'] for r in main_rows})}
    probe = {m: {mode: stats([r for r in probe_rows if r['model'] == m and r['reasoning_mode'] == mode]) for mode in ('low', 'none')}
             for m in sorted({r['model'] for r in probe_rows})}

    def key(item):
        s = item[1]
        return (-(s['strict_json_rate'] or 0), -(s['apply_rate'] or 0), -(s['expected_match_rate'] or 0),
                s['unnecessary_clarification_rate'] or 0,
                s['total_p90'] if s['total_p90'] is not None else 9e9,
                s['ttft_p90'] if s['ttft_p90'] is not None else 9e9,
                s['total_p50'] if s['total_p50'] is not None else 9e9,
                s['cost_cny_per_1k'] if s['cost_cny_per_1k'] is not None else 9e9)

    ranking = [name for name, _ in sorted(per_model.items(), key=key)]
    summary = {'generatedAt': datetime.now().isoformat(), 'models': per_model, 'ranking': ranking, 'probe': probe}
    json.dump(summary, open(out / 'summary.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('| 模型 | Strict JSON | apply合法 | 严格命中 | 无意义追问 | TTFT P50 | TTFT P90 | Total P50 | Total P90 | Max | 成本(¥/千次) |')
    print('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
    for name in ranking:
        s = per_model[name]
        cost = '未知' if s['cost_cny_per_1k'] is None else f"{s['cost_cny_per_1k']}" + (f"~{s['cost_cny_per_1k_peak']}" if s['cost_cny_per_1k_peak'] else '')
        print(f"| {name} | {s['strict_json_rate']} | {s['apply_rate']} | {s['expected_match_rate']} | "
              f"{s['unnecessary_clarification_rate']} | {s['ttft_p50']} | {s['ttft_p90']} | {s['total_p50']} | "
              f"{s['total_p90']} | {s['total_max']} | {cost} |")
    print('ranking', ranking)


if __name__ == '__main__':
    main()
