"""Nexus, HQ, tarot, and combat state use cases."""

from ..domain.access import is_staff, owns_character
from ..domain.validation import validate_hq
from ..util import utc_now_iso
from .errors import ApplicationError
from .ports import CampaignAccessRepository, Record, RecordRepository, Session, SettingRepository


class GameStateService:
    """Coordinate the shared state machines stored in PostgreSQL."""
    def __init__(
        self,
        settings: SettingRepository,
        records: RecordRepository,
        campaigns: CampaignAccessRepository,
    ) -> None:
        self.settings = settings
        self.records = records
        self.campaigns = campaigns

    def get(self, campaign_id: str, key: str, session: Session, default: object = None) -> object:
        self._member(campaign_id, session)
        return self.settings.get(campaign_id, key) or default

    def report_nexus(self, campaign_id: str, payload: Record, session: Session) -> object:
        self._member(campaign_id, session)
        result = {**payload, "reportedAt": utc_now_iso()}
        return self.settings.set(campaign_id, "nexusResult", result)

    def set_nexus(self, campaign_id: str, payload: Record, session: Session) -> object:
        self._member(campaign_id, session)
        self.settings.set(campaign_id, "nexusResult", None)
        challenge = {**payload, "updatedAt": utc_now_iso()}
        return self.settings.set(campaign_id, "nexusChallenge", challenge)

    def set_hq(self, campaign_id: str, payload: Record, session: Session) -> object:
        self._member(campaign_id, session)
        return self.settings.set(campaign_id, "hqIp", validate_hq(payload))

    def set_tarot(self, campaign_id: str, payload: Record, session: Session) -> object:
        self._member(campaign_id, session)
        return self.settings.set(campaign_id, "tarot-state", payload)

    def set_combat(self, campaign_id: str, payload: Record, session: Session) -> object:
        self._member(campaign_id, session)
        expected_revision = self._expected_revision(payload)
        state = {
            key: value
            for key, value in payload.items()
            if key not in {"revision", "expectedRevision"}
        }
        return self.settings.set(campaign_id, "combat-state", state, expected_revision)

    def end_turn(
        self, campaign_id: str, target_id: str, expected_revision: int, session: Session
    ) -> object:
        self._member(campaign_id, session)
        if not is_staff(session):
            character = self.records.get("characters", target_id)
            if not owns_character(character, session):
                raise ApplicationError(403, "Not your combatant", "NOT_YOUR_COMBATANT")

        state = self.settings.get(campaign_id, "combat-state") or {}
        if not isinstance(state, dict):
            state = {}
        combatants = state.get("combatants") if isinstance(state.get("combatants"), dict) else {}
        order = state.get("order") if isinstance(state.get("order"), list) else []
        turn_index = state.get("turnIndex") if isinstance(state.get("turnIndex"), int) else -1
        current_id = order[turn_index] if 0 <= turn_index < len(order) else None
        current_entry = combatants.get(current_id) if current_id else None
        if (
            not state.get("active")
            or not target_id
            or target_id != current_id
            or not isinstance(current_entry, dict)
            or current_entry.get("defeated")
        ):
            raise ApplicationError(409, "Not this combatant's active turn", "NOT_ACTIVE_TURN")

        next_combatants = {
            cid: ({**entry} if isinstance(entry, dict) else entry)
            for cid, entry in combatants.items()
        }
        next_combatants[target_id] = {**current_entry, "acted": True}
        first_active = next(
            (
                idx
                for idx, cid in enumerate(order)
                if isinstance(next_combatants.get(cid), dict)
                and not next_combatants[cid].get("defeated")
            ),
            -1,
        )
        next_turn_index = next(
            (
                idx
                for idx in range(max(0, turn_index + 1), len(order))
                if isinstance(next_combatants.get(order[idx]), dict)
                and not next_combatants[order[idx]].get("defeated")
            ),
            -1,
        )
        next_round = max(1, int(state.get("round") or 1))
        if next_turn_index < 0:
            next_combatants = {
                cid: ({**entry, "acted": False} if isinstance(entry, dict) else entry)
                for cid, entry in next_combatants.items()
            }
            next_round += 1
            next_turn_index = first_active

        return self.settings.set(
            campaign_id,
            "combat-state",
            {
                **state,
                "combatants": next_combatants,
                "round": next_round,
                "turnIndex": next_turn_index,
                "updatedAt": utc_now_iso(),
            },
            expected_revision,
        )

    @staticmethod
    def _expected_revision(payload: Record) -> int:
        value = payload.get("expectedRevision")
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ApplicationError(
                400, "expectedRevision must be a non-negative integer", "VALIDATION_ERROR"
            )
        return value

    def _member(self, campaign_id: str, session: Session) -> None:
        if not self.campaigns.get_campaign(campaign_id):
            raise ApplicationError(404, "Campaign not found")
        if not self.campaigns.is_campaign_member(campaign_id, dict(session)):
            raise ApplicationError(403, "Campaign access denied")
