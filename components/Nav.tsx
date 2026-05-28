"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeckCount } from "@/hooks/useDeck";

export function Nav({ onMenu, onAbout }: { onMenu: () => void; onAbout: () => void }) {
  const count = useDeckCount();
  const pathname = usePathname();
  const deckActive = pathname?.startsWith("/deck") ?? false;

  return (
    <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-rule bg-paper/85 px-5 py-3.5 backdrop-blur-sm sm:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Browse lessons"
          onClick={onMenu}
          className="-ml-1.5 rounded-md p-1.5 font-ui text-xl leading-none text-ink-soft transition-colors hover:text-accent"
        >
          ☰
        </button>
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink-strong">
          German<span className="px-0.5 text-accent">·</span>Weekly
        </Link>
      </div>
      <div className="flex items-center gap-5 font-ui text-sm">
        <button
          type="button"
          onClick={onAbout}
          className="text-ink-soft transition-colors hover:text-accent"
        >
          About
        </button>
        <Link
          href="/deck/"
          className={
            "inline-flex items-center gap-1.5 transition-colors hover:text-accent " +
            (deckActive ? "text-accent" : "text-ink-soft")
          }
        >
          Deck
          {count > 0 && (
            <span className="rounded-full bg-accent-tint px-1.5 py-0.5 font-mono text-[0.7rem] leading-none text-accent-deep">
              {count}
            </span>
          )}
        </Link>
      </div>
    </nav>
  );
}
