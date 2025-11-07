"use client";

import {
  Grantha,
  GranthaMetadata,
  getAllPassagesForNavigation,
  getPassageFragment,
  getStructureLevelLabel,
} from "@/lib/data";
import GranthaSelector from "./GranthaSelector";
import { useEffect, useRef } from "react";

interface NavigationSidebarProps {
  grantha: Grantha;
  granthas: GranthaMetadata[];
  selectedRef: string;
  onGranthaChange: (granthaId: string) => void;
  onVerseSelect: (ref: string) => void;
}

export default function NavigationSidebar({
  grantha,
  granthas,
  selectedRef,
  onGranthaChange,
  onVerseSelect,
}: NavigationSidebarProps) {
  const passages = getAllPassagesForNavigation(grantha);
  const structureLabel = getStructureLevelLabel(grantha);
  const verseRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

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
        <h2 className="text-lg font-semibold mb-3 font-serif">अनुक्रमणिका</h2>
        <GranthaSelector
          granthas={granthas}
          selectedGranthaId={grantha.grantha_id}
          onSelect={onGranthaChange}
        />
      </div>

      {/* Verse list */}
      <div className="flex-1 overflow-y-auto">
        {passages.map((passage) => {
          const isSelected = passage.ref === selectedRef;
          const fragment = getPassageFragment(passage);
          const label =
            passage.passage_type === "prefatory"
              ? passage.label || "प्रस्तावना"
              : `${structureLabel} ${passage.ref}`;

          return (
            <button
              key={passage.ref}
              ref={(el) => {
                verseRefs.current[passage.ref] = el;
              }}
              onClick={() => onVerseSelect(passage.ref)}
              className={`w-full text-left p-3 border-b border-gray-200 transition-colors duration-150 hover:bg-gray-100 truncate ${
                isSelected ? "bg-gray-200" : "bg-white"
              }`}
            >
              <span className="text-blue-600">{label} - </span>
              <span className="text-gray-500">{fragment}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
