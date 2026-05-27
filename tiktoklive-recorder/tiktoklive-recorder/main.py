# main.py
import atexit
import asyncio
import json
import os
import queue
import threading
import time
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Protocol
from urllib.parse import parse_qs, urlparse

from TikTokLive import TikTokLiveClient
from event_bus import EventBus, build_event
from tiktok_listener import TikTokCommentRecorder, build_tiktok_client

try:
    import tkinter as tk
    from tkinter import scrolledtext
except ModuleNotFoundError:
    tk = None
    scrolledtext = None

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv(dotenv_path: str = ".env") -> None:
        env_path = Path(dotenv_path)
        if not env_path.exists():
            return

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


ENV_PATHS = [
    Path(".env"),
    Path(__file__).resolve().parents[1] / ".env",
    Path(__file__).resolve().parent / ".env",
]
for env_path in ENV_PATHS:
    load_dotenv(str(env_path))

DRIVE_FOLDER_ID = os.getenv("DRIVE_FOLDER_ID", "1lGNGn3QABqcsjEZ9f1JHzgiXXTtyyVst")
TARGETS_FILE = os.getenv("TARGETS_FILE", "targets.json")
TIKTOK_UNIQUE_ID = os.getenv("TIKTOK_UNIQUE_ID")
CONTROL_HOST = os.getenv("RECORDER_CONTROL_HOST", "127.0.0.1")
CONTROL_PORT = int(os.getenv("RECORDER_CONTROL_PORT", "8765"))
LIVE_STATUS_CACHE_SECONDS = int(os.getenv("LIVE_STATUS_CACHE_SECONDS", "60"))
LIVE_STATUS_ONLINE_CACHE_SECONDS = int(os.getenv("LIVE_STATUS_ONLINE_CACHE_SECONDS", "30"))
LIVE_STATUS_UNKNOWN_CACHE_SECONDS = int(os.getenv("LIVE_STATUS_UNKNOWN_CACHE_SECONDS", "45"))
LIVE_STATUS_ERROR_GRACE_SECONDS = int(os.getenv("LIVE_STATUS_ERROR_GRACE_SECONDS", "180"))

LOGS_DIR = Path("logs")
LEADS_DIR = Path("leads")
LOGS_DIR.mkdir(exist_ok=True)
LEADS_DIR.mkdir(exist_ok=True)


def resolve_bridge_output_path() -> Path:
    override = os.getenv("EMBER_BRIDGE_OUTPUT", "").strip()
    if override:
        return Path(override).expanduser()

    candidates = [
        Path(__file__).resolve().parents[1] / "public" / "current_messages.json",
        Path.home() / "TikTokLive" / "Ember" / "public" / "current_messages.json",
    ]
    for candidate in candidates:
        if candidate.parent.exists():
            return candidate

    return candidates[0]


BRIDGE_OUTPUT_PATH = resolve_bridge_output_path()


def normalize_message_for_scoring(value: object) -> str:
    raw_text = str(value or "").strip().lower()
    if not raw_text:
        return ""
    return " ".join(raw_text.split())


