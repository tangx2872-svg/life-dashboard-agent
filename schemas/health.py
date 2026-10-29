"""HTTP 响应数据模型（健康检查 / 根路径）。"""

from pydantic import BaseModel, ConfigDict, Field


class ProviderInfo(BaseModel):
    """当前生效的 Provider 名称。

    只包含 Provider 名称，绝不包含 API Key / Token / 完整环境变量。
    """

    model_config = ConfigDict(extra="forbid")

    asr: str = Field(..., description="当前 ASR Provider")
    llm: str = Field(..., description="当前 LLM Provider")
    llm_model: str = Field("", description="当前 LLM 模型名（不涉及任何密钥）")


class RootResponse(BaseModel):
    """根路径 / 的响应。"""

    model_config = ConfigDict(extra="forbid")

    message: str = Field(..., description="服务运行提示")
    service: str = Field(..., description="服务名称")
    version: str = Field(..., description="服务版本")
    env: str = Field(..., description="运行环境")
    stage: str = Field(..., description="当前阶段")
    providers: ProviderInfo
    docs_url: str = Field(..., description="Swagger 文档地址")


class HealthResponse(BaseModel):
    """健康检查 /health 的响应。"""

    model_config = ConfigDict(extra="forbid")

    status: str = Field(..., description="服务状态，正常为 ok")
    service: str = Field(..., description="服务名称")
    version: str = Field(..., description="服务版本")
    stage: str = Field(..., description="当前阶段")
    providers: ProviderInfo
