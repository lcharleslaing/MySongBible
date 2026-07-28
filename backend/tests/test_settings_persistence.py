
import json

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import Settings
from app.schemas.settings import AppDefinitionUpdateRequest, DeviceProfileApplyRequest, DeviceSettingsProfile
from app.services.settings import SettingsService


def test_settings_can_be_updated_and_reloaded(client) -> None:
    update_response = client.put(
        "/api/settings",
        json={
            "whisper_cpp_binary": "/tmp/whisper-cli",
            "whisper_model_path": "/tmp/ggml-base.en.bin",
            "whisper_thread_count": 6,
            "tts_engine": "piper",
            "piper_binary": "/tmp/piper",
            "piper_model_path": "/tmp/piper-model.onnx",
            "audio_input_dir": "/tmp/audio-input",
            "tts_output_dir": "/tmp/audio-output",
            "tts_timeout_seconds": 30,
            "sqlite_database_path": "./data/app_template_base.sqlite3",
        },
    )
    assert update_response.status_code == 200

    payload = update_response.json()
    assert payload["whisper_cpp_binary"] == "/tmp/whisper-cli"
    assert payload["whisper_model_path"] == "/tmp/ggml-base.en.bin"
    assert payload["whisper_thread_count"] == 6
    assert payload["tts_engine"] == "piper"
    assert payload["piper_binary"] == "/tmp/piper"
    assert payload["piper_model_path"] == "/tmp/piper-model.onnx"
    assert payload["audio_input_dir"] == "/tmp/audio-input"
    assert payload["tts_output_dir"] == "/tmp/audio-output"
    assert payload["tts_timeout_seconds"] == 30
    assert payload["sqlite_database_path"] == "./data/app_template_base.sqlite3"
    assert payload["database_url"] == "sqlite:///./data/app_template_base.sqlite3"

    get_response = client.get("/api/settings")
    assert get_response.status_code == 200

    reloaded = get_response.json()
    assert reloaded["whisper_cpp_binary"] == "/tmp/whisper-cli"
    assert reloaded["whisper_model_path"] == "/tmp/ggml-base.en.bin"
    assert reloaded["whisper_thread_count"] == 6
    assert reloaded["tts_engine"] == "piper"
    assert reloaded["piper_binary"] == "/tmp/piper"
    assert reloaded["piper_model_path"] == "/tmp/piper-model.onnx"
    assert reloaded["audio_input_dir"] == "/tmp/audio-input"
    assert reloaded["tts_output_dir"] == "/tmp/audio-output"
    assert reloaded["tts_timeout_seconds"] == 30


def test_settings_can_update_editable_paths_without_database_path(client) -> None:
    update_response = client.put(
        "/api/settings",
        json={
            "whisper_cpp_binary": "/tmp/selected-whisper-cli",
            "whisper_model_path": "/tmp/selected-model.bin",
            "whisper_thread_count": 8,
            "tts_engine": "mock",
            "piper_binary": None,
            "piper_model_path": None,
            "audio_input_dir": "/tmp/selected-audio-input",
            "tts_output_dir": "/tmp/selected-audio-output",
            "tts_timeout_seconds": 45,
        },
    )

    assert update_response.status_code == 200

    payload = update_response.json()
    assert payload["whisper_cpp_binary"] == "/tmp/selected-whisper-cli"
    assert payload["whisper_model_path"] == "/tmp/selected-model.bin"
    assert payload["whisper_thread_count"] == 8
    assert payload["audio_input_dir"] == "/tmp/selected-audio-input"
    assert payload["tts_output_dir"] == "/tmp/selected-audio-output"
    assert payload["tts_timeout_seconds"] == 45


def test_settings_reject_runtime_database_path_change(client) -> None:
    response = client.put(
        "/api/settings",
        json={
            "whisper_cpp_binary": None,
            "whisper_model_path": None,
            "whisper_thread_count": 4,
            "tts_engine": "mock",
            "piper_binary": None,
            "piper_model_path": None,
            "audio_input_dir": "./data/audio/input",
            "tts_output_dir": "./data/audio/tts",
            "tts_timeout_seconds": 120,
            "sqlite_database_path": "./data/custom.sqlite3",
        },
    )

    assert response.status_code == 400
    assert "startup-only" in response.json()["detail"]


