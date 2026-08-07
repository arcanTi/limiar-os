"""Native FastAPI catalog endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends

from ..application.catalog import CatalogService
from ..dependencies import catalog
from ..schemas import Document
from .common import Session, require_session, require_staff

router = APIRouter(prefix="/api", tags=["catalog"])
Catalog = Annotated[CatalogService, Depends(catalog)]
Authenticated = Annotated[Session, Depends(require_session)]
Staff = Annotated[Session, Depends(require_staff)]


@router.get("/items")
def list_items(_session: Authenticated, service: Catalog) -> list[dict[str, object]]:
    return service.list("items")


@router.post("/items")
def save_item(payload: Document, _session: Staff, service: Catalog) -> dict[str, object]:
    return service.save("items", payload.payload())


@router.delete("/items/{record_id}")
def delete_item(record_id: str, _session: Staff, service: Catalog) -> dict[str, bool]:
    return {"deleted": service.delete("items", record_id)}


@router.get("/map")
def list_map(_session: Authenticated, service: Catalog) -> list[dict[str, object]]:
    return service.list("map")


@router.post("/map")
def save_map(payload: Document, _session: Staff, service: Catalog) -> dict[str, object]:
    return service.save("map", payload.payload())


@router.delete("/map/{record_id}")
def delete_map(record_id: str, _session: Staff, service: Catalog) -> dict[str, bool]:
    return {"deleted": service.delete("map", record_id)}
