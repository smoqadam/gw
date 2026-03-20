import argparse
import datetime as dt
import json
import os
import random
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from elevenlabs import VoiceSettings
from elevenlabs.client import ElevenLabs
from openai import OpenAI


LESSONS_DIR = Path("lessons")
ARCHIVE_DIR = LESSONS_DIR / "archive"
LATEST_JSON_PATH = LESSONS_DIR / "latest.json"
LATEST_AUDIO_PATH = LESSONS_DIR / "latest.mp3"
RANDOM_CATEGORIES = [
    "history",
    "science",
    "technology",
    "culture",
    "society",
    "health",
    "travel",
    "work",
    "biography",
    "environment",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate German learning lessons (text + vocab + voice)."
    )
    parser.add_argument(
        "--level",
        required=True,
        help="Language level like A2, B1, B2, C1",
    )
    parser.add_argument(
        "--tts-provider",
        choices=["elevenlabs", "openai"],
        default="elevenlabs",
        help="TTS engine provider",
    )
    parser.add_argument(
        "--voice-id",
        default=None,
        help="Optional TTS voice id. Uses provider-specific env default if omitted.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate text + vocab JSON without creating audio",
    )
    return parser.parse_args()


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    return text


def generate_lesson_with_openai(level: str, category: str) -> dict[str, Any]:
    api_key = require_env("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL") or "gpt-4o-mini"
    client = OpenAI(api_key=api_key)

    system_prompt = (
        "You are a German teacher. Return ONLY valid JSON with this schema: "
        '{"title": "...", "text": "...", "vocabs": [{"word": "...", "definition": "..."}]}. '
        "Rules: text must be fully in German and match exactly the requested CEFR level. "
        "The text should be informative and practical, not fictional story-only content. "
        "Text length 180-260 words. "
        "Vocabs must be useful words/phrases that appear in the text and are NOT easier than the requested level. "
        "Definitions must be concise in English. "
        "Provide 8 to 15 vocab items."
    )

    user_prompt = (
        f"Level: {level}\n"
        f"Category: {category}\n"
        "Task: Create one useful and engaging German learning text in this category. "
        "Use clear structure and meaningful ideas for language learners.\n"
    )

    completion = client.chat.completions.create(
        model=model,
        temperature=0.7,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = completion.choices[0].message.content or ""
    parsed = json.loads(strip_code_fences(content))
    validate_lesson_payload(parsed)
    return parsed


def validate_lesson_payload(data: dict[str, Any]) -> None:
    required = ["title", "text", "vocabs"]
    for key in required:
        if key not in data:
            raise RuntimeError(f"LLM response missing field: {key}")
    if not isinstance(data["vocabs"], list) or not data["vocabs"]:
        raise RuntimeError("LLM response vocabs must be a non-empty list")
    for index, item in enumerate(data["vocabs"]):
        if not isinstance(item, dict) or "word" not in item or "definition" not in item:
            raise RuntimeError(f"Invalid vocab item at position {index}")


def synthesize_with_elevenlabs(text: str, output_path: Path, voice_id: str | None) -> None:
    api_key = require_env("ELEVENLABS_API_KEY")
    client = ElevenLabs(api_key=api_key)

    if voice_id:
        resolved_voice_id = voice_id
    else:
        available_voices = client.voices.get_all().voices
        if available_voices:
            resolved_voice_id = random.choice(available_voices).voice_id
        else:
            resolved_voice_id = os.getenv("ELEVENLABS_VOICE_ID") or "EXAVITQu4vr4xnSDxMaL"

    audio_stream = client.text_to_speech.convert(
        voice_id=resolved_voice_id,
        output_format=os.getenv("ELEVENLABS_OUTPUT_FORMAT") or "mp3_44100_128",
        text=text,
        model_id=os.getenv("ELEVENLABS_MODEL_ID") or "eleven_multilingual_v2",
        voice_settings=VoiceSettings(stability=0.4, similarity_boost=0.8),
    )

    with output_path.open("wb") as handle:
        for chunk in audio_stream:
            if chunk:
                handle.write(chunk)


def synthesize_with_openai(text: str, output_path: Path, voice_id: str | None) -> None:
    api_key = require_env("OPENAI_API_KEY")
    model = os.getenv("OPENAI_TTS_MODEL") or "gpt-4o-mini-tts"
    voice = voice_id or os.getenv("OPENAI_TTS_VOICE") or "alloy"

    client = OpenAI(api_key=api_key)
    audio = client.audio.speech.create(
        model=model,
        voice=voice,
        response_format="mp3",
        input=text,
    )
    audio.write_to_file(str(output_path))


def maybe_generate_voice(text: str, path: Path, tts_provider: str, voice_id: str | None, dry_run: bool) -> str:
    if dry_run:
        return ""

    if tts_provider == "elevenlabs":
        synthesize_with_elevenlabs(text=text, output_path=path, voice_id=voice_id)
    else:
        synthesize_with_openai(text=text, output_path=path, voice_id=voice_id)
    return str(path)


def archive_existing_lessons(timestamp: str) -> None:
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    for active_path in (LATEST_JSON_PATH, LATEST_AUDIO_PATH):
        if not active_path.exists():
            continue
        target = ARCHIVE_DIR / f"{timestamp}-{active_path.name}"
        if target.exists():
            unique_suffix = dt.datetime.now(dt.timezone.utc).strftime("%H%M%S")
            target = ARCHIVE_DIR / f"{timestamp}-{unique_suffix}-{active_path.name}"
        active_path.rename(target)


def write_latest_lesson(lesson_record: dict[str, Any]) -> None:
    LATEST_JSON_PATH.write_text(
        json.dumps(lesson_record, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    load_dotenv()
    args = parse_args()
    LESSONS_DIR.mkdir(exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    now = dt.datetime.now(dt.timezone.utc)
    timestamp = now.strftime("%Y%m%d-%H%M%S")

    selected_category = random.choice(RANDOM_CATEGORIES)

    lesson = generate_lesson_with_openai(
        level=args.level,
        category=selected_category,
    )

    voice_path = LESSONS_DIR / f".tmp-{timestamp}-latest.mp3"
    saved_voice_path = maybe_generate_voice(
        text=lesson["text"],
        path=voice_path,
        tts_provider=args.tts_provider,
        voice_id=args.voice_id,
        dry_run=args.dry_run,
    )

    lesson_record = {
        "title": lesson["title"],
        "text": lesson["text"],
        "date": now.isoformat(),
        "category": selected_category,
        "vocabs": lesson["vocabs"],
        "voice_path": str(LATEST_AUDIO_PATH) if saved_voice_path else "",
    }

    archive_existing_lessons(timestamp=timestamp)
    write_latest_lesson(lesson_record)
    if saved_voice_path:
        voice_path.rename(LATEST_AUDIO_PATH)

    print(f"Category: {selected_category}")
    print(f"Saved lesson: {LATEST_JSON_PATH}")
    if saved_voice_path:
        print(f"Saved voice: {LATEST_AUDIO_PATH}")


if __name__ == "__main__":
    main()
