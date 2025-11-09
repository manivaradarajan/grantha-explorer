"use client";

import { useEffect, useRef, useState } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  verseRef?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export default function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  subtitle,
  verseRef,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: BottomSheetProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Check if user prefers reduced motion
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when sheet is open
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only start drag if we're at the top of the scroll container
    if (contentRef.current && contentRef.current.scrollTop > 0) {
      return;
    }
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
    setCurrentY(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const deltaY = e.touches[0].clientY - startY;
    // Only allow dragging down (positive deltaY)
    if (deltaY > 0) {
      setCurrentY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;

    setIsDragging(false);

    // If dragged more than 100px, close the sheet
    if (currentY > 100) {
      onClose();
    }

    setCurrentY(0);
  };

  const handleBackdropClick = () => {
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-opacity duration-200 ${
        isOpen
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black ${isOpen ? "opacity-50" : "opacity-0"}`}
        onClick={handleBackdropClick}
      />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className={`relative w-full bg-white rounded-t-2xl shadow-2xl h-[80vh] flex flex-col transform transition-transform duration-200 ease-out ${
          isDragging ? "" : isOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={
          isDragging
            ? {
                transform: `translateY(${currentY}px)`,
                transition: "none",
              }
            : undefined
        }
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag Handle */}
        <div className="relative flex justify-center py-6 cursor-grab active:cursor-grabbing">
          <div
            className="w-12 h-1 bg-gray-300 rounded-full"
            onClick={onClose}
          />
        </div>

        {/* Header with Symmetric Navigation */}
        <div className="flex items-center justify-between px-4 pb-4 border-b border-gray-200">
          {/* Previous Button */}
          <button
            onClick={onPrevious}
            disabled={!hasPrevious}
            className={`p-2 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
              hasPrevious
                ? "hover:bg-gray-100 text-gray-700"
                : "text-gray-300 cursor-not-allowed"
            }`}
            aria-label="Previous verse"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          {/* Title and Reference */}
          <div className="flex-1 text-center px-2">
            <div className="flex items-center justify-center gap-2 leading-tight">
              <h2 className="text-xl font-semibold font-serif">{title}</h2>
              {verseRef && (
                <span className="text-lg font-medium text-gray-700 -mt-0.5">
                  {verseRef}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-base text-gray-600 mt-1">{subtitle}</p>
            )}
          </div>

          {/* Next Button */}
          <button
            onClick={onNext}
            disabled={!hasNext}
            className={`p-2 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
              hasNext
                ? "hover:bg-gray-100 text-gray-700"
                : "text-gray-300 cursor-not-allowed"
            }`}
            aria-label="Next verse"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain pt-4 px-4 pb-6"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
