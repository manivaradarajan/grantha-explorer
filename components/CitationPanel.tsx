"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { getPassagePreview } from "@/lib/references";
import { findQuotedSpan } from "@/lib/quotedMatch";
import { formatCitation } from "@/lib/citation";
import { buildHash } from "@/lib/hashUtils";
import type { Reference } from "@/lib/data";

/**
 * Reusable floating citation preview popover ("Look Up" style).
 *
 * Clicking/tapping (or hovering, then clicking) a reference marker opens a
 * compact popover anchored to the marker's on-screen rectangle — never the
 * mouse coordinates, never a fixed screen location. There is exactly one
 * popover; activating another reference updates it in place.
 *
 * Two interaction states, identical content:
 *   - peek:   pointer hover opens after a short delay; closing is deferred by
 *             a grace period so the cursor can move reference → popover →
 *             action without the popover vanishing.
 *   - pinned: click / tap / Enter / Space. Stays until ✕, Escape (restores
 *             focus to the originating reference), an outside activation,
 *             another reference, or a scroll of the reading surface.
 *
 * The popover is portaled to `document.body` and `position: fixed`, so it is
 * never clipped by a scroll container and never participates in its layout.
 * Positioning is computed against the anchor's bounding rect with a clean
 * below/above preference and an explicit `forced-*` state; a pointer tail is
 * shown only in clean placements and aimed at the reference's center.
 */

/** A quote highlighted in the source passage while its citation is open. */
export interface SourceHighlight {
  /** The source passage ref that contains the quoted span. */
  passageRef: string;
  /** Absolute half-open span in the passage's raw text (delimiters included). */
  span: { start: number; end: number };
}

type PopoverMode = "peek" | "pinned";
type Placement = "below" | "above" | "forced-below" | "forced-above";

const HOVER_CLOSE_GRACE_MS = 250;
const COPY_CONFIRM_MS = 1600;
const POPOVER_GAP = 8;

interface CitationRequest {
  reference: Reference;
  targetTitle: string;
  locatorLabel: string;
  linkable: boolean;
  availableGranthaIds: string[];
  /** Navigate to the cited passage; resolves false when the locator fails. */
  navigate: () => Promise<boolean>;
  /** Resolve the locator to a concrete verse ref (shared by navigate + copy). */
  resolveRef: () => Promise<string | null>;
  /** Source text before the citation, for the fuzzy quote highlight. */
  sourceLookback?: string;
  /** Absolute offset of `sourceLookback` within the source passage. */
  sourceWindowStart?: number;
  /** The source passage containing this citation. */
  sourcePassageRef: string;
  /** Absolute span of the quoted text in the source passage, or null. */
  sourceSpan: { start: number; end: number } | null;
}

interface CitationContextValue {
  openCitation: (request: CitationRequest, anchorEl: HTMLElement, mode: PopoverMode) => void;
  closeCitation: () => void;
  /** Schedule a deferred close (hover close-grace); cancel cancels it. */
  scheduleClose: () => void;
  cancelClose: () => void;
  citation: CitationRequest | null;
  mode: PopoverMode;
  anchorEl: HTMLElement | null;
  setSourceSpan: (span: { start: number; end: number } | null) => void;
}

const CitationContext = createContext<CitationContextValue | null>(null);

/** Access the citation popover controller; must be inside a `CitationPanelHost`. */
export const useCitationPanel = (): CitationContextValue => {
  const ctx = useContext(CitationContext);
  if (!ctx) {
    throw new Error("useCitationPanel must be used within a CitationPanelHost");
  }
  return ctx;
};

/** Monotonic id so a slow earlier fetch can never overwrite a newer citation. */
let citationRequestSeq = 0;

/** Whether two requests refer to the same underlying reference (for
 *  update-in-place without a refetch on click-after-hover). */
const sameRequest = (a: CitationRequest, b: CitationRequest): boolean =>
  a.reference.grantha_id === b.reference.grantha_id &&
  a.reference.locator === b.reference.locator &&
  a.reference.start === b.reference.start;

