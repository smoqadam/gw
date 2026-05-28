"use client";

import type { TextLesson as TextLessonType } from "@/lib/types";
import { paragraphs, tokenize } from "@/lib/tokenize";
import { audioUrl } from "@/lib/lessons";
import { Word } from "./Word";
import { Glossary } from "./Glossary";
import { Quiz } from "./Quiz";
import { LessonActivities } from "./LessonActivities";

export function TextLesson({ lesson }: { lesson: TextLessonType }) {
  const audio = audioUrl(lesson.voice_path);
  const paras = paragraphs(lesson.text || "");
  const vocab = (lesson.vocabs || []).map((v) => ({
    term: v.word,
    definition: v.definition,
    example: v.example,
  }));
  const phrases = (lesson.phrases || []).map((p) => ({
    term: p.phrase,
    definition: p.translation,
    example: p.example,
  }));

  return (
    <>
      <div className="mx-auto max-w-content">
        {audio && (
          <audio
            controls
            src={audio}
            className="mb-10 h-11 w-full rounded-full [color-scheme:light]"
          />
        )}

        <article className="space-y-6 font-serif text-[1.18rem] leading-[1.75] text-ink">
          {paras.map((p, pi) => (
            <p key={pi}>
              {tokenize(p).map((t, ti) =>
                t.word ? (
                  <Word key={ti} text={t.text} sentence={p} wordKey={`p${pi}-w${ti}`} />
                ) : (
                  <span key={ti}>{t.text}</span>
                ),
              )}
            </p>
          ))}
        </article>
      </div>

      {vocab.length > 0 && (
        <div className="mt-16">
          <Glossary label="Vocabulary" items={vocab} maxColumns={4} />
        </div>
      )}

      {(phrases.length > 0 || (lesson.quiz?.length ?? 0) > 0) && (
        <div className="mx-auto mt-16 max-w-content space-y-16">
          {phrases.length > 0 && <Glossary label="Phrases" items={phrases} />}
          {lesson.quiz && lesson.quiz.length > 0 && <Quiz items={lesson.quiz} />}
        </div>
      )}

      <div className="mt-16">
        <LessonActivities lesson={lesson} />
      </div>
    </>
  );
}
