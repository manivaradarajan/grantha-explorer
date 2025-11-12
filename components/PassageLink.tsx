"use client";

import {
  Grantha,
  Passage,
  PrefatoryMaterial,
  getPassageFragment,
} from "@/lib/data";
import { forwardRef } from "react";

interface PassageLinkProps {
  passage: Passage | PrefatoryMaterial;
  grantha: Grantha;
  isSelected: boolean;
  onVerseSelect: (ref: string) => void;
}

const PassageLink = forwardRef<HTMLAnchorElement, PassageLinkProps>(
  ({ passage, grantha, isSelected, onVerseSelect }, ref) => {
    if (!passage.ref) {
      // This can happen with bad data. Render nothing to avoid a crash.
      // A better solution might be to log this error.
      return null;
    }

    const getLabel = () => {
      if (
        passage.passage_type === "prefatory" ||
        passage.passage_type === "concluding"
      ) {
        const prefatoryPassage = passage as PrefatoryMaterial;
        return prefatoryPassage.label.devanagari || "प्रस्तावना";
      }

      let deepestStructure = grantha.structure_levels[0];
      while (deepestStructure.children && deepestStructure.children.length > 0) {
        deepestStructure = deepestStructure.children[0];
      }

      const refParts = passage.ref.split(".");
      const lastRefPart = refParts[refParts.length - 1];

      return `${deepestStructure.scriptNames.devanagari} ${lastRefPart}`;
    };

    const label = getLabel();
    const fragment = getPassageFragment(passage);

    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      onVerseSelect(passage.ref);
    };

    return (
      <a
        ref={ref}
        href={`#${grantha.grantha_id}:${passage.ref}`}
        onClick={handleClick}
        className={`block w-full text-left py-0 transition-all duration-150 hover:bg-black/5 hover:rounded-lg truncate min-h-[40px] flex items-center ${
          isSelected ? "bg-gray-300/60 rounded-lg font-bold" : ""
        }`}
      >
        <span
          className={`flex-shrink-0 px-1 pl-5 ${isSelected ? "text-gray-500" : "text-blue-600"}`}
        >
          {label}
        </span>
        <span
          className={`flex-1 truncate pr-2 ${isSelected ? "text-gray-500" : "text-gray-500"}`}
        >
          {" - "}
          {fragment}
        </span>
      </a>
    );
  },
);

PassageLink.displayName = "PassageLink";
export default PassageLink;
