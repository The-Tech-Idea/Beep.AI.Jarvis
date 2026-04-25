"""
Client for Beep.AI.Server OpenAI and ai_middleware endpoints.
Uses the Beep.AI.Server root URL and token-authenticated external APIs.
Examples:
  - OpenAI chat: http://localhost:5000/v1/chat/completions
  - Middleware health: http://localhost:5000/ai-middleware/api/health

Configuration:
    serverBaseUrl: The Beep.AI.Server root URL (e.g., http://localhost:5000)
    middlewareBaseUrl: Optional compatibility override; defaults to serverBaseUrl
    apiToken: Application token for authentication
"""
import requests
import logging
from typing import Optional, Dict, Any, List

from app.services.config_service import read_config

logger = logging.getLogger(__name__)

# AI Middleware prefix on main server
MIDDLEWARE_PREFIX = "/ai-middleware"
DEFAULT_APP_ID = "jarvis"


def _get_server_settings(app):
    """Get server configuration."""
    config = read_config(app)
    # Prefer the canonical server root; middlewareBaseUrl is a compatibility fallback
    base_url = (config.get("serverBaseUrl") or config.get("middlewareBaseUrl") or "").rstrip("/")
    if base_url.endswith(MIDDLEWARE_PREFIX):
        base_url = base_url[:-len(MIDDLEWARE_PREFIX)]
    token = (config.get("apiToken") or "").strip()
    enroll_endpoint = config.get("identityEnrollEndpoint", "/api/v1/identity/enroll")
    verify_endpoint = config.get("identityVerifyEndpoint", "/api/v1/identity/verify")
    return base_url, token, enroll_endpoint, verify_endpoint


def _headers(token: str, user_id: Optional[str] = None) -> dict:
    """Get authorization headers with optional user context."""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if user_id:
        headers["X-User-ID"] = str(user_id)
    return headers


def _first_successful_json_get(base_url: str, paths: List[str], headers: Optional[dict] = None, timeout: int = 10) -> dict:
    last_error = None
    for path in paths:
        try:
            response = requests.get(
                f"{base_url}{path}",
                headers=headers,
                timeout=timeout,
            )
            if response.ok:
                payload = response.json()
                if isinstance(payload, dict):
                    payload.setdefault("health_endpoint", path)
                return payload
            last_error = f"HTTP {response.status_code}"
        except requests.exceptions.ConnectionError:
            last_error = "Cannot connect to server"
        except requests.exceptions.Timeout:
            last_error = "Connection timeout"
        except Exception as exc:
            last_error = str(exc)
    return {"success": False, "error": last_error or "Request failed"}


# =====================
# Health & Token Validation
# =====================

def check_health(app) -> dict:
    """
    Check if AI Middleware is reachable and healthy.
    No token required.
    
    Returns:
        dict with success, status, error
    """
    base_url, _, _, _ = _get_server_settings(app)
    if not base_url:
        return {"success": False, "error": "serverBaseUrl is not configured"}
    
    try:
        return _first_successful_json_get(
            base_url,
            [
                f"{MIDDLEWARE_PREFIX}/api/health",
                f"{MIDDLEWARE_PREFIX}/api/operational-status",
                "/v1/health",
                "/health",
            ],
            timeout=10,
        )
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return {"success": False, "error": str(e)}


def check_token(app) -> dict:
    """
    Check if the configured API token is valid.
    
    Returns:
        dict with:
            - valid: bool
            - server_status: str
            - user: dict (if valid)
            - error: str (if invalid)
    """
    base_url, token, _, _ = _get_server_settings(app)
    
    if not base_url:
        return {"success": False, "valid": False, "error": "serverBaseUrl is not configured"}
    if not token:
        return {"success": False, "valid": False, "error": "apiToken is not configured"}
    
    try:
        response = requests.get(
            f"{base_url}{MIDDLEWARE_PREFIX}/api/tokens/check",
            headers=_headers(token),
            timeout=10
        )
        return response.json()
    except requests.exceptions.ConnectionError:
        return {"success": False, "valid": False, "error": "Cannot connect to server"}
    except requests.exceptions.Timeout:
        return {"success": False, "valid": False, "error": "Connection timeout"}
    except Exception as e:
        logger.error(f"Token check error: {e}")
        return {"success": False, "valid": False, "error": str(e)}


