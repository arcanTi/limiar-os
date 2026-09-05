"""Campaign persistence and visibility rules."""

import secrets
from collections.abc import Iterable

from ..db import db
from ..util import slug
from .records import get_record


def row_dict(row) -> dict[str, object]:
    return dict(row) if row else {}


def _roster_entry(
    username: str,
    role: str,
    character_id: str | None,
    controlled_by: str | None = None,
) -> dict[str, object]:
    character = get_record("characters", character_id) if character_id else None
    return {
        "username": username,
        "role": role,
        "characterId": character_id,
        "portraitUrl": (character or {}).get("portraitUrl") or None,
        "characterName": (character or {}).get("name") or None,
        # Class and level travel with the seat so a player reads the table as
        # characters ("NOMAD LVL 1"), not as a list of accounts. Still nothing
        # from the sheet itself - `/api/characters` stays owner-scoped.
        "characterRole": (character or {}).get("role") or None,
        "characterLevel": (character or {}).get("level") or None,
        # Set while another player is standing in for this seat. Everyone who
        # can see the roster sees who is holding the sheet.
        "controlledBy": controlled_by,
    }


def list_members(campaign_id: str) -> list[dict[str, object]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT campaign_id, username, character_id, role, joined_at "
            "FROM campaign_members WHERE campaign_id = %s ORDER BY username",
            (campaign_id,),
        ).fetchall()
    return [row_dict(row) for row in rows]


DELEGATION_COLUMNS = (
    "SELECT campaign_id, character_id, username, granted_by, granted_at "
    "FROM campaign_delegations WHERE campaign_id = %s ORDER BY character_id"
)


def _delegation_dicts(rows: Iterable[object]) -> list[dict[str, object]]:
    return [
        {
            "campaignId": row["campaign_id"],
            "characterId": row["character_id"],
            "username": row["username"],
            "grantedBy": row["granted_by"],
            "grantedAt": row["granted_at"],
        }
        for row in map(row_dict, rows)
    ]


def list_delegations(campaign_id: str) -> list[dict[str, object]]:
    """Sheets in this campaign currently driven by a stand-in."""
    with db() as conn:
        return _delegation_dicts(conn.execute(DELEGATION_COLUMNS, (campaign_id,)).fetchall())


def delegated_character_ids(username: str) -> list[str]:
    """Every character this user was handed control of, across all tables."""
    if not username:
        return []
    with db() as conn:
        rows = conn.execute(
            "SELECT character_id FROM campaign_delegations WHERE username = %s",
            (username,),
        ).fetchall()
    return [str(row_dict(row)["character_id"]) for row in rows]


def grant_delegation(
    campaign_id: str,
    character_id: str,
    username: str,
    granted_by: str,
) -> dict[str, object]:
    """Hand one seat's sheet to another player until the GM revokes it.

    One stand-in per character: granting again replaces the previous holder
    rather than stacking two people on the same sheet.
    """
    with db() as conn:
        conn.execute(
            "INSERT INTO campaign_delegations(campaign_id, character_id, username, granted_by) "
            "VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (campaign_id, character_id) DO UPDATE SET "
            "username = EXCLUDED.username, granted_by = EXCLUDED.granted_by, "
            "granted_at = CURRENT_TIMESTAMP",
            (campaign_id, character_id, username, granted_by),
        )
    return {
        "campaignId": campaign_id,
        "characterId": character_id,
        "username": username,
        "grantedBy": granted_by,
    }


def revoke_delegation(campaign_id: str, character_id: str) -> bool:
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM campaign_delegations WHERE campaign_id = %s AND character_id = %s",
            (campaign_id, character_id),
        )
    return cur.rowcount > 0


