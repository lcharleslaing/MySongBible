from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    app_name: str
    backend_version: str
    identity: str
    runtime_directory: str
    database: dict[str, object]
    whisper: dict[str, object]
    piper: dict[str, object]
    local_ai_chat: dict[str, object]
