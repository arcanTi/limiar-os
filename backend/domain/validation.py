"""Request payload validation. Pure domain rules — no DB, no HTTP."""

import re

from ..security import ACCESS_TOKEN_LENGTH, is_access_token, normalize_access_token

# C0/C1 control characters except \n and \t. The template engine already
# writes text via textContent/setAttribute (safe against markup injection),
# but free-form fields that skip per-key validation (gear notes, character
# story, GM item/NPC descriptions) land straight in the `extra` JSON blob —
# this strips anything that could corrupt logs, terminals, or downstream
# tooling that isn't as careful as the renderer.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ValidationError(Exception):
    """Raised when a request payload fails schema validation."""

    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("; ".join(errors))


def sanitize_text(value: str, max_len: int = 255) -> str:
    """Strip control characters and hard-truncate a string."""
    return _CONTROL_CHARS.sub("", value)[:max_len]


def sanitize_payload(value: object, *, max_len: int = 4000, _depth: int = 0) -> object:
    """Recursively sanitize every string in a JSON-like payload.

    Applied at the storage boundary (records/chat repositories) so nested
    free-text the per-field validators don't know about — gear notes,
    cyberware installed lists, GM item/NPC descriptions — can't smuggle
    control bytes or balloon a single field indefinitely.
    """
    if _depth > 12:  # guards against pathological/self-referential JSON
        return value
    if isinstance(value, str):
        return sanitize_text(value, max_len)
    if isinstance(value, list):
        return [sanitize_payload(v, max_len=max_len, _depth=_depth + 1) for v in value]
    if isinstance(value, dict):
        return {
            k: sanitize_payload(v, max_len=max_len, _depth=_depth + 1) for k, v in value.items()
        }
    return value


def _val_str(
    payload: dict[str, object], key: str, *, required: bool = False, max_len: int = 255
) -> str | None:
    val = payload.get(key)
    if val is None:
        if required:
            raise ValidationError([f"'{key}' is required"])
        return None
    if not isinstance(val, str):
        raise ValidationError([f"'{key}' must be a string"])
    stripped = sanitize_text(val.strip(), max_len)
    if required and not stripped:
        raise ValidationError([f"'{key}' must not be empty"])
    return stripped


def _val_int(payload: dict[str, object], key: str, *, required: bool = False) -> int | None:
    val = payload.get(key)
    if val is None:
        if required:
            raise ValidationError([f"'{key}' is required"])
        return None
    if not isinstance(val, int) or isinstance(val, bool):
        raise ValidationError([f"'{key}' must be an integer"])
    return val


def validate_login(payload: dict[str, object]) -> str:
    """Return the normalized access token carried by a login request."""
    token = normalize_access_token(payload.get("token"))
    if not is_access_token(token):
        raise ValidationError(
            [f"'token' must be {ACCESS_TOKEN_LENGTH} letters or digits"]
        )
    return token


def validate_user(payload: dict[str, object]) -> tuple[str, str]:
    username = _val_str(payload, "username", required=True, max_len=100)
    role = _val_str(payload, "role", required=True, max_len=20) or "player"
    if role not in ("admin", "gm", "player"):
        raise ValidationError(["'role' must be 'admin', 'gm', or 'player'"])
    return username, role  # type: ignore[return-value]


def validate_email(payload: dict[str, object], *, required: bool = False) -> str | None:
    email = payload.get("email")
    if email is None or email == "":
        if required:
            raise ValidationError(["'email' is required"])
        return None
    if not isinstance(email, str) or not _EMAIL_RE.match(email.strip()):
        raise ValidationError(["'email' must be a valid email address"])
    return email.strip().lower()


def validate_character(payload: dict[str, object]) -> None:
    _val_str(payload, "name", required=True, max_len=120)
    _val_int(payload, "level")


# --- Cyberpunk RED character creation -------------------------------------
# Mirrors frontend/src/domain/character/constants.ts. The wizard already
# enforces these numbers client-side; this is the server-side guard so a
# hand-crafted payload cannot open a sheet with 10 in every STAT.

