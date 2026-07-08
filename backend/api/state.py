"""Shared game-state routes backed by the settings store: Nexus challenge/result,
HQ improvement points, tarot deck state, and combat tracker state."""

from http import HTTPStatus

from ..domain.validation import ValidationError, validate_hq
from ..repositories.records import get_setting, set_setting
from ..util import utc_now_iso


class StateRoutes:
    """Routes for shared game state: nexus, HQ, tarot, and combat."""

    def _get_nexus_challenge(self) -> None:
        self.write_json(get_setting("nexusChallenge"))

    def _get_nexus_result(self) -> None:
        self.write_json(get_setting("nexusResult"))

    def _get_hq(self) -> None:
        self.write_json(get_setting("hqIp") or {"ip": 0, "log": []})

    def _get_tarot_state(self) -> None:
        self.write_json(get_setting("tarot-state"))

    def _get_combat_state(self) -> None:
        self.write_json(get_setting("combat-state"))

    def _post_nexus_result(self) -> None:
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        payload["reportedAt"] = utc_now_iso()  # stamp server-side; never trust client
        return self.write_json(set_setting("nexusResult", payload))

    def _post_nexus_challenge(self) -> None:
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        payload["updatedAt"] = utc_now_iso()  # stamp server-side; never trust client
        set_setting("nexusResult", None)
        return self.write_json(set_setting("nexusChallenge", payload))

    def _post_hq(self) -> None:
        try:
            payload = self.read_json()
            cleaned = validate_hq(payload)
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        return self.write_json(set_setting("hqIp", cleaned))

    def _post_tarot_state(self) -> None:
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        return self.write_json(set_setting("tarot-state", payload))

    def _post_combat_state(self) -> None:
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        return self.write_json(set_setting("combat-state", payload))

    def _post_combat_end_turn(self) -> None:
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

        target_id = str(payload.get("targetId") or "")
        state = get_setting("combat-state") or {}
        combatants = state.get("combatants") if isinstance(state.get("combatants"), dict) else {}
        order = state.get("order") if isinstance(state.get("order"), list) else []
        turn_index = state.get("turnIndex") if isinstance(state.get("turnIndex"), int) else -1
        current_id = order[turn_index] if 0 <= turn_index < len(order) else None
        current_entry = combatants.get(current_id) if current_id else None

        if not state.get("active") or not target_id or target_id != current_id or not current_entry or current_entry.get("defeated"):
            return self.write_error(HTTPStatus.CONFLICT, "Not this combatant's active turn", "NOT_ACTIVE_TURN")

        next_combatants = {
            cid: {**entry} if isinstance(entry, dict) else entry
            for cid, entry in combatants.items()
        }
        next_combatants[target_id] = {**current_entry, "acted": True}
        first_active = next((idx for idx, cid in enumerate(order) if isinstance(next_combatants.get(cid), dict) and not next_combatants[cid].get("defeated")), -1)

        next_turn_index = -1
        for idx in range(max(0, turn_index + 1), len(order)):
            entry = next_combatants.get(order[idx])
            if isinstance(entry, dict) and not entry.get("defeated"):
                next_turn_index = idx
                break

        next_round = max(1, int(state.get("round") or 1))
        if next_turn_index < 0:
            next_combatants = {
                cid: ({**entry, "acted": False} if isinstance(entry, dict) else entry)
                for cid, entry in next_combatants.items()
            }
            next_round += 1
            next_turn_index = first_active

        next_state = {
            **state,
            "combatants": next_combatants,
            "round": next_round,
            "turnIndex": next_turn_index,
            "updatedAt": utc_now_iso(),
        }
        return self.write_json(set_setting("combat-state", next_state))
