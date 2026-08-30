/**
 * Needle generation and source-window construction for the Sanskrit citation
 * matcher.
 *
 * Provides `buildSourceWindow` (the lookback window fed to `findQuotedSpan`),
 * `buildQuoteNeedles` (ranked suffix candidates from that window), and
 * `extractEnclosedQuote` (exact-span extraction when the citation is enclosed
 * in a quote pair).
 *
 * Imported by `quotedMatch.ts`; depends on `quotedMatchNormalize.ts` and
 * `quotedMatchAlign.ts`.
 */

import { MIN_QUOTE_NEEDLE_LEN } from "./quotedMatchNormalize.ts";
import { isClusterCodePoint } from "./quotedMatchAlign.ts";

// ---------------------------------------------------------------------------
// Source-window constants
// ---------------------------------------------------------------------------

/** Characters of source text examined immediately before the citation. */
export const MAX_LOOKBACK = 60;

/** Hard cap on backward extension across verse-line (danda+newline) boundaries
 *  when collecting a multi-pāda shloka quote into the source window. */
export const QUOTE_LINE_EXTEND_CAP = 400;

/** Opening/closing delimiter pairs that mark a fully-formed quoted span in a
 *  source window: markdown bold (the corpus quotes Sanskrit in `**…**`) and
 *  curly/straight quote pairs. */
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["**", "**"],
  ["'", "'"],
  ["\u201C", "\u201D"],
  ['"', '"'],
  ["\u2018", "\u2019"],
];

/** Chars of window tail allowed after the closing delimiter: the citation
 *  locator in parens (e.g. " (श्वे. उ. १.९)") sits between the quote and the
 *  citation offset. */
const QUOTE_TAIL_TOLERANCE = 20;

/** Hard cap on backward extension to an enclosing quote opener (chars): a
 *  quoted verse can run well past MAX_LOOKBACK, so the extraction walks back
 *  up to this far to find the citation's own quote pair. */
const QUOTE_EXTEND_CAP = 600;

/** Cap on the number of word-boundary needle candidates, so an extended
 *  multi-line window never explodes the candidate count. */
const MAX_QUOTE_NEEDLES = 80;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** The nearest opener of a complete quote pair at or before `from` (within
 *  `QUOTE_EXTEND_CAP` chars) whose closer lies before `refStart` — i.e. the
 *  citation's own enclosing quote when the hard lookback cut lands inside it.
 *  Returns null when no such pair is visible. */
const enclosingQuoteStart = (
  sourceText: string,
  from: number,
  refStart: number,
): number | null => {
  const limit = Math.max(0, from - QUOTE_EXTEND_CAP);
  for (let p = from - 1; p >= limit; p--) {
    for (const [open, close] of QUOTE_PAIRS) {
      if (!sourceText.startsWith(open, p)) {
        continue;
      }
      const closeAt = sourceText.indexOf(close, p + open.length);
      if (closeAt !== -1 && closeAt < refStart) {
        return p;
      }
      break;
    }
  }
  return null;
};

/** The trailing graphemes of ``phrase`` that can be elided in sandhi: a
 *  word-final anusvara (ं), a syllable-final म् (म्), or a visarga (ः) are
 *  absorbed when the following word begins with a consonant
 *  ("निर्गुणं" → "निर्गुणश्च"). Returns the tail to drop ("" when none).
 *  Mirrors Python citation_repair.py ``_trailing_elidible_tail``. */
const trailingElidibleTail = (phrase: string): string => {
  if (phrase.length >= 3 && phrase.endsWith("म्")) {
    return "म्";
  }
  if (phrase.length >= 2 && (phrase.endsWith("ं") || phrase.endsWith("ः"))) {
    return phrase[phrase.length - 1];
  }
  return "";
};

/** True when a char is a real word separator (whitespace, danda, or an
 *  en/em dash — a quote that begins after a dash starts the needle on the
 *  quote, not the dash). A virama mid-word is NOT a separator — conjuncts stay
 *  one word. */
const isSeparatorChar = (ch: string): boolean =>
  /\s/.test(ch) || ch === "।" || ch === "॥" || ch === "\u2013" || ch === "\u2014";

/** True when a char cannot start a word: a Devanagari virama/matra/combining
 *  mark (a candidate starting on those renders a dotted circle or splits a
 *  syllable). */
const isNonWordStart = (ch: string): boolean =>
  isClusterCodePoint(ch.codePointAt(0) ?? 0);

