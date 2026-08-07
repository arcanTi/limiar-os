"""Google identity-token verification shared by native transports."""

import json
import urllib.error
import urllib.parse
import urllib.request

from ..config import GOOGLE_CLIENT_ID

_GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo?id_token="
_GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


def verify_google_id_token(id_token: str) -> dict[str, object] | None:
    url = _GOOGLE_TOKENINFO_URL + urllib.parse.quote(id_token, safe="")
    try:
        with urllib.request.urlopen(url, timeout=5) as response:  # noqa: S310 - fixed HTTPS host
            claims = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, TimeoutError, OSError):
        return None
    if claims.get("aud") != GOOGLE_CLIENT_ID:
        return None
    if claims.get("iss") not in _GOOGLE_ISSUERS:
        return None
    if claims.get("email_verified") not in {"true", True}:
        return None
    return claims
