# Sprachpartner — Design Spec

**Date**: 2026-05-21
**Status**: Approved (pending user review of this document)
**Working name**: Sprachpartner (renameable)
**Replaces**: `germanweekly.com` static-site implementation (Python generator + static HTML). New app deployed at `germanweekly.com`; old static repo becomes git history only.

## Overview

A self-hosted German-learning web app whose primary surface is a chat with a tutor agent. Every chat turn feeds two extractor agents that build a personal vocabulary deck (SRS-scheduled) and a mistake library (with explanations). Review is a dedicated tab running Anki-style flashcards with no LLM calls. The chat ambient-quizzes the user on due cards and unresolved mistakes inside natural conversation flow (deferred to v2).

The app replaces the existing static "weekly lesson" site, which the owner does not use.

## Goals

1. Get the owner (single user) to actually open the app daily and use it.
2. Cover all four pieces of language learning in one product: comprehensible input, production, retention, personalization.
3. Run on a Raspberry Pi 4 with low monthly cost (LLM tokens for one user only — budget ~$5/mo).

## Non-goals (MVP)

- Multi-user accounts, billing, public sign-up
- Native mobile app (web app is responsive — sufficient)
- Voice/speech input or output
- Languages other than German
- Static weekly-lesson generation (concept retired)

## User journey

A typical session:

1. Open `germanweekly.com`. Auth gate (shared password cookie if first visit).
2. Land on **Chat** with the nav showing `Deck · 12 due` and `Mistakes · 47`.
3. Resume most recent session or start a new one. New session: tutor opens with 2–3 scenario suggestions plus "or just tell me what's on your mind."
4. Pick a scenario or type freely. Conversation begins, fully in German.
5. After each user message, behind the scenes:
   - Tutor streams a German reply (mirror-correcting silently).
   - Vocab extractor scans the tutor reply, adds new non-cognate items to deck with source sentence.
   - Mistake extractor scans the user message, records errors with spans + explanations, returns spans to UI which renders red underlines on the user's bubble.
6. User clicks any word in tutor reply → dictionary popup → "Save to deck."
7. User opens **Review** tab. Drills due flashcards (Leitner SRS). Reads recent mistakes.
8. User closes app. On session end, tutor writes a 2-line summary for future memory context.

## Surfaces

### Chat (`/`)

**Layout**:
- Top bar: nav (Chat · Review · Progress · Settings) + counters (deck due, mistakes count) + level pill
- Left rail (desktop): collapsible past-sessions list, latest at top. Mobile: hidden behind menu icon
- Main column: messages. User on right, tutor on left. User messages may have red-underlined spans (click → popup with correction + explanation + "open in Mistakes" link)
- Composer: textarea + send. Plain text input

**Behaviors**:
- Tutor reply streams via streaming Response body. Bubble updates incrementally during stream.
- After stream completes, fire `/api/extract/vocab` and `/api/extract/mistakes` in parallel. UI updates when each returns (vocab → deck counter; mistakes → red underlines on the relevant user message).
- Words in tutor reply (German word regex) become clickable post-stream.
- Click a word → `/api/lookup?word=X` → popup. Popup has "Save to Deck" button.
- "End session" button writes the summary and starts a fresh session on next entry.

### Review (`/review`)

Two tabs: **Vocab** and **Mistakes**.

**Vocab tab**:
- Counter: `12 due · 47 in deck · 9-day streak`
- Flashcard UI: one card at a time. Front: German term (+ part of speech if known). Tap/space to flip. Back: English definition + source sentence (with term highlighted). Three buttons: **Again** / **Good** / **Easy**
- SRS: Leitner boxes 1–5 with intervals 1d → 3d → 7d → 14d → 30d
- After all due cards reviewed: "Caught up. Come back tomorrow for X more."
- Browse mode: list of all deck cards with filters (box, recently added, search)

