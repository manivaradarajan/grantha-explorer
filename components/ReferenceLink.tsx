'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { loadGrantha } from '../lib/data';
import {
  getPassagePreview,
  isReferenceLinkable,
  resolveReferenceTarget,
  type ReferenceTargetMeta,
} from '../lib/references';
import { toDevanagariNumerals } from '../lib/stringUtils';
import { findQuotedSpan } from '../lib/quotedMatch';
import {
  addReferenceDiagnostic,
  buildDiagnostic,
  isDiagnosticsEnabled,
  type ReferenceDiagCode,
} from '../lib/referenceDiagnostics';
import type { Reference } from '../lib/data';

interface ReferenceLinkProps {
  reference: Reference;
  currentGranthaId: string;
  /** Active edition to preserve on same-grantha reference jumps. */
  editionId?: string;
  /** The commentary passage ref containing this citation (for diagnostics). */
  sourcePassageRef: string;
  /** Source text immediately before the citation; fuzzy-matched against the
   *  preview so the tooltip can highlight the quoted span. */
  sourceLookback?: string;
  updateHash: (granthaId: string, verseRef: string, editionId?: string) => void;
  availableGranthaIds: string[];
  /** Per-grantha target metadata (editions + default_school) for the edition-aware gate. */
  granthaById: Record<string, ReferenceTargetMeta>;
  granthaIdToTitle: Record<string, string>;
}

const HOVER_DELAY_MS = 400;
const TOOLTIP_VIEWPORT_PADDING = 10;
const TOOLTIP_GAP = 8;

/**
 * Renders a structured cross-text citation (producer-emitted `references[]`).
 *
 * Unresolved references (undefined abbreviation: `grantha_id` null /
 * `unresolved` true) render as plain unlinked text. References to works not in
 * the library render as a link whose hover/click explains "not yet available".
 * References to works in the library resolve on hover/click against the loaded
 * target (plan §5): exact leaf, section, whole-work root, or a runtime
 * diagnostic. Same-grantha references preserve the active edition.
 */