class CurrentMessagesPublisher:
    def __init__(
        self,
        output_path: Path,
        max_messages: int = 200,
        event_bus: Optional[EventBus] = None,
    ):
        self.output_path = output_path
        self.max_messages = max_messages
        self.event_bus = event_bus
        self._lock = threading.Lock()
        self._messages_by_account: Dict[str, List[Dict[str, object]]] = {}
        self._leads_by_account: Dict[str, Dict[str, Dict[str, object]]] = {}
        self._accounts: Dict[str, Dict[str, object]] = {}
        self._viewer_sets: Dict[str, set[str]] = {}
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        self._load_existing()

    def _emit_event(self, event_type: str, **payload: Any) -> None:
        if self.event_bus is None:
            return
        self.event_bus.publish(build_event(event_type, **payload))

    def _load_existing(self) -> None:
        if not self.output_path.exists():
            return

        try:
            payload = json.loads(self.output_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return

        account_by_session_id: Dict[str, str] = {}
        for account in payload.get("accounts", []):
            unique_id = str(account.get("uniqueId", "")).strip()
            if not unique_id:
                continue
            session_id = str(account.get("sessionId", "")).strip()
            previous_session = account.get("previousSession")
            if not isinstance(previous_session, dict):
                previous_session = None
            self._accounts[unique_id] = {
                "uniqueId": unique_id,
                "sessionId": session_id,
                "status": str(account.get("status", "Ended")),
                "updatedAt": str(account.get("updatedAt", "")),
                "startTime": account.get("startTime"),
                "endTime": account.get("endTime"),
                "messagesCount": int(account.get("messagesCount", 0) or 0),
                "leadsDetected": int(account.get("leadsDetected", 0) or 0),
                "viewers": int(account.get("viewers", 0) or 0),
                "previousSession": previous_session,
            }
            self._messages_by_account.setdefault(unique_id, [])
            self._leads_by_account.setdefault(unique_id, {})
            self._viewer_sets.setdefault(unique_id, set())
            if session_id:
                account_by_session_id[session_id] = unique_id

        primary_account = payload.get("account") or {}
        primary_unique_id = str(primary_account.get("uniqueId", "")).strip()
        source_messages = payload.get("allMessages") or payload.get("messages", [])
        for message in source_messages:
            message_session_id = str(message.get("sessionId", "")).strip()
            account_key = account_by_session_id.get(message_session_id, primary_unique_id)
            if not account_key:
                continue
            self._messages_by_account.setdefault(account_key, []).append(message)
            username = str(message.get("username", "")).strip()
            if username:
                self._viewer_sets.setdefault(account_key, set()).add(username.lstrip("@"))

        # Keep per-account message buffers bounded and chronologically ordered.
        for account_key, messages in list(self._messages_by_account.items()):
            ordered = sorted(messages, key=lambda item: str(item.get("timestamp", "")))
            self._messages_by_account[account_key] = ordered[-self.max_messages :]

        source_leads = payload.get("allLeads") or payload.get("leads", [])
        for lead in source_leads:
            if not isinstance(lead, dict):
                continue
            normalized_lead = self._normalize_loaded_lead(lead)
            lead_messages = normalized_lead.get("messages") or []
            lead_account_key = ""
            for lead_message in lead_messages:
                lead_session_id = str(lead_message.get("sessionId", "")).strip()
                if lead_session_id and lead_session_id in account_by_session_id:
                    lead_account_key = account_by_session_id[lead_session_id]
                    break
            if not lead_account_key:
                lead_account_key = primary_unique_id
            if not lead_account_key:
                continue
            lead_key = f"{normalized_lead.get('username', '')}::{normalized_lead.get('nickname', '')}"
            self._leads_by_account.setdefault(lead_account_key, {})[lead_key] = normalized_lead
        self._mark_loaded_actives_as_ended()
        self._persist()

    @staticmethod
    def _safe_int(value: object) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _parse_datetime_epoch(value: object) -> Optional[float]:
        if not isinstance(value, str):
            return None

        raw_value = value.strip()
        if not raw_value:
            return None

        normalized = raw_value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized).timestamp()
        except ValueError:
            return None

    def _normalize_loaded_lead(self, lead: Dict[str, object]) -> Dict[str, object]:
        normalized_lead = dict(lead)
        messages = normalized_lead.get("messages")
        if not isinstance(messages, list):
            messages = []

        scored_message_keys: List[str] = []
        scored_message_lookup: set[str] = set()
        total_score = 0
        normalized_categories: List[str] = []

        for message in messages:
            if not isinstance(message, dict):
                continue

            normalized_message_key = normalize_message_for_scoring(message.get("message"))
            has_been_scored = bool(
                normalized_message_key
                and normalized_message_key in scored_message_lookup
            )
            if not has_been_scored:
                total_score += self._safe_int(message.get("score"))
                if normalized_message_key:
                    scored_message_lookup.add(normalized_message_key)
                    scored_message_keys.append(normalized_message_key)

            categories = message.get("categories")
            if not isinstance(categories, list):
                continue
            for category in categories:
                category_text = str(category).strip()
                if category_text and category_text not in normalized_categories:
                    normalized_categories.append(category_text)

        existing_categories = normalized_lead.get("categories")
        if isinstance(existing_categories, list):
            for category in existing_categories:
                category_text = str(category).strip()
                if category_text and category_text not in normalized_categories:
                    normalized_categories.append(category_text)

        normalized_lead["messages"] = [message for message in messages if isinstance(message, dict)][-10:]
        normalized_lead["totalScore"] = total_score
        normalized_lead["categories"] = normalized_categories
        normalized_lead["scoredMessageKeys"] = scored_message_keys[-500:]

        if normalized_lead["messages"]:
            latest_message = normalized_lead["messages"][-1]
            latest_text = str(latest_message.get("message", "")).strip()
            latest_timestamp = str(latest_message.get("timestamp", "")).strip()
            if latest_text:
                normalized_lead["lastMessage"] = latest_text
            if latest_timestamp:
                normalized_lead["lastActivity"] = latest_timestamp

        return normalized_lead

    def _mark_loaded_actives_as_ended(self) -> None:
        # A restored payload can contain stale "Active" sessions from previous runs.
        # Normalize them to Ended so the UI doesn't prioritize old accounts.
        for account in self._accounts.values():
            if str(account.get("status", "")).strip() != "Active":
                continue

            updated_at = str(account.get("updatedAt", "")).strip() or datetime.now().isoformat()
            account["status"] = "Ended"
            account["updatedAt"] = updated_at
            if not account.get("endTime"):
                account["endTime"] = updated_at

    def ensure_account(self, unique_id: str) -> None:
        account_key = f"@{unique_id.lstrip('@')}"
        account_snapshot: Optional[Dict[str, object]] = None
        with self._lock:
            if account_key in self._accounts:
                return
            self._accounts[account_key] = {
                "uniqueId": account_key,
                "sessionId": "",
                "status": "Ended",
                "updatedAt": "",
                "startTime": None,
                "endTime": None,
                "messagesCount": 0,
                "leadsDetected": 0,
                "viewers": 0,
                "previousSession": None,
            }
            self._messages_by_account.setdefault(account_key, [])
            self._leads_by_account.setdefault(account_key, {})
            self._viewer_sets.setdefault(account_key, set())
            account_snapshot = dict(self._accounts[account_key])
            self._persist()
        self._emit_event(
            "account.updated",
            uniqueId=account_key,
            account=account_snapshot,
        )

    def start_session(self, unique_id: str, session_id: str) -> None:
        account_key = f"@{unique_id.lstrip('@')}"
        account_snapshot: Dict[str, object]
        with self._lock:
            now = datetime.now().isoformat()
            previous_session = None
            existing_account = self._accounts.get(account_key)
            if isinstance(existing_account, dict):
                existing_previous = existing_account.get("previousSession")
                if isinstance(existing_previous, dict):
                    previous_session = {
                        "sessionId": str(existing_previous.get("sessionId", "")).strip(),
                        "startTime": existing_previous.get("startTime"),
                        "endTime": existing_previous.get("endTime"),
                    }

                existing_session_id = str(existing_account.get("sessionId", "")).strip()
                existing_start_time = existing_account.get("startTime")
                existing_end_time = existing_account.get("endTime")
                if existing_session_id and existing_start_time and existing_end_time:
                    previous_session = {
                        "sessionId": existing_session_id,
                        "startTime": existing_start_time,
                        "endTime": existing_end_time,
                    }
            self._messages_by_account[account_key] = []
            self._leads_by_account[account_key] = {}
            self._viewer_sets[account_key] = set()
            self._accounts[account_key] = {
                "uniqueId": account_key,
                "sessionId": session_id,
                "status": "Active",
                "updatedAt": now,
                "startTime": now,
                "endTime": None,
                "messagesCount": 0,
                "leadsDetected": 0,
                "viewers": 0,
                "previousSession": previous_session,
            }
            account_snapshot = dict(self._accounts[account_key])
            self._persist()
        self._emit_event(
            "session.started",
            uniqueId=account_key,
            sessionId=session_id,
            account=account_snapshot,
        )
        self._emit_event(
            "account.updated",
            uniqueId=account_key,
            account=account_snapshot,
        )

    def ingest(self, record: Dict[str, object]) -> None:
        account_key = f"@{str(record['streamer_unique_id']).lstrip('@')}"
        if account_key not in self._accounts or self._accounts[account_key].get("status") != "Active":
            self.start_session(str(record["streamer_unique_id"]), str(record["session_id"]))

        lead_snapshot: Optional[Dict[str, object]] = None
        with self._lock:
            message = {
                "id": f"{record['session_id']}-{len(self._messages_by_account[account_key])}",
                "timestamp": record["timestamp"],
                "username": f"@{record['author_unique_id']}",
                "nickname": record["author_nickname"],
                "message": record["comment_text"],
                "score": record["lead_score"],
                "categories": record["lead_categories"],
                "sessionId": record["session_id"],
            }
            self._messages_by_account[account_key].append(message)
            self._messages_by_account[account_key] = self._messages_by_account[account_key][-self.max_messages :]
            self._viewer_sets.setdefault(account_key, set()).add(str(record["author_unique_id"]))

            if int(record["lead_score"]) > 0:
                lead_key = f"{record['author_unique_id']}::{record['author_nickname']}"
                account_leads = self._leads_by_account.setdefault(account_key, {})
                lead = account_leads.get(lead_key)
                if lead is None:
                    lead = {
                        "id": lead_key.replace("::", "-").replace("@", ""),
                        "status": "New",
                        "username": f"@{record['author_unique_id']}",
                        "nickname": record["author_nickname"],
                        "totalScore": 0,
                        "categories": [],
                        "lastMessage": "",
                        "lastActivity": record["timestamp"],
                        "messages": [],
                        "scoredMessageKeys": [],
                    }
                    account_leads[lead_key] = lead

                scored_message_keys = lead.get("scoredMessageKeys")
                if not isinstance(scored_message_keys, list):
                    scored_message_keys = []
                normalized_message_key = normalize_message_for_scoring(record["comment_text"])
                has_been_scored = bool(
                    normalized_message_key
                    and normalized_message_key in scored_message_keys
                )
                if not has_been_scored:
                    lead["totalScore"] = int(lead["totalScore"]) + int(record["lead_score"])
                    if normalized_message_key:
                        scored_message_keys.append(normalized_message_key)
                        # Keep memory bounded in long sessions.
                        scored_message_keys[:] = scored_message_keys[-500:]
                lead["scoredMessageKeys"] = scored_message_keys
                lead["lastMessage"] = record["comment_text"]
                lead["lastActivity"] = record["timestamp"]
                lead["messages"].append(message)
                lead["messages"] = lead["messages"][-10:]

                for category in record["lead_categories"]:
                    if category not in lead["categories"]:
                        lead["categories"].append(category)
                lead_snapshot = dict(lead)

            account = self._accounts[account_key]
            account["updatedAt"] = datetime.now().isoformat()
            account["status"] = "Active"
            account["endTime"] = None
            account["messagesCount"] = len(self._messages_by_account[account_key])
            account["leadsDetected"] = len(self._leads_by_account.get(account_key, {}))
            account["viewers"] = len(self._viewer_sets.get(account_key, set()))
            account_snapshot = dict(account)
            message_snapshot = dict(message)
            self._persist()
        self._emit_event(
            "message.received",
            uniqueId=account_key,
            sessionId=str(record["session_id"]),
            message=message_snapshot,
        )
        if lead_snapshot is not None:
            self._emit_event(
                "lead.updated",
                uniqueId=account_key,
                sessionId=str(record["session_id"]),
                lead=lead_snapshot,
            )
        self._emit_event(
            "account.updated",
            uniqueId=account_key,
            account=account_snapshot,
        )

    def end_session(self, unique_id: str) -> None:
        account_key = f"@{unique_id.lstrip('@')}"
        account_snapshot: Optional[Dict[str, object]] = None
        session_id = ""
        with self._lock:
            account = self._accounts.get(account_key)
            if account is None:
                return
            account["status"] = "Ended"
            account["updatedAt"] = datetime.now().isoformat()
            account["endTime"] = account["updatedAt"]
            session_id = str(account.get("sessionId", "")).strip()
            account_snapshot = dict(account)
            self._persist()
        self._emit_event(
            "session.ended",
            uniqueId=account_key,
            sessionId=session_id or None,
            account=account_snapshot,
        )
        self._emit_event(
            "account.updated",
            uniqueId=account_key,
            account=account_snapshot,
        )

    def delete_ended_session(
        self,
        unique_id: str,
        session_id: Optional[str] = None,
        start_time: Optional[str] = None,
    ) -> Dict[str, object]:
        account_key = normalize_unique_id(unique_id)
        requested_session_id = str(session_id or "").strip()
        requested_start_epoch = self._parse_datetime_epoch(start_time)
        stored_session_id = ""

        with self._lock:
            account = self._accounts.get(account_key)
            if account is None:
                raise ValueError("No se encontró la sesión a eliminar.")

            if str(account.get("status", "Ended")).strip() != "Ended":
                raise ValueError("Solo se pueden borrar sesiones finalizadas.")

            stored_session_id = str(account.get("sessionId", "")).strip()
            if requested_session_id and stored_session_id and requested_session_id != stored_session_id:
                raise ValueError("La sesión cambió; actualiza la vista antes de borrar.")

            if requested_start_epoch is not None:
                stored_start_epoch = self._parse_datetime_epoch(account.get("startTime"))
                if (
                    stored_start_epoch is not None
                    and abs(stored_start_epoch - requested_start_epoch) > 1
                ):
                    raise ValueError("La sesión cambió; actualiza la vista antes de borrar.")

            self._accounts.pop(account_key, None)
            self._messages_by_account.pop(account_key, None)
            self._leads_by_account.pop(account_key, None)
            self._viewer_sets.pop(account_key, None)
            self._persist()

        self._emit_event(
            "session.deleted",
            uniqueId=account_key,
            sessionId=stored_session_id or None,
        )
        self._emit_event(
            "account.updated",
            uniqueId=account_key,
            deleted=True,
        )
        return {
            "ok": True,
            "deleted": True,
            "unique_id": account_key,
            "session_id": stored_session_id or None,
        }

    def _sorted_accounts(self) -> List[Dict[str, object]]:
        return sorted(
            self._accounts.values(),
            key=lambda item: str(item.get("updatedAt", "")),
            reverse=True,
        )

    def _select_primary_account(self) -> Optional[Dict[str, object]]:
        accounts = self._sorted_accounts()
        return accounts[0] if accounts else None

    def _build_payload(self) -> Dict[str, object]:
        primary_account = self._select_primary_account()
        if primary_account is None:
            return {
                "account": None,
                "messages": [],
                "leads": [],
                "allMessages": [],
                "allLeads": [],
                "accounts": [],
                "liveSessions": [],
            }

        account_key = str(primary_account["uniqueId"])
        primary_messages = self._messages_by_account.get(account_key, [])
        primary_leads = sorted(
            self._leads_by_account.get(account_key, {}).values(),
            key=lambda item: (int(item["totalScore"]), str(item["lastActivity"])),
            reverse=True,
        )
        all_messages = sorted(
            [message for messages in self._messages_by_account.values() for message in messages],
            key=lambda item: str(item.get("timestamp", "")),
            reverse=True,
        )
        all_leads = sorted(
            [
                lead
                for account_leads in self._leads_by_account.values()
                for lead in account_leads.values()
            ],
            key=lambda item: (int(item.get("totalScore", 0)), str(item.get("lastActivity", ""))),
            reverse=True,
        )
        accounts = self._sorted_accounts()
        payload = {
            "account": primary_account,
            "currentAccount": primary_account,
            "messages": primary_messages,
            "leads": primary_leads,
            "allMessages": all_messages,
            "allLeads": all_leads,
            "accounts": accounts,
            "liveSessions": accounts,
        }
        return payload

    def _persist(self) -> None:
        payload = self._build_payload()
        self.output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def get_payload(self) -> Dict[str, object]:
        with self._lock:
            payload = self._build_payload()
        return json.loads(json.dumps(payload, ensure_ascii=False))

    def get_accounts_summary(self) -> List[Dict[str, object]]:
        with self._lock:
            return [dict(account) for account in self._sorted_accounts()]


