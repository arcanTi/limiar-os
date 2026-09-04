"""Character commands and queries."""

from ..domain.access import controls_character, is_staff
from ..domain.validation import validate_character, validate_character_creation
from .errors import ApplicationError
from .ports import CampaignAccessRepository, Record, RecordRepository, Session

NOTES_FIELDS = ("notes", "alliances", "enemies", "personalTraits", "hobbies")


class CharacterService:
    """Enforce campaign scope, ownership and schema versioning for characters.

    A character belongs to exactly one campaign, recorded as `campaignId`. The
    empty string is a real scope, not "any": it holds the seeded demo sheets and
    anything made before a table was chosen, and it is only reachable from the
    campaign-less desktop. Without this, every GM on the deployment read and
    could delete every player's sheet from every other table.
    """

    def __init__(self, records: RecordRepository, campaigns: CampaignAccessRepository) -> None:
        self.records = records
        self.campaigns = campaigns

    def _delegated_ids(self, session: Session) -> list[str]:
        """Characters a GM handed this session control of, across all tables."""
        lookup = getattr(self.campaigns, "delegated_character_ids", None)
        if not callable(lookup):
            return []
        return list(lookup(session["username"]))

    def _controls(self, record: Record | None, session: Session) -> bool:
        """Owner, or the stand-in covering for an absent player."""
        return controls_character(record, session, self._delegated_ids(session))

    def list(self, session: Session, campaign_id: str = "") -> list[Record]:
        # Deliberately never raises for an unknown or unjoined campaign: a
        # player lands here mid-onboarding, before the join, and an empty list
        # is the honest answer. Staff read the whole table only where they
        # belong; everyone else reads only their own sheets.
        records = self.records.list("characters", campaign_id)
        if is_staff(session) and (not campaign_id or self._is_member(campaign_id, session)):
            return records
        delegated = self._delegated_ids(session)
        return [r for r in records if controls_character(r, session, delegated)]

    def get(self, record_id: str, session: Session) -> Record:
        record = self._require(record_id)
        self._require_read(record, session)
        return record

    def save_as_staff(self, payload: Record, session: Session, campaign_id: str = "") -> Record:
        validate_character(payload)
        if campaign_id:
            self._owner(campaign_id, session)
        current = self.records.get("characters", str(payload.get("id") or ""))
        if current:
            self._require_write(current, session)
        stamped = {
            **payload,
            "schemaVersion": int(payload.get("schemaVersion") or 1),
            "createdBy": session["username"],
            "campaignId": self._scope_of(current, campaign_id),
        }
        if not stamped.get("ownerUsername"):
            stamped["ownerUsername"] = session["username"]
        return self._save(stamped, self._expected_revision(payload))

    def save_as_player(self, payload: Record, session: Session, campaign_id: str = "") -> Record:
        validate_character(payload)
        if campaign_id:
            self._joinable(campaign_id, session)
        current = self.records.get("characters", str(payload.get("id") or ""))
        if current and not self._controls(current, session):
            raise ApplicationError(403, "Character access denied")
        if current is None:
            # Creation is the only moment the CPR starting budget applies.
            validate_character_creation(payload)
        # A stand-in plays the sheet, it does not inherit it: an existing
        # document keeps the owner it already had, and only a brand new one is
        # stamped with the author.
        owner = (
            str(current.get("ownerUsername") or current.get("createdBy") or "")
            if current
            else ""
        )
        stamped = {
            **payload,
            "schemaVersion": int(payload.get("schemaVersion") or 1),
            "ownerUsername": owner or session["username"],
            "createdBy": current.get("createdBy") if current else session["username"],
            "campaignId": self._scope_of(current, campaign_id),
        }
        return self._save(stamped, self._expected_revision(payload))

    def patch_notes(self, record_id: str, payload: Record, session: Session) -> Record:
        current = self._require(record_id)
        self._require_read(current, session)
        patch = {key: payload[key] for key in NOTES_FIELDS if key in payload}
        return self._save({**current, **patch}, self._expected_revision(payload))

    def delete(self, record_id: str, session: Session) -> bool:
        record = self._require(record_id)
        self._require_write(record, session)
        return self.records.delete("characters", record_id)

    # ----- scope and authorization -------------------------------------------------

    @staticmethod
    def _scope_of(current: Record | None, campaign_id: str) -> str:
        """Keep a saved character in the campaign it already belongs to.

        Only a brand-new sheet takes the scope of the request, so an edit sent
        from the wrong screen can never migrate someone else's table.
        """
        if current:
            return str(current.get("campaignId") or "")
        return campaign_id

    def _require(self, record_id: str) -> Record:
        record = self.records.get("characters", record_id)
        if not record:
            raise ApplicationError(404, "Character not found")
        return record

    def _require_read(self, record: Record, session: Session) -> None:
        if self._controls(record, session):
            return
        scope = str(record.get("campaignId") or "")
        if is_staff(session) and (not scope or self._is_member(scope, session)):
            return
        raise ApplicationError(403, "Character access denied")

    def _require_write(self, record: Record, session: Session) -> None:
        """Staff may edit or delete a sheet only inside a table they run.

        Unscoped sheets (the demo trio) stay editable by any staff account so a
        fresh deployment can be cleaned up before any campaign exists.
        """
        if not is_staff(session):
            raise ApplicationError(403, "Character access denied")
        scope = str(record.get("campaignId") or "")
        if not scope or session.get("role") == "admin":
            return
        if not self.campaigns.is_campaign_owner(scope, dict(session)):
            raise ApplicationError(403, "Apenas o mestre desta campanha pode gerenciá-la")

    def _is_member(self, campaign_id: str, session: Session) -> bool:
        return bool(self.campaigns.is_campaign_member(campaign_id, dict(session)))

    def _joinable(self, campaign_id: str, session: Session) -> None:
        """Allow a first sheet to be written for a table not yet joined.

        Onboarding creates the character before `POST /campaigns/{id}/join`,
        because the join needs a character id — so membership cannot be the
        gate here. Being invited, or the table being public, is enough.
        """
        if not self.campaigns.get_campaign(campaign_id):
            raise ApplicationError(404, "Campaign not found")
        if self._is_member(campaign_id, session):
            return
        visible = self.campaigns.list_campaigns_for(dict(session))
        row = next((c for c in visible if c.get("id") == campaign_id), None)
        if not row or not row.get("canJoin"):
            raise ApplicationError(403, "Campaign access denied")

    def _owner(self, campaign_id: str, session: Session) -> None:
        if not self.campaigns.get_campaign(campaign_id):
            raise ApplicationError(404, "Campaign not found")
        if not self.campaigns.is_campaign_owner(campaign_id, dict(session)):
            raise ApplicationError(403, "Apenas o mestre desta campanha pode gerenciá-la")

    @staticmethod
    def _expected_revision(payload: Record) -> int | None:
        value = payload.get("expectedRevision")
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ApplicationError(
                400, "expectedRevision must be a non-negative integer", "VALIDATION_ERROR"
            )
        return value

    def _save(self, payload: Record, expected_revision: int | None) -> Record:
        return self.records.upsert_revisioned("characters", payload, expected_revision)
