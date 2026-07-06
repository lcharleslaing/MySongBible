from __future__ import annotations

import os
import shutil
import shlex
import stat
import subprocess
import sys
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from .constants import (
    DEFAULT_LOCAL_AI_HOME,
    DEFAULT_PIPER_VOICE,
    DEFAULT_WHISPER_MODEL,
    PIPER_TEST_FILE,
    PIPER_TEST_TEXT,
    PIPER_VOICES,
    TTS_OUTPUT_DIR,
    TTS_TIMEOUT_SECONDS,
    WHISPER_MODEL_FILES,
    WHISPER_MODEL_URLS,
    WHISPER_TIMEOUT_SECONDS,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
BACKEND_ENV_PATH = BACKEND_DIR / ".env"
BACKEND_ENV_EXAMPLE_PATH = BACKEND_DIR / ".env.example"


@dataclass
class Message:
    level: str
    text: str


@dataclass
class Result:
    messages: list[Message] = field(default_factory=list)
    failed: bool = False
    warned: bool = False

    def pass_(self, text: str) -> None:
        self.messages.append(Message("PASS", text))

    def warn(self, text: str) -> None:
        self.warned = True
        self.messages.append(Message("WARN", text))

    def fail(self, text: str) -> None:
        self.failed = True
        self.messages.append(Message("FAIL", text))

    def extend(self, other: "Result") -> None:
        self.messages.extend(other.messages)
        self.failed = self.failed or other.failed
        self.warned = self.warned or other.warned

    @property
    def status(self) -> str:
        if self.failed:
            return "FAIL"
        if self.warned:
            return "WARN"
        return "PASS"


def emit(result: Result) -> None:
    for message in result.messages:
        print(f"{message.level}: {message.text}")


def local_ai_home() -> Path:
    configured = os.environ.get("LOCAL_AI_HOME") or DEFAULT_LOCAL_AI_HOME
    return Path(configured).expanduser().resolve()


def local_ai_paths(home: Path | None = None) -> dict[str, Path]:
    root = home or local_ai_home()
    return {
        "root": root,
        "whisper": root / "whisper.cpp",
        "whisper_models": root / "whisper-models",
        "piper": root / "piper",
        "piper_bin": root / "piper" / "bin",
        "piper_models": root / "piper" / "models",
        "piper_venv": root / "piper" / ".venv",
        "logs": root / "logs",
    }


def resolve_from_backend(value: str | None, fallback: Path | None = None) -> Path | None:
    raw = (value or "").strip()
    if not raw:
        return fallback
    path = Path(raw).expanduser()
    if path.is_absolute():
        return path
    return (BACKEND_DIR / path).resolve()


def parse_env(content: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        values[key.strip()] = value
    return values


def read_backend_env() -> dict[str, str]:
    if not BACKEND_ENV_PATH.exists():
        return {}
    return parse_env(BACKEND_ENV_PATH.read_text(encoding="utf-8"))


def ensure_backend_env_exists(dry_run: bool = False) -> Result:
    result = Result()
    if BACKEND_ENV_PATH.exists():
        result.pass_(f"backend/.env found at {BACKEND_ENV_PATH}")
        return result
    if not BACKEND_ENV_EXAMPLE_PATH.exists():
        result.fail("backend/.env is missing and backend/.env.example was not found.")
        return result
    if dry_run:
        result.warn(f"Would copy {BACKEND_ENV_EXAMPLE_PATH} to {BACKEND_ENV_PATH}.")
        return result
    shutil.copyfile(BACKEND_ENV_EXAMPLE_PATH, BACKEND_ENV_PATH)
    result.pass_(f"Created backend/.env from {BACKEND_ENV_EXAMPLE_PATH}")
    return result


def is_placeholder(key: str, value: str | None) -> bool:
    raw = (value or "").strip()
    if not raw:
        return True
    placeholder_values = {
        "mock",
        "TODO",
        "CHANGE_ME",
        "/path/to/voice-model.onnx",
        "/absolute/path/to/piper",
        "/absolute/path/to/whisper-cli",
    }
    if raw in placeholder_values:
        return True
    if raw.startswith("/path/to/") or raw.startswith("/absolute/path/to/"):
        return True
    if key == "TTS_OUTPUT_DIR" and raw in {"./data/audio/tts", "data/audio/tts"}:
        return True
    return key == "LOCAL_AI_HOME" and raw == str(Path(DEFAULT_LOCAL_AI_HOME).expanduser())


def update_backend_env(updates: dict[str, str], *, force: bool = False, dry_run: bool = False) -> Result:
    result = Result()
    result.extend(ensure_backend_env_exists(dry_run=dry_run))
    if result.failed or (dry_run and not BACKEND_ENV_PATH.exists()):
        for key, value in updates.items():
            result.warn(f"Would set {key}={value}")
        return result

    lines = BACKEND_ENV_PATH.read_text(encoding="utf-8").splitlines()
    existing = parse_env("\n".join(lines))
    line_indexes: dict[str, int] = {}
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key = stripped.split("=", 1)[0].strip()
        line_indexes[key] = index

    changed = False
    for key, value in updates.items():
        current = existing.get(key)
        if current == value:
            result.pass_(f"{key} already set.")
            continue
        if current is not None and not force and not is_placeholder(key, current):
            result.warn(f"Kept customized {key}; use --force to replace it.")
            continue
        changed = True
        action = "Would update" if dry_run else "Updated"
        if key in line_indexes:
            lines[line_indexes[key]] = f"{key}={value}"
        else:
            lines.append(f"{key}={value}")
        result.pass_(f"{action} backend/.env: {key}={value}")

    if changed and not dry_run:
        BACKEND_ENV_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    elif changed:
        result.warn("Dry run only; backend/.env was not changed.")

    return result


def is_executable(path: Path | None) -> bool:
    if path is None or not path.exists():
        return False
    if sys.platform == "win32":
        return True
    return os.access(path, os.X_OK)


def choose_existing_path(candidates: Iterable[Path]) -> Path | None:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def whisper_binary_candidates(home: Path | None = None) -> list[Path]:
    paths = local_ai_paths(home)
    return [
        paths["whisper"] / "build" / "bin" / "whisper-cli",
        Path("~/whisper.cpp/build/bin/whisper-cli").expanduser(),
        Path("/home/llaing/whisper.cpp/build/bin/whisper-cli"),
    ]


def whisper_model_path(model: str = DEFAULT_WHISPER_MODEL, home: Path | None = None) -> Path:
    return local_ai_paths(home)["whisper_models"] / WHISPER_MODEL_FILES[model]


def piper_wrapper_path(home: Path | None = None) -> Path:
    return local_ai_paths(home)["piper_bin"] / "piper-tts"


def piper_model_path(voice: str = DEFAULT_PIPER_VOICE, home: Path | None = None) -> Path:
    return local_ai_paths(home)["piper_models"] / f"{voice}.onnx"


def run_command(command: list[str], *, cwd: Path | None = None, timeout: int | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
        timeout=timeout,
    )


def download_file(url: str, destination: Path, *, dry_run: bool = False) -> Result:
    result = Result()
    if destination.exists():
        result.pass_(f"Already downloaded: {destination}")
        return result
    if dry_run:
        result.warn(f"Would download {url} to {destination}")
        return result
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        urllib.request.urlretrieve(url, destination)
    except Exception as error:  # pragma: no cover - network dependent
        result.fail(f"Download failed for {url}: {error}")
        return result
    result.pass_(f"Downloaded {destination}")
    return result


def setup_whisper(*, model: str = DEFAULT_WHISPER_MODEL, force: bool = False, dry_run: bool = False) -> Result:
    result = Result()
    if model not in WHISPER_MODEL_FILES:
        result.fail(f"Unsupported Whisper model '{model}'. Use one of: {', '.join(WHISPER_MODEL_FILES)}")
        return result

    paths = local_ai_paths()
    for directory in [paths["root"], paths["whisper_models"], paths["logs"]]:
        if dry_run:
            result.warn(f"Would ensure directory exists: {directory}")
        else:
            directory.mkdir(parents=True, exist_ok=True)
            result.pass_(f"Directory ready: {directory}")

    binary = choose_existing_path(whisper_binary_candidates(paths["root"]))
    if binary:
        result.pass_(f"Whisper binary found: {binary}")
    else:
        checkout = paths["whisper"]
        if checkout.exists() and not force:
            result.warn(f"{checkout} exists but whisper-cli was not found; use --force after inspecting it.")
        elif dry_run:
            result.warn(f"Would clone/build whisper.cpp in {checkout}")
        else:
            if checkout.exists() and force:
                result.warn(f"Using existing {checkout}; --force does not delete local source.")
            if not checkout.exists():
                clone = run_command(["git", "clone", "https://github.com/ggml-org/whisper.cpp.git", str(checkout)])
                if clone.returncode != 0:
                    result.fail(clone.stderr.strip() or "Failed to clone whisper.cpp.")
                    return result
            configure = run_command(["cmake", "-B", "build"], cwd=checkout)
            if configure.returncode != 0:
                result.fail(configure.stderr.strip() or "cmake configure failed for whisper.cpp.")
                return result
            jobs = str(os.cpu_count() or 2)
            build = run_command(["cmake", "--build", "build", f"-j{jobs}"], cwd=checkout)
            if build.returncode != 0:
                result.fail(build.stderr.strip() or "cmake build failed for whisper.cpp.")
                return result
            binary = choose_existing_path(whisper_binary_candidates(paths["root"]))
            if binary:
                result.pass_(f"Whisper binary built: {binary}")
            else:
                result.fail("whisper.cpp build finished but whisper-cli was not found.")
                return result

    target_model = whisper_model_path(model, paths["root"])
    if target_model.exists():
        result.pass_(f"Whisper model found: {target_model}")
    else:
        downloader = paths["whisper"] / "models" / "download-ggml-model.sh"
        repo_model = paths["whisper"] / "models" / WHISPER_MODEL_FILES[model]
        if downloader.exists() and not dry_run:
            download = run_command(["bash", str(downloader), model], cwd=downloader.parent, timeout=900)
            if download.returncode == 0 and repo_model.exists():
                target_model.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(repo_model, target_model)
                result.pass_(f"Copied Whisper model to {target_model}")
            else:
                result.warn(download.stderr.strip() or "Official whisper.cpp model download did not produce a model.")
        if not target_model.exists():
            result.extend(download_file(WHISPER_MODEL_URLS[model], target_model, dry_run=dry_run))

    if binary and target_model.exists() or dry_run:
        env_updates = {
            "LOCAL_AI_HOME": str(paths["root"]),
            "WHISPER_CPP_BINARY": str(binary or paths["whisper"] / "build" / "bin" / "whisper-cli"),
            "WHISPER_MODEL_PATH": str(target_model),
            "WHISPER_TIMEOUT_SECONDS": WHISPER_TIMEOUT_SECONDS,
        }
        result.extend(update_backend_env(env_updates, force=force, dry_run=dry_run))

    return result


def create_piper_wrapper(wrapper: Path, venv_python: Path, *, dry_run: bool = False) -> Result:
    result = Result()
    if dry_run:
        result.warn(f"Would write Piper wrapper {wrapper}")
        return result
    wrapper.parent.mkdir(parents=True, exist_ok=True)
    wrapper.write_text(f"#!/usr/bin/env bash\nexec {shlex.quote(str(venv_python))} -m piper \"$@\"\n", encoding="utf-8")
    wrapper.chmod(wrapper.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    result.pass_(f"Piper wrapper ready: {wrapper}")
    return result


def setup_piper(*, voice: str = DEFAULT_PIPER_VOICE, force: bool = False, dry_run: bool = False) -> Result:
    result = Result()
    if voice not in PIPER_VOICES:
        result.fail(f"Unsupported Piper voice '{voice}'. Use one of: {', '.join(PIPER_VOICES)}")
        return result

    paths = local_ai_paths()
    for directory in [paths["piper"], paths["piper_bin"], paths["piper_models"], paths["piper_venv"], paths["logs"]]:
        if dry_run:
            result.warn(f"Would ensure directory exists: {directory}")
        else:
            directory.mkdir(parents=True, exist_ok=True)
            result.pass_(f"Directory ready: {directory}")

    venv_python = paths["piper_venv"] / "bin" / "python"
    if dry_run:
        result.warn(f"Would create Piper virtualenv at {paths['piper_venv']}")
        result.warn("Would install piper-tts into the Piper virtualenv.")
    else:
        if not venv_python.exists():
            venv = run_command(["python3", "-m", "venv", str(paths["piper_venv"])])
            if venv.returncode != 0:
                result.fail(venv.stderr.strip() or "Could not create Piper virtualenv.")
                return result
            result.pass_(f"Created Piper virtualenv: {paths['piper_venv']}")
        install = run_command([str(venv_python), "-m", "pip", "install", "piper-tts"])
        if install.returncode != 0:
            result.fail(install.stderr.strip() or "Could not install piper-tts.")
            return result
        result.pass_("Installed piper-tts in Piper virtualenv.")

    wrapper = piper_wrapper_path(paths["root"])
    result.extend(create_piper_wrapper(wrapper, venv_python, dry_run=dry_run))

    voice_info = PIPER_VOICES[voice]
    model = piper_model_path(voice, paths["root"])
    config = model.with_suffix(model.suffix + ".json")
    result.extend(download_file(voice_info.model_url, model, dry_run=dry_run))
    result.extend(download_file(voice_info.config_url, config, dry_run=dry_run))

    env_updates = {
        "LOCAL_AI_HOME": str(paths["root"]),
        "TTS_ENGINE": "piper",
        "PIPER_BINARY": str(wrapper),
        "PIPER_MODEL_PATH": str(model),
        "TTS_OUTPUT_DIR": TTS_OUTPUT_DIR,
        "TTS_TIMEOUT_SECONDS": TTS_TIMEOUT_SECONDS,
    }
    result.extend(update_backend_env(env_updates, force=force, dry_run=dry_run))
    return result


def validate_piper_model_pair(model: Path | None) -> Result:
    result = Result()
    if model is None:
        result.fail("PIPER_MODEL_PATH is missing or blank.")
        return result
    if model.suffix != ".onnx":
        result.fail(f"PIPER_MODEL_PATH must end with .onnx: {model}")
    elif model.exists():
        result.pass_(f"Piper model found: {model}")
    else:
        result.fail(f"PIPER_MODEL_PATH does not exist: {model}")

    config = Path(str(model) + ".json")
    if config.exists():
        result.pass_(f"Piper model config found: {config}")
    else:
        result.fail(f"Matching Piper config is missing: {config}")
    return result


def validate_piper_cli(binary: Path | None, *, timeout: int = 5) -> Result:
    result = Result()
    if binary is None:
        result.fail("PIPER_BINARY is missing or blank.")
        return result
    if str(binary) == "/usr/bin/piper":
        result.fail("/usr/bin/piper is commonly the GTK pipe viewer, not Piper TTS. Use the local wrapper.")
        return result
    if not binary.exists():
        result.fail(f"PIPER_BINARY does not exist: {binary}")
        return result
    result.pass_(f"Piper binary found: {binary}")
    if is_executable(binary):
        result.pass_("Piper binary is executable.")
    else:
        result.fail(f"Piper binary exists but is not executable: {binary}")
        return result
    try:
        completed = run_command([str(binary), "--help"], timeout=timeout)
    except subprocess.TimeoutExpired:
        result.warn("Piper --help timed out; continuing with synthesis check.")
        return result
    help_text = f"{completed.stdout}\n{completed.stderr}"
    if "-m" in help_text and "-f" in help_text:
        result.pass_("Piper CLI advertises -m and -f flags.")
    else:
        result.warn("Could not confirm Piper CLI supports -m and -f from --help output.")
    return result


def check_stt(*, run_sample: bool = True) -> Result:
    result = Result()
    env = read_backend_env()
    if not env:
        result.fail("backend/.env was not found or has no readable values.")
        return result
    result.pass_("backend/.env loaded.")
    binary = resolve_from_backend(env.get("WHISPER_CPP_BINARY"))
    model = resolve_from_backend(env.get("WHISPER_MODEL_PATH"))
    timeout = int(env.get("WHISPER_TIMEOUT_SECONDS") or WHISPER_TIMEOUT_SECONDS)

    if binary and binary.exists():
        result.pass_(f"Whisper binary found: {binary}")
        if is_executable(binary):
            result.pass_("Whisper binary is executable.")
        else:
            result.fail(f"Whisper binary exists but is not executable: {binary}")
    else:
        result.fail(f"WHISPER_CPP_BINARY does not exist: {binary}")
    if model and model.exists():
        result.pass_(f"Whisper model found: {model}")
    else:
        result.fail(f"WHISPER_MODEL_PATH does not exist: {model}")

    samples = list((REPO_ROOT / "backend" / "tests").glob("**/*.wav"))
    if run_sample and samples and binary and model and binary.exists() and model.exists():
        output_prefix = local_ai_paths()["logs"] / "stt-check"
        command = [
            str(binary),
            "--model",
            str(model),
            "--file",
            str(samples[0]),
            "--no-gpu",
            "--no-prints",
            "--output-txt",
            "--output-file",
            str(output_prefix),
        ]
        try:
            completed = run_command(command, timeout=timeout)
        except subprocess.TimeoutExpired:
            result.fail(f"Whisper sample transcription timed out after {timeout} seconds.")
        else:
            if completed.returncode == 0:
                result.pass_("Whisper sample transcription completed.")
            else:
                result.fail(completed.stderr.strip() or "Whisper sample transcription failed.")
    else:
        result.pass_("No sample WAV found; STT config validation passed.")
    return result


def check_tts(*, synthesize: bool = True) -> Result:
    result = Result()
    env = read_backend_env()
    if not env:
        result.fail("backend/.env was not found or has no readable values.")
        return result
    result.pass_("backend/.env loaded.")
    engine = (env.get("TTS_ENGINE") or "").strip().lower()
    if engine == "piper":
        result.pass_("TTS_ENGINE is piper.")
    elif engine:
        result.warn(f"TTS_ENGINE is {engine}; Piper settings will be checked but synthesis may be skipped.")
    else:
        result.fail("TTS_ENGINE is missing or blank.")

    binary = resolve_from_backend(env.get("PIPER_BINARY"))
    model = resolve_from_backend(env.get("PIPER_MODEL_PATH"))
    output_dir = resolve_from_backend(env.get("TTS_OUTPUT_DIR"), BACKEND_DIR / "data" / "audio" / "tts")
    timeout = int(env.get("TTS_TIMEOUT_SECONDS") or TTS_TIMEOUT_SECONDS)

    result.extend(validate_piper_cli(binary))
    result.extend(validate_piper_model_pair(model))
    if output_dir is None:
        result.fail("TTS_OUTPUT_DIR is missing.")
    else:
        try:
            output_dir.mkdir(parents=True, exist_ok=True)
            result.pass_(f"TTS output directory is ready: {output_dir}")
        except OSError as error:
            result.fail(f"Could not create TTS output directory {output_dir}: {error}")

    if not synthesize or result.failed or engine != "piper" or binary is None or model is None or output_dir is None:
        if not result.failed:
            result.warn("Skipping Piper synthesis because Piper is not the active configured engine.")
        return result

    output_path = output_dir / PIPER_TEST_FILE
    try:
        completed = subprocess.run(
            [str(binary), "-m", str(model), "-f", str(output_path)],
            input=PIPER_TEST_TEXT,
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        result.fail(f"Piper synthesis timed out after {timeout} seconds.")
        return result
    if completed.returncode != 0:
        result.fail(completed.stderr.strip() or f"Piper synthesis failed with exit code {completed.returncode}.")
    elif output_path.exists():
        result.pass_(f"Test synthesis created {output_path}")
    else:
        result.fail(f"Piper exited successfully but did not create {output_path}")
    return result


def check_backend_http() -> Result:
    result = Result()
    try:
        import urllib.error
        import urllib.request

        with urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=2) as response:
            if response.status == 200:
                result.pass_("Backend /api/health is reachable on 127.0.0.1:8000.")
            else:
                result.warn(f"Backend /api/health returned HTTP {response.status}.")
    except Exception:
        result.warn("Backend /api/health is not currently reachable; start the app to check runtime status.")
    return result
