"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Grantha } from "@/lib/data";
import { buildFlowDeepLink, formatCitation } from "@/lib/citation";

interface FlowReaderCitationProps {
  /** The primary edition (used for the deep link's grantha id). */
  grantha: Grantha;
  /** All active editions, in display (column/click) order. When present with
   *  2+ entries, the citation names every active commentator; the deep link
   *  carries the full comma-list. Single mode leaves this unset. */
  editions?: Grantha[];
  /** The full active edition ids, in order (for the compare-mode deep link). */
  editionIds?: string[];
  verseRef: string;
  subcommentaryIds?: string;
  script: "deva" | "roman";
  /** Devanagari and IAST grantha titles, from the index metadata when
   *  available (the index always carries both; the loaded Grantha object may
   *  not, depending on the source shape). */
  granthaTitleDeva: string;
  granthaTitleIast: string;
}

const CONFIRM_MS = 1600;

/** Script-aware commentator display name for an edition's commentary. */
function commentatorNameOf(edition: Grantha, roman: boolean): string {
  const commentator = edition.commentaries?.[0]?.commentator;
  if (roman) {
    return commentator?.roman || commentator?.devanagari || edition.edition_id || "";
  }
  return commentator?.devanagari || edition.edition_id || "";
}

/** Work (commentary) title for an edition's commentary, or "" when mūla-only. */
function workTitleOf(edition: Grantha): string {
  return edition.commentaries?.[0]?.commentary_title ?? "";
}

/**
 * Per-verse citation/permalink trigger — a small, always-visible (touch-safe)
 * icon opening a popover with two actions: copy the deep link and copy a
 * formatted citation. Copy feedback is a brief inline confirmation on the
 * button itself (the same lightweight non-modal family as the folio's
 * invalid-jump flash) — no toast library, no new UI primitive.
 *
 * In compare mode the trigger sits on the shared verse row (one per row, never
 * per column) and cites whichever commentators are active for that row, in
 * column order, plus any open ṭīkā. The trigger is not hover-only, so it works
 * on touch. Clicking it or the popover must not propagate to the verse's own
 * selection handler.
 */
export default function FlowReaderCitation({
  grantha,
  editions,
  editionIds,
  verseRef,
  subcommentaryIds,
  script,
  granthaTitleDeva,
  granthaTitleIast,
}: FlowReaderCitationProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"link" | "citation" | null>(null);
  const timer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const roman = script === "roman";
  const granthaTitle = roman ? granthaTitleIast : granthaTitleDeva;

  // The active edition set this trigger cites: in compare mode it's the full
  // ordered list; otherwise just the primary edition. Memoized so the citation
  // memo below has a stable dependency.
  const activeEditions = useMemo(
    () => (editions && editions.length >= 1 ? editions : [grantha]),
    [editions, grantha]
  );

  // Open ṭīkā ids (from ?sc=) — subcommentaries toggle together across the
  // whole scroll per id, so a non-empty set means "a ṭīkā is open".
  const openSubIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of (subcommentaryIds || "").split(",")) {
      if (id.trim()) set.add(id.trim());
    }
    return set;
  }, [subcommentaryIds]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  // Close on outside interaction and Escape, so the popover behaves like the
  // app's other small menus rather than requiring a second tap on the icon.
  useEffect(() => {
    if (!open) return;
    const onDocInteraction = (e: Event) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocInteraction);
    document.addEventListener("touchstart", onDocInteraction);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocInteraction);
      document.removeEventListener("touchstart", onDocInteraction);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Compare mode carries the full edition set in the deep link; single mode
  // keeps the Stage-4 behavior (only a genuine multi-edition grantha carries
  // ?e=, never a single-edition one).
  const compareActive = activeEditions.length >= 2;
  const deepLinkEditionId = compareActive
    ? (editionIds && editionIds.length ? editionIds : activeEditions.map((e) => e.edition_id)).join(",")
    : grantha.editions?.length
      ? grantha.edition_id
      : undefined;
  const deepLink = buildFlowDeepLink({
    granthaId: grantha.grantha_id,
    verseRef,
    editionId: deepLinkEditionId,
    subcommentaryIds,
    script,
  });

  // Commentator/work pairs in column order, plus any open ṭīkā commentator.
  // Editions with no commentary are excluded from the pairs so a mūla-only
  // grantha still cites just the grantha title (Stage 4 behavior); an open
  // ṭīkā (subcommentary) is appended by name.
  const commentators = useMemo(() => {
    const pairs = activeEditions
      .filter((edition) => edition.commentaries?.[0])
      .map((edition) => ({
        name: commentatorNameOf(edition, roman),
        work: workTitleOf(edition),
      }));
    for (const edition of activeEditions) {
      for (const sub of edition.commentaries?.[0]?.subcommentaries ?? []) {
        if (openSubIds.has(sub.commentary_id)) {
          pairs.push({
            name: roman
              ? sub.commentator?.roman || sub.commentator?.devanagari || sub.commentary_id
              : sub.commentator?.devanagari || sub.commentary_id,
            work: sub.commentary_title || "",
          });
        }
      }
    }
    return pairs;
  }, [activeEditions, roman, openSubIds]);

  const citation = formatCitation({
    commentators,
    granthaTitle,
    verseRef,
    url: deepLink,
  });

  const flashCopied = (kind: "link" | "citation") => {
    const text = kind === "link" ? deepLink : citation;
    void navigator.clipboard
      .writeText(text)
      .catch(() => {
        // Clipboard access can be denied (permissions/headless); the inline
        // confirmation still shows so the user can copy manually.
      })
      .finally(() => {
        if (timer.current) window.clearTimeout(timer.current);
        setCopied(kind);
        timer.current = window.setTimeout(() => setCopied(null), CONFIRM_MS);
      });
  };

  const actionLabel = (kind: "link" | "citation"): string => {
    if (copied === kind) {
      return roman ? "Copied" : "कॉपी किया";
    }
    if (kind === "link") {
      return roman ? "Copy link" : "लिङ्कम्";
    }
    return roman ? "Copy citation" : "उद्धरणम्";
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-citation-trigger
        onClick={() => setOpen((v) => !v)}
        aria-label={roman ? "Copy link or citation" : "लिङ्कम् / उद्धरणम्"}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 7l-3.5 3.5a2.1 2.1 0 01-3-3L9 5.5M7 13l3.5-3.5a2.1 2.1 0 013 3L13 14"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => flashCopied("link")}
            className={`block w-full text-left px-3 py-2 text-sm font-serif hover:bg-gray-50 ${
              copied === "link" ? "text-green-700" : "text-gray-700"
            }`}
          >
            {actionLabel("link")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => flashCopied("citation")}
            className={`block w-full text-left px-3 py-2 text-sm font-serif hover:bg-gray-50 ${
              copied === "citation" ? "text-green-700" : "text-gray-700"
            }`}
          >
            {actionLabel("citation")}
          </button>
        </div>
      )}
    </div>
  );
}
