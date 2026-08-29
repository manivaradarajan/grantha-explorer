"use client";

import React, { Fragment } from "react";
import type { Reference } from "@/lib/data";
import {
  assertCodePointOffsetAligned,
  sanitizeCommentaryHtml,
  stripMarkdownInline,
} from "@/lib/stringUtils";
import ReferenceLink from "./ReferenceLink";
import { buildSourceWindow } from "@/lib/quotedMatch";
import type { SourceHighlight } from "./CitationPanel";

/** Length-preserving NBSP substitution: glue punctuation to its neighbour so a
 *  line break never orphans an em-dash or a sentence-final danda. Both the
 *  space BEFORE an em-dash (so the dash can't start a line) and AFTER it (so
 *  the following word can't be orphaned) become NBSP; a danda is glued to the
 *  word before it. All replacements are 1-for-1 UTF-16 code units, so the
 *  reference / verse-quote / own-verse offsets into the text stay valid. */
const protectLineBreaks = (text: string): string =>
  text.replace(/ — /g, "\u00A0—\u00A0").replace(/ ।/g, "\u00A0।");

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

import type { ReviewCommentType, ReviewStatus } from "./review/reviewServer";

/** A review annotation highlight (edit mode): anchored by raw offsets in THIS
 *  passage, with a per-type CSS class and optional click handler. */
export interface ReviewMarkSpec {
  start: number;
  end: number;
  type: ReviewCommentType;
  status: ReviewStatus;
  drift?: boolean;
  commentId: string;
  onClick?: (commentId: string) => void;
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

/** Local bounds of each review mark intersecting a segment, absolute→local. */
const reviewBoundsInSegment = (
  marks: ReviewMarkSpec[] | undefined,
  segStart: number,
  segLength: number,
): { spec: ReviewMarkSpec; s: number; e: number }[] => {
  if (!marks || marks.length === 0) return [];
  return marks
    .map((m) => {
      const s = Math.max(0, m.start - segStart);
      const e = Math.min(segLength, m.end - segStart);
      return { spec: m, s, e };
    })
    .filter(({ s, e }) => s < e);
};

const markClassName = (m: { type: string; status: string; drift?: boolean }): string =>
  [
    "review-mark",
    m.type === "citation-fix" ? "k-fix" : m.type === "quote-locate" ? "k-quote" : "k-note",
    // Accepted/done are terminal, reviewable states: keep them readable
    // (no strikethrough/dim) and mark them with a checkmark.
    ["accepted", "done"].includes(m.status) ? "st-accepted" : "",
    // Deleted is shown in red + strikethrough (the destructive colour).
    m.status === "deleted" ? "st-deleted" : "",
    // Dismissed = acknowledged, won't fix: dim + strikethrough.
    m.status === "dismissed" ? "st-done" : "",
    m.drift ? "drift" : "",
  ]
    .filter(Boolean)
    .join(" ");

/** Render a text slice with optional typographic quote marks and the steel-blue
 *  source highlight.
 *
 *  ``quote`` is the build-time ``reference.quote`` span with ABSOLUTE offsets
 *  into the raw passage: a ``“`` is emitted where the quote opens and a ``”``
 *  where it closes (the devanagari-source convention for quoted śruti). The
 *  offsets may fall outside this slice (a verse quote spans several pādas), in
 *  which case only the boundary that lands here is emitted. ``highlight`` is
 *  relative to ``text`` (as produced by ``highlightBounds``) and wraps the
 *  quoted text in the steel-blue ``<mark>`` — the two compose, so a hovered
 *  quote reads ``“<mark>…</mark>”``.
 *
 *  Args:
 *      text: The slice being rendered (already stripped of markdown).
 *      absStart: Absolute offset of ``text[0]`` in the raw passage.
 *      quote: The quote span (absolute), or undefined for no quote marks.
 *      highlight: Relative ``[s, e)`` mark bounds, or null/undefined.
 *
 *  Returns:
 *      The text with quote glyphs and the highlight mark applied.
 */
const renderMarkedSegment = (
  text: string,
  absStart: number,
  quote?: { start: number; end: number },
  highlight?: { s: number; e: number } | null,
  reviewMarks?: ReviewMarkSpec[],
): React.ReactNode => {
  const len = text.length;
  const points = new Set<number>([0, len]);
  let qs = -1;
  let qe = -1;
  if (quote) {
    const relS = quote.start - absStart;
    const relE = quote.end - absStart;
    if (relS >= 0 && relS <= len) {
      points.add(relS);
      qs = relS;
    }
    if (relE >= 0 && relE <= len) {
      points.add(relE);
      qe = relE;
    }
  }
  if (highlight) {
    points.add(highlight.s);
    points.add(highlight.e);
  }
  const marks = reviewBoundsInSegment(reviewMarks, absStart, len);
  for (const { s, e } of marks) {
    points.add(s);
    points.add(e);
  }
  const pts = Array.from(points).sort((a, b) => a - b);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (b <= a) continue;
    const inHigh = highlight ? a >= highlight.s && b <= highlight.e : false;
    let content: React.ReactNode = stripMarkdownInline(text.slice(a, b));
    if (inHigh) {
      content = <mark className="citation-source-mark">{content}</mark>;
    }
    const marksAtSpan = marks.filter(({ s, e }) => s === a && e === b);
    if (marksAtSpan.length > 0) {
      // Render EVERY comment on this span (two comments — e.g. a citation-fix
      // and a note — can share identical bounds). Each mark keeps its own
      // click/select and appends a checkmark when accepted.
      let inner = content;
      for (const m of marksAtSpan) {
        const accepted = m.spec.status === "accepted" || m.spec.status === "done";
        const mark = (
          <mark
            className={markClassName(m.spec)}
            data-comment-id={m.spec.commentId}
            onClick={
              m.spec.onClick
                ? () => m.spec.onClick!(m.spec.commentId)
                : undefined
            }
          >
            {inner}
          </mark>
        );
        inner = accepted ? (
          <Fragment>
            {mark}
            <span
              className="review-mark-check"
              aria-label="Accepted fix"
              title="Accepted"
            >
              ✓
            </span>
          </Fragment>
        ) : (
          mark
        );
      }
      content = inner;
    }
    const prefix = a === qs ? "\u201C" : "";
    const suffix = b === qe ? "\u201D" : "";
    if (prefix || suffix) {
      content = (
        <Fragment>
          {prefix}
          {content}
          {suffix}
        </Fragment>
      );
    }
    out.push(<Fragment key={`m-${absStart}-${a}`}>{content}</Fragment>);
  }
  return <>{out}</>;
};

