from pydantic import BaseModel, Field


class GematriaValues(BaseModel):
    jewish: int | None = None
    english: int | None = None
    simple: int | None = None


class PageMeta(BaseModel):
    total: int
    limit: int
    offset: int


class SongSummary(BaseModel):
    id: int
    title: str
    created_at: str | None = None
    transcript_source: str | None = None
    lyric_available: bool
    likely_processing_artifact: bool
    title_gematria: GematriaValues
    lyrics_gematria: GematriaValues
    combined_gematria: GematriaValues
    total_word_count: int
    unique_word_count: int


class SongListResponse(BaseModel):
    items: list[SongSummary]
    page: PageMeta


class LyricLineRead(BaseModel):
    id: int
    song_id: int
    song_title: str | None = None
    line_number: int
    text: str
    normalized_text: str
    word_count: int
    letter_count: int
    gematria: GematriaValues


class SongDetail(SongSummary):
    audio_filename: str | None = None
    audio_path: str | None = None
    audio_relative_path: str | None = None
    audio_format: str | None = None
    audio_size_bytes: int | None = None
    title_word_count: int
    lyric_word_count: int
    lines: list[LyricLineRead] = Field(default_factory=list)
    canonical_transcript: str | None = None


class WordRead(BaseModel):
    id: int
    word: str
    total_occurrences: int
    song_count: int
    gematria: GematriaValues


class WordListResponse(BaseModel):
    items: list[WordRead]
    page: PageMeta


class WordSongOccurrence(BaseModel):
    song_id: int
    title: str
    occurrences: int


class WordDetail(WordRead):
    songs: list[WordSongOccurrence]


class LyricLineListResponse(BaseModel):
    items: list[LyricLineRead]
    page: PageMeta


class CollisionGroup(BaseModel):
    jewish: int
    english: int
    simple: int
    count: int
    items: list[dict]


class CollisionResponse(BaseModel):
    items: list[CollisionGroup]
    page: PageMeta


class MatchResponse(BaseModel):
    items: list[dict]
    page: PageMeta | None = None


class NumericSearchRequest(BaseModel):
    jewish: int | None = None
    english: int | None = None
    simple: int | None = None
    entity_types: list[str] = Field(default_factory=lambda: ["word", "title", "line", "lyrics", "title_plus_lyrics"])
    limit: int = 50
    offset: int = 0


class NumericSearchResponse(BaseModel):
    results: dict[str, list[dict]]
    page: PageMeta
