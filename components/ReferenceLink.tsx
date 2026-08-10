'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Reference, isReferenceInLibrary, getPassagePreview } from '../lib/references';

interface ReferenceLinkProps {
  reference: Reference;
  currentGranthaId: string;
  /** Active edition to preserve on same-grantha reference jumps. */
  editionId?: string;
  updateHash: (granthaId: string, verseRef: string, editionId?: string) => void;
  availableGranthaIds: string[];
  granthaIdToTitle: Record<string, string>;
}

const HOVER_DELAY_MS = 400;
const TOOLTIP_ESTIMATED_WIDTH = 200;
const TOOLTIP_ESTIMATED_HEIGHT = 40;
const TOOLTIP_VIEWPORT_PADDING = 10;

const ReferenceLink: React.FC<ReferenceLinkProps> = ({ reference, currentGranthaId, editionId, updateHash, availableGranthaIds, granthaIdToTitle }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipContent, setTooltipContent] = useState<React.ReactNode>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const linkRef = useRef<HTMLAnchorElement>(null);
  const isTouchDevice = useRef(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isInLibrary = isReferenceInLibrary(reference.granthaId, availableGranthaIds);

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

  const updateTooltipPosition = () => {
    if (!linkRef.current) return;

    const rect = linkRef.current.getBoundingClientRect();
    let top = rect.top - 10;
    let left = rect.left + rect.width / 2;

    // Clamp horizontally to keep tooltip within viewport
    const leftBound = TOOLTIP_ESTIMATED_WIDTH / 2 + TOOLTIP_VIEWPORT_PADDING;
    const rightBound = window.innerWidth - TOOLTIP_ESTIMATED_WIDTH / 2 - TOOLTIP_VIEWPORT_PADDING;
    left = Math.max(leftBound, Math.min(left, rightBound));

    // If tooltip would clip the top edge, push it down enough to stay visible
    if (top - TOOLTIP_ESTIMATED_HEIGHT < TOOLTIP_VIEWPORT_PADDING) {
      top = TOOLTIP_VIEWPORT_PADDING + TOOLTIP_ESTIMATED_HEIGHT;
    }

    setTooltipPosition({ top, left });
  };

  const loadTooltipContent = async () => {
    if (isInLibrary) {
      const passageText = await getPassagePreview(reference.granthaId, reference.path, availableGranthaIds);
      const title = granthaIdToTitle[reference.granthaId] || reference.granthaId;
      setTooltipContent(
        <div className="text-center">
          <p className="font-semibold">{`${title} ${reference.path}`}</p>
          {passageText && <p className="mt-2">{passageText}</p>}
        </div>
      );
    } else {
      const title = granthaIdToTitle[reference.granthaId] || reference.granthaId;
      setTooltipContent(
        <div className="text-center">
          <p className="font-semibold">{`${title} ${reference.path}`}</p>
          <p className="mt-1 text-gray-400 italic">not yet available</p>
        </div>
      );
    }
  };

  const hideTooltip = () => {
    setShowTooltip(false);
    setTooltipContent(null);
  };

  const handleMouseEnter = () => {
    if (isTouchDevice.current) return;

    hoverTimeout.current = setTimeout(async () => {
      updateTooltipPosition();
      setShowTooltip(true);
      try {
        await loadTooltipContent();
      } catch {
        setTooltipContent(<span className="text-red-500">Failed to load</span>);
      }
    }, HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    if (isTouchDevice.current) return;

    if (hoverTimeout.current !== null) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
    hideTooltip();
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isInLibrary) {
      // Internal reference: navigate (synchronous). Same-grantha refs preserve
      // the active edition (the reader stays in the same commentary); cross-
      // grantha refs must not carry it — the target has its own editions.
      updateHash(
        reference.granthaId,
        reference.path,
        reference.granthaId === currentGranthaId ? editionId : undefined,
      );
    } else {
      // Not yet in corpus: toggle "not yet available" tooltip on any device
      if (showTooltip) {
        hideTooltip();
      } else {
        updateTooltipPosition();
        setShowTooltip(true);
        try {
          await loadTooltipContent();
        } catch {
          setTooltipContent(<span className="text-red-500">Failed to load</span>);
        }
      }
    }
  };

  // Close tooltip when clicking outside (touch devices)
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
  }, [showTooltip]);

  const linkClassName = `reference-link ${!isInLibrary ? 'external-reference' : ''}`;

  return (
    <span className="reference-container">
      <a
        ref={linkRef}
        href={`#${reference.granthaId}:${reference.path}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className={linkClassName}
      >
        {reference.displayText}
      </a>
      {showTooltip && ReactDOM.createPortal(
        <div
          className="reference-tooltip"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translate(-50%, -100%)',
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
