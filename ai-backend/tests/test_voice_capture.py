"""/api/voice-capture 全链路测试（mock ASR + mock LLM）。"""

from __future__ import annotations

import io

from conftest import fake_wav_bytes
from core.errors import AppError, ErrorCode
from services.asr.base import ASRProvider
from services.llm.base import LLMProvider


def _capture(client, filename="demo.wav", content_type="audio/wav", data=None):
    return client.post(
        "/api/voice-capture",
        files={"file": (filename, io.BytesIO(data or fake_wav_bytes(1024)), content_type)},
    )


def test_voice_capture_pipeline(client):
    resp = _capture(client)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["status"] == "ok"
    assert body["transcript"] == "明天下午三点开会"  # MockASRProvider 默认文本

    capture = body["capture"]
    assert capture["format"] == "life-dashboard.capture"
    assert capture["version"] == 2
    assert capture["batchId"]
    assert capture["items"]

    timings = body["timings"]
    assert timings["upload_ms"] >= 0
    assert timings["asr_ms"] >= 0
    assert timings["llm_ms"] >= 0
    assert timings["total_ms"] >= timings["upload_ms"] + timings["asr_ms"] + timings["llm_ms"]


def test_voice_capture_invalid_extension(client):
    resp = _capture(client, filename="x.txt", content_type="text/plain", data=b"hello")
    assert resp.status_code == 415
    assert resp.json()["error"]["code"] == "INVALID_AUDIO"


def test_voice_capture_too_large(client):
    resp = _capture(client, data=fake_wav_bytes(2 * 1024 * 1024))
    assert resp.status_code == 413
    assert resp.json()["error"]["code"] == "AUDIO_TOO_LARGE"


def test_voice_capture_asr_failure_returns_structured_error(client):
    """ASR 抛异常时返回 ASR_FAILED，而不是 Python traceback。"""

    class BoomASR(ASRProvider):
        name = "boom"

        async def transcribe(self, audio_path: str) -> str:
            raise RuntimeError("secret stack trace should not leak")

    service = client.app.state.capture_service
    original = service.asr
    service.asr = BoomASR()
    try:
        resp = _capture(client)
    finally:
        service.asr = original

    assert resp.status_code == 502, resp.text
    body = resp.json()
    assert body["error"]["code"] == "ASR_FAILED"
    assert "secret stack trace" not in resp.text
    assert "Traceback" not in resp.text


def test_voice_capture_invalid_capture_json(client):
    """LLM 输出校验失败时返回 INVALID_CAPTURE_JSON。"""

    class BadLLM(LLMProvider):
        name = "bad"

        async def parse_capture(self, text: str, context: dict):
            raise AppError(
                code=ErrorCode.INVALID_CAPTURE_JSON,
                message="模型输出未通过 Life Dashboard Capture v2 校验",
                status_code=502,
            )

    service = client.app.state.capture_service
    original = service.llm
    service.llm = BadLLM()
    try:
        resp = _capture(client)
    finally:
        service.llm = original

    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "INVALID_CAPTURE_JSON"


def test_voice_capture_accepts_extra_form_fields(client):
    resp = client.post(
        "/api/voice-capture",
        data={"locale": "zh-CN", "timezone": "Asia/Shanghai", "client_id": "web"},
        files={"file": ("a.wav", io.BytesIO(fake_wav_bytes(256)), "audio/wav")},
    )
    assert resp.status_code == 200, resp.text
