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
