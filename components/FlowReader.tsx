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
  PrefatoryMaterial,
  commentaryPassageForRef,
  getAllPassagesForNavigation,
  nextUnloadedPartFirstRef,
} from "@/lib/data";
import {
  sanitizeCommentaryHtml,
  stripMarkdown,
  toDevanagariNumerals,
} from "@/lib/stringUtils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import GranthaSelector from "./GranthaSelector";
import FlowReaderDrawer from "./FlowReaderDrawer";
import FlowReaderFolio from "./FlowReaderFolio";
import FlowReaderCitation from "./FlowReaderCitation";
import FlowReaderCompare from "./FlowReaderCompare";
import ComparePicker from "./ComparePicker";

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
}

const FONT_SCALE_MIN = 0.75;
const FONT_SCALE_MAX = 1.4;

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
  activeSubcommentaryIds,
  onSubcommentaryToggle,
  loadPart,
  isLoadingPart,
  onExitFlow,
  script,
  onScriptChange,
}: FlowReaderProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [folioOpen, setFolioOpen] = useState(false);
  const [fontScale, setFontScale] = useState(1);
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
    () => getAllPassagesForNavigation(grantha),
    [grantha]
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
    topStructureLevel?.scriptNames[script === "roman" ? "roman" : "devanagari"] ??
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
    activeCommentary?.commentator?.[script === "roman" ? "roman" : "devanagari"] ??
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

  // Summary shown on the compare-picker trigger: the active commentators' names
  // joined, in selection order.
  const compareSummary = useMemo(() => {
    const names = editionsMeta
      .filter((stub) => editionIds.includes(stub.edition_id))
      .map((stub) =>
        script === "roman"
          ? stub.commentator?.roman || stub.commentator?.devanagari || stub.edition_id
          : stub.commentator?.devanagari || stub.edition_id
      );
    return names.length ? names.join(" · ") : grantha.edition_id ?? "";
  }, [editionsMeta, editionIds, script, grantha.edition_id]);

  const verseRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const lastAutoScroll = useRef<{ ref: string; found: boolean } | null>(null);
  const justClicked = useRef(false);

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

  // Auto-scroll to the selected verse on mount and when the selection changes
  // from external navigation (deep link, mode flip). Skips re-scrolling to the
  // verse the user just clicked (they are already there) and suppresses
  // re-yanking on lazy part loads that re-render the list. Retries when the
  // element appears only after a part load.
  useEffect(() => {
    if (justClicked.current) {
      justClicked.current = false;
      // Record the current position so a later part load (which re-runs this
      // effect via `passages`) doesn't scroll the viewport back to it.
      lastAutoScroll.current = { ref: selectedRef, found: true };
      return;
    }
    const element = verseRefs.current[selectedRef];
    const prev = lastAutoScroll.current;
    if (prev && prev.ref === selectedRef && prev.found) {
      return;
    }
    if (element) {
      lastAutoScroll.current = { ref: selectedRef, found: true };
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      lastAutoScroll.current = { ref: selectedRef, found: false };
    }
  }, [selectedRef, passages]);

  useEffect(() => () => observer.current?.disconnect(), []);

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
    [isLoadingPart, grantha, passages, loadPart]
  );

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
  // commentary actually having subcommentaries — zero exist in the library
  // today, so nothing renders, but the plumbing is data-driven, not hardcoded.
  const renderSubcommentary = (
    sub: Commentary,
    verseRef: string
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
                    subPassage.intro.sanskrit.devanagari
                  ),
                }}
              />
            )}
            <p
              className="verse-text font-serif flow-commentary-sub leading-relaxed text-gray-600"
              dangerouslySetInnerHTML={{
                __html: sanitizeCommentaryHtml(
                  subPassage.content?.sanskrit?.devanagari || ""
                ),
              }}
            />
          </div>
        )}
      </div>
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
              aria-label={script === "roman" ? "Select chapter" : "अध्याय चुनें"}
            >
              <span className="font-serif text-base font-semibold text-gray-700">
                {structureLabel} {toDevanagariNumerals(currentSection)}
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
                selectedIds={editionIds.length ? editionIds : [grantha.edition_id ?? ""]}
                onConfirm={onEditionIdsChange}
                script={script}
                triggerLabel={compareSummary}
              />
            </div>
          )}
          {activeCommentary && (
            <div className="text-sm text-gray-500 font-serif mt-1">
              {activeCommentary.commentary_title}
              {commentatorName ? ` — ${commentatorName}` : ""}
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
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
              />
            ) : (
            passages.map((passage, index) => {
              const isMain = passage.passage_type === "main";
              const section = passage.ref.split(".")[0];

              // Chapter divider — label from the grantha's own structure_levels,
              // never hardcoded to "अध्याय" (spec §3.3). Only main passages open
              // a section, so dividers never precede prefatory/concluding items.
              let divider: ReactNode = null;
              if (isMain && structureLabel && sectionStartRefs.has(passage.ref)) {
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
                const label = (passage as PrefatoryMaterial).label?.devanagari;
                const content = passage.content?.sanskrit?.devanagari;
                // The whole-work opening (e.g. the Gita's maṅgalācaraṇa) lives in
                // commentary.intro, keyed to its label-only prefatory anchor — the
                // same prefaceAnchor mechanism CommentaryPanel uses (§2.3). Render
                // it only at that anchor's own position, once.
                const prefaceAnchor =
                  activeCommentary?.intro &&
                  passage.ref === grantha.prefatory_material?.[0]?.ref
                    ? activeCommentary.intro
                    : null;
                return (
                  <Fragment key={passage.ref}>
                    <div
                      data-verse-ref={passage.ref}
                      className="px-4 py-10"
                    >
                      {label && (
                        <div className="text-sm text-gray-600 italic mb-3">
                          {label}
                        </div>
                      )}
                      {prefaceAnchor ? (
                        <p
                          className="verse-text font-serif flow-intro leading-relaxed text-gray-700 whitespace-pre-line"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeCommentaryHtml(
                              prefaceAnchor.sanskrit?.devanagari || ""
                            ),
                          }}
                        />
                      ) : content ? (
                        <p className="verse-text font-serif flow-intro leading-relaxed text-gray-700 whitespace-pre-line">
                          {stripMarkdown(content)}
                        </p>
                      ) : null}
                    </div>
                  </Fragment>
                );
              }

              const cp =
                activeCommentary && isMain
                  ? commentaryPassageForRef(activeCommentary.passages, passage.ref)
                  : undefined;
              const isSelected = passage.ref === selectedRef;
              const mula = stripMarkdown(passage.content?.sanskrit?.devanagari);
              const introText = cp?.intro?.sanskrit?.devanagari;

              return (
                <Fragment key={passage.ref}>
                  {divider}
                  <div
                    ref={(el) => setVerseRef(passage.ref, el)}
                    data-verse-ref={passage.ref}
                    onClick={() => handleVerseClick(passage.ref)}
                    className={`px-4 py-10 cursor-pointer transition-colors ${
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
                        {/* Mūla verse: the verse number sits on the left rule in
                            smaller type; the shloka keeps its source line break
                            (which falls at the single-daṇḍā pāda boundary). The
                            verse sits narrower and centered so the commentary
                            runs wider than it, keeping the reading column
                            centered like the mockup. */}
                        <div className="mb-5 max-w-2xl mx-auto border-l-2 border-gray-400 pl-3 py-2 flex gap-3">
                          <span
                            className="w-6 shrink-0 text-center text-sm font-serif text-gray-400 mt-1"
                            aria-hidden="true"
                          >
                            {toDevanagariNumerals(
                              passage.ref.split(".").pop() ?? passage.ref
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            {passage.speaker && (
                              <div className="font-serif text-sm text-gray-600 mb-2">
                                {stripMarkdown(passage.speaker)}
                              </div>
                            )}
                            {mula && (
                              <p className="verse-text font-serif flow-verse leading-7 text-gray-900 whitespace-pre-line">
                                {mula}
                              </p>
                            )}
                          </div>
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
                        <p
                          className="verse-text font-serif flow-commentary leading-relaxed text-gray-700 whitespace-pre-line"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeCommentaryHtml(
                              cp.content?.sanskrit?.devanagari || ""
                            ),
                          }}
                        />
                        {hasSubcommentaries &&
                          activeCommentary?.subcommentaries?.map((sub) =>
                            renderSubcommentary(sub, passage.ref)
                          )}
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

      </div>
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
        scrollContainerRef={scrollContainerRef}
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
          setFontScale(
            Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next))
          )
        }
        onExitFlow={onExitFlow}
      />
    </main>
  );
}
