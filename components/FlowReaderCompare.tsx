"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Commentary,
  Grantha,
  Passage,
  PrefatoryMaterial,
  commentaryPassageForRef,
} from "@/lib/data";
import {
  sanitizeCommentaryHtml,
  stripMarkdown,
  withVerseNumber,
} from "@/lib/stringUtils";
import FlowReaderCitation from "./FlowReaderCitation";
import { renderCommentaryWithReferences } from "./renderCommentary";

interface FlowReaderCompareProps {
  /** Active editions, ordered (always >= 2 here). */
  editions: Grantha[];
  /** Navigation-ordered passages from the primary edition. */
  passages: (PrefatoryMaterial | Passage)[];
  selectedRef: string;
  onVerseSelect: (ref: string) => void;
  script: "deva" | "roman";
  activeSubcommentaryIds?: string;
  onSubcommentaryToggle: (subcommentaryId: string, isOpen: boolean) => void;
  /** Measured available width of the reading area (drives columns-vs-swipe). */
  availableWidth: number;
  grantha: Grantha;
  granthaTitleDeva: string;
  granthaTitleIast: string;
  updateHash: (granthaId: string, verseRef: string, editionId?: string) => void;
  availableGranthaIds: string[];
  /** Per-grantha target metadata for the edition-aware link gate. */
  granthaById: Record<string, { editions?: { edition_id: string }[]; default_school?: string }>;
  granthaIdToDevanagariTitle: Record<string, string>;
}

const TWO_UP_MIN_COL = 380;
const THREE_UP_MIN_COL = 320;

/**
 * Compare-mode reading surface — 2–3 commentators.
 *
 * Two layouts, chosen by a live width check (availableWidth / count vs a
 * per-count threshold, not a fixed breakpoint):
 *   - sufficient width: side-by-side columns, each verse rendered once (shared
 *     and centered, bracketed by rules), one column per author below it.
 *   - insufficient width: a swipeable, tabbed, one-commentator-at-a-time view.
 *
 * Per §2.2/§5.3 there is deliberately no cross-author merge: each column calls
 * `commentaryPassageForRef` independently per verse per its own edition — some
 * return a passage, some return undefined, and each author's content simply
 * appears at their own data's refs.
 */
