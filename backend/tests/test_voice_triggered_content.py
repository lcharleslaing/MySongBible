from sqlmodel import Session

from app.core.config import get_settings
from app.models.voice_triggered_content import TriggerActivationEvent, VoiceTriggerAsset, VoiceTriggerDefinition
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

    assert titles == ["Ace of Swords", "Ace of Pentacles"]
    assert block_types == ["transcript", "trigger", "trigger"]


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