def upload_file_to_drive_safe(filepath: str, folder_id: str):
    try:
        from drive_uploader import upload_file_to_drive

        return upload_file_to_drive(filepath, folder_id)
    except Exception as exc:
        return {"ok": False, "error": str(exc), "file": filepath}


class StreamFileRotator:
    def __init__(self, streamer_unique_id: str):
        self.streamer_unique_id = streamer_unique_id
        self.lock = threading.Lock()
        self.current_paths = self._new_file_paths()

    def _new_file_paths(self) -> Dict[str, str]:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = f"{self.streamer_unique_id}_{ts}"
        return {"txt": str(LOGS_DIR / f"{base_name}.txt")}

    def get_current_paths(self) -> Dict[str, str]:
        with self.lock:
            return dict(self.current_paths)

    def rotate_and_upload(self) -> None:
        with self.lock:
            old_paths = dict(self.current_paths)
            self.current_paths = self._new_file_paths()

        self._upload_txt_path(old_paths["txt"])

    def upload_current(self) -> None:
        with self.lock:
            txt_path = self.current_paths["txt"]
        self._upload_txt_path(txt_path)

    @staticmethod
    def _upload_txt_path(txt_path: str) -> None:
        if os.path.exists(txt_path) and os.path.getsize(txt_path) > 0:
            result = upload_file_to_drive_safe(txt_path, DRIVE_FOLDER_ID)
            print(f"Subido a Drive: {result}")


