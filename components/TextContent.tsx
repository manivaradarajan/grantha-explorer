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
  onScrollFocus?: (ref: string) => void;
}

export default function TextContent({
  grantha,
  selectedRef,
  onVerseSelect,
  title,
  hideTitle = false,
  loadPart,
  isLoadingPart,
  onScrollFocus,
}: TextContentProps) {
  const passages = getAllPassagesForNavigation(grantha);
  const verseRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const clickedInternally = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");

  // Scroll container ref — used by scroll-spy observer
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Scroll-spy state
  const scrollSpyObserverRef = useRef<IntersectionObserver | null>(null);
  const intersectingVerses = useRef<Set<Element>>(new Set());
  const scrollSpyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollSpyUpdate = useRef(false);

  // Always-current refs — updated synchronously each render so observer
  // callbacks never see stale values without closing over them.
  const onScrollFocusRef = useRef(onScrollFocus);
  onScrollFocusRef.current = onScrollFocus;
  const passagesRef = useRef(passages);
  passagesRef.current = passages;

  // Check if the selected verse's part is loaded for multi-part granthas
  const isMultiPart = grantha.parts && grantha.parts.length > 0;
  let isSelectedPartLoaded = true;
  if (isMultiPart && selectedRef !== "1") {
    const requiredPartId = selectedRef.split('.')[0];
    isSelectedPartLoaded = passages.some(p => p.part_id === requiredPartId);
  }

  // Prev/Next computation
  const currentIndex = passages.findIndex(p => p.ref === selectedRef);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < passages.length - 1;

  const cancelScrollSpyDebounce = () => {
    if (scrollSpyDebounce.current !== null) {
      clearTimeout(scrollSpyDebounce.current);
      scrollSpyDebounce.current = null;
    }
  };

  const handlePrevious = () => {
    if (!hasPrevious) return;
    cancelScrollSpyDebounce();
    onVerseSelect(passages[currentIndex - 1].ref);
  };

  const handleNext = () => {
    if (!hasNext) return;
    cancelScrollSpyDebounce();
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

  // Auto-scroll to selected verse when selection changes from external navigation.
  // Skips when the change was driven by scroll-spy (would fight active scroll)
  // or by an internal verse click (user is already at the verse they tapped).
  useEffect(() => {
    if (isScrollSpyUpdate.current) {
      isScrollSpyUpdate.current = false;
      return;
    }
    if (clickedInternally.current) {
      clickedInternally.current = false;
      return;
    }

    const currentPassage = passages.find(p => p.ref === selectedRef);
    const key = currentPassage?.part_id ? `${currentPassage.part_id}-${selectedRef}` : selectedRef;
    const element = verseRefs.current[key];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedRef, passages]);

  // Scroll-spy observer — set up once on mount; verse divs self-register via
  // ref callbacks so newly-mounted verses (from loadPart) are automatically tracked.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollSpyCallback: IntersectionObserverCallback = (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          intersectingVerses.current.add(entry.target);
        } else {
          intersectingVerses.current.delete(entry.target);
        }
      });

      if (scrollSpyDebounce.current !== null) clearTimeout(scrollSpyDebounce.current);
      scrollSpyDebounce.current = setTimeout(() => {
        if (!onScrollFocusRef.current) return;
        // Iterate passages in DOM order (canonical order) and find the topmost
        // element currently in the intersecting set. Uses passagesRef so this
        // closure never captures a stale passages array from a prior render.
        const topmost = passagesRef.current.find(p => {
          const uniqueKey = p.part_id ? `${p.part_id}-${p.ref}` : p.ref;
          const el = verseRefs.current[uniqueKey];
          return el != null && intersectingVerses.current.has(el);
        });
        if (topmost) {
          isScrollSpyUpdate.current = true;
          onScrollFocusRef.current(topmost.ref);
        }
      }, 150);
    };

    const createObserver = () => new IntersectionObserver(scrollSpyCallback, {
      root: container,
      rootMargin: '-15% 0px -80% 0px',
      threshold: 0,
    });

    scrollSpyObserverRef.current = createObserver();

    // Observe all verse divs already mounted at setup time
    Object.values(verseRefs.current).forEach(el => {
      if (el) scrollSpyObserverRef.current!.observe(el);
    });

    // Recreate the observer on container resize so rootMargin percentages
    // recalculate against the new container dimensions (R3 from design doc).
    const resizeObserver = new ResizeObserver(() => {
      if (!scrollSpyObserverRef.current) return;
      intersectingVerses.current.clear();
      scrollSpyObserverRef.current.disconnect();
      scrollSpyObserverRef.current = createObserver();
      Object.values(verseRefs.current).forEach(el => {
        if (el) scrollSpyObserverRef.current!.observe(el);
      });
    });
    resizeObserver.observe(container);

    return () => {
      cancelScrollSpyDebounce();
      intersectingVerses.current.clear();
      scrollSpyObserverRef.current?.disconnect();
      scrollSpyObserverRef.current = null;
      resizeObserver.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Empty deps: container is always rendered so ref is populated at effect time;
  // callbacks use refs (onScrollFocusRef, passagesRef, verseRefs) that are always
  // current without being listed as deps.

  const hasHierarchicalStructure = grantha.structure_levels && grantha.structure_levels.length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      {!hideTitle && (
        <div className="px-4 pt-6 pb-2 text-center bg-white">
          <h1 className="text-3xl font-semibold font-serif">{title}</h1>
        </div>
      )}

      {/* Verses — scroll container is always mounted so the scroll-spy observer
          (set up once via useEffect []) always has a valid ref to attach to.
          When the required part is still loading, show a full-height spinner
          inside this same container rather than returning early. */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6">
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
                    scrollSpyObserverRef.current?.observe(el);
                  } else {
                    const prev = verseRefs.current[uniqueKey];
                    if (prev) {
                      scrollSpyObserverRef.current?.unobserve(prev);
                      intersectingVerses.current.delete(prev);
                    }
                    delete verseRefs.current[uniqueKey];
                  }
                }}
                onClick={() => {
                  cancelScrollSpyDebounce();
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
