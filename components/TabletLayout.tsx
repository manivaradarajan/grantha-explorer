"use client";

import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Grantha, GranthaMetadata } from "@/lib/data";
import NavigationSidebar from "./NavigationSidebar";
import TextContent from "./TextContent";
import CommentaryPanel from "./CommentaryPanel";
import MobileDrawer from "./MobileDrawer";

interface TabletLayoutProps {
  grantha: Grantha;
  granthas: GranthaMetadata[];
  selectedRef: string;
  commentaries: string[];
  commentaryOpen: boolean;
  onGranthaChange: (granthaId: string) => void;
  onVerseSelect: (ref: string) => void;
  updateHash: (granthaId: string, verseRef: string, commentaries: string[]) => void;
  updateCommentaryOpen: (isOpen: boolean) => void;
  granthaIdToDevanagariTitle: Record<string, string>;
  granthaIdToLatinTitle: Record<string, string>;
  loadPart: (partId: string) => Promise<void>;
  isLoadingPart: boolean;
  onScrollFocus: (ref: string) => void;
}

export default function TabletLayout({
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
  onScrollFocus,
}: TabletLayoutProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
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

  const handlePanelLayout = (sizes: number[]) => {
    setPanelSizes(sizes);
    try {
      localStorage.setItem("tabletPanelSizes", JSON.stringify(sizes));
    } catch (e) {
      console.error("Failed to save tablet panel sizes:", e);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Tablet Header with Hamburger Menu and Commentary Toggle */}
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
        <h1 className="text-xl font-semibold font-serif flex-1">
          {grantha.canonical_title}
        </h1>

        {/* Commentary Toggle Button */}
        <button
          onClick={() => updateCommentaryOpen(!commentaryOpen)}
          className={`p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-sm font-medium ${
            commentaryOpen
              ? "bg-gray-200 text-gray-800 hover:bg-gray-300"
              : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-300"
          }`}
          aria-label={commentaryOpen ? "Hide commentary" : "Show commentary"}
          aria-pressed={commentaryOpen}
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
      </div>

      {/* Content: text alone, or text + commentary side-by-side */}
      <div className="flex-1 overflow-hidden">
        {commentaryOpen ? (
          <PanelGroup
            direction="horizontal"
            className="h-full"
            onLayout={handlePanelLayout}
          >
            {/* Center Content Panel */}
            <Panel defaultSize={panelSizes[0]} minSize={40}>
              <TextContent
                grantha={grantha}
                selectedRef={selectedRef}
                onVerseSelect={onVerseSelect}
                title={grantha.canonical_title}
                hideTitle={true}
                loadPart={loadPart}
                isLoadingPart={isLoadingPart}
                onScrollFocus={onScrollFocus}
              />
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
                selectedCommentaryIds={commentaries}
                updateHash={updateHash}
                availableGranthaIds={granthas.map((g) => g.id)}
                granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
                granthaIdToLatinTitle={granthaIdToLatinTitle}
              />
            </Panel>
          </PanelGroup>
        ) : (
          <TextContent
            grantha={grantha}
            selectedRef={selectedRef}
            onVerseSelect={onVerseSelect}
            title={grantha.canonical_title}
            hideTitle={true}
            loadPart={loadPart}
            isLoadingPart={isLoadingPart}
            onScrollFocus={onScrollFocus}
          />
        )}
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
        />
      </MobileDrawer>
    </div>
  );
}
