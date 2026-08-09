"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Grantha,
  Passage,
  PrefatoryMaterial,
  SidebarSection,
} from "@/lib/data";
import PassageLink from "./PassageLink";

interface SidebarListProps {
  grantha: Grantha;
  depth: number;
  sections: SidebarSection[];
  flatPassages: Passage[];
  prefatory: (Passage | PrefatoryMaterial)[];
  concluding: (Passage | PrefatoryMaterial)[];
  selectedRef: string;
  onVerseSelect: (ref: string) => void;
  /** Called when a section is chosen from a heading segment's popup. */
  onSectionSelect: (section: SidebarSection) => void;
  loadPart: (firstRef: string) => Promise<void>;
  /** Populated by each PassageLink's ref so the parent can auto-scroll. */
  passageRefs: React.MutableRefObject<Record<string, HTMLAnchorElement | null>>;
}

interface MenuState {
  /** Path index of the tapped segment (0 = top level). */
  level: number;
  /** markerRef of the section whose heading was tapped. */
  sectionRef: string;
  anchor: { top: number; left: number };
}

/**
 * Flat, accordion-free verse list. Each section begins with a full-bleed
 * labeled heading (e.g. "अध्यायः 3 › ब्राह्मणम् 1", top-down). Every segment
 * of the heading is a tappable breadcrumb: tapping a segment opens a popup of
 * that level's sibling sections; picking one navigates. A scroll-sentinel
 * lazy-loads the next part file (same pattern as the reading panel's
 * loaderRef).
 */
