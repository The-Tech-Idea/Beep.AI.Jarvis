"""
API routes for Jarvis configuration and services.
"""
from flask import Blueprint, jsonify, request, current_app

import requests

from app.services.config_service import read_config, write_config
from app.services.identity_client import (
    enroll_identity, verify_identity, 
    check_health, check_token, get_connection_status
)
from app.services.voice_recognition import extract_voice_embedding
from app.services.face_recognition import extract_face_embedding

api_bp = Blueprint("jarvis_api", __name__)

DEFAULT_RAG_APP_ID = "jarvis"
DEFAULT_APP_USER_ID = "jarvis-local-user"


def _normalize_endpoint(path: str | None) -> str:
    value = (path or "").strip()
    if not value:
        return ""
    return value if value.startswith("/") else f"/{value}"


def _resolve_base_url(config: dict, endpoint: str | None = None, *, prefer_middleware: bool = False) -> str:
    endpoint = _normalize_endpoint(endpoint)
    server_base = (config.get("serverBaseUrl") or "").rstrip("/")
    middleware_base = (config.get("middlewareBaseUrl") or "").rstrip("/")

    if endpoint.startswith("/v1/"):
        base = server_base or middleware_base
        return base[:-len("/ai-middleware")] if base.endswith("/ai-middleware") else base
    if endpoint.startswith("/ai-middleware/"):
        return middleware_base or server_base
    if prefer_middleware:
        return middleware_base or server_base
    return server_base or middleware_base


