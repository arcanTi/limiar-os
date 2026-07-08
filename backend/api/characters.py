"""Character routes: list, fetch, GM upsert, and player self-creation."""

from http import HTTPStatus

from ..domain.validation import ValidationError, validate_character
from ..repositories.records import get_record, list_records, upsert_record


class CharacterRoutes:
    """Routes for listing, fetching, and creating characters."""

    def _owns_character(self, record: dict[str, object] | None, session: dict[str, str]) -> bool:
        if not record:
            return False
        owner = str(record.get("ownerUsername") or record.get("createdBy") or "")
        return owner == session["username"]

    def _get_characters(self) -> None:
        session = self.require_login()
        if not session:
            return None
        records = list_records("characters")
        if not self.is_staff_session(session):
            records = [record for record in records if self._owns_character(record, session)]
        self.write_json(records)

    def _get_character_by_id(self, record_id: str) -> None:
        session = self.require_login()
        if not session:
            return None
        record = get_record("characters", record_id)
        if record and not self.is_staff_session(session) and not self._owns_character(record, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "Character access denied")
        self.write_json(record or {}, HTTPStatus.OK if record else HTTPStatus.NOT_FOUND)

    def _post_player_characters(self, session: dict[str, str]) -> None:
        try:
            payload = self.read_json()
            validate_character(payload)
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        current = get_record("characters", str(payload.get("id") or ""))
        if current and not self._owns_character(current, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "Character access denied")
        payload["ownerUsername"] = session["username"]
        payload["createdBy"] = current.get("createdBy") if current else session["username"]
        return self.write_json(upsert_record("characters", payload), HTTPStatus.CREATED)

    def _post_characters(self, session: dict[str, str]) -> None:
        try:
            payload = self.read_json()
            validate_character(payload)
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        payload["createdBy"] = session["username"]  # stamp server-side
        if not payload.get("ownerUsername"):
            payload["ownerUsername"] = session["username"]
        return self.write_json(upsert_record("characters", payload))

    # Free-text fields a player fills in about their own character — same
    # trust level as clearing your own status effect, so no GM login gate.
    # Whitelisted server-side: nothing else on the record can move through here.
    _NOTES_FIELDS = ("notes", "alliances", "enemies", "personalTraits", "hobbies")

    def _post_character_notes(self, record_id: str, session: dict[str, str]) -> None:
        current = get_record("characters", record_id)
        if not current:
            return self.write_error(HTTPStatus.NOT_FOUND, "Character not found")
        if not self.is_staff_session(session) and not self._owns_character(current, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "Character access denied")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        patch = {k: payload[k] for k in self._NOTES_FIELDS if k in payload}
        merged = {**current, **patch}
        return self.write_json(upsert_record("characters", merged))
