"use client";

import { Fragment, forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Grantha,
  Passage,
  PrefatoryMaterial,
  SidebarSection,
  getCuratedActiveSubsection,
} from "@/lib/data";
import { toDevanagariNumerals } from "@/lib/stringUtils";
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
  /** True when rendering curated sections (Vedārthasaṅgraha-style). Each
   *  subsection label renders as a tappable band immediately above its own
   *  paras, and main passages drop the structure-level prefix
   *  (showNumberOnly). */
  curated?: boolean;
}

interface MenuState {
  /** Path index of the tapped segment (0 = top level). */
  level: number;
  /** markerRef of the section whose heading was tapped. */
  sectionRef: string;
  anchor: { top: number; left: number };
}

const LISTBOX_ID = "sidebar-segments-listbox";

// Curated two-band sticky coupling: the section band is h-11 (44px) and the
// active subsection band sticks at top-11 (44px) to sit flush beneath it.
const CURATED_SECTION_BAND_HEIGHT = "h-11";
const CURATED_SUB_BAND_STICKY_TOP = "top-11";
const CURATED_SUB_BAND_HEIGHT = "h-10";
// 3rem = 2 × 1.5rem (the container's px-6), so the band bleeds edge-to-edge
// past the sidebar's horizontal padding.
const CURATED_FULL_BLEED = "w-[calc(100%+3rem)] -ml-6";
// Section band must paint above the sticky sub band; the sub band paints
// above the scrolling paras.
const CURATED_SECTION_BAND_Z = "z-10";
const CURATED_SUB_BAND_Z = "z-[9]";

