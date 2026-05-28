import type { VocabItem } from "./types";
import { Deck } from "./deck";

interface VocabIndexItem {
  word: string;
  definition: string;
  example?: string;
  level?: string;
  lessonId?: string;
}

/** All study words: the aggregated lesson vocab (vocabs.json) plus the user's
    saved deck, deduped by word. */
export async function fetchVocabPool(): Promise<VocabItem[]> {
  let fromLessons: VocabIndexItem[] = [];
  try {
    const res = await fetch("/lessons/vocabs.json", { cache: "no-store" });
    if (res.ok) fromLessons = await res.json();
  } catch {
    // The deck alone may still provide words.
  }

  const merged: VocabItem[] = [
    ...fromLessons.map((v) => ({ word: v.word, definition: v.definition, example: v.example })),
    ...Deck.all().map((c) => ({
      word: c.term,
      definition: c.definition,
      example: c.example || undefined,
    })),
  ];

  const byWord = new Map<string, VocabItem>();
  for (const item of merged) {
    const key = item.word?.toLowerCase();
    if (!key || !item.definition) continue;
    if (!byWord.has(key)) byWord.set(key, item);
  }
  return [...byWord.values()];
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickRandom<T>(arr: readonly T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}
