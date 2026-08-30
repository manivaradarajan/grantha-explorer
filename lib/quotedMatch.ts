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
 * Implementation is split across focused sub-modules:
 *   - `quotedMatchNormalize.ts` — `buildMatchString` + normalization constants
 *   - `quotedMatchAlign.ts`    — `align` (Smith–Waterman) + `clampToGraphemeBoundaries`
 *   - `quotedMatchNeedles.ts`  — `buildSourceWindow` + `buildQuoteNeedles` + `extractEnclosedQuote`
 *
 * This file owns `findQuotedSpan` (the public entry point) and
 * `tryCommaSegmentUnion` (comma-elision fallback), and re-exports every
 * public symbol so callers keep a single import path.
 */

// ---------------------------------------------------------------------------
// Re-exports (public API surface, preserved for all existing callers)
// ---------------------------------------------------------------------------

export type { MatchString } from "./quotedMatchNormalize.ts";
export {
  buildMatchString,
  MIN_SIMILARITY,
  MIN_MATCH_CHARS,
  MIN_QUOTE_NEEDLE_LEN,
} from "./quotedMatchNormalize.ts";

export type { EnclosedQuote, SourceWindow } from "./quotedMatchNeedles.ts";
export {
  extractEnclosedQuote,
  buildSourceWindow,
  buildQuoteNeedles,
  MAX_LOOKBACK,
  QUOTE_LINE_EXTEND_CAP,
} from "./quotedMatchNeedles.ts";

// ---------------------------------------------------------------------------
// Internal imports
// ---------------------------------------------------------------------------

import { buildMatchString, MIN_SIMILARITY, MIN_MATCH_CHARS, MIN_QUOTE_NEEDLE_LEN } from "./quotedMatchNormalize.ts";
import type { MatchString } from "./quotedMatchNormalize.ts";
import { align, clampToGraphemeBoundaries } from "./quotedMatchAlign.ts";
import { extractEnclosedQuote, buildQuoteNeedles } from "./quotedMatchNeedles.ts";

// ---------------------------------------------------------------------------
// isOneStepDerivative (used only by findQuotedSpan / tryCommaSegmentUnion)
// ---------------------------------------------------------------------------

/** The trailing graphemes of ``phrase`` that can be elided in sandhi. */
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

// ---------------------------------------------------------------------------
// findQuotedSpan
// ---------------------------------------------------------------------------

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
 *         prose), as produced by `buildSourceWindow`.
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
    if (queryStart !== 0) {
      continue;
    }
    const minScore = 2 * Math.max(MIN_QUOTE_NEEDLE_LEN, Math.min(MIN_MATCH_CHARS, query.length));
    if (score < minScore) {
      continue;
    }
    if (alignedLength === 0 || score / (2 * alignedLength) < MIN_SIMILARITY) {
      const commaUnion = tryCommaSegmentUnion(needle, sourceWindow, subject, passageStr, passage);
      if (commaUnion !== null) {
        return commaUnion;
      }
      continue;
    }
    const start = passageStr.map[subjectStart];
    const end = passageStr.map[subjectEnd - 1] + 1;
    if (start >= end || end > passage.length) {
      continue;
    }
    const clamped = clampToGraphemeBoundaries(passage, start, end);
    if (clamped === null) {
      continue;
    }
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
        // needle is a one-step sandhi/elision derivative.
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
      // span belongs to the quotation.
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

// ---------------------------------------------------------------------------
// tryCommaSegmentUnion (comma-elision fallback)
// ---------------------------------------------------------------------------

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
