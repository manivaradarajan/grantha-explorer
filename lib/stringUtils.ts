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
