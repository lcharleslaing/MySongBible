# Local AI Setup

`tools/local_ai_setup/` is the reusable setup package for local Whisper STT and Piper TTS. It keeps large binaries and models outside the repository by default, updates `backend/.env`, and provides checks that fail clearly when a local dependency is missing.

## Commands

Run these from the repository root:

```bash
npm run setup:local-ai
npm run setup:whisper
npm run setup:piper
npm run check:local-ai
npm run stt:check
npm run tts:check
```

Use dry-run mode before doing heavier work:

```bash
npm run setup:local-ai -- --dry-run
```

Use `--force` only when you want setup to replace customized `backend/.env` values.

## Local AI Folder

The default local AI home is `~/local-ai`, which resolves to `/home/llaing/local-ai` on this machine.

Override it for a single run:

```bash
LOCAL_AI_HOME=/path/to/local-ai npm run setup:local-ai
```

The setup package uses this structure:

```text
~/local-ai/
├── whisper.cpp/
├── whisper-models/
├── piper/
│   ├── bin/
│   ├── models/
│   └── .venv/
└── logs/
```

Do not commit this folder. If it is intentionally placed inside the repo, `.gitignore` excludes `local-ai/`, Whisper `.bin` files, Piper `.onnx` and `.onnx.json` files, `.gguf` files, generated audio, `backend/.env`, and `backend/data/`.

## What Gets Downloaded

Whisper setup checks for `whisper-cli` in `$LOCAL_AI_HOME/whisper.cpp/build/bin/whisper-cli`, `~/whisper.cpp/build/bin/whisper-cli`, and `/home/llaing/whisper.cpp/build/bin/whisper-cli`. If missing, it clones `https://github.com/ggml-org/whisper.cpp.git` into `$LOCAL_AI_HOME/whisper.cpp` and builds it with CMake.

The default Whisper model is `ggml-tiny.en.bin` in `$LOCAL_AI_HOME/whisper-models/`. `base.en` and `small.en` are also supported:

```bash
npm run setup:whisper -- --model base.en
npm run setup:whisper -- --model small.en
```

Piper setup creates `$LOCAL_AI_HOME/piper/.venv`, installs `piper-tts`, writes `$LOCAL_AI_HOME/piper/bin/piper-tts`, and downloads `en_US-amy-medium.onnx` plus `en_US-amy-medium.onnx.json`.

The Piper wrapper runs:

```bash
$LOCAL_AI_HOME/piper/.venv/bin/python -m piper "$@"
```

The backend and checks use the Piper 1.4.2 CLI format:

```bash
echo "This is a test." | $LOCAL_AI_HOME/piper/bin/piper-tts -m /path/to/model.onnx -f /tmp/test.wav
```

## backend/.env Updates

If `backend/.env` is missing, setup copies `backend/.env.example` first. It only replaces blank or placeholder values unless `--force` is passed.

`setup:local-ai` writes values like:

```env
LOCAL_AI_HOME=/home/llaing/local-ai
WHISPER_CPP_BINARY=/home/llaing/local-ai/whisper.cpp/build/bin/whisper-cli
WHISPER_MODEL_PATH=/home/llaing/local-ai/whisper-models/ggml-tiny.en.bin
WHISPER_TIMEOUT_SECONDS=120
TTS_ENGINE=piper
PIPER_BINARY=/home/llaing/local-ai/piper/bin/piper-tts
PIPER_MODEL_PATH=/home/llaing/local-ai/piper/models/en_US-amy-medium.onnx
TTS_OUTPUT_DIR=backend/data/audio/tts
TTS_TIMEOUT_SECONDS=120
```

Every changed key is logged. Customized values are preserved with a `WARN` unless `--force` is used.

## Checks

`npm run stt:check` reads `backend/.env`, validates `WHISPER_CPP_BINARY`, validates `WHISPER_MODEL_PATH`, and runs a short transcription test only if a sample WAV exists in the repo. If no sample exists, it prints a config PASS/WARN and explains how to test manually.

`npm run tts:check` reads `backend/.env`, validates `TTS_ENGINE`, `PIPER_BINARY`, `PIPER_MODEL_PATH`, `TTS_OUTPUT_DIR`, and `TTS_TIMEOUT_SECONDS`, confirms the `.onnx.json` sidecar exists, and runs a synthesis test when Piper is configured. The output is `backend/data/audio/tts/piper-test.wav` or the configured `TTS_OUTPUT_DIR`.

`npm run check:local-ai` runs both checks and probes `http://127.0.0.1:8000/api/health` with a short timeout. If the backend is not running, it warns instead of hanging.

## Troubleshooting

Wrong `/usr/bin/piper` app: Some Linux systems have a GTK app named `piper`. Do not use `/usr/bin/piper` for TTS. Use `$LOCAL_AI_HOME/piper/bin/piper-tts`.

Missing CMake: Install CMake, then rerun `npm run setup:whisper`.

Missing build tools: Install a compiler toolchain such as `build-essential`, then rerun `npm run setup:whisper`.

Missing model files: Rerun the relevant setup command, or place the files manually in `$LOCAL_AI_HOME/whisper-models/` or `$LOCAL_AI_HOME/piper/models/` and update `backend/.env`.

Permission denied: Check that `$LOCAL_AI_HOME` is writable and that `PIPER_BINARY` and `WHISPER_CPP_BINARY` are executable.

Piper CLI flag mismatch: This template expects Piper 1.4.2 style `-m MODEL -f OUTPUT_FILE`. Reinstall with `npm run setup:piper` if your current binary expects `--model` or `--output_file`.

Slow Whisper model: Tiny English is the default for laptop speed. Switch to `base.en` or `small.en` only if quality matters more than latency.

Switching models: Run `npm run setup:whisper -- --model base.en` or `small.en`, then update `WHISPER_MODEL_PATH` in `backend/.env` if setup preserves an existing customized model path.

