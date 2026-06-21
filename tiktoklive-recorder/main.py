# main.py
import atexit
import asyncio
import concurrent.futures
import json
import os
import queue
import secrets
import threading
import time
from datetime import date
from datetime import datetime
from decimal import Decimal
from datetime import timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable, Dict, List, Optional, Protocol, Tuple
from urllib.parse import parse_qs, urlparse
from uuid import UUID

from TikTokLive import TikTokLiveClient
from tiktok_listener import TikTokCommentRecorder

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

try:
    import psycopg
    from psycopg.rows import dict_row
except ModuleNotFoundError:
    psycopg = None
    dict_row = None


load_dotenv()

DRIVE_FOLDER_ID = os.getenv("DRIVE_FOLDER_ID", "1lGNGn3QABqcsjEZ9f1JHzgiXXTtyyVst")
TARGETS_FILE = os.getenv("TARGETS_FILE", "targets.json")
TIKTOK_UNIQUE_ID = os.getenv("TIKTOK_UNIQUE_ID")
CONTROL_HOST = os.getenv("RECORDER_CONTROL_HOST", "127.0.0.1")
CONTROL_PORT = int(os.getenv("RECORDER_CONTROL_PORT", "8765"))
LIVE_STATUS_CACHE_TTL_SECONDS = int(os.getenv("LIVE_STATUS_CACHE_TTL_SECONDS", "45"))
LIVE_STATUS_TIMEOUT_SECONDS = int(os.getenv("LIVE_STATUS_TIMEOUT_SECONDS", "20"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ember:ember@127.0.0.1:5432/ember")
AUTH_SESSION_TTL_DAYS = int(os.getenv("AUTH_SESSION_TTL_DAYS", "30"))

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


def to_json_safe(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, tuple):
        return [to_json_safe(item) for item in value]
    if isinstance(value, list):
        return [to_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: to_json_safe(item) for key, item in value.items()}
    return value


def db_connection():
    if psycopg is None or dict_row is None:
        raise RuntimeError(
            "Falta la dependencia psycopg. Ejecuta `pip install -r requirements.txt`."
        )
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def normalize_db_unique_id(value: str) -> str:
    raw_value = str(value or "").strip().lower()
    if not raw_value:
        return ""
    return raw_value if raw_value.startswith("@") else f"@{raw_value}"


def normalize_db_client_key(value: str) -> str:
    raw_value = str(value or "").strip().upper()
    if raw_value in {"WOM", "CLARO"}:
        return raw_value
    if "WOM" in raw_value:
        return "WOM"
    if "CLARO" in raw_value:
        return "CLARO"
    return ""


def normalize_db_role(value: str) -> str:
    return str(value or "").strip().lower()


def coerce_db_bool(value: object, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    if isinstance(value, str):
        normalized_value = value.strip().lower()
        if normalized_value in {"true", "1", "yes", "y", "on"}:
            return True
        if normalized_value in {"false", "0", "no", "n", "off"}:
            return False
    return default


def get_bearer_token(headers) -> str:
    raw_authorization = str(headers.get("Authorization", "") or "").strip()
    if not raw_authorization:
        return ""
    if raw_authorization.lower().startswith("bearer "):
        return raw_authorization[7:].strip()
    return ""


def build_auth_user_payload(user: Dict[str, object]) -> Dict[str, object]:
    role = normalize_db_role(user.get("role", ""))
    client_code = normalize_db_client_key(user.get("client_code", ""))
    return {
        "id": str(user.get("id", "")),
        "login": str(user.get("login", "")).strip(),
        "displayName": str(user.get("display_name", "")).strip(),
        "role": role,
        "clientCode": client_code or None,
        "canAccessAllClients": role == "administrator",
    }


def build_app_user_payload(user: Dict[str, object]) -> Dict[str, object]:
    return {
        "id": str(user.get("id", "")),
        "login": str(user.get("login", "")).strip(),
        "displayName": str(user.get("display_name", "")).strip(),
        "role": normalize_db_role(user.get("role", "")),
        "clientCode": normalize_db_client_key(user.get("client_code", "")) or None,
        "isActive": bool(user.get("is_active", False)),
        "lastLoginAt": user.get("last_login_at"),
        "createdAt": user.get("created_at"),
        "updatedAt": user.get("updated_at"),
    }


def normalize_app_user_payload(
    payload: Dict[str, object],
    *,
    require_password: bool,
) -> Dict[str, object]:
    login = str(payload.get("login", "")).strip()
    display_name = str(payload.get("displayName", payload.get("display_name", ""))).strip()
    role = normalize_db_role(payload.get("role", ""))
    client_code = normalize_db_client_key(payload.get("clientCode", payload.get("client_code", "")))
    password = str(payload.get("password", "")).strip()
    is_active = coerce_db_bool(payload.get("isActive", payload.get("is_active", True)), True)

    if not login:
        raise ValueError("Debes enviar login.")
    if not display_name:
        raise ValueError("Debes enviar displayName.")
    if role not in {"administrator", "client", "executive", "supervisor"}:
        raise ValueError("Debes enviar un role válido.")
    if role == "administrator":
        client_code = None
    elif not client_code:
        raise ValueError("Los roles no administradores requieren un cliente válido.")
    if require_password and not password:
        raise ValueError("Debes enviar password.")

    return {
        "login": login,
        "display_name": display_name,
        "role": role,
        "client_code": client_code,
        "password": password or None,
        "is_active": is_active,
    }


def count_active_admin_users(connection, excluded_user_id: Optional[str] = None) -> int:
    with connection.cursor() as cursor:
        if excluded_user_id:
            cursor.execute(
                """
                SELECT count(*) AS total
                FROM ember.app_users
                WHERE is_active = true
                  AND role = 'administrator'
                  AND id <> %s
                """,
                (excluded_user_id,),
            )
        else:
            cursor.execute(
                """
                SELECT count(*) AS total
                FROM ember.app_users
                WHERE is_active = true
                  AND role = 'administrator'
                """
            )
        row = cursor.fetchone()
    return int(row["total"]) if row else 0


def is_unique_login_violation(exc: Exception) -> bool:
    message = str(exc).lower()
    return "ux_app_users_login_lower" in message or "duplicate key value violates unique constraint" in message


def create_auth_session(user: Dict[str, object]) -> Dict[str, object]:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now() + timedelta(days=AUTH_SESSION_TTL_DAYS)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO ember.auth_sessions (user_id, token, expires_at)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (user["id"], token, expires_at),
            )
            cursor.execute(
                """
                UPDATE ember.app_users
                SET last_login_at = now()
                WHERE id = %s
                """,
                (user["id"],),
            )
        connection.commit()

    return {
        "token": token,
        "expiresAt": expires_at,
    }


def fetch_authenticated_user(token: str) -> Optional[Dict[str, object]]:
    normalized_token = str(token or "").strip()
    if not normalized_token:
        return None

    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                  u.id,
                  u.login,
                  u.display_name,
                  u.role,
                  u.client_code,
                  u.is_active,
                  s.expires_at
                FROM ember.auth_sessions s
                JOIN ember.app_users u ON u.id = s.user_id
                WHERE s.token = %s
                  AND s.expires_at > now()
                  AND u.is_active = true
                LIMIT 1
                """,
                (normalized_token,),
            )
            user = cursor.fetchone()
            if not user:
                return None

            cursor.execute(
                """
                UPDATE ember.auth_sessions
                SET last_used_at = now()
                WHERE token = %s
                """,
                (normalized_token,),
            )
        connection.commit()

    return dict(user)


def delete_auth_session(token: str) -> None:
    normalized_token = str(token or "").strip()
    if not normalized_token:
        return

    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM ember.auth_sessions
                WHERE token = %s
                """,
                (normalized_token,),
            )
        connection.commit()


def is_admin_user(user: Dict[str, object]) -> bool:
    return normalize_db_role(user.get("role", "")) == "administrator"


def get_user_scope_client_code(user: Optional[Dict[str, object]]) -> Optional[str]:
    if not user:
        return None
    if is_admin_user(user):
        return None
    client_code = normalize_db_client_key(user.get("client_code", ""))
    return client_code or None


def parse_json_body(handler: BaseHTTPRequestHandler) -> Dict[str, object]:
    raw_length = handler.headers.get("Content-Length", "0")
    try:
        length = int(raw_length)
    except (TypeError, ValueError):
        length = 0
    if length <= 0:
        return {}

    raw_body = handler.rfile.read(length).decode("utf-8")
    if not raw_body.strip():
        return {}
    return json.loads(raw_body)


def parse_iso_datetime(value: object) -> Optional[datetime]:
    raw_value = str(value or "").strip()
    if not raw_value:
        return None
    normalized_value = raw_value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized_value)
    except ValueError:
        return None


