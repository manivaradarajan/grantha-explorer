/**
 * Windowed citation excerpt.
 *
 * The citation popover must stay a compact teaser even when the cited passage
 * is very long (some Ramayana sargas merge into 10k+-char passages). When a
 * quote highlight is present we can't just CSS-line-clamp the raw text: that
 * risks cutting mid-sentence or hiding the very highlight. Instead the excerpt
 * is built in JavaScript by windowing around the quote at sentence boundaries
 * (danda / pāda breaks), so the quote is always fully visible near the top of
 * the card, surrounded by whole units of context and ellipses only where text
 * was actually skipped.
 *
 * All offsets returned are into the ORIGINAL passage, so the caller slices
 * `passage[windowStart:windowEnd]` and places the highlight at the
 * corresponding local offsets.
 */

/** Characters that end a "unit" (a sentence- or clause-like span): dandas,
 *  pāda line breaks, and the comma/semicolon clause separators Devanagari
 *  prose uses when it is danda-sparse (e.g. subala 7.1 runs clauses with `,`
 *  and `;` and may carry one danda in 900+ chars — treating only dandas as
 *  boundaries would leave a single unit spanning the whole passage, so the
 *  quote window could never be bounded). The unit retains the trailing
 *  delimiter so the slice reads naturally. */
const BOUNDARY_CHARS = new Set(["।", "॥", "\n", ",", ";"]);

/** When the quote sits at or after this unit index, the passage opening is not
 *  naturally visible — consider prepending it as an anchor. */
export const OPENING_ANCHOR_MIN_QUOTE_UNIT = 3;

/** A first unit of at most this many characters is treated as "less than a
 *  line" and used as the opening anchor; a longer one is skipped (it would
 *  push the card too tall to earn its place). A Devanagari line in the ~320px
 *  popover is roughly 30–36 characters. */
export const OPENING_ANCHOR_MAX_CHARS = 36;

/** A "unit before the quote" longer than this is dropped as context — its job
 *  is orientation, not pushing the highlight below the fold. */
export const MAX_CONTEXT_BEFORE_UNIT_CHARS = 160;

/** A unit of the passage: a `[start, end)` half-open span plus its text. */
export interface PassageUnit {
  start: number;
  end: number;
  text: string;
}

/** The windowed excerpt: which original offsets to render and how to punctuate
 *  the elisions around them. */
export interface CitationExcerpt {
  /** The passage's opening unit (already including its trailing delimiter),
   *  shown as an anchor before the ellipsis, or undefined when the quote is
   *  near the start or the opening unit is too long to justify the space. */
  opener?: string;
  /** Start of the displayed mid-window in the original passage. The highlight
   *  is guaranteed to lie within `[windowStart, windowEnd)`. */
  windowStart: number;
  /** End of the displayed mid-window in the original passage (exclusive). */
  windowEnd: number;
  /** Show an ellipsis before the mid-window (text was skipped). */
  leadEllipsis: boolean;
  /** Show an ellipsis after the mid-window (text was skipped). */
  trailEllipsis: boolean;
}

/**
 * Split a passage into units at danda / pāda boundaries. Each unit includes
 * its trailing delimiter run (and leading whitespace is skipped), so units are
 * non-empty and slicing a window of whole units reads naturally.
 *
 * Args:
 *     text: The passage text.
 *
 * Returns:
 *     The units, in order.
 */
export function splitUnits(text: string): PassageUnit[] {
  const units: PassageUnit[] = [];
  let start = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (BOUNDARY_CHARS.has(text[i])) {
      // Consume the whole boundary run (e.g. "।\n" or "॥ ") as the unit's end.
      let j = i;
      while (j < n && BOUNDARY_CHARS.has(text[j])) {
        j++;
      }
      units.push({ start, end: j, text: text.slice(start, j) });
      // Skip whitespace so the next unit starts on content (no blank units).
      while (j < n && /\s/.test(text[j])) {
        j++;
      }
      start = j;
      i = j;
    } else {
      i++;
    }
  }
  if (start < n) {
    units.push({ start, end: n, text: text.slice(start) });
  }
  return units.filter((u) => u.text.trim().length > 0);
}

/**
 * Build the windowed excerpt around a highlight.
 *
 * The highlight's containing unit(s) are always included whole. One whole unit
 * before and one after are included as context (the "before" unit is dropped
 * when it is pathologically long, so the highlight stays near the top). When
 * the quote is deep (≥ `OPENING_ANCHOR_MIN_QUOTE_UNIT`) and the passage's
 * opening unit fits in a line (`≤ OPENING_ANCHOR_MAX_CHARS`), that opening is
 * prepended as an anchor before the ellipsis.
 *
 * Args:
 *     text: The full passage text.
 *     hlStart: Start of the highlight in `text`.
 *     hlEnd: End of the highlight in `text` (exclusive).
 *
 * Returns:
 *     The windowed excerpt.
 */
export function buildCitationExcerpt(
  text: string,
  hlStart: number,
  hlEnd: number,
): CitationExcerpt {
  const units = splitUnits(text);
  if (units.length === 0) {
    return {
      windowStart: 0,
      windowEnd: text.length,
      leadEllipsis: false,
      trailEllipsis: false,
    };
  }
  const safeStart = Math.max(0, Math.min(hlStart, text.length));
  const safeEnd = Math.max(safeStart, Math.min(hlEnd, text.length));

  const firstQuoteUnit = units.findIndex(
    (u) => safeStart < u.end, // first unit that overlaps or precedes the mark
  );
  const quoteStartIdx = firstQuoteUnit < 0 ? units.length - 1 : firstQuoteUnit;
  let quoteEndIdx = quoteStartIdx;
  while (
    quoteEndIdx + 1 < units.length &&
    safeEnd > units[quoteEndIdx + 1].start
  ) {
    quoteEndIdx++;
  }

  const firstUnitLen = units[0].text.trim().length;
  const opener =
    quoteStartIdx >= OPENING_ANCHOR_MIN_QUOTE_UNIT &&
    firstUnitLen <= OPENING_ANCHOR_MAX_CHARS
      ? units[0].text.replace(/\s+/g, " ").trim()
      : undefined;

  // Window start: one whole unit before the quote, unless the quote is near
  // the start (render from the beginning, no artificial ellipsis), or the
  // "before" unit is pathologically long (drop it to keep the mark high).
  const beforeIdx = quoteStartIdx - 1;
  let windowStart: number;
  if (quoteStartIdx <= 2) {
    windowStart = 0;
  } else if (
    beforeIdx >= 0 &&
    units[beforeIdx].text.trim().length <= MAX_CONTEXT_BEFORE_UNIT_CHARS
  ) {
    windowStart = units[beforeIdx].start;
  } else {
    windowStart = units[quoteStartIdx].start;
  }

  // Window end: one whole unit after the quote (the trailing unit is cheap —
  // it can never hide the mark, which sits above it).
  const afterIdx = quoteEndIdx + 1;
  const windowEnd =
    afterIdx < units.length ? units[afterIdx].end : text.length;

  const leadEllipsis = windowStart > 0;
  const trailEllipsis = windowEnd < text.length;
  return { opener, windowStart, windowEnd, leadEllipsis, trailEllipsis };
}
