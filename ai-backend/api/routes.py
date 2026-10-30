"""HTTP 路由层：只接收参数、调用 Service、返回 Response。"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, File, Form, Request, UploadFile

from core.config import Settings
from core.logging import get_logger
from core.prompts import render_prompt
from schemas.autodl import (
    LLMTimings,
    TextCaptureDebugRequest,
    TextCaptureDebugResponse,
)
from schemas.errors import ErrorResponse
from schemas.health import HealthResponse, ProviderInfo, RootResponse
from schemas.local_llm import (
    GenerationTimings,
    LocalLLMTestRequest,
    LocalLLMTestResponse,
)
from schemas.voice import (
    AudioUploadResponse,
    TextCaptureRequest,
    TextCaptureResponse,
    VoiceCaptureResponse,
)
from services.capture_service import CaptureService

logger = get_logger(__name__)

router = APIRouter()

# 统一的错误响应文档（不暴露堆栈 / 密钥）
_ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    400: {"model": ErrorResponse, "description": "请求参数错误"},
    413: {"model": ErrorResponse, "description": "音频过大"},
    415: {"model": ErrorResponse, "description": "音频格式或 MIME 不支持"},
    422: {"model": ErrorResponse, "description": "参数校验失败"},
    429: {"model": ErrorResponse, "description": "上游限流"},
    500: {"model": ErrorResponse, "description": "服务内部错误"},
    501: {"model": ErrorResponse, "description": "Provider 未实现"},
    502: {"model": ErrorResponse, "description": "上游服务（ASR / LLM）失败"},
    503: {"model": ErrorResponse, "description": "Provider 未配置"},
    504: {"model": ErrorResponse, "description": "上游超时"},
}


def _settings(request: Request) -> Settings:
    return request.app.state.settings


def _service(request: Request) -> CaptureService:
    return request.app.state.capture_service


def _local_llm(request: Request):
    """取本地 Qwen Provider：已加载的直接复用，否则首次调用时加载并常驻。"""
    from services.llm.local_qwen import LocalQwenProvider

    llm = request.app.state.capture_service.llm
    if isinstance(llm, LocalQwenProvider):
        return llm
    if getattr(request.app.state, "local_llm", None) is None:
        logger.info("首次调用本地模型，开始加载（之后常驻显存）")
        request.app.state.local_llm = LocalQwenProvider(request.app.state.settings)
    return request.app.state.local_llm


def _autodl_llm(request: Request):
    """取 AutoDL Provider：已配置的直接复用，否则首次调用时创建并复用（不每次新建 client）。"""
    from services.llm.autodl_llm import AutoDLLLMProvider

    llm = request.app.state.capture_service.llm
    if isinstance(llm, AutoDLLLMProvider):
        return llm
    if getattr(request.app.state, "autodl_llm", None) is None:
        request.app.state.autodl_llm = AutoDLLLMProvider(request.app.state.settings)
    return request.app.state.autodl_llm


def _llm_model_name(s: Settings) -> str:
    """当前生效的 LLM 模型名（只展示模型名，不涉及任何密钥）。"""
    if s.llm_provider == "autodl":
        return s.autodl_llm_model
    if s.llm_provider == "openai":
        return s.openai_model
    if s.llm_provider == "local_qwen":
        return s.local_llm_model_id()
    return "mock"


# --------------------------------------------------------------------- 系统
@router.get("/", response_model=RootResponse, summary="服务根路径")
def root(request: Request) -> RootResponse:
    s = _settings(request)
    return RootResponse(
        message=f"{s.app_name} is running",
        service=s.app_name,
        version=s.app_version,
        env=s.app_env,
        stage=s.app_stage,
        providers=ProviderInfo(asr=s.asr_provider, llm=s.llm_provider),
        docs_url=request.app.docs_url or "/docs",
    )


@router.get("/health", response_model=HealthResponse, summary="健康检查")
def health(request: Request) -> HealthResponse:
    s = _settings(request)
    return HealthResponse(
        status="ok",
        service=s.app_name,
        version=s.app_version,
        stage=s.app_stage,
        providers=ProviderInfo(
            asr=s.asr_provider, llm=s.llm_provider, llm_model=_llm_model_name(s)
        ),
    )


# ------------------------------------------------------------------ 音频上传
@router.post(
    "/api/audio/upload",
    response_model=AudioUploadResponse,
    responses=_ERROR_RESPONSES,
    summary="上传音频（webm / wav / mp3 / m4a）",
    tags=["audio"],
)
async def upload_audio(request: Request, file: UploadFile = File(...)) -> AudioUploadResponse:
    saved = await _service(request).save_audio(file)
    return AudioUploadResponse(
        status="ok",
        audio_id=saved.audio_id,
        filename=saved.filename,
        content_type=saved.content_type,
        size_bytes=saved.size_bytes,
    )


# ------------------------------------------------------------- 语音 → Capture
@router.post(
    "/api/voice-capture",
    response_model=VoiceCaptureResponse,
    responses=_ERROR_RESPONSES,
    summary="语音转 Capture v2（上传 → ASR → LLM → 校验）",
    tags=["capture"],
)
async def voice_capture(
    request: Request,
    file: UploadFile = File(...),
    locale: str | None = Form(default=None),
    timezone: str | None = Form(default=None),
    current_datetime: str | None = Form(default=None),
    client_id: str | None = Form(default=None),
) -> VoiceCaptureResponse:
    return await _service(request).capture_from_audio(
        file,
        locale=locale,
        timezone=timezone,
        current_datetime=current_datetime,
        client_id=client_id,
    )


# ------------------------------------------------------------- 文本 → Capture
@router.post(
    "/api/text-capture",
    response_model=TextCaptureResponse,
    responses=_ERROR_RESPONSES,
    summary="文本转 Capture v2（跳过 ASR，便于调试）",
    tags=["capture"],
)
async def text_capture(
    request: Request, body: TextCaptureRequest
) -> TextCaptureResponse:
    return await _service(request).capture_from_text(
        body.text,
        locale=body.locale,
        timezone=body.timezone,
        current_datetime=body.current_datetime,
        client_id=body.client_id,
    )


# --------------------------------------- AutoDL LLM 文本调试接口（仅第一轮）
@router.post(
    "/api/text-capture/debug",
    response_model=TextCaptureDebugResponse,
    responses=_ERROR_RESPONSES,
    summary="文本 → AutoDL gpt-5.6-luna 调试（不产出 Capture v2）",
    tags=["dev"],
)
async def text_capture_debug(
    request: Request, body: TextCaptureDebugRequest
) -> TextCaptureDebugResponse:
    """确认 FastAPI → AutoDL API → gpt-5.6-luna → 中文输出 整条链可用。"""
    provider = _autodl_llm(request)
    prompt = render_prompt("autodl_debug.txt", text=body.text)

    t0 = asyncio.get_running_loop().time()
    output = await provider.generate(prompt)
    llm_ms = int((asyncio.get_running_loop().time() - t0) * 1000)

    return TextCaptureDebugResponse(
        status="ok",
        provider=provider.name,
        model=provider.model,
        input=body.text,
        output=output,
        timings=LLMTimings(llm_ms=llm_ms),
    )


# ----------------------------------------------------- 本地 Qwen 开发测试接口
@router.post(
    "/api/local-llm/test",
    response_model=LocalLLMTestResponse,
    responses=_ERROR_RESPONSES,
    summary="本地 Qwen 生成测试（仅开发用）",
    tags=["dev"],
)
async def local_llm_test(
    request: Request, body: LocalLLMTestRequest
) -> LocalLLMTestResponse:
    """把文本交给本地 Qwen，返回模型自然语言回复（不涉及 Capture v2）。"""
    settings = _settings(request)
    provider = _local_llm(request)

    prompt = render_prompt("local_qwen_task.txt", text=body.text)
    max_new_tokens = body.max_new_tokens or settings.local_llm_max_new_tokens

    t0 = asyncio.get_running_loop().time()
    output = await asyncio.to_thread(provider.generate, prompt, max_new_tokens)
    generation_ms = int((asyncio.get_running_loop().time() - t0) * 1000)

    return LocalLLMTestResponse(
        status="ok",
        provider=provider.name,
        model=settings.local_llm_model_id(),
        device=getattr(provider, "device", ""),
        dtype=getattr(provider, "dtype", ""),
        input=body.text,
        output=output,
        timings=GenerationTimings(generation_ms=generation_ms),
    )


@router.post("/api/audio/transcribe", tags=["audio"])
async def transcribe_audio(request: Request, file: UploadFile = File(...)):
    """Transcribe only: no planning, capture generation or database writes."""
    import time
    from core.errors import AppError, ErrorCode
    settings = _settings(request)
    if settings.asr_provider == "mock" and settings.app_env != "test":
        raise AppError(code=ErrorCode.PROVIDER_NOT_CONFIGURED,
                       message="请配置真实语音转写服务，当前为 Mock", status_code=503)
    service = _service(request)
    started = time.perf_counter()
    saved = await service.save_audio(file)
    try:
        try:
            transcript = (await service.asr.transcribe(str(saved.path)) or "").strip()
            meta: dict = getattr(service.asr, "last_meta", {}) or {}
        except AppError:
            raise
        except Exception:
            raise AppError(code=ErrorCode.ASR_FAILED, message="语音识别失败，请重试", status_code=502) from None
        if not transcript:
            raise AppError(code=ErrorCode.ASR_FAILED, message="未识别到语音，请重新录音", status_code=502)
        if len(transcript) > settings.max_text_chars:
            raise AppError(code=ErrorCode.INVALID_REQUEST, message="录音文字超过上限，请分段录音", status_code=413)
        return {"status": "ok", "transcript": transcript, "provider": meta.get("provider"),
                "asr_fallback": bool(meta.get("fallback")),
                "timings": {"asr_ms": int((time.perf_counter()-started)*1000)}}
    finally:
        saved.path.unlink(missing_ok=True)
