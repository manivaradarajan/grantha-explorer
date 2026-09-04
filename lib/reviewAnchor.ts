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
  // Trim isolated leading/trailing danda tokens (which normWS isolated into
  // their own words). A review selection may bracket a phrase with a `।`/`॥`
  // that a later text edit replaced (e.g. the para 1 BAU 6.4.22 citation fix
  // turned "…तपसानाशकेन ।" into "…तपसानाशकेन (बृ.उ. ६.४.२२),"); the danda is
  // editorial chrome, so drop it and retry when the exact normalized match
  // misses. Dandas INSIDE the snippet or genuinely present in the raw text are
  // unaffected (trim stops at the first non-danda edge token).
  const withoutEdgeDandas = (s: string): string => {
    const tokens = s.split(" ").filter(Boolean);
    while (tokens.length && (tokens[0] === "।" || tokens[0] === "॥")) {
      tokens.shift();
    }
    while (
      tokens.length &&
      (tokens[tokens.length - 1] === "।" || tokens[tokens.length - 1] === "॥")
    ) {
      tokens.pop();
    }
    return tokens.join(" ");
  };
  let normNeedle = normSnippet;
  idx = normRaw.indexOf(normNeedle);
  // withoutEdgeDandas is idempotent (strips all edge dandas in one pass), so
  // at most one retry is possible — use `if` rather than `while`.
  if (idx < 0) {
    const trimmed = withoutEdgeDandas(normNeedle);
    if (trimmed !== normNeedle) {
      normNeedle = trimmed;
      idx = normRaw.indexOf(normNeedle);
    }
  }
  if (idx >= 0) {
    // Map back: find first and last CONTENT word (skip isolated danda tokens
    // like `।`/`॥` — the last one would otherwise leave `raw.indexOf("")`).
    const allWords = normNeedle.split(" ").filter(Boolean);
    const contentWords = allWords.filter((w) => w !== "।" && w !== "॥");
    if (contentWords.length === 0) return null;
    const first = contentWords[0];
    const last = contentWords[contentWords.length - 1];
    const start = raw.indexOf(first);
    if (start < 0) return null;
    let end = raw.indexOf(last, start);
    if (end < 0) return null;
    end += last.length;
    // Include trailing danda if the (possibly danda-trimmed) needle had it.
    if (normNeedle.includes("॥")) {
      const dandaIdx = raw.indexOf("॥", end - last.length);
      if (dandaIdx >= 0 && dandaIdx < end + 5) end = dandaIdx + 2;
    } else if (normNeedle.includes("।")) {
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

export type ReviewCommentStatus =
  | "open"
  | "fixed"
  | "accepted"
  | "reopened"
  | "dismissed"
  | "deleted"
  | "done"; // legacy alias for accepted (read-only; never newly emitted)

export interface ReviewCommentAnchorInput {
  id: string;
  passage_ref: string;
  type: "citation-fix" | "quote-locate" | "note";
  status: ReviewCommentStatus;
  anchor: { start: number; end: number; snippet: string };
  hash_changed?: boolean;
}

export interface ResolvedReviewMark {
  start: number;
  end: number;
  type: "citation-fix" | "quote-locate" | "note";
  status: Exclude<ReviewCommentStatus, "done">;
  drift?: boolean;
  commentId: string;
  onClick?: (commentId: string) => void;
}

/**
 * Resolve review comments across passages into rendered ReviewMarkSpec[] lists by passageRef.
 * Skips deleted or detached comments and re-locates anchor offsets against current passage texts.
 * Optionally restricts which statuses surface (e.g. the edit mode "Not yet accepted" filter
 * passes {open, reopened, fixed}); when omitted, every non-deleted status is surfaced.
 */
export function resolveReviewMarks<T extends ReviewCommentAnchorInput>(
  comments: T[] | undefined,
  passageTexts: Record<string, string>,
  detached: string[] = [],
  onMarkClick?: (commentId: string) => void,
  opts: { statuses?: ReadonlySet<Exclude<ReviewCommentStatus, "deleted" | "done">> } = {},
): Record<string, ResolvedReviewMark[]> {
  const out: Record<string, ResolvedReviewMark[]> = {};
  if (!comments || comments.length === 0) return out;
  for (const c of comments) {
    if (c.status === "deleted") continue;
    if (detached.includes(c.id)) continue;
    // "done" is a legacy alias emitted by older clients; normalize here at the
    // resolution boundary so all callers work with the canonical status set
    // (Exclude<ReviewCommentStatus, "done">).  Raw session JSON may still
    // contain "done" — the ReviewCommentStatus type tracks both.
    const status = c.status === "done" ? "accepted" : c.status;
    if (opts.statuses && !opts.statuses.has(status)) continue;
    const raw = passageTexts[c.passage_ref];
    if (!raw) continue;
    const loc = resolveAnchor(raw, c.anchor.snippet, c.anchor.start, c.anchor.end);
    if (!loc) continue;
    out[c.passage_ref] ??= [];
    out[c.passage_ref].push({
      start: loc.start,
      end: loc.end,
      type: c.type,
      status,
      drift: Boolean(c.hash_changed),
      commentId: c.id,
      onClick: onMarkClick,
    });
  }
  return out;
}

