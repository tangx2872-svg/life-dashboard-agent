from pathlib import Path
from unittest.mock import AsyncMock
from conftest import fake_wav_bytes


def test_transcribe_only_no_llm_and_removes_audio(client):
    service = client.app.state.capture_service
    before = set(service.settings.upload_dir.glob("*"))
    original = service.llm
    service.llm = None  # This route must never call the planner.
    try:
        response = client.post('/api/audio/transcribe', files={'file': ('recording.wav', fake_wav_bytes(), 'audio/wav')})
        assert response.status_code == 200
        assert response.json()['transcript']
        assert 'capture' not in response.json()
        assert set(service.settings.upload_dir.glob("*")) == before
    finally:
        service.llm = original


def test_transcribe_failure_also_removes_audio(client, monkeypatch):
    service = client.app.state.capture_service
    before = set(service.settings.upload_dir.glob("*"))
    monkeypatch.setattr(service.asr, 'transcribe', AsyncMock(side_effect=RuntimeError('failure')))
    response = client.post('/api/audio/transcribe', files={'file': ('recording.wav', fake_wav_bytes(), 'audio/wav')})
    assert response.status_code == 502
    assert set(service.settings.upload_dir.glob("*")) == before


def test_gemini_provider_sends_audio_and_not_text_only(tmp_path, monkeypatch):
    import asyncio
    import httpx
    from core.config import Settings
    from services.asr.gemini_asr import GeminiASRProvider
    audio = tmp_path / 'speech.wav'
    audio.write_bytes(fake_wav_bytes())
    async def post(self, url, **kwargs):
        assert url == 'https://mock.invalid/v1beta/models/gemini-test:generateContent'
        assert kwargs['headers']['x-goog-api-key'] == 'test-only'
        assert kwargs['json']['contents'][0]['parts'][0]['inlineData']['mimeType'] == 'audio/wav'
        return httpx.Response(200, json={'candidates':[{'content':{'parts':[{'text':'hidden reasoning','thought':True},{'text':'我想去杭州玩'}]}}]})
    monkeypatch.setattr(httpx.AsyncClient, 'post', post)
    provider = GeminiASRProvider(Settings(gemini_api_key='test-only', gemini_base_url='https://mock.invalid', gemini_model='gemini-test'))
    assert asyncio.run(provider.transcribe(str(audio))) == '我想去杭州玩'
