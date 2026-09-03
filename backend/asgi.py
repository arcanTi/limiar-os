"""FastAPI/ASGI boundary for native HTTP routes and campaign WebSockets."""

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Annotated
from urllib.parse import unquote

import uvicorn
from fastapi import Depends, FastAPI, Request, WebSocket
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import RequestResponseEndpoint
from starlette.websockets import WebSocketDisconnect

from .application.campaign_events import CampaignEventService
from .application.errors import ApplicationError
from .config import DEFAULT_GM_USER, INDEX_FILE, ROOT
from .db import init_db, using_postgres
from .dependencies import campaign_events
from .domain.validation import ValidationError
from .routers.auth import router as auth_router
from .routers.campaign_maps import router as campaign_maps_router
from .routers.campaigns import router as campaigns_router
from .routers.catalog import router as catalog_router
from .routers.characters import router as characters_router
from .routers.chat import router as chat_router
from .routers.common import problem_response
from .routers.meta import router as meta_router
from .routers.state import router as state_router
from .routers.uploads import router as uploads_router
from .static_files import servable_path


def _websocket_token(websocket: WebSocket) -> str:
    auth = websocket.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth.split(" ", 1)[1].strip()
    offered = websocket.headers.get("sec-websocket-protocol", "")
    for protocol in (part.strip() for part in offered.split(",")):
        if protocol.startswith("bearer."):
            return protocol[len("bearer.") :]
    return ""


def _static_headers(path: Path) -> dict[str, str]:
    common = {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
    }
    if path.is_relative_to(ROOT / "uploads"):
        common.update(
            {
                "Content-Disposition": "inline",
                "Content-Security-Policy": "sandbox; default-src 'none'",
            }
        )
    else:
        common["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' 'unsafe-eval';"
            " style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;"
            " font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none';"
        )
    return common


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if not using_postgres():
            message = (
                "LIMIAR_DATABASE_URL is required and must point to PostgreSQL; "
                "the new deployment does not import or fall back to SQLite"
            )
            raise RuntimeError(message)
        await run_in_threadpool(init_db)
        yield

    application = FastAPI(title="Limiar OS API", version="2.0", lifespan=lifespan)

    @application.middleware("http")
    async def security_headers(
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        if request.url.path.startswith("/uploads/"):
            response.headers.setdefault("Content-Disposition", "inline")
            response.headers.setdefault(
                "Content-Security-Policy",
                "sandbox; default-src 'none'",
            )
        else:
            response.headers.setdefault(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'self' 'unsafe-eval';"
                " style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;"
                " font-src 'self' data:; connect-src 'self' ws: wss:;"
                " frame-ancestors 'none';",
            )
        return response

    @application.exception_handler(ApplicationError)
    async def api_problem_handler(_request: Request, problem: ApplicationError) -> JSONResponse:
        return problem_response(problem)

    @application.exception_handler(ValidationError)
    async def validation_problem_handler(
        _request: Request, problem: ValidationError
    ) -> JSONResponse:
        return problem_response(ApplicationError(400, str(problem), "VALIDATION_ERROR"))

    application.include_router(auth_router)
    application.include_router(campaigns_router)
    application.include_router(campaign_maps_router)
    application.include_router(meta_router)
    application.include_router(catalog_router)
    application.include_router(characters_router)
    application.include_router(chat_router)
    application.include_router(state_router)
    application.include_router(uploads_router)

    @application.websocket("/api/ws/campaigns/{campaign_id}")
    async def campaign_events_socket(
        websocket: WebSocket,
        campaign_id: str,
        service: Annotated[CampaignEventService, Depends(campaign_events)],
        since: int = 0,
    ) -> None:
        token = _websocket_token(websocket)
        try:
            await run_in_threadpool(service.authorize, token, campaign_id)
        except ApplicationError as problem:
            close_codes = {401: 4401, 403: 4403, 404: 4404}
            await websocket.close(
                code=close_codes.get(problem.status, 4500),
                reason=problem.message,
            )
            return

        await websocket.accept(subprotocol="limiar.v1")
        loop = asyncio.get_running_loop()
        events: asyncio.Queue[dict[str, object]] = asyncio.Queue(maxsize=32)

        def listener(event: dict[str, object]) -> None:
            if event.get("campaignId") != campaign_id:
                return

            def enqueue() -> None:
                if events.full():
                    with suppress(asyncio.QueueEmpty):
                        events.get_nowait()
                events.put_nowait(event)

            loop.call_soon_threadsafe(enqueue)

        unsubscribe = service.subscribe(listener)
        current = max(0, since)
        disconnected = asyncio.Event()

        async def receive_until_disconnect() -> None:
            try:
                while True:
                    message = await websocket.receive()
                    if message["type"] == "websocket.disconnect":
                        disconnected.set()
                        if not events.full():
                            events.put_nowait({"disconnect": True})
                        return
            except WebSocketDisconnect:
                disconnected.set()
                if not events.full():
                    events.put_nowait({"disconnect": True})

        receiver = asyncio.create_task(receive_until_disconnect())
        try:
            initial = service.snapshot(campaign_id, current)
            current = int(initial["version"])
            await websocket.send_json({"type": "campaign.update", **initial})
            while not disconnected.is_set():
                try:
                    await asyncio.wait_for(events.get(), timeout=20)
                    if disconnected.is_set():
                        break
                    update = service.snapshot(campaign_id, current)
                    current = int(update["version"])
                    await websocket.send_json({"type": "campaign.update", **update})
                except TimeoutError:
                    if disconnected.is_set():
                        break
                    await websocket.send_json(
                        {"type": "heartbeat", "version": service.current_version(campaign_id)}
                    )
        except WebSocketDisconnect:
            pass
        finally:
            unsubscribe()
            if not receiver.done():
                receiver.cancel()
            await asyncio.gather(receiver, return_exceptions=True)

    @application.get("/{static_path:path}", include_in_schema=False)
    async def static_file(static_path: str) -> Response:
        requested = "/" + unquote(static_path)
        allowed = servable_path(requested)
        if allowed is None or not allowed.is_file():
            return JSONResponse({"detail": "Not found"}, status_code=404)
        return FileResponse(allowed, headers=_static_headers(allowed))

    return application


app = create_app()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8765"))
    logging.info("[limiar] FastAPI/PostgreSQL on http://%s:%d/%s", host, port, INDEX_FILE)
    logging.info("[limiar] GM user: %s", DEFAULT_GM_USER)
    uvicorn.run(
        "backend.asgi:app",
        host=host,
        port=port,
        log_level="info",
        access_log=False,
    )