def normalize_control_request_path(path: str) -> str:
    normalized_path = str(path or "").strip()
    if normalized_path.startswith("/recorder-api"):
        normalized_path = normalized_path[len("/recorder-api") :]
    if not normalized_path.startswith("/"):
        normalized_path = f"/{normalized_path}"
    return normalized_path or "/"


def build_empty_bridge_payload() -> Dict[str, object]:
    return {
        "currentAccount": None,
        "account": None,
        "messages": [],
        "allMessages": [],
        "leads": [],
        "allLeads": [],
        "accounts": [],
        "liveSessions": [],
    }


def build_empty_control_status() -> Dict[str, object]:
    return {
        "ok": True,
        "configuredTargets": [],
        "runningTargets": [],
        "statuses": [],
        "liveStatus": [],
        "accounts": [],
        "connectionErrors": {},
        "monitoringSince": {},
    }


def fetch_db_rows(client_code: Optional[str] = None) -> Dict[str, List[Dict[str, object]]]:
    account_filter_clause = "WHERE c.code = %s" if client_code else ""
    message_filter_clause = "AND c.code = %s" if client_code else ""
    lead_filter_clause = "AND c.code = %s" if client_code else ""

    query_accounts = """
        WITH latest_sessions AS (
          SELECT DISTINCT ON (s.account_id)
            s.account_id,
            s.id AS session_id,
            s.session_key,
            s.status AS session_status,
            s.started_at,
            s.ended_at,
            s.duration_seconds,
            s.messages_count,
            s.leads_detected,
            s.viewers,
            s.updated_at AS session_updated_at
          FROM ember.account_sessions s
          ORDER BY s.account_id, s.started_at DESC, s.updated_at DESC, s.id DESC
        )
        SELECT
          a.id AS account_id,
          a.username,
          a.display_name,
          a.status AS account_status,
          a.updated_at AS account_updated_at,
          c.code AS client_code,
          c.name AS client_name,
          ls.session_id,
          ls.session_key,
          ls.session_status,
          ls.started_at,
          ls.ended_at,
          ls.duration_seconds,
          ls.messages_count,
          ls.leads_detected,
          ls.viewers,
          ls.session_updated_at
        FROM ember.accounts a
        JOIN ember.clients c ON c.id = a.client_id
        LEFT JOIN latest_sessions ls ON ls.account_id = a.id
        {account_filter_clause}
        ORDER BY c.code, a.username;
    """

    query_messages = """
        SELECT
          m.id AS message_id,
          m.account_id,
          a.username AS account_username,
          s.session_key,
          m.lead_id,
          l.username AS lead_username,
          m.external_message_id,
          m.direction,
          m.status,
          m.username,
          m.nickname,
          m.content,
          m.score,
          m.categories,
          m.occurred_at,
          m.processed_at,
          m.raw_payload,
          m.metadata
        FROM ember.messages m
        JOIN ember.accounts a ON a.id = m.account_id
        JOIN ember.clients c ON c.id = a.client_id
        LEFT JOIN ember.account_sessions s ON s.id = m.session_id
        LEFT JOIN ember.leads l ON l.id = m.lead_id
        WHERE TRUE
        {message_filter_clause}
        ORDER BY m.occurred_at DESC, m.created_at DESC, m.id DESC;
    """

    query_leads = """
        SELECT
          l.id AS lead_id,
          l.account_id,
          a.username AS account_username,
          l.source_id,
          src.code AS source_code,
          l.external_ref,
          l.username,
          l.nickname,
          l.full_name,
          l.status,
          l.total_score,
          l.categories,
          l.first_seen_at,
          l.last_activity_at,
          l.last_message_at,
          l.last_message_text,
          l.assigned_to_name,
          l.semantic_analysis,
          l.metadata
        FROM ember.leads l
        JOIN ember.accounts a ON a.id = l.account_id
        JOIN ember.sources src ON src.id = l.source_id
        JOIN ember.clients c ON c.id = a.client_id
        WHERE TRUE
        {lead_filter_clause}
        ORDER BY l.last_activity_at DESC NULLS LAST, l.first_seen_at DESC, l.created_at DESC;
    """

    query_accounts = query_accounts.format(account_filter_clause=account_filter_clause)
    query_messages = query_messages.format(message_filter_clause=message_filter_clause)
    query_leads = query_leads.format(lead_filter_clause=lead_filter_clause)

    with db_connection() as connection:
        with connection.cursor() as cursor:
            if client_code:
                cursor.execute(query_accounts, (client_code,))
            else:
                cursor.execute(query_accounts)
            accounts = [dict(row) for row in cursor.fetchall()]

            if client_code:
                cursor.execute(query_messages, (client_code,))
            else:
                cursor.execute(query_messages)
            messages = [dict(row) for row in cursor.fetchall()]

            if client_code:
                cursor.execute(query_leads, (client_code,))
            else:
                cursor.execute(query_leads)
            leads = [dict(row) for row in cursor.fetchall()]

    return {
        "accounts": accounts,
        "messages": messages,
        "leads": leads,
    }


