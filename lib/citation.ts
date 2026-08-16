import { buildHash } from "./hashUtils";

/** Everything a deep link / citation needs from state. */
export interface CitationContext {
  granthaId: string;
  verseRef: string;
  /** Single edition id, or a compare-mode comma-separated list of edition ids
   *  (in click/column order). */
  editionId?: string;
  /** Comma-separated active subcommentary IDs (?sc=), for the ṭīkā-open state. */
  subcommentaryIds?: string;
  script: "deva" | "roman";
}

/**
 * Build the shareable deep link for the current flow-reader view.
 *
 * This is the current hash URL with display preferences included (the
 * "Share My View" equivalent), so the mode, active edition, open ṭīkā, and
 * script all travel with it. Reconstructing this URL in a fresh tab must
 * reproduce the exact view the citation was generated from.
 *
 * Args:
 *     ctx: The current reading state.
 *
 * Returns:
 *     An absolute URL (origin + pathname + hash).
 */
export function buildFlowDeepLink(ctx: CitationContext): string {
  const hash = buildHash(
    {
      granthaId: ctx.granthaId,
      verseRef: ctx.verseRef,
      editionId: ctx.editionId,
      subcommentaryIds: ctx.subcommentaryIds,
      script: ctx.script,
      mode: "flow",
    },
    true
  );
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

/** The pieces that go into the human-readable citation string. */
export interface CitationFields {
  /** Commentator + work pairs, in display (column/click) order. Empty for a
   *  mūla-only grantha with no commentary. */
  commentators: { name: string; work: string }[];
  granthaTitle: string;
  verseRef: string;
  url: string;
}

/**
 * Format the human-readable citation string.
 *
 * Single commentary: "[Commentator], [Work] ad [Grantha] [ref], via Grantha
 * Explorer ([URL], accessed [date])."
 * Compare mode (N active): "[A], [WorkA]; [B], [WorkB] ad [Grantha] [ref], via
 * Grantha Explorer ([URL], accessed [date])." — commentators in column order.
 * Mūla-only (no commentary): "[Grantha] [ref], via Grantha Explorer (…)."
 *
 * The access date is generated at copy-time client-side and is deliberately
 * not reproducible from the URL alone — it reflects when the citer actually
 * looked at the text, per standard web citation convention.
 *
 * Args:
 *     fields: The citation pieces.
 *
 * Returns:
 *     The formatted citation string.
 */
export function formatCitation(fields: CitationFields): string {
  const accessed = new Date().toISOString().slice(0, 10);
  const pairs = fields.commentators.map((c) =>
    c.work ? `${c.name}, ${c.work}` : c.name
  );
  const lead =
    pairs.length === 0
      ? fields.granthaTitle
      : `${pairs.join("; ")} ad ${fields.granthaTitle}`;
  return `${lead} ${fields.verseRef}, via Grantha Explorer (${fields.url}, accessed ${accessed}).`;
}