class Display(Protocol):
    def enqueue(self, record: Dict[str, object]) -> None:
        ...

    def run(self) -> None:
        ...


class ChatDisplay:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("TikTok Live Chat")
        self.root.geometry("900x640")
        self.root.configure(bg="#111827")

        header = tk.Label(
            self.root,
            text="Stream de chat en vivo",
            font=("Helvetica", 18, "bold"),
            fg="#f9fafb",
            bg="#111827",
            pady=12,
        )
        header.pack(fill="x")

        self.status_var = tk.StringVar(value="Esperando comentarios...")
        status = tk.Label(
            self.root,
            textvariable=self.status_var,
            font=("Helvetica", 11),
            fg="#d1d5db",
            bg="#111827",
            pady=4,
        )
        status.pack(fill="x")

        self.chat_box = scrolledtext.ScrolledText(
            self.root,
            wrap=tk.WORD,
            font=("Menlo", 12),
            bg="#030712",
            fg="#e5e7eb",
            insertbackground="#e5e7eb",
            padx=12,
            pady=12,
        )
        self.chat_box.pack(fill="both", expand=True, padx=12, pady=(4, 12))
        self.chat_box.configure(state="disabled")

        self.message_queue: "queue.Queue[Dict[str, object]]" = queue.Queue()
        self.root.after(200, self._poll_queue)

    def enqueue(self, record: Dict[str, object]) -> None:
        self.message_queue.put(record)

    def _poll_queue(self) -> None:
        while True:
            try:
                record = self.message_queue.get_nowait()
            except queue.Empty:
                break
            self._append_record(record)
        self.root.after(200, self._poll_queue)

    def _append_record(self, record: Dict[str, object]) -> None:
        block = "\n".join(
            [
                f"Nombre de usuario: {record['author_nickname']}",
                f"Alias de TikTok: @{record['author_unique_id']}",
                f"Timestamp: {record['timestamp']}",
                f"Mensaje: {record['comment_text']}",
                "=" * 60,
                "",
            ]
        )
        self.chat_box.configure(state="normal")
        self.chat_box.insert(tk.END, block)
        self.chat_box.see(tk.END)
        self.chat_box.configure(state="disabled")
        self.status_var.set(
            f"Ultimo mensaje de @{record['author_unique_id']} a las {record['timestamp']}"
        )

    def run(self) -> None:
        self.root.mainloop()


class ConsoleChatDisplay:
    def enqueue(self, record: Dict[str, object]) -> None:
        print()
        print("CHAT EN VIVO")
        print(f"Nombre de usuario: {record['author_nickname']}")
        print(f"Alias de TikTok: @{record['author_unique_id']}")
        print(f"Timestamp: {record['timestamp']}")
        print(f"Mensaje: {record['comment_text']}")
        print("=" * 60)

    def run(self) -> None:
        print("Mostrando chat en la terminal porque tkinter no está disponible en este Python.")
        while True:
            time.sleep(1)

def read_targets() -> List[Dict[str, object]]:
    if Path(TARGETS_FILE).exists():
        try:
            data = json.loads(Path(TARGETS_FILE).read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"El archivo {TARGETS_FILE} no tiene JSON válido: "
                f"línea {exc.lineno}, columna {exc.colno}."
            ) from exc

        if not isinstance(data, list):
            raise ValueError(f"El archivo {TARGETS_FILE} debe contener una lista de targets.")

        return [item for item in data if isinstance(item, dict)]

    return []


