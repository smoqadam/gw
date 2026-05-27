"""Video lesson pipeline: turn a YouTube URL into a timed, clickable German
transcript lesson. Entry point: run().

Subtitles are captions-first: the video's own German captions (manual preferred,
then auto-generated) via yt-dlp; if none exist, a local yapsnap transcription with
the German Kroko model. The result is written as a `type: "video"` lesson.

Imported lazily by germanweekly.py only on the --youtube path, so a text run never
loads any of this.
"""

import datetime as dt
import html
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from lessons_io import save_lesson

# ---------------------------------------------------------------------------
# Pure parsers (unit-tested in test_video_lesson.py)
# ---------------------------------------------------------------------------

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_TS_RE = re.compile(r"(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}|\d{1,2}:\d{2}:\d{2})")
_INLINE_TAG_RE = re.compile(r"<[^>]+>")
_YAPSNAP_LINE_RE = re.compile(r"^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$")


def extract_video_id(url: str) -> str:
    """Return the 11-char YouTube video id from any common URL form."""
    from urllib.parse import parse_qs, urlparse

    parsed = urlparse(url)
    host = parsed.netloc.lower()

    if "youtu.be" in host:
        candidate = parsed.path.lstrip("/").split("/")[0]
    elif "youtube" in host:
        if parsed.path == "/watch":
            candidate = parse_qs(parsed.query).get("v", [""])[0]
        else:
            # /shorts/<id>, /embed/<id>, /v/<id>
            parts = [p for p in parsed.path.split("/") if p]
            candidate = parts[-1] if parts else ""
    else:
        candidate = ""

    if not _VIDEO_ID_RE.match(candidate):
        raise ValueError(f"Could not extract a YouTube video id from: {url}")
    return candidate


def _seconds(ts: str) -> float:
    """Convert 'HH:MM:SS.mmm' / 'MM:SS.mmm' / 'MM:SS' to seconds."""
    total = 0.0
    for part in ts.replace(",", ".").split(":"):
        total = total * 60 + float(part)
    return total


def _clean_line(line: str) -> str:
    """Strip inline VTT tags, decode HTML entities, collapse whitespace."""
    line = _INLINE_TAG_RE.sub("", line)
    line = html.unescape(line)
    return re.sub(r"\s+", " ", line).strip()


def parse_vtt(vtt_text: str) -> list[dict[str, Any]]:
    """Parse WebVTT into [{start, end, text}], de-duping YouTube's rolling
    auto-caption lines (each cue repeats the previous fully-revealed line)."""
    flat: list[dict[str, Any]] = []
    for block in re.split(r"\n[ \t]*\n", vtt_text.strip()):
        lines = block.splitlines()
        timing_idx = next((i for i, ln in enumerate(lines) if "-->" in ln), None)
        if timing_idx is None:
            continue
        bounds = _TS_RE.findall(lines[timing_idx])
        if len(bounds) < 2:
            continue
        start, end = _seconds(bounds[0]), _seconds(bounds[1])
        for raw in lines[timing_idx + 1:]:
            text = _clean_line(raw)
            if text:
                flat.append({"start": start, "end": end, "text": text})

    segments: list[dict[str, Any]] = []
    for seg in flat:
        if segments and segments[-1]["text"] == seg["text"]:
            continue  # consecutive duplicate from rolling captions
        segments.append(seg)
    return segments


def parse_yapsnap_timestamps(text: str) -> list[dict[str, Any]]:
    """Parse yapsnap `[MM:SS] sentence.` lines into [{start, text}]."""
    segments: list[dict[str, Any]] = []
    for line in text.splitlines():
        match = _YAPSNAP_LINE_RE.match(line.strip())
        if not match:
            continue
        body = match.group(2).strip()
        if body:
            segments.append({"start": _seconds(match.group(1)), "text": body})
    return segments


# ---------------------------------------------------------------------------
# yt-dlp / yapsnap orchestration
# ---------------------------------------------------------------------------


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def fetch_metadata(url: str) -> str:
    """Return the video title via yt-dlp (id comes from the URL)."""
    result = _run(["yt-dlp", "--quiet", "--no-warnings", "--skip-download",
                   "--print", "%(title)s", url])
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp metadata failed: {result.stderr.strip()}")
    return result.stdout.strip() or "YouTube-Video"


def fetch_captions(url: str, video_id: str, workdir: Path) -> list[dict[str, Any]] | None:
    """Download German captions (manual first, then auto) as VTT and parse them.
    Returns parsed segments, or None if the video has no German captions."""
    for auto_flag in ("--write-subs", "--write-auto-subs"):
        for existing in workdir.glob("*.vtt"):
            existing.unlink()
        result = _run([
            "yt-dlp", "--quiet", "--no-warnings", "--skip-download",
            auto_flag, "--sub-langs", "de.*", "--convert-subs", "vtt",
            "-o", str(workdir / "%(id)s.%(ext)s"), url,
        ])
        vtts = sorted(workdir.glob(f"{video_id}*.vtt"))
        if result.returncode == 0 and vtts:
            segments = parse_vtt(vtts[0].read_text(encoding="utf-8"))
            if segments:
                return segments
    return None


def transcribe_with_yapsnap(url: str, workdir: Path) -> list[dict[str, Any]]:
    """Fall back to a local yapsnap transcription with the German Kroko model."""
    model = os.getenv("KROKO_MODEL")
    if not model:
        raise RuntimeError(
            "No German captions found and KROKO_MODEL is not set, so yapsnap "
            "cannot transcribe. Point KROKO_MODEL at the German Kroko model dir."
        )
    out_path = workdir / "transcript.txt"
    result = _run(["yapsnap", url, "--timestamps", "--model", model,
                   "-o", str(out_path)])
    if result.returncode != 0 or not out_path.exists():
        raise RuntimeError(f"yapsnap transcription failed: {result.stderr.strip()}")
    segments = parse_yapsnap_timestamps(out_path.read_text(encoding="utf-8"))
    if not segments:
        raise RuntimeError("yapsnap produced no timed segments.")
    return segments


def run(youtube_url: str, level: str) -> None:
    video_id = extract_video_id(youtube_url)
    title = fetch_metadata(youtube_url)

    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        segments = fetch_captions(youtube_url, video_id, workdir)
        if segments is not None:
            transcript_source = "captions"
        else:
            print("No German captions found — transcribing locally with yapsnap.")
            segments = transcribe_with_yapsnap(youtube_url, workdir)
            transcript_source = "yapsnap"

    now = dt.datetime.now(dt.timezone.utc)
    lesson_record = {
        "type": "video",
        "title": title,
        "video_id": video_id,
        "url": youtube_url,
        "date": now.isoformat(),
        "level": "",
        "source": {"type": "youtube", "url": youtube_url},
        "transcript_source": transcript_source,
        "segments": segments,
    }

    lesson_id = save_lesson(lesson_record)

    print(f"Saved video lesson: lessons/{lesson_id}.json")
    print(f"  source: {transcript_source} · {len(segments)} segments")
