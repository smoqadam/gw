"use client";

import { useState } from "react";
import type { GameProps } from "@/lib/games/types";
import type { VocabItem } from "@/lib/types";
import { shuffle } from "@/lib/vocabPool";

interface Question {
  word: string;
  options: string[];
  answer: number;
}

function buildQuestions(items: VocabItem[]): Question[] {
  return shuffle(items).map((item) => {
    const distractorPool = Array.from(
      new Set(
        items
          .filter(
            (o) =>
              o.word.toLowerCase() !== item.word.toLowerCase() &&
              o.definition !== item.definition,
          )
          .map((o) => o.definition),
      ),
    );
    const distractors = shuffle(distractorPool).slice(0, 3);
    const options = shuffle([item.definition, ...distractors]);
    return { word: item.word, options, answer: options.indexOf(item.definition) };
  });
}

export function MeaningQuiz({ items, onExit }: GameProps) {
  const [questions, setQuestions] = useState<Question[]>(() => buildQuestions(items));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const q = questions[index];

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) setScore((s) => s + 1);
  };

  const next = () => {
    if (index + 1 >= questions.length) {
      setDone(true);
      return;
    }
    setIndex(index + 1);
    setPicked(null);
  };

  const replay = () => {
    setQuestions(buildQuestions(items));
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-rule bg-surface p-10 text-center">
        <div className="font-ui text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          Result
        </div>
        <div className="mt-3 font-display text-5xl font-semibold text-ink-strong">
          {score} <span className="text-muted">/ {questions.length}</span>
        </div>
        <p className="mt-3 font-serif text-ink-soft">
          {score === questions.length
            ? "Perfect round."
            : score >= questions.length / 2
              ? "Nicely done."
              : "Keep at it — repetition helps."}
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <button
            type="button"
            onClick={replay}
            className="rounded-lg bg-accent px-5 py-2.5 font-ui text-sm font-medium text-surface transition-colors hover:bg-accent-deep"
          >
            Play again
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg border border-rule-strong px-5 py-2.5 font-ui text-sm text-ink transition-colors hover:border-accent hover:text-accent"
          >
            Back to games
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rule bg-surface p-7 sm:p-9">
      <div className="flex items-center justify-between font-ui text-xs font-medium uppercase tracking-[0.16em] text-muted">
        <span>
          Question {index + 1} / {questions.length}
        </span>
        <span>Score {score}</span>
      </div>

      <h2 className="mt-5 font-serif text-lg text-ink-soft">
        What does{" "}
        <span className="font-display text-2xl font-semibold text-ink-strong">{q.word}</span> mean?
      </h2>

      <div className="mt-6 space-y-2.5">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer;
          const isPicked = i === picked;
          const state =
            picked === null
              ? "border-rule text-ink hover:border-accent/60"
              : isAnswer
                ? "border-correct bg-correct-soft text-ink-strong"
                : isPicked
                  ? "border-wrong bg-wrong-soft text-ink-strong"
                  : "border-rule text-muted";
          return (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              disabled={picked !== null}
              className={
                "block w-full rounded-lg border px-4 py-3 text-left font-ui text-sm transition-colors " +
                state +
                (picked === null ? " cursor-pointer" : " cursor-default")
              }
            >
              {opt}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={next}
          disabled={picked === null}
          className="rounded-lg bg-accent px-5 py-2.5 font-ui text-sm font-medium text-surface transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          {index + 1 >= questions.length ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}
