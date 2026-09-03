'use client';

import React, { useCallback, useRef } from 'react';
import { loadGrantha } from '../lib/data';
import {
  isReferenceLinkable,
  resolveReferenceTarget,
  type ReferenceTargetMeta,
} from '../lib/references';
import { toDevanagariNumerals } from '../lib/stringUtils';
import {
  addReferenceDiagnostic,
  buildDiagnostic,
  isDiagnosticsEnabled,
  type ReferenceDiagCode,
} from '../lib/referenceDiagnostics';
import { extractEnclosedQuote } from '../lib/quotedMatch';
import { useCitationPanel } from './CitationPanel';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { Reference } from '../lib/data';

interface ReferenceLinkProps {
  reference: Reference;
  currentGranthaId: string;
  /** Active edition to preserve on same-grantha reference jumps. */
  editionId?: string;
  /** The commentary passage ref containing this citation (for diagnostics). */
  sourcePassageRef: string;
  /** Source text immediately before the citation; fuzzy-matched against the
   *  preview so the panel can highlight the quoted span. */
  sourceLookback?: string;
  /** Absolute offset of `sourceLookback` within the source passage — lets the
   *  open citation highlight the quoted span in the source text itself. */
  sourceWindowStart?: number;
  updateHash: (granthaId: string, verseRef: string, editionId?: string) => void;
  availableGranthaIds: string[];
  /** Per-grantha target metadata (editions + default_school) for the edition-aware gate. */
  granthaById: Record<string, ReferenceTargetMeta>;
  granthaIdToTitle: Record<string, string>;
  /**
   * Controls the visual presentation of this citation.
   *
   * - `"inline"` (default): renders the citation display_text as a link, the
   *   existing behaviour.
   * - `"footnote-marker"`: renders a `<sup>[n]</sup>` superscript in place of
   *   the citation text; all hover/focus/touch logic is unchanged.
   * - `"footnote-entry"`: renders `[n] display_text` as a footnote list row;
   *   same hover/focus/touch machinery.
   */
  displayMode?: "inline" | "footnote-marker" | "footnote-entry";
  /** Required when `displayMode` is `"footnote-marker"` or `"footnote-entry"`. */
  footnoteNumber?: number;
}

const HOVER_OPEN_DELAY_MS = 150;

/**
 * Renders a structured cross-text citation (producer-emitted `references[]`).
 *
 * Unresolved references (undefined abbreviation: `grantha_id` null /
 * `unresolved` true) render as plain unlinked text. References to works not in
 * the library render as a link whose activation explains "not yet available".
 * References to works in the library open a floating citation popover: hover
 * peeks after a short delay; click/tap/Enter/Space pins it.
 */
