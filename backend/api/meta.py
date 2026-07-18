"""Meta routes: health check, static reference data, and i18n bundles."""

from http import HTTPStatus

from ..config import DB_PATH, GOOGLE_CLIENT_ID
from ..repositories.records import get_reference


class MetaRoutes:
    """Routes for health checks, reference data, and i18n bundles."""

    def _get_health(self) -> None:
        self.write_json({"ok": True, "db": str(DB_PATH)})

    def _get_config(self) -> None:
        # Public, unauthenticated config — a Google OAuth client id is a
        # public identifier, not a secret, safe to expose to any client.
        self.write_json({"googleClientId": GOOGLE_CLIENT_ID})

    def _get_reference(self, name: str) -> None:
        data = get_reference(name)
        if data is None:
            return self.write_error(HTTPStatus.NOT_FOUND, f"Reference '{name}' not found")
        return self.write_json(data)

    def _get_i18n(self) -> None:
        data = get_reference("i18n")
        if data is None:
            return self.write_error(HTTPStatus.NOT_FOUND, "i18n not found")
        return self.write_json(data)
