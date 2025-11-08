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
  onGranthaChange: (granthaId: string) => void;
  onVerseSelect: (ref: string) => void;
  updateHash: (granthaId: string, verseRef: string, commentaries: string[]) => void;
  granthaIdToDevanagariTitle: { [key: string]: string };
  granthaIdToLatinTitle: { [key: string]: string };
}

export default function TabletLayout({
  grantha,
  granthas,
  selectedRef,
  commentaries,
  onGranthaChange,
  onVerseSelect,
  updateHash,
  granthaIdToDevanagariTitle,
  granthaIdToLatinTitle,
}: TabletLayoutProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);
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
      {/* Tablet Header with Hamburger Menu */}
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
        <h1 className="text-xl font-semibold font-serif">
          {grantha.canonical_title}
        </h1>
      </div>

      {/* 2-Column Layout: Primary Text + Commentary */}
      <div className="flex-1 overflow-hidden">
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
            />
          </Panel>

          {/* Resize Handle */}
          <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-500 transition-colors" />

          {/* Right Commentary Panel */}
          <Panel defaultSize={panelSizes[1]} minSize={30} maxSize={60}>
            <CommentaryPanel
              grantha={grantha}
              selectedRef={selectedRef}
              updateHash={(granthaId, verseRef) =>
                updateHash(granthaId, verseRef, commentaries)
              }
              availableGranthaIds={granthas.map((g) => g.id)}
              granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
              granthaIdToLatinTitle={granthaIdToLatinTitle}
            />
          </Panel>
        </PanelGroup>
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
    </div>
  );
}
