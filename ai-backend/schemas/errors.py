"""统一错误响应结构。

返回给前端的内容只包含：错误码、可读信息、有限的 details。
不包含：API Key、Token、堆栈、服务器绝对路径。
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ErrorDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., description="机器可读错误码")
    message: str = Field(..., description="人类可读错误信息")
    details: dict[str, Any] = Field(default_factory=dict, description="可选补充信息")


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = "error"
    error: ErrorDetail
