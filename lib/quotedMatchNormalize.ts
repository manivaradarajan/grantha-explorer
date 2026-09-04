/**
 * Normalization layer for the Sanskrit citation matcher.
 *
 * Provides `buildMatchString` — the NFC normalization + punctuation-strip +
 * whitespace-collapse pass used by both the needle and the haystack before
 * Smith–Waterman alignment. Also owns the accept/reject thresholds so every
 * layer references the same constants.
 *
 * Imported by `quotedMatchAlign.ts`, `quotedMatchNeedles.ts`, and
 * `quotedMatch.ts`; has no dependencies on the other split modules.
 */

/** Minimum local-alignment similarity of the aligned region. */
export const MIN_SIMILARITY = 0.7;

/** Minimum matched run length (in kept chars) before a match is accepted. */
export const MIN_MATCH_CHARS = 10;

/** Minimum length of a tight quote needle before it is tried on its own. A
 *  shorter but *precise* phrase (e.g. "तत्त्वमसि", "अयमात्मा ब्रह्म") is a
 *  better needle than the surrounding prose window. */
export const MIN_QUOTE_NEEDLE_LEN = 4;

/** Characters stripped from both sides before alignment (dandas, markdown,
 *  quote marks, punctuation). */
export const STRIP_CHARS = new Set(["।", "॥", "*", "_", ".", "'", "\u2018", "\u2019", '"']);

/** Consonants after which a syllable-final class nasal + virama collapses to
 *  the anusvara (सत्यसङ्कल्पः -> सत्यसंकल्पः): the unvoiced stops + sibilants.
 *  Before a VOICED consonant the nasal must stay (आनन्दम् keeps न्+द). */
export const UNVOICED_AFTER_NASAL = new Set(
  "कखचछटठतथपफशषसह".split(""),
);

/** True when a char must never appear at a highlight edge: whitespace and
 *  anything `buildMatchString` strips (dandas, punctuation). */
export const isTrimEdgeChar = (ch: string): boolean => /\s/.test(ch) || STRIP_CHARS.has(ch);

/** Vedic svara (accent) code points that must never influence matching.
 *
 *  Svara-bearing mūla texts (mahanarayana-upanishad and other sāma/vedic
 *  sources) store udatta (॑ U+0951), anudatta (॒ U+0952), grave/acute
 *  (U+0953/U+0954) and the Vedic-Extensions combining tones (U+1CD0–U+1CF9
 *  categories Mn/Mc, e.g. double svarita ᳚ U+1CDA). Commentaries cite the
 *  PLAIN (svara-less) form, so a quote needle must align against the accented
 *  haystack with the accents ignored, and the highlight must still swallow a
 *  trailing accent after a matched base.
 *
 *  Deliberately EXCLUDES non-combining Vedic signs in the same blocks that
 *  carry meaning the matcher needs: nihshvasa (U+1CD3, Po), the anusvara/
 *  ardhavisarga/jihvamuliya/upadhmaniya LETTERS (U+1CE9–U+1CF3, U+1CF5–U+1CF6,
 *  U+1CFA — category Lo), and the Devanagari anusvara/visarga/virama marks
 *  (U+0901–U+0903, U+094D) which are phonological, not tonal. */
export const SVARA_CODEPOINTS: ReadonlySet<number> = new Set([
  // Devanagari stress signs (Mn).
  0x0951, 0x0952, 0x0953, 0x0954,
  // Vedic Extensions combining tones (Mn): karshana…rigvedic kashmiri
  // independent svarita, visarga tones, tiryak, candra above, ring above.
  0x1cd0, 0x1cd1, 0x1cd2, 0x1cd4, 0x1cd5, 0x1cd6, 0x1cd7, 0x1cd8,
  0x1cd9, 0x1cda, 0x1cdb, 0x1cdc, 0x1cdd, 0x1cde, 0x1cdf, 0x1ce0,
  0x1ce2, 0x1ce3, 0x1ce4, 0x1ce5, 0x1ce6, 0x1ce7, 0x1ce8, 0x1ced,
  0x1cf4, 0x1cf8, 0x1cf9,
  // Vedic Extensions spacing tones (Mc): atharvavedic independent svarita,
  // atikrama.
  0x1ce1, 0x1cf7,
]);