/** The position just after the last complete ``(ref)`` citation group that ends
 *  strictly before `before` (the citation's own ``( … )`` is at `before` and
 *  must not be matched). Returns `null` when no earlier citation exists. */
const crossRefEnd = (text: string, before: number): number | null => {
  let end = -1;
  const re = /\([^()\n]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index >= before) {
      break;
    }
    if (m.index + m[0].length <= before) {
      end = m.index + m[0].length;
    }
  }
  return end === -1 ? null : end;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A fully-formed quoted span: the exact quoted text plus its window-relative
 *  offsets (delimiters included, so `start`/`end` map to the source text). */
export interface EnclosedQuote {
  text: string;
  /** Offset of the opening delimiter within the window. */
  start: number;
  /** Offset one past the closing delimiter within the window. */
  end: number;
}

/**
 * If the source window ends with a fully-formed quoted span (markdown bold or
 * a quote pair), return just that span — the exact quoted text, delimiters
 * included. A quote visible in the window is the citation itself, so matching
 * it alone beats fuzzy-matching the window's surrounding prose. Returns null
 * when no complete quote pair is visible near the window's end.
 *
 * Args:
 *     sourceWindow: The text before the citation (see `buildSourceWindow`).
 *
 * Returns:
 *     The last complete quoted span and its window-relative offsets, or null.
 */
export const extractEnclosedQuote = (sourceWindow: string): EnclosedQuote | null => {
  let lastStart = -1;
  let lastEnd = -1;
  for (let i = 0; i < sourceWindow.length; i++) {
    for (const [open, close] of QUOTE_PAIRS) {
      if (!sourceWindow.startsWith(open, i)) {
        continue;
      }
      const closeAt = sourceWindow.indexOf(close, i + open.length);
      if (closeAt === -1) {
        break; // no closer for this opener — keep scanning
      }
      const end = closeAt + close.length;
      if (end > lastEnd) {
        lastStart = i;
        lastEnd = end;
      }
      break; // one opener matched at i
    }
  }
  if (lastStart === -1) {
    return null;
  }
  if (sourceWindow.length - lastEnd > QUOTE_TAIL_TOLERANCE) {
    return null;
  }
  return { text: sourceWindow.slice(lastStart, lastEnd), start: lastStart, end: lastEnd };
};

/** The source window returned by `buildSourceWindow`. */
export interface SourceWindow {
  text: string;
  /** Absolute offset of `text` within `sourceText`. */
  start: number;
}

/**
 * Build the source window for a citation: the `MAX_LOOKBACK` chars before the
 * reference offset, extended backward to the nearest whitespace boundary.
 *
 * A hard character cut can land mid-word (even mid-syllable, e.g. a lone
 * combining mark), which would hand the aligner a word fragment to anchor on.
 * Extending to the preceding whitespace starts the window on a word boundary
 * and recovers a little more context for a quote whose start sits just before
 * the cut. The window never extends past the citation start.
 *
 * Args:
 *     sourceText: The full source passage text containing the citation.
 *     refStart: The reference's `start` offset (code-point, safe to slice).
 *
 * Returns:
 *     The source window and its absolute start offset in `sourceText` — the
 *     window text feeds `findQuotedSpan`; the start maps an
 *     `extractEnclosedQuote` offset back to the source text.
 */
export const buildSourceWindow = (sourceText: string, refStart: number): SourceWindow => {
  let start = Math.max(0, refStart - MAX_LOOKBACK);
  while (start > 0 && !/\s/.test(sourceText[start - 1])) {
    start--;
  }
  // When the hard cut lands inside the citation's own quoted span (its
  // closing delimiter visible but the opener cut off), extend backward to the
  // opener — `extractEnclosedQuote` needs both delimiters to return the
  // fully-formed quote.
  const quoteStart = enclosingQuoteStart(sourceText, start, refStart);
  if (quoteStart !== null) {
    start = quoteStart;
  }
  // Collect a multi-pāda shloka quote into the window: walk backward across
  // completed verse lines (a line ending in a danda, `।\n` / `॥\n`) up to a
  // cap, so the whole verse (not just its last pāda) is available as a needle.
  const lineStartOf = (pos: number): number => {
    const nl = sourceText.lastIndexOf("\n", pos - 1);
    return nl === -1 ? 0 : nl + 1;
  };
  start = lineStartOf(start);
  let guard = 0;
  while (start > 0 && refStart - start < QUOTE_LINE_EXTEND_CAP && guard++ < 40) {
    const prevLineEnd = sourceText.lastIndexOf("\n", start - 2);
    if (prevLineEnd === -1) {
      start = 0;
      break;
    }
    const prevLineStart = sourceText.lastIndexOf("\n", prevLineEnd - 1) + 1;
    // Skip blank lines between verse-quote blocks.
    if (sourceText.slice(prevLineStart, prevLineEnd).trim() === "") {
      start = prevLineStart;
      continue;
    }
    if (!(sourceText[prevLineEnd - 1] === "।" || sourceText[prevLineEnd - 1] === "॥")) {
      break;
    }
    start = prevLineStart;
  }
  // Never extend the lookback across an EARLIER cross-reference.
  const prevRef = crossRefEnd(sourceText, refStart);
  if (prevRef !== null && prevRef > start) {
    start = prevRef;
  }
  return { text: sourceText.slice(start, refStart), start };
};

