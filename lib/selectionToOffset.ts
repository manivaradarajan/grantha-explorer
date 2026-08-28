/**
 * Map a DOM text selection on the reading surface back to raw half-open UTF-16
 * offsets into a passage's `content.sanskrit.devanagari`.
 *
 * The renderer annotates every emitted text slice with `data-offset-start` /
 * `data-offset-end` (absolute raw offsets). The DOM text differs from the raw
 * slice in three ways:
 *
 *  1. `protectLineBreaks` swaps some spaces/newlines for NBSP — 1-for-1,
 *     length-preserving, so offsets are unchanged;
 *  2. `stripMarkdownInline` / `sanitizeCommentaryHtml` drop `**` (and `#### `)
 *     markers — the inverse map below accounts for the length delta;
 *  3. `renderMarkedSegment` inserts typographic “ ” quote glyphs as separate
 *     text nodes (never inside a text-node selection).
 *
 * The anchor a review comment stores is the raw substring (snippet); the
 * offsets are hints. This module guarantees the mapping is either exact or
 * fails loudly (never a silently wrong occurrence).
 */

export type SelectionMappingErrorCode =
  | "out_of_bounds"
  | "not_found"
  | "ambiguous"
  | "mismatch";

export class SelectionMappingError extends Error {
  readonly code: SelectionMappingErrorCode;

  constructor(code: SelectionMappingErrorCode, message: string) {
    super(message);
    this.name = "SelectionMappingError";
    this.code = code;
  }
}

export interface VisibleMap {
  visible: string;
  /** `rawForVisible[i]` = the raw index of the i-th visible character. */
  rawForVisible: number[];
}

const normWs = (s: string): string => s.replace(/\u00A0/g, " ");

/**
 * Build the inverse map between a raw slice and its visible (markdown-stripped)
 * text. Drops `**` anywhere and a line-leading `#### ` (the two transforms the
 * renderer's `sanitizeCommentaryHtml` applies), keeping a parallel array of raw
 * indices.
 *
 * Args:
 *     rawSlice: The raw text (markers included).
 *
 * Returns:
 *     The visible string and the raw index of each visible character.
 */
export function visibleMap(rawSlice: string): VisibleMap {
  let visible = "";
  const rawForVisible: number[] = [];
  let i = 0;
  const n = rawSlice.length;
  while (i < n) {
    if (rawSlice.startsWith("**", i)) {
      i += 2;
      continue;
    }
    if (
      rawSlice.startsWith("#### ", i) &&
      (i === 0 || rawSlice[i - 1] === "\n")
    ) {
      i += 5;
      continue;
    }
    visible += rawSlice[i];
    rawForVisible.push(i);
    i += 1;
  }
  return { visible, rawForVisible };
}

export interface MapSelectionParams {
  /** Absolute raw offset of the annotated span's start (into the passage). */
  spanRawStart: number;
  /** The span's raw slice, i.e. `passageRaw.slice(spanRawStart, spanRawEnd)`. */
  rawSlice: string;
  /** The selected visible text (DOM), NBSP-normalized. */
  selectedText: string;
  /** Selection boundaries as indices into the span's visible text. */
  selStartVisible: number;
  selEndVisible: number;
}

export interface RawSpan {
  start: number;
  end: number;
  snippet: string;
  source: "exact" | "widened";
}

/**
 * Map a selection within a single annotated span to absolute raw offsets.
 * Verifies the selection against the stripped raw slice; on any mismatch it
 * throws `mismatch` so the caller can fall back to a widened passage search.
 *
 * Args:
 *     p: See {@link MapSelectionParams}.
 *
 * Returns:
 *     Absolute raw offsets + the authoritative snippet (from the raw slice).
 *
 * Throws:
 *     SelectionMappingError: out_of_bounds / mismatch.
 */
export function mapVisibleSelectionToRaw(
  p: MapSelectionParams,
): Omit<RawSpan, "source"> {
  const { spanRawStart, rawSlice, selectedText } = p;
  const { selStartVisible: ss, selEndVisible: se } = p;
  if (
    !Number.isInteger(ss) ||
    !Number.isInteger(se) ||
    ss < 0 ||
    se <= ss
  ) {
    throw new SelectionMappingError(
      "out_of_bounds",
      `selection bounds ${ss}..${se} are not a valid visible range`,
    );
  }
  const { visible, rawForVisible } = visibleMap(rawSlice);
  if (se > visible.length) {
    throw new SelectionMappingError(
      "out_of_bounds",
      `selection end ${se} exceeds the span's visible length ${visible.length}`,
    );
  }
  const rawStart = rawForVisible[ss];
  const rawEndLocal = rawForVisible[se - 1] + 1;
  const snippet = rawSlice.slice(rawStart, rawEndLocal);
  const selectedVisible = visible.slice(ss, se);
  const needle = normWs(selectedText);
  if (!needle || /^\s*$/.test(needle)) {
    throw new SelectionMappingError("not_found", "empty selection");
  }
  if (needle !== normWs(selectedVisible)) {
    throw new SelectionMappingError(
      "mismatch",
      `selected "${needle}" does not match the stripped raw slice ` +
        `"${normWs(selectedVisible)}"`,
    );
  }
  return {
    start: spanRawStart + rawStart,
    end: spanRawStart + rawEndLocal,
    snippet,
  };
}

