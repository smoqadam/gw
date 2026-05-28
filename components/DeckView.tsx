"use client";

import { useMemo } from "react";
import { Deck } from "@/lib/deck";
import { useDeckCards } from "@/hooks/useDeck";
import { GAMES } from "./games/registry";
import { GamesView } from "./GamesView";
import { SectionLabel } from "./SectionLabel";
import type { VocabItem } from "@/lib/types";

const MIN_WORDS = GAMES.length ? Math.min(...GAMES.map((g) => g.minItems)) : Infinity;

export function DeckView() {
  const cards = useDeckCards();
  const vocabPool = useMemo<VocabItem[]>(
    () =>
      cards
        .filter((c) => c.definition)
        .map((c) => ({ word: c.term, definition: c.definition, example: c.example || undefined })),
    [cards],
  );

  return (
    <main className="mx-auto w-full max-w-wide px-5 pb-24 pt-12 sm:px-8">
      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-5">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-strong">
          Your deck
        </h1>
        {cards.length > 0 && (
          <span className="font-ui text-sm text-muted">
            {cards.length} word{cards.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {vocabPool.length >= MIN_WORDS && (
        <section className="mt-8">
          <SectionLabel>Practice</SectionLabel>
          <GamesView vocabPool={vocabPool} />
        </section>
      )}

      {cards.length === 0 ? (
        <p className="mt-10 font-serif text-ink-soft">No saved words yet.</p>
      ) : (
        <ul className="mt-12 grid gap-x-12 sm:grid-cols-2">
          {cards.map((c) => (
            <li
              key={c.term}
              className="flex items-start justify-between gap-4 border-b border-rule py-5"
            >
              <div className="min-w-0">
                <div className="font-serif text-xl text-ink-strong">
                  {c.article && <span className="text-accent">{c.article} </span>}
                  {c.term}
                </div>
                {c.definition && (
                  <div className="mt-1 font-ui text-sm leading-relaxed text-ink-soft">
                    {c.definition}
                  </div>
                )}
                {c.example && (
                  <div className="mt-1.5 font-serif text-sm italic text-muted">„{c.example}”</div>
                )}
                {c.source && (
                  <div className="mt-2 font-ui text-xs uppercase tracking-[0.12em] text-faint">
                    {c.source}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => Deck.remove(c.term)}
                className="shrink-0 rounded-full p-1.5 font-ui text-muted transition-colors hover:bg-wrong-soft hover:text-wrong"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-12 font-ui text-xs text-muted">
        Saved while reading a lesson. Click any word in a lesson, then “Save to deck”.
      </p>
    </main>
  );
}
