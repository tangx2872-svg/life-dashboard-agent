"""/api/text-capture 正式实现测试（mock provider，不调用真实 API）。"""

from __future__ import annotations

import re

from schemas.capture import CaptureItem, CapturePayload


def test_text_capture_returns_capture_v2(client):
    resp = client.post("/api/text-capture", json={"text": "明天下午三点开会，晚上修改论文"})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["status"] == "ok"
    assert body["input"] == "明天下午三点开会，晚上修改论文"

    capture = body["capture"]
    assert capture["format"] == "life-dashboard.capture"
    assert capture["version"] == 2
    assert re.match(r"^capture-\d{8}-text-[0-9a-f]{8}$", capture["batchId"])
    assert isinstance(capture["items"], list)
    assert capture["items"][0]["title"]

    timings = body["timings"]
    assert set(timings) == {"llm_ms", "validation_ms", "total_ms"}
    assert timings["total_ms"] >= 0
    assert timings["llm_ms"] >= 0
    assert timings["validation_ms"] >= 0


def test_text_capture_accepts_optional_context(client):
    resp = client.post(
        "/api/text-capture",
        json={
            "text": "明天下午三点开会",
            "timezone": "Asia/Shanghai",
            "current_datetime": "2026-10-29T16:20:00+08:00",
            "locale": "zh-CN",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["input"] == "明天下午三点开会"
    assert body["capture"]["batchId"].startswith("capture-")


def test_text_capture_omitted_datetime_uses_server_now(client):
    """不传 current_datetime 时后端自行生成（不报错）。"""
    resp = client.post("/api/text-capture", json={"text": "后天交作业"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["capture"]["version"] == 2


def test_text_capture_rejects_unknown_field(client):
    resp = client.post("/api/text-capture", json={"text": "明天开会", "unknown": 1})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_REQUEST"


def test_text_capture_empty_text(client):
    resp = client.post("/api/text-capture", json={"text": ""})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_REQUEST"


def test_text_capture_uses_provider_detailed_result(client):
    """Provider 提供 parse_capture_detailed 时，timings 来自 Provider 的分段耗时。"""

    class FakeLLM:
        name = "fake"

        async def parse_capture_detailed(self, text: str, context: dict):
            from services.llm.support import CaptureParseResult

            items = [
                CaptureItem(
                    type="event",
                    title="开会",
                    start_datetime="2026-10-30T15:00:00+08:00",
                    end_datetime=None,
                    note=None,
                )
            ]
            return CaptureParseResult(
                payload=CapturePayload(
                    format="life-dashboard.capture",
                    version=2,
                    batchId="capture-20261029-text-abcdef12",
                    items=items,
                ),
                llm_ms=1234,
                validation_ms=5,
                attempts=1,
                repaired=False,
                structured_output=True,
            )

    service = client.app.state.capture_service
    original = service.llm
    service.llm = FakeLLM()
    try:
        resp = client.post("/api/text-capture", json={"text": "明天下午三点开会"})
    finally:
        service.llm = original

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["timings"]["llm_ms"] == 1234
    assert body["timings"]["validation_ms"] == 5
    item = body["capture"]["items"][0]
    assert item["type"] == "event"
    assert item["start_datetime"] == "2026-10-30T15:00:00+08:00"


def test_text_capture_response_does_not_leak_internals(client):
    resp = client.post("/api/text-capture", json={"text": "明天开会"})
    text = resp.text
    for leaked in ("Traceback", "api_key", "AUTODL_LLM_API_KEY", "/root/"):
        assert leaked not in text
