"""统一错误码与异常类型。

约定：
- 业务层只抛 AppError；
- FastAPI 异常处理器把 AppError 转成结构化 JSON；
- 第三方异常（OpenAI SDK、FunASR 等）在 Provider 内收敛成 AppError，
  原始 traceback 只写服务器日志，不返回给前端。
"""

from __future__ import annotations

from enum import Enum
from typing import Any

# 可安全返回给前端的错误码白名单
SAFE_ERROR_CODES = frozenset(
    {
        "INVALID_AUDIO",
        "AUDIO_TOO_LARGE",
        "ASR_FAILED",
        "LLM_FAILED",
        "INVALID_CAPTURE_JSON",
        "PROVIDER_NOT_CONFIGURED",
        "INVALID_REQUEST",
        "INTERNAL_ERROR",
    }
)


class ErrorCode(str, Enum):
    INVALID_AUDIO = "INVALID_AUDIO"
    AUDIO_TOO_LARGE = "AUDIO_TOO_LARGE"
    ASR_FAILED = "ASR_FAILED"
    LLM_FAILED = "LLM_FAILED"
    INVALID_CAPTURE_JSON = "INVALID_CAPTURE_JSON"
    PROVIDER_NOT_CONFIGURED = "PROVIDER_NOT_CONFIGURED"
    INVALID_REQUEST = "INVALID_REQUEST"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class AppError(Exception):
    """结构化业务异常。"""

    def __init__(
        self,
        code: ErrorCode | str,
        message: str,
        *,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        code_str = code.value if isinstance(code, ErrorCode) else str(code)
        if code_str not in SAFE_ERROR_CODES:
            code_str = ErrorCode.INTERNAL_ERROR.value
        self.code = code_str
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(f"[{self.code}] {self.message}")

    def __repr__(self) -> str:  # pragma: no cover - 调试用
        return f"AppError(code={self.code!r}, status_code={self.status_code}, message={self.message!r})"
