"use client";

import { useState } from "react";
import type { QuizItem } from "@/lib/types";
import { SectionLabel } from "./SectionLabel";

export function Quiz({ items }: { items: QuizItem[] }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionLabel>Quiz</SectionLabel>
      <ol className="space-y-8">
        {items.map((item, i) => (
          <QuizQuestion key={i} item={item} index={i} />
        ))}
      </ol>
    </section>
  );
}

function QuizQuestion({ item, index }: { item: QuizItem; index: number }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [needPick, setNeedPick] = useState(false);

  const check = () => {
    if (answered) return;
    if (item.type === "mcq") {
      if (chosen === null) {
        setNeedPick(true);
        return;
      }
      setNeedPick(false);
      setCorrect(chosen === item.answer);
      setAnswered(true);
    } else {
      setCorrect(
        value.trim().toLowerCase() === String(item.answer || "").trim().toLowerCase(),
      );
      setAnswered(true);
    }
  };

  const num = String(index + 1).padStart(2, "0");

  return (
    <li className="flex gap-4">
      <span className="select-none pt-0.5 font-mono text-sm text-accent">{num}</span>
      <div className="min-w-0 flex-1">
        <div className="font-serif text-[1.08rem] leading-relaxed text-ink">
          {item.type === "mcq" ? item.q : item.sentence}
        </div>

        {item.type === "mcq" ? (
          <div className="mt-3 space-y-2">
            {item.options.map((opt, oi) => {
              const isAnswer = oi === item.answer;
              const isChosen = oi === chosen;
              const state = answered
                ? isAnswer
                  ? "border-correct bg-correct-soft text-ink-strong"
                  : isChosen
                    ? "border-wrong bg-wrong-soft text-ink-strong"
                    : "border-rule text-ink-soft"
                : isChosen
                  ? "border-accent bg-accent-tint text-ink-strong"
                  : "border-rule text-ink hover:border-accent/60";
              return (
                <label
                  key={oi}
                  className={
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 font-ui text-sm transition-colors " +
                    state +
                    (answered ? " cursor-default" : "")
                  }
                >
                  <input
                    type="radio"
                    name={`q${index}`}
                    className="accent-accent"
                    checked={isChosen}
                    disabled={answered}
                    onChange={() => setChosen(oi)}
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <input
            type="text"
            value={value}
            disabled={answered}
            placeholder="your answer"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                check();
              }
            }}
            className="mt-3 w-full max-w-xs rounded-lg border border-rule bg-surface px-3.5 py-2 font-ui text-sm text-ink outline-none transition-colors focus:border-accent disabled:opacity-70"
          />
        )}

        {!answered && (
          <button
            type="button"
            onClick={check}
            className="mt-3 rounded-lg border border-accent px-4 py-1.5 font-ui text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-surface"
          >
            Check
          </button>
        )}

        {needPick && !answered && (
          <div className="mt-2 font-ui text-sm text-wrong">Pick an option first.</div>
        )}

        {answered && (
          <div
            className={
              "mt-3 font-ui text-sm leading-relaxed " +
              (correct ? "text-correct" : "text-wrong")
            }
          >
            <strong className="font-semibold">
              {correct
                ? "Correct."
                : `Answer: ${item.type === "mcq" ? item.options[item.answer] : item.answer}.`}
            </strong>
            {item.why && <span className="text-ink-soft"> {item.why}</span>}
          </div>
        )}
      </div>
    </li>
  );
}