/** Render a text slice with the renderer's raw-offset annotation, so edit-mode
 *  selections can be mapped back to raw `content.sanskrit.devanagari` offsets.
 *  The span is display-inline and carries no styling — the attributes are the
 *  only payload (selectionToOffset reads them). */
const annotated = (
  rawStart: number,
  rawEnd: number,
  content: React.ReactNode,
): React.ReactNode => (
  <span data-offset-start={rawStart} data-offset-end={rawEnd}>
    {content}
  </span>
);

/** Wrap the review marks that fall inside a raw [rawStart, rawEnd) slice with
 *  `<mark class="review-mark ...">` HTML, for the dangerouslySetInnerHTML paths.
 *  Returns the HTML with the marks spliced in. */
const markHtmlInSpan = (
  html: string,
  rawStart: number,
  rawEnd: number,
  reviewMarks?: ReviewMarkSpec[],
): string => {
  if (!reviewMarks || reviewMarks.length === 0) return html;
  const segLength = rawEnd - rawStart;
  const inSpan = reviewMarks
    .map((m) => ({
      m,
      s: Math.max(0, m.start - rawStart),
      e: Math.min(segLength, m.end - rawStart),
    }))
    .filter(({ s, e }) => s < e)
    .sort((a, b) => a.s - b.s);
  if (inSpan.length === 0) return html;
  let out = "";
  let cursor = 0;
  for (const { m, s, e } of inSpan) {
    if (s > cursor) out += html.slice(cursor, s);
    out +=
      `<mark class="${markClassName(m)}" data-comment-id="${m.commentId}">` +
      html.slice(s, e) +
      "</mark>";
    cursor = e;
  }
  out += html.slice(cursor);
  return out;
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
  reviewMarks?: ReviewMarkSpec[],
): React.ReactNode {
  // Glue em-dashes and sentence-dandas to their neighbours (length-preserving).
  const text = protectLineBreaks(rawText);
  if (!references || references.length === 0) {
    return (
      <span
        data-offset-start={0}
        data-offset-end={text.length}
        dangerouslySetInnerHTML={{ __html: sanitizeCommentaryHtml(text) }}
      />
    );
  }

  const sorted = [...references].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const ref of sorted) {
    // Assert the producer's code-point offsets are valid UTF-16 slice
    // boundaries (SPEC §7) — fail loudly if a non-BMP char would be split.
    assertCodePointOffsetAligned(text, ref.start);
    assertCodePointOffsetAligned(text, ref.end);
    // Defensively skip spans that overlap the already-emitted range (stale
    // offsets after a source change) — never double-render text.
    if (ref.end <= cursor) {
      continue;
    }
    const segStart = Math.max(cursor, ref.start);
    const window = buildSourceWindow(text, ref.start);
    if (segStart > cursor) {
      const seg = text.slice(cursor, segStart);
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
          data-offset-start={cursor}
          data-offset-end={segStart}
          dangerouslySetInnerHTML={{
            __html: sanitizeCommentaryHtml(
              markHtmlInSpan(html, cursor, segStart, reviewMarks),
            ),
          }}
        />
      );
    }
    // Prefer the text actually at the offsets (ground truth for rendering);
    // fall back to the producer's display_text on any mismatch.
    const displayText = text.slice(segStart, ref.end) || ref.display_text;
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

  if (cursor < text.length) {
    parts.push(
      <span
        key="seg-last"
        data-offset-start={cursor}
        data-offset-end={text.length}
        dangerouslySetInnerHTML={{
          __html: sanitizeCommentaryHtml(
            markHtmlInSpan(text.slice(cursor), cursor, text.length, reviewMarks),
          ),
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
 *     text: The passage's raw mula Devanagari.
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
  reviewMarks?: ReviewMarkSpec[],
): React.ReactNode {
  // Split the mula at verse-quote boundaries: each verse-quote block renders
  // as a hang-indented verse (pādas on separate lines), prose between them uses
  // the reference-split path. Every unit boundary is normalized to exactly ONE
  // blank line (a single "\n" separator div) so the raw newline runs in the
  // data (lead/gap/trailing) never compound into visible double/quadruple
  // spacing — the visual rhythm between prose and quoted verse is uniform.
  // The work's OWN verses (ownVerses, <!-- verse -->) render with the same
  // verse-quote treatment (indent, pāda layout, even-line sub-indent) at the
  // same size as the surrounding prose mūla — identical whether an opening
  // maṅgala, a closing dedicatory verse, or a chapter's own verse. The
  // ``verse-own`` class keeps them semantically distinct from embedded
  // citations.
  // Glue em-dashes and sentence-dandas to their neighbours (length-preserving,
  // so all offsets below stay valid).
  const text = protectLineBreaks(rawText);
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
            {renderVerseQuote(t, references, linkContext, o, reviewMarks)}
          </div>,
        );
      } else if (kind === "quote") {
        parts.push(
          <div key={`vq-${offset}`} className="verse-quote">
            {renderVerseQuote(t, references, linkContext, o, reviewMarks)}
          </div>,
        );
      } else if (t.trim() !== "") {
        parts.push(
          <div key={`prose-${offset}`} className="flow-mula-prose">
            {renderMulaProse(t, references, linkContext, o, undefined, {}, reviewMarks)}
          </div>,
        );
      }
    };
    for (const blk of allBlocks) {
      if (blk.start > cursor) {
        emit(text.slice(cursor, blk.start), cursor, "prose");
      }
      emit(text.slice(blk.start, blk.end), blk.start, blk.own ? "own" : "quote");
      cursor = blk.end;
    }
    if (cursor < text.length) {
      emit(text.slice(cursor), cursor, "prose");
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
  return <>{renderMulaProse(text, references, linkContext, 0, undefined, {}, reviewMarks)}</>;
}

/** Render a non-verse prose span with its references (existing split logic),
 *  including the steel-blue source-quote highlight (citation-source-mark).
 *
 *  `blockLookbacks` optionally supplies per-ref source windows computed against
 *  a whole verse-quote BLOCK (see renderVerseQuote) so a ref at the verse's end
 *  still gets the full verse as its lookback — not just the pāda slice.
 *  `quoteBounds` wraps the span in `“…”` when it falls within this slice (the
 *  build-time quote span). `suppressQuoteMarks` drops the glyphs for
 *  verse-quote blocks, whose hang-indent treatment is itself the quotation. */
function renderMulaProse(
  text: string,
  references: Reference[] | undefined,
  linkContext: ReferenceLinkContext,
  offset: number,
  blockLookbacks?: Record<number, { sourceLookback: string; sourceWindowStart: number }>,
  options: { quoteBounds?: { start: number; end: number }; suppressQuoteMarks?: boolean } = {},
  reviewMarks?: ReviewMarkSpec[],
): React.ReactNode {
  const { quoteBounds, suppressQuoteMarks = false } = options;
  if (!references || references.length === 0) {
    const bounds = highlightBounds(
      linkContext.sourceHighlight,
      linkContext.sourcePassageRef,
      offset,
      text.length,
    );
    return annotated(
      offset,
      offset + text.length,
      renderMarkedSegment(
        text,
        offset,
        suppressQuoteMarks ? undefined : quoteBounds,
        bounds,
        reviewMarks,
      ),
    );
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
      // Quote marks from the block bounds (verse-quote) or the ref's own
      // build-time quote (prose citation). Verse-quote blocks suppress them —
      // the hang-indented block treatment is itself the quotation mark.
      const quote = suppressQuoteMarks
        ? undefined
        : quoteBounds ?? (ref.quote ? { start: ref.quote.start, end: ref.quote.end } : undefined);
      parts.push(
        <Fragment key={`seg-${cursor}`}>
          {annotated(
            offset + cursor,
            offset + segStart,
            renderMarkedSegment(seg, offset + cursor, quote, bounds, reviewMarks),
          )}
        </Fragment>,
      );
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
    parts.push(
      <Fragment key="seg-last">
        {annotated(
          offset + cursor,
          offset + text.length,
          renderMarkedSegment(
            text.slice(cursor),
            offset + cursor,
            suppressQuoteMarks ? undefined : quoteBounds,
            bounds,
            reviewMarks,
          ),
        )}
      </Fragment>,
    );
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
  reviewMarks?: ReviewMarkSpec[],
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
          {renderMulaProse(text, inBlock, linkContext, absStart, blockLookbacks, { suppressQuoteMarks: true }, reviewMarks)}
        </span>
      ))}
    </span>
  );
}
