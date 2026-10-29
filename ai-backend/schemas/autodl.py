"""AutoDL LLM 开发调试接口的模型。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class LLMTimings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    llm_ms: int = Field(..., ge=0, description="上游 LLM 调用耗时")


class TextCaptureDebugRequest(BaseModel):
    """POST /api/text-capture/debug 的请求体。"""

    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., min_length=1, max_length=4000, description="输入文本")


class TextCaptureDebugResponse(BaseModel):
    """POST /api/text-capture/debug 的响应。"""

    model_config = ConfigDict(extra="forbid")

    status: str = "ok"
    provider: str = Field(..., description="Provider 名称，如 autodl")
    model: str = Field(..., description="实际调用的模型名")
    input: str = Field(..., description="原始输入文本")
    output: str = Field(..., description="模型返回的中文文本")
    timings: LLMTimings