def list_campaigns_for(session: dict[str, str]) -> list[dict[str, object]]:
    staff = session.get("role") in ("admin", "gm")
    username = session["username"]
    with db() as conn:
        rows = conn.execute("SELECT * FROM campaigns ORDER BY updated_at DESC, name").fetchall()
        out = []
        for row in rows:
            campaign = row_dict(row)
            members = [
                row_dict(m)
                for m in conn.execute(
                    "SELECT campaign_id, username, character_id, role, joined_at FROM campaign_members WHERE campaign_id = %s ORDER BY username",
                    (campaign["id"],),
                ).fetchall()
            ]
            invites = [
                row_dict(i)
                for i in conn.execute(
                    "SELECT id, campaign_id, username, invited_by, status, created_at, responded_at FROM campaign_invites WHERE campaign_id = %s ORDER BY created_at DESC",
                    (campaign["id"],),
                ).fetchall()
            ]
            my_member = next((m for m in members if m["username"] == username), None)
            my_invite = next((i for i in invites if i["username"] == username and i["status"] == "pending"), None)
            visible = staff or campaign["visibility"] == "public" or my_member or my_invite
            if not visible:
                continue
            campaign["memberCount"] = len(members)
            campaign["members"] = members if staff else ([my_member] if my_member else [])
            campaign["invites"] = invites if staff else ([my_invite] if my_invite else [])
            campaign["isMember"] = bool(my_member)
            campaign["myInviteId"] = my_invite["id"] if my_invite else None
            campaign["canJoin"] = (not my_member) and (campaign["visibility"] == "public" or bool(my_invite))
            # Public-facing roster (username/role/portrait only, no invite or
            # join-date detail) so any viewer who can see the card at all can
            # see who's running/playing it - not gated to staff like `members`.
            # Reuse the open connection: this loop runs once per campaign, and
            # acquiring a second pooled connection inside it would double the
            # pool pressure of a single listing request.
            delegations = _delegation_dicts(
                conn.execute(DELEGATION_COLUMNS, (campaign["id"],)).fetchall()
            )
            held_by = {str(d["characterId"]): str(d["username"]) for d in delegations}
            roster = [
                _roster_entry(
                    m["username"],
                    m["role"],
                    m["character_id"],
                    held_by.get(str(m["character_id"])),
                )
                for m in members
            ]
            gm_username = campaign.get("created_by")
            if gm_username and not any(r["username"] == gm_username for r in roster):
                roster.insert(0, _roster_entry(gm_username, "gm", None))
            campaign["roster"] = roster
            campaign["delegations"] = delegations
            campaign["participantCount"] = len(roster)
            out.append(campaign)
    return out


def get_campaign(campaign_id: str) -> dict[str, object] | None:
    with db() as conn:
        row = conn.execute("SELECT * FROM campaigns WHERE id = %s", (campaign_id,)).fetchone()
    return row_dict(row) if row else None


def is_campaign_member(campaign_id: str, session: dict[str, str]) -> bool:
    """Accepted-membership gate for table state (map, etc). `public`
    visibility only helps discovery/join — it never grants this. Site
    admins are an explicit operational bypass; a `gm` role alone is not,
    since that account still needs to actually belong to this campaign."""
    if session.get("role") == "admin":
        return True
    username = session["username"]
    campaign = get_campaign(campaign_id)
    if campaign and campaign.get("created_by") == username:
        return True
    with db() as conn:
        row = conn.execute(
            "SELECT 1 FROM campaign_members WHERE campaign_id = %s AND username = %s",
            (campaign_id, username),
        ).fetchone()
    return row is not None


def is_campaign_owner(campaign_id: str, session: dict[str, str]) -> bool:
    """GM-management gate: admin, or the GM who created this specific
    campaign. A `gm` role alone is not enough — a GM playing as a member of
    someone else's campaign must not be able to manage it."""
    if session.get("role") == "admin":
        return True
    campaign = get_campaign(campaign_id)
    return bool(campaign and campaign.get("created_by") == session.get("username"))


def cancel_invite(campaign_id: str, username: str) -> bool:
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM campaign_invites WHERE campaign_id = %s AND username = %s",
            (campaign_id, username),
        )
    return cur.rowcount > 0


def remove_member(campaign_id: str, username: str) -> bool:
    with db() as conn:
        row = conn.execute(
            "SELECT character_id FROM campaign_members WHERE campaign_id = %s AND username = %s",
            (campaign_id, username),
        ).fetchone()
        # Both directions: the sheet they left behind stops being controllable,
        # and any sheet they were standing in for goes back to its owner.
        if row is not None:
            conn.execute(
                "DELETE FROM campaign_delegations WHERE campaign_id = %s AND character_id = %s",
                (campaign_id, row_dict(row)["character_id"]),
            )
        conn.execute(
            "DELETE FROM campaign_delegations WHERE campaign_id = %s AND username = %s",
            (campaign_id, username),
        )
        cur = conn.execute(
            "DELETE FROM campaign_members WHERE campaign_id = %s AND username = %s",
            (campaign_id, username),
        )
    return cur.rowcount > 0


CAMPAIGN_SYSTEMS = ("cyberpunk-red", "dnd5e", "cthulhu", "other")


