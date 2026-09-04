import pytest

from backend.domain.validation import (
    ValidationError,
    sanitize_payload,
    sanitize_text,
    validate_character,
    validate_character_creation,
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


def _legal_base(**overrides):
    base = {"INT": 6, "REF": 8, "DEX": 6, "TECH": 6, "COOL": 6, "WILL": 7, "LUCK": 5, "MOVE": 6, "BODY": 8, "EMP": 4}
    base.update(overrides)
    return base


def test_character_creation_accepts_the_complete_package():
    validate_character_creation({"name": "V", "base": _legal_base(), "skills": [
        {"name": "Athletics", "level": 4},
        {"name": "Handgun", "level": 6},
        {"name": "Pilot Air Vehicle", "level": 3, "difficult": True},
    ]})


def test_character_creation_rejects_a_rolled_stat_above_ten_but_allows_nine():
    rolled = {"creation": {"method": "roll", "statRolls": 10}, "base": _legal_base(INT=9)}
    validate_character_creation({"name": "V", **rolled})


def test_character_creation_skips_fields_that_are_absent():
    validate_character_creation({"name": "minimal"})


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"base": _legal_base(INT=9)}, "'base.INT' must be between 2 and 8"),
        ({"base": _legal_base(LUCK=9, REF=4)}, "'base.LUCK' must be between 2 and 8"),
        ({"base": _legal_base(EMP=1)}, "'base.EMP' must be between 2 and 8"),
        ({"base": _legal_base(EMP=8)}, "spends 66 points; the limit is 62"),
        ({"base": _legal_base(INT="6")}, "'base.INT' must be an integer"),
        ({"base": []}, "'base' must be an object"),
        ({"skills": [{"name": "Handgun", "level": 7}]}, "must be between 0 and 6"),
        ({"skills": [{"name": "Handgun", "level": 1}]}, "must be 0 or at least 2"),
        ({"skills": [{"name": "Athletics", "level": 1}]}, "must be at least 2"),
        ({"skills": [{"name": f"S{i}", "level": 6} for i in range(11)]}, "spend 66 points; the limit is 60"),
        ({"skills": [{"name": "Language (Japanese)", "level": 4, "origin": True}]}, "claims the origin language"),
        (
            {"creation": {"originLanguage": "Japanese"}, "skills": [{"name": "Language (Spanish)", "level": 4, "origin": True}]},
            "claims the origin language",
        ),
        (
            {"creation": {"originLanguage": "Japanese"}, "skills": [{"name": "Language (Japanese)", "level": 3, "origin": True}]},
            "must be at least 4",
        ),
        ({"creation": {"method": "wish"}}, "'creation.method' must be one of"),
        ({"creation": {"method": "roll"}}, "'creation.statRolls' must be at least 10"),
        ({"creation": {"method": "roll", "statRolls": 3}}, "'creation.statRolls' must be at least 10"),
        ({"creation": {"method": "roll", "statRolls": -1}}, "non-negative"),
        ({"creation": {"method": "roll", "statRolls": 10, "statRerolls": "2"}}, "'creation.statRerolls'"),
    ],
)
def test_character_creation_rejects_illegal_spreads(payload, message):
    with pytest.raises(ValidationError) as caught:
        validate_character_creation({"name": "V", **payload})
    assert any(message in error for error in caught.value.errors)


def test_character_creation_lets_rolled_stats_exceed_the_point_budget():
    rolled = {"creation": {"method": "roll", "statRolls": 12, "statRerolls": 2}, "base": _legal_base(INT=10, BODY=10, EMP=9)}
    validate_character_creation({"name": "V", **rolled})
    with pytest.raises(ValidationError):
        validate_character_creation({"name": "V", **rolled, "base": _legal_base(INT=11)})


def test_character_creation_origin_language_is_free_and_raisable():
    payload = {
        "name": "V",
        "creation": {"originLanguage": "Japanese"},
        "skills": [{"name": "Language (Japanese)", "level": 6, "origin": True}]
        + [{"name": f"S{i}", "level": 6} for i in range(9)],  # 54 + 2 above the free 4 = 56
    }
    validate_character_creation(payload)
    payload["skills"].append({"name": "S9", "level": 6})  # 62 > 60
    with pytest.raises(ValidationError):
        validate_character_creation(payload)


def test_character_creation_free_skill_levels_do_not_count():
    # Thirteen default skills at 2 cost nothing; only levels above 2 spend.
    defaults = [
        {"name": name, "level": 2}
        for name in ("Athletics", "Brawling", "Concentration", "Conversation", "Education", "Evasion", "First Aid",
                     "Human Perception", "Language (Streetslang)", "Local Expert (Your Home)", "Perception",
                     "Persuasion", "Stealth")
    ]
    validate_character_creation({"name": "V", "skills": defaults + [{"name": f"S{i}", "level": 6} for i in range(10)]})


def test_character_creation_accepts_the_starting_budget():
    validate_character_creation({
        "name": "V",
        "credits": 1050,
        "equipped": [{"code": "GORILLA-ARMS", "price": 1000}, {"code": "ENH-HYD-RAM", "price": 500}],
    })


def test_character_creation_accepts_a_sheet_that_bought_nothing():
    validate_character_creation({"name": "V", "credits": 2550, "equipped": []})


def test_character_creation_rejects_cash_above_the_creation_budget():
    with pytest.raises(ValidationError) as excinfo:
        validate_character_creation({"name": "V", "credits": 99999})
    assert "creation budget is 2550eb" in str(excinfo.value)


def test_character_creation_counts_installed_chrome_against_the_budget():
    with pytest.raises(ValidationError) as excinfo:
        validate_character_creation({"name": "V", "credits": 2550, "equipped": [{"code": "X", "price": 1000}]})
    assert "3550eb" in str(excinfo.value)


def test_character_creation_rejects_negative_cash():
    with pytest.raises(ValidationError) as excinfo:
        validate_character_creation({"name": "V", "credits": -5})
    assert "'credits' must be a non-negative integer" in str(excinfo.value)


def test_character_creation_accepts_one_enhancement_per_piece():
    validate_character_creation({
        "name": "V",
        "credits": 550,
        "equipped": [
            {"code": "GORILLA-ARMS", "price": 1000, "enhancements": ["ENH-HYD-RAM"]},
            {"code": "ENH-HYD-RAM", "price": 1000, "enhancements": []},
        ],
    })


def test_character_creation_rejects_two_enhancements_on_one_piece():
    with pytest.raises(ValidationError) as excinfo:
        validate_character_creation({
            "name": "V",
            "credits": 0,
            "equipped": [{"code": "GORILLA-ARMS", "enhancements": ["ENH-HYD-RAM", "ENH-PNEU-ACT"]}],
        })
    assert "a piece takes one at a time" in str(excinfo.value)
