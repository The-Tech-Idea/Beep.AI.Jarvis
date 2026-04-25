import json

import pytest

from app import create_app
from app.services import identity_client


class _FakeResponse:
    def __init__(self, payload=None, status_code=200):
        self._payload = payload or {}
        self.status_code = status_code
        self.ok = status_code < 400
        self.headers = {"Content-Type": "application/json"}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


@pytest.fixture
def jarvis_app(tmp_path):
    config = {
        "serverBaseUrl": "http://localhost:5000",
        "middlewareBaseUrl": "http://localhost:5000",
        "chatMode": "middleware",
        "chatEndpoint": "/v1/chat/completions",
        "openAiEndpoint": "/v1/chat/completions",
        "apiToken": "jarvis-token",
        "model": "jarvis-model",
        "appUserId": "jarvis-user-1",
        "appUserRole": "operator",
        "appUserEmail": "jarvis@example.com",
    }
    (tmp_path / "config.json").write_text(json.dumps(config), encoding="utf-8")
    app = create_app()
    app.config["TESTING"] = True
    app.config["JARVIS_HOME"] = str(tmp_path)
    return app


def test_chat_proxy_normalizes_openai_payload_and_uses_bearer_token(jarvis_app, monkeypatch):
    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        captured["timeout"] = timeout
        return _FakeResponse(payload={"choices": [{"message": {"content": "hello"}}]})

    monkeypatch.setattr("app.routes.api.requests.post", fake_post)

    client = jarvis_app.test_client()
    response = client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "Hello"}],
            "model_id": "jarvis-model",
        },
    )

    assert response.status_code == 200
    assert captured["url"] == "http://localhost:5000/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer jarvis-token"
    assert captured["json"]["model"] == "jarvis-model"
    assert "model_id" not in captured["json"]


def test_identity_client_chat_uses_openai_endpoint(jarvis_app, monkeypatch):
    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        captured["timeout"] = timeout
        return _FakeResponse(payload={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(identity_client.requests, "post", fake_post)

    result = identity_client.chat(
        jarvis_app,
        messages=[{"role": "user", "content": "Hello"}],
        model=None,
        model_id="jarvis-model",
    )

    assert result["choices"][0]["message"]["content"] == "ok"
    assert captured["url"] == "http://localhost:5000/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer jarvis-token"
    assert captured["json"]["model"] == "jarvis-model"
    assert "model_id" not in captured["json"]


def test_identity_client_rag_add_documents_uses_collection_documents_path(jarvis_app, monkeypatch):
    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        captured["timeout"] = timeout
        return _FakeResponse(payload={"success": True})

    monkeypatch.setattr(identity_client.requests, "post", fake_post)

    result = identity_client.rag_add_documents(
        jarvis_app,
        documents=[{"content": "Doc text", "source": "note.txt"}],
        collection_id="collection-1",
        user_id="42",
    )

    assert result["success"] is True
    assert captured["url"] == "http://localhost:5000/v1/rag/documents"
    assert captured["headers"]["Authorization"] == "Bearer jarvis-token"
    assert captured["json"]["collection_id"] == "collection-1"
    assert captured["json"]["metadata"]["app_user_id"] == "42"


def test_identity_client_rag_query_maps_collection_id_to_collection_ids(jarvis_app, monkeypatch):
    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        captured["timeout"] = timeout
        return _FakeResponse(payload={"success": True, "results": []})

    monkeypatch.setattr(identity_client.requests, "post", fake_post)

    result = identity_client.rag_query(
        jarvis_app,
        query="compressor failure",
        collection_id="collection-1",
        user_id="42",
        user_role="operator",
    )

    assert result["success"] is True
    assert captured["url"] == "http://localhost:5000/v1/rag/query"
    assert captured["headers"]["Authorization"] == "Bearer jarvis-token"
    assert captured["json"]["collection_id"] == "collection-1"
    assert captured["json"]["collection_ids"] == ["collection-1"]
    assert captured["json"]["app_id"] == "jarvis"


def test_tts_proxy_uses_current_endpoint_without_legacy_service_wrapper(jarvis_app, monkeypatch):
    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        captured["timeout"] = timeout
        return _FakeResponse(payload={"success": True, "audio": "ZmFrZQ==", "format": "mp3"})

    monkeypatch.setattr("app.routes.api.requests.post", fake_post)

    client = jarvis_app.test_client()
    response = client.post(
        "/api/tts",
        json={
            "text": "Hello",
            "voice": "default",
            "speed": 1.0,
            "engine": "edge-tts",
        },
    )

    assert response.status_code == 200
    assert captured["url"] == "http://localhost:5000/ai-middleware/api/services/text_to_speech/generate_speech"
    assert captured["headers"]["Authorization"] == "Bearer jarvis-token"
    assert captured["json"]["text"] == "Hello"
    assert "service" not in captured["json"]


def test_rag_query_proxy_adds_collection_ids_and_app_user_context(jarvis_app, monkeypatch):
    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        captured["timeout"] = timeout
        return _FakeResponse(payload={"success": True, "results": []})

    monkeypatch.setattr("app.routes.api.requests.post", fake_post)

    client = jarvis_app.test_client()
    response = client.post(
        "/api/rag/query",
        json={
            "query": "compressor failure",
            "collection_id": "collection-1",
            "max_results": 3,
        },
    )

    assert response.status_code == 200
    assert captured["url"] == "http://localhost:5000/v1/rag/query"
    assert captured["headers"]["Authorization"] == "Bearer jarvis-token"
    assert captured["json"]["collection_id"] == "collection-1"
    assert captured["json"]["collection_ids"] == ["collection-1"]
    assert captured["json"]["user_id"] == "jarvis-user-1"
    assert captured["json"]["user_role"] == "operator"
    assert captured["json"]["app_user_email"] == "jarvis@example.com"
    assert captured["json"]["app_id"] == "jarvis"
