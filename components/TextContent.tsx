"use client";

import { Grantha, getAllPassagesForNavigation } from "@/lib/data";
import { useEffect, useRef } from "react";
import { shouldPreventScroll } from "./ReferenceLink";

interface TextContentProps {
  grantha: Grantha;
  selectedRef: string;
  onVerseSelect: (ref: string) => void;
  title: string;
  hideTitle?: boolean;
}

export default function TextContent({
  grantha,
  selectedRef,
  onVerseSelect,
  title,
  hideTitle = false,
}: TextContentProps) {
  const passages = getAllPassagesForNavigation(grantha);
  const verseRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const clickedInternally = useRef(false);

  // Auto-scroll to selected verse when selection changes from navigation sidebar
  useEffect(() => {
    // Don't scroll if the click came from within this component
    if (clickedInternally.current) {
      clickedInternally.current = false;
      return;
    }

    // Don't scroll if the click came from a reference link
    if (shouldPreventScroll()) {
      return;
    }

    // Scroll to verse when selected (from navigation sidebar or grantha change)
    const element = verseRefs.current[selectedRef];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedRef]);

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
        {passages.map((passage) => {
          const isSelected = passage.ref === selectedRef;
          const sanskritText = passage.content.sanskrit.devanagari;

          return (
            <div
              key={passage.ref}
              ref={(el) => {
                verseRefs.current[passage.ref] = el;
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
          );
        })}
      </div>
    </div>
  );
}
