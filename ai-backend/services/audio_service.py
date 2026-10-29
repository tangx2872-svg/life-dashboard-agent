"""音频上传：校验 → 安全落盘。

安全约束：
1. 白名单扩展名 + 白名单 MIME；
2. 限制文件大小；
3. 使用 UUID 重命名，绝不使用用户上传的原始文件名作为服务器路径；
4. 不把服务器绝对路径返回给前端。
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from core.config import Settings
from core.errors import AppError, ErrorCode
from core.logging import get_logger

logger = get_logger(__name__)

# 允许的扩展名
ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".webm", ".wav", ".mp3", ".m4a"})

# 扩展名 → 允许的 MIME（部分浏览器会带 codecs 参数，比较前会先归一化）
ALLOWED_CONTENT_TYPES: dict[str, frozenset[str]] = {
    ".webm": frozenset({"audio/webm", "video/webm"}),
    ".wav": frozenset({"audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"}),
    ".mp3": frozenset({"audio/mpeg", "audio/mp3", "audio/mpeg3"}),
    ".m4a": frozenset({"audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac"}),
}

# 少数浏览器/前端库会上传 octet-stream，扩展名已通过白名单时容忍该类型
FALLBACK_CONTENT_TYPES: frozenset[str] = frozenset({"application/octet-stream"})

_READ_CHUNK = 64 * 1024


@dataclass(frozen=True)
class SavedAudio:
    """已落盘的音频（内部对象，包含服务器绝对路径，不直接返回前端）。"""

    audio_id: str
    filename: str
    content_type: str
    size_bytes: int
    path: Path


def _normalize_content_type(raw: str | None) -> str:
    """去掉 `audio/webm;codecs=opus` 之类的参数并转小写。"""
    if not raw:
        return ""
    return raw.split(";")[0].strip().lower()


def _ext_of(filename: str | None) -> str:
    if not filename:
        return ""
    return Path(filename).suffix.lower()


async def save_upload(file: UploadFile, settings: Settings) -> SavedAudio:
    """校验并保存上传的音频文件。

    Raises:
        AppError: INVALID_AUDIO / AUDIO_TOO_LARGE
    """
    original_name = file.filename or ""
    ext = _ext_of(original_name)

    if ext not in ALLOWED_EXTENSIONS:
        raise AppError(
            code=ErrorCode.INVALID_AUDIO,
            message=f"不支持的音频格式：{ext or '(无扩展名)'}，仅支持 "
            + "、".join(sorted(ALLOWED_EXTENSIONS)),
            status_code=415,
            details={"allowed_extensions": sorted(ALLOWED_EXTENSIONS)},
        )

    content_type = _normalize_content_type(file.content_type)
    if content_type not in ALLOWED_CONTENT_TYPES[ext] and content_type not in FALLBACK_CONTENT_TYPES:
        raise AppError(
            code=ErrorCode.INVALID_AUDIO,
            message=f"MIME 类型 {content_type or '(空)'} 与扩展名 {ext} 不匹配",
            status_code=415,
            details={
                "allowed_content_types": sorted(ALLOWED_CONTENT_TYPES[ext]),
                "extension": ext,
            },
        )

    max_bytes = settings.upload_max_bytes
    total = 0
    chunks: list[bytes] = []
    while True:
        chunk = await file.read(_READ_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise AppError(
                code=ErrorCode.AUDIO_TOO_LARGE,
                message=f"音频文件过大，上限 {max_bytes // (1024 * 1024)} MB",
                status_code=413,
                details={"max_bytes": max_bytes},
            )
        chunks.append(chunk)

    if total == 0:
        raise AppError(
            code=ErrorCode.INVALID_AUDIO,
            message="音频文件为空",
            status_code=400,
        )

    audio_id = uuid.uuid4().hex
    filename = f"{audio_id}{ext}"
    dest: Path = settings.upload_dir / filename
    dest.parent.mkdir(parents=True, exist_ok=True)

    with dest.open("wb") as fh:
        for chunk in chunks:
            fh.write(chunk)

    logger.info("保存音频 audio_id=%s size=%d bytes -> %s", audio_id, total, dest.name)

    return SavedAudio(
        audio_id=audio_id,
        filename=filename,
        content_type=content_type or next(iter(ALLOWED_CONTENT_TYPES[ext])),
        size_bytes=total,
        path=dest,
    )