**Mistakes tab**:
- Counter: `47 total · 12 unresolved · 35 resolved (last 30 days)`
- Chronological list, newest first. Each entry:
  - Date + scenario name + session link
  - Your original sentence with red span highlighted
  - The correction
  - The 1-sentence explanation
  - "Delete" button (manual retirement for MVP)
- Filters: unresolved / resolved / all; by category once tagging exists (v2)

### Progress (`/progress`) — MVP-lite

Three counters for MVP:
- Words in deck
- Mistakes resolved (total + last 30 days)
- Current streak (days the user opened the app + reviewed ≥1 card)

Charts deferred to v2.

### Settings (`/settings`)

- CEFR level (radio: A1/A2/B1/B2/C1/C2)
- Preferred name (for tutor to address the user)
- Password change
- LLM model overrides (advanced; defaults below)
- Danger zone: reset deck / reset mistakes (with confirm)

## Pedagogy model — three LLM calls per user turn

```
user message ──┐
               ▼
        [Tutor agent (4o)] ─── stream reply (markdown, German) ──► UI
               │ (after stream completes, in parallel)
               ├─► [Vocab extractor (4o-mini)] ─── new deck items ────► deck
               └─► [Mistake extractor (4o-mini)] ── spans + explanations ──► library + UI red marks
```

**Tutor agent (GPT-4o, streaming, markdown allowed)**:
- System prompt: "You are a patient German conversation partner at the user's level. Respond fully in German. Mirror-correct silently — if the user wrote something ungrammatical, restate the idea correctly in your reply without calling it out. Use markdown sparingly (bold for emphasis on a key word; lists when genuinely helpful). End with a question to keep conversation moving. Stay in scenario if one was chosen."
- Context block: user level, scenario (if any), last 1–2 sessions' summary, 5–10 recent vocab items, 5–10 unresolved mistake summaries. (`QUIZ_CANDIDATES` block + ambient-quiz instruction added in v2.)

**Vocab extractor (GPT-4o-mini, JSON output)**:
- Reuses cognate-rejection logic verbatim from existing `germanweekly.py` system prompt (proven on this domain)
- Input: tutor reply text
- Output: array of `{ term, definition_en, source_sentence }` items
- Filters: skip transparent cognates, brand/place names, transparent compounds, items differing from English by ≤3 letters (excluding inflection)

**Mistake extractor (GPT-4o-mini, JSON output)**:
- Input: user's most recent German message
- Output: array of `{ span_start, span_end, original, correction, explanation }` items — short, one sentence of explanation in English
- Tagging categories suggested for v2: auxiliary, case, word_order, gender, preposition, conjugation, vocab_choice, other

**Memory summarizer (GPT-4o-mini, called on session end)**:
- Input: full session transcript
- Output: 2-sentence summary, stored on the session row and rolled into `user_state.last_summary`

## Data model — SQLite via Drizzle ORM

```ts
// sessions: one per chat
sessions {
  id           text primary key   // ulid
  started_at   integer not null   // unix ms
  ended_at     integer            // null until explicit end
  scenario     text               // "Bäckerei roleplay" | "free" | etc.
  summary      text               // tutor-written 2-liner; null until session ends
}

messages {
  id          text primary key
  session_id  text not null references sessions(id)
  role        text not null      // "user" | "tutor"
  content_md  text not null
  created_at  integer not null
}

vocab_cards {
  id                text primary key
  term              text not null unique collate nocase
  definition_en     text not null
  source_sentence   text not null
  source_session_id text references sessions(id)
  leitner_box       integer not null default 1   // 1..5
  due_at            integer not null              // unix ms
  last_reviewed_at  integer
  created_at        integer not null
}

mistakes {
  id                 text primary key
  source_message_id  text not null references messages(id)
  span_start         integer not null
  span_end           integer not null
  original           text not null   // exact substring
  correction         text not null
  explanation        text not null   // 1 sentence in English
  category           text            // nullable; v2 tagging
  resolved_at        integer         // null until retired (MVP: manual delete = resolved)
  correct_quiz_count integer not null default 0   // v2
  created_at         integer not null
}

user_state {
  id            integer primary key check (id = 1)  // singleton row
  level         text not null default 'B1'           // A1..C2
  name          text
  last_summary  text                                  // rolled-up memory across recent sessions
}

lookup_cache {
  term         text primary key collate nocase
  entry_json   text not null   // serialized dictionary entry
  cached_at    integer not null
}
```

