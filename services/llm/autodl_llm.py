"""AutoDL OpenAI-compatible LLM Provider。

注意：虽然用的是 OpenAI Python SDK，但请求实际发给 AutoDL 的兼容接口
（默认 https://www.autodl.art/api/v1/responses），不是 OpenAI 官方地址，
因此命名为 AutoDLLLMProvider，而不是 OpenAIProvider。

第一轮只使用最基础参数（model / input），不假设上游支持 Structured Output、
instructions、max_output_tokens 等高级参数。

错误处理：把 SDK 异常收敛成本项目 AppError，
完整 traceback 只写服务器日志，绝不返回前端，也绝不打印 API Key。
"""

from __future__ import annotations

from typing import Any

from core.config import Settings, get_settings
from core.errors import AppError, ErrorCode
from core.logging import get_logger
from schemas.capture import ITEMS_SCHEMA_NAME, CapturePayload, build_items_json_schema
from services.llm.base import LLMProvider
from services.llm.support import (
    CaptureParseResult,
    parse_items_with_repair,
)

logger = get_logger(__name__)


def _extract_text(response: Any) -> str:
    """兼容不同实现：优先 output_text，其次从 output[] 中拼 message 文本。"""
    text = getattr(response, "output_text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()

    chunks: list[str] = []
    for item in getattr(response, "output", None) or []:
        if getattr(item, "type", None) != "message":
            continue
        for part in getattr(item, "content", None) or []:
            part_text = getattr(part, "text", None)
            if isinstance(part_text, str) and part_text.strip():
                chunks.append(part_text.strip())
    return "\n".join(chunks).strip()


class AutoDLLLMProvider(LLMProvider):
    name = "autodl"

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._client = None
        # None=未知 / True=支持 json_schema / False=不支持（降级为普通 JSON）
        self._structured_supported: bool | None = None

    @property
    def structured_mode(self) -> str:
        return {True: "json_schema", False: "plain_json"}.get(
            self._structured_supported, "unknown"
        )

    # ------------------------------------------------------------- 客户端
    def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI

            api_key, base_url, _ = self.settings.require_autodl_llm_config()
            self._client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
                timeout=self.settings.autodl_llm_timeout_s,
                max_retries=self.settings.autodl_llm_max_retries,
            )
        return self._client

    @property
    def model(self) -> str:
        return self.settings.autodl_llm_model

    # -------------------------------------------------------------- 生成
    async def _request(
        self, prompt: str, structured: bool, max_output_tokens: int | None = None
    ) -> str:
        """底层调用。structured=True 时附带 json_schema 严格输出参数。"""
        _, _, model = self.settings.require_autodl_llm_config()
        client = self._get_client()

        kwargs: dict[str, Any] = {"model": model, "input": prompt}
        if max_output_tokens:
            kwargs["max_output_tokens"] = max_output_tokens
        if structured:
            kwargs["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": ITEMS_SCHEMA_NAME,
                    "schema": build_items_json_schema(),
                    "strict": True,
                }
            }

        try:
            response = await client.responses.create(**kwargs)
        except Exception as exc:  # 统一在下面映射
            self._raise_mapped_error(exc)
            raise  # pragma: no cover - _raise_mapped_error 必然抛错

        text = _extract_text(response)
        if not text:
            logger.error("AutoDL 上游返回空内容（model=%s）", model)
            raise AppError(
                code=ErrorCode.LLM_FAILED,
                message="AutoDL 上游返回内容为空",
                status_code=502,
            )
        return text

    async def generate(self, prompt: str, max_output_tokens: int | None = None) -> str:
        """最基础调用（调试用）：model + input，返回纯文本。"""
        return await self._request(prompt, structured=False, max_output_tokens=max_output_tokens)

    # --------------------------------------------------------- 错误映射
    def _raise_mapped_error(self, exc: Exception) -> None:
        """把 OpenAI SDK / 上游异常转成 AppError（不泄露 Key 与堆栈给前端）。"""
        # 日志只记录异常类型与精简信息，不记录请求头 / 不记录 Key
        logger.exception("AutoDL LLM 调用失败：%s", type(exc).__name__)

        try:
            from openai import (
                APIConnectionError,
                APIStatusError,
                APITimeoutError,
                AuthenticationError,
                PermissionDeniedError,
                RateLimitError,
            )
        except Exception:  # pragma: no cover - SDK 缺失时兜底
            raise AppError(
                code=ErrorCode.LLM_FAILED,
                message=f"AutoDL LLM 调用失败（{type(exc).__name__}）",
                status_code=502,
            ) from exc

        if isinstance(exc, (AuthenticationError, PermissionDeniedError)):
            raise AppError(
                code=ErrorCode.PROVIDER_NOT_CONFIGURED,
                message="AutoDL 上游鉴权失败（401 / 403），请检查 AUTODL_LLM_API_KEY 是否有效",
                status_code=502,
            ) from exc

        if isinstance(exc, RateLimitError):
            raise AppError(
                code=ErrorCode.LLM_FAILED,
                message="AutoDL 上游限流（429），请稍后重试",
                status_code=429,
            ) from exc

        if isinstance(exc, APITimeoutError):
            raise AppError(
                code=ErrorCode.LLM_FAILED,
                message=f"AutoDL 上游请求超时（>{self.settings.autodl_llm_timeout_s:.0f}s）",
                status_code=504,
            ) from exc

        if isinstance(exc, APIConnectionError):
            raise AppError(
                code=ErrorCode.LLM_FAILED,
                message="无法连接 AutoDL 上游服务（网络错误）",
                status_code=502,
            ) from exc

        if isinstance(exc, APIStatusError):
            status = getattr(exc, "status_code", None) or 502
            raise AppError(
                code=ErrorCode.LLM_FAILED,
                message=f"AutoDL 上游返回错误（HTTP {status}）",
                status_code=status if 400 <= status <= 599 else 502,
                # status 用于判定"是否支持结构化输出"，不属于敏感信息
                details={"status": status},
            ) from exc

        raise AppError(
            code=ErrorCode.LLM_FAILED,
            message=f"AutoDL LLM 调用失败（{type(exc).__name__}）",
            status_code=502,
        ) from exc

    # ---------------------------------------------------------- Capture v2
    def _structured_setting(self) -> bool:
        """本次是否尝试 Structured Outputs。auto 模式下以历史探测结果为准。"""
        mode = (self.settings.autodl_llm_structured or "auto").strip().lower()
        if mode == "on":
            return True
        if mode == "off":
            return False
        return self._structured_supported is not False

    async def parse_capture_detailed(
        self, text: str, context: dict
    ) -> CaptureParseResult:
        """自然语言 → items → 后端组装 CapturePayload（含分段耗时）。"""
        # 配置缺失在此处统一报 503，不进入解析流程
        self.settings.require_autodl_llm_config()

        result = await parse_items_with_repair(
            self._request,
            text=text,
            context=context,
            allow_structured=self._structured_setting(),
        )
        # 记住上游能力，避免每次请求都白试一次结构化输出
        self._structured_supported = result.structured_output
        logger.info(
            "capture 解析完成 attempts=%d repaired=%s structured=%s items=%d",
            result.attempts,
            result.repaired,
            result.structured_output,
            len(result.payload.items),
        )
        return result

    async def parse_capture(self, text: str, context: dict) -> CapturePayload:
        result = await self.parse_capture_detailed(text, context)
        return result.payload

    async def warmup(self) -> None:
        return None