/**
 * Build ranked suffix needle candidates from a source window.
 *
 * Candidates are generated in two tiers, longest first:
 *   1. Pāda-aligned suffixes (danda / newline / dash boundaries).
 *   2. Word-aligned suffixes (whitespace boundaries), for prose-run quotes.
 *
 * Each candidate is trimmed of leading/trailing dandas. Sandhi derivatives
 * (leading अ/आ drop; trailing anusvara/visarga/म् drop) are emitted alongside
 * the canonical form so the aligner can match fused or absorbed forms.
 *
 * Args:
 *     sourceWindow: The text before the citation.
 *
 * Returns:
 *     Candidate needle strings, longest-first, deduped.
 */
export const buildQuoteNeedles = (sourceWindow: string): string[] => {
  const s = sourceWindow.replace(/\s*\(\s*$/, "").replace(/[।॥]+\s*$/, "");
  let lead = 0;
  let prevIsBreak = true;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (isSeparatorChar(ch)) {
      prevIsBreak = true;
    } else if (prevIsBreak && !isNonWordStart(ch)) {
      lead = i;
      break;
    } else {
      prevIsBreak = false;
    }
  }
  const t = s.slice(lead);

  const padas = [0];
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "।" || ch === "॥" || ch === "\n") {
      padas.push(i + 1);
    } else if (ch === "\u2014" || ch === "\u2013") {
      padas.push(i + 1);
    }
  }
  padas.push(t.length);

  const words = [0];
  prevIsBreak = true;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (isSeparatorChar(ch)) {
      prevIsBreak = true;
    } else if (prevIsBreak && !isNonWordStart(ch)) {
      words.push(i);
      prevIsBreak = false;
    } else {
      prevIsBreak = false;
    }
  }

  const seen = new Set<string>();
  const needles: string[] = [];
  const add = (start: number): void => {
    const phrase = t
      .slice(start)
      .replace(/^[।॥\s(]+|[।॥\s)]+$/g, "")
      .trim();
    if (phrase.length >= MIN_QUOTE_NEEDLE_LEN && !seen.has(phrase)) {
      seen.add(phrase);
      needles.push(phrase);
      const first = phrase[0];
      if (first === "अ" || first === "आ") {
        const rest = phrase.slice(first.length);
        if (rest.length >= MIN_QUOTE_NEEDLE_LEN && !seen.has(rest)) {
          seen.add(rest);
          needles.push(rest);
        }
      }
      const tail = trailingElidibleTail(phrase);
      if (tail) {
        const rest = phrase.slice(0, phrase.length - tail.length);
        if (rest.length >= MIN_QUOTE_NEEDLE_LEN && !seen.has(rest)) {
          seen.add(rest);
          needles.push(rest);
        }
      }
    }
  };

  const uniqPadas: number[] = [];
  for (const b of padas) {
    if (uniqPadas[uniqPadas.length - 1] !== b) {
      uniqPadas.push(b);
    }
  }
  for (const b of uniqPadas) {
    add(b);
    if (needles.length >= MAX_QUOTE_NEEDLES) {
      return needles;
    }
  }

  const uniqWords: number[] = [];
  for (const b of words) {
    if (uniqWords[uniqWords.length - 1] !== b) {
      uniqWords.push(b);
    }
  }
  for (const b of uniqWords) {
    add(b);
    if (needles.length >= MAX_QUOTE_NEEDLES) {
      break;
    }
  }
  return needles;
};
