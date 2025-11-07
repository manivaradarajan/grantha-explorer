"use client";

import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import NavigationSidebar from "@/components/NavigationSidebar";
import TextContent from "@/components/TextContent";
import CommentaryPanel from "@/components/CommentaryPanel";
import {
  getAvailableGranthas,
  loadGrantha,
  Grantha,
  GranthaMetadata,
} from "@/lib/data";
import { useVerseHash } from "@/hooks/useVerseHash";
import { getFirstVerseRef } from "@/lib/hashUtils";

export default function Home() {
  const [granthas, setGranthas] = useState<GranthaMetadata[]>([]);
  const [granthaDataMap, setGranthaDataMap] = useState<Map<string, Grantha>>(
    new Map()
  );
  const [currentGrantha, setCurrentGrantha] = useState<Grantha | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Load available granthas on mount
  useEffect(() => {
    async function loadGranthas() {
      const available = await getAvailableGranthas();
      setGranthas(available);

      // Load first grantha by default
      if (available.length > 0) {
        const firstGrantha = await loadGrantha(available[0].id);
        const dataMap = new Map<string, Grantha>();
        dataMap.set(available[0].id, firstGrantha);
        setGranthaDataMap(dataMap);
        setCurrentGrantha(firstGrantha);
      }
      setLoading(false);
    }

    loadGranthas();
  }, []);

  // Use hash-based routing
  const { granthaId, verseRef, commentaries, updateHash } = useVerseHash(
    granthas.map((g) => g.id),
    granthas[0]?.id || "isavasya-upanishad",
    granthaDataMap
  );

  // Load grantha when granthaId changes (from hash)
  useEffect(() => {
    async function loadCurrentGrantha() {
      // Check if already loaded
      if (currentGrantha?.grantha_id === granthaId) {
        return;
      }

      // Check if in cache
      const cached = granthaDataMap.get(granthaId);
      if (cached) {
        setCurrentGrantha(cached);
        return;
      }

      // Load from server
      setLoading(true);
      try {
        const grantha = await loadGrantha(granthaId);
        setGranthaDataMap((prev) => new Map(prev).set(granthaId, grantha));
        setCurrentGrantha(grantha);
      } catch (error) {
        console.error("Failed to load grantha:", error);
      } finally {
        setLoading(false);
      }
    }

    if (granthaId && granthas.length > 0) {
      loadCurrentGrantha();
    }
  }, [granthaId, granthas, currentGrantha, granthaDataMap]);

  // Handle grantha change
  const handleGranthaChange = async (newGranthaId: string) => {
    const grantha =
      granthaDataMap.get(newGranthaId) || (await loadGrantha(newGranthaId));
    if (!granthaDataMap.has(newGranthaId)) {
      setGranthaDataMap((prev) => new Map(prev).set(newGranthaId, grantha));
    }
    const firstRef = getFirstVerseRef(grantha);
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

  if (loading || !currentGrantha) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <main className="h-screen bg-white flex flex-col">
      {/* Continuous horizontal border that spans all columns */}
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
