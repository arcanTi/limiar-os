"""Public metadata, health, and static reference endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends

from ..application.meta import MetadataService
from ..config import GOOGLE_CLIENT_ID, ROOT
from ..dependencies import metadata
from ..schemas import ConfigResponse, HealthResponse, LoginArtResponse
from .common import Session, require_session

router = APIRouter(tags=["meta"])
Authenticated = Annotated[Session, Depends(require_session)]
Metadata = Annotated[MetadataService, Depends(metadata)]
LOGIN_ART_DIR = ROOT / "assets" / "login"
LOGIN_ART_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".avif")


@router.get("/api/health", response_model=HealthResponse)
def health(service: Metadata) -> dict[str, object]:
    return service.health()


@router.get("/api/meta/config", response_model=ConfigResponse)
def config() -> dict[str, str]:
    return {"googleClientId": GOOGLE_CLIENT_ID}


@router.get("/api/meta/login-art", response_model=LoginArtResponse)
def login_art() -> dict[str, list[str]]:
    images = (
        [
            f"/assets/login/{entry.name}"
            for entry in sorted(LOGIN_ART_DIR.iterdir())
            if entry.is_file() and entry.suffix.lower() in LOGIN_ART_EXTS
        ]
        if LOGIN_ART_DIR.is_dir()
        else []
    )
    return {"images": images}


@router.get("/api/i18n")
def i18n(service: Metadata) -> object:
    return service.reference("i18n")


@router.get("/api/reference/{name}")
def reference(name: str, _session: Authenticated, service: Metadata) -> object:
    return service.reference(name)
