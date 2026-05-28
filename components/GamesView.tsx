"use client";

import { useState } from "react";
import { GAMES } from "./games/registry";
import { pickRandom } from "@/lib/vocabPool";
import type { GameDef } from "@/lib/games/types";
import type { VocabItem } from "@/lib/types";

const BATCH = 8;

/** Embeddable game picker: lists the games, and on selection mounts one with a
    random batch from the given vocab. Used under each lesson and on the deck. */
export function GamesView({ vocabPool }: { vocabPool: VocabItem[] }) {
  const [active, setActive] = useState<GameDef | null>(null);
  const [batch, setBatch] = useState<VocabItem[]>([]);
  const Active = active?.component;

  const start = (game: GameDef) => {
    setBatch(pickRandom(vocabPool, BATCH));
    setActive(game);
  };

  if (active && Active) {
    return (
      <>
        <button
          type="button"
          onClick={() => setActive(null)}
          className="mb-5 font-ui text-sm text-muted transition-colors hover:text-accent"
        >
          ← All games
        </button>
        <Active items={batch} onExit={() => setActive(null)} />
      </>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {GAMES.map((game) => {
        const ready = vocabPool.length >= game.minItems;
        return (
          <button
            key={game.id}
            type="button"
            disabled={!ready}
            onClick={() => start(game)}
            className={
              "rounded-2xl border p-5 text-left transition-colors " +
              (ready
                ? "border-rule bg-surface hover:border-accent cursor-pointer"
                : "border-rule bg-surface-warm cursor-not-allowed opacity-70")
            }
          >
            <div className="font-display text-lg font-semibold text-ink-strong">{game.name}</div>
            <p className="mt-1 font-ui text-sm text-ink-soft">{game.description}</p>
            {!ready && (
              <p className="mt-2 font-ui text-xs text-muted">Needs at least {game.minItems} words.</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