def _build_headers(config: dict, *, json_body: bool = False, include_user_context: bool = False) -> dict:
    headers = {}
    if json_body:
        headers["Content-Type"] = "application/json"

    token = (config.get("apiToken") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if include_user_context:
        user_context = _get_app_user_context(config)
        if user_context["user_id"]:
            headers["X-User-ID"] = user_context["user_id"]
        if user_context["user_role"]:
            headers["X-User-Role"] = user_context["user_role"]
        if user_context["app_user_email"]:
            headers["X-User-Email"] = user_context["app_user_email"]

    return headers


def _get_app_user_context(config: dict, payload: dict | None = None, *, default_user_id: str | None = None) -> dict:
    payload = payload if isinstance(payload, dict) else {}
    config_user_id = (config.get("appUserId") or "").strip()
    request_user_id = (
        request.headers.get("X-User-ID")
        or request.args.get("user_id")
        or payload.get("user_id")
        or config_user_id
    )
    user_id = str(request_user_id).strip() if request_user_id else ""
    if not user_id and default_user_id:
        user_id = default_user_id

    user_role = (
        request.headers.get("X-User-Role")
        or request.args.get("user_role")
        or payload.get("user_role")
        or config.get("appUserRole")
        or "user"
    )
    app_user_email = (
        request.headers.get("X-User-Email")
        or request.args.get("app_user_email")
        or payload.get("app_user_email")
        or payload.get("email")
        or config.get("appUserEmail")
        or ""
    )

    return {
        "user_id": user_id,
        "user_role": str(user_role).strip() if user_role else "user",
        "app_user_email": str(app_user_email).strip() if app_user_email else "",
    }


def _merge_rag_context(config: dict, payload: dict | None = None, *, require_user: bool = False) -> dict:
    merged = dict(payload or {})
    user_context = _get_app_user_context(
        config,
        merged,
        default_user_id=DEFAULT_APP_USER_ID if require_user else None,
    )
    metadata = dict(merged.get("metadata") or {})
    if user_context["user_id"]:
        metadata.setdefault("app_user_id", user_context["user_id"])
        metadata.setdefault("user_id", user_context["user_id"])
    if user_context["user_role"]:
        metadata.setdefault("user_role", user_context["user_role"])
    if user_context["app_user_email"]:
        metadata.setdefault("app_user_email", user_context["app_user_email"])
    if metadata:
        merged["metadata"] = metadata
    for key in ("user_id", "app_user_id", "user_role", "app_user_email", "user_tier"):
        merged.pop(key, None)
    merged.setdefault("app_id", DEFAULT_RAG_APP_ID)
    return merged


def _rag_document_create_payload(document: dict, collection_id: str, payload: dict) -> dict:
    metadata = dict(document.get("metadata") or {})
    request_metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    for key in ("app_user_id", "user_id", "user_role", "app_user_email"):
        if request_metadata.get(key):
            metadata.setdefault(key, request_metadata[key])

    doc_payload = {
        "collection_id": collection_id,
        "title": document.get("title") or document.get("source") or document.get("id") or document.get("document_id"),
        "content": document.get("content"),
        "metadata": metadata,
    }
    document_id = document.get("id") or document.get("document_id")
    if document_id:
        doc_payload["id"] = document_id
    return doc_payload


def _response_payload(response):
    content_type = (response.headers.get("Content-Type") or "").lower()
    if "application/json" in content_type:
        try:
            return response.json()
        except ValueError:
            pass

    try:
        return response.json()
    except ValueError:
        text = response.text.strip()
        return {"content": text or response.reason, "status_code": response.status_code}


@api_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@api_bp.route("/connection/status", methods=["GET"])
def connection_status():
    """
    Check connection status to Beep.AI.Server.
    Returns comprehensive status including server reachability and token validity.
    """
    try:
        status = get_connection_status(current_app)
        return jsonify(status)
    except Exception as exc:
        return jsonify({
            "configured": False,
            "server_reachable": False,
            "token_valid": False,
            "error": str(exc)
        }), 500


@api_bp.route("/connection/check-token", methods=["GET"])
def check_token_validity():
    """
    Check if the configured API token is valid.
    """
    try:
        result = check_token(current_app)
        return jsonify(result)
    except Exception as exc:
        return jsonify({
            "success": False,
            "valid": False,
            "error": str(exc)
        }), 500


@api_bp.route("/connection/health", methods=["GET"])
def check_server_health():
    """
    Check if Beep.AI.Server is reachable (no token required).
    """
    try:
        result = check_health(current_app)
        return jsonify(result)
    except Exception as exc:
        return jsonify({
            "success": False,
            "error": str(exc)
        }), 500


@api_bp.route("/config", methods=["GET"])
def get_config():
    try:
        return jsonify(read_config(current_app))
    except FileNotFoundError:
        return jsonify({"error": "config.json not found"}), 404
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@api_bp.route("/config", methods=["POST"])
def update_config():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON body"}), 400
    try:
        write_config(current_app, data)
        return jsonify({"status": "saved"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@api_bp.route("/server/health", methods=["GET"])
def server_health():
    config = read_config(current_app)
    chat_mode = (config.get("chatMode") or "").strip().lower()
    base_url = _resolve_base_url(config, prefer_middleware=(chat_mode == "middleware"))
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    headers = _build_headers(config)

    health_override = (config.get("serverHealthEndpoint") or "").strip()
    chat_mode = (config.get("chatMode") or "").strip().lower()
    if health_override:
        health_paths = [health_override]
    elif chat_mode == "middleware":
        health_paths = ["/ai-middleware/api/health", "/ai-middleware/api/operational-status", "/v1/health", "/health"]
    else:
        health_paths = ["/v1/health", "/health"]

    last_error = None
    for path in health_paths:
        try:
            response = requests.get(f"{base_url}{path}", headers=headers, timeout=10)
            if not response.ok:
                last_error = f"{path} -> {response.status_code}"
                continue
            payload = _response_payload(response)
            payload["health_endpoint"] = path
            return jsonify(payload), response.status_code
        except Exception as exc:
            last_error = str(exc)

    return jsonify({"error": last_error or "Health check failed"}), 502


def _request_json(url, headers):
    response = requests.get(url, headers=headers, timeout=10)
    return response.status_code, response.json()


@api_bp.route("/server/status", methods=["GET"])
def server_status():
    config = read_config(current_app)
    chat_mode = (config.get("chatMode") or "").strip().lower()
    base_url = _resolve_base_url(config, prefer_middleware=(chat_mode == "middleware"))
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    headers = _build_headers(config)

    chat_mode = (config.get("chatMode") or "").strip().lower()
    status = {"base_url": base_url, "health": None, "middleware": None, "services": None}

    try:
        if chat_mode == "middleware":
            # Use new AI middleware endpoints
            middleware_status_endpoint = config.get("middlewareStatusEndpoint") or "/ai-middleware/api/operational-status"
            services_status_endpoint = config.get("servicesStatusEndpoint") or "/ai-middleware/api/services/status"
            status_code, payload = _request_json(f"{base_url}{middleware_status_endpoint}", headers)
            status["middleware"] = {"status_code": status_code, "payload": payload}
            status_code, payload = _request_json(f"{base_url}{services_status_endpoint}", headers)
            status["services"] = {"status_code": status_code, "payload": payload}
        status_code, payload = _request_json(f"{base_url}/v1/health", headers)
        status["health"] = {"status_code": status_code, "payload": payload}
    except Exception as exc:
        return jsonify({"error": str(exc), "status": status}), 502

    return jsonify(status)


@api_bp.route("/chat", methods=["POST"])
def chat_proxy():
    config = read_config(current_app)
    chat_mode = (config.get("chatMode") or "").strip().lower()
    endpoint = _normalize_endpoint(
        config.get("chatEndpoint") if chat_mode == "middleware" else config.get("openAiEndpoint")
    )
    if not endpoint:
        endpoint = _normalize_endpoint(config.get("openAiEndpoint") or config.get("chatEndpoint"))
    if not endpoint:
        return jsonify({"error": "chat endpoint not configured"}), 400

    is_openai_compat = endpoint.startswith("/v1/")
    base_url = _resolve_base_url(config, endpoint, prefer_middleware=not is_openai_compat)
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    headers = _build_headers(config, json_body=True)

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "Invalid JSON body"}), 400

    if is_openai_compat and "model" not in payload and payload.get("model_id"):
        payload["model"] = payload.pop("model_id")
    if not is_openai_compat and "model_id" not in payload and payload.get("model"):
        payload["model_id"] = payload.pop("model")

    if "model" not in payload and "model_id" not in payload and config.get("model"):
        if is_openai_compat:
            payload["model"] = config["model"]
        else:
            payload["model_id"] = config["model"]

    try:
        response = requests.post(
            f"{base_url}{endpoint}",
            json=payload,
            headers=headers,
            timeout=60,
        )
        return jsonify(_response_payload(response)), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@api_bp.route("/llm-with-tts", methods=["POST"])
def llm_with_tts_proxy():
    config = read_config(current_app)
    endpoint = _normalize_endpoint(config.get("llmWithTtsEndpoint") or "/ai-middleware/api/services/llm-with-tts")
    base_url = _resolve_base_url(config, endpoint, prefer_middleware=True)
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    headers = _build_headers(config, json_body=True)

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "Invalid JSON body"}), 400

    try:
        response = requests.post(
            f"{base_url}{endpoint}",
            json=payload,
            headers=headers,
            timeout=120,
        )
        return jsonify(_response_payload(response)), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@api_bp.route("/voice-chat", methods=["POST"])
