/* Extension seam for per-lesson word games (not built yet).
   A game is any component that accepts a normalized list of vocab items and
   renders whatever it likes. normalizeVocab() adapts the various sources
   (a text lesson, deck cards, or dictionary entries) into that common shape. */

import type { ComponentType } from "react";
import type { PhraseItem, TextLesson, VocabItem } from "../types";
import type { DeckCard } from "../deck";
import type { DictEntry } from "../dict";

export interface GameProps {
  items: VocabItem[];
  lessonId: string;
}

export type Game = ComponentType<GameProps>;

export function normalizeVocab(input: TextLesson | DeckCard[] | DictEntry[]): VocabItem[] {
  if (Array.isArray(input)) {
    return input.map((it) =>
      "term" in it
        ? { word: it.term, definition: it.definition, example: it.example || undefined }
        : {
            word: it.word || "",
            definition: (it.english_translations || []).join(", ") || it.german_definition || "",
          },
    );
  }
  const vocab = (input.vocabs || []).map((v: VocabItem) => ({
    word: v.word,
    definition: v.definition,
    example: v.example,
  }));
  const phrases = (input.phrases || []).map((p: PhraseItem) => ({
    word: p.phrase,
    definition: p.translation,
    example: p.example,
  }));
  return [...vocab, ...phrases];
}
