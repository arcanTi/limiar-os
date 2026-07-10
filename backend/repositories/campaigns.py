"""Campaign persistence and visibility rules."""

import secrets

from ..db import db
from ..util import slug


def row_dict(row) -> dict[str, object]:
    return dict(row) if row else {}


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
                    "SELECT campaign_id, username, character_id, role, joined_at FROM campaign_members WHERE campaign_id = ? ORDER BY username",
                    (campaign["id"],),
                ).fetchall()
            ]
            invites = [
                row_dict(i)
                for i in conn.execute(
                    "SELECT id, campaign_id, username, invited_by, status, created_at, responded_at FROM campaign_invites WHERE campaign_id = ? ORDER BY created_at DESC",
                    (campaign["id"],),
                ).fetchall()
            ]
            my_member = next((m for m in members if m["username"] == username), None)
            my_invite = next((i for i in invites if i["username"] == username and i["status"] == "pending"), None)
            visible = staff or campaign["visibility"] == "public" or my_member or my_invite
            if not visible:
                continue
            campaign["members"] = members if staff else ([my_member] if my_member else [])
            campaign["invites"] = invites if staff else ([my_invite] if my_invite else [])
            campaign["isMember"] = bool(my_member)
            campaign["myInviteId"] = my_invite["id"] if my_invite else None
            campaign["canJoin"] = (not my_member) and (campaign["visibility"] == "public" or bool(my_invite))
            out.append(campaign)
    return out


def get_campaign(campaign_id: str) -> dict[str, object] | None:
    with db() as conn:
        row = conn.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
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
            "SELECT 1 FROM campaign_members WHERE campaign_id = ? AND username = ?",
            (campaign_id, username),
        ).fetchone()
    return row is not None


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
    with db() as conn:
        existing = conn.execute("SELECT created_by FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
        conn.execute(
            """
            INSERT INTO campaigns(id, name, description, visibility, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              visibility = excluded.visibility,
              status = excluded.status,
              updated_at = CURRENT_TIMESTAMP
            """,
            (campaign_id, name, description, visibility, status, existing["created_by"] if existing else session["username"]),
        )
    return get_campaign(campaign_id) or {}


def invite_player(campaign_id: str, username: str, session: dict[str, str]) -> dict[str, object]:
    invite_id = secrets.token_hex(8)
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_invites(id, campaign_id, username, invited_by, status)
            VALUES (?, ?, ?, ?, 'pending')
            ON CONFLICT(campaign_id, username) DO UPDATE SET
              status = 'pending',
              invited_by = excluded.invited_by,
              responded_at = NULL,
              created_at = CURRENT_TIMESTAMP
            """,
            (invite_id, campaign_id, username, session["username"]),
        )
        row = conn.execute(
            "SELECT id, campaign_id, username, invited_by, status, created_at, responded_at FROM campaign_invites WHERE campaign_id = ? AND username = ?",
            (campaign_id, username),
        ).fetchone()
    return row_dict(row)


def join_campaign(campaign_id: str, character_id: str, session: dict[str, str]) -> dict[str, object]:
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_members(campaign_id, username, character_id, role)
            VALUES (?, ?, ?, 'player')
            ON CONFLICT(campaign_id, username) DO UPDATE SET
              character_id = excluded.character_id,
              joined_at = CURRENT_TIMESTAMP
            """,
            (campaign_id, session["username"], character_id),
        )
        conn.execute(
            "UPDATE campaign_invites SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND username = ?",
            (campaign_id, session["username"]),
        )
        row = conn.execute(
            "SELECT campaign_id, username, character_id, role, joined_at FROM campaign_members WHERE campaign_id = ? AND username = ?",
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
            WHERE i.username = ? AND i.status = 'pending'
            ORDER BY i.created_at DESC
            """,
            (username,),
        ).fetchall()
        memberships = conn.execute(
            """
            SELECT c.id, c.name, c.description, c.visibility, c.status, m.character_id, m.joined_at
            FROM campaign_members m
            JOIN campaigns c ON c.id = m.campaign_id
            WHERE m.username = ? AND c.status = 'active'
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