def voice_chat_proxy():
    """Voice chat endpoint: accepts audio, returns AI response with optional TTS"""
    config = read_config(current_app)
    endpoint = _normalize_endpoint(config.get("voiceChatEndpoint") or "/ai-middleware/api/services/voice-chat")
    base_url = _resolve_base_url(config, endpoint, prefer_middleware=True)
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    headers = _build_headers(config)

    # Handle multipart form data (audio file upload)
    files = {}
    data = {}
    
    if "audio" in request.files:
        audio_file = request.files["audio"]
        files["audio"] = (audio_file.filename, audio_file.read(), audio_file.content_type or "audio/wav")
    
    # Pass through form fields
    for key in request.form:
        data[key] = request.form[key]

    user_context = _get_app_user_context(config, data)
    if user_context["user_id"]:
        data.setdefault("user_id", user_context["user_id"])
    if user_context["user_role"]:
        data.setdefault("user_role", user_context["user_role"])

    try:
        response = requests.post(
            f"{base_url}{endpoint}",
            files=files if files else None,
            data=data if data else None,
            headers=headers,
            timeout=120,
        )
        return jsonify(_response_payload(response)), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@api_bp.route("/tts", methods=["POST"])
def tts_proxy():
    """Text-to-speech proxy: convert text to audio"""
    config = read_config(current_app)
    endpoint = _normalize_endpoint(
        config.get("ttsEndpoint") or "/ai-middleware/api/services/text_to_speech/generate_speech"
    )
    base_url = _resolve_base_url(config, endpoint, prefer_middleware=True)
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    headers = _build_headers(config, json_body=True)

    payload = request.get_json(silent=True) or {}
    if not payload:
        return jsonify({"error": "Invalid JSON body"}), 400

    try:
        response = requests.post(
            f"{base_url}{endpoint}",
            json=payload,
            headers=headers,
            timeout=60,
        )
        return jsonify(_response_payload(response)), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@api_bp.route("/stt", methods=["POST"])
