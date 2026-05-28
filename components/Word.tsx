"use client";

import { useLookup } from "./LookupProvider";

const BASE =
  "gw-word cursor-pointer rounded-[3px] underline decoration-dotted decoration-[1.5px] underline-offset-[3px] transition-colors";

export function Word({ text, sentence, wordKey }: { text: string; sentence: string; wordKey: string }) {
  const { open, activeKey } = useLookup();
  const active = activeKey === wordKey;
  return (
    <span
      className={
        BASE +
        (active
          ? " bg-accent-tint text-accent-deep decoration-accent"
          : " decoration-rule-strong hover:text-accent-deep hover:decoration-accent")
      }
      onClick={(e) => {
        e.stopPropagation();
        open(text, sentence, wordKey);
      }}
    >
      {text}
    </span>
  );
}
