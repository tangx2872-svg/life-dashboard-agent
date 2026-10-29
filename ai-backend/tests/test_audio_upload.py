"""音频上传测试：正常 / 非法扩展名 / 超大文件 / 空文件。"""

from __future__ import annotations

import io

from conftest import fake_wav_bytes


def _upload(client, filename: str, content_type: str, data: bytes):
    return client.post(
        "/api/audio/upload",
        files={"file": (filename, io.BytesIO(data), content_type)},
    )


def test_upload_ok(client):
    data = fake_wav_bytes(2048)
    resp = _upload(client, "demo.wav", "audio/wav", data)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "ok"
    assert body["audio_id"]
    assert body["filename"].endswith(".wav")
    assert body["filename"] != "demo.wav"  # 必须 UUID 重命名
    assert body["content_type"] == "audio/wav"
    assert body["size_bytes"] == len(data)
    # 不泄露服务器绝对路径
    assert "/" not in body["filename"]
    assert "uploads" not in resp.text


def test_upload_webm_ok(client):
    resp = _upload(client, "rec.webm", "audio/webm;codecs=opus", fake_wav_bytes(512))
    assert resp.status_code == 200, resp.text
    assert resp.json()["filename"].endswith(".webm")
    assert resp.json()["content_type"] == "audio/webm"


def test_upload_invalid_extension(client):
    resp = _upload(client, "evil.exe", "application/octet-stream", b"MZ\x00\x00")
    assert resp.status_code == 415
    body = resp.json()
    assert body["status"] == "error"
    assert body["error"]["code"] == "INVALID_AUDIO"
    assert "Traceback" not in resp.text


def test_upload_mime_mismatch(client):
    resp = _upload(client, "a.wav", "audio/mpeg", fake_wav_bytes(128))
    assert resp.status_code == 415
    assert resp.json()["error"]["code"] == "INVALID_AUDIO"


def test_upload_too_large(client):
    big = fake_wav_bytes(2 * 1024 * 1024)  # UPLOAD_MAX_MB=1
    resp = _upload(client, "big.wav", "audio/wav", big)
    assert resp.status_code == 413
    assert resp.json()["error"]["code"] == "AUDIO_TOO_LARGE"


def test_upload_empty_file(client):
    resp = _upload(client, "empty.wav", "audio/wav", b"")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_AUDIO"


def test_upload_missing_file(client):
    resp = client.post("/api/audio/upload")
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_REQUEST"
