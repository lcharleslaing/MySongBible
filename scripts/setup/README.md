# Setup Scripts

This folder is intended for bootstrap and template-preparation helpers.

- `check-piper.mjs` reads `backend/.env`, validates Piper TTS paths, prepares the configured TTS output directory, and runs a short synthesis test when Piper is configured.

For now, the template reuse workflow is documented in:

- [`../../TEMPLATE_USAGE.md`](../../TEMPLATE_USAGE.md)
- [`../../docs/SMOKE_TEST_CHECKLIST.md`](../../docs/SMOKE_TEST_CHECKLIST.md)
