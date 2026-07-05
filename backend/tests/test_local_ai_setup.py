from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tools.local_ai_setup import core  # noqa: E402


def test_env_update_preserves_customized_values_without_force(tmp_path: Path, monkeypatch) -> None:
    env_path = tmp_path / ".env"
    example_path = tmp_path / ".env.example"
    env_path.write_text("PIPER_BINARY=/custom/piper\nPIPER_MODEL_PATH=\n", encoding="utf-8")
    example_path.write_text("", encoding="utf-8")
    monkeypatch.setattr(core, "BACKEND_ENV_PATH", env_path)
    monkeypatch.setattr(core, "BACKEND_ENV_EXAMPLE_PATH", example_path)

    result = core.update_backend_env(
        {
            "PIPER_BINARY": "/new/piper",
            "PIPER_MODEL_PATH": "/models/voice.onnx",
        },
        force=False,
    )

    assert result.status == "WARN"
    assert "PIPER_BINARY=/custom/piper" in env_path.read_text(encoding="utf-8")
    assert "PIPER_MODEL_PATH=/models/voice.onnx" in env_path.read_text(encoding="utf-8")


def test_env_update_replaces_customized_values_with_force(tmp_path: Path, monkeypatch) -> None:
    env_path = tmp_path / ".env"
    example_path = tmp_path / ".env.example"
    env_path.write_text("PIPER_BINARY=/custom/piper\n", encoding="utf-8")
    example_path.write_text("", encoding="utf-8")
    monkeypatch.setattr(core, "BACKEND_ENV_PATH", env_path)
    monkeypatch.setattr(core, "BACKEND_ENV_EXAMPLE_PATH", example_path)

    result = core.update_backend_env({"PIPER_BINARY": "/new/piper"}, force=True)

    assert result.status == "PASS"
    assert env_path.read_text(encoding="utf-8") == "PIPER_BINARY=/new/piper\n"


def test_env_update_treats_default_tts_output_as_placeholder(tmp_path: Path, monkeypatch) -> None:
    env_path = tmp_path / ".env"
    example_path = tmp_path / ".env.example"
    env_path.write_text("TTS_OUTPUT_DIR=./data/audio/tts\n", encoding="utf-8")
    example_path.write_text("", encoding="utf-8")
    monkeypatch.setattr(core, "BACKEND_ENV_PATH", env_path)
    monkeypatch.setattr(core, "BACKEND_ENV_EXAMPLE_PATH", example_path)

    result = core.update_backend_env({"TTS_OUTPUT_DIR": "backend/data/audio/tts"})

    assert result.status == "PASS"
    assert "TTS_OUTPUT_DIR=backend/data/audio/tts" in env_path.read_text(encoding="utf-8")


def test_piper_validation_rejects_usr_bin_piper() -> None:
    result = core.validate_piper_cli(Path("/usr/bin/piper"))

    assert result.failed
    assert "GTK" in result.messages[0].text


def test_piper_model_pair_requires_onnx_and_json(tmp_path: Path) -> None:
    model = tmp_path / "voice.onnx"
    model.write_text("model", encoding="utf-8")

    missing_config = core.validate_piper_model_pair(model)
    assert missing_config.failed
    assert "missing" in missing_config.messages[-1].text

    Path(str(model) + ".json").write_text("{}", encoding="utf-8")
    valid = core.validate_piper_model_pair(model)
    assert valid.status == "PASS"


def test_choose_existing_path_selects_first_existing_file(tmp_path: Path) -> None:
    first = tmp_path / "missing"
    second = tmp_path / "exists"
    second.write_text("ok", encoding="utf-8")

    assert core.choose_existing_path([first, second]) == second
