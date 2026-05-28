const WORD_RE = /([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]*)/g;

export interface Token {
  word: boolean;
  text: string;
}

/** Split German text into clickable word tokens and the punctuation/space between them. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ word: false, text: text.slice(last, m.index) });
    out.push({ word: true, text: m[1] });
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push({ word: false, text: text.slice(last) });
  return out;
}

/** Split a lesson body into paragraphs on blank lines. */
export function paragraphs(text: string): string[] {
  const chunks = (text || "")
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return chunks.length ? chunks : [text || ""];
}
