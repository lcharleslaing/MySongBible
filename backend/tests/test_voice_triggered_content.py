from sqlmodel import Session

from app.core.config import get_settings
from app.models.voice_triggered_content import SessionContentBlock, TranscriptSegment, TriggerActivationEvent, VoiceTriggerAsset, VoiceTriggerDefinition
from app.services.stt import clean_transcription_text
from app.services.voice_triggered_content import normalize_phrase


def test_trigger_crud_alias_matching_and_false_positive_prevention(client) -> None:
    response = client.post(
        "/api/listen-commands/triggers",
        json={
            "primary_phrase": "Ace of Swords",
            "aliases": ["The Ace of Swords", "Ace Swords"],
            "title": "Ace of Swords",
            "description": "Clarity and force.",
            "match_mode": "whole_phrase",
        },
    )

    assert response.status_code == 201
    trigger = response.json()
    assert trigger["aliases"][0]["trigger_id"] == trigger["id"]

    segment = client.post("/api/listen-commands/sessions", json={"title": "Reading", "status": "active"}).json()
    append_response = client.post(
        f"/api/listen-commands/sessions/{segment['id']}/segments",
        json={"text": "I began with the ace of swords today.", "is_final": True, "source": "simulated"},
    )
    assert append_response.status_code == 201
    assert len(append_response.json()["activations"]) == 1

    number = client.post(
        "/api/listen-commands/triggers",
        json={"primary_phrase": "1968", "title": "1968", "description": "A year."},
    ).json()
    assert number["primary_phrase"] == "1968"

    no_match = client.post(
        f"/api/listen-commands/sessions/{segment['id']}/segments",
        json={"text": "The reference code was x196812.", "is_final": True, "source": "simulated"},
    )
    assert no_match.status_code == 201
    assert len(no_match.json()["activations"]) == 0


def test_blank_audio_markers_are_not_persisted(client) -> None:
    session = client.post("/api/listen-commands/sessions", json={"title": "Silence", "status": "active"}).json()
    response = client.post(
        f"/api/listen-commands/sessions/{session['id']}/segments",
        json={"text": "[BLANK_AUDIO]", "is_final": True, "source": "simulated"},
    )

    assert response.status_code == 422
    reopened = client.get(f"/api/listen-commands/sessions/{session['id']}").json()
    assert reopened["segments"] == []
    assert reopened["blocks"] == []


def test_stt_cleaner_removes_known_non_speech_markers() -> None:
    assert clean_transcription_text("[BLANK_AUDIO]") == ""
    assert clean_transcription_text("[SILENCE]") == ""
    assert clean_transcription_text("I love myself. [BLANK_AUDIO]") == "I love myself."
    assert clean_transcription_text("[SILENCE] I love myself. (music)") == "I love myself."
    assert clean_transcription_text(" ... ") == ""
    assert clean_transcription_text(" Sample sample. ") == "Sample sample."


def test_command_phrase_is_replaced_inside_surrounding_speech(client) -> None:
    client.post(
        "/api/listen-commands/triggers",
        json={
            "primary_phrase": "Sample Sample",
            "title": "Sample Sample",
            "description": "This is the saved description for the Sample Sample command.",
        },
    )
    session = client.post("/api/listen-commands/sessions", json={"title": "Live test", "status": "active"}).json()
    response = client.post(
        f"/api/listen-commands/sessions/{session['id']}/segments",
        json={
            "text": "This is the beginning of my test. Sample Sample. Now I am continuing after the command.",
            "is_final": True,
            "source": "simulated",
        },
    )

    assert response.status_code == 201
    blocks = response.json()["session"]["blocks"]
    assert [block["block_type"] for block in blocks] == ["transcript", "trigger", "transcript"]
    assert blocks[0]["content"] == "This is the beginning of my test."
    assert blocks[1]["title"] == "Sample Sample"
    assert blocks[1]["content"] == "This is the saved description for the Sample Sample command."
    assert blocks[2]["content"] == "Now I am continuing after the command."
    assert "Sample Sample" not in blocks[0]["content"]
    assert "Sample Sample" not in blocks[2]["content"]


