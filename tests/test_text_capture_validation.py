"""校验 / 修复流程测试：cover 「一次修复」与「Structured Output 降级」。

全部使用伪造的 request 函数，不产生任何真实 API 调用。
"""

from __future__ import annotations

import asyncio
import json

import pytest

from core.errors import AppError, ErrorCode
from services.llm.support import parse_items_with_repair

VALID_ITEMS = json.dumps(
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

MISSING_ITEMS = json.dumps({"foo": "bar"}, ensure_ascii=False)


def _run(outputs, *, allow_structured=True, raise_items=None):
    """构造一个按顺序返回 outputs 的 request，并返回 (result_or_error, calls)。"""
    calls: list[tuple[str, bool]] = []

    async def request(prompt: str, structured: bool) -> str:
        calls.append((prompt, structured))
        idx = len(calls) - 1
        if raise_items and idx in raise_items:
            raise raise_items[idx]
        return outputs[idx]

    return calls, request


def _parse(outputs, **kwargs):
    calls, request = _run(outputs, **kwargs)
    try:
        result = asyncio.run(
            parse_items_with_repair(request, text="明天下午三点开会", context={}, **kwargs)
        )
        return result, calls, None
    except AppError as exc:
        return None, calls, exc


# --------------------------------------------------------------- 正常路径
def test_valid_first_attempt_no_repair():
    result, calls, err = _parse([VALID_ITEMS])
    assert err is None
    assert result.repaired is False
    assert result.attempts == 1
    assert result.structured_output is True
    assert len(calls) == 1
    assert calls[0][1] is True  # 第一次用结构化输出
    assert len(result.payload.items) == 1
    assert result.payload.items[0].title == "开会"
    assert result.payload.batchId.startswith("capture-")


def test_batch_id_is_backend_generated():
    result, _, _ = _parse([VALID_ITEMS])
    assert result.payload.batchId.startswith("capture-")
    # 模型即使返回 batchId 也不会被采用（模型输出里没有这个字段）
    assert result.payload.batchId != "b-123"


# --------------------------------------------------------------- 修复路径
def test_repairs_once_then_succeeds():
    result, calls, err = _parse([MISSING_ITEMS, VALID_ITEMS])
    assert err is None
    assert result.repaired is True
    assert result.attempts == 2
    assert len(calls) == 2
    repair_prompt = calls[1][0]
    assert "明天下午三点开会" in repair_prompt  # 原文
    assert "items" in repair_prompt  # schema
    assert "MISSING_ITEMS" not in repair_prompt


def test_second_failure_raises_invalid_capture_json():
    result, calls, err = _parse([MISSING_ITEMS, MISSING_ITEMS])
    assert result is None
    assert isinstance(err, AppError)
    assert err.code == ErrorCode.INVALID_CAPTURE_JSON.value
    assert err.status_code == 502
    assert "errors" in err.details
    assert len(calls) == 2  # 禁止无限重试


def test_malformed_json_triggers_repair():
    """普通模式下（未启用结构化），非法 JSON 走"一次修复"而不是重试。"""
    result, calls, err = _parse(["我不是 JSON", VALID_ITEMS], allow_structured=False)
    assert err is None
    assert result.repaired is True
    assert len(calls) == 2


def test_non_json_structured_reply_falls_back_not_repair():
    """启用结构化时，返回非 JSON 视为参数被忽略：降级重试，不算一次修复。"""
    result, calls, err = _parse(["我不是 JSON", VALID_ITEMS], allow_structured=True)
    assert err is None
    assert result.repaired is False
    assert result.structured_output is False
    assert len(calls) == 2
    assert calls[1][1] is False


def test_markdown_fenced_json_is_accepted():
    fenced = f"```json\n{VALID_ITEMS}\n```"
    result, calls, err = _parse([fenced])
    assert err is None
    assert len(calls) == 1
    assert result.repaired is False


def test_non_iso_datetime_is_rejected_then_repaired():
    bad = json.dumps(
        {
            "items": [
                {
                    "type": "task",
                    "title": "交房租",
                    "start_datetime": "下个月",
                    "end_datetime": None,
                    "note": None,
                }
            ]
        },
        ensure_ascii=False,
    )
    result, calls, err = _parse([bad, VALID_ITEMS])
    assert err is None
    assert result.repaired is True


def test_extra_field_in_item_is_rejected():
    bad = json.dumps(
        {
            "items": [
                {
                    "type": "task",
                    "title": "t",
                    "start_datetime": None,
                    "end_datetime": None,
                    "note": None,
                    "priority": "high",  # schema 之外
                }
            ]
        },
        ensure_ascii=False,
    )
    result, calls, err = _parse([bad, bad])
    assert isinstance(err, AppError)
    assert err.code == ErrorCode.INVALID_CAPTURE_JSON.value


# ------------------------------------------------------ Structured Output 降级
def test_falls_back_when_structured_unsupported():
    """上游返回 400（不支持 text.format）时，自动降级为普通 JSON 请求。"""
    unsupported = AppError(
        code=ErrorCode.LLM_FAILED,
        message="上游不支持",
        status_code=400,
        details={"status": 400},
    )
    calls, request = _run(
        [None, VALID_ITEMS], raise_items={0: unsupported}
    )
    result = asyncio.run(
        parse_items_with_repair(request, text="明天开会", context={}, allow_structured=True)
    )
    assert result.structured_output is False
    assert len(calls) == 2
    assert calls[0][1] is True   # 先试结构化
    assert calls[1][1] is False  # 再降级
    assert len(result.payload.items) == 1


def test_falls_back_when_structured_output_ignored():
    """上游接受参数但返回非 JSON（说明参数被忽略）时降级重试。"""
    calls, request = _run(["好的，这是你要的内容", VALID_ITEMS])
    result = asyncio.run(
        parse_items_with_repair(request, text="明天开会", context={}, allow_structured=True)
    )
    assert result.structured_output is False
    assert len(calls) == 2
    assert len(result.payload.items) == 1


def test_real_errors_are_not_swallowed_by_fallback():
    """401 / 429 / 超时不能当作"不支持结构化输出"被吞掉。"""
    cases = [
        (ErrorCode.PROVIDER_NOT_CONFIGURED, 502, 401),
        (ErrorCode.LLM_FAILED, 429, 429),
        (ErrorCode.LLM_FAILED, 504, 504),
    ]
    for code, status, detail_status in cases:
        exc = AppError(code=code, message="上游错误", status_code=status, details={"status": detail_status})
        calls, request = _run([None], raise_items={0: exc})
        with pytest.raises(AppError) as caught:
            asyncio.run(
                parse_items_with_repair(request, text="x", context={}, allow_structured=True)
            )
        assert caught.value.code == (code.value if hasattr(code, "value") else code)
        assert len(calls) == 1  # 没有发生降级重试


def test_structured_disabled_uses_plain_mode_directly():
    calls, request = _run([VALID_ITEMS])
    result = asyncio.run(
        parse_items_with_repair(request, text="x", context={}, allow_structured=False)
    )
    assert len(calls) == 1
    assert calls[0][1] is False
    assert result.structured_output is False
