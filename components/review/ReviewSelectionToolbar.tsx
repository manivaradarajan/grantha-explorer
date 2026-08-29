"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Reference } from "@/lib/data";
import {
  ReviewComment,
  ReviewCommentType,
  CitationCandidate,
  fetchCandidates,
} from "./reviewServer";
import { selectionToOffset, SelectionMappingError } from "@/lib/selectionToOffset";
import { locateSnippet } from "@/lib/reviewAnchor";

export interface DetectedCitationTarget {
  grantha_id: string;
  edition?: string;
  locator?: string;
  display_text?: string;
}

export type CandidateReference = Pick<Reference, "start" | "end" | "grantha_id"> &
  Partial<Pick<Reference, "edition_id" | "locator" | "display_text">>;

/**
 * Auto-detect the target of a citation-fix: the reference{} nearest to the selection.
 * Handles three patterns: selection overlaps a reference, sits before a trailing citation,
 * or sits in the lookback after a preceding one.
 */
export function detectNearestReference(
  references: CandidateReference[] | undefined,
  selStart: number,
  selEnd: number,
  maxDistance = 40,
): DetectedCitationTarget | null {
  if (!references || references.length === 0) return null;
  const start = Math.max(0, selStart);
  const end = Math.max(start, selEnd);
  let best: CandidateReference | null = null;
  let bestDist = Infinity;
  for (const r of references) {
    let dist: number;
    if (r.start < end && r.end > start) {
      dist = 0;
    } else if (r.end <= start) {
      dist = start - r.end;
    } else {
      dist = r.start - end;
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  }
  if (best && best.grantha_id && bestDist <= maxDistance) {
    return {
      grantha_id: best.grantha_id,
      edition: best.edition_id ?? undefined,
      locator: best.locator ?? undefined,
      display_text: best.display_text,
    };
  }
  return null;
}

interface ReviewSelectionToolbarProps {
  /** Raw text of the current passage (the one the selection is inside). */
  passageRaw: string;
  passageRef: string;
  /** The citing grantha (to filter self-hits from corpus search). */
  currentGranthaId?: string;
  /** The passage's references, for auto-detecting the target of a citation-fix. */
  references?: Reference[];
  /** Existing comment being edited, if any. */
  editing?: ReviewComment;
  /** Persist a new comment (returns its id) or an update to an existing one. */
  onSave: (comment: ReviewComment) => void | Promise<void>;
  /** Dismiss the toolbar without saving. */
  onCancel?: () => void;
  /** The DOM range the toolbar is anchored to (selection or mark). */
  anchorRange: Range;
  /** Raw offsets of the anchored selection (when already known). */
  preset?: { start: number; end: number; snippet: string };
}

const TYPES: ReviewCommentType[] = ["note", "citation-fix", "quote-locate"];

/** Elements that must receive focus/input — a mousedown on them must not be
 *  prevented (which would block typing/clicking). Clicks on the non-interactive
 *  chrome (snippet, labels) keep selection-preservation via preventDefault. */
const isInteractive = (el: EventTarget | null): boolean => {
  if (!(el instanceof Element)) return false;
  return !!el.closest("input, textarea, select, button, a");
};

/** Floating "add / edit review comment" toolbar, anchored below the selection. */
export function ReviewSelectionToolbar({
  passageRaw,
  passageRef,
  currentGranthaId,
  references,
  editing,
  onSave,
  onCancel,
  anchorRange,
  preset,
}: ReviewSelectionToolbarProps) {
  const [type, setType] = useState<ReviewCommentType>(
    editing?.type ?? "note",
  );
  const [body, setBody] = useState(editing?.body ?? "");
  const [locator, setLocator] = useState(
    editing?.suggested_fix?.locator ?? "",
  );
  const [offset, setOffset] = useState(
    preset ?? { start: 0, end: 0, snippet: "" },
  );
  const [mappingError, setMappingError] = useState<string | null>(null);
  // Citation-fix candidates.
  const [candidates, setCandidates] = useState<CitationCandidate[]>([]);
  const [candidatesState, setCandidatesState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [selectedCandidate, setSelectedCandidate] = useState<CitationCandidate | null>(null);
  const [detectedTarget, setDetectedTarget] = useState<{ grantha_id: string; edition?: string; locator?: string; display_text?: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const reposition = () => {
    const el = ref.current;
    if (!el) return;
    const rect = anchorRange.getBoundingClientRect?.();
    if (!rect || (rect.width === 0 && rect.height === 0)) return;
    const pad = 8;
    const margin = 8;
    const w = el.offsetWidth || 360;
    const h = el.offsetHeight || 280;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - w - margin));
    const belowY = rect.bottom + pad;
    const aboveY = rect.top - h - pad;
    const fitsBelow = belowY + h <= window.innerHeight - margin;
    const fitsAbove = aboveY >= margin;
    const top = fitsBelow
      ? belowY
      : fitsAbove
        ? aboveY
        : Math.max(margin, Math.min(belowY, window.innerHeight - h - margin));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };

  // Anchor the toolbar just below the selection rectangle, flipping above it
  // near the viewport bottom so it never clips off-screen. No-op when the
  // Range lacks layout support (e.g. jsdom tests).
  useLayoutEffect(() => {
    reposition();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(reposition);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorRange, candidatesState, candidates.length]);

  // Map the anchor selection to raw offsets on mount (unless preset).
  useEffect(() => {
    if (preset) return;
    try {
      const r = selectionToOffset({
        range: anchorRange,
        passageRaw,
        annotatedSelector: "[data-offset-start]",
      });
      setOffset({ start: r.start, end: r.end, snippet: r.snippet });
    } catch (e) {
      if (e instanceof SelectionMappingError) {
        // Fall back to a smoothed anchor: locate the snippet in the passage so
        // a valid non-negative offset is still sent (the schema requires
        // start >= 0). The snippet is the primary anchor; offsets are hints.
        // Use quote-aware locate so `“पहतपाप्मा”` finds `पहतपाप्मा`.
        const text = anchorRange.toString().trim();
        if (text) {
          const loc = locateSnippet(passageRaw, text);
          setOffset(
            loc
              ? { start: loc.start, end: loc.end, snippet: text }
              : { start: 0, end: 0, snippet: text },
          );
        } else {
          setMappingError(e.message);
        }
      } else {
        setMappingError(e instanceof Error ? e.message : String(e));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-detect the target of a citation-fix: the reference{} nearest to the
  // selection. Handles three patterns: the selection overlaps a reference, sits
  // immediately before a trailing citation (quote → (citation)), or sits in the
  // lookback after a preceding one.
  useEffect(() => {
    if (type !== "citation-fix" || offset.snippet.length === 0 || !references) {
      setDetectedTarget(null);
      return;
    }
    const target = detectNearestReference(references, offset.start, offset.end);
    setDetectedTarget(target);
  }, [type, offset.start, offset.end, offset.snippet, references]);

  // Fetch candidates in citation-fix: scan the detected target grantha (if a
  // reference is near the selection), otherwise search the whole corpus so the
  // reviewer can locate a quote that has no citation yet.
  useEffect(() => {
    if (type !== "citation-fix" || offset.snippet.length === 0) {
      setCandidates([]);
      setCandidatesState("idle");
      return;
    }
    let cancelled = false;
    setCandidatesState("loading");
    setSelectedCandidate(null);
    const run = async (): Promise<void> => {
      const targeted = detectedTarget
        ? {
            target: detectedTarget.grantha_id,
            edition: detectedTarget.edition,
            needle: offset.snippet,
            exclude_locator: detectedTarget.locator,
            min_quality: 0.5,
          }
        : { needle: offset.snippet, min_quality: 0.5, corpus: true };
      const filter = (cs: CitationCandidate[]): CitationCandidate[] => {
        let list = cs.filter((c) => c.quality >= 0.65);
        if (currentGranthaId) {
          list = list.filter(
            (c) => !(c.grantha_id === currentGranthaId && c.ref === passageRef),
          );
        }
        return list;
      };
      let list: CitationCandidate[] = [];
      try {
        const res = await fetchCandidates(targeted);
        if (cancelled) return;
        list = filter(res.candidates ?? []);
        // Corpus fallback: when a targeted scan leaves only the already-cited
        // verse (or nothing) above the floor, widen to the whole corpus so the
        // reviewer still sees the other occurrences of the quote (e.g. a verse
        // shared by Mundaka and Katha).
        if (list.length === 0 || list.every((c) => c.is_current)) {
          const corpus = await fetchCandidates({
            needle: offset.snippet,
            min_quality: 0.5,
            corpus: true,
          });
          if (cancelled) return;
          const merged = [...list];
          for (const c of corpus.candidates ?? []) {
            if (!merged.some((m) => m.grantha_id === c.grantha_id && m.ref === c.ref)) {
              merged.push(c);
            }
          }
          list = filter(merged);
        }
        setCandidates(list);
        setCandidatesState("ready");
      } catch {
        if (cancelled) return;
        setCandidates([]);
        setCandidatesState("error");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [type, detectedTarget, offset.snippet, currentGranthaId, passageRef]);

  // Escape closes the popup without saving.
  useEffect(() => {
    if (!onCancel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  // Saving needs some substance: a comment body, or (for citation-fix) a
  // selected candidate / typed locator. A candidate choice alone is enough to
  // save — no body needed.
  const hasSubstance =
    body.trim().length > 0 ||
    (type === "citation-fix" && (selectedCandidate !== null || locator.trim().length > 0));
  const canSave =
    hasSubstance &&
    offset.snippet.trim().length > 0 &&
    !mappingError;

  const handleSave = async () => {
    if (!canSave) return;
    setSaveError(null);
    // citation-fix: prefer a selected candidate; else the typed-custom locator
    // (if any); else inherit the editing comment's suggested_fix.
    let suggested_fix = editing?.suggested_fix;
    if (type === "citation-fix") {
      const customLocator = locator.trim();
      if (selectedCandidate) {
        suggested_fix = {
          grantha_id: selectedCandidate.grantha_id,
          display_text: selectedCandidate.ref,
          locator: selectedCandidate.ref,
        };
      } else if (customLocator) {
        suggested_fix = {
          grantha_id: detectedTarget?.grantha_id,
          display_text: customLocator,
          locator: customLocator,
        };
      }
    }
    const base: ReviewComment = {
      id: editing?.id ?? crypto.randomUUID(),
      type,
      status: editing?.status ?? "open",
      passage_ref: passageRef,
      passage_type: "main",
      anchor: {
        // Defensively clamp: the schema requires start >= 0 and end >= start.
        // `offset` is always non-negative after the smoothed fallback, but this
        // guarantees a bad value can never reach the server.
        start: Math.max(0, Math.floor(offset.start)),
        end: Math.max(Math.max(0, Math.floor(offset.start)), Math.floor(offset.end)),
        line: Math.max(1, lineOf(anchorRange)),
        snippet: offset.snippet,
      },
      body: body.trim(),
      suggested_fix,
      created_at: editing?.created_at ?? new Date().toISOString(),
    };
    try {
      await onSave(base);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Failed to save the comment.";
      setSaveError(msg);
    }
  };

  return (
    <div
      ref={ref}
      className="review-toolbar"
      role="dialog"
      aria-label="Add review comment"
      onMouseDown={(e) => {
        // Keep the page selection alive when clicking non-interactive chrome,
        // but never block focus on the fields/buttons (that froze the popup).
        if (!isInteractive(e.target)) e.preventDefault();
      }}
    >
      <div className="review-toolbar-snippet">{offset.snippet || "(empty selection)"}</div>
      <div className="review-toolbar-kinds">
        {TYPES.map((t) => (
          <button
            key={t}
            className={`review-kind-pill k-${typeOf(t)}${type === t ? " active" : ""}`}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {type === "citation-fix" && (
        <div className="review-candidates">
          {candidatesState === "loading" ? (
            <div className="review-candidates-status">Finding candidates…</div>
          ) : candidatesState === "error" ? (
            <div className="review-candidates-status review-candidates-error">
              Candidates unavailable — type below.
            </div>
          ) : candidatesState === "ready" && candidates.length > 0 ? (
            <div className="review-candidates-list">
              <div className="review-candidates-head">
                {detectedTarget
                  ? `in ${detectedTarget.grantha_id}`
                  : "in corpus"}
              </div>
              {candidates.map((c, idx) => (
                <button
                  key={`${c.grantha_id}:${c.ref}:${idx}`}
                  className={`review-candidate${selectedCandidate?.ref === c.ref && selectedCandidate?.grantha_id === c.grantha_id ? " selected" : ""}`}
                  onClick={() => {
                    setSelectedCandidate(c);
                    setLocator(c.ref);
                  }}
                >
                  <span className="review-candidate-ref">{c.ref}</span>
                  {c.is_current && (
                    <span className="review-candidate-current">current</span>
                  )}
                  <span className="review-candidate-quality">
                    {(c.quality * 100).toFixed(0)}%
                  </span>
                  <span className="review-candidate-excerpt">{c.excerpt}</span>
                </button>
              ))}
            </div>
          ) : candidatesState === "ready" ? (
            <div className="review-candidates-status">No candidates found — type below.</div>
          ) : null}
          <div className="review-custom-fix">
            <input
              className="review-toolbar-locator"
              placeholder="…or type your own locator (e.g. 2.121)"
              value={locator}
              onChange={(e) => {
                setLocator(e.target.value);
                setSelectedCandidate(null);
              }}
            />
          </div>
        </div>
      )}
      <textarea
        className="review-toolbar-body"
        placeholder="Comment…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        autoFocus
      />
      {mappingError && (
        <div className="review-toolbar-error">{mappingError}</div>
      )}
      {saveError && <div className="review-toolbar-error">{saveError}</div>}
      {type !== "citation-fix" && body.trim().length === 0 && (
        <div className="review-toolbar-hint">
          {type === "note"
            ? "Add your note text to save."
            : "Describe the quote / fix to save."}
        </div>
      )}
      <div className="review-toolbar-actions">
        {onCancel && (
          <button className="review-toolbar-cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="review-toolbar-save" disabled={!canSave} onClick={handleSave}>
          {editing ? "Save changes" : "Save"}
        </button>
      </div>
    </div>
  );
}

const typeOf = (t: ReviewCommentType): string =>
  t === "citation-fix" ? "fix" : t === "quote-locate" ? "quote" : "note";

const lineOf = (range: Range): number => {
  const before = document.createRange();
  before.setStart(range.startContainer, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const text = before.toString();
  return (text.match(/\n/g)?.length ?? 0) + 1;
};
