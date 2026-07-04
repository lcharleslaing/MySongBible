# Speech-to-Text

This folder contains local speech-to-text adapters and helpers.

Current direction:

- keep `whisper.cpp` invocation centralized here
- configure binary and model paths through environment variables or saved settings
- keep route handlers free of subprocess details