def build_db_snapshot(auth_user: Optional[Dict[str, object]] = None) -> Dict[str, object]:
    scope_client_code = get_user_scope_client_code(auth_user)
    if auth_user and not is_admin_user(auth_user) and not scope_client_code:
        empty_control_status = build_empty_control_status()
        empty_control_status["error"] = "El usuario no tiene un cliente asignado."
        return {
            "ok": True,
            "bridgePayload": build_empty_bridge_payload(),
            "controlStatus": empty_control_status,
            "emittedAt": datetime.now().isoformat(),
        }
    try:
        rows = fetch_db_rows(scope_client_code)
    except Exception as exc:
        empty_control_status = build_empty_control_status()
        empty_control_status["error"] = f"{type(exc).__name__}: {exc}"
        return {
            "ok": True,
            "bridgePayload": build_empty_bridge_payload(),
            "controlStatus": empty_control_status,
            "emittedAt": datetime.now().isoformat(),
        }

    account_rows = rows["accounts"]
    message_rows = rows["messages"]
    lead_rows = rows["leads"]

    bridge_accounts: List[Dict[str, object]] = []
    for account in account_rows:
        account_username = normalize_db_unique_id(account.get("username", ""))
        latest_session_key = str(account.get("session_key", "")).strip()
        latest_session_status = str(account.get("session_status", "")).strip().lower()
        has_live_session = latest_session_status == "live"
        bridge_account = {
            "uniqueId": account_username or "@sin_cuenta",
            "sessionId": latest_session_key,
            "status": "Active" if has_live_session else "Ended",
            "updatedAt": account.get("session_updated_at") or account.get("account_updated_at"),
            "startTime": account.get("started_at"),
            "endTime": None if has_live_session else account.get("ended_at"),
            "messagesCount": int(account.get("messages_count") or 0),
            "leadsDetected": int(account.get("leads_detected") or 0),
            "viewers": int(account.get("viewers") or 0),
            "campaign": normalize_db_client_key(account.get("client_code", "")),
            "displayName": account.get("display_name") or account_username.replace("@", ""),
            "clientName": account.get("client_name") or "",
        }
        if account.get("session_id") is None:
            bridge_account["sessionId"] = ""
        bridge_accounts.append(bridge_account)

    if bridge_accounts:
        primary_account = next(
            (item for item in bridge_accounts if item.get("status") == "Active"),
            bridge_accounts[0],
        )
    else:
        primary_account = None

    messages_by_lead: Dict[str, List[Dict[str, object]]] = {}
    bridge_messages: List[Dict[str, object]] = []
    for message in message_rows:
        session_key = str(message.get("session_key", "")).strip()
        message_payload = {
            "id": str(message.get("external_message_id") or message.get("message_id")),
            "timestamp": message.get("occurred_at"),
            "username": normalize_db_unique_id(message.get("username", "")),
            "nickname": message.get("nickname") or "",
            "message": message.get("content") or "",
            "score": int(message.get("score") or 0),
            "categories": list(message.get("categories") or []),
            "sessionId": session_key,
        }
        bridge_messages.append(message_payload)
        lead_id = str(message.get("lead_id") or "").strip()
        if lead_id:
            messages_by_lead.setdefault(lead_id, []).append(message_payload)

    bridge_messages.sort(key=lambda item: str(item.get("timestamp", "")), reverse=True)
    for lead_messages in messages_by_lead.values():
        lead_messages.sort(
            key=lambda item: (str(to_json_safe(item.get("timestamp")) or ""), str(item.get("id") or ""))
        )

    bridge_leads: List[Dict[str, object]] = []
    for lead in lead_rows:
        lead_id = str(lead.get("lead_id") or "").strip()
        lead_messages = messages_by_lead.get(lead_id, [])
        if not lead_messages:
            lead_messages = []
        account_username = normalize_db_unique_id(lead.get("account_username", ""))
        total_score = int(lead.get("total_score") or 0)
        last_message_text = lead.get("last_message_text") or ""
        last_activity = lead.get("last_activity_at") or lead.get("first_seen_at")
        bridge_leads.append(
            {
                "id": lead_id,
                "accountUniqueId": account_username or None,
                "status": str(lead.get("status") or "new").strip().title(),
                "username": normalize_db_unique_id(lead.get("username", "")),
                "nickname": lead.get("nickname") or "",
                "totalScore": total_score,
                "categories": list(lead.get("categories") or []),
                "lastMessage": last_message_text,
                "lastActivity": last_activity,
                "messages": lead_messages,
                "semanticAnalysis": lead.get("semantic_analysis") or {},
                "assignedTo": lead.get("assigned_to_name") or None,
            }
        )

    bridge_leads.sort(key=lambda item: str(item.get("lastActivity", "")), reverse=True)
    if primary_account is None and bridge_accounts:
        primary_account = bridge_accounts[0]

    control_status = build_empty_control_status()
    control_status.update(
        {
            "configuredTargets": [account["uniqueId"] for account in bridge_accounts if account.get("uniqueId")],
            "runningTargets": [
                account["uniqueId"]
                for account in bridge_accounts
                if account.get("status") == "Active" and account.get("uniqueId")
            ],
            "accounts": bridge_accounts,
            "statuses": [
                {
                    "uniqueId": account["uniqueId"],
                    "isLive": account.get("status") == "Active",
                    "status": "online" if account.get("status") == "Active" else "offline",
                    "checkedAt": datetime.now().isoformat(),
                    "liveStartedAt": account.get("startTime"),
                    "playbackUrl": None,
                    "error": None,
                }
                for account in bridge_accounts
            ],
            "liveStatus": [
                {
                    "uniqueId": account["uniqueId"],
                    "isLive": account.get("status") == "Active",
                    "status": "online" if account.get("status") == "Active" else "offline",
                    "checkedAt": datetime.now().isoformat(),
                    "liveStartedAt": account.get("startTime"),
                    "playbackUrl": None,
                    "error": None,
                }
                for account in bridge_accounts
            ],
            "monitoringSince": {
                account["uniqueId"]: to_json_safe(account.get("startTime"))
                for account in bridge_accounts
                if account.get("status") == "Active" and account.get("startTime")
            },
        }
    )

    bridge_payload = build_empty_bridge_payload()
    bridge_payload.update(
        {
            "currentAccount": primary_account,
            "account": primary_account,
            "messages": bridge_messages,
            "allMessages": bridge_messages,
            "leads": bridge_leads,
            "allLeads": bridge_leads,
            "accounts": bridge_accounts,
            "liveSessions": bridge_accounts,
        }
    )

    return {
        "ok": True,
        "bridgePayload": bridge_payload,
        "controlStatus": control_status,
        "emittedAt": datetime.now().isoformat(),
    }


