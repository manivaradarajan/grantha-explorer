/**
 * Fuzzy "needle-in-haystack" matching for the citation panel's quote
 * highlight.
 *
 * When a cross-text citation is clicked, the panel shows the full cited
 * passage (the haystack). The source text immediately before the citation
 * often embeds a quote of part of that passage (the needle), but the quote is
 * surrounded by commentary prose and usually diverges from the canonical text:
 * typos, pāda-break newlines, danda/whitespace drift, or sandhi-level
 * truncation. `findQuotedSpan` locates the best-matching region of the passage
 * against the source window using Smith–Waterman local alignment, so the
 * panel can highlight exactly the quoted span.
 *
 * The needle's boundaries are not known in advance (it sits inside prose), so
 * a plain substring search is insufficient; local alignment finds the
 * highest-scoring match of any window-against-passage region and reports it
 * in the passage's original coordinates.
 *
 * When the window shows the citation enclosed in a quote pair (`**…**` or
 * `‘…’`), the quote IS the citation — `extractEnclosedQuote` returns the
 * exact span and it is matched first (a tighter needle than the window's
 * prose); the whole window is the fuzzy fallback.
 */

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
  ["‘", "’"],
  ["“", "”"],
  ['"', '"'],
  ["'", "'"],
];

/** Chars of window tail allowed after the closing delimiter: the citation
 *  locator in parens (e.g. " (श्वे. उ. १.९)") sits between the quote and the
 *  citation offset. */
const QUOTE_TAIL_TOLERANCE = 20;

/** Hard cap on backward extension to an enclosing quote opener (chars): a
 *  quoted verse can run well past MAX_LOOKBACK, so the extraction walks back
 *  up to this far to find the citation's own quote pair. */
const QUOTE_EXTEND_CAP = 600;

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

/** True when ``derivative`` is a ONE-STEP sandhi/elision derivative of
 *  ``full``: ``derivative`` equals ``full`` minus its leading अ/आ (a-vowel
 *  fusion, "अपहतपाप्मा" → "पहतपाप्मा") or minus a trailing ं/ः/म् (nasal /
 *  visarga absorption, "निर्गुणं" → "निर्गुण"). This gates M1's source-span
 *  extension so a derivative never jumps to an unrelated longer needle.
 *  Mirrors Python's explicit full-form pairing in ``_quote_needle_pairs``. */
const isOneStepDerivative = (derivative: string, full: string): boolean => {
  if (full.length <= derivative.length) {
    return false;
  }
  if (derivative === full.slice(1) && (full[0] === "अ" || full[0] === "आ")) {
    return true;
  }
  return full.slice(0, derivative.length) === derivative &&
    trailingElidibleTail(full) === full.slice(derivative.length);
};

/** Build the source window for a citation: the `MAX_LOOKBACK` chars before the
 *  reference offset, extended backward to the nearest whitespace boundary.
 *
 *  A hard character cut can land mid-word (even mid-syllable, e.g. a lone
 *  combining mark), which would hand the aligner a word fragment to anchor on.
 *  Extending to the preceding whitespace starts the window on a word boundary
 *  and recovers a little more context for a quote whose start sits just before
 *  the cut. The window never extends past the citation start.
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
export interface SourceWindow {
  text: string;
  /** Absolute offset of `text` within `sourceText`. */
  start: number;
}

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
  // A long prose run is never fully swept — the walk stops at the first line
  // that does not end in a danda, and the candidate needles reject any prose
  // prefix that sneaks in.
  //
  // `start` may sit MID-line (the MAX_LOOKBACK cut + whitespace extension
  // never snaps to a line start), so first snap to the start of the current
  // line, then walk back line by line while each preceding line ends in a
  // danda+newline.
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
    // Skip blank lines between verse-quote blocks ("\n\n\n\n" gaps in the
    // rendered passage): they carry no content and must not stop the backward
    // pāda walk (the §236 whole-quote highlight needs to cross them).
    if (sourceText.slice(prevLineStart, prevLineEnd).trim() === "") {
      start = prevLineStart;
      continue;
    }
    // The line BEFORE the current start must itself end in a danda+newline
    // (i.e. the char before prevLineEnd is । or ॥) for it to be a verse pāda
    // that belongs to the same quote.
    if (!(sourceText[prevLineEnd - 1] === "।" || sourceText[prevLineEnd - 1] === "॥")) {
      break;
    }
    start = prevLineStart;
  }
  // Never extend the lookback across an EARLIER cross-reference: a window that
  // includes a previous "(ref) । …" lets the quote needle pollute across
  // citations (para 123 has two कौ. उ. ३.६४ refs on one line; the second
  // window must stop right after the first). Clamp `start` to just past the
  // previous citation's closing paren.
  const prevRef = crossRefEnd(sourceText, refStart);
  if (prevRef !== null && prevRef > start) {
    start = prevRef;
  }
  return { text: sourceText.slice(start, refStart), start };
};

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

