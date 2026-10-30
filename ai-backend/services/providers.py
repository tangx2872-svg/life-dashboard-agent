"""Provider 工厂：按 .env 选择具体实现，业务代码不感知具体模型。

所有 SDK（funasr / openai）都在此处做惰性导入，保证：
- 没装 funasr 也能启动服务；
- 没有 OPENAI_API_KEY 也能启动服务（调用时才报错）。
"""

from __future__ import annotations

import os

from core.config import ASR_PROVIDERS, LLM_PROVIDERS, Settings
from core.errors import AppError, ErrorCode
from core.logging import get_logger
from services.asr.base import ASRProvider
from services.llm.base import LLMProvider

logger = get_logger(__name__)


def build_asr_provider_named(name: str, settings: Settings) -> ASRProvider:
    name = (name or "").strip().lower()
    if name not in ASR_PROVIDERS:
        raise AppError(
            code=ErrorCode.PROVIDER_NOT_CONFIGURED,
            message=f"未知的 ASR_PROVIDER：{name}，可选 {list(ASR_PROVIDERS)}",
            status_code=500,
        )

    if name == "mock":
        from services.asr.mock import MockASRProvider

        return MockASRProvider(text=settings.mock_asr_text)

    if name == "gemini":
        from services.asr.gemini_asr import GeminiASRProvider
        return GeminiASRProvider(settings)

    if name == "funasr":
        from services.asr.funasr import FunASRProvider

        return FunASRProvider(settings)

    from services.asr.openai_asr import OpenAIASRProvider

    return OpenAIASRProvider(settings)


def build_asr_provider(settings: Settings) -> ASRProvider:
    return build_asr_provider_named(settings.asr_provider, settings)


def build_asr_pool(settings: Settings) -> ASRProvider:
    """Primary plus optional ASR_FALLBACK_1..3; unavailable extras are skipped, never fatal."""
    from services.asr.router import ASRRouter

    wanted = [os.getenv("ASR_PRIMARY") or settings.asr_provider]
    wanted += [os.getenv(f"ASR_FALLBACK_{index}") for index in (1, 2, 3)]
    pool: list[tuple[str, ASRProvider]] = []
    seen: set[str] = set()
    for candidate in wanted:
        name = (candidate or "").strip().lower()
        if not name or name in seen:
            continue
        seen.add(name)
        try:
            pool.append((name, build_asr_provider_named(name, settings)))
        except Exception as error:  # noqa: BLE001 - a missing fallback must not break startup
            if not pool:
                raise
            logger.warning("跳过不可用的 ASR fallback %s: %s", name, error)
    return ASRRouter(pool)


def build_llm_provider(settings: Settings) -> LLMProvider:
    name = settings.llm_provider
    if name not in LLM_PROVIDERS:
        raise AppError(
            code=ErrorCode.PROVIDER_NOT_CONFIGURED,
            message=f"未知的 LLM_PROVIDER：{name}，可选 {list(LLM_PROVIDERS)}",
            status_code=500,
        )

    if name == "mock":
        from services.llm.mock import MockLLMProvider

        return MockLLMProvider()

    if name == "local_qwen":
        from services.llm.local_qwen import LocalQwenProvider

        return LocalQwenProvider(settings)

    if name == "autodl":
        from services.llm.autodl_llm import AutoDLLLMProvider

        return AutoDLLLMProvider(settings)

    from services.llm.openai_llm import OpenAILLMProvider

    return OpenAILLMProvider(settings)
