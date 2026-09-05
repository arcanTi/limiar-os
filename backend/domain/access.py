"""Transport-independent authorization policies."""

from collections.abc import Collection, Mapping


def is_staff(session: Mapping[str, str] | None) -> bool:
    return bool(session and session.get("role") in {"admin", "gm"})


def owns_character(record: Mapping[str, object] | None, session: Mapping[str, str]) -> bool:
    if not record:
        return False
    owner = str(record.get("ownerUsername") or record.get("createdBy") or "")
    return owner == session["username"]


def controls_character(
    record: Mapping[str, object] | None,
    session: Mapping[str, str],
    delegated_ids: Collection[str] = (),
) -> bool:
    """Owner, or the stand-in a GM handed this sheet to.

    Control is full: a substitute plays the absent player's character exactly as
    the owner would. Ownership itself never moves - see
    `CharacterService.save_as_player`, which keeps `ownerUsername` intact.
    """
    if owns_character(record, session):
        return True
    if not record:
        return False
    return str(record.get("id") or "") in {str(item) for item in delegated_ids}
