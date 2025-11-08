'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Reference, isReferenceInLibrary, getPassagePreview } from '../lib/references';

interface ReferenceLinkProps {
  reference: Reference;
  currentGranthaId: string;
  updateHash: (granthaId: string, verseRef: string) => void;
  availableGranthaIds: string[];
  granthaIdToTitle: { [key: string]: string };
}

const ReferenceLink: React.FC<ReferenceLinkProps> = ({ reference, currentGranthaId, updateHash, availableGranthaIds, granthaIdToTitle }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipContent, setTooltipContent] = useState<React.ReactNode | null>('Loading...');
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [tooltipBelow, setTooltipBelow] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);

  const isInLibrary = isReferenceInLibrary(reference.granthaId, availableGranthaIds);

  const handleMouseEnter = async (e: React.MouseEvent) => {
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
    setShowTooltip(true);
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

  const handleMouseLeave = () => {
    setShowTooltip(false);
    setTooltipContent('Loading...');
    setTooltipBelow(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isInLibrary) {
      updateHash(reference.granthaId, reference.path);
    }
  };

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
