"""Capture v2 解析的公共逻辑（所有 LLM Provider 共用）。

流程：
    prompt → LLM 调用（优先 Structured Outputs） → json.loads → Pydantic 校验
    → 失败则最多修复一次 → 仍失败抛 INVALID_CAPTURE_JSON

关键约定：
- batchId 由后端生成，模型只负责 items；
- 禁止无限重试，最多一次修复；
- 耗时分别统计 llm_ms（上游请求）与 validation_ms（JSON 解析 + Pydantic 校验）。
"""

from __future__ import annotations

import json
import re
import time
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Awaitable, Callable

from core.errors import AppError, ErrorCode
from core.logging import get_logger
from core.prompts import render_prompt
from schemas.capture import (
    CAPTURE_FORMAT,
    CAPTURE_VERSION,
    CaptureItem,
    CapturePayload,
    build_items_json_schema,
)

logger = get_logger(__name__)

PROMPT_FILE = "life_dashboard_v2.txt"
REPAIR_PROMPT_FILE = "life_dashboard_v2_repair.txt"

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

# request(prompt, structured) -> 模型返回的原始文本
RequestFn = Callable[[str, bool], Awaitable[str]]


@dataclass
class CaptureParseResult:
    """一次完整解析的结果（含分段耗时，供接口返回 timings）。"""

    payload: CapturePayload
    llm_ms: int
    validation_ms: int
    attempts: int
    repaired: bool
    structured_output: bool


class CaptureItemsError(Exception):
    """模型输出不是合法的 Capture items（携带可安全回传前端的精简错误）。"""

    def __init__(self, brief: list[dict[str, Any]]) -> None:
        self.brief = brief
        super().__init__(json.dumps(brief, ensure_ascii=False)[:300])


# --------------------------------------------------------------------------- 工具
def make_batch_id(source: str = "text") -> str:
    """后端生成 batchId：capture-YYYYMMDD-<source>-<short_uuid>。

    不交给模型生成，保证唯一性与格式稳定。
    """
    stamp = datetime.now().strftime("%Y%m%d")
    return f"capture-{stamp}-{source}-{uuid.uuid4().hex[:8]}"


def _clean_json_text(raw: str) -> str:
    """去掉可能存在的 markdown 代码块围栏。"""
    text = (raw or "").strip()
    if not text:
        return ""
    return _FENCE_RE.sub("", text).strip()


def _looks_like_json(raw: str) -> bool:
    text = _clean_json_text(raw)
    return text.startswith("{") or text.startswith("[")


def brief_pydantic_errors(exc: Exception, limit: int = 12) -> list[dict[str, Any]]:
    """Pydantic ValidationError → 可安全回传的精简结构。"""
    errors = getattr(exc, "errors", None)
    if not callable(errors):
        return [{"loc": [], "msg": str(exc)[:200], "type": "invalid"}]
    out: list[dict[str, Any]] = []
    for err in errors()[:limit]:
        out.append(
            {
                "loc": [str(x) for x in err.get("loc", [])],
                "msg": str(err.get("msg", ""))[:200],
                "type": str(err.get("type", ""))[:80],
            }
        )
    return out


# ------------------------------------------------------------------------- Prompt
def render_capture_prompt(text: str, context: dict) -> str:
    ctx = context or {}
    return render_prompt(
        PROMPT_FILE,
        current_datetime=ctx.get("current_datetime", ""),
        timezone=ctx.get("timezone", "Asia/Shanghai"),
        locale=ctx.get("locale", "zh-CN"),
        schema=json.dumps(build_items_json_schema(), ensure_ascii=False, indent=2),
        text=text,
    )


def render_repair_prompt(original_text: str, errors_json: str, previous_output: str) -> str:
    return render_prompt(
        REPAIR_PROMPT_FILE,
        original_text=original_text,
        errors=errors_json,
        previous_output=previous_output[:2000],
        schema=json.dumps(build_items_json_schema(), ensure_ascii=False, indent=2),
    )


