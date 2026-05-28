export interface DictExample {
  de?: string;
  en?: string;
}

export interface DictEntry {
  word?: string;
  article?: string;
  part_of_speech?: string;
  ipa?: string;
  plural?: string;
  conjugation?: string;
  german_definition?: string;
  english_translations?: string[];
  examples?: DictExample[];
  grammar_notes?: string;
  related_words?: string[];
}

interface DictResponse {
  entry: DictEntry;
}

const DICT_API = "https://dict.germanweekly.com/api/lookup/";
const cache = new Map<string, DictEntry>();

export async function lookup(word: string): Promise<DictEntry> {
  const cached = cache.get(word);
  if (cached) return cached;
  const res = await fetch(DICT_API + encodeURIComponent(word));
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data: DictResponse = await res.json();
  cache.set(word, data.entry);
  return data.entry;
}
