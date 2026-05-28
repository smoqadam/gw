"use client";

import { useEffect } from "react";

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      role="dialog"
      aria-label="About German Weekly"
      className={
        "fixed inset-0 z-[60] flex items-center justify-center p-5 transition-opacity duration-200 " +
        (open ? "opacity-100" : "pointer-events-none opacity-0")
      }
    >
      <div onClick={onClose} className="absolute inset-0 bg-ink-strong/40" />
      <div
        className={
          "relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-rule bg-surface p-7 shadow-[0_24px_64px_-24px_rgba(15,17,21,0.45)] transition-transform duration-200 " +
          (open ? "scale-100" : "scale-95")
        }
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 font-ui text-muted transition-colors hover:text-ink"
        >
          ✕
        </button>
        <h2 className="font-display text-2xl font-semibold text-ink-strong">German Weekly</h2>

        <p className="mt-3 font-serif leading-relaxed text-ink-soft">
          A small site I made to keep up my German. Each week there&apos;s a short lesson — a text or
          a YouTube video with a transcript that follows along — and every German word is clickable.
        </p>

        <ul className="mt-4 space-y-2 font-ui text-sm leading-relaxed text-ink-soft">
          <li>
            Click an <strong className="font-semibold text-ink">underlined word</strong> to see what
            it means, then save it to your deck.
          </li>
          <li>
            Use the <strong className="font-semibold text-ink">☰</strong> menu to browse older
            lessons.
          </li>
          <li>Each lesson and your deck have small games to drill the words.</li>
        </ul>

        <p className="mt-4 font-serif leading-relaxed text-ink-soft">
          Heads up: the dictionary meanings come from an AI model, so they&apos;re sometimes wrong —
          double-check anything important. This is mostly vibe-coded for my own use. It runs entirely
          in your browser: no account, nothing stored on a server, and your deck stays on this device.
        </p>

        <p className="mt-4 font-ui text-sm leading-relaxed text-ink-soft">
          Code, notes, and the README are on{" "}
          <a
            className="text-accent transition-colors hover:text-accent-deep"
            href="https://github.com/smoqadam/gw"
            target="_blank"
            rel="noopener"
          >
            GitHub
          </a>
          . Something broken or an idea?{" "}
          <a
            className="text-accent transition-colors hover:text-accent-deep"
            href="https://github.com/smoqadam/gw/issues"
            target="_blank"
            rel="noopener"
          >
            Open an issue
          </a>
          .
        </p>
      </div>
    </div>
  );
}
