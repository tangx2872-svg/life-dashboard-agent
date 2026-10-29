"""Life Dashboard Capture v2 的 Pydantic 模型 + 供 LLM 使用的严格 JSON Schema。

契约（本阶段确定）：
- 顶层：format / version / batchId / items；
- batchId 由**后端**生成，模型不参与（保证唯一性与稳定性）；
- 模型只负责产出 items，后端负责组装完整 CapturePayload。

!!! 重要 TODO（协议未定部分）!!!
    仓库没有完整的 Life Dashboard Capture v2 协议文档，因此遵守以下原则：
    1. 只实现"明确"的字段，不臆造业务语义；
    2. item.type 的取值集合待协议确认，当前推荐 task / event 两个值，
       但仍保留为字符串（避免把未确认的枚举硬编码成校验规则）；
    3. start_datetime / end_datetime 接受 ISO 8601 的"日期"或"日期时间"，
       无法确定时为 null；是否要求强制带时区偏移量，待协议确认；
    4. 拿到完整协议后需同步修改：CaptureItem 字段、ITEMS_JSON_SCHEMA、
       build_items_json_schema() 以及 prompts/life_dashboard_v2.txt。
"""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CAPTURE_FORMAT: str = "life-dashboard.capture"
CAPTURE_VERSION: int = 2

# TODO(protocol): 完整 kind 集合待协议确认；当前只推荐这两个，不做强制校验
RECOMMENDED_ITEM_TYPES: tuple[str, ...] = ("task", "event")

# ISO 8601：允许纯日期（2026-10-30）或日期时间（2026-10-30T15:00 / :00+08:00 / Z）
_ISO_DATETIME_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}"
    r"(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$"
)


def _validate_iso(value: str | None, field_name: str) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    if not _ISO_DATETIME_RE.match(text):
        raise ValueError(f"{field_name} 必须是 ISO 8601 日期或日期时间，实际为 {text!r}")
    return text


# ---------------------------------------------------------------------------
# Pydantic 模型（服务端严格校验用）
# ---------------------------------------------------------------------------


class CaptureItem(BaseModel):
    """单条 Capture 条目。

    TODO(protocol): 待完整 Capture v2 协议提供后收紧字段语义与 type 枚举。
    """

    model_config = ConfigDict(extra="forbid")

    # TODO(protocol): type 的完整取值集合待协议确认，当前推荐 task / event
    type: str = Field(
        ...,
        min_length=1,
        max_length=32,
        description="条目类型：task（可执行行动）、project（长期方向）、record（事实或结果）",
    )
    title: str = Field(..., min_length=1, max_length=200, description="条目标题")
    # ISO 8601（日期或日期时间）；无法确定时填 null
    start_datetime: str | None = Field(default=None, description="开始时间，ISO 8601")
    end_datetime: str | None = Field(default=None, description="结束时间，ISO 8601")
    note: str | None = Field(default=None, description="补充说明")

    @field_validator("start_datetime", "end_datetime")
    @classmethod
    def _check_iso(cls, value: str | None, info: Any) -> str | None:
        return _validate_iso(value, str(getattr(info, "field_name", "datetime")))


class CapturePayload(BaseModel):
    """Capture v2 顶层结构（batchId 由后端生成）。"""

    model_config = ConfigDict(extra="forbid")

    format: Literal["life-dashboard.capture"] = Field(
        default=CAPTURE_FORMAT, description="固定格式标识"
    )
    version: Literal[2] = Field(default=CAPTURE_VERSION, description="协议版本号")
    batchId: str = Field(..., min_length=1, max_length=128, description="本批次的唯一 ID")
    items: list[CaptureItem] = Field(default_factory=list, description="条目列表")


# ---------------------------------------------------------------------------
# 供 LLM（Structured Outputs / json_schema + strict）使用的严格 JSON Schema
# 只描述"模型负责的那部分"：{ items: [...] }
# 要求和 Pydantic 模型字段一一对应（tests/test_capture_schema.py 会校验这一点）
# ---------------------------------------------------------------------------

CAPTURE_ITEM_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["type", "title", "start_datetime", "end_datetime", "note"],
    "properties": {
        "type": {
            "type": "string",
            "description": "条目类型：'task'（可执行行动）、'project'（长期方向）、'record'（事实或结果）",
        },
        "title": {"type": "string", "description": "条目标题，保留用户原意，去掉口语填充词"},
        "start_datetime": {
            "type": ["string", "null"],
            "description": "开始时间，ISO 8601（如 2026-10-30T15:00:00+08:00），无法确定时为 null",
        },
        "end_datetime": {
            "type": ["string", "null"],
            "description": "结束时间，ISO 8601，仅当用户明确给出结束时间/时长时才填，否则 null",
        },
        "note": {"type": ["string", "null"], "description": "补充说明，可为空"},
    },
}


ITEMS_SCHEMA_NAME: str = "life_dashboard_capture_items"


def build_items_json_schema() -> dict[str, Any]:
    """返回 Structured Outputs（strict=True）可用的 JSON Schema：只有 items。

    strict 模式要求：
    - 每个对象 additionalProperties=false
    - properties 中所有字段都出现在 required 中
    - 可选字段用 ["<type>", "null"] 表达
    """
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["items"],
        "properties": {
            "items": {
                "type": "array",
                "description": "拆分后的条目列表；一句话包含多个事项时必须拆成多个 item",
                "items": CAPTURE_ITEM_JSON_SCHEMA,
            }
        },
    }