export default function FlowReaderCompare({
  editions,
  passages,
  selectedRef,
  onVerseSelect,
  script,
  activeSubcommentaryIds,
  onSubcommentaryToggle,
  availableWidth,
  grantha,
  granthaTitleDeva,
  granthaTitleIast,
  updateHash,
  availableGranthaIds,
  granthaById,
  granthaIdToDevanagariTitle,
}: FlowReaderCompareProps) {
  const count = editions.length;
  const roman = script === "roman";
  const minCol = count === 3 ? THREE_UP_MIN_COL : TWO_UP_MIN_COL;
  const fitsColumns = availableWidth / count >= minCol;
  const threeUp = count === 3;

  const tikaLabel = roman ? "Ṭīkā" : "टीका";

  const activeSubIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of (activeSubcommentaryIds || "").split(",")) {
      if (id.trim()) set.add(id.trim());
    }
    return set;
  }, [activeSubcommentaryIds]);

  const commentatorName = useCallback(
    (edition: Grantha) =>
      edition.commentaries?.[0]?.commentator?.[roman ? "roman" : "devanagari"] ??
      edition.commentaries?.[0]?.commentator?.devanagari ??
      edition.edition_id ??
      "",
    [roman]
  );

  const renderFraming = useCallback(
    (passage: PrefatoryMaterial | Passage): ReactNode => {
      const label = (passage as PrefatoryMaterial).label?.devanagari;
      const content = passage.content?.sanskrit?.devanagari;
      return (
        <div data-verse-ref={passage.ref} className="px-4 py-8">
          {label && (
            <div className="text-sm text-gray-600 italic mb-3">{label}</div>
          )}
          {content ? (
            <p className="verse-text font-serif flow-intro leading-relaxed text-gray-700 whitespace-pre-line">
              {stripMarkdown(content)}
            </p>
          ) : null}
        </div>
      );
    },
    []
  );

  // --- Per-edition verse content (shared by columns and swipe pages) --------

  const renderCommentaryColumn = useCallback(
    (edition: Grantha, verseRef: string, compact: boolean): ReactNode => {
      const commentary: Commentary | undefined = edition.commentaries?.[0];
      const cp =
        commentary && verseRef
          ? commentaryPassageForRef(commentary.passages ?? [], verseRef)
          : undefined;
      if (!cp) {
        return null;
      }
      const textClasses = compact
        ? "flow-commentary leading-[1.6] text-gray-700"
        : "flow-commentary leading-[1.7] text-gray-700";
      const tikaClasses = compact
        ? "flow-commentary-sub leading-[1.6] text-gray-600"
        : "flow-commentary-sub leading-[1.7] text-gray-600";
      const introText = cp.intro?.sanskrit?.devanagari;
      return (
        <div>
          {introText && (
            <p
              className={`verse-text font-serif ${textClasses} text-gray-700 mb-3`}
              dangerouslySetInnerHTML={{
                __html: sanitizeCommentaryHtml(introText),
              }}
            />
          )}
          {cp.prefatory_material?.map((item, idx) => (
            <div key={idx} className="mb-4">
              {item.label && (
                <div className="text-sm text-gray-600 italic mb-3">
                  {item.label}
                </div>
              )}
              <p className={`verse-text font-serif ${textClasses} whitespace-pre-line`}>
                {item.content?.sanskrit?.devanagari || ""}
              </p>
            </div>
          ))}
          <p
            className={`verse-text font-serif ${textClasses} whitespace-pre-line`}
          >
            {renderCommentaryWithReferences(
              cp.content?.sanskrit?.devanagari || "",
              cp.references,
              {
                currentGranthaId: edition.grantha_id,
                sourcePassageRef: verseRef,
                updateHash,
                availableGranthaIds,
                granthaById,
                granthaIdToTitle: granthaIdToDevanagariTitle,
              },
            )}
          </p>
          {(commentary?.subcommentaries?.length ?? 0) > 0 &&
            commentary?.subcommentaries?.map((sub) => {
              const subPassage = commentaryPassageForRef(
                sub.passages ?? [],
                verseRef
              );
              if (!subPassage) return null;
              const isOpen = activeSubIds.has(sub.commentary_id);
              const ruleColor = isOpen ? "bg-blue-300" : "bg-gray-200";
              const labelColor = isOpen ? "text-blue-500" : "text-gray-400";
              return (
                <div key={sub.commentary_id} className="my-4">
                  <button
                    type="button"
                    onClick={() =>
                      onSubcommentaryToggle(sub.commentary_id, !isOpen)
                    }
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 group cursor-pointer"
                  >
                    <span className={`flex-1 h-px ${ruleColor}`} />
                    <span
                      className={`text-xs font-serif tracking-wide ${labelColor}`}
                    >
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
                          className={`verse-text font-serif ${tikaClasses} mb-3`}
                          dangerouslySetInnerHTML={{
                            __html: sanitizeCommentaryHtml(
                              subPassage.intro.sanskrit.devanagari
                            ),
                          }}
                        />
                      )}
                      <p
                        className={`verse-text font-serif ${tikaClasses}`}
                      >
                        {renderCommentaryWithReferences(
                          subPassage.content?.sanskrit?.devanagari || "",
                          subPassage.references,
                          {
                            currentGranthaId: edition.grantha_id,
                            sourcePassageRef: verseRef,
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
            })}
        </div>
      );
    },
    [activeSubIds, onSubcommentaryToggle, tikaLabel, updateHash, availableGranthaIds, granthaById, granthaIdToDevanagariTitle]
  );

  // --- Shared centered verse row (used by the columns view) -----------------

  const renderVerseRow = useCallback(
    (passage: Passage): ReactNode => {
      const mula = stripMarkdown(passage.content?.sanskrit?.devanagari);
      return (
        <div data-verse-ref={passage.ref} className="flex justify-center mb-6">
          <div className="text-center border-l-2 border-r-2 border-gray-400 px-8 py-2">
            <div className="min-w-0">
              {passage.speaker && (
                <div className="font-serif text-sm text-gray-600 mb-2">
                  {stripMarkdown(passage.speaker)}
                </div>
              )}
              {mula && (
                <p className="verse-text font-serif flow-verse leading-7 text-gray-900 whitespace-pre-line">
                  {withVerseNumber(mula, passage.ref)}
                </p>
              )}
            </div>
          </div>
          <div className="shrink-0 pl-2 pt-1">
            <FlowReaderCitation
              grantha={grantha}
              editions={editions}
              editionIds={editions.map((e) => e.edition_id).filter((id): id is string => Boolean(id))}
              verseRef={passage.ref}
              subcommentaryIds={activeSubcommentaryIds}
              script={script}
              granthaTitleDeva={granthaTitleDeva}
              granthaTitleIast={granthaTitleIast}
            />
          </div>
        </div>
      );
    },
    [grantha, editions, activeSubcommentaryIds, script, granthaTitleDeva, granthaTitleIast]
  );

  // --- Columns view ---------------------------------------------------------

  const renderColumns = useCallback((): ReactNode => {
    return (
      <div
        className={`flow-compare ${
          threeUp ? "flow-compare-3up" : "flow-compare-2up"
        }`}
      >
        <div
          className="sticky z-10 bg-white py-3 border-b border-gray-100 grid mb-8"
          style={{
            top: 0,
            gridTemplateColumns: `repeat(${count}, minmax(0,1fr))`,
          }}
        >
          {editions.map((edition, i) => (
            <div
              key={edition.edition_id}
              className="text-center font-serif text-sm text-gray-700 flex items-center justify-center gap-1.5"
            >
              <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 text-[10px] flex items-center justify-center font-sans">
                {i + 1}
              </span>
              <span className="truncate">{commentatorName(edition)}</span>
            </div>
          ))}
        </div>
        {passages.map((passage) => {
          if (passage.passage_type !== "main") {
            return (
              <Fragment key={`${passage.passage_type}-${passage.ref}`}>
                {renderFraming(passage)}
              </Fragment>
            );
          }
          return (
            <div
              key={`${passage.passage_type}-${passage.ref}`}
              className={`mb-10 ${passage.ref === selectedRef ? "bg-gray-50" : ""}`}
            >
              {renderVerseRow(passage)}
              <div
                className="grid gap-6 mb-4"
                style={{ gridTemplateColumns: `repeat(${count}, minmax(0,1fr))` }}
              >
                {editions.map((edition) => (
                  <div key={edition.edition_id}>
                    {renderCommentaryColumn(edition, passage.ref, threeUp) || (
                      <div className="h-1" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [
    count,
    editions,
    passages,
    selectedRef,
    threeUp,
    commentatorName,
    renderFraming,
    renderVerseRow,
    renderCommentaryColumn,
  ]);

  // --- Swipe view -----------------------------------------------------------

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activePage, setActivePage] = useState(0);

  const jumpToPage = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
    setActivePage(i);
  }, []);

  const renderSwipePage = useCallback(
    (edition: Grantha): ReactNode => (
      <div className="w-full shrink-0 px-8 py-8 max-w-2xl mx-auto">
        {passages.map((passage) => {
          if (passage.passage_type !== "main") {
            return (
              <Fragment key={`${passage.passage_type}-${passage.ref}`}>
                {renderFraming(passage)}
              </Fragment>
            );
          }
          const mula = stripMarkdown(passage.content?.sanskrit?.devanagari);
          return (
            <div
              key={passage.ref}
              data-verse-ref={passage.ref}
              className={`px-4 py-8 cursor-pointer ${
                passage.ref === selectedRef ? "bg-gray-50" : ""
              }`}
              onClick={() => onVerseSelect(passage.ref)}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-5 max-w-2xl border-l-2 border-gray-400 pl-6 py-2">
                    {passage.speaker && (
                      <div className="font-serif text-sm text-gray-600 mb-2">
                        {stripMarkdown(passage.speaker)}
                      </div>
                    )}
                    {mula && (
                      <p className="verse-text font-serif flow-verse leading-7 text-gray-900 whitespace-pre-line">
                        {withVerseNumber(mula, passage.ref)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="shrink-0 pl-3 pt-1">
                  <FlowReaderCitation
                    grantha={edition}
                    editions={editions}
                    editionIds={editions.map((e) => e.edition_id).filter((id): id is string => Boolean(id))}
                    verseRef={passage.ref}
                    subcommentaryIds={activeSubcommentaryIds}
                    script={script}
                    granthaTitleDeva={granthaTitleDeva}
                    granthaTitleIast={granthaTitleIast}
                  />
                </div>
              </div>
              {renderCommentaryColumn(edition, passage.ref, false)}
            </div>
          );
        })}
      </div>
    ),
    [
      passages,
      editions,
      selectedRef,
      onVerseSelect,
      script,
      activeSubcommentaryIds,
      granthaTitleDeva,
      granthaTitleIast,
      renderFraming,
      renderCommentaryColumn,
    ]
  );

  // Tab strip active-state sync on swipe.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      setActivePage(Math.max(0, Math.min(editions.length - 1, i)));
    };
    track.addEventListener("scroll", onScroll);
    return () => track.removeEventListener("scroll", onScroll);
  }, [editions.length]);

  const renderSwipe = useCallback((): ReactNode => {
    return (
      <>
        <div
          className="sticky z-10 flex justify-center gap-1.5 py-3 border-b border-gray-50 bg-white"
          style={{ top: 0 }}
        >
          {editions.map((edition, i) => (
            <button
              key={edition.edition_id}
              type="button"
              onClick={() => jumpToPage(i)}
              className={`px-3 py-1 rounded-full text-xs font-serif ${
                i === activePage
                  ? "bg-gray-100 text-gray-900 font-semibold"
                  : "text-blue-600 hover:bg-blue-50"
              }`}
            >
              {i + 1} · {commentatorName(edition)}
            </button>
          ))}
        </div>
        <div
          ref={trackRef}
          className="flex overflow-x-auto"
          style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
        >
          {editions.map((edition) => (
            <div
              key={edition.edition_id}
              className="w-full shrink-0"
              style={{ scrollSnapAlign: "start" }}
            >
              {renderSwipePage(edition)}
            </div>
          ))}
        </div>
      </>
    );
  }, [editions, activePage, commentatorName, jumpToPage, renderSwipePage]);

  return fitsColumns ? renderColumns() : renderSwipe();
}