const SidebarList = forwardRef<HTMLDivElement, SidebarListProps>(
  function SidebarList(
    {
      grantha,
      depth,
      sections,
      flatPassages,
      prefatory,
      concluding,
      selectedRef,
      onVerseSelect,
      onSectionSelect,
      loadPart,
      passageRefs,
    },
    ref,
  ) {
  const observer = useRef<IntersectionObserver | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => setMenu(null), []);

  // Close the popup on outside click, Escape, or the list scrolling.
  useEffect(() => {
    if (!menu) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (target instanceof Element && target.closest("[data-crumb-seg]")) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    const onScroll = () => closeMenu();
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    const scroller = typeof ref === "object" ? ref?.current : null;
    if (scroller) scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
      if (scroller) scroller.removeEventListener("scroll", onScroll);
    };
  }, [menu, closeMenu, ref]);

  const loaderRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting || !grantha.parts) return;
        const loadedRefs = new Set(grantha.passages.map((p) => p.ref));
        let lastLoadedIndex = -1;
        for (let i = 0; i < grantha.parts.length; i++) {
          if (loadedRefs.has(grantha.parts[i].first_ref)) {
            lastLoadedIndex = i;
          }
        }
        if (lastLoadedIndex < grantha.parts.length - 1) {
          const nextPart = grantha.parts[lastLoadedIndex + 1];
          if (nextPart && !loadedRefs.has(nextPart.first_ref)) {
            loadPart(nextPart.first_ref);
          }
        }
      });
      if (node) observer.current.observe(node);
    },
    [grantha, loadPart],
  );

  const renderPassage = (passage: Passage | PrefatoryMaterial, key: string) => (
    <PassageLink
      key={key}
      ref={(el) => {
        if (passage.ref) {
          if (el) passageRefs.current[passage.ref] = el;
          else delete passageRefs.current[passage.ref];
        }
      }}
      passage={passage}
      grantha={grantha}
      isSelected={passage.ref === selectedRef}
      onVerseSelect={onVerseSelect}
    />
  );

  const openMenuFor = (section: SidebarSection, level: number, btn: HTMLButtonElement) => {
    if (menu && menu.sectionRef === section.boundary.markerRef && menu.level === level) {
      closeMenu();
      return;
    }
    const rect = btn.getBoundingClientRect();
    setMenu({
      level,
      sectionRef: section.boundary.markerRef,
      anchor: { top: rect.bottom + 4, left: rect.left },
    });
  };

  // Options for the open popup: distinct units at `menu.level`, scoped by the
  // heading's ancestor context. For a heading "अध्यायः 3 › ब्राह्मणम् 4":
  //   - tapping अध्यायः (level 0) → distinct adhyayas (deduped)
  //   - tapping ब्राह्मणम् (level 1) → brahmanas within अध्यायः 3
  const openSection =
    menu != null ? sections.find((s) => s.boundary.markerRef === menu.sectionRef) : null;
  const menuOptions =
    openSection && menu != null
      ? (() => {
          const scope = openSection.boundary.path.slice(0, menu.level).join("|");
          const seen = new Set<string>();
          const options: SidebarSection[] = [];
          for (const s of sections) {
            if (s.boundary.path.slice(0, menu.level).join("|") !== scope) continue;
            const key = s.boundary.path[menu.level] ?? s.boundary.path[0];
            if (seen.has(key)) continue;
            seen.add(key);
            options.push(s);
          }
          return options;
        })()
      : [];

  const menuEl =
    menu != null && openSection ? (
      createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[200px] max-h-[300px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          style={{ top: menu.anchor.top, left: menu.anchor.left }}
          role="menu"
        >
          {menuOptions.map((option) => {
            const label = option.boundary.path[menu.level] ?? option.boundary.path[0];
            // The option is "current" when it represents the same unit at the
            // tapped level as the open heading (e.g. the same adhyaya, or the
            // same brahmana within that adhyaya).
            const isCurrent =
              option.boundary.path[menu.level] === openSection.boundary.path[menu.level];
            const containsSelection = option.passages.some(
              (p) => p.ref === selectedRef,
            );
            return (
              <button
                key={`${menu.level}-${label}`}
                type="button"
                role="menuitem"
                className={`block w-full text-left text-sm font-semibold px-3 py-1.5 hover:bg-gray-100 ${
                  isCurrent || containsSelection ? "bg-gray-100 text-gray-900" : "text-gray-700"
                }`}
                onClick={() => {
                  closeMenu();
                  onSectionSelect(option);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>,
        document.body,
      )
    ) : null;

  return (
    <div ref={ref} className="flex-1 overflow-y-auto overflow-x-hidden px-6">
      {prefatory.map((passage) => renderPassage(passage, `pre-${passage.ref}`))}

      {depth <= 1
        ? flatPassages.map((passage) => renderPassage(passage, passage.ref))
        : sections.map((section) => {
            const segments = section.boundary.path;
            return (
              <div key={section.boundary.markerRef}>
                {/* Section heading: full labeled path, top-down (e.g.
                    अध्यायः 3 › ब्राह्मणम् 1). Each segment is a tappable
                    breadcrumb that opens a popup of that level's sibling
                    sections. Full-bleed uniform gray band. */}
                <div
                  data-marker={section.boundary.markerRef}
                  className="flex items-center gap-1 w-[calc(100%+3rem)] -ml-6 px-6 py-2.5 mt-4 mb-1.5 text-base font-semibold text-gray-700 border-t border-gray-200 bg-gray-100"
                >
                  {segments.map((segment, i) => {
                    // Display index equals the path level: index 0 is the
                    // topmost level, index 1 the next, etc. (the path is
                    // already broad → narrow).
                    const level = i;
                    return (
                      <span key={`${segment}-${i}`} className="flex items-center">
                        {i > 0 && (
                          <span className="text-gray-400 select-none px-1">›</span>
                        )}
                        <button
                          type="button"
                          data-crumb-seg
                          onClick={(e) => openMenuFor(section, level, e.currentTarget)}
                          className="px-1.5 py-0.5 rounded hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-400"
                        >
                          {segment}
                        </button>
                      </span>
                    );
                  })}
                </div>
                {section.passages.map((passage) => renderPassage(passage, passage.ref))}
              </div>
            );
          })}

      {concluding.map((passage) => renderPassage(passage, `con-${passage.ref}`))}

      <div ref={loaderRef} />
      {menuEl}
    </div>
  );
});

export default SidebarList;
