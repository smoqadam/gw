import { SectionLabel } from "./SectionLabel";

export interface GlossaryEntry {
  term: string;
  definition: string;
  example?: string;
}

export function Glossary({
  label,
  items,
  maxColumns = 2,
}: {
  label: string;
  items: GlossaryEntry[];
  maxColumns?: 2 | 4;
}) {
  if (!items.length) return null;
  const grid =
    maxColumns === 4
      ? "grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      : "grid gap-x-10 gap-y-6 sm:grid-cols-2";
  return (
    <section>
      <SectionLabel>{label}</SectionLabel>
      <div className={grid}>
        {items.map((it, i) => (
          <div key={i}>
            <div className="font-serif text-[1.05rem] font-semibold text-ink-strong">{it.term}</div>
            <div className="mt-0.5 font-ui text-sm leading-relaxed text-ink-soft">{it.definition}</div>
            {it.example && (
              <div className="mt-1.5 font-serif text-sm italic text-muted">„{it.example}”</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
