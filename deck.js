/* Vocabulary deck — single-user, browser-local (no backend, no auth).
   Shared by index.html (save from the dictionary panel) and deck.html (review).
   One card per term; matching is case-insensitive. */
(function (global) {
  const KEY = "gw_deck";

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }

  function write(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  const Deck = {
    all() {
      return read().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    },
    has(term) {
      const t = (term || "").toLowerCase();
      return read().some((c) => (c.term || "").toLowerCase() === t);
    },
    add(card) {
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
    remove(term) {
      const t = (term || "").toLowerCase();
      write(read().filter((c) => (c.term || "").toLowerCase() !== t));
    },
    count() {
      return read().length;
    },
  };

  global.Deck = Deck;
})(window);
