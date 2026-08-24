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
    // The line BEFORE the current start must itself end in a danda+newline
    // (i.e. the char before prevLineEnd is । or ॥) for it to be a verse pāda
    // that belongs to the same quote.
    if (!(sourceText[prevLineEnd - 1] === "।" || sourceText[prevLineEnd - 1] === "॥")) {
      break;
    }
    const prevLineStart = sourceText.lastIndexOf("\n", prevLineEnd - 1) + 1;
    start = prevLineStart;
  }
  return { text: sourceText.slice(start, refStart), start };
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

/** True when a char is a real word separator (whitespace or danda). A virama
 *  mid-word is NOT a separator — conjuncts stay one word. */
const isSeparatorChar = (ch: string): boolean =>
  /\s/.test(ch) || ch === "।" || ch === "॥";

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

  // Pāda boundaries: after each danda and after each newline (the window may
  // span several lines). The window end is always a boundary.
  const padas = [0];
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "।" || ch === "॥" || ch === "\n") {
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

/** Above this fraction of the passage covered by the match, highlighting is
 *  noise (the quote is essentially the whole verse) and is suppressed. */
export const MAX_COVERAGE = 0.8;

/** Passages at or below this length are "the whole card" — a match covering
 *  > MAX_COVERAGE of them is trivially the whole passage and suppressing the
 *  highlight is correct (it would paint the entire card). Longer passages are
 *  real verses: a whole-verse quote IS the meaningful highlight (e.g. a full
 *  two-pāda Vishnu Purāṇa śloka), so coverage suppression does not apply. */
export const MAX_COVERAGE_PASSAGE_LEN = 44;

const MATCH_SCORE = 2;
const MISMATCH_SCORE = -1;
const GAP_SCORE = -1;

/** Characters stripped from both sides before alignment (dandas, markdown,
 *  quote marks, punctuation). */
const STRIP_CHARS = new Set(["।", "॥", "*", "_", ".", "'", "‘", "’", '"']);

/** Trailing verse-number chrome inside a passage's stored text — e.g.
 *  brahma-sutra stores "चमसवदविशेषात् ॥ १-४-८ ॥". It is not content, so a
 *  quote of the whole sutra must measure coverage against the content only. */
const VERSE_NUMBER_SUFFIX = /॥\s*[०-९0-9.\-]+\s*॥\s*$/;

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
      if (!prevWasSpace && match.length > 0) {
        match.push(" ");
        map.push(i);
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
    if (ch === "म" && nfc[i + 1] === "्") {
      match.push("ं"); // same sentinel as anusvara
      map.push(i);
      i++; // consume the virama — it is not a separate kept char
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
  // True when the source window is a SINGLE pāda/run (no internal danda or
  // newline). A single-run window IS the whole quote candidate — if it covers
  // the whole passage, the quote is the whole verse and must be suppressed (its
  // fragments are the same quote, noise too). A window WITH internal pādas is
  // mixed prose+quote: the longest needle may cover the passage but the real
  // quote is a shorter pāda, so we must fall through to it.
  const singleRunWindow = !/[।॥\n]/.test(sourceWindow);
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
      let rawStart: number;
      let rawEnd: number;
      if (needle !== sourceWindow) {
        const tightOffset = sourceWindow.lastIndexOf(needle);
        if (tightOffset === -1) {
          continue;
        }
        const needleMap = buildMatchString(needle).map;
        rawStart = tightOffset + needleMap[queryStart];
        rawEnd = tightOffset + needleMap[queryEnd - 1] + 1;
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
    }
    // Whole-passage quote → highlighting is noise for SHORT passages (the
    // quote is the whole card); suppress it. Measure coverage against the
    // passage CONTENT only (a trailing " ॥ N ॥" verse number is chrome, not
    // text — a quote of the whole sutra would otherwise look like <100%
    // coverage). For longer passages (a real multi-pāda verse) a whole-verse
    // quote is the MEANINGFUL highlight and is not suppressed.
    const contentLength = passage
      .replace(VERSE_NUMBER_SUFFIX, "")
      .trimEnd()
      .length;
    const matchedLength = Math.min(clamped.end - clamped.start, contentLength);
    if (
      contentLength <= MAX_COVERAGE_PASSAGE_LEN &&
      contentLength > 0 &&
      matchedLength / contentLength > MAX_COVERAGE
    ) {
      if (singleRunWindow) {
        // The whole quote IS the whole passage (single run): suppress entirely
        // — every shorter candidate is a fragment of the same noise.
        return null;
      }
      // Mixed prose+quote window: fall through to the tighter pāda candidate.
      continue;
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

/** Cached grapheme segmenter (node + modern browsers). */
const graphemeSegmenter = (): Intl.Segmenter | null => {
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
