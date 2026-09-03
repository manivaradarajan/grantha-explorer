"use client";

import React from "react";
import type { Reference } from "@/lib/data";
import type { ReferenceLinkContext } from "./renderCommentary";
import ReferenceLink from "./ReferenceLink";

/** A single collected footnote within a verse block. */
export interface FootnoteEntry {
  number: number;
  reference: Reference;
}

/** Props for the `FootnoteBlock` component. */
export interface FootnoteBlockProps {
  /** Ordered list of footnotes to render; empty → component returns null. */
  footnotes: FootnoteEntry[];
  /** Navigation and annotation context threaded into each `ReferenceLink`. */
  linkContext: ReferenceLinkContext;
}

/**
 * Renders the collected citation footnotes at the bottom of a verse block.
 *
 * Each entry renders as a `ReferenceLink` in `footnote-entry` mode, so
 * hover/focus/touch triggers the same CitationPanel popover as the inline
 * `[n]` superscripts above. Returns `null` when `footnotes` is empty so the
 * caller needs no conditional guard.
 *
 * Args:
 *     footnotes: The ordered footnote entries for this verse block.
 *     linkContext: Props threaded into each `ReferenceLink`.
 *
 * Returns:
 *     A footnote block element, or `null` when the list is empty.
 */
export function FootnoteBlock({
  footnotes,
  linkContext,
}: FootnoteBlockProps): React.ReactElement | null {
  if (footnotes.length === 0) return null;

  return (
    <div className="mt-4 footnote-block">
      <hr className="w-1/3 border-gray-300 my-3" />
      <ol className="space-y-1 text-sm font-serif list-none p-0 m-0">
        {footnotes.map((entry) => (
          <li key={entry.number} className="flex items-baseline">
            <ReferenceLink
              reference={entry.reference}
              displayMode="footnote-entry"
              footnoteNumber={entry.number}
              {...linkContext}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
