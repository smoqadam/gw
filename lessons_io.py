"""Lesson storage: one JSON file per lesson plus a lightweight index.

Every lesson is `lessons/<id>.json` (text lessons also get `lessons/<id>.mp3`).
`lessons/index.json` lists all lessons newest-first with just the metadata the
frontend needs to render a browse drawer and pick a default lesson.

Used by both the text generator (text_lesson.py) and the video lesson builder
(video_lesson.py) so the storage layout lives in one place.
"""

import datetime as dt
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

LESSONS_DIR = Path("lessons")
INDEX_PATH = LESSONS_DIR / "index.json"

_UMLAUTS = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}


def slugify(text: str) -> str:
    text = "".join(_UMLAUTS.get(c, c) for c in (text or "").lower())
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:60].strip("-") or "lektion"


def make_lesson_id(date_iso: str, title: str, taken: set[str]) -> str:
    try:
        day = dt.datetime.fromisoformat(date_iso).strftime("%Y-%m-%d")
    except ValueError:
        day = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    base = f"{day}-{slugify(title)}"
    candidate, n = base, 2
    while candidate in taken:
        candidate, n = f"{base}-{n}", n + 1
    return candidate


def read_index() -> list[dict[str, Any]]:
    if not INDEX_PATH.exists():
        return []
    return json.loads(INDEX_PATH.read_text(encoding="utf-8"))


def _write_index(index: list[dict[str, Any]]) -> None:
    index.sort(key=lambda e: e.get("date", ""), reverse=True)
    INDEX_PATH.write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def save_lesson(record: dict[str, Any], audio_tmp_path: Path | None = None) -> str:
    """Assign an id, write `lessons/<id>.json` (+ `<id>.mp3` if audio is given),
    and upsert the lesson into `lessons/index.json`. Returns the lesson id.

    `record` must contain at least `type`, `title`, and `date`.
    """
    LESSONS_DIR.mkdir(exist_ok=True)

    index = read_index()
    taken = {p.stem for p in LESSONS_DIR.glob("*.json") if p.name != INDEX_PATH.name}
    taken |= {e["id"] for e in index}
    lesson_id = make_lesson_id(record["date"], record["title"], taken)
    record["id"] = lesson_id

    if audio_tmp_path is not None:
        audio_dest = LESSONS_DIR / f"{lesson_id}.mp3"
        Path(audio_tmp_path).rename(audio_dest)
        record["voice_path"] = str(audio_dest)

    (LESSONS_DIR / f"{lesson_id}.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    entry: dict[str, Any] = {
        "id": lesson_id,
        "type": record["type"],
        "title": record["title"],
        "date": record["date"],
    }
    if record.get("level"):
        entry["level"] = record["level"]
    if record.get("video_id"):
        entry["video_id"] = record["video_id"]

    index = [e for e in index if e.get("id") != lesson_id]
    index.append(entry)
    _write_index(index)

    return lesson_id
