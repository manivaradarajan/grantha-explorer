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
