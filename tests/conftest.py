"""测试公共 fixture。

- 全程使用 mock Provider，绝不产生真实 OpenAI / FunASR 调用与费用；
- 上传目录指向临时目录，不污染项目 uploads/。
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# 必须在 import app 之前设置，避免配置被缓存成真实 Provider
_TMP_UPLOAD_DIR = tempfile.mkdtemp(prefix="lda_test_uploads_")
os.environ["ASR_PROVIDER"] = "mock"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["APP_ENV"] = "test"
os.environ["OPENAI_API_KEY"] = ""  # 明确无 Key：验证服务仍可启动
os.environ["UPLOAD_DIR"] = _TMP_UPLOAD_DIR
os.environ["UPLOAD_MAX_MB"] = "1"  # 方便测试超大文件
os.environ["MODEL_DIR"] = tempfile.mkdtemp(prefix="lda_test_models_")

from fastapi.testclient import TestClient  # noqa: E402

from app import create_app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(create_app()) as c:
        yield c


def fake_wav_bytes(size: int = 1024) -> bytes:
    """伪造的音频字节：上传阶段不解码内容，只要满足扩展名/MIME/大小校验。"""
    header = b"RIFF____WAVEfmt " + b"\x00" * 16
    body = b"\x00" * max(0, size - len(header))
    return header + body
