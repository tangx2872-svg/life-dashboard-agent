"""健康检查 / 根路径测试。"""

from __future__ import annotations


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "Life Dashboard Agent"
    assert data["version"]
    assert data["providers"] == {"asr": "mock", "llm": "mock", "llm_model": "mock"}


def test_health_does_not_leak_secrets(client):
    body = client.get("/health").text.lower()
    for secret in ("api_key", "apikey", "token", "sk-", "password"):
        assert secret not in body


def test_root(client):
    resp = client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"]
    assert data["providers"]["asr"] == "mock"
    assert data["docs_url"] == "/docs"
