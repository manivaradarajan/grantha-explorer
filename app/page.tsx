"use client";

import { useState, useEffect, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import NavigationSidebar from "@/components/NavigationSidebar";
import TextContent from "@/components/TextContent";
import CommentaryPanel from "@/components/CommentaryPanel";
import { useVerseHash } from "@/hooks/useVerseHash";
import { useGrantha, useAvailableGranthas } from "@/hooks/useGrantha";
import { getFirstMainPassageRef, validateAndNormalizeHash } from "@/lib/hashUtils";

export default function Home() {
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

  // Validate and correct verse ref when grantha loads
  useEffect(() => {
    if (!currentGrantha) return;

    // Check if grantha changed (first time or switched)
    const granthaChanged = previousGranthaId.current !== null && previousGranthaId.current !== granthaId;

    // Update the ref for next comparison
    previousGranthaId.current = granthaId;

    // If grantha changed, jump to first main passage (skip prefatory)
    if (granthaChanged) {
      const firstMainRef = getFirstMainPassageRef(currentGrantha);
      updateHash(granthaId, firstMainRef, commentaries);
      return;
    }

    // Otherwise, validate current verse ref
    const normalized = validateAndNormalizeHash(
      { granthaId, verseRef, commentaries },
      currentGrantha
    );

    // If verse ref was invalid, update URL to corrected version
    if (normalized.needsCorrection) {
      updateHash(granthaId, normalized.verseRef, commentaries);
    }
  }, [currentGrantha, granthaId, verseRef, commentaries, updateHash]);

  // Handle grantha change (simplified - just update hash)
  const handleGranthaChange = async (newGranthaId: string) => {
    // Optimistically get first verse (will be validated when grantha loads)
    const firstRef = "1";
    updateHash(newGranthaId, firstRef, commentaries);
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
            <CommentaryPanel grantha={currentGrantha} selectedRef={verseRef} />
          </Panel>
        </PanelGroup>
      </div>
    </main>
  );
}