interface CitationPanelHostProps {
  /** The scroll container's parent wrapper; this component renders it. Pass a
   *  function to receive the active citation's source highlight (null when no
   *  popover is open) — the reading surface marks the quoted span in the
   *  source text while the popover is up. */
  children: React.ReactNode | ((sourceHighlight: SourceHighlight | null) => React.ReactNode);
  className?: string;
  /** Surface identity: when it changes, the open citation is closed. */
  surfaceKey: string;
}

/**
 * Provider + wrapper for the shared citation popover.
 *
 * Holds the single-popover state and feeds the reading surface a render-prop
 * carrying the active source highlight. The popover itself is portaled to
 * `document.body`, so the wrapper only needs to keep the context reachable.
 */
export const CitationPanelHost: React.FC<CitationPanelHostProps> = ({
  children,
  className,
  surfaceKey,
}) => {
  const [citation, setCitation] = useState<CitationRequest | null>(null);
  const [mode, setMode] = useState<PopoverMode>("peek");
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [fuzzySpan, setFuzzySpan] = useState<{ start: number; end: number } | null>(null);
  const citationRef = useRef<CitationRequest | null>(null);
  const closeTimer = useRef<number | null>(null);

  const openCitation = useCallback(
    (request: CitationRequest, el: HTMLElement, m: PopoverMode) => {
      setFuzzySpan(null);
      setAnchorEl(el);
      if (citationRef.current && sameRequest(citationRef.current, request)) {
        // Same reference: keep the already-loaded content; pinned wins.
        if (m === "pinned") {
          setMode("pinned");
        }
        return;
      }
      citationRef.current = request;
      setCitation(request);
      setMode(m);
    },
    [],
  );

  const closeCitation = useCallback(() => {
    citationRequestSeq++;
    citationRef.current = null;
    setCitation(null);
    setMode("peek");
    setAnchorEl(null);
    setFuzzySpan(null);
  }, []);

  const scheduleClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
    }
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      closeCitation();
    }, HOVER_CLOSE_GRACE_MS);
  }, [closeCitation]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // Clear pending close timer on unmount.
  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) {
        clearTimeout(closeTimer.current);
      }
    };
  }, []);

  const setSourceSpan = useCallback((span: { start: number; end: number } | null) => {
    setFuzzySpan(span);
  }, []);

  // Invalidate the open citation when the surface's content changes (grantha
  // or verse), so a stale citation never lingers over new content.
  useEffect(() => {
    closeCitation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceKey]);

  // Memoized on the citation + fuzzy span so its identity is stable while the
  // popover is open — consumers (render-prop children) use it in memoized
  // callbacks. The exact-quote span travels with the request; the fuzzy span
  // arrives when the preview loads.
  const sourceHighlight: SourceHighlight | null = useMemo(() => {
    if (!citation) {
      return null;
    }
    const span = citation.sourceSpan ?? fuzzySpan;
    return span ? { passageRef: citation.sourcePassageRef, span } : null;
  }, [citation, fuzzySpan]);

  return (
    <CitationContext.Provider
      value={{
        openCitation,
        closeCitation,
        scheduleClose,
        cancelClose,
        citation,
        mode,
        anchorEl,
        setSourceSpan,
      }}
    >
      <div className={className}>
        {typeof children === "function" ? children(sourceHighlight) : children}
        <CitationPopover />
      </div>
    </CitationContext.Provider>
  );
};

