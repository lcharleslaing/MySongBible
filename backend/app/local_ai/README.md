# Local AI Modules

This folder centralizes local-first speech capabilities.

Current areas:

- `voice/` orchestration for speech features
- `stt/` speech-to-text adapters such as `whisper.cpp`
- `tts/` text-to-speech engine interfaces and implementations
- `voice_cloning/` future-ready cloning contracts and placeholder engine classes

Current rules:

- keep all speech execution local-only
- keep subprocess invocation centralized instead of scattering it across routes
- keep engine-specific logic behind stable service interfaces
