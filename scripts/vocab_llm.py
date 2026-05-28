"""LLM vocabulary extraction for video lessons.

Given a German transcript, pick a handful of useful vocab words at a CEFR level
and return them as [{word, definition, example}] — the same shape text lessons
produce. The transcript is reduced to a deduped candidate word list first, so the
call stays cheap regardless of video length. Imported lazily by video_lesson, so
a plain video run never loads openai.
"""

import json
import os
import re
from typing import Any

from openai import OpenAI

_WORD_RE = re.compile(r"[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]*")

# Function words / fillers that are never worth studying.
_STOPWORDS = {
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "eines",
    "und", "oder", "aber", "denn", "sondern", "doch", "sowie",
    "ich", "du", "er", "sie", "es", "wir", "ihr", "mich", "dich", "sich", "uns", "euch",
    "mir", "dir", "ihm", "ihnen", "mein", "dein", "sein", "ihre", "unser", "euer",
    "ist", "sind", "war", "waren", "bin", "bist", "seid", "wird", "werden", "wurde", "wurden",
    "hat", "habe", "hast", "haben", "hatte", "hatten", "kann", "kannst", "können", "muss", "musst",
    "nicht", "kein", "keine", "auch", "schon", "noch", "nur", "sehr", "mehr", "immer", "wieder",
    "mal", "etwa", "etwas", "alle", "alles", "man", "jede", "jeder", "jedes",
    "in", "im", "an", "am", "auf", "aus", "bei", "mit", "nach", "von", "vom", "vor", "zu", "zum",
    "zur", "über", "unter", "durch", "für", "ohne", "gegen", "um", "bis", "seit", "wegen", "zwischen",
    "ja", "nein", "wie", "was", "wer", "wo", "wann", "warum", "weil", "dass", "ob", "wenn", "als",
    "also", "dann", "hier", "dort", "da", "so", "ganz", "dynamische", "musik",
}


def _candidate_words(transcript: str, limit: int = 150) -> list[str]:
    """Deduped, filtered word list — capitalized (likely nouns) first."""
    seen: dict[str, str] = {}
    for token in _WORD_RE.findall(transcript):
        if len(token) < 4:
            continue
        low = token.lower()
        if low in _STOPWORDS:
            continue
        # Keep the first spelling, but upgrade to a capitalized form if one appears.
        if low not in seen or (token[:1].isupper() and not seen[low][:1].isupper()):
            seen[low] = token
    words = list(seen.values())
    words.sort(key=lambda w: (not w[:1].isupper(), w.lower()))
    return words[:limit]


_SYSTEM = """You are a German teacher building vocabulary flashcards from a video transcript. From the candidate words, choose the ones most worth learning for a student at the given CEFR level.

Apply a COGNATE-REJECTION TEST: if a monolingual English speaker could guess the word from its spelling in 2 seconds (international loanwords, Latin/Greek roots, transparent compounds, proper nouns), REJECT it. Prefer native, idiomatic German: separable/Germanic verbs, discourse particles, opaque nouns, idiomatic adjectives.

Return ONLY valid JSON of this shape, choosing 12 to 15 items:
{ "vocabs": [ { "word": string (base/lemma form), "definition": string (concise English), "example": string (a natural German sentence using the word) } ] }
No prose, no markdown fences."""


def extract_vocabs(transcript: str, level: str) -> list[dict[str, Any]]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required to extract vocab.")
    model = os.getenv("OPENAI_VOCAB_MODEL") or "gpt-4o-mini"
    client = OpenAI(api_key=api_key)

    candidates = _candidate_words(transcript)
    if not candidates:
        return []

    user = f"Level: {level}\nCandidate words:\n{', '.join(candidates)}"
    completion = client.chat.completions.create(
        model=model,
        temperature=0.4,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": user},
        ],
    )
    data = json.loads(completion.choices[0].message.content or "{}")
    raw = data.get("vocabs", []) if isinstance(data, dict) else []

    cleaned: list[dict[str, Any]] = []
    for v in raw:
        if not isinstance(v, dict):
            continue
        word = str(v.get("word", "")).strip()
        definition = str(v.get("definition", "")).strip()
        if not word or not definition:
            continue
        item: dict[str, Any] = {"word": word, "definition": definition}
        example = str(v.get("example", "")).strip()
        if example:
            item["example"] = example
        cleaned.append(item)
    return cleaned
