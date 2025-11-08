"use client";

import { Grantha, Commentary, CommentaryPassage, CommentaryPrefatoryItem } from "@/lib/data";
import { getUIStrings, type Language, type Script } from "@/lib/i18n";
import { useState, useMemo, useEffect } from "react";

import DOMPurify from "isomorphic-dompurify";
import { getGranthasMeta, createAbbreviationMap, GranthaMeta } from "@/lib/data";
import { parseReferences } from '@/lib/references';
import ReferenceLink from './ReferenceLink';

interface CommentaryPanelProps {
  grantha: Grantha;
  selectedRef: string;
  updateHash: (granthaId: string, verseRef: string) => void;
  availableGranthaIds: string[];
  granthaIdToDevanagariTitle: { [key: string]: string };
  granthaIdToLatinTitle: { [key: string]: string };
}

export default function CommentaryPanel({
  grantha,
  selectedRef,
  updateHash,
  availableGranthaIds,
  granthaIdToDevanagariTitle,
  granthaIdToLatinTitle,
}: CommentaryPanelProps) {
  const commentaries = grantha.commentaries || [];
  const hasMultipleCommentaries = commentaries.length > 1;

  const script: Script = grantha.script || "devanagari";

  const uiStrings = useMemo(() => {
    const language = (grantha.language || "sanskrit") as Language;
    return getUIStrings(language, script);
  }, [grantha.language, script]);

  const [selectedCommentaries, setSelectedCommentaries] = useState<number[]>([0]);
  const [abbreviationMap, setAbbreviationMap] = useState<{ [key: string]: string }>({});
  const [granthasMeta, setGranthasMeta] = useState<GranthaMeta | null>(null);

  useEffect(() => {
    getGranthasMeta().then(meta => {
      setGranthasMeta(meta);
      const abbrMap = createAbbreviationMap(meta, 'devanagari');
      setAbbreviationMap(abbrMap);
    });
  }, []);

  const toggleCommentary = (index: number) => {
    if (selectedCommentaries.includes(index)) {
      if (selectedCommentaries.length > 1) {
        setSelectedCommentaries(selectedCommentaries.filter((i) => i !== index));
      }
    } else {
      setSelectedCommentaries([...selectedCommentaries, index]);
    }
  };

  const renderCommentaryWithReferences = (text: string, script: Script) => {
    const references = parseReferences(text, abbreviationMap);
    if (references.length === 0) {
      return <div dangerouslySetInnerHTML={{ __html: text }} />;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    references.forEach((ref, i) => {
      const startIndex = text.indexOf(ref.fullMatch, lastIndex);
      if (startIndex > lastIndex) {
        parts.push(
          <span key={`text-${i}`} dangerouslySetInnerHTML={{ __html: text.substring(lastIndex, startIndex) }} />
        );
      }
      parts.push(
        <ReferenceLink key={`ref-${i}`} reference={ref} currentGranthaId={grantha.grantha_id} updateHash={updateHash} availableGranthaIds={availableGranthaIds} granthaIdToTitle={granthasMeta ? Object.fromEntries(Object.entries(granthasMeta).map(([id, data]) => [id, data.title.devanagari])) : {}} />
      );
      lastIndex = startIndex + ref.fullMatch.length;
    });

    if (lastIndex < text.length) {
      parts.push(
        <span key="text-last" dangerouslySetInnerHTML={{ __html: text.substring(lastIndex) }} />
      );
    }

    return <>{parts}</>;
  };

  const renderCommentary = (commentary: Commentary, index: number) => {
    const passage = commentary.passages?.find((p: CommentaryPassage) => p.ref === selectedRef);

    if (!passage) {
      return (
        <div key={index} className="text-gray-500 italic">
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
      <div key={index} className="mb-8">
        {hasMultipleCommentaries && (
          <div className="mb-4">
            <h3 className="text-base font-semibold font-serif">{commentary.commentary_title}</h3>
            <div className="text-sm text-gray-600">{commentary.commentator.devanagari}</div>
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

        <div className="text-base leading-relaxed whitespace-pre-line">
          {renderCommentaryWithReferences(sanitizedHtml, script)}
        </div>
      </div>
    );
  };

  if (commentaries.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="pt-6 px-4 text-center bg-white">
          <h2 className="text-lg font-semibold font-serif">{uiStrings.commentary}</h2>
        </div>
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
        <div className="pt-6 px-4 text-center bg-white">
          <h2 className="text-lg font-semibold font-serif">{commentary.commentary_title}</h2>
          <div className="text-sm pb-2 text-gray-600 mt-1">{commentary.commentator.devanagari}</div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {renderCommentary(commentary, 0)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 text-center bg-white">
        <h2 className="text-lg font-semibold font-serif">{uiStrings.commentary}</h2>
      </div>

      <div className="border-b border-gray-200">
        <div className="p-4">
          {commentaries.map((commentary, index) => (
            <label key={index} className="flex items-center gap-2 mb-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
              <input
                type="checkbox"
                checked={selectedCommentaries.includes(index)}
                onChange={() => toggleCommentary(index)}
                className="w-4 h-4"
              />
              <span className="text-sm">{commentary.commentator.devanagari}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {selectedCommentaries.map((index, idx) => (
          <div key={index}>
            {renderCommentary(commentaries[index], index)}
            {idx < selectedCommentaries.length - 1 && <hr className="my-8 border-gray-300" />}
          </div>
        ))}
      </div>
    </div>
  );
}
