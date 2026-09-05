"""Replace password/Google credentials with 6-character access tokens.

Every existing account is handed a freshly generated token: password hashes
are one-way, so there is nothing to convert, and the operator has to hand the
new tokens out from the GM panel after the upgrade.

Revision ID: 0006
Revises: 0005
"""

from alembic import op

from backend.security import generate_access_token

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS access_token TEXT")
    connection = op.get_bind()
    usernames = [
        row[0]
        for row in connection.exec_driver_sql(
            "SELECT username FROM users WHERE access_token IS NULL"
        ).fetchall()
    ]
    issued: set[str] = set()
    for username in usernames:
        token = generate_access_token()
        while token in issued:
            token = generate_access_token()
        issued.add(token)
        connection.exec_driver_sql(
            "UPDATE users SET access_token = %s WHERE username = %s",
            (token, username),
        )
    op.execute("ALTER TABLE users ALTER COLUMN access_token SET NOT NULL")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_access_token ON users(access_token)"
    )
    op.execute("DROP TABLE IF EXISTS password_reset_requests")
    op.execute("DROP INDEX IF EXISTS idx_users_google_sub")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS google_sub")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_hash")


def downgrade() -> None:
    # Credentials cannot be restored: the old hashes are gone. The columns come
    # back empty so the previous schema loads, and every account then needs a
    # password reset.
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub "
        "ON users(google_sub) WHERE google_sub IS NOT NULL"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_requests (
          username TEXT PRIMARY KEY REFERENCES users(username),
          requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute("DROP INDEX IF EXISTS idx_users_access_token")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS access_token")
