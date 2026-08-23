"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getPassagePreview } from "@/lib/references";
import { findQuotedSpan } from "@/lib/quotedMatch";
import type { Reference } from "@/lib/data";

/**
 * Docked, non-modal citation preview.
 *
 * Replaces the floating hover tooltip: clicking a reference marker opens a
 * panel docked to the bottom edge of the surface's own scroll container. The
 * panel is a block-level sibling of the scroll area (so its width tracks the
 * container's width structurally), collapses to zero height when closed via
 * `max-height` (never a transform), scrolls independently, and is non-modal —
 * the citing text above stays fully readable and interactive.
 *
 * `CitationPanelHost` doubles as the flex-column wrapper: it provides the
 * context to the reference links below it and renders the panel as a sibling
 * of the surface's scroll container.
 */

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
}

interface CitationContextValue {
  openCitation: (request: CitationRequest) => void;
  closeCitation: () => void;
  citation: CitationRequest | null;
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
  /** The scroll container's parent wrapper; this component renders it. */
  children: React.ReactNode;
  className?: string;
  /** Surface identity: when it changes, the open citation is closed. */
  surfaceKey: string;
  /** Open-height cap in viewport-height units (default 45). */
  heightCapVh?: number;
  /** Open-height floor so short passages still pop up to a usable size. */
  minHeightVh?: number;
  /** Max-width utility for the panel, matching the surface's reading column. */
  panelWidthClass?: string;
  /** Fired on open/close, so a parent sheet can grow to make room. */
  onExpandedChange?: (open: boolean) => void;
}

/**
 * Provider + flex-column wrapper + docked panel.
 *
 * Renders `<Provider><div className>{children}<CitationPanel/></div></Provider>` —
 * the provider is an ancestor of the links (context reachable) and the panel is
 * a block sibling of the children's scroll container (width == container).
 */
export const CitationPanelHost: React.FC<CitationPanelHostProps> = ({
  children,
  className,
  surfaceKey,
  heightCapVh = 45,
  minHeightVh = 22,
  panelWidthClass,
  onExpandedChange,
}) => {
  const [citation, setCitation] = useState<CitationRequest | null>(null);

  const openCitation = useCallback((request: CitationRequest) => {
    setCitation(request);
    onExpandedChange?.(true);
  }, [onExpandedChange]);

  const closeCitation = useCallback(() => {
    citationRequestSeq++;
    setCitation(null);
    onExpandedChange?.(false);
  }, [onExpandedChange]);

  // Invalidate the open citation when the surface's content changes (grantha
  // or verse), so a stale citation never lingers over new content.
  useEffect(() => {
    closeCitation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceKey]);

  return (
    <CitationContext.Provider value={{ openCitation, closeCitation, citation }}>
      <div className={className}>
        {children}
        <CitationPanel
          heightCapVh={heightCapVh}
          minHeightVh={minHeightVh}
          panelWidthClass={panelWidthClass}
        />
      </div>
    </CitationContext.Provider>
  );
};

interface CitationPanelProps {
  heightCapVh: number;
  minHeightVh: number;
  panelWidthClass?: string;
}

/** The docked panel. Renders nothing when no citation is open. */
const CitationPanel: React.FC<CitationPanelProps> = ({ heightCapVh, minHeightVh, panelWidthClass }) => {
  const { citation, closeCitation } = useCitationPanel();
  const [passage, setPassage] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{ start: number; end: number } | null>(null);
  const latestRequestRef = useRef(0);

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
    };
    void load();
  }, [citation]);

  useEffect(() => {
    if (!citation) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        closeCitation();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
      className={`citation-panel is-open ${panelWidthClass ?? ""}`}
      style={{
        "--citation-cap": `${heightCapVh}vh`,
        "--citation-min": `${minHeightVh}vh`,
      } as React.CSSProperties}
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
