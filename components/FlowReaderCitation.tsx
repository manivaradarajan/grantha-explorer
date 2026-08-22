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
  /** Reveal the trigger only while its passage is hovered (or the trigger is
   *  keyboard-focused). Flow mode passes this to keep the reading surface
   *  clean; compare mode keeps the trigger always-visible. */
  revealOnHover?: boolean;
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
 * Per-verse citation trigger — a small copy icon that copies a formatted
 * citation and briefly flips to a checkmark (the same lightweight non-modal
 * feedback family as the folio's invalid-jump flash) — no toast library, no
 * new UI primitive.
 *
 * In compare mode the trigger sits on the shared verse row (one per row, never
 * per column) and cites whichever commentators are active for that row, in
 * column order, plus any open ṭīkā. Flow mode sets `revealOnHover` so the icon
 * appears only while the passage is hovered/focused. Clicking it must not
 * propagate to the verse's own selection handler.
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
  revealOnHover = false,
}: FlowReaderCitationProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

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

  const flashCopied = () => {
    void navigator.clipboard
      .writeText(citation)
      .catch(() => {
        // Clipboard access can be denied (permissions/headless); the inline
        // confirmation still shows so the user can copy manually.
      })
      .finally(() => {
        if (timer.current) window.clearTimeout(timer.current);
        setCopied(true);
        timer.current = window.setTimeout(() => setCopied(false), CONFIRM_MS);
      });
  };

  return (
    <div
      className={`relative transition-opacity ${
        revealOnHover
          ? copied
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          : ""
      }`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-citation-trigger
        onClick={flashCopied}
        aria-label={roman ? "Copy citation" : "प्रतिलिपि"}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
          copied ? "text-gray-900" : "text-gray-500 hover:text-gray-800"
        }`}
      >
        {copied ? (
          // Checkmark confirmation, Lucide `check`.
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          // Copy icon, Lucide `copy`.
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        )}
      </button>
    </div>
  );
}
