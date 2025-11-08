"use client";

import { useState, useEffect, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import NavigationSidebar from "@/components/NavigationSidebar";
import TextContent from "@/components/TextContent";
import CommentaryPanel from "@/components/CommentaryPanel";
import MobileLayout from "@/components/MobileLayout";
import TabletLayout from "@/components/TabletLayout";
import { useVerseHash } from "@/hooks/useVerseHash";
import { useGrantha, useAvailableGranthas } from "@/hooks/useGrantha";
import { getFirstMainPassageRef, validateAndNormalizeHash } from "@/lib/hashUtils";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export default function Home() {
  // Media queries for responsive design
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");

  // Load panel sizes from localStorage
  const [panelSizes, setPanelSizes] = useState<number[]>(() => {
    if (typeof window === "undefined") return [20, 50, 30];
    try {
      const saved = localStorage.getItem("panelSizes");
      return saved ? JSON.parse(saved) : [20, 50, 30];
    } catch (e) {
      console.error("Failed to load panel sizes:", e);
      return [20, 50, 30];
    }
  });

  // Load available granthas
  const {
    data: granthas = [],
    isLoading: granthasLoading,
    error: granthasError,
  } = useAvailableGranthas();

  // Get current state from URL hash
  const { granthaId, verseRef, commentaries, updateHash } = useVerseHash(
    granthas[0]?.id || "isavasya-upanishad",
    "1"
  );

  // Load current grantha data via React Query
  const {
    data: currentGrantha,
    isLoading: granthaLoading,
    error: granthaError,
  } = useGrantha(granthaId);

  // Track previous grantha to detect changes
  const previousGranthaId = useRef<string | null>(null);

  // Handle grantha changes - jump to first main passage when appropriate
  useEffect(() => {
    if (!currentGrantha) return;

    // Ensure currentGrantha data matches the current granthaId
    if (currentGrantha.grantha_id !== granthaId) return;

    // Check if grantha changed (not first load)
    const granthaChanged = previousGranthaId.current !== null && previousGranthaId.current !== granthaId;

    // Check if this is a default verse ref (initial load with no specific verse)
    const isDefaultVerseRef = verseRef === "1";

    // Update the ref for next comparison
    previousGranthaId.current = granthaId;

    // Jump to first main passage only if:
    // 1. First load with default verse ref (skip prefatory), OR
    // 2. Grantha was switched AND the current verseRef doesn't exist in the new grantha
    //    (this handles navigation from dropdown but preserves reference link targets)
    if (isDefaultVerseRef || (granthaChanged && verseRef === "1")) {
      const firstMainRef = getFirstMainPassageRef(currentGrantha);
      // Only update if we're not already at the first main passage
      if (verseRef !== firstMainRef) {
        updateHash(granthaId, firstMainRef, commentaries);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granthaId, currentGrantha]);

  // Validate verse ref when it changes
  useEffect(() => {
    if (!currentGrantha) return;

    // Skip validation for default verse ref "1" - grantha change effect handles this
    if (verseRef === "1") return;

    const normalized = validateAndNormalizeHash(
      { granthaId, verseRef, commentaries },
      currentGrantha
    );

    // If verse ref was invalid, update URL to corrected version
    if (normalized.needsCorrection) {
      updateHash(granthaId, normalized.verseRef, commentaries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGrantha, verseRef]);

  // Handle grantha change
  const handleGranthaChange = (newGranthaId: string) => {
    // Set verse ref to "1" which triggers grantha change effect to skip to first main passage
    updateHash(newGranthaId, "1", commentaries);
  };

  // Handle verse selection
  const handleVerseSelect = (ref: string) => {
    updateHash(granthaId, ref, commentaries);
  };

  // Handle panel size changes
  const handlePanelLayout = (sizes: number[]) => {
    setPanelSizes(sizes);
    try {
      localStorage.setItem("panelSizes", JSON.stringify(sizes));
    } catch (e) {
      console.error("Failed to save panel sizes:", e);
    }
  };

  const granthaIdToDevanagariTitle = Object.fromEntries(
    granthas.map(g => [g.id, g.title_deva])
  );

  const granthaIdToLatinTitle = Object.fromEntries(
    granthas.map(g => [g.id, g.title_iast])
  );

  // Error states
  if (granthasError) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load granthas list</p>
          <p className="text-gray-500 text-sm">
            {granthasError instanceof Error
              ? granthasError.message
              : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  if (granthaError) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-2">
            Failed to load grantha: {granthaId}
          </p>
          <p className="text-gray-500 text-sm">
            {granthaError instanceof Error
              ? granthaError.message
              : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  // Loading states
  if (granthasLoading || !granthas.length) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Loading granthas...</p>
      </div>
    );
  }

  if (granthaLoading || !currentGrantha) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Loading {granthaId}...</p>
      </div>
    );
  }

  // Render mobile layout for screens <768px
  if (isMobile) {
    return (
      <MobileLayout
        grantha={currentGrantha}
        granthas={granthas}
        selectedRef={verseRef}
        commentaries={commentaries}
        onGranthaChange={handleGranthaChange}
        onVerseSelect={handleVerseSelect}
        updateHash={updateHash}
        granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
        granthaIdToLatinTitle={granthaIdToLatinTitle}
      />
    );
  }

  // Render tablet layout for screens 768px-1024px
  if (isTablet) {
    return (
      <TabletLayout
        grantha={currentGrantha}
        granthas={granthas}
        selectedRef={verseRef}
        commentaries={commentaries}
        onGranthaChange={handleGranthaChange}
        onVerseSelect={handleVerseSelect}
        updateHash={updateHash}
        granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
        granthaIdToLatinTitle={granthaIdToLatinTitle}
      />
    );
  }

  // Render desktop layout for screens >1024px (default 3-column layout)
  return (
    <main className="h-screen bg-white flex flex-col">
      <div className="relative h-full">
        <PanelGroup
          direction="horizontal"
          className="h-full"
          onLayout={handlePanelLayout}
        >
          {/* Left Navigation Panel */}
          <Panel defaultSize={panelSizes[0]} minSize={15} maxSize={35}>
            <NavigationSidebar
              grantha={currentGrantha}
              granthas={granthas}
              selectedRef={verseRef}
              onGranthaChange={handleGranthaChange}
              onVerseSelect={handleVerseSelect}
            />
          </Panel>

          {/* Resize Handle - invisible but functional */}
          <PanelResizeHandle className="w-0.5" />

          {/* Center Content Panel */}
          <Panel defaultSize={panelSizes[1]} minSize={30}>
            <TextContent
              grantha={currentGrantha}
              selectedRef={verseRef}
              onVerseSelect={handleVerseSelect}
              title={currentGrantha.canonical_title}
            />
          </Panel>

          {/* Resize Handle */}
          <PanelResizeHandle className="w-0.5 bg-gray-100 hover:bg-blue-500 transition-colors" />

          {/* Right Commentary Panel */}
          <Panel defaultSize={panelSizes[2]} minSize={20} maxSize={40}>
            <CommentaryPanel
              grantha={currentGrantha}
              selectedRef={verseRef}
              updateHash={updateHash}
              availableGranthaIds={granthas.map(g => g.id)}
              granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
              granthaIdToLatinTitle={granthaIdToLatinTitle}
            />
          </Panel>
        </PanelGroup>
      </div>
    </main>
  );
}