def load_targets() -> List[Dict[str, object]]:
    targets = [item for item in read_targets() if item.get("active", True)]
    if targets:
        return targets

    if TIKTOK_UNIQUE_ID:
        return [{"unique_id": TIKTOK_UNIQUE_ID, "active": True}]

    raise ValueError(
        "No hay cuentas configuradas. Define TARGETS_FILE con targets activos o TIKTOK_UNIQUE_ID."
    )


def normalize_unique_id(value: str) -> str:
    raw_value = value.strip()
    if not raw_value:
        raise ValueError("Debes enviar unique_id.")

    candidate = raw_value
    if "tiktok.com" in raw_value.lower():
        parsed_value = raw_value if "://" in raw_value else f"https://{raw_value}"
        path_parts = [part for part in urlparse(parsed_value).path.split("/") if part]
        profile_part = next((part for part in path_parts if part.startswith("@")), "")
        if profile_part:
            candidate = profile_part

    unique_id = candidate.strip().rstrip("/").lstrip("@").split("/")[0].strip()
    if not unique_id:
        raise ValueError("Debes enviar un usuario de TikTok valido.")

    return f"@{unique_id}"


class LiveStatusChecker:
    def __init__(
        self,
        ttl_seconds: int,
        online_ttl_seconds: Optional[int] = None,
        unknown_ttl_seconds: Optional[int] = None,
        error_grace_seconds: int = 180,
    ):
        self.ttl_seconds = ttl_seconds
        self.online_ttl_seconds = online_ttl_seconds or ttl_seconds
        self.unknown_ttl_seconds = unknown_ttl_seconds or ttl_seconds
        self.error_grace_seconds = error_grace_seconds
        self._lock = threading.Lock()
        self._cache: Dict[str, Dict[str, object]] = {}

    def check(self, unique_ids: List[str]) -> List[Dict[str, object]]:
        normalized_ids = sorted(
            {
                normalize_unique_id(str(unique_id))
                for unique_id in unique_ids
                if str(unique_id).strip()
            }
        )
        now = time.time()
        stale_ids: List[str] = []

        with self._lock:
            for unique_id in normalized_ids:
                cached = self._cache.get(unique_id)
                if not cached:
                    stale_ids.append(unique_id)
                    continue

                cached_status = str(cached.get("status", "unknown")).strip().lower()
                if cached_status == "online":
                    ttl_seconds = self.online_ttl_seconds
                elif cached_status == "unknown":
                    ttl_seconds = self.unknown_ttl_seconds
                else:
                    ttl_seconds = self.ttl_seconds

                if now - float(cached.get("_checkedAtEpoch", 0)) >= ttl_seconds:
                    stale_ids.append(unique_id)

        if stale_ids:
            checked = asyncio.run(self._check_many(stale_ids))
            with self._lock:
                for item in checked:
                    unique_id = str(item["uniqueId"])
                    cached = self._cache.get(unique_id)
                    item_status = str(item.get("status", "unknown")).strip().lower()
                    cached_status = str(cached.get("status", "unknown")).strip().lower() if cached else "unknown"
                    cached_checked_epoch = float(cached.get("_checkedAtEpoch", 0)) if cached else 0

                    should_keep_cached_status = (
                        item_status == "unknown"
                        and cached is not None
                        and cached_status in ("online", "offline")
                        and now - cached_checked_epoch <= self.error_grace_seconds
                    )
                    if should_keep_cached_status:
                        merged = dict(cached)
                        merged["checkedAt"] = item.get("checkedAt", cached.get("checkedAt"))
                        merged["error"] = item.get("error")
                        merged["_checkedAtEpoch"] = time.time()
                        self._cache[unique_id] = merged
                        continue

                    self._cache[unique_id] = item

        with self._lock:
            return [
                {
                    key: value
                    for key, value in self._cache[unique_id].items()
                    if not key.startswith("_")
                }
                for unique_id in normalized_ids
                if unique_id in self._cache
            ]

    def snapshot(self, unique_ids: List[str]) -> List[Dict[str, object]]:
        normalized_ids = sorted(
            {
                normalize_unique_id(str(unique_id))
                for unique_id in unique_ids
                if str(unique_id).strip()
            }
        )
        checked_at = datetime.now().isoformat()
        with self._lock:
            results: List[Dict[str, object]] = []
            for unique_id in normalized_ids:
                cached = self._cache.get(unique_id)
                if cached:
                    results.append(
                        {
                            key: value
                            for key, value in cached.items()
                            if not key.startswith("_")
                        }
                    )
                    continue
                results.append(
                    {
                        "uniqueId": unique_id,
                        "isLive": False,
                        "status": "unknown",
                        "checkedAt": checked_at,
                        "playbackUrl": None,
                        "error": None,
                    }
                )
            return results

    async def _check_many(self, unique_ids: List[str]) -> List[Dict[str, object]]:
        return await asyncio.gather(*(self._check_one(unique_id) for unique_id in unique_ids))

    @staticmethod
    def _coerce_http_url(value: object) -> Optional[str]:
        if not isinstance(value, str):
            return None

        candidate = value.strip()
        if not candidate:
            return None

        if candidate.startswith("http://") or candidate.startswith("https://"):
            return candidate

        return None

    @classmethod
    def _extract_url_from_map(
        cls,
        value: object,
        preferred_keys: List[str],
    ) -> Optional[str]:
        if isinstance(value, dict):
            for key in preferred_keys:
                candidate = cls._coerce_http_url(value.get(key))
                if candidate:
                    return candidate

            for mapped in value.values():
                candidate = cls._coerce_http_url(mapped)
                if candidate:
                    return candidate

        if isinstance(value, list):
            for item in value:
                candidate = cls._extract_url_from_map(item, preferred_keys)
                if candidate:
                    return candidate

        return None

    @classmethod
    def _extract_url_from_stream_data(
        cls,
        stream_url: Dict[str, object],
        format_key: str,
    ) -> Optional[str]:
        live_core_sdk_data = stream_url.get("live_core_sdk_data")
        if not isinstance(live_core_sdk_data, dict):
            return None

        pull_data = live_core_sdk_data.get("pull_data")
        if not isinstance(pull_data, dict):
            return None

        raw_stream_data = pull_data.get("stream_data")
        if not isinstance(raw_stream_data, str) or not raw_stream_data.strip():
            return None

        try:
            stream_data = json.loads(raw_stream_data)
        except json.JSONDecodeError:
            return None

        if not isinstance(stream_data, dict):
            return None

        data_by_quality = stream_data.get("data")
        if not isinstance(data_by_quality, dict):
            return None

        quality_order = ["origin", "uhd", "hd", "sd", "ld"]
        for quality in quality_order:
            quality_entry = data_by_quality.get(quality)
            if not isinstance(quality_entry, dict):
                continue

            main_entry = quality_entry.get("main")
            if not isinstance(main_entry, dict):
                continue

            candidate = cls._coerce_http_url(main_entry.get(format_key))
            if candidate:
                return candidate

        for quality_entry in data_by_quality.values():
            if not isinstance(quality_entry, dict):
                continue
            main_entry = quality_entry.get("main")
            if not isinstance(main_entry, dict):
                continue
            candidate = cls._coerce_http_url(main_entry.get(format_key))
            if candidate:
                return candidate

        return None

    @staticmethod
    def _extract_live_started_at(room_info: object) -> Optional[str]:
        if not isinstance(room_info, dict):
            return None

        for key in ("create_time", "start_time", "createTime", "startTime"):
            raw_value = room_info.get(key)
            try:
                timestamp = int(raw_value)
            except (TypeError, ValueError):
                continue
            if timestamp <= 0:
                continue
            return datetime.fromtimestamp(timestamp).isoformat()

        return None

    @classmethod
    def _extract_playback_url(cls, room_info: object) -> Optional[str]:
        if not isinstance(room_info, dict):
            return None

        stream_url = room_info.get("stream_url") or room_info.get("streamUrl")
        if not isinstance(stream_url, dict):
            return None

        direct_hls_url = cls._coerce_http_url(stream_url.get("hls_pull_url"))
        if direct_hls_url:
            return direct_hls_url

        map_hls_url = cls._extract_url_from_map(
            stream_url.get("hls_pull_url_map"),
            preferred_keys=["ORIGION", "FULL_HD1", "HD1", "SD2", "SD1", "origin", "uhd", "hd", "sd", "ld"],
        )
        if map_hls_url:
            return map_hls_url

        stream_data_hls_url = cls._extract_url_from_stream_data(stream_url, "hls")
        if stream_data_hls_url:
            return stream_data_hls_url

        return None

    async def _check_one(self, unique_id: str) -> Dict[str, object]:
        checked_at = datetime.now().isoformat()
        live_started_at = None
        playback_url = None
        try:
            client = build_tiktok_client(unique_id=unique_id.lstrip("@"))
            is_live = await client.is_live()
            status = "online" if is_live else "offline"
            error = None
            if is_live:
                try:
                    room_info = await client.web.fetch_room_info(unique_id=unique_id.lstrip("@"))
                    live_started_at = self._extract_live_started_at(room_info)
                    playback_url = self._extract_playback_url(room_info)
                except Exception:
                    live_started_at = None
                    playback_url = None
        except Exception as exc:
            message = str(exc)
            offline_markers = (
                "UserOfflineError",
                "user_not_found",
                "not capable of going LIVE",
                "never gone live",
                "does not exist",
            )
            is_live = False
            status = "offline" if any(marker in message for marker in offline_markers) else "unknown"
            error = message

        return {
            "uniqueId": unique_id,
            "isLive": is_live,
            "status": status,
            "checkedAt": checked_at,
            "liveStartedAt": live_started_at,
            "playbackUrl": playback_url,
            "error": error,
            "_checkedAtEpoch": time.time(),
        }


