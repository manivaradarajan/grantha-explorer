"use client";

import {
  Grantha,
  GranthaMetadata,
  SidebarFlatModel,
  SidebarSection,
  dropLastRefComponent,
  getCuratedSidebarSections,
  getSidebarFlatModel,
} from "@/lib/data";
import GranthaSelector from "./GranthaSelector";
import { useEffect, useMemo, useRef, useState } from "react";
import SidebarList from "./SidebarList";
import { getUIStrings } from "@/lib/i18n";
import AppWordmark from "./AppWordmark";

interface NavigationSidebarProps {
  grantha: Grantha;
  granthas?: GranthaMetadata[];
  selectedRef: string;
  onGranthaChange?: (granthaId: string) => void;
  onVerseSelect: (ref: string) => void;
  loadPart: (firstRef: string) => Promise<void>;
  showWordmark?: boolean;
  /** When true, renders the GranthaSelector above the verse list (mobile drawer). */
  showGranthaSelector?: boolean;
}

/**
 * Compute the scrollTop offset that places `el` at the top of `scroller`.
 *
 * `offsetTop` is document-relative, so the scroller's own position and scroll
 * must be factored in.
 *
 * @param scroller - The scroll container element.
 * @param el - The target element inside the scroller.
 * @returns The scrollTop value to align `el` with the top of `scroller`.
 */
function elementScrollTop(scroller: HTMLElement, el: HTMLElement): number {
  return (
    el.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop
  );
}

/** Result of resolving a quick-jump query. */
interface ResolvedJump {
  ref: string;
  /** True when the ref is a section marker — no verse DOM element exists for it. */
  isSection: boolean;
}

/**
 * Resolve a quick-jump query to a target ref, or null when unresolvable.
 *
 * Matches loaded passages first (prefatory, main, concluding), then part-file
 * first_refs, then known (possibly not-yet-loaded) section markers so jumps
 * into unloaded parts resolve. Pure and side-effect free.
 */
function resolveJumpTarget(
  q: string,
  model: SidebarFlatModel,
  partFirstRefs: string[],
): ResolvedJump | null {
  const loadedVerses = [
    ...model.prefatory,
    ...(model.depth <= 1
      ? model.flatPassages
      : model.sections.flatMap((s) => s.passages)),
    ...model.concluding,
  ];

  const exactLoaded = loadedVerses.find((p) => p.ref === q);
  if (exactLoaded) return { ref: exactLoaded.ref, isSection: false };

  if (partFirstRefs.includes(q)) return { ref: q, isSection: false };

  const prefixLoaded = loadedVerses.find((p) => p.ref.startsWith(q + "."));
  if (prefixLoaded) return { ref: prefixLoaded.ref, isSection: false };

  const prefixPartMatch = partFirstRefs.find((r) => r.startsWith(q + "."));
  if (prefixPartMatch) return { ref: prefixPartMatch, isSection: false };

  if (model.depth >= 2) {
    const parentRef = dropLastRefComponent(q);
    if (model.sections.some((s) => s.boundary.markerRef === parentRef)) {
      return { ref: q, isSection: true };
    }
  }

  return null;
}

/**
 * Sidebar navigation panel for a grantha text.
 *
 * Renders a section-structured verse list, a quick-jump input, and an
 * optional grantha selector. Coordinates lazy part loading, auto-scroll, and
 * centering of quick-jump verses whose parts are not yet loaded.
 */