/**
 * Locate the selected text unambiguously across the whole passage, using the
 * visible map (so `**`/`#### ` are stripped on both sides). Never a bare
 * indexOf: a unique occurrence is returned, duplicates throw `ambiguous`, and
 * absence throws `not_found` — the "never silently wrong occurrence" guarantee.
 *
 * Args:
 *     passageRaw: The passage's raw `content.sanskrit.devanagari`.
 *     selectedText: The selected visible text (DOM), NBSP-normalized.
 *
 * Returns:
 *     The unique raw span + snippet.
 *
 * Throws:
 *     SelectionMappingError: not_found / ambiguous.
 */
export function locateSelectionInPassage(
  passageRaw: string,
  selectedText: string,
): Omit<RawSpan, "source"> {
  const needle = normWs(selectedText);
  if (!needle || /^\s*$/.test(needle)) {
    throw new SelectionMappingError("not_found", "empty selection");
  }
  const { visible, rawForVisible } = visibleMap(passageRaw);
  const normVisible = normWs(visible);
  const matches: Array<{ start: number; end: number }> = [];
  let from = 0;
  for (;;) {
    const i = normVisible.indexOf(needle, from);
    if (i < 0) break;
    matches.push({
      start: rawForVisible[i],
      end: rawForVisible[i + needle.length - 1] + 1,
    });
    from = i + 1;
  }
  if (matches.length === 0) {
    throw new SelectionMappingError(
      "not_found",
      `"${needle}" was not found in the passage`,
    );
  }
  if (matches.length > 1) {
    throw new SelectionMappingError(
      "ambiguous",
      `"${needle}" occurs ${matches.length} times in the passage — ` +
        "cannot anchor without ambiguity",
    );
  }
  const { start, end } = matches[0];
  return { start, end, snippet: passageRaw.slice(start, end) };
}

/**
 * Map a DOM `Range` selection to raw offsets into `passageRaw`.
 *
 * Strategy: when the whole selection falls inside one `data-offset`-annotated
 * span, map precisely through the span's inverse visible map and verify; on any
 * mismatch or cross-span boundary, fall back to the unambiguous passage search
 * (widened). Throws rather than guessing.
 *
 * Args:
 *     range: The selected DOM range.
 *     passageRaw: The passage's raw `content.sanskrit.devanagari`.
 *     annotatedSelector: CSS selector for the renderer's offset-annotated spans.
 *
 * Returns:
 *     Absolute raw offsets, the authoritative snippet (from the raw string),
 *     and whether the mapping was exact or widened.
 *
 * Throws:
 *     SelectionMappingError: not_found / ambiguous / out_of_bounds.
 */
export function selectionToOffset(params: {
  range: Range;
  passageRaw: string;
  annotatedSelector: string;
}): RawSpan {
  const { range, passageRaw, annotatedSelector } = params;
  const needle = normWs(range.toString());
  if (!needle || /^\s*$/.test(needle)) {
    throw new SelectionMappingError("not_found", "empty selection");
  }

  const span = closestAnnotated(range.startContainer, annotatedSelector);
  if (span) {
    const rawStart = Number(span.getAttribute("data-offset-start"));
    const rawEnd = Number(span.getAttribute("data-offset-end"));
    if (Number.isInteger(rawStart) && Number.isInteger(rawEnd)) {
      const ss = visibleOffsetFromSpanStart(span, range.startContainer, range.startOffset);
      const se = visibleOffsetFromSpanStart(span, range.endContainer, range.endOffset);
      if (ss >= 0 && se >= ss) {
        try {
          return {
            ...mapVisibleSelectionToRaw({
              spanRawStart: rawStart,
              rawSlice: passageRaw.slice(rawStart, rawEnd),
              selectedText: needle,
              selStartVisible: ss,
              selEndVisible: se,
            }),
            source: "exact",
          };
        } catch (e) {
          if (
            !(e instanceof SelectionMappingError) ||
            (e.code !== "out_of_bounds" && e.code !== "mismatch")
          ) {
            throw e;
          }
          // Fall through to the widened passage search.
        }
      }
    }
  }
  return { ...locateSelectionInPassage(passageRaw, needle), source: "widened" };
}

function closestAnnotated(
  node: Node,
  selector: string,
): Element | null {
  let cur: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
  while (cur && cur.nodeType === Node.ELEMENT_NODE) {
    const el = cur as Element;
    if (el.matches?.(selector)) return el;
    cur = el.parentNode;
  }
  return null;
}

function visibleOffsetFromSpanStart(
  span: Element,
  container: Node,
  offset: number,
): number {
  const probe = document.createRange();
  probe.setStart(span, 0);
  probe.setEnd(container, offset);
  return probe.toString().length;
}
