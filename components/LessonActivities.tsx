import type { Lesson } from "@/lib/types";
import { GamesView } from "./GamesView";

/* Per-lesson word-game slot. Reserved extension point — renders nothing yet.
   A future spec adds a game registry here, fed normalized vocab from `lesson`
   via lib/games. */
export function LessonActivities(lesson: { lesson: Lesson }) {

  console.log(lesson.lesson.vocabs, 'la');
  return <GamesView vocabPool={lesson.lesson.vocabs ?? []} />;
}
