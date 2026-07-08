"""Upload route: multipart image upload, validated and stored under uploads/."""

import json
import secrets
from http import HTTPStatus
from pathlib import Path
from typing import TypedDict

from ..config import _ALLOWED_IMAGE_TYPES, _MAX_UPLOAD_BYTES, UPLOAD_DIR
from ..repositories.records import upsert_record
from ..util import slug


class MultipartPart(TypedDict):
    """A single part decoded from a multipart/form-data body."""

    filename: str | None
    type: str | None
    data: bytes


class UploadRoutes:
    """Route for validated multipart image uploads."""

    def handle_upload(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type or "boundary=" not in content_type:
            return self.write_error(HTTPStatus.BAD_REQUEST, "multipart/form-data required")
        length = int(self.headers.get("Content-Length") or 0)
        if length > _MAX_UPLOAD_BYTES:
            max_mb = _MAX_UPLOAD_BYTES // (1024 * 1024)
            return self.write_error(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                f"File too large (max {max_mb} MB)",
            )
        boundary = content_type.split("boundary=", 1)[1].strip().strip('"')
        body = self.rfile.read(length)
        form = self.parse_multipart(body, boundary)
        file_item = form.get("file")
        meta: dict[str, object] = {}
        if "meta" in form and form["meta"]["data"]:
            try:
                meta = json.loads(form["meta"]["data"].decode("utf-8") or "{}")
            except json.JSONDecodeError:
                meta = {}
        if file_item is None or not file_item["data"]:
            return self.write_error(HTTPStatus.BAD_REQUEST, "file required")

        # Derive type from Content-Type header of the part, not the filename.
        mime = (file_item["type"] or "").lower().split(";")[0].strip()
        suffix = _ALLOWED_IMAGE_TYPES.get(mime)
        if suffix is None:
            return self.write_error(
                HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                f"Unsupported file type '{mime}'. Allowed: {', '.join(_ALLOWED_IMAGE_TYPES)}",
            )
        original = Path(file_item["filename"] or "upload").name
        asset_id = f"{slug(meta.get('scope') or 'asset')}-{secrets.token_hex(8)}"
        target = UPLOAD_DIR / f"{asset_id}{suffix}"
        with target.open("wb") as out:
            out.write(file_item["data"])
        asset: dict[str, object] = {
            "id": asset_id,
            "name": original,
            "scope": meta.get("scope") or "asset",
            "ownerId": meta.get("ownerId"),
            "type": mime,
            "url": f"/uploads/{target.name}",
        }
        upsert_record("assets", asset)
        return self.write_json(asset)

    def parse_multipart(self, body: bytes, boundary: str) -> dict[str, MultipartPart]:
        marker = ("--" + boundary).encode("utf-8")
        out: dict[str, MultipartPart] = {}
        for chunk in body.split(marker):
            part = chunk.strip(b"\r\n")
            if not part or part == b"--":
                continue
            if part.endswith(b"--"):
                part = part[:-2].strip(b"\r\n")
            if b"\r\n\r\n" not in part:
                continue
            raw_headers, data = part.split(b"\r\n\r\n", 1)
            headers: dict[str, str] = {}
            for line in raw_headers.decode("utf-8", "replace").split("\r\n"):
                if ":" in line:
                    key, value = line.split(":", 1)
                    headers[key.lower().strip()] = value.strip()
            disposition = headers.get("content-disposition", "")
            attrs: dict[str, str] = {}
            for raw_section in disposition.split(";"):
                section = raw_section.strip()
                if "=" in section:
                    key, value = section.split("=", 1)
                    attrs[key.strip()] = value.strip().strip('"')
            name = attrs.get("name")
            if not name:
                continue
            out[name] = {
                "filename": attrs.get("filename"),
                "type": headers.get("content-type"),
                "data": data.rstrip(b"\r\n"),
            }
        return out
