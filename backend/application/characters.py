"""Character commands and queries."""

from ..domain.access import is_staff, owns_character
from ..domain.validation import validate_character
from .errors import ApplicationError
from .ports import Record, RecordRepository, Session

NOTES_FIELDS = ("notes", "alliances", "enemies", "personalTraits", "hobbies")


class CharacterService:
    """Enforce ownership and schema versioning for character documents."""
    def __init__(self, records: RecordRepository) -> None:
        self.records = records

    def list(self, session: Session) -> list[Record]:
        records = self.records.list("characters")
        return records if is_staff(session) else [r for r in records if owns_character(r, session)]

    def get(self, record_id: str, session: Session) -> Record:
        record = self.records.get("characters", record_id)
        if not record:
            raise ApplicationError(404, "Character not found")
        if not is_staff(session) and not owns_character(record, session):
            raise ApplicationError(403, "Character access denied")
        return record

    def save_as_staff(self, payload: Record, session: Session) -> Record:
        validate_character(payload)
        stamped = {
            **payload,
            "schemaVersion": int(payload.get("schemaVersion") or 1),
            "createdBy": session["username"],
        }
        if not stamped.get("ownerUsername"):
            stamped["ownerUsername"] = session["username"]
        return self._save(stamped)

    def save_as_player(self, payload: Record, session: Session) -> Record:
        validate_character(payload)
        current = self.records.get("characters", str(payload.get("id") or ""))
        if current and not owns_character(current, session):
            raise ApplicationError(403, "Character access denied")
        stamped = {
            **payload,
            "schemaVersion": int(payload.get("schemaVersion") or 1),
            "ownerUsername": session["username"],
            "createdBy": current.get("createdBy") if current else session["username"],
        }
        return self._save(stamped)

    def patch_notes(self, record_id: str, payload: Record, session: Session) -> Record:
        current = self.records.get("characters", record_id)
        if not current:
            raise ApplicationError(404, "Character not found")
        if not is_staff(session) and not owns_character(current, session):
            raise ApplicationError(403, "Character access denied")
        patch = {key: payload[key] for key in NOTES_FIELDS if key in payload}
        return self._save({**current, **patch})

    def delete(self, record_id: str) -> bool:
        return self.records.delete("characters", record_id)

    def _save(self, payload: Record) -> Record:
        return self.records.upsert("characters", payload)