def stt_proxy():
    """Speech-to-text proxy: convert audio to text"""
    config = read_config(current_app)
    endpoint = _normalize_endpoint(
        config.get("sttEndpoint") or "/ai-middleware/api/services/speech-to-text/transcribe"
    )
    base_url = _resolve_base_url(config, endpoint, prefer_middleware=True)
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    headers = _build_headers(config)

    # Handle audio file upload
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]
    files = {"audio": (audio_file.filename, audio_file.read(), audio_file.content_type or "audio/wav")}
    data = {}
    
    # Pass through language if specified
    for key in request.form:
        data[key] = request.form[key]

    try:
        response = requests.post(
            f"{base_url}{endpoint}",
            files=files,
            data=data if data else None,
            headers=headers,
            timeout=60,
        )
        return jsonify(_response_payload(response)), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@api_bp.route("/tasks/<task_id>/status", methods=["GET"])
def task_status_proxy(task_id: str):
    config = read_config(current_app)
    endpoint_template = _normalize_endpoint(
        config.get("taskStatusEndpoint") or "/ai-middleware/api/playground/tasks/{taskId}/status"
    )
    endpoint = endpoint_template.replace("{taskId}", task_id)
    base_url = _resolve_base_url(config, endpoint, prefer_middleware=True)
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    try:
        response = requests.get(
            f"{base_url}{endpoint}",
            headers=_build_headers(config),
            timeout=30,
        )
        return jsonify(_response_payload(response)), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@api_bp.route("/extract", methods=["POST"])
def extract_proxy():
    config = read_config(current_app)
    endpoint = "/ai-middleware/api/extract"
    base_url = _resolve_base_url(config, endpoint, prefer_middleware=True)
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    upload = request.files["file"]
    files = {
        "file": (upload.filename, upload.read(), upload.content_type or "application/octet-stream")
    }
    data = dict(request.form)
    user_context = _get_app_user_context(config, data, default_user_id=DEFAULT_APP_USER_ID)
    if user_context["user_id"]:
        data.setdefault("user_id", user_context["user_id"])
    if user_context["user_role"]:
        data.setdefault("user_role", user_context["user_role"])

    try:
        response = requests.post(
            f"{base_url}{endpoint}",
            files=files,
            data=data,
            headers=_build_headers(config),
            timeout=120,
        )
        return jsonify(_response_payload(response)), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@api_bp.route("/rag/collections", methods=["GET", "POST"])
def rag_collections_proxy():
    config = read_config(current_app)
    endpoint = "/v1/rag/collections"
    base_url = _resolve_base_url(config, endpoint)
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    if request.method == "GET":
        include_public = request.args.get("include_public", "true")
        headers = _build_headers(config, include_user_context=True)
        try:
            response = requests.get(
                f"{base_url}{endpoint}?include_public={include_public}",
                headers=headers,
                timeout=30,
            )
            return jsonify(_response_payload(response)), response.status_code
        except Exception as exc:
            return jsonify({"error": str(exc)}), 502

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid JSON body"}), 400

    payload = _merge_rag_context(config, payload, require_user=True)
    try:
        response = requests.post(
            f"{base_url}{endpoint}",
            json=payload,
            headers=_build_headers(config, json_body=True),
            timeout=60,
        )
        return jsonify(_response_payload(response)), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@api_bp.route("/rag/collections/<collection_id>/documents", methods=["GET", "POST", "DELETE"])
def rag_documents_proxy(collection_id: str):
    config = read_config(current_app)
    endpoint = f"/ai-middleware/api/rag/collections/{collection_id}/documents"
    base_url = _resolve_base_url(config, endpoint, prefer_middleware=True)
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    if request.method == "GET":
        try:
            response = requests.get(
                f"{base_url}{endpoint}",
                headers=_build_headers(config, include_user_context=True),
                timeout=30,
            )
            return jsonify(_response_payload(response)), response.status_code
        except Exception as exc:
            return jsonify({"error": str(exc)}), 502

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid JSON body"}), 400

    payload = _merge_rag_context(config, payload, require_user=True)
    payload.setdefault("collection_id", collection_id)

    try:
        if request.method == "POST":
            v1_endpoint = "/v1/rag/documents"
            v1_base_url = _resolve_base_url(config, v1_endpoint)
            created = []
            for document in payload.get("documents") or []:
                response = requests.post(
                    f"{v1_base_url}{v1_endpoint}",
                    json=_rag_document_create_payload(document, collection_id, payload),
                    headers=_build_headers(config, json_body=True),
                    timeout=120,
                )
                if response.status_code >= 400:
                    return jsonify(_response_payload(response)), response.status_code
                created.append(_response_payload(response))
            return jsonify({"success": True, "indexed_count": len(created), "documents": created}), 200
        else:
            v1_base_url = _resolve_base_url(config, "/v1/rag/documents")
            deleted = []
            for document_id in payload.get("document_ids") or []:
                response = requests.delete(
                    f"{v1_base_url}/v1/rag/documents/{document_id}",
                    headers=_build_headers(config, json_body=True),
                    timeout=60,
                )
                if response.status_code >= 400:
                    return jsonify(_response_payload(response)), response.status_code
                deleted.append(document_id)
            return jsonify({"success": True, "deleted_count": len(deleted), "deleted": deleted}), 200
        return jsonify(_response_payload(response)), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@api_bp.route("/rag/query", methods=["POST"])
