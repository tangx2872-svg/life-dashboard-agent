"""独立测试程序：本地 Qwen 文本生成（不依赖 FastAPI、不依赖 ASR / OpenAI）。

用法：
    conda activate life-agent
    export HF_HOME=/root/autodl-tmp/models/huggingface
    export TRANSFORMERS_CACHE=/root/autodl-tmp/models/huggingface
    export MODELSCOPE_CACHE=/root/autodl-tmp/models/modelscope
    python tools/test_qwen_local.py
    python tools/test_qwen_local.py --max-new-tokens 512

输出：模型加载耗时、单次推理耗时、GPU 显存占用、device、dtype，以及模型回答。
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# 大模型缓存统一指向数据盘
os.environ.setdefault("HF_HOME", "/root/autodl-tmp/models/huggingface")
os.environ.setdefault("TRANSFORMERS_CACHE", "/root/autodl-tmp/models/huggingface")
os.environ.setdefault("MODELSCOPE_CACHE", "/root/autodl-tmp/models/modelscope")

import torch  # noqa: E402
from transformers import AutoModelForCausalLM, AutoTokenizer  # noqa: E402

DEFAULT_PROMPT = """你是一个任务解析助手。
请理解下面这句话，并简单说明用户希望做什么：

明天下午三点开会，晚上八点修改论文。"""

TEST_CASES = [
    "明天下午三点开会。",
    "晚上八点修改论文，然后背半小时六级单词。",
    "周五之前把机器学习作业交了。",
    "明天早上去健身，如果下雨就改成晚上。",
    "提醒我下个月交房租。",
]

TASK_PREFIX = "你是一个任务解析助手。\n请理解下面这句话，并简单说明用户希望做什么：\n\n"


def _dtype_kwarg_name() -> str:
    """transformers 4.x 用 torch_dtype，5.x 用 dtype。"""
    import transformers

    major = int(transformers.__version__.split(".")[0])
    return "dtype" if major >= 5 else "torch_dtype"


def _resolve_dtype(name: str) -> "torch.dtype":
    return {
        "bfloat16": torch.bfloat16,
        "float16": torch.float16,
        "float32": torch.float32,
    }.get(name.lower(), torch.bfloat16)


def _gb(n: float) -> str:
    return f"{n / 1024 ** 3:.2f} GB"


def _gpu_snapshot() -> str:
    if not torch.cuda.is_available():
        return "GPU 不可用"
    alloc = torch.cuda.memory_allocated()
    reserved = torch.cuda.memory_reserved()
    total = torch.cuda.get_device_properties(0).total_memory
    return (
        f"已分配={_gb(alloc)} 已预留={_gb(reserved)} 显存总量={_gb(total)} 剩余≈{_gb(total - reserved)}"
    )


def _nvidia_smi() -> str:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used,memory.total", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=20,
        )
        return out.stdout.strip()
    except Exception as exc:  # pragma: no cover
        return f"nvidia-smi 调用失败：{exc}"


def build_messages(prompt: str) -> list[dict[str, str]]:
    return [{"role": "user", "content": prompt}]


def main() -> int:
    parser = argparse.ArgumentParser(description="本地 Qwen 生成测试")
    parser.add_argument("--model", default=os.getenv("LOCAL_LLM_MODEL_PATH") or os.getenv("LOCAL_LLM_MODEL", "Qwen/Qwen3-4B-Instruct-2507"))
    parser.add_argument("--device", default=os.getenv("LOCAL_LLM_DEVICE", "cuda:0"))
    parser.add_argument("--dtype", default=os.getenv("LOCAL_LLM_DTYPE", "bfloat16"))
    parser.add_argument("--max-new-tokens", type=int, default=int(os.getenv("LOCAL_LLM_MAX_NEW_TOKENS", "256")))
    args = parser.parse_args()

    print("=" * 78)
    print(f"模型: {args.model}")
    print(f"device: {args.device} | dtype: {args.dtype} | max_new_tokens: {args.max_new_tokens}")
    print(f"torch: {torch.__version__} | cuda_available: {torch.cuda.is_available()}")
    print("=" * 78)

    # ---------------- 加载 ----------------
    t0 = time.perf_counter()
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    torch_dtype = _resolve_dtype(args.dtype)
    kwargs = {
        _dtype_kwarg_name(): torch_dtype,
        "device_map": args.device,
        "low_cpu_mem_usage": True,
        "trust_remote_code": True,
    }
    model = AutoModelForCausalLM.from_pretrained(args.model, **kwargs)
    model.eval()
    load_s = time.perf_counter() - t0

    device = next(model.parameters()).device
    dtype = next(model.parameters()).dtype
    print(f"\n[加载] 耗时 {load_s:.2f}s")
    print(f"[加载] device={device} dtype={dtype}")
    print(f"[显存] {_gpu_snapshot()}")
    print(f"[nvidia-smi] {_nvidia_smi()}")

    # ---------------- 默认 prompt ----------------
    print("\n" + "-" * 78)
    print("[默认测试]")
    print(f"输入:\n{DEFAULT_PROMPT}")
    t0 = time.perf_counter()
    out = _generate(model, tokenizer, DEFAULT_PROMPT, args.max_new_tokens, args.device)
    gen_s = time.perf_counter() - t0
    print(f"输出:\n{out}")
    print(f"[耗时] {gen_s:.2f}s")

    # ---------------- 5 条中文测试 ----------------
    results: list[dict[str, object]] = []
    print("\n" + "-" * 78)
    print("[5 条中文测试]")
    for idx, case in enumerate(TEST_CASES, start=1):
        prompt = TASK_PREFIX + case
        t0 = time.perf_counter()
        out = _generate(model, tokenizer, prompt, args.max_new_tokens, args.device)
        gen_s = time.perf_counter() - t0
        print(f"\n({idx}) 输入: {case}")
        print(f"    输出: {out}")
        print(f"    耗时: {gen_s:.2f}s | {_gpu_snapshot()}")
        results.append({"case": case, "output": out, "seconds": gen_s})

    # ---------------- 汇总 ----------------
    print("\n" + "=" * 78)
    print("[汇总]")
    print(f"模型加载耗时: {load_s:.2f}s")
    print(f"device={device} dtype={dtype}")
    print(f"加载后显存: {_gpu_snapshot()}")
    print(f"峰值显存(allocated): {_gb(torch.cuda.max_memory_allocated()) if torch.cuda.is_available() else 'N/A'}")
    print(f"峰值显存(reserved): {_gb(torch.cuda.max_memory_reserved()) if torch.cuda.is_available() else 'N/A'}")
    print(f"nvidia-smi: {_nvidia_smi()}")
    print("是否 OOM: 否（脚本未抛 CUDA OOM）")
    print("=" * 78)
    return 0


def _generate(model, tokenizer, prompt: str, max_new_tokens: int, device: str) -> str:
    messages = build_messages(prompt)
    text = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    inputs = tokenizer([text], return_tensors="pt").to(device)
    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
        )
    new_tokens = output_ids[0][inputs["input_ids"].shape[-1] :]
    return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


if __name__ == "__main__":
    raise SystemExit(main())