def test_speech_and_manual_commands_can_be_inserted_at_a_block_caret(client) -> None:
    trigger = client.post(
        "/api/listen-commands/triggers",
        json={"primary_phrase": "Saved Command", "title": "Saved Command", "description": "Reusable content."},
    ).json()
    session = client.post("/api/listen-commands/sessions", json={"title": "Caret test", "status": "active"}).json()
    initial = client.post(
        f"/api/listen-commands/sessions/{session['id']}/segments",
        json={"text": "Before after", "is_final": True, "source": "simulated"},
    ).json()
    target = initial["session"]["blocks"][0]

    inserted_speech = client.post(
        f"/api/listen-commands/sessions/{session['id']}/segments",
        json={
            "text": "middle",
            "is_final": True,
            "source": "simulated",
            "insertion_block_id": target["id"],
            "insertion_offset": 7,
        },
    )
    assert inserted_speech.status_code == 201
    assert [block["content"] for block in inserted_speech.json()["session"]["blocks"]] == [
        "Before ",
        "middle",
        "after",
    ]

    inserted_command = client.post(
        f"/api/listen-commands/sessions/{session['id']}/triggers/{trigger['id']}",
        json={"insertion_block_id": target["id"], "insertion_offset": 0},
    )
    assert inserted_command.status_code == 201
    reopened = client.get(f"/api/listen-commands/sessions/{session['id']}").json()
    assert [block["block_type"] for block in reopened["blocks"]] == [
        "transcript",
        "transcript",
        "trigger",
        "transcript",
    ]
    assert reopened["blocks"][2]["content"] == "Reusable content."


def test_snapshots_survive_trigger_edits_and_delete(client) -> None:
    trigger = client.post(
        "/api/listen-commands/triggers",
        json={"primary_phrase": "Ace of Pentacles", "title": "Ace of Pentacles", "description": "Original content."},
    ).json()
    session = client.post("/api/listen-commands/sessions", json={"title": "Reading", "status": "active"}).json()

    activated = client.post(
        f"/api/listen-commands/sessions/{session['id']}/segments",
        json={"text": "Then I pulled Ace of Pentacles.", "is_final": True, "source": "simulated"},
    ).json()
    assert activated["activations"][0]["snapshot_content"] == "Original content."

    client.patch(
        f"/api/listen-commands/triggers/{trigger['id']}",
        json={"description": "Updated library content."},
    )
    reopened = client.get(f"/api/listen-commands/sessions/{session['id']}").json()
    assert reopened["activations"][0]["snapshot_content"] == "Original content."
    assert reopened["blocks"][1]["content"] == "Original content."

    delete_response = client.delete(f"/api/listen-commands/triggers/{trigger['id']}")
    assert delete_response.status_code == 204
    historical = client.get(f"/api/listen-commands/sessions/{session['id']}").json()
    assert historical["activations"][0]["snapshot_title"] == "Ace of Pentacles"


def test_session_delete_removes_session_document_records(client) -> None:
    client.post(
        "/api/listen-commands/triggers",
        json={"primary_phrase": "Sample Sample", "title": "Sample Sample", "description": "Saved content."},
    )
    session = client.post("/api/listen-commands/sessions", json={"title": "Delete me", "status": "active"}).json()
    client.post(
        f"/api/listen-commands/sessions/{session['id']}/segments",
        json={"text": "Before Sample Sample after.", "is_final": True, "source": "simulated"},
    )

    response = client.delete(f"/api/listen-commands/sessions/{session['id']}")

    assert response.status_code == 204
    assert client.get(f"/api/listen-commands/sessions/{session['id']}").status_code == 404
    with Session(client.engine) as db_session:
        assert db_session.get(TranscriptSegment, 1) is None
        assert db_session.get(SessionContentBlock, 1) is None
        assert db_session.get(TriggerActivationEvent, 1) is None


