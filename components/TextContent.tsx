"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { Grantha, getAllPassagesForNavigation } from "@/lib/data";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const getSectionRef = (ref: string): string => {
  if (!ref) {
    return "";
  }
  const lastDotIndex = ref.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return ""; 
  }
  return ref.substring(0, lastDotIndex);
};

interface TextContentProps {
  grantha: Grantha;
  selectedRef: string;
  onVerseSelect: (ref: string) => void;
  title: string;
  hideTitle?: boolean;
  loadPart: (partId: string) => Promise<void>;
  isLoadingPart: boolean;
}

export default function TextContent({
  grantha,
  selectedRef,
  onVerseSelect,
  title,
  hideTitle = false,
  loadPart,
  isLoadingPart,
}: TextContentProps) {
  const passages = getAllPassagesForNavigation(grantha);
  const verseRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const clickedInternally = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const loaderRef = useCallback((node: HTMLDivElement) => {
    if (isLoadingPart) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && grantha.parts) {
        const loadedPartIds = new Set(passages.map(p => p.part_id).filter(Boolean));
        
        let lastLoadedPartIndex = -1;
        for (let i = 0; i < grantha.parts.length; i++) {
          if (loadedPartIds.has(grantha.parts[i].id)) {
            lastLoadedPartIndex = i;
          }
        }

        if (lastLoadedPartIndex < grantha.parts.length - 1) {
          const nextPart = grantha.parts[lastLoadedPartIndex + 1];
          if (nextPart && !loadedPartIds.has(nextPart.id)) {
            loadPart(nextPart.id);
          }
        }
      }
    });

    if (node) observer.current.observe(node);
  }, [isLoadingPart, grantha, passages, loadPart]);

  // Auto-scroll to selected verse when selection changes from navigation sidebar
  useEffect(() => {
    // Don't scroll if the click came from within this component
    if (clickedInternally.current) {
      clickedInternally.current = false;
      return;
    }

    // Scroll to verse when selected (from navigation sidebar or grantha change)
    const currentPassage = passages.find(p => p.ref === selectedRef);
    const key = currentPassage?.part_id ? `${currentPassage.part_id}-${selectedRef}` : selectedRef;
    const element = verseRefs.current[key];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedRef, passages]);

  const hasHierarchicalStructure = grantha.structure_levels && grantha.structure_levels.length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      {!hideTitle && (
        <div className="px-4 pt-6 pb-2 text-center bg-white">
          <h1 className="text-3xl font-semibold font-serif">{title}</h1>
        </div>
      )}

      {/* Verses */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6">
        {passages.map((passage, index) => {
          const prevPassage = index > 0 ? passages[index - 1] : null;
          const showSeparator =
            !isMobile &&
            hasHierarchicalStructure &&
            prevPassage &&
            getSectionRef(passage.ref) !== getSectionRef(prevPassage.ref);

          const isSelected = passage.ref === selectedRef;
          const sanskritText = passage.content.sanskrit?.devanagari || "";
          const uniqueKey = passage.part_id ? `${passage.part_id}-${passage.ref}` : passage.ref;

          return (
            <React.Fragment key={`${uniqueKey}-${index}`}>
              {showSeparator && (
                <hr className="my-8 border-gray-300 w-1/2 mx-auto" />
              )}
              <div
                ref={(el) => {
                  verseRefs.current[uniqueKey] = el;
                }}
                onClick={() => {
                  clickedInternally.current = true;
                  onVerseSelect(passage.ref);
                }}
                className={`px-4 py-3 mb-4 transition-all duration-150 cursor-pointer hover:bg-gray-100 hover:rounded-lg ${
                  isSelected ? "bg-gray-200 rounded-lg" : "bg-white"
                }`}
              >
                <div className="flex items-start gap-4 min-w-0">
                  {/* Show ref number for main passages, empty space for prefatory/concluding */}
                  <span className="mt-0.5 font-semibold text-gray-400 min-w-8 flex-shrink-0">
                    {passage.passage_type === "main" ? passage.ref : ""}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg leading-relaxed whitespace-pre-line verse-text">
                      {sanskritText}
                    </p>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}

        <div ref={loaderRef} />

        {isLoadingPart && (
          <div className="text-center text-gray-500 py-4">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}