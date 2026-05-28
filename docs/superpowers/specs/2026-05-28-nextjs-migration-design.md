# Next.js Frontend Migration — Design

**Date:** 2026-05-28
**Branch:** `v1`
**Status:** Approved design, ready for implementation plan

## Overview

Migrate the German Weekly frontend from vanilla HTML/CSS/JS to a Next.js +
React + TypeScript app, with a Tailwind-based visual refresh. The Python lesson
generators are unchanged in behavior; they move into a `scripts/` folder and
write lessons into `public/lessons/` so the lessons are served by the Next app.

The goal is a more extendable frontend — specifically so that small per-lesson
"word games" can be added later as interchangeable React components. This spec
covers the **migration to feature parity plus the visual refresh only**. The
game framework is designed as a typed seam here but **not built**.

## Goals

- 1:1 functional parity with the current site (every existing behavior works).
- React/TypeScript component architecture with clean per-lesson boundaries.
- Tailwind redesign: fix spacing, alignment, typography, and design details
  while **keeping the existing color scheme and font roles**.
- Repo root becomes the Next.js app; Python generators live in `scripts/`.
- New lessons go live via automated rebuild + deploy on commit.

## Non-goals (this spec)

- No word games are built. Only the typed extension seam is reserved.
- No change to how lessons are *generated* (LLM/TTS/captions logic untouched).
- No tests are written (existing `test_video_lesson.py` is kept as-is, moved
  with the scripts).
- No color palette change.
- No accounts/backend; deck stays browser-local; dictionary stays the existing
  external API.

## Locked decisions

| Decision | Choice |
|---|---|
| Hosting | GitHub Pages, custom domain `germanweekly.com` (CNAME kept) |
| Rendering | Next.js App Router, `output: 'export'` (static export) |
| Lesson data | Fetched at runtime from `/lessons/...` (not build-time SSG per lesson) |
| Routing | **A** — query param `?lesson=<id>` on `/` (preserves existing URLs) |
| New lessons go live | **Auto rebuild + deploy** on push to `main` via GitHub Actions |
| Language | TypeScript |
| Styling | Tailwind redesign, existing palette/fonts kept as theme tokens |
| Tests | None written |
| Dev branch | `v1` |

## Target repository structure

Before (relevant parts): Python + vanilla frontend at root, `lessons/` at root,
Pages serves the repo directly.

After:

```
germanweekly.com/                # repo root = Next.js app
  app/
    layout.tsx                   # fonts, global styles, nav shell
    page.tsx                     # lesson view ( ?lesson=<id> ), Suspense-wrapped
    deck/page.tsx                # vocabulary deck
  components/
    Nav.tsx  Drawer.tsx
    LessonMeta.tsx
    TextLesson.tsx  VideoLesson.tsx
    Glossary.tsx  Quiz.tsx
    LookupPanel.tsx  AboutModal.tsx
    DeckView.tsx
    LessonActivities.tsx         # games slot — renders nothing for now
    Word.tsx                     # clickable token
  lib/
    types.ts                     # Lesson union + entry/quiz/vocab types
    lessons.ts                   # fetchIndex(), fetchLesson(id), path helpers
    deck.ts                      # localStorage deck (key "gw_deck")
    dict.ts                      # dictionary API client + in-memory cache
    tokenize.ts                  # German word tokenizer
    games/types.ts               # Game interface + normalizeVocab() (seam only)
  hooks/
    useTranscriptSync.ts         # YouTube player + segment highlight/seek
  styles/globals.css             # Tailwind layers + base
  public/
    lessons/                     # ← MOVED here; served at /lessons/
    CNAME
    .nojekyll
  scripts/                       # ← Python generators MOVED here
    germanweekly.py  text_lesson.py  video_lesson.py  lessons_io.py
    test_video_lesson.py
    requirements.txt  requirements-video.txt  topics-queue.txt
  next.config.ts  tailwind.config.ts  tsconfig.json  package.json
  .github/workflows/
    generate-lesson.yml          # updated paths
    deploy.yml                   # NEW: build + deploy to Pages
```

**Deleted:** `index.html`, `lesson.js`, `deck.js`, `deck.html`, `style.css`,
`legacy/`. (Per the no-legacy rule — replaced wholesale, not kept as fallbacks.)

`.env` / `.env.example` stay at repo root (Python `load_dotenv()` reads cwd in
CI and local runs).

## Routing & data flow

- `/` is a client page. It reads `?lesson=<id>` via `useSearchParams` (wrapped
  in `<Suspense>`, required for static export). It calls `fetchIndex()` to build
  the drawer, picks the requested lesson or the newest, then `fetchLesson(id)`
  and renders by `lesson.type`.
- `/deck` renders the localStorage deck.
- Existing shared links (`/?lesson=<id>`) keep working unchanged.
- All fetches hit `/lessons/index.json` and `/lessons/<id>.json` at runtime —
  identical paths to today, now served from `public/lessons/`.

## Lesson data model (`lib/types.ts`)

Mirrors the current JSON exactly:

