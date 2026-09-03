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


def test_validate_login_normalizes_a_typed_access_token():
    assert validate_login({"token": " a7k2-qf "}) == "A7K2QF"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"token": "A7K2Q"},
        {"token": "A7K2QFX"},
        {"token": 424242},
        # 0/O/1/I/L never appear in a generated token, so they cannot be one.
        {"token": "A7K2Q0"},
    ],
)
def test_validate_login_rejects_tokens_of_the_wrong_shape(payload):
    with pytest.raises(ValidationError, match="token"):
        validate_login(payload)


def test_validate_user_accepts_every_role():
    assert validate_user({"username": " alice ", "role": "admin"}) == ("alice", "admin")
    assert validate_user({"username": "alice", "role": "player"}) == ("alice", "player")


@pytest.mark.parametrize(
    "payload, message",
    [
        ({}, "'username' is required"),
        ({"username": 42, "role": "player"}, "'username' must be a string"),
        ({"username": "alice", "role": "owner"}, "role"),
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
