# main.py
import atexit
import json
import os
import queue
import threading
import time
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Dict, List, Optional, Protocol

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


load_dotenv()

DRIVE_FOLDER_ID = os.getenv("DRIVE_FOLDER_ID", "1lGNGn3QABqcsjEZ9f1JHzgiXXTtyyVst")
TARGETS_FILE = os.getenv("TARGETS_FILE", "targets.json")
TIKTOK_UNIQUE_ID = os.getenv("TIKTOK_UNIQUE_ID")
CONTROL_HOST = os.getenv("RECORDER_CONTROL_HOST", "127.0.0.1")
CONTROL_PORT = int(os.getenv("RECORDER_CONTROL_PORT", "8765"))

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
    from drive_uploader import upload_file_to_drive

    return upload_file_to_drive(filepath, folder_id)


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
    return f"@{value.strip().lstrip('@')}"


def save_targets(targets: List[Dict[str, str]]) -> None:
    Path(TARGETS_FILE).write_text(
        json.dumps(targets, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def run_target(
    target: Dict[str, str],
    publisher: CurrentMessagesPublisher,
    display: Optional[Display] = None,
) -> None:
    unique_id = str(target["unique_id"]).lstrip("@")
    rotator = StreamFileRotator(unique_id)
    atexit.register(rotator.upload_current)

    recorder = TikTokCommentRecorder(
        unique_id=unique_id,
        output_paths_getter=rotator.get_current_paths,
        message_callback=None,
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
    recorder.session_end_callback = handle_session_end
    try:
        recorder.run()
    except Exception as exc:
        print(f"No se pudo conectar a @{unique_id}: {exc}")
        publisher.end_session(unique_id)


class RecorderCoordinator:
    def __init__(self, publisher: CurrentMessagesPublisher, display: Display):
        self.publisher = publisher
        self.display = display
        self._lock = threading.Lock()
        self._threads: Dict[str, threading.Thread] = {}

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

    def _run_target_wrapper(self, target: Dict[str, str]) -> None:
        normalized = normalize_unique_id(str(target["unique_id"]))
        try:
            run_target(target, self.publisher, self.display)
        finally:
            with self._lock:
                existing = self._threads.get(normalized)
                if existing is threading.current_thread():
                    del self._threads[normalized]

    def add_target(self, unique_id: str) -> Dict[str, object]:
        normalized = normalize_unique_id(unique_id)
        targets = load_targets()
        if not any(normalize_unique_id(str(item["unique_id"])) == normalized for item in targets):
            targets.append({"unique_id": normalized, "active": True})
            save_targets(targets)

        return self.start_target(normalized)

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
        return {
            "configuredTargets": configured,
            "runningTargets": running,
            "accounts": self.publisher.get_accounts_summary(),
        }


def build_control_handler(coordinator: RecorderCoordinator):
    class RecorderControlHandler(BaseHTTPRequestHandler):
        def _set_headers(self, status: int = HTTPStatus.OK) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_OPTIONS(self):
            self._set_headers(HTTPStatus.NO_CONTENT)

        def do_GET(self):
            if self.path != "/status":
                self._set_headers(HTTPStatus.NOT_FOUND)
                self.wfile.write(json.dumps({"ok": False, "error": "Ruta no encontrada"}).encode("utf-8"))
                return

            self._set_headers()
            self.wfile.write(json.dumps(coordinator.get_status(), ensure_ascii=False).encode("utf-8"))

        def do_POST(self):
            if self.path != "/targets":
                self._set_headers(HTTPStatus.NOT_FOUND)
                self.wfile.write(json.dumps({"ok": False, "error": "Ruta no encontrada"}).encode("utf-8"))
                return

            try:
                raw_length = self.headers.get("Content-Length", "0")
                length = int(raw_length)
                payload = json.loads(self.rfile.read(length).decode("utf-8") if length > 0 else "{}")
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
