"use client";

import { useState } from "react";
import { Nav } from "./Nav";
import { GAMES } from "./games/registry";
import { pickRandom } from "@/lib/vocabPool";
import type { GameDef } from "@/lib/games/types";
import type { VocabItem } from "@/lib/types";

const BATCH = 8;

export function GamesView({ vocabPool }: { vocabPool: VocabItem[] }) {
  const [active, setActive] = useState<GameDef | null>(null);
  const [batch, setBatch] = useState<VocabItem[]>([]);

  const start = (game: GameDef) => {
    setBatch(pickRandom(vocabPool, BATCH));
    setActive(game);
  };

  if (active) {
    const Active = active.component;
    return <Active items={batch} onExit={() => setActive(null)} />;
  }

  return (
    <>
      <GameList pool={vocabPool} onStart={start} />
    </>
  );
}

function GameList({
  pool,
  onStart,
}: {
  pool: VocabItem[] | null;
  onStart: (game: GameDef) => void;
}) {
  return (
    <>
      <div className="border-b border-rule pb-5">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-strong">Games</h1>
        <p className="mt-2 font-ui text-sm text-muted">
          {pool === null
            ? "Loading your words…"
            : `Practice with ${pool.length} word${pool.length === 1 ? "" : "s"} from your lessons and deck.`}
        </p>
      </div>

      {pool !== null && pool.length === 0 && (
        <p className="mt-10 font-serif text-ink-soft">
          No vocabulary yet. Save words from a lesson to your deck, or generate lessons with vocab.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {GAMES.map((game) => {
          const ready = pool !== null && pool.length >= game.minItems;
          return (
            <button
              key={game.id}
              type="button"
              disabled={!ready}
              onClick={() => onStart(game)}
              className={
                "rounded-2xl border p-6 text-left transition-colors " +
                (ready
                  ? "border-rule bg-surface hover:border-accent cursor-pointer"
                  : "border-rule bg-surface-warm cursor-not-allowed opacity-70")
              }
            >
              <div className="font-display text-xl font-semibold text-ink-strong">{game.name}</div>
              <p className="mt-1.5 font-ui text-sm text-ink-soft">{game.description}</p>
              {pool !== null && !ready && (
                <p className="mt-3 font-ui text-xs text-muted">
                  Needs at least {game.minItems} words.
                </p>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
