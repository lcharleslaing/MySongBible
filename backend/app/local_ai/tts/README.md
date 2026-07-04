# Text-to-Speech

This folder contains pluggable local text-to-speech engines.

Current direction:

- keep engine-specific subprocess logic centralized here
- support a safe mock engine for development
- support Piper when configured
- leave room for future engines such as XTTS or F5-TTS behind the same interface
