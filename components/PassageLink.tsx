"use client";

import {
  Grantha,
  Passage,
  PrefatoryMaterial,
  getPassageFragment,
} from "@/lib/data";
import { stripMarkdown, toDevanagariNumerals } from "@/lib/stringUtils";
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

    const getLabel = (): string => {
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
      const lastRefPart = refParts[refParts.length - 1] ?? "";

      return `${deepestStructure.scriptNames.devanagari} ${toDevanagariNumerals(lastRefPart)}`;
    };

    const label = stripMarkdown(getLabel());
    const fragment = stripMarkdown(getPassageFragment(passage));

    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      onVerseSelect(passage.ref);
    };

    return (
      <a
        ref={ref}
        href={`#${grantha.grantha_id}:${passage.ref}`}
        onClick={handleClick}
        className="block w-full text-left py-0 transition-all duration-150 hover:bg-black/5 hover:rounded-lg truncate min-h-[40px] flex items-center"
      >
        <span className="flex-shrink-0 pr-1 pl-5">
          {isSelected ? (
            <span className="inline-block rounded-full bg-gray-100 text-black font-semibold -ml-2.5 px-2.5 py-0.5">
              {label}
            </span>
          ) : (
            <span className="text-blue-600">{label}</span>
          )}
        </span>
        <span className="flex-1 truncate pr-2 text-gray-500">
          {" - "}
          {fragment}
        </span>
      </a>
    );
  },
);

PassageLink.displayName = "PassageLink";
export default PassageLink;