const ReferenceLink: React.FC<ReferenceLinkProps> = ({
  reference,
  currentGranthaId,
  editionId,
  sourcePassageRef,
  sourceLookback,
  sourceWindowStart,
  updateHash,
  availableGranthaIds,
  granthaById,
  granthaIdToTitle,
  displayMode = "inline",
  footnoteNumber,
}) => {
  const { openCitation, closeCitation, citation, mode, scheduleClose, cancelClose } = useCitationPanel();
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const hoverOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True when the popover's current pin came from a FOCUS event (mouse
  // mousedown or keyboard Tab). A real mouse click that immediately follows
  // focus must "consume" the pin (stay pinned, don't navigate) — otherwise
  // the very first click after hovering would navigate.
  const focusedPinRef = useRef(false);

  const targetTitle = reference.grantha_id
    ? granthaIdToTitle[reference.grantha_id] || reference.display_text
    : reference.display_text;   // unresolved (no id): fall back to the citation text
  const locatorLabel = reference.locator
    ? toDevanagariNumerals(reference.locator)
    : "";   // whole-work reference: the title alone identifies it
  const renderPlain = !reference.grantha_id || reference.unresolved;
  // The edition-aware gate: linkable iff the concrete (grantha, edition) is on
  // disk, or the edition-less target's default is attribution-safe.
  const linkable =
    reference.grantha_id != null &&
    isReferenceLinkable(reference, granthaById);

  // Emit a runtime diagnostic (dev-gated) when a click fails to resolve —
  // the triage channel for refs that render unlinked (plan §6).
  const recordDiagnostic = useCallback(
    (code: ReferenceDiagCode) => {
      if (!isDiagnosticsEnabled()) return;
      if (!reference.grantha_id) return;
      const knownInMeta = Object.prototype.hasOwnProperty.call(
        granthaIdToTitle,
        reference.grantha_id,
      );
      // Near-match hint for REF-NOT-IN-LIBRARY: closest on-disk id by
      // Levenshtein distance.
      let nearMatchId: string | undefined;
      if (code === "REF-NOT-IN-LIBRARY") {
        let best: string | undefined;
        let bestDist = Infinity;
        for (const id of availableGranthaIds) {
          const d = levenshtein(reference.grantha_id, id);
          if (d < bestDist) {
            bestDist = d;
            best = id;
          }
        }
        if (best && bestDist <= 3) nearMatchId = best;
      }
      addReferenceDiagnostic(
        buildDiagnostic({
          reference,
          sourceGranthaId: currentGranthaId,
          sourcePassageRef,
          editionId,
          code,
          availableGranthaIds,
          knownInMeta,
          nearMatchId,
        }),
      );
    },
    [reference, currentGranthaId, sourcePassageRef, editionId, availableGranthaIds, granthaIdToTitle],
  );

  // Load the target and resolve the locator to a concrete ref. Shared by
  // navigation (then updateHash) and by copy (to build the citation).
  const resolveRef = useCallback(async (): Promise<string | null> => {
    if (!reference.grantha_id) return null;
    try {
      const target = await loadGrantha(
        reference.grantha_id,
        reference.edition_id ?? undefined,
      );
      const resolution = resolveReferenceTarget(target, reference.locator);
      if (resolution.kind === "passage" || resolution.kind === "root") {
        return resolution.ref;
      }
      recordDiagnostic(resolution.code);
      return null;
    } catch {
      return null;
    }
  }, [reference, recordDiagnostic]);

  const navigate = useCallback(async (): Promise<boolean> => {
    const ref = await resolveRef();
    if (!ref || !reference.grantha_id) return false;
    updateHash(
      reference.grantha_id,
      ref,
      reference.grantha_id === currentGranthaId
        ? editionId
        : reference.edition_id ?? undefined,
    );
    return true;
  }, [reference, currentGranthaId, editionId, updateHash, resolveRef]);

  const buildRequest = useCallback(
    (): Parameters<typeof openCitation>[0] | null => {
      if (!reference.grantha_id) return null;
      // The fully-formed quote visible in the lookback window, mapped to
      // absolute offsets in the source passage — the steel-blue source
      // highlight shown while the popover is open. Prefer the build-time
      // `reference.quote` span (exact); fall back to the enclosed-quote scan
      // of the runtime lookback window.
      let sourceSpan: { start: number; end: number } | null = null;
      if (reference.quote) {
        sourceSpan = { start: reference.quote.start, end: reference.quote.end };
      } else if (sourceLookback && sourceWindowStart !== undefined) {
        const quoted = extractEnclosedQuote(sourceLookback);
        if (quoted !== null) {
          sourceSpan = {
            start: sourceWindowStart + quoted.start,
            end: sourceWindowStart + quoted.end,
          };
        }
      }
      return {
        reference,
        targetTitle,
        locatorLabel,
        linkable,
        availableGranthaIds,
        navigate,
        resolveRef,
        sourceLookback,
        sourceWindowStart,
        sourcePassageRef,
        sourceSpan,
      };
    },
    [reference, targetTitle, locatorLabel, linkable, availableGranthaIds, navigate, resolveRef, sourceLookback, sourceWindowStart, sourcePassageRef],
  );

  const clearHoverOpen = useCallback(() => {
    if (hoverOpenTimer.current !== null) {
      clearTimeout(hoverOpenTimer.current);
      hoverOpenTimer.current = null;
    }
  }, []);

  const handleMouseEnter = () => {
    cancelClose();
    clearHoverOpen();
    const request = buildRequest();
    const el = anchorRef.current;
    if (!request || !el) return;
    hoverOpenTimer.current = setTimeout(() => {
      hoverOpenTimer.current = null;
      openCitation(request, el, "peek");
    }, HOVER_OPEN_DELAY_MS);
  };

  const handleMouseLeave = () => {
    clearHoverOpen();
    scheduleClose();
  };

  // Desktop has a hover pointer: hover peeks, and the FIRST click follows the
  // link (navigates). Touch/coarse pointers have no hover, so the first tap
  // pins and a second tap navigates.
  const isFinePointer = useMediaQuery("(hover: hover) and (pointer: fine)");

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const request = buildRequest();
    const el = anchorRef.current;
    if (!request || !el) return;
    if (!linkable) {
      // Not-in-library: no destination — clicking opens the info popover.
      recordDiagnostic("REF-NOT-IN-LIBRARY");
      clearHoverOpen();
      openCitation(request, el, "pinned");
      return;
    }
    if (isFinePointer) {
      // Desktop: hover already peeked the preview, so a click navigates to the
      // cited passage (close any open popover first).
      clearHoverOpen();
      closeCitation();
      void navigate();
      return;
    }
    const sameOpen =
      citation &&
      citation.reference.grantha_id === reference.grantha_id &&
      citation.reference.locator === reference.locator &&
      citation.reference.start === reference.start;
    if (sameOpen && mode === "pinned") {
      if (focusedPinRef.current) {
        // This is the first tap after a focus-pin (mouse mousedown or Tab):
        // consume the pin so the tap pins instead of navigating.
        focusedPinRef.current = false;
        return;
      }
      // A genuine second tap while pinned → navigate to the cited passage.
      closeCitation();
      void navigate();
      return;
    }
    clearHoverOpen();
    focusedPinRef.current = false;
    openCitation(request, el, "pinned");
  };

  const handleFocus = () => {
    const request = buildRequest();
    const el = anchorRef.current;
    if (!request || !el) return;
    clearHoverOpen();
    focusedPinRef.current = true;
    openCitation(request, el, "pinned");
  };

  // Clean up the hover-open timer on unmount.
  React.useEffect(() => {
    return () => clearHoverOpen();
  }, [clearHoverOpen]);

  // --- Footnote modes ---

  if (displayMode === "footnote-marker") {
    const numDisplay = `[${toDevanagariNumerals(String(footnoteNumber ?? 1))}]`;
    if (renderPlain) {
      // Unresolved: muted static superscript — no hover or navigation.
      return (
        <sup className="text-xs text-gray-400 font-mono ml-px select-none">
          {numDisplay}
        </sup>
      );
    }
    return (
      <sup>
        <a
          ref={anchorRef}
          href={`#${reference.grantha_id}:${reference.locator ?? "1"}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocus={handleFocus}
          onClick={handleClick}
          className="text-xs text-blue-600 font-mono ml-px cursor-pointer no-underline hover:underline"
        >
          {numDisplay}
        </a>
      </sup>
    );
  }

  if (displayMode === "footnote-entry") {
    const numDisplay = `[${toDevanagariNumerals(String(footnoteNumber ?? 1))}]`;
    const numPrefix = (
      <span className="font-mono text-gray-400 mr-2 select-none">{numDisplay}</span>
    );
    if (renderPlain) {
      // Unresolved abbreviation: plain text, no link — slightly muted so it
      // doesn't compete with the main passage text above it.
      return (
        <>
          {numPrefix}
          <span className="text-gray-500">{reference.display_text}</span>
        </>
      );
    }
    return (
      <>
        {numPrefix}
        <a
          ref={anchorRef}
          href={`#${reference.grantha_id}:${reference.locator ?? "1"}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocus={handleFocus}
          onClick={handleClick}
          className={
            linkable
              ? "text-blue-500 hover:underline cursor-pointer"
              : "text-gray-500 cursor-pointer"
          }
        >
          {reference.display_text}
        </a>
      </>
    );
  }

  // --- Default: inline mode ---

  // Unresolved references (undefined abbreviation / build error) render as
  // plain text — never a link.
  if (renderPlain) {
    return <span className="reference-unresolved">{reference.display_text}</span>;
  }

  const linkClassName = `reference-link ${!linkable ? 'external-reference' : ''}`;

  return (
    <a
      ref={anchorRef}
      href={`#${reference.grantha_id}:${reference.locator ?? "1"}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onClick={handleClick}
      className={linkClassName}
    >
      {reference.display_text}
    </a>
  );
};

export default ReferenceLink;

/** Classic Wagner–Fischer Levenshtein distance (for near-match id hints). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    prev = curr;
  }
  return prev[n];
}
