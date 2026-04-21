# tiktok_listener.py
import json
import re
import threading
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from TikTokLive import TikTokLiveClient
from TikTokLive.events import CommentEvent, ConnectEvent, DisconnectEvent, LiveEndEvent


LEAD_RULES = {
    "equipo_movil": {
        "keywords": [
            "equipo",
            "celular",
            "telefono",
            "movil",
            "iphone",
            "samsung",
            "xiaomi",
            "equipo nuevo",
            "renovar equipo",
        ],
        "score": 4,
    },
    "portabilidad": {
        "keywords": [
            "portabilidad",
            "portarme",
            "portar",
            "cambiarme",
            "traer mi numero",
            "mantener mi numero",
        ],
        "score": 4,
    },
    "plan_telefonia": {
        "keywords": [
            "plan",
            "planes",
            "prepago",
            "postpago",
            "plan movil",
            "gigas",
            "gb",
            "datos",
            "minutos",
        ],
        "score": 4,
    },
    "condicion_previa": {
        "keywords": [
            "que pasa si",
            "si tengo deuda",
            "si ya tengo plan",
            "si soy de otra compania",
            "si tengo equipo propio",
            "si aun tengo contrato",
            "si ya tengo numero",
            "si tengo dicom",
        ],
        "score": 3,
    },
}

INTENT_KEYWORDS = [
    "quiero",
    "me interesa",
    "como contrato",
    "cuanto sale",
    "precio",
    "valor",
]
NEGATIVE_KEYWORDS = [
    "jajaja",
    "saludos",
    "hola",
    "spam",
]


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower().strip())
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def classify_comment(comment_text: str) -> Dict[str, object]:
    normalized = normalize_text(comment_text)
    categories: List[str] = []
    reasons: List[str] = []
    score = 0

    for category, rule in LEAD_RULES.items():
        matched_keyword = next(
            (keyword for keyword in rule["keywords"] if keyword in normalized),
            None,
        )
        if matched_keyword:
            categories.append(category)
            reasons.append(f"{category}:{matched_keyword}")
            score += int(rule["score"])

    matched_intent = next((keyword for keyword in INTENT_KEYWORDS if keyword in normalized), None)
    if matched_intent:
        reasons.append(f"intencion:{matched_intent}")
        score += 2

    matched_negative = next((keyword for keyword in NEGATIVE_KEYWORDS if keyword in normalized), None)
    if matched_negative and score == 0:
        reasons.append(f"ruido:{matched_negative}")
        score -= 2

    return {
        "normalized_text": normalized,
        "categories": categories,
        "reasons": reasons,
        "score": score,
        "is_lead": score >= 4,
    }


@dataclass
class LeadCandidate:
    author_unique_id: str
    latest_nickname: str
    first_seen_at: str
    last_seen_at: str
    message_count: int = 0
    lead_score: int = 0
    matched_categories: List[str] = field(default_factory=list)
    reasons: List[str] = field(default_factory=list)
    sample_messages: List[str] = field(default_factory=list)
    status: str = "new"

    def to_dict(self) -> Dict[str, object]:
        return {
            "author_unique_id": self.author_unique_id,
            "latest_nickname": self.latest_nickname,
            "first_seen_at": self.first_seen_at,
            "last_seen_at": self.last_seen_at,
            "message_count": self.message_count,
            "lead_score": self.lead_score,
            "matched_categories": self.matched_categories,
            "reasons": self.reasons,
            "sample_messages": self.sample_messages,
            "status": self.status,
        }


class LeadStore:
    def __init__(self, output_dir: str, streamer_unique_id: str, session_id: str):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.streamer_unique_id = streamer_unique_id
        self.session_id = session_id
        self.output_path = self.output_dir / f"{streamer_unique_id}_{session_id}_leads.json"
        self._lock = threading.Lock()
        self._leads: Dict[str, LeadCandidate] = {}

    def update(self, record: Dict[str, object]) -> None:
        author_unique_id = str(record["author_unique_id"])
        now = str(record["timestamp"])

        with self._lock:
            lead = self._leads.get(author_unique_id)
            if lead is None:
                lead = LeadCandidate(
                    author_unique_id=author_unique_id,
                    latest_nickname=str(record["author_nickname"]),
                    first_seen_at=now,
                    last_seen_at=now,
                )
                self._leads[author_unique_id] = lead

            lead.latest_nickname = str(record["author_nickname"])
            lead.last_seen_at = now
            lead.message_count += 1
            lead.lead_score += int(record["lead_score"])

            for category in record["lead_categories"]:
                if category not in lead.matched_categories:
                    lead.matched_categories.append(category)

            for reason in record["lead_reasons"]:
                if reason not in lead.reasons:
                    lead.reasons.append(reason)

            if record["comment_text"] not in lead.sample_messages and len(lead.sample_messages) < 5:
                lead.sample_messages.append(str(record["comment_text"]))

            self._persist()

    def _persist(self) -> None:
        payload = {
            "streamer_unique_id": self.streamer_unique_id,
            "session_id": self.session_id,
            "updated_at": datetime.now().isoformat(),
            "leads": [lead.to_dict() for lead in self._sorted_leads()],
        }
        self.output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _sorted_leads(self) -> List[LeadCandidate]:
        return sorted(
            self._leads.values(),
            key=lambda item: (item.lead_score, item.message_count),
            reverse=True,
        )

    def export_summary(self) -> Dict[str, object]:
        with self._lock:
            return {
                "streamer_unique_id": self.streamer_unique_id,
                "session_id": self.session_id,
                "leads": [lead.to_dict() for lead in self._sorted_leads()],
            }


