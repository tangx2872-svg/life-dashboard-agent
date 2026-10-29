"""全局配置：全部来自环境变量 / .env，业务代码不直接依赖具体模型。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# 项目根目录
BASE_DIR: Path = Path(__file__).resolve().parent.parent
PROMPTS_DIR: Path = BASE_DIR / "prompts"

# 先加载 .env（已存在的环境变量优先级更高，不会被覆盖）
load_dotenv(BASE_DIR / ".env", override=False)


def _env_str(key: str, default: str = "") -> str:
    value = os.getenv(key)
    return value.strip() if value is not None and value.strip() else default


def _env_int(key: str, default: int) -> int:
    raw = os.getenv(key)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


def _env_float(key: str, default: float) -> float:
    raw = os.getenv(key)
    if raw is None or not raw.strip():
        return default
    try:
        return float(raw.strip())
    except ValueError:
        return default


def _env_bool(key: str, default: bool = False) -> bool:
    raw = os.getenv(key)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_path(key: str, default: Path) -> Path:
    raw = os.getenv(key)
    return Path(raw).expanduser() if raw and raw.strip() else default


# 可选的 Provider 名称（用于校验与 /health 展示，不含任何密钥）
ASR_PROVIDERS = ("funasr", "openai", "mock")
LLM_PROVIDERS = ("openai", "autodl", "local_qwen", "mock")


@dataclass(frozen=True)
class Settings:
    """运行期配置。测试里可通过环境变量 + get_settings.cache_clear() 重建。"""

    # ---- 应用 ----
    app_name: str = "Life Dashboard Agent"
    app_env: str = "development"
    app_version: str = "0.2.0"
    app_stage: str = "stage-2"
    host: str = "0.0.0.0"
    port: int = 6006
    debug: bool = False
    log_level: str = "INFO"

    # ---- Provider 选择 ----
    asr_provider: str = "funasr"
    llm_provider: str = "openai"

    # ---- OpenAI（ASR + LLM 共用密钥，只从环境变量读取）----
    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = ""
    openai_transcribe_model: str = ""
    openai_timeout_s: float = 120.0
    openai_max_retries: int = 2

    # ---- AutoDL OpenAI-compatible API（LLM）----
    # 注意：这是 AutoDL 的兼容接口，不是 OpenAI 官方地址。
    # Key 只从环境变量 / .env 读取，禁止写进源码、禁止写进 .env.example、禁止提交 Git。
    autodl_llm_api_key: str = ""
    autodl_llm_base_url: str = ""
    autodl_llm_model: str = ""
    autodl_llm_timeout_s: float = 120.0
    autodl_llm_max_retries: int = 2
    # auto=先尝试 json_schema，不支持自动降级；on=强制；off=禁用
    autodl_llm_structured: str = "auto"

    # ---- FunASR ----
    funasr_model: str = "paraformer-zh"
    funasr_model_revision: str = ""
    funasr_device: str = "cuda:0"
    funasr_vad_model: str = "fsmn-vad"
    funasr_punc_model: str = "ct-punc"
    funasr_language: str = "zh"

    # ---- 音频上传 ----
    upload_max_bytes: int = 20 * 1024 * 1024
    upload_dir: Path = field(default_factory=lambda: BASE_DIR / "uploads" / "audio")

    # ---- 模型 / 工具 ----
    model_dir: Path = field(default_factory=lambda: Path("/root/autodl-tmp/models"))
    ffmpeg_bin: str = "ffmpeg"

    # ---- 本地 Qwen（第一轮：只做文本生成）----
    local_llm_model: str = "Qwen/Qwen3-4B-Instruct-2507"
    # 留空则用 local_llm_model（走 HF / ModelScope 缓存），填绝对路径可离线加载
    local_llm_model_path: str = ""
    local_llm_device: str = "cuda:0"
    local_llm_dtype: str = "bfloat16"
    local_llm_max_new_tokens: int = 256

    # ---- 语义解析默认值 ----
    default_locale: str = "zh-CN"
    default_timezone: str = "Asia/Shanghai"
    max_text_chars: int = 4000

    # ---- Mock Provider（开发/测试用）----
    mock_asr_text: str = "明天下午三点开会"

    @classmethod
    def from_env(cls) -> "Settings":
        upload_mb = _env_int("UPLOAD_MAX_MB", 20)
        return cls(
            app_env=_env_str("APP_ENV", "development"),
            app_version=_env_str("APP_VERSION", "0.2.0"),
            app_stage=_env_str("APP_STAGE", "stage-2"),
            host=_env_str("HOST", "0.0.0.0"),
            port=_env_int("PORT", 6006),
            debug=_env_bool("DEBUG", False),
            log_level=_env_str("LOG_LEVEL", "INFO").upper(),
            asr_provider=_env_str("ASR_PROVIDER", "funasr").lower(),
            llm_provider=_env_str("LLM_PROVIDER", "openai").lower(),
            openai_api_key=_env_str("OPENAI_API_KEY", ""),
            openai_base_url=_env_str("OPENAI_BASE_URL", ""),
            openai_model=_env_str("OPENAI_MODEL", ""),
            openai_transcribe_model=_env_str("OPENAI_TRANSCRIBE_MODEL", ""),
            openai_timeout_s=_env_float("OPENAI_TIMEOUT_S", 120.0),
            openai_max_retries=_env_int("OPENAI_MAX_RETRIES", 2),
            autodl_llm_api_key=_env_str("AUTODL_LLM_API_KEY", ""),
            autodl_llm_base_url=_env_str("AUTODL_LLM_BASE_URL", ""),
            autodl_llm_model=_env_str("AUTODL_LLM_MODEL", ""),
            autodl_llm_timeout_s=_env_float("AUTODL_LLM_TIMEOUT_S", 120.0),
            autodl_llm_max_retries=_env_int("AUTODL_LLM_MAX_RETRIES", 2),
            autodl_llm_structured=_env_str("AUTODL_LLM_STRUCTURED", "auto").lower(),
            funasr_model=_env_str("FUNASR_MODEL", "paraformer-zh"),
            funasr_model_revision=_env_str("FUNASR_MODEL_REVISION", ""),
            funasr_device=_env_str("FUNASR_DEVICE", "cuda:0"),
            funasr_vad_model=_env_str("FUNASR_VAD_MODEL", "fsmn-vad"),
            funasr_punc_model=_env_str("FUNASR_PUNC_MODEL", "ct-punc"),
            funasr_language=_env_str("FUNASR_LANGUAGE", "zh"),
            upload_max_bytes=upload_mb * 1024 * 1024,
            upload_dir=_env_path("UPLOAD_DIR", BASE_DIR / "uploads" / "audio"),
            model_dir=_env_path("MODEL_DIR", Path("/root/autodl-tmp/models")),
            ffmpeg_bin=_env_str("FFMPEG_BIN", "ffmpeg"),
            local_llm_model=_env_str("LOCAL_LLM_MODEL", "Qwen/Qwen3-4B-Instruct-2507"),
            local_llm_model_path=_env_str("LOCAL_LLM_MODEL_PATH", ""),
            local_llm_device=_env_str("LOCAL_LLM_DEVICE", "cuda:0"),
            local_llm_dtype=_env_str("LOCAL_LLM_DTYPE", "bfloat16"),
            local_llm_max_new_tokens=_env_int("LOCAL_LLM_MAX_NEW_TOKENS", 256),
            default_locale=_env_str("DEFAULT_LOCALE", "zh-CN"),
            default_timezone=_env_str("DEFAULT_TIMEZONE", "Asia/Shanghai"),
            max_text_chars=_env_int("MAX_TEXT_CHARS", 4000),
            mock_asr_text=_env_str("MOCK_ASR_TEXT", "明天下午三点开会"),
        )

    def local_llm_model_id(self) -> str:
        """本地模型标识：优先本地快照路径。"""
        return self.local_llm_model_path or self.local_llm_model

    def require_openai_api_key(self) -> str:
        """真正调用 OpenAI Provider 时才校验 Key。

        没有 Key 时不抛异常到进程外（服务照常启动），只在调用点抛出可读错误。
        """
        if not self.openai_api_key:
            from core.errors import AppError, ErrorCode

            raise AppError(
                code=ErrorCode.PROVIDER_NOT_CONFIGURED,
                message="缺少 OPENAI_API_KEY，请在 .env 或环境变量中配置后再调用 OpenAI Provider",
                status_code=503,
            )
        return self.openai_api_key

    def require_autodl_llm_config(self) -> tuple[str, str, str]:
        """返回 (api_key, base_url, model)，缺配置时抛结构化错误。"""
        if not self.autodl_llm_api_key:
            from core.errors import AppError, ErrorCode

            raise AppError(
                code=ErrorCode.PROVIDER_NOT_CONFIGURED,
                message="缺少 AUTODL_LLM_API_KEY，请在 .env 或环境变量中配置后再调用 AutoDL Provider",
                status_code=503,
            )
        if not self.autodl_llm_base_url:
            from core.errors import AppError, ErrorCode

            raise AppError(
                code=ErrorCode.PROVIDER_NOT_CONFIGURED,
                message="缺少 AUTODL_LLM_BASE_URL，请在 .env 或环境变量中配置",
                status_code=503,
            )
        if not self.autodl_llm_model:
            from core.errors import AppError, ErrorCode

            raise AppError(
                code=ErrorCode.PROVIDER_NOT_CONFIGURED,
                message="缺少 AUTODL_LLM_MODEL，请在 .env 或环境变量中配置",
                status_code=503,
            )
        return self.autodl_llm_api_key, self.autodl_llm_base_url, self.autodl_llm_model


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()


def ensure_runtime_dirs(settings: Settings | None = None) -> None:
    """创建运行时目录（幂等）。"""
    s = settings or get_settings()
    s.upload_dir.mkdir(parents=True, exist_ok=True)