def rag_query_proxy():
    config = read_config(current_app)
    endpoint = "/v1/rag/query"
    base_url = _resolve_base_url(config, endpoint)
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid JSON body"}), 400

    payload = _merge_rag_context(config, payload, require_user=False)
    collection_id = payload.get("collection_id")
    if collection_id and not payload.get("collection_ids"):
        payload["collection_ids"] = [collection_id]

    try:
        response = requests.post(
            f"{base_url}{endpoint}",
            json=payload,
            headers=_build_headers(config, json_body=True),
            timeout=60,
        )
        return jsonify(_response_payload(response)), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


def _get_file_bytes(*field_names):
    for field in field_names:
        if field in request.files:
            return request.files[field].read()
    return None


@api_bp.route("/identity/enroll", methods=["POST"])
def identity_enroll():
    modality = (request.form.get("modality") or request.args.get("modality") or "").lower()
    audio_bytes = _get_file_bytes("audio", "voice", "file")
    image_bytes = _get_file_bytes("image", "face")

    if not modality:
        modality = "voice" if audio_bytes else "face"

    try:
        if modality == "voice":
            if not audio_bytes:
                return jsonify({"error": "audio file is required for voice enrollment"}), 400
            embedding = extract_voice_embedding(audio_bytes)
        elif modality == "face":
            if not image_bytes:
                return jsonify({"error": "image file is required for face enrollment"}), 400
            embedding = extract_face_embedding(image_bytes)
        else:
            return jsonify({"error": "Unsupported modality"}), 400

        response = enroll_identity(current_app, modality, embedding)
        return jsonify({"status": "enrolled", "result": response})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@api_bp.route("/identity/verify", methods=["POST"])
def identity_verify():
    audio_bytes = _get_file_bytes("audio", "voice", "file")
    image_bytes = _get_file_bytes("image", "face")
    threshold = request.form.get("threshold", type=float) or 0.65

    if not audio_bytes and not image_bytes:
        return jsonify({"error": "No audio or image provided"}), 400

    results = {}
    try:
        if audio_bytes:
            voice_embedding = extract_voice_embedding(audio_bytes)
            results["voice"] = verify_identity(current_app, "voice", voice_embedding, threshold)

        if image_bytes:
            face_embedding = extract_face_embedding(image_bytes)
            results["face"] = verify_identity(current_app, "face", face_embedding, threshold)

        best = None
        for entry in results.values():
            candidate = entry.get("match")
            if not candidate:
                continue
            if not best or candidate.get("score", 0) > best.get("score", 0):
                best = candidate

        return jsonify({"status": "ok", "results": results, "match": best})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@api_bp.route("/services", methods=["GET"])
def list_services():
    """List available AI services from AI.Server"""
    config = read_config(current_app)
    base_url = (config.get("middlewareBaseUrl") or config.get("serverBaseUrl") or "").rstrip("/")
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    headers = {}
    token = (config.get("apiToken") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    services_endpoint = config.get("servicesListEndpoint") or "/ai-middleware/api/services"
    try:
        response = requests.get(f"{base_url}{services_endpoint}", headers=headers, timeout=10)
        return jsonify(response.json()), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@api_bp.route("/services/status", methods=["GET"])
def services_status():
    """Get status of all AI services from AI.Server"""
    config = read_config(current_app)
    base_url = (config.get("middlewareBaseUrl") or config.get("serverBaseUrl") or "").rstrip("/")
    if not base_url:
        return jsonify({"error": "base URL not configured"}), 400

    headers = {}
    token = (config.get("apiToken") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    status_endpoint = config.get("servicesStatusEndpoint") or "/ai-middleware/api/services/status"
    try:
        response = requests.get(f"{base_url}{status_endpoint}", headers=headers, timeout=10)
        return jsonify(response.json()), response.status_code
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502
