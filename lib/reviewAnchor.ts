/**
 * Robust snippet location for review anchors.
 *
 * Review snippets are taken from the DOM selection, which may include
 * decorative quote characters (`“”"'`) that are not present in the raw
 * `content.sanskrit.devanagari`. An exact `indexOf` then fails and the
 * highlight disappears (the para 6 bug: `अ“पहतपाप्मा”` vs `अपहतपाप्मा`).
 *
 * This helper tries an exact match first, then a quote-stripped fallback.
 * Returns the raw offsets of the (possibly cleaned) snippet, or null.
 */
export function locateSnippet(
  raw: string,
  snippet: string,
): { start: number; end: number } | null {
  if (!raw || !snippet) return null;
  let idx = raw.indexOf(snippet);
  if (idx >= 0) return { start: idx, end: idx + snippet.length };
  // Fallback 1: strip decorative quotes that the selection may have included
  // but the raw passage does not contain.
  const cleaned = snippet.replace(/[“”"'`]/g, "").trim();
  if (cleaned && cleaned !== snippet) {
    idx = raw.indexOf(cleaned);
    if (idx >= 0) return { start: idx, end: idx + cleaned.length };
  }
  // Fallback 2: whitespace-insensitive (NBSP, newlines, multiple spaces,
  // and danda attachment). Review snippets come from DOM selections where
  // `protectLineBreaks` turns ` ।` into `\u00A0।` and verse pādas are joined
  // with `\n`. Raw uses normal spaces/newlines. Normalize both to single
  // spaces with dandas isolated, then map back via word-anchored lookup.
  const normWS = (s: string) =>
    s
      .replace(/[“”"'`]/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/([।॥])/g, " $1 ")
      .replace(/\s+/g, " ")
      .trim();
  const normSnippet = normWS(snippet);
  const normRaw = normWS(raw);
  if (!normSnippet) return null;
  // Avoid re-trying the exact quote-stripped case already handled.
  if (normSnippet === snippet.replace(/[“”"'`]/g, "").trim()) {
    // Still try whitespace-normalized search even if quote stripping didn't change
    // the string (e.g. para 100's NBSP + `।` spacing).
  }
  idx = normRaw.indexOf(normSnippet);
  if (idx >= 0) {
    // Map back: find first and last CONTENT word (skip isolated danda tokens
    // like `।`/`॥` — the last one would otherwise leave `raw.indexOf("")`).
    const allWords = normSnippet.split(" ").filter(Boolean);
    const contentWords = allWords.filter((w) => w !== "।" && w !== "॥");
    if (contentWords.length === 0) return null;
    const first = contentWords[0];
    const last = contentWords[contentWords.length - 1];
    const start = raw.indexOf(first);
    if (start < 0) return null;
    let end = raw.indexOf(last, start);
    if (end < 0) return null;
    end += last.length;
    // Include trailing danda if the snippet had it
    if (snippet.includes("॥")) {
      const dandaIdx = raw.indexOf("॥", end - last.length);
      if (dandaIdx >= 0 && dandaIdx < end + 5) end = dandaIdx + 2;
    } else if (snippet.includes("।")) {
      const dandaIdx = raw.indexOf("।", end - last.length);
      if (dandaIdx >= 0 && dandaIdx < end + 5) end = dandaIdx + 1;
    }
    return { start, end };
  }
  return null;
}

/**
 * Resolve a stored anchor against the current raw passage, preferring the
 * stored offsets when they still match the snippet (handles duplicate phrases
 * like para 72's two `देवा वैकारिकाः स्मृताः` — the second at 585 would
 * otherwise be found at 251). Falls back to `locateSnippet` when the stored
 * offsets are stale or were never valid (the `0,0` fallback).
 */
export function resolveAnchor(
  raw: string,
  snippet: string,
  start: number,
  end: number,
): { start: number; end: number } | null {
  if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= raw.length) {
    const slice = raw.slice(start, end);
    if (slice === snippet) return { start, end };
    const norm = (s: string) =>
      s.replace(/[“”"'`]/g, "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
    if (norm(slice) === norm(snippet)) return { start, end };
  }
  return locateSnippet(raw, snippet);
}
