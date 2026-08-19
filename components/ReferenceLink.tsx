'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { loadGrantha } from '../lib/data';
import { getPassagePreview, isReferenceInLibrary, resolveReferenceTarget } from '../lib/references';
import type { Reference } from '../lib/data';

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
const ReferenceLink: React.FC<ReferenceLinkProps> = ({ reference, currentGranthaId, editionId, updateHash, availableGranthaIds, granthaIdToTitle }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipContent, setTooltipContent] = useState<React.ReactNode>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const linkRef = useRef<HTMLAnchorElement>(null);
  const isTouchDevice = useRef(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targetTitle = reference.grantha_id
    ? granthaIdToTitle[reference.grantha_id] || reference.grantha_id
    : "";
  const locatorLabel = reference.locator ?? "whole work";
  const renderPlain = !reference.grantha_id || reference.unresolved;
  const isInLibrary =
    reference.grantha_id != null &&
    isReferenceInLibrary(reference.grantha_id, availableGranthaIds);

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

  // Close tooltip when clicking outside (touch devices). ShowTooltip is never
  // set for unresolved references, so this is a no-op for plain-text refs.
  const hideTooltip = () => {
    setShowTooltip(false);
    setTooltipContent(null);
  };
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

  // Unresolved references (undefined abbreviation / build error) render as
  // plain text — never a link.
  if (renderPlain) {
    return <span className="reference-unresolved">{reference.display_text}</span>;
  }

  const updateTooltipPosition = () => {
    if (!linkRef.current) return;

    const rect = linkRef.current.getBoundingClientRect();
    let top = rect.top - 10;
    let left = rect.left + rect.width / 2;

    const leftBound = TOOLTIP_ESTIMATED_WIDTH / 2 + TOOLTIP_VIEWPORT_PADDING;
    const rightBound = window.innerWidth - TOOLTIP_ESTIMATED_WIDTH / 2 - TOOLTIP_VIEWPORT_PADDING;
    left = Math.max(leftBound, Math.min(left, rightBound));

    if (top - TOOLTIP_ESTIMATED_HEIGHT < TOOLTIP_VIEWPORT_PADDING) {
      top = TOOLTIP_VIEWPORT_PADDING + TOOLTIP_ESTIMATED_HEIGHT;
    }

    setTooltipPosition({ top, left });
  };

  const loadTooltipContent = async () => {
    if (!reference.grantha_id) return;
    const passageText = await getPassagePreview(
      reference.grantha_id,
      reference,
      availableGranthaIds,
    );
    if (isInLibrary) {
      setTooltipContent(
        <div className="text-center">
          <p className="font-semibold">{`${targetTitle} ${locatorLabel}`}</p>
          {passageText && passageText !== "Reference not available in this library." && (
            <p className="mt-2">{passageText}</p>
          )}
        </div>
      );
    } else {
      setTooltipContent(
        <div className="text-center">
          <p className="font-semibold">{`${targetTitle} ${locatorLabel}`}</p>
          <p className="mt-1 text-gray-400 italic">not yet available</p>
        </div>
      );
    }
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
    if (!reference.grantha_id) return;

    if (isInLibrary) {
      try {
        const target = await loadGrantha(reference.grantha_id);
        const resolution = resolveReferenceTarget(target, reference.locator);
        if (resolution.kind === "passage" || resolution.kind === "root") {
          updateHash(
            reference.grantha_id,
            resolution.ref,
            reference.grantha_id === currentGranthaId ? editionId : undefined,
          );
        } else {
          setTooltipContent(
            <div className="text-center">
              <p className="font-semibold">{`${targetTitle} ${locatorLabel}`}</p>
              <p className="mt-1 text-amber-600 italic">
                {resolution.code === "REF-RUNTIME-DEPTH-OVERFLOW"
                  ? "reference has too many segments"
                  : "could not resolve"}
              </p>
            </div>
          );
          updateTooltipPosition();
          setShowTooltip(true);
        }
      } catch {
        setTooltipContent(<span className="text-red-500">Failed to load</span>);
        updateTooltipPosition();
        setShowTooltip(true);
      }
    } else {
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

  const linkClassName = `reference-link ${!isInLibrary ? 'external-reference' : ''}`;
  const targetHash = `${reference.grantha_id}:${reference.locator ?? "1"}`;

  return (
    <span className="reference-container">
      <a
        ref={linkRef}
        href={`#${targetHash}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className={linkClassName}
      >
        {reference.display_text}
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
