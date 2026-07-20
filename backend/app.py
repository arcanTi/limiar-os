"""Application wiring: composes the route mixins into LimiarHandler, dispatches
HTTP verbs to the right handler, and boots the server."""

import logging
import os
from http import HTTPStatus
from http.server import ThreadingHTTPServer
from urllib.parse import unquote, urlparse

from .api.auth import AuthRoutes
from .api.base import BaseHandler
from .api.catalog import CatalogRoutes
from .api.campaigns import CampaignRoutes
from .api.campaign_maps import CampaignMapRoutes
from .api.characters import CharacterRoutes
from .api.comms import CommsRoutes
from .api.meta import MetaRoutes
from .api.state import StateRoutes
from .api.uploads import UploadRoutes
from .config import DB_PATH, DEFAULT_GM_USER
from .db import init_db
from .repositories import campaign_sync
from .repositories.chat import clear_chat
from .repositories.records import delete_record


class LimiarHandler(
    AuthRoutes,
    CampaignRoutes,
    CampaignMapRoutes,
    CharacterRoutes,
    CatalogRoutes,
    StateRoutes,
    CommsRoutes,
    MetaRoutes,
    UploadRoutes,
    BaseHandler,
):
    """HTTP request handler for all Limiar OS API and static file routes."""

    def do_GET(self) -> None:  # noqa: N802 (name mandated by BaseHTTPRequestHandler)
        path = urlparse(self.path).path
        if not path.startswith("/api/"):
            return super().do_GET()

        exact = {
            "/api/health": self._get_health,
            "/api/meta/config": self._get_config,
            "/api/meta/login-art": self._get_login_art,
            "/api/session": self._get_session,
            "/api/users": self._get_users,
            "/api/password-reset-requests": self._get_password_reset_requests,
            "/api/campaigns": self._get_campaigns,
            "/api/notifications": self._get_notifications,
            "/api/characters": self._get_characters,
            "/api/items": self._get_items,
            "/api/map": self._get_map,
            "/api/nexus-challenge": self._get_nexus_challenge,
            "/api/nexus-result": self._get_nexus_result,
            "/api/hq": self._get_hq,
            "/api/tarot-state": self._get_tarot_state,
            "/api/combat-state": self._get_combat_state,
            "/api/chat": self._get_chat,
            "/api/i18n": self._get_i18n,
        }
        if path in exact:
            return exact[path]()

        if path.startswith("/api/characters/"):
            return self._get_character_by_id(unquote(path[len("/api/characters/") :]))
        if self.route_campaign_updates_get(path):
            return None
        if self.route_campaign_map_get(path):
            return None
        if path.startswith("/api/reference/"):
            return self._get_reference(path[len("/api/reference/") :])

        return self.write_error(HTTPStatus.NOT_FOUND, "Unknown API route")

    def do_POST(self) -> None:  # noqa: N802 (name mandated by BaseHTTPRequestHandler)
        path = urlparse(self.path).path
        if not path.startswith("/api/"):
            return self.write_error(HTTPStatus.NOT_FOUND, "Unknown API route")

        # Open routes — no auth required.
        open_routes = {
            "/api/login": self._post_login,
            "/api/register": self._post_register,
            "/api/auth/google": self._post_google_login,
            "/api/password-reset-requests": self._post_password_reset_request,
            "/api/logout": self._post_logout,
            "/api/chat": self._post_chat,
            "/api/combat-state/end-turn": self._post_combat_end_turn,
            "/api/nexus-result": self._post_nexus_result,  # players post Netrun results
        }
        if path in open_routes:
            return open_routes[path]()

        session = self.require_login()
        if session is None:
            return None

        if path == "/api/users/me":
            return self._post_users_me(session)

        if path == "/api/player-characters":
            return self._post_player_characters(session)

        if path.startswith("/api/characters/") and path.endswith("/notes"):
            record_id = unquote(path[len("/api/characters/") : -len("/notes")])
            return self._post_character_notes(record_id, session)

        if path == "/api/users":
            return self._post_users()

        if path == "/api/uploads/images":
            return self.handle_upload()

        if self.route_campaign_post(path):
            return None

        if self.route_campaign_map_post(path):
            return None

        # GM-only routes.
        gm_session = self.require_gm()
        if gm_session is None:
            return None

        if path == "/api/characters":
            return self._post_characters(gm_session)

        gm_routes = {
            "/api/items": self._post_items,
            "/api/map": self._post_map,
            "/api/nexus-challenge": self._post_nexus_challenge,
            "/api/hq": self._post_hq,
            "/api/tarot-state": self._post_tarot_state,
            "/api/combat-state": self._post_combat_state,
        }
        if path in gm_routes:
            return gm_routes[path]()

        return self.write_error(HTTPStatus.NOT_FOUND, "Unknown API route")

    def do_DELETE(self) -> None:  # noqa: N802 (name mandated by BaseHTTPRequestHandler)
        path = urlparse(self.path).path
        if not path.startswith("/api/"):
            return self.write_error(HTTPStatus.NOT_FOUND, "Unknown API route")
        if not self.require_gm():
            return None

        if path == "/api/chat":
            clear_chat()
            return self.write_json({"cleared": True})

        if path.startswith("/api/users/"):
            return self._delete_user(unquote(path[len("/api/users/") :]))

        if path.startswith("/api/password-reset-requests/"):
            return self._delete_password_reset_request(unquote(path[len("/api/password-reset-requests/") :]))

        if self.route_campaign_delete(path):
            return None

        routes = {
            "/api/characters/": "characters",
            "/api/items/": "items",
            "/api/map/": "map",
        }
        for prefix, kind in routes.items():
            if path.startswith(prefix):
                record_id = unquote(path[len(prefix) :])
                result = self.write_json({"deleted": delete_record(kind, record_id)})
                if kind == "characters":
                    campaign_sync.bump_all("roster")
                return result

        return self.write_error(HTTPStatus.NOT_FOUND, "Unknown API route")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if not os.environ.get("LIMIAR_GM_PASSWORD"):
        logging.warning(
            "[limiar] WARN: LIMIAR_GM_PASSWORD not set — using default password. "
            "Set this env var before exposing the server to other users.",
        )
    init_db()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((host, port), LimiarHandler)
    logging.info("[limiar] serving http://%s:%d/Limiar%%20OS.dc-2.html", host, port)
    logging.info("[limiar] sqlite %s", DB_PATH)
    logging.info("[limiar] GM user: %s", DEFAULT_GM_USER)
    server.serve_forever()