```ts
type Level = string; // "A1".."C2" or ""
interface VocabItem { word: string; definition: string; example?: string; }
interface PhraseItem { phrase: string; translation: string; example?: string; }
type QuizItem =
  | { type: "mcq"; q: string; options: string[]; answer: number; why?: string }
  | { type: "cloze"; sentence: string; answer: string; why?: string };
interface Segment { start: number; end?: number; text: string; }
interface Source { type: "ai" | "youtube" | string; url?: string; }

interface BaseLesson { id: string; title: string; date: string; level?: Level; source?: Source; }
interface TextLesson extends BaseLesson {
  type: "text"; text: string; vocabs?: VocabItem[]; phrases?: PhraseItem[];
  quiz?: QuizItem[]; voice_path?: string;
}
interface VideoLesson extends BaseLesson {
  type: "video"; video_id?: string; url?: string;
  transcript_source?: "captions" | "yapsnap"; segments: Segment[];
}
type Lesson = TextLesson | VideoLesson;
interface IndexEntry { id: string; type: "text" | "video"; title: string; date: string; level?: Level; video_id?: string; }
```

`voice_path` is normalized to a root-absolute `/lessons/...` URL in `lessons.ts`
so audio resolves correctly regardless of route.

## Component inventory (parity map)

| Current (vanilla) | New (React) | Notes |
|---|---|---|
| nav + `☰` drawer (`lesson.js`) | `Nav`, `Drawer` | list from `index.json`, active state |
| `renderMeta` | `LessonMeta` | date · level · source link |
| `renderText` + `tokenizeParagraph` | `TextLesson` + `Word` + `lib/tokenize` | clickable German words |
| `renderVideo` + sync/seek | `VideoLesson` + `useTranscriptSync` | YouTube IFrame API, synced transcript, seek-on-click, height match |
| `renderGlossary` | `Glossary` | vocab + phrases |
| `renderQuiz` + `evaluateAnswer` | `Quiz` | mcq + cloze, check/feedback |
| lookup panel (`openLookup` etc.) | `LookupPanel` + `lib/dict` | external API, in-memory cache, related chips, Save-to-deck |
| about modal | `AboutModal` | |
| `deck.html` + `deck.js` | `DeckView` + `lib/deck` | same `gw_deck` localStorage key + card shape — existing saved words preserved |

## Styling / redesign

- Tailwind config carries the **existing tokens** as theme colors:
  cream `#f7f4ec` / soft `#f1ede2` / surface `#fff` / warm `#fbf8f1`;
  ink `#1d2025` / strong `#0f1115` / soft `#4d545d` / muted `#8a8f97` / faint `#b4b6b8`;
  accent `#b04a2b` / deep `#883518` / soft `#f4dccf` / tint `#fbeee5`;
  highlight `#ffe599`; correct `#4f7c4f` / wrong `#b5483d`; plus the rule alphas.
- Fonts via `next/font/google`, mapped to the four roles: **Fraunces** (display),
  **Source Serif 4** (body/serif), **Inter** (UI), **JetBrains Mono** (mono).
- Refresh pass over spacing scale, vertical rhythm, alignment, type sizes, and
  component detailing (panel, quiz, drawer, deck cards). Same aesthetic family,
  tighter execution. No color changes.

## Games extension seam (designed, not built)

`lib/games/types.ts` reserves the interface only:

```ts
interface GameProps { items: VocabItem[]; lessonId: string; }
type Game = React.ComponentType<GameProps>;
function normalizeVocab(input: TextLesson | DeckCard[] | DictEntry[]): VocabItem[];
```

`LessonActivities.tsx` is rendered under each lesson and currently returns
`null`. A future spec adds a game registry and concrete games; no other code
needs to change to accommodate it.

## Python pipeline changes (paths only)

- Generators move to `scripts/`; their logic is unchanged.
- `lessons_io.py` writes lesson files and `index.json` into `public/lessons/`.
- Any code that emits `voice_path` continues to write `lessons/<id>.mp3`
  (relative); the frontend normalizes it to `/lessons/<id>.mp3`.
- `topics-queue.txt`, `requirements*.txt` move under `scripts/`.

## Build & deploy

- `next.config.ts`: `output: 'export'`, `images: { unoptimized: true }`,
  `trailingSlash: true`. No `basePath` (custom domain at root).
- `public/.nojekyll` and `public/CNAME` ship in the export output.
- **`deploy.yml`** (new): `on: push: branches: [main]` (and manual dispatch).
  Steps: checkout → setup Node → `pnpm install` → `pnpm build` (static export to
  `out/`) → `actions/upload-pages-artifact` (`out/`) → `actions/deploy-pages`.
- **GitHub Pages source** switches from "deploy from branch" to "GitHub Actions".
- **`generate-lesson.yml`** updates: run `python scripts/germanweekly.py ...`,
  install `scripts/requirements*.txt`, `git add public/lessons` (+
  `scripts/topics-queue.txt` when popped). It still commits to `main`; that push
  triggers `deploy.yml`, so a new lesson rebuilds and redeploys automatically.

## Cutover

1. Build the full app on `v1` and verify locally (`next dev`, then `next build`
   + serve `out/`) against the real `public/lessons/` data.
2. Merge `v1` → `main`.
3. Switch Pages source to "GitHub Actions"; confirm `deploy.yml` deploys and the
   custom domain serves the new app.

## Risks / watch-items

- `useSearchParams` requires a `<Suspense>` boundary under static export — easy
  to miss; build will error if absent.
- The lesson-generation workflow must commit to the same branch the deploy
  watches (`main`) for auto-deploy to fire.
- Audio `voice_path` must resolve from any route — handled by normalization.
- Package manager: pnpm assumed; npm is acceptable if preferred.
