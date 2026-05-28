import type { GameDef } from "@/lib/games/types";
import { MeaningQuiz } from "./MeaningQuiz";

export const GAMES: GameDef[] = [
  {
    id: "meaning-quiz",
    name: "Meaning Match",
    description: "Pick the English meaning of each German word.",
    minItems: 4,
    component: MeaningQuiz,
  },
];
