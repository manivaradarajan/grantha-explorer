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

export default function Home() {
  const [granthas, setGranthas] = useState<GranthaMetadata[]>([]);
  const [currentGrantha, setCurrentGrantha] = useState<Grantha | null>(null);
  const [selectedRef, setSelectedRef] = useState<string>("1");
  const [loading, setLoading] = useState(true);

  // Load available granthas on mount
  useEffect(() => {
    async function loadGranthas() {
      const available = await getAvailableGranthas();
      setGranthas(available);

      // Load first grantha by default (isavasya)
      if (available.length > 0) {
        const firstGrantha = await loadGrantha(available[0].id);
        setCurrentGrantha(firstGrantha);
        // Set first passage as selected
        if (firstGrantha.passages.length > 0) {
          setSelectedRef(firstGrantha.passages[0].ref);
        } else if (firstGrantha.prefatory_material.length > 0) {
          setSelectedRef(firstGrantha.prefatory_material[0].ref);
        }
      }
      setLoading(false);
    }

    loadGranthas();
  }, []);

  // Handle grantha change
  const handleGranthaChange = async (granthaId: string) => {
    setLoading(true);
    const grantha = await loadGrantha(granthaId);
    setCurrentGrantha(grantha);
    // Reset to first passage
    if (grantha.passages.length > 0) {
      setSelectedRef(grantha.passages[0].ref);
    } else if (grantha.prefatory_material.length > 0) {
      setSelectedRef(grantha.prefatory_material[0].ref);
    }
    setLoading(false);
  };

  // Handle verse selection
  const handleVerseSelect = (ref: string) => {
    setSelectedRef(ref);
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
      {/* Header row with all three column headers */}
      <div className="flex border-b border-gray-300">
        <div className="w-[20%] min-w-[15%] max-w-[35%] p-4 bg-[#f8f9fa]">
          <h2 className="text-lg font-semibold font-serif">अनुक्रमणिका</h2>
        </div>
        <div className="flex-1 p-4 border-r-2 border-gray-300 text-center">
          <h1 className="text-xl font-semibold font-serif">
            {currentGrantha.canonical_title}
          </h1>
        </div>
        <div className="w-[30%] min-w-[20%] max-w-[40%] p-4 text-center">
          <h2 className="text-lg font-semibold font-serif">
            {currentGrantha.commentaries?.[0]?.commentary_title || "भाष्यम्"}
          </h2>
          {currentGrantha.commentaries?.[0] && (
            <div className="text-sm text-gray-600 mt-1">
              {currentGrantha.commentaries[0].commentator.devanagari}
            </div>
          )}
        </div>
      </div>

      {/* Main content with resizable panels */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Navigation Panel */}
          <Panel defaultSize={20} minSize={15} maxSize={35}>
            <NavigationSidebar
              grantha={currentGrantha}
              granthas={granthas}
              selectedRef={selectedRef}
              onGranthaChange={handleGranthaChange}
              onVerseSelect={handleVerseSelect}
            />
          </Panel>

          {/* Resize Handle - invisible but functional */}
          <PanelResizeHandle className="w-0.5" />

          {/* Center Content Panel */}
          <Panel defaultSize={50} minSize={30}>
            <TextContent
              grantha={currentGrantha}
              selectedRef={selectedRef}
              onVerseSelect={handleVerseSelect}
            />
          </Panel>

          {/* Resize Handle */}
          <PanelResizeHandle className="w-0.5 bg-gray-100 hover:bg-blue-500 transition-colors" />

          {/* Right Commentary Panel */}
          <Panel defaultSize={30} minSize={20} maxSize={40}>
            <CommentaryPanel grantha={currentGrantha} selectedRef={selectedRef} />
          </Panel>
        </PanelGroup>
      </div>
    </main>
  );
}