def get_connection_status(app) -> dict:
    """
    Get comprehensive connection status.
    
    Returns:
        dict with:
            - configured: bool
            - server_reachable: bool
            - token_valid: bool
            - user: dict (if authenticated)
            - error: str (if any)
    """
    base_url, token, _, _ = _get_server_settings(app)
    
    result = {
        'configured': bool(base_url and token),
        'server_reachable': False,
        'token_valid': False,
        'user': None,
        'error': None
    }
    
    if not base_url:
        result['error'] = "Server URL not configured"
        return result
    
    # Check health
    health = check_health(app)
    if health.get('success'):
        result['server_reachable'] = True
    else:
        result['error'] = f"Server unreachable: {health.get('error')}"
        return result
    
    # Check token
    if not token:
        result['error'] = "API token not configured"
        return result
    
    token_result = check_token(app)
    if token_result.get('valid'):
        result['token_valid'] = True
        result['user'] = token_result.get('user')
    else:
        result['error'] = token_result.get('error', 'Invalid token')
    
    return result


# =====================
# Identity Endpoints (Face/Voice Recognition)
# =====================

def enroll_identity(app, modality: str, embedding: list) -> dict:
    """
    Enroll a new identity (face or voice).
    
    Args:
        app: Flask app instance
        modality: "face" or "voice"
        embedding: Feature embedding vector
    
    Returns:
        dict with enrollment result
    """
    base_url, token, enroll_endpoint, _ = _get_server_settings(app)
    if not base_url:
        raise ValueError("serverBaseUrl is not configured.")
    
    payload = {"modality": modality, "embedding": embedding}
    response = requests.post(
        f"{base_url}{enroll_endpoint}",
        json=payload,
        headers=_headers(token),
        timeout=60,
    )
    response.raise_for_status()
    return response.json()


def verify_identity(app, modality: str, embedding: list, threshold: float = 0.65) -> dict:
    """
    Verify an identity against enrolled embeddings.
    
    Args:
        app: Flask app instance
        modality: "face" or "voice"
        embedding: Feature embedding vector
        threshold: Similarity threshold (0-1)
    
    Returns:
        dict with verification result
    """
    base_url, token, _, verify_endpoint = _get_server_settings(app)
    if not base_url:
        raise ValueError("serverBaseUrl is not configured.")
    
    payload = {"modality": modality, "embedding": embedding, "threshold": threshold}
    response = requests.post(
        f"{base_url}{verify_endpoint}",
        json=payload,
        headers=_headers(token),
        timeout=60,
    )
    response.raise_for_status()
    return response.json()


# =====================
# AI Middleware Service Calls
# =====================

def call_service(app, service_type: str, method: str, **kwargs) -> dict:
    """
    Call any AI service through middleware.
    
    Args:
        app: Flask app instance
        service_type: llm, text_to_image, text_to_speech, speech_to_text, etc.
        method: generate, generate_image, synthesize, transcribe, etc.
        **kwargs: Service-specific parameters
    
    Returns:
        dict with service result
    """
    base_url, token, _, _ = _get_server_settings(app)
    if not base_url:
        raise ValueError("serverBaseUrl is not configured.")
    
    response = requests.post(
        f"{base_url}{MIDDLEWARE_PREFIX}/api/services/{service_type}/{method}",
        json=kwargs,
        headers=_headers(token),
        timeout=120,
    )
    response.raise_for_status()
    return response.json()


def chat(app, messages: list, model: str = None, **kwargs) -> dict:
    """
    Chat completion through the canonical OpenAI-compatible Beep.AI.Server route.
    
    Args:
        app: Flask app instance
        messages: List of message dicts with role and content
        model: Optional model name
        **kwargs: Additional parameters
    
    Returns:
        dict with chat response
    """
    base_url, token, _, _ = _get_server_settings(app)
    if not base_url:
        raise ValueError("serverBaseUrl is not configured.")

    config = read_config(app)
    endpoint = config.get("openAiEndpoint") or "/v1/chat/completions"

    payload = {"messages": messages}
    if model:
        payload["model"] = model
    payload.update(kwargs)
    if "model" not in payload and payload.get("model_id"):
        payload["model"] = payload.pop("model_id")

    response = requests.post(
        f"{base_url}{endpoint}",
        json=payload,
        headers=_headers(token),
        timeout=120,
    )
    response.raise_for_status()
    return response.json()


def synthesize_speech(app, text: str, voice: str = None, **kwargs) -> dict:
    """Convert text to speech."""
    params = {'text': text}
    if voice:
        params['voice'] = voice
    params.update(kwargs)
    return call_service(app, 'text_to_speech', 'generate_speech', **params)


def transcribe_audio(app, audio_data, format: str = 'wav', **kwargs) -> dict:
    """Transcribe audio to text."""
    params = {'audio_data': audio_data, 'format': format}
    params.update(kwargs)
    return call_service(app, 'speech_to_text', 'transcribe_audio', **params)


