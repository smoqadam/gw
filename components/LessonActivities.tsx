import type { Lesson } from "@/lib/types";

/* Per-lesson word-game slot. Reserved extension point — renders nothing yet.
   A future spec adds a game registry here, fed normalized vocab from `lesson`
   via lib/games. */
export function LessonActivities(_props: { lesson: Lesson }) {
  return null;
}
