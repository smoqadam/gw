"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { IndexEntry } from "@/lib/types";
import { formatShort } from "@/lib/format";

export function Drawer({
  open,
  onClose,
  entries,
  activeId,
}: {
  open: boolean;
  onClose: () => void;
  entries: IndexEntry[];
  activeId: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={
          "fixed inset-0 z-40 bg-ink-strong/30 transition-opacity duration-300 " +
          (open ? "opacity-100" : "pointer-events-none opacity-0")
        }
      />
      <aside
        aria-hidden={!open}
        aria-label="Lessons"
        className={
          "fixed left-0 top-0 z-50 flex h-dvh w-[20rem] max-w-[85vw] flex-col border-r border-rule bg-surface-warm shadow-[16px_0_48px_-24px_rgba(15,17,21,0.3)] transition-transform duration-300 ease-out " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="border-b border-rule px-6 py-4 font-ui text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          Lessons
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto py-2">
          {entries.map((e) => (
            <Link
              key={e.id}
              href={`/?lesson=${encodeURIComponent(e.id)}`}
              onClick={onClose}
              className={
                "flex gap-3 px-6 py-3 transition-colors hover:bg-accent-tint " +
                (e.id === activeId ? "bg-accent-tint" : "")
              }
            >
              <span
                className={
                  "mt-0.5 shrink-0 font-mono text-sm " +
                  (e.type === "video" ? "text-accent" : "text-muted")
                }
              >
                {e.type === "video" ? "▶" : "¶"}
              </span>
              <span className="min-w-0">
                <span className="block font-serif text-[0.98rem] leading-snug text-ink">
                  {e.title || "Untitled"}
                </span>
                <span className="mt-0.5 block font-ui text-xs text-muted">
                  {formatShort(e.date)}
                  {e.level ? " · " + e.level : ""}
                </span>
              </span>
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
