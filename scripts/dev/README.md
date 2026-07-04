# Development Scripts

This folder contains local development orchestration helpers.

## Current Scripts

- `bootstrap-start.cjs`
  - ensures root Node dependencies are installed
  - ensures the backend virtualenv exists
  - ensures backend Python dependencies are installed
  - launches the full desktop app stack unless `--bootstrap-only` is passed
