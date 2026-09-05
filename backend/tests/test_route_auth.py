"""Every API route is closed unless it is explicitly public.

Regression cover for the 2026-07-28 finding: auth was decided inside each
handler, so 7 GET and 3 POST routes answered without a session simply because
nobody remembered to gate them. The dispatcher now calls require_login() before
resolving a route, and this module proves it two ways:

1. `test_non_public_routes_reject_anonymous_callers` drives a real server and
   asserts every probe outside PUBLIC_*_ROUTES answers 401 without a token.
2. `test_every_api_route_literal_is_probed` scans the route sources for
   `/api/...` literals and fails when one has no probe — so a route added later
   cannot quietly skip the check above.
"""

import re
from http import HTTPStatus

import pytest
from fastapi.testclient import TestClient

from backend.asgi import create_app

PUBLIC_ROUTES = {
    ("GET", "/api/health"),
    ("GET", "/api/meta/login-art"),
    ("GET", "/api/session"),
    ("GET", "/api/i18n"),
    ("POST", "/api/login"),
    ("POST", "/api/logout"),
}


def route_probes() -> list[tuple[str, str, str]]:
    """Discover API routes through the public OpenAPI contract.

    FastAPI 0.141 keeps included routers nested instead of flattening every
    ``APIRoute`` into ``app.routes``.  OpenAPI is the stable public inventory
    of HTTP operations and keeps this security test independent of FastAPI's
    internal router representation.
    """
    probes: list[tuple[str, str, str]] = []
    http_methods = {"get", "post", "put", "patch", "delete", "trace"}
    for path, path_item in create_app().openapi()["paths"].items():
        if not path.startswith("/api/"):
            continue
        concrete = re.sub(r"\{[^{}]+\}", "probe-id", path)
        for method in sorted(http_methods.intersection(path_item)):
            probes.append((method.upper(), path, concrete))
    return probes


@pytest.fixture()
def live_server(db_path):
    """The supported ASGI application, backed by the isolated test database."""
    with TestClient(create_app()) as client:
        yield client


def call(client: TestClient, method: str, path: str) -> int:
    payload = {"targetId": "probe-id"} if path.endswith("/end-turn") else {}
    response = client.request(method, path, json=payload if method in ("POST", "DELETE") else None)
    return response.status_code


def is_public(method: str, template: str) -> bool:
    return (method, template) in PUBLIC_ROUTES


def test_non_public_routes_reject_anonymous_callers(live_server):
    leaked = [
        f"{method} {path} -> {status}"
        for method, template, path in route_probes()
        if not is_public(method, template)
        and (status := call(live_server, method, path)) != HTTPStatus.UNAUTHORIZED
    ]
    assert not leaked, "routes answered without a session: " + ", ".join(leaked)


def test_public_routes_stay_reachable_without_a_session(live_server):
    blocked = [
        f"{method} {path} -> {status}"
        for method, template, path in route_probes()
        if is_public(method, template)
        and (status := call(live_server, method, path)) == HTTPStatus.UNAUTHORIZED
    ]
    assert not blocked, "public routes demanded a session: " + ", ".join(blocked)


def test_every_http_api_route_is_discovered():
    probes = route_probes()
    assert len(probes) >= 70
    assert len({(method, template) for method, template, _ in probes}) == len(probes)