# -------------------------------------------------------------------------- 校验
def parse_items_payload(raw: str) -> list[CaptureItem]:
    """把模型输出解析成 CaptureItem 列表，失败抛 CaptureItemsError。"""
    text = _clean_json_text(raw)
    if not text:
        raise CaptureItemsError([{"loc": [], "msg": "模型输出为空", "type": "empty_output"}])

    try:
        data: Any = json.loads(text)
    except json.JSONDecodeError as exc:
        raise CaptureItemsError(
            [{"loc": [], "msg": f"非法 JSON：{exc.msg}（位置 {exc.pos}）", "type": "json_decode"}]
        ) from exc

    # 允许模型直接返回数组，或返回 {"items": [...]} 包装
    if isinstance(data, dict):
        if "items" not in data:
            raise CaptureItemsError(
                [{"loc": [], "msg": "顶层对象缺少 items 字段", "type": "missing_field"}]
            )
        data = data.get("items")

    if not isinstance(data, list):
        raise CaptureItemsError(
            [{"loc": [], "msg": "items 必须是数组", "type": "type_error"}]
        )

    items: list[CaptureItem] = []
    for idx, raw_item in enumerate(data):
        try:
            items.append(CaptureItem.model_validate(raw_item))
        except Exception as exc:  # pydantic ValidationError
            brief = brief_pydantic_errors(exc)
            for one in brief:
                one["loc"] = ["items", str(idx), *one.get("loc", [])]
            raise CaptureItemsError(brief) from exc
    return items


def build_capture_payload(items: list[CaptureItem], source: str = "text") -> CapturePayload:
    """后端组装完整 CapturePayload（batchId 由后端生成）。"""
    return CapturePayload(
        format=CAPTURE_FORMAT,
        version=CAPTURE_VERSION,
        batchId=make_batch_id(source),
        items=items,
    )


def _maybe_unsupported(exc: AppError) -> bool:
    """上游返回 4xx/501 时，很可能是不支持 text.format（结构化输出）参数。"""
    status = exc.details.get("status")
    return isinstance(status, int) and status in (400, 404, 405, 415, 422, 501)


# ---------------------------------------------------------------------- 主流程
async def parse_items_with_repair(
    request: RequestFn,
    *,
    text: str,
    context: dict,
    allow_structured: bool = True,
    source: str = "text",
) -> CaptureParseResult:
    """调用 LLM 产出 items，校验失败最多修复一次。

    request(prompt, structured) 必须抛出 AppError（由 Provider 统一映射）。
    """
    prompt = render_capture_prompt(text, context)

    attempts = 0
    structured = False
    llm_ms = 0
    validation_ms = 0

    async def _call(prompt_text: str, use_structured: bool) -> str:
        nonlocal attempts, llm_ms
        attempts += 1
        t0 = time.perf_counter()
        try:
            return await request(prompt_text, use_structured)
        finally:
            llm_ms += int((time.perf_counter() - t0) * 1000)

    # ---- 第一次调用 ----
    raw: str | None = None
    if allow_structured:
        try:
            raw = await _call(prompt, True)
            structured = True
        except AppError as exc:
            if not _maybe_unsupported(exc):
                raise
            logger.warning("上游不支持结构化输出（HTTP %s），降级为普通 JSON 模式", exc.details.get("status"))
        if raw is not None and not _looks_like_json(raw):
            logger.warning("结构化输出参数被上游忽略（返回非 JSON 内容），降级为普通 JSON 模式")
            structured = False
            raw = None

    if raw is None:
        raw = await _call(prompt, False)
        structured = False

    # ---- 校验 ----
    t0 = time.perf_counter()
    try:
        items = parse_items_payload(raw)
    except CaptureItemsError as first_err:
        validation_ms += int((time.perf_counter() - t0) * 1000)
        logger.warning("Capture items 首次校验失败，尝试修复一次：%s", first_err.brief)

        repair_prompt = render_repair_prompt(
            text, json.dumps(first_err.brief, ensure_ascii=False), raw
        )
        raw2 = await _call(repair_prompt, structured and allow_structured)

        t1 = time.perf_counter()
        try:
            items = parse_items_payload(raw2)
        except CaptureItemsError as second_err:
            validation_ms += int((time.perf_counter() - t1) * 1000)
            logger.error("Capture items 二次校验仍失败：%s", second_err.brief)
            raise AppError(
                code=ErrorCode.INVALID_CAPTURE_JSON,
                message="模型输出未通过 Life Dashboard Capture v2 校验",
                status_code=502,
                details={"errors": second_err.brief, "attempts": attempts},
            ) from second_err
        validation_ms += int((time.perf_counter() - t1) * 1000)
        repaired = True
    else:
        validation_ms += int((time.perf_counter() - t0) * 1000)
        repaired = False

    return CaptureParseResult(
        payload=build_capture_payload(items, source=source),
        llm_ms=llm_ms,
        validation_ms=validation_ms,
        attempts=attempts,
        repaired=repaired,
        structured_output=structured,
    )
