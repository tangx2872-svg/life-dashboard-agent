"""LLM Provider 抽象接口。

业务代码只依赖 LLMProvider；具体实现（OpenAI / 本地 Qwen / Mock）通过
LLM_PROVIDER 环境变量切换。
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from schemas.capture import CapturePayload


class LLMProvider(ABC):
    """自然语言 → Life Dashboard Capture v2 JSON。"""

    name: str = "base"

    @abstractmethod
    async def parse_capture(self, text: str, context: dict) -> CapturePayload:
        """把自然语言解析成 Capture v2 结构。

        Args:
            text: 待解析文本（ASR 转写结果或前端直接传入的文本）。
            context: 上下文信息，至少包含 locale / timezone / current_datetime。

        Returns:
            已通过 Pydantic 校验的 CapturePayload。

        Raises:
            core.errors.AppError: LLM_FAILED / INVALID_CAPTURE_JSON /
                PROVIDER_NOT_CONFIGURED。
        """
        raise NotImplementedError

    async def warmup(self) -> None:
        return None
