#!/usr/bin/env python3
"""Revoke every session and reset a user's password.

`LIMIAR_GM_PASSWORD` only seeds the admin on a fresh database (`init_db` inserts
it when the user does not exist yet), so it cannot rotate the password of an
account that already exists. This script is the supported way to do that.

The password is read from an interactive prompt: it never lands in shell
history, in the process list, or in a log.

    python3 scripts/rotate-credentials.py            # revoke sessions + reset admin
    python3 scripts/rotate-credentials.py --user ana # pick a different account
    python3 scripts/rotate-credentials.py --sessions-only

Stop the server before running this — the reset takes effect immediately and
every client will need to log in again.
"""

import argparse
import getpass
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import DEFAULT_GM_USER
from backend.db import db, using_postgres
from backend.security import password_hash

MIN_LENGTH = 12


def revoke_sessions(conn: Any) -> int:  # noqa: ANN401 - shared SQLite/PostgreSQL facade
    count = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    conn.execute("DELETE FROM sessions")
    return count


def reset_password(conn: Any, username: str) -> None:  # noqa: ANN401 - shared DB facade
    exists = conn.execute(
        "SELECT 1 FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if not exists:
        sys.exit(f"user '{username}' not found in PostgreSQL")

    first = getpass.getpass(f"New password for '{username}': ")
    if len(first) < MIN_LENGTH:
        sys.exit(f"password too short (minimum {MIN_LENGTH} characters)")
    if first != getpass.getpass("Confirm: "):
        sys.exit("passwords do not match")

    conn.execute(
        "UPDATE users SET password_hash = ? WHERE username = ?",
        (password_hash(first), username),
    )
    print(f"password updated for '{username}'")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user", default=DEFAULT_GM_USER, help="account to reset")
    parser.add_argument(
        "--sessions-only",
        action="store_true",
        help="revoke sessions without touching any password",
    )
    args = parser.parse_args()

    if not using_postgres():
        sys.exit("LIMIAR_DATABASE_URL must point to PostgreSQL")
    with db() as conn:
        revoked = revoke_sessions(conn)
        print(f"revoked {revoked} session(s)")
        if not args.sessions_only:
            reset_password(conn, args.user)


if __name__ == "__main__":
    main()
