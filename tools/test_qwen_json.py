"""第二轮小实验：本地 Qwen 做简单 JSON 抽取（不做完整 Capture v2）。

用法：
    conda activate life-agent
    python tools/test_qwen_json.py
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("HF_HOME", "/root/autodl-tmp/models/huggingface")
os.environ.setdefault("TRANSFORMERS_CACHE", "/root/autodl-tmp/models/huggingface")
os.environ.setdefault("MODELSCOPE_CACHE", "/root/autodl-tmp/models/modelscope")

from test_qwen_local import _generate, _gpu_snapshot  # noqa: E402
from test_qwen_local import AutoModelForCausalLM, AutoTokenizer  # noqa: E402
from test_qwen_local import _dtype_kwarg_name, _resolve_dtype  # noqa: E402

JSON_PROMPT_TEMPLATE = """你是一个信息抽取助手。
请把下面这句话拆成任务列表，并且只输出 JSON，不要输出任何解释、注释或 markdown 代码块。

JSON 格式：
{{
  "tasks": [
    {{
      "title": "任务标题",
      "date_text": "日期描述原文",
      "time_text": "时间描述原文"
    }}
  ]
}}

句子：
{text}"""

TEST_TEXT = "明天下午三点开会，晚上八点修改论文。"


def main() -> int:
    parser = argparse.ArgumentParser(description="本地 Qwen JSON 抽取小实验")
    parser.add_argument("--model", default=os.getenv("LOCAL_LLM_MODEL_PATH") or os.getenv("LOCAL_LLM_MODEL", "Qwen/Qwen3-4B-Instruct-2507"))
    parser.add_argument("--device", default=os.getenv("LOCAL_LLM_DEVICE", "cuda:0"))
    parser.add_argument("--dtype", default=os.getenv("LOCAL_LLM_DTYPE", "bfloat16"))
    parser.add_argument("--max-new-tokens", type=int, default=512)
    parser.add_argument("--text", default=TEST_TEXT)
    args = parser.parse_args()

    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        **{_dtype_kwarg_name(): _resolve_dtype(args.dtype)},
        device_map=args.device,
        low_cpu_mem_usage=True,
        trust_remote_code=True,
    )
    model.eval()

    prompt = JSON_PROMPT_TEMPLATE.format(text=args.text)
    print("=" * 78)
    print(f"输入: {args.text}")
    print("=" * 78)

    for i in range(3):  # 跑 3 次观察稳定性
        t0 = time.perf_counter()
        raw = _generate(model, tokenizer, prompt, args.max_new_tokens, args.device)
        cost = time.perf_counter() - t0
        print(f"\n--- 第 {i + 1} 次（{cost:.2f}s）原始输出 ---\n{raw}")
        try:
            data = json.loads(raw)
            print(f"JSON 解析: 成功，tasks={len(data.get('tasks', []))}")
            print(json.dumps(data, ensure_ascii=False, indent=2))
        except Exception as exc:
            print(f"JSON 解析: 失败（{exc}）")
        print(f"显存: {_gpu_snapshot()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
