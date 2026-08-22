"use client";

import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Grantha, GranthaMetadata, hasCommentary } from "@/lib/data";
import NavigationSidebar from "./NavigationSidebar";
import TextContent from "./TextContent";
import CommentaryPanel from "./CommentaryPanel";
import MobileDrawer from "./MobileDrawer";
import AppWordmark from "./AppWordmark";
import GranthaSelector from "./GranthaSelector";

interface TabletLayoutProps {
  grantha: Grantha;
  granthas: GranthaMetadata[];
  selectedRef: string;
  editionId?: string;
  onGranthaChange: (granthaId: string) => void;
  onVerseSelect: (ref: string) => void;
  onEditionChange: (editionId: string) => void;
  updateHash: (granthaId: string, verseRef: string, editionId?: string) => void;
  activeSubcommentaryIds?: string;
  onSubcommentaryToggle: (subcommentaryId: string, isOpen: boolean) => void;
  /** Per-grantha target metadata for the edition-aware link gate. */
  granthaById: Record<string, { editions?: { edition_id: string }[]; default_school?: string }>;
  granthaIdToDevanagariTitle: Record<string, string>;
  granthaIdToLatinTitle: Record<string, string>;
  loadPart: (partId: string) => Promise<void>;
  isLoadingPart: boolean;
}

export default function TabletLayout({
  grantha,
  granthas,
  selectedRef,
  editionId,
  onGranthaChange,
  onVerseSelect,
  onEditionChange,
  updateHash,
  activeSubcommentaryIds,
  onSubcommentaryToggle,
  granthaById,
  granthaIdToDevanagariTitle,
  granthaIdToLatinTitle,
  loadPart,
  isLoadingPart,
}: TabletLayoutProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  // Commentary is visible by default at tablet widths; the header icon is an
  // optional collapse. Deliberately not wired to the URL `commentaryOpen`
  // param (which drives the mobile bottom sheet) so two columns are the
  // default state whenever the width permits them.
  const [commentaryCollapsed, setCommentaryCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [prevGranthaId, setPrevGranthaId] = useState(grantha.grantha_id);
  const [panelSizes, setPanelSizes] = useState<number[]>(() => {
    if (typeof window === "undefined") return [60, 40];
    try {
      const saved = localStorage.getItem("tabletPanelSizes");
      return saved ? JSON.parse(saved) : [60, 40];
    } catch (e) {
      console.error("Failed to load tablet panel sizes:", e);
      return [60, 40];
    }
  });

  // Granthas without commentary never render a commentary panel or toggle.
  const hasCommentaryPane = hasCommentary(grantha);

  // Commentary is open by default for every new grantha; a manual collapse is
  // scoped to the current text, not carried across grantha switches.
  if (prevGranthaId !== grantha.grantha_id) {
    setPrevGranthaId(grantha.grantha_id);
    setCommentaryCollapsed(false);
  }

  const handlePanelLayout = (sizes: number[]) => {
    setPanelSizes(sizes);
    try {
      localStorage.setItem("tabletPanelSizes", JSON.stringify(sizes));
    } catch (e) {
      console.error("Failed to save tablet panel sizes:", e);
    }
  };

  const textPanel = (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-gray-100 bg-white flex flex-col items-center justify-start pt-7 px-6 min-h-[5.5rem]">
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
  );

  return (
    <main className="h-screen flex flex-col bg-white">
      <header className="flex items-center gap-4 px-4 py-3 bg-white">
        <h1 className="sr-only">Grantha Explorer</h1>
        {/* Hamburger Menu Button */}
        <button
          onClick={() => setIsNavOpen(true)}
          className="px-2 pt-3 pb-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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
        <div className="flex-1 flex items-center">
          <AppWordmark aria-hidden="true" className="mt-5" />
        </div>

        {/* Commentary Toggle Button — optional collapse; visible by default.
            Hidden entirely for granthas with no commentary. */}
        {hasCommentaryPane && (
          <button
            onClick={() => setCommentaryCollapsed((c) => !c)}
            className={`p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-sm font-medium ${
              commentaryCollapsed
                ? "bg-white text-gray-500 hover:bg-gray-100 border border-gray-300"
                : "bg-gray-200 text-gray-800 hover:bg-gray-300"
            }`}
            aria-label={commentaryCollapsed ? "Show commentary" : "Hide commentary"}
            aria-pressed={!commentaryCollapsed}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
              />
            </svg>
          </button>
        )}
      </header>

      {/* Content: text alone, or text + commentary side-by-side (default).
          Granthas without commentary always render text alone. */}
      <div className="flex-1 overflow-hidden">
        {hasCommentaryPane && !commentaryCollapsed ? (
          <PanelGroup
            direction="horizontal"
            className="h-full"
            onLayout={handlePanelLayout}
          >
            {/* Center Content Panel */}
            <Panel defaultSize={panelSizes[0]} minSize={40}>
              {textPanel}
            </Panel>

            {/* Resize Handle */}
            <PanelResizeHandle
              className={`w-1 bg-gray-200 ${isDragging ? 'bg-blue-500' : 'hover:bg-blue-500'} transition-colors`}
              onDragging={setIsDragging}
            />

            {/* Right Commentary Panel */}
            <Panel defaultSize={panelSizes[1]} minSize={30} maxSize={60}>
              <CommentaryPanel
                grantha={grantha}
                selectedRef={selectedRef}
                selectedEditionId={editionId}
                onEditionChange={onEditionChange}
                updateHash={updateHash}
                activeSubcommentaryIds={activeSubcommentaryIds}
                onSubcommentaryToggle={onSubcommentaryToggle}
                availableGranthaIds={granthas.map((g) => g.id)}
                granthaById={granthaById}
                granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
                granthaIdToLatinTitle={granthaIdToLatinTitle}
              />
            </Panel>
          </PanelGroup>
        ) : (
          textPanel
        )}
      </div>

      {/* Navigation Drawer */}
      <MobileDrawer isOpen={isNavOpen} onClose={() => setIsNavOpen(false)}>
        <NavigationSidebar
          grantha={grantha}
          selectedRef={selectedRef}
          onVerseSelect={(ref) => {
            onVerseSelect(ref);
            setIsNavOpen(false);
          }}
          loadPart={loadPart}
        />
      </MobileDrawer>
    </main>
  );
}
