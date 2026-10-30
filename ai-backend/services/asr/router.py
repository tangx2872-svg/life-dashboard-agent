"""ASR provider pool: primary plus ordered fallbacks, all fed the same recording."""
from __future__ import annotations

import time

from core.logging import get_logger
from services.asr.base import ASRProvider
from services.health import ModelHealth

logger = get_logger(__name__)


class ASRRouter(ASRProvider):
    """Tries providers in health order; a failure never asks the user to record again."""

    def __init__(self, providers: list[tuple[str, ASRProvider]]) -> None:
        self.providers = providers
        self.health = {name: ModelHealth(window=20, failure_limit=2, cooldown_s=120) for name, _ in providers}
        self.name = providers[0][0] if providers else "none"
        self.last_meta: dict = {}

    def order(self) -> list[tuple[str, ASRProvider]]:
        healthy = [row for row in self.providers if self.health[row[0]].ok()]
        cooling = [row for row in self.providers if not self.health[row[0]].ok()]
        return healthy + cooling

    async def warmup(self) -> None:
        if not self.providers:
            return
        name, provider = self.providers[0]
        try:
            await provider.warmup()
        except Exception as error:  # noqa: BLE001 - warmup must never block startup
            logger.warning("ASR 预加载失败 %s: %s", name, error)

    async def transcribe(self, audio_path: str) -> str:
        text, meta = await self.transcribe_with_meta(audio_path)
        self.last_meta = meta
        return text

    async def transcribe_with_meta(self, audio_path: str) -> tuple[str, dict]:
        from core.errors import AppError, ErrorCode

        failures: list[str] = []
        for index, (name, provider) in enumerate(self.order()):
            started = time.perf_counter()
            try:
                transcript = (await provider.transcribe(audio_path)).strip()
                if not transcript:
                    raise ValueError("empty transcript")
            except Exception as error:  # noqa: BLE001 - fall back to the next provider
                reason = type(error).__name__
                self.health[name].failure(reason)
                failures.append(f"{name}:{reason}")
                logger.warning("ASR provider failed=%s reason=%s", name, reason)
                continue
            elapsed = round((time.perf_counter() - started) * 1000, 1)
            self.health[name].success(elapsed, elapsed)
            logger.info("ASR provider=%s fallback=%s asr_ms=%s", name, index > 0, elapsed)
            return transcript, {"provider": name, "fallback": index > 0, "asr_ms": elapsed}
        raise AppError(code=ErrorCode.ASR_FAILED, message="语音识别失败，请重试", status_code=502)

    def status(self) -> dict:
        return {
            "providers": [
                {"name": name, "role": "primary" if index == 0 else f"fallback_{index}", "health": self.health[name].snapshot()}
                for index, (name, _) in enumerate(self.providers)
            ]
        }