/** Minimum matched run length (in kept chars) before a match is accepted. */
export const MIN_MATCH_CHARS = 10;

/** Minimum length of a tight quote needle before it is tried on its own. A
 *  shorter but *precise* phrase (e.g. "तत्त्वमसि", "अयमात्मा ब्रह्म") is a
 *  better needle than the surrounding prose window. */
export const MIN_QUOTE_NEEDLE_LEN = 4;

/** Cap on the number of word-boundary needle candidates, so an extended
 *  multi-line window never explodes the candidate count. */
const MAX_QUOTE_NEEDLES = 80;

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

/** A quote is usually a pāda (danda/newline-delimited unit) or a prose run.
 *  Candidates are generated in two tiers, longest first:
 *    1. pāda-aligned suffixes (a full shloka, its last pāda, …) — these
 *       delimit quoted verses precisely, so a mixed prose+quote window is never
 *       a single needle that swallows both;
 *    2. word-aligned suffixes (for prose-run quotes with no danda), starting
 *       after a whitespace/danda/newline boundary.
 *  The window's leading edge is trimmed to a word boundary first so a
 *  mid-word cut (a hard MAX_LOOKBACK cut or a preceding punctuation run) never
 *  starts a candidate on a fragment.
 */
export const buildQuoteNeedles = (sourceWindow: string): string[] => {
  // Drop the citation's own open paren (the window ends right at it) and any
  // trailing whitespace/danda left around it.
  const s = sourceWindow.replace(/\s*\(\s*$/, "").replace(/[।॥]+\s*$/, "");

  // Trim the leading edge to the first real word start (whitespace/danda
  // boundaries; never a virama/matra, which would start a candidate on a
  // dotted circle; virama mid-word is not a boundary).
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

  // Pāda boundaries: after each danda, after each newline (the window may
  // span several lines), and after an em/en-dash (a hard quote-start boundary:
  // "देवतैवमैक्षत — हन्ताहमि…" must needle from हन्ता, never from the dash's
  // preceding prose). The window end is always a boundary.
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

  // Word-start positions (tier 2).
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
      // Word-initial a-vowel sandhi: the quote "अपहतपाप्मा" appears in the
      // cited passage as "आत्मापहतपाप्मा" — the leading अ fuses into the
      // preceding word's final आ. Emit the variant without the absorbed
      // initial अ/आ so it can align against the fused form (chhandogya 8.7.1).
      const first = phrase[0];
      if (first === "अ" || first === "आ") {
        const rest = phrase.slice(first.length);
        if (rest.length >= MIN_QUOTE_NEEDLE_LEN && !seen.has(rest)) {
          seen.add(rest);
          needles.push(rest);
        }
      }
      // Trailing nasal/visarga elision: "निर्गुणं" appears in the cited
      // passage as "निर्गुणश्च" (sandhi with the next word's initial
      // sibilant). Emit the variant without the final grapheme so it can
      // align prefix-wise (śvetāśvatara 6.11). Mirrors Python
      // citation_repair.py.
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

  // Tier 1: pāda-aligned suffixes (dedup consecutive boundaries), longest first.
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

  // Tier 2: word-aligned suffixes (for prose-run quotes), longest first.
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

/** Minimum local-alignment similarity of the aligned region. */
export const MIN_SIMILARITY = 0.7;

const MATCH_SCORE = 2;
const MISMATCH_SCORE = -1;
const GAP_SCORE = -1;

/** Characters stripped from both sides before alignment (dandas, markdown,
 *  quote marks, punctuation). */
const STRIP_CHARS = new Set(["।", "॥", "*", "_", ".", "'", "‘", "’", '"']);

/** Consonants after which a syllable-final class nasal + virama collapses to
 *  the anusvara (सत्यसङ्कल्पः -> सत्यसंकल्पः): the unvoiced stops + sibilants.
 *  Before a VOICED consonant the nasal must stay (आनन्दम् keeps न्+द). */
const UNVOICED_AFTER_NASAL = new Set(
  "कखचछटठतथपफशषसह".split(""),
);

/** Characters that must never appear at a highlight edge: whitespace and
 *  anything `buildMatchString` strips (dandas, punctuation). A danda can leak
 *  in via a matched space that sat after it; it can never be a real match. */
const isTrimEdgeChar = (ch: string): boolean => /\s/.test(ch) || STRIP_CHARS.has(ch);

/** A normalized match string plus a map back to original UTF-16 indices. */
export interface MatchString {
  /** Normalized text: NFC, punctuation stripped, whitespace collapsed. */
  match: string;
  /** `map[i]` = original UTF-16 index of the i-th kept character. */
  map: number[];
}

/**
 * Build the NFC-normalized, punctuation-stripped match form of a Devanagari
 * string, retaining a map from each kept character back to its original
 * UTF-16 index.
 *
 * Stripping dandas, markdown, and quote marks plus collapsing whitespace
 * (pāda breaks are stored as newlines) makes the matcher tolerant of the
 * incidental drift between an inline quote and the canonical passage.
 *
 * Args:
 *     text: The raw text (source window or passage).
 *
 * Returns:
 *     The normalized match string and its original-index map.
 */
export const buildMatchString = (text: string): MatchString => {
  const nfc = text.normalize("NFC");
  const match: string[] = [];
  const map: number[] = [];
  let prevWasSpace = false;
  for (let i = 0; i < nfc.length; i++) {
    const ch = nfc[i];
    if (STRIP_CHARS.has(ch)) {
      continue;
    }
    if (/\s/.test(ch)) {
      // Virama-elision at a word join: "तत् त्वमसि" is the sandhi-unfused form
      // of "तत्त्वमसि". A space after a syllable-final virama (्, U+094D)
      // carries no sound and must not break an otherwise-exact quote, so skip
      // it (the following consonant then glues to the pre-virama consonant).
      const prevKept = match[match.length - 1];
      if (prevKept !== "्") {
        if (!prevWasSpace && match.length > 0) {
          match.push(" ");
          map.push(i);
        }
      }
      prevWasSpace = true;
      continue;
    }
    // Anusvara (ं, U+0902) and a syllable-final म् (म + virama) are the same
    // nasal in Sanskrit sandhi: विज्ञानम् == विज्ञानं, आनन्दम् == आनन्दं.
    // Collapse both to a single sentinel so anusvara drift between the quoted
    // text and the canonical passage never breaks an otherwise-exact short
    // quote (the reported "विज्ञानम्" vs "विज्ञानं" highlight miss).
    if (ch === "ं") {
      match.push("ं");
      map.push(i);
      prevWasSpace = false;
      continue;
    }
    // A syllable-final म् is an anusvara (विज्ञानम् == विज्ञानं); always
    // collapse it.
    if (ch === "म" && nfc[i + 1] === "्") {
      match.push("ं"); // same sentinel as anusvara
      map.push(i);
      i++; // consume the virama — it is not a separate kept char
      prevWasSpace = false;
      continue;
    }
    // A syllable-final class nasal (ङ/ञ/ण/न) + virama is an anusvara when it
    // precedes an UNVOICED consonant (सत्यसङ्कल्पः/सत्यसंकल्पः: ङ्+क == ं+क).
    // Before a VOICED consonant (आनन्दम्: न्+द) the nasal must stay. Mirrors
    // Python.
    if (
      (ch === "ङ" || ch === "ञ" || ch === "ण" || ch === "न") &&
      nfc[i + 1] === "्" &&
      UNVOICED_AFTER_NASAL.has(nfc[i + 2])
    ) {
      match.push("ं"); // same sentinel as anusvara
      map.push(i);
      i++; // consume the virama — it is not a separate kept char
      prevWasSpace = false;
      continue;
    }
    // Avagraha (ऽ, U+093D) is an elided अ: "आत्माऽपहतपाप्मा" from
    // "आत्मा + अपहतपाप्मा". Canonicalize it to अ so a quote needle
    // "अपहतपाप्मा" aligns against the fused form. Mirrored in Python
    // citation_repair.py normalize().
    if (ch === "\u093D") {
      match.push("\u0905");
      map.push(i);
      prevWasSpace = false;
      continue;
    }
    // Visarga (ः) assimilation before a sibilant: a word-final ः followed by a
    // स/श/ष is the sibilant's doubled form across a word boundary
    // ("यः सर्वज्ञः" == "यस्सर्वज्ञस्सर्व..."). Fold ः + optional ws +
    // sibilant to the doubled sibilant on BOTH sides. Mirrored in Python.
    if (ch === "\u0903") {
      let j = i + 1;
      while (j < nfc.length && /\s/.test(nfc[j])) {
        j++;
      }
      if (j < nfc.length && (nfc[j] === "स" || nfc[j] === "श" || nfc[j] === "ष")) {
        match.push(nfc[j]);
        map.push(i);
        match.push(nfc[j]);
        map.push(j);
        prevWasSpace = false;
        i = j; // loop increment advances past the sibilant
        continue;
      }
      match.push(ch);
      map.push(i);
      prevWasSpace = false;
      continue;
    }
    match.push(ch);
    map.push(i);
    prevWasSpace = false;
  }
  // Drop a trailing collapsed space (left behind when a danda/punctuation was
  // stripped after it) so both sides have no dangling separator.
  if (match.length > 0 && match[match.length - 1] === " ") {
    match.pop();
    map.pop();
  }
  return { match: match.join(""), map };
};

/**
 * Locate the span of `passage` that best matches the quote embedded in
 * `sourceWindow`, using Smith–Waterman local alignment.
 *
 * The window is the text immediately before a citation (typically commentary
 * prose containing a quote of the passage); the quote's exact boundaries are
 * unknown. Local alignment scores every window-region against every
 * passage-region and backtracks the best cell, returning that region in the
 * passage's ORIGINAL coordinates. A match is accepted only when the aligned
 * run is long enough and similar enough (see constants); otherwise `null`.
 *
 * Args:
 *     sourceWindow: The text before the citation (the needle's containing
 *         prose), as produced by `buildSourceWindow` (whitespace-extended and
 *         enclosing-quote-aware).
 *     passage: The full cited passage (the haystack).
 *
 * Returns:
 *     The half-open `[start, end)` span in `passage`'s original UTF-16
 *     coordinates, or `null` when no confident match exists.
 */
export const findQuotedSpan = (
  sourceWindow: string,
  passage: string,
): { start: number; end: number; sourceStart: number; sourceEnd: number } | null => {
  const windowStr = buildMatchString(sourceWindow);
  const passageStr = buildMatchString(passage);
  const subject = passageStr.match;
  if (subject.length === 0) {
    return null;
  }
  // Candidate needles, tightest-to-loosest but with the FULL quote preferred:
  // a fully-formed quoted span (when the window shows the citation enclosed in
  // quotes) matches exactly; then every word-boundary-aligned suffix of the
  // window, longest first (so a full multi-pāda shloka beats its last pāda,
  // and a prose-prefixed window falls through to the quote without the
  // prefix). Each candidate must be START-ANCHORED (the needle's first kept
  // char aligns — a prose/mid-word prefix like "इत्यारभ्य" or "स च" fails
  // this) and HIGH-COVERAGE (most of the needle aligns), so a
  // prose-prefixed candidate falls through to the next, tighter one.
  const needles: string[] = [];
  const enclosed = extractEnclosedQuote(sourceWindow);
  if (enclosed !== null) {
    needles.push(enclosed.text);
  }
  const quoteNeedles = buildQuoteNeedles(sourceWindow);
  for (const tight of quoteNeedles) {
    if (tight !== enclosed?.text && !needles.includes(tight)) {
      needles.push(tight);
    }
  }
  if (needles.length === 0) {
    needles.push(sourceWindow);
  }

  for (const needle of needles) {
    const query = buildMatchString(needle).match;
    if (query.length === 0) {
      continue;
    }
    const span = align(query, subject);
    if (span === null) {
      continue;
    }
    const { score, queryStart, queryEnd, subjectStart, subjectEnd } = span;
    const alignedLength = Math.max(queryEnd - queryStart, subjectEnd - subjectStart);
    // Start-anchored: the needle's first kept char must be part of the match.
    // A needle that begins with prose (the aligner skipped a leading gap) is a
    // prose-prefixed window, not a clean quote — fall through to a tighter
    // candidate.
    if (queryStart !== 0) {
      continue;
    }
    // A short but precise needle (the tight quote) needs a lower absolute
    // floor than the 10-char prose window — a 9-char exact phrase like
    // "तत्त्वमसि" must not be rejected by a score gate sized for prose.
    const minScore = 2 * Math.max(MIN_QUOTE_NEEDLE_LEN, Math.min(MIN_MATCH_CHARS, query.length));
    if (score < minScore) {
      continue;
    }
    if (alignedLength === 0 || score / (2 * alignedLength) < MIN_SIMILARITY) {
      // Comma-elision fallback: a needle may join two canonical phrases with a
      // comma that compresses the passage's intervening words (e.g. para 236's
      // "ऐतदात्म्यमिदं सर्वं, तत्त्वमसि श्वेतकेतो" omits "तत्सत्यम् । स आत्मा ।").
      // The joined needle fails whole-passage similarity, but each
      // comma-separated segment matches its own region cleanly — union them
      // into one highlight. Fires ONLY for comma-containing needles; the
      // general इत्यादि elision handling is intentionally untouched.
      const commaUnion = tryCommaSegmentUnion(needle, sourceWindow, subject, passageStr, passage);
      if (commaUnion !== null) {
        return commaUnion;
      }
      continue;
    }
    // Preview-side span (the highlight in the card).
    const start = passageStr.map[subjectStart];
    const end = passageStr.map[subjectEnd - 1] + 1;
    if (start >= end || end > passage.length) {
      continue;
    }
    const clamped = clampToGraphemeBoundaries(passage, start, end);
    if (clamped === null) {
      continue;
    }
    // Source-side span (where the quote sits in the window → the source
    // passage). The exact quoted span carries its delimiters (the mark wraps
    // them; the commentary sanitizer pairs the bold); the tight-quote and
    // whole-window matches need grapheme clamping + edge trimming like the
    // preview side. Each needle type maps its own query offsets:
    //   - enclosed: window-relative delimiters, already exact;
    //   - tight needle: offsets are relative to the needle, offset into the
    //     window by the needle's position;
    //   - whole window: offsets are already window-relative.
    let sourceStart: number;
    let sourceEnd: number;
    if (enclosed !== null && needle === enclosed.text) {
      sourceStart = enclosed.start;
      sourceEnd = enclosed.end;
    } else {
      let rawStart = 0;
      let rawEnd = 0;
      if (needle !== sourceWindow) {
        const tightOffset = sourceWindow.lastIndexOf(needle);
        if (tightOffset === -1) {
          continue;
        }
        // M1: derive the source span from the FULL quote form when the accepted
        // needle is a one-step sandhi/elision derivative and that full form is
        // still verbatim, containing the accepted needle's span — the highlight
        // must cover the whole quoted word ("पहतपाप्मा" derives from
        // "अपहतपाप्मा"; "निर्गुण" from "निर्गुणं"). The full verbatim extent
        // is authoritative; the derivative's query offsets do not map into it.
        let extended = false;
        for (const other of needles) {
          if (other.length > needle.length && isOneStepDerivative(needle, other)) {
            const otherOffset = sourceWindow.lastIndexOf(other);
            if (otherOffset !== -1 && otherOffset <= tightOffset &&
                otherOffset + other.length >= tightOffset + needle.length) {
              rawStart = otherOffset;
              rawEnd = otherOffset + other.length;
              extended = true;
              break;
            }
          }
        }
        if (!extended) {
          const needleMap = buildMatchString(needle).map;
          rawStart = tightOffset + needleMap[queryStart];
          rawEnd = tightOffset + needleMap[queryEnd - 1] + 1;
        }
      } else {
        rawStart = windowStr.map[queryStart];
        rawEnd = windowStr.map[queryEnd - 1] + 1;
      }
      if (rawStart >= rawEnd || rawEnd > sourceWindow.length) {
        continue;
      }
      const sourceClamped = clampToGraphemeBoundaries(sourceWindow, rawStart, rawEnd);
      if (sourceClamped === null) {
        continue;
      }
      sourceStart = sourceClamped.start;
      sourceEnd = sourceClamped.end;
      // M3: a trailing question/exclamation mark immediately after the quoted
      // span belongs to the quotation (reviewer's §20 note). Swallow it into
      // the span.
      while (sourceEnd < sourceWindow.length && (sourceWindow[sourceEnd] === "?" || sourceWindow[sourceEnd] === "!")) {
        sourceEnd++;
      }
    }
    return {
      start: clamped.start,
      end: clamped.end,
      sourceStart,
      sourceEnd,
    };
  }

  return null;
};

/** Comma-elision fallback for a needle whose comma-separated segments each
 *  match their own region of the passage but whose joined form fails
 *  whole-passage similarity (the comma compresses intervening passage words,
 *  e.g. para 236's "ऐतदात्म्यमिदं सर्वं, तत्त्वमसि श्वेतकेतो" omits
 *  "तत्सत्यम् । स आत्मा ।"). Unions the segment spans into one highlight.
 *  Returns the combined span, or `null` when any segment fails to match. */
const tryCommaSegmentUnion = (
  needle: string,
  sourceWindow: string,
  subject: string,
  passageStr: MatchString,
  passage: string,
): { start: number; end: number; sourceStart: number; sourceEnd: number } | null => {
  const segments = needle.split(",");
  if (segments.length < 2) {
    return null;
  }
  const segSpans: { s: number; e: number }[] = [];
  for (const seg of segments) {
    const q = buildMatchString(seg.trim()).match;
    if (q.length === 0) {
      return null;
    }
    const sp = align(q, subject);
    if (!sp || sp.queryStart !== 0) {
      return null;
    }
    const al = Math.max(sp.queryEnd - sp.queryStart, sp.subjectEnd - sp.subjectStart);
    const minScore = 2 * Math.max(MIN_QUOTE_NEEDLE_LEN, Math.min(MIN_MATCH_CHARS, q.length));
    if (sp.score < minScore || al === 0 || sp.score / (2 * al) < MIN_SIMILARITY) {
      return null;
    }
    segSpans.push({ s: sp.subjectStart, e: sp.subjectEnd });
  }
  const start = Math.min(...segSpans.map((s) => s.s));
  const end = Math.max(...segSpans.map((s) => s.e));
  if (start >= end || end > subject.length) {
    return null;
  }
  const pStart = passageStr.map[start];
  const pEnd = passageStr.map[end - 1] + 1;
  if (pStart >= pEnd || pEnd > passage.length) {
    return null;
  }
  const clamped = clampToGraphemeBoundaries(passage, pStart, pEnd);
  if (clamped === null) {
    return null;
  }
  // Source-side span: the whole needle sits at its offset in the window.
  const tightOffset = sourceWindow.lastIndexOf(needle);
  if (tightOffset === -1) {
    return null;
  }
  const needleMap = buildMatchString(needle).map;
  const rawStart = tightOffset + needleMap[0];
  const rawEnd = tightOffset + needleMap[needleMap.length - 1] + 1;
  const sourceClamped = clampToGraphemeBoundaries(sourceWindow, rawStart, rawEnd);
  if (sourceClamped === null) {
    return null;
  }
  return {
    start: clamped.start,
    end: clamped.end,
    sourceStart: sourceClamped.start,
    sourceEnd: sourceClamped.end,
  };
};

/**
 * Smith–Waterman local alignment of two normalized strings.
 *
 * Returns the best-scoring local alignment as the half-open aligned regions
 * in each string plus its score, or `null` when no positive-score cell
 * exists. Complexity O(m·n); both inputs are bounded (window ≤ 60 chars) and
 * the passage is a single verse, so this is cheap.
 */
const align = (
  query: string,
  subject: string,
): {
  score: number;
  queryStart: number;
  queryEnd: number;
  subjectStart: number;
  subjectEnd: number;
} | null => {
  const m = query.length;
  const n = subject.length;
  if (m === 0 || n === 0) {
    return null;
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  let bestScore = 0;
  let bestRow = 0;
  let bestCol = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const diag =
        dp[i - 1][j - 1] +
        (query[i - 1] === subject[j - 1] ? MATCH_SCORE : MISMATCH_SCORE);
      const up = dp[i - 1][j] + GAP_SCORE;
      const left = dp[i][j - 1] + GAP_SCORE;
      const value = Math.max(0, diag, up, left);
      dp[i][j] = value;
      if (value > bestScore) {
        bestScore = value;
        bestRow = i;
        bestCol = j;
      }
    }
  }
  if (bestScore === 0) {
    return null;
  }
  let i = bestRow;
  let j = bestCol;
  while (i > 0 && j > 0 && dp[i][j] > 0) {
    if (query[i - 1] === subject[j - 1] && dp[i][j] === dp[i - 1][j - 1] + MATCH_SCORE) {
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j] + GAP_SCORE) {
      i--;
    } else {
      j--;
    }
  }
  return {
    score: bestScore,
    queryStart: i,
    queryEnd: bestRow,
    subjectStart: j,
    subjectEnd: bestCol,
  };
};