def upsert_campaign(payload: dict[str, object], session: dict[str, str]) -> dict[str, object]:
    name = str(payload.get("name") or "").strip()[:120]
    campaign_id = str(payload.get("id") or slug(name))[:120]
    description = str(payload.get("description") or "").strip()[:1000]
    visibility = str(payload.get("visibility") or "public")
    if visibility not in ("public", "private"):
        visibility = "public"
    status = str(payload.get("status") or "active")
    if status not in ("active", "paused", "archived"):
        status = "active"
    system = str(payload.get("system") or "")
    if system not in CAMPAIGN_SYSTEMS:
        system = ""
    banner_url = str(payload.get("bannerUrl") or "").strip()[:500]
    clear_banner = bool(payload.get("clearBanner"))
    with db() as conn:
        existing = conn.execute(
            "SELECT created_by, system, banner_url FROM campaigns WHERE id = %s", (campaign_id,),
        ).fetchone()
        # System is fixed at creation: an existing campaign always keeps its
        # original system, regardless of what the payload sends on edit.
        if existing:
            system = str(existing["system"] or "cyberpunk-red")
        elif not system:
            system = "cyberpunk-red"
        # Same rule for the banner: an edit call that omits it keeps whatever
        # was uploaded before instead of blanking the card out. `clearBanner`
        # is the explicit escape hatch to actually remove it.
        if clear_banner:
            banner_url = ""
        elif not banner_url:
            banner_url = str(existing["banner_url"] if existing and existing["banner_url"] else "")
        conn.execute(
            """
            INSERT INTO campaigns(id, name, description, visibility, status, system, banner_url, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              visibility = excluded.visibility,
              status = excluded.status,
              system = excluded.system,
              banner_url = excluded.banner_url,
              updated_at = CURRENT_TIMESTAMP
            """,
            (campaign_id, name, description, visibility, status, system, banner_url or None, existing["created_by"] if existing else session["username"]),
        )
    return get_campaign(campaign_id) or {}


def invite_player(campaign_id: str, username: str, session: dict[str, str]) -> dict[str, object]:
    invite_id = secrets.token_hex(8)
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_invites(id, campaign_id, username, invited_by, status)
            VALUES (%s, %s, %s, %s, 'pending')
            ON CONFLICT(campaign_id, username) DO UPDATE SET
              status = 'pending',
              invited_by = excluded.invited_by,
              responded_at = NULL,
              created_at = CURRENT_TIMESTAMP
            """,
            (invite_id, campaign_id, username, session["username"]),
        )
        row = conn.execute(
            "SELECT id, campaign_id, username, invited_by, status, created_at, responded_at FROM campaign_invites WHERE campaign_id = %s AND username = %s",
            (campaign_id, username),
        ).fetchone()
    return row_dict(row)


def join_campaign(campaign_id: str, character_id: str, session: dict[str, str]) -> dict[str, object]:
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_members(campaign_id, username, character_id, role)
            VALUES (%s, %s, %s, 'player')
            ON CONFLICT(campaign_id, username) DO UPDATE SET
              character_id = excluded.character_id,
              joined_at = CURRENT_TIMESTAMP
            """,
            (campaign_id, session["username"], character_id),
        )
        conn.execute(
            "UPDATE campaign_invites SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE campaign_id = %s AND username = %s",
            (campaign_id, session["username"]),
        )
        row = conn.execute(
            "SELECT campaign_id, username, character_id, role, joined_at FROM campaign_members WHERE campaign_id = %s AND username = %s",
            (campaign_id, session["username"]),
        ).fetchone()
    return row_dict(row)


def notifications_for(session: dict[str, str]) -> list[dict[str, object]]:
    username = session["username"]
    with db() as conn:
        invites = conn.execute(
            """
            SELECT i.id, i.campaign_id, i.created_at, c.name, c.description, c.visibility, c.status
            FROM campaign_invites i
            JOIN campaigns c ON c.id = i.campaign_id
            WHERE i.username = %s AND i.status = 'pending'
            ORDER BY i.created_at DESC
            """,
            (username,),
        ).fetchall()
        memberships = conn.execute(
            """
            SELECT c.id, c.name, c.description, c.visibility, c.status, m.character_id, m.joined_at
            FROM campaign_members m
            JOIN campaigns c ON c.id = m.campaign_id
            WHERE m.username = %s AND c.status = 'active'
            ORDER BY m.joined_at DESC
            """,
            (username,),
        ).fetchall()
    out = [
        {
            "kind": "invite",
            "id": row["id"],
            "campaignId": row["campaign_id"],
            "title": row["name"],
            "message": "Convite pendente para campanha " + row["name"],
            "createdAt": row["created_at"],
        }
        for row in invites
    ]
    out.extend(
        {
            "kind": "campaign",
            "id": row["id"],
            "campaignId": row["id"],
            "title": row["name"],
            "message": "Campanha em andamento com a ficha " + row["character_id"],
            "createdAt": row["joined_at"],
        }
        for row in memberships
    )
    return out
