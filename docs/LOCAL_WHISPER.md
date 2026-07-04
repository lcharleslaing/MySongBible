# Local Whisper Integration

AppTemplateBase uses `whisper.cpp` as a local speech-to-text backend.

## Environment Variables

Example values:

```env
WHISPER_CPP_BINARY=/home/llaing/whisper.cpp/build/bin/whisper-cli
WHISPER_MODEL_PATH=/home/llaing/whisper.cpp/models/ggml-base.en.bin
WHISPER_THREAD_COUNT=4
KEEP_UPLOADED_AUDIO_FILES=true
```

## Behavior

- uploaded audio is stored under `APP_DATA_DIR/audio/input`
- `whisper-cli` is invoked through `subprocess.run(...)`
- no shell invocation is used
- no GPU is assumed; the service passes `--no-gpu`
- the transcript text is saved to SQLite
- audio file paths are stored as metadata only

## Endpoint

`POST /api/stt/transcribe`

Multipart form fields:

- `audio_file`: uploaded audio file
- `title`: optional transcript title
- `language`: optional language code

## curl Example

```bash
curl -X POST http://127.0.0.1:8000/api/stt/transcribe \
  -F "audio_file=@/absolute/path/to/sample.wav" \
  -F "title=Sample Audio" \
  -F "language=en"
```