/** Combining / cluster-forming code points that must stay glued to their base
 *  (Devanagari: matras, virama, nukta, anusvara, candrabindu, vowels, signs). */
const CLUSTER_CODEPOINTS = new Set([
  0x093e, 0x093f, 0x0940, 0x0941, 0x0942, 0x0943, 0x0944, 0x0945,
  0x0946, 0x0947, 0x0948, 0x0949, 0x094a, 0x094b, 0x094c, 0x094d,
  0x094e, 0x094f, 0x0951, 0x0952, 0x0957, 0x0962, 0x0963, 0x093a,
  0x093b, 0x093c, 0x0950, 0x0901, 0x0902, 0x0903,
]);

/** True when `codePoint` is a Devanagari combining mark that cannot start a
 *  grapheme (a rendered dotted circle would appear if it did). */
const isClusterCodePoint = (codePoint: number): boolean =>
  CLUSTER_CODEPOINTS.has(codePoint);

/** Devanagari vowel signs drawn to the RIGHT of the base syllable. Their
 *  stroke can paint past the cluster's advance box, so a highlight ending on
 *  them leaves a visible unhighlighted sliver before the next glyph. */
const RIGHT_MATRAS = new Set([0x093e, 0x0940, 0x094b, 0x094c]);

const isRightMatra = (codePoint: number): boolean =>
  RIGHT_MATRAS.has(codePoint);

