from __future__ import annotations

from dataclasses import dataclass


DEFAULT_LOCAL_AI_HOME = "~/local-ai"
DEFAULT_WHISPER_MODEL = "tiny.en"
DEFAULT_PIPER_VOICE = "en_US-amy-medium"
WHISPER_TIMEOUT_SECONDS = "120"
TTS_TIMEOUT_SECONDS = "120"
TTS_OUTPUT_DIR = "backend/data/audio/tts"
PIPER_TEST_TEXT = "This is a local Piper text to speech test."
PIPER_TEST_FILE = "piper-test.wav"


WHISPER_MODEL_FILES = {
    "tiny.en": "ggml-tiny.en.bin",
    "base.en": "ggml-base.en.bin",
    "small.en": "ggml-small.en.bin",
}

# whisper.cpp's own downloader is preferred when the source checkout exists.
# These URLs mirror the upstream script source and are only used as a fallback.
WHISPER_MODEL_URLS = {
    "tiny.en": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
    "base.en": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    "small.en": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
}


@dataclass(frozen=True)
class PiperVoice:
    name: str
    model_url: str
    config_url: str


PIPER_VOICES = {
    "en_US-amy-medium": PiperVoice(
        name="en_US-amy-medium",
        model_url=(
            "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
            "en/en_US/amy/medium/en_US-amy-medium.onnx"
        ),
        config_url=(
            "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
            "en/en_US/amy/medium/en_US-amy-medium.onnx.json"
        ),
    ),
}

