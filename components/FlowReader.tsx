"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Commentary,
  EditionStub,
  Grantha,
  GranthaMetadata,
  MULA_PRESENTATION,
  Reference,
  commentaryPassageForRef,
  getAllPassagesForNavigation,
  nextUnloadedPartFirstRef,
  presentationFor,
  previousUnloadedPartFirstRef,
  sortPassagesByRef,
} from "@/lib/data";
import {
  sanitizeCommentaryHtml,
  stripMarkdown,
  toDevanagariNumerals,
  withVerseNumber,
} from "@/lib/stringUtils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useScrollspy } from "@/hooks/useScrollspy";
import GranthaSelector from "./GranthaSelector";
import FlowReaderDrawer from "./FlowReaderDrawer";
import FlowReaderFolio from "./FlowReaderFolio";
import FlowReaderCitation from "./FlowReaderCitation";
import FlowReaderCompare from "./FlowReaderCompare";
import ComparePicker from "./ComparePicker";
import { renderCommentaryWithReferences, renderMulaWithReferences } from "./renderCommentary";
import { CitationPanelHost, type SourceHighlight } from "./CitationPanel";

interface FlowReaderProps {
  grantha: Grantha;
  /** All loaded editions, one per active edition id (1–3). editions[0] is the
   *  primary (=== grantha). Compare mode is active when length >= 2. */
  editions: Grantha[];
  /** The grantha's edition stubs (for the compare picker). */
  editionsMeta: EditionStub[];
  /** Active edition ids, in order (single or compare list). */
  editionIds: string[];
  onEditionIdsChange: (ids: string[]) => void;
  granthas: GranthaMetadata[];
  selectedRef: string;
  onGranthaChange: (granthaId: string) => void;
  onVerseSelect: (ref: string) => void;
  /** Scrollspy-driven verse change (no user click). Callers should update the
   *  hash with history replacement so scrolling never pollutes back/forward. */
  onScrollVerseChange?: (ref: string) => void;
  /** Comma-separated active subcommentary IDs from the URL (?sc=). */
  activeSubcommentaryIds?: string;
  /** Toggle a subcommentary's expansion. */
  onSubcommentaryToggle: (subcommentaryId: string, isOpen: boolean) => void;
  loadPart: (firstRef: string) => Promise<void>;
  isLoadingPart: boolean;
  /** Switch back to the 3-pane view. */
  onExitFlow: () => void;
  /** Label script (Devanagari / roman), persisted in the hash (?s=). */
  script: "deva" | "roman";
  /** Persist a script change to the hash so it travels with deep links. */
  onScriptChange: (script: "deva" | "roman") => void;
  updateHash: (granthaId: string, verseRef: string, editionId?: string) => void;
  availableGranthaIds: string[];
  /** Per-grantha target metadata for the edition-aware link gate. */
  granthaById: Record<string, { editions?: { edition_id: string }[]; default_school?: string }>;
  granthaIdToDevanagariTitle: Record<string, string>;
}

const FONT_SCALE_MIN = 0.75;
const FONT_SCALE_MAX = 1.4;
/** Max scrollTop drift from the recorded target that still counts as "at the
 *  verse" — beyond it the reader has scrolled away. */
const RE_ALIGN_TOLERANCE_PX = 32;
/** How long a programmatic selection (deep link, jump, part-load re-align)
 *  suppresses the header/hash scrollspy consumers after its scroll settles,
 *  so the observer flush can't rewrite the deliberate selection. */
const SPY_HOLD_MS = 300;

/** A scrollspy consumer sink: receives the in-view verse ref plus whether the
 *  reader is currently inside the FlowReader's programmatic-selection hold. */
export type SpySink = (ref: string, held: boolean) => void;

/**
 * Flow reader — a continuous-prose reading mode (verse, then its commentary,
 * then the next verse) for a single active commentator.
 *
 * Grouping is entirely emergent: per verse per the active commentator, resolve
 * the commentary passage via `commentaryPassageForRef` and render nothing when
 * it returns undefined. There is deliberately no "unit"/group abstraction here
 * (spec §2.2 as corrected) — skipped verses simply have no passage, and the
 * covering passage sits at its own ref (the last verse of an informal range).
 *
 * Chrome: a left preferences drawer (reusing MobileDrawer), a right folio
 * outline panel (a slim chapter/verse strip that docks to a full tree on
 * desktop, or a floating arrows trigger + overlay on mobile), and a per-verse
 * citation trigger. The folio shares the reading data and the in-view-verse
 * highlight, driven by an IntersectionObserver scrollspy.
 */
