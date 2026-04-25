"""
Voice embedding extraction using SpeechBrain.
"""
import io
import os
import tempfile

_classifier = None


def _get_classifier():
    global _classifier
    if _classifier is None:
        from speechbrain.pretrained import EncoderClassifier
        _classifier = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            run_opts={"device": "cpu"},
        )
    return _classifier


def extract_voice_embedding(audio_bytes: bytes) -> list:
    if not audio_bytes:
        raise ValueError("Empty audio payload.")

    try:
        from pydub import AudioSegment
        import torchaudio
    except ImportError as exc:
        raise RuntimeError(
            "Voice recognition dependencies not installed. "
            "Install requirements-identity.txt."
        ) from exc

    segment = AudioSegment.from_file(io.BytesIO(audio_bytes))
    segment = segment.set_channels(1).set_frame_rate(16000)

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            temp_path = tmp.name
        segment.export(temp_path, format="wav")
        waveform, _ = torchaudio.load(temp_path)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

    classifier = _get_classifier()
    embedding = classifier.encode_batch(waveform).squeeze().tolist()
    return embedding
