"use client";

import { useEffect, useRef } from "react";
import type { VideoLesson as VideoLessonType } from "@/lib/types";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { tokenize } from "@/lib/tokenize";
import { formatTime } from "@/lib/format";
import { Word } from "./Word";
import { LessonActivities } from "./LessonActivities";

export function VideoLesson({ lesson }: { lesson: VideoLessonType }) {
  const segments = lesson.segments || [];
  const { containerRef, activeStart, seekTo } = useYouTubePlayer(lesson.video_id, segments);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeStart === null) return;
    const box = transcriptRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-start="${activeStart}"]`);
    if (box && el) box.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
  }, [activeStart]);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="overflow-hidden rounded-xl border border-rule bg-ink-strong shadow-sm">
          <div
            ref={containerRef}
            className="aspect-video w-full [&_iframe]:h-full [&_iframe]:w-full"
          />
        </div>

        <div
          ref={transcriptRef}
          className="max-h-[60vh] overflow-y-auto rounded-xl border border-rule bg-surface-warm p-3 lg:max-h-[70vh]"
        >
          {segments.map((seg, i) => {
            const active = Number(seg.start) === activeStart;
            return (
              <p
                key={i}
                data-start={seg.start}
                className={
                  "flex gap-3 rounded-lg px-3 py-2 transition-colors " +
                  (active ? "bg-accent-tint" : "")
                }
              >
                <button
                  type="button"
                  onClick={() => seekTo(Number(seg.start))}
                  className="shrink-0 pt-1 font-mono text-xs text-muted transition-colors hover:text-accent"
                >
                  {formatTime(seg.start)}
                </button>
                <span className="font-serif leading-relaxed text-ink">
                  {tokenize(seg.text).map((t, ti) =>
                    t.word ? (
                      <Word key={ti} text={t.text} sentence={seg.text} wordKey={`s${i}-w${ti}`} />
                    ) : (
                      <span key={ti}>{t.text}</span>
                    ),
                  )}
                </span>
              </p>
            );
          })}
        </div>
      </div>

      <LessonActivities lesson={lesson} />
    </>
  );
}
