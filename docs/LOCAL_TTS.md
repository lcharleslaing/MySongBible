# Local TTS Integration

AppTemplateBase uses a pluggable local-only text-to-speech architecture.

## Environment Variables

```env
TTS_ENGINE=mock
PIPER_BINARY=/absolute/path/to/piper
PIPER_MODEL_PATH=/absolute/path/to/piper-model.onnx
TTS_OUTPUT_DIR=./data/audio/tts
TTS_TIMEOUT_SECONDS=120
```

## Engines

### MockTtsEngine

- always available
- writes a small placeholder WAV file
- safe default when no local TTS runtime is configured
- useful for app development and integration testing

### PiperEngine

- used when `TTS_ENGINE=piper` and both `PIPER_BINARY` and `PIPER_MODEL_PATH` are configured
- invokes Piper through a safe subprocess call
- fails clearly if `TTS_ENGINE=piper` but Piper is not configured or available
- writes synthesized WAV output to the configured output directory

## Output Storage

- synthesized audio is saved under `data/audio/tts` by default
- synthesized audio is served back to the renderer through `/api/audio/tts/{filename}`
- TTS jobs are stored in SQLite
- large audio data is stored on disk, not in the database

## API

`POST /api/tts/synthesize`

Request body:

- `text`
- `voice_profile` optional
- `engine` optional

## curl Example

```bash
curl -X POST http://127.0.0.1:8000/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello from local speech synthesis.",
    "engine": "mock"
  }'
```

## Future Voice Cloning

The TTS engine interface is intentionally designed so future engines can be added without changing the API contract.

Planned future engine classes may include:

- XTTS
- F5-TTS

Those engines can plug into the same manager and request/response flow while exposing richer capabilities such as:

- voice profile selection
- multi-speaker support
- voice cloning
- language-specific synthesis controls
