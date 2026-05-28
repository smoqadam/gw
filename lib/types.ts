export type Level = string;

export interface VocabItem {
  word: string;
  definition: string;
  example?: string;
}

export interface PhraseItem {
  phrase: string;
  translation: string;
  example?: string;
}

export type QuizItem =
  | { type: "mcq"; q: string; options: string[]; answer: number; why?: string }
  | { type: "cloze"; sentence: string; answer: string; why?: string };

export interface Segment {
  start: number;
  end?: number;
  text: string;
}

export interface Source {
  type: "ai" | "youtube" | string;
  url?: string;
}

interface BaseLesson {
  id: string;
  title: string;
  date: string;
  level?: Level;
  source?: Source;
}

export interface TextLesson extends BaseLesson {
  type: "text";
  text: string;
  vocabs?: VocabItem[];
  phrases?: PhraseItem[];
  quiz?: QuizItem[];
  voice_path?: string;
}

export interface VideoLesson extends BaseLesson {
  type: "video";
  video_id?: string;
  url?: string;
  transcript_source?: "captions" | "yapsnap";
  segments: Segment[];
  vocabs?: VocabItem[];
}

export type Lesson = TextLesson | VideoLesson;

export interface IndexEntry {
  id: string;
  type: "text" | "video";
  title: string;
  date: string;
  level?: Level;
  video_id?: string;
}
