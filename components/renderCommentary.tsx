"use client";

import React, { Fragment } from "react";
import type { Reference } from "@/lib/data";
import {
  assertCodePointOffsetAligned,
  sanitizeCommentaryHtml,
  stripMarkdown,
} from "@/lib/stringUtils";
import ReferenceLink from "./ReferenceLink";
import { buildSourceWindow } from "@/lib/quotedMatch";
import type { SourceHighlight } from "./CitationPanel";

/** Props threaded from the reader to ReferenceLink for a rendered citation. */
export interface ReferenceLinkContext {
  currentGranthaId: string;
  /** Active edition to preserve on same-grantha reference jumps. */
  editionId?: string;
  /** The commentary passage ref that contains this citation (for diagnostics). */
  sourcePassageRef: string;
  updateHash: (granthaId: string, verseRef: string, editionId?: string) => void;
  availableGranthaIds: string[];
  /** Per-grantha target metadata for the edition-aware link gate. */
  granthaById: Record<string, { editions?: { edition_id: string }[]; default_school?: string }>;
  granthaIdToTitle: Record<string, string>;
  /** The open citation's quoted span in THIS passage's raw text — marked
   *  steel-blue while the card is up (null when no card is open or the span
   *  lives in another passage). */
  sourceHighlight?: SourceHighlight | null;
}

/** Local `[s, e)` bounds of `highlight.span` within a segment that starts at
 *  `segStart` in the raw text, or null when the segment doesn't intersect the
 *  highlighted span or belongs to another passage. */
const highlightBounds = (
  highlight: SourceHighlight | null | undefined,
  passageRef: string,
  segStart: number,
  segLength: number,
): { s: number; e: number } | null => {
  if (!highlight || highlight.passageRef !== passageRef) {
    return null;
  }
  const s = Math.max(0, highlight.span.start - segStart);
  const e = Math.min(segLength, highlight.span.end - segStart);
  if (s >= e) {
    return null;
  }
  return { s, e };
};

/**
 * Render commentary Devanagari with its structured cross-text citations.
 *
 * Splits the RAW `content.sanskrit.devanagari` at each reference's half-open
 * `[start, end)` offsets and applies the markdown/DOMPurify transforms per
 * segment (plan §7), emitting the citation span as a `ReferenceLink`. The
 * parenthesized citation text itself is never re-synthesized — the offsets
 * and `display_text` come from the producer.
 *
 * Args:
 *     rawText: The passage's raw `content.sanskrit.devanagari`.
 *     references: The passage's `references[]`, or undefined/[].
 *     linkContext: Context threaded into each `ReferenceLink`.
 *
 * Returns:
 *     A React fragment of sanitized text segments interleaved with reference
 *     links, or a single sanitized span when there are no references.
 */
export function renderCommentaryWithReferences(
  rawText: string,
  references: Reference[] | undefined,
  linkContext: ReferenceLinkContext,
): React.ReactNode {
  if (!references || references.length === 0) {
    return (
      <span
        dangerouslySetInnerHTML={{ __html: sanitizeCommentaryHtml(rawText) }}
      />
    );
  }

  const sorted = [...references].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const ref of sorted) {
    // Assert the producer's code-point offsets are valid UTF-16 slice
    // boundaries (SPEC §7) — fail loudly if a non-BMP char would be split.
    assertCodePointOffsetAligned(rawText, ref.start);
    assertCodePointOffsetAligned(rawText, ref.end);
    // Defensively skip spans that overlap the already-emitted range (stale
    // offsets after a source change) — never double-render text.
    if (ref.end <= cursor) {
      continue;
    }
    const segStart = Math.max(cursor, ref.start);
    const window = buildSourceWindow(rawText, ref.start);
    if (segStart > cursor) {
      const seg = rawText.slice(cursor, segStart);
      const bounds = highlightBounds(linkContext.sourceHighlight, linkContext.sourcePassageRef, cursor, seg.length);
      let html = seg;
      if (bounds) {
        html =
          seg.slice(0, bounds.s) +
          '<mark class="citation-source-mark">' +
          seg.slice(bounds.s, bounds.e) +
          "</mark>" +
          seg.slice(bounds.e);
      }
      parts.push(
        <span
          key={`seg-${cursor}`}
          dangerouslySetInnerHTML={{
            __html: sanitizeCommentaryHtml(html),
          }}
        />
      );
    }
    // Prefer the text actually at the offsets (ground truth for rendering);
    // fall back to the producer's display_text on any mismatch.
    const displayText = rawText.slice(segStart, ref.end) || ref.display_text;
    parts.push(
      <ReferenceLink
        key={`ref-${segStart}`}
        reference={{ ...ref, display_text: displayText }}
        sourceLookback={window.text}
        sourceWindowStart={window.start}
        {...linkContext}
      />
    );
    cursor = ref.end;
  }

  if (cursor < rawText.length) {
    parts.push(
      <span
        key="seg-last"
        dangerouslySetInnerHTML={{
          __html: sanitizeCommentaryHtml(rawText.slice(cursor)),
        }}
      />
    );
  }

  return <>{parts}</>;
}

