# Sprachpartner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user, self-hosted Next.js web app where the primary surface is a German-language chat with a tutor LLM; every turn feeds two extractor LLMs that build a personal vocabulary deck (Leitner SRS) and a mistake library (with explanations), reviewable in a dedicated tab.

**Architecture:** Next.js 15 App Router with TypeScript. Tutor reply streams via native streaming `Response`; extractors run as separate non-streaming JSON calls fired after stream completion. Data lives in SQLite (via Drizzle ORM with `better-sqlite3`). Auth is a shared password gate (single user) via Next.js middleware. Pure-logic modules (SRS, prompt builders, query helpers) are unit-tested with Vitest; LLM-touching code has manual smoke tests only.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Drizzle ORM + better-sqlite3, OpenAI Node SDK, Vitest, bcryptjs, ulid, Tailwind CSS (for fast styling) + a couple of design tokens carried over from the current static site.

**Spec reference:** `docs/superpowers/specs/2026-05-21-sprachpartner-design.md`

---

## File Structure

```
/                                  # repo root
  /app
    /(authed)
      /layout.tsx                  # nav + counters wrapper for authed pages
      /page.tsx                    # Chat (default route)
      /review/page.tsx             # Vocab + Mistakes tabs
      /progress/page.tsx           # counters
      /settings/page.tsx
    /api
      /chat/route.ts               # POST: stream tutor reply
      /extract/vocab/route.ts      # POST: vocab extractor
      /extract/mistakes/route.ts   # POST: mistake extractor
      /lookup/route.ts             # GET: cached dictionary lookup
      /review/route.ts             # POST: grade card (again/good/easy)
      /session/route.ts            # GET list, POST end-session
      /auth/login/route.ts         # POST: verify password, set cookie
    /login/page.tsx
    /layout.tsx                    # root layout (html/body)
    /globals.css
  /lib
    /db/schema.ts                  # drizzle table defs
    /db/client.ts                  # singleton db + migration runner
    /db/queries.ts                 # typed helpers (getDueCards, addMistake, etc.)
    /agents/openai.ts              # shared OpenAI client + model config
    /agents/tutor.ts               # tutor system prompt + streaming
    /agents/vocab-extractor.ts
    /agents/mistake-extractor.ts
    /agents/summarizer.ts
    /memory/context-builder.ts     # builds memory block for tutor prompt
    /srs/leitner.ts                # grade → box + due_at math
    /auth/password.ts              # bcrypt hash/verify
    /auth/session.ts               # cookie sign/verify
  /components
    /chat/Composer.tsx
    /chat/MessageList.tsx
    /chat/TutorMessage.tsx
    /chat/UserMessage.tsx
    /chat/LookupPopup.tsx
    /chat/ScenarioPicker.tsx
    /review/Flashcard.tsx
    /review/MistakeRow.tsx
    /shared/Nav.tsx
    /shared/Counters.tsx
  /test
    /srs/leitner.test.ts
    /db/queries.test.ts
    /auth/password.test.ts
    /memory/context-builder.test.ts
  /drizzle/                        # generated migrations
  /legacy/                         # archived old Python/static site
  /middleware.ts
  /drizzle.config.ts
  /next.config.ts
  /tsconfig.json
  /tailwind.config.ts
  /postcss.config.mjs
  /vitest.config.ts
  /package.json
  /.env.example
  /.gitignore
  /README.md
```

---

# Phase 0 — Cleanup and bootstrap

## Task 1: Archive legacy code

**Files:**
- Move: `germanweekly.py`, `index.html`, `style.css`, `grammar/`, `lessons/`, `requirements.txt`, `.github/`, `CNAME`, `topics-queue.txt` → `legacy/`
- Modify: `.gitignore` (replaced in Task 3)

- [ ] **Step 1: Create the legacy directory and move existing artifacts**

Run from the repo root:

```bash
mkdir -p legacy
git mv germanweekly.py index.html style.css grammar lessons requirements.txt CNAME topics-queue.txt legacy/
git mv .github legacy/dot-github
# __pycache__ and .venv are not tracked — remove from working tree if present
rm -rf __pycache__ .venv .DS_Store
```

- [ ] **Step 2: Verify only docs/ + legacy/ + .git remain at the top level**

Run: `ls -A1 | sort`
Expected (in some order): `.git`, `.gitignore`, `docs`, `legacy`, plus `.env` and `.env.example` if you had them. No `germanweekly.py`, no `index.html`, no `grammar/`, no `lessons/`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: archive legacy static-site implementation into legacy/

Preparing the repo for a fresh Next.js implementation per the
Sprachpartner spec. All old Python and static-HTML files live under
legacy/ to preserve history without polluting the new working tree."
```

---

## Task 2: Bootstrap Next.js + install dependencies

**Files:**
- Create (via scaffold): `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, `next-env.d.ts`
- Create: this task may overwrite `.gitignore` (Task 3 finalizes it)

- [ ] **Step 1: Scaffold a fresh Next.js app in the current directory**

Run from the repo root:

```bash
pnpm dlx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --use-pnpm \
  --import-alias="@/*" \
  --no-turbopack
```

When prompted whether to overwrite, choose **Yes** for the create-next-app default files only. Confirm the script did NOT touch `docs/`, `legacy/`, `.env`, or `.git`.

- [ ] **Step 2: Verify the scaffold**

Run: `pnpm dev`
Expected: dev server starts on `http://localhost:3000` and serves the default Next.js welcome page. Press Ctrl+C to stop.

- [ ] **Step 3: Install runtime dependencies**

```bash
pnpm add openai better-sqlite3 drizzle-orm ulid bcryptjs cookie zod
pnpm add -D drizzle-kit @types/better-sqlite3 @types/bcryptjs @types/cookie vitest @vitejs/plugin-react
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: bootstrap Next.js 15 app with deps

create-next-app scaffold (TS, Tailwind, ESLint, App Router).
Runtime: openai, better-sqlite3, drizzle-orm, ulid, bcryptjs, cookie, zod.
Dev: drizzle-kit, vitest, @vitejs/plugin-react."
```

---

## Task 3: Configure TypeScript strict, Vitest, gitignore, env

**Files:**
- Modify: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Replace: `.gitignore`

- [ ] **Step 1: Enable strict TS settings**

Open `tsconfig.json`. Inside `"compilerOptions"`, ensure these are set (add or overwrite):

```json
"strict": true,
"noUncheckedIndexedAccess": true,
"noImplicitOverride": true
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

In `package.json`, replace the `scripts` block with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx scripts/migrate.ts"
}
```

Then install tsx for the migrate script: `pnpm add -D tsx`

- [ ] **Step 4: Create `.env.example`**

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# App
APP_PASSWORD_HASH=    # bcrypt hash of your shared password; generate with: node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" mySecret
SESSION_SECRET=       # 32+ random bytes, hex-encoded; generate with: openssl rand -hex 32

# Database
DATABASE_PATH=./data/sprachpartner.db

# LLM models (overridable)
TUTOR_MODEL=gpt-4o
EXTRACTOR_MODEL=gpt-4o-mini
SUMMARIZER_MODEL=gpt-4o-mini
```

- [ ] **Step 5: Replace the gitignore**

Replace the contents of `.gitignore` with:

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.*

# Next.js
.next/
out/
build/

# Production
*.log

# Env
.env
.env.local
.env.*.local

# Data
data/
*.db
*.db-journal

# IDE
.DS_Store
.vscode/
.idea/

# Legacy Python artefacts (kept in legacy/)
legacy/__pycache__/
legacy/.venv/
```

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json vitest.config.ts package.json pnpm-lock.yaml .env.example .gitignore
git commit -m "chore: configure strict TS, vitest, scripts, env, gitignore"
```

---

## Task 4: Tailwind base + design tokens

**Files:**
- Modify: `app/globals.css`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Carry over the warm-paper design tokens from the static site**

Replace `app/globals.css` contents with:

```css
@import "tailwindcss";