def save_targets(targets: List[Dict[str, object]]) -> None:
    Path(TARGETS_FILE).write_text(
        json.dumps(targets, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def run_target(
    target: Dict[str, object],
    publisher: CurrentMessagesPublisher,
    display: Optional[Display] = None,
    recorder_callback: Optional[Callable[[str, TikTokCommentRecorder], None]] = None,
    connection_success_callback: Optional[Callable[[str], None]] = None,
    connection_error_callback: Optional[Callable[[str, Exception], None]] = None,
) -> None:
    unique_id = str(target["unique_id"]).lstrip("@")
    rotator = StreamFileRotator(unique_id)
    atexit.register(rotator.upload_current)

    recorder = TikTokCommentRecorder(
        unique_id=unique_id,
        output_paths_getter=rotator.get_current_paths,
        message_callback=None,
        session_start_callback=None,
        session_end_callback=None,
    )
    if recorder_callback is not None:
        recorder_callback(normalize_unique_id(unique_id), recorder)
    has_connected = False

    def handle_record(record: Dict[str, object]) -> None:
        nonlocal has_connected
        if not has_connected and connection_success_callback is not None:
            connection_success_callback(normalize_unique_id(unique_id))
            has_connected = True
        if display is not None:
            display.enqueue(record)
        publisher.ingest(record)

    def handle_session_end() -> None:
        rotator.upload_current()
        publisher.end_session(unique_id)

    recorder.message_callback = handle_record
    recorder.session_start_callback = lambda session_id: publisher.start_session(unique_id, session_id)
    recorder.session_end_callback = handle_session_end
    try:
        recorder.run()
    except Exception as exc:
        if connection_error_callback is not None:
            connection_error_callback(normalize_unique_id(unique_id), exc)
        print(f"No se pudo conectar a @{unique_id}: {type(exc).__name__}: {exc!r}")
        publisher.end_session(unique_id)


class RecorderCoordinator:
    def __init__(
        self,
        publisher: CurrentMessagesPublisher,
        display: Display,
        live_status_checker: LiveStatusChecker,
        event_bus: Optional[EventBus] = None,
    ):
        self.publisher = publisher
        self.display = display
        self.live_status_checker = live_status_checker
        self.event_bus = event_bus
        self._lock = threading.Lock()
        self._threads: Dict[str, threading.Thread] = {}
        self._recorders: Dict[str, TikTokCommentRecorder] = {}
        self._stopping_targets: set[str] = set()
        self._connection_errors: Dict[str, str] = {}
        self._monitoring_started_at: Dict[str, str] = {}

    def _emit_event(self, event_type: str, **payload: Any) -> None:
        if self.event_bus is None:
            return
        self.event_bus.publish(build_event(event_type, **payload))

    def _set_target_active(self, unique_id: str, active: bool) -> None:
        normalized = normalize_unique_id(unique_id)
        targets = read_targets()
        found = False
        for item in targets:
            item_unique_id = str(item.get("unique_id", "")).strip()
            if item_unique_id and normalize_unique_id(item_unique_id) == normalized:
                item["unique_id"] = normalized
                item["active"] = active
                found = True

        if not found:
            targets.append({"unique_id": normalized, "active": active})

        save_targets(targets)

    def _register_recorder(self, unique_id: str, recorder: TikTokCommentRecorder) -> None:
        normalized = normalize_unique_id(unique_id)
        with self._lock:
            self._recorders[normalized] = recorder

    def _register_connection_success(self, unique_id: str) -> None:
        normalized = normalize_unique_id(unique_id)
        with self._lock:
            self._connection_errors.pop(normalized, None)

    def _register_connection_error(self, unique_id: str, exc: Exception) -> None:
        normalized = normalize_unique_id(unique_id)
        error_message = f"{type(exc).__name__}: {exc!r}"
        with self._lock:
            self._connection_errors[normalized] = error_message

    def _is_target_active(self, unique_id: str) -> bool:
        normalized = normalize_unique_id(unique_id)
        try:
            targets = read_targets()
        except Exception:
            return False

        for item in targets:
            item_unique_id = str(item.get("unique_id", "")).strip()
            if not item_unique_id:
                continue
            if normalize_unique_id(item_unique_id) == normalized:
                return bool(item.get("active", True))
        return False

    def start_target(self, unique_id: str) -> Dict[str, object]:
        normalized = normalize_unique_id(unique_id)
        self._set_target_active(normalized, True)

        with self._lock:
            self._connection_errors.pop(normalized, None)
            self._stopping_targets.discard(normalized)
            existing = self._threads.get(normalized)
            if existing is not None and existing.is_alive():
                result = {"ok": True, "started": False, "unique_id": normalized}
                self._emit_event("target.started", uniqueId=normalized, started=False)
                return result

            self.publisher.ensure_account(normalized)
            self._monitoring_started_at[normalized] = datetime.now().isoformat()
            target = {"unique_id": normalized, "active": True}
            thread = threading.Thread(
                target=self._run_target_wrapper,
                args=(target,),
                daemon=True,
            )
            self._threads[normalized] = thread
            thread.start()

        result = {"ok": True, "started": True, "unique_id": normalized}
        self._emit_event("target.started", uniqueId=normalized, started=True)
        return result

    def _run_target_wrapper(self, target: Dict[str, object]) -> None:
        normalized = normalize_unique_id(str(target["unique_id"]))
        try:
            while True:
                run_target(
                    target,
                    self.publisher,
                    self.display,
                    self._register_recorder,
                    self._register_connection_success,
                    self._register_connection_error,
                )
                with self._lock:
                    is_stopping = normalized in self._stopping_targets
                if is_stopping or not self._is_target_active(normalized):
                    break
                time.sleep(15)
        finally:
            with self._lock:
                existing = self._threads.get(normalized)
                if existing is threading.current_thread():
                    del self._threads[normalized]
                    self._recorders.pop(normalized, None)
                    self._stopping_targets.discard(normalized)
                    self._monitoring_started_at.pop(normalized, None)

    def add_target(self, unique_id: str) -> Dict[str, object]:
        normalized = normalize_unique_id(unique_id)
        return self.start_target(normalized)

    def stop_target(self, unique_id: str) -> Dict[str, object]:
        normalized = normalize_unique_id(unique_id)
        self._set_target_active(normalized, False)
        self.publisher.end_session(normalized)

        with self._lock:
            self._stopping_targets.add(normalized)
            recorder = self._recorders.get(normalized)
            thread = self._threads.get(normalized)

        if recorder is None or thread is None or not thread.is_alive():
            result = {
                "ok": True,
                "stopped": False,
                "unique_id": normalized,
                "running": False,
            }
            self._emit_event("target.stopped", uniqueId=normalized, running=False)
            return result

        recorder.stop(timeout=3)
        thread.join(timeout=1)
        result = {
            "ok": True,
            "stopped": True,
            "unique_id": normalized,
            "running": thread.is_alive(),
        }
        self._emit_event("target.stopped", uniqueId=normalized, running=thread.is_alive())
        return result

    def delete_ended_session(
        self,
        unique_id: str,
        session_id: Optional[str] = None,
        start_time: Optional[str] = None,
    ) -> Dict[str, object]:
        normalized = normalize_unique_id(unique_id)

        with self._lock:
            running_thread = self._threads.get(normalized)
            is_running = bool(
                running_thread is not None
                and running_thread.is_alive()
                and normalized not in self._stopping_targets
            )
            if is_running:
                raise ValueError("No puedes borrar una sesión con monitoreo activo.")
            self._connection_errors.pop(normalized, None)
            self._monitoring_started_at.pop(normalized, None)

        return self.publisher.delete_ended_session(
            normalized,
            session_id=session_id,
            start_time=start_time,
        )

    def _configured_targets(self) -> List[str]:
        return [
            normalize_unique_id(str(item["unique_id"]))
            for item in load_targets()
            if item.get("active", True)
        ]

    def get_live_status(self, unique_ids: Optional[List[str]] = None) -> List[Dict[str, object]]:
        accounts = self.publisher.get_accounts_summary()
        targets = unique_ids or [
            *self._configured_targets(),
            *[str(account.get("uniqueId", "")) for account in accounts],
        ]
        return self.live_status_checker.check(targets)

    def get_status(self) -> Dict[str, object]:
        with self._lock:
            running = sorted(
                unique_id
                for unique_id, thread in self._threads.items()
                if thread.is_alive() and unique_id not in self._stopping_targets
            )
            connection_errors = dict(self._connection_errors)
            monitoring_since = {
                unique_id: started_at
                for unique_id, started_at in self._monitoring_started_at.items()
                if unique_id in running
            }

        configured = self._configured_targets()
        accounts = self.publisher.get_accounts_summary()
        status_accounts = [
            *configured,
            *[str(account.get("uniqueId", "")) for account in accounts],
        ]
        live_status = self.live_status_checker.check(status_accounts)
        return {
            "configuredTargets": configured,
            "runningTargets": running,
            "accounts": accounts,
            "connectionErrors": connection_errors,
            "monitoringSince": monitoring_since,
            "liveStatus": live_status,
        }


def build_control_handler(coordinator: RecorderCoordinator):
    class RecorderControlHandler(BaseHTTPRequestHandler):
        def _set_headers(self, status: int = HTTPStatus.OK) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def _read_json_body(self) -> Dict[str, object]:
            raw_length = self.headers.get("Content-Length", "0")
            length = int(raw_length)
            if length <= 0:
                return {}

            body = self.rfile.read(length).decode("utf-8")
            return json.loads(body) if body.strip() else {}

        def do_OPTIONS(self):
            self._set_headers(HTTPStatus.NO_CONTENT)

        def do_GET(self):
            parsed_path = urlparse(self.path)
            if parsed_path.path == "/status":
                self._set_headers()
                self.wfile.write(json.dumps(coordinator.get_status(), ensure_ascii=False).encode("utf-8"))
                return

            if parsed_path.path == "/live-status":
                query = parse_qs(parsed_path.query)
                requested_accounts: List[str] = []
                for value in query.get("accounts", []):
                    requested_accounts.extend(
                        account.strip()
                        for account in value.split(",")
                        if account.strip()
                    )

                self._set_headers()
                self.wfile.write(
                    json.dumps(
                        {
                            "ok": True,
                            "statuses": coordinator.get_live_status(requested_accounts or None),
                        },
                        ensure_ascii=False,
                    ).encode("utf-8")
                )
                return

            else:
                self._set_headers(HTTPStatus.NOT_FOUND)
                self.wfile.write(json.dumps({"ok": False, "error": "Ruta no encontrada"}).encode("utf-8"))
                return

        def do_POST(self):
            parsed_path = urlparse(self.path)
            if parsed_path.path != "/targets":
                self._set_headers(HTTPStatus.NOT_FOUND)
                self.wfile.write(json.dumps({"ok": False, "error": "Ruta no encontrada"}).encode("utf-8"))
                return

            try:
                payload = self._read_json_body()
                unique_id = str(payload.get("unique_id", "")).strip()
                if not unique_id:
                    raise ValueError("Debes enviar unique_id.")
                result = coordinator.add_target(unique_id)
                self._set_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
            except Exception as exc:
                self._set_headers(HTTPStatus.BAD_REQUEST)
                self.wfile.write(
                    json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False).encode("utf-8")
                )

        def do_DELETE(self):
            parsed_path = urlparse(self.path)
            if parsed_path.path not in ("/targets", "/sessions"):
                self._set_headers(HTTPStatus.NOT_FOUND)
                self.wfile.write(json.dumps({"ok": False, "error": "Ruta no encontrada"}).encode("utf-8"))
                return

            try:
                query = parse_qs(parsed_path.query)
                payload = self._read_json_body()
                unique_id = str(payload.get("unique_id") or query.get("unique_id", [""])[0]).strip()
                if not unique_id:
                    raise ValueError("Debes enviar unique_id.")

                if parsed_path.path == "/targets":
                    result = coordinator.stop_target(unique_id)
                else:
                    session_id = str(payload.get("session_id") or query.get("session_id", [""])[0]).strip()
                    start_time = str(payload.get("start_time") or query.get("start_time", [""])[0]).strip()
                    result = coordinator.delete_ended_session(
                        unique_id,
                        session_id=session_id or None,
                        start_time=start_time or None,
                    )
                self._set_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
            except Exception as exc:
                self._set_headers(HTTPStatus.BAD_REQUEST)
                self.wfile.write(
                    json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False).encode("utf-8")
                )

        def log_message(self, format: str, *args):
            return

    return RecorderControlHandler