/** Chevron-right breadcrumb separator, matching the dropdown caret family. */
function ChevronRightIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3 w-3 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Downward caret signaling a tappable dropdown, matching GranthaSelector. */
function CaretDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3 w-3 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Flat, accordion-free verse list. Each section begins with a full-bleed
 * sticky heading (e.g. "अध्यायः ३ › ब्राह्मणम् १", top-down) held in place by
 * native CSS `position: sticky` — the browser handles the handoff between
 * sibling headings, no scroll-tracking JS. Every segment of the heading is a
 * tappable breadcrumb (a real `<button>` with listbox semantics): tapping a
 * segment opens a scoped popup of that level's sibling sections; picking one
 * navigates. A scroll-sentinel lazy-loads the next part file (same pattern
 * as the reading panel's loaderRef).
 *
 * Curated mode (`curated` prop, for granthas with curated `sections` data):
 * the section band holds a popup of all sections, and each subsection renders
 * as a tappable band that jumps to its first para. The active subsection
 * (the one containing `selectedRef`) is sticky beneath the section band and
 * is the only one that expands its paras — a drill-down accordion.
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
      curated = false,
    },
    ref,
  ) {
  const observer = useRef<IntersectionObserver | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const closeMenu = useCallback(() => {
    setMenu(null);
    optionRefs.current = {};
  }, []);

  // Close the popup on outside click, Escape, or the list scrolling. Escape
  // also returns focus to the segment button that opened the popup.
  useEffect(() => {
    if (!menu) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (target instanceof Element && target.closest("[data-crumb-seg]")) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
        triggerRef.current?.focus();
      }
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
      showNumberOnly={curated}
    />
  );

  const openMenuFor = (section: SidebarSection, level: number, btn: HTMLButtonElement) => {
    if (menu && menu.sectionRef === section.boundary.markerRef && menu.level === level) {
      closeMenu();
      return;
    }
    triggerRef.current = btn;
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
  // For a curated section band the options are all curated sections (level 0).
  // Curated subsection bands do not open popups — tapping one jumps directly to
  // the subsection's first para.
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

  // Whether a section contains the currently selected verse — used both for
  // popup-option highlighting and to decide whether a curated section's direct
  // paras render. At the top level (adhyaya), an option represents a whole
  // adhyaya but only holds the first brahmana's passages, so scan all sections
  // under that adhyaya rather than only the option's own passages. At deeper
  // levels the option already covers the full scope, so check its passages
  // directly. Curated sections may hold passages inside subsections, so
  // include those.
  const sectionContainsSelection = (s: SidebarSection): boolean => {
    if (s.passages.some((p) => p.ref === selectedRef)) return true;
    return (s.subsections ?? []).some((sub) =>
      sub.passages.some((p) => p.ref === selectedRef),
    );
  };

  const optionContainsSelection = (option: SidebarSection, level: number): boolean => {
    if (level === 0) {
      return sections.some(
        (s) =>
          s.boundary.path[0] === option.boundary.path[0] &&
          sectionContainsSelection(s),
      );
    }
    return sectionContainsSelection(option);
  };

  // Focus the option containing the selected verse whenever the popup opens,
  // so keyboard/screen-reader users land on the highlighted option. If no
  // option contains the selection, fall back to the option matching the open
  // heading so focus is never dropped.
  useEffect(() => {
    if (!menu || !openSection) return;
    let idx = menuOptions.findIndex((o) => optionContainsSelection(o, menu.level));
    if (idx < 0) {
      idx = menuOptions.findIndex(
        (o) =>
          o.boundary.path[menu.level] === openSection.boundary.path[menu.level],
      );
    }
    optionRefs.current[idx >= 0 ? idx : 0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  // Arrow-key navigation between popup options (Home/End jump to ends).
  const handlePopupKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const current = document.activeElement;
      const currentIdx = menuOptions.findIndex((_, i) => optionRefs.current[i] === current);
      const start = currentIdx >= 0 ? currentIdx : 0;
      const next = Math.min(
        menuOptions.length - 1,
        Math.max(0, start + (e.key === "ArrowDown" ? 1 : -1)),
      );
      optionRefs.current[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      optionRefs.current[e.key === "Home" ? 0 : menuOptions.length - 1]?.focus();
    }
  };

  // Clamp the popup so it stays within the sidebar panel and the viewport,
  // with internal scroll for long option lists (Bṛhadāraṇyaka has 6+
  // adhyāyas). At very narrow sidebar widths — or when the tapped segment sits
  // near the panel's right edge — the available space can be far under the
  // usual 200px minimum, so the width clamps to what actually fits.
  const popupWidth = (() => {
    const scrollerEl = typeof ref === "object" && ref ? ref.current : null;
    if (!scrollerEl || !menu) return 240;
    const rect = scrollerEl.getBoundingClientRect();
    const available = rect.right - menu.anchor.left - 8;
    return Math.min(240, Math.max(1, available));
  })();

  const menuEl =
    menu != null && openSection ? (
      createPortal(
        <div
          ref={menuRef}
          role="listbox"
          id={LISTBOX_ID}
          aria-label="Section navigation"
          onKeyDown={handlePopupKeyDown}
          className="fixed z-50 max-h-[300px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          style={{
            top: Math.min(menu.anchor.top, window.innerHeight - 304),
            left: menu.anchor.left,
            width: popupWidth,
          }}
        >
          {menuOptions.map((option, index) => {
            const rawLabel = option.boundary.path[menu.level] ?? option.boundary.path[0];
            // The option the reader is actually showing in the main panel is
            // the one that contains the selected verse — not the sticky
            // heading's section. That one gets the bold highlight.
            const isSelectedOption = optionContainsSelection(option, menu.level);
            return (
              <button
                key={`${menu.level}-${rawLabel}`}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                type="button"
                role="option"
                aria-selected={isSelectedOption}
                tabIndex={-1}
                className={`block w-full text-left text-sm px-3 py-1.5 cursor-pointer ${
                  isSelectedOption
                    ? "font-bold text-gray-900 bg-gray-100"
                    : "font-normal text-gray-700 hover:bg-gray-100"
                }`}
                onClick={() => {
                  triggerRef.current?.focus();
                  closeMenu();
                  onSectionSelect(option);
                }}
              >
                {toDevanagariNumerals(rawLabel)}
              </button>
            );
          })}
        </div>,
        document.body,
      )
    ) : null;

  return (
    <div ref={ref} className="flex-1 overflow-y-auto overflow-x-hidden px-6">
      {!curated &&
        prefatory.map((passage) => renderPassage(passage, `pre-${passage.ref}`))}

      {curated || depth > 1
        ? sections.map((section) => {
            const segments = section.boundary.path;
            const hasSubsections = (section.subsections?.length ?? 0) > 0;
            // The subsection whose passage range contains the selected ref.
            // It is the sticky sub band and the only one that expands paras.
            // (Only relevant in curated mode; structural sections carry no
            // subsections, so `active` stays undefined there.)
            const active =
              curated && hasSubsections
                ? getCuratedActiveSubsection(section, selectedRef)
                : undefined;
            return (
              <div
                key={section.boundary.markerRef}
                className={curated ? "mt-4" : undefined}
              >
                {/* Section heading: full labeled path, top-down (e.g.
                    अध्यायः ३ › ब्राह्मणम् १). Each segment is a tappable
                    breadcrumb that opens a popup of that level's sibling
                    sections. Sticky within the scrolling list; native CSS
                    handles the handoff between sections — no JS scroll
                    tracking. Full-bleed uniform gray band. Curated bands get
                    a fixed h-11 so the subsection band sticks flush below. */}
                <div
                  data-marker={section.boundary.markerRef}
                  className={`flex items-center gap-1 sticky top-0 ${CURATED_SECTION_BAND_Z} ${CURATED_FULL_BLEED} px-6 text-base font-bold text-black bg-gray-100 ${
                    curated ? CURATED_SECTION_BAND_HEIGHT : "py-2.5 mt-4 mb-1.5"
                  }`}
                >
                  {segments.map((segment, i) => {
                    // Display index equals the path level: index 0 is the
                    // topmost level, index 1 the next, etc. (the path is
                    // already broad → narrow).
                    const level = i;
                    const isLast = i === segments.length - 1;
                    const isOpen =
                      menu != null &&
                      menu.sectionRef === section.boundary.markerRef &&
                      menu.level === level;
                    return (
                      <span
                        key={`${segment}-${i}`}
                        className={`flex items-center ${
                          isLast ? "flex-shrink-0" : "min-w-0"
                        }`}
                      >
                        {i > 0 && (
                          <span className="text-gray-500 select-none flex-shrink-0">
                            <ChevronRightIcon />
                          </span>
                        )}
                        <button
                          type="button"
                          data-crumb-seg
                          aria-haspopup="listbox"
                          aria-expanded={isOpen}
                          aria-controls={isOpen ? LISTBOX_ID : undefined}
                          onClick={(e) => openMenuFor(section, level, e.currentTarget)}
                          className={`font-bold text-black px-1.5 py-0.5 rounded hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-400 ${
                            isLast ? "flex-shrink-0" : "min-w-0 truncate"
                          }`}
                        >
                          {toDevanagariNumerals(segment)}
                        </button>
                        {isLast && (
                          <span className="text-gray-500 select-none pl-0.5 flex-shrink-0">
                            <CaretDownIcon />
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
                {/* Curated subsection bands: every subsection of the section is
                    a visible tappable row that jumps to its first para. The
                    active one is sticky just below the section band
                    (top-11 = h-11) and expands its paras directly beneath its
                    own band; inactive rows scroll normally. */}
                {curated &&
                  section.subsections?.map((sub) => {
                    const isActive = active?.startRef === sub.startRef;
                    return (
                      <Fragment key={sub.startRef}>
                        <button
                          type="button"
                          onClick={() => onVerseSelect(sub.startRef)}
                          aria-current={isActive ? "true" : undefined}
                          className={`flex items-center ${CURATED_FULL_BLEED} pl-8 pr-6 ${CURATED_SUB_BAND_HEIGHT} text-sm font-semibold text-gray-700 bg-gray-50 text-left ${
                            isActive
                              ? `sticky ${CURATED_SUB_BAND_STICKY_TOP} ${CURATED_SUB_BAND_Z}`
                              : ""
                          }`}
                        >
                          <span className="flex-1 min-w-0 truncate rounded px-1.5 py-0.5 hover:bg-gray-200">
                            {sub.label}
                          </span>
                        </button>
                        {isActive &&
                          sub.passages.map((passage) =>
                            renderPassage(passage, passage.ref),
                          )}
                      </Fragment>
                    );
                  })}
                {curated
                  ? // Direct paras — section intro/preamble content, or paras
                    // no subsection covers. Kept after all subsection bands;
                    // only the section owning selectedRef renders them.
                    sectionContainsSelection(section) &&
                    section.passages.map((passage) =>
                      renderPassage(passage, passage.ref),
                    )
                  : section.passages.map((passage) =>
                      renderPassage(passage, passage.ref),
                    )}
              </div>
            );
          })
        : flatPassages.map((passage) => renderPassage(passage, passage.ref))}

      {!curated &&
        concluding.map((passage) => renderPassage(passage, `con-${passage.ref}`))}

      <div ref={loaderRef} />
      {menuEl}
    </div>
  );
});

export default SidebarList;
