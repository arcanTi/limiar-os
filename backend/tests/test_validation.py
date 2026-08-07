import pytest

from backend.domain.validation import (
    ValidationError,
    sanitize_payload,
    sanitize_text,
    validate_character,
    validate_chat,
    validate_hq,
    validate_item,
    validate_login,
    validate_map_location,
    validate_user,
)


def test_validate_login_accepts_required_credentials_without_stripping_password():
    assert validate_login({"username": " alice ", "password": "  secret  "}) == (
        "alice",
        "  secret  ",
    )


@pytest.mark.parametrize(
    "payload, message",
    [
        ({}, "'username' is required"),
        ({"username": "alice"}, "'password' is required"),
        ({"username": 42, "password": "secret"}, "'username' must be a string"),
    ],
)
def test_validate_login_rejects_invalid_payloads(payload, message):
    with pytest.raises(ValidationError, match=message):
        validate_login(payload)


def test_validate_user_accepts_roles_and_optional_password_for_existing_users():
    assert validate_user({"username": "alice", "password": "password-123", "role": "admin"}) == (
        "alice",
        "password-123",
        "admin",
    )
    assert validate_user(
        {"username": "alice", "password": "", "role": "player"},
        password_optional=True,
    ) == (
        "alice",
        None,
        "player",
    )


@pytest.mark.parametrize(
    "payload, message",
    [
        ({"username": "alice", "password": "short", "role": "player"}, "password"),
        ({"username": "alice", "password": "password-123", "role": "owner"}, "role"),
        ({"username": "alice", "role": "player"}, "password"),
    ],
)
def test_validate_user_rejects_invalid_payloads(payload, message):
    with pytest.raises(ValidationError, match=message):
        validate_user(payload)


def test_record_validators_accept_valid_payloads():
    validate_character({"name": "Mira", "level": 5})
    validate_item({"name": "Pistol", "price": 100})
    validate_map_location({"name": "Afterlife"})
    validate_chat({"kind": "roll", "sender": "Mira", "text": "2d6", "at": "now"})
    assert validate_hq({"ip": 10, "log": []}) == {"ip": 10, "log": []}


@pytest.mark.parametrize(
    "validator, payload, message",
    [
        (validate_character, {"level": 1}, "name"),
        (validate_character, {"name": "Mira", "level": True}, "level"),
        (validate_item, {"name": "Pistol", "price": "100"}, "price"),
        (validate_map_location, {"name": ""}, "name"),
        (validate_chat, {"kind": "bad"}, "kind"),
        (validate_hq, {"ip": True}, "ip"),
        (validate_hq, {"ip": 1, "log": "bad"}, "log"),
    ],
)
def test_record_validators_reject_invalid_payloads(validator, payload, message):
    with pytest.raises(ValidationError, match=message):
        validator(payload)


def test_sanitize_text_and_payload_strip_control_characters_and_limit_length():
    assert sanitize_text("ab\x00cd", max_len=3) == "abc"
    assert sanitize_payload({"note": "ok\x00", "rows": ["a\x1fb"]}) == {
        "note": "ok",
        "rows": ["ab"],
    }
