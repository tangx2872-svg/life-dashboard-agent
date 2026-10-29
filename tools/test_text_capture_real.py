"""真实调用 AutoDL API 测试「自然语言 → Capture v2」（仅人工执行，会产生 API 消费）。

默认走 HTTP 接口（/api/text-capture），因此需要先启动服务：
    uvicorn app:app --host 0.0.0.0 --port 6006

用法：
    conda activate life-agent
    python tools/test_text_capture_real.py                 # 跑 10 条用例
    python tools/test_text_capture_real.py --perf 10       # 连续 10 次性能测试
    python tools/test_text_capture_real.py --direct        # 直接调 Provider，打印 attempts/repaired
    python tools/test_text_capture_real.py --all

说明：
- 期望值按"执行当天"动态计算（今天 = 运行日）；
- 不打印 API Key、不打印完整环境变量。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import httpx  # noqa: E402

from core.config import get_settings  # noqa: E402

TODAY: date = date.today()


def d(offset: int) -> str:
    """相对今天的日期字符串（YYYY-MM-DD）。"""
    return (TODAY + timedelta(days=offset)).isoformat()


@dataclass
class Case:
    text: str
    expect_items: int
    # 每个期望条目的 start_datetime 约束；None 表示不检查
    expect_starts: list[dict | None] = field(default_factory=list)
    expect_kinds: list[str] | None = None


CASES: list[Case] = [
    Case(
        text="明天下午三点开会。",
        expect_items=1,
        expect_starts=[{"date": d(1), "time": "15:00"}],
        expect_kinds=["event"],
    ),
    Case(
        text="晚上八点修改论文，然后背半小时六级单词。",
        expect_items=2,
        expect_starts=[
            {"date": d(0), "time": "20:00"},
            {"allow_null": True},  # 第二个事项没有明确时间
        ],
    ),
    Case(
        text="周五之前把机器学习作业交了。",
        expect_items=1,
        # 今天是周四，最近周五 = 明天
        expect_starts=[{"date_in": [d(1), d(1 - 7 + 7)]}],
    ),
    Case(
        text="明天早上去健身，如果下雨就改成晚上。",
        expect_items=1,
        expect_starts=[{"date": d(1)}],
    ),
    Case(
        text="提醒我下个月交房租。",
        expect_items=1,
        expect_starts=[{"allow_null": True}],  # 没有具体日期，允许 null
    ),
    Case(
        text="后天下午两点和导师讨论论文。",
        expect_items=1,
        expect_starts=[{"date": d(2), "time": "14:00"}],
        expect_kinds=["event"],
    ),
    Case(
        text="今天晚上游泳一个小时。",
        expect_items=1,
        expect_starts=[{"date": d(0)}],
    ),
    Case(
        text="周末把PPT改完，然后准备下周汇报。",
        expect_items=2,
        expect_starts=[{"date_in": [d(2), d(3)]}, {"allow_null": True}],
    ),
    Case(
        text="十一月十号前提交比赛作品。",
        expect_items=1,
        expect_starts=[{"date": f"{TODAY.year}-11-10"}],
    ),
    Case(
        text="明天下午三点开会，晚上八点修改论文，睡前背30分钟单词。",
        expect_items=3,
        expect_starts=[
            {"date": d(1), "time": "15:00"},
            {"date": d(1), "time": "20:00"},
            {"allow_null": True},
        ],
    ),
]

PERF_TEXT = "明天下午三点开会，晚上八点修改论文。"


def percentile(values: list[float], pct: float) -> float:
    """线性插值分位数（无需 numpy）。"""
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = (len(ordered) - 1) * pct
    low = int(pos)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (pos - low)


def check_start(value: str | None, spec: dict | None) -> tuple[bool, str]:
    """校验某条目的 start_datetime 是否符合期望，返回 (是否通过, 实际值)。"""
    if spec is None:
        return True, str(value)
    if value is None:
        return bool(spec.get("allow_null")), "null"
    date_part = value[:10]
    ok_date = True
    if spec.get("date"):
        ok_date = date_part == spec["date"]
    elif spec.get("date_in"):
        ok_date = date_part in spec["date_in"]
    ok_time = True
    if spec.get("time"):
        ok_time = len(value) >= 16 and value[11:16] == spec["time"]
    return ok_date and ok_time, value


# ------------------------------------------------------------------ HTTP 模式
def run_cases_http(base_url: str) -> dict:
    endpoint = f"{base_url}/api/text-capture"
    print("=" * 96)
    weekday = "一二三四五六日"[TODAY.weekday()]
    print(f"今天是 {TODAY.isoformat()}（周{weekday}），期望值按今天换算")
    print(f"目标接口 {endpoint}")
    print("=" * 96)

    rows: list[dict] = []
    for idx, case in enumerate(CASES, start=1):
        t0 = time.perf_counter()
        try:
            with httpx.Client(timeout=180) as http:
                resp = http.post(endpoint, json={"text": case.text})
            elapsed_ms = int((time.perf_counter() - t0) * 1000)
            body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        except Exception as exc:
            elapsed_ms = int((time.perf_counter() - t0) * 1000)
            print(f"({idx}) 请求异常: {type(exc).__name__} {exc}")
            rows.append({"http": 0, "json": False, "pydantic": False, "case": case, "items": [], "elapsed_ms": elapsed_ms})
            continue

        http_ok = resp.status_code == 200
        json_ok = bool(body)
        pydantic_ok = http_ok and isinstance(body.get("capture"), dict)
        items = body.get("capture", {}).get("items", []) if pydantic_ok else []
        batch_id = body.get("capture", {}).get("batchId", "") if pydantic_ok else ""
        timings = body.get("timings", {}) if isinstance(body, dict) else {}

        start_ok = True
        start_detail = []
        for i, item in enumerate(items):
            spec = case.expect_starts[i] if i < len(case.expect_starts) else None
            ok, actual = check_start(item.get("start_datetime"), spec)
            start_ok = start_ok and ok
            start_detail.append(f"{actual}{'' if ok else ' ✗'}")

        kind_ok = True
        if case.expect_kinds:
            kinds = [it.get("type") for it in items]
            kind_ok = kinds == case.expect_kinds

        rows.append(
            {
                "http": resp.status_code,
                "json": json_ok,
                "pydantic": pydantic_ok,
                "case": case,
                "items": items,
                "batch_id": batch_id,
                "elapsed_ms": elapsed_ms,
                "server_llm_ms": timings.get("llm_ms", -1),
                "start_ok": start_ok,
                "kind_ok": kind_ok,
                "start_detail": start_detail,
                "body": body,
            }
        )

        status = "OK " if (http_ok and start_ok and kind_ok) else "偏差"
        print(f"\n({idx}) [{status}] {case.text}")
        print(f"     HTTP {resp.status_code} | 事项数 {len(items)}（期望 {case.expect_items}） | 耗时 {elapsed_ms}ms | llm_ms={timings.get('llm_ms', '-')}")
        for item in items:
            print(
                f"     - [{item.get('type')}] {item.get('title')} | "
                f"start={item.get('start_datetime')} | end={item.get('end_datetime')} | note={item.get('note')}"
            )
        if not http_ok:
            print(f"     响应: {json.dumps(body, ensure_ascii=False)[:400]}")

    _summary(rows)
    return {"rows": rows}


def _summary(rows: list[dict]) -> None:
    total = len(rows)
    http_ok = sum(1 for r in rows if r.get("http") == 200)
    json_ok = sum(1 for r in rows if r.get("json"))
    pydantic_ok = sum(1 for r in rows if r.get("pydantic"))
    items_ok = sum(1 for r in rows if len(r.get("items", [])) == r["case"].expect_items)
    start_ok = sum(1 for r in rows if r.get("start_ok"))
    kind_ok = sum(1 for r in rows if r.get("kind_ok", True))
    elapsed = [r["elapsed_ms"] for r in rows]

    print("\n" + "=" * 96)
    print("汇总")
    print(f"HTTP 200        : {http_ok}/{total}（{http_ok / total:.0%}）")
    print(f"JSON 可解析     : {json_ok}/{total}")
    print(f"Pydantic 通过   : {pydantic_ok}/{total}（服务端已校验，200 即代表通过）")
    print(f"事项拆分正确    : {items_ok}/{total}（{items_ok / total:.0%}）")
    print(f"日期/时间正确   : {start_ok}/{total}（{start_ok / total:.0%}）")
    print(f"kind 合理       : {kind_ok}/{total}")
    print(f"端到端耗时      : min={min(elapsed)}ms max={max(elapsed)}ms avg={statistics.mean(elapsed):.0f}ms")
    print("=" * 96)


# ------------------------------------------------------------------ 性能模式
def run_perf(base_url: str, rounds: int) -> None:
    endpoint = f"{base_url}/api/text-capture"
    print("\n" + "=" * 96)
    print(f"性能测试：连续 {rounds} 次调用同一条短文本「{PERF_TEXT}」")
    print("=" * 96)

    latencies: list[float] = []
    for i in range(rounds):
        t0 = time.perf_counter()
        try:
            with httpx.Client(timeout=180) as http:
                resp = http.post(endpoint, json={"text": PERF_TEXT})
            ok = resp.status_code == 200
        except Exception as exc:
            ok = False
            print(f"  第 {i + 1} 次异常: {exc}")
        cost = (time.perf_counter() - t0) * 1000
        latencies.append(cost)
        print(f"  第 {i + 1:2d} 次: {cost:8.0f} ms {'OK' if ok else 'FAIL'}")

    print("-" * 96)
    print(f"最小延迟: {min(latencies):.0f} ms")
    print(f"最大延迟: {max(latencies):.0f} ms")
    print(f"平均延迟: {statistics.mean(latencies):.0f} ms")
    print(f"P50     : {percentile(latencies, 0.50):.0f} ms")
    print(f"P95     : {percentile(latencies, 0.95):.0f} ms")
    print("=" * 96)


# --------------------------------------------------------------- direct 模式
async def run_direct() -> None:
    """直接调用 Provider：可打印 attempts / repaired / structured_output。"""
    from services.llm.autodl_llm import AutoDLLLMProvider

    settings = get_settings()
    provider = AutoDLLLMProvider(settings)
    print("\n" + "=" * 96)
    print("Direct 模式（不经 HTTP，直接调 Provider）")
    print(f"model={settings.autodl_llm_model} structured 设置={settings.autodl_llm_structured}")
    print("=" * 96)

    for idx, case in enumerate(CASES, start=1):
        t0 = time.perf_counter()
        try:
            result = await provider.parse_capture_detailed(
                case.text,
                {
                    "current_datetime": datetime.now().isoformat(),
                    "timezone": settings.default_timezone,
                    "locale": settings.default_locale,
                },
            )
            cost = int((time.perf_counter() - t0) * 1000)
            print(
                f"({idx:2d}) items={len(result.payload.items)} attempts={result.attempts} "
                f"repaired={result.repaired} structured={result.structured_output} "
                f"llm_ms={result.llm_ms} validation_ms={result.validation_ms} total={cost}ms | {case.text}"
            )
        except Exception as exc:
            cost = int((time.perf_counter() - t0) * 1000)
            print(f"({idx:2d}) 失败 {type(exc).__name__}: {exc}（{cost}ms） | {case.text}")

    print(f"\n上游结构化输出能力探测结果: {provider.structured_mode}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture v2 真实链路测试")
    parser.add_argument("--base-url", default="http://127.0.0.1:6006")
    parser.add_argument("--perf", type=int, default=0, help="连续 N 次性能测试")
    parser.add_argument("--direct", action="store_true", help="直接调用 Provider（打印 attempts/repaired）")
    parser.add_argument("--no-cases", action="store_true", help="跳过 10 条用例")
    parser.add_argument("--all", action="store_true", help="用例 + 10 次性能")
    args = parser.parse_args()

    settings = get_settings()
    print(f"AutoDL model={settings.autodl_llm_model} base={settings.autodl_llm_base_url}")

    if args.all:
        args.perf = 10

    if not args.no_cases:
        run_cases_http(args.base_url)
    if args.perf:
        run_perf(args.base_url, args.perf)
    if args.direct:
        asyncio.run(run_direct())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