/**
 * Render a main (mula) passage's Devanagari with its cross-text references.
 *
 * The mula render path differs from commentary in two ways: markdown is
 * stripped (``**`` → plain, via ``stripMarkdown``) rather than transformed,
 * and the verse number is appended by the caller (``withVerseNumber``). The
 * offsets are into the RAW ``content.sanskrit.devanagari``, so the split must
 * happen on the raw string FIRST and markdown stripped per segment — stripping
 * the whole string before splitting would shift the offsets. References are
 * wrapped as `ReferenceLink`; the caller appends the verse number.
 *
 * Args:
 *     rawText: The passage's raw mula Devanagari.
 *     references: The passage's `references[]`, or undefined/[].
 *     linkContext: Context threaded into each `ReferenceLink`.
 *
 * Returns:
 *     A React fragment of stripped mula text interleaved with reference links.
 */
export function renderMulaWithReferences(
  rawText: string,
  references: Reference[] | undefined,
  linkContext: ReferenceLinkContext,
): React.ReactNode {
  if (!references || references.length === 0) {
    return <>{stripMarkdown(rawText)}</>;
  }
  const sorted = [...references].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const ref of sorted) {
    assertCodePointOffsetAligned(rawText, ref.start);
    assertCodePointOffsetAligned(rawText, ref.end);
    if (ref.end <= cursor) {
      continue;
    }
    const segStart = Math.max(cursor, ref.start);
    const window = buildSourceWindow(rawText, ref.start);
    if (segStart > cursor) {
      const seg = rawText.slice(cursor, segStart);
      const bounds = highlightBounds(linkContext.sourceHighlight, linkContext.sourcePassageRef, cursor, seg.length);
      if (bounds) {
        parts.push(
          <Fragment key={`seg-${cursor}`}>
            {stripMarkdown(seg.slice(0, bounds.s))}
            <mark className="citation-source-mark">
              {stripMarkdown(seg.slice(bounds.s, bounds.e))}
            </mark>
            {stripMarkdown(seg.slice(bounds.e))}
          </Fragment>
        );
      } else {
        parts.push(
          <span key={`seg-${cursor}`}>{stripMarkdown(seg)}</span>,
        );
      }
    }
    const displayText = rawText.slice(segStart, ref.end) || ref.display_text;
    parts.push(
      <ReferenceLink
        key={`ref-${segStart}`}
        reference={{ ...ref, display_text: displayText }}
        sourceLookback={window.text}
        sourceWindowStart={window.start}
        {...linkContext}
      />
    );
    cursor = ref.end;
  }
  if (cursor < rawText.length) {
    parts.push(
      <span key="seg-last">{stripMarkdown(rawText.slice(cursor))}</span>,
    );
  }
  return <>{parts}</>;
}
