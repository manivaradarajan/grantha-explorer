"use client";

import { Grantha, getAllPassagesForNavigation } from "@/lib/data";
import { useEffect, useRef } from "react";

interface TextContentProps {
  grantha: Grantha;
  selectedRef: string;
  onVerseSelect: (ref: string) => void;
}

export default function TextContent({
  grantha,
  selectedRef,
  onVerseSelect,
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
    <div className="h-screen flex flex-col border-r-2 border-gray-300">
      {/* Header */}
      <div className="p-4 border-b border-gray-300">
        <h1 className="text-xl font-semibold text-center font-serif">
          {grantha.canonical_title}
        </h1>
      </div>

      {/* Verses */}
      <div className="flex-1 overflow-y-auto p-6">
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
              className={`mb-6 p-4 transition-colors duration-150 cursor-pointer hover:bg-gray-100 ${
                isSelected ? "bg-gray-200" : "bg-white"
              }`}
            >
              <div className="flex items-start gap-4">
                <span className="font-semibold text-gray-400 min-w-[2rem]">
                  {passage.ref}
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
