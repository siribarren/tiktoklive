import json
import os
from collections import defaultdict
from datetime import datetime
from pathlib import Path


def load_env(dotenv_path: str = ".env") -> None:
    env_path = Path(dotenv_path)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def parse_message_blocks(text: str):
    for block in text.split("-" * 60):
        cleaned_block = block.strip()
        if not cleaned_block:
            continue

        record = {}
        for line in cleaned_block.splitlines():
            if ": " not in line:
                continue
            key, value = line.split(": ", 1)
            key = key.strip()
            value = value.strip()
            if key == "Nombre de usuario":
                record["nombre_de_usuario"] = value
            elif key == "Alias de TikTok":
                record["alias_de_tiktok"] = value
            elif key == "Timestamp":
                record["timestamp"] = value
            elif key == "Mensaje":
                record["mensaje"] = value

        if {"nombre_de_usuario", "alias_de_tiktok", "timestamp", "mensaje"} <= record.keys():
            yield record


def sort_key(message):
    timestamp = message.get("timestamp", "")
    try:
        return datetime.fromisoformat(timestamp)
    except ValueError:
        return datetime.min


def build_payload(streamer_unique_id: str):
    streamer_key = streamer_unique_id.lstrip("@")
    log_paths = sorted(Path("logs").glob(f"{streamer_key}_*.txt"))

    grouped_messages = defaultdict(list)
    latest_display_name = {}
    total_messages = 0

    for path in log_paths:
        for message in parse_message_blocks(path.read_text(encoding="utf-8")):
            message["source_file"] = path.name
            alias = message["alias_de_tiktok"]
            grouped_messages[alias].append(message)
            latest_display_name[alias] = message["nombre_de_usuario"]
            total_messages += 1

    users = []
    for alias in sorted(grouped_messages):
        ordered_messages = sorted(grouped_messages[alias], key=sort_key)
        users.append(
            {
                "alias_de_tiktok": alias,
                "nombre_de_usuario": latest_display_name[alias],
                "total_messages": len(ordered_messages),
                "first_message_at": ordered_messages[0]["timestamp"],
                "last_message_at": ordered_messages[-1]["timestamp"],
                "messages": ordered_messages,
            }
        )

    return {
        "streamer_unique_id": f"@{streamer_key}",
        "generated_at": datetime.now().isoformat(),
        "source_files": [path.name for path in log_paths],
        "total_users": len(users),
        "total_messages": total_messages,
        "users": users,
    }


def main():
    load_env()
    streamer_unique_id = os.getenv("TIKTOK_UNIQUE_ID", "").strip()
    if not streamer_unique_id:
        raise ValueError("No hay TIKTOK_UNIQUE_ID configurado en .env")

    payload = build_payload(streamer_unique_id)
    output_path = Path("logs") / f"{streamer_unique_id.lstrip('@')}_mensajes.json"
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(output_path)


if __name__ == "__main__":
    main()