class CurrentMessagesPublisher:
    def __init__(self, output_path: Path, max_messages: int = 200):
        self.output_path = output_path
        self.max_messages = max_messages
        self._lock = threading.Lock()
        self._messages_by_account: Dict[str, List[Dict[str, object]]] = {}
        self._leads_by_account: Dict[str, Dict[str, Dict[str, object]]] = {}
        self._accounts: Dict[str, Dict[str, object]] = {}
        self._viewer_sets: Dict[str, set[str]] = {}
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        self._load_existing()

    def _load_existing(self) -> None:
        if not self.output_path.exists():
            return

        try:
            payload = json.loads(self.output_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return

        for account in payload.get("accounts", []):
            unique_id = str(account.get("uniqueId", "")).strip()
            if not unique_id:
                continue
            self._accounts[unique_id] = {
                "uniqueId": unique_id,
                "sessionId": str(account.get("sessionId", "")),
                "status": str(account.get("status", "Ended")),
                "updatedAt": str(account.get("updatedAt", "")),
                "startTime": account.get("startTime"),
                "endTime": account.get("endTime"),
                "messagesCount": int(account.get("messagesCount", 0) or 0),
                "leadsDetected": int(account.get("leadsDetected", 0) or 0),
                "viewers": int(account.get("viewers", 0) or 0),
            }

        primary_account = payload.get("account") or {}
        primary_unique_id = str(primary_account.get("uniqueId", "")).strip()
        if primary_unique_id:
            self._messages_by_account[primary_unique_id] = list(payload.get("messages", []))
            primary_leads = {}
            for lead in payload.get("leads", []):
                key = f"{lead.get('username', '')}::{lead.get('nickname', '')}"
                primary_leads[key] = lead
            self._leads_by_account[primary_unique_id] = primary_leads
            self._viewer_sets[primary_unique_id] = {
                str(message.get("username", "")).lstrip("@")
                for message in payload.get("messages", [])
                if message.get("username")
            }

    def ensure_account(self, unique_id: str) -> None:
        account_key = f"@{unique_id.lstrip('@')}"
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
            }
            self._messages_by_account.setdefault(account_key, [])
            self._leads_by_account.setdefault(account_key, {})
            self._viewer_sets.setdefault(account_key, set())
            self._persist()

    def start_session(self, unique_id: str, session_id: str) -> None:
        with self._lock:
            account_key = f"@{unique_id.lstrip('@')}"
            now = datetime.now().isoformat()
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
            }
            self._persist()

    def ingest(self, record: Dict[str, object]) -> None:
        account_key = f"@{str(record['streamer_unique_id']).lstrip('@')}"
        if account_key not in self._accounts or self._accounts[account_key].get("status") != "Active":
            self.start_session(str(record["streamer_unique_id"]), str(record["session_id"]))

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
                    }
                    account_leads[lead_key] = lead

                lead["totalScore"] = int(lead["totalScore"]) + int(record["lead_score"])
                lead["lastMessage"] = record["comment_text"]
                lead["lastActivity"] = record["timestamp"]
                lead["messages"].append(message)
                lead["messages"] = lead["messages"][-10:]

                for category in record["lead_categories"]:
                    if category not in lead["categories"]:
                        lead["categories"].append(category)

            account = self._accounts[account_key]
            account["updatedAt"] = datetime.now().isoformat()
            account["status"] = "Active"
            account["endTime"] = None
            account["messagesCount"] = len(self._messages_by_account[account_key])
            account["leadsDetected"] = len(self._leads_by_account.get(account_key, {}))
            account["viewers"] = len(self._viewer_sets.get(account_key, set()))
            self._persist()

    def end_session(self, unique_id: str) -> None:
        with self._lock:
            account_key = f"@{unique_id.lstrip('@')}"
            account = self._accounts.get(account_key)
            if account is None:
                return
            account["status"] = "Ended"
            account["updatedAt"] = datetime.now().isoformat()
            account["endTime"] = account["updatedAt"]
            self._persist()

    def _sorted_accounts(self) -> List[Dict[str, object]]:
        return sorted(
            self._accounts.values(),
            key=lambda item: (item.get("status") == "Active", str(item.get("updatedAt", ""))),
            reverse=True,
        )

    def _select_primary_account(self) -> Optional[Dict[str, object]]:
        accounts = self._sorted_accounts()
        return accounts[0] if accounts else None

    def _persist(self) -> None:
        primary_account = self._select_primary_account()
        if primary_account is None:
            payload = {"account": None, "messages": [], "leads": [], "accounts": [], "liveSessions": []}
            self.output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            return

        account_key = str(primary_account["uniqueId"])
        primary_messages = self._messages_by_account.get(account_key, [])
        primary_leads = sorted(
            self._leads_by_account.get(account_key, {}).values(),
            key=lambda item: (int(item["totalScore"]), str(item["lastActivity"])),
            reverse=True,
        )
        accounts = self._sorted_accounts()
        payload = {
            "account": primary_account,
            "currentAccount": primary_account,
            "messages": primary_messages,
            "leads": primary_leads,
            "accounts": accounts,
            "liveSessions": accounts,
        }
        self.output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def get_accounts_summary(self) -> List[Dict[str, object]]:
        with self._lock:
            return [dict(account) for account in self._sorted_accounts()]


def upload_file_to_drive_safe(filepath: str, folder_id: str):
    try:
        from drive_uploader import upload_file_to_drive
    except ModuleNotFoundError as exc:
        print(f"Subida a Drive omitida para {filepath}: falta dependencia opcional ({exc}).")
        return {"ok": False, "skipped": True, "reason": str(exc), "filepath": filepath}

    try:
        return upload_file_to_drive(filepath, folder_id)
    except Exception as exc:
        print(f"No se pudo subir a Drive {filepath}: {type(exc).__name__}: {exc}")
        return {"ok": False, "skipped": False, "reason": f"{type(exc).__name__}: {exc}", "filepath": filepath}


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

def load_targets() -> List[Dict[str, str]]:
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

        targets = [item for item in data if item.get("active", True)]
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


