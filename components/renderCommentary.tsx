"use client";

import React, { Fragment } from "react";
import type { Reference } from "@/lib/data";
import {
  assertCodePointOffsetAligned,
  sanitizeCommentaryHtml,
  stripMarkdown,
  stripMarkdownInline,
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
  verseQuotes: { start: number; end: number }[] | undefined,
): React.ReactNode {
  // Split the mula at verse-quote boundaries: each verse-quote block renders
  // as a hang-indented verse (pādas on separate lines), prose between them uses
  // the reference-split path.
  if (verseQuotes && verseQuotes.length > 0) {
    const sortedVQ = [...verseQuotes].sort((a, b) => a.start - b.start);
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const vq of sortedVQ) {
      if (vq.start > cursor) {
        parts.push(
          <div key={`prose-${cursor}`} className="flow-mula-prose">
            {renderMulaProse(rawText.slice(cursor, vq.start), references, linkContext, cursor)}
          </div>,
        );
      }
      parts.push(
        <div key={`vq-${vq.start}`} className="verse-quote">
          {renderVerseQuote(rawText.slice(vq.start, vq.end), references, linkContext, vq.start)}
        </div>,
      );
      cursor = vq.end;
    }
    if (cursor < rawText.length) {
      parts.push(
        <div key={`prose-last`} className="flow-mula-prose">
          {renderMulaProse(rawText.slice(cursor), references, linkContext, cursor)}
        </div>,
      );
    }
    return <>{parts}</>;
  }
  return <>{renderMulaProse(rawText, references, linkContext, 0)}</>;
}

/** Render a non-verse prose span with its references (existing split logic),
 *  including the steel-blue source-quote highlight (citation-source-mark). */
function renderMulaProse(
  text: string,
  references: Reference[] | undefined,
  linkContext: ReferenceLinkContext,
  offset: number,
): React.ReactNode {
  if (!references || references.length === 0) {
    return <>{stripMarkdown(text)}</>;
  }
  const sorted = [...references]
    .filter((r) => r.start >= offset && r.end <= offset + text.length)
    .map((r) => ({ ...r, start: r.start - offset, end: r.end - offset }))
    .sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const ref of sorted) {
    assertCodePointOffsetAligned(text, ref.start);
    assertCodePointOffsetAligned(text, ref.end);
    if (ref.end <= cursor) continue;
    const segStart = Math.max(cursor, ref.start);
    const window = buildSourceWindow(text, ref.start);
    if (segStart > cursor) {
      const seg = text.slice(cursor, segStart);
      const bounds = highlightBounds(
        linkContext.sourceHighlight,
        linkContext.sourcePassageRef,
        offset + cursor,
        seg.length,
      );
      if (bounds) {
        parts.push(
          <Fragment key={`seg-${cursor}`}>
            {stripMarkdownInline(seg.slice(0, bounds.s))}
            <mark className="citation-source-mark">
              {stripMarkdownInline(seg.slice(bounds.s, bounds.e))}
            </mark>
            {stripMarkdownInline(seg.slice(bounds.e))}
          </Fragment>,
        );
      } else {
        parts.push(<span key={`seg-${cursor}`}>{stripMarkdownInline(seg)}</span>);
      }
    }
    const displayText = text.slice(segStart, ref.end) || ref.display_text;
    parts.push(
      <ReferenceLink
        key={`ref-${segStart}`}
        reference={{ ...ref, display_text: displayText }}
        sourceLookback={window.text}
        sourceWindowStart={window.start + offset}
        {...linkContext}
      />,
    );
    cursor = ref.end;
  }
  if (cursor < text.length) {
    parts.push(<span key="seg-last">{stripMarkdownInline(text.slice(cursor))}</span>);
  }
  return <>{parts}</>;
}

/** Render a verse-quote block: each pāda on its own line, hang-indented;
 *  refs inside are linked. */
function renderVerseQuote(
  block: string,
  references: Reference[] | undefined,
  linkContext: ReferenceLinkContext,
  offset: number,
): React.ReactNode {
  const inBlock = (references ?? []).filter(
    (r) => r.start >= offset && r.end <= offset + block.length,
  );
  // Each pāda is a sub-slice of the block; track its absolute offset in the
  // passage so renderMulaProse's reference filter/rebase and the source
  // highlight stay aligned (a ref on the last pāda must not be dropped).
  const padas: { text: string; absStart: number }[] = [];
  let running = offset;
  for (const line of block.split("\n")) {
    if (line.trim().length > 0) {
      padas.push({ text: line, absStart: running });
    }
    running += line.length + 1;
  }
  return (
    <span className="verse-quote-inner">
      {padas.map(({ text, absStart }, i) => (
        <span key={i} className={`verse-pada${padas.length >= 4 && (i + 1) % 2 === 0 ? " verse-pada-cont" : ""}`}>
          {renderMulaProse(text, inBlock, linkContext, absStart)}
        </span>
      ))}
    </span>
  );
}
