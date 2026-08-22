/**
 * Fuzzy "needle-in-haystack" matching for the reference hover tooltip.
 *
 * When a cross-text citation is hovered, the tooltip shows the full cited
 * passage (the haystack). The source text immediately before the citation
 * often embeds a quote of part of that passage (the needle), but the quote is
 * surrounded by commentary prose and usually diverges from the canonical text:
 * typos, pāda-break newlines, danda/whitespace drift, or sandhi-level
 * truncation. `findQuotedSpan` locates the best-matching region of the passage
 * against the source window using Smith–Waterman local alignment, so the
 * popup can highlight exactly the quoted span.
 *
 * The needle's boundaries are not known in advance (it sits inside prose), so
 * a plain substring search is insufficient; local alignment finds the
 * highest-scoring match of any window-against-passage region and reports it
 * in the passage's original coordinates.
 */

/** Characters of source text examined immediately before the citation. */
export const MAX_LOOKBACK = 60;

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
 *     The source window to pass to `findQuotedSpan`.
 */
export const buildSourceWindow = (sourceText: string, refStart: number): string => {
  let start = Math.max(0, refStart - MAX_LOOKBACK);
  while (start > 0 && !/\s/.test(sourceText[start - 1])) {
    start--;
  }
  return sourceText.slice(start, refStart);
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
): { start: number; end: number } | null => {
  const windowStr = buildMatchString(sourceWindow);
  const passageStr = buildMatchString(passage);
  const query = windowStr.match;
  const subject = passageStr.match;
  if (query.length === 0 || subject.length === 0) {
    return null;
  }
  const span = align(query, subject);
  if (span === null) {
    return null;
  }
  const { score, queryStart, queryEnd, subjectStart, subjectEnd } = span;
  const alignedLength = Math.max(queryEnd - queryStart, subjectEnd - subjectStart);
  if (score < 2 * MIN_MATCH_CHARS) {
    return null;
  }
  if (alignedLength === 0 || score / (2 * alignedLength) < MIN_SIMILARITY) {
    return null;
  }
  const start = passageStr.map[subjectStart];
  const end = passageStr.map[subjectEnd - 1] + 1;
  if (start >= end || end > passage.length) {
    return null;
  }
  // Clamp to grapheme boundaries so the highlight never splits a syllable
  // (e.g. a base char from its matra/virama) — splitting would render a
  // Devanagari dotted circle at the clamp edge.
  const clamped = clampToGraphemeBoundaries(passage, start, end);
  if (clamped === null) {
    return null;
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
    return null;
  }
  return clamped;
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
