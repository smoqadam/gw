"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { lookup, type DictEntry } from "@/lib/dict";
import { Deck } from "@/lib/deck";
import { useDeckHas } from "@/hooks/useDeck";

interface LookupContextValue {
  open: (word: string, sentence: string, key: string) => void;
  activeKey: string | null;
}

const LookupContext = createContext<LookupContextValue>({
  open: () => {},
  activeKey: null,
});

export const useLookup = () => useContext(LookupContext);

type Status = "loading" | "error" | "ready";

export function LookupProvider({
  lessonLabel,
  children,
}: {
  lessonLabel: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [word, setWord] = useState("");
  const [sentence, setSentence] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const reqRef = useRef(0);
  const panelRef = useRef<HTMLElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveKey(null);
    reqRef.current++;
  }, []);

  const load = useCallback(async (w: string) => {
    const token = ++reqRef.current;
    setStatus("loading");
    setEntry(null);
    try {
      const e = await lookup(w);
      if (reqRef.current !== token) return;
      setEntry(e);
      setStatus("ready");
    } catch {
      if (reqRef.current !== token) return;
      setStatus("error");
    }
  }, []);

  const open = useCallback(
    (w: string, s: string, key: string) => {
      if (isOpen && key === activeKey) {
        close();
        return;
      }
      setActiveKey(key);
      setWord(w);
      setSentence(s);
      setIsOpen(true);
      load(w);
    },
    [isOpen, activeKey, close, load],
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest(".gw-word")) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [isOpen, close]);

  return (
    <LookupContext.Provider value={{ open, activeKey }}>
      {children}

      <aside
        ref={panelRef}
        aria-hidden={!isOpen}
        className={
          "fixed z-50 flex flex-col border-rule-strong bg-surface shadow-[0_-12px_40px_-12px_rgba(15,17,21,0.25)] transition-transform duration-300 ease-out " +
          "inset-x-0 bottom-0 max-h-[78dvh] rounded-t-2xl border-t " +
          "md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:h-dvh md:w-[25rem] md:max-h-none md:rounded-none md:border-t-0 md:border-l md:shadow-[-16px_0_48px_-24px_rgba(15,17,21,0.3)] " +
          (isOpen
            ? "translate-y-0 md:translate-x-0"
            : "translate-y-full md:translate-y-0 md:translate-x-full")
        }
      >
        <header className="flex items-start justify-between gap-3 border-b border-rule px-6 py-4">
          <div className="font-display text-2xl leading-tight text-ink-strong">
            {entry?.article && status === "ready" ? (
              <>
                <span className="text-accent">{entry.article}</span>{" "}
                {entry.word || word}
              </>
            ) : (
              entry?.word || word
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="-mr-1 shrink-0 rounded-full p-1 font-ui text-lg leading-none text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {status === "loading" && (
            <div className="font-ui text-sm text-muted">Looking up…</div>
          )}

          {status === "error" && (
            <div className="flex items-center gap-3 font-ui text-sm text-ink-soft">
              <span>Couldn&apos;t load definition.</span>
              <button
                type="button"
                onClick={() => load(word)}
                className="rounded-md border border-rule-strong px-3 py-1 text-ink transition-colors hover:border-accent hover:text-accent"
              >
                Retry
              </button>
            </div>
          )}

          {status === "ready" && entry && (
            <Entry
              entry={entry}
              word={word}
              sentence={sentence}
              lessonLabel={lessonLabel}
              onRelated={(w) => open(w, "", "related:" + w)}
            />
          )}
        </div>
      </aside>
    </LookupContext.Provider>
  );
}

function Entry({
  entry,
  word,
  sentence,
  lessonLabel,
  onRelated,
}: {
  entry: DictEntry;
  word: string;
  sentence: string;
  lessonLabel: string;
  onRelated: (word: string) => void;
}) {
  const saveTerm = entry.word || word;
  const meta = [
    entry.part_of_speech,
    entry.ipa,
    entry.plural ? "pl. " + entry.plural : "",
    entry.conjugation,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <SaveButton
        term={saveTerm}
        definition={
          (entry.english_translations || []).join(", ") || entry.german_definition || ""
        }
        article={entry.article || ""}
        example={sentence}
        source={lessonLabel}
      />

      {meta.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-sm text-ink-soft">
          {meta.map((m, i) => (
            <span key={i} className={i === 1 && entry.ipa ? "font-mono text-muted" : ""}>
              {i > 0 && <span className="mr-2 text-faint">·</span>}
              {m}
            </span>
          ))}
        </div>
      )}

      {entry.german_definition && (
        <p className="font-serif text-[1.05rem] leading-relaxed text-ink">
          {entry.german_definition}
        </p>
      )}
      {entry.english_translations && entry.english_translations.length > 0 && (
        <p className="font-ui text-[0.95rem] text-ink-soft">
          {entry.english_translations.join(", ")}
        </p>
      )}

      {entry.examples && entry.examples.length > 0 && (
        <Section label="Examples">
          <div className="space-y-3">
            {entry.examples.map((ex, i) => (
              <div key={i}>
                <div className="font-serif text-ink">{ex.de}</div>
                {ex.en && <div className="font-ui text-sm text-muted">{ex.en}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {entry.grammar_notes && (
        <Section label="Grammar">
          <p className="font-ui text-sm leading-relaxed text-ink-soft">{entry.grammar_notes}</p>
        </Section>
      )}

      {entry.related_words && entry.related_words.length > 0 && (
        <Section label="Related">
          <div className="flex flex-wrap gap-2">
            {entry.related_words.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => onRelated(w)}
                className="rounded-full border border-rule-strong px-3 py-1 font-ui text-sm text-ink transition-colors hover:border-accent hover:bg-accent-tint hover:text-accent-deep"
              >
                {w}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-rule pt-4">
      <div className="mb-2 font-ui text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        {label}
      </div>
      {children}
    </div>
  );
}

function SaveButton({
  term,
  definition,
  article,
  example,
  source,
}: {
  term: string;
  definition: string;
  article: string;
  example: string;
  source: string;
}) {
  const saved = useDeckHas(term);
  if (!term) return null;
  return (
    <button
      type="button"
      disabled={saved}
      onClick={(e) => {
        e.stopPropagation();
        Deck.add({ term, article, definition, example, source });
      }}
      className={
        "w-full rounded-lg px-4 py-2.5 font-ui text-sm font-medium transition-colors " +
        (saved
          ? "cursor-default bg-correct-soft text-correct"
          : "bg-accent text-surface hover:bg-accent-deep")
      }
    >
      {saved ? "Saved ✓" : "+ Save to deck"}
    </button>
  );
}