export default function NavigationSidebar({
  grantha,
  granthas,
  selectedRef,
  onGranthaChange,
  onVerseSelect,
  loadPart,
  showWordmark = false,
  showGranthaSelector = false,
}: NavigationSidebarProps) {
  const model = useMemo(() => getSidebarFlatModel(grantha), [grantha]);
  const curatedSections = useMemo(
    () => getCuratedSidebarSections(grantha),
    [grantha],
  );
  const isCurated = curatedSections != null;
  const uiStrings = getUIStrings();

  // --- Pending-scroll state machine ---
  // pendingVerseRef: set when a quick-jump targets a verse whose part is not
  //   yet loaded; cleared when the verse mounts, the selection changes, or the
  //   grantha changes. Only meaningful while it equals selectedRef.
  // pendingSectionRef: markerRef of the section containing the jump target;
  //   used as the fallback scroll target while a verse is still loading.
  // lastAutoScroll: dedup record; {ref, found:true} matching selectedRef
  //   suppresses redundant scrollIntoView calls.
  const listRef = useRef<HTMLDivElement | null>(null);
  const passageRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const lastAutoScroll = useRef<{ ref: string; found: boolean } | null>(null);
  const pendingSectionRef = useRef<string | null>(null);
  const pendingVerseRef = useRef<string | null>(null);
  const prevGranthaId = useRef<string>(grantha.grantha_id);

  const [quickJump, setQuickJump] = useState(selectedRef);
  const [jumpError, setJumpError] = useState(false);
  const [prevSelectedRef, setPrevSelectedRef] = useState(selectedRef);
  const [prevGranthaIdState, setPrevGranthaIdState] = useState(
    grantha.grantha_id,
  );

  // Reset ephemeral sync state when the grantha changes (refs can coincide
  // across texts; stale state must not suppress a needed sync).
  useEffect(() => {
    if (prevGranthaId.current !== grantha.grantha_id) {
      prevGranthaId.current = grantha.grantha_id;
      lastAutoScroll.current = null;
      pendingSectionRef.current = null;
      pendingVerseRef.current = null;
    }
  }, [grantha.grantha_id]);

  // Keep the quick-jump display in sync with the selected ref. Deliberately no
  // onBlur revert — the submit handler reads `quickJump` directly.
  if (prevSelectedRef !== selectedRef) {
    setPrevSelectedRef(selectedRef);
    setQuickJump(selectedRef);
    setJumpError(false);
  }
  if (prevGranthaIdState !== grantha.grantha_id) {
    setPrevGranthaIdState(grantha.grantha_id);
    setQuickJump(selectedRef);
    setJumpError(false);
  }

  // Auto-scroll / pending-section scroll. Explicit-only: fires once per
  // selection change (or when a not-yet-loaded part mounts), never on scroll.
  useEffect(() => {
    const scroller = listRef.current;

    // A pending quick-jump verse is stale if the selection moved elsewhere
    // while its part was still loading.
    if (
      pendingVerseRef.current &&
      pendingVerseRef.current !== selectedRef
    ) {
      pendingVerseRef.current = null;
    }
    const pendingVerse = pendingVerseRef.current;

    // The pending marker is stale if the selection moved to a different
    // section while its part was still loading — clear it so we fall through
    // to the normal verse-scroll branch instead of redirecting to the old
    // section or suppressing the new selection's scroll.
    let markerRef = pendingSectionRef.current;
    if (markerRef && dropLastRefComponent(selectedRef) !== markerRef) {
      pendingSectionRef.current = null;
      markerRef = null;
    }

    // A pending quick-jump should center the exact verse once its part loads.
    // If the verse isn't in the DOM yet, fall through to the marker scroll for
    // interim feedback (without recording the verse as already scrolled).
    if (pendingVerse && pendingVerse === selectedRef) {
      const verseEl = passageRefs.current[selectedRef];
      if (verseEl) {
        pendingVerseRef.current = null;
        pendingSectionRef.current = null;
        lastAutoScroll.current = { ref: selectedRef, found: true };
        verseEl.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

    if (markerRef) {
      const markerEl = scroller?.querySelector(
        `[data-marker="${markerRef}"]`,
      ) as HTMLElement | null;
      if (markerEl && scroller) {
        scroller.scrollTop = elementScrollTop(scroller, markerEl);
        pendingSectionRef.current = null;
        lastAutoScroll.current = {
          ref: selectedRef,
          // A section-pick is complete at its heading; a pending quick-jump
          // still needs the verse centered once it mounts.
          found: pendingVerse == null,
        };
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

  /**
   * Load the part files backing a section if they aren't loaded yet. A loaded
   * section may still carry unloaded parts (a misaligned part whose range
   * extends into the section but isn't fetched yet), so this does NOT
   * short-circuit on passages present — the per-part guard below handles it.
   */
  const ensureSectionLoaded = (section: SidebarSection) => {
    for (const firstRef of section.boundary.partIds) {
      if (!grantha.passages.some((p) => p.ref === firstRef)) {
        void loadPart(firstRef);
      }
    }
  };

  /** Load every unloaded section from the top up to `sectionIdx` inclusive,
   *  so the sidebar stays gap-free when jumping deep into the text. */
  const ensureSectionsUpToLoaded = (sectionIdx: number) => {
    for (let i = 0; i <= sectionIdx && i < model.sections.length; i++) {
      ensureSectionLoaded(model.sections[i]);
    }
  };

  /** Select a section from the breadcrumb popup, then load everything from
   *  the top down to it so the list stays gap-free. Curated sections (single
   *  file, no parts) skip the part-load step. */
  const handleSectionSelect = (section: SidebarSection) => {
    onVerseSelect(section.boundary.firstVerseRef);
    pendingSectionRef.current = section.boundary.markerRef;
    if (isCurated) return;
    const targetIdx = model.sections.findIndex(
      (s) => s.boundary.markerRef === section.boundary.markerRef,
    );
    if (targetIdx >= 0) ensureSectionsUpToLoaded(targetIdx);
  };

  /**
   * Resolve the quick-jump query, select the target, and schedule loading of
   * any unloaded parts. Sets pending scroll state so the auto-scroll effect
   * centers a verse target when its part mounts (or lands on a section heading
   * directly for a section-marker target).
   */
  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = quickJump.trim();
    if (!q) return;

    const partFirstRefs = (grantha.parts ?? []).map((p) => p.first_ref);
    const resolved = resolveJumpTarget(q, model, partFirstRefs);

    if (!resolved) {
      setJumpError(true);
      return;
    }
    setJumpError(false);
    const targetRef = resolved.ref;
    onVerseSelect(targetRef);

    let targetSectionIdx: number;
    if (resolved.isSection) {
      // The target IS a section marker — land on its heading directly.
      pendingSectionRef.current = targetRef;
      targetSectionIdx = model.sections.findIndex(
        (s) => s.boundary.markerRef === targetRef,
      );
    } else {
      // Verse jump: scroll to the parent section marker as interim feedback,
      // then center the exact verse once its part mounts.
      const parentRef =
        model.depth >= 2 ? dropLastRefComponent(targetRef) : null;
      pendingSectionRef.current = parentRef;
      pendingVerseRef.current = targetRef;
      targetSectionIdx = model.sections.findIndex(
        (s) =>
          s.boundary.firstVerseRef === targetRef ||
          s.passages.some((p) => p.ref === targetRef) ||
          (parentRef != null && s.boundary.markerRef === parentRef),
      );
    }

    if (targetSectionIdx >= 0) {
      ensureSectionsUpToLoaded(targetSectionIdx);
    } else {
      const part = (grantha.parts ?? []).find(
        (p) => p.first_ref === targetRef,
      );
      if (part) void loadPart(part.first_ref);
    }
  };

  return (
    <div className="h-full flex flex-col pb-8 bg-[#f8f9fa]">
      {showWordmark && (
        <div className="shrink-0 min-h-[5.5rem] flex items-center px-6 border-b border-gray-100">
          <AppWordmark />
        </div>
      )}
      {/* Header */}
      <div className="pt-4 pb-2 px-6 bg-[#f8f9fa]">
        <h2 className="text-xl font-semibold font-serif text-center">
          {uiStrings.index}
        </h2>
      </div>

      {/* Grantha selector — shown only in mobile drawer */}
      {showGranthaSelector && granthas && onGranthaChange && (
        <div className="pb-3 px-6">
          <GranthaSelector
            granthas={granthas}
            selectedGranthaId={grantha.grantha_id}
            onSelect={onGranthaChange}
          />
        </div>
      )}

      {/* Quick jump — shows the current ref, doubles as a jump field */}
      <div className="px-6 pb-2">
        <form onSubmit={handleJumpSubmit} className="relative">
          <input
            value={quickJump}
            onChange={(e) => {
              setQuickJump(e.target.value);
              setJumpError(false);
            }}
            onFocus={(e) => e.target.select()}
            placeholder="ref e.g. 3.4.2"
            className="w-full h-9 text-sm pl-3 pr-9 border border-gray-300 rounded bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="Jump to reference"
          />
          <button
            type="submit"
            aria-label="जायताम्"
            className="absolute right-0 top-0 w-9 h-9 flex items-center justify-center text-gray-500 hover:text-blue-600 transition-colors"
          >
            →
          </button>
        </form>
        {jumpError && (
          <p className="text-xs text-red-600 mt-1">निर्देशः नोपलभ्यते</p>
        )}
      </div>

      {/* Flat verse list with labeled, tappable section headings */}
      <SidebarList
        ref={listRef}
        grantha={grantha}
        depth={model.depth}
        sections={curatedSections ?? model.sections}
        flatPassages={model.flatPassages}
        concluding={isCurated ? [] : model.concluding}
        selectedRef={selectedRef}
        onVerseSelect={onVerseSelect}
        onSectionSelect={handleSectionSelect}
        loadPart={loadPart}
        passageRefs={passageRefs}
        curated={isCurated}
      />
    </div>
  );
}
