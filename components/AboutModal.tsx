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
          "relative w-full max-w-md rounded-2xl border border-rule bg-surface p-7 shadow-[0_24px_64px_-24px_rgba(15,17,21,0.45)] transition-transform duration-200 " +
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
          Free German lessons, updated weekly. Saved words stay in your browser, and no data is
          stored on a server.
        </p>
        <ul className="mt-4 space-y-2 font-ui text-sm leading-relaxed text-ink-soft">
          <li>Dictionary lookups are AI-generated — double-check with a trusted source.</li>
          <li>
            Tap any <strong className="font-semibold text-ink">highlighted word</strong> in a lesson
            to look it up.
          </li>
          <li>
            Browse past lessons using the <strong className="font-semibold text-ink">☰</strong> menu.
          </li>
          <li>
            <a
              className="text-accent transition-colors hover:text-accent-deep"
              href="https://github.com/smoqadam/gw"
              target="_blank"
              rel="noopener"
            >
              View on GitHub →
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
