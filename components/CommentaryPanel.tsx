"use client";

import { Grantha } from "@/lib/data";
import { useState } from "react";

interface CommentaryPanelProps {
  grantha: Grantha;
  selectedRef: string;
}

export default function CommentaryPanel({
  grantha,
  selectedRef,
}: CommentaryPanelProps) {
  const commentaries = grantha.commentaries || [];
  const hasMultipleCommentaries = commentaries.length > 1;

  // Track which commentaries are selected (by index)
  const [selectedCommentaries, setSelectedCommentaries] = useState<number[]>([
    0,
  ]);

  const toggleCommentary = (index: number) => {
    if (selectedCommentaries.includes(index)) {
      // Don't allow deselecting if it's the only one selected
      if (selectedCommentaries.length > 1) {
        setSelectedCommentaries(
          selectedCommentaries.filter((i) => i !== index),
        );
      }
    } else {
      setSelectedCommentaries([...selectedCommentaries, index]);
    }
  };

  // Render a single commentary for the selected verse
  const renderCommentary = (commentary: any, index: number) => {
    const passage = commentary.passages?.find(
      (p: any) => p.ref === selectedRef,
    );

    if (!passage) {
      return (
        <div key={index} className="text-gray-500 italic">
          No commentary available for this verse.
        </div>
      );
    }

    const prefatoryMaterial = passage.prefatory_material || [];
    const mainContent = passage.content?.sanskrit?.devanagari || "";

    return (
      <div key={index} className="mb-8">
        {/* Show commentary title if multiple commentaries */}
        {hasMultipleCommentaries && (
          <div className="mb-4">
            <h3 className="text-base font-semibold font-serif">
              {commentary.commentary_title}
            </h3>
            <div className="text-sm text-gray-600">
              {commentary.commentator.devanagari}
            </div>
          </div>
        )}

        {/* Prefatory material */}
        {prefatoryMaterial.length > 0 && (
          <div className="mb-6 pb-4 border-b border-gray-200">
            {prefatoryMaterial.map((item: any, idx: number) => (
              <div key={idx} className="mb-4">
                {item.label && (
                  <div className="text-sm text-gray-600 italic mb-3">
                    {item.label}
                  </div>
                )}
                <div className="text-base leading-relaxed text-gray-700 whitespace-pre-line">
                  {item.content?.sanskrit?.devanagari || ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Main commentary content */}
        <div
          className="text-base leading-relaxed whitespace-pre-line"
          dangerouslySetInnerHTML={{
            __html: mainContent.replace(
              /\*\*(.*?)\*\*/g,
              '<strong class="font-bold text-gray-900">$1</strong>',
            ),
          }}
        />
      </div>
    );
  };

  if (commentaries.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="pt-6 px-4 text-center bg-white">
          <h2 className="text-lg font-semibold font-serif">भाष्यम्</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <p className="text-gray-500 italic">No commentaries available.</p>
        </div>
      </div>
    );
  }

  // Single commentary
  if (!hasMultipleCommentaries) {
    const commentary = commentaries[0];
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="pt-6 px-4 text-center bg-white">
          <h2 className="text-lg font-semibold font-serif">
            {commentary.commentary_title}
          </h2>
          <div className="text-sm pb-2 text-gray-600 mt-1">
            {commentary.commentator.devanagari}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {renderCommentary(commentary, 0)}
        </div>
      </div>
    );
  }

  // Multiple commentaries - show selector
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 text-center bg-white">
        <h2 className="text-lg font-semibold font-serif">भाष्यम्</h2>
      </div>

      <div className="border-b border-gray-200">
        <div className="p-4">
          {commentaries.map((commentary, index) => (
            <label
              key={index}
              className="flex items-center gap-2 mb-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
            >
              <input
                type="checkbox"
                checked={selectedCommentaries.includes(index)}
                onChange={() => toggleCommentary(index)}
                className="w-4 h-4"
              />
              <span className="text-sm">
                {commentary.commentator.devanagari}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {selectedCommentaries.map((index, idx) => (
          <div key={index}>
            {renderCommentary(commentaries[index], index)}
            {idx < selectedCommentaries.length - 1 && (
              <hr className="my-8 border-gray-300" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
