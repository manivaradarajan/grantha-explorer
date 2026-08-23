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
  return { text: sourceText.slice(start, refStart), start };
};

/** Minimum matched run length (in kept chars) before a match is accepted. */
export const MIN_MATCH_CHARS = 10;

/** Minimum local-alignment similarity of the aligned region. */
export const MIN_SIMILARITY = 0.7;

/** Above this fraction of the passage covered by the match, highlighting is
 *  noise (the quote is essentially the whole verse) and is suppressed. */
export const MAX_COVERAGE = 0.8;

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
 *         prose). Should be `sourceText.slice(max(0, ref.start - MAX_LOOKBACK),
 *         ref.start)`.
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
  // Candidate needles, tightest first: a fully-formed quoted span (when the
  // window shows the citation enclosed in quotes) matches exactly; the whole
  // window is the fuzzy fallback. Each candidate runs the same validation.
  const needles: string[] = [];
  const enclosed = extractEnclosedQuote(sourceWindow);
  if (enclosed !== null) {
    needles.push(enclosed.text);
  }
  needles.push(sourceWindow);

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
    if (score < 2 * MIN_MATCH_CHARS) {
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
    // them; the commentary sanitizer pairs the bold); the fuzzy whole-window
    // match needs grapheme clamping + edge trimming like the preview side.
    let sourceStart: number;
    let sourceEnd: number;
    if (enclosed !== null && needle === enclosed.text) {
      sourceStart = enclosed.start;
      sourceEnd = enclosed.end;
    } else {
      const rawStart = windowStr.map[queryStart];
      const rawEnd = windowStr.map[queryEnd - 1] + 1;
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
    // Whole-passage quote → highlighting is noise; suppress it. Measure
    // coverage against the passage CONTENT only (a trailing " ॥ N ॥" verse
    // number is chrome, not text — a quote of the whole sutra would otherwise
    // look like <100% coverage).
    const contentLength = passage
      .replace(VERSE_NUMBER_SUFFIX, "")
      .trimEnd()
      .length;
    const matchedLength = Math.min(clamped.end - clamped.start, contentLength);
    if (contentLength > 0 && matchedLength / contentLength > MAX_COVERAGE) {
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
