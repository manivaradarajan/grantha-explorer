"use client";

import {
  Grantha,
  Commentary,
  CommentaryPrefatoryItem,
  getGranthasMeta,
  createAbbreviationMap,
  type GranthaMeta,
} from "@/lib/data";
import { getUIStrings, type Language, type Script } from "@/lib/i18n";
import { commentaryPassageForRef } from "@/lib/data";
import { useCallback, useMemo, useEffect, useState } from "react";

import DOMPurify from "isomorphic-dompurify";
import { parseReferences } from '@/lib/references';
import ReferenceLink from './ReferenceLink';
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

  const [abbreviationMap, setAbbreviationMap] = useState<Record<string, string>>({});
  const [granthasMeta, setGranthasMeta] = useState<GranthaMeta | null>(null);

  useEffect(() => {
    getGranthasMeta().then(meta => {
      setGranthasMeta(meta);
      setAbbreviationMap(createAbbreviationMap(meta, 'devanagari'));
    });
  }, []);

  /** Map of grantha ID → Devanagari title, for use in cross-reference links. */
  const granthaIdToTitle = useMemo<Record<string, string>>(
    () =>
      granthasMeta
        ? Object.fromEntries(
            Object.entries(granthasMeta).map(([id, data]) => [id, data.title.devanagari])
          )
        : {},
    [granthasMeta]
  );

  // Same-grantha references preserve the active edition; cross-grantha refs
  // must not carry it (the target grantha has its own editions).
  const referenceEditionId = hasMultipleEditions ? grantha.edition_id : undefined;

  const renderCommentaryWithReferences = useCallback(
    (text: string): React.ReactNode => {
      const references = parseReferences(text, abbreviationMap);
      if (references.length === 0) {
        return <div dangerouslySetInnerHTML={{ __html: text }} />;
      }

      const parts: React.ReactNode[] = [];
      let lastIndex = 0;

      references.forEach((ref, i) => {
        const startIndex = text.indexOf(ref.fullMatch, lastIndex);
        const hasOpenParen = startIndex > 0 && text[startIndex - 1] === '(';
        const refEndIndex = startIndex + ref.fullMatch.length;
        const hasCloseParen = refEndIndex < text.length && text[refEndIndex] === ')';
        const isParenthesized = hasOpenParen && hasCloseParen;

        if (isParenthesized) {
          if (startIndex > lastIndex + 1) {
            parts.push(
              <span key={`text-${i}`} dangerouslySetInnerHTML={{ __html: text.substring(lastIndex, startIndex - 1) }} />
            );
          }
          parts.push(
            <span key={`paren-ref-${i}`} style={{ whiteSpace: 'nowrap' }}>
              (<ReferenceLink
                reference={ref}
                currentGranthaId={grantha.grantha_id}
                editionId={referenceEditionId}
                updateHash={updateHash}
                availableGranthaIds={availableGranthaIds}
                granthaIdToTitle={granthaIdToTitle}
              />)
            </span>
          );
          lastIndex = refEndIndex + 1;
        } else {
          if (startIndex > lastIndex) {
            parts.push(
              <span key={`text-${i}`} dangerouslySetInnerHTML={{ __html: text.substring(lastIndex, startIndex) }} />
            );
          }
          parts.push(
            <ReferenceLink
              key={`ref-${i}`}
              reference={ref}
              currentGranthaId={grantha.grantha_id}
              editionId={referenceEditionId}
              updateHash={updateHash}
              availableGranthaIds={availableGranthaIds}
              granthaIdToTitle={granthaIdToTitle}
            />
          );
          lastIndex = startIndex + ref.fullMatch.length;
        }
      });

      if (lastIndex < text.length) {
        parts.push(
          <span key="text-last" dangerouslySetInnerHTML={{ __html: text.substring(lastIndex) }} />
        );
      }

      return <>{parts}</>;
    },
    [abbreviationMap, granthaIdToTitle, grantha.grantha_id, referenceEditionId, updateHash, availableGranthaIds]
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
        const introHtml = DOMPurify.sanitize(
          (commentary.intro.sanskrit?.devanagari || "")
            .replace(/^#### (.+)$/gm, '<em class="text-base font-normal italic text-gray-500">$1</em>')
            .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>')
        );
        return (
          <div className="mb-8">
            <div className="text-sm text-gray-600 italic mb-3">
              {prefaceAnchor.label.devanagari}
            </div>
            <div className="text-lg md:text-base leading-relaxed whitespace-pre-line">
              {renderCommentaryWithReferences(introHtml)}
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
    const sanitizedHtml = DOMPurify.sanitize(
      mainContent
        .replace(/^#### (.+)$/gm, '<em class="text-base font-normal italic text-gray-500">$1</em>')
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>')
    );

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
          {renderCommentaryWithReferences(sanitizedHtml)}
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
            <h2 className="text-lg font-semibold font-serif">{commentary.commentary_title}</h2>
            {hasMultipleEditions && grantha.editions && (
              <CommentarySelector
                editions={grantha.editions}
                selectedEditionId={selectedEditionId}
                onSelect={onEditionChange}
              />
            )}
          </div>
          <div className="text-sm text-gray-600 mt-1">{commentary.commentator?.devanagari}</div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {renderCommentary(commentary)}
        {subcommentaries.map(renderSubcommentary)}
      </div>
    </div>
  );
}
