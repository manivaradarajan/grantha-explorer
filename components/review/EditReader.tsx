"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import FlowReader from "@/components/FlowReader";
import { ReviewModeProvider, useReviewMode } from "./ReviewModeProvider";
import { ReviewCommentList } from "./ReviewCommentList";
import { ReviewSelectionToolbar } from "./ReviewSelectionToolbar";
import type { ReviewComment } from "./reviewServer";
import type { Grantha, Reference } from "@/lib/data";
import { resolveAnchor, resolveReviewMarks } from "@/lib/reviewAnchor";

export interface EditReaderProps {
  grantha: Grantha;
  editionIds: string[];
  granthas: Parameters<typeof FlowReader>[0]["granthas"];
  selectedRef: string;
  updateHash: (granthaId: string, verseRef: string, editionId?: string) => void;
  onGranthaChange: (granthaId: string) => void;
  onExitEdit: () => void;
  availableGranthaIds: string[];
  granthaById: Parameters<typeof FlowReader>[0]["granthaById"];
  granthaIdToDevanagariTitle: Record<string, string>;
  loadPart: (firstRef: string) => Promise<void>;
  isLoadingPart: boolean;
}

/** Build the passageRef → raw devanagari map for snippet re-location. */
export function buildPassageTexts(grantha: Grantha): Record<string, string> {
  const out: Record<string, string> = {};
  const collect = (p: {
    ref: string;
    content?: { sanskrit?: { devanagari?: string } };
  }) => {
    out[p.ref] = p.content?.sanskrit?.devanagari ?? "";
  };
  grantha.prefatory_material?.forEach(collect);
  grantha.passages?.forEach(collect);
  grantha.concluding_material?.forEach(collect);
  return out;
}

/** Build the passageRef → references map (for citation-fix target detection). */
export function buildPassageRefs(grantha: Grantha): Record<string, Reference[]> {
  const out: Record<string, Reference[]> = {};
  const collect = (p: { ref: string; references?: Reference[] }) => {
    if (p.references?.length) out[p.ref] = p.references;
  };
  grantha.prefatory_material?.forEach(collect);
  grantha.passages?.forEach(collect);
  grantha.concluding_material?.forEach(collect);
  return out;
}

interface SelectionState {
  range: Range;
  passageRef: string;
  passageRaw: string;
  editing?: ReviewComment;
  preset?: { start: number; end: number; snippet: string };
}

