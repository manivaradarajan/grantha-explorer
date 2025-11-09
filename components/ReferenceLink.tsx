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
    console.log('isTouchDevice detected:', isTouchDevice.current);
  }, []);

  const calculateTooltipPosition = () => {
    if (linkRef.current) {
      const rect = linkRef.current.getBoundingClientRect();
      const tooltipMaxWidth = 600; // matches max-width in CSS
      const tooltipEstimatedWidth = 200; // estimated width for horizontal positioning
      const tooltipEstimatedHeight = 40; // estimated height for positioning
      const padding = 10; // padding from viewport edges

      let top = rect.top - 10;
      let left = rect.left + rect.width / 2;

      // Adjust horizontal position to keep tooltip in viewport
      const leftBound = tooltipEstimatedWidth / 2 + padding;
      const rightBound = window.innerWidth - tooltipEstimatedWidth / 2 - padding;

      if (left < leftBound) {
        left = leftBound;
      } else if (left > rightBound) {
        left = rightBound;
      }

      // Adjust vertical position to keep tooltip in viewport and above the link
      const potentialTooltipTopEdge = top - tooltipEstimatedHeight;
      if (potentialTooltipTopEdge < padding) {
        // If the tooltip would go above the viewport, adjust its 'top'
        // so that its top edge is at 'padding' from the viewport top.
        // 'top' here refers to the desired position for the *bottom* of the tooltip
        // due to the 'translateY(-100%)' transform.
        top = padding + tooltipEstimatedHeight;
      }

      setTooltipBelow(false); // Always try to position above the link
      setTooltipPosition({ top, left });
      console.log('Tooltip position calculated:', { top, left });
    }
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
      setTooltipContent(`${title} ${reference.path}`);
    }
    console.log('Tooltip content loaded:', tooltipContent);
  };

  const handleMouseEnter = async (e: React.MouseEvent) => {
    // Don't show tooltip on mouse events for touch devices
    if (isTouchDevice.current) return;

    console.log('handleMouseEnter: Desktop device, showing tooltip');
    calculateTooltipPosition();
    setShowTooltip(true);
    await loadTooltipContent();
  };

  const handleMouseLeave = () => {
    // Don't hide tooltip on mouse leave for touch devices
    if (isTouchDevice.current) return;

    console.log('handleMouseLeave: Desktop device, hiding tooltip');
    setShowTooltip(false);
    setTooltipContent('Loading...');
    setTooltipBelow(false);
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    console.log('handleClick: isTouchDevice.current:', isTouchDevice.current, 'isInLibrary:', isInLibrary);

    if (isTouchDevice.current && !isInLibrary) {
      // For external references on touch devices, toggle tooltip
      console.log('handleClick: Touch device, external reference. Toggling tooltip.');
      if (showTooltip) {
        setShowTooltip(false);
        setTooltipContent('Loading...');
        setTooltipBelow(false);
        console.log('handleClick: Hiding tooltip.');
      } else {
        calculateTooltipPosition();
        setShowTooltip(true);
        await loadTooltipContent();
        console.log('handleClick: Showing tooltip.');
      }
    } else if (isInLibrary) {
      // For internal references, navigate without scrolling
      console.log('handleClick: Internal reference, navigating.');
      preventNextScroll = true;
      updateHash(reference.granthaId, reference.path, []);
    } else {
      console.log('handleClick: Desktop device, external reference. No action on click (hover handles it).');
    }
  };

  // Close tooltip when clicking outside on touch devices
  useEffect(() => {
    if (!isTouchDevice.current || !showTooltip) return;

    console.log('handleClickOutside useEffect: Active for touch device and showTooltip is true.');
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
        setTooltipContent('Loading...');
        setTooltipBelow(false);
        console.log('handleClickOutside: Hiding tooltip due to outside click.');
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