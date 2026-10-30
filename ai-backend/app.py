"""Life Dashboard Agent 后端入口。

启动：
    uvicorn app:app --host 0.0.0.0 --port 6006

通过 .env 切换 Provider：
    ASR_PROVIDER=funasr | openai | mock
    LLM_PROVIDER=openai | local_qwen | mock
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.routes import router
from api.agent_routes import router as agent_router
from api.life_proposal_routes import router as life_router
from core.config import ensure_runtime_dirs, get_settings
from core.errors import AppError, ErrorCode
from core.logging import get_logger, setup_logging
from schemas.errors import ErrorDetail, ErrorResponse
from services.capture_service import CaptureService
from services.providers import build_asr_provider, build_llm_provider

logger = get_logger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    settings = get_settings()
    setup_logging(settings.log_level)
    ensure_runtime_dirs(settings)

    asr = build_asr_provider(settings)
    llm = build_llm_provider(settings)

    app.state.settings = settings
    app.state.capture_service = CaptureService(settings, asr, llm)
    # 本地 Qwen 的惰性单例（llm_provider != local_qwen 时按需加载）
    app.state.local_llm = None
    # AutoDL LLM 的惰性单例（llm_provider != autodl 时按需创建）
    app.state.autodl_llm = None

    # 预加载（FunASR 权重等）；失败只记录日志，不阻断启动
    try:
        await asr.warmup()
    except Exception:  # pragma: no cover
        logger.exception("ASR Provider 预热失败：%s", settings.asr_provider)

    logger.info(
        "服务已启动：env=%s asr=%s llm=%s upload_dir=%s model_dir=%s",
        settings.app_env,
        settings.asr_provider,
        settings.llm_provider,
        settings.upload_dir,
        settings.model_dir,
    )
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
        description="Life Dashboard 语音 Agent 后端：Audio → ASR → LLM → Validated Capture v2 JSON",
        lifespan=lifespan,
    )
    application.include_router(router)
    application.include_router(agent_router)
    application.include_router(life_router)
    _register_exception_handlers(application)
    return application


def _register_exception_handlers(application: FastAPI) -> None:
    @application.exception_handler(AppError)
    async def _handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        logger.warning("AppError %s: %s", exc.code, exc.message)
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                error=ErrorDetail(code=exc.code, message=exc.message, details=exc.details)
            ).model_dump(),
        )

    @application.exception_handler(RequestValidationError)
    async def _handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        details = {
            "errors": [
                {"loc": [str(x) for x in err.get("loc", [])], "msg": str(err.get("msg", ""))[:200]}
                for err in exc.errors()[:10]
            ]
        }
        logger.warning("请求参数校验失败：%s", details)
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(
                error=ErrorDetail(
                    code=ErrorCode.INVALID_REQUEST.value,
                    message="请求参数校验失败",
                    details=details,
                )
            ).model_dump(),
        )

    @application.exception_handler(StarletteHTTPException)
    async def _handle_http_exception(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                error=ErrorDetail(
                    code=ErrorCode.INVALID_REQUEST.value,
                    message=str(exc.detail)[:200] if exc.detail else "请求错误",
                )
            ).model_dump(),
        )

    @application.exception_handler(Exception)
    async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # traceback 只写服务器日志
        logger.exception("未处理异常")
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error=ErrorDetail(
                    code=ErrorCode.INTERNAL_ERROR.value, message="服务内部错误，请查看服务器日志"
                )
            ).model_dump(),
        )


app = create_app()


if __name__ == "__main__":
    import uvicorn

    s = get_settings()
    uvicorn.run("app:app", host=s.host, port=s.port, reload=s.debug)