/** True when ``codePoint`` is a Vedic svara (accent) that matching ignores. */
export const isSvaraCodePoint = (codePoint: number): boolean =>
  SVARA_CODEPOINTS.has(codePoint);

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
    if (isSvaraCodePoint(ch.codePointAt(0) ?? 0)) {
      // A Vedic svara is tonal, not phonological — the quoted form drops it
      // ("भ्राजसा" vs the mūla's "भ्राज॑सा"). Skip it without pushing; a
      // trailing svara therefore never becomes a kept char that would need a
      // (null) map entry.
      continue;
    }
    if (/\s/.test(ch)) {
      // Virama-elision at a word join: "तत् त्वमसि" is the sandhi-unfused form
      // of "तत्त्वमसि". A space after a syllable-final virama (्, U+094D)
      // carries no sound and must not break an otherwise-exact quote, so skip
      // it (the following consonant then glues to the pre-virama consonant).
      const prevKept = match[match.length - 1];
      if (prevKept !== "्") {
        if (!prevWasSpace && match.length > 0) {
          match.push(" ");
          map.push(i);
        }
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
    // A syllable-final म् is an anusvara (विज्ञानम् == विज्ञानं); always
    // collapse it.
    if (ch === "म" && nfc[i + 1] === "्") {
      match.push("ं"); // same sentinel as anusvara
      map.push(i);
      i++; // consume the virama — it is not a separate kept char
      prevWasSpace = false;
      continue;
    }
    // A syllable-final class nasal (ङ/ञ/ण/न) + virama is an anusvara when it
    // precedes an UNVOICED consonant (सत्यसङ्कल्पः/सत्यसंकल्पः: ङ्+क == ं+क).
    // Before a VOICED consonant (आनन्दम्: न्+द) the nasal must stay. Mirrors
    // Python.
    if (
      (ch === "ङ" || ch === "ञ" || ch === "ण" || ch === "न") &&
      nfc[i + 1] === "्" &&
      UNVOICED_AFTER_NASAL.has(nfc[i + 2])
    ) {
      match.push("ं"); // same sentinel as anusvara
      map.push(i);
      i++; // consume the virama — it is not a separate kept char
      prevWasSpace = false;
      continue;
    }
    // Avagraha (ऽ, U+093D) is an elided अ: "आत्माऽपहतपाप्मा" from
    // "आत्मा + अपहतपाप्मा". Canonicalize it to अ so a quote needle
    // "अपहतपाप्मा" aligns against the fused form. Mirrored in Python
    // citation_repair.py normalize().
    if (ch === "\u093D") {
      match.push("\u0905");
      map.push(i);
      prevWasSpace = false;
      continue;
    }
    // Visarga (ः) assimilation before a sibilant: a word-final ः followed by a
    // स/श/ष is the sibilant's doubled form across a word boundary
    // ("यः सर्वज्ञः" == "यस्सर्वज्ञस्सर्व..."). Fold ः + optional ws +
    // sibilant to the doubled sibilant on BOTH sides. Mirrored in Python.
    if (ch === "\u0903") {
      let j = i + 1;
      while (j < nfc.length && /\s/.test(nfc[j])) {
        j++;
      }
      if (j < nfc.length && (nfc[j] === "स" || nfc[j] === "श" || nfc[j] === "ष")) {
        match.push(nfc[j]);
        map.push(i);
        match.push(nfc[j]);
        map.push(j);
        prevWasSpace = false;
        i = j; // loop increment advances past the sibilant
        continue;
      }
      match.push(ch);
      map.push(i);
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
