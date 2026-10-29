"""OpenAI Provider 的 mock 测试。

完全本地运行：替换 openai.AsyncOpenAI，不发起任何真实网络请求、不产生费用。
覆盖：
- Structured Outputs 参数（json_schema + strict=True）是否正确下发；
- 首次失败 → 最多修复一次 → 成功；
- 二次仍失败 → INVALID_CAPTURE_JSON；
- SDK 异常 → LLM_FAILED；
- 转写 Provider 正常 / 缺 Key。
"""

from __future__ import annotations

import asyncio
import dataclasses
import json
from types import SimpleNamespace

import openai
import pytest

from core.config import Settings, get_settings
from core.errors import AppError, ErrorCode
from schemas.capture import build_items_json_schema
from services.asr.openai_asr import OpenAIASRProvider
from services.llm.openai_llm import OpenAILLMProvider
from services.llm.support import CaptureItemsError, parse_items_payload

# 模型只负责 items
VALID_JSON = json.dumps(
    {
        "items": [
            {
                "type": "task",
                "title": "开会",
                "start_datetime": "2026-10-30T15:00:00+08:00",
                "end_datetime": None,
                "note": None,
            }
        ]
    },
    ensure_ascii=False,
)

# 缺 items 字段 → items 校验失败
INVALID_JSON = json.dumps({"foo": "bar"})


def _settings(**overrides) -> Settings:
    base = get_settings()
    defaults = {
        "openai_api_key": "sk-test-key-not-real",
        "openai_model": "gpt-test",
        "openai_transcribe_model": "transcribe-test",
    }
    defaults.update(overrides)
    return dataclasses.replace(base, **defaults)


class FakeResponses:
    def __init__(self, outputs: list[str]) -> None:
        self.outputs = outputs
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        payload = self.outputs.pop(0) if self.outputs else VALID_JSON
        if isinstance(payload, Exception):
            raise payload
        return SimpleNamespace(output_text=payload)


class FakeAudio:
    def __init__(self, text: str = "明天下午三点开会") -> None:
        self.transcriptions = SimpleNamespace(
            create=self._create,
        )
        self.text = text
        self.calls: list[dict] = []

    async def _create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(text=self.text)


@pytest.fixture
def fake_openai(monkeypatch):
    holder: dict[str, object] = {}

    def _factory(*, responses_outputs=None, audio_text=None):
        responses = FakeResponses(responses_outputs or [VALID_JSON])
        audio = FakeAudio(audio_text or "明天下午三点开会")
        holder["responses"] = responses
        holder["audio"] = audio

        def _client(**kwargs):
            holder["client_kwargs"] = kwargs
            return SimpleNamespace(responses=responses, audio=audio)

        monkeypatch.setattr(openai, "AsyncOpenAI", _client)
        return holder

    return _factory


def test_llm_uses_structured_outputs(fake_openai):
    holder = fake_openai()
    provider = OpenAILLMProvider(_settings())

    payload = asyncio.run(provider.parse_capture("明天下午三点开会", {"locale": "zh-CN"}))

    # batchId 由后端生成，模型只负责 items
    assert payload.batchId.startswith("capture-")
    assert len(payload.items) == 1
    assert payload.items[0].title == "开会"

    call = holder["responses"].calls[0]
    fmt = call["text"]["format"]
    assert fmt["type"] == "json_schema"
    assert fmt["strict"] is True
    assert fmt["schema"] == build_items_json_schema()
    # 上下文信息必须进入输入
    assert call["model"] == "gpt-test"
    assert "Capture" in call["input"]


def test_llm_repairs_once(fake_openai):
    holder = fake_openai(responses_outputs=[INVALID_JSON, VALID_JSON])
    provider = OpenAILLMProvider(_settings())

    payload = asyncio.run(provider.parse_capture("明天开会", {}))
    assert len(payload.items) == 1
    assert len(holder["responses"].calls) == 2  # 只修复一次
    # 修复请求必须带上原文与 schema
    repair_input = holder["responses"].calls[1]["input"]
    assert "明天开会" in repair_input
    assert "items" in repair_input


def test_llm_fails_after_two_invalid(fake_openai):
    fake_openai(responses_outputs=[INVALID_JSON, INVALID_JSON])
    provider = OpenAILLMProvider(_settings())

    with pytest.raises(AppError) as exc:
        asyncio.run(provider.parse_capture("明天开会", {}))
    assert exc.value.code == ErrorCode.INVALID_CAPTURE_JSON.value
    assert exc.value.status_code == 502


def test_llm_sdk_error_maps_to_llm_failed(fake_openai):
    fake_openai(responses_outputs=[RuntimeError("boom")])
    provider = OpenAILLMProvider(_settings())

    with pytest.raises(AppError) as exc:
        asyncio.run(provider.parse_capture("x", {}))
    assert exc.value.code == ErrorCode.LLM_FAILED.value


def test_llm_without_key_is_provider_not_configured():
    provider = OpenAILLMProvider(_settings(openai_api_key=""))
    with pytest.raises(AppError) as exc:
        asyncio.run(provider.parse_capture("x", {}))
    assert exc.value.code == ErrorCode.PROVIDER_NOT_CONFIGURED.value


def test_llm_without_model_is_provider_not_configured():
    provider = OpenAILLMProvider(_settings(openai_model=""))
    with pytest.raises(AppError) as exc:
        asyncio.run(provider.parse_capture("x", {}))
    assert exc.value.code == ErrorCode.PROVIDER_NOT_CONFIGURED.value


def test_asr_transcribe_ok(fake_openai, tmp_path):
    holder = fake_openai(audio_text="明天下午三点开会")
    provider = OpenAIASRProvider(_settings())

    audio = tmp_path / "a.wav"
    audio.write_bytes(b"RIFF0000WAVE")
    text = asyncio.run(provider.transcribe(str(audio)))

    assert text == "明天下午三点开会"
    assert holder["audio"].calls[0]["model"] == "transcribe-test"


def test_asr_without_key_is_provider_not_configured(tmp_path):
    provider = OpenAIASRProvider(_settings(openai_api_key=""))
    audio = tmp_path / "a.wav"
    audio.write_bytes(b"x")
    with pytest.raises(AppError) as exc:
        asyncio.run(provider.transcribe(str(audio)))
    assert exc.value.code == ErrorCode.PROVIDER_NOT_CONFIGURED.value


def test_items_payload_rejects_missing_items():
    with pytest.raises(CaptureItemsError):
        parse_items_payload(INVALID_JSON)
