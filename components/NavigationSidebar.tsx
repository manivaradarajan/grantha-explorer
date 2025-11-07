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
    <div className="h-full flex flex-col bg-[#f8f9fa]">
      {/* Grantha selector */}
      <div className="px-6 pt-4 pb-3">
        <GranthaSelector
          granthas={granthas}
          selectedGranthaId={grantha.grantha_id}
          onSelect={onGranthaChange}
        />
      </div>

      {/* Verse list */}
      <div className="flex-1 overflow-y-auto px-6">
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
              className={`w-full text-left py-2 px-3 transition-all duration-150 hover:bg-black/5 hover:rounded-lg truncate ${
                isSelected ? "bg-gray-300/80 rounded-lg font-bold" : ""
              }`}
            >
              <span className={isSelected ? "text-gray-700" : "text-blue-600"}>
                {label} -{" "}
              </span>
              <span className={isSelected ? "text-gray-700" : "text-gray-500"}>
                {fragment}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
