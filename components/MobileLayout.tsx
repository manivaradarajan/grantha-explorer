"use client";

import { useState, useMemo } from "react";
import { Grantha, GranthaMetadata, getAllPassagesForNavigation } from "@/lib/data";
import NavigationSidebar from "./NavigationSidebar";
import TextContent from "./TextContent";
import CommentaryPanel from "./CommentaryPanel";
import MobileDrawer from "./MobileDrawer";
import BottomSheet from "./BottomSheet";
import AppWordmark from "./AppWordmark";
import GranthaSelector from "./GranthaSelector";

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
  granthaIdToDevanagariTitle: Record<string, string>;
  granthaIdToLatinTitle: Record<string, string>;
  loadPart: (partId: string) => Promise<void>;
  isLoadingPart: boolean;
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
  loadPart,
  isLoadingPart,
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
    <main className="h-screen flex flex-col bg-white">
      <header className="flex items-center gap-4 px-4 py-3 bg-white">
        <h1 className="sr-only">Grantha Explorer</h1>
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

        {/* Wordmark */}
        <div className="flex-1 flex items-center justify-center">
          <AppWordmark aria-hidden="true" />
        </div>

        {/* Spacer to balance hamburger button */}
        <div className="min-w-[44px]" aria-hidden="true"></div>
      </header>

      {/* Main Content - Full Width Text */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="shrink-0 border-b border-gray-100 bg-white flex items-center justify-center px-6 min-h-[5.5rem]">
            <GranthaSelector
              granthas={granthas}
              selectedGranthaId={grantha.grantha_id}
              onSelect={onGranthaChange}
              triggerClassName="inline-flex items-center gap-2 font-serif text-2xl font-semibold bg-transparent cursor-pointer hover:opacity-70 transition-opacity"
            />
          </div>
          <div className="flex-1 min-h-0">
            <TextContent
              grantha={grantha}
              selectedRef={selectedRef}
              onVerseSelect={onVerseSelect}
              title={grantha.canonical_title}
              hideTitle
              loadPart={loadPart}
              isLoadingPart={isLoadingPart}
            />
          </div>
        </div>
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
          loadPart={loadPart}
          showGranthaSelector
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
          selectedCommentaryIds={commentaries}
          updateHash={updateHash}
          availableGranthaIds={granthas.map((g) => g.id)}
          granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
          granthaIdToLatinTitle={granthaIdToLatinTitle}
          hideHeader={true}
        />
      </BottomSheet>
    </main>
  );
}