export default function FlowReader({
  grantha,
  editions,
  editionsMeta,
  editionIds,
  onEditionIdsChange,
  granthas,
  selectedRef,
  onGranthaChange,
  onVerseSelect,
  onScrollVerseChange,
  activeSubcommentaryIds,
  onSubcommentaryToggle,
  loadPart,
  isLoadingPart,
  onExitFlow,
  script,
  onScriptChange,
  updateHash,
  availableGranthaIds,
  granthaById,
  granthaIdToDevanagariTitle,
}: FlowReaderProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [folioOpen, setFolioOpen] = useState(false);
  const [fontScale, setFontScale] = useState(1.2);
  const [availableWidth, setAvailableWidth] = useState(0);

  const isCompare = editionIds.length >= 2;

  // Crossing the lg breakpoint swaps the folio between its docked form and the
  // mobile overlay. Close it on the flip so a previously-open panel can't leave
  // a full-screen overlay backdrop covering the reading content (the "everything
  // disappears on resize" bug). Adjusted during render (the "adjust state when a
  // prop changes" pattern), not in an effect.
  const [prevIsDesktop, setPrevIsDesktop] = useState(isDesktop);
  if (prevIsDesktop !== isDesktop) {
    setPrevIsDesktop(isDesktop);
    setFolioOpen(false);
  }

  const passages = useMemo(
    () => sortPassagesByRef(getAllPassagesForNavigation(grantha)),
    [grantha],
  );
  const activeCommentary: Commentary | undefined = grantha.commentaries[0];
  const hasSubcommentaries =
    (activeCommentary?.subcommentaries?.length ?? 0) > 0;

  // Index-metadata titles for citations (the index always carries correct
  // Devanagari + IAST forms; the loaded Grantha object may only have one).
  const granthaMeta = granthas.find((g) => g.id === grantha.grantha_id);
  const granthaTitleDeva =
    granthaMeta?.title_deva ?? grantha.title_deva ?? grantha.canonical_title;
  const granthaTitleIast =
    granthaMeta?.title_iast ?? grantha.title_iast ?? grantha.canonical_title;

  const activeSubIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of (activeSubcommentaryIds || "").split(",")) {
      if (id.trim()) {
        set.add(id.trim());
      }
    }
    return set;
  }, [activeSubcommentaryIds]);

  const topStructureLevel = grantha.structure_levels[0];
  const structureLabel =
    topStructureLevel?.scriptNames[
      script === "roman" ? "roman" : "devanagari"
    ] ??
    topStructureLevel?.scriptNames.devanagari ??
    "";

  // Structure depth (1 = flat verse list, 2 = chapter→verse, 3+ = deeper).
  const structureDepth = useMemo(() => {
    let depth = 1;
    let level = grantha.structure_levels?.[0];
    while (level?.children?.length) {
      depth += 1;
      level = level.children[0];
    }
    return depth;
  }, [grantha]);

  // Main-passage refs that open a new top-level section (e.g. a new adhyāya),
  // so chapter dividers are computed purely from the passage list. Only
  // meaningful when there is a structural level above the verse (depth >= 2);
  // a depth-1 text has no sections to divide at.
  const sectionStartRefs = useMemo(() => {
    const starts = new Set<string>();
    if (structureDepth < 2) return starts;
    let lastSection: string | null = null;
    for (const passage of passages) {
      if (passage.passage_type !== "main") continue;
      const section = passage.ref.split(".")[0];
      if (lastSection !== null && section !== lastSection) {
        starts.add(passage.ref);
      }
      lastSection = section;
    }
    return starts;
  }, [passages, structureDepth]);

  const currentSection = selectedRef.split(".")[0];

  const commentatorName =
    activeCommentary?.commentator?.[
      script === "roman" ? "roman" : "devanagari"
    ] ??
    activeCommentary?.commentator?.devanagari ??
    "";

  const tikaLabel = script === "roman" ? "Ṭīkā" : "टीका";

  // Compare columns need a wider canvas than the single-column reading width
  // (spec §5.2: ~1024px for 2-up, ~1600px for 3-up). The swipe fallback's
  // pages constrain themselves back to reading width internally. Single mode
  // uses max-w-3xl (wider than the verse's max-w-2xl) so the commentary runs
  // wider than the mūla — less dead whitespace at the sides.
  const contentWidthClass = isCompare
    ? editions.length >= 3
      ? "max-w-[1600px]"
      : "max-w-5xl"
    : "max-w-3xl";

  // Summary shown on the compare-picker trigger: the active editions' labels
  // ("title - author") joined in selection order. The title distinguishes the
  // editions; the author is shared across editions of the same grantha (e.g.
  // Rāmānuja's three), so "title - author" is the single useful line.
  const compareSummary = useMemo(() => {
    const labels = editionsMeta
      .filter((stub) => editionIds.includes(stub.edition_id))
      .map((stub) =>
        [
          stub.commentary_title,
          script === "roman"
            ? stub.commentator?.roman || stub.commentator?.devanagari
            : stub.commentator?.devanagari,
        ]
          .filter(Boolean)
          .join(" - ") || stub.edition_id,
      );
    return labels.length ? labels.join(" · ") : (grantha.edition_id ?? "");
  }, [editionsMeta, editionIds, script, grantha.edition_id]);

  const verseRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const lastAutoScroll = useRef<{
    ref: string;
    found: boolean;
    /** The container scrollTop at which the selected verse's top was aligned. */
    targetScrollTop: number;
  } | null>(null);
  const justClicked = useRef(false);
  // Set when a selection change came from the scrollspy (user scrolling), so
  // the auto-scroll effect knows the verse is already in view and must not
  // re-align (which would fight the user's scroll).
  const scrollDrivenSelection = useRef(false);
  // True once the auto-scroll effect has pinned the current selectedRef (or
  // recorded a scroll/click-driven target). Until then the URL selection is
  // authoritative: the scrollspy's initial mount report fires at scrollTop 0
  // (the first rendered verse) before the deep-linked verse has been aligned
  // to, and must not rewrite the hash to that first verse. Suppressing scroll→
  // hash until the selection is pinned keeps deep links, folio jumps, and mode
  // flips from being clobbered a frame after load.
  const selectionPinned = useRef(false);
  // Whether the user has actually scrolled since the last programmatic align.
  // The scrollspy also fires for programmatic aligns, scroll anchoring,
  // content insertions, and font-load reflows — none of those are the user
  // reading, and none may rewrite the URL. Only a real user scroll (wheel /
  // touch / keyboard / scrollbar drag) opens the gate; the auto-scroll effect
  // re-arms it whenever it (re)aligns a selection.
  const userScrolled = useRef(false);

  // A selection change (deep link, cross-reference, back/forward) makes the
  // URL authoritative again until the new verse is aligned AND the user has
  // scrolled past that alignment. Without this reset, a hash-only navigation
  // (the component stays mounted) would inherit the previous reading session's
  // `userScrolled`/`selectionPinned` state, and a mid-transition scrollspy
  // report could rewrite the URL to an un-aligned verse. Reset during render
  // (the "adjust state when a prop changes" pattern), so the gate closes before
  // any effect or observer can fire.
  const [prevSelectedRef, setPrevSelectedRef] = useState(selectedRef);
  if (prevSelectedRef !== selectedRef) {
    setPrevSelectedRef(selectedRef);
    selectionPinned.current = false;
    userScrolled.current = false;
  }

  // Single scrollspy, shared by every consumer (header section, scroll→hash,
  // and the folio marker via the spy sink). A programmatic selection (deep
  // link, folio jump, click, part-load re-align) pins the selected verse above
  // the spy band, so the observer's post-scroll flush would report the verse
  // below it and rewrite the deliberate selection. `holdUntil` suppresses the
  // header/hash consumers for a short window after any programmatic scroll;
  // the folio sink is still notified (with `held` true) so its own guard keeps
  // the marker pinned. `pendingRef` buffers the last in-band verse during the
  // hold so a user scroll that lands inside the window is still flushed once
  // the hold expires — but only if the reader actually moved off the pinned
  // position (see `armSpyHold`).
  const holdUntil = useRef(0);
  const pendingRef = useRef<string | null>(null);
  const holdTimer = useRef<number | null>(null);
  // The folio registers its marker callback here (one observer, many sinks).
  const spySinkRef = useRef<SpySink | null>(null);
  // Latest-value refs so the stable scrollspy callback never goes stale.
  const granthaRef = useRef(grantha);
  granthaRef.current = grantha;
  const selectedRefRef = useRef(selectedRef);
  selectedRefRef.current = selectedRef;
  const onScrollVerseChangeRef = useRef(onScrollVerseChange);
  onScrollVerseChangeRef.current = onScrollVerseChange;

  // The adhyāya the reader is actually looking at, driven by the scrollspy so
  // the header chapter title tracks the view across chapter boundaries — not
  // just hash navigation. Initialized to the selected section; prefatory/
  // concluding passages (e.g. the mangalācaraṇa preface) don't collapse it onto
  // "chapter 0", mirroring the folio strip.
  const [viewSection, setViewSection] = useState(currentSection);

  // Register the folio's marker sink so a single scrollspy feeds both the
  // chrome and the content hash. The sink is stored in a ref — re-registering
  // is cheap and idempotent (FlowReaderFolio calls this once per grantha).
  const registerSpySink = useCallback((sink: SpySink | null) => {
    spySinkRef.current = sink;
  }, []);

  // The single scrollspy consumer: notifies the folio sink always (it owns its
  // own held-guard), and while not held updates the header chapter and the URL
  // hash (scroll→hash, replaceState) for main passages only.
  const handleSpyReport = useCallback((ref: string, held: boolean) => {
    spySinkRef.current?.(ref, held);
    if (held) return;
    const g = granthaRef.current;
    if (!g.passages.some((p) => p.passage_type === "main" && p.ref === ref)) {
      return;
    }
    const section = ref.split(".")[0] ?? ref;
    setViewSection((prev) => (prev === section ? prev : section));
    const onChange = onScrollVerseChangeRef.current;
    // Scroll→hash must reflect a real user scroll, never an artifact of a
    // programmatic selection or a content shift. Two windows are excluded:
    //   - before the auto-scroll effect has pinned the current selection
    //     (the mount report fires at scrollTop 0, ahead of the deep-linked
    //     verse's alignment), and
    //   - while no user scroll has happened since the last programmatic align.
    //     A late part load or font-load reflow shifts verse midpoints without
    //     the reader moving, so the scrollspy reports a neighbor verse; the
    //     URL must keep the deliberate selection. `userScrolled` re-arms on
    //     every programmatic align and opens only on a real user scroll.
    if (
      onChange &&
      ref !== selectedRefRef.current &&
      selectionPinned.current &&
      userScrolled.current
    ) {
      scrollDrivenSelection.current = true;
      onChange(ref);
    }
  }, []);

  // Arm a short programmatic-selection hold. When it expires, flush the
  // buffered in-band verse — but only if the reader actually scrolled off the
  // pinned position, otherwise the deliberate selection (deep link / jump)
  // would be rewritten by the mount flush alone.
  const armSpyHold = useCallback(() => {
    holdUntil.current = performance.now() + SPY_HOLD_MS;
    pendingRef.current = null;
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      const ref = pendingRef.current;
      pendingRef.current = null;
      if (!ref) return;
      const container = scrollContainerRef.current;
      const target = lastAutoScroll.current;
      if (
        !container ||
        !target ||
        Math.abs(container.scrollTop - target.targetScrollTop) <
          RE_ALIGN_TOLERANCE_PX
      ) {
        return;
      }
      handleSpyReport(ref, false);
    }, SPY_HOLD_MS);
  }, [handleSpyReport]);

  useEffect(() => () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
  }, []);

  // Re-observe when the observed `[data-verse-ref]` set changes: grantha/
  // passage changes, entering/leaving compare (editionIds.length), the compare
  // editions loading in (editions.length), and the columns↔swipe layout flip
  // (availableWidth starts 0 and is then measured, which would otherwise leave
  // the observer bound to detached nodes). The callback reads latest values
  // through refs, so its identity is stable across re-renders.
  useScrollspy(
    scrollContainerRef,
    [grantha, editionIds.length, editions.length, availableWidth],
    (ref) => {
      const held = performance.now() < holdUntil.current;
      if (held) {
        pendingRef.current = ref;
      }
      handleSpyReport(ref, held);
    },
  );

  // Measure the reading area's available width so compare mode can choose
  // columns-vs-swipe live (availableWidth / count >= threshold). A ResizeObserver
  // keeps it accurate across window resizes AND the folio docking (which
  // shrinks the reading column on desktop).
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const update = () => setAvailableWidth(container.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Resolve the DOM node for a verse ref across both reading surfaces: the
  // single branch registers elements into `verseRefs`, compare only marks them
  // with `data-verse-ref` — fall back to a container query so jumping works
  // in compare mode too. `querySelector` returns the first match (the primary
  // edition's element in swipe view).
  const findVerseElement = useCallback((ref: string): HTMLElement | null => {
    return (
      verseRefs.current[ref] ??
      scrollContainerRef.current?.querySelector<HTMLElement>(
        `[data-verse-ref="${ref}"]`,
      ) ??
      null
    );
  }, []);

  // Align the selected verse's top with the container top and record the
  // scrollTop that achieves it, so later position checks know where "in view"
  // was.
  // Resolve the scroll target for a selected verse. A verse that follows a
  // prefatory passage (a sarga praveśa / whole-work mangala, ref K.N.0) should
  // land with that intro at the top of the viewport — the reader sees the
  // praveśa first, then the verse. Only the immediately-preceding passage in
  // the same sarga counts, so later verses of a sarga scroll to themselves.
  const prefatoryScrollTargetFor = useCallback(
    (ref: string): string => {
      const idx = passages.findIndex((p) => p.ref === ref);
      if (idx <= 0) return ref;
      const prev = passages[idx - 1];
      if (prev.passage_type !== "prefatory") return ref;
      const refPrefix = ref.split(".").slice(0, -1).join(".");
      const prevPrefix = prev.ref.split(".").slice(0, -1).join(".");
      return prevPrefix === refPrefix ? prev.ref : ref;
    },
    [passages],
  );

  const alignVerseToTop = useCallback(
    (ref: string): void => {
      const container = scrollContainerRef.current;
      const element = findVerseElement(prefatoryScrollTargetFor(ref));
      if (!container || !element) return;
      const targetScrollTop =
        element.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;
      lastAutoScroll.current = { ref, found: true, targetScrollTop };
      // Programmatic align: re-arm the scroll→hash gate — the scrollspy will
      // fire for this scroll and must not rewrite the URL until the user
      // actually scrolls again.
      userScrolled.current = false;
      // Set scrollTop directly (equivalent to scrollIntoView block:"start" for
      // the vertical container) so the horizontal swipe track is never moved
      // when the target element sits in a non-primary compare page.
      container.scrollTop = targetScrollTop;
    },
    [findVerseElement, prefatoryScrollTargetFor],
  );

  // Auto-scroll to the selected verse on mount and when the selection changes
  // from external navigation (deep link, mode flip). Also re-positions it when
  // a lazy load inserts content ABOVE it (e.g. the backward preload of the
  // previous chapter), so the reader isn't left staring at a middle verse of
  // the newly-inserted chapter — but ONLY when the user hasn't scrolled away
  // from the position we set (compare the container scrollTop against the
  // recorded target). Forward loads below never trigger a re-scroll. Retries
  // when the element appears only after a part load.
  useEffect(() => {
    if (scrollDrivenSelection.current) {
      scrollDrivenSelection.current = false;
      // The selection came from scrolling: the verse is already in the view
      // band. Record the current scrollTop as the target (so a later lazy load
      // only re-aligns if it shifts content above) but do NOT re-align.
      // Re-pin the selection: the render-time reset below it set
      // `selectionPinned` to false on the hash change, and without re-pinning
      // here the scroll→hash gate would stay closed forever (the URL would
      // freeze after the first scrollspy-driven hash write).
      selectionPinned.current = true;
      lastAutoScroll.current = {
        ref: selectedRef,
        found: true,
        targetScrollTop: scrollContainerRef.current?.scrollTop ?? 0,
      };
      return;
    }
    if (justClicked.current) {
      justClicked.current = false;
      // The user just clicked this verse — they're already where they want to
      // be. Record the current scrollTop as the "target" so a later lazy load
      // only re-aligns if it shifts content above the selected verse while the
      // reader is still here, never yanking them away from a manual scroll.
      lastAutoScroll.current = {
        ref: selectedRef,
        found: true,
        targetScrollTop: scrollContainerRef.current?.scrollTop ?? 0,
      };
      return;
    }
    const container = scrollContainerRef.current;
    const element = findVerseElement(selectedRef);
    const prev = lastAutoScroll.current;

    if (!element) {
      // Element not mounted yet (part still loading); remember so we retry.
      // The selection is not pinned — the URL stays authoritative until the
      // verse appears and is aligned to.
      lastAutoScroll.current = {
        ref: selectedRef,
        found: false,
        targetScrollTop: 0,
      };
      selectionPinned.current = false;
      return;
    }

    if (prev && prev.ref === selectedRef && prev.found) {
      // Same verse, re-render (e.g. a lazy part landed). Re-align only if the
      // verse shifted because content was inserted above it AND the reader is
      // still where we left them (scrollTop matches our last target).
      if (
        container &&
        Math.abs(container.scrollTop - prev.targetScrollTop) <
          RE_ALIGN_TOLERANCE_PX
      ) {
        armSpyHold();
        alignVerseToTop(selectedRef);
      }
      return;
    }

    // New selection (or first mount): align.
    armSpyHold();
    alignVerseToTop(selectedRef);
    selectionPinned.current = true;
    // `availableWidth` is also a dep: a compare columns↔swipe flip changes
    // the verse layout, so the selected verse re-aligns to the new layout.
  }, [
    selectedRef,
    passages,
    availableWidth,
    alignVerseToTop,
    findVerseElement,
    armSpyHold,
  ]);

  useEffect(
    () => () => {
      observer.current?.disconnect();
    },
    [],
  );

  // Sentinel observer: when the bottom of the loaded scroll comes into view and
  // more part files exist, load the next unloaded part.
  const loaderRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isLoadingPart) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && grantha.parts) {
          const nextFirstRef = nextUnloadedPartFirstRef(grantha, passages);
          if (nextFirstRef) {
            loadPart(nextFirstRef);
          }
        }
      });
      if (node) observer.current.observe(node);
    },
    [isLoadingPart, grantha, passages, loadPart],
  );

  // On mount / grantha change: preload the part immediately before the selected
  // verse's section, so a deep-linked verse always has the previous chapter
  // available above it (e.g. loading 3.1 makes chapter 2 present before the
  // user scrolls). Deterministic: computed from the envelope's parts array, not
  // from the in-flight passage state, and keyed only on the grantha/section so
  // it runs once and never chains eagerly.
  useEffect(() => {
    const parts = grantha.parts;
    if (!parts || parts.length === 0) return;
    const section = selectedRef.split(".")[0];
    const sectionIdx = parts.findIndex(
      (p) => p.first_ref.split(".")[0] === section,
    );
    if (sectionIdx <= 0) return;
    const prevPart = parts[sectionIdx - 1];
    if (
      prevPart &&
      !grantha.passages.some((p) => p.ref === prevPart.first_ref)
    ) {
      loadPart(prevPart.first_ref);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantha.grantha_id, grantha.edition_id, selectedRef.split(".")[0]]);

  // Load the previous unloaded part in the gap (used by the scroll runway).
  const loadPreviousPart = useCallback(() => {
    if (!grantha.parts || isLoadingPart) return;
    const prevFirstRef = previousUnloadedPartFirstRef(grantha, passages);
    if (prevFirstRef) {
      loadPart(prevFirstRef);
    }
  }, [grantha, passages, isLoadingPart, loadPart]);

  // Backward lazy-loading via a scroll listener (an IntersectionObserver sentinel
  // can't work here: an element above the scroll container's clip is never
  // "intersecting", so a sentinel above the loaded content would only fire at
  // scrollTop 0). When the reader scrolls within ~3 screen-heights of the top of
  // the loaded content, load the previous unloaded part. The runway gives the
  // fetch time to complete before the reader reaches the newly-inserted content.
  const RUNWAY_SCREENS = 3;
  const handleApproachScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (container.scrollTop <= RUNWAY_SCREENS * container.clientHeight) {
      loadPreviousPart();
    }
  }, [loadPreviousPart]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleApproachScroll, {
      passive: true,
    });
    return () => container.removeEventListener("scroll", handleApproachScroll);
  }, [handleApproachScroll]);

  // Mark real user scrolls. The scrollspy also fires for programmatic aligns,
  // scroll anchoring, content insertions, and font-load reflows — none of which
  // may rewrite the URL (the reader did not move). A wheel / touch / keyboard
  // gesture is the only signal that unambiguously means the user scrolled; the
  // auto-scroll effect re-arms it (back to false) on every programmatic align.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const SCROLL_KEYS = new Set([
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
      " ",
      "Spacebar",
    ]);
    const onWheel = () => {
      userScrolled.current = true;
    };
    const onTouch = () => {
      userScrolled.current = true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) {
        userScrolled.current = true;
      }
    };
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouch);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleVerseClick = (ref: string) => {
    if (ref !== selectedRef) {
      justClicked.current = true;
      onVerseSelect(ref);
    }
  };

  const setVerseRef = (ref: string, el: HTMLDivElement | null) => {
    if (el) {
      verseRefs.current[ref] = el;
    } else {
      delete verseRefs.current[ref];
    }
  };

  // A folio/rail jump selects the verse and, on mobile, closes the folio panel
  // since it's covering the reading content (spec §3.3).
  const handleFolioJump = (ref: string) => {
    onVerseSelect(ref);
    if (!isDesktop) {
      setFolioOpen(false);
    }
  };

  // Subcommentary (ṭīkā): render the rule-styled toggle + block only for verses
  // where the sub has its own passage. All instances of the same subcommentary
  // id toggle together; visibility is derived from activeSubcommentaryIds, not
  // per-block local state (spec §2.5/§4). The whole subtree is gated on the
  // commentary actually having subcommentaries; the plumbing is data-driven,
  // not hardcoded.
  const renderSubcommentary = (
    sub: Commentary,
    verseRef: string,
    sourceHighlight: SourceHighlight | null,
  ): ReactNode => {
    const subPassage = commentaryPassageForRef(sub.passages, verseRef);
    if (!subPassage) {
      return null;
    }
    const isOpen = activeSubIds.has(sub.commentary_id);
    const ruleColor = isOpen ? "bg-blue-300" : "bg-gray-200";
    const labelColor = isOpen ? "text-blue-500" : "text-gray-400";
    return (
      <div key={sub.commentary_id} className="my-5">
        <button
          type="button"
          onClick={() => onSubcommentaryToggle(sub.commentary_id, !isOpen)}
          aria-expanded={isOpen}
          className="w-full flex items-center gap-3 group cursor-pointer"
        >
          <span className={`flex-1 h-px ${ruleColor}`} />
          <span className={`text-xs font-serif tracking-wide ${labelColor}`}>
            {tikaLabel}
          </span>
          <span className={`flex-1 h-px ${ruleColor}`} />
        </button>
        {isOpen && (
          <div className="mt-3">
            <div className="text-sm text-gray-400 font-serif mb-2">
              {sub.commentary_title}
              {sub.commentator?.devanagari
                ? ` · ${sub.commentator.devanagari}`
                : ""}
            </div>
            {subPassage.intro?.sanskrit?.devanagari && (
              <p
                className="verse-text font-serif flow-commentary-sub leading-relaxed text-gray-700 mb-3"
                dangerouslySetInnerHTML={{
                  __html: sanitizeCommentaryHtml(
                    subPassage.intro.sanskrit.devanagari,
                  ),
                }}
              />
            )}
            <p className="verse-text font-serif flow-commentary-sub leading-relaxed text-gray-600">
              {renderCommentaryWithReferences(
                subPassage.content?.sanskrit?.devanagari || "",
                subPassage.references,
                {
                  currentGranthaId: grantha.grantha_id,
                  sourcePassageRef: verseRef,
                  sourceHighlight,
                  updateHash,
                  availableGranthaIds,
                  granthaById,
                  granthaIdToTitle: granthaIdToDevanagariTitle,
                },
              )}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderSubcommentaries = (
    verseRef: string,
    sourceHighlight: SourceHighlight | null,
  ): ReactNode => {
    if (!hasSubcommentaries || !activeCommentary?.subcommentaries) {
      return null;
    }
    return activeCommentary.subcommentaries.map((sub) =>
      renderSubcommentary(sub, verseRef, sourceHighlight),
    );
  };

  return (
    <main
      className="flow-reader h-screen bg-white flex"
      style={{ "--reading-scale": fontScale } as CSSProperties}
    >
      <h1 className="sr-only">Grantha Explorer</h1>

      {/* Hamburger — pinned to the top-left of the viewport, left-aligned with
          the reading column below (spec §3.2 trigger). */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed top-3 left-3 z-30 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label="Open reading preferences"
      >
        <svg
          className="w-5 h-5"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          aria-hidden="true"
        >
          <path strokeLinecap="round" d="M3 5h14M3 10h14M3 15h10" />
        </svg>
      </button>

      {/* Folio arrows — below lg the right sidebar disappears, so the arrows
          become a floating viewport affordance mirroring the hamburger on the
          left. Hidden while the folio overlay is open (its own header arrow is
          the close control then), so exactly one arrows control exists at a
          time. */}
      {!isDesktop && !folioOpen && (
        <button
          type="button"
          onClick={() => setFolioOpen((v) => !v)}
          className="fixed top-3 right-3 z-30 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Table of contents"
          aria-expanded={folioOpen}
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
      )}

      {/* Left column: header + reading content. The right folio panel is a
          full-bleed sibling below, spanning the full viewport height. */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="relative shrink-0 border-b border-gray-100 bg-white">
          {/* Centered title stack, matching the reference mockup. px-16 below lg
            reserves the corners for the floating hamburger/arrows buttons so a
            long title can never slide under them; desktop (lg+) needs only px-6
            since the arrows live in the docked sidebar there. */}
          <div className="flex flex-col items-center pt-6 pb-4 px-16 lg:px-6">
            <div className="hidden lg:block mb-1.5">
              <span className="font-serif text-xs text-gray-400 tracking-wide">
                ग्रन्थपरिशीलकः
              </span>
            </div>
            <GranthaSelector
              granthas={granthas}
              selectedGranthaId={grantha.grantha_id}
              onSelect={onGranthaChange}
              triggerClassName="inline-flex max-w-full items-center gap-2 font-serif text-[1.5rem] font-semibold bg-transparent cursor-pointer hover:opacity-70 transition-opacity"
            />
            {structureDepth >= 2 && (
              <button
                type="button"
                onClick={() => setFolioOpen((v) => !v)}
                className="flex items-center gap-1 mt-1.5 hover:opacity-70 transition-opacity"
                title="Open table of contents"
                aria-label={
                  script === "roman" ? "Select chapter" : "अध्याय चुनें"
                }
              >
                <span className="font-serif text-base font-semibold text-gray-700">
                  {structureLabel} {toDevanagariNumerals(viewSection)}
                </span>
                <svg
                  className="w-3.5 h-3.5 text-gray-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
            {editionsMeta.length >= 2 && (
              <div className="mt-3">
                <ComparePicker
                  editions={editionsMeta}
                  selectedIds={
                    editionIds.length ? editionIds : [grantha.edition_id ?? ""]
                  }
                  onConfirm={onEditionIdsChange}
                  script={script}
                  triggerLabel={compareSummary}
                />
              </div>
            )}
            {activeCommentary && editionsMeta.length < 2 && (
              <div className="text-sm text-gray-500 font-serif mt-1">
                {activeCommentary.commentary_title}
                {commentatorName ? ` - ${commentatorName}` : ""}
              </div>
            )}
          </div>
        </header>

        <CitationPanelHost
          className="relative flex flex-1 min-h-0 flex-col"
          surfaceKey={`${grantha.grantha_id}:${selectedRef}`}
        >
        {(sourceHighlight) => (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
        >
            <div className={`mx-auto px-8 py-10 ${contentWidthClass}`}>
              {isCompare ? (
                <FlowReaderCompare
                  editions={editions}
                  passages={passages}
                  selectedRef={selectedRef}
                  onVerseSelect={onVerseSelect}
                  script={script}
                  activeSubcommentaryIds={activeSubcommentaryIds}
                  onSubcommentaryToggle={onSubcommentaryToggle}
                  availableWidth={availableWidth}
                  grantha={grantha}
                  granthaTitleDeva={granthaTitleDeva}
                  granthaTitleIast={granthaTitleIast}
                  updateHash={updateHash}
                  availableGranthaIds={availableGranthaIds}
                  granthaById={granthaById}
                  granthaIdToDevanagariTitle={granthaIdToDevanagariTitle}
                  sourceHighlight={sourceHighlight}
                />
              ) : (
                passages.map((passage, index) => {
                  const isMain = passage.passage_type === "main";
                  const section = passage.ref.split(".")[0];

                  // Chapter divider — label from the grantha's own structure_levels,
                  // never hardcoded to "अध्याय" (spec §3.3). Only main passages open
                  // a section, so dividers never precede prefatory/concluding items.
                  let divider: ReactNode = null;
                  if (
                    isMain &&
                    structureLabel &&
                    sectionStartRefs.has(passage.ref)
                  ) {
                    divider = (
                      <div
                        key={`divider-${index}`}
                        className="flex items-center gap-4 my-12"
                      >
                        <span className="flex-1 h-px bg-gray-200" />
                        <span className="text-sm text-gray-400 font-serif tracking-wide">
                          {structureLabel} {toDevanagariNumerals(section)}
                        </span>
                        <span className="flex-1 h-px bg-gray-200" />
                      </div>
                    );
                  }

                  if (!isMain) {
                    // Prefatory/concluding passages render their own prose
                    // (e.g. a sarga praveśa or the whole-work mangalācaraṇa).
                    // The passage label is navigation metadata, not display
                    // text — it is deliberately not rendered here.
                    const content = passage.content?.sanskrit?.devanagari;
                    // The whole-work opening (e.g. the Gita's maṅgalācaraṇa)
                    // lives in commentary.intro, keyed to its label-only
                    // prefatory anchor — the same prefaceAnchor mechanism
                    // CommentaryPanel uses (§2.3). Render it only at that
                    // anchor's own position, once.
                    const prefaceAnchor =
                      activeCommentary?.intro &&
                      passage.ref === grantha.prefatory_material?.[0]?.ref
                        ? activeCommentary.intro
                        : null;
                    return (
                      <Fragment key={`${passage.passage_type}-${passage.ref}`}>
                        <div data-verse-ref={passage.ref} className="px-4 py-8">
                          {prefaceAnchor ? (
                            <p
                              className="verse-text font-serif flow-intro leading-relaxed text-gray-700 whitespace-pre-line"
                              dangerouslySetInnerHTML={{
                                __html: sanitizeCommentaryHtml(
                                  prefaceAnchor.sanskrit?.devanagari || "",
                                ),
                              }}
                            />
                          ) : content ? (
                            <p className="verse-text font-serif flow-intro leading-relaxed text-gray-700 whitespace-pre-line">
                              {stripMarkdown(content)}
                            </p>
                          ) : null}
                          {renderSubcommentaries(passage.ref, sourceHighlight)}
                        </div>
                      </Fragment>
                    );
                  }

                  const cp =
                    activeCommentary && isMain
                      ? commentaryPassageForRef(
                          activeCommentary.passages,
                          passage.ref,
                        )
                      : undefined;
                  const isSelected = passage.ref === selectedRef;
                  const rawMula = passage.content?.sanskrit?.devanagari;
                  const mula = stripMarkdown(rawMula);
                  const mulaRefs = (passage as { references?: Reference[] }).references;
                  const introText = cp?.intro?.sanskrit?.devanagari;
                  // Presentation is a total function of the passage's declared
                  // kind (per-block presentation model, IDEA.md).
                  const mulaPresentation = MULA_PRESENTATION[presentationFor(passage.kind ?? "")];

                  return (
                    <Fragment key={`${passage.passage_type}-${passage.ref}`}>
                      {divider}
                      <div
                        ref={(el) => setVerseRef(passage.ref, el)}
                        data-verse-ref={passage.ref}
                        onClick={() => handleVerseClick(passage.ref)}
                        className={`group px-4 py-8 transition-colors ${
                          isSelected ? "bg-gray-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            {introText && (
                              <p
                                className="verse-text font-serif flow-intro leading-relaxed text-gray-700 mb-5"
                                dangerouslySetInnerHTML={{
                                  __html: sanitizeCommentaryHtml(introText),
                                }}
                              />
                            )}
                            {/* Mūla verse: presentation is a total function of
                            the passage's declared kind (per-block presentation
                            model, IDEA.md). Verse kinds (Shloka/Mantra/Verse/
                            Sutra) sit in a narrower, centered, left-ruled column
                            so commentary runs wider; prose kinds (Para/Gadya)
                            render undecorated like commentary — no border, no
                            centering. The passage number is autogenerated from
                            the ref in double dandas (॥ N ॥, print convention,
                            spec §6.1) for every kind; `withVerseNumber`/the
                            danda append no-op on non-numeric refs. */}
                            <div className={mulaPresentation.wrapper}>
                              {passage.speaker && (
                                <div className="font-serif text-sm text-gray-600 mb-2">
                                  {stripMarkdown(passage.speaker)}
                                </div>
                              )}
                              {mula && (
                                <div className={`verse-text font-serif ${mulaPresentation.text}`}>
                                  {(mulaRefs && mulaRefs.length > 0) || (passage.verse_quotes && passage.verse_quotes.length > 0) ? (
                                    <>
                                      {renderMulaWithReferences(
                                        rawMula ?? "",
                                        mulaRefs,
                                        {
                                          currentGranthaId: grantha.grantha_id,
                                                            sourcePassageRef: passage.ref,
                  sourceHighlight,
                  updateHash,
                                          availableGranthaIds,
                                          granthaById,
                                          granthaIdToTitle: granthaIdToDevanagariTitle,
                                        },
                                        passage.verse_quotes,
                                      )}
                                      {" "}॥ {toDevanagariNumerals(passage.ref)} ॥
                                    </>
                                  ) : (
                                    withVerseNumber(mula, passage.ref)
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 pl-3 pt-1">
                            <FlowReaderCitation
                              grantha={grantha}
                              verseRef={passage.ref}
                              subcommentaryIds={activeSubcommentaryIds}
                              script={script}
                              granthaTitleDeva={granthaTitleDeva}
                              granthaTitleIast={granthaTitleIast}
                              revealOnHover
                            />
                          </div>
                        </div>
                        {cp && (
                          <div>
                            {cp.prefatory_material?.map((item, idx) => (
                              <div key={idx} className="mb-4">
                                {item.label && (
                                  <div className="text-sm text-gray-600 italic mb-3">
                                    {item.label}
                                  </div>
                                )}
                                <p className="verse-text font-serif flow-commentary leading-relaxed text-gray-700 whitespace-pre-line">
                                  {item.content?.sanskrit?.devanagari || ""}
                                </p>
                              </div>
                            ))}
                            <p className="verse-text font-serif flow-commentary leading-relaxed text-gray-700 whitespace-pre-line">
                              {renderCommentaryWithReferences(
                                cp.content?.sanskrit?.devanagari || "",
                                cp.references,
                                {
                                  currentGranthaId: grantha.grantha_id,
                                                    sourcePassageRef: passage.ref,
                  sourceHighlight,
                  updateHash,
                                  availableGranthaIds,
                                  granthaById,
                                  granthaIdToTitle: granthaIdToDevanagariTitle,
                                },
                              )}
                            </p>
                            {renderSubcommentaries(passage.ref, sourceHighlight)}
                          </div>
                        )}
                      </div>
                    </Fragment>
                  );
                })
              )}

              <div ref={loaderRef} />
              {isLoadingPart && (
                <div className="text-center py-4">
                  <span className="text-gray-400">…</span>
                </div>
              )}
            </div>
          </div>
        )}
        </CitationPanelHost>
      </div>

      <FlowReaderFolio
        grantha={grantha}
        isDesktop={isDesktop}
        open={folioOpen}
        onClose={() => setFolioOpen(false)}
        onToggle={() => setFolioOpen((v) => !v)}
        onJump={handleFolioJump}
        selectedRef={selectedRef}
        script={script}
        registerSpySink={registerSpySink}
        loadPart={loadPart}
      />

      <FlowReaderDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        script={script}
        onScriptToggle={() =>
          onScriptChange(script === "deva" ? "roman" : "deva")
        }
        fontScale={fontScale}
        onFontScaleChange={(next) =>
          setFontScale(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next)))
        }
        onExitFlow={onExitFlow}
      />
    </main>
  );
}