/** Cached grapheme segmenter (node + modern browsers).
 *
 *  `GRANTHA_MATCHER_NO_ICU=1` forces the manual combining-mark scan. This is
 *  used by the citation-matcher conformance test (citation-repair parity): the
 *  Python port implements ONLY the manual scan, so the parity contract is
 *  pinned to that deterministic algorithm on both sides (see
 *  CITATION_MATCHER_PARITY.md). The ICU path stays the production default — it
 *  is a strict superset for rendering — but accept/reject parity is defined
 *  against the manual scan. */
const graphemeSegmenter = (): Intl.Segmenter | null => {
  if (process.env.GRANTHA_MATCHER_NO_ICU === "1") {
    return null;
  }
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return new Intl.Segmenter("hi", { granularity: "grapheme" });
  }
  return null;
};

/**
 * Clamp a half-open `[start, end)` span to Devanagari grapheme boundaries.
 *
 * A raw alignment span can split a syllable — most visibly ending on a base
 * char whose matra/virama follows (rendering a dotted circle) or starting on
 * a virama. This floors `start` to its grapheme's start and ceils `end` to
 * its grapheme's end, then trims leading/trailing space graphemes so the
 * highlight hugs the text. Falls back to a manual combining-mark scan when
 * `Intl.Segmenter` is unavailable.
 *
 * Args:
 *     passage: The full passage text.
 *     start: The raw span start (inclusive).
 *     end: The raw span end (exclusive).
 *
 * Returns:
 *     The clamped span, or `null` if clamping would produce an empty/invalid
 *     span.
 */