def test_interim_segments_do_not_activate_and_repeated_final_segments_respect_cooldown(client) -> None:
    trigger = client.post(
        "/api/listen-commands/triggers",
        json={"primary_phrase": "1968", "title": "1968", "duplicate_cooldown_seconds": 30},
    ).json()
    session = client.post("/api/listen-commands/sessions", json={"title": "Numbers", "status": "active"}).json()

    interim = client.post(
        f"/api/listen-commands/sessions/{session['id']}/segments",
        json={"text": "1968", "is_final": False, "source": "simulated"},
    ).json()
    assert interim["activations"] == []

    first = client.post(
        f"/api/listen-commands/sessions/{session['id']}/segments",
        json={"text": "1968", "is_final": True, "source": "simulated"},
    ).json()
    second = client.post(
        f"/api/listen-commands/sessions/{session['id']}/segments",
        json={"text": "1968", "is_final": True, "source": "simulated"},
    ).json()
    assert len(first["activations"]) == 1
    assert second["activations"] == []
    assert trigger["id"] == first["activations"][0]["trigger_id"]


def test_simulated_transcript_integration_order(client) -> None:
    client.post(
        "/api/listen-commands/triggers",
        json={"primary_phrase": "Ace of Swords", "title": "Ace of Swords", "description": "Configured swords."},
    )
    client.post(
        "/api/listen-commands/triggers",
        json={"primary_phrase": "Ace of Pentacles", "title": "Ace of Pentacles", "description": "Configured pentacles."},
    )
    session = client.post("/api/listen-commands/sessions", json={"title": "Reading", "status": "active"}).json()
    response = client.post(
        f"/api/listen-commands/sessions/{session['id']}/segments",
        json={
            "text": "I began the reading with Ace of Swords. I spoke about what it meant. Then I pulled Ace of Pentacles.",
            "is_final": True,
            "source": "simulated",
        },
    )
    body = response.json()
    titles = [activation["snapshot_title"] for activation in body["activations"]]
    block_types = [block["block_type"] for block in body["session"]["blocks"]]
    block_contents = [block["content"] for block in body["session"]["blocks"]]

    assert titles == ["Ace of Swords", "Ace of Pentacles"]
    assert block_types == ["transcript", "trigger", "transcript", "trigger"]
    assert block_contents[0] == "I began the reading with"
    assert block_contents[1] == "Configured swords."
    assert block_contents[2] == "I spoke about what it meant. Then I pulled"
    assert block_contents[3] == "Configured pentacles."


def test_service_persistence_restart_and_managed_image_metadata(client, tmp_path) -> None:
    trigger = client.post(
        "/api/listen-commands/triggers",
        json={"primary_phrase": "Image Trigger", "title": "Image Trigger"},
    ).json()
    image_response = client.post(
        f"/api/listen-commands/triggers/{trigger['id']}/image",
        files={"image_file": ("card.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert image_response.status_code == 201
    asset = image_response.json()
    assert asset["managed_relative_path"].startswith("listen-commands/images/")
    assert not asset["managed_relative_path"].startswith("/")

    with Session(client.engine) as db_session:
        persisted_trigger = db_session.get(VoiceTriggerDefinition, trigger["id"])
        persisted_asset = db_session.get(VoiceTriggerAsset, asset["id"])
        assert persisted_trigger is not None
        assert persisted_trigger.image_asset_id == asset["id"]
        assert persisted_asset is not None
        assert persisted_asset.original_filename == "card.png"

    stored_path = get_settings().app_data_dir / asset["managed_relative_path"]
    assert stored_path.exists()
    assert normalize_phrase("  Ace   of Swords. ") == "ace of swords"
