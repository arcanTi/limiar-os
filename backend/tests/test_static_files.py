"""Static file allowlist.

Regression cover for the 2026-07-28 finding: `translate_path` confined requests
to ROOT, but ROOT is the project directory, so an unauthenticated
`GET /data/limiar.db` returned the whole database — password hashes and live
session tokens included.
"""

from backend.config import INDEX_FILE, ROOT
from backend.static_files import servable_path


def resolve(url_path: str):
    return servable_path(url_path)


def test_database_is_not_servable():
    assert resolve("/data/limiar.db") is None


def test_backend_source_is_not_servable():
    assert resolve("/backend/config.py") is None
    assert resolve("/backend/security.py") is None


def test_git_directory_is_not_servable():
    assert resolve("/.git/config") is None
    assert resolve("/.gitignore") is None


def test_frontend_source_and_docs_are_not_servable():
    assert resolve("/frontend/src/main.js") is None
    assert resolve("/frontend/index.html") is None
    assert resolve("/docs/AUDITORIA-2026-07-28.md") is None
    assert resolve("/README.md") is None


def test_traversal_out_of_an_allowed_dir_is_rejected():
    # `..` must be collapsed before the allowlist check, or an allowed prefix
    # smuggles a disallowed target through.
    assert resolve("/dist/../data/limiar.db") is None
    assert resolve("/dist/%2e%2e/data/limiar.db") is None
    assert resolve("/../limiar-os-sibling/secret.txt") is None


def test_allowed_entry_points_still_resolve():
    assert resolve("/") == ROOT / "dist" / INDEX_FILE
    assert resolve("/index.html") == ROOT / "dist" / INDEX_FILE
    assert resolve("/login.html") == ROOT / "dist" / "login.html"
    assert resolve("/campaign-map.html") == ROOT / "dist" / "campaign-map.html"
    assert resolve("/limiar-styles.css") is None


def test_allowed_directories_still_resolve():
    assert resolve("/dist/assets/limiar-app.js") == ROOT / "dist" / "assets" / "limiar-app.js"
    assert resolve("/uploads/portrait.png") == ROOT / "uploads" / "portrait.png"
    assert resolve("/vendor/sarah-dice/dice.js") == ROOT / "vendor" / "sarah-dice" / "dice.js"
    assert resolve("/assets/trauma-team-logo.png") == ROOT / "assets" / "trauma-team-logo.png"


def test_percent_encoded_index_resolves():
    assert resolve("/Limiar%20OS.dc-2.html") == ROOT / "dist" / INDEX_FILE


def test_query_string_does_not_defeat_the_allowlist():
    assert resolve("/data/limiar.db?x=1") is None
    assert resolve("/dist/assets/limiar-app.js?v=2") == ROOT / "dist" / "assets" / "limiar-app.js"