def start_legacy_control_server(coordinator: RecorderCoordinator) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(
        (CONTROL_HOST, CONTROL_PORT),
        build_control_handler(coordinator),
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"API de control legado disponible en http://{CONTROL_HOST}:{CONTROL_PORT}")
    return server


def start_control_server(
    coordinator: RecorderCoordinator,
    publisher: CurrentMessagesPublisher,
    event_bus: EventBus,
) -> object:
    try:
        from api_server import start_api_server
    except ModuleNotFoundError:
        print(
            "FastAPI/uvicorn no disponibles. "
            "Se mantiene control server legado + JSON bridge."
        )
        return start_legacy_control_server(coordinator)
    except Exception as exc:
        print(
            f"No se pudo cargar api_server ({type(exc).__name__}: {exc}). "
            "Se mantiene control server legado + JSON bridge."
        )
        return start_legacy_control_server(coordinator)

    try:
        server = start_api_server(
            coordinator=coordinator,
            publisher=publisher,
            event_bus=event_bus,
            host=CONTROL_HOST,
            port=CONTROL_PORT,
        )
        print(f"FastAPI + WebSocket disponible en http://{CONTROL_HOST}:{CONTROL_PORT}")
        return server
    except Exception as exc:
        print(
            f"No se pudo iniciar FastAPI ({type(exc).__name__}: {exc}). "
            "Se mantiene control server legado + JSON bridge."
        )
        return start_legacy_control_server(coordinator)


