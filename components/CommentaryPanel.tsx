"use client";

import {
  Grantha,
  Commentary,
  CommentaryPassage,
  CommentaryPrefatoryItem,
  getGranthasMeta,
  createAbbreviationMap,
  type GranthaMeta,
} from "@/lib/data";
import { getUIStrings, type Language, type Script } from "@/lib/i18n";
import { useCallback, useMemo, useEffect, useState, useRef } from "react";

import DOMPurify from "isomorphic-dompurify";
import { parseReferences } from '@/lib/references';
import ReferenceLink from './ReferenceLink';

interface CommentaryPanelProps {
  grantha: Grantha;
  selectedRef: string;
  /** Commentary IDs currently active in the URL hash (?c=). If empty or absent,
   *  defaults to the first commentary in the grantha. */
  selectedCommentaryIds?: string[];
  updateHash: (granthaId: string, verseRef: string, commentaries: string[]) => void;
  availableGranthaIds: string[];
  granthaIdToDevanagariTitle: Record<string, string>;
  granthaIdToLatinTitle: Record<string, string>;
  hideHeader?: boolean;
}

export default function CommentaryPanel({
  grantha,
  selectedRef,
  selectedCommentaryIds,
  updateHash,
  availableGranthaIds,
  granthaIdToDevanagariTitle,
  granthaIdToLatinTitle,
  hideHeader = false,
}: CommentaryPanelProps) {
  const commentaries = grantha.commentaries || [];
  const hasMultipleCommentaries = commentaries.length > 1;

  const script: Script = grantha.script || "devanagari";

  const uiStrings = useMemo(() => {
    const language = (grantha.language || "sanskrit") as Language;
    return getUIStrings(language, script);
  }, [grantha.language, script]);

  // Debounce commentary re-render by 400 ms to avoid jarring updates during fast scroll.
  // The URL hash (selectedRef) updates at 150 ms; the commentary pane waits longer
  // so fling-scrolling doesn't produce rapid re-renders.
  const [displayRef, setDisplayRef] = useState(selectedRef);
  const displayRefTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    displayRefTimer.current = setTimeout(() => setDisplayRef(selectedRef), 400);
    return () => {
      if (displayRefTimer.current !== null) clearTimeout(displayRefTimer.current);
    };
  }, [selectedRef]);

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

  /**
   * Derive the effective active commentary IDs from the URL prop.
   * Falls back to the first commentary when the prop is absent or contains
   * no IDs that exist in this grantha.
   */
  const effectiveSelectedIds = useMemo(() => {
    if (selectedCommentaryIds && selectedCommentaryIds.length > 0) {
      const valid = selectedCommentaryIds.filter(id =>
        commentaries.some(c => c.commentary_id === id)
      );
      if (valid.length > 0) return valid;
    }
    return commentaries.length > 0 ? [commentaries[0].commentary_id] : [];
  }, [selectedCommentaryIds, commentaries]);

  /**
   * Toggle a commentary ID in the active set and write the new set to the URL.
   * The last active commentary cannot be removed.
   */
  const toggleCommentary = (id: string) => {
    if (effectiveSelectedIds.includes(id)) {
      if (effectiveSelectedIds.length > 1) {
        updateHash(grantha.grantha_id, selectedRef, effectiveSelectedIds.filter(i => i !== id));
      }
    } else {
      updateHash(grantha.grantha_id, selectedRef, [...effectiveSelectedIds, id]);
    }
  };

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
    [abbreviationMap, granthaIdToTitle, grantha.grantha_id, updateHash, availableGranthaIds]
  );

  const renderCommentary = (commentary: Commentary, index: number) => {
    const passage = commentary.passages?.find((p: CommentaryPassage) => p.ref === displayRef);

    if (!passage) {
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
        {hasMultipleCommentaries && (
          <div className="mb-4">
            <h3 className="text-base font-semibold font-serif">{commentary.commentary_title}</h3>
            <div className="text-sm text-gray-600">{commentary.commentator?.devanagari}</div>
          </div>
        )}

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
          <div className="pt-6 px-4 text-center bg-white">
            <h2 className="text-lg font-semibold font-serif">{uiStrings.commentary}</h2>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <p className="text-gray-500 italic">{uiStrings.noCommentariesAvailable}</p>
        </div>
      </div>
    );
  }

  if (!hasMultipleCommentaries) {
    const commentary = commentaries[0];
    return (
      <div className="h-full flex flex-col">
        {!hideHeader && (
          <div className="pt-6 px-4 text-center bg-white">
            <h2 className="text-lg font-semibold font-serif">{commentary.commentary_title}</h2>
            <div className="text-sm pb-2 text-gray-600 mt-1">{commentary.commentator?.devanagari}</div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {renderCommentary(commentary, 0)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {!hideHeader && (
        <div className="p-4 text-center bg-white">
          <h2 className="text-lg font-semibold font-serif">{uiStrings.commentary}</h2>
        </div>
      )}

      <div className="border-b border-gray-200">
        <div className="p-4">
          {commentaries.map((commentary: Commentary) => (
            <label key={commentary.commentary_id} className="flex items-center gap-2 mb-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
              <input
                type="checkbox"
                checked={effectiveSelectedIds.includes(commentary.commentary_id)}
                onChange={() => toggleCommentary(commentary.commentary_id)}
                className="w-4 h-4"
              />
              <span className="text-sm">{commentary.commentator?.devanagari}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {effectiveSelectedIds.map((id, idx) => {
          const commentary = commentaries.find(c => c.commentary_id === id);
          if (!commentary) return null;
          return (
            <div key={id}>
              {renderCommentary(commentary, idx)}
              {idx < effectiveSelectedIds.length - 1 && <hr className="my-8 border-gray-300" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
