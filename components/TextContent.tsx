"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { Spin } from "antd";
import { Grantha, getAllPassagesForNavigation } from "@/lib/data";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { stripMarkdown } from "@/lib/stringUtils";

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

  // Check if the selected verse's part is loaded for multi-part granthas.
  // Checks direct passage membership rather than re-deriving a section number
  // from the selected ref, so prefatory (e.g. "0.0") and concluding material
  // load correctly regardless of how their refs are numbered relative to the
  // containing part file's first_ref.
  const isMultiPart = grantha.parts && grantha.parts.length > 0;
  let isSelectedPartLoaded = true;
  if (isMultiPart && selectedRef !== "1") {
    isSelectedPartLoaded = passages.some(p => p.ref === selectedRef);
  }

  // Prev/Next computation
  const currentIndex = passages.findIndex(p => p.ref === selectedRef);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < passages.length - 1;

  const handlePrevious = () => {
    if (!hasPrevious) return;
    onVerseSelect(passages[currentIndex - 1].ref);
  };

  const handleNext = () => {
    if (!hasNext) return;
    onVerseSelect(passages[currentIndex + 1].ref);
  };

  // Part-loading sentinel observer.
  // Tracks loaded state per file via first_ref — the same key useGranthaLoader uses.
  // Using part_id (section number) would incorrectly treat all files in the same
  // section as loaded once the first file loads (e.g. Brihadaranyaka adhyaya 3
  // spans 4 files, all sharing id "3"). loadPart() also takes first_ref, not id.
  const loaderRef = useCallback((node: HTMLDivElement) => {
    if (isLoadingPart) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && grantha.parts) {
        const loadedFirstRefs = new Set(
          grantha.parts
            .filter(p => passages.some(passage => passage.ref === p.first_ref))
            .map(p => p.first_ref)
        );

        let lastLoadedPartIndex = -1;
        for (let i = 0; i < grantha.parts.length; i++) {
          if (loadedFirstRefs.has(grantha.parts[i].first_ref)) {
            lastLoadedPartIndex = i;
          }
        }

        if (lastLoadedPartIndex < grantha.parts.length - 1) {
          const nextPart = grantha.parts[lastLoadedPartIndex + 1];
          if (nextPart && !loadedFirstRefs.has(nextPart.first_ref)) {
            loadPart(nextPart.first_ref);
          }
        }
      }
    });

    if (node) observer.current.observe(node);
  }, [isLoadingPart, grantha, passages, loadPart]);

  // Auto-scroll to selected verse when selection changes from external navigation
  // (Prev/Next, sidebar tap, deep link, cross-reference click).
  // Skips when the change was driven by an internal verse click — the user
  // already tapped the verse they want; scrolling there would be redundant.
  //
  // `passages` is a fresh array reference each render (getAllPassagesForNavigation
  // spreads the grantha arrays), so this effect would re-fire on every re-render.
  // That is intentional for one case — deep links to a not-yet-loaded part, where
  // the verse element mounts only after the part loads and we need to retry — but
  // it also re-fires on lazy part loads triggered while the user is mid-scroll,
  // yanking the viewport back to the selected verse ("bounces to top"). Track the
  // last target and whether its element was found so we only re-scroll when the
  // target changes or a previously-missing element appears.
  const lastAutoScroll = useRef<{ ref: string; found: boolean } | null>(null);

  useEffect(() => {
    if (clickedInternally.current) {
      clickedInternally.current = false;
      return;
    }

    const currentPassage = passages.find(p => p.ref === selectedRef);
    const key = currentPassage?.part_id ? `${currentPassage.part_id}-${selectedRef}` : selectedRef;
    const element = verseRefs.current[key];
    const prev = lastAutoScroll.current;

    // Already auto-scrolled to this ref and its element is mounted — skip so a
    // later re-render (e.g. a lazy part load) does not re-yank the viewport.
    if (prev && prev.ref === selectedRef && prev.found) {
      return;
    }

    if (element) {
      lastAutoScroll.current = { ref: selectedRef, found: true };
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // Element not mounted yet (part still loading); remember so we retry.
      lastAutoScroll.current = { ref: selectedRef, found: false };
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

      {/* Verses. When the required part is still loading, show a full-height
          spinner inside this container rather than an early return so that
          verse divs mount in the same commit as isSelectedPartLoaded turning
          true — the auto-scroll effect then finds them immediately. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6">
        {!isSelectedPartLoaded ? (
          <div className="h-full flex items-center justify-center">
            <Spin size="large" />
          </div>
        ) : passages.map((passage, index) => {
          const prevPassage = index > 0 ? passages[index - 1] : null;
          const showSeparator =
            hasHierarchicalStructure &&
            prevPassage &&
            getSectionRef(passage.ref) !== getSectionRef(prevPassage.ref);

          const isSelected = passage.ref === selectedRef;
          const sanskritText = stripMarkdown(passage.content.sanskrit?.devanagari);
          const uniqueKey = passage.part_id ? `${passage.part_id}-${passage.ref}` : passage.ref;

          return (
            <React.Fragment key={`${uniqueKey}-${index}`}>
              {showSeparator && (
                <hr className="my-8 border-gray-300 w-1/2 mx-auto" />
              )}
              <div
                ref={(el) => {
                  if (el) {
                    verseRefs.current[uniqueKey] = el;
                  } else {
                    delete verseRefs.current[uniqueKey];
                  }
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
          <div className="text-center py-4 flex justify-center">
            <Spin />
          </div>
        )}
      </div>

      {/* Prev/Next footer — desktop and tablet only; mobile uses BottomSheet controls */}
      {!isMobile && (
        <div className="shrink-0 border-t border-gray-200 px-4 py-2 flex items-center justify-between bg-white">
          <button
            onClick={handlePrevious}
            disabled={!hasPrevious}
            className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous verse"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="text-sm text-gray-400 font-mono">{selectedRef}</span>
          <button
            onClick={handleNext}
            disabled={!hasNext}
            className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next verse"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
