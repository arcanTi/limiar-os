#!/usr/bin/env python3
"""Revoke every session and reissue a user's access token.

`LIMIAR_MASTER_TOKEN` only seeds the admin on a fresh database (`init_db`
inserts it when the user does not exist yet), so on an existing deployment this
script is the supported way to rotate a token — in particular the master one,
if it was ever pasted somewhere it should not have been.

    python3 scripts/rotate-credentials.py            # revoke sessions + reissue master
    python3 scripts/rotate-credentials.py --user ana # pick a different account
    python3 scripts/rotate-credentials.py --sessions-only

The new token is printed once, here, because nothing else stores it in a form
you can read back. Stop the server before running this: the rotation takes
effect immediately and every client will need to log in again.
"""

import argparse
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import DEFAULT_GM_USER
from backend.db import db, using_postgres
from backend.security import generate_access_token


def revoke_sessions(conn: Any) -> int:  # noqa: ANN401 - shared DB facade
    count = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    conn.execute("DELETE FROM sessions")
    return count


def reissue_token(conn: Any, username: str) -> None:  # noqa: ANN401 - shared DB facade
    exists = conn.execute(
        "SELECT 1 FROM users WHERE username = %s",
        (username,),
    ).fetchone()
    if not exists:
        sys.exit(f"user '{username}' not found in PostgreSQL")

    token = generate_access_token()
    while conn.execute(
        "SELECT 1 FROM users WHERE access_token = %s",
        (token,),
    ).fetchone():
        token = generate_access_token()

    conn.execute(
        "UPDATE users SET access_token = %s WHERE username = %s",
        (token, username),
    )
    print(f"new access token for '{username}': {token}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user", default=DEFAULT_GM_USER, help="account to reissue")
    parser.add_argument(
        "--sessions-only",
        action="store_true",
        help="revoke sessions without touching any access token",
    )
    args = parser.parse_args()

    if not using_postgres():
        sys.exit("LIMIAR_DATABASE_URL must point to PostgreSQL")
    with db() as conn:
        revoked = revoke_sessions(conn)
        print(f"revoked {revoked} session(s)")
        if not args.sessions_only:
            reissue_token(conn, args.user)


if __name__ == "__main__":
    main()