def main():
    targets = load_targets()
    print(f"Escuchando {len(targets)} cuenta(s): {', '.join(t['unique_id'] for t in targets)}")
    event_bus = EventBus()
    publisher = CurrentMessagesPublisher(BRIDGE_OUTPUT_PATH, event_bus=event_bus)
    for target in targets:
        publisher.ensure_account(str(target["unique_id"]))

    display = None
    if tk is not None:
        try:
            display = ChatDisplay()
        except tk.TclError as exc:
            print(f"No se pudo abrir la ventana de chat: {exc}")
    if display is None:
        display = ConsoleChatDisplay()

    live_status_checker = LiveStatusChecker(
        LIVE_STATUS_CACHE_SECONDS,
        online_ttl_seconds=LIVE_STATUS_ONLINE_CACHE_SECONDS,
        unknown_ttl_seconds=LIVE_STATUS_UNKNOWN_CACHE_SECONDS,
        error_grace_seconds=LIVE_STATUS_ERROR_GRACE_SECONDS,
    )
    coordinator = RecorderCoordinator(
        publisher,
        display,
        live_status_checker,
        event_bus=event_bus,
    )
    control_server = start_control_server(coordinator, publisher, event_bus)
    atexit.register(control_server.shutdown)
    for target in targets:
        coordinator.start_target(str(target["unique_id"]))

    display.run()


if __name__ == "__main__":
    main()
