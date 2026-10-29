"""Capture v2 Pydantic 模型 + Strict JSON Schema 一致性测试。"""

from __future__ import annotations

import json
import re

import pytest
from pydantic import ValidationError

from schemas.capture import (
    CAPTURE_FORMAT,
    CAPTURE_VERSION,
    CaptureItem,
    CapturePayload,
    build_items_json_schema,
)
from services.llm.support import make_batch_id, parse_items_payload


def test_valid_payload():
    payload = CapturePayload(
        format=CAPTURE_FORMAT,
        version=2,
        batchId="b-1",
        items=[CaptureItem(type="task", title="开会", note=None)],
    )
    assert payload.version == CAPTURE_VERSION
    assert payload.items[0].start_datetime is None


def test_wrong_format_rejected():
    with pytest.raises(ValidationError):
        CapturePayload(format="other.format", version=2, batchId="b", items=[])


def test_wrong_version_rejected():
    with pytest.raises(ValidationError):
        CapturePayload(format=CAPTURE_FORMAT, version=1, batchId="b", items=[])


def test_missing_batch_id_rejected():
    with pytest.raises(ValidationError):
        CapturePayload(format=CAPTURE_FORMAT, version=2, items=[])


def test_unknown_field_rejected():
    with pytest.raises(ValidationError):
        CapturePayload(
            format=CAPTURE_FORMAT, version=2, batchId="b", items=[], unknown_field=1
        )


def test_empty_items_allowed():
    payload = CapturePayload(format=CAPTURE_FORMAT, version=2, batchId="b", items=[])
    assert payload.items == []


# -------------------------------------------------------------- 严格 Schema
def test_strict_schema_matches_pydantic():
    """严格 JSON Schema 必须与 CaptureItem 一一对应（防止两边漂移）。"""
    schema = build_items_json_schema()
    assert schema["additionalProperties"] is False
    # 模型只负责 items，顶层不允许出现 batchId / format / version
    assert set(schema["required"]) == {"items"}
    assert set(schema["properties"].keys()) == {"items"}
    assert "batchId" not in schema["properties"]
    assert "format" not in schema["properties"]

    item_schema = schema["properties"]["items"]["items"]
    assert item_schema["additionalProperties"] is False
    assert set(item_schema["required"]) == set(CaptureItem.model_fields.keys())
    # strict 模式下每个 property 都必须出现在 required 中
    assert set(item_schema["properties"].keys()) == set(item_schema["required"])


def test_strict_schema_constants():
    assert CAPTURE_FORMAT == "life-dashboard.capture"
    assert CAPTURE_VERSION == 2
    item_schema = build_items_json_schema()["properties"]["items"]["items"]
    # 时间字段必须是 string|null（strict 模式下用 ["string","null"] 表达可选）
    assert item_schema["properties"]["start_datetime"]["type"] == ["string", "null"]
    assert item_schema["properties"]["end_datetime"]["type"] == ["string", "null"]


# ------------------------------------------------------------ batchId 规则
def test_batch_id_is_generated_by_backend():
    batch = make_batch_id("text")
    assert re.match(r"^capture-\d{8}-text-[0-9a-f]{8}$", batch)
    assert make_batch_id("text") != make_batch_id("text")  # 唯一性


# -------------------------------------------------------------- 时间校验
def test_iso_datetime_accepted():
    for value in (
        "2026-10-30T15:00:00+08:00",
        "2026-10-30T15:00",
        "2026-10-30",
        "2026-10-30T15:00:00Z",
    ):
        item = CaptureItem(type="task", title="x", start_datetime=value)
        assert item.start_datetime == value


def test_non_iso_datetime_rejected():
    for value in ("明天下午三点", "2026/10/30", "15:00", "tomorrow"):
        with pytest.raises(ValidationError):
            CaptureItem(type="task", title="x", start_datetime=value)


# ---------------------------------------------------------- 模型输出解析
def test_parse_items_payload_accepts_wrapper_and_bare_list():
    wrapper = json.dumps(
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
    assert len(parse_items_payload(wrapper)) == 1
    bare = json.dumps(
        [{"type": "task", "title": "t", "start_datetime": None, "end_datetime": None, "note": None}],
        ensure_ascii=False,
    )
    assert len(parse_items_payload(bare)) == 1


def test_parse_items_payload_strips_markdown_fence():
    raw = '```json\n{"items": []}\n```'
    assert parse_items_payload(raw) == []


def test_parse_items_payload_rejects_invalid_item():
    raw = json.dumps({"items": [{"type": "task", "title": "t", "start_datetime": "晚上八点"}]})
    from services.llm.support import CaptureItemsError

    with pytest.raises(CaptureItemsError) as exc:
        parse_items_payload(raw)
    assert exc.value.brief
    assert "ISO 8601" in json.dumps(exc.value.brief, ensure_ascii=False)
