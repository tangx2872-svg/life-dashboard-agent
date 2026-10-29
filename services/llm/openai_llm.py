"""OpenAI LLM Provider：自然语言 → Life Dashboard Capture v2 items。

约束：
- 使用官方 Responses API（`client.responses.create`），不使用旧的 Assistants API；
- 优先使用 Structured Outputs（json_schema + strict=True），上游不支持时降级为普通 JSON；
- Schema 与 schemas/capture.py 的 CaptureItem 一一对应；
- batchId 由后端生成，模型只负责 items；
- 校验失败最多修复一次，第二次仍失败返回 INVALID_CAPTURE_JSON；
- API Key 只从环境变量读取，任何情况下不写入日志 / 不返回前端。
"""

from __future__ import annotations

from core.config import Settings
from core.errors import AppError, ErrorCode
from core.logging import get_logger
from schemas.capture import ITEMS_SCHEMA_NAME, CapturePayload, build_items_json_schema
from services.llm.base import LLMProvider
from services.llm.support import CaptureParseResult, parse_items_with_repair

logger = get_logger(__name__)


class OpenAILLMProvider(LLMProvider):
    name = "openai"

    SCHEMA_NAME = ITEMS_SCHEMA_NAME

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = None
        self._structured_supported: bool | None = None

    # ------------------------------------------------------------- 客户端
    def _get_client(self, api_key: str):
        if self._client is None:
            from openai import AsyncOpenAI

            kwargs: dict[str, object] = {
                "api_key": api_key,
                "timeout": self._settings.openai_timeout_s,
                "max_retries": self._settings.openai_max_retries,
            }
            if self._settings.openai_base_url:
                kwargs["base_url"] = self._settings.openai_base_url
            self._client = AsyncOpenAI(**kwargs)
        return self._client

    # -------------------------------------------------------------- 调用
    async def _request(self, prompt: str, structured: bool) -> str:
        s = self._settings
        client = self._get_client(s.openai_api_key)

        kwargs: dict[str, object] = {"model": s.openai_model, "input": prompt}
        if structured:
            kwargs["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": self.SCHEMA_NAME,
                    "schema": build_items_json_schema(),
                    "strict": True,
                }
            }

        try:
            response = await client.responses.create(**kwargs)
        except Exception as exc:
            logger.exception("OpenAI Responses API 调用失败")
            raise AppError(
                code=ErrorCode.LLM_FAILED,
                message=f"语义解析服务调用失败（{type(exc).__name__}）",
                status_code=502,
            ) from exc

        raw = getattr(response, "output_text", "") or ""
        if not raw.strip():
            logger.error("OpenAI 返回空内容（model=%s）", s.openai_model)
            raise AppError(
                code=ErrorCode.LLM_FAILED,
                message="语义解析服务返回内容为空",
                status_code=502,
            )
        return raw

    # ---------------------------------------------------------- Capture v2
    def _structured_setting(self) -> bool:
        return self._structured_supported is not False

    async def parse_capture_detailed(self, text: str, context: dict) -> CaptureParseResult:
        s = self._settings
        s.require_openai_api_key()
        if not s.openai_model:
            raise AppError(
                code=ErrorCode.PROVIDER_NOT_CONFIGURED,
                message="未配置 OPENAI_MODEL",
                status_code=503,
            )

        result = await parse_items_with_repair(
            self._request,
            text=text,
            context=context,
            allow_structured=self._structured_setting(),
        )
        self._structured_supported = result.structured_output
        return result

    async def parse_capture(self, text: str, context: dict) -> CapturePayload:
        result = await self.parse_capture_detailed(text, context)
        return result.payload
