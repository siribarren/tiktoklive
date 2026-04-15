# main.py
import atexit
import json
import os
import queue
import threading
import time
from datetime import datetime
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

LOGS_DIR = Path("logs")
LEADS_DIR = Path("leads")
LOGS_DIR.mkdir(exist_ok=True)
LEADS_DIR.mkdir(exist_ok=True)


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


def run_target(target: Dict[str, str], display: Optional[Display] = None) -> None:
    unique_id = str(target["unique_id"]).lstrip("@")
    rotator = StreamFileRotator(unique_id)
    atexit.register(rotator.upload_current)

    recorder = TikTokCommentRecorder(
        unique_id=unique_id,
        output_paths_getter=rotator.get_current_paths,
        message_callback=display.enqueue if display else None,
        session_end_callback=rotator.upload_current,
    )
    recorder.run()


def main():
    targets = load_targets()
    print(f"Escuchando {len(targets)} cuenta(s): {', '.join(t['unique_id'] for t in targets)}")

    display = None
    if tk is not None:
        try:
            display = ChatDisplay()
        except tk.TclError as exc:
            print(f"No se pudo abrir la ventana de chat: {exc}")
    if display is None:
        display = ConsoleChatDisplay()

    threads = []
    for target in targets:
        thread = threading.Thread(target=run_target, args=(target, display), daemon=True)
        thread.start()
        threads.append(thread)

    display.run()


if __name__ == "__main__":
    main()
