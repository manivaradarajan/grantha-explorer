"use client";

import { Grantha, getAllPassagesForNavigation } from "@/lib/data";
import { useEffect, useRef } from "react";

interface TextContentProps {
  grantha: Grantha;
  selectedRef: string;
  onVerseSelect: (ref: string) => void;
  title: string;
}

export default function TextContent({
  grantha,
  selectedRef,
  onVerseSelect,
  title,
}: TextContentProps) {
  const passages = getAllPassagesForNavigation(grantha);
  const verseRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Auto-scroll to selected verse when selection changes
  useEffect(() => {
    const element = verseRefs.current[selectedRef];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedRef]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-6 pb-2 text-center bg-white">
        <h1 className="text-3xl font-semibold font-serif">{title}</h1>
      </div>

      {/* Verses */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {passages.map((passage) => {
          const isSelected = passage.ref === selectedRef;
          const sanskritText = passage.content.sanskrit.devanagari;

          return (
            <div
              key={passage.ref}
              ref={(el) => {
                verseRefs.current[passage.ref] = el;
              }}
              onClick={() => onVerseSelect(passage.ref)}
              className={`px-4 py-3 mb-4 transition-all duration-150 cursor-pointer hover:bg-gray-100 hover:rounded-lg ${
                isSelected ? "bg-gray-200 rounded-lg" : "bg-white"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Show ref number for main passages, empty space for prefatory/concluding */}
                <span className="mt-0.5 font-semibold text-gray-400 min-w-8">
                  {passage.passage_type === "main" ? passage.ref : ""}
                </span>
                <div className="flex-1">
                  <p className="text-lg leading-relaxed whitespace-pre-line">
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