CPRED_STAT_ORDER = ("INT", "REF", "DEX", "TECH", "COOL", "WILL", "LUCK", "MOVE", "BODY", "EMP")
CPRED_STAT_BUDGET = 62
CPRED_STAT_MIN = 2
CPRED_STAT_MAX = 8  # every STAT, LUCK included (CPR p.42/78)
CPRED_STAT_ROLL_MAX = 10  # house-rule raw 1d10; the RAW Edgerunner tables cap at 8
CPRED_SKILL_BUDGET = 60  # 86 RAW minus the 26 locked in the 13 basic skills
CPRED_SKILL_LEVEL_MAX = 6  # creation cap (p.42/90); 10 is reached with IP later
CPRED_SKILL_TRAINED_MIN = 2  # a trained skill never starts at 1 (p.88)
CPRED_DEFAULT_SKILL_LEVEL = 2
CPRED_ORIGIN_LANGUAGE_LEVEL = 4  # free Cultural Origin language (p.41/45)
CPRED_CREATION_CASH = 2550  # gear + cyberware budget; the rest is starting cash (p.104)
CPRED_DEFAULT_SKILL_NAMES = frozenset(
    {
        "Athletics",
        "Brawling",
        "Concentration",
        "Conversation",
        "Education",
        "Evasion",
        "First Aid",
        "Human Perception",
        "Language (Streetslang)",
        "Local Expert (Your Home)",
        "Perception",
        "Persuasion",
        "Stealth",
    }
)
CPRED_STAT_METHODS = ("points", "roll")


def _stat_max(_key: str, method: str) -> int:
    return CPRED_STAT_ROLL_MAX if method == "roll" else CPRED_STAT_MAX


def _creation_method(payload: dict[str, object]) -> str:
    creation = payload.get("creation")
    if creation is None:
        return "points"
    if not isinstance(creation, dict):
        raise ValidationError(["'creation' must be an object"])
    method = creation.get("method", "points")
    if method not in CPRED_STAT_METHODS:
        raise ValidationError([f"'creation.method' must be one of {', '.join(CPRED_STAT_METHODS)}"])
    for field in ("statRolls", "statRerolls"):
        count = creation.get(field, 0)
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            raise ValidationError([f"'creation.{field}' must be a non-negative integer"])
    if method == "roll" and creation.get("statRolls", 0) < len(CPRED_STAT_ORDER):
        raise ValidationError(
            [f"'creation.statRolls' must be at least {len(CPRED_STAT_ORDER)} when STATs are rolled"]
        )
    origin = creation.get("originLanguage", "")
    if origin is not None and not isinstance(origin, str):
        raise ValidationError(["'creation.originLanguage' must be a string"])
    return str(method)


def _origin_language(payload: dict[str, object]) -> str:
    creation = payload.get("creation")
    if not isinstance(creation, dict):
        return ""
    return str(creation.get("originLanguage") or "").strip()


def _validate_creation_stats(base: object, method: str, errors: list[str]) -> None:
    if not isinstance(base, dict):
        errors.append("'base' must be an object")
        return
    total = 0
    for key in CPRED_STAT_ORDER:
        value = base.get(key)
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append(f"'base.{key}' must be an integer")
            continue
        maximum = _stat_max(key, method)
        if value < CPRED_STAT_MIN or value > maximum:
            errors.append(f"'base.{key}' must be between {CPRED_STAT_MIN} and {maximum}")
        total += value
    if method == "points" and total > CPRED_STAT_BUDGET:
        errors.append(f"'base' spends {total} points; the limit is {CPRED_STAT_BUDGET}")


def _validate_creation_skills(skills: object, origin_language: str, errors: list[str]) -> None:
    if not isinstance(skills, list):
        errors.append("'skills' must be a list")
        return
    origin_name = f"Language ({origin_language})" if origin_language else ""
    spent = 0
    for index, skill in enumerate(skills):
        if not isinstance(skill, dict):
            errors.append(f"'skills[{index}]' must be an object")
            continue
        level = skill.get("level", 0)
        if isinstance(level, bool) or not isinstance(level, int):
            errors.append(f"'skills[{index}].level' must be an integer")
            continue
        if level < 0 or level > CPRED_SKILL_LEVEL_MAX:
            errors.append(f"'skills[{index}].level' must be between 0 and {CPRED_SKILL_LEVEL_MAX}")
            continue
        name = str(skill.get("name") or "")
        if skill.get("origin"):
            if not origin_name or name != origin_name:
                errors.append(
                    f"'skills[{index}]' claims the origin language; "
                    f"creation.originLanguage is {origin_language!r}"
                )
                continue
            floor = CPRED_ORIGIN_LANGUAGE_LEVEL
        else:
            floor = CPRED_DEFAULT_SKILL_LEVEL if name in CPRED_DEFAULT_SKILL_NAMES else 0
        if level < floor:
            errors.append(f"'skills[{index}].level' must be at least {floor}")
            continue
        if floor < CPRED_SKILL_TRAINED_MIN and 0 < level < CPRED_SKILL_TRAINED_MIN:
            errors.append(
                f"'skills[{index}].level' must be 0 or at least {CPRED_SKILL_TRAINED_MIN}"
            )
            continue
        cost = 2 if skill.get("difficult") else 1
        spent += max(0, level - floor) * cost
    if spent > CPRED_SKILL_BUDGET:
        errors.append(f"'skills' spend {spent} points; the limit is {CPRED_SKILL_BUDGET}")