/** The floating popover. Renders nothing (portaled) when no citation is open. */
const CitationPopover: React.FC = () => {
  const { citation, mode, anchorEl, closeCitation, scheduleClose, cancelClose, setSourceSpan } = useCitationPanel();
  const [passage, setPassage] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{ start: number; end: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [placement, setPlacement] = useState<Placement>("below");
  const [position, setPosition] = useState({ top: 0, left: 0, tailLeft: 0 });
  const latestRequestRef = useRef(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | null>(null);

  // Load the passage for the current citation (latest-wins). Mode changes
  // (peek → pinned) reuse the same citation object, so they never refetch.
  useEffect(() => {
    if (!citation) {
      setPassage(null);
      setStatus(null);
      setHighlight(null);
      return;
    }
    const requestId = ++citationRequestSeq;
    latestRequestRef.current = requestId;
    setPassage(null);
    setStatus(null);
    setHighlight(null);

    const load = async (): Promise<void> => {
      if (!citation.reference.grantha_id) {
        return;
      }
      if (!citation.linkable) {
        // Not available in the library: nothing to preview or navigate to —
        // the header alone identifies the reference (no status line, no
        // buttons, no destination).
        return;
      }
      let text: string | null = null;
      try {
        text = await getPassagePreview(
          citation.reference.grantha_id,
          citation.reference,
          citation.availableGranthaIds,
        );
      } catch {
        text = null;
      }
      if (requestId !== latestRequestRef.current) {
        return; // a newer citation superseded this one
      }
      if (
        !text ||
        text === "Reference not available in this library." ||
        text === "Error fetching preview."
      ) {
        setStatus("no preview");
        return;
      }
      setPassage(text);
      const span = citation.sourceLookback
        ? findQuotedSpan(citation.sourceLookback, text)
        : null;
      setHighlight(span);
      // No exact quote in the window (plain quoted phrase, no delimiters) —
      // the fuzzy match's window-side span locates the quote in the source
      // passage; push it so the reading surface can mark it too.
      if (
        span !== null &&
        citation.sourceSpan === null &&
        citation.sourceWindowStart !== undefined
      ) {
        setSourceSpan({
          start: citation.sourceWindowStart + span.sourceStart,
          end: citation.sourceWindowStart + span.sourceEnd,
        });
      }
    };
    void load();
  }, [citation, setSourceSpan]);

  // Scroll of the reading surface dismisses the popover (ephemeral — scrolling
  // means the reading context changed). Capture phase catches scrolls in any
  // nested container, including the popover's own (it has none).
  //
  // Focus-induced scrolls (browsers scroll the focused anchor into view on
  // mousedown) fire in the same instant the popover opens — so dismiss is
  // suppressed during a short "settle" window after opening; only a genuine
  // later scroll (the user's reading context changing) closes it.
  const openSettleMs = 350;
  const openAtRef = useRef(0);
  useEffect(() => {
    if (!citation) return;
    openAtRef.current = Date.now();
    const onScroll = (): void => {
      if (Date.now() - openAtRef.current < openSettleMs) return;
      closeCitation();
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [citation, closeCitation]);

  // Reposition whenever the popover is open: on open, on size changes (content
  // arrival, font loading, reading-scale), and on viewport resize/orientation.
  useLayoutEffect(() => {
    if (!citation || !anchorEl || !popoverRef.current) return;

    const popover = popoverRef.current;
    const compute = (): void => {
      const rect = anchorEl.getBoundingClientRect();
      const style = getComputedStyle(popover);
      const margin =
        parseFloat(style.getPropertyValue("--citation-viewport-margin")) || 12;
      const popWidth = popover.offsetWidth;
      const popHeight = popover.offsetHeight;
      if (popWidth === 0 || popHeight === 0) return;

      const belowSpace = window.innerHeight - rect.bottom;
      const aboveSpace = rect.top;
      let p: Placement;
      let top: number;
      if (belowSpace >= popHeight + POPOVER_GAP) {
        p = "below";
        top = rect.bottom + POPOVER_GAP;
      } else if (aboveSpace >= popHeight + POPOVER_GAP) {
        p = "above";
        top = rect.top - popHeight - POPOVER_GAP;
      } else if (belowSpace >= aboveSpace) {
        p = "forced-below";
        top = Math.min(rect.bottom + POPOVER_GAP, window.innerHeight - popHeight - margin);
      } else {
        p = "forced-above";
        top = Math.max(rect.top - popHeight - POPOVER_GAP, margin);
      }
      const left = Math.max(
        margin,
        Math.min(rect.left + rect.width / 2 - popWidth / 2, window.innerWidth - popWidth - margin),
      );
      const anchorCenterX = rect.left + rect.width / 2;
      setPosition({ top, left, tailLeft: anchorCenterX - left });
      setPlacement(p);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(popover);
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, [citation, anchorEl, passage, status]);

  // Escape closes the popover. Restore focus to the originating reference only
  // for a PINNED popover (the keyboard path) — restoring focus on a hover-peek
  // would re-fire the anchor's onFocus and immediately re-pin it.
  useEffect(() => {
    if (!citation) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        closeCitation();
        if (mode === "pinned") {
          anchorEl?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
      }
    };
  }, [citation, closeCitation, anchorEl, mode]);

  if (!citation) {
    return null;
  }

  const { targetTitle, locatorLabel } = citation;

  // The quoted span must stay visible: when a highlight exists, don't clamp
  // (a verse is short; §10.1 prefers preserving the meaningful phrase over a
  // rigid line cap). Otherwise clamp to --citation-clamp-lines.
  const clamp = highlight ? undefined : "citation-excerpt-clamp";

  const renderPassage = (): React.ReactNode => {
    if (status) {
      return <p className="citation-excerpt text-gray-400">{status}</p>;
    }
    if (passage === null) {
      return <p className="citation-excerpt text-gray-400">loading…</p>;
    }
    if (highlight) {
      return (
        <p className={`citation-excerpt ${clamp ?? ""}`}>
          {passage.slice(0, highlight.start)}
          <mark className="citation-mark">{passage.slice(highlight.start, highlight.end)}</mark>
          {passage.slice(highlight.end)}
        </p>
      );
    }
    return <p className={`citation-excerpt ${clamp ?? ""}`}>{passage}</p>;
  };

  const doCopy = async (): Promise<void> => {
    if (!citation) return;
    const ref = await citation.resolveRef();
    if (!ref || !citation.reference.grantha_id) return;
    const url = `${window.location.origin}${window.location.pathname}#${buildHash(
      {
        granthaId: citation.reference.grantha_id,
        verseRef: ref,
        editionId: citation.reference.edition_id ?? undefined,
        mode: "flow",
      },
      true,
    )}`;
    const text = formatCitation({
      commentators: [],
      granthaTitle: targetTitle,
      verseRef: ref,
      url,
    });
    void navigator.clipboard
      .writeText(text)
      .catch(() => {
        // Clipboard access can be denied (permissions/headless); the inline
        // confirmation still shows so the user can copy manually.
      })
      .finally(() => {
        if (copyTimer.current !== null) {
          window.clearTimeout(copyTimer.current);
        }
        setCopied(true);
        copyTimer.current = window.setTimeout(() => setCopied(false), COPY_CONFIRM_MS);
      });
  };

  const tailVisible = placement === "below" || placement === "above";

  return createPortal(
    <div
      ref={popoverRef}
      className={`citation-popover ${placement}`}
      style={{ top: position.top, left: position.left }}
      role="region"
      aria-label={`Citation: ${targetTitle} ${locatorLabel}`}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      {tailVisible && (
        <span
          className="citation-tail"
          style={{ left: position.tailLeft }}
          aria-hidden="true"
        />
      )}
      <div className="citation-header">
        {citation.linkable ? (
          <button
            type="button"
            className="citation-title-action"
            onClick={() => {
              void citation.navigate();
            }}
          >
            <span className="citation-title">{targetTitle}</span>
            {locatorLabel && <span className="citation-locator">{locatorLabel}</span>}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="citation-title-icon"
              aria-hidden="true"
            >
              <path d="M7 7h10v10" />
              <path d="M7 17 17 7" />
            </svg>
          </button>
        ) : (
          // Not available in the library: the title is informational, not a
          // destination — no button, no hover highlight, no open arrow.
          <span className="citation-title citation-title-static">
            {targetTitle}
            {locatorLabel && <span className="citation-locator">{locatorLabel}</span>}
          </span>
        )}
        {mode === "pinned" && (
          <button
            type="button"
            className="citation-close"
            onClick={closeCitation}
            aria-label="Close citation"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="citation-close-icon"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="citation-body">{renderPassage()}</div>
      {citation.linkable && (
        <div className="citation-footer">
          <button type="button" className="citation-action" onClick={() => void doCopy()}>
            {copied ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="citation-action-icon"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="citation-action-icon"
                aria-hidden="true"
              >
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            )}
            <span>प्रतिलिपि</span>
          </button>
          <button
            type="button"
            className="citation-action citation-action-open"
            onClick={() => {
              void citation.navigate();
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="citation-action-icon"
              aria-hidden="true"
            >
              <path d="M7 7h10v10" />
              <path d="M7 17 17 7" />
            </svg>
            <span>अनुसर</span>
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
};
