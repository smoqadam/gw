"""Text lesson pipeline: LLM-generated or URL-refined German text + vocab/phrases/
quiz + TTS audio. Entry point: run().

Imported lazily by germanweekly.py only on the text path, so a --youtube run never
loads openai/elevenlabs.
"""

import datetime as dt
import json
import os
import random
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from elevenlabs import VoiceSettings
from elevenlabs.client import ElevenLabs
from openai import OpenAI

from lessons_io import LESSONS_DIR, save_lesson

LEVEL_WORD_TARGETS = {
    "A1": 200,
    "A2": 250,
    "B1": 400,
    "B2": 550,
    "C1": 700,
    "C2": 800,
}

MAX_SOURCE_CHARS = 12000

USER_AGENT = "germanweekly/1.0 (+https://germanweekly.com)"


SYSTEM_PROMPT = """You are a careful German teacher writing one issue of a weekly German learning newsletter. Return ONLY valid JSON matching this schema:

{
  "title": string (in German),
  "text":  string (in German, the lesson body),
  "vocabs":  [ { "word": string, "definition": string (English), "example": string (a sentence taken from `text`) }, ... ],
  "phrases": [ { "phrase": string, "translation": string (English), "example": string (a sentence taken from `text`) }, ... ],
  "quiz":    [ { "type": "mcq" | "cloze", ... }, ... ]
}

Quiz item shape:
  mcq:   { "type": "mcq",   "q": string, "options": [string, string, string, string], "answer": 0|1|2|3, "why": string }
  cloze: { "type": "cloze", "sentence": string with one "___" blank, "answer": string, "why": string }

HARD RULES — Text:
- Fully in German, matching exactly the requested CEFR level.
- Length target by level (±15%): A1 200, A2 250, B1 400, B2 550, C1 700, C2 800 words.
- Must include at least three concrete specifics: real names, years, numbers, places, organizations, or quoted facts.
- FORBIDDEN openings and filler phrases: "X ist ein wichtiges Thema in der heutigen Gesellschaft", "In der heutigen Welt …", "Jeder kann einen Beitrag leisten", "Letztendlich ist es wichtig …", "Zusammen können wir große Veränderungen erreichen". Start with the concrete subject, not a thesis statement.
- No moralizing, no generic essay structure. Write like a curious journalist, not a school assignment.
- Do not invent facts. If you don't know specifics about the requested topic, narrow the topic to something concrete you do know, and write about that.

HARD RULES — Vocabs (8 to 15 items):
- COGNATE REJECTION TEST: For each candidate word, ask: "Could a monolingual English speaker guess the meaning within 2 seconds from the spelling alone?" If yes, REJECT it. Apply this test BEFORE picking any vocab.
- Concrete rejection categories (these are examples — the principle is broader):
  - International loanwords: Recycling, Information, Politik, Internet, Konzept, Sektor, Manager, Projekt, Energie, Industrie, System, Idee, Demokratie, Trainer, Coach, Star, Team, Match, Sport, Fan, Saison, Liga, Fußball, Mannschaft.
  - Latin/Greek roots transparent to English: Ressource, Kategorie, Position, Funktion, Struktur, Akademie, Universität, Diskussion, Moment, Aktion, Reaktion, Situation.
  - Transparent compounds where both parts are obvious to English: Klimawandel, Umweltschutz, Naturschutzgebiete, Hauptbahnhof, Supermarkt, Spielplatz, Fußballverein.
  - Proper nouns, brand names, and place names.
  - Words where the German and English forms differ by ≤3 letters (excluding inflectional endings).
- PREFER native and idiomatic German:
  - Germanic verbs and separable verbs: durchsetzen, vorhaben, bewältigen, auffallen, entstehen, gelingen, sich bewähren, einrichten, ausweichen, beibringen, anfechten, verlegen, abklären.
  - Verbs with prepositional rection: sich kümmern um, hinweisen auf, bestehen aus, sich beziehen auf, achten auf, zählen zu, hinauslaufen auf.
  - Discourse particles and connectors: allerdings, jedoch, sofern, kaum, zwar … aber, demnach, zugleich, anhand, ohnehin, immerhin, freilich.
  - Opaque compounds and idiomatic nouns: Feierabend, Sorgerecht, Maßstab, Ausweis, Antrag, Bescheid, Pfand, Anlass, Zugang, Anhieb, Beifall, Niederlage, Schiedsrichter.
  - Idiomatic adjectives/adverbs: unentbehrlich, ausgerechnet, geradezu, einleuchtend, anspruchsvoll, dürftig, zumindest, schlichtweg.
- Each vocab MUST appear in `text`. The `example` MUST be an actual sentence taken verbatim from `text` that contains the vocab word.

HARD RULES — Phrases (4 to 8 items):
- A phrase MUST contain at least two whitespace-separated tokens. A single inflected verb (e.g. "feststand", "ankommen") is NOT a phrase — that belongs in vocabs.
- Multi-word collocations, idioms, or fixed expressions only.
- Examples of the kind to pick: "es kommt darauf an", "auf Anhieb", "Bock haben auf", "zur Sprache bringen", "in Frage kommen", "im Gegenteil", "ums Leben kommen", "mit Abstand", "auf eigene Faust", "von Grund auf", "zum dritten Mal in Folge", "Schritt für Schritt".
- Each phrase MUST appear in `text` and ship with an example sentence taken verbatim from `text`.

HARD RULES — Quiz (4 to 6 items):
- EVERY quiz item MUST test vocabulary, idiomatic phrasing, or grammar from the text.
- FORBIDDEN: fact-recall questions ("Wer gewann?", "Wann begann?", "Wie viele …?", "Wo befindet sich …?"). These test memory of the article's content, not German language ability. Reject them.
- GOOD quiz examples:
  - Cloze testing prepositional rection: "Er weist ___ den Fehler hin." → "auf"
  - Cloze testing case after a preposition: "Wir gehen ___ den Park." → "in" (with Akkusativ)
  - Cloze testing Perfekt auxiliary: "Sie ___ gestern angekommen." → "ist"
  - MCQ testing vocab synonym: "Welches Wort bedeutet dasselbe wie 'bewältigen'?" with four options.
  - MCQ testing phrase meaning: "Was bedeutet 'es kommt darauf an'?" with four options.
- Mix `mcq` and `cloze` types.
- For `cloze`, the blank is exactly "___" (three underscores). The `answer` is the single missing token or short phrase.
- `why` explains the correct answer concisely in English (one short sentence).

OUTPUT: Return only the JSON object. No prose, no markdown fences.
"""


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


