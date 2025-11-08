"use client";

import {
  Grantha,
  Passage,
  PrefatoryMaterial,
  getPassageFragment,
} from "@/lib/data";
import { useRef } from "react";

interface PassageLinkProps {
  passage: Passage | PrefatoryMaterial;
  grantha: Grantha;
  isSelected: boolean;
  onVerseSelect: (ref: string) => void;
}

export default function PassageLink({
  passage,
  grantha,
  isSelected,
  onVerseSelect,
}: PassageLinkProps) {
  const verseRef = useRef<HTMLAnchorElement | null>(null);

  const getLabel = () => {
    // Use label directly for prefatory and concluding material
    if (passage.passage_type === "prefatory" || passage.passage_type === "concluding") {
      const prefatoryPassage = passage as PrefatoryMaterial;
      return prefatoryPassage.label.devanagari || "प्रस्तावना";
    }

    // For main passages, construct label from structure levels
    const topLevelStructure = grantha.structure_levels[0];
    const level2Structure = topLevelStructure.children?.[0];

    if (level2Structure) {
      return `${level2Structure.scriptNames.devanagari} ${passage.ref.split(".")[1] || passage.ref}`;
    }
    return `${topLevelStructure.scriptNames.devanagari} ${passage.ref}`;
  };

  const label = getLabel();
  const fragment = getPassageFragment(passage);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onVerseSelect(passage.ref);
  };

  return (
    <a
      ref={verseRef}
      href={`#${grantha.grantha_id}:${passage.ref}`}
      onClick={handleClick}
      className={`block w-full text-left py-3 transition-all duration-150 hover:bg-black/5 hover:rounded-lg truncate min-h-[44px] flex items-center ${
        isSelected ? "bg-gray-300/60 rounded-lg font-bold" : ""
      }`}
    >
      <span className={`flex-shrink-0 px-2 ${isSelected ? "text-gray-500" : "text-blue-600"}`}>
        {label}
      </span>
      <span className={`flex-1 truncate pr-2 ${isSelected ? "text-gray-500" : "text-gray-500"}`}>
        {" - "}{fragment}
      </span>
    </a>
  );
}
