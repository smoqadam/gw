import type { Lesson, Source } from "@/lib/types";
import { formatLong } from "@/lib/format";

function sourceLabel(source?: Source): { label: string; url: string } | null {
  if (!source || source.type === "ai" || !source.url) return null;
  try {
    const host = new URL(source.url).hostname.replace(/^www\./, "");
    if (host.includes("wikipedia")) return { label: "Wikipedia", url: source.url };
    return { label: host, url: source.url };
  } catch {
    return { label: "Source", url: source.url };
  }
}

export function LessonMeta({ lesson }: { lesson: Lesson }) {
  const parts: string[] = [];
  const date = formatLong(lesson.date);
  if (date) parts.push(date);
  if (lesson.level) parts.push(lesson.level);
  const src = sourceLabel(lesson.source);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-xs font-medium uppercase tracking-[0.16em] text-muted">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-faint">·</span>}
          {p}
        </span>
      ))}
      {src && (
        <span className="flex items-center gap-2">
          {parts.length > 0 && <span className="text-faint">·</span>}
          <a
            className="text-accent transition-colors hover:text-accent-deep"
            href={src.url}
            target="_blank"
            rel="noopener"
          >
            {src.label} ↗
          </a>
        </span>
      )}
    </div>
  );
}