def fetch_source_text(url: str) -> str:
    try:
        import trafilatura
    except ImportError as exc:
        raise RuntimeError(
            "trafilatura is required for URL sources. Install with `pip install trafilatura`."
        ) from exc

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            html = response.read().decode(charset, errors="replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Failed to fetch URL ({exc.code} {exc.reason}): {url}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Failed to fetch URL ({exc.reason}): {url}") from exc

    extracted = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=False,
        favor_recall=True,
    )
    if not extracted:
        raise RuntimeError(f"Could not extract main text from URL: {url}")
    extracted = extracted.strip()
    if len(extracted) > MAX_SOURCE_CHARS:
        extracted = extracted[:MAX_SOURCE_CHARS] + "\n\n[truncated]"
    return extracted


def build_user_prompt_ai(level: str, topic: str) -> str:
    target = LEVEL_WORD_TARGETS[level]
    return (
        f"Level: {level} (target ~{target} words)\n"
        f"Topic: {topic}\n\n"
        "Write a fresh, specific lesson on this topic. Choose a concrete angle (a case, a year, a person, a real process) — "
        "do not write a survey or a generic essay. If you don't know reliable specifics for this exact topic, narrow it to "
        "an adjacent topic you do know, and write about that instead. Make the text engaging for an adult learner who already "
        "understands basic German."
    )


def build_user_prompt_url(
    level: str,
    source_url: str,
    source_text: str,
    topic_hint: str | None,
) -> str:
    target = LEVEL_WORD_TARGETS[level]
    parts = [
        f"Level: {level} (target ~{target} words)",
        f"Source URL: {source_url}",
    ]
    if topic_hint:
        parts.append(f"Steering hint (focus on this angle): {topic_hint}")
    parts += [
        "",
        "Rewrite the source content faithfully at the target CEFR level. Preserve real facts, names, dates, and the structure "
        "of the source; simplify vocabulary and syntax to match the level. Trim to the length target. Do NOT invent facts that "
        "are not in the source.",
        "",
        "--- SOURCE TEXT START ---",
        source_text,
        "--- SOURCE TEXT END ---",
    ]
    return "\n".join(parts)


