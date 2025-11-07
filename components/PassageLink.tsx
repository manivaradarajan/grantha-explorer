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
  const verseRef = useRef<HTMLButtonElement | null>(null);

  const getLabel = () => {
    if (passage.passage_type === "prefatory") {
      return passage.label || "प्रस्तावना";
    }
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
      ref={verseRef as any}
      href={`#${grantha.grantha_id}:${passage.ref}`}
      onClick={handleClick}
      className={`block w-full text-left py-1.5 px-3 transition-all duration-150 hover:bg-black/5 hover:rounded-lg truncate ${
        isSelected ? "bg-gray-300/60 rounded-lg font-bold" : ""
      }`}
    >
      <span className={isSelected ? "text-gray-500" : "text-blue-600"}>
        {label} -{" "}
      </span>
      <span className={isSelected ? "text-gray-500" : "text-gray-500"}>
        {fragment}
      </span>
    </a>
  );
}
