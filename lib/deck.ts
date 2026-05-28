/* Vocabulary deck — single-user, browser-local (no backend, no auth).
   One card per term; matching is case-insensitive. localStorage key + card
   shape are unchanged from the original site so existing saved words survive. */

export interface DeckCard {
  term: string;
  article: string;
  definition: string;
  example: string;
  source: string;
  addedAt: number;
}

const KEY = "gw_deck";
const EVENT = "gw-deck-change";

function read(): DeckCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(list: DeckCard[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export interface NewCard {
  term: string;
  article?: string;
  definition?: string;
  example?: string;
  source?: string;
}

export const Deck = {
  all(): DeckCard[] {
    return read().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  },
  has(term: string): boolean {
    const t = (term || "").toLowerCase();
    return read().some((c) => (c.term || "").toLowerCase() === t);
  },
  add(card: NewCard): boolean {
    if (!card || !card.term || this.has(card.term)) return false;
    const list = read();
    list.push({
      term: card.term,
      article: card.article || "",
      definition: card.definition || "",
      example: card.example || "",
      source: card.source || "",
      addedAt: Date.now(),
    });
    write(list);
    return true;
  },
  remove(term: string): void {
    const t = (term || "").toLowerCase();
    write(read().filter((c) => (c.term || "").toLowerCase() !== t));
  },
  count(): number {
    return read().length;
  },
  subscribe(cb: () => void): () => void {
    window.addEventListener(EVENT, cb);
    return () => window.removeEventListener(EVENT, cb);
  },
};
