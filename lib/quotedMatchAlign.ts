/**
 * Smith–Waterman local alignment and grapheme-boundary clamping for the
 * Sanskrit citation matcher.
 *
 * `align` scores a query string against a subject string and returns the
 * best-matching region (half-open, in normalized-string coordinates).
 * `clampToGraphemeBoundaries` adjusts raw UTF-16 offsets so the highlight
 * never slices a Devanagari cluster.
 *
 * Imported by `quotedMatch.ts`; depends only on `quotedMatchNormalize.ts`.
 */

import { isTrimEdgeChar } from "./quotedMatchNormalize.ts";

// ---------------------------------------------------------------------------
// Smith–Waterman scoring constants
// ---------------------------------------------------------------------------

const MATCH_SCORE = 2;
const MISMATCH_SCORE = -1;
const GAP_SCORE = -1;

// ---------------------------------------------------------------------------
// Grapheme helpers
// ---------------------------------------------------------------------------

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
export const isClusterCodePoint = (codePoint: number): boolean =>
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

// ---------------------------------------------------------------------------
// align (Smith–Waterman)
// ---------------------------------------------------------------------------

/**
 * Smith–Waterman local alignment of two normalized strings.
 *
 * Returns the best-scoring local alignment as the half-open aligned regions
 * in each string plus its score, or `null` when no positive-score cell
 * exists. Complexity O(m·n); both inputs are bounded (window ≤ 60 chars) and
 * the passage is a single verse, so this is cheap.
 */
export const align = (
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

// ---------------------------------------------------------------------------
// clampToGraphemeBoundaries
// ---------------------------------------------------------------------------

/**
 * Clamp a UTF-16 `[start, end)` span to Devanagari grapheme cluster
 * boundaries so the highlight never slices a cluster mid-render.
 *
 * Uses `Intl.Segmenter` when available; falls back to a manual scan of
 * combining-mark code points (the Python port's algorithm, pinned for parity).
 *
 * Args:
 *     passage: The passage text (haystack or source window).
 *     start: Proposed start offset.
 *     end: Proposed end offset (exclusive).
 *
 * Returns:
 *     The clamped span, or `null` if clamping would produce an empty/invalid
 *     span.
 */
export const clampToGraphemeBoundaries = (
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
