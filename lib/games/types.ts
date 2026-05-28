/* A game is any component that takes a batch of vocab items and renders an
   activity. The registry (components/games/registry.ts) lists the available
   games; the /games page picks random words from the pool and mounts one. */

import type { ComponentType } from "react";
import type { VocabItem } from "../types";

export interface GameProps {
  items: VocabItem[];
  onExit: () => void;
}

export interface GameDef {
  id: string;
  name: string;
  description: string;
  minItems: number;
  component: ComponentType<GameProps>;
}
