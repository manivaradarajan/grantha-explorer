"use client";

import { useState, useMemo } from "react";
import { Grantha, GranthaMetadata, getAllPassagesForNavigation } from "@/lib/data";
import NavigationSidebar from "./NavigationSidebar";
import TextContent from "./TextContent";
import CommentaryPanel from "./CommentaryPanel";
import MobileDrawer from "./MobileDrawer";
import BottomSheet from "./BottomSheet";

interface MobileLayoutProps {
  grantha: Grantha;
  granthas: GranthaMetadata[];
  selectedRef: string;
  commentaries: string[];
  commentaryOpen: boolean;
  onGranthaChange: (granthaId: string) => void;
  onVerseSelect: (ref: string) => void;
  updateHash: (
    granthaId: string,
    verseRef: string,
    commentaries: string[]
  ) => void;
  updateCommentaryOpen: (isOpen: boolean) => void;
  granthaIdToDevanagariTitle: { [key: string]: string };
  granthaIdToLatinTitle: { [key: string]: string };
}

export default function MobileLayout({
  grantha,
  granthas,
  selectedRef,
  commentaries,
  commentaryOpen,
  onGranthaChange,
  onVerseSelect,
  updateHash,
  updateCommentaryOpen,
  granthaIdToDevanagariTitle,
  granthaIdToLatinTitle,
}: MobileLayoutProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);

  // Get all passages for navigation
  const allPassages = useMemo(
    () => getAllPassagesForNavigation(grantha),
    [grantha]
  );

  // Find current passage index
  const currentPassageIndex = useMemo(() => {
    return allPassages.findIndex((p) => p.ref === selectedRef);
  }, [allPassages, selectedRef]);

  const hasPrevious = currentPassageIndex > 0;
  const hasNext = currentPassageIndex < allPassages.length - 1;

  const handleVerseSelect = (ref: string) => {
    onVerseSelect(ref);
  };

  const handlePrevious = () => {
    if (hasPrevious) {
      const prevRef = allPassages[currentPassageIndex - 1].ref;
      onVerseSelect(prevRef);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      const nextRef = allPassages[currentPassageIndex + 1].ref;
      onVerseSelect(nextRef);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Mobile Header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        {/* Hamburger Menu Button */}
        <button
          onClick={() => setIsNavOpen(true)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Open navigation menu"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        {/* Title */}
        <h1 className="text-3xl font-semibold font-serif flex-1 text-center">
          {grantha.canonical_title}
        </h1>

        {/* Spacer to balance hamburger button */}
        <div className="min-w-[44px]"></div>
      </div>

      {/* Main Content - Full Width Text */}
      <div className="flex-1 overflow-hidden">
        <TextContent
          grantha={grantha}
          selectedRef={selectedRef}
          onVerseSelect={handleVerseSelect}
          title={grantha.canonical_title}
          hideTitle={true}
        />
      </div>

      {/* Navigation Drawer */}
      <MobileDrawer isOpen={isNavOpen} onClose={() => setIsNavOpen(false)}>
        <NavigationSidebar
          grantha={grantha}
          granthas={granthas}
          selectedRef={selectedRef}
          onGranthaChange={(newGranthaId) => {
            onGranthaChange(newGranthaId);
            setIsNavOpen(false);
          }}
          onVerseSelect={(ref) => {
            onVerseSelect(ref);
            setIsNavOpen(false);
          }}
        />
      </MobileDrawer>

      {/* Commentary Bottom Sheet */}
      <BottomSheet
        isOpen={commentaryOpen}
        onClose={() => updateCommentaryOpen(false)}
        title={grantha.commentaries?.[0]?.commentary_title || "Commentary"}
        subtitle={grantha.commentaries?.[0]?.commentator?.devanagari}
        verseRef={selectedRef}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
      >
        <CommentaryPanel
          grantha={grantha}
          selectedRef={selectedRef}
          updateHash={(granthaId, verseRef, commentaries) =>
            updateHash(granthaId, verseRef, commentaries)
          }
          availableGranthaIds={granthas.map((g) => g.id)}
          granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
          granthaIdToLatinTitle={granthaIdToLatinTitle}
          hideHeader={true}
        />
      </BottomSheet>
    </div>
  );
}