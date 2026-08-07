"""Native FastAPI image upload endpoint."""

import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from starlette.datastructures import UploadFile

from ..application.assets import AssetService
from ..dependencies import assets
from .common import ApiError, Session, require_session

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
Assets = Annotated[AssetService, Depends(assets)]
Authenticated = Annotated[Session, Depends(require_session)]


@router.post("/images")
async def upload_image(
    request: Request, _session: Authenticated, service: Assets
) -> dict[str, object]:
    form = await request.form()
    uploaded = form.get("file")
    if not isinstance(uploaded, UploadFile):
        raise ApiError(400, "file required")
    raw_meta = str(form.get("meta") or "{}")
    try:
        meta = json.loads(raw_meta)
    except json.JSONDecodeError:
        meta = {}
    if not isinstance(meta, dict):
        meta = {}
    return service.save_image(
        content=await uploaded.read(),
        mime=uploaded.content_type or "",
        filename=Path(uploaded.filename or "upload").name,
        meta=meta,
    )
