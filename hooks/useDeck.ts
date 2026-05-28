"use client";

import { useEffect, useState } from "react";
import { Deck, type DeckCard } from "@/lib/deck";

export function useDeckCards(): DeckCard[] {
  const [cards, setCards] = useState<DeckCard[]>([]);
  useEffect(() => {
    const update = () => setCards(Deck.all());
    update();
    return Deck.subscribe(update);
  }, []);
  return cards;
}

export function useDeckCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const update = () => setN(Deck.count());
    update();
    return Deck.subscribe(update);
  }, []);
  return n;
}

export function useDeckHas(term: string): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    const update = () => setHas(Deck.has(term));
    update();
    return Deck.subscribe(update);
  }, [term]);
  return has;
}
