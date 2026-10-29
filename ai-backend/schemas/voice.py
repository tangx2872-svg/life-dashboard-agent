"""语音 / 文本 Capture 接口的请求与响应模型。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from schemas.capture import CapturePayload


class Timings(BaseModel):
    """各阶段真实耗时（毫秒，整数）。upload_ms / asr_ms 在纯文本链路下为 0。"""

    model_config = ConfigDict(extra="forbid")

    upload_ms: int = Field(default=0, ge=0)
    asr_ms: int = Field(default=0, ge=0)
    llm_ms: int = Field(default=0, ge=0)
    total_ms: int = Field(default=0, ge=0)


class TextCaptureTimings(BaseModel):
    """文本链路耗时：纯文本没有 upload / asr，只统计 LLM 与校验。"""

    model_config = ConfigDict(extra="forbid")

    llm_ms: int = Field(default=0, ge=0)
    validation_ms: int = Field(default=0, ge=0)
    total_ms: int = Field(default=0, ge=0)


class AudioUploadResponse(BaseModel):
    """POST /api/audio/upload 的响应。

    注意：不返回服务器上的绝对路径（避免泄露服务器目录结构）。
    """

    model_config = ConfigDict(extra="forbid")

    status: str = "ok"
    audio_id: str = Field(..., description="本次上传的内部 ID（UUID）")
    filename: str = Field(..., description="服务端重命名后的文件名")
    content_type: str = Field(..., description="音频 MIME 类型")
    size_bytes: int = Field(..., ge=0, description="文件字节数")


class CaptureContext(BaseModel):
    """传给 LLM 的上下文（时间 / 时区 / 语言），可随前端扩展。"""

    model_config = ConfigDict(extra="forbid")

    locale: str = "zh-CN"
    timezone: str = "Asia/Shanghai"
    current_datetime: str = Field(default="", description="ISO 8601 本地时间")
    client_id: str = ""


class TextCaptureRequest(BaseModel):
    """POST /api/text-capture 的请求体。"""

    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., min_length=1, max_length=4000, description="待解析的自然语言文本")
    locale: str | None = Field(default=None, description="语言区域，默认 zh-CN")
    timezone: str | None = Field(default=None, description="IANA 时区，默认 Asia/Shanghai")
    current_datetime: str | None = Field(default=None, description="客户端当前时间，ISO 8601")
    client_id: str | None = Field(default=None, description="前端标识，预留")


class VoiceCaptureResponse(BaseModel):
    """POST /api/voice-capture 的响应。"""

    model_config = ConfigDict(extra="forbid")

    status: str = "ok"
    transcript: str = Field(..., description="ASR 原始转写文本")
    capture: CapturePayload
    timings: Timings


class TextCaptureResponse(BaseModel):
    """POST /api/text-capture 的响应。"""

    model_config = ConfigDict(extra="forbid")

    status: str = "ok"
    input: str = Field(..., description="回显输入文本")
    capture: CapturePayload
    timings: TextCaptureTimings