# =====================
# App User Management
# =====================

def register_app_user(app, user_id: str, display_name: Optional[str] = None,
                      email: Optional[str] = None, tier: Optional[str] = None,
                      role: str = 'user', metadata: Optional[Dict] = None) -> dict:
    """
    Register an app user with the AI Server.
    
    Args:
        app: Flask app instance
        user_id: Unique user identifier within this app
        display_name: User's display name
        email: User's email address
        tier: Subscription tier (free, basic, pro, enterprise)
        role: User role (user, admin, guest)
        metadata: Additional user metadata
    
    Returns:
        dict with user info or error
    """
    base_url, token, _, _ = _get_server_settings(app)
    if not base_url:
        return {"success": False, "error": "serverBaseUrl is not configured"}
    
    payload = {"user_id": user_id, "role": role}
    if display_name:
        payload["display_name"] = display_name
    if email:
        payload["email"] = email
    if tier:
        payload["tier"] = tier
    if metadata:
        payload["metadata"] = metadata
    
    try:
        response = requests.post(
            f"{base_url}{MIDDLEWARE_PREFIX}/api/app-users",
            json=payload,
            headers=_headers(token),
            timeout=30,
        )
        return response.json()
    except Exception as e:
        logger.error(f"Register app user error: {e}")
        return {"success": False, "error": str(e)}


def get_app_user(app, user_id: str) -> dict:
    """
    Get app user information.
    
    Returns:
        dict with user info or error
    """
    base_url, token, _, _ = _get_server_settings(app)
    if not base_url:
        return {"success": False, "error": "serverBaseUrl is not configured"}
    
    try:
        response = requests.get(
            f"{base_url}{MIDDLEWARE_PREFIX}/api/app-users/{user_id}",
            headers=_headers(token),
            timeout=15,
        )
        return response.json()
    except Exception as e:
        logger.error(f"Get app user error: {e}")
        return {"success": False, "error": str(e)}


def get_app_user_usage(app, user_id: str) -> dict:
    """
    Get app user's current usage and quota status.
    
    Returns:
        dict with usage info or error
    """
    base_url, token, _, _ = _get_server_settings(app)
    if not base_url:
        return {"success": False, "error": "serverBaseUrl is not configured"}
    
    try:
        response = requests.get(
            f"{base_url}{MIDDLEWARE_PREFIX}/api/app-users/{user_id}/usage",
            headers=_headers(token),
            timeout=15,
        )
        return response.json()
    except Exception as e:
        logger.error(f"Get app user usage error: {e}")
        return {"success": False, "error": str(e)}


def update_app_user(app, user_id: str, display_name: Optional[str] = None,
                    email: Optional[str] = None, role: Optional[str] = None,
                    is_active: Optional[bool] = None,
                    metadata: Optional[Dict] = None) -> dict:
    """
    Update app user information.
    
    Returns:
        dict with updated user info or error
    """
    base_url, token, _, _ = _get_server_settings(app)
    if not base_url:
        return {"success": False, "error": "serverBaseUrl is not configured"}
    
    payload = {}
    if display_name is not None:
        payload["display_name"] = display_name
    if email is not None:
        payload["email"] = email
    if role is not None:
        payload["role"] = role
    if is_active is not None:
        payload["is_active"] = is_active
    if metadata is not None:
        payload["metadata"] = metadata
    
    try:
        response = requests.put(
            f"{base_url}{MIDDLEWARE_PREFIX}/api/app-users/{user_id}",
            json=payload,
            headers=_headers(token),
            timeout=30,
        )
        return response.json()
    except Exception as e:
        logger.error(f"Update app user error: {e}")
        return {"success": False, "error": str(e)}


def set_app_user_tier(app, user_id: str, tier: str) -> dict:
    """
    Change app user's subscription tier.
    
    Returns:
        dict with result or error
    """
    base_url, token, _, _ = _get_server_settings(app)
    if not base_url:
        return {"success": False, "error": "serverBaseUrl is not configured"}
    
    try:
        response = requests.put(
            f"{base_url}{MIDDLEWARE_PREFIX}/api/app-users/{user_id}/tier",
            json={"tier": tier},
            headers=_headers(token),
            timeout=30,
        )
        return response.json()
    except Exception as e:
        logger.error(f"Set app user tier error: {e}")
        return {"success": False, "error": str(e)}


def list_tiers(app) -> dict:
    """
    List available subscription tiers.
    
    Returns:
        dict with tiers list or error
    """
    base_url, token, _, _ = _get_server_settings(app)
    if not base_url:
        return {"success": False, "error": "serverBaseUrl is not configured"}
    
    try:
        response = requests.get(
            f"{base_url}{MIDDLEWARE_PREFIX}/api/tiers",
            headers=_headers(token),
            timeout=15,
        )
        return response.json()
    except Exception as e:
        logger.error(f"List tiers error: {e}")
        return {"success": False, "error": str(e)}


