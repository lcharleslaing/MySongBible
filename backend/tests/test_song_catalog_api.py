from sqlmodel import Session

from app.models.song_catalog import LyricLine, Song, SongTranscript, SongWord, Word


def seed_catalog(client) -> None:
    with Session(client.engine) as session:
        love = Word(id=1, word="love", jewish=775, english=324, simple=54, total_occurrences=4, song_count=2)
        await_word = Word(id=2, word="await", jewish=1011, english=324, simple=54, total_occurrences=1, song_count=1)
        nashville = Word(id=3, word="nashville", jewish=893, english=612, simple=102, total_occurrences=2, song_count=1)
        i_word = Word(id=4, word="i", jewish=9, english=54, simple=9, total_occurrences=1, song_count=1)
        ah = Word(id=5, word="ah", jewish=9, english=54, simple=9, total_occurrences=1, song_count=1)
        session.add_all([love, await_word, nashville, i_word, ah])

        song = Song(
            id=1,
            title="02-We Actually Made It To Nashville",
            created_at="2026-01-01T00:00:00+00:00",
            creation_date_source="test",
            audio_filename="nashville.mp3",
            transcript_source="txt",
            lyric_available=True,
            title_jewish=2842,
            title_english=1872,
            title_simple=312,
            lyrics_jewish=2860,
            lyrics_english=1980,
            lyrics_simple=330,
            combined_jewish=5702,
            combined_english=3852,
            combined_simple=642,
            title_word_count=5,
            lyric_word_count=3,
            total_word_count=8,
            unique_word_count=3,
        )
        love_song = Song(
            id=2,
            title="Love",
            created_at="2026-01-02T00:00:00+00:00",
            creation_date_source="test",
            transcript_source="txt",
            lyric_available=True,
            title_jewish=775,
            title_english=324,
            title_simple=54,
            lyrics_jewish=9,
            lyrics_english=54,
            lyrics_simple=9,
            combined_jewish=784,
            combined_english=378,
            combined_simple=63,
            title_word_count=1,
            lyric_word_count=1,
            total_word_count=2,
            unique_word_count=2,
        )
        unavailable = Song(
            id=3,
            title="phase2",
            created_at="2026-01-03T00:00:00+00:00",
            creation_date_source="test",
            lyric_available=False,
            likely_processing_artifact=True,
            title_jewish=368,
            title_english=330,
            title_simple=55,
            combined_jewish=368,
            combined_english=330,
            combined_simple=55,
        )
        session.add_all([song, love_song, unavailable])
        session.add_all([
            SongTranscript(song_id=1, source="txt", content="We actually made it to Nashville.\nI", canonical=True),
            SongTranscript(song_id=2, source="txt", content="Ah", canonical=True),
        ])
        line1 = LyricLine(
            id=1,
            song_id=1,
            line_number=1,
            text="We actually made it to Nashville.",
            normalized_text="we actually made it to nashville",
            word_count=6,
            letter_count=29,
            jewish=2842,
            english=1872,
            simple=312,
        )
        line2 = LyricLine(
            id=2,
            song_id=1,
            line_number=2,
            text="I",
            normalized_text="i",
            word_count=1,
            letter_count=1,
            jewish=9,
            english=54,
            simple=9,
        )
        line3 = LyricLine(
            id=3,
            song_id=2,
            line_number=1,
            text="Ah",
            normalized_text="ah",
            word_count=1,
            letter_count=2,
            jewish=9,
            english=54,
            simple=9,
        )
        session.add_all([line1, line2, line3])
        session.add_all([
            SongWord(song_id=1, word_id=1, occurrences=1),
            SongWord(song_id=1, word_id=3, occurrences=2),
            SongWord(song_id=2, word_id=1, occurrences=3),
            SongWord(song_id=2, word_id=5, occurrences=1),
        ])
        session.commit()


def test_song_list_and_pagination(client) -> None:
    seed_catalog(client)
    response = client.get("/api/song-catalog/songs?limit=2&offset=0&sort=title")
    assert response.status_code == 200
    payload = response.json()
    assert payload["page"] == {"total": 3, "limit": 2, "offset": 0}
    assert len(payload["items"]) == 2


def test_song_detail_with_transcript(client) -> None:
    seed_catalog(client)
    response = client.get("/api/song-catalog/songs/1?include_transcript=true")
    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "02-We Actually Made It To Nashville"
    assert payload["canonical_transcript"].startswith("We actually made it")
    assert payload["lines"][0]["gematria"]["simple"] == 312


def test_invalid_song_id(client) -> None:
    seed_catalog(client)
    response = client.get("/api/song-catalog/songs/999")
    assert response.status_code == 404


def test_lyric_unavailable_song_filter(client) -> None:
    seed_catalog(client)
    response = client.get("/api/song-catalog/songs?lyrics=without")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "phase2"
    assert items[0]["likely_processing_artifact"] is True


def test_word_search_and_gematria_lookup(client) -> None:
    seed_catalog(client)
    response = client.get("/api/song-catalog/words?simple=54&sort=word")
    assert response.status_code == 200
    words = [item["word"] for item in response.json()["items"]]
    assert words == ["await", "love"]

    detail = client.get("/api/song-catalog/words/love")
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["gematria"] == {"jewish": 775, "english": 324, "simple": 54}
    assert len(payload["songs"]) == 2


def test_line_search(client) -> None:
    seed_catalog(client)
    response = client.get("/api/song-catalog/lines?text=Nashville")
    assert response.status_code == 200
    payload = response.json()
    assert payload["page"]["total"] == 1
    assert payload["items"][0]["line_number"] == 1


def test_exact_line_collision(client) -> None:
    seed_catalog(client)
    response = client.get("/api/song-catalog/collisions/line")
    assert response.status_code == 200
    groups = response.json()["items"]
    assert groups[0]["simple"] == 9
    assert groups[0]["count"] == 2


def test_title_line_match(client) -> None:
    seed_catalog(client)
    response = client.get("/api/song-catalog/matches/title-line")
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["title"] == "02-We Actually Made It To Nashville"
    assert item["text"] == "We actually made it to Nashville."
    assert item["jewish"] == 2842
    assert item["english"] == 1872
    assert item["simple"] == 312


def test_numeric_search(client) -> None:
    seed_catalog(client)
    response = client.post(
        "/api/song-catalog/numeric-search",
        json={"simple": 54, "entity_types": ["word", "title", "line"], "limit": 10},
    )
    assert response.status_code == 200
    payload = response.json()["results"]
    assert [item["word"] for item in payload["word"]] == ["love", "await"]
    assert payload["title"][0]["title"] == "Love"

    line_response = client.post(
        "/api/song-catalog/numeric-search",
        json={"simple": 9, "entity_types": ["line"], "limit": 10},
    )
    assert line_response.status_code == 200
    assert len(line_response.json()["results"]["line"]) == 2
