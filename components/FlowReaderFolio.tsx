"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Grantha,
  Passage,
  PrefatoryMaterial,
  SidebarFlatModel,
  SidebarSection,
  dropLastRefComponent,
  getCuratedSidebarSections,
  getSidebarFlatModel,
} from "@/lib/data";
import { resolveJumpTarget } from "@/lib/jumpTarget";
import { toDevanagariNumerals } from "@/lib/stringUtils";
import { useScrollspy } from "@/hooks/useScrollspy";

/** A single node in the folio outline tree (group = collapsible section). */
interface OutlineNode {
  id: string;
  kind: "group" | "leaf" | "placeholder";
  label: string;
  /** Jump target for leaves (a passage ref); groups may carry one too. */
  ref?: string;
  children?: OutlineNode[];
}

/** Tree-builder result: the outline nodes plus, for each group id, the
 *  part-file first_refs to lazy-load when that group is first expanded
 *  (unloaded sections render as placeholders until their parts arrive). */
interface OutlineResult {
  nodes: OutlineNode[];
  unloadedPartsByGroup: Map<string, string[]>;
}

/** Strip newlines/collapse whitespace and truncate for a compact tree label. */
function truncatePreview(html: string, n: number): string {
  const text = html.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

/**
 * Build the folio outline tree from the same data NavigationSidebar uses
 * (getSidebarFlatModel / getCuratedSidebarSections), nesting sections by their
 * boundary path so deeper structures (chapter → brahmana → verse) nest
 * recursively with no special-casing.
 */
function buildOutlineTree(
  grantha: Grantha,
  model: SidebarFlatModel,
  curated: SidebarSection[] | null,
): OutlineResult {
  const toLeaf = (p: Passage | PrefatoryMaterial): OutlineNode => ({
    id: `leaf-${p.ref}`,
    kind: "leaf",
    label:
      p.passage_type === "main"
        ? `${toDevanagariNumerals(p.ref)} - ${truncatePreview(
            p.content?.sanskrit?.devanagari ?? "",
            22
          )}`
        : (p as PrefatoryMaterial).label?.devanagari ?? p.ref,
    ref: p.ref,
  });

  // A section with no loaded passages but declared part files is a lazy-load
  // placeholder — show it as such so the accordion isn't silently empty, and
  // record the parts to load when the group is expanded.
  const PLACEHOLDER_LABEL = "…अद्यापि न भारितम्";

  const nestSections = (
    sections: SidebarSection[],
    unloaded: Map<string, string[]>
  ): OutlineNode[] => {
    const root: OutlineNode = {
      id: "__root",
      kind: "group",
      label: "",
      children: [],
    };
    for (const section of sections) {
      const path =
        section.boundary.path.length > 0
          ? section.boundary.path
          : [section.boundary.markerRef];
      let node = root;
      for (const segment of path) {
        let child = node.children?.find(
          (c) => c.kind === "group" && c.label === segment
        );
        if (!child) {
          child = {
            id: `${node.id}>${segment}`,
            kind: "group",
            label: segment,
            children: [],
          };
          node.children?.push(child);
        }
        node = child;
      }
      const isUnloaded =
        section.passages.length === 0 && section.boundary.partIds.length > 0;
      if (isUnloaded) {
        node.children?.push({
          id: `${node.id}>placeholder`,
          kind: "placeholder",
          label: PLACEHOLDER_LABEL,
        });
        unloaded.set(node.id, section.boundary.partIds);
        continue;
      }
      if (section.subsections?.length) {
        for (const sub of section.subsections) {
          node.children?.push({
            id: `sub-${sub.startRef}`,
            kind: "group",
            label: sub.label,
            ref: sub.startRef,
            children: sub.passages.map(toLeaf),
          });
        }
        node.children?.push(...section.passages.map(toLeaf));
      } else {
        node.children?.push(...section.passages.map(toLeaf));
      }
    }
    return root.children ?? [];
  };

  const unloadedPartsByGroup = new Map<string, string[]>();

  if (curated) {
    return { nodes: nestSections(curated, unloadedPartsByGroup), unloadedPartsByGroup };
  }
  if (model.depth <= 1) {
    return {
      nodes: [
        ...model.prefatory.map(toLeaf),
        ...model.flatPassages.map(toLeaf),
        ...model.concluding.map(toLeaf),
      ],
      unloadedPartsByGroup,
    };
  }
  return {
    nodes: [
      ...model.prefatory.map(toLeaf),
      ...nestSections(model.sections, unloadedPartsByGroup),
      ...model.concluding.map(toLeaf),
    ],
    unloadedPartsByGroup,
  };
}

interface FlowReaderFolioProps {
  grantha: Grantha;
  /** True on lg+ — folio docks in the flex layout; false = fixed overlay. */
  isDesktop: boolean;
  open: boolean;
  onClose: () => void;
  /** Toggle the panel open/closed (the arrows control at its top). */
  onToggle: () => void;
  /** Jump to a passage ref (parent scrolls + closes on mobile). */
  onJump: (ref: string) => void;
  /** Initially-highlighted ref (the selected verse). */
  selectedRef: string;
  script: "deva" | "roman";
  /** The reader's scroll container (scrollspy root). */
  scrollContainerRef: RefObject<HTMLElement | null>;
  /** Lazy part loader — used to fill in unloaded outline sections when the
   *  user expands their group. */
  loadPart: (firstRef: string) => Promise<void>;
}

/**
 * Compute the initial expanded group set: only the chain containing the
 * current section is expanded by default (matching the mock, where non-current
 * chapters sit collapsed). A top-level group matches when its label ends with
 * the current section number; the ancestor chain of the selected verse is also
 * expanded when that verse is present in the tree.
 */
function computeInitialExpanded(
  nodes: OutlineNode[],
  selectedRef: string
): Set<string> {
  const set = new Set<string>();
  const topSection = selectedRef.split(".")[0];
  const walk = (node: OutlineNode, depth: number, ancestors: string[]) => {
    if (node.kind === "group") {
      // Match the top-level group's trailing section number exactly (e.g.
      // "अध्यायः 10" for section "10", never matching section "1").
      const labelSection = node.label.trim().split(/\s+/).pop();
      const matchesCurrent =
        depth === 0 && labelSection === topSection;
      if (matchesCurrent) {
        for (const a of ancestors) set.add(a);
        set.add(node.id);
      }
      node.children?.forEach((c) =>
        walk(c, depth + 1, [...ancestors, node.id])
      );
    } else if (node.ref === selectedRef) {
      for (const a of ancestors) set.add(a);
    }
  };
  nodes.forEach((n) => walk(n, 0, []));
  return set;
}

/**
 * Right folio panel — a collapsible outline tree of the grantha's structure,
 * with a jump-to-number input. On desktop it is a slim section/verse strip
 * that expands to the full outline panel when opened; below lg it renders only
 * the fixed overlay (backdrop + panel) that slides in from the right — the
 * floating arrows trigger lives in FlowReader. The tree highlights the verse
 * currently in view via an IntersectionObserver (imperative class toggling —
 * the tree is never re-rendered on scroll), so any group the user expanded
 * stays expanded.
 */
export default function FlowReaderFolio({
  grantha,
  isDesktop,
  open,
  onClose,
  onToggle,
  onJump,
  selectedRef,
  script,
  scrollContainerRef,
  loadPart,
}: FlowReaderFolioProps) {
  const model = useMemo(() => getSidebarFlatModel(grantha), [grantha]);
  const curated = useMemo(() => getCuratedSidebarSections(grantha), [grantha]);
  const { nodes: outline, unloadedPartsByGroup } = useMemo(
    () => buildOutlineTree(grantha, model, curated),
    [grantha, model, curated]
  );

  const [prevGranthaId, setPrevGranthaId] = useState(grantha.grantha_id);
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    computeInitialExpanded(outline, selectedRef)
  );
  if (prevGranthaId !== grantha.grantha_id) {
    setPrevGranthaId(grantha.grantha_id);
    setExpanded(computeInitialExpanded(outline, selectedRef));
  }

  const treeRef = useRef<HTMLDivElement | null>(null);
  const stripListRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef<string | null>(selectedRef);
  const [jumpValue, setJumpValue] = useState("");
  const [jumpFlash, setJumpFlash] = useState(false);
  const [jumpFocused, setJumpFocused] = useState(false);
  const flashTimer = useRef<number | null>(null);
  // The section the collapsed strip lists — follows the reader's scroll. For a
  // deep text this is the parent ref (everything except the last verse index,
  // e.g. "5.4" for ref "5.4.1"); for a chapter→verse text it's the chapter.
  // Mirrors the scrollspy guard below: a prefatory initial ref (e.g. the
  // "0.1" mangalācaraṇa) must not collapse the strip onto an empty "section 0",
  // so fall back to the first loaded passage's section.
  const [activeSection, setActiveSection] = useState<string>(() => {
    const loadedRef = grantha.passages.some((p) => p.ref === selectedRef)
      ? selectedRef
      : grantha.passages[0]?.ref ?? selectedRef;
    return dropLastRefComponent(loadedRef);
  });
  // The verse the reader is currently on, driven by the scrollspy ("where am
  // I"). The jump input displays this when not being edited.
  const [currentVerse, setCurrentVerse] = useState<string>(selectedRef);

  // Imperatively toggle the current-item highlight classes on the existing
  // leaf/strip elements — never re-render the tree on scroll.
  const applyCurrent = useCallback((ref: string | null) => {
    if (treeRef.current) {
      treeRef.current.querySelectorAll<HTMLElement>(".folio-leaf").forEach((el) => {
        const isCurrent = el.dataset.ref === ref;
        el.classList.toggle("bg-gray-100", isCurrent);
        el.classList.toggle("text-gray-900", isCurrent);
        el.classList.toggle("font-semibold", isCurrent);
        el.classList.toggle("text-blue-600", !isCurrent);
      });
    }
    if (stripListRef.current) {
      stripListRef.current
        .querySelectorAll<HTMLElement>(".strip-verse")
        .forEach((el) => {
          const isCurrent = el.dataset.ref === ref;
          el.classList.toggle("bg-gray-100", isCurrent);
          el.classList.toggle("text-gray-900", isCurrent);
          el.classList.toggle("font-semibold", isCurrent);
          el.classList.toggle("text-blue-600", !isCurrent);
        });
    }
  }, []);

  /**
   * Scroll the folio's own scroll area so the highlighted item stays centered
   * ("keep up" with the reading scroll): the active verse is aligned to the
   * middle of the folio viewport whenever content permits (scrollTop is clamped
   * at the list edges, so the first/last verses sit at the edge), so it never
   * drifts offscreen. Tree and strip are mutually exclusive by render on
   * desktop; on mobile the overlay tree is always mounted (harmlessly scrolled
   * while hidden). A verse in a collapsed group isn't in the DOM and is a
   * no-op. The container itself is scrolled directly (never `scrollIntoView`)
   * so no other scrollable ancestor moves.
   */
  const scrollFolioToCurrent = useCallback((ref: string | null) => {
    if (!ref) return;
    const selector = `[data-ref="${ref}"]`;
    const treeEl = treeRef.current?.querySelector<HTMLElement>(selector) ?? null;
    const el =
      treeEl ??
      stripListRef.current?.querySelector<HTMLElement>(selector) ??
      null;
    if (!el) return;
    const scroller = treeEl ? treeRef.current : stripListRef.current;
    if (!scroller) return;
    const top =
      el.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    scroller.scrollTop =
      top - Math.max(0, (scroller.clientHeight - el.clientHeight) / 2);
  }, []);

  useScrollspy(scrollContainerRef, [grantha], (ref) => {
    currentRef.current = ref;
    applyCurrent(ref);
    // "Where am I": reflect the verse currently in view in the jump input
    // (unless the user is mid-edit there).
    setCurrentVerse((prev) => (prev === ref ? prev : ref));
    // Only main passages drive the strip's section. Prefatory/concluding
    // passages (e.g. the mangalācaraṇa "0.1" preface) must not collapse the
    // strip onto an empty "section 0" when the reader scrolls up past a
    // section's first verse — keep the last real section instead.
    if (grantha.passages.some((p) => p.ref === ref)) {
      const section = dropLastRefComponent(ref);
      setActiveSection((prev) => (prev === section ? prev : section));
    }
  });

  // Re-apply the highlight whenever the tree is rebuilt (grantha/script change,
  // a group toggled open, the folio panel opening (the tree mounts fresh), the
  // strip's section changing, or the selected verse changing) since leaf
  // elements are recreated at those points.
  useEffect(() => {
    applyCurrent(currentRef.current);
  }, [outline, expanded, open, selectedRef, activeSection, applyCurrent]);

  // Keep the scrollspy-highlighted verse centered in the folio. Runs after the
  // scrollspy updates `currentVerse`; `activeSection` only ever changes in the
  // same scrollspy callback, so the strip's re-render on a section change is
  // covered too. It also runs once on mount to center the initially-selected
  // verse. Deliberately scrollspy-only — expanding a group or opening the
  // panel never recenters the tree.
  useEffect(() => {
    scrollFolioToCurrent(currentVerse);
  }, [currentVerse, scrollFolioToCurrent]);

  // Main verses for the collapsed strip's list. Depth-1 texts (isavasya, ...)
  // have no sections — show every verse with no section number. Depth >= 2
  // texts list only the current section (the reader's adhyāya/brāhmaṇa).
  const mainPassages = useMemo(
    () => grantha.passages.filter((p) => p.passage_type === "main"),
    [grantha]
  );
  const stripHasSections = model.depth >= 2;
  // Group at the parent-ref granularity (the section the strip heads): chapter
  // for depth-2 texts ("7.11" → "7"), brahmana for depth-3 texts ("5.4.1" →
  // "5.4"). Depth-1 texts list every verse with no section heading.
  const stripPassages = stripHasSections
    ? mainPassages.filter((p) => dropLastRefComponent(p.ref) === activeSection)
    : mainPassages;

  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
  }, []);

  const toggleGroup = (id: string) => {
    // Compute the next expanded set from the current render's state (this is an
    // event handler, so it always sees the latest value) rather than inside a
    // functional updater — React may invoke updaters during render, and the
    // loadPart side effect below must never run in the render phase.
    const wasOpen = expanded.has(id);
    const next = new Set(expanded);
    if (wasOpen) {
      next.delete(id);
    } else {
      next.add(id);
      // First expansion of an unloaded section: fetch its part files so the
      // placeholder fills in with real verses (mirrors NavigationSidebar).
      const parts = unloadedPartsByGroup.get(id);
      if (parts) {
        for (const firstRef of parts) {
          void loadPart(firstRef);
        }
      }
    }
    setExpanded(next);
  };

  const renderNode = (node: OutlineNode, depth: number): ReactNode => {
    const paddingLeft = `${0.5 + depth * 0.9}rem`;
    if (node.kind === "leaf") {
      return (
        <button
          key={node.id}
          type="button"
          data-ref={node.ref}
          onClick={() => node.ref && onJump(node.ref)}
          className="folio-leaf block w-full text-left py-1.5 pr-4 text-sm font-serif text-blue-600 hover:bg-blue-50"
          style={{ paddingLeft }}
        >
          {node.label}
        </button>
      );
    }
    if (node.kind === "placeholder") {
      return (
        <div
          key={node.id}
          className="text-sm text-gray-300 font-serif py-1.5"
          style={{ paddingLeft }}
        >
          {node.label}
        </div>
      );
    }
    const isOpen = expanded.has(node.id);
    return (
      <div key={node.id}>
        <button
          type="button"
          onClick={() => toggleGroup(node.id)}
          aria-expanded={isOpen}
          className="folio-group w-full flex items-center gap-1.5 py-2 pr-4 text-sm font-serif font-semibold text-gray-800 hover:bg-gray-50"
          style={{ paddingLeft }}
        >
          <svg
            className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${
              isOpen ? "rotate-90" : ""
            }`}
            viewBox="0 0 8 8"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M1 0.5 L7 4 L1 7.5 Z" />
          </svg>
          <span className="truncate">{node.label}</span>
        </button>
        {isOpen && node.children && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const handleJump = (e: FormEvent) => {
    e.preventDefault();
    const q = jumpValue
      .replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)))
      .trim();
    if (!q) return;
    const partFirstRefs = (grantha.parts ?? []).map((p) => p.first_ref);
    const resolved = resolveJumpTarget(q, model, partFirstRefs);
    if (!resolved) {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      setJumpFlash(true);
      flashTimer.current = window.setTimeout(() => setJumpFlash(false), 700);
      return;
    }
    let target = resolved.ref;
    if (resolved.isSection) {
      const section = model.sections.find(
        (s) => s.boundary.markerRef === resolved.ref
      );
      target = section?.boundary.firstVerseRef ?? resolved.ref;
    }
    setJumpValue("");
    setJumpFocused(false);
    onJump(target);
  };

  const jumpForm = (
    <form
      onSubmit={handleJump}
      className="flex items-center gap-2 px-4 py-3 border-b border-gray-100"
    >
      <input
        type="text"
        inputMode="numeric"
        value={jumpFocused ? jumpValue : currentVerse}
        onFocus={() => {
          setJumpFocused(true);
          setJumpValue(currentVerse);
        }}
        onChange={(e) => {
          setJumpValue(e.target.value);
          setJumpFlash(false);
        }}
        onBlur={() => {
          setJumpFocused(false);
          setJumpValue("");
        }}
        placeholder="७.११"
        aria-label="Jump to section.verse"
        title="Current verse — type a ref to jump"
        className={`flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm font-serif focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 ${
          jumpFlash ? "border-red-300" : "border-gray-200"
        }`}
      />
      <button
        type="submit"
        className="shrink-0 px-3 h-9 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-600 text-gray-600 text-sm font-serif"
      >
        {script === "roman" ? "Gaccha" : "जाएं"}
      </button>
    </form>
  );

  const title = script === "roman" ? "Anukramaṇikā" : "अनुक्रमणिका";

  // The arrows toggle — the primary affordance for the folio, kept visible at
  // every breakpoint (below lg it's the ONLY thing shown, per feedback).
  const arrowsButton = (
    <button
      type="button"
      onClick={onToggle}
      className="flex-none min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
      aria-label="Table of contents"
      aria-expanded={open}
    >
      <svg
        className="w-5 h-5"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13 4l4 4-4 4M17 8H3M7 12l-4 4 4 4M3 16h14"
        />
      </svg>
    </button>
  );

  const tree = (
    <>
      <div className="px-4 pt-3 pb-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <span className="font-serif text-base font-semibold text-gray-800">
          {title}
        </span>
        {arrowsButton}
      </div>
      {jumpForm}
      <div ref={treeRef} className="flex-1 overflow-y-auto py-2">
        {outline.map((node) => renderNode(node, 0))}
      </div>
    </>
  );

  // The collapsed strip's compact verse list — the current section's verse
  // numbers with the section ref at top (chapter for depth-2 texts, e.g. "5";
  // brahmana for deeper texts, e.g. "5.4"), full-bleed like the old rail.
  // Desktop-only; below lg only the arrows affordance remains.
  const strip = (
    <div className="h-full flex flex-col items-center pt-3">
      {arrowsButton}
      {stripHasSections && (
        <span
          className="mt-6 mb-2 text-lg font-semibold tabular-nums leading-none text-gray-600"
          title={script === "roman" ? "Current section" : "वर्तमान प्रकरणम्"}
        >
          {toDevanagariNumerals(activeSection)}
        </span>
      )}
      <div
        ref={stripListRef}
        className="flex-1 overflow-y-auto flex flex-col items-center gap-1.5 pt-1 pb-3 w-full"
      >
        {stripPassages.map((p) => (
          <button
            key={p.ref}
            type="button"
            data-ref={p.ref}
            onClick={() => p.ref && onJump(p.ref)}
            className="strip-verse w-8 mx-auto block text-center text-[13px] leading-5 py-0.5 tabular-nums rounded-full text-blue-600 hover:bg-blue-50"
          >
            {toDevanagariNumerals(p.ref.split(".").pop() ?? p.ref)}
          </button>
        ))}
      </div>
    </div>
  );

  if (isDesktop) {
    // Desktop: a slim always-visible full-bleed strip when collapsed (the
    // current section's verse numbers, with the arrows toggle aligned with the
    // left hamburger), expanding to the full outline panel when opened. The
    // width animates so the reading column reflows smoothly.
    return (
      <aside
        className={`shrink-0 bg-white transition-all duration-200 ${
          open
            ? "w-[220px] border-l border-gray-100"
            : "w-16 border-l border-gray-100"
        }`}
      >
        {open ? (
          <div className="w-[220px] h-full flex flex-col">{tree}</div>
        ) : (
          strip
        )}
      </aside>
    );
  }

  // Below lg: no right sidebar and no vertical rule — the reading area is
  // full-width. The arrows are a floating viewport button in FlowReader (not
  // here); this component only renders the fixed overlay (backdrop + panel)
  // that slides in from the right when opened.
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/20 z-30 ${open ? "" : "hidden"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-[220px] max-w-[85vw] bg-white border-l border-gray-100 shadow-xl flex flex-col transition-transform duration-200 ${
          open
            ? "translate-x-0 pointer-events-auto visible"
            : "translate-x-full pointer-events-none invisible"
        }`}
        aria-hidden={!open}
      >
        {tree}
      </aside>
    </>
  );
}
