"""AutoDL LLM Provider 的 mock 测试。

完全本地运行：替换 openai.AsyncOpenAI，不发真实请求、不产生费用。
覆盖：成功、401/403、429、超时、空响应、缺 Key / 缺 base_url / 缺 model。
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
from services.llm.autodl_llm import AutoDLLLMProvider


def _settings(**overrides) -> Settings:
    defaults = {
        "autodl_llm_api_key": "sk-autodl-test-not-real",
        "autodl_llm_base_url": "https://www.autodl.art/api/v1",
        "autodl_llm_model": "gpt-5.6-luna",
    }
    defaults.update(overrides)
    return dataclasses.replace(get_settings(), **defaults)


@pytest.fixture
def fake_client(monkeypatch):
    holder: dict[str, object] = {}
    holder["calls"] = []

    def _install(*, output=None, raise_exc=None):
        async def _create(**kwargs):
            holder["calls"].append(kwargs)
            if raise_exc is not None:
                raise raise_exc
            return SimpleNamespace(output_text=output or "AutoDL GPT API连接成功")

        def _factory(**kwargs):
            holder["client_kwargs"] = kwargs
            return SimpleNamespace(responses=SimpleNamespace(create=_create))

        monkeypatch.setattr(openai, "AsyncOpenAI", _factory)
        return holder

    return _install


def test_generate_success(fake_client):
    holder = fake_client(output="AutoDL GPT API连接成功")
    provider = AutoDLLLMProvider(_settings())

    text = asyncio.run(provider.generate("请只回复：AutoDL GPT API连接成功"))

    assert text == "AutoDL GPT API连接成功"
    call = holder["calls"][0]
    assert call["model"] == "gpt-5.6-luna"
    assert call["input"].startswith("请只回复")
    # 第一轮只用最基础参数，不传高级参数
    assert "instructions" not in call
    assert "text" not in call
    # base_url 必须指向 AutoDL，不是 OpenAI 官方
    assert holder["client_kwargs"]["base_url"] == "https://www.autodl.art/api/v1"


def test_generate_uses_output_fallback(fake_client, monkeypatch):
    """上游没有 output_text 字段时，从 output[] 中提取文本。"""

    def _factory(**kwargs):
        async def _create(**kw):
            message = SimpleNamespace(
                type="message",
                content=[SimpleNamespace(type="output_text", text="从 output 提取")],
            )
            return SimpleNamespace(output_text=None, output=[message])

        return SimpleNamespace(responses=SimpleNamespace(create=_create))

    monkeypatch.setattr(openai, "AsyncOpenAI", _factory)
    provider = AutoDLLLMProvider(_settings())
    assert asyncio.run(provider.generate("x")) == "从 output 提取"


def test_auth_error_maps_to_provider_not_configured(fake_client):
    fake_client(raise_exc=openai.AuthenticationError("401", response=_fake_response(401), body=None))
    provider = AutoDLLLMProvider(_settings())

    with pytest.raises(AppError) as exc:
        asyncio.run(provider.generate("x"))
    assert exc.value.code == ErrorCode.PROVIDER_NOT_CONFIGURED.value
    assert "401" in exc.value.message


def test_rate_limit_maps_to_429(fake_client):
    fake_client(raise_exc=openai.RateLimitError("429", response=_fake_response(429), body=None))
    provider = AutoDLLLMProvider(_settings())

    with pytest.raises(AppError) as exc:
        asyncio.run(provider.generate("x"))
    assert exc.value.code == ErrorCode.LLM_FAILED.value
    assert exc.value.status_code == 429


def test_timeout_maps_to_504(fake_client):
    fake_client(raise_exc=openai.APITimeoutError(request=_fake_request()))
    provider = AutoDLLLMProvider(_settings())

    with pytest.raises(AppError) as exc:
        asyncio.run(provider.generate("x"))
    assert exc.value.code == ErrorCode.LLM_FAILED.value
    assert exc.value.status_code == 504


def test_api_status_error_maps_http_code(fake_client):
    fake_client(raise_exc=openai.APIStatusError("500", response=_fake_response(500), body=None))
    provider = AutoDLLLMProvider(_settings())

    with pytest.raises(AppError) as exc:
        asyncio.run(provider.generate("x"))
    assert exc.value.code == ErrorCode.LLM_FAILED.value
    assert exc.value.status_code == 500


def test_empty_response_is_llm_failed(fake_client):
    fake_client(output="   ")
    provider = AutoDLLLMProvider(_settings())

    with pytest.raises(AppError) as exc:
        asyncio.run(provider.generate("x"))
    assert exc.value.code == ErrorCode.LLM_FAILED.value
    assert "空" in exc.value.message


def test_missing_key_is_provider_not_configured():
    provider = AutoDLLLMProvider(_settings(autodl_llm_api_key=""))
    with pytest.raises(AppError) as exc:
        asyncio.run(provider.generate("x"))
    assert exc.value.code == ErrorCode.PROVIDER_NOT_CONFIGURED.value
    assert exc.value.status_code == 503


def test_missing_base_url_is_provider_not_configured():
    provider = AutoDLLLMProvider(_settings(autodl_llm_base_url=""))
    with pytest.raises(AppError) as exc:
        asyncio.run(provider.generate("x"))
    assert exc.value.code == ErrorCode.PROVIDER_NOT_CONFIGURED.value


def test_missing_model_is_provider_not_configured():
    provider = AutoDLLLMProvider(_settings(autodl_llm_model=""))
    with pytest.raises(AppError) as exc:
        asyncio.run(provider.generate("x"))
    assert exc.value.code == ErrorCode.PROVIDER_NOT_CONFIGURED.value


def test_parse_capture_returns_backend_assembled_payload(fake_client):
    items_json = json.dumps(
        {
            "items": [
                {
                    "type": "event",
                    "title": "开会",
                    "start_datetime": "2026-10-30T15:00:00+08:00",
                    "end_datetime": None,
                    "note": None,
                }
            ]
        },
        ensure_ascii=False,
    )
    fake_client(output=items_json)
    provider = AutoDLLLMProvider(_settings())

    payload = asyncio.run(provider.parse_capture("明天下午三点开会", {"locale": "zh-CN"}))
    assert payload.batchId.startswith("capture-")
    assert payload.items[0].title == "开会"
    assert payload.format == "life-dashboard.capture"
    assert payload.version == 2


def test_missing_key_blocks_parse_capture():
    provider = AutoDLLLMProvider(_settings(autodl_llm_api_key=""))
    with pytest.raises(AppError) as exc:
        asyncio.run(provider.parse_capture("x", {}))
    assert exc.value.code == ErrorCode.PROVIDER_NOT_CONFIGURED.value
    assert exc.value.status_code == 503


def _fake_response(status_code: int):
    import httpx

    return httpx.Response(status_code=status_code, request=_fake_request())


def _fake_request():
    import httpx

    return httpx.Request("POST", "https://www.autodl.art/api/v1/responses")
