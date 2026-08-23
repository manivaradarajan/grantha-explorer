'use client';

import React, { useCallback } from 'react';
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
}

/**
 * Renders a structured cross-text citation (producer-emitted `references[]`).
 *
 * Unresolved references (undefined abbreviation: `grantha_id` null /
 * `unresolved` true) render as plain unlinked text. References to works not in
 * the library render as a link whose click explains "not yet available".
 * References to works in the library open a docked citation panel on click
 * (or tap), which previews the cited passage and offers navigation.
 */
const ReferenceLink: React.FC<ReferenceLinkProps> = ({ reference, currentGranthaId, editionId, sourcePassageRef, sourceLookback, sourceWindowStart, updateHash, availableGranthaIds, granthaById, granthaIdToTitle }) => {
  const { openCitation } = useCitationPanel();

  const targetTitle = reference.grantha_id
    ? granthaIdToTitle[reference.grantha_id] || reference.grantha_id
    : reference.display_text;   // unresolved (no id): fall back to the citation text
  const locatorLabel = reference.locator
    ? toDevanagariNumerals(reference.locator)
    : "whole work";
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

  const navigate = useCallback(async (): Promise<boolean> => {
    if (!reference.grantha_id) return false;
    try {
      const target = await loadGrantha(
        reference.grantha_id,
        reference.edition_id ?? undefined,
      );
      const resolution = resolveReferenceTarget(target, reference.locator);
      if (resolution.kind === "passage" || resolution.kind === "root") {
        updateHash(
          reference.grantha_id,
          resolution.ref,
          reference.grantha_id === currentGranthaId
            ? editionId
            : reference.edition_id ?? undefined,
        );
        return true;
      }
      recordDiagnostic(resolution.code);
      return false;
    } catch {
      return false;
    }
  }, [reference, currentGranthaId, editionId, updateHash, recordDiagnostic]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!reference.grantha_id) return;

    // The fully-formed quote visible in the lookback window, mapped to
    // absolute offsets in the source passage — the steel-blue source
    // highlight shown while the card is open.
    let sourceSpan: { start: number; end: number } | null = null;
    if (sourceLookback && sourceWindowStart !== undefined) {
      const quoted = extractEnclosedQuote(sourceLookback);
      if (quoted !== null) {
        sourceSpan = {
          start: sourceWindowStart + quoted.start,
          end: sourceWindowStart + quoted.end,
        };
      }
    }

    if (linkable) {
      openCitation({
        reference,
        targetTitle,
        locatorLabel,
        linkable: true,
        availableGranthaIds,
        navigate,
        sourceLookback,
        sourceWindowStart,
        sourcePassageRef,
        sourceSpan,
      });
    } else {
      // Not-in-library: clicking is the triage-worthy act — log it once.
      recordDiagnostic("REF-NOT-IN-LIBRARY");
      openCitation({
        reference,
        targetTitle,
        locatorLabel,
        linkable: false,
        availableGranthaIds,
        navigate,
        sourceLookback,
        sourceWindowStart,
        sourcePassageRef,
        sourceSpan,
      });
    }
  };

  // Unresolved references (undefined abbreviation / build error) render as
  // plain text — never a link.
  if (renderPlain) {
    return <span className="reference-unresolved">{reference.display_text}</span>;
  }

  const linkClassName = `reference-link ${!linkable ? 'external-reference' : ''}`;

  return (
    <a
      href={`#${reference.grantha_id}:${reference.locator ?? "1"}`}
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