def save_targets(targets: List[Dict[str, str]]) -> None:
    Path(TARGETS_FILE).write_text(
        json.dumps(targets, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def parse_tiktok_start_time(value: object) -> Optional[str]:
    try:
        timestamp = int(value)
    except (TypeError, ValueError):
        return None

    if timestamp <= 0:
        return None

    return datetime.fromtimestamp(timestamp).isoformat()


def pick_first_stream_url(value: object) -> Optional[str]:
    if isinstance(value, str) and value.startswith("http"):
        return value

    if isinstance(value, dict):
        for stream_url in value.values():
            selected = pick_first_stream_url(stream_url)
            if selected:
                return selected

    if isinstance(value, list):
        for stream_url in value:
            selected = pick_first_stream_url(stream_url)
            if selected:
                return selected

    return None


def extract_playback_url(room_info: Dict[str, object]) -> Optional[str]:
    stream_url = room_info.get("stream_url")
    if not isinstance(stream_url, dict):
        return None

    direct_hls = stream_url.get("hls_pull_url")
    if isinstance(direct_hls, str) and direct_hls.startswith("http"):
        return direct_hls

    mapped_hls = pick_first_stream_url(stream_url.get("hls_pull_url_map"))
    if mapped_hls:
        return mapped_hls

    live_core_sdk_data = stream_url.get("live_core_sdk_data")
    if not isinstance(live_core_sdk_data, dict):
        return None

    pull_data = live_core_sdk_data.get("pull_data")
    if not isinstance(pull_data, dict):
        return None

    raw_stream_data = pull_data.get("stream_data")
    if not isinstance(raw_stream_data, str):
        return None

    try:
        stream_data = json.loads(raw_stream_data)
    except json.JSONDecodeError:
        return None

    return pick_first_stream_url(stream_data)


def build_live_status(
    unique_id: str,
    *,
    is_live: bool,
    checked_at: str,
    live_started_at: Optional[str] = None,
    playback_url: Optional[str] = None,
    error: Optional[str] = None,
) -> Dict[str, object]:
    return {
        "uniqueId": normalize_unique_id(unique_id),
        "isLive": is_live,
        "status": "online" if is_live else "offline",
        "checkedAt": checked_at,
        "liveStartedAt": live_started_at,
        "playbackUrl": playback_url,
        "error": error,
    }


async def fetch_live_status(unique_id: str) -> Dict[str, object]:
    normalized = normalize_unique_id(unique_id)
    checked_at = datetime.now().isoformat()
    client = TikTokLiveClient(unique_id=normalized.lstrip("@"))

    try:
        room_info = await asyncio.wait_for(
            client.web.fetch_room_info(unique_id=normalized.lstrip("@")),
            timeout=LIVE_STATUS_TIMEOUT_SECONDS,
        )
        playback_url = extract_playback_url(room_info)
        return build_live_status(
            normalized,
            is_live=True,
            checked_at=checked_at,
            live_started_at=parse_tiktok_start_time(room_info.get("start_time")),
            playback_url=playback_url,
            error=None if playback_url else "TikTok no entregó una URL HLS para este live.",
        )
    except Exception as room_info_error:
        try:
            is_live = await asyncio.wait_for(
                client.is_live(),
                timeout=LIVE_STATUS_TIMEOUT_SECONDS,
            )
        except Exception as live_error:
            return {
                "uniqueId": normalized,
                "isLive": False,
                "status": "unknown",
                "checkedAt": checked_at,
                "liveStartedAt": None,
                "playbackUrl": None,
                "error": f"{type(live_error).__name__}: {live_error}",
            }

        return build_live_status(
            normalized,
            is_live=bool(is_live),
            checked_at=checked_at,
            playback_url=None,
            error=None
            if is_live
            else f"{type(room_info_error).__name__}: {room_info_error}",
        )


def fetch_live_status_sync(unique_id: str) -> Dict[str, object]:
    return asyncio.run(fetch_live_status(unique_id))


def run_target(
    target: Dict[str, str],
    publisher: CurrentMessagesPublisher,
    display: Optional[Display] = None,
    recorder_ready_callback: Optional[Callable[[str, TikTokCommentRecorder], None]] = None,
    recorder_finished_callback: Optional[Callable[[str, TikTokCommentRecorder], None]] = None,
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
    def handle_record(record: Dict[str, object]) -> None:
        if display is not None:
            display.enqueue(record)
        publisher.ingest(record)

    def handle_session_end() -> None:
        rotator.upload_current()
        publisher.end_session(unique_id)

    recorder.message_callback = handle_record
    recorder.session_start_callback = lambda session_id: publisher.start_session(unique_id, session_id)
    recorder.session_end_callback = handle_session_end
    if recorder_ready_callback is not None:
        recorder_ready_callback(unique_id, recorder)
    try:
        recorder.run()
    except Exception as exc:
        print(f"No se pudo conectar a @{unique_id}: {exc}")
        publisher.end_session(unique_id)
    finally:
        if recorder_finished_callback is not None:
            recorder_finished_callback(unique_id, recorder)


class RecorderCoordinator:
    def __init__(self, publisher: CurrentMessagesPublisher, display: Display):
        self.publisher = publisher
        self.display = display
        self._lock = threading.Lock()
        self._threads: Dict[str, threading.Thread] = {}
        self._recorders: Dict[str, TikTokCommentRecorder] = {}
        self._live_status_lock = threading.Lock()
        self._live_status_cache: Dict[str, Tuple[float, Dict[str, object]]] = {}

    def start_target(self, unique_id: str) -> Dict[str, object]:
        normalized = normalize_unique_id(unique_id)

        with self._lock:
            existing = self._threads.get(normalized)
            if existing is not None and existing.is_alive():
                return {"ok": True, "started": False, "unique_id": normalized}

            self.publisher.ensure_account(normalized)
            target = {"unique_id": normalized, "active": True}
            thread = threading.Thread(
                target=self._run_target_wrapper,
                args=(target,),
                daemon=True,
            )
            self._threads[normalized] = thread
            thread.start()

        return {"ok": True, "started": True, "unique_id": normalized}

    def _register_recorder(self, unique_id: str, recorder: TikTokCommentRecorder) -> None:
        normalized = normalize_unique_id(unique_id)
        with self._lock:
            self._recorders[normalized] = recorder

    def _unregister_recorder(self, unique_id: str, recorder: TikTokCommentRecorder) -> None:
        normalized = normalize_unique_id(unique_id)
        with self._lock:
            existing = self._recorders.get(normalized)
            if existing is recorder:
                self._recorders.pop(normalized, None)

    def _run_target_wrapper(self, target: Dict[str, str]) -> None:
        normalized = normalize_unique_id(str(target["unique_id"]))
        try:
            run_target(
                target,
                self.publisher,
                self.display,
                recorder_ready_callback=self._register_recorder,
                recorder_finished_callback=self._unregister_recorder,
            )
        finally:
            with self._lock:
                existing = self._threads.get(normalized)
                if existing is threading.current_thread():
                    self._threads.pop(normalized, None)

    def add_target(self, unique_id: str) -> Dict[str, object]:
        normalized = normalize_unique_id(unique_id)
        targets = load_targets()
        if not any(normalize_unique_id(str(item["unique_id"])) == normalized for item in targets):
            targets.append({"unique_id": normalized, "active": True})
            save_targets(targets)

        return self.start_target(normalized)

    def stop_target(self, unique_id: str) -> Dict[str, object]:
        normalized = normalize_unique_id(unique_id)
        with self._lock:
            recorder = self._recorders.get(normalized)
            thread = self._threads.get(normalized)

        targets = load_targets()
        filtered_targets = [
            item
            for item in targets
            if normalize_unique_id(str(item.get("unique_id", ""))) != normalized
        ]
        target_was_configured = len(filtered_targets) != len(targets)
        if target_was_configured:
            save_targets(filtered_targets)

        disconnect_requested = False
        disconnect_error: Optional[str] = None
        if recorder is not None:
            loop = getattr(recorder.client, "_asyncio_loop", None)
            if loop is not None and not loop.is_closed():
                disconnect_requested = True
                try:
                    future = asyncio.run_coroutine_threadsafe(
                        recorder.client.disconnect(close_client=True),
                        loop,
                    )
                    future.result(timeout=15)
                except Exception as exc:
                    disconnect_error = f"{type(exc).__name__}: {exc}"
            else:
                disconnect_error = "El cliente no tiene un loop activo."

        if thread is not None and thread.is_alive():
            thread.join(timeout=15)

        with self._lock:
            remaining_thread = self._threads.get(normalized)
            if remaining_thread is not None and not remaining_thread.is_alive():
                self._threads.pop(normalized, None)
            remaining_recorder = self._recorders.get(normalized)
            if remaining_recorder is recorder:
                self._recorders.pop(normalized, None)

        thread_still_running = thread is not None and thread.is_alive()
        stop_succeeded = not thread_still_running or disconnect_error is None

        return {
            "ok": stop_succeeded,
            "unique_id": normalized,
            "removed": target_was_configured,
            "stopped": not thread_still_running,
            "disconnectRequested": disconnect_requested,
            "error": disconnect_error,
        }

    def _get_cached_live_status(self, unique_id: str) -> Dict[str, object]:
        normalized = normalize_unique_id(unique_id)
        now = time.time()
        with self._live_status_lock:
            cached = self._live_status_cache.get(normalized)
            if cached and now - cached[0] < LIVE_STATUS_CACHE_TTL_SECONDS:
                return dict(cached[1])

        status = fetch_live_status_sync(normalized)
        with self._live_status_lock:
            self._live_status_cache[normalized] = (now, status)
        return dict(status)

    def get_live_statuses(self) -> List[Dict[str, object]]:
        with self._lock:
            running = sorted(
                unique_id
                for unique_id, thread in self._threads.items()
                if thread.is_alive()
            )

        configured = [
            normalize_unique_id(str(item["unique_id"]))
            for item in load_targets()
            if item.get("active", True)
        ]
        running_set = set(running)
        checked_at = datetime.now().isoformat()
        statuses: List[Dict[str, object]] = []

        if running:
            max_workers = min(4, len(running))
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_by_unique_id = {
                    executor.submit(self._get_cached_live_status, unique_id): unique_id
                    for unique_id in running
                }
                for future in concurrent.futures.as_completed(future_by_unique_id):
                    unique_id = future_by_unique_id[future]
                    try:
                        status = future.result()
                    except Exception as exc:
                        status = {
                            "uniqueId": unique_id,
                            "isLive": True,
                            "status": "online",
                            "checkedAt": checked_at,
                            "liveStartedAt": None,
                            "playbackUrl": None,
                            "error": f"No se pudo obtener playbackUrl: {type(exc).__name__}: {exc}",
                        }
                    if status.get("status") != "online":
                        status.update(
                            {
                                "isLive": True,
                                "status": "online",
                                "checkedAt": checked_at,
                                "error": status.get("error") or "Listener conectado, pero sin URL HLS disponible.",
                            }
                        )
                    statuses.append(status)

            statuses.sort(key=lambda item: str(item.get("uniqueId", "")))

        for unique_id in configured:
            if unique_id in running_set:
                continue
            statuses.append(
                build_live_status(
                    unique_id,
                    is_live=False,
                    checked_at=checked_at,
                    error=None,
                )
            )

        return statuses

    def get_status(self) -> Dict[str, object]:
        with self._lock:
            running = sorted(
                unique_id
                for unique_id, thread in self._threads.items()
                if thread.is_alive()
            )

        configured = [
            normalize_unique_id(str(item["unique_id"]))
            for item in load_targets()
            if item.get("active", True)
        ]
        statuses = self.get_live_statuses()
        return {
            "configuredTargets": configured,
            "runningTargets": running,
            "statuses": statuses,
            "liveStatus": statuses,
            "accounts": self.publisher.get_accounts_summary(),
        }


def build_control_handler(coordinator: RecorderCoordinator):
    class RecorderControlHandler(BaseHTTPRequestHandler):
        def _set_headers(self, status: int = HTTPStatus.OK) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.end_headers()

        def _write_json(self, payload: Dict[str, object], status: int = HTTPStatus.OK) -> None:
            self._set_headers(status)
            self.wfile.write(
                json.dumps(payload, ensure_ascii=False, default=to_json_safe).encode("utf-8")
            )

        def _require_auth(self) -> Optional[Dict[str, object]]:
            token = get_bearer_token(self.headers)
            user = fetch_authenticated_user(token)
            if user is None:
                self._write_json({"ok": False, "error": "Debes iniciar sesión."}, HTTPStatus.UNAUTHORIZED)
                return None
            return user

        def _require_admin(self, user: Dict[str, object]) -> bool:
            if is_admin_user(user):
                return True
            self._write_json(
                {"ok": False, "error": "Solo el administrador puede realizar esta acción."},
                HTTPStatus.FORBIDDEN,
            )
            return False

        def do_OPTIONS(self):
            self._set_headers(HTTPStatus.NO_CONTENT)

        def do_GET(self):
            request_path = normalize_control_request_path(urlparse(self.path).path)
            if request_path == "/auth/me":
                user = self._require_auth()
                if user is None:
                    return
                self._write_json({"ok": True, "user": build_auth_user_payload(user)})
                return

            if request_path == "/users":
                user = self._require_auth()
                if user is None:
                    return
                if not self._require_admin(user):
                    return

                with db_connection() as connection:
                    with connection.cursor() as cursor:
                        cursor.execute(
                            """
                            SELECT
                              id,
                              login,
                              display_name,
                              role,
                              client_code,
                              is_active,
                              last_login_at,
                              created_at,
                              updated_at
                            FROM ember.app_users
                            ORDER BY CASE WHEN role = 'administrator' THEN 0 ELSE 1 END, lower(login)
                            """
                        )
                        users = [build_app_user_payload(dict(row)) for row in cursor.fetchall()]

                self._write_json({"ok": True, "users": users})
                return

            if request_path not in {"/status", "/live-status", "/db-snapshot"}:
                self._set_headers(HTTPStatus.NOT_FOUND)
                self.wfile.write(json.dumps({"ok": False, "error": "Ruta no encontrada"}).encode("utf-8"))
                return

            user = self._require_auth()
            if user is None:
                return

            snapshot = build_db_snapshot(user)
            if request_path == "/live-status":
                payload = {"ok": True, "statuses": snapshot.get("controlStatus", {}).get("liveStatus", [])}
            elif request_path == "/db-snapshot":
                payload = snapshot
            else:
                control_status = snapshot.get("controlStatus", {})
                payload = {
                    "ok": True,
                    "configuredTargets": control_status.get("configuredTargets", []),
                    "runningTargets": control_status.get("runningTargets", []),
                    "statuses": control_status.get("statuses", []),
                    "liveStatus": control_status.get("liveStatus", []),
                    "accounts": control_status.get("accounts", []),
                    "connectionErrors": control_status.get("connectionErrors", {}),
                    "monitoringSince": control_status.get("monitoringSince", {}),
                }
            self._write_json(payload)

        def do_POST(self):
            request_path = normalize_control_request_path(urlparse(self.path).path)
            if request_path == "/auth/login":
                try:
                    payload = parse_json_body(self)
                    login = str(payload.get("login", "")).strip()
                    password = str(payload.get("password", "")).strip()
                    if not login or not password:
                        raise ValueError("Debes enviar login y password.")

                    with db_connection() as connection:
                        with connection.cursor() as cursor:
                            cursor.execute(
                                """
                                SELECT id, login, display_name, role, client_code, is_active
                                FROM ember.app_users
                                WHERE lower(login) = lower(%s)
                                  AND is_active = true
                                  AND password_hash = crypt(%s, password_hash)
                                LIMIT 1
                                """,
                                (login, password),
                            )
                            user = cursor.fetchone()
                        connection.commit()

                    if not user:
                        self._write_json(
                            {"ok": False, "error": "Credenciales inválidas."},
                            HTTPStatus.UNAUTHORIZED,
                        )
                        return

                    session = create_auth_session(dict(user))
                    self._write_json(
                        {
                            "ok": True,
                            "token": session["token"],
                            "expiresAt": session["expiresAt"],
                            "user": build_auth_user_payload(user),
                        }
                    )
                except Exception as exc:
                    self._write_json(
                        {"ok": False, "error": str(exc)},
                        HTTPStatus.BAD_REQUEST,
                    )
                return

            if request_path == "/users":
                try:
                    user = self._require_auth()
                    if user is None:
                        return
                    if not self._require_admin(user):
                        return

                    payload = parse_json_body(self)
                    normalized_payload = normalize_app_user_payload(payload, require_password=True)
                    with db_connection() as connection:
                        with connection.cursor() as cursor:
                            cursor.execute(
                                """
                                INSERT INTO ember.app_users (
                                  login,
                                  display_name,
                                  role,
                                  client_code,
                                  password_hash,
                                  is_active
                                )
                                VALUES (
                                  %s,
                                  %s,
                                  %s,
                                  %s,
                                  crypt(%s, gen_salt('bf')),
                                  %s
                                )
                                RETURNING
                                  id,
                                  login,
                                  display_name,
                                  role,
                                  client_code,
                                  is_active,
                                  last_login_at,
                                  created_at,
                                  updated_at
                                """,
                                (
                                    normalized_payload["login"],
                                    normalized_payload["display_name"],
                                    normalized_payload["role"],
                                    normalized_payload["client_code"],
                                    normalized_payload["password"],
                                    normalized_payload["is_active"],
                                ),
                            )
                            created_user = cursor.fetchone()
                        connection.commit()

                    self._write_json(
                        {"ok": True, "user": build_app_user_payload(created_user)},
                        HTTPStatus.CREATED,
                    )
                except Exception as exc:
                    if is_unique_login_violation(exc):
                        self._write_json(
                            {"ok": False, "error": "Ya existe un usuario con ese login."},
                            HTTPStatus.CONFLICT,
                        )
                    else:
                        self._write_json(
                            {"ok": False, "error": str(exc)},
                            HTTPStatus.BAD_REQUEST,
                        )
                return

            if request_path == "/auth/logout":
                user = self._require_auth()
                if user is None:
                    return
                token = get_bearer_token(self.headers)
                delete_auth_session(token)
                self._write_json({"ok": True})
                return

            if request_path != "/targets":
                self._set_headers(HTTPStatus.NOT_FOUND)
                self.wfile.write(json.dumps({"ok": False, "error": "Ruta no encontrada"}).encode("utf-8"))
                return

            try:
                user = self._require_auth()
                if user is None:
                    return
                if not self._require_admin(user):
                    return

                payload = parse_json_body(self)
                unique_id = str(payload.get("unique_id", "")).strip()
                if not unique_id:
                    raise ValueError("Debes enviar unique_id.")
                result = coordinator.add_target(unique_id)
                self._write_json(result)
            except Exception as exc:
                self._write_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)

        def do_PUT(self):
            request_url = urlparse(self.path)
            request_path = normalize_control_request_path(request_url.path)
            path_parts = [part for part in request_path.split("/") if part]

            if len(path_parts) == 2 and path_parts[0] == "users":
                user_id = path_parts[1]
                try:
                    UUID(user_id)
                except ValueError:
                    self._write_json(
                        {"ok": False, "error": "Debes enviar un id de usuario válido."},
                        HTTPStatus.BAD_REQUEST,
                    )
                    return

                try:
                    user = self._require_auth()
                    if user is None:
                        return
                    if not self._require_admin(user):
                        return

                    payload = parse_json_body(self)
                    normalized_payload = normalize_app_user_payload(payload, require_password=False)
                    with db_connection() as connection:
                        with connection.cursor() as cursor:
                            cursor.execute(
                                """
                                SELECT id, role, is_active
                                FROM ember.app_users
                                WHERE id = %s
                                LIMIT 1
                                """,
                                (user_id,),
                            )
                            existing_user = cursor.fetchone()
                            if not existing_user:
                                self._write_json(
                                    {"ok": False, "error": "No se encontró el usuario."},
                                    HTTPStatus.NOT_FOUND,
                                )
                                return

                            if normalize_db_role(existing_user.get("role", "")) == "administrator" and (
                                normalized_payload["role"] != "administrator" or not normalized_payload["is_active"]
                            ):
                                remaining_admins = count_active_admin_users(connection, excluded_user_id=user_id)
                                if remaining_admins < 1:
                                    raise ValueError("Debe existir al menos un administrador activo.")

                            password_value = normalized_payload["password"]
                            cursor.execute(
                                """
                                UPDATE ember.app_users
                                SET login = %s,
                                    display_name = %s,
                                    role = %s,
                                    client_code = %s,
                                    is_active = %s,
                                    password_hash = CASE
                                        WHEN %s::text IS NULL THEN password_hash
                                        ELSE crypt(%s::text, gen_salt('bf'))
                                    END
                                WHERE id = %s
                                RETURNING
                                  id,
                                  login,
                                  display_name,
                                  role,
                                  client_code,
                                  is_active,
                                  last_login_at,
                                  created_at,
                                  updated_at
                                """,
                                (
                                    normalized_payload["login"],
                                    normalized_payload["display_name"],
                                    normalized_payload["role"],
                                    normalized_payload["client_code"],
                                    normalized_payload["is_active"],
                                    password_value,
                                    password_value,
                                    user_id,
                                ),
                            )
                            updated_user = cursor.fetchone()
                        connection.commit()

                    self._write_json({"ok": True, "user": build_app_user_payload(updated_user)})
                except Exception as exc:
                    if is_unique_login_violation(exc):
                        self._write_json(
                            {"ok": False, "error": "Ya existe un usuario con ese login."},
                            HTTPStatus.CONFLICT,
                        )
                    else:
                        self._write_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return

        def do_DELETE(self):
            request_url = urlparse(self.path)
            request_path = normalize_control_request_path(request_url.path)
            if request_path == "/auth/logout":
                user = self._require_auth()
                if user is None:
                    return
                token = get_bearer_token(self.headers)
                delete_auth_session(token)
                self._write_json({"ok": True})
                return

            path_parts = [part for part in request_path.split("/") if part]
            if len(path_parts) == 2 and path_parts[0] == "users":
                user_id = path_parts[1]
                try:
                    UUID(user_id)
                except ValueError:
                    self._write_json(
                        {"ok": False, "error": "Debes enviar un id de usuario válido."},
                        HTTPStatus.BAD_REQUEST,
                    )
                    return

                try:
                    user = self._require_auth()
                    if user is None:
                        return
                    if not self._require_admin(user):
                        return

                    if str(user.get("id", "")).strip() == user_id:
                        raise ValueError("No puedes eliminar tu propio usuario.")

                    with db_connection() as connection:
                        with connection.cursor() as cursor:
                            cursor.execute(
                                """
                                SELECT id, role, is_active
                                FROM ember.app_users
                                WHERE id = %s
                                LIMIT 1
                                """,
                                (user_id,),
                            )
                            target_user = cursor.fetchone()
                            if not target_user:
                                self._write_json(
                                    {"ok": False, "error": "No se encontró el usuario."},
                                    HTTPStatus.NOT_FOUND,
                                )
                                return

                            if normalize_db_role(target_user.get("role", "")) == "administrator":
                                remaining_admins = count_active_admin_users(connection, excluded_user_id=user_id)
                                if remaining_admins < 1:
                                    raise ValueError("Debe existir al menos un administrador activo.")

                            cursor.execute(
                                """
                                DELETE FROM ember.app_users
                                WHERE id = %s
                                RETURNING
                                  id,
                                  login,
                                  display_name,
                                  role,
                                  client_code,
                                  is_active,
                                  last_login_at,
                                  created_at,
                                  updated_at
                                """,
                                (user_id,),
                            )
                            deleted_user = cursor.fetchone()
                        connection.commit()

                    self._write_json(
                        {
                            "ok": True,
                            "deleted": True,
                            "user": build_app_user_payload(deleted_user),
                        }
                    )
                except Exception as exc:
                    self._write_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return

            if request_path not in {"/targets", "/sessions"}:
                self._set_headers(HTTPStatus.NOT_FOUND)
                self.wfile.write(json.dumps({"ok": False, "error": "Ruta no encontrada"}).encode("utf-8"))
                return

            try:
                user = self._require_auth()
                if user is None:
                    return
                if not self._require_admin(user):
                    return

                if request_path == "/sessions":
                    payload = parse_json_body(self)
                    unique_id = normalize_db_unique_id(payload.get("unique_id", ""))
                    session_key = str(payload.get("session_id", "")).strip()
                    start_time = parse_iso_datetime(payload.get("start_time"))
                    if not unique_id:
                        raise ValueError("Debes enviar unique_id.")
                    if not session_key and start_time is None:
                        raise ValueError("Debes enviar session_id o start_time.")

                    with db_connection() as connection:
                        with connection.cursor() as cursor:
                            if session_key:
                                cursor.execute(
                                    """
                                    DELETE FROM ember.account_sessions s
                                    USING ember.accounts a
                                    WHERE s.account_id = a.id
                                      AND lower(a.username) = lower(%s)
                                      AND s.session_key = %s
                                      AND s.ended_at IS NOT NULL
                                    RETURNING s.id, s.session_key
                                    """,
                                    (unique_id, session_key),
                                )
                            else:
                                cursor.execute(
                                    """
                                    DELETE FROM ember.account_sessions s
                                    USING ember.accounts a
                                    WHERE s.account_id = a.id
                                      AND lower(a.username) = lower(%s)
                                      AND s.started_at = %s
                                      AND s.ended_at IS NOT NULL
                                    RETURNING s.id, s.session_key
                                    """,
                                    (unique_id, start_time),
                                )
                            deleted_session = cursor.fetchone()
                        connection.commit()

                    if not deleted_session:
                        self._write_json(
                            {"ok": False, "error": "No se encontró la sesión para borrar."},
                            HTTPStatus.NOT_FOUND,
                        )
                        return

                    self._write_json(
                        {
                            "ok": True,
                            "deleted": True,
                            "unique_id": unique_id,
                            "session_id": deleted_session.get("session_key"),
                        }
                    )
                    return

                query_unique_id = parse_qs(request_url.query).get("unique_id", [""])[0].strip()
                unique_id = query_unique_id

                if not unique_id:
                    payload = parse_json_body(self)
                    unique_id = str(payload.get("unique_id", "")).strip()

                if not unique_id:
                    raise ValueError("Debes enviar unique_id.")

                result = coordinator.stop_target(unique_id)
                self._write_json(result)
            except Exception as exc:
                self._write_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)

        def log_message(self, format: str, *args):
            return

    return RecorderControlHandler


def start_control_server(coordinator: RecorderCoordinator) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(
        (CONTROL_HOST, CONTROL_PORT),
        build_control_handler(coordinator),
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"API de control disponible en http://{CONTROL_HOST}:{CONTROL_PORT}")
    return server


def main():
    targets = load_targets()
    print(f"Escuchando {len(targets)} cuenta(s): {', '.join(t['unique_id'] for t in targets)}")
    publisher = CurrentMessagesPublisher(BRIDGE_OUTPUT_PATH)
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

    coordinator = RecorderCoordinator(publisher, display)
    control_server = start_control_server(coordinator)
    atexit.register(control_server.shutdown)
    for target in targets:
        coordinator.start_target(str(target["unique_id"]))

    display.run()


if __name__ == "__main__":
    main()
