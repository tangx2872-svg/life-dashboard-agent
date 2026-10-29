"""本地大模型测试接口的开发用模型。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class GenerationTimings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    generation_ms: int = Field(..., ge=0, description="单次生成耗时")


class LocalLLMTestRequest(BaseModel):
    """POST /api/local-llm/test 的请求体。"""

    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., min_length=1, max_length=4000, description="输入文本")
    max_new_tokens: int | None = Field(
        default=None, ge=1, le=2048, description="最大生成 token 数，缺省用配置值"
    )


class LocalLLMTestResponse(BaseModel):
    """POST /api/local-llm/test 的响应。"""

    model_config = ConfigDict(extra="forbid")

    status: str = "ok"
    provider: str = Field(..., description="Provider 名称")
    model: str = Field(..., description="实际模型标识 / 路径")
    device: str = Field("", description="模型运行 device")
    dtype: str = Field("", description="模型 dtype")
    input: str = Field(..., description="原始输入文本")
    output: str = Field(..., description="模型输出")
    timings: GenerationTimings
