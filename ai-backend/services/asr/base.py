"""ASR Provider 抽象接口。

业务代码只依赖 ASRProvider，不依赖任何具体模型实现。
通过 ASR_PROVIDER 环境变量在 funasr / openai / mock 之间切换。
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class ASRProvider(ABC):
    """语音转文本 Provider。"""

    #: Provider 名称，用于日志与 /health 展示
    name: str = "base"

    @abstractmethod
    async def transcribe(self, audio_path: str) -> str:
        """把音频文件转成文本。

        Args:
            audio_path: 服务端本地音频文件路径（不返回给前端）。

        Returns:
            转写得到的文本（可能为空字符串）。

        Raises:
            core.errors.AppError: 失败时抛 ASR_FAILED / PROVIDER_NOT_CONFIGURED。
        """
        raise NotImplementedError

    async def warmup(self) -> None:
        """可选：在服务启动时预加载模型（失败不应导致进程退出）。"""
        return None

    async def aclose(self) -> None:
        """可选：释放资源。"""
        return None
