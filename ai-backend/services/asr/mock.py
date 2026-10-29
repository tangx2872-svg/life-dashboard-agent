"""Mock ASR Provider：不调用任何外部服务，直接返回固定/配置的文本。

用于开发阶段跑通 upload → ASR → LLM → Pydantic 全链路（ASR_PROVIDER=mock）。
"""

from __future__ import annotations

from core.logging import get_logger
from services.asr.base import ASRProvider

logger = get_logger(__name__)


class MockASRProvider(ASRProvider):
    name = "mock"

    def __init__(self, text: str = "明天下午三点开会") -> None:
        self._text = text

    async def transcribe(self, audio_path: str) -> str:
        logger.info("[mock-asr] 跳过真实识别，audio=%s", audio_path.split("/")[-1])
        return self._text
