'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Reference, isReferenceInLibrary, getPassagePreview } from '../lib/references';

interface ReferenceLinkProps {
  reference: Reference;
  currentGranthaId: string;
  updateHash: (granthaId: string, verseRef: string, commentaries: string[]) => void;
  availableGranthaIds: string[];
  granthaIdToTitle: { [key: string]: string };
}

// Global flag to prevent scrolling when clicking reference links
let preventNextScroll = false;
export const shouldPreventScroll = () => {
  const should = preventNextScroll;
  preventNextScroll = false;
  return should;
};

const ReferenceLink: React.FC<ReferenceLinkProps> = ({ reference, currentGranthaId, updateHash, availableGranthaIds, granthaIdToTitle }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipContent, setTooltipContent] = useState<React.ReactNode | null>('Loading...');
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [tooltipBelow, setTooltipBelow] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const isTouchDevice = useRef(false);

  const isInLibrary = isReferenceInLibrary(reference.granthaId, availableGranthaIds);

  // Detect if device supports touch
  useEffect(() => {
    isTouchDevice.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }, []);

  const calculateTooltipPosition = () => {
    if (linkRef.current) {
      const rect = linkRef.current.getBoundingClientRect();
      const tooltipMaxWidth = 600; // matches max-width in CSS
      const tooltipEstimatedHeight = 100; // estimated height for positioning
      const padding = 10; // padding from viewport edges

      let top = rect.top - 10;
      let left = rect.left + rect.width / 2;

      // Adjust horizontal position to keep tooltip in viewport
      const leftBound = tooltipMaxWidth / 2 + padding;
      const rightBound = window.innerWidth - tooltipMaxWidth / 2 - padding;

      if (left < leftBound) {
        left = leftBound;
      } else if (left > rightBound) {
        left = rightBound;
      }

      // Adjust vertical position if tooltip would go above viewport
      if (top - tooltipEstimatedHeight < padding) {
        // Position below the link instead
        top = rect.bottom + 10;
        setTooltipBelow(true);
      } else {
        setTooltipBelow(false);
      }

      setTooltipPosition({ top, left });
    }
  };

  const loadTooltipContent = async () => {
    if (isInLibrary) {
      const passageText = await getPassagePreview(reference.granthaId, reference.path, availableGranthaIds);
      const title = granthaIdToTitle[reference.granthaId] || reference.granthaId;
      setTooltipContent(
        <div>
          <p className="font-semibold">{`${title} ${reference.path}`}</p>
          {passageText && <p className="mt-2">{passageText}</p>}
        </div>
      );
    } else {
      const title = granthaIdToTitle[reference.granthaId] || reference.granthaId;
      setTooltipContent(`${title} ${reference.path}`);
    }
  };

  const handleMouseEnter = async (e: React.MouseEvent) => {
    // Don't show tooltip on mouse events for touch devices
    if (isTouchDevice.current) return;

    calculateTooltipPosition();
    setShowTooltip(true);
    await loadTooltipContent();
  };

  const handleMouseLeave = () => {
    // Don't hide tooltip on mouse leave for touch devices
    if (isTouchDevice.current) return;

    setShowTooltip(false);
    setTooltipContent('Loading...');
    setTooltipBelow(false);
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isTouchDevice.current && !isInLibrary) {
      // For external references on touch devices, toggle tooltip
      if (showTooltip) {
        setShowTooltip(false);
        setTooltipContent('Loading...');
        setTooltipBelow(false);
      } else {
        calculateTooltipPosition();
        setShowTooltip(true);
        await loadTooltipContent();
      }
    } else if (isInLibrary) {
      // For internal references, navigate without scrolling
      preventNextScroll = true;
      updateHash(reference.granthaId, reference.path, []);
    }
  };

  // Close tooltip when clicking outside on touch devices
  useEffect(() => {
    if (!isTouchDevice.current || !showTooltip) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
        setTooltipContent('Loading...');
        setTooltipBelow(false);
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
            transform: tooltipBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
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