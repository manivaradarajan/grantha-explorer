"use client";

import React from "react";
import { Reference } from "@/lib/data";
import { sanitizeCommentaryHtml, stripMarkdown } from "@/lib/stringUtils";
import ReferenceLink from "./ReferenceLink";

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
}

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
    // Defensively skip spans that overlap the already-emitted range (stale
    // offsets after a source change) — never double-render text.
    if (ref.end <= cursor) {
      continue;
    }
    const segStart = Math.max(cursor, ref.start);
    if (segStart > cursor) {
      parts.push(
        <span
          key={`seg-${cursor}`}
          dangerouslySetInnerHTML={{
            __html: sanitizeCommentaryHtml(rawText.slice(cursor, segStart)),
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
    if (ref.end <= cursor) {
      continue;
    }
    const segStart = Math.max(cursor, ref.start);
    if (segStart > cursor) {
      parts.push(
        <span key={`seg-${cursor}`}>{stripMarkdown(rawText.slice(cursor, segStart))}</span>,
      );
    }
    const displayText = rawText.slice(segStart, ref.end) || ref.display_text;
    parts.push(
      <ReferenceLink
        key={`ref-${segStart}`}
        reference={{ ...ref, display_text: displayText }}
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
