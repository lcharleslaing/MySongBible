from sqlalchemy import Index, UniqueConstraint
from sqlmodel import Field, SQLModel


class Song(SQLModel, table=True):
    __tablename__ = "song"
    __table_args__ = (
        Index("ix_song_title_simple", "title_simple"),
        Index("ix_song_title_jewish", "title_jewish"),
        Index("ix_song_title_gematria", "title_jewish", "title_english", "title_simple"),
        Index("ix_song_lyrics_simple", "lyrics_simple"),
        Index("ix_song_lyrics_jewish", "lyrics_jewish"),
        Index("ix_song_lyrics_gematria", "lyrics_jewish", "lyrics_english", "lyrics_simple"),
    )

    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(index=True, max_length=500)
    created_at: str | None = Field(default=None, max_length=64)
    creation_date_source: str | None = Field(default=None, max_length=100)
    audio_filename: str | None = Field(default=None, max_length=500)
    audio_path: str | None = None
    audio_relative_path: str | None = None
    audio_format: str | None = Field(default=None, max_length=32)
    audio_size_bytes: int | None = None
    transcript_source: str | None = Field(default=None, index=True, max_length=32)
    lyric_available: bool = Field(default=False, index=True)
    likely_processing_artifact: bool = Field(default=False, index=True)
    title_jewish: int = Field(default=0)
    title_english: int = Field(default=0)
    title_simple: int = Field(default=0)
    lyrics_jewish: int | None = None
    lyrics_english: int | None = None
    lyrics_simple: int | None = None
    combined_jewish: int = Field(default=0)
    combined_english: int = Field(default=0)
    combined_simple: int = Field(default=0)
    title_word_count: int = Field(default=0)
    lyric_word_count: int = Field(default=0)
    total_word_count: int = Field(default=0)
    unique_word_count: int = Field(default=0)


class SongTranscript(SQLModel, table=True):
    __tablename__ = "song_transcript"
    __table_args__ = (
        UniqueConstraint("song_id", "source", "canonical", name="uq_song_transcript_song_source_canonical"),
    )

    id: int | None = Field(default=None, primary_key=True)
    song_id: int = Field(foreign_key="song.id", index=True)
    source: str = Field(max_length=32)
    content: str
    source_path: str | None = None
    source_relative_path: str | None = None
    canonical: bool = Field(default=True, index=True)


class Word(SQLModel, table=True):
    __tablename__ = "word"
    __table_args__ = (
        Index("ix_word_simple", "simple"),
        Index("ix_word_jewish", "jewish"),
        Index("ix_word_gematria", "jewish", "english", "simple"),
    )

    id: int | None = Field(default=None, primary_key=True)
    word: str = Field(unique=True, index=True, max_length=255)
    jewish: int = Field(default=0)
    english: int = Field(default=0)
    simple: int = Field(default=0)
    total_occurrences: int = Field(default=0)
    song_count: int = Field(default=0)


class SongWord(SQLModel, table=True):
    __tablename__ = "song_word"
    __table_args__ = (
        UniqueConstraint("song_id", "word_id", name="uq_song_word_song_word"),
        Index("ix_song_word_song_id", "song_id"),
        Index("ix_song_word_word_id", "word_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    song_id: int = Field(foreign_key="song.id")
    word_id: int = Field(foreign_key="word.id")
    occurrences: int = Field(default=0)


class LyricLine(SQLModel, table=True):
    __tablename__ = "lyric_line"
    __table_args__ = (
        UniqueConstraint("song_id", "line_number", name="uq_lyric_line_song_line"),
        Index("ix_lyric_line_song_id", "song_id"),
        Index("ix_lyric_line_simple", "simple"),
        Index("ix_lyric_line_jewish", "jewish"),
        Index("ix_lyric_line_gematria", "jewish", "english", "simple"),
        Index("ix_lyric_line_normalized_text", "normalized_text"),
    )

    id: int | None = Field(default=None, primary_key=True)
    song_id: int = Field(foreign_key="song.id")
    line_number: int
    text: str
    normalized_text: str
    word_count: int = Field(default=0)
    letter_count: int = Field(default=0)
    jewish: int = Field(default=0)
    english: int = Field(default=0)
    simple: int = Field(default=0)


class LineWord(SQLModel, table=True):
    __tablename__ = "line_word"
    __table_args__ = (
        UniqueConstraint("line_id", "position", name="uq_line_word_line_position"),
        Index("ix_line_word_line_id", "line_id"),
        Index("ix_line_word_word_id", "word_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    line_id: int = Field(foreign_key="lyric_line.id")
    word_id: int = Field(foreign_key="word.id")
    position: int


class SongSection(SQLModel, table=True):
    __tablename__ = "song_section"
    __table_args__ = (
        UniqueConstraint("song_id", "section_number", name="uq_song_section_song_section"),
        Index("ix_song_section_song_id", "song_id"),
        Index("ix_song_section_simple", "simple"),
        Index("ix_song_section_jewish", "jewish"),
        Index("ix_song_section_gematria", "jewish", "english", "simple"),
    )

    id: int | None = Field(default=None, primary_key=True)
    song_id: int = Field(foreign_key="song.id")
    section_number: int
    section_type: str = Field(max_length=64)
    label: str = Field(max_length=255)
    start_line: int = Field(default=0)
    end_line: int = Field(default=0)
    jewish: int = Field(default=0)
    english: int = Field(default=0)
    simple: int = Field(default=0)
