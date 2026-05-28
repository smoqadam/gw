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
  const videoColRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeStart === null) return;
    const box = transcriptRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-start="${activeStart}"]`);
    if (!box || !el) return;
    const elTopWithinBox = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const target = elTopWithinBox - box.clientHeight / 4 + el.offsetHeight / 3;
    box.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeStart]);

  // On wide screens, match the scrollable transcript's height to the video.
  useEffect(() => {
    const video = videoColRef.current;
    const box = transcriptRef.current;
    if (!video || !box) return;
    const apply = () => {
      box.style.height = window.innerWidth >= 1024 ? `${video.offsetHeight}px` : "";
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(video);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr] lg:items-start">
        <div
          ref={videoColRef}
          className="overflow-hidden rounded-xl border border-rule bg-ink-strong shadow-sm"
        >
          <div
            ref={containerRef}
            className="aspect-video w-full [&_iframe]:block [&_iframe]:h-full [&_iframe]:w-full"
          />
        </div>

        <div
          ref={transcriptRef}
          className="max-h-[55vh] overflow-y-auto rounded-xl border border-rule bg-surface-warm p-2 lg:max-h-none"
        >
          {segments.map((seg, i) => {
            const active = Number(seg.start) === activeStart;
            return (
              <p
                key={i}
                data-start={seg.start}
                className={
                  "flex items-start gap-3 rounded-lg px-3 py-1.5 transition-colors " +
                  (active ? "bg-accent-tint" : "")
                }
              >
                <button
                  type="button"
                  onClick={() => seekTo(Number(seg.start))}
                  className="shrink-0 font-mono text-xs leading-[1.7rem] text-muted transition-colors hover:text-accent"
                >
                  {formatTime(seg.start)}
                </button>
                <span className="font-serif leading-[1.7rem] text-ink">
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
