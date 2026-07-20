"""Meta routes: health check, static reference data, and i18n bundles."""

from http import HTTPStatus

from ..config import DB_PATH, GOOGLE_CLIENT_ID, ROOT
from ..repositories.records import get_reference

LOGIN_ART_DIR = ROOT / "assets" / "login"
LOGIN_ART_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".avif")


class MetaRoutes:
    """Routes for health checks, reference data, and i18n bundles."""

    def _get_health(self) -> None:
        self.write_json({"ok": True, "db": str(DB_PATH)})

    def _get_config(self) -> None:
        # Public, unauthenticated config — a Google OAuth client id is a
        # public identifier, not a secret, safe to expose to any client.
        self.write_json({"googleClientId": GOOGLE_CLIENT_ID})

    def _get_login_art(self) -> None:
        # Public list of hero images for the login page. Drop files into
        # assets/login/ and they join the random rotation — no code change.
        images: list[str] = []
        if LOGIN_ART_DIR.is_dir():
            for entry in sorted(LOGIN_ART_DIR.iterdir()):
                if entry.is_file() and entry.suffix.lower() in LOGIN_ART_EXTS:
                    images.append(f"/assets/login/{entry.name}")
        self.write_json({"images": images})

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