**SRS scheduling** (`leitner.ts`):
- Intervals (days): `[1, 3, 7, 14, 30]` for boxes 1..5
- On grade:
  - `again` → `box = 1`, `due_at = now + 1d`
  - `good` → `box = min(box + 1, 5)`, `due_at = now + interval[box]`
  - `easy` → `box = min(box + 2, 5)`, `due_at = now + interval[box]`

## Architecture — Next.js 15 (App Router) + TypeScript

```
/app
  /(authed)
    /page.tsx                  // Chat (default route)
    /review/page.tsx           // Vocab + Mistakes tabs
    /progress/page.tsx         // counters
    /settings/page.tsx
  /api
    /chat/route.ts             // POST: send message, stream tutor reply
    /extract/vocab/route.ts    // POST: extract vocab from tutor reply
    /extract/mistakes/route.ts // POST: extract mistakes from user msg
    /lookup/route.ts           // GET: word → dictionary entry (cached)
    /review/route.ts           // POST: grade a card (again/good/easy)
    /session/route.ts          // POST: end session (writes summary); GET: list
  /login/page.tsx              // shared-password gate
  /layout.tsx                  // global nav + counters

/lib
  /db
    /schema.ts                 // drizzle schema
    /client.ts                 // singleton db instance
    /queries.ts                // typed query helpers
  /agents
    /tutor.ts                  // prompt builder + streaming OpenAI call
    /vocab-extractor.ts        // prompt + JSON parse
    /mistake-extractor.ts      // prompt + JSON parse
    /summarizer.ts             // session summary on end
  /srs
    /leitner.ts                // grade → box + due_at
  /memory
    /context-builder.ts        // builds memory block for tutor

/components
  /chat
    /Composer.tsx
    /MessageList.tsx
    /TutorMessage.tsx          // includes clickable-word logic
    /UserMessage.tsx           // includes red-span rendering
    /LookupPopup.tsx
  /review
    /Flashcard.tsx
    /MistakeRow.tsx
  /shared
    /Nav.tsx
    /Counters.tsx

/middleware.ts                 // auth gate
/drizzle.config.ts
/next.config.ts
/.env.example                  // OPENAI_API_KEY, APP_PASSWORD, DATABASE_URL
```

**Streaming pattern**: the `/api/chat` route returns a `ReadableStream` of OpenAI delta chunks. Client uses `fetch` + `getReader()` to render incrementally. On stream end, client fires the two extractor calls in parallel.

**Auth**: `middleware.ts` checks for a signed cookie; if absent, redirect to `/login`. Login POST checks against `APP_PASSWORD` env var (bcrypt-hashed), sets HttpOnly cookie with 90-day expiry.

**Deployment to RPi4**:
- Build on a beefier machine (laptop): `pnpm install && pnpm build`
- Either: rsync `.next/`, `package.json`, `pnpm-lock.yaml`, `drizzle/` migrations, `public/` to the Pi, then `pnpm install --prod` + `pnpm start`
- Or: build a Docker image for `linux/arm64` and `docker run` on the Pi
- Cloudflare Tunnel exposes `germanweekly.com` → `localhost:3000` on Pi

## MVP cut

### Ships v1

- Auth gate (shared password)
- Chat: sessions, scenario picker on new session, streaming tutor, mirror-correction
- Vocab extractor → card creation, deck counter in nav
- Mistake extractor → red-underlines on user msg + entries in mistake list
- Click word in tutor reply → lookup popup → save to deck
- Review tab: vocab flashcards (Leitner SRS) + mistake list (read-only with manual delete)
- Settings: level, name, password change
- Session end button writes summary