@theme {
  --color-bg: #f7f4ec;
  --color-bg-soft: #f1ede2;
  --color-surface: #ffffff;
  --color-surface-warm: #fbf8f1;
  --color-ink: #1d2025;
  --color-ink-strong: #0f1115;
  --color-ink-soft: #4d545d;
  --color-muted: #8a8f97;
  --color-accent: #b04a2b;
  --color-accent-deep: #883518;
  --color-accent-soft: #f4dccf;
  --color-accent-tint: #fbeee5;
  --color-correct: #4f7c4f;
  --color-correct-soft: #e9f0e4;
  --color-wrong: #b5483d;
  --color-wrong-soft: #f6e3df;

  --font-display: "Fraunces", "Georgia", serif;
  --font-serif: "Source Serif 4", "Georgia", serif;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

html, body {
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: Replace `app/layout.tsx` to load fonts**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sprachpartner",
  description: "German learning chat",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Inter:wght@400;500;600&family=JetBrains+Mono&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Replace `app/page.tsx` with a "scaffolding works" placeholder**

```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="font-display text-3xl text-[color:var(--color-ink-strong)]">
        Sprachpartner
      </h1>
      <p className="mt-4 text-[color:var(--color-ink-soft)]">
        Bootstrap working. Implementation in progress.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

Run: `pnpm dev`
Expected: page loads at `http://localhost:3000` showing the heading "Sprachpartner" in Fraunces serif on warm-paper background.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx app/page.tsx tailwind.config.ts
git commit -m "feat: tailwind base + warm-paper design tokens"
```

---

# Phase 1 — Database + auth foundation

## Task 5: Drizzle schema

**Files:**
- Create: `lib/db/schema.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Write the schema**

Create `lib/db/schema.ts`:

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  scenario: text("scenario"),
  summary: text("summary"),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  role: text("role", { enum: ["user", "tutor"] }).notNull(),
  contentMd: text("content_md").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const vocabCards = sqliteTable("vocab_cards", {
  id: text("id").primaryKey(),
  term: text("term").notNull().unique(),
  definitionEn: text("definition_en").notNull(),
  sourceSentence: text("source_sentence").notNull(),
  sourceSessionId: text("source_session_id").references(() => sessions.id),
  leitnerBox: integer("leitner_box").notNull().default(1),
  dueAt: integer("due_at").notNull(),
  lastReviewedAt: integer("last_reviewed_at"),
  createdAt: integer("created_at").notNull(),
});

export const mistakes = sqliteTable("mistakes", {
  id: text("id").primaryKey(),
  sourceMessageId: text("source_message_id").notNull().references(() => messages.id),
  spanStart: integer("span_start").notNull(),
  spanEnd: integer("span_end").notNull(),
  original: text("original").notNull(),
  correction: text("correction").notNull(),
  explanation: text("explanation").notNull(),
  category: text("category"),
  resolvedAt: integer("resolved_at"),
  correctQuizCount: integer("correct_quiz_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const userState = sqliteTable("user_state", {
  id: integer("id").primaryKey(),
  level: text("level").notNull().default("B1"),
  name: text("name"),
  lastSummary: text("last_summary"),
});

export const lookupCache = sqliteTable("lookup_cache", {
  term: text("term").primaryKey(),
  entryJson: text("entry_json").notNull(),
  cachedAt: integer("cached_at").notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type VocabCard = typeof vocabCards.$inferSelect;
export type Mistake = typeof mistakes.$inferSelect;
export type UserState = typeof userState.$inferSelect;
export type LookupCache = typeof lookupCache.$inferSelect;
```

- [ ] **Step 2: Write the Drizzle config**

Create `drizzle.config.ts`:

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH || "./data/sprachpartner.db",
  },
} satisfies Config;
```

- [ ] **Step 3: Generate the first migration**

```bash
pnpm db:generate
```

Expected: a file like `drizzle/0000_*.sql` is created with `CREATE TABLE` statements for all six tables.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle.config.ts drizzle/
git commit -m "feat(db): drizzle schema + initial migration"
```

---

## Task 6: DB client + migration runner

**Files:**
- Create: `lib/db/client.ts`
- Create: `scripts/migrate.ts`

- [ ] **Step 1: Write the client**

Create `lib/db/client.ts`:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH || "./data/sprachpartner.db";
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
```

- [ ] **Step 2: Write the migration runner**

Create `scripts/migrate.ts`:

```ts
import "dotenv/config";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";

const dbPath = process.env.DATABASE_PATH || "./data/sprachpartner.db";
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");
sqlite.close();
```

Add `dotenv` to dev deps:

```bash
pnpm add -D dotenv
```

- [ ] **Step 3: Run the migration**

```bash
pnpm db:migrate
```

Expected: `Migrations applied.` and a new file at `./data/sprachpartner.db`.

- [ ] **Step 4: Verify the schema**

```bash
sqlite3 ./data/sprachpartner.db ".tables"
```

Expected: lists `sessions`, `messages`, `vocab_cards`, `mistakes`, `user_state`, `lookup_cache`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/client.ts scripts/migrate.ts package.json pnpm-lock.yaml
git commit -m "feat(db): client with WAL + foreign-keys, migration runner"
```

---

## Task 7: SRS Leitner module (full TDD)

**Files:**
- Create: `lib/srs/leitner.ts`
- Create: `test/srs/leitner.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/srs/leitner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { gradeCard, BOX_INTERVALS_DAYS } from "@/lib/srs/leitner";

const DAY_MS = 86_400_000;
const now = 1_700_000_000_000;

describe("BOX_INTERVALS_DAYS", () => {
  it("matches spec: [1, 3, 7, 14, 30]", () => {
    expect(BOX_INTERVALS_DAYS).toEqual([1, 3, 7, 14, 30]);
  });
});

describe("gradeCard", () => {
  it("again sends card back to box 1 with 1-day interval", () => {
    const r = gradeCard({ leitnerBox: 4, grade: "again", now });
    expect(r.leitnerBox).toBe(1);
    expect(r.dueAt).toBe(now + 1 * DAY_MS);
  });

  it("good advances box by 1 and schedules by new interval", () => {
    const r = gradeCard({ leitnerBox: 2, grade: "good", now });
    expect(r.leitnerBox).toBe(3);
    expect(r.dueAt).toBe(now + 7 * DAY_MS);
  });

  it("good at box 5 stays at box 5", () => {
    const r = gradeCard({ leitnerBox: 5, grade: "good", now });
    expect(r.leitnerBox).toBe(5);
    expect(r.dueAt).toBe(now + 30 * DAY_MS);
  });

  it("easy advances by 2", () => {
    const r = gradeCard({ leitnerBox: 1, grade: "easy", now });
    expect(r.leitnerBox).toBe(3);
    expect(r.dueAt).toBe(now + 7 * DAY_MS);
  });

  it("easy at box 4 caps at box 5", () => {
    const r = gradeCard({ leitnerBox: 4, grade: "easy", now });
    expect(r.leitnerBox).toBe(5);
    expect(r.dueAt).toBe(now + 30 * DAY_MS);
  });

  it("rejects invalid box", () => {
    expect(() => gradeCard({ leitnerBox: 0, grade: "good", now })).toThrow();
    expect(() => gradeCard({ leitnerBox: 6, grade: "good", now })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

Expected: all 6 tests fail with "Cannot find module '@/lib/srs/leitner'" or similar.

- [ ] **Step 3: Implement the module**

Create `lib/srs/leitner.ts`:

```ts
export const BOX_INTERVALS_DAYS: readonly number[] = [1, 3, 7, 14, 30];
const DAY_MS = 86_400_000;
const MAX_BOX = BOX_INTERVALS_DAYS.length; // 5

export type Grade = "again" | "good" | "easy";

export interface GradeInput {
  leitnerBox: number;
  grade: Grade;
  now: number;
}

export interface GradeResult {
  leitnerBox: number;
  dueAt: number;
}

export function gradeCard(input: GradeInput): GradeResult {
  const { leitnerBox, grade, now } = input;
  if (!Number.isInteger(leitnerBox) || leitnerBox < 1 || leitnerBox > MAX_BOX) {
    throw new RangeError(`leitnerBox must be 1..${MAX_BOX}, got ${leitnerBox}`);
  }

  let nextBox: number;
  switch (grade) {
    case "again":
      nextBox = 1;
      break;
    case "good":
      nextBox = Math.min(leitnerBox + 1, MAX_BOX);
      break;
    case "easy":
      nextBox = Math.min(leitnerBox + 2, MAX_BOX);
      break;
  }

  const intervalDays = BOX_INTERVALS_DAYS[nextBox - 1]!;
  return { leitnerBox: nextBox, dueAt: now + intervalDays * DAY_MS };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/srs/leitner.ts test/srs/leitner.test.ts
git commit -m "feat(srs): leitner grading with [1,3,7,14,30]-day intervals"
```

---

## Task 8: Auth helpers (password + session token, full TDD)

**Files:**
- Create: `lib/auth/password.ts`
- Create: `lib/auth/session.ts`
- Create: `test/auth/password.test.ts`
- Create: `test/auth/session.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/auth/password.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password", () => {
  it("hashPassword produces a non-empty string different from input", async () => {
    const h = await hashPassword("hunter2");
    expect(h).not.toBe("hunter2");
    expect(h.length).toBeGreaterThan(20);
  });

  it("verifyPassword returns true for the matching password", async () => {
    const h = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", h)).toBe(true);
  });

  it("verifyPassword returns false for a wrong password", async () => {
    const h = await hashPassword("hunter2");
    expect(await verifyPassword("nope", h)).toBe(false);
  });
});
```

Create `test/auth/session.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { signSession, verifySession } from "@/lib/auth/session";

const SECRET = "0".repeat(64);

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

describe("session token", () => {
  it("verifySession returns true for a freshly signed token", () => {
    const t = signSession({ issuedAt: Date.now() });
    expect(verifySession(t)).toBe(true);
  });

  it("verifySession returns false for a tampered token", () => {
    const t = signSession({ issuedAt: Date.now() });
    const tampered = t.slice(0, -2) + (t.endsWith("aa") ? "bb" : "aa");
    expect(verifySession(tampered)).toBe(false);
  });

  it("verifySession returns false for a token signed with a different secret", () => {
    const t = signSession({ issuedAt: Date.now() });
    process.env.SESSION_SECRET = "1".repeat(64);
    expect(verifySession(t)).toBe(false);
  });

  it("verifySession returns false for tokens older than 90 days", () => {
    const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;
    const t = signSession({ issuedAt: ninetyOneDaysAgo });
    expect(verifySession(t)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

Expected: all 7 tests fail (modules don't exist).

- [ ] **Step 3: Implement password helpers**

Create `lib/auth/password.ts`:

```ts
import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Implement session helpers**

Create `lib/auth/session.ts`:

```ts
import crypto from "node:crypto";

const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

interface Payload {
  issuedAt: number;
}

function secret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET not set");
  return Buffer.from(s, "hex");
}

function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("hex");
}

export function signSession(payload: Payload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function verifySession(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  if (!body || !sig) return false;

  const expected = sign(body);
  // constant-time compare
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (typeof payload.issuedAt !== "number") return false;
    if (Date.now() - payload.issuedAt > MAX_AGE_MS) return false;
    return true;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE = "sp_session";
export const SESSION_MAX_AGE_S = MAX_AGE_MS / 1000;
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/ test/auth/
git commit -m "feat(auth): bcrypt password helpers + signed-token sessions"
```

---

## Task 9: Middleware auth gate

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Write the middleware**

Create `middleware.ts` at repo root:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";

export const config = {
  matcher: ["/((?!login|api/auth/login|_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !verifySession(token)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
```

- [ ] **Step 2: Smoke-test in the browser**

In `.env.local`, set:

```
SESSION_SECRET=0000000000000000000000000000000000000000000000000000000000000000
APP_PASSWORD_HASH=$2a$10$Nd5fQ2hPLfH2.0VvBXr7DOmzd5j6gv5xJUzXgPGuJp0YmqLgN8K2y
```

(The hash above is bcrypt of `test`. Replace before deploy.)

Run: `pnpm dev` and visit `http://localhost:3000/`.
Expected: redirected to `/login`.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat(auth): middleware redirects unauthenticated to /login"
```

---

## Task 10: Login page + login route

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/api/auth/login/route.ts`

- [ ] **Step 1: Write the login API route**

Create `app/api/auth/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth/session";
import { z } from "zod";

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });

  const ok = await verifyPassword(parsed.data.password, hash);
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });

  const token = signSession({ issuedAt: Date.now() });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
```

- [ ] **Step 2: Write the login page**

Create `app/login/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) router.push("/");
    else setError("Wrong password.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="font-display text-3xl text-[color:var(--color-ink-strong)]">Sprachpartner</h1>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="rounded border border-[color:var(--color-muted)] bg-white px-3 py-2 outline-none focus:border-[color:var(--color-accent)]"
        />
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded bg-[color:var(--color-ink-strong)] px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? "…" : "Enter"}
        </button>
        {error && <p className="text-sm text-[color:var(--color-wrong)]">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Smoke-test**

Run: `pnpm dev`. Visit `http://localhost:3000/`, get redirected to `/login`. Enter `test` (or whatever your password is). Expected: redirected to `/` with session cookie set. Visiting `/` again no longer redirects.

- [ ] **Step 4: Commit**

```bash
git add app/login app/api/auth
git commit -m "feat(auth): login page + POST /api/auth/login"
```

---

## Task 11: Query helpers (TDD)

**Files:**
- Create: `lib/db/queries.ts`
- Create: `test/db/queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/db/queries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/lib/db/schema";
import { ulid } from "ulid";
import {
  createSession,
  appendMessage,
  upsertVocabCard,
  insertMistake,
  getDueCardsCount,
  getUnresolvedMistakesCount,
} from "@/lib/db/queries";

let db: ReturnType<typeof drizzle>;

beforeEach(() => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
});

describe("createSession", () => {
  it("inserts a session with id, startedAt, scenario", async () => {
    const id = await createSession(db, { scenario: "Bäckerei" });
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

describe("appendMessage", () => {
  it("inserts a user message linked to the session", async () => {
    const sid = await createSession(db, { scenario: "free" });
    const mid = await appendMessage(db, { sessionId: sid, role: "user", contentMd: "Hallo!" });
    expect(typeof mid).toBe("string");
  });
});

describe("upsertVocabCard", () => {
  it("inserts a new card", async () => {
    const sid = await createSession(db, { scenario: "free" });
    await upsertVocabCard(db, {
      term: "zumindest",
      definitionEn: "at least",
      sourceSentence: "Zumindest hier ist es ruhig.",
      sourceSessionId: sid,
    });
    expect(await getDueCardsCount(db, Date.now() + 99 * 86400000)).toBe(1);
  });

  it("is a no-op if the term already exists (case-insensitive)", async () => {
    const sid = await createSession(db, { scenario: "free" });
    await upsertVocabCard(db, {
      term: "Anhieb",
      definitionEn: "a try",
      sourceSentence: "auf Anhieb.",
      sourceSessionId: sid,
    });
    await upsertVocabCard(db, {
      term: "anhieb",
      definitionEn: "different",
      sourceSentence: "elsewhere.",
      sourceSessionId: sid,
    });
    expect(await getDueCardsCount(db, Date.now() + 99 * 86400000)).toBe(1);
  });
});

describe("insertMistake + getUnresolvedMistakesCount", () => {
  it("counts only unresolved mistakes", async () => {
    const sid = await createSession(db, { scenario: "free" });
    const mid = await appendMessage(db, { sessionId: sid, role: "user", contentMd: "Ich habe gegangen." });
    await insertMistake(db, {
      sourceMessageId: mid,
      spanStart: 0,
      spanEnd: 16,
      original: "Ich habe gegangen",
      correction: "Ich bin gegangen",
      explanation: "Movement verbs take sein.",
    });
    expect(await getUnresolvedMistakesCount(db)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

Expected: failures referencing missing `lib/db/queries.ts`.

- [ ] **Step 3: Implement the queries module**

Create `lib/db/queries.ts`:

```ts
import { ulid } from "ulid";
import { eq, sql, lte, isNull, and } from "drizzle-orm";
import type { DB } from "./client";
import * as s from "./schema";

export async function createSession(
  db: DB,
  args: { scenario: string | null },
): Promise<string> {
  const id = ulid();
  await db.insert(s.sessions).values({
    id,
    startedAt: Date.now(),
    scenario: args.scenario,
  });
  return id;
}

export async function endSession(
  db: DB,
  args: { sessionId: string; summary: string | null },
): Promise<void> {
  await db
    .update(s.sessions)
    .set({ endedAt: Date.now(), summary: args.summary })
    .where(eq(s.sessions.id, args.sessionId));
}

export async function appendMessage(
  db: DB,
  args: { sessionId: string; role: "user" | "tutor"; contentMd: string },
): Promise<string> {
  const id = ulid();
  await db.insert(s.messages).values({
    id,
    sessionId: args.sessionId,
    role: args.role,
    contentMd: args.contentMd,
    createdAt: Date.now(),
  });
  return id;
}

export async function upsertVocabCard(
  db: DB,
  args: {
    term: string;
    definitionEn: string;
    sourceSentence: string;
    sourceSessionId: string;
  },
): Promise<void> {
  await db
    .insert(s.vocabCards)
    .values({
      id: ulid(),
      term: args.term,
      definitionEn: args.definitionEn,
      sourceSentence: args.sourceSentence,
      sourceSessionId: args.sourceSessionId,
      leitnerBox: 1,
      dueAt: Date.now(),
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
}

export async function insertMistake(
  db: DB,
  args: {
    sourceMessageId: string;
    spanStart: number;
    spanEnd: number;
    original: string;
    correction: string;
    explanation: string;
    category?: string | null;
  },
): Promise<void> {
  await db.insert(s.mistakes).values({
    id: ulid(),
    sourceMessageId: args.sourceMessageId,
    spanStart: args.spanStart,
    spanEnd: args.spanEnd,
    original: args.original,
    correction: args.correction,
    explanation: args.explanation,
    category: args.category ?? null,
    createdAt: Date.now(),
  });
}

export async function getDueCardsCount(db: DB, asOf = Date.now()): Promise<number> {
  const r = await db
    .select({ c: sql<number>`count(*)` })
    .from(s.vocabCards)
    .where(lte(s.vocabCards.dueAt, asOf));
  return Number(r[0]?.c ?? 0);
}

export async function getUnresolvedMistakesCount(db: DB): Promise<number> {
  const r = await db
    .select({ c: sql<number>`count(*)` })
    .from(s.mistakes)
    .where(isNull(s.mistakes.resolvedAt));
  return Number(r[0]?.c ?? 0);
}

export async function getRecentVocab(db: DB, limit = 10): Promise<s.VocabCard[]> {
  return db
    .select()
    .from(s.vocabCards)
    .orderBy(sql`${s.vocabCards.createdAt} DESC`)
    .limit(limit);
}

export async function getRecentUnresolvedMistakes(db: DB, limit = 10): Promise<s.Mistake[]> {
  return db
    .select()
    .from(s.mistakes)
    .where(isNull(s.mistakes.resolvedAt))
    .orderBy(sql`${s.mistakes.createdAt} DESC`)
    .limit(limit);
}

export async function getOrCreateUserState(db: DB): Promise<s.UserState> {
  const existing = await db.select().from(s.userState).where(eq(s.userState.id, 1)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(s.userState).values({ id: 1, level: "B1" });
  const row = await db.select().from(s.userState).where(eq(s.userState.id, 1)).limit(1);
  if (!row[0]) throw new Error("user_state singleton insert failed");
  return row[0];
}
```

Note: `term` uniqueness handles dedupe at the SQL level; case-insensitivity is enforced by `lower()` indexing on read. Since the spec says case-insensitive uniqueness, add this to the schema in the same task — re-open `lib/db/schema.ts` and change the term column:

```ts
term: text("term").notNull().unique(),
```

→

```ts
term: text("term").notNull(),
```

and append at the file bottom:

```ts
import { uniqueIndex } from "drizzle-orm/sqlite-core";
// (move this import up to the top with the others)

export const vocabCardsTermIdx = uniqueIndex("vocab_cards_term_lower_uniq").on(
  sql`lower(${vocabCards.term})`,
);
```

Then regenerate migrations:

```bash
rm -rf drizzle && pnpm db:generate
```

(Single-user, fresh DB; safe to wipe migrations during MVP.)

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

Expected: all 5 query tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts lib/db/schema.ts test/db/queries.test.ts drizzle/
git commit -m "feat(db): query helpers with case-insensitive term dedupe"
```

---

# Phase 2 — LLM agents

## Task 12: OpenAI client + memory context builder

**Files:**
- Create: `lib/agents/openai.ts`
- Create: `lib/memory/context-builder.ts`
- Create: `test/memory/context-builder.test.ts`

- [ ] **Step 1: Write the OpenAI client wrapper**

Create `lib/agents/openai.ts`:

```ts
import OpenAI from "openai";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const MODELS = {
  tutor: process.env.TUTOR_MODEL || "gpt-4o",
  extractor: process.env.EXTRACTOR_MODEL || "gpt-4o-mini",
  summarizer: process.env.SUMMARIZER_MODEL || "gpt-4o-mini",
} as const;
```

- [ ] **Step 2: Write the failing context-builder test**

Create `test/memory/context-builder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTutorMemoryBlock } from "@/lib/memory/context-builder";

describe("buildTutorMemoryBlock", () => {
  it("includes level, name, last summary, recent vocab, recent mistakes", () => {
    const block = buildTutorMemoryBlock({
      level: "B1",
      name: "Saeed",
      lastSummary: "Last time we talked about Saturday's hike.",
      recentVocab: ["zumindest", "Anhieb"],
      recentMistakes: ["aux: sein vs. haben with motion verbs"],
      scenario: "free",
    });

    expect(block).toContain("B1");
    expect(block).toContain("Saeed");
    expect(block).toContain("Saturday's hike");
    expect(block).toContain("zumindest");
    expect(block).toContain("Anhieb");
    expect(block).toContain("sein vs. haben");
  });

  it("omits sections that are empty without leaving placeholders", () => {
    const block = buildTutorMemoryBlock({
      level: "A2",
      name: null,
      lastSummary: null,
      recentVocab: [],
      recentMistakes: [],
      scenario: null,
    });
    expect(block).toContain("A2");
    expect(block).not.toContain("undefined");
    expect(block).not.toContain("null");
    expect(block).not.toMatch(/^Recent vocab:\s*$/m);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test
```

Expected: 2 failures pointing at the missing module.

- [ ] **Step 4: Implement the builder**

Create `lib/memory/context-builder.ts`:

```ts
export interface MemoryInput {
  level: string;
  name: string | null;
  lastSummary: string | null;
  recentVocab: string[];
  recentMistakes: string[];
  scenario: string | null;
}

export function buildTutorMemoryBlock(m: MemoryInput): string {
  const lines: string[] = [];
  lines.push(`User CEFR level: ${m.level}`);
  if (m.name) lines.push(`User's name: ${m.name}`);
  if (m.scenario && m.scenario !== "free") {
    lines.push(`Current scenario: ${m.scenario}`);
  }
  if (m.lastSummary) {
    lines.push("");
    lines.push("Recap of last session:");
    lines.push(m.lastSummary);
  }
  if (m.recentVocab.length) {
    lines.push("");
    lines.push("Recently saved vocab (try to weave these in naturally):");
    lines.push(m.recentVocab.map((v) => `- ${v}`).join("\n"));
  }
  if (m.recentMistakes.length) {
    lines.push("");
    lines.push("Recent unresolved mistake patterns (probe these gently):");
    lines.push(m.recentMistakes.map((v) => `- ${v}`).join("\n"));
  }
  return lines.join("\n");
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/agents/openai.ts lib/memory/ test/memory/
git commit -m "feat(memory): tutor context block builder + openai client"
```

---

## Task 13: Tutor agent (streaming)

**Files:**
- Create: `lib/agents/tutor.ts`

- [ ] **Step 1: Implement the tutor agent**

Create `lib/agents/tutor.ts`:

```ts
import { openai, MODELS } from "./openai";

export interface TutorTurnArgs {
  memoryBlock: string;
  history: Array<{ role: "user" | "tutor"; content: string }>;
}

const SYSTEM = `You are a patient German conversation partner. Speak only in German. Match the user's CEFR level (provided below) — avoid vocabulary far above it.

Mirror-correct silently. If the user wrote something ungrammatical or awkward, restate the same idea correctly inside your reply without calling out the mistake. Do not write meta-commentary about their German.

Use Markdown sparingly: **bold** for one or two key words per turn, and lists only when genuinely helpful. End each reply with a question or a conversational invitation so the chat keeps moving.

If a scenario was chosen, stay in it. Otherwise be a curious, warm conversation partner.

USER MEMORY:
{{MEMORY_BLOCK}}`;

export async function tutorStream(args: TutorTurnArgs): Promise<ReadableStream<Uint8Array>> {
  const messages = [
    { role: "system" as const, content: SYSTEM.replace("{{MEMORY_BLOCK}}", args.memoryBlock) },
    ...args.history.map((m) => ({
      role: m.role === "tutor" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
  ];

  const stream = await openai.chat.completions.create({
    model: MODELS.tutor,
    stream: true,
    temperature: 0.7,
    messages,
  });

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
```

- [ ] **Step 2: Smoke-test (manual)**

Create a one-off scratch file `scripts/smoke-tutor.ts`:

```ts
import "dotenv/config";
import { tutorStream } from "@/lib/agents/tutor";

(async () => {
  const stream = await tutorStream({
    memoryBlock: "User CEFR level: B1\n",
    history: [{ role: "user", content: "Hallo, wie geht's?" }],
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
    process.stdout.write(decoder.decode(value));
  }
  console.log("\n--- length:", out.length);
})();
```

Run: `pnpm tsx scripts/smoke-tutor.ts`
Expected: streams a German greeting + question. Don't commit this file — delete after.

- [ ] **Step 3: Commit**

```bash
rm scripts/smoke-tutor.ts
git add lib/agents/tutor.ts
git commit -m "feat(agents): streaming tutor with mirror-correct system prompt"
```

---

## Task 14: Vocab extractor

**Files:**
- Create: `lib/agents/vocab-extractor.ts`

- [ ] **Step 1: Write the extractor**

Create `lib/agents/vocab-extractor.ts`:

```ts
import { z } from "zod";
import { openai, MODELS } from "./openai";

const SYSTEM = `You extract German vocabulary items worth saving from a passage of German text. Return ONLY valid JSON of shape:

{ "items": [ { "term": string, "definition_en": string, "source_sentence": string }, ... ] }

HARD RULES:
- COGNATE REJECTION TEST: For each candidate, ask: "Could a monolingual English speaker guess the meaning within 2 seconds from spelling alone?" If yes, REJECT it. Reject international loanwords (Information, Projekt, Sektor, Manager, Team, Liga), Latin/Greek roots transparent to English (Struktur, Position, Funktion, Diskussion), transparent compounds (Hauptbahnhof, Spielplatz), and items differing from English by ≤3 letters excluding inflection.
- PREFER native German that trips English speakers:
  - Germanic / separable verbs: durchsetzen, vorhaben, bewältigen, auffallen, gelingen, beibringen, abklären
  - Verb + preposition rections: sich kümmern um, hinweisen auf, bestehen aus, achten auf
  - Discourse particles and connectors: allerdings, jedoch, sofern, kaum, zwar, demnach, ohnehin, immerhin, freilich
  - Opaque compounds: Feierabend, Maßstab, Ausweis, Anlass, Beifall, Niederlage
  - Idiomatic adjectives/adverbs: unentbehrlich, ausgerechnet, einleuchtend, anspruchsvoll, schlichtweg
- Phrases and idioms with ≥2 whitespace-separated tokens are welcome (e.g., "auf Anhieb", "es kommt darauf an", "zur Sprache bringen").
- source_sentence MUST be a sentence taken verbatim from the input that contains the term.
- definition_en is short, lowercase unless proper noun (1-6 words).
- Return 0-6 items per call. Be selective — only what's actually worth a flashcard.

OUTPUT: a single JSON object. No prose, no markdown.`;

const ExtractedItem = z.object({
  term: z.string().min(1),
  definition_en: z.string().min(1),
  source_sentence: z.string().min(1),
});
const ExtractorOutput = z.object({ items: z.array(ExtractedItem) });

export interface ExtractedVocab {
  term: string;
  definitionEn: string;
  sourceSentence: string;
}

export async function extractVocab(tutorReply: string): Promise<ExtractedVocab[]> {
  const completion = await openai.chat.completions.create({
    model: MODELS.extractor,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: tutorReply },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = ExtractorOutput.safeParse(JSON.parse(raw));
  if (!parsed.success) return [];

  return parsed.data.items.map((i) => ({
    term: i.term,
    definitionEn: i.definition_en,
    sourceSentence: i.source_sentence,
  }));
}
```

- [ ] **Step 2: Smoke-test**

Create `scripts/smoke-vocab.ts`:

```ts
import "dotenv/config";
import { extractVocab } from "@/lib/agents/vocab-extractor";

(async () => {
  const input =
    "Allerdings hat es gestern ohne Anlass angefangen zu regnen. Ich musste mich kümmern um die Kinder, weil meine Frau nicht da war.";
  const out = await extractVocab(input);
  console.log(JSON.stringify(out, null, 2));
})();
```

Run: `pnpm tsx scripts/smoke-vocab.ts`
Expected: 2-4 items like `allerdings`, `Anlass`, `sich kümmern um`. No `Kinder`, no `Frau` (transparent). Delete script.

- [ ] **Step 3: Commit**

```bash
rm scripts/smoke-vocab.ts
git add lib/agents/vocab-extractor.ts
git commit -m "feat(agents): vocab extractor with cognate-rejection rules"
```

---

## Task 15: Mistake extractor

**Files:**
- Create: `lib/agents/mistake-extractor.ts`

- [ ] **Step 1: Write the extractor**

Create `lib/agents/mistake-extractor.ts`:

```ts
import { z } from "zod";
import { openai, MODELS } from "./openai";

const SYSTEM = `You find grammar mistakes in German written by a language learner. Return ONLY valid JSON of shape:

{ "items": [ { "span_start": int, "span_end": int, "original": string, "correction": string, "explanation": string, "category": string }, ... ] }

HARD RULES:
- Only flag real mistakes: wrong auxiliary, wrong case, wrong word order, wrong gender, wrong preposition, wrong conjugation, awkward vocab choice. Do not flag stylistic preferences.
- span_start and span_end are 0-indexed character offsets into the INPUT TEXT. span_end is exclusive.
- original is the verbatim substring at those offsets.
- correction is the minimal fix (just the substring, not the whole sentence).
- explanation is ONE short sentence in English explaining the rule, ≤120 chars.
- category is one of: "auxiliary", "case", "word_order", "gender", "preposition", "conjugation", "vocab_choice", "other".
- If there are no mistakes, return { "items": [] }.

OUTPUT: a single JSON object. No prose, no markdown.`;

const MistakeItem = z.object({
  span_start: z.number().int().nonnegative(),
  span_end: z.number().int().nonnegative(),
  original: z.string().min(1),
  correction: z.string().min(1),
  explanation: z.string().min(1).max(200),
  category: z.string().min(1),
});
const ExtractorOutput = z.object({ items: z.array(MistakeItem) });

export interface ExtractedMistake {
  spanStart: number;
  spanEnd: number;
  original: string;
  correction: string;
  explanation: string;
  category: string;
}

export async function extractMistakes(userText: string): Promise<ExtractedMistake[]> {
  const completion = await openai.chat.completions.create({
    model: MODELS.extractor,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userText },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = ExtractorOutput.safeParse(JSON.parse(raw));
  if (!parsed.success) return [];

  // Defensive: drop items whose span doesn't match the text
  return parsed.data.items
    .filter((m) => userText.slice(m.span_start, m.span_end) === m.original)
    .map((m) => ({
      spanStart: m.span_start,
      spanEnd: m.span_end,
      original: m.original,
      correction: m.correction,
      explanation: m.explanation,
      category: m.category,
    }));
}
```

- [ ] **Step 2: Smoke-test**

Create `scripts/smoke-mistakes.ts`:

```ts
import "dotenv/config";
import { extractMistakes } from "@/lib/agents/mistake-extractor";

(async () => {
  const out = await extractMistakes("Ich habe gestern zur Schule gegangen und habe meine Freund getroffen.");
  console.log(JSON.stringify(out, null, 2));
})();
```

Run: `pnpm tsx scripts/smoke-mistakes.ts`
Expected: at least one mistake — "habe ... gegangen" should be flagged as `auxiliary`, and "meine Freund" as `gender`. Delete the script.

- [ ] **Step 3: Commit**

```bash
rm scripts/smoke-mistakes.ts
git add lib/agents/mistake-extractor.ts
git commit -m "feat(agents): mistake extractor with span verification"
```

---

## Task 16: Session summarizer

**Files:**
- Create: `lib/agents/summarizer.ts`

- [ ] **Step 1: Write the summarizer**

Create `lib/agents/summarizer.ts`:

```ts
import { openai, MODELS } from "./openai";

const SYSTEM = `You summarize a German-learning chat session into 2 sentences in English. First sentence: what topic was discussed. Second sentence: what grammar areas the learner struggled with (if any). Keep it under 280 characters total. Plain text, no markdown.`;

export async function summarizeSession(transcript: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODELS.summarizer,
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: transcript },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() || "";
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agents/summarizer.ts
git commit -m "feat(agents): session summarizer (2-sentence)"
```

---

# Phase 3 — API routes

## Task 17: POST /api/chat — stream tutor reply

**Files:**
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/chat/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { appendMessage, getOrCreateUserState, getRecentVocab, getRecentUnresolvedMistakes } from "@/lib/db/queries";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { buildTutorMemoryBlock } from "@/lib/memory/context-builder";
import { tutorStream } from "@/lib/agents/tutor";

export const runtime = "nodejs";

const Body = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { sessionId, message } = parsed.data;

  // Persist user message
  const userMessageId = await appendMessage(db, {
    sessionId,
    role: "user",
    contentMd: message,
  });

  // Load history (chronological, including the just-saved user message)
  const history = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, sessionId));

  // Load memory inputs
  const [state, vocab, mistakes, session] = await Promise.all([
    getOrCreateUserState(db),
    getRecentVocab(db, 10),
    getRecentUnresolvedMistakes(db, 10),
    db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).limit(1),
  ]);

  const memoryBlock = buildTutorMemoryBlock({
    level: state.level,
    name: state.name,
    lastSummary: state.lastSummary,
    recentVocab: vocab.map((v) => v.term),
    recentMistakes: mistakes.map((m) => `${m.category ?? "?"}: ${m.explanation}`),
    scenario: session[0]?.scenario ?? null,
  });

  const stream = await tutorStream({
    memoryBlock,
    history: history.map((h) => ({ role: h.role as "user" | "tutor", content: h.contentMd })),
  });

  // We need to (a) stream to client, (b) buffer the full reply server-side, (c) persist when done.
  // Tee the stream: one branch to client, one to buffer.
  const [toClient, toBuffer] = stream.tee();

  (async () => {
    const reader = toBuffer.getReader();
    const decoder = new TextDecoder();
    let full = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      full += decoder.decode(value);
    }
    if (full.trim()) {
      await appendMessage(db, { sessionId, role: "tutor", contentMd: full });
    }
  })();

  return new Response(toClient, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-User-Message-Id": userMessageId,
    },
  });
}
```

- [ ] **Step 2: Smoke-test**

Run dev server: `pnpm dev`. In another terminal create a session row directly:

```bash
sqlite3 ./data/sprachpartner.db "INSERT INTO sessions (id, started_at, scenario) VALUES ('test01', $(date +%s)000, 'free');"
```

Then:

```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Cookie: sp_session=$(node -e "require('dotenv').config(); const {signSession} = require('./lib/auth/session'); console.log(signSession({issuedAt: Date.now()}))")" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test01","message":"Hallo, wie geht es dir?"}'
```

Expected: German reply streams to stdout. After completion, the messages table has 2 new rows.

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/
git commit -m "feat(api): POST /api/chat streams tutor reply, persists both messages"
```

---

## Task 18: POST /api/extract/vocab + POST /api/extract/mistakes

**Files:**
- Create: `app/api/extract/vocab/route.ts`
- Create: `app/api/extract/mistakes/route.ts`

- [ ] **Step 1: Write the vocab route**

Create `app/api/extract/vocab/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { upsertVocabCard } from "@/lib/db/queries";
import { extractVocab } from "@/lib/agents/vocab-extractor";

export const runtime = "nodejs";

const Body = z.object({
  sessionId: z.string().min(1),
  tutorReply: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const items = await extractVocab(parsed.data.tutorReply);
    for (const item of items) {
      await upsertVocabCard(db, {
        term: item.term,
        definitionEn: item.definitionEn,
        sourceSentence: item.sourceSentence,
        sourceSessionId: parsed.data.sessionId,
      });
    }
    return NextResponse.json({ ok: true, added: items.length });
  } catch (err) {
    console.error("[extract/vocab]", err);
    return NextResponse.json({ ok: false, added: 0 }, { status: 200 });
  }
}
```

- [ ] **Step 2: Write the mistakes route**

Create `app/api/extract/mistakes/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { insertMistake } from "@/lib/db/queries";
import { extractMistakes } from "@/lib/agents/mistake-extractor";

export const runtime = "nodejs";

const Body = z.object({
  messageId: z.string().min(1),
  text: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const items = await extractMistakes(parsed.data.text);
    for (const m of items) {
      await insertMistake(db, {
        sourceMessageId: parsed.data.messageId,
        spanStart: m.spanStart,
        spanEnd: m.spanEnd,
        original: m.original,
        correction: m.correction,
        explanation: m.explanation,
        category: m.category,
      });
    }
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[extract/mistakes]", err);
    return NextResponse.json({ ok: false, items: [] }, { status: 200 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/extract/
git commit -m "feat(api): vocab + mistake extractor routes (graceful on failure)"
```

---

## Task 19: POST /api/review — grade a card

**Files:**
- Create: `app/api/review/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/review/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { gradeCard, type Grade } from "@/lib/srs/leitner";

export const runtime = "nodejs";

const Body = z.object({
  cardId: z.string().min(1),
  grade: z.enum(["again", "good", "easy"]),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const rows = await db
    .select()
    .from(schema.vocabCards)
    .where(eq(schema.vocabCards.id, parsed.data.cardId))
    .limit(1);
  const card = rows[0];
  if (!card) return NextResponse.json({ ok: false }, { status: 404 });

  const r = gradeCard({
    leitnerBox: card.leitnerBox,
    grade: parsed.data.grade as Grade,
    now: Date.now(),
  });

  await db
    .update(schema.vocabCards)
    .set({ leitnerBox: r.leitnerBox, dueAt: r.dueAt, lastReviewedAt: Date.now() })
    .where(eq(schema.vocabCards.id, card.id));

  return NextResponse.json({ ok: true, ...r });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/review/
git commit -m "feat(api): POST /api/review grades a vocab card with leitner"
```

---

## Task 20: GET/POST /api/session

**Files:**
- Create: `app/api/session/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/session/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { createSession, endSession, getOrCreateUserState } from "@/lib/db/queries";
import { summarizeSession } from "@/lib/agents/summarizer";

export const runtime = "nodejs";

const PostBody = z.discriminatedUnion("op", [
  z.object({ op: z.literal("start"), scenario: z.string().nullable() }),
  z.object({ op: z.literal("end"), sessionId: z.string().min(1) }),
]);

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = PostBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  if (parsed.data.op === "start") {
    const id = await createSession(db, { scenario: parsed.data.scenario });
    return NextResponse.json({ ok: true, sessionId: id });
  }

  // end
  const msgs = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, parsed.data.sessionId))
    .orderBy(schema.messages.createdAt);
  const transcript = msgs.map((m) => `${m.role.toUpperCase()}: ${m.contentMd}`).join("\n");
  const summary = transcript ? await summarizeSession(transcript) : null;
  await endSession(db, { sessionId: parsed.data.sessionId, summary });

  // Roll the summary into user_state.lastSummary
  if (summary) {
    await db.update(schema.userState).set({ lastSummary: summary }).where(eq(schema.userState.id, 1));
  }
  return NextResponse.json({ ok: true, summary });
}

export async function GET() {
  const rows = await db
    .select()
    .from(schema.sessions)
    .orderBy(desc(schema.sessions.startedAt))
    .limit(50);
  return NextResponse.json({ sessions: rows });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/session/
git commit -m "feat(api): /api/session start, end (with summary), list"
```

---

## Task 21: GET /api/lookup — cached dictionary

**Files:**
- Create: `app/api/lookup/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/lookup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { openai, MODELS } from "@/lib/agents/openai";

export const runtime = "nodejs";

const SYSTEM = `You are a German-English dictionary. Given a single German word or short phrase, return JSON:

{ "word": string, "article": string|null, "part_of_speech": string|null, "ipa": string|null, "plural": string|null, "english_definition": string, "german_definition": string|null, "examples": [{ "de": string, "en": string }, ...], "related_words": [string, ...] }

- "article" only for nouns ("der"|"die"|"das"|null).
- 1-3 examples, each a real sentence.
- 0-6 related words: derivations, synonyms, antonyms.
- All English fields concise.

Return only valid JSON. No prose.`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const word = url.searchParams.get("word")?.trim();
  if (!word) return NextResponse.json({ ok: false }, { status: 400 });

  const cached = await db
    .select()
    .from(schema.lookupCache)
    .where(eq(schema.lookupCache.term, word))
    .limit(1);
  if (cached[0]) {
    return NextResponse.json({ ok: true, entry: JSON.parse(cached[0].entryJson) });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODELS.extractor,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: word },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "{}";
    const entry = JSON.parse(raw);

    await db
      .insert(schema.lookupCache)
      .values({ term: word, entryJson: JSON.stringify(entry), cachedAt: Date.now() })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    console.error("[lookup]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/lookup/
git commit -m "feat(api): GET /api/lookup with sqlite cache"
```

---

# Phase 4 — UI

## Task 22: Authed layout + Nav + Counters

**Files:**
- Create: `app/(authed)/layout.tsx`
- Create: `components/shared/Nav.tsx`
- Create: `components/shared/Counters.tsx`
- Create: `app/api/counters/route.ts`

- [ ] **Step 1: Write the counters route**

Create `app/api/counters/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getDueCardsCount, getUnresolvedMistakesCount } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET() {
  const [due, mistakes] = await Promise.all([
    getDueCardsCount(db),
    getUnresolvedMistakesCount(db),
  ]);
  return NextResponse.json({ due, mistakes });
}
```

- [ ] **Step 2: Write the Nav and Counters components**

Create `components/shared/Counters.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

export function Counters() {
  const [due, setDue] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/counters")
      .then((r) => r.json())
      .then((d) => {
        if (!mounted) return;
        setDue(d.due);
        setMistakes(d.mistakes);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex gap-3 text-xs font-medium text-[color:var(--color-ink-soft)]">
      <span>Deck · {due ?? "…"} due</span>
      <span>Mistakes · {mistakes ?? "…"}</span>
    </div>
  );
}
```

Create `components/shared/Nav.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Counters } from "./Counters";

const links = [
  { href: "/", label: "Chat" },
  { href: "/review", label: "Review" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-30 border-b border-[color:var(--color-ink)]/10 bg-[color:var(--color-bg)]/85 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-display text-lg text-[color:var(--color-ink-strong)]">
          Sprachpartner
        </Link>
        <div className="hidden gap-6 sm:flex">
          {links.map((l) => {
            const active = path === l.href || (l.href !== "/" && path.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm font-medium ${
                  active
                    ? "text-[color:var(--color-ink-strong)]"
                    : "text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink-strong)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <Counters />
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Write the authed layout**

Create `app/(authed)/layout.tsx`:

```tsx
import { Nav } from "@/components/shared/Nav";

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      {children}
    </>
  );
}
```

- [ ] **Step 4: Move the existing `app/page.tsx` into the group**

```bash
mkdir -p "app/(authed)"
git mv app/page.tsx "app/(authed)/page.tsx"
```

- [ ] **Step 5: Commit**

```bash
git add app/api/counters/ components/shared/ "app/(authed)/"
git commit -m "feat(ui): authed layout with sticky nav + live counters"
```

---

## Task 23: Chat page — Composer + MessageList shell

**Files:**
- Create: `app/(authed)/page.tsx` (replace)
- Create: `components/chat/Composer.tsx`
- Create: `components/chat/MessageList.tsx`
- Create: `components/chat/TutorMessage.tsx`
- Create: `components/chat/UserMessage.tsx`

- [ ] **Step 1: Write the Composer**

Create `components/chat/Composer.tsx`:

```tsx
"use client";
import { useState } from "react";

interface Props {
  disabled?: boolean;
  onSend: (text: string) => void;
}

export function Composer({ disabled, onSend }: Props) {
  const [text, setText] = useState("");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t border-[color:var(--color-ink)]/10 bg-[color:var(--color-bg)] p-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) submit();
        }}
        placeholder="Schreib auf Deutsch…"
        rows={2}
        className="flex-1 resize-none rounded border border-[color:var(--color-ink)]/10 bg-white px-3 py-2 font-serif text-[15px] outline-none focus:border-[color:var(--color-accent)]"
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="rounded bg-[color:var(--color-ink-strong)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write the message components**

Create `components/chat/UserMessage.tsx`:

```tsx
export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end px-4 py-2">
      <div className="max-w-[75%] rounded-2xl rounded-br-md bg-[color:var(--color-accent-tint)] px-4 py-2 font-serif text-[15px] text-[color:var(--color-ink-strong)] whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}
```

Create `components/chat/TutorMessage.tsx`:

```tsx
export function TutorMessage({ content }: { content: string }) {
  return (
    <div className="flex px-4 py-2">
      <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-white px-4 py-2 font-serif text-[15px] text-[color:var(--color-ink)] shadow-sm whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}
```

Create `components/chat/MessageList.tsx`:

```tsx
"use client";
import { useEffect, useRef } from "react";
import { TutorMessage } from "./TutorMessage";
import { UserMessage } from "./UserMessage";

export interface ChatMsg {
  id: string;
  role: "user" | "tutor";
  content: string;
}

export function MessageList({ messages }: { messages: ChatMsg[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto py-6">
      {messages.map((m) =>
        m.role === "user" ? (
          <UserMessage key={m.id} content={m.content} />
        ) : (
          <TutorMessage key={m.id} content={m.content} />
        ),
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the chat page**

Replace `app/(authed)/page.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Composer } from "@/components/chat/Composer";
import { MessageList, type ChatMsg } from "@/components/chat/MessageList";

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [sending, setSending] = useState(false);
  const draftIdRef = useRef(0);

  useEffect(() => {
    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "start", scenario: null }),
    })
      .then((r) => r.json())
      .then((d) => setSessionId(d.sessionId));
  }, []);

  async function send(text: string) {
    if (!sessionId) return;
    setSending(true);

    const userId = `u-draft-${++draftIdRef.current}`;
    setMessages((prev) => [...prev, { id: userId, role: "user", content: text }]);

    const tutorId = `t-draft-${draftIdRef.current}`;
    setMessages((prev) => [...prev, { id: tutorId, role: "tutor", content: "" }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: text }),
    });
    if (!res.body) {
      setSending(false);
      return;
    }
    const userMessageId = res.headers.get("X-User-Message-Id");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      full += decoder.decode(value);
      setMessages((prev) => prev.map((m) => (m.id === tutorId ? { ...m, content: full } : m)));
    }
    setSending(false);

    // Fire extractors (don't block UI)
    fetch("/api/extract/vocab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, tutorReply: full }),
    }).catch(() => {});

    if (userMessageId) {
      fetch("/api/extract/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: userMessageId, text }),
      }).catch(() => {});
    }
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-57px)] max-w-4xl flex-col">
      <MessageList messages={messages} />
      <Composer disabled={!sessionId || sending} onSend={send} />
    </main>
  );
}
```

- [ ] **Step 4: Smoke-test**

Run `pnpm dev`, login, type a German message, hit send. Expected: user bubble appears immediately, tutor bubble streams in, no errors in browser console.

- [ ] **Step 5: Commit**

```bash
git add components/chat app/\(authed\)/page.tsx
git commit -m "feat(chat): composer + streaming message list, fires extractors on stream end"
```

---

## Task 24: Clickable words + LookupPopup

**Files:**
- Create: `components/chat/LookupPopup.tsx`
- Modify: `components/chat/TutorMessage.tsx`

- [ ] **Step 1: Write the lookup popup**

Create `components/chat/LookupPopup.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

interface Entry {
  word: string;
  article: string | null;
  part_of_speech: string | null;
  ipa: string | null;
  english_definition: string;
  german_definition: string | null;
  examples: Array<{ de: string; en: string }>;
  related_words: string[];
}

interface Props {
  word: string;
  sourceSentence: string;
  onClose: () => void;
}

export function LookupPopup({ word, sourceSentence, onClose }: Props) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEntry(null);
    setError(false);
    fetch(`/api/lookup?word=${encodeURIComponent(word)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setEntry(d.entry);
        else setError(true);
      })
      .catch(() => setError(true));
  }, [word]);

  async function save() {
    if (!entry || saving) return;
    setSaving(true);
    const res = await fetch("/api/deck/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term: entry.word,
        definitionEn: entry.english_definition,
        sourceSentence,
      }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/10 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <h2 className="font-serif text-2xl font-semibold text-[color:var(--color-ink-strong)]">
            {entry?.article && (
              <span className="mr-1 italic text-[color:var(--color-accent)]">{entry.article}</span>
            )}
            {entry?.word ?? word}
          </h2>
          <button onClick={onClose} className="text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]">
            ✕
          </button>
        </div>
        {!entry && !error && <p className="text-sm text-[color:var(--color-muted)]">Looking up…</p>}
        {error && <p className="text-sm text-[color:var(--color-wrong)]">Couldn't load definition.</p>}
        {entry && (
          <>
            <p className="font-serif text-[color:var(--color-ink)]">{entry.english_definition}</p>
            {entry.examples?.[0] && (
              <div className="mt-3 border-l-2 border-[color:var(--color-accent-soft)] pl-3 text-sm">
                <div>{entry.examples[0].de}</div>
                <div className="italic text-[color:var(--color-muted)]">{entry.examples[0].en}</div>
              </div>
            )}
            <button
              onClick={save}
              disabled={saving || saved}
              className="mt-4 w-full rounded bg-[color:var(--color-ink-strong)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saved ? "✓ Saved to deck" : saving ? "Saving…" : "Save to deck"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the deck-save route**

Create `app/api/deck/save/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { upsertVocabCard } from "@/lib/db/queries";

export const runtime = "nodejs";

const Body = z.object({
  term: z.string().min(1),
  definitionEn: z.string().min(1),
  sourceSentence: z.string().min(1),
  sourceSessionId: z.string().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  await upsertVocabCard(db, {
    term: parsed.data.term,
    definitionEn: parsed.data.definitionEn,
    sourceSentence: parsed.data.sourceSentence,
    sourceSessionId: parsed.data.sourceSessionId ?? "",
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Update TutorMessage to make words clickable**

Replace `components/chat/TutorMessage.tsx`:

```tsx
"use client";
import { useState } from "react";
import { LookupPopup } from "./LookupPopup";

const WORD_RE = /([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]*)/g;

function tokenize(text: string): Array<{ word: boolean; text: string }> {
  const out: Array<{ word: boolean; text: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ word: false, text: text.slice(last, m.index) });
    out.push({ word: true, text: m[1]! });
    last = m.index + m[1]!.length;
  }
  if (last < text.length) out.push({ word: false, text: text.slice(last) });
  return out;
}

function findSourceSentence(content: string, word: string): string {
  const sentences = content.split(/(?<=[.!?])\s+/);
  return sentences.find((s) => s.includes(word)) ?? content;
}

export function TutorMessage({ content }: { content: string }) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <>
      <div className="flex px-4 py-2">
        <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-white px-4 py-2 font-serif text-[15px] text-[color:var(--color-ink)] shadow-sm whitespace-pre-wrap">
          {tokenize(content).map((tok, i) =>
            tok.word ? (
              <span
                key={i}
                className="cursor-pointer rounded px-px hover:bg-[color:var(--color-highlight,#fff1c9)]"
                onClick={() => setActive(tok.text)}
              >
                {tok.text}
              </span>
            ) : (
              <span key={i}>{tok.text}</span>
            ),
          )}
        </div>
      </div>
      {active && (
        <LookupPopup
          word={active}
          sourceSentence={findSourceSentence(content, active)}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Smoke-test**

Run dev, send a message, click any word in the tutor's reply. Expected: popup opens, fetches definition, "Save to deck" inserts a card (verifiable in `vocab_cards` table).

- [ ] **Step 5: Commit**

```bash
git add components/chat/LookupPopup.tsx components/chat/TutorMessage.tsx app/api/deck/
git commit -m "feat(chat): click any word in tutor reply → lookup popup → save to deck"
```

---

## Task 25: Red-underline mistakes on user messages

**Files:**
- Modify: `components/chat/UserMessage.tsx`
- Modify: `app/(authed)/page.tsx`

- [ ] **Step 1: Update UserMessage to render highlighted spans**

Replace `components/chat/UserMessage.tsx`:

```tsx
"use client";
import { useState } from "react";

export interface MistakeMark {
  spanStart: number;
  spanEnd: number;
  correction: string;
  explanation: string;
}

interface Props {
  content: string;
  mistakes?: MistakeMark[];
}

export function UserMessage({ content, mistakes = [] }: Props) {
  const [active, setActive] = useState<MistakeMark | null>(null);

  const sorted = [...mistakes].sort((a, b) => a.spanStart - b.spanStart);
  const segments: Array<{ text: string; mistake?: MistakeMark }> = [];
  let cursor = 0;
  for (const m of sorted) {
    if (m.spanStart > cursor) segments.push({ text: content.slice(cursor, m.spanStart) });
    segments.push({ text: content.slice(m.spanStart, m.spanEnd), mistake: m });
    cursor = m.spanEnd;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor) });

  return (
    <>
      <div className="flex justify-end px-4 py-2">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-[color:var(--color-accent-tint)] px-4 py-2 font-serif text-[15px] text-[color:var(--color-ink-strong)] whitespace-pre-wrap">
          {segments.map((seg, i) =>
            seg.mistake ? (
              <span
                key={i}
                onClick={() => setActive(seg.mistake!)}
                className="cursor-pointer underline decoration-[color:var(--color-wrong)] decoration-wavy underline-offset-4"
              >
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </div>
      </div>
      {active && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/10" onClick={() => setActive(null)}>
          <div className="max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-medium text-[color:var(--color-wrong)]">Better:</div>
            <div className="mt-1 font-serif text-lg text-[color:var(--color-ink-strong)]">{active.correction}</div>
            <p className="mt-3 text-sm text-[color:var(--color-ink-soft)]">{active.explanation}</p>
            <button
              onClick={() => setActive(null)}
              className="mt-4 w-full rounded bg-[color:var(--color-ink-strong)] px-4 py-1.5 text-sm text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Update MessageList to forward mistakes**

Replace `components/chat/MessageList.tsx`:

```tsx
"use client";
import { useEffect, useRef } from "react";
import { TutorMessage } from "./TutorMessage";
import { UserMessage, type MistakeMark } from "./UserMessage";

export interface ChatMsg {
  id: string;
  role: "user" | "tutor";
  content: string;
  mistakes?: MistakeMark[];
}

export function MessageList({ messages }: { messages: ChatMsg[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto py-6">
      {messages.map((m) =>
        m.role === "user" ? (
          <UserMessage key={m.id} content={m.content} mistakes={m.mistakes} />
        ) : (
          <TutorMessage key={m.id} content={m.content} />
        ),
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire extractor results into the page state**

Update `app/(authed)/page.tsx` — replace the `send` function body's extractor calls with:

```ts
    // Fire extractors (don't block UI)
    fetch("/api/extract/vocab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, tutorReply: full }),
    }).catch(() => {});

    if (userMessageId) {
      fetch("/api/extract/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: userMessageId, text }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!d.ok || !Array.isArray(d.items)) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === userId ? { ...m, mistakes: d.items } : m)),
          );
        })
        .catch(() => {});
    }
```

- [ ] **Step 4: Smoke-test**

Send a deliberately ungrammatical message (e.g., *"Ich habe gestern zur Schule gegangen."*). Expected: after the tutor reply finishes, the user message gets a wavy red underline on the auxiliary; clicking shows the correction popup.

- [ ] **Step 5: Commit**

```bash
git add components/chat app/\(authed\)/page.tsx
git commit -m "feat(chat): red wavy underline + popup for extracted mistakes"
```

---

## Task 26: New-session scenario picker

**Files:**
- Create: `components/chat/ScenarioPicker.tsx`
- Modify: `app/(authed)/page.tsx`

- [ ] **Step 1: Write the picker**

Create `components/chat/ScenarioPicker.tsx`:

```tsx
"use client";

const SCENARIOS = [
  { id: "weekend", label: "Über dein Wochenende reden" },
  { id: "bakery", label: "Rollenspiel: Bäckerei – du bestellst" },
  { id: "news", label: "Über den heutigen Tagesschau-Artikel reden" },
  { id: "free", label: "Etwas anderes – sag's mir einfach" },
];

interface Props {
  onPick: (scenarioLabel: string | null) => void;
}

export function ScenarioPicker({ onPick }: Props) {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <h2 className="font-display text-2xl text-[color:var(--color-ink-strong)]">
        Worauf hast du heute Lust?
      </h2>
      <div className="mt-6 flex flex-col gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id === "free" ? null : s.label)}
            className="rounded-lg border border-[color:var(--color-ink)]/10 bg-white px-4 py-3 text-left font-serif text-[15px] hover:border-[color:var(--color-accent)] hover:bg-[color:var(--color-accent-tint)]"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Use it in the chat page**

Replace the `useEffect` and surrounding state in `app/(authed)/page.tsx`:

```tsx
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scenarioChosen, setScenarioChosen] = useState(false);
  // ... messages and other state stay the same

  async function startSession(scenario: string | null) {
    const r = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "start", scenario }),
    });
    const d = await r.json();
    setSessionId(d.sessionId);
    setScenarioChosen(true);
  }
```

Remove the auto-start `useEffect`. Then in the render:

```tsx
  if (!scenarioChosen) {
    return (
      <main className="mx-auto max-w-4xl">
        <ScenarioPicker onPick={startSession} />
      </main>
    );
  }
```

Add the import: `import { ScenarioPicker } from "@/components/chat/ScenarioPicker";`

- [ ] **Step 3: Smoke-test**

Reload `/`. Expected: scenario picker appears first; clicking a scenario starts a session and shows the chat shell.

- [ ] **Step 4: Commit**

```bash
git add components/chat/ScenarioPicker.tsx app/\(authed\)/page.tsx
git commit -m "feat(chat): scenario picker on new session"
```

---

## Task 27: Review page — Vocab tab (Flashcard)

**Files:**
- Create: `app/(authed)/review/page.tsx`
- Create: `components/review/Flashcard.tsx`
- Create: `app/api/deck/due/route.ts`

- [ ] **Step 1: Write the due-cards route**

Create `app/api/deck/due/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { lte, asc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  const cards = await db
    .select()
    .from(schema.vocabCards)
    .where(lte(schema.vocabCards.dueAt, Date.now()))
    .orderBy(asc(schema.vocabCards.dueAt))
    .limit(100);
  return NextResponse.json({ cards });
}
```

- [ ] **Step 2: Write the Flashcard component**

Create `components/review/Flashcard.tsx`:

```tsx
"use client";
import { useState } from "react";

interface Card {
  id: string;
  term: string;
  definitionEn: string;
  sourceSentence: string;
}

interface Props {
  card: Card;
  onGrade: (grade: "again" | "good" | "easy") => void;
}

export function Flashcard({ card, onGrade }: Props) {
  const [flipped, setFlipped] = useState(false);

  function highlight(sentence: string, term: string) {
    const idx = sentence.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return sentence;
    return (
      <>
        {sentence.slice(0, idx)}
        <mark className="bg-[color:var(--color-highlight,#fff1c9)] px-0.5">
          {sentence.slice(idx, idx + term.length)}
        </mark>
        {sentence.slice(idx + term.length)}
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-stretch gap-4">
      <div
        onClick={() => setFlipped((f) => !f)}
        className="min-h-[260px] cursor-pointer rounded-2xl bg-white p-8 shadow-sm transition hover:shadow-md"
      >
        {!flipped ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="font-display text-4xl text-[color:var(--color-ink-strong)]">{card.term}</div>
            <div className="mt-4 text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Tap to flip</div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="font-serif text-xl text-[color:var(--color-ink-strong)]">{card.definitionEn}</div>
            <div className="mt-4 border-l-2 border-[color:var(--color-accent-soft)] pl-3 font-serif text-[15px] text-[color:var(--color-ink-soft)]">
              {highlight(card.sourceSentence, card.term)}
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => onGrade("again")}
          className="rounded-lg border border-[color:var(--color-wrong)] py-2 text-sm font-medium text-[color:var(--color-wrong)] hover:bg-[color:var(--color-wrong-soft)]"
        >
          Again
        </button>
        <button
          onClick={() => onGrade("good")}
          className="rounded-lg bg-[color:var(--color-ink-strong)] py-2 text-sm font-medium text-white"
        >
          Good
        </button>
        <button
          onClick={() => onGrade("easy")}
          className="rounded-lg border border-[color:var(--color-correct)] py-2 text-sm font-medium text-[color:var(--color-correct)] hover:bg-[color:var(--color-correct-soft)]"
        >
          Easy
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the Review page (Vocab tab)**

Create `app/(authed)/review/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Flashcard } from "@/components/review/Flashcard";

interface Card {
  id: string;
  term: string;
  definitionEn: string;
  sourceSentence: string;
}

export default function ReviewPage() {
  const [tab, setTab] = useState<"vocab" | "mistakes">("vocab");
  const [cards, setCards] = useState<Card[] | null>(null);

  useEffect(() => {
    if (tab !== "vocab") return;
    fetch("/api/deck/due")
      .then((r) => r.json())
      .then((d) =>
        setCards(
          d.cards.map((c: any) => ({
            id: c.id,
            term: c.term,
            definitionEn: c.definitionEn,
            sourceSentence: c.sourceSentence,
          })),
        ),
      );
  }, [tab]);

  async function grade(grade: "again" | "good" | "easy") {
    if (!cards || cards.length === 0) return;
    const card = cards[0];
    await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, grade }),
    });
    setCards(cards.slice(1));
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8 flex gap-2 border-b border-[color:var(--color-ink)]/10">
        {(["vocab", "mistakes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t
                ? "border-[color:var(--color-accent)] text-[color:var(--color-ink-strong)]"
                : "border-transparent text-[color:var(--color-ink-soft)]"
            }`}
          >
            {t === "vocab" ? "Vocab" : "Mistakes"}
          </button>
        ))}
      </div>

      {tab === "vocab" && (
        <>
          {cards === null && <p className="text-center text-[color:var(--color-muted)]">Loading…</p>}
          {cards && cards.length === 0 && (
            <p className="text-center text-[color:var(--color-muted)]">Caught up. Come back tomorrow.</p>
          )}
          {cards && cards[0] && <Flashcard card={cards[0]} onGrade={grade} />}
        </>
      )}

      {tab === "mistakes" && <MistakesPanel />}
    </main>
  );
}

function MistakesPanel() {
  return <p className="text-center text-[color:var(--color-muted)]">Mistakes panel — next task.</p>;
}
```

- [ ] **Step 4: Smoke-test**

Save a card from a chat, then navigate to `/review`. Expected: card appears, flipping works, grading reschedules it (verify in DB: `due_at` advances).

- [ ] **Step 5: Commit**

```bash
git add app/\(authed\)/review/ components/review/Flashcard.tsx app/api/deck/due/
git commit -m "feat(review): vocab tab with flashcard + leitner grading"
```

---

## Task 28: Review page — Mistakes tab

**Files:**
- Modify: `app/(authed)/review/page.tsx`
- Create: `components/review/MistakeRow.tsx`
- Create: `app/api/mistakes/route.ts`

- [ ] **Step 1: Write the mistakes listing route**

Create `app/api/mistakes/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db
    .select()
    .from(schema.mistakes)
    .orderBy(desc(schema.mistakes.createdAt))
    .limit(200);
  return NextResponse.json({ mistakes: rows });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const { eq } = await import("drizzle-orm");
  await db.delete(schema.mistakes).where(eq(schema.mistakes.id, id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write the row component**

Create `components/review/MistakeRow.tsx`:

```tsx
"use client";

interface Mistake {
  id: string;
  original: string;
  correction: string;
  explanation: string;
  category: string | null;
  createdAt: number;
}

interface Props {
  mistake: Mistake;
  onDelete: (id: string) => void;
}

export function MistakeRow({ mistake, onDelete }: Props) {
  const date = new Date(mistake.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="border-b border-[color:var(--color-ink)]/10 py-4">
      <div className="mb-1 flex items-center gap-3 text-xs text-[color:var(--color-muted)]">
        <span>{date}</span>
        {mistake.category && <span>· {mistake.category}</span>}
        <button onClick={() => onDelete(mistake.id)} className="ml-auto hover:text-[color:var(--color-wrong)]">
          delete
        </button>
      </div>
      <div className="font-serif text-[15px]">
        <span className="underline decoration-[color:var(--color-wrong)] decoration-wavy underline-offset-4">
          {mistake.original}
        </span>
        <span className="mx-2 text-[color:var(--color-muted)]">→</span>
        <span className="font-medium text-[color:var(--color-ink-strong)]">{mistake.correction}</span>
      </div>
      <p className="mt-1 text-sm text-[color:var(--color-ink-soft)]">{mistake.explanation}</p>
    </div>
  );
}
```

- [ ] **Step 3: Wire the mistakes panel into Review page**

In `app/(authed)/review/page.tsx`, replace the `MistakesPanel` function with:

```tsx
function MistakesPanel() {
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/mistakes")
      .then((r) => r.json())
      .then((d) => setRows(d.mistakes));
  }, []);

  async function del(id: string) {
    await fetch(`/api/mistakes?id=${id}`, { method: "DELETE" });
    setRows((prev) => prev?.filter((m) => m.id !== id) ?? null);
  }

  if (rows === null) return <p className="text-center text-[color:var(--color-muted)]">Loading…</p>;
  if (rows.length === 0)
    return <p className="text-center text-[color:var(--color-muted)]">No mistakes yet. Go write some German.</p>;

  return (
    <div>
      {rows.map((m) => (
        <MistakeRow key={m.id} mistake={m} onDelete={del} />
      ))}
    </div>
  );
}
```

Add the import: `import { MistakeRow } from "@/components/review/MistakeRow";`

- [ ] **Step 4: Smoke-test**

After making a few mistakes in chat, navigate to `/review` → Mistakes tab. Expected: list of errors with red wavy original, arrow, correction, explanation underneath. Delete works.

- [ ] **Step 5: Commit**

```bash
git add app/\(authed\)/review/page.tsx components/review/MistakeRow.tsx app/api/mistakes/
git commit -m "feat(review): mistakes tab with list + delete"
```

---

## Task 29: Progress + Settings pages

**Files:**
- Create: `app/(authed)/progress/page.tsx`
- Create: `app/(authed)/settings/page.tsx`
- Create: `app/api/progress/route.ts`
- Create: `app/api/settings/route.ts`

- [ ] **Step 1: Write the progress route**

Create `app/api/progress/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { sql, isNotNull, gte } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  const thirtyAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const [deckRow, resolvedRow, resolved30Row] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(schema.vocabCards),
    db.select({ c: sql<number>`count(*)` }).from(schema.mistakes).where(isNotNull(schema.mistakes.resolvedAt)),
    db
      .select({ c: sql<number>`count(*)` })
      .from(schema.mistakes)
      .where(isNotNull(schema.mistakes.resolvedAt))
      .where(gte(schema.mistakes.resolvedAt, thirtyAgo)),
  ]);

  return NextResponse.json({
    deckSize: Number(deckRow[0]?.c ?? 0),
    resolvedTotal: Number(resolvedRow[0]?.c ?? 0),
    resolvedLast30: Number(resolved30Row[0]?.c ?? 0),
  });
}
```

- [ ] **Step 2: Write the Progress page**

Create `app/(authed)/progress/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

export default function ProgressPage() {
  const [d, setD] = useState<{ deckSize: number; resolvedTotal: number; resolvedLast30: number } | null>(null);

  useEffect(() => {
    fetch("/api/progress").then((r) => r.json()).then(setD);
  }, []);

  if (!d) return <main className="mx-auto max-w-4xl p-8 text-[color:var(--color-muted)]">Loading…</main>;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl text-[color:var(--color-ink-strong)]">Progress</h1>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Words in deck" value={d.deckSize} />
        <Stat label="Mistakes resolved" value={d.resolvedTotal} />
        <Stat label="Resolved last 30d" value={d.resolvedLast30} />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[color:var(--color-ink)]/10 bg-white p-6">
      <div className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">{label}</div>
      <div className="mt-2 font-display text-4xl text-[color:var(--color-ink-strong)]">{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Write the settings route**

Create `app/api/settings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getOrCreateUserState } from "@/lib/db/queries";

export const runtime = "nodejs";

const Body = z.object({
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional(),
  name: z.string().max(80).nullable().optional(),
});

export async function GET() {
  const s = await getOrCreateUserState(db);
  return NextResponse.json({ level: s.level, name: s.name });
}

export async function PATCH(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  await getOrCreateUserState(db);
  const patch: Partial<{ level: string; name: string | null }> = {};
  if (parsed.data.level) patch.level = parsed.data.level;
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  await db.update(schema.userState).set(patch).where(eq(schema.userState.id, 1));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write the Settings page**

Create `app/(authed)/settings/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export default function SettingsPage() {
  const [level, setLevel] = useState<typeof LEVELS[number]>("B1");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setLevel(d.level);
        setName(d.name ?? "");
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, name: name.trim() || null }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="font-display text-3xl text-[color:var(--color-ink-strong)]">Settings</h1>
      <form onSubmit={save} className="mt-8 flex flex-col gap-6">
        <div>
          <label className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Your CEFR level</label>
          <div className="mt-2 flex gap-2">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={`rounded border px-3 py-1.5 text-sm font-medium ${
                  l === level
                    ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-tint)] text-[color:var(--color-accent-deep)]"
                    : "border-[color:var(--color-ink)]/10 text-[color:var(--color-ink-soft)]"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Name (tutor will address you)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
            className="mt-2 w-full rounded border border-[color:var(--color-ink)]/10 bg-white px-3 py-2 outline-none focus:border-[color:var(--color-accent)]"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="self-start rounded bg-[color:var(--color-ink-strong)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Smoke-test**

Visit `/progress` and `/settings`. Expected: stats render with current counts; level + name save correctly (reload to confirm).

- [ ] **Step 6: Commit**

```bash
git add app/\(authed\)/progress/ app/\(authed\)/settings/ app/api/progress/ app/api/settings/
git commit -m "feat(ui): progress counters + settings (level + name)"
```

---

# Phase 5 — Deployment

## Task 30: Dockerfile for ARM64

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `next.config.ts`

- [ ] **Step 1: Set standalone output mode**

Replace `next.config.ts`:

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
};

export default config;
```

- [ ] **Step 2: Write `.dockerignore`**

```
node_modules
.next
data
*.db
*.db-journal
legacy
docs
.git
.env
.env.local
```

- [ ] **Step 3: Write the Dockerfile (multi-stage, arm64-compatible)**

Create `Dockerfile`:

```dockerfile
# Build stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# better-sqlite3 needs build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Runtime stage
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Need libstdc++ for better-sqlite3 native bindings
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

EXPOSE 3000
VOLUME /app/data

CMD ["node", "server.js"]
```

- [ ] **Step 4: Verify it builds**

```bash
docker build --platform linux/arm64 -t sprachpartner:test .
```

Expected: image builds successfully. (If your dev machine is x86, this uses qemu emulation; takes ~3–5 min.)

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore next.config.ts
git commit -m "build: arm64 Dockerfile with standalone output for RPi4"
```

---

## Task 31: Deployment + README docs

**Files:**
- Create: `README.md` (replace)

- [ ] **Step 1: Replace the README**

Replace `README.md`:

```markdown
# Sprachpartner

Self-hosted German-learning chat. See `docs/superpowers/specs/2026-05-21-sprachpartner-design.md` for the full design.

## Stack

Next.js 15 (App Router) · TypeScript · SQLite (Drizzle + better-sqlite3) · OpenAI (4o tutor, 4o-mini extractors) · Tailwind.

## Development

```bash
pnpm install
cp .env.example .env.local
# Fill in OPENAI_API_KEY, APP_PASSWORD_HASH, SESSION_SECRET
pnpm db:migrate
pnpm dev
```

### Generate APP_PASSWORD_HASH

```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" 'your-password'
```

### Generate SESSION_SECRET

```bash
openssl rand -hex 32
```

## Tests

```bash
pnpm test            # unit (vitest)
pnpm typecheck       # tsc --noEmit
pnpm lint            # next lint
```

## Deploy to Raspberry Pi 4 (arm64)

### Option A — Docker

On a beefier machine:

```bash
docker buildx build --platform linux/arm64 -t sprachpartner:latest --load .
docker save sprachpartner:latest | ssh pi@rpi 'docker load'
```

On the Pi:

```bash
docker run -d --restart=unless-stopped \
  -p 3000:3000 \
  -v /opt/sprachpartner/data:/app/data \
  --env-file /opt/sprachpartner/.env \
  --name sprachpartner \
  sprachpartner:latest

docker exec sprachpartner node /app/drizzle/run-migrations.js  # one-time
```

### Option B — Bare Node

Build on laptop:

```bash
pnpm build
rsync -av .next/standalone/ pi@rpi:/opt/sprachpartner/
rsync -av .next/static/ pi@rpi:/opt/sprachpartner/.next/static/
rsync -av public/ pi@rpi:/opt/sprachpartner/public/
rsync -av drizzle/ pi@rpi:/opt/sprachpartner/drizzle/
rsync -av node_modules/better-sqlite3/ pi@rpi:/opt/sprachpartner/node_modules/better-sqlite3/
```

On the Pi (one-time, in `/opt/sprachpartner/`):

```bash
cd /opt/sprachpartner
NODE_ENV=production node server.js
```

Use systemd or pm2 to keep it running.

## Cloudflare Tunnel

The Pi sits behind a Cloudflare Tunnel so it has TLS and DNS without port-forwarding:

```bash
cloudflared tunnel login
cloudflared tunnel create sprachpartner
cloudflared tunnel route dns sprachpartner germanweekly.com
# /etc/cloudflared/config.yml:
#   tunnel: sprachpartner
#   credentials-file: /home/pi/.cloudflared/<tunnel-id>.json
#   ingress:
#     - hostname: germanweekly.com
#       service: http://localhost:3000
#     - service: http_status:404
sudo cloudflared service install
```

Then `https://germanweekly.com` reaches the Pi.

## Backup

```bash
sqlite3 /opt/sprachpartner/data/sprachpartner.db ".backup '/tmp/sp-$(date +%F).db'"
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with dev, test, deploy, backup instructions"
```

---

# Self-review notes (resolved before handing off)

A spec-coverage sanity check produced these findings, all addressed inline:

- **Spec calls for tutor ambient quiz** — explicitly deferred to v2 per the spec's "Defers to v2" section. Plan honors that.
- **Spec calls for past-sessions list** — explicitly deferred to v2. Plan honors that.
- **Spec calls for charts on Progress** — deferred. MVP ships three counters; Task 29 implements them. Matches the spec.
- **Spec calls for mistake auto-retirement** — deferred. MVP ships manual delete; Task 28 implements it.
- **Type consistency** — `gradeCard` signature is consistent across Tasks 7 and 19. `extractVocab` / `extractMistakes` are consistent across Tasks 14, 15 and the routes that use them in Task 18.
- **Schema migration is regenerated in Task 11** when the case-insensitive term index is added; safe because the DB is fresh during MVP.

---

# Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-21-sprachpartner.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
