"""Mock LLM Provider：不调用任何外部服务，返回一份合法的最小 Capture v2 items。

用于开发阶段跑通 text → LLM → Pydantic 链路（LLM_PROVIDER=mock），
以及在测试中避免真实调用。
"""

from __future__ import annotations

from core.logging import get_logger
from schemas.capture import CaptureItem, CapturePayload
from services.llm.base import LLMProvider
from services.llm.support import CaptureParseResult, build_capture_payload

logger = get_logger(__name__)


class MockLLMProvider(LLMProvider):
    name = "mock"

    async def parse_capture_detailed(self, text: str, context: dict) -> CaptureParseResult:
        logger.info("[mock-llm] 跳过真实模型调用，text=%r", text[:80])
        items = [
            CaptureItem(
                type="task",
                title=(text or "").strip()[:200] or "未命名条目",
                start_datetime=None,
                end_datetime=None,
                note="MockLLMProvider 生成的占位条目",
            )
        ]
        return CaptureParseResult(
            payload=build_capture_payload(items),
            llm_ms=0,
            validation_ms=0,
            attempts=1,
            repaired=False,
            structured_output=False,
        )

    async def parse_capture(self, text: str, context: dict) -> CapturePayload:
        result = await self.parse_capture_detailed(text, context)
        return result.payload
