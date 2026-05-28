import type { Lesson } from "@/lib/types";
import { GAMES } from "./games/registry";
import { GamesView } from "./GamesView";
import { SectionLabel } from "./SectionLabel";

const MIN_WORDS = GAMES.length ? Math.min(...GAMES.map((g) => g.minItems)) : Infinity;

/** Per-lesson practice games, fed by this lesson's own vocab. Hidden when the
    lesson has too few words for any game. */
export function LessonActivities({ lesson }: { lesson: Lesson }) {
  const vocab = lesson.vocabs ?? [];
  if (vocab.length < MIN_WORDS) return null;
  return (
    <section className="mt-16">
      <SectionLabel>Practice</SectionLabel>
      <GamesView vocabPool={vocab} />
    </section>
  );
}
