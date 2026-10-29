"""Prompt 模板加载（模板文件放在 prompts/ 目录）。"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from core.config import PROMPTS_DIR


@lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    path: Path = PROMPTS_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"prompt 文件不存在: {path.name}")
    return path.read_text(encoding="utf-8")


def render_prompt(name: str, **kwargs: object) -> str:
    """渲染模板中的 {placeholder}，缺失占位符保持原样，避免 KeyError。"""

    class _SafeDict(dict):  # type: ignore[type-arg]
        def __missing__(self, key: str) -> str:
            return "{" + key + "}"

    template = load_prompt(name)
    return template.format_map(_SafeDict(**kwargs))
