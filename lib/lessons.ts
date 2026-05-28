import type { IndexEntry, Lesson } from "./types";

export async function fetchIndex(): Promise<IndexEntry[]> {
  const res = await fetch("/lessons/index.json", { cache: "no-store" });
  if (!res.ok) throw new Error("No lessons yet.");
  return res.json();
}

export async function fetchLesson(id: string): Promise<Lesson> {
  const res = await fetch(`/lessons/${id}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error("Lesson not found.");
  return res.json();
}

/** Lessons store voice_path as "lessons/<id>.mp3"; resolve to a root-absolute URL. */
export function audioUrl(voicePath: string | undefined): string | null {
  if (!voicePath) return null;
  return voicePath.startsWith("/") ? voicePath : `/${voicePath}`;
}
