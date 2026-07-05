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

These values are read from `backend/.env`. Relative paths are resolved from the `backend/` directory.

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

## Piper Setup Check

Run this from the repository root:

```bash
npm run tts:check
```

The check reads `backend/.env` and validates:

- `TTS_ENGINE`
- `PIPER_BINARY`
- `PIPER_MODEL_PATH`
- `TTS_OUTPUT_DIR`
- `TTS_TIMEOUT_SECONDS`

It does not install Piper and does not download voice models. Set `PIPER_BINARY` and `PIPER_MODEL_PATH` yourself in `backend/.env`.

When Piper binary and model paths both exist, the helper runs a short local synthesis test:

```text
This is a local Piper text to speech test.
```

The output is written to `piper-test.wav` inside the configured `TTS_OUTPUT_DIR`; with the default config that is `backend/data/audio/tts/piper-test.wav`. The helper may overwrite that known test file, but it does not write to arbitrary user-selected files.

Console messages use:

- `PASS` for a valid setting or successful synthesis step
- `WARN` for a non-blocking condition, such as `TTS_ENGINE=mock` or blank Piper paths while Mock is active
- `FAIL` for a blocking Piper configuration or synthesis problem

## Manual Voice Lab Test

Use this flow to verify the renderer and backend TTS path together:

1. Start the app with `npm start`.
2. Open Voice Lab.
3. In Text to Speech, select `Mock`.
4. Enter text and click `Speak`.
5. Confirm the synthesis result shows a completed job, the `mock` engine, a local output path, and a backend playback URL.
6. Confirm the Audio Output panel uses the backend URL and shows an audio player when the URL is available.
7. Configure Piper paths in Settings or `backend/.env`:
   - `TTS_ENGINE=piper`
   - `PIPER_BINARY=/absolute/path/to/piper`
   - `PIPER_MODEL_PATH=/absolute/path/to/piper-model.onnx`
8. Run `npm run tts:check` from the repository root.
9. Return to Voice Lab and select `Piper`.
10. Click `Speak`.
11. Confirm the synthesis result shows the `piper` engine and the real audio plays through the backend HTTP playback URL.

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
