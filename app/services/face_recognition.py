"""
Face embedding extraction using InsightFace.
"""
_app = None


def _get_app():
    global _app
    if _app is None:
        from insightface.app import FaceAnalysis
        _app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        _app.prepare(ctx_id=0, det_size=(640, 640))
    return _app


def extract_face_embedding(image_bytes: bytes) -> list:
    if not image_bytes:
        raise ValueError("Empty image payload.")

    try:
        import numpy as np
        import cv2
    except ImportError as exc:
        raise RuntimeError(
            "Face recognition dependencies not installed. "
            "Install requirements-identity.txt."
        ) from exc

    img_array = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image data.")

    faces = _get_app().get(image)
    if not faces:
        raise ValueError("No face detected.")

    face = max(faces, key=lambda item: item.det_score)
    return face.embedding.tolist()