def ensure_app_user(app, user_id: str, display_name: Optional[str] = None,
                    email: Optional[str] = None) -> dict:
    """
    Ensure an app user exists, creating if necessary.
    
    This is useful for auto-registering users on first API call.
    
    Returns:
        dict with user info or error
    """
    # Try to get existing user
    result = get_app_user(app, user_id)
    if result.get('success'):
        return result
    
    # User doesn't exist, register with default tier
    return register_app_user(app, user_id, display_name, email)


# =====================
# RAG Operations with Application Metadata
# =====================

def list_rag_collections(app, user_id: Optional[str] = None, 
                         include_public: bool = True) -> dict:
    """
    List RAG collections for the configured application token.
    
    Args:
        app: Flask app instance
        user_id: Optional application user metadata label; not used for access
        include_public: Include public collections
    
    Returns:
        dict with collections list or error
    """
    base_url, token, _, _ = _get_server_settings(app)
    if not base_url:
        return {"success": False, "error": "serverBaseUrl is not configured"}
    
    try:
        response = requests.get(
            f"{base_url}/v1/rag/collections?include_public={str(include_public).lower()}",
            headers=_headers(token),
            timeout=15,
        )
        return response.json()
    except Exception as e:
        logger.error(f"List RAG collections error: {e}")
        return {"success": False, "error": str(e)}


def rag_query(app, query: str, collection_id: Optional[str] = None,
              max_results: int = 5, user_id: Optional[str] = None,
              user_role: Optional[str] = None) -> dict:
    """
    Query application-scoped RAG collections.
    
    Args:
        app: Flask app instance
        query: Search query text
        collection_id: Optional collection to search
        max_results: Maximum results to return
        user_id: User performing the query
        user_role: User's role
    
    Returns:
        dict with query results or error
    """
    base_url, token, _, _ = _get_server_settings(app)
    if not base_url:
        return {"success": False, "error": "serverBaseUrl is not configured"}
    
    payload = {
        "query": query,
        "max_results": max_results,
        "app_id": DEFAULT_APP_ID,
    }
    if collection_id:
        payload["collection_id"] = collection_id
        payload["collection_ids"] = [collection_id]
    try:
        response = requests.post(
            f"{base_url}/v1/rag/query",
            json=payload,
            headers=_headers(token),
            timeout=60,
        )
        return response.json()
    except Exception as e:
        logger.error(f"RAG query error: {e}")
        return {"success": False, "error": str(e)}


def rag_add_documents(app, documents: List[Dict], collection_id: str,
                      user_id: Optional[str] = None,
                      user_role: Optional[str] = None) -> dict:
    """
    Add documents to a RAG collection with optional user metadata labels.
    
    Args:
        app: Flask app instance
        documents: List of document dicts with content, source, metadata
        collection_id: Target collection
        user_id: User adding documents
        user_role: User's role
    
    Returns:
        dict with result or error
    """
    base_url, token, _, _ = _get_server_settings(app)
    if not base_url:
        return {"success": False, "error": "serverBaseUrl is not configured"}
    
    payload = {
        "documents": documents,
        "collection_id": collection_id,
        "app_id": DEFAULT_APP_ID,
    }
    try:
        created = []
        for document in documents:
            document_payload = _rag_document_create_payload(document, collection_id, user_id, user_role)
            response = requests.post(
                f"{base_url}/v1/rag/documents",
                json=document_payload,
                headers=_headers(token),
                timeout=60,
            )
            created.append(response.json())
        return {"success": True, "indexed_count": len(created), "documents": created}
    except Exception as e:
        logger.error(f"RAG add documents error: {e}")
        return {"success": False, "error": str(e)}


def _rag_document_create_payload(document: Dict, collection_id: str,
                                 user_id: Optional[str] = None,
                                 user_role: Optional[str] = None) -> Dict:
    metadata = dict(document.get("metadata") or {})
    if user_id:
        metadata.setdefault("app_user_id", str(user_id))
        metadata.setdefault("user_id", str(user_id))
    if user_role:
        metadata.setdefault("user_role", user_role)
    payload = {
        "collection_id": collection_id,
        "title": document.get("title") or document.get("source") or document.get("id") or document.get("document_id"),
        "content": document.get("content"),
        "metadata": metadata,
    }
    document_id = document.get("id") or document.get("document_id")
    if document_id:
        payload["id"] = document_id
    return payload