const clampToGraphemeBoundaries = (
  passage: string,
  start: number,
  end: number,
): { start: number; end: number } | null => {
  if (start >= end || start < 0 || end > passage.length) {
    return null;
  }
  const segmenter = graphemeSegmenter();
  let clampedStart = start;
  let clampedEnd = end;
  if (segmenter) {
    for (const g of segmenter.segment(passage)) {
      const gStart = g.index as number;
      const gEnd = gStart + g.segment.length;
      if (gStart <= start && start < gEnd) {
        clampedStart = gStart;
      }
      if (clampedStart < gEnd && gStart < end) {
        clampedEnd = Math.max(clampedEnd, gEnd);
      }
    }
  } else {
    // Manual fallback: pull combining marks into the span.
    while (clampedStart > 0 && isClusterCodePoint(passage.codePointAt(clampedStart) ?? 0)) {
      clampedStart--;
    }
    while (clampedEnd < passage.length && isClusterCodePoint(passage.codePointAt(clampedEnd) ?? 0)) {
      clampedEnd++;
    }
  }
  // When the span ends on a right-extending matra (ा/ी/ो/ौ), its stroke paints
  // past the cluster box and would show a gap before the next unhighlighted
  // glyph. Swallow the next grapheme so the matra stays fully inside the mark.
  if (isRightMatra(passage.codePointAt(clampedEnd - 1) ?? 0)) {
    if (segmenter) {
      for (const g of segmenter.segment(passage)) {
        const gStart = g.index as number;
        const gEnd = gStart + g.segment.length;
        if (gStart >= clampedEnd) {
          clampedEnd = gEnd;
          break;
        }
      }
    } else if (clampedEnd < passage.length) {
      clampedEnd++;
      while (
        clampedEnd < passage.length &&
        isClusterCodePoint(passage.codePointAt(clampedEnd) ?? 0)
      ) {
        clampedEnd++;
      }
    }
  }
  // Trim leading/trailing space or stripped-punctuation graphemes so the mark
  // hugs the quoted text — a leading danda (a clamp artifact of a matched
  // space that sat after it) can never be part of a real match.
  while (clampedStart < clampedEnd && isTrimEdgeChar(passage[clampedStart])) {
    clampedStart++;
  }
  while (clampedEnd > clampedStart && isTrimEdgeChar(passage[clampedEnd - 1])) {
    clampedEnd--;
  }
  if (clampedStart >= clampedEnd || clampedEnd > passage.length) {
    return null;
  }
  return { start: clampedStart, end: clampedEnd };
};
