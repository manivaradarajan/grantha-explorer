"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { EditionStub } from "@/lib/data";

interface ComparePickerProps {
  editions: EditionStub[];
  /** Currently committed edition ids, in display order. */
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
  script: "deva" | "roman";
  /** Human-readable summary of the current selection (for the trigger). */
  triggerLabel: string;
}

const MAX_SELECTED = 3;

/**
 * Compare-mode author picker — a multi-select edition switcher.
 *
 * Mirrors CommentarySelector's chrome (portal-based listbox, full keyboard nav)
 * but for the multi-select compare case: checkboxes, max 3, click-order badges,
 * and changes gated behind an explicit confirm ("तथास्तु"). Checking/unchecking
 * only updates the popup's badges live; the reading view doesn't change until
 * confirmed. Outside-click / Escape without confirming reverts to the
 * last-committed state. At least one author must always remain checked.
 */
export default function ComparePicker({
  editions,
  selectedIds,
  onConfirm,
  script,
  triggerLabel,
}: ComparePickerProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string[]>(selectedIds);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const roman = script === "roman";

  const openPicker = useCallback(() => {
    setTriggerRect(triggerRef.current?.getBoundingClientRect() ?? null);
    setPending([...selectedIds]);
    setOpen(true);
  }, [selectedIds]);

  const close = useCallback(() => setOpen(false), []);

  // Commit the pending selection (confirm) or revert it (outside/Escape).
  const confirmSelection = useCallback(() => {
    onConfirm([...pending]);
    close();
  }, [pending, onConfirm, close]);

  const revertAndClose = useCallback(() => {
    setPending([...selectedIds]);
    close();
  }, [selectedIds, close]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: Event) => {
      const target = e.target as Node;
      if (listboxRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      revertAndClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        revertAndClose();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("touchstart", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("touchstart", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, revertAndClose]);

  const toggle = (editionId: string) => {
    setPending((prev) => {
      if (prev.includes(editionId)) {
        // Never uncheck the last one.
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== editionId);
      }
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, editionId];
    });
  };

  const moveFocus = (currentIndex: number, direction: 1 | -1) => {
    const nextIndex = Math.min(
      editions.length - 1,
      Math.max(0, currentIndex + direction)
    );
    optionRefs.current[nextIndex]?.focus();
  };

  const handleListboxKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const current = document.activeElement;
      const currentIndex = editions.findIndex(
        (_, i) => optionRefs.current[i] === current
      );
      moveFocus(currentIndex === -1 ? 0 : currentIndex, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      optionRefs.current[e.key === "Home" ? 0 : editions.length - 1]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      confirmSelection();
    }
  };

  // Land focus on the first selected option when the picker opens.
  useEffect(() => {
    if (!open) return;
    const firstSelected = editions.findIndex((e) => pending.includes(e.edition_id));
    optionRefs.current[firstSelected >= 0 ? firstSelected : 0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const orderBadge = (editionId: string): number | null => {
    const pos = pending.indexOf(editionId);
    return pos === -1 ? null : pos + 1;
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-compare-trigger
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? "compare-picker-listbox" : undefined}
        onClick={() => (open ? close() : openPicker())}
        className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 cursor-pointer p-1 rounded hover:bg-gray-100 transition-colors"
      >
        <span className="font-serif text-sm text-gray-500">{triggerLabel}</span>
        <svg
          className="w-3.5 h-3.5 text-gray-400"
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
      </button>

      {open && triggerRect
        ? createPortal(
            <div
              ref={listboxRef}
              id="compare-picker-listbox"
              role="listbox"
              aria-multiselectable="true"
              aria-label="Select commentators to compare"
              onKeyDown={handleListboxKeyDown}
              className="fixed z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
              style={{
                top: Math.min(triggerRect.bottom + 4, window.innerHeight - 320),
                left: Math.min(triggerRect.left, window.innerWidth - 268),
              }}
            >
              <div className="px-3 pb-1 pt-1 text-[11px] text-gray-400">
                {roman ? "max 3" : "अधिकतम त्रयः · max 3"}
              </div>
              {editions.map((edition, index) => {
                const badge = orderBadge(edition.edition_id);
                const isChecked = badge !== null;
                return (
                  <button
                    key={edition.edition_id}
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isChecked}
                    tabIndex={-1}
                    onClick={() => toggle(edition.edition_id)}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2 text-sm font-serif cursor-pointer hover:bg-blue-50 ${
                      isChecked ? "text-gray-800" : "text-gray-700"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
                        isChecked
                          ? "bg-blue-600 border-blue-600"
                          : "border-gray-300"
                      }`}
                      aria-hidden="true"
                    >
                      {isChecked && (
                        <svg
                          className="w-3 h-3 text-white"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 truncate">
                      {[
                        edition.commentary_title,
                        roman
                          ? edition.commentator?.roman ||
                            edition.commentator?.devanagari
                          : edition.commentator?.devanagari,
                      ]
                        .filter(Boolean)
                        .join(" - ") || edition.edition_id}
                    </span>
                    <span
                      className={`w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] items-center justify-center font-sans ${
                        badge ? "inline-flex" : "hidden"
                      }`}
                      aria-label={badge ? `Selection order ${badge}` : undefined}
                    >
                      {badge}
                    </span>
                  </button>
                );
              })}
              <div className="border-t border-gray-100 mt-1 pt-2 px-3 pb-2">
                <button
                  type="button"
                  onClick={confirmSelection}
                  className="w-full py-1.5 rounded-md bg-blue-600 text-white text-sm font-serif hover:bg-blue-700 transition-colors"
                >
                  {roman ? "Tathāstu" : "तथास्तु"}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