const ReferenceLink: React.FC<ReferenceLinkProps> = ({ reference, currentGranthaId, editionId, sourcePassageRef, sourceLookback, updateHash, availableGranthaIds, granthaById, granthaIdToTitle }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipReady, setTooltipReady] = useState(false);
  const [tooltipContent, setTooltipContent] = useState<React.ReactNode>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [tooltipScale, setTooltipScale] = useState("1");
  const linkRef = useRef<HTMLAnchorElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isTouchDevice = useRef(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // First tap on touch previews; a second tap navigates (or dismisses for
  // not-in-library refs). Reset on blur/leave/outside-click.
  const previewedRef = useRef(false);

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

  // Detect if device supports touch
  useEffect(() => {
    isTouchDevice.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }, []);

  // Clear pending hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeout.current !== null) {
        clearTimeout(hoverTimeout.current);
      }
    };
  }, []);

  // Shared tooltip surface: chrome (meta/status) split from the passage so the
  // passage renders in the reading face (Tiro) and the chrome in the UI sans.
  const renderTooltip = useCallback(
    (body: React.ReactNode, status?: React.ReactNode): React.ReactNode => (
      <>
        <div className="tooltip-meta">
          <span className="tooltip-title">{targetTitle}</span>
          {locatorLabel && <span className="tooltip-locator">{locatorLabel}</span>}
        </div>
        {status ?? body}
      </>
    ),
    [targetTitle, locatorLabel],
  );

  const hideTooltip = useCallback(() => {
    if (hoverTimeout.current !== null) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
    previewedRef.current = false;
    setTooltipReady(false);
    setShowTooltip(false);
    setTooltipContent(null);
  }, []);

  // Close tooltip when clicking outside (touch devices). Resets the
  // first-tap-preview state so the next tap previews again.
  useEffect(() => {
    if (!isTouchDevice.current || !showTooltip) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) {
        hideTooltip();
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showTooltip, hideTooltip]);

  const loadTooltipContent = useCallback(async () => {
    if (renderPlain) {
      // Unresolved reference: just show who/what it points at — the work name
      // and location in the tooltip header. No status line.
      setTooltipContent(renderTooltip(null));
      return;
    }
    if (!reference.grantha_id) return;
    if (!linkable) {
      // Not linkable (not in library, or absent edition / school-flavored
      // default without an edition): show the work + location, no "not yet
      // available" line.
      setTooltipContent(renderTooltip(null));
      return;
    }
    const passageText = await getPassagePreview(
      reference.grantha_id,
      reference,
      availableGranthaIds,
    );
    let body: React.ReactNode = (
      <p className="tooltip-passage text-gray-400">no preview</p>
    );
    if (passageText && passageText !== "Reference not available in this library.") {
      const span = sourceLookback
        ? findQuotedSpan(sourceLookback, passageText)
        : null;
      body = span ? (
        <p className="tooltip-passage">
          {passageText.slice(0, span.start)}
          <mark className="reference-tooltip-mark">
            {passageText.slice(span.start, span.end)}
          </mark>
          {passageText.slice(span.end)}
        </p>
      ) : (
        <p className="tooltip-passage">{passageText}</p>
      );
    }
    setTooltipContent(renderTooltip(body));
  }, [reference, renderPlain, linkable, availableGranthaIds, renderTooltip, sourceLookback]);

  // Load content FIRST, then show: the card only ever appears fully measured
  // (opacity 0 until the layout effect positions it), eliminating the flicker.
  const openTooltip = useCallback(async () => {
    if (hoverTimeout.current !== null) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
    setTooltipReady(false);
    // Propagate the flow reader's अ+/अ− scale to the portal so the preview
    // passage matches the reader's chosen reading size.
    const scaleEl = document.querySelector('.flow-reader');
    if (scaleEl) {
      const scale = getComputedStyle(scaleEl).getPropertyValue('--reading-scale').trim();
      if (scale) setTooltipScale(scale);
    }
    try {
      await loadTooltipContent();
    } catch {
      setTooltipContent(
        renderTooltip(null, <p className="tooltip-status text-red-500">Failed to load</p>),
      );
    }
    setShowTooltip(true);
  }, [loadTooltipContent, renderTooltip]);

  // Measure the real tooltip size once content + visibility are in place, then
  // position edge-anchored to the citation and fade in. Runs after the DOM
  // commit, so offsets are accurate on the first paint.
  useLayoutEffect(() => {
    if (!showTooltip || !tooltipContent) return;
    const tip = tooltipRef.current;
    const link = linkRef.current;
    if (!tip || !link) return;

    const rect = link.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;

    let top = rect.top - height - TOOLTIP_GAP;
    if (top < TOOLTIP_VIEWPORT_PADDING) {
      top = rect.bottom + TOOLTIP_GAP;   // flip below near the viewport top
    }
    const left = Math.max(
      TOOLTIP_VIEWPORT_PADDING,
      Math.min(rect.left, window.innerWidth - width - TOOLTIP_VIEWPORT_PADDING),
    );

    setTooltipPosition({ top, left });
    setTooltipReady(true);
  }, [showTooltip, tooltipContent]);

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

  const navigate = useCallback(async () => {
    if (!reference.grantha_id) return;
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
      } else {
        recordDiagnostic(resolution.code);
        const message =
          resolution.code === "REF-RUNTIME-DEPTH-OVERFLOW"
            ? "reference has too many segments"
            : "could not resolve";
        setTooltipContent(
          renderTooltip(null, <p className="tooltip-status text-amber-600">{message}</p>),
        );
        setShowTooltip(true);
      }
    } catch {
      setTooltipContent(
        renderTooltip(null, <p className="tooltip-status text-red-500">Failed to load</p>),
      );
      setShowTooltip(true);
    }
  }, [reference, currentGranthaId, editionId, updateHash, renderTooltip, recordDiagnostic]);

  const handleMouseEnter = () => {
    if (isTouchDevice.current) return;
    hoverTimeout.current = setTimeout(() => {
      openTooltip();
    }, HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    if (isTouchDevice.current) return;
    hideTooltip();
  };

  // Keyboard users get the preview immediately (no hover delay).
  const handleFocus = () => {
    if (isTouchDevice.current) return;
    openTooltip();
  };

  const handleBlur = () => {
    hideTooltip();
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!reference.grantha_id) return;

    if (linkable) {
      if (isTouchDevice.current) {
        // First tap previews; second tap navigates.
        if (previewedRef.current) {
          previewedRef.current = false;
          navigate();
        } else {
          previewedRef.current = true;
          openTooltip();
        }
        return;
      }
      // Mouse: hover already previewed, so a click navigates directly.
      navigate();
    } else {
      // Not-in-library: clicking is the triage-worthy act — log it once.
      recordDiagnostic("REF-NOT-IN-LIBRARY");
      if (showTooltip) {
        hideTooltip();
      } else {
        previewedRef.current = true;
        openTooltip();
      }
    }
  };

  // Unresolved references (undefined abbreviation / build error) render as
  // plain text — never a link.
  if (renderPlain) {
    return <span className="reference-unresolved">{reference.display_text}</span>;
  }

  const linkClassName = `reference-link ${!linkable ? 'external-reference' : ''}`;
  const targetHash = `${reference.grantha_id}:${reference.locator ?? "1"}`;

  return (
    <span className="reference-container">
      <a
        ref={linkRef}
        href={`#${targetHash}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
        className={linkClassName}
      >
        {reference.display_text}
      </a>
      {showTooltip && ReactDOM.createPortal(
        <div
          ref={tooltipRef}
          className={`reference-tooltip ${tooltipReady ? 'is-ready' : ''}`}
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            ['--reading-scale' as string]: tooltipScale,
          }}
        >
          {tooltipContent}
        </div>,
        document.body
      )}
    </span>
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