class TikTokCommentRecorder:
    def __init__(
        self,
        unique_id: str,
        output_paths_getter,
        message_callback: Optional[Callable[[Dict[str, object]], None]] = None,
        session_start_callback: Optional[Callable[[str], None]] = None,
        session_end_callback: Optional[Callable[[], None]] = None,
    ):
        self.client = TikTokLiveClient(unique_id=unique_id)
        self.output_paths_getter = output_paths_getter
        self.message_callback = message_callback
        self.session_start_callback = session_start_callback
        self.session_end_callback = session_end_callback
        self.session_id = uuid4().hex
        self.lead_store = LeadStore("leads", unique_id, self.session_id)
        self._session_closed = False
        self._session_started = False
        self._session_closed_lock = threading.Lock()
        self._register_events()

    def _register_events(self):
        @self.client.on(ConnectEvent)
        async def on_connect(event: ConnectEvent):
            print(f"Conectado a @{event.unique_id} | session_id={self.session_id}")
            self._start_session()

        @self.client.on(CommentEvent)
        async def on_comment(event: CommentEvent):
            record = self.build_record(event)
            output_paths = self.output_paths_getter()

            with open(output_paths["txt"], "a", encoding="utf-8") as handle:
                handle.write(self.format_comment(record) + "\n")

            if record["lead_score"] > 0:
                self.lead_store.update(record)

            if self.message_callback is not None:
                self.message_callback(record)

            print(
                f"{record['timestamp']} | @{record['author_unique_id']} "
                f"({record['author_nickname']}): {record['comment_text']} | "
                f"score={record['lead_score']} | "
                f"categorias={','.join(record['lead_categories']) or 'ninguna'}"
            )
            if record["is_lead"]:
                print(
                    f"Lead detectado en @{self.client.unique_id}: "
                    f"{record['author_unique_id']} ({record['author_nickname']})"
                )

        @self.client.on(DisconnectEvent)
        async def on_disconnect(event: DisconnectEvent):
            print(f"Desconectado del LIVE @{self.client.unique_id}")
            self._finalize_session()

        @self.client.on(LiveEndEvent)
        async def on_live_end(event: LiveEndEvent):
            print(f"El LIVE de @{self.client.unique_id} terminó")
            self._finalize_session()

    def _finalize_session(self) -> None:
        with self._session_closed_lock:
            if self._session_closed:
                return
            self._session_closed = True

        if self.session_end_callback is not None:
            self.session_end_callback()

    def _start_session(self) -> None:
        with self._session_closed_lock:
            if self._session_started:
                return
            self._session_started = True

        if self.session_start_callback is not None:
            self.session_start_callback(self.session_id)
    @staticmethod
    def _coerce_mapping(value: object) -> Dict[str, object]:
        if isinstance(value, dict):
            return value

        to_pydict = getattr(value, "to_pydict", None)
        if callable(to_pydict):
            try:
                raw = to_pydict()
                if isinstance(raw, dict):
                    return raw
            except TypeError:
                # Some betterproto versions expose a narrower signature.
                pass
            except Exception:
                return {}

        return {}

    @classmethod
    def _find_first_value(cls, value: object, keys: tuple[str, ...]) -> Optional[str]:
        if isinstance(value, dict):
            for key in keys:
                current = value.get(key)
                if current not in (None, "", "None"):
                    return str(current).strip()

            for nested in value.values():
                match = cls._find_first_value(nested, keys)
                if match:
                    return match

        if isinstance(value, list):
            for item in value:
                match = cls._find_first_value(item, keys)
                if match:
                    return match

        return None

    def _extract_author_fields(self, event: CommentEvent) -> tuple[str, str]:
        # Avoid `event.user`: recent TikTokLive payloads can include `nickName`,
        # which breaks the library's ExtendedUser constructor on some versions.
        user_info = getattr(event, "user_info", None)
        user_data = self._coerce_mapping(user_info)

        if not user_data:
            event_data = self._coerce_mapping(event)
            nested_user = event_data.get("user_info")
            if isinstance(nested_user, dict):
                user_data = nested_user

        author_unique_id = self._find_first_value(
            user_data,
            (
                "unique_id",
                "uniqueId",
                "username",
                "display_id",
                "displayId",
                "sec_uid",
                "secUid",
            ),
        ) or "unknown"
        author_nickname = self._find_first_value(
            user_data,
            (
                "nickname",
                "nick_name",
                "nickName",
                "display_name",
                "displayName",
            ),
        ) or author_unique_id

        if not author_unique_id or author_unique_id == "None":
            author_unique_id = "unknown"
        if not author_nickname or author_nickname == "None":
            author_nickname = author_unique_id

        return author_unique_id, author_nickname

    def build_record(self, event: CommentEvent) -> Dict[str, object]:
        timestamp = datetime.now().isoformat()
        author_unique_id, author_nickname = self._extract_author_fields(event)
        classification = classify_comment(event.comment)

        return {
            "timestamp": timestamp,
            "session_id": self.session_id,
            "streamer_unique_id": self.client.unique_id,
            "author_unique_id": author_unique_id,
            "author_nickname": author_nickname,
            "comment_text": event.comment,
            "comment_normalized": classification["normalized_text"],
            "lead_categories": classification["categories"],
            "lead_reasons": classification["reasons"],
            "lead_score": classification["score"],
            "is_lead": classification["is_lead"],
        }

    @staticmethod
    def format_comment(record: Dict[str, object]) -> str:
        return "\n".join(
            [
                f"Nombre de usuario: {record['author_nickname']}",
                f"Alias de TikTok: @{record['author_unique_id']}",
                f"Timestamp: {record['timestamp']}",
                f"Mensaje: {record['comment_text']}",
                "-" * 60,
            ]
        )

    def run(self):
        self.client.run()


if __name__ == "__main__":
    from main import main

    main()
