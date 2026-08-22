import DOMPurify from "isomorphic-dompurify";

const DEVANAGARI_DIGITS: Record<string, string> = {
  "0": "०",
  "1": "१",
  "2": "२",
  "3": "३",
  "4": "४",
  "5": "५",
  "6": "६",
  "7": "७",
  "8": "८",
  "9": "९",
};

export const stripMarkdown = (text: string | undefined): string => {
  if (!text) {
    return "";
  }
  return text.replace(/\*\*/g, "").trim();
};

/**
 * Convert ASCII numerals to Devanagari digits for display only.
 *
 * The underlying refs, hash, and parsers stay on ASCII numerals; this is a
 * display-layer conversion applied to UI labels, never to parsed values.
 */
export const toDevanagariNumerals = (text: string): string => {
  return text.replace(/[0-9]/g, (digit) => DEVANAGARI_DIGITS[digit] ?? digit);
};

/**
 * Sanitize commentary/intro text, applying the same lightweight markdown
 * transforms the 3-pane commentary pane uses (a `#### ` line becomes an italic
 * caption, `**bold**` becomes `<strong>`). Shared so the flow reader and the
 * panes commentary render identical output.
 */
export const sanitizeCommentaryHtml = (text: string): string =>
  DOMPurify.sanitize(
    text
      .replace(
        /^#### (.+)$/gm,
        '<em class="text-base font-normal italic text-gray-500">$1</em>'
      )
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>')
  );

/**
 * Assert that a code-point offset (producer-side) is a valid UTF-16 slice
 * boundary — i.e. it does not split a non-BMP (surrogate-pair) character.
 *
 * The producer emits reference offsets as Python code points; JS slices are
 * UTF-16. For the current corpus they coincide because Devanagari is BMP-only,
 * but that is a property of the corpus, not a guarantee. This fails loudly
 * (never silently misaligns) if a non-BMP character precedes an offset, per
 * SPEC §7's defensive assertion.
 *
 * Args:
 *     text: The raw string being sliced.
 *     offset: A code-point offset (half-open start/end) into `text`.
 *
 * Raises:
 *     Error: If `offset` falls inside a surrogate pair (a non-BMP char would
 *         be split).
 */
export const assertCodePointOffsetAligned = (text: string, offset: number): void => {
  if (offset < 1 || offset >= text.length) return;
  const prev = text.charCodeAt(offset - 1);
  const next = text.charCodeAt(offset);
  // A boundary inside a surrogate pair: either the char before is a high
  // surrogate (0xD800-0xDBFF) whose low half is at `offset`, or the char at
  // `offset` is a low surrogate (0xDC00-0xDFFF) preceded by its high half.
  if ((prev >= 0xd800 && prev <= 0xdbff) || (next >= 0xdc00 && next <= 0xdfff)) {
    throw new Error(
      `non-BMP character split at offset ${offset} — reference offsets are ` +
        `code points, JS slices are UTF-16 (SPEC §7 defensive assertion)`,
    );
  }
};

/**
 * Close a mūla verse with its danda number (`॥ N॥`, Devanagari), matching
 * print convention (spec §6.1). The numeral sits flush against the closing
 * danda (no space), while the opening danda keeps a space from the verse text.
 * No-op when the mūla is empty or the ref's last segment isn't numeric. When
 * the text already ends with a numbered danda it is left untouched; when it
 * ends with a bare closing danda (a source that had its number stripped but
 * kept the `॥`) that danda is replaced, so the result is always a single
 * `॥ N॥`.
 *
 * Args:
 *     mula: The verse's mūla text (already stripped of markdown).
 *     ref: The passage ref (e.g. "7.1" → number "१").
 *
 * Returns:
 *     The mūla text closed with ` ॥ N॥`, or the original unchanged.
 */
export const withVerseNumber = (mula: string, ref: string): string => {
  if (!mula) return mula;
  const lastSegment = ref.split(".").pop() ?? "";
  if (!/^\d+$/.test(lastSegment)) return mula;
  // Already closed with a numbered danda — never double-mark.
  if (/॥\s*[०-९]+\s*॥\s*$/.test(mula)) return mula;
  // Bare trailing danda (source kept `॥` but the number was stripped): replace.
  const stripped = mula.replace(/॥\s*$/, "").trimEnd();
  return `${stripped} ॥ ${toDevanagariNumerals(lastSegment)}॥`;
};
