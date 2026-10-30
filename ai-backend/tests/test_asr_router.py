"""ASR pool: the same recording is retried on the next provider, no re-recording needed."""
import asyncio

import pytest

from core.errors import AppError
from services.asr.base import ASRProvider
from services.asr.router import ASRRouter


class FakeASR(ASRProvider):
    def __init__(self, name, result):
        self.name = name
        self.result = result
        self.paths = []
        self.warmed = 0

    async def warmup(self):
        self.warmed += 1

    async def transcribe(self, audio_path):
        self.paths.append(audio_path)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def test_primary_failure_uses_fallback_with_same_audio():
    primary = FakeASR("gemini", RuntimeError("429"))
    fallback = FakeASR("openai", "  明天下午三点开会  ")
    router = ASRRouter([("gemini", primary), ("openai", fallback)])
    text, meta = asyncio.run(router.transcribe_with_meta("/var/lib/life-ai/uploads/a.webm"))
    assert text == "明天下午三点开会"
    assert meta["provider"] == "openai" and meta["fallback"] is True
    assert primary.paths == fallback.paths == ["/var/lib/life-ai/uploads/a.webm"]


def test_empty_transcript_counts_as_failure():
    primary = FakeASR("gemini", "   ")
    fallback = FakeASR("openai", "好的")
    router = ASRRouter([("gemini", primary), ("openai", fallback)])
    text, meta = asyncio.run(router.transcribe_with_meta("a.webm"))
    assert text == "好的"
    assert meta["fallback"] is True


def test_all_providers_failing_raises_app_error():
    router = ASRRouter([("gemini", FakeASR("gemini", RuntimeError("timeout"))), ("openai", FakeASR("openai", RuntimeError("500")))])
    with pytest.raises(AppError):
        asyncio.run(router.transcribe("a.webm"))


def test_two_failures_cool_the_provider_down():
    primary = FakeASR("gemini", RuntimeError("500"))
    fallback = FakeASR("openai", "你好")
    router = ASRRouter([("gemini", primary), ("openai", fallback)])
    asyncio.run(router.transcribe("a.webm"))
    asyncio.run(router.transcribe("b.webm"))
    order = [name for name, _ in router.order()]
    assert order == ["openai", "gemini"], "a sick primary moves behind the fallback"
    assert router.status()["providers"][0]["health"]["cooldown_left_s"] > 0
