"""OpenAI 转录 Provider（备用 ASR）。

- 使用官方 SDK 当前的 `client.audio.transcriptions.create`；
- API Key 只从环境变量读取，不落源码 / 不进 Git；
- 没有 Key 时服务照常启动，调用时才返回 PROVIDER_NOT_CONFIGURED。
"""

from __future__ import annotations

from pathlib import Path

from core.config import Settings
from core.errors import AppError, ErrorCode
from core.logging import get_logger
from services.asr.base import ASRProvider

logger = get_logger(__name__)


class OpenAIASRProvider(ASRProvider):
    name = "openai"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = None

    def _get_client(self, api_key: str):
        if self._client is None:
            from openai import AsyncOpenAI

            kwargs: dict[str, object] = {
                "api_key": api_key,
                "timeout": self._settings.openai_timeout_s,
                "max_retries": self._settings.openai_max_retries,
            }
            if self._settings.openai_base_url:
                kwargs["base_url"] = self._settings.openai_base_url
            self._client = AsyncOpenAI(**kwargs)
        return self._client

    async def transcribe(self, audio_path: str) -> str:
        s = self._settings
        api_key = s.require_openai_api_key()
        if not s.openai_transcribe_model:
            raise AppError(
                code=ErrorCode.PROVIDER_NOT_CONFIGURED,
                message="未配置 OPENAI_TRANSCRIBE_MODEL",
                status_code=503,
            )

        client = self._get_client(api_key)
        path = Path(audio_path)
        try:
            with path.open("rb") as fh:
                response = await client.audio.transcriptions.create(
                    model=s.openai_transcribe_model,
                    file=fh,
                    language="zh",
                )
        except AppError:
            raise
        except Exception as exc:
            logger.exception("OpenAI 转写失败")
            raise AppError(
                code=ErrorCode.ASR_FAILED,
                message=f"OpenAI 语音转写失败（{type(exc).__name__}）",
                status_code=502,
            ) from exc

        text = getattr(response, "text", None)
        if not text and isinstance(response, str):
            text = response
        return (text or "").strip()
