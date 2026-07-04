# Voice Cloning Roadmap

This repository includes a future-ready local-only voice cloning scaffold. It does **not** implement model download, fine-tuning, inference, or training yet.

## Current Scope

- `VoiceProfile` persistence
- placeholder local engine classes for XTTS and F5-TTS
- API scaffolding for listing engines and storing voice profiles
- reference audio path validation

## Short-Reference Cloning

Future short-reference cloning should support:

- a short clean reference clip
- a selected local engine such as XTTS or F5-TTS
- a local inference path with no cloud dependency

Implementation should extend:

- `backend/app/local_ai/voice_cloning/engines.py`
- `backend/app/services/voice_profiles.py`

## Fine-Tuning Path

Future fine-tuning should remain separate from short-reference inference.

That future path will likely require:

- explicit training jobs
- persistent training metadata
- model artifact storage
- a clean separation between inference-ready profiles and training workspaces

## Clean Audio Dataset Expectations

Any future high-quality cloning or fine-tuning path should assume:

- clean microphone audio
- low background noise
- consistent speaker identity
- stable gain levels
- enough duration to support the target engine’s needs

## Local-Only Design

This template is intentionally local-first:

- no model downloads are triggered here
- no cloud cloning APIs are used
- no heavy dependencies are added yet

## Future Implementation Locations

Recommended extension points:

- `backend/app/local_ai/voice_cloning/base.py`
  Interface and structured engine responses
- `backend/app/local_ai/voice_cloning/engines.py`
  XTTS and F5-TTS engine implementations
- `backend/app/services/voice_profiles.py`
  Profile creation, validation, and future training orchestration
- `backend/app/api/routes/voice_profiles.py`
  Future profile/training endpoints