### Defers to v2

- Ambient quiz inside chat (tutor weaving in due cards / mistakes); MVP keeps review purely in the Review tab
- Progress page charts (only counters in MVP)
- Past-sessions browseable list (MVP: only current session resumable; older sessions stored but not surfaced)
- Mistake category tagging
- Mistake auto-retirement after N correct quiz handles

## LLM cost budget (rough, single user)

Pricing assumptions: GPT-4o $2.50/1M in, $10.00/1M out · GPT-4o-mini $0.15/1M in, $0.60/1M out.

Per-turn estimate (1 user message ≈ 30 turns/day):

| Agent | Model | Per-call cost | At 30 turns/day |
|---|---|---|---|
| Tutor (1000 in / 800 out) | GPT-4o | ~$0.0105 | ~$9.45/mo |
| Vocab extractor (300 in / 100 out) | 4o-mini | ~$0.0001 | ~$0.10/mo |
| Mistake extractor (300 in / 100 out) | 4o-mini | ~$0.0001 | ~$0.10/mo |
| Memory summarizer (1× per session) | 4o-mini | negligible | <$0.05/mo |

**Realistic monthly total**: ~$3/mo at light use (10 turns/day), ~$10/mo at heavy use (30 turns/day), ~$15/mo at very heavy use (50 turns/day). Cheap by language-learning-app standards.

## Error handling & graceful degradation

The chat must remain usable when extractors or memory fail. Failure modes and behavior:

- **Tutor stream fails mid-reply** (network drop, OpenAI 5xx): partial message is preserved; UI shows a small inline "retry" affordance below the bubble. Failed user→tutor turn does not block the next attempt.
- **Vocab extractor fails or returns invalid JSON**: log the error server-side, no deck update for this turn. Chat continues normally. (No retry — vocab loss for one turn is acceptable.)
- **Mistake extractor fails or returns invalid JSON**: log, no red underlines for this turn. Chat continues.
- **Dictionary lookup fails**: popup shows "couldn't load — retry" button; cached entries are still served.
- **OpenAI rate limits (429)**: tutor stream surfaces a clean "system busy, try again in a moment" message; extractors silently skip.
- **DB write fails on card insert**: deduplication is upsert-by-term, so retries are safe.

Logging: server logs failed agent calls with role + truncated input. No external observability stack (single user).

## Testing

- **Type safety**: TypeScript strict mode; `tsc --noEmit` runs in CI / pre-commit.
- **Unit**: SRS scheduling math (`lib/srs/leitner.ts`) gets unit tests — pure functions, easy to cover.
- **Integration**: one end-to-end test per agent (tutor, vocab extractor, mistake extractor) that hits the real OpenAI API with a canned input and asserts JSON shape. Run manually, not in CI (don't want to burn tokens on PR builds).
- **Manual smoke**: a 5-turn happy-path chat script run by the owner before deploys.

No further test infrastructure for MVP.

## Open questions (not blocking MVP)

1. **Dictionary lookup quality**. `/api/lookup` can either (a) proxy to a real dictionary (DWDS, leo.org) or (b) use GPT-4o-mini to generate the entry. (b) is easier to ship and consistent with the rest of the stack; quality may vary. Default: (b) with `lookup_cache` table for repeat lookups.
2. **End-of-session triggering**. Idle timeout vs. user-action only? Default: explicit "End session" button; no auto-end.
3. **Edit / delete messages**. Default: no — chat is append-only. Typo → just send another message.
4. **Working name**. "Sprachpartner" is a placeholder. Renameable any time.

## Out of scope (will not build, full stop)

- A landing/marketing page
- Anything resembling the old "weekly lesson" generator
- Search across past sessions (only the Review surfaces are searchable)
