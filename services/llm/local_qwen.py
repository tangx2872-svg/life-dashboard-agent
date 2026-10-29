"""本地 Qwen Provider（第一轮：只做「中文文本 → 本地模型回复」）。

设计要点：
1. 模型在 Provider 初始化（即服务启动）时加载一次，常驻显存，HTTP 请求不重复加载；
2. 本轮只提供 generate()，不接入 Life Dashboard Capture v2 解析；
3. 权重 / 缓存统一放在数据盘（见 core/config.py 的 MODEL_DIR、HF_HOME）。
"""

from __future__ import annotations

import time

import torch

from core.config import Settings, get_settings
from core.errors import AppError, ErrorCode
from core.logging import get_logger
from schemas.capture import CapturePayload
from services.llm.base import LLMProvider

logger = get_logger(__name__)

_DTYPE_MAP = {
    "bfloat16": torch.bfloat16,
    "float16": torch.float16,
    "float32": torch.float32,
}


class LocalQwenProvider(LLMProvider):
    name = "local_qwen"

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._tokenizer = None
        self._model = None
        self.load_seconds: float = 0.0
        # 初始化即加载，常驻显存（禁止每次请求重新加载）
        self._load_model()

    # ------------------------------------------------------------ 加载
    @staticmethod
    def _dtype_kwarg_name() -> str:
        """transformers 4.x 用 torch_dtype，5.x 用 dtype。"""
        import transformers

        major = int(transformers.__version__.split(".")[0])
        return "dtype" if major >= 5 else "torch_dtype"

    def _load_model(self) -> None:
        from transformers import AutoModelForCausalLM, AutoTokenizer

        s = self.settings
        model_id = s.local_llm_model_path or s.local_llm_model
        dtype = _DTYPE_MAP.get(s.local_llm_dtype.lower(), torch.bfloat16)

        logger.info("加载本地模型 %s（device=%s dtype=%s）", model_id, s.local_llm_device, s.local_llm_dtype)
        t0 = time.perf_counter()
        self._tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        self._model = AutoModelForCausalLM.from_pretrained(
            model_id,
            **{self._dtype_kwarg_name(): dtype},
            device_map=s.local_llm_device,
            low_cpu_mem_usage=True,
            trust_remote_code=True,
        )
        self._model.eval()
        self.load_seconds = time.perf_counter() - t0
        logger.info(
            "本地模型加载完成：%.2fs device=%s dtype=%s",
            self.load_seconds,
            self.device,
            self.dtype,
        )

    # ------------------------------------------------------------ 信息
    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def device(self) -> str:
        if self._model is None:
            return "not_loaded"
        return str(next(self._model.parameters()).device)

    @property
    def dtype(self) -> str:
        if self._model is None:
            return "not_loaded"
        return str(next(self._model.parameters()).dtype).replace("torch.", "")

    def gpu_memory_mb(self) -> dict[str, int]:
        if not torch.cuda.is_available():
            return {}
        return {
            "allocated_mb": int(torch.cuda.memory_allocated() / 1024**2),
            "reserved_mb": int(torch.cuda.memory_reserved() / 1024**2),
            "max_allocated_mb": int(torch.cuda.max_memory_allocated() / 1024**2),
        }

    # ------------------------------------------------------------ 生成
    def generate(self, prompt: str, max_new_tokens: int = 256) -> str:
        """同步生成（调用方请用 asyncio.to_thread 包裹，避免阻塞事件循环）。"""
        if self._model is None or self._tokenizer is None:
            raise AppError(
                code=ErrorCode.PROVIDER_NOT_CONFIGURED,
                message="本地模型尚未加载",
                status_code=503,
            )

        messages = [{"role": "user", "content": prompt}]
        text = self._tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = self._tokenizer([text], return_tensors="pt").to(self.settings.local_llm_device)
        with torch.no_grad():
            output_ids = self._model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=False,
                pad_token_id=self._tokenizer.pad_token_id or self._tokenizer.eos_token_id,
            )
        new_tokens = output_ids[0][inputs["input_ids"].shape[-1] :]
        return self._tokenizer.decode(new_tokens, skip_special_tokens=True).strip()

    # ------------------------------------------------------- Capture（未接入）
    async def parse_capture(self, text: str, context: dict) -> CapturePayload:
        raise AppError(
            code=ErrorCode.PROVIDER_NOT_CONFIGURED,
            message=(
                "LocalQwenProvider 本轮只提供 generate()（用于 /api/local-llm/test），"
                "尚未接入 Life Dashboard Capture v2 解析。"
            ),
            status_code=501,
        )

    async def warmup(self) -> None:
        return None  # 已在 __init__ 中加载