def test_settings_reject_invalid_tts_engine(client) -> None:
    response = client.put(
        "/api/settings",
        json={
            "whisper_cpp_binary": None,
            "whisper_model_path": None,
            "whisper_thread_count": 4,
            "tts_engine": "placeholder",
            "piper_binary": None,
            "piper_model_path": None,
            "audio_input_dir": "./data/audio/input",
            "tts_output_dir": "./data/audio/tts",
            "tts_timeout_seconds": 120,
        },
    )

    assert response.status_code == 422


def test_settings_reject_non_positive_tts_timeout(client) -> None:
    response = client.put(
        "/api/settings",
        json={
            "whisper_cpp_binary": None,
            "whisper_model_path": None,
            "whisper_thread_count": 4,
            "tts_engine": "mock",
            "piper_binary": None,
            "piper_model_path": None,
            "audio_input_dir": "./data/audio/input",
            "tts_output_dir": "./data/audio/tts",
            "tts_timeout_seconds": 0,
        },
    )

    assert response.status_code == 422


def test_app_definition_updates_project_files(tmp_path, monkeypatch) -> None:
    project_root = tmp_path / "Project"
    frontend_dir = project_root / "frontend"
    backend_dir = project_root / "backend"
    frontend_dir.mkdir(parents=True)
    backend_dir.mkdir()
    (project_root / "package.json").write_text(
        json.dumps({"name": "apptemplatebase", "version": "0.1.0", "private": True}),
        encoding="utf-8",
    )
    (frontend_dir / "package.json").write_text(
        json.dumps({"name": "apptemplatebase-frontend", "version": "0.1.0"}),
        encoding="utf-8",
    )
    (project_root / "package-lock.json").write_text(
        json.dumps(
            {
                "name": "apptemplatebase",
                "version": "0.1.0",
                "packages": {
                    "": {"name": "apptemplatebase", "version": "0.1.0"},
                    "frontend": {"name": "apptemplatebase-frontend", "version": "0.1.0"},
                },
            }
        ),
        encoding="utf-8",
    )
    (frontend_dir / "package-lock.json").write_text(
        json.dumps(
            {
                "name": "apptemplatebase-frontend",
                "version": "0.1.0",
                "packages": {"": {"name": "apptemplatebase-frontend", "version": "0.1.0"}},
            }
        ),
        encoding="utf-8",
    )
    (frontend_dir / "index.html").write_text("<html><head><title>AppTemplateBase</title></head></html>", encoding="utf-8")
    (project_root / ".env.example").write_text("APP_NAME=AppTemplateBase\n", encoding="utf-8")
    (backend_dir / ".env.example").write_text("APP_NAME=AppTemplateBase Backend\n", encoding="utf-8")
    (backend_dir / "pyproject.toml").write_text(
        '[project]\nname = "apptemplatebase-backend"\nversion = "0.1.0"\n'
        'description = "Local FastAPI backend for AppTemplateBase"\n',
        encoding="utf-8",
    )
    backend_core_dir = backend_dir / "app" / "core"
    backend_routes_dir = backend_dir / "app" / "api" / "routes"
    backend_core_dir.mkdir(parents=True)
    backend_routes_dir.mkdir(parents=True)
    (backend_core_dir / "runtime_paths.py").write_text('APP_DIRECTORY_NAME = "AppTemplateBase"\n', encoding="utf-8")
    (backend_core_dir / "config.py").write_text(
        '    app_name: str = "AppTemplateBase"\n'
        '            self.database_url = f"sqlite:///{self.app_data_dir / \'database\' / \'apptemplatebase.sqlite3\'}"\n',
        encoding="utf-8",
    )
    (backend_routes_dir / "health.py").write_text(
        'app_name="AppTemplateBase",\nbackend_version="0.1.0",\n'
        'identity="com.localfirst.apptemplatebase.backend",\n'
        'return {"app_name": "AppTemplateBase", "identity": "com.localfirst.apptemplatebase.backend", '
        '"backend_version": "0.1.0"}\n',
        encoding="utf-8",
    )
    (project_root / "README.md").write_text("# AppTemplateBase\n\nStarter.\n", encoding="utf-8")

    monkeypatch.setattr("app.services.settings.PROJECT_ROOT", project_root)
    engine = create_engine(f"sqlite:///{tmp_path / 'settings.sqlite3'}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        service = SettingsService(session, Settings())
        response = service.update_app_definition(
            AppDefinitionUpdateRequest(
                package_name="my-new-app",
                app_version="1.2.3",
                app_display_name="My New App",
                sidebar_eyebrow="My App",
                sidebar_title="Launch Console",
                sidebar_description="Custom local workflow.",
                topbar_eyebrow="Workspace",
                topbar_title="Control Room",
                home_eyebrow="Start",
                home_title="Welcome to My New App",
                home_description="A custom app built from the template.",
            )
        )

    assert response.app_definition.package_name == "my-new-app"
    assert json.loads((project_root / "package.json").read_text(encoding="utf-8"))["name"] == "my-new-app"
    assert json.loads((frontend_dir / "package.json").read_text(encoding="utf-8"))["name"] == "my-new-app-frontend"
    assert json.loads((project_root / "package-lock.json").read_text(encoding="utf-8"))["packages"]["frontend"]["name"] == "my-new-app-frontend"
    assert "<title>My New App</title>" in (frontend_dir / "index.html").read_text(encoding="utf-8")
    assert (project_root / ".env.example").read_text(encoding="utf-8").startswith("APP_NAME=My New App\n")
    assert (backend_dir / ".env.example").read_text(encoding="utf-8").startswith("APP_NAME=My New App Backend\n")
    assert "DATABASE_URL=sqlite:///./data/my_new_app.sqlite3" in (project_root / ".env.example").read_text(encoding="utf-8")
    assert 'name = "my-new-app-backend"' in (backend_dir / "pyproject.toml").read_text(encoding="utf-8")
    assert 'version = "1.2.3"' in (backend_dir / "pyproject.toml").read_text(encoding="utf-8")
    assert 'APP_DIRECTORY_NAME = "My New App"' in (backend_core_dir / "runtime_paths.py").read_text(encoding="utf-8")
    assert 'app_name: str = "My New App"' in (backend_core_dir / "config.py").read_text(encoding="utf-8")
    assert "my_new_app.sqlite3" in (backend_core_dir / "config.py").read_text(encoding="utf-8")
    assert 'identity="com.localfirst.my.new.app.backend"' in (backend_routes_dir / "health.py").read_text(encoding="utf-8")
    assert (project_root / "README.md").read_text(encoding="utf-8").startswith("# My New App")


def test_device_profile_saves_to_file_and_applies_values(tmp_path, monkeypatch) -> None:
    profile_file = tmp_path / "shared" / "config" / "device-profiles.json"
    monkeypatch.setattr("app.services.settings.DEVICE_PROFILE_FILE", profile_file)
    engine = create_engine(f"sqlite:///{tmp_path / 'device-settings.sqlite3'}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        service = SettingsService(session, Settings())
        saved = service.save_device_profile(
            DeviceSettingsProfile(
                device_name="studio-laptop",
                whisper_cpp_binary="/opt/whisper-cli",
                whisper_model_path="/opt/models/tiny.bin",
                whisper_thread_count=8,
                tts_engine="piper",
                piper_binary="/opt/piper",
                piper_model_path="/opt/amy.onnx",
                audio_input_dir="/tmp/input",
                tts_output_dir="/tmp/output",
                tts_timeout_seconds=45,
            )
        )

    assert saved.selected_device_name == "studio-laptop"
    assert saved.piper_binary == "/opt/piper"
    saved_profiles = json.loads(profile_file.read_text(encoding="utf-8"))["profiles"]
    assert saved_profiles[0]["device_name"] == "studio-laptop"

    with Session(engine) as session:
        service = SettingsService(session, Settings())
        applied = service.apply_device_profile(DeviceProfileApplyRequest(device_name="studio-laptop"))

    assert applied.selected_device_name == "studio-laptop"
    assert applied.whisper_thread_count == 8
    assert applied.tts_engine == "piper"
    assert applied.tts_output_dir == "/tmp/output"
