"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getPassagePreview } from "@/lib/references";
import { findQuotedSpan } from "@/lib/quotedMatch";
import type { Reference } from "@/lib/data";

/**
 * Docked, non-modal citation preview.
 *
 * Replaces the floating hover tooltip: clicking a reference marker opens a
 * card that FLOATS over the bottom edge of the surface's own scroll
 * container (absolutely positioned against the host, which must be
 * `position: relative`), so opening it never shrinks the reading column —
 * the text keeps its full height and scrolls beneath the card. Non-modal:
 * the citing text stays readable and interactive; the card dismisses on ✕,
 * Escape, or a click outside it.
 *
 * `CitationPanelHost` doubles as the flex-column wrapper: it provides the
 * context to the reference links below it and renders the panel as an
 * absolutely positioned child of the surface's scroll-container wrapper.
 */

/** A quote highlighted in the source passage while its citation is open. */
export interface SourceHighlight {
  /** The source passage ref that contains the quoted span. */
  passageRef: string;
  /** Absolute half-open span in the passage's raw text (delimiters included). */
  span: { start: number; end: number };
}

interface CitationRequest {
  reference: Reference;
  targetTitle: string;
  locatorLabel: string;
  linkable: boolean;
  availableGranthaIds: string[];
  /** Navigate to the cited passage; resolves false when the locator fails. */
  navigate: () => Promise<boolean>;
  /** Source text before the citation, for the fuzzy quote highlight. */
  sourceLookback?: string;
  /** Absolute offset of `sourceLookback` within the source passage — lets the
   *  panel map a fuzzy match's window-side span back to the source text. */
  sourceWindowStart?: number;
  /** The source passage containing this citation. */
  sourcePassageRef: string;
  /** Absolute span of the quoted text in the source passage's raw text, for
   *  the steel-blue source highlight; null when no quote is visible. */
  sourceSpan: { start: number; end: number } | null;
}

interface CitationContextValue {
  openCitation: (request: CitationRequest) => void;
  closeCitation: () => void;
  citation: CitationRequest | null;
  /** Push the fuzzy-matched quote span (source-passage coordinates) once the
   *  preview loads — the exact-quote span travels with the request instead. */
  setSourceSpan: (span: { start: number; end: number } | null) => void;
}

const CitationContext = createContext<CitationContextValue | null>(null);

/** Access the citation panel controller; must be inside a `CitationPanelHost`. */
export const useCitationPanel = (): CitationContextValue => {
  const ctx = useContext(CitationContext);
  if (!ctx) {
    throw new Error("useCitationPanel must be used within a CitationPanelHost");
  }
  return ctx;
};

/** Monotonic id so a slow earlier fetch can never overwrite a newer citation. */
let citationRequestSeq = 0;

interface CitationPanelHostProps {
  /** The scroll container's parent wrapper; this component renders it. Pass a
   *  function to receive the active citation's source highlight (null when no
   *  card is open) — the reading surface marks the quoted span in the source
   *  text while the card is up. */
  children: React.ReactNode | ((sourceHighlight: SourceHighlight | null) => React.ReactNode);
  className?: string;
  /** Surface identity: when it changes, the open citation is closed. */
  surfaceKey: string;
  /** Fired on open/close, so a parent sheet can grow to make room. */
  onExpandedChange?: (open: boolean) => void;
}

/**
 * Provider + flex-column wrapper + floating card.
 *
 * Renders `<Provider><div className={relative}>{children}<CitationPanel/></div></Provider>` —
 * the provider is an ancestor of the links (context reachable) and the panel
 * is an absolutely positioned child pinned to the wrapper's bottom edge, so
 * the scroll container keeps its full height.
 */
