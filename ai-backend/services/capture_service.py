"""核心编排：audio → ASR → LLM → Pydantic 校验。

FastAPI 路由不承载业务逻辑，只负责接收参数、调用本服务、返回响应。
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone as dt_timezone

from fastapi import UploadFile

from core.config import Settings
from core.errors import AppError, ErrorCode
from core.logging import get_logger
from schemas.capture import CapturePayload
from schemas.voice import (
    CaptureContext,
    TextCaptureResponse,
    TextCaptureTimings,
    Timings,
    VoiceCaptureResponse,
)
from services.asr.base import ASRProvider
from services.audio_service import SavedAudio, save_upload
from services.llm.base import LLMProvider
from services.llm.support import CaptureParseResult

logger = get_logger(__name__)

_FALLBACK_TZ = dt_timezone(timedelta(hours=8))


def _resolve_tz(name: str):
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(name)
    except Exception:  # 系统缺少 tzdata 等情况
        logger.warning("时区 %s 不可用，回退到 UTC+8", name)
        return _FALLBACK_TZ


def _now_iso(tz_name: str) -> str:
    return datetime.now(_resolve_tz(tz_name)).isoformat()


class CaptureService:
    """语音 / 文本 → 校验后的 Capture v2。"""

    def __init__(self, settings: Settings, asr: ASRProvider, llm: LLMProvider) -> None:
        self.settings = settings
        self.asr = asr
        self.llm = llm

    # ------------------------------------------------------------------ 上传
    async def save_audio(self, file: UploadFile) -> SavedAudio:
        return await save_upload(file, self.settings)

    # ------------------------------------------------------- 上下文 & 校验
    def build_context(
        self,
        *,
        locale: str | None,
        timezone: str | None,
        current_datetime: str | None,
        client_id: str | None,
    ) -> CaptureContext:
        tz = timezone or self.settings.default_timezone
        local_datetime = current_datetime or _now_iso(tz)
        if current_datetime:
            try:
                parsed = datetime.fromisoformat(current_datetime.replace("Z", "+00:00"))
                if parsed.tzinfo is not None:
                    local_datetime = parsed.astimezone(_resolve_tz(tz)).isoformat()
            except ValueError:
                pass  # Existing validation/error behavior remains at the boundary.
        return CaptureContext(
            locale=locale or self.settings.default_locale,
            timezone=tz,
            current_datetime=local_datetime,
            client_id=client_id or "",
        )

    def _check_text(self, text: str) -> str:
        text = (text or "").strip()
        if not text:
            raise AppError(
                code=ErrorCode.INVALID_REQUEST,
                message="待解析文本为空",
                status_code=400,
            )
        if len(text) > self.settings.max_text_chars:
            raise AppError(
                code=ErrorCode.INVALID_REQUEST,
                message=f"文本过长，上限 {self.settings.max_text_chars} 字",
                status_code=400,
            )
        return text

    # ------------------------------------------------------------- 主流程
    async def capture_from_audio(
        self,
        file: UploadFile,
        *,
        locale: str | None = None,
        timezone: str | None = None,
        current_datetime: str | None = None,
        client_id: str | None = None,
    ) -> VoiceCaptureResponse:
        t_total = time.perf_counter()

        # 1) 上传落盘
        t0 = time.perf_counter()
        saved: SavedAudio = await self.save_audio(file)
        upload_ms = int((time.perf_counter() - t0) * 1000)

        # 2) ASR
        t0 = time.perf_counter()
        try:
            transcript = await self.asr.transcribe(str(saved.path))
        except AppError:
            raise
        except Exception as exc:  # 兜底：不允许 traceback 外泄
            logger.exception("ASR 调用失败 audio_id=%s", saved.audio_id)
            raise AppError(
                code=ErrorCode.ASR_FAILED,
                message="语音识别失败，请稍后重试",
                status_code=502,
            ) from exc
        asr_ms = int((time.perf_counter() - t0) * 1000)

        transcript = (transcript or "").strip()
        if not transcript:
            raise AppError(
                code=ErrorCode.ASR_FAILED,
                message="语音识别结果为空",
                status_code=502,
            )

        # 3) LLM → Capture
        context = self.build_context(
            locale=locale,
            timezone=timezone,
            current_datetime=current_datetime,
            client_id=client_id,
        )
        t0 = time.perf_counter()
        result = await self._llm_result(transcript, context)
        llm_ms = int((time.perf_counter() - t0) * 1000)

        total_ms = int((time.perf_counter() - t_total) * 1000)
        logger.info(
            "voice-capture 完成 audio_id=%s upload=%dms asr=%dms llm=%dms total=%dms",
            saved.audio_id,
            upload_ms,
            asr_ms,
            llm_ms,
            total_ms,
        )
        return VoiceCaptureResponse(
            status="ok",
            transcript=transcript,
            capture=result.payload,
            timings=Timings(
                upload_ms=upload_ms, asr_ms=asr_ms, llm_ms=llm_ms, total_ms=total_ms
            ),
        )

    async def capture_from_text(
        self,
        text: str,
        *,
        locale: str | None = None,
        timezone: str | None = None,
        current_datetime: str | None = None,
        client_id: str | None = None,
    ) -> TextCaptureResponse:
        t_total = time.perf_counter()
        clean = self._check_text(text)

        context = self.build_context(
            locale=locale,
            timezone=timezone,
            current_datetime=current_datetime,
            client_id=client_id,
        )
        result = await self._llm_result(clean, context)
        total_ms = int((time.perf_counter() - t_total) * 1000)

        logger.info(
            "text-capture 完成 input=%r items=%d attempts=%d repaired=%s "
            "llm=%dms validation=%dms total=%dms",
            clean[:60],
            len(result.payload.items),
            result.attempts,
            result.repaired,
            result.llm_ms,
            result.validation_ms,
            total_ms,
        )

        return TextCaptureResponse(
            status="ok",
            input=clean,
            capture=result.payload,
            timings=TextCaptureTimings(
                llm_ms=result.llm_ms,
                validation_ms=result.validation_ms,
                total_ms=total_ms,
            ),
        )

    # -------------------------------------------------------------- 内部
    async def _llm_result(self, text: str, context: CaptureContext) -> CaptureParseResult:
        """调用 LLM。Provider 若实现 parse_capture_detailed 则返回分段耗时。"""
        payload_ctx = context.model_dump()
        try:
            detailed = getattr(self.llm, "parse_capture_detailed", None)
            if callable(detailed):
                result: CaptureParseResult = await detailed(text, payload_ctx)
                return result

            t0 = time.perf_counter()
            payload = await self.llm.parse_capture(text, payload_ctx)
            llm_ms = int((time.perf_counter() - t0) * 1000)
            return CaptureParseResult(
                payload=payload,
                llm_ms=llm_ms,
                validation_ms=0,
                attempts=1,
                repaired=False,
                structured_output=False,
            )
        except AppError:
            raise
        except Exception as exc:
            logger.exception("LLM 解析失败")
            raise AppError(
                code=ErrorCode.LLM_FAILED,
                message="语义解析失败，请稍后重试",
                status_code=502,
            ) from exc
