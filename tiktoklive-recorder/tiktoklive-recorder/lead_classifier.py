from __future__ import annotations

import re
import unicodedata
from typing import Dict, List

from lead_rules import INTENT_KEYWORDS, LEAD_RULES, NEGATIVE_KEYWORDS


def normalize_text(text: str) -> str:
    normalized_text = unicodedata.normalize("NFKD", text.lower().strip())
    normalized_text = "".join(char for char in normalized_text if not unicodedata.combining(char))
    normalized_text = re.sub(r"[^\w\s]", " ", normalized_text)
    normalized_text = re.sub(r"\s+", " ", normalized_text).strip()
    return normalized_text


def normalize_message_for_scoring(text: str) -> str:
    normalized = normalize_text(text)
    return " ".join(normalized.split())


def classify_comment(comment_text: str) -> Dict[str, object]:
    """Rule-based classifier. Prepared to layer model signals later."""

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
