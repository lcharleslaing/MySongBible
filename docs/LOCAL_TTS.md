# Local TTS Integration

AppTemplateBase uses a pluggable, local-only text-to-speech architecture. The template works out of the box with Mock TTS, and it can be moved to real local Piper TTS after you configure Piper and download a Piper voice model.

The backend Python dependencies include the `piper-tts` package, which provides a local `piper` CLI in the backend virtualenv. The app does not download Piper voice models automatically.

## TTS Engines

### Mock

Mock is the default engine.

- always available
- exercises the complete TTS app pipeline
- creates a small placeholder WAV file
- useful for testing UI, job persistence, audio serving, and playback wiring
- not real speech

Use Mock when you are developing the app shell or when Piper has not been installed yet.

### Piper

Piper is the current real local text-to-speech engine.

- runs locally through a configured Piper binary, usually `backend/.venv/bin/piper` when backend dependencies are installed
- requires a downloaded Piper voice model file ending in `.onnx`
- writes WAV output to the configured TTS output directory
- is selected with `TTS_ENGINE=piper` or through Settings
- fails clearly when its binary or model path is missing

Piper must be configured manually in either `backend/.env` or the Settings page. The template will not guess voice model paths or download models.

### Future Voice Cloning Engines

Voice cloning is scaffold-only right now. Future Lee-style voice cloning should use a separate XTTS/F5-TTS-style engine rather than Piper.

The Voice Profile field in Voice Lab is future-ready only. Mock and Piper currently do not support voice profiles, and the backend rejects voice profile input for engines that do not advertise support.

## backend/.env Examples

Mock default:

```env
TTS_ENGINE=mock
PIPER_BINARY=
PIPER_MODEL_PATH=
TTS_OUTPUT_DIR=./data/audio/tts
TTS_TIMEOUT_SECONDS=120
```

Piper example:

```env
TTS_ENGINE=piper
PIPER_BINARY=/home/llaing/Programming/AppTemplateBase/backend/.venv/bin/piper
PIPER_MODEL_PATH=/path/to/voice-model.onnx
TTS_OUTPUT_DIR=backend/data/audio/tts
TTS_TIMEOUT_SECONDS=60
```

These values are read from `backend/.env`. Relative paths in backend settings are resolved from the backend runtime context. Absolute paths are easiest to reason about for Piper binaries and models.

## Recommended Local Folder Convention

You can keep local AI voice models outside the repository. This is only a convention, not a requirement:

```text
~/local-ai/piper/models/
```

Example paths might then look like:

```env
PIPER_BINARY=/home/llaing/Programming/AppTemplateBase/backend/.venv/bin/piper
PIPER_MODEL_PATH=/home/llaing/local-ai/piper/models/en_US-lessac-medium.onnx
```

The matching `.onnx.json` metadata file may live next to the model, but `PIPER_MODEL_PATH` should point to the `.onnx` file.

## Verify Piper Configuration

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

When Piper binary and model paths both exist, the helper runs this short local synthesis test:

```text
This is a local Piper text to speech test.
```

The output is written to `piper-test.wav` inside the configured `TTS_OUTPUT_DIR`. The helper may overwrite that known test file, but it does not write to arbitrary user-selected files.

Console messages mean:

- `PASS`: a setting is valid, a path exists, or test synthesis succeeded
- `WARN`: non-blocking condition, such as `TTS_ENGINE=mock` or blank Piper paths while Mock is active
- `FAIL`: blocking Piper configuration or synthesis problem

If the command warns that Piper is not configured while `TTS_ENGINE=mock`, that is a valid template-development state.

## API Tests

Mock:

```bash
curl -X POST http://127.0.0.1:8000/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from local speech synthesis.","engine":"mock"}'
```

Piper:

```bash
curl -X POST http://127.0.0.1:8000/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a local Piper test.","engine":"piper"}'
```

The response includes job status, engine used, local output path metadata, and a backend audio URL when synthesis succeeds.

## UI Test

1. Start the app:

   ```bash
   npm start
   ```

2. Open Settings.
3. Leave `TTS Engine` as `mock` for the default path, or configure Piper:
   - `TTS Engine`: `piper`
   - `Piper Binary Path`: path to the Piper executable
   - `Piper Model Path`: path to the `.onnx` voice model
   - `TTS Output Directory`: where generated audio files should be stored
   - `TTS Timeout Seconds`: positive timeout value
4. If configuring Piper, run:

   ```bash
   npm run tts:check
   ```

5. Open Voice Lab.
6. Select `Mock` or `Piper`.
7. Enter text and click `Speak`.
8. Confirm the synthesis result shows status, engine used, job ID, local output path, and playable backend URL when available.
9. Confirm the Audio Output panel shows an HTML audio player when the backend returns `audio_file_url`.

Voice Lab does not use `file://` playback. Audio is served through the backend HTTP route.

## Output Storage

- synthesized audio is saved under `data/audio/tts` by default
- synthesized audio is served back to the renderer through `/api/audio/tts/{filename}`
- TTS jobs are stored in SQLite
- large audio data is stored on disk, not in the database

## API Contract

`POST /api/tts/synthesize`

Request body:

- `text`
- `engine` optional; use `mock` or `piper`
- `voice_profile` optional, but only valid for engines that support voice profiles

Response includes:

- `status`
- `engine_used`
- `job_id`
- `audio_file_path`
- `audio_file_url`
- `error`

## Common Failures

### Piper binary missing

`PIPER_BINARY` is blank or points to a path that does not exist. If backend dependencies are installed, the expected local CLI is usually `backend/.venv/bin/piper`. Otherwise, run the normal project dependency setup or switch back to Mock.

### Piper binary not executable

The configured file exists but cannot be executed. On Linux, check permissions with `ls -l /path/to/piper` and make it executable if appropriate.

### Piper model missing

`PIPER_MODEL_PATH` is blank or points to a file that does not exist. Download a Piper voice model manually and point to the `.onnx` file.

### Piper timeout

Piper did not finish within `TTS_TIMEOUT_SECONDS`. Try a shorter text, increase the timeout, or verify the binary/model are compatible.

### Output directory permission issue

The backend could not create or write to `TTS_OUTPUT_DIR`. Pick a writable directory and save Settings again.

### Engine does not support voice profiles

Mock and Piper do not support voice profiles. Leave the Voice Profile field blank. Future voice-cloning engines can enable this capability.

### Piper unavailable in Voice Lab

Voice Lab reads `/api/voice/status`. Piper appears as unavailable until both binary and model paths are configured and valid.

### Audio URL missing

The audio player appears only when synthesis returns `audio_file_url`. If synthesis failed, or if no backend playback URL was returned, check the Synthesis Result panel and backend error message.

## Voice Cloning Note

Piper is useful for local real TTS, but it is not the main planned path for Lee-style voice cloning in this template.

Future voice cloning should be implemented as a separate engine, such as XTTS or F5-TTS, using the existing local voice-cloning scaffold. That future engine can advertise voice profile support, while Mock and Piper remain simple TTS engines.
