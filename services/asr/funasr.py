"""FunASR（本地中文 ASR）Provider。

特点：
1. 模型只加载一次（服务启动 warmup + 首次请求兜底惰性加载），绝不每次请求重载；
2. 中文普通话优先（默认 paraformer-zh）；
3. 浏览器上传的 webm / m4a 先用 ffmpeg 统一转成 16k 单声道 wav，临时文件用完即删；
4. 模型缓存目录默认指向数据盘 /root/autodl-tmp/models，避免占满系统盘。
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from core.config import Settings
from core.errors import AppError, ErrorCode
from core.logging import get_logger
from services.asr.base import ASRProvider

logger = get_logger(__name__)

# 需要转成 wav 的采样率（FunASR Paraformer 系列为 16k）
TARGET_SAMPLE_RATE = 16000
_FFMPEG_TIMEOUT_S = 300


class FunASRProvider(ASRProvider):
    name = "funasr"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._model = None
        self._load_lock = asyncio.Lock()
        self._load_error: str | None = None

    # ------------------------------------------------------------ 生命周期
    async def warmup(self) -> None:
        """启动时预加载模型；失败只记录日志，不阻断服务启动。"""
        try:
            await self._get_model()
            logger.info("FunASR 模型已就绪：%s", self._settings.funasr_model)
        except Exception:
            logger.exception(
                "FunASR 模型预加载失败（%s），将在首次请求时重试", self._settings.funasr_model
            )

    async def _get_model(self):
        if self._model is None:
            async with self._load_lock:
                if self._model is None:
                    self._model = await asyncio.to_thread(self._build_model)
        return self._model

    def _build_model(self):
        s = self._settings
        try:
            s.model_dir.mkdir(parents=True, exist_ok=True)
            # 让 modelscope / funasr 把权重下到数据盘
            os.environ.setdefault("MODELSCOPE_CACHE", str(s.model_dir))
            os.environ.setdefault("FUNASR_CACHE", str(s.model_dir))

            from funasr import AutoModel

            kwargs: dict[str, object] = {
                "model": s.funasr_model,
                "device": s.funasr_device,
                "disable_update": True,
            }
            if s.funasr_model_revision:
                kwargs["model_revision"] = s.funasr_model_revision
            if s.funasr_vad_model:
                kwargs["vad_model"] = s.funasr_vad_model
                kwargs["vad_kwargs"] = {"max_single_segment_time": 30000}
            if s.funasr_punc_model:
                kwargs["punc_model"] = s.funasr_punc_model
            if s.funasr_language:
                kwargs["lang"] = s.funasr_language

            logger.info("加载 FunASR 模型：%s（device=%s）", s.funasr_model, s.funasr_device)
            return AutoModel(**kwargs)
        except ImportError as exc:
            raise AppError(
                code=ErrorCode.PROVIDER_NOT_CONFIGURED,
                message="未安装 funasr，请先 pip install funasr 或改用 ASR_PROVIDER=mock/openai",
                status_code=503,
            ) from exc
        except Exception as exc:
            logger.exception("FunASR 模型加载失败")
            raise AppError(
                code=ErrorCode.ASR_FAILED,
                message="FunASR 模型加载失败，请检查模型名称/磁盘空间/显存",
                status_code=503,
            ) from exc

    # -------------------------------------------------------------- 转写
    async def transcribe(self, audio_path: str) -> str:
        model = await self._get_model()

        wav_path: Path | None = None
        tmp_dir: str | None = None
        try:
            wav_path, tmp_dir = await asyncio.to_thread(self._to_wav16k, audio_path)
            result = await asyncio.to_thread(self._generate, model, wav_path)
            return self._extract_text(result)
        except AppError:
            raise
        except Exception as exc:
            logger.exception("FunASR 转写失败")
            raise AppError(
                code=ErrorCode.ASR_FAILED,
                message="语音识别失败，请稍后重试",
                status_code=502,
            ) from exc
        finally:
            if tmp_dir:
                shutil.rmtree(tmp_dir, ignore_errors=True)

    # -------------------------------------------------------------- 工具
    def _to_wav16k(self, audio_path: str) -> tuple[Path, str]:
        """统一转成 16k 单声道 wav，返回 (目标文件, 临时目录)。"""
        s = self._settings
        ffmpeg = shutil.which(s.ffmpeg_bin) or s.ffmpeg_bin
        src = Path(audio_path)
        if not src.exists():
            raise AppError(
                code=ErrorCode.INVALID_AUDIO, message="音频文件不存在", status_code=400
            )

        tmp_dir = tempfile.mkdtemp(prefix="lda_asr_")
        dst = Path(tmp_dir) / "audio_16k.wav"
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(src),
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-ac",
            "1",
            "-f",
            "wav",
            str(dst),
        ]
        proc = subprocess.run(cmd, capture_output=True, timeout=_FFMPEG_TIMEOUT_S)
        if proc.returncode != 0 or not dst.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)
            stderr = proc.stderr.decode(errors="ignore")[-500:]
            logger.error("ffmpeg 转码失败：%s", stderr)
            raise AppError(
                code=ErrorCode.INVALID_AUDIO,
                message="音频无法解码，请确认文件是否为有效音频",
                status_code=415,
            )
        return dst, tmp_dir

    def _generate(self, model, wav_path: Path):
        kwargs: dict[str, object] = {
            "input": str(wav_path),
            "batch_size_s": 300,
            "use_itn": True,
        }
        if self._settings.funasr_language:
            kwargs["language"] = self._settings.funasr_language
        return model.generate(**kwargs)

    @staticmethod
    def _extract_text(result: object) -> str:
        """从 FunASR 返回值中取出文本。"""
        if result is None:
            return ""
        if isinstance(result, str):
            return result.strip()
        if isinstance(result, dict):
            return str(result.get("text", "")).strip()
        if isinstance(result, list):
            parts: list[str] = []
            for item in result:
                if isinstance(item, dict):
                    text = item.get("text") or item.get("transcription") or ""
                    if text:
                        parts.append(str(text))
                elif isinstance(item, str):
                    parts.append(item)
            return "".join(parts).strip()
        return str(result).strip()
