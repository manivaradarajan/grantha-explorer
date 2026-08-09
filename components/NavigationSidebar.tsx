"use client";

import {
  Grantha,
  GranthaMetadata,
  SidebarSection,
  dropLastRefComponent,
  getSidebarFlatModel,
} from "@/lib/data";
import GranthaSelector from "./GranthaSelector";
import { useEffect, useMemo, useRef, useState } from "react";
import SidebarList from "./SidebarList";
import { getUIStrings } from "@/lib/i18n";

interface NavigationSidebarProps {
  grantha: Grantha;
  granthas: GranthaMetadata[];
  selectedRef: string;
  onGranthaChange: (granthaId: string) => void;
  onVerseSelect: (ref: string) => void;
  loadPart: (firstRef: string) => Promise<void>;
}

/** section-top delta relative to the scroll container (offsetTop is document-relative). */
function elementScrollTop(scroller: HTMLElement, el: HTMLElement): number {
  return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

export default function NavigationSidebar({
  grantha,
  granthas,
  selectedRef,
  onGranthaChange,
  onVerseSelect,
  loadPart,
}: NavigationSidebarProps) {
  const model = useMemo(() => getSidebarFlatModel(grantha), [grantha]);
  const uiStrings = getUIStrings();

  const listRef = useRef<HTMLDivElement | null>(null);
  const passageRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const lastAutoScroll = useRef<{ ref: string; found: boolean } | null>(null);
  const pendingSectionRef = useRef<string | null>(null);
  const prevGranthaId = useRef<string>(grantha.grantha_id);

  const [quickJump, setQuickJump] = useState(selectedRef);
  const [jumpError, setJumpError] = useState(false);

  // Reset ephemeral sync state when the grantha changes (refs can coincide
  // across texts; stale state must not suppress a needed sync).
  useEffect(() => {
    if (prevGranthaId.current !== grantha.grantha_id) {
      prevGranthaId.current = grantha.grantha_id;
      lastAutoScroll.current = null;
      pendingSectionRef.current = null;
      setQuickJump(selectedRef);
      setJumpError(false);
    }
  }, [grantha.grantha_id, grantha, selectedRef]);

  // Keep the quick-jump display in sync with the selected ref. Deliberately no
  // onBlur revert — the submit handler reads `quickJump` directly.
  useEffect(() => {
    setQuickJump(selectedRef);
    setJumpError(false);
  }, [selectedRef]);

  // Auto-scroll / pending-section scroll. Explicit-only: fires once per
  // selection change (or when a not-yet-loaded part mounts), never on scroll.
  useEffect(() => {
    const scroller = listRef.current;
    let markerRef = pendingSectionRef.current;

    // The pending marker is stale if the selection moved to a different
    // section while its part was still loading — clear it so we fall through
    // to the normal verse-scroll branch instead of redirecting to the old
    // section or suppressing the new selection's scroll.
    if (markerRef && dropLastRefComponent(selectedRef) !== markerRef) {
      pendingSectionRef.current = null;
      markerRef = null;
    }

    if (markerRef) {
      const markerEl = scroller?.querySelector(
        `[data-marker="${markerRef}"]`,
      ) as HTMLElement | null;
      if (markerEl && scroller) {
        scroller.scrollTop = elementScrollTop(scroller, markerEl);
        pendingSectionRef.current = null;
        lastAutoScroll.current = { ref: selectedRef, found: true };
      }
      return; // marker not loaded yet — retry on next grantha change
    }

    const element = passageRefs.current[selectedRef];
    const prev = lastAutoScroll.current;
    if (prev && prev.ref === selectedRef && prev.found) {
      return;
    }
    if (element) {
      lastAutoScroll.current = { ref: selectedRef, found: true };
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      lastAutoScroll.current = { ref: selectedRef, found: false };
    }
  }, [grantha.passages, selectedRef]);

  /** Load the part backing a section if it isn't loaded yet. */
  const ensureSectionLoaded = (section: SidebarSection) => {
    if (section.passages.length > 0) return;
    for (const firstRef of section.boundary.partIds) {
      if (!grantha.passages.some((p) => p.ref === firstRef)) {
        void loadPart(firstRef);
      }
    }
  };

  const handleSectionSelect = (section: SidebarSection) => {
    onVerseSelect(section.boundary.firstVerseRef);
    pendingSectionRef.current = section.boundary.markerRef;
    ensureSectionLoaded(section);
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = quickJump.trim();
    if (!q) return;

    // Search loaded passages (prefatory, main, concluding) first, then match
    // against known part first_refs so quick-jump works for not-yet-loaded
    // sections.
    const loadedVerses = [
      ...model.prefatory,
      ...(model.depth <= 1
        ? model.flatPassages
        : model.sections.flatMap((s) => s.passages)),
      ...model.concluding,
    ];
    const loadedRefs = new Set(loadedVerses.map((p) => p.ref));
    const partFirstRefs = (grantha.parts ?? []).map((p) => p.first_ref);

    let targetRef: string | null = null;
    const exactLoaded = loadedVerses.find((p) => p.ref === q);
    const exactPart = !exactLoaded && partFirstRefs.includes(q) ? q : null;
    if (exactLoaded) targetRef = exactLoaded.ref;
    else if (exactPart) targetRef = exactPart;
    else {
      const prefixLoaded = loadedVerses.find((p) => p.ref.startsWith(q + "."));
      const prefixPartMatch = partFirstRefs.find((r) => r.startsWith(q + "."));
      if (prefixLoaded) targetRef = prefixLoaded.ref;
      else if (prefixPartMatch) targetRef = prefixPartMatch;
    }

    if (!targetRef) {
      setJumpError(true);
      return;
    }
    setJumpError(false);
    onVerseSelect(targetRef);
    pendingSectionRef.current = model.depth >= 2 ? dropLastRefComponent(targetRef) : null;
    if (!loadedRefs.has(targetRef)) {
      const section = model.sections.find(
        (s) =>
          s.boundary.firstVerseRef === targetRef ||
          s.passages.some((p) => p.ref === targetRef),
      );
      if (section) ensureSectionLoaded(section);
      else {
        const part = (grantha.parts ?? []).find((p) => p.first_ref === targetRef);
        if (part) void loadPart(part.first_ref);
      }
    }
  };

  return (
    <div className="h-full flex flex-col pb-8 bg-[#f8f9fa]">
      {/* Header */}
      <div className="pt-8 pb-2 px-6 bg-[#f8f9fa]">
        <h2 className="text-xl font-semibold font-serif text-center">
          {uiStrings.index}
        </h2>
      </div>

      {/* Grantha selector */}
      <div className="pb-3 px-6">
        <GranthaSelector
          granthas={granthas}
          selectedGranthaId={grantha.grantha_id}
          onSelect={onGranthaChange}
        />
      </div>

      {/* Quick jump — shows the current ref, doubles as a jump field */}
      <div className="px-6 pb-2">
        <form onSubmit={handleJumpSubmit} className="flex gap-2">
          <input
            value={quickJump}
            onChange={(e) => {
              setQuickJump(e.target.value);
              setJumpError(false);
            }}
            onFocus={(e) => e.target.select()}
            placeholder="ref e.g. 3.4.2"
            className="flex-1 min-w-0 text-sm px-3 py-1.5 border border-gray-200 rounded-md bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="Jump to reference"
          />
          <button
            type="submit"
            className="text-sm px-3 py-1.5 border border-gray-200 rounded-md bg-white text-gray-600 hover:bg-gray-50"
          >
            Go
          </button>
        </form>
        {jumpError && (
          <p className="text-xs text-red-600 mt-1">No match for that ref.</p>
        )}
      </div>

      {/* Flat verse list with labeled, tappable section headings */}
      <SidebarList
        ref={listRef}
        grantha={grantha}
        depth={model.depth}
        sections={model.sections}
        flatPassages={model.flatPassages}
        prefatory={model.prefatory}
        concluding={model.concluding}
        selectedRef={selectedRef}
        onVerseSelect={onVerseSelect}
        onSectionSelect={handleSectionSelect}
        loadPart={loadPart}
        passageRefs={passageRefs}
      />
    </div>
  );
}
