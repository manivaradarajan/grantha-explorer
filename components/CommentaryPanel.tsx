"use client";

import {
  Grantha,
  Commentary,
  CommentaryPrefatoryItem,
  type Reference,
} from "@/lib/data";
import { getUIStrings, type Language, type Script } from "@/lib/i18n";
import { commentaryPassageForRef } from "@/lib/data";
import { useCallback, useMemo } from "react";

import { renderCommentaryWithReferences as renderCommentaryWithReferencesFn } from './renderCommentary';
import CommentarySelector from './CommentarySelector';

interface CommentaryPanelProps {
  grantha: Grantha;
  selectedRef: string;
  /** Active edition_id from the URL (?e=). Absent = default edition. */
  selectedEditionId?: string;
  /** Called when the reader switches the active commentary edition. */
  onEditionChange: (editionId: string) => void;
  updateHash: (granthaId: string, verseRef: string, editionId?: string) => void;
  /** Comma-separated active subcommentary IDs from the URL (?sc=). */
  activeSubcommentaryIds?: string;
  /** Toggle a subcommentary's expansion. */
  onSubcommentaryToggle: (subcommentaryId: string, isOpen: boolean) => void;
  availableGranthaIds: string[];
  granthaIdToDevanagariTitle: Record<string, string>;
  granthaIdToLatinTitle: Record<string, string>;
  hideHeader?: boolean;
}

const PANEL_HEADER_CLASS =
  "shrink-0 border-b border-gray-100 bg-white flex flex-col items-center justify-start pt-7 px-4 min-h-[5.5rem]";

export default function CommentaryPanel({
  grantha,
  selectedRef,
  selectedEditionId,
  onEditionChange,
  updateHash,
  activeSubcommentaryIds,
  onSubcommentaryToggle,
  availableGranthaIds,
  granthaIdToDevanagariTitle,
  hideHeader = false,
}: CommentaryPanelProps) {
  const commentaries = grantha.commentaries || [];
  const hasMultipleEditions =
    (grantha.editions && grantha.editions.length > 1) || false;

  const script: Script = grantha.script || "devanagari";

  const activeSubIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of (activeSubcommentaryIds || "").split(",")) {
      if (id.trim()) {
        set.add(id.trim());
      }
    }
    return set;
  }, [activeSubcommentaryIds]);

  const uiStrings = useMemo(() => {
    const language = (grantha.language || "sanskrit") as Language;
    return getUIStrings(language, script);
  }, [grantha.language, script]);

  // Map of grantha ID → Devanagari title, for use in cross-reference links.
  const granthaIdToTitle = granthaIdToDevanagariTitle;

  // Same-grantha references preserve the active edition; cross-grantha refs
  // must not carry it (the target grantha has its own editions).
  const referenceEditionId = hasMultipleEditions ? grantha.edition_id : undefined;

  const renderCommentaryWithReferences = useCallback(
    (text: string, references?: Reference[], sourcePassageRef?: string): React.ReactNode =>
      renderCommentaryWithReferencesFn(text, references, {
        currentGranthaId: grantha.grantha_id,
        editionId: referenceEditionId,
        sourcePassageRef: sourcePassageRef ?? "",
        updateHash,
        availableGranthaIds,
        granthaIdToTitle,
      }),
    [grantha.grantha_id, granthaIdToTitle, referenceEditionId, updateHash, availableGranthaIds]
  );

  const renderCommentary = (commentary: Commentary) => {
    const passage = commentaryPassageForRef(commentary.passages || [], selectedRef);

    if (!passage) {
      // Whole-work opening (mangalacarana) lives on the part-level commentary
      // intro, keyed to the preface's label-only prefatory anchor (e.g. "0.1").
      const prefaceAnchor = (grantha.prefatory_material ?? []).find(
        (p) => p.ref === selectedRef,
      );
      if (prefaceAnchor && commentary.intro) {
        const introDev = commentary.intro.sanskrit?.devanagari || "";
        return (
          <div className="mb-8">
            <div className="text-sm text-gray-600 italic mb-3">
              {prefaceAnchor.label.devanagari}
            </div>
            <div className="text-lg md:text-base leading-relaxed whitespace-pre-line">
              {renderCommentaryWithReferences(introDev, undefined, selectedRef)}
            </div>
          </div>
        );
      }
      return (
        <div className="text-gray-500 italic">
          {uiStrings.noCommentaryForVerse}
        </div>
      );
    }

    const prefatoryMaterial = passage.prefatory_material || [];
    const mainContent = passage.content?.sanskrit?.devanagari || "";

    return (
      <div className="mb-8">
        {prefatoryMaterial.length > 0 && (
          <div className="mb-6 pb-4 border-b border-gray-200">
            {prefatoryMaterial.map((item: CommentaryPrefatoryItem, idx: number) => (
              <div key={idx} className="mb-4">
                {item.label && <div className="text-sm text-gray-600 italic mb-3">{item.label}</div>}
                <div className="text-base leading-relaxed text-gray-700 whitespace-pre-line">
                  {item.content?.sanskrit?.devanagari || ""}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-lg md:text-base leading-relaxed whitespace-pre-line">
          {renderCommentaryWithReferences(mainContent, passage.references, passage.ref)}
        </div>
      </div>
    );
  };

  if (commentaries.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {!hideHeader && (
          <div className={PANEL_HEADER_CLASS}>
            <h2 className="text-lg font-semibold font-serif">{uiStrings.commentary}</h2>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <p className="text-gray-500 italic">{uiStrings.noCommentariesAvailable}</p>
        </div>
      </div>
    );
  }

  const commentary = commentaries[0];
  const subcommentaries = commentary?.subcommentaries || [];

  const renderSubcommentary = (sub: Commentary) => {
    const isOpen = activeSubIds.has(sub.commentary_id);
    const passage = commentaryPassageForRef(sub.passages || [], selectedRef);
    const hasContent = Boolean(passage && passage.content?.sanskrit?.devanagari);

    return (
      <div key={sub.commentary_id} className="mt-8">
        <button
          type="button"
          onClick={() => onSubcommentaryToggle(sub.commentary_id, !isOpen)}
          className="w-full flex items-center gap-2 py-2 text-left border-t border-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
          aria-expanded={isOpen}
          aria-controls={`sub-${sub.commentary_id}`}
        >
          <span aria-hidden="true" className="text-xs font-mono">
            {isOpen ? "−" : "+"}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-serif font-semibold">
              {sub.commentary_title}
            </span>
            {sub.commentator?.devanagari && (
              <span className="text-xs text-gray-400">
                {sub.commentator.devanagari}
              </span>
            )}
          </span>
        </button>

        {isOpen && (
          <div id={`sub-${sub.commentary_id}`} className="mt-2 pl-5">
            {hasContent ? (
              renderCommentary(sub)
            ) : (
              <div className="text-gray-500 italic">
                {uiStrings.noCommentaryForVerse}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {!hideHeader && (
        <div className={PANEL_HEADER_CLASS}>
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-lg font-semibold font-serif">
              {[commentary.commentary_title, commentary.commentator?.devanagari]
                .filter(Boolean)
                .join(" - ")}
            </h2>
            {hasMultipleEditions && grantha.editions && (
              <CommentarySelector
                editions={grantha.editions}
                selectedEditionId={selectedEditionId}
                onSelect={onEditionChange}
              />
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {renderCommentary(commentary)}
        {subcommentaries.map(renderSubcommentary)}
      </div>
    </div>
  );
}
