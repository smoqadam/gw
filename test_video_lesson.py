"""Unit tests for the pure parsers in video_lesson.py.

Run: python -m unittest test_video_lesson -v
No external deps — these cover the parsing logic, not the yt-dlp/yapsnap I/O.
"""

import unittest

from video_lesson import extract_video_id, parse_vtt, parse_yapsnap_timestamps


class ExtractVideoIdTests(unittest.TestCase):
    def test_watch_url(self):
        self.assertEqual(
            extract_video_id("https://www.youtube.com/watch?v=w9J6D4r30HY"),
            "w9J6D4r30HY",
        )

    def test_watch_url_with_extra_params(self):
        self.assertEqual(
            extract_video_id("https://www.youtube.com/watch?v=w9J6D4r30HY&t=30s&list=PL"),
            "w9J6D4r30HY",
        )

    def test_short_url(self):
        self.assertEqual(
            extract_video_id("https://youtu.be/w9J6D4r30HY?si=abc"),
            "w9J6D4r30HY",
        )

    def test_shorts_url(self):
        self.assertEqual(
            extract_video_id("https://www.youtube.com/shorts/w9J6D4r30HY"),
            "w9J6D4r30HY",
        )

    def test_embed_url(self):
        self.assertEqual(
            extract_video_id("https://www.youtube.com/embed/w9J6D4r30HY"),
            "w9J6D4r30HY",
        )

    def test_invalid_url_raises(self):
        with self.assertRaises(ValueError):
            extract_video_id("https://example.com/not-a-video")


class ParseVttTests(unittest.TestCase):
    def test_clean_manual_subtitles(self):
        vtt = (
            "WEBVTT\n"
            "Kind: captions\n"
            "Language: de\n"
            "\n"
            "00:00:01.000 --> 00:00:03.000\n"
            "Guten Morgen.\n"
            "\n"
            "00:00:05.000 --> 00:00:07.500\n"
            "Wie heißt du?\n"
        )
        segs = parse_vtt(vtt)
        self.assertEqual(
            segs,
            [
                {"start": 1.0, "end": 3.0, "text": "Guten Morgen."},
                {"start": 5.0, "end": 7.5, "text": "Wie heißt du?"},
            ],
        )

    def test_strips_cue_settings_and_identifier_lines(self):
        vtt = (
            "WEBVTT\n\n"
            "1\n"
            "00:00:02.000 --> 00:00:04.000 align:start position:0%\n"
            "Hallo Welt\n"
        )
        segs = parse_vtt(vtt)
        self.assertEqual(segs, [{"start": 2.0, "end": 4.0, "text": "Hallo Welt"}])

    def test_rolling_auto_captions_are_deduped(self):
        vtt = (
            "WEBVTT\n"
            "Kind: captions\n"
            "Language: de\n"
            "\n"
            "00:00:00.000 --> 00:00:02.000 align:start position:0%\n"
            "hallo<00:00:00.500><c> welt</c>\n"
            "\n"
            "00:00:02.000 --> 00:00:04.000 align:start position:0%\n"
            "hallo welt\n"
            "wie<00:00:02.500><c> geht's</c>\n"
            "\n"
            "00:00:04.000 --> 00:00:06.000 align:start position:0%\n"
            "wie geht's\n"
            "mir<00:00:04.500><c> gut</c>\n"
        )
        segs = parse_vtt(vtt)
        self.assertEqual(
            segs,
            [
                {"start": 0.0, "end": 2.0, "text": "hallo welt"},
                {"start": 2.0, "end": 4.0, "text": "wie geht's"},
                {"start": 4.0, "end": 6.0, "text": "mir gut"},
            ],
        )

    def test_html_entities_decoded(self):
        vtt = (
            "WEBVTT\n\n"
            "00:00:01.000 --> 00:00:02.000\n"
            "Schl&uuml;ssel &amp; Schloss\n"
        )
        segs = parse_vtt(vtt)
        self.assertEqual(segs[0]["text"], "Schlüssel & Schloss")

    def test_mm_ss_timestamps(self):
        vtt = "WEBVTT\n\n01:02.000 --> 01:05.500\nText\n"
        segs = parse_vtt(vtt)
        self.assertEqual(segs[0]["start"], 62.0)
        self.assertEqual(segs[0]["end"], 65.5)


class ParseYapsnapTests(unittest.TestCase):
    def test_basic_lines(self):
        text = "[00:01] Erster Satz.\n[00:11] Zweiter Satz.\n[01:02] Dritter Satz.\n"
        segs = parse_yapsnap_timestamps(text)
        self.assertEqual(
            segs,
            [
                {"start": 1.0, "text": "Erster Satz."},
                {"start": 11.0, "text": "Zweiter Satz."},
                {"start": 62.0, "text": "Dritter Satz."},
            ],
        )

    def test_skips_blank_and_nonmatching_lines(self):
        text = "yapsnap v1\n\n[00:03] Hallo.\nrandom noise\n"
        segs = parse_yapsnap_timestamps(text)
        self.assertEqual(segs, [{"start": 3.0, "text": "Hallo."}])

    def test_supports_hours(self):
        text = "[01:02:03] Lange Aufnahme.\n"
        segs = parse_yapsnap_timestamps(text)
        self.assertEqual(segs, [{"start": 3723.0, "text": "Lange Aufnahme."}])


if __name__ == "__main__":
    unittest.main()