export const CitationPanelHost: React.FC<CitationPanelHostProps> = ({
  children,
  className,
  surfaceKey,
  onExpandedChange,
}) => {
  const [citation, setCitation] = useState<CitationRequest | null>(null);
  const [fuzzySpan, setFuzzySpan] = useState<{ start: number; end: number } | null>(null);

  const openCitation = useCallback((request: CitationRequest) => {
    setFuzzySpan(null);
    setCitation(request);
    onExpandedChange?.(true);
  }, [onExpandedChange]);

  const closeCitation = useCallback(() => {
    citationRequestSeq++;
    setFuzzySpan(null);
    setCitation(null);
    onExpandedChange?.(false);
  }, [onExpandedChange]);

  const setSourceSpan = useCallback(
    (span: { start: number; end: number } | null) => {
      setFuzzySpan(span);
    },
    [],
  );

  // Invalidate the open citation when the surface's content changes (grantha
  // or verse), so a stale citation never lingers over new content.
  useEffect(() => {
    closeCitation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceKey]);

  // Memoized on the citation + fuzzy span so its identity is stable while the
  // card is open — consumers (render-prop children) use it in memoized
  // callbacks. The exact-quote span travels with the request; the fuzzy span
  // arrives when the preview loads.
  const sourceHighlight: SourceHighlight | null = useMemo(() => {
    if (!citation) {
      return null;
    }
    const span = citation.sourceSpan ?? fuzzySpan;
    return span
      ? { passageRef: citation.sourcePassageRef, span }
      : null;
  }, [citation, fuzzySpan]);

  return (
    <CitationContext.Provider
      value={{ openCitation, closeCitation, citation, setSourceSpan }}
    >
      <div className={className}>
        {typeof children === "function" ? children(sourceHighlight) : children}
        <CitationPanel />
      </div>
    </CitationContext.Provider>
  );
};

/** The docked panel. Renders nothing when no citation is open. */
const CitationPanel: React.FC = () => {
  const { citation, closeCitation, setSourceSpan } = useCitationPanel();
  const [passage, setPassage] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{ start: number; end: number } | null>(null);
  const latestRequestRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load the passage for the current citation (latest-wins).
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
        if (requestId === latestRequestRef.current) {
          setStatus("Reference not available in this library.");
        }
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
      if (!text || text === "Reference not available in this library." || text === "Error fetching preview.") {
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

  useEffect(() => {
    if (!citation) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        closeCitation();
      }
    };
    // Clicking anywhere outside the card dismisses it (capture phase: this
    // runs before the target's own click handler, so clicking another
    // reference replaces this citation instead of closing the replacement).
    const onDocClick = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closeCitation();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDocClick, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDocClick, true);
    };
  }, [citation, closeCitation]);

  if (!citation) {
    return null;
  }

  const { targetTitle, locatorLabel } = citation;

  const renderPassage = (): React.ReactNode => {
    if (status) {
      return <p className="citation-content-text text-gray-400">{status}</p>;
    }
    if (passage === null) {
      return <p className="citation-content-text text-gray-400">loading…</p>;
    }
    if (highlight) {
      return (
        <p className="citation-content-text">
          {passage.slice(0, highlight.start)}
          <mark className="citation-mark">{passage.slice(highlight.start, highlight.end)}</mark>
          {passage.slice(highlight.end)}
        </p>
      );
    }
    return <p className="citation-content-text">{passage}</p>;
  };

  return (
    <div
      ref={panelRef}
      className="citation-panel is-open"
      role="region"
      aria-label={`Citation: ${targetTitle} ${locatorLabel}`}
    >
      <div className="citation-header">
        <button
          type="button"
          className="citation-source"
          onClick={() => {
            void citation.navigate();
          }}
          title={`Open ${targetTitle} ${locatorLabel}`}
        >
          <span className="citation-source-title">{targetTitle}</span>
          {locatorLabel && <span className="citation-source-locator">{locatorLabel}</span>}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="citation-source-icon"
            aria-hidden="true"
          >
            <path d="M7 7h10v10" />
            <path d="M7 17 17 7" />
          </svg>
        </button>
        <button
          type="button"
          className="citation-close"
          onClick={closeCitation}
          aria-label="Close citation"
        >
          ✕
        </button>
      </div>
      <div className="citation-content">{renderPassage()}</div>
    </div>
  );
};