/** Edit-mode reader: the flow reading surface wrapped in review mode. */
function EditReaderInner(props: EditReaderProps) {
  const { grantha, editionIds, granthas, selectedRef, updateHash, onGranthaChange } = props;
  const {
    onExitEdit,
    availableGranthaIds,
    granthaById,
    granthaIdToDevanagariTitle,
    loadPart,
    isLoadingPart,
  } = props;
  const { session, detached, addComment, refresh } = useReviewMode();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [focusComment, setFocusComment] = useState<string | null>(null);
  const [activePassage, setActivePassage] = useState<string>(selectedRef);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const passageTexts = useMemo(() => buildPassageTexts(grantha), [grantha]);
  const passageRefs = useMemo(() => buildPassageRefs(grantha), [grantha]);

  // Load the session on mount (the provider also does this; keep a stable hook
  // identity so the surface doesn't re-mount).
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global mouseup → detect a text selection on the surface → show toolbar.
  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const surface = surfaceRef.current;
      if (!surface || !surface.contains(range.commonAncestorContainer)) return;
      const text = range.toString().trim();
      if (!text) return;
      const el = range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
      let passageEl = el?.closest("[data-verse-ref]");
      if (!passageEl && range.startContainer) {
        const startEl = range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement;
        passageEl = startEl?.closest("[data-verse-ref]");
      }
      const passageRef = passageEl?.getAttribute("data-verse-ref");
      if (!passageRef) return;
      // Selecting inside an existing review mark edits that comment.
      const mark = el?.closest("[data-comment-id]");
      const commentId = mark?.getAttribute("data-comment-id");
      const comments = session?.comments ?? [];
      const editing = commentId
        ? comments.find((c) => c.id === commentId)
        : undefined;
      setSelection({
        range,
        passageRef,
        passageRaw: passageTexts[passageRef] ?? "",
        editing,
      });
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [passageTexts, session]);

  // Compute review marks for the current session, re-located by snippet.
  const marksByRef = useMemo(
    () =>
      resolveReviewMarks(
        session?.comments,
        passageTexts,
        detached,
        setFocusComment,
      ),
    [session, detached, passageTexts],
  );

  // Keep activePassage in sync with FlowReader's scrollspy.
  const handleScrollVerse = (ref: string) => {
    setActivePassage(ref);
    updateHash(grantha.grantha_id, ref);
  };

  // Sync right pane list scroll to active passage (fallback when no
  // phrase-level highlight is near viewport center).
  useEffect(() => {
    if (activeComment) return;
    if (!listRef.current || !activePassage) return;
    const card = listRef.current.querySelector(
      `[data-comment-passage="${activePassage}"]`,
    ) as HTMLElement | null;
    if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activePassage, activeComment]);

  // Phrase-level scrollspy: keep the comment for the highlight nearest the
  // main viewport center highlighted and centered in the right pane, so the
  // card lines up approximately with its phrase on screen.
  useEffect(() => {
    const main = surfaceRef.current?.querySelector(".overflow-y-auto") as HTMLElement | null;
    const aside = listRef.current;
    if (!main || !aside || !session) return;
    let raf = 0;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(() => {
        ticking = false;
        const highlights = Array.from(
          main.querySelectorAll<HTMLElement>("[data-comment-id]"),
        ).filter((el) => el.offsetParent !== null);
        if (!highlights.length) return;
        const mainRect = main.getBoundingClientRect();
        const centerY = mainRect.top + mainRect.height / 2;
        let best: HTMLElement | null = null;
        let bestDist = Infinity;
        for (const el of highlights) {
          const r = el.getBoundingClientRect();
          const dist = Math.abs(r.top + r.height / 2 - centerY);
          if (dist < bestDist) {
            bestDist = dist;
            best = el;
          }
        }
        if (!best) return;
        // Only activate if the nearest highlight is actually near the viewport
        // (within one viewport height). Otherwise clear and fall back to
        // passage-level highlight.
        if (bestDist > mainRect.height) {
          if (activeComment) setActiveComment(null);
          return;
        }
        const id = best.getAttribute("data-comment-id");
        if (id && id !== activeComment) setActiveComment(id);
        // Keep the corresponding card centered in the right pane.
        if (id) {
          const card = aside.querySelector<HTMLElement>(`[data-comment-id="${id}"]`);
          if (card) {
            const cardRect = card.getBoundingClientRect();
            const asideRect = aside.getBoundingClientRect();
            const delta = cardRect.top + cardRect.height / 2 - (asideRect.top + asideRect.height / 2);
            if (Math.abs(delta) > 24) {
              aside.scrollBy({ top: delta, behavior: "smooth" });
            }
          }
        }
      });
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    // Run once after marks are painted.
    const t = setTimeout(onScroll, 300);
    return () => {
      main.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [session, detached, passageTexts, activeComment]);

  // Scroll a focused comment's mark into view (clicking list → main).
  useEffect(() => {
    if (!focusComment) return;
    const container = surfaceRef.current?.querySelector(
      ".overflow-y-auto",
    ) as HTMLElement | null;
    const el = surfaceRef.current?.querySelector(
      `[data-comment-id="${focusComment}"]`,
    ) as HTMLElement | null;
    if (!el) return;
    if (container) {
      const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      container.scrollTo({ top: top - container.clientHeight / 2, behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusComment]);

  const handleSave = async (c: ReviewComment) => {
    await addComment(c);
    setSelection(null);
  };

  const handleEdit = (c: ReviewComment) => {
    const raw = passageTexts[c.passage_ref] ?? "";
    // Try to anchor the toolbar to the highlight if it's rendered
    const hl = surfaceRef.current?.querySelector(
      `[data-comment-id="${c.id}"]`,
    ) as HTMLElement | null;
    let range: Range;
    if (hl) {
      // Use the highlight's text node for accurate positioning
      const tn = hl.firstChild as Text | null;
      if (tn && tn.nodeType === Node.TEXT_NODE) {
        range = document.createRange();
        range.selectNodeContents(tn);
      } else {
        range = document.createRange();
        range.selectNode(hl);
      }
    } else {
      // Fallback: anchor to the card in the right pane (for detached or
      // deduped highlights, e.g. two comments on same snippet)
      const card = listRef.current?.querySelector(
        `[data-comment-id="${c.id}"]`,
      ) as HTMLElement | null;
      if (card) {
        range = document.createRange();
        range.selectNode(card);
      } else {
        // Last resort: a collapsed range at body start (toolbar will still
        // show, positioned at viewport origin)
        range = document.createRange();
        range.setStart(document.body, 0);
        range.setEnd(document.body, 0);
      }
    }
    // Resolve the anchor to ensure offsets are valid (handles 0,0 legacy)
    const loc = resolveAnchor(raw, c.anchor.snippet, c.anchor.start, c.anchor.end);
    setSelection({
      range,
      passageRef: c.passage_ref,
      passageRaw: raw,
      editing: c,
      preset: loc ? { start: loc.start, end: loc.end, snippet: c.anchor.snippet } : undefined,
    });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="min-w-0 flex-1 overflow-hidden" ref={surfaceRef}>
        <FlowReader
          grantha={grantha}
          editions={[grantha]}
          editionsMeta={grantha.editions ?? []}
          editionIds={editionIds}
          onEditionIdsChange={() => {}}
          granthas={granthas}
          selectedRef={selectedRef}
          onGranthaChange={onGranthaChange}
          onVerseSelect={(ref) => updateHash(grantha.grantha_id, ref)}
          onScrollVerseChange={handleScrollVerse}
          activeSubcommentaryIds=""
          onSubcommentaryToggle={() => {}}
          loadPart={loadPart}
          isLoadingPart={isLoadingPart}
          onExitFlow={onExitEdit}
          script="deva"
          onScriptChange={() => {}}
          updateHash={updateHash}
          availableGranthaIds={availableGranthaIds}
          granthaById={granthaById}
          granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
          reviewMarksByRef={marksByRef}
        />
        {selection && (
          <ReviewSelectionToolbar
            passageRaw={selection.passageRaw}
            passageRef={selection.passageRef}
            currentGranthaId={grantha.grantha_id}
            references={passageRefs[selection.passageRef]}
            anchorRange={selection.range}
            editing={selection.editing}
            preset={selection.preset}
            onSave={handleSave}
            onCancel={() => setSelection(null)}
          />
        )}
      </div>
      <aside ref={listRef} className="w-80 shrink-0 border-l border-gray-200 bg-white overflow-y-auto h-screen">
        <ReviewCommentList
          activePassageRef={activePassage}
          activeCommentId={activeComment}
          onSelect={(id) => setFocusComment(id)}
          onEdit={handleEdit}
        />
      </aside>
    </div>
  );
}

export default function EditReader(props: EditReaderProps) {
  return (
    <ReviewModeProvider
      granthaId={props.grantha.grantha_id}
      passageTexts={buildPassageTexts(props.grantha)}
    >
      <EditReaderInner {...props} />
    </ReviewModeProvider>
  );
}
