from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.services.settings import SettingsService
from app.api.dependencies import get_settings_service

router = APIRouter(tags=["audio"])


@router.get("/audio/tts/{filename}")
async def get_tts_audio(
    filename: str,
    settings_service: SettingsService = Depends(get_settings_service),
) -> Response:
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid audio filename.")

    settings = settings_service.get_runtime_settings()
    output_dir = settings.audio_tts_dir.resolve()
    candidate = (output_dir / safe_name).resolve()

    if output_dir not in candidate.parents and candidate != output_dir:
        raise HTTPException(status_code=400, detail="Invalid audio path.")
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found.")

    return Response(
        content=candidate.read_bytes(),
        media_type="audio/wav",
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )
