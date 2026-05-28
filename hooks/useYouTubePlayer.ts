"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Segment } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Loads the YouTube IFrame API, mounts a player, and tracks the active
    transcript segment's start time so the transcript can highlight in sync. */
export function useYouTubePlayer(videoId: string | undefined, segments: Segment[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [activeStart, setActiveStart] = useState<number | null>(null);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const startSync = () => {
      const starts = segments.map((s) => Number(s.start));
      interval = setInterval(() => {
        const p = playerRef.current;
        if (!p?.getCurrentTime) return;
        let t: number;
        try {
          t = p.getCurrentTime();
        } catch {
          return;
        }
        let idx = -1;
        for (let i = 0; i < starts.length; i++) {
          if (starts[i] <= t + 0.05) idx = i;
          else break;
        }
        if (idx >= 0) setActiveStart(starts[idx]);
      }, 250);
    };

    const createPlayer = () => {
      const host = containerRef.current;
      if (cancelled || !host || !window.YT?.Player) return;
      host.innerHTML = "";
      const target = document.createElement("div");
      host.appendChild(target);
      playerRef.current = new window.YT.Player(target, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, cc_load_policy: 0 },
        events: { onReady: startSync },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        createPlayer();
      };
      if (!document.getElementById("yt-api")) {
        const tag = document.createElement("script");
        tag.id = "yt-api";
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* player already gone */
      }
      playerRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [videoId, segments]);

  const seekTo = useCallback((start: number) => {
    const p = playerRef.current;
    if (p?.seekTo) {
      p.seekTo(start, true);
      p.playVideo?.();
    }
  }, []);

  return { containerRef, activeStart, seekTo };
}
