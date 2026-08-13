"use client";

import { useState, useEffect, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import NavigationSidebar from "@/components/NavigationSidebar";
import GranthaSelector from "@/components/GranthaSelector";
import TextContent from "@/components/TextContent";
import CommentaryPanel from "@/components/CommentaryPanel";
import MobileLayout from "@/components/MobileLayout";
import TabletLayout from "@/components/TabletLayout";
import { useVerseHash } from "@/hooks/useVerseHash";
import { useAvailableGranthas } from "@/hooks/useGrantha";
import { useGranthaLoader } from "@/hooks/useGranthaLoader";
import {
  getFirstMainPassageRef,
  validateAndNormalizeHash,
} from "@/lib/hashUtils";
import { getAllPassagesForNavigation, hasCommentary } from "@/lib/data";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import InvalidVerseModal from "@/components/InvalidVerseModal";

export default function Home() {
  // Media queries for responsive design
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");

  const [showInvalidVerseModal, setShowInvalidVerseModal] = useState(false);
  const [invalidVerseTitle, setInvalidVerseTitle] = useState("");
  const [invalidVerseMessageLines, setInvalidVerseMessageLines] =
    useState<string>("");

  // State for resize handle dragging
  const [isDraggingLeftHandle, setIsDraggingLeftHandle] = useState(false);
  const [isDraggingRightHandle, setIsDraggingRightHandle] = useState(false);

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

  // Two-panel sizes for commentary-less granthas (nav | text). Stored under a
  // separate key so a 2-length array never corrupts the 3-panel "panelSizes".
  const [twoPanelSizes, setTwoPanelSizes] = useState<number[]>(() => {
    if (typeof window === "undefined") return [20, 80];
    try {
      const saved = localStorage.getItem("panelSizesNoCommentary");
      return saved ? JSON.parse(saved) : [20, 80];
    } catch (e) {
      console.error("Failed to load no-commentary panel sizes:", e);
      return [20, 80];
    }
  });

  // Load available granthas
  const {
    data: granthas = [],
    isLoading: granthasLoading,
    error: granthasError,
  } = useAvailableGranthas();

  // Get current state from URL hash
  const {
    granthaId,
    verseRef,
    editionId,
    commentaryOpen,
    subcommentaryIds,
    updateHash,
    updateCommentaryOpen,
    updateSubcommentary,
  } = useVerseHash(granthas[0]?.id || "isavasya-upanishad", "1");

  // Load current grantha data via the new loader hook
  const {
    grantha: currentGrantha,
    isLoading: isGranthaLoading,
    error: granthaError,
    loadPart,
    isLoadingPart,
  } = useGranthaLoader(granthaId, editionId);

  // Handle grantha changes - jump to first main passage when appropriate
  useEffect(() => {
    if (!currentGrantha) return;

    // Ensure currentGrantha data matches the current granthaId
    if (currentGrantha.grantha_id !== granthaId) return;

    // Check if this is a default verse ref (initial load with no specific verse)
    const isDefaultVerseRef = verseRef === "1";

    // Jump to first main passage when the current ref is the "1" sentinel —
    // true on first load and on grantha switches via the selector (which
    // navigate with ref "1"). Reference-link targets with a real ref are
    // preserved by not jumping.
    if (isDefaultVerseRef) {
      const firstMainRef = getFirstMainPassageRef(currentGrantha);
      // Only update if we're not already at the first main passage
      if (verseRef !== firstMainRef) {
        updateHash(granthaId, firstMainRef, editionId);
      }
    }
    // editionId intentionally excluded: switching editions re-loads the grantha
    // (so this effect re-runs) but must NOT jump away from the current verse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granthaId, currentGrantha]);

  // Validate verse ref when it changes
  useEffect(() => {
    if (!currentGrantha) {
      return;
    }

    // Skip validation for default verse ref "1" - grantha change effect handles this
    if (verseRef === "1") {
      return;
    }

    // For multi-part granthas, defer validation only when the ref's section has
    // a part file that hasn't loaded yet (the passage may appear once it loads).
    // A ref that is absent while its section is fully loaded is genuinely
    // invalid for this edition — important after an edition switch, where a ref
    // valid in one edition (e.g. prefatory "0.0") may not exist in another.
    if (currentGrantha.parts) {
      const allPassages = getAllPassagesForNavigation(currentGrantha);
      if (!allPassages.some((p) => p.ref === verseRef)) {
        const topLevelRef = verseRef.split(".")[0];
        const hasUnloadedPartForSection = currentGrantha.parts.some(
          (p) =>
            p.id === topLevelRef &&
            !allPassages.some((a) => a.ref === p.first_ref)
        );
        if (hasUnloadedPartForSection) {
          return;
        }
      }
    }

    const normalized = validateAndNormalizeHash(
      { granthaId, verseRef, editionId, commentaryOpen },
      currentGrantha,
    );

    // If verse ref (or edition) was invalid, show modal and correct the URL,
    // always rebuilding from current state — never from a stale snapshot that
    // could carry the wrong edition.
    if (normalized.needsCorrection) {
      const granthaTitle =
        granthaIdToDevanagariTitle[granthaId] ||
        granthaIdToLatinTitle[granthaId] ||
        granthaId;
      setInvalidVerseTitle("उक्तनिर्देशः नोपलभ्यते"); // "Passage not found"
      setInvalidVerseMessageLines(`${granthaTitle} ${verseRef}`);
      setShowInvalidVerseModal(true);

      // Revert to a valid state using the corrected ref/edition from the
      // current grantha (first main passage for bad refs; default edition for
      // an edition this grantha doesn't have). The "" sentinel drops a stale
      // ?e= when the corrected edition is undefined.
      const firstMainRef = getFirstMainPassageRef(currentGrantha);
      updateHash(
        granthaId,
        normalized.verseRef ?? firstMainRef,
        normalized.editionId ?? "",
        commentaryOpen,
        true,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGrantha, verseRef]);

  // Effect to load the correct part(s) of a multi-part grantha based on the verseRef.
  useEffect(() => {
    if (!currentGrantha || !currentGrantha.parts || verseRef === "1") {
      return;
    }

    const refParts = verseRef.split(".");
    if (refParts.length === 0) return;

    const topLevelRef = refParts[0];

    // A structural section can span multiple part files. Load all unloaded files for the section.
    const sectionParts = currentGrantha.parts.filter(
      (p) => p.id === topLevelRef,
    );
    if (sectionParts.length === 0) {
      console.warn(`Could not find any parts for topLevelRef: ${topLevelRef}`);
      return;
    }

    const loadedPassageRefs = new Set(
      currentGrantha.passages.map((p) => p.ref),
    );
    for (const part of sectionParts) {
      if (!loadedPassageRefs.has(part.first_ref)) {
        loadPart(part.first_ref);
      }
    }
  }, [currentGrantha, verseRef, loadPart]);

  // Handle grantha change — verse ref "1" triggers the grantha-change effect to
  // skip to the first main passage of the new grantha. Edition resets to the
  // new grantha's default (updateHash drops it on grantha change).
  const handleGranthaChange = (newGranthaId: string) => {
    updateHash(newGranthaId, "1");
  };

  // Handle verse selection
  const handleVerseSelect = (ref: string) => {
    if (isMobile) {
      // Only open the commentary bottom sheet when the grantha actually has
      // commentary to show; otherwise the sheet would render its empty state.
      updateHash(granthaId, ref, editionId, hasCommentary(currentGrantha));
    } else {
      updateHash(granthaId, ref, editionId);
    }
  };

  // Handle commentary (edition) switch
  const handleEditionChange = (newEditionId: string) => {
    updateHash(granthaId, verseRef, newEditionId);
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

  // Handle panel size changes for the commentary-less (two-panel) layout
  const handleTwoPanelLayout = (sizes: number[]) => {
    setTwoPanelSizes(sizes);
    try {
      localStorage.setItem("panelSizesNoCommentary", JSON.stringify(sizes));
    } catch (e) {
      console.error("Failed to save no-commentary panel sizes:", e);
    }
  };

  const granthaIdToDevanagariTitle = useMemo(
    () => Object.fromEntries(granthas.map((g) => [g.id, g.title_deva])),
    [granthas],
  );

  const granthaIdToLatinTitle = useMemo(
    () => Object.fromEntries(granthas.map((g) => [g.id, g.title_iast])),
    [granthas],
  );

  // Close modal handler
  const handleCloseInvalidVerseModal = () => {
    setShowInvalidVerseModal(false);
    setInvalidVerseTitle("");
    setInvalidVerseMessageLines("");
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

  if (isGranthaLoading || !currentGrantha) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Loading {granthaId}...</p>
      </div>
    );
  }

  // Render mobile layout for screens <768px
  if (isMobile) {
    return (
      <>
        <MobileLayout
          grantha={currentGrantha}
          granthas={granthas}
          selectedRef={verseRef}
          editionId={editionId}
          commentaryOpen={commentaryOpen}
          onGranthaChange={handleGranthaChange}
          onVerseSelect={handleVerseSelect}
          onEditionChange={handleEditionChange}
          updateHash={updateHash}
          updateCommentaryOpen={updateCommentaryOpen}
          activeSubcommentaryIds={subcommentaryIds}
          onSubcommentaryToggle={updateSubcommentary}
          granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
          granthaIdToLatinTitle={granthaIdToLatinTitle}
          loadPart={loadPart}
          isLoadingPart={isLoadingPart}
        />
        <InvalidVerseModal
          isOpen={showInvalidVerseModal}
          onClose={handleCloseInvalidVerseModal}
          title={invalidVerseTitle}
          messageLines={invalidVerseMessageLines}
        />
      </>
    );
  }

  // Render tablet layout for screens 768px-1024px
  if (isTablet) {
    return (
      <>
        <TabletLayout
          grantha={currentGrantha}
          granthas={granthas}
          selectedRef={verseRef}
          editionId={editionId}
          onGranthaChange={handleGranthaChange}
          onVerseSelect={handleVerseSelect}
          onEditionChange={handleEditionChange}
          updateHash={updateHash}
          activeSubcommentaryIds={subcommentaryIds}
          onSubcommentaryToggle={updateSubcommentary}
          granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
          granthaIdToLatinTitle={granthaIdToLatinTitle}
          loadPart={loadPart}
          isLoadingPart={isLoadingPart}
        />
        <InvalidVerseModal
          isOpen={showInvalidVerseModal}
          onClose={handleCloseInvalidVerseModal}
          title={invalidVerseTitle}
          messageLines={invalidVerseMessageLines}
        />
      </>
    );
  }

  // Render desktop layout for screens >1024px (default 3-column layout)
  const showCommentaryPane = hasCommentary(currentGrantha);

  const textContentPanel = (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-gray-100 bg-white flex flex-col items-center justify-start pt-5 px-6 min-h-[5.5rem]">
        <GranthaSelector
          granthas={granthas}
          selectedGranthaId={granthaId}
          onSelect={handleGranthaChange}
          triggerClassName="inline-flex items-center gap-2 font-serif text-[1.625rem] font-semibold bg-transparent cursor-pointer hover:opacity-70 transition-opacity"
        />
      </div>
      <div className="flex-1 min-h-0">
        <TextContent
          grantha={currentGrantha}
          selectedRef={verseRef}
          onVerseSelect={handleVerseSelect}
          title={currentGrantha.canonical_title}
          hideTitle
          loadPart={loadPart}
          isLoadingPart={isLoadingPart}
        />
      </div>
    </div>
  );

  const navPanel = (
    <NavigationSidebar
      grantha={currentGrantha}
      selectedRef={verseRef}
      onVerseSelect={handleVerseSelect}
      loadPart={loadPart}
      showWordmark
    />
  );

  return (
    <main className="h-screen bg-white">
      {showCommentaryPane ? (
        <PanelGroup
          direction="horizontal"
          className="h-full"
          onLayout={handlePanelLayout}
        >
          {/* Left Navigation Panel */}
          <Panel defaultSize={panelSizes[0]} minSize={15} maxSize={35}>
            {navPanel}
          </Panel>

          {/* Resize Handle - invisible but functional */}
          <PanelResizeHandle
            className={`w-0.5 bg-gray-100 hover:bg-blue-500 transition-colors ${isDraggingLeftHandle ? "bg-blue-500" : ""}`}
            onDragging={setIsDraggingLeftHandle}
          />

          {/* Center Content Panel */}
          <Panel defaultSize={panelSizes[1]} minSize={30}>
            {textContentPanel}
          </Panel>

          {/* Resize Handle */}
          <PanelResizeHandle
            className={`w-0.5 bg-gray-100 hover:bg-blue-500 transition-colors ${isDraggingRightHandle ? "bg-blue-500" : ""}`}
            onDragging={setIsDraggingRightHandle}
          />

          {/* Right Commentary Panel */}
          <Panel defaultSize={panelSizes[2]} minSize={20} maxSize={40}>
            <CommentaryPanel
              grantha={currentGrantha}
              selectedRef={verseRef}
              selectedEditionId={editionId}
              onEditionChange={handleEditionChange}
              updateHash={updateHash}
              activeSubcommentaryIds={subcommentaryIds}
              onSubcommentaryToggle={updateSubcommentary}
              availableGranthaIds={granthas.map((g) => g.id)}
              granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
              granthaIdToLatinTitle={granthaIdToLatinTitle}
            />
          </Panel>
        </PanelGroup>
      ) : (
        <PanelGroup
          direction="horizontal"
          className="h-full"
          onLayout={handleTwoPanelLayout}
        >
          {/* Left Navigation Panel */}
          <Panel
            defaultSize={twoPanelSizes[0]}
            minSize={15}
            maxSize={35}
          >
            {navPanel}
          </Panel>

          {/* Resize Handle */}
          <PanelResizeHandle
            className={`w-0.5 bg-gray-100 hover:bg-blue-500 transition-colors ${isDraggingLeftHandle ? "bg-blue-500" : ""}`}
            onDragging={setIsDraggingLeftHandle}
          />

          {/* Text Content Panel — fills remaining width */}
          <Panel defaultSize={twoPanelSizes[1]} minSize={40}>
            {textContentPanel}
          </Panel>
        </PanelGroup>
      )}
      <InvalidVerseModal
        isOpen={showInvalidVerseModal}
        onClose={handleCloseInvalidVerseModal}
        title={invalidVerseTitle}
        messageLines={invalidVerseMessageLines}
      />
    </main>
  );
}
