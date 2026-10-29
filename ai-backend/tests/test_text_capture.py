"""/api/text-capture 基础行为测试：Mock LLM 跑通「自然语言 → Capture v2」。"""

from __future__ import annotations

from core.config import get_settings
from services.llm.openai_llm import OpenAILLMProvider


def test_text_capture_with_mock_llm(client):
    resp = client.post("/api/text-capture", json={"text": "明天下午三点开会，晚上修改论文"})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["status"] == "ok"
    assert body["input"] == "明天下午三点开会，晚上修改论文"

    capture = body["capture"]
    assert capture["format"] == "life-dashboard.capture"
    assert capture["version"] == 2
    assert capture["batchId"].startswith("capture-")
    assert capture["items"][0]["title"]

    assert set(body["timings"]) == {"llm_ms", "validation_ms", "total_ms"}


def test_text_capture_empty_text(client):
    resp = client.post("/api/text-capture", json={"text": ""})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_REQUEST"


def test_text_capture_without_api_key_is_provider_not_configured(client):
    """无 OPENAI_API_KEY 时：服务仍然可用，调用 OpenAI Provider 才报清晰错误。"""
    service = client.app.state.capture_service
    original = service.llm
    service.llm = OpenAILLMProvider(get_settings())
    try:
        resp = client.post("/api/text-capture", json={"text": "明天开会"})
    finally:
        service.llm = original

    assert resp.status_code == 503, resp.text
    body = resp.json()
    assert body["status"] == "error"
    assert body["error"]["code"] == "PROVIDER_NOT_CONFIGURED"
    assert "OPENAI_API_KEY" in body["error"]["message"]
    assert "Traceback" not in resp.text
    assert "sk-" not in resp.text


def test_service_starts_without_api_key():
    """配置里没有 Key 时应用依然能构建（不崩溃）。"""
    settings = get_settings()
    assert settings.openai_api_key == ""
    from app import create_app

    assert create_app() is not None