def validate_lesson_payload(data: Any) -> None:
    if not isinstance(data, dict):
        raise RuntimeError("LLM response must be a JSON object")
    for key in ("title", "text", "vocabs", "phrases", "quiz"):
        if key not in data:
            raise RuntimeError(f"LLM response missing field: {key}")
    if not isinstance(data["title"], str) or not data["title"].strip():
        raise RuntimeError("title must be a non-empty string")
    if not isinstance(data["text"], str) or not data["text"].strip():
        raise RuntimeError("text must be a non-empty string")

    vocabs = data["vocabs"]
    if not isinstance(vocabs, list) or not (8 <= len(vocabs) <= 15):
        raise RuntimeError(f"vocabs must be a list of 8 to 15 items (got {len(vocabs) if isinstance(vocabs, list) else type(vocabs).__name__})")
    for i, v in enumerate(vocabs):
        if not isinstance(v, dict):
            raise RuntimeError(f"vocabs[{i}] must be an object")
        for k in ("word", "definition", "example"):
            if not isinstance(v.get(k), str) or not v[k].strip():
                raise RuntimeError(f"vocabs[{i}] missing/invalid field {k!r}")

    phrases = data["phrases"]
    if not isinstance(phrases, list) or not (4 <= len(phrases) <= 8):
        raise RuntimeError(f"phrases must be a list of 4 to 8 items (got {len(phrases) if isinstance(phrases, list) else type(phrases).__name__})")
    for i, p in enumerate(phrases):
        if not isinstance(p, dict):
            raise RuntimeError(f"phrases[{i}] must be an object")
        for k in ("phrase", "translation", "example"):
            if not isinstance(p.get(k), str) or not p[k].strip():
                raise RuntimeError(f"phrases[{i}] missing/invalid field {k!r}")

    quiz = data["quiz"]
    if not isinstance(quiz, list) or not (4 <= len(quiz) <= 6):
        raise RuntimeError(f"quiz must be a list of 4 to 6 items (got {len(quiz) if isinstance(quiz, list) else type(quiz).__name__})")
    for i, q in enumerate(quiz):
        if not isinstance(q, dict) or q.get("type") not in ("mcq", "cloze"):
            raise RuntimeError(f"quiz[{i}] type must be 'mcq' or 'cloze'")
        if not isinstance(q.get("why"), str) or not q["why"].strip():
            raise RuntimeError(f"quiz[{i}] missing why")
        if q["type"] == "mcq":
            if not isinstance(q.get("q"), str) or not q["q"].strip():
                raise RuntimeError(f"quiz[{i}] mcq missing question")
            opts = q.get("options")
            if not isinstance(opts, list) or len(opts) < 2 or not all(isinstance(o, str) and o.strip() for o in opts):
                raise RuntimeError(f"quiz[{i}] mcq invalid options")
            if not isinstance(q.get("answer"), int) or not (0 <= q["answer"] < len(opts)):
                raise RuntimeError(f"quiz[{i}] mcq invalid answer index")
        else:
            sentence = q.get("sentence")
            if not isinstance(sentence, str) or "___" not in sentence:
                raise RuntimeError(f"quiz[{i}] cloze sentence must contain '___'")
            if not isinstance(q.get("answer"), str) or not q["answer"].strip():
                raise RuntimeError(f"quiz[{i}] cloze missing answer")


def generate_lesson(level: str, topic: str | None, source_url: str | None) -> dict[str, Any]:
    api_key = require_env("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL") or "gpt-4o"
    client = OpenAI(api_key=api_key)

    if source_url:
        source_text = fetch_source_text(source_url)
        user_prompt = build_user_prompt_url(level, source_url, source_text, topic)
    else:
        if not topic:
            raise RuntimeError("--topic is required when --source is not provided.")
        user_prompt = build_user_prompt_ai(level, topic)

    completion = client.chat.completions.create(
        model=model,
        temperature=0.6,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = completion.choices[0].message.content or ""
    parsed = json.loads(strip_code_fences(content))
    validate_lesson_payload(parsed)
    return parsed


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


def maybe_generate_voice(text: str, path: Path, voice_id: str | None, skip: bool) -> str:
    if skip:
        return ""

    try:
        synthesize_with_elevenlabs(text=text, output_path=path, voice_id=voice_id)
        print("TTS provider: elevenlabs")
    except Exception as exc:
        print(f"ElevenLabs failed, falling back to OpenAI TTS: {exc}")
        synthesize_with_openai(text=text, output_path=path, voice_id=voice_id)
        print("TTS provider: openai")

    return str(path)


def run(
    level: str,
    topic: str | None,
    source_url: str | None,
    voice_id: str | None,
    no_audio: bool,
) -> None:
    load_dotenv()

    if not source_url and not topic:
        raise RuntimeError("--topic is required when --source is not provided.")

    LESSONS_DIR.mkdir(exist_ok=True)
    now = dt.datetime.now(dt.timezone.utc)

    lesson = generate_lesson(level=level, topic=topic, source_url=source_url)

    audio_tmp_path = None
    if not no_audio:
        audio_tmp_path = LESSONS_DIR / f".tmp-audio-{now.strftime('%Y%m%d-%H%M%S')}.mp3"
        maybe_generate_voice(
            text=lesson["text"],
            path=audio_tmp_path,
            voice_id=voice_id,
            skip=False,
        )

    lesson_record = {
        "type": "text",
        "title": lesson["title"],
        "text": lesson["text"],
        "date": now.isoformat(),
        "level": level,
        "topic": topic,
        "source": (
            {"type": "url", "url": source_url} if source_url else {"type": "ai"}
        ),
        "vocabs": lesson["vocabs"],
        "phrases": lesson["phrases"],
        "quiz": lesson["quiz"],
        "voice_path": "",
    }

    lesson_id = save_lesson(lesson_record, audio_tmp_path=audio_tmp_path)

    print(f"Saved lesson: lessons/{lesson_id}.json")
    if audio_tmp_path is not None:
        print(f"  audio: {lesson_record['voice_path']}")
