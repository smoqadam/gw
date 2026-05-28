"""German Weekly lesson generator — command parsing and dispatch.

One command, input-driven:
  --youtube <url>            -> video lesson  (video_lesson.run)
  --topic / --source         -> text lesson   (text_lesson.run)

The chosen pipeline module is imported inside its branch, so a --youtube run
never loads openai/elevenlabs and a text run never loads yt-dlp/yapsnap.
"""

import argparse
import sys

LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a German learning lesson (text or YouTube video)."
    )
    parser.add_argument(
        "--level",
        default="B1",
        choices=LEVELS,
        help="CEFR level (default B1).",
    )
    parser.add_argument(
        "--youtube",
        default=None,
        help="YouTube URL. When set, builds a video lesson from the video's German "
        "captions (or a local yapsnap transcription) instead of a text lesson.",
    )
    parser.add_argument(
        "--topic",
        default=None,
        help="Free-form topic for a text lesson. Required when neither --source nor "
        "--youtube is given; optional steering hint when --source is a URL.",
    )
    parser.add_argument(
        "--source",
        default=None,
        help="Source URL for a text lesson. The LLM rewrites that page's main "
        "content at the target level.",
    )
    parser.add_argument(
        "--voice-id",
        default=None,
        help="Optional TTS voice id (text lessons). Uses provider default if omitted.",
    )
    parser.add_argument(
        "--no-audio",
        action="store_true",
        help="Skip audio generation (text lessons).",
    )
    parser.add_argument(
        "--vocab",
        action="store_true",
        help="Video lessons: extract study vocabulary from the transcript with the "
        "LLM (needs OPENAI_API_KEY) and store it for the games page.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.youtube:
        import video_lesson

        video_lesson.run(youtube_url=args.youtube, level=args.level, extract_vocab=args.vocab)
        return

    if not args.source and not args.topic:
        sys.exit("error: pass --youtube <url>, --topic <text>, or --source <url>")

    import text_lesson

    text_lesson.run(
        level=args.level,
        topic=args.topic,
        source_url=args.source,
        voice_id=args.voice_id,
        no_audio=args.no_audio,
    )


if __name__ == "__main__":
    main()
