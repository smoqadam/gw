"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchIndex, fetchLesson } from "@/lib/lessons";
import type { IndexEntry, Lesson } from "@/lib/types";
import { Nav } from "./Nav";
import { Drawer } from "./Drawer";
import { AboutModal } from "./AboutModal";
import { LookupProvider } from "./LookupProvider";
import { LessonMeta } from "./LessonMeta";
import { TextLesson } from "./TextLesson";
import { VideoLesson } from "./VideoLesson";

export function LessonView() {
  const params = useSearchParams();
  const wanted = params.get("lesson");

  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const idx = await fetchIndex();
        if (cancelled) return;
        setIndex(idx);
        if (!idx.length) throw new Error("No lessons yet.");
        const entry = wanted ? idx.find((e) => e.id === wanted) : idx[0];
        if (!entry) throw new Error("Lesson not found.");
        const l = await fetchLesson(entry.id);
        if (cancelled) return;
        setLesson(l);
        document.title = `${l.title || "German Weekly"} — German Weekly`;
      } catch (e) {
        if (cancelled) return;
        setLesson(null);
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  const widthClass = !lesson
    ? "max-w-wide"
    : lesson.type === "video"
      ? "max-w-6xl"
      : "max-w-content";

  return (
    <LookupProvider lessonLabel={lesson?.title || ""}>
      <Nav onMenu={() => setDrawerOpen(true)} onAbout={() => setAboutOpen(true)} />
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entries={index}
        activeId={lesson?.id ?? null}
      />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <main className={"mx-auto w-full px-5 pb-24 pt-12 sm:px-8 " + widthClass}>
        {loading && (
          <div className="font-ui text-xs uppercase tracking-[0.16em] text-muted">Loading…</div>
        )}

        {error && !loading && (
          <div>
            <div className="font-ui text-sm text-wrong">{error}</div>
            <p className="mt-3 font-serif text-ink-soft">
              Run the generator to create the first lesson.
            </p>
          </div>
        )}

        {lesson && !loading && (
          <>
            <LessonMeta lesson={lesson} />
            <h1 className="mt-3 mb-10 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-ink-strong sm:text-[3.25rem]">
              {lesson.title || "German Weekly"}
            </h1>
            {lesson.type === "video" ? (
              <VideoLesson lesson={lesson} />
            ) : (
              <TextLesson lesson={lesson} />
            )}
          </>
        )}
      </main>

      <footer className={"mx-auto w-full px-5 pb-12 font-ui text-xs text-muted sm:px-8 " + widthClass}>
        GermanWeekly.com on{" "}
        <a
          className="text-accent transition-colors hover:text-accent-deep"
          href="https://github.com/smoqadam/gw"
          target="_blank"
          rel="noopener"
        >
          GitHub →
        </a>
      </footer>
    </LookupProvider>
  );
}