def _validate_creation_cash(payload: dict[str, object], errors: list[str]) -> None:
    """Starting money never exceeds the Complete Package budget (p.104).

    What the sheet keeps as cash plus what it spent on the chrome it already
    wears must fit in 2.550eb. Prices come from the payload, so this is a guard
    against the obvious hand-crafted sheet, not an audit of the catalog.
    """
    credits = payload.get("credits")
    if credits is None:
        return
    if isinstance(credits, bool) or not isinstance(credits, int) or credits < 0:
        errors.append("'credits' must be a non-negative integer")
        return
    spent = 0
    equipped = payload.get("equipped")
    if isinstance(equipped, list):
        for row in equipped:
            price = row.get("price") if isinstance(row, dict) else None
            if isinstance(price, int) and not isinstance(price, bool) and price > 0:
                spent += price
    if credits + spent > CPRED_CREATION_CASH:
        errors.append(
            f"'credits' plus installed gear total {credits + spent}eb; "
            f"the creation budget is {CPRED_CREATION_CASH}eb"
        )


def _validate_creation_enhancements(payload: dict[str, object], errors: list[str]) -> None:
    """One Cyberware Enhancement per piece of cyberware (Mission Kit DLC #2)."""
    equipped = payload.get("equipped")
    if not isinstance(equipped, list):
        return
    for row in equipped:
        if not isinstance(row, dict):
            continue
        attached = row.get("enhancements")
        if isinstance(attached, list) and len(attached) > 1:
            code = row.get("code") or "cyberware"
            errors.append(
                f"'{code}' carries {len(attached)} enhancements; a piece takes one at a time"
            )


def validate_character_creation(payload: dict[str, object]) -> None:
    """Guard a brand-new player sheet against an illegal starting spread.

    Only fields that are present are checked: a payload without `base` or
    `skills` is a minimal sheet the GM fills in later, not a cheat. Existing
    sheets are never re-validated here because play (IP, cyberware) moves
    them past creation limits legitimately.
    """

    method = _creation_method(payload)
    errors: list[str] = []
    if "base" in payload:
        _validate_creation_stats(payload.get("base"), method, errors)
    if "skills" in payload:
        _validate_creation_skills(payload.get("skills"), _origin_language(payload), errors)
    _validate_creation_cash(payload, errors)
    _validate_creation_enhancements(payload, errors)
    if errors:
        raise ValidationError(errors)


def validate_item(payload: dict[str, object]) -> None:
    _val_str(payload, "name", required=True, max_len=120)
    _val_int(payload, "price")


def validate_map_location(payload: dict[str, object]) -> None:
    _val_str(payload, "name", required=True, max_len=120)


def validate_chat(payload: dict[str, object]) -> None:
    kind = payload.get("kind", "text")
    if kind not in ("text", "roll", "request"):
        raise ValidationError(["'kind' must be 'text', 'roll', or 'request'"])
    _val_str(payload, "sender", max_len=60)
    _val_str(payload, "text", max_len=1000)
    _val_str(payload, "at", max_len=40)


def validate_hq(payload: dict[str, object]) -> dict[str, object]:
    ip_raw = payload.get("ip", 0)
    if not isinstance(ip_raw, int) or isinstance(ip_raw, bool):
        raise ValidationError(["'ip' must be an integer"])
    log_raw = payload.get("log")
    if log_raw is not None and not isinstance(log_raw, list):
        raise ValidationError(["'log' must be an array"])
    return {
        "ip": int(ip_raw),
        "log": log_raw if isinstance(log_raw, list) else [],
    }
