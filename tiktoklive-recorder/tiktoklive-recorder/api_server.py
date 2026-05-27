from __future__ import annotations

import asyncio
import threading
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import Body, FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


class ApiServerHandle:
    def __init__(self, server, thread: threading.Thread):
        self._server = server
        self._thread = thread

    def shutdown(self) -> None:
        self._server.should_exit = True
        self._thread.join(timeout=2)


def _flatten_accounts(values: Optional[List[str]]) -> Optional[List[str]]:
    if not values:
        return None

    flattened: List[str] = []
    for value in values:
        for item in str(value).split(","):
            normalized = item.strip()
            if normalized:
                flattened.append(normalized)

    return flattened or None


def _read_unique_id(payload: Optional[Dict[str, object]], query_unique_id: Optional[str]) -> str:
    body_unique_id = ""
    if payload is not None:
        body_unique_id = str(payload.get("unique_id", "")).strip()
    unique_id = body_unique_id or str(query_unique_id or "").strip()
    if not unique_id:
        raise ValueError("Debes enviar unique_id.")
    return unique_id


def build_api_app(coordinator, publisher, event_bus) -> FastAPI:
    app = FastAPI(title="Ember Recorder API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/status")
    async def get_status() -> Dict[str, object]:
        return coordinator.get_status()

    @app.get("/live-status")
    async def get_live_status(accounts: Optional[List[str]] = Query(default=None)) -> Dict[str, object]:
        requested_accounts = _flatten_accounts(accounts)
        return {
            "ok": True,
            "statuses": coordinator.get_live_status(requested_accounts),
        }

    @app.post("/targets")
    async def start_target(payload: Optional[Dict[str, object]] = Body(default=None)):
        try:
            unique_id = _read_unique_id(payload, None)
            return coordinator.add_target(unique_id)
        except Exception as exc:
            return JSONResponse(status_code=400, content={"ok": False, "error": str(exc)})

    @app.delete("/targets")
    async def stop_target(
        unique_id: Optional[str] = Query(default=None),
        payload: Optional[Dict[str, object]] = Body(default=None),
    ):
        try:
            resolved_unique_id = _read_unique_id(payload, unique_id)
            return coordinator.stop_target(resolved_unique_id)
        except Exception as exc:
            return JSONResponse(status_code=400, content={"ok": False, "error": str(exc)})

    @app.delete("/sessions")
    async def delete_session(
        unique_id: Optional[str] = Query(default=None),
        session_id: Optional[str] = Query(default=None),
        start_time: Optional[str] = Query(default=None),
        payload: Optional[Dict[str, object]] = Body(default=None),
    ):
        try:
            resolved_unique_id = _read_unique_id(payload, unique_id)
            resolved_session_id = str(
                (payload or {}).get("session_id") or session_id or ""
            ).strip() or None
            resolved_start_time = str(
                (payload or {}).get("start_time") or start_time or ""
            ).strip() or None
            return coordinator.delete_ended_session(
                resolved_unique_id,
                session_id=resolved_session_id,
                start_time=resolved_start_time,
            )
        except Exception as exc:
            return JSONResponse(status_code=400, content={"ok": False, "error": str(exc)})

    @app.websocket("/ws")
    async def ws_events(websocket: WebSocket) -> None:
        await websocket.accept()
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[Dict[str, object]] = asyncio.Queue(maxsize=200)
        is_closed = False

        def on_event(event: Dict[str, object]) -> None:
            if is_closed:
                return

            def push() -> None:
                if queue.full():
                    try:
                        queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                queue.put_nowait(dict(event))

            loop.call_soon_threadsafe(push)

        subscription_token = event_bus.subscribe(on_event)

        try:
            await websocket.send_json(
                {
                    "type": "snapshot",
                    "reason": "connected",
                    "emittedAt": datetime.now().isoformat(),
                    "event": None,
                    "bridgePayload": publisher.get_payload(),
                    "controlStatus": coordinator.get_status(),
                }
            )

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    await websocket.send_json(
                        {
                            "type": "snapshot",
                            "reason": "event",
                            "emittedAt": datetime.now().isoformat(),
                            "event": event,
                            "bridgePayload": publisher.get_payload(),
                            "controlStatus": coordinator.get_status(),
                        }
                    )
                    continue
                except asyncio.TimeoutError:
                    pass

                await websocket.send_json(
                    {
                        "type": "snapshot",
                        "reason": "heartbeat",
                        "emittedAt": datetime.now().isoformat(),
                        "event": None,
                    }
                )

        except WebSocketDisconnect:
            return
        finally:
            is_closed = True
            event_bus.unsubscribe(subscription_token)

    return app


def create_api_app(coordinator, publisher, event_bus) -> FastAPI:
    return build_api_app(coordinator, publisher, event_bus)


def start_api_server(coordinator, publisher, event_bus, host: str, port: int) -> ApiServerHandle:
    try:
        import uvicorn
    except ModuleNotFoundError as exc:
        raise RuntimeError("FastAPI server requires uvicorn.") from exc

    app = build_api_app(coordinator, publisher, event_bus)
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="info",
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    return ApiServerHandle(server, thread)
