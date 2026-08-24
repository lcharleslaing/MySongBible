from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.api.dependencies import get_session
from app.schemas.song_catalog import (
    CollisionResponse,
    LyricLineListResponse,
    MatchResponse,
    NumericSearchRequest,
    NumericSearchResponse,
    SongDetail,
    SongListResponse,
    WordDetail,
    WordListResponse,
)
from app.services.song_catalog_queries import DEFAULT_LIMIT, MAX_LIMIT, SongCatalogQueryService

router = APIRouter(prefix="/song-catalog", tags=["song catalog"])


@router.get("/songs", response_model=SongListResponse)
async def list_songs(
    search: str | None = None,
    lyrics: Literal["all", "with", "without"] = "all",
    include_artifacts: bool = True,
    only_artifacts: bool = False,
    sort: Literal["title", "created_at"] = "title",
    direction: Literal["asc", "desc"] = "asc",
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> SongListResponse:
    return SongCatalogQueryService(session).list_songs(
        search=search,
        lyrics=lyrics,
        include_artifacts=include_artifacts,
        only_artifacts=only_artifacts,
        sort=sort,
        direction=direction,
        limit=limit,
        offset=offset,
    )


@router.get("/songs/{song_id}", response_model=SongDetail)
async def get_song(
    song_id: int,
    include_transcript: bool = False,
    session: Session = Depends(get_session),
) -> SongDetail:
    song = SongCatalogQueryService(session).get_song(song_id, include_transcript=include_transcript)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    return song


@router.get("/words", response_model=WordListResponse)
async def list_words(
    search: str | None = None,
    exact: str | None = None,
    simple: int | None = None,
    jewish: int | None = None,
    english: int | None = None,
    min_song_count: int | None = Query(default=None, ge=0),
    sort: Literal["word", "frequency", "song_count"] = "word",
    direction: Literal["asc", "desc"] = "asc",
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> WordListResponse:
    return SongCatalogQueryService(session).list_words(
        search=search,
        exact=exact,
        simple=simple,
        jewish=jewish,
        english=english,
        min_song_count=min_song_count,
        sort=sort,
        direction=direction,
        limit=limit,
        offset=offset,
    )


@router.get("/words/{word}", response_model=WordDetail)
async def get_word(
    word: str,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> WordDetail:
    detail = SongCatalogQueryService(session).get_word(word, limit=limit, offset=offset)
    if detail is None:
        raise HTTPException(status_code=404, detail="Word not found")
    return detail


@router.get("/lines", response_model=LyricLineListResponse)
async def search_lines(
    text: str | None = None,
    song_id: int | None = None,
    simple: int | None = None,
    jewish: int | None = None,
    english: int | None = None,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> LyricLineListResponse:
    return SongCatalogQueryService(session).search_lines(
        text_query=text,
        song_id=song_id,
        simple=simple,
        jewish=jewish,
        english=english,
        limit=limit,
        offset=offset,
    )


@router.get("/collisions/{entity_type}", response_model=CollisionResponse)
async def collisions(
    entity_type: Literal["word", "title", "line"],
    different_text: bool = True,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> CollisionResponse:
    return SongCatalogQueryService(session).collisions(
        entity_type,
        different_text=different_text,
        limit=limit,
        offset=offset,
    )


@router.get("/matches/{match_type}", response_model=MatchResponse)
async def cross_type_matches(
    match_type: Literal["title-line", "word-title", "word-line"],
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> MatchResponse:
    return SongCatalogQueryService(session).cross_type_matches(match_type, limit=limit, offset=offset)


@router.get("/songs/{song_id}/matches", response_model=MatchResponse)
async def song_matches(
    song_id: int,
    include_line_matches: bool = False,
    limit: int = Query(default=25, ge=1, le=MAX_LIMIT),
    session: Session = Depends(get_session),
) -> MatchResponse:
    result = SongCatalogQueryService(session).song_related(song_id, include_line_matches=include_line_matches, limit=limit)
    if result is None:
        raise HTTPException(status_code=404, detail="Song not found")
    return {"items": [result], "page": None}


@router.post("/numeric-search", response_model=NumericSearchResponse)
async def numeric_search(
    payload: NumericSearchRequest,
    session: Session = Depends(get_session),
) -> NumericSearchResponse:
    if payload.jewish is None and payload.english is None and payload.simple is None:
        raise HTTPException(status_code=422, detail="At least one Gematria value is required")
    return SongCatalogQueryService(session).numeric_search(
        jewish=payload.jewish,
        english=payload.english,
        simple=payload.simple,
        entity_types=payload.entity_types,
        limit=payload.limit,
        offset=payload.offset,
    )
