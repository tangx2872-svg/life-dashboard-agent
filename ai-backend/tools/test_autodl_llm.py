"""独立连通性测试：AutoDL OpenAI-compatible API + gpt-5.6-luna。

用法：
    conda activate life-agent
    python tools/test_autodl_llm.py

完成：
1. 读取项目根目录 .env；
2. 创建 client（base_url = AUTODL_LLM_BASE_URL）；
3. 调用 gpt-5.6-luna；
4. 打印：是否成功、模型名、返回文本、耗时。

安全：不打印 API Key，不打印请求头。
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.config import get_settings  # noqa: E402
from services.llm.autodl_llm import AutoDLLLMProvider  # noqa: E402

CONNECTIVITY_PROMPT = "请只回复：AutoDL GPT API连接成功"

UNDERSTANDING_PROMPT = """用户说：
明天下午三点开会，晚上八点修改论文。

请用一句话说明用户准备做什么。"""


def _mask(key: str) -> str:
    """只展示 Key 的前 4 位与长度，绝不打印完整 Key。"""
    if not key:
        return "(未配置)"
    return f"{key[:4]}...（长度 {len(key)}，已打码）"


async def _call(provider: AutoDLLLMProvider, prompt: str, title: str) -> tuple[bool, str, float]:
    print(f"\n--- {title} ---")
    print(f"输入: {prompt}")
    t0 = time.perf_counter()
    try:
        text = await provider.generate(prompt)
        cost = time.perf_counter() - t0
        print(f"HTTP 调用: 成功")
        print(f"模型: {provider.model}")
        print(f"返回文本: {text}")
        print(f"耗时: {cost:.2f}s")
        return True, text, cost
    except Exception as exc:
        cost = time.perf_counter() - t0
        print(f"HTTP 调用: 失败（{type(exc).__name__}）")
        print(f"错误: {exc}")
        print(f"耗时: {cost:.2f}s")
        return False, str(exc), cost


async def main() -> int:
    settings = get_settings()
    print("=" * 78)
    print("AutoDL LLM 连通性测试")
    print(f"base_url : {settings.autodl_llm_base_url}")
    print(f"model    : {settings.autodl_llm_model}")
    print(f"api_key  : {_mask(settings.autodl_llm_api_key)}")
    print(f"endpoint : {settings.autodl_llm_base_url.rstrip('/')}/responses")
    print("=" * 78)

    if not settings.autodl_llm_api_key:
        print("未读取到 AUTODL_LLM_API_KEY，请检查项目根目录 .env")
        return 1
    if not settings.autodl_llm_model:
        print("未读取到 AUTODL_LLM_MODEL，请检查项目根目录 .env")
        return 1

    provider = AutoDLLLMProvider(settings)

    ok1, _, t1 = await _call(provider, CONNECTIVITY_PROMPT, "测试 1：连通性")
    ok2, _, t2 = await _call(provider, UNDERSTANDING_PROMPT, "测试 2：中文理解")

    print("\n" + "=" * 78)
    print(f"连通性测试: {'通过' if ok1 else '失败'}（{t1:.2f}s）")
    print(f"中文理解测试: {'通过' if ok2 else '失败'}（{t2:.2f}s）")
    print("是否发生 401 / 429 / timeout: 见上方错误信息（若成功则未发生）")
    print("=" * 78)
    return 0 if (ok1 and ok2) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
