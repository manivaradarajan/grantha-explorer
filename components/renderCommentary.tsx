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
  ownVerses?: { start: number; end: number }[],
): React.ReactNode {
  // Split the mula at verse-quote boundaries: each verse-quote block renders
  // as a hang-indented verse (pādas on separate lines), prose between them uses
  // the reference-split path. Every unit boundary is normalized to exactly ONE
  // blank line (a single "\n" separator div) so the raw newline runs in the
  // data (lead/gap/trailing) never compound into visible double/quadruple
  // spacing — the visual rhythm between prose and quoted verse is uniform.
  // The work's OWN verses (ownVerses, <!-- verse -->) render the same but with
  // the ``verse-own`` class (semantically distinct from embedded citations).
  const allBlocks = [
    ...(verseQuotes ?? []).map((v) => ({ ...v, own: false })),
    ...(ownVerses ?? []).map((v) => ({ ...v, own: true })),
  ].sort((a, b) => a.start - b.start);
  if (allBlocks.length > 0) {
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    // Trim a leading newline run (the block slices start with "\n" that the
    // verse renderer would otherwise swallow inconsistently).
    const emit = (text: string, offset: number, kind: "own" | "quote" | "prose"): void => {
      let t = text;
      let o = offset;
      if (t.startsWith("\n")) {
        const cut = /^\n+/.exec(t)![0].length;
        t = t.slice(cut);
        o += cut;
      }
      if (t.endsWith("\n")) {
        t = t.replace(/\n+$/, "");
      }
      if (kind === "own") {
        parts.push(
          <div key={`v-${offset}`} className="verse-quote verse-own">
            {renderVerseQuote(t, references, linkContext, o)}
          </div>,
        );
      } else if (kind === "quote") {
        parts.push(
          <div key={`vq-${offset}`} className="verse-quote">
            {renderVerseQuote(t, references, linkContext, o)}
          </div>,
        );
      } else if (t.trim() !== "") {
        parts.push(
          <div key={`prose-${offset}`} className="flow-mula-prose">
            {renderMulaProse(t, references, linkContext, o)}
          </div>,
        );
      }
    };
    for (const blk of allBlocks) {
      if (blk.start > cursor) {
        emit(rawText.slice(cursor, blk.start), cursor, "prose");
      }
      emit(rawText.slice(blk.start, blk.end), blk.start, blk.own ? "own" : "quote");
      cursor = blk.end;
    }
    if (cursor < rawText.length) {
      emit(rawText.slice(cursor), cursor, "prose");
    }
    // Insert a single blank-line separator at EVERY prose↔verse boundary, in
    // either direction — so prose that sits BETWEEN two verses (e.g. para 157's
    // "इति परं ब्रह्म किमिति प्रक्रम्य,") is framed symmetrically with a gap
    // on both sides, matching the lead-prose→verse opening. Adjacent
    // verse-quotes are a continuous quotation run and get no blank line — the
    // inter-verse gap is controlled by CSS (--quote-gap).
    const joined: React.ReactNode[] = [];
    let prevWasVerse = false;
    parts.forEach((part, i) => {
      const isVerse = (part as React.ReactElement)?.props?.className?.includes("verse-quote");
      if (i > 0 && isVerse !== prevWasVerse) {
        joined.push(
          <div key={`sep-${i}`} className="flow-mula-prose">
            {"\n"}
          </div>,
        );
      }
      joined.push(part);
      prevWasVerse = isVerse;
    });
    return <>{joined}</>;
  }
  return <>{renderMulaProse(rawText, references, linkContext, 0)}</>;
}

/** Render a non-verse prose span with its references (existing split logic),
 *  including the steel-blue source-quote highlight (citation-source-mark).
 *
 *  `blockLookbacks` optionally supplies per-ref source windows computed against
 *  a whole verse-quote BLOCK (see renderVerseQuote) so a ref at the verse's end
 *  still gets the full verse as its lookback — not just the pāda slice. */
function renderMulaProse(
  text: string,
  references: Reference[] | undefined,
  linkContext: ReferenceLinkContext,
  offset: number,
  blockLookbacks?: Record<number, { sourceLookback: string; sourceWindowStart: number }>,
): React.ReactNode {
  if (!references || references.length === 0) {
    const bounds = highlightBounds(
      linkContext.sourceHighlight,
      linkContext.sourcePassageRef,
      offset,
      text.length,
    );
    if (bounds) {
      return (
        <Fragment>
          {stripMarkdownInline(text.slice(0, bounds.s))}
          <mark className="citation-source-mark">
            {stripMarkdownInline(text.slice(bounds.s, bounds.e))}
          </mark>
          {stripMarkdownInline(text.slice(bounds.e))}
        </Fragment>
      );
    }
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
    // Prefer a whole-block lookback (the full verse) over the per-pāda slice.
    let sourceLookback: string;
    let sourceWindowStart: number;
    const blockOverride = blockLookbacks?.[offset + ref.start];
    if (blockOverride) {
      sourceLookback = blockOverride.sourceLookback;
      sourceWindowStart = blockOverride.sourceWindowStart;
    } else {
      const w = buildSourceWindow(text, ref.start);
      sourceLookback = w.text;
      sourceWindowStart = w.start + offset;
    }
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
        sourceLookback={sourceLookback}
        sourceWindowStart={sourceWindowStart}
        {...linkContext}
      />,
    );
    cursor = ref.end;
  }
  if (cursor < text.length) {
    const bounds = highlightBounds(
      linkContext.sourceHighlight,
      linkContext.sourcePassageRef,
      offset + cursor,
      text.length - cursor,
    );
    if (bounds) {
      const tail = text.slice(cursor);
      parts.push(
        <Fragment key="seg-last">
          {stripMarkdownInline(tail.slice(0, bounds.s))}
          <mark className="citation-source-mark">
            {stripMarkdownInline(tail.slice(bounds.s, bounds.e))}
          </mark>
          {stripMarkdownInline(tail.slice(bounds.e))}
        </Fragment>,
      );
    } else {
      parts.push(<span key="seg-last">{stripMarkdownInline(text.slice(cursor))}</span>);
    }
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
  // Per-ref source windows built against the WHOLE verse block (not each pāda
  // slice), so a ref at the verse's end — e.g. para 125's भ. गी. १०.१० — gets
  // the full 2-pāda verse as its lookback and the highlight spans the verse.
  const blockLookbacks: Record<number, { sourceLookback: string; sourceWindowStart: number }> = {};
  for (const r of inBlock) {
    const w = buildSourceWindow(block, r.start - offset);
    blockLookbacks[r.start] = {
      sourceLookback: w.text,
      sourceWindowStart: offset + w.start,
    };
  }
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
          {renderMulaProse(text, inBlock, linkContext, absStart, blockLookbacks)}
        </span>
      ))}
    </span>
  );
}